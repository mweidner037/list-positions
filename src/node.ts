import { Position } from "./position";

/**
 * TODO
 * Serializable form of a Node, used for collaboration.
 *
 * Notes:
 * - `Order.rootNode` does not have a NodeDesc, because it does not have a `parent`.
 */
export type NodeDesc = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly parent: Position;
};

/**
 * A node in an Order's internal tree.
 *
 * You do not need to work with Nodes unless you are doing something advanced.
 * Instead, work with Positions directly, using a List or `Order.compare`.
 *
 * To obtain an Order's unique instance of a Node, call `Order.getNode` or `Order.getNodeFor`.
 *
 * Note: Unlike Position and NodeDesc, Nodes are **not** JSON-serializable.
 */
export interface Node {
  // TODO: class property docs.
  readonly creatorID: string;
  readonly timestamp: number;
  /** null for the root. */
  readonly parentNode: Node | null;
  /** Unspecified for the root. */
  readonly parentValueIndex: number;
  /** null for the root. */
  readonly parent: Position | null;
  /** 0 for the root. */
  readonly depth: number;

  /**
   * Returns this Node's NodeDesc.
   *
   * Errors if this is the rootNode.
   *
   * TODO: should be on Order instead.
   */
  desc(): NodeDesc;

  readonly childrenLength: number;
  getChild(index: number): Node;

  toString(): string;
}

/**
 * [Compare function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#comparefn)
 * for **sibling** Nodes in an Order, i.e., Nodes with the same parentNode.
 *
 * You do not need to call this function unless you are doing something advanced.
 * To compare Positions, instead use `Order.compare` or a List. To iterate over
 * a Node's children in order, use `Node.children()`.
 */
export function siblingNodeCompare(a: Node, b: Node): number {
  if (a.parentNode !== b.parentNode) {
    throw new Error(
      `nodeSiblingCompare can only compare Nodes with the same parentNode, not a=${a}, b=${b}`
    );
  }

  // Sibling sort order: first by parentValueIndex, then by *reverse* timestamp,
  // then by creatorID.
  if (a.parentValueIndex !== b.parentValueIndex) {
    return a.parentValueIndex - b.parentValueIndex;
  }
  if (a.timestamp !== b.timestamp) {
    // Reverse order.
    return b.timestamp - a.timestamp;
  }
  if (a.creatorID !== b.creatorID) {
    return a.creatorID > b.creatorID ? 1 : -1;
  }
  return 0;
}
