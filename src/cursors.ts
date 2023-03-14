import { PositionSource } from "./position_source";
import { assert, precond } from "./util";

/**
 * A Cursor points to a particular spot in a list that uses
 * [[PositionSource]] positions, in between two list
 * elements - e.g., a cursor in a text editor. When elements are inserted or
 * deleted in front of the cursor, it moves around in the expected way.
 *
 * Cursor is an alias for `string`, and Cursors are always RTDB-key-compatible.
 *
 * Internally, a Cursor is the position of the list element to its left at
 * the time it was created (via [[PositionSource.cursor]]).
 * The Cursor changes index (via [[PositionSource.index]]) so as to remain directly
 * to the right of that element. If that element is deleted, the Cursor instead
 * remains directly to the right of the element with the greatest lesser
 * position.
 */
export class Cursors {
  private constructor() {
    // Not instantiable.
  }

  /**
   * DIY:
   * - If `index` is 0, [[PositionSource.FIRST]] (`""`)
   * - Else `positions[index - 1]`.
   *
   * @param index
   * @param positions
   * @returns
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
   * DIY: The number of positions `< cursor`.
   * E.g. `SELECT COUNT(*) FROM table WHERE position < [cursor]`
   *
   * This implementation uses a binary search.
   *
   * @param cursor
   * @param positions Must be ordered lexicographically, preferably without
   * duplicates
   * @returns
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
