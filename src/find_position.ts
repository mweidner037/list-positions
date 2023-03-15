import { assert } from "./util";

/**
 * Returns `{ index, isPresent }`, where:
 * - `index` is the current index of `position` in `positions`,
 * or where it would be if added.
 * - `isPresent` is true if `position` is present in `positions`.
 *
 * If this method is inconvenient (e.g., the positions are in a database
 * instead of an array), you can instead compute
 * `index` by finding the number of positions less than `position`.
 * For example, in SQL, use:
 * ```sql
 * SELECT COUNT(*) FROM table WHERE position < $position
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
  // Binary search: index is the "rank" of position, computed using
  // https://en.wikipedia.org/wiki/Binary_search_algorithm#Procedure_for_finding_the_leftmost_element
  let L = 0;
  let R = positions.length;
  while (L < R) {
    const m = Math.floor((L + R) / 2);
    if (positions[m] < position) L = m + 1;
    else R = m;
  }

  assert(
    (L === 0 || positions[L - 1] < position) &&
      (L === positions.length || positions[L] >= position),
    "Bad binary search (positions out of order?):",
    position,
    L
  );
  return { index: L, isPresent: positions[L] === position };
}
