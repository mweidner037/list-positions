import { PositionSource } from "./position_source";
import { assert, precond } from "./util";

/**
 * Utilities for working with cursors in a collaborative list
 * or text string.
 *
 * A *cursor* points to a particular spot in a list, in between
 * two list elements (or text characters). This class handles
 * cursors for lists that use [[PositionSource]] position strings.
 *
 * A cursor is represented as a string.
 * Specifically, it is the position of the element
 * to its left, or [[PositionSource.FIRST]] if it is at the beginning
 * of the list. If that position is later deleted, the cursor stays the
 * same, but its index shifts to next element on its left.
 *
 * You can use cursor strings as ordinary cursors, selection endpoints,
 * range endpoints for a comment or formatting span, etc.
 */
export class Cursors {
  private constructor() {
    // Not instantiable.
  }

  /**
   * Returns the cursor at `index` within the given list of positions.
   *
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * If this method is inconvenient (e.g., the positions are in a database
   * instead of an array), you can instead run the following algorithm yourself:
   * - If `index` is 0, return [[PositionSource.FIRST]] (`""`).
   * - Else return `positions[index - 1]`.
   *
   * Invert with [[toIndex]].
   *
   * @param positions The target list's positions, in lexicographic order.
   * There should be no duplicate positions.
   */
  static fromIndex(index: number, positions: ArrayLike<string>): string {
    precond(
      index >= 0 && index <= positions.length,
      "Index out of bounds:",
      index,
      positions.length
    );
    return index === 0 ? PositionSource.FIRST : positions[index - 1];
  }

  /**
   * Returns the current index of `cursor` within the given list of
   * positions.
   *
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * If this method is inconvenient (e.g., the positions are in a database
   * instead of an array), you can instead run the following algorithm yourself:
   * - Return the number of positions less than `cursor`.
   *
   * For example, in SQL, use:
   * ```sql
   * SELECT COUNT(*) FROM table WHERE position < $cursor
   * ```
   *
   * Inverse of [[fromIndex]].
   *
   * @param cursor
   * @param positions The target list's positions, in lexicographic order.
   * There should be no duplicate positions.
   */
  static toIndex(cursor: string, positions: ArrayLike<string>): number {
    // Use binary search to find cIndex, the index of the char with the greatest
    // <= pos, i.e., positions[index] <= pos < positions[index + 1].
    if (cursor < positions[0] || positions.length === 0) return 0;

    // [start, end] is the range of possible cIndex's.
    let start = 0;
    let end = positions.length - 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (start === end) {
        assert(
          positions[start] <= cursor &&
            (start + 1 == positions.length || cursor < positions[start + 1]),
          "Bad binary search (positions out of order?):",
          cursor,
          start + 1
        );
        // Place cursor to the right of that char.
        return start + 1;
      }
      const test = Math.ceil(start + (end - start) / 2);
      if (positions[test] <= cursor) {
        // cIndex is at least as far right as test.
        // This makes progress because test > start always, due to ceil.
        start = test;
      } else {
        // pos < positions[test], so cIndex is to the left of test.
        end = test - 1;
      }
    }
  }
}
