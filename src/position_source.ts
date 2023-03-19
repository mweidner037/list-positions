import { IDs } from "./ids";
import { assert, LastInternal, precond } from "./util";

/**
 * A source of lexicographically-ordered "position strings" for
 * collaborative lists and text.
 *
 * In a collaborative list (or text string), you need a way to refer
 * to "positions" within that list that:
 * 1. Point to a specific list element (or text character).
 * 2. Are global (all users agree on them) and immutable (they do not
 * change over time).
 * 3. Can be sorted.
 * 4. Are unique, even if different users concurrently create positions
 * at the same place.
 *
 * `PositionSource` gives you such positions, in the form
 * of lexicographically-ordered strings. Specifically, `createBetween`
 * returns a new "position string" in between two existing position strings.
 *
 * These strings have the bonus properties:
 * - 5. (Non-Interleaving) If two `PositionSource`s concurrently create a (forward or backward)
 * sequence of positions at the same place,
 * their sequences will not be interleaved.
 * For example, if
 * Alice types "Hello" while Bob types "World" at the same place,
 * and they each use a `PositionSource` to create a position for each
 * character, then
 * the resulting order will be "HelloWorld" or "WorldHello", not
 * "HWeolrllod".
 * - 6. If a `PositionSource` creates positions in a forward (increasing)
 * sequence, their lengths as strings will only grow logarithmically,
 * not linearly.
 *
 * Position strings are printable ASCII. Specifically, they
 * contain alphanumeric characters, `','`, and `'.'`.
 * Also, the special string `PositionSource.LAST` is `'~'`.
 *
 * Further reading:
 * - [Fractional indexing](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/#fractional-indexing),
 * a related scheme that satisfies 1-3 but not 4-6.
 * - [List CRDTs](https://mattweidner.com/2022/10/21/basic-list-crdt.html)
 * and how they map to position strings. `PositionSource` uses an optimized
 * variant of that link's string implementation.
 * - [Paper about interleaving](https://www.repository.cam.ac.uk/handle/1810/290391)
 * in collaborative text editors.
 */
export class PositionSource {
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
   * The unique ID for this `PositionSource`.
   */
  readonly ID: string;
  /**
   * Our waypoints' long name: `,${ID}.`.
   */
  private readonly longName: string;
  /**
   * Variant of longName used for a position's first ID: `${ID}.`.
   * (Otherwise every position would start with a redundant ','.)
   */
  private readonly firstName: string;

  /**
   * For each waypoint that we created, maps a prefix (see getPrefix)
   * for that waypoint to its last (most recent) valueSeq.
   * We always store the right-side version (odd valueSeq).
   */
  private lastValueSeqs = new Map<string, number>();

  /**
   * Constructs a new `PositionSource`.
   *
   * It is okay to share a single `PositionSource` between
   * all documents (lists/text strings) in the same JavaScript runtime.
   *
   * For efficiency (shorter position strings),
   * within each JavaScript runtime, you should not use
   * more than one `PositionSource` for the same document.
   * An exception is if multiple logical users share the same runtime;
   * we then recommend one `PositionSource` per user.
   *
   * @param options.ID A unique ID for this `PositionSource`. Defaults to
   * `IDs.random()`.
   *
   * If provided, `options.ID` must satisfy:
   * - It is unique across the entire collaborative application, i.e.,
   * all `PositionSource`s whose positions may be compared to ours. This
   * includes past `PositionSource`s, even if they correspond to the same
   * user/device.
   * - It does not contain `','` or `'.'`.
   * - The first character is lexicographically less than `'~'` (code point 126).
   *
   * If `options.ID` contains non-alphanumeric characters, then created
   * positions will contain those characters in addition to
   * alphanumeric characters, `','`, and `'.'`.
   */
  constructor(options?: { ID?: string }) {
    if (options?.ID !== undefined) {
      IDs.validate(options.ID);
    }
    this.ID = options?.ID ?? IDs.random();
    this.longName = `,${this.ID}.`;
    this.firstName = `${this.ID}.`;
  }

