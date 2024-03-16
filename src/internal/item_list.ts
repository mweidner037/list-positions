import type { SparseItems } from "sparse-array-rled";
import { BunchMeta, BunchNode } from "../bunch";
import { Order } from "../order";
import { Position } from "../position";

export interface SparseItemsFactory<I, S extends SparseItems<I>> {
  "new"(): S;
  deserialize(serialized: (I | number)[]): S;
  length(item: I): number;
  /**
   * Guaranteed 0 <= start < end <= item.length.
   */
  slice(item: I, start: number, end: number): I;
}

/**
 * List data associated to a BunchNode.
 */
type NodeData<S> = {
  /**
   * The total number of present values at this
   * node and its descendants.
   */
  total: number;
  /**
   * The number of present values in this node's parent that appear
   * prior to this node. Part of the index offset between this node
   * and its parent (the other part is from prior siblings).
   *
   * For nodes without NodeData, call ItemList.parentValuesBefore instead
   * of defaulting to 0.
   */
  parentValuesBefore: number;
  /**
   * The values at the node's positions, in order from left to right.
   *
   * OPT: omit when empty (replace with null).
   */
  values: S;
};

export class ItemList<I, S extends SparseItems<I>> {
  /**
   * Map from BunchNode to its data (total & values).
   *
   * Always omits entries with total = 0.
   */
  private state = new Map<BunchNode, NodeData<S>>();

  constructor(
    readonly order: Order,
    private readonly itemsFactory: SparseItemsFactory<I, S>
  ) {}

  // ----------
  // Mutators
  // ----------

  /**
   * @returns Replaced values
   */
  set(startPos: Position, item: I): S {
    // Validate startPos even if count = 0.
    const node = this.order.getNodeFor(startPos);
    const count = this.itemsFactory.length(item);
    if (count === 0) return this.itemsFactory.new();
    if (node === this.order.rootNode && startPos.innerIndex + count - 1 > 1) {
      throw new Error(
        `Last value's Position is invalid (rootNode only allows innerIndex 0 or 1): startPos=${JSON.stringify(
          startPos
        )}, length=${count}`
      );
    }

    const data = this.getOrCreateData(node);
    const replaced = data.values._set(startPos.innerIndex, item);
    this.updateMeta(node, startPos.innerIndex, count, true, replaced);
    return replaced;
  }

  /**
   * @returns Replaced values
   */
  delete(startPos: Position, count: number): S {
    // Validate startPos even if count = 0.
    const node = this.order.getNodeFor(startPos);
    if (count === 0) return this.itemsFactory.new();
    if (node === this.order.rootNode && startPos.innerIndex + count - 1 > 1) {
      throw new Error(
        `Last value's Position is invalid (rootNode only allows innerIndex 0 or 1): startPos=${JSON.stringify(
          startPos
        )}, length=${count}`
      );
    }

    const data = this.state.get(node);
    if (data === undefined) {
      // Already deleted.
      return this.itemsFactory.new();
    }
    const replaced = data.values.delete(startPos.innerIndex, count);
    this.updateMeta(node, startPos.innerIndex, count, false, replaced);
    return replaced;
  }

  /**
   * Updates all of our metadata fields (total and parentValuesBefore)
   * in response to a set or delete operation on node.
   */
  private updateMeta(
    node: BunchNode,
    startIndex: number,
    count: number,
    isSet: boolean,
    replaced: S
  ): void {
    const delta = (isSet ? count : 0) - replaced.count();
    if (delta !== 0) {
      this.updateTotals(node, delta);

      // Update child.parentValuesBefore for node's *known* children.
      for (let i = 0; i < node.childrenLength; i++) {
        const child = node.getChild(i);
        const childData = this.state.get(child);
        if (childData === undefined) continue;

        const relIndex = child.nextInnerIndex - startIndex;
        if (relIndex > 0) {
          if (relIndex >= count) {
            childData.parentValuesBefore += delta;
          } else {
            childData.parentValuesBefore +=
              (isSet ? relIndex : 0) - replaced.countAt(relIndex);
          }
        }
      }
    }
  }

  /**
   * Updates all NodeData.total fields in response to any change to the given node,
   * _without_ updating any parentValuesBefore fields (update updateMeta).
   *
   * Assumes delta != 0.
   *
   * @param delta The change in the number of present values at node.
   */
  private updateTotals(node: BunchNode, delta: number): void {
    // Invalidate caches.
    if (this.cachedIndexNode !== node) this.cachedIndexNode = null;

    // Update total for node and its ancestors.
    for (
      let current: BunchNode | null = node;
      current !== null;
      current = current.parent
    ) {
      const data = this.getOrCreateData(current);
      data.total += delta;
      if (data.total === 0) this.state.delete(current);
    }
  }

