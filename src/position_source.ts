import { IDs } from "./ids";
import { assert, LastInternal, precond } from "./util";

/**
 * ALGORITHM
 *
 * The underlying dense total order is similar to Double RGA,
 * and this implementation is similar to [[LexSimple]].
 * The difference is a common-case optimization: left-to-right insertions
 * by the same PositionSource reuse the same (id, counter)
 * pair (we call this a _waypoint_), just using
 * an extra _valueIndex_ to distinguish positions
 * within the sequence, instead of creating a long
 * rightward path in the tree. In this way,
 * a sequence of m left-to-right insertions see their
 * positions grow by O(log(m)) length (the size of
 * valueIndex) instead of O(m) length (the size of
 * a path containing one node per insertion).
 *
 * In more detail, the underlying tree consists of alternating
 * layers:
 * - Nodes in even layers (starting with the root's children)
 * are __waypoints__, each labeled by a pair (id, counter). A waypoint can be either a left or right
 * child of its parent, except that the root only has right
 * children. Waypoint same-siblings siblings are sorted the
 * same as nodes in [[LexSimpleTotalOrder]].
 * - Nodes in odd layers are __value indices__, each labelled
 * by a nonnegative integer. A value index is always a right
 * child of its parent. Value indices are sorted
 * *lexicographically*; we use a subset of numbers for which
 * this coincides with the usual order by magnitude.
 *
 * Each position corresponds to a value index node in the tree
 * whose parent waypoint's id equals the position's
 * creator. A position is a string description of the path
 * from the root to its node (excluding the root).
 * Each pair of nodes (waypoint = (id, counter), valueIndex)
 * is represented by the substring (here written like a template literal):
 * ```
 * ${id},${counter},${valueIndex}${L or R}
 * ```
 * where the final value is L if the next node is a left
 * child, else R (including if this pair is the final node pair
 * to ensure that a terminal node is sorted in between its
 * left and right children).
 */

/**
 * Utility class for working with list CRDT "positions".
 *
 * In list CRDTs (and other ordered data structures), we need a way to
 * order things that allows inserting new things into the list, and that
 * works in the expected way if multiple collaborators insert concurrently.
 * To make that possible, this class provides "positions" in the form of
 * strings, such that:
 * - The order on positions is given by the lexicographic order on strings.
 * - Given any two positions `left < right`, you can create a new position
 * in between them (`left < new < right`), by calling [[createBetween]].
 * This new position is guaranteed to be unique even in the face of concurrency.
 *
 * Some nice properties of these positions:
 * - If two users creates positions in the
 * same place, then each create more positions in a LtR sequence, the two
 * sequences will sort one after the other instead of interleaving.
 * - The positions try to be reasonably short. In particular, if one user
 * creates positions in a LtR sequence, then they will grow in length
 * logarithmically, not linearly. (However, they may grow in length linearly
 * in other scenarios, and they typically grow monotonically over time.
 * This probably makes them unusable in large documents.)
 *
 * This class also provides methods for interacting with [[Cursor]]s.
 * [[cursor]] and [[index]] let you go back-and-forth between an abstract
 * Cursor (represented as a string) and its index in a given list.
 */
export class PositionSource {
  readonly ID: string;
  /**
   * Maps counter to the most recently used
   * valueIndex for the waypoint (this.id, counter).
   */
  private lastValueIndices: number[] = [];

  /**
   * A string that is less than all positions.
   *
   * Value: `""`.
   */
  static readonly FIRST: string = "";
  /**
   * A string that is greater than all positions.
   *
   * Value: `"~"`.
   */
  static readonly LAST: string = LastInternal;

  /**
   * Constructs a new PositionSource.
   *
   * It is okay to share a single PositionSource between
   * all documents (lists/text strings) in the same JavaScript runtime.
   *
   * For efficiency, you should not use multiple PositionSources with
   * the same document. An exception is if you have multiple logical
   * users within the same runtime; we then recommend one PositionSource
   * per user.
   *
   * @param options.id An ID for this PositionSource that is unique
   * among all connected PositionSources (i.e., PositionSources whose positions
   * may be compared to ours). Defaults to [[IDs.random]]`()`.
   *
   * If provided, `options.id` must satisfy:
   * - All characters are lexicographically greater than `','` (code point 44).
   * - The first character is lexicographically less than `'~'` (code point 126).
   */
  constructor(options?: { ID?: string }) {
    if (options?.ID !== undefined) {
      IDs.validate(options.ID);
    }
    this.ID = options?.ID ?? IDs.random();
  }

