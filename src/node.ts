export type NodeID = {
  readonly creatorID: string;
  readonly counter: number;
};

/**
 * TODO
 * Serializable form of a Node, used for collaboration.
 *
 * Notes:
 * - `Order.rootNode` does not have a NodeDesc, because it does not have a `parent`.
 */
export type NodeDesc = NodeID & {
  // TODO: re-flatten so it's a struct?
  // If so, also flatten OrderSavedState.
  readonly parentID: NodeID;
  /**
   * 0: left child of (parent, 0).
   * 1: right child of (parent, 0).
   * 2: left child of (parent, 1).
   * Etc.
   *
   * I.e., we're between valueIndexes ((offset + 1) >> 1 - 1) and ((offset + 1) >> 1), and
   * siblings are in order by offset.
   */
  readonly offset: number;
};

/**
 * Returns whether two NodeDescs are equal, i.e., they have equal contents.
 */
export function nodeDescEquals(a: NodeDesc, b: NodeDesc): boolean {
  return (
    a.creatorID === b.creatorID &&
    a.counter === b.counter &&
    a.parentID.creatorID === b.parentID.creatorID &&
    a.parentID.counter === b.parentID.counter &&
    a.offset === b.offset
  );
}

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
  readonly counter: number;
  /** null for the root. */
  readonly parent: Node | null;
  /** Unspecified for the root. */
  readonly offset: number;
  /** 0 for the root. */
  readonly depth: number;

  /**
   * The valueIndex of the next Position after Node in our parent. Possibly 0.
   */
  readonly nextValueIndex: number;

  // TODO: getter instead of function?
  id(): NodeID;
  /**
   * Returns this Node's NodeDesc.
   *
   * Errors if this is the rootNode.
   *
   * TODO: should be on Order instead?
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
export function compareSiblingNodes(a: Node, b: Node): number {
  if (a.parent !== b.parent) {
    throw new Error(
      `nodeSiblingCompare can only compare Nodes with the same parentNode, not a=${a}, b=${b}`
    );
  }

  // Sibling sort order: first by offset, then by creatorID, then by counter.
  // TODO: can we rule out same offset+creatorID via createPosition local memory?
  if (a.offset !== b.offset) {
    return a.offset - b.offset;
  }
  if (a.counter !== b.counter) {
    return a.counter - b.counter;
  }
  if (a.creatorID !== b.creatorID) {
    return a.creatorID > b.creatorID ? 1 : -1;
  }
  return 0;
}
