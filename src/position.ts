import { BunchIDs } from "./bunch_ids";

/**
 * A position in a list, as a JSON object.
 *
 * Positions let you treat a list as an ordered map `(position -> value)`,
 * where a value's *position* doesn't change over time - unlike an array index.
 *
 * Type Position is used with the library's List, Text, and Outline data structures.
 * You can also work with Positions independent of a specific list using an Order.
 * See the [readme](https://github.com/mweidner037/list-positions#list-position-and-order)
 * for details.
 *
 * See also:
 * - {@link positionEquals}: Equality function for Positions.
 * - {@link AbsPosition}: An alternative representation of positions that is easier to work with, used with AbsList.
 */
export type Position = {
  /**
   * The ID of the [bunch](https://github.com/mweidner037/list-positions#bunches) containing this Position.
   */
  readonly bunchID: string;
  /**
   * The index of this Position within its [bunch](https://github.com/mweidner037/list-positions#bunches).
   * A nonnegative integer.
   */
  readonly innerIndex: number;
};

/**
 * The minimum Position in any Order.
 *
 * This Position is defined to be less than all other Positions.
 * Its value is
 * ```
 * { bunchID: "ROOT", innerIndex: 0 }
 * ```
 */
export const MIN_POSITION: Position = {
  bunchID: BunchIDs.ROOT,
  innerIndex: 0,
} as const;

/**
 * The maximum Position in any Order.
 *
 * This Position is defined to be greater than all other Positions.
 * Its value is
 * ```
 * { bunchID: "ROOT", innerIndex: 1 }
 * ```
 */
export const MAX_POSITION: Position = {
  bunchID: BunchIDs.ROOT,
  innerIndex: 1,
} as const;

/**
 * Returns whether two Positions are equal, i.e., they have equal contents.
 */
export function positionEquals(a: Position, b: Position): boolean {
  return a.bunchID === b.bunchID && a.innerIndex === b.innerIndex;
}

/**
 * Returns an array of Positions that start at `startPos` and have
 * sequentially increasing `innerIndex`.
 *
 * You can use this method to expand on the startPos returned by
 * `Order.createPositions` (and the bulk versions of `List.insertAt`, etc.).
 */
export function expandPositions(
  startPos: Position,
  sameBunchCount: number
): Position[] {
  const ans: Position[] = [];
  for (let i = 0; i < sameBunchCount; i++) {
    ans.push({
      bunchID: startPos.bunchID,
      innerIndex: startPos.innerIndex + i,
    });
  }
  return ans;
}
