/**
 * Metadata for a [bunch](https://github.com/mweidner037/list-positions#bunches)
 * of Positions, as a JSON object.
 *
 * In scenarios with multiple related Lists (e.g., collaborative text editing),
 * you often need to use a Position with a List different from the List that
 * created it. Before doing so, you must call `list.order.receiveMetas` with the
 * BunchMeta corresponding to that Position's bunch and its ancestors.
 * See [Managing Metadata](https://github.com/mweidner037/list-positions#managing-metadata).
 *
 * @see {@link bunchMetaEquals} Equality function for BunchMetas.
 */
export type BunchMeta = {
  /**
   * The bunch's ID.
   */
  readonly bunchID: string;
  /**
   * The parent bunch's ID.
   *
   * A bunch depends on its parent's metadata. So before (or at the same time
   * as) you call `list.order.receiveMetas` on this BunchMeta,
   * you must do so for the parent's BunchMeta, unless `parentID == "ROOT"`.
   *
   * Parent relations form a tree that is used to order
   * this bunch's Positions. See [Internals](https://github.com/mweidner037/list-positions/tree/master/internals.md) for details.
   */
  readonly parentID: string;
  /**
   * A non-negative integer offset.
   *
   * Offsets are used by the tree to order the
   * bunch's Positions.
   * They are not necessarily assigned in counting order for a given parentID.
   * See [Internals](https://github.com/mweidner037/list-positions/tree/master/internals.md) for details.
   */
  readonly offset: number;
};

/**
 * An Order's internal tree node corresponding to a [bunch](https://github.com/mweidner037/list-positions#bunches) of Positions.
 *
 * You can access a bunch's BunchNode to retrieve its dependent metadata, using the `meta()` and `dependencies()` methods.
 * For advanced usage, BunchNode also gives low-level access to an Order's
 * [internal tree](https://github.com/mweidner037/list-positions/blob/master/internals.md).
 *
 * Obtain BunchNodes using `Order.getNode` or `Order.getNodeFor`.
 *
 * Note: BunchNodes are **not** JSON-serializable, unlike Position and BunchMeta.
 *
 * @see {@link Order.rootNode} An Order's root BunchNode, which has `bunchID == "ROOT"`.
 */
export interface BunchNode {
  /**
   * The bunch's ID.
   */
  readonly bunchID: string;
  /**
   * The parent bunch's BunchNode.
   *
   * null for the root node.
   */
  readonly parent: BunchNode | null;
  /**
   * The bunch's offset within its parent.
   *
   * @see {@link BunchNode.nextInnerIndex}
   */
  readonly offset: number;
  /**
   * The bunch's depth in the tree.
   *
   * 0 for the root node, 1 for its children, etc.
   */
  readonly depth: number;

  /**
   * The innerIndex of the next parent Position after this bunch.
   *
   * All of this bunch's Positions, and its descendants' Positions,
   * appear between the parent's Positions
   * ```ts
   * {
   *    bunchID: this.parent.bunchID,
   *    innerIndex: this.nextInnerIndex - 1
   * }
   * ```
   * and
   * ```ts
   * {
   *    bunchID: this.parent.bunchID,
   *    innerIndex: this.nextInnerIndex
   * }
   * ```
   * (If `nextInnerIndex == 0`, they are less than all of the parent's Positions.)
   */
  readonly nextInnerIndex: number;

  /**
   * Returns the bunch's BunchMeta.
   *
   * @throws If this is the root node, which has no BunchMeta.
   */
  meta(): BunchMeta;

  /**
   * Iterates over the bunch's dependencies.
   *
   * These are the bunch's BunchMeta, its parent's BunchMeta,
   * etc., up the tree until reaching the root (exclusive).
   * They are iterated in upwards order.
   */
  dependencies(): IterableIterator<BunchMeta>;

  /**
   * Returns this bunch's *bunch prefix* - a string that embeds all of its
   * dependencies (including its ancestors' BunchMetas), and that appears as a
   * prefix of all of its LexPositions.
   *
   * You can use LexUtils to convert between a LexPosition and its
   * (bunch prefix, innerIndex) pair.
   */
  lexPrefix(): string;

  /**
   * The number of child nodes in the Order's current tree.
   *
   * This may increase as more BunchMetas are delivered to `Order.receiveMetas`.
   */
  readonly childrenLength: number;
  /**
   * Returns the `index`-th child node in the Order's current tree.
   *
   * The children are in sort order, i.e., all of child 0's Positions are less
   * than all of child 1's Positions.
   * Note that some of this bunch's own Positions may be between between adjacent children,
   * and new children may be inserted as more BunchMetas are delivered to `Order.receiveMetas`.
   */
  getChild(index: number): BunchNode;

  toString(): string;
}

/**
 * [Compare function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#comparefn)
 * for **sibling** BunchNodes in an Order, i.e., BunchNodes with the same `parent`.
 *
 * You do not need to call this function unless you are doing something advanced.
 * To compare Positions, instead use `Order.compare` or a List. To iterate over
 * a BunchNode's children in order, instead use its childrenLength and getChild properties.
 *
 * The sort order is:
 * - First, sort siblings by `offset`.
 * - To break ties, sort siblings lexicographically by the strings `sibling.bunchID + ","`.
 * (The extra comma is a technicality needed to match the sort order on LexPositions.
 * It has no effect if your bunchIDs only use characters greater than "," (code unit 44),
 * which is true by default.)
 */
export function compareSiblingNodes(a: BunchNode, b: BunchNode): number {
  if (a.parent !== b.parent) {
    throw new Error(
      `Inputs to compareSiblingNodes must have the same parent, not a=${a}, b=${b}`
    );
  }

  // Sibling sort order: first by offset, then by id.
  if (a.offset !== b.offset) {
    return a.offset - b.offset;
  }
  if (a.bunchID !== b.bunchID) {
    // Need to add the comma to match how LexPositions are sorted.
    return a.bunchID + "," > b.bunchID + "," ? 1 : -1;
  }
  return 0;
}