  /**
   * Returns a new position between leftArg and rightArg
   * (`leftArg < new < rightArg`).
   *
   * The new position is unique across the entire collaborative application,
   * even in the face on concurrent calls to this method on other
   * PositionSources.
   */
  createBetween(
    leftArg: string = PositionSource.FIRST,
    rightArg: string = PositionSource.LAST
  ): string {
    precond(
      leftArg < rightArg,
      "leftArg must be less than rightArg:",
      leftArg,
      rightArg
    );
    precond(
      rightArg <= PositionSource.LAST,
      "rightArg must be less than LAST",
      rightArg,
      PositionSource.LAST
    );

    const left = leftArg === PositionSource.FIRST ? null : leftArg;
    const right = rightArg === PositionSource.LAST ? null : rightArg;

    let ans: string;

    if (right !== null && (left === null || right.startsWith(left))) {
      // Left child of right.
      ans = right.slice(0, -1) + "L" + this.newWaypoint();
    } else {
      // Right child of left.
      if (left === null) {
        ans = this.newWaypoint();
      } else {
        // Check if we can reuse right's leaf waypoint.
        // For this to happen, right's leaf waypoint must have also
        // been sent by us, and its next valueIndex must not
        // have been used already (i.e., the node matches
        // this.lastValueIndices).
        let success = false;
        const lastComma = left.lastIndexOf(",");
        const secondLastComma = left.lastIndexOf(",", lastComma - 1);
        const leafSender = left.slice(
          secondLastComma - this.ID.length,
          secondLastComma
        );
        if (leafSender === this.ID) {
          const leafCounter = Number.parseInt(
            left.slice(secondLastComma + 1, lastComma)
          );
          const leafValueIndex = Number.parseInt(left.slice(lastComma + 1, -1));
          if (this.lastValueIndices[leafCounter] === leafValueIndex) {
            // Success; reuse a's leaf waypoint.
            const valueIndex = lexSucc(leafValueIndex);
            this.lastValueIndices[leafCounter] = valueIndex;
            ans = left.slice(0, lastComma + 1) + valueIndex.toString() + "R";
            success = true;
          }
        }
        if (!success) {
          // Failure; cannot reuse left's leaf waypoint.
          ans = left + this.newWaypoint();
        }
      }
    }

    assert(
      leftArg < ans! && ans! < rightArg,
      "Bad position:",
      leftArg,
      ans!,
      rightArg
    );
    return ans!;
  }

  /**
   * Returns a node corresponding to a new waypoint, also
   * updating this.lastValueIndices accordingly.
   */
  private newWaypoint(): string {
    const counter = this.lastValueIndices.length;
    this.lastValueIndices.push(0);
    return `${this.ID},${counter},0R`;
  }
}

/**
 * Returns the successor of n in an enumeration of a special
 * set of numbers.
 *
 * That enumeration has the following properties:
 * 1. Each number is a nonnegative integer (however, not all
 * nonnegative integers are enumerated).
 * 2. The number's decimal representations are enumerated in
 * lexicographic order, with no prefixes (i.e., no decimal
 * representation is a prefix of another).
 * 3. The n-th enumerated number has O(log(n)) decimal digits.
 *
 * Properties (2) and (3) are analogous to normal counting,
 * with the usual order by magnitude; the novelty here is that
 * we instead use the lexicographic order on decimal representations.
 * It is also the case that
 * the numbers are in order by magnitude, although we do not
 * use this property.
 *
 * The specific enumeration is:
 * - Start with 0.
 * - Enumerate 9^0 numbers (i.e., just 0).
 * - Add 1, multiply by 10, then enumerate 9^1 numbers (i.e.,
 * 10, 11, ..., 18).
 * - Add 1, multiply by 10, then enumerate 9^2 numbers (i.e.,
 * 190, 191, ..., 270).
 * - Repeat this pattern indefinitely, enumerating
 * 9^(d-1) d-digit numbers for each d >= 1.
 *
 */
function lexSucc(n: number): number {
  // OPT: more chars than just numbers (must be < 'R')/
  // OPT: fill out first digit, to benefit common case (low reuse).
  const d = n === 0 ? 1 : Math.floor(Math.log10(n)) + 1;
  if (n === Math.pow(10, d) - Math.pow(9, d) - 1) {
    // n -> (n + 1) * 10
    return (n + 1) * 10;
  } else {
    // n -> n + 1
    return n + 1;
  }
}
