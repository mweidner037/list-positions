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
 *
 * @see Order.equalsNodeDesc
 */
export type NodeDesc = {
  readonly creatorID: string;
  readonly counter: number;
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