  /**
   * Returns a new position between `left` and `right`
   * (`left < new < right`).
   *
   * The new position is unique across the entire collaborative application,
   * even in the face of concurrent calls to this method on other
   * `PositionSource`s.
   *
   * @param left Defaults to `PositionSource.FIRST` (insert at the beginning).
   *
   * @param right Defaults to `PositionSource.LAST` (insert at the end).
   */
  createBetween(
    left: string = PositionSource.FIRST,
    right: string = PositionSource.LAST
  ): string {
    precond(left < right, "left must be less than right:", left, "!<", right);
    precond(
      right <= PositionSource.LAST,
      "right must be less than or equal to LAST:",
      right,
      "!<=",
      PositionSource.LAST
    );

    const leftFixed = left === PositionSource.FIRST ? null : left;
    const rightFixed = right === PositionSource.LAST ? null : right;

    let ans: string;

    if (
      rightFixed !== null &&
      (leftFixed === null || rightFixed.startsWith(leftFixed))
    ) {
      // Left child of right. This always appends a waypoint.
      const ancestor = leftVersion(rightFixed);
      ans = this.appendWaypoint(ancestor);
    } else {
      // Right child of left.
      if (leftFixed === null) {
        // ancestor is FIRST.
        ans = this.appendWaypoint("");
      } else {
        // Check if we can reuse left's prefix.
        // It needs to be one of ours, and right can't use the same
        // prefix (otherwise we would get ans > right by comparing right's
        // older valueIndex to our new valueIndex).
        const prefix = getPrefix(leftFixed);
        const lastValueSeq = this.lastValueSeqs.get(prefix);
        if (
          lastValueSeq !== undefined &&
          !(rightFixed !== null && rightFixed.startsWith(prefix))
        ) {
          // Reuse.
          const valueSeq = nextOddValueSeq(lastValueSeq);
          ans = prefix + stringifyBase52(valueSeq);
          this.lastValueSeqs.set(prefix, valueSeq);
        } else {
          // Append waypoint.
          ans = this.appendWaypoint(leftFixed);
        }
      }
    }

    assert(left < ans && ans < right, "Bad position:", left, ans, right);
    return ans;
  }

  /**
   * Appends a wayoint to the given ancestor (= prefix adjusted for
   * side), returning a unique new position using that waypoint.
   *
   * lastValueSeqs is also updated as needed for the waypoint.
   */
  private appendWaypoint(ancestor: string): string {
    let waypointName = ancestor === "" ? this.firstName : this.longName;
    // If our ID already appears in ancestor, instead use a short
    // name for the waypoint.
    // Here we use the uniqueness of ',' and '.' to
    // claim that if this.longName (= `,${ID}.`) appears in ancestor, then it
    // must actually be from a waypoint that we created.
    let existing = ancestor.lastIndexOf(this.longName);
    if (ancestor.startsWith(this.firstName)) existing = 0;
    if (existing !== -1) {
      // Find the index of existing among the long-name
      // waypoints, in backwards order. Here we use the fact that
      // each longName ends with '.' and that '.' does not appear otherwise.
      let index = -1;
      for (let i = existing; i < ancestor.length; i++) {
        if (ancestor[i] === ".") index++;
      }
      waypointName = stringifyShortName(index);
    }

    const prefix = ancestor + waypointName;
    const lastValueSeq = this.lastValueSeqs.get(prefix);
    // Use next odd (right-side) valueSeq (1 if it's a new waypoint).
    const valueSeq =
      lastValueSeq === undefined ? 1 : nextOddValueSeq(lastValueSeq);
    this.lastValueSeqs.set(prefix, valueSeq);
    return prefix + stringifyBase52(valueSeq);
  }
}

/**
 * Returns position's *prefix*: the string through the last waypoint
 * name, or equivalently, without the final valueSeq.
 */