  private getOrCreateData(node: BunchNode): NodeData<S> {
    let data = this.state.get(node);
    if (data === undefined) {
      let parentValuesBefore = 0;
      if (node.parent !== null) {
        const parentData = this.state.get(node.parent);
        if (parentData !== undefined) {
          parentValuesBefore = parentData.values.countAt(node.nextInnerIndex);
        }
      }
      data = { total: 0, parentValuesBefore, values: this.itemsFactory.new() };
      this.state.set(node, data);
    }
    return data;
  }

  /**
   * Deletes every value in the list.
   *
   * `this.order` is unaffected (retains all BunchNodes).
   */
  clear() {
    this.state.clear();

    // Invalidate caches.
    this.cachedIndexNode = null;
  }

  /**
   *
   * @param prevPos
   * @param values
   * @returns [ first value's new position, createdBunch if created by Order ].
   * If item.length > 1, their positions start at pos using the same bunchID
   * with increasing innerIndex.
   * @throws If prevPos is Order.MAX_POSITION.
   * @throws If item.length = 0 (doesn't know what to return)
   */
  insert(
    prevPos: Position,
    item: I
  ): [startPos: Position, createdBunch: BunchMeta | null] {
    // OPT: find nextPos without getting index, at least in common cases.
    const nextIndex = this.indexOfPosition(prevPos, "left") + 1;
    const nextPos =
      nextIndex === this.length
        ? Order.MAX_POSITION
        : this.positionAt(nextIndex);
    const ret = this.order.createPositions(
      prevPos,
      nextPos,
      this.itemsFactory.length(item)
    );
    this.set(ret[0], item);
    return ret;
  }

