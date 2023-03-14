import { assert } from "./util";

// TODO: check, test
/**
 * Returns `{ index, isPresent }`, where:
 * - `index` is the current index of `position` in `positions`,
 * or where it would be if added.
 * - `isPresent` is true if `position` is present in `positions`.
 *
 * If this method is inconvenient (e.g., the positions are in a database
 * instead of an array), you can instead compute
 * `index` by finding the number of positions less than or equal to `position`. For example, in SQL, use:
 * ```sql
 * SELECT COUNT(*) FROM table WHERE position <= $position
 * ```
 *
 * See also: `Cursors.toIndex`.
 *
 * @param positions The target list's positions, in lexicographic order.
 * There should be no duplicate positions.
 */
export function findPosition(
  position: string,
  positions: ArrayLike<string>
): { index: number; isPresent: boolean } {
  // Use binary search to find index.
  // Note that it the greatest index s.t.
  // positions[index] <= pos < positions[index + 1].
  if (position < positions[0] || positions.length === 0) {
    return { index: 0, isPresent: false };
  }

  // [start, end] is the range of possible index's.
  let start = 0;
  let end = positions.length - 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (start === end) {
      assert(
        positions[start] <= position &&
          (start + 1 == positions.length || position < positions[start + 1]),
        "Bad binary search (positions out of order?):",
        position,
        start + 1
      );
      // Place cursor to the right of that char.
      return { index: start, isPresent: positions[start] === position };
    }
    const test = Math.ceil(start + (end - start) / 2);
    if (positions[test] <= position) {
      // cIndex is at least as far right as test.
      // This makes progress because test > start always, due to ceil.
      start = test;
    } else {
      // pos < positions[test], so cIndex is to the left of test.
      end = test - 1;
    }
  }
}
