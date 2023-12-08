/**
 * Metadata for a bunch. You must supply a bunch's BunchMeta to
 * Order.receive before you can reference that bunch
 * in Positions.
 *
 * Notes:
 * - `Order.rootNode` does not have a BunchMeta, because it does not have a `parent`.
 *
 * @see Order.equalsNodeMeta
 */
export type BunchMeta = {
  readonly bunchID: string;
  readonly parentID: string;
  /**
   * 0: left child of (parent, 0).
   * 1: right child of (parent, 0).
   * 2: left child of (parent, 1).
   * Etc.
   *
   * I.e., we're between innerIndexes ((offset + 1) >> 1 - 1) and ((offset + 1) >> 1), and
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
 * To obtain an Order's unique instance of a BunchNode, call `Order.getNode` or `Order.getNodeFor`.
 *
 * Note: Unlike Position and NodeMeta, Nodes are **not** JSON-serializable.
 */
export interface BunchNode {
  // TODO: class property docs.
  readonly id: string;
  /** null for the root. */
  readonly parent: BunchNode | null;
  /** Unspecified for the root. */
  readonly offset: number;
  /** 0 for the root. */
  readonly depth: number;

  /**
   * The innerIndex of the next Position after this node in our parent. Possibly 0.
   */
  readonly nextInnerIndex: number;
  /**
   * Returns this node's NodeMeta.
   *
   * Errors if this is the rootNode.
   */
  meta(): BunchMeta;

  /**
   * Returns an array of all non-root BunchNodes that this depends on
   * (including itself if non-root), in order from the root downwards.
   *
   * Passing `this.dependencies().map(node => node.meta())` to `Order.receive` is
   * sufficient to use this BunchNode's Positions.
   */
  dependencies(): BunchNode[];

  /**
   * Prefix of Positions & descendants. Can use LexUtils.combinePos to
   * get LexPositions.
   */
  lexPrefix(): string;

  readonly childrenLength: number;
  getChild(index: number): BunchNode;

  toString(): string;
}