  /**
   *
   * @param index
   * @param values
   * @returns
   * @throws If index is this.length and our last value is at Order.MAX_POSITION.
   * @throws If item.length = 0 (doesn't know what to return)
   */
  insertAt(
    index: number,
    item: I
  ): [startPos: Position, createdBunch: BunchMeta | null] {
    const prevPos =
      index === 0 ? Order.MIN_POSITION : this.positionAt(index - 1);
    const nextPos =
      index === this.length ? Order.MAX_POSITION : this.positionAt(index);
    const ret = this.order.createPositions(
      prevPos,
      nextPos,
      this.itemsFactory.length(item)
    );
    this.set(ret[0], item);
    return ret;
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the [item, offset] at position, or null if it is not currently present.
   */
  getItem(pos: Position): [item: I, offset: number] | null {
    const data = this.state.get(this.order.getNodeFor(pos));
    if (data === undefined) return null;
    return data.values._get(pos.innerIndex);
  }

  /**
   * Returns the [item, offset] currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   * Note that this differs from an ordinary Array,
   * which would instead return undefined.
   */
  getItemAt(index: number): [item: I, offset: number] {
    return this.getItem(this.positionAt(index))!;
  }

  /**
   * Returns whether position is currently present in the list,
   * i.e., its value is present.
   */
  has(pos: Position): boolean {
    return this.getItem(pos) !== null;
  }

  private cachedIndexNode: BunchNode | null = null;
  private cachedIndex = -1;

  /**
   * Returns the current index of position.
   *
   * If position is not currently present in the list,
   * then the result depends on searchDir:
   * - "none" (default): Returns -1.
   * - "left": Returns the next index to the left of position.
   * If there are no values to the left of position,
   * returns -1.
   * - "right": Returns the next index to the right of position.
   * If there are no values to the right of position,
   * returns [[length]].
   *
   * To find the index where a position would be if
   * present, use `searchDir = "right"`.
   */
  indexOfPosition(
    pos: Position,
    searchDir: "none" | "left" | "right" = "none"
  ): number {
    const node = this.order.getNodeFor(pos);
    const [nodeValuesBefore, isPresent] = this.state
      .get(node)
      ?.values?._countHas(pos.innerIndex) ?? [0, false];

    // Will be the total number of values prior to position.
    let valuesBefore = nodeValuesBefore;

    // Add totals for child nodes that come before innerIndex.
    for (let i = 0; i < node.childrenLength; i++) {
      const child = node.getChild(i);
      if (!(child.nextInnerIndex <= pos.innerIndex)) break;
      valuesBefore += this.total(child);
    }

    // Get the number of values prior to node itself.
    let beforeNode: number;
    if (this.cachedIndexNode === node) {
      // Shortcut: We already computed beforeNode and it has not changed.
      // Use its cached value to prevent re-walking up the tree when
      // our caller loops over the same node's Positions.
      beforeNode = this.cachedIndex;
    } else {
      // Walk up the tree and add totals for ancestors' values & siblings
      // that come before our ancestor.
      beforeNode = 0;
      for (
        let current = node;
        current.parent !== null;
        current = current.parent
      ) {
        // Parent's values that come before current.
        beforeNode += this.parentValuesBefore(current);
        // Sibling nodes that come before current.
        for (let i = 0; i < current.parent.childrenLength; i++) {
          const child = current.parent.getChild(i);
          if (child === current) break;
          beforeNode += this.total(child);
        }
      }
      // Cache beforeNode for future calls to indexOfPosition at node.
      // That lets us avoid re-walking up the tree when this method is called
      // in a loop over node's Positions.
      this.cachedIndexNode = node;
      this.cachedIndex = beforeNode;
    }
    valuesBefore += beforeNode;

    if (isPresent) return valuesBefore;
    else {
      switch (searchDir) {
        case "none":
          return -1;
        case "left":
          return valuesBefore - 1;
        case "right":
          return valuesBefore;
      }
    }
  }

  /**
   * The number of present values in this node's parent that appear
   * prior to this node. Part of the index offset between this node
   * and its parent (the other part is from prior siblings).
   *
   * Note that this value may be nonzero even if we don't have data for node.
   * So it is *not* safe to default to 0
   * instead of calling this method.
   */
  private parentValuesBefore(node: BunchNode): number {
    const data = this.state.get(node);
    if (data !== undefined) return data.parentValuesBefore;
    if (node.parent !== null) {
      // We haven't cached parentValuesBefore for node, but it still might
      // be nonzero, if the parent has values.
      const parentData = this.state.get(node.parent);
      if (parentData !== undefined) {
        return parentData.values.countAt(node.nextInnerIndex);
      }
    }
    return 0;
  }

  /**
   * Returns the position currently at index.
   */
  positionAt(index: number): Position {
    if (index < 0 || index >= this.length) {
      throw new Error(`Index out of bounds: ${index} (length: ${this.length})`);
    }

    let remaining = index;
    let current = this.order.rootNode;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // currentData is defined because current has nonzero total (contains index).
      const currentData = this.state.get(current)!;
      // prev = previous child-with-data. We remember its values.
      let prevNextInnerIndex = 0;
      let prevParentValuesBefore = 0;
      currentSearch: {
        for (let i = 0; i < current.childrenLength; i++) {
          const child = current.getChild(i);
          const childData = this.state.get(child);
          if (childData === undefined) continue; // No values in child

          const valuesBetween =
            childData.parentValuesBefore - prevParentValuesBefore;
          if (remaining < valuesBetween) {
            // The position is among current's values, between child and the
            // previous child-with-data.
            return {
              bunchID: current.bunchID,
              innerIndex: currentData.values.indexOfCount(
                remaining,
                prevNextInnerIndex
              ),
            };
          } else {
            remaining -= valuesBetween;
            if (remaining < childData.total) {
              // Recurse into child.
              current = child;
              break currentSearch;
            } else remaining -= childData.total;
          }

          prevNextInnerIndex = child.nextInnerIndex;
          prevParentValuesBefore = childData.parentValuesBefore;
        }

        // The position is among current's values, after all children.
        return {
          bunchID: current.bunchID,
          innerIndex: currentData.values.indexOfCount(
            remaining,
            prevNextInnerIndex
          ),
        };
      }
    }
  }

  /**
   * The length of the list.
   */
  get length() {
    return this.total(this.order.rootNode);
  }

  /**
   * Returns the total number of present values at this
   * node and its descendants.
   */
  private total(node: BunchNode): number {
    return this.state.get(node)?.total ?? 0;
  }

  // ----------
  // Iterators
  // ----------