function getPrefix(position: string): string {
  // Last waypoint char is the last '.' (for long names) or
  // digit (for short names). Note that neither appear in valueSeq,
  // which is all letters.
  for (let i = position.length - 2; i >= 0; i--) {
    const char = position[i];
    if (char === "." || ("0" <= char && char <= "9")) {
      // i is the last waypoint char, i.e., the end of the prefix.
      return position.slice(0, i + 1);
    }
  }
  assert(false, "No last waypoint char found (not a position?)", position);
  return "";
}

/**
 * Returns the variant of position ending with a "left" marker
 * instead of the default "right" marker.
 *
 * I.e., the ancestor for position's left descendants.
 */
function leftVersion(position: string) {
  // We need to subtract one from the (odd) valueSeq, equivalently, from
  // its last base52 digit.
  const last = parseBase52(position[position.length - 1]);
  assert(last % 2 === 1, "Bad valueSeq (not a position?)", last, position);
  return position.slice(0, -1) + stringifyBase52(last - 1);
}

/**
 * Base 52, except for last digit, which is base 10 using
 * digits. That makes it easy to find the end of a short name
 * in getPrefix: it ends at the last digit.
 */
function stringifyShortName(n: number): string {
  if (n < 10) return String.fromCharCode(48 + n);
  else
    return (
      stringifyBase52(Math.floor(n / 10)) + String.fromCharCode(48 + (n % 10))
    );
}

/**
 * Base 52 encoding using letters (with "digits" in order by code point).
 */
function stringifyBase52(n: number): string {
  if (n === 0) return "A";
  const codes: number[] = [];
  while (n > 0) {
    const digit = n % 52;
    codes.unshift((digit >= 26 ? 71 : 65) + digit);
    n = Math.floor(n / 52);
  }
  return String.fromCharCode(...codes);
}

function parseBase52(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const digit = code - (code >= 97 ? 71 : 65);
    n = 52 * n + digit;
  }
  return n;
}

const log52 = Math.log(52);

/**
 * Returns the next odd valueSeq in the special sequence.
 * This is equivalent to mapping n to its valueIndex, adding 2,
 * then mapping back.
 *
 * The sequence has the following properties:
 * 1. Each number is a nonnegative integer (however, not all
 * nonnegative integers are enumerated).
 * 2. The numbers' base-52 representations are enumerated in
 * lexicographic order, with no prefixes (i.e., no string
 * representation is a prefix of another).
 * 3. The n-th enumerated number has O(log(n)) base-52 digits.
 *
 * Properties (2) and (3) are analogous to normal counting, except
 * that we order by the (base-52) lexicographic order instead of the
 * usual order by magnitude. It is also the case that
 * the numbers are in order by magnitude, although we do not
 * use this property.
 *
 * The specific sequence is as follows:
 * - Start with 0.
 * - Enumerate 26^1 numbers (A, B, ..., Z).
 * - Add 1, multiply by 52, then enumerate 26^2 numbers
 * (aA, aB, ..., mz).
 * - Add 1, multiply by 52, then enumerate 26^3 numbers
 * (nAA, nAB, ..., tZz).
 * - Repeat this pattern indefinitely, enumerating
 * 26^d d-digit numbers for each d >= 1. Imagining a decimal place
 * in front of each number, each d consumes 2^(-d) of the unit interval,
 * so we never "reach 1" (overflow to d+1 digits when
 * we meant to use d digits).
 *
 * I believe this is related to
 * [Elias gamma coding](https://en.wikipedia.org/wiki/Elias_gamma_coding).
 */
function nextOddValueSeq(n: number): number {
  const d = n === 0 ? 1 : Math.floor(Math.log(n) / log52) + 1;
  // You can calculate that the last d-digit number is 52^d - 26^d - 1.
  if (n === Math.pow(52, d) - Math.pow(26, d) - 1) {
    // First step is a new length: n -> (n + 1) * 52.
    // Second step is n -> n + 1.
    return (n + 1) * 52 + 1;
  } else {
    // n -> n + 1 twice.
    return n + 2;
  }
}
