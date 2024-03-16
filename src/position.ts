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
 * - LexPosition: An alternative representation of positions that is used with
 * LexList and can be sorted independent of this library.
 * - Order.equalsPosition: Equality function for Positions.
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
 * A position in a list, as a lexicographically-sorted string.
 *
 * LexPositions let you treat a list as an ordered map `(position -> value)`,
 * where a value's *position* doesn't change over time - unlike an array index.
 *
 * The list order on LexPositions matches their lexicographic order as strings.
 * That makes it easy to work with LexPositions outside of this library, but it has a cost in metadata overhead.
 * See the [readme](https://github.com/mweidner037/list-positions#lexlist-and-lexposition)
 * for details.
 *
 * See also:
 * - Position: An alternative representation of positions that is used with
 * List, Text, Outline, and Order and has less metadata overhead.
 * - LexUtils: Utilities for manipulating LexPositions.
 */
export type LexPosition = string;