  /**
   * Returns an iterator of [startPos, item] pairs for every
   * contiguous item in the list, in list order.
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  *items(
    start = 0,
    end = this.length
  ): IterableIterator<[startPos: Position, item: I]> {
    if (start < 0 || end > this.length || start > end) {
      throw new Error(
        `Invalid range: [${start}, ${end}) (length = ${this.length})`
      );
    }
    // Note: start = end = this.length is okay.
    // (used by normalizeSliceRange).
    if (start === end) return;

    let index = 0;
    // Defined because the range is nontrivial, hence root's total != 0.
    const rootData = this.state.get(this.order.rootNode)!;
    // Use a manual stack instead of recursion, to prevent stack overflows
    // in deep trees.
    const stack = [
      {
        node: this.order.rootNode,
        data: rootData,
        nextChildIndex: 0,
        valuesSlicer: rootData.values.newSlicer(),
      },
    ];
    while (stack.length !== 0) {
      const top = stack[stack.length - 1];
      const node = top.node;

      // Emit node values between the previous and next child.
      // Use nextinnerIndex b/c it's an exclusive end.
      // OPT: shortcut if we won't start by the end.
      const endInnerIndex =
        top.nextChildIndex === node.childrenLength
          ? null
          : node.getChild(top.nextChildIndex).nextInnerIndex;
      for (const [innerIndex, item] of top.valuesSlicer.nextSlice(
        endInnerIndex
      )) {
        // Here it is guaranteed that index < end.
        const itemLength = this.itemsFactory.length(item);
        const itemEndIndex = index + itemLength;
        if (start <= index) {
          yield [
            {
              bunchID: node.bunchID,
              innerIndex: innerIndex,
            },
            itemEndIndex <= end
              ? item
              : this.itemsFactory.slice(item, 0, end - index),
          ];
        } else if (start < itemEndIndex) {
          yield [
            {
              bunchID: node.bunchID,
              innerIndex: innerIndex + (start - index),
            },
            this.itemsFactory.slice(
              item,
              start - index,
              Math.min(itemLength, end - index)
            ),
          ];
        }

        index = itemEndIndex;
        if (index >= end) return;
      }

      if (top.nextChildIndex === node.childrenLength) {
        // Out of children. Go up.
        stack.pop();
      } else {
        const child = node.getChild(top.nextChildIndex);
        top.nextChildIndex++;

        const childData = this.state.get(child);
        if (childData !== undefined) {
          if (index + childData.total <= start) {
            // Shortcut: We won't start within this child, so skip its recursion.
            index += childData.total;
          } else {
            // Visit the child.
            stack.push({
              node: child,
              data: childData,
              nextChildIndex: 0,
              valuesSlicer: childData.values.newSlicer(),
            });
          }
        }
      }
    }
  }

  /**
   * Returns an iterator for all dependencies for this list.
   *
   * These are all BunchNodes that have nontrivial values plus their ancestors,
   * excluding the root.
   */
  *dependentNodes(): IterableIterator<BunchNode> {
    // OPT: Use state.keys() directly, if we can exclude the root somehow.
    for (const node of this.state.keys()) {
      if (node !== this.order.rootNode) yield node;
    }
  }

  // ----------
  // Save & Load
  // ----------

  /**
   * Returns saved state describing the current state of this LocalList,
   * including its values.
   *
   * The saved state may later be passed to [[load]]
   * on a new instance of LocalList, to reconstruct the
   * same list state.
   *
   * Only saves values, not Order. bunchID order not guaranteed;
   * can sort if you care.
   */
  save(): { [bunchID: string]: (I | number)[] } {
    const savedState: { [bunchID: string]: (I | number)[] } = {};
    for (const [node, data] of this.state) {
      if (!data.values.isEmpty()) {
        savedState[node.bunchID] = data.values.serialize();
      }
    }
    return savedState;
  }

  /**
   * Loads saved state. The saved state must be from
   * a call to [[save]] on a LocalList whose `source`
   * constructor argument was a replica of this's
   * `source`, so that we can understand the
   * saved state's Positions.
   *
   * Overwrites whole state - not state-based merge.
   *
   * @param savedState Saved state from a List's
   * [[save]] call.
   */
  load(savedState: { [bunchID: string]: (I | number)[] }): void {
    this.clear();

    // OPT: Wait to update all metadata in bottom-up order, so that we can
    // compute all of a node's child parentValuesBefore and its own total in
    // a single pass.

    for (const [bunchID, savedArr] of Object.entries(savedState)) {
      const node = this.order.getNode(bunchID);
      if (node === undefined) {
        throw new Error(
          `List/Text/Outline savedState references missing bunchID: "${bunchID}". You must call Order.receive before referencing a bunch.`
        );
      }

      const values = this.itemsFactory.deserialize(savedArr);
      const size = values.count();
      if (size !== 0) {
        const data = this.getOrCreateData(node);
        data.values = values;
        this.updateTotals(node, size);

        // Update child.parentValuesBefore for node's *known* children.
        // (We can't use updateMeta because it only works for contiguous
        // set/delete operations.)
        for (let i = 0; i < node.childrenLength; i++) {
          const child = node.getChild(i);
          const childData = this.state.get(child);
          if (childData === undefined) continue;
          // OPT: in principle can make this loop O((# runs) + (# children)) instead
          // of O((# runs) * (# children)), e.g., using a loop with newSlicer.
          childData.parentValuesBefore = data.values.countAt(
            child.nextInnerIndex
          );
        }
      }
    }
  }
}
