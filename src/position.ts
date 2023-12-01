import { ReplicaIDs } from "./util/replica_ids";

/**
 * A Position in a collaborative list or text string.
 *
 * A Position points to a specific list element (or text character),
 * as described in the [readme](https://github.com/mweidner037/position-structs#readme).
 * It is represented as an immutable struct, i.e., a flat JSON object.
 *
 * To consult the total order on Positions, you must first construct an Order
 * and supply it with some metadata. You can then use those Positions in a List
 * on top of that Order, or call `Order.compare` to order them directly.
 *
 * Internally, the pair `{ creatorID, timestamp }` identifies a Node in Order's internal tree,
 * while `valueIndex` identifies a specific value belonging to that Node.
 * The "metadata" you must supply to Order is a NodeDesc for the node
 * `{ creatorID, timestamp }`.
 */
export type Position = {
  /**
   * The Position's Node's creatorID.
   */
  readonly creatorID: string;
  /**
   * The Position's Node's counter,
   * which is a nonnegative integer.
   *
   * For a given creatorID, counters are assigned sequentially, although
   * any given replica may be missing some intermediate counters.
   */
  readonly counter: number;
  /**
   * The index of this Position among its Node's values, which is a
   * nonnegative integer.
   *
   * A given Node's Positions are created with `valueIndex`s in counting order (0, 1, 2, ...).
   * Those Positions are in list order, and they are initially contiguous in
   * the list, but later insertions may get between them.
   */
  readonly valueIndex: number;
};

export const MIN_POSITION: Position = {
  creatorID: ReplicaIDs.ROOT,
  counter: 0,
  valueIndex: 0,
};
export const MAX_POSITION: Position = {
  creatorID: ReplicaIDs.ROOT,
  counter: 0,
  valueIndex: 1,
};

/**
 * Returns whether two Positions are equal, i.e., they have equal contents.
 */
export function positionEquals(a: Position, b: Position): boolean {
  return (
    a.creatorID === b.creatorID &&
    a.counter === b.counter &&
    a.valueIndex === b.valueIndex
  );
}

/**
 * Encoded form of Position that is lexicographically ordered wrt other LexPositions.
 *
 * Internally, describes all dependencies (path in the tree). Can use without worrying
 * about them; "delivering" to an Order applies all of those deps. Can also use
 * indie of an Order, e.g. DB "ORDER BY" column; see LexUtils.
 */
export type LexPosition = string;

export const MIN_LEX_POSITION: LexPosition = "TODO";
export const MAX_LEX_POSITION: LexPosition = "TODO";
