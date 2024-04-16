import { AbsBunchMeta } from "./abs_position";

/**
 * Metadata for a [bunch](https://github.com/mweidner037/list-positions#bunches)
 * of Positions, as a JSON object.
 *
 * In scenarios with multiple related Lists (e.g., collaborative text editing),
 * you often need to use a Position with a List different from the List that
 * created it. Before doing so, you must call `list.order.addMetas` with the
 * BunchMeta corresponding to that Position's bunch and its ancestors.
 * See [Managing Metadata](https://github.com/mweidner037/list-positions#managing-metadata).
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
   * as) you call `list.order.addMetas` on this BunchMeta,
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
   * Returns the bunch's AbsBunchMeta: a struct that encodes all of its dependencies in a
   * compressed form.
   *
   * AbsBunchMeta is used internally by AbsPosition/AbsList. You can also use it independently,
   * as an efficient substitute for `[...this.dependencies()]`.
   *
   * @see {@link AbsPositions.decodeMetas} To convert the AbsBunchMeta back into the array
   * `[...this.dependencies()]`, e.g., for passing to `Order.addMetas`.
   */
  absMeta(): AbsBunchMeta;

  /**
   * The number of child nodes in the Order's current tree.
   *
   * This may increase as more BunchMetas are delivered to `Order.addMetas`.
   */
  readonly childrenLength: number;
  /**
   * Returns the `index`-th child node in the Order's current tree.
   *
   * The children are in sort order, i.e., all of child 0's Positions are less
   * than all of child 1's Positions.
   * Note that some of this bunch's own Positions may be between between adjacent children,
   * and new children may be inserted as more BunchMetas are delivered to `Order.addMetas`.
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
 * - To break ties, sort lexicographically by `bunchID`.
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
    return a.bunchID > b.bunchID ? 1 : -1;
  }
  return 0;
}
