import { BunchNode } from "../bunch";
import { Order } from "../order";
import { Position } from "../position";
import { ItemManager, SparseItems, SparseItemsManager } from "./sparse_items";

/**
 * List data associated to a BunchNode.
 */
type NodeData<I> = {
  /**
   * The total number of present values at this
   * node and its descendants.
   */
  total: number;
  /**
   * The number of present values in this node's parent that appear
   * prior to this node. Part of the index offset between this node
   * and its parent (the other part is from prior siblings).
   */
  parentValuesBefore: number;
  /**
   * The values at the node's positions,
   * in order from left to right.
   *
   * Always trimmed - length is meaningless.
   *
   * OPT: omit before use, with ?? arrMan.empty()? Or could add null
   * as option to SparseItems type (8 bytes vs size of []).
   */
  values: SparseItems<I>;
};

export class ItemList<I, T> {
  private readonly itemsMan: SparseItemsManager<I, T>;

  /**
   * Map from BunchNode to its data (total & values).
   *
   * Always omits entries with total = 0.
   */
  private state = new Map<BunchNode, NodeData<I>>();

  constructor(readonly order: Order, readonly itemMan: ItemManager<I, T>) {
    this.itemsMan = new SparseItemsManager(this.itemMan);
  }

  // ----------
  // Mutators
  // ----------

  /**
   * @returns Replaced values
   */
  set(startPos: Position, item: I): SparseItems<I> {
    // Validate startPos even if length = 0.
    const node = this.order.getNodeFor(startPos);
    const length = this.itemMan.length(item);
    if (length === 0) return this.itemsMan.new();
    if (node === this.order.rootNode && startPos.innerIndex + length - 1 > 1) {
      throw new Error(
        `Last value's Position is invalid (rootNode only allows innerIndex 0 or 1): startPos=${JSON.stringify(
          startPos
        )}, length=${length}`
      );
    }

    const data = this.getOrCreateData(node);
    const [newItems, replaced] = this.itemsMan.set(
      data.values,
      startPos.innerIndex,
      item
    );
    data.values = this.itemsMan.trim(newItems);

    const oldSize = this.itemsMan.size(replaced);
    if (oldSize !== length) this.onUpdate(node, length - oldSize);
    return replaced;
  }

  /**
   * @returns Replaced values
   */
  delete(startPos: Position, count: number): SparseItems<I> {
    // Validate startPos even if count = 0.
    const node = this.order.getNodeFor(startPos);
    if (count === 0) return this.itemsMan.new();
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
      return this.itemsMan.new(count);
    }
    const [newItems, replaced] = this.itemsMan.delete(
      data.values,
      startPos.innerIndex,
      count
    );
    data.values = this.itemsMan.trim(newItems);

    const oldSize = this.itemsMan.size(replaced);
    if (oldSize !== 0) this.onUpdate(node, 0 - oldSize);
    return replaced;
  }

  private getOrCreateData(node: BunchNode): NodeData<I> {
    let data = this.state.get(node);
    if (data === undefined) {
      let parentValuesBefore = 0;
      if (node.parent !== null) {
        const parentData = this.state.get(node.parent);
        if (parentData !== undefined) {
          parentValuesBefore = this.itemsMan.getInfo(
            parentData.values,
            node.nextInnerIndex
          )[2];
        }
      }
      data = { total: 0, parentValuesBefore, values: this.itemsMan.new() };
      this.state.set(node, data);
    }
    return data;
  }

  /**
   * Call when changing the outline of node's values, i.e., which
   * innerIndexes are present.
   *
   * @param delta The change in the number of present values at node.
   */
  private onUpdate(node: BunchNode, delta: number): void {
    // Invalidate caches.
    if (this.cachedIndexNode !== node) this.cachedIndexNode = null;

    // Update total for node and its ancestors.
    if (delta !== 0) {
      for (
        let current: BunchNode | null = node;
        current !== null;
        current = current.parent
      ) {
        const data = this.getOrCreateData(node);
        data.total += delta;
        if (data.total === 0) this.state.delete(current);
      }
    }

    // Update child.parentValuesBefore for node's children.
    const nodeData = this.state.get(node);
    if (nodeData !== undefined) {
      for (let i = 0; i < node.childrenLength; i++) {
        const child = node.getChild(i);
        const childData = this.state.get(child);
        if (childData === undefined) continue;
        // OPT: in principle can make this loop O((# runs) + (# children)) instead
        // of O((# runs) * (# children)), e.g., using itemsMan.split.
        childData.parentValuesBefore = this.itemsMan.getInfo(
          nodeData.values,
          child.nextInnerIndex
        )[2];
      }
    }
  }

  /**
   * Deletes every value in the list.
   *
   * The Order is unaffected (retains all BunchNodes).
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
   * @returns [ first value's new position, createdNode if created by Order ].
   * If item.length > 1, their positions start at pos using the same BunchNode
   * with increasing innerIndex.
   * @throws If prevPos is Order.MAX_POSITION.
   * @throws If item.length = 0 (doesn't know what to return)
   */
  insert(
    prevPos: Position,
    item: I
  ): [startPos: Position, createdNode: BunchNode | null] {
    // OPT: find nextPos without getting index, at least in common cases.
    const nextIndex = this.indexOfPosition(prevPos, "left") + 1;
    const nextPos =
      nextIndex === this.length
        ? Order.MAX_POSITION
        : this.positionAt(nextIndex);
    const ret = this.order.createPositions(
      prevPos,
      nextPos,
      this.itemMan.length(item)
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
  ): [startPos: Position, createdNode: BunchNode | null] {
    const prevPos =
      index === 0 ? Order.MIN_POSITION : this.positionAt(index - 1);
    const nextPos =
      index === this.length ? Order.MAX_POSITION : this.positionAt(index);
    const ret = this.order.createPositions(
      prevPos,
      nextPos,
      this.itemMan.length(item)
    );
    this.set(ret[0], item);
    return ret;
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the value at position, or undefined if it is not currently present.
   */
  get(pos: Position): T | undefined {
    return this.getInNode(this.order.getNodeFor(pos), pos.innerIndex)[0];
  }

  /**
   * Returns the value currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   * Note that this differs from an ordinary Array,
   * which would instead return undefined.
   */
  getAt(index: number): T {
    return this.get(this.positionAt(index))!;
  }

  /**
   * Returns whether position is currently present in the list,
   * i.e., its value is present.
   */
  has(pos: Position): boolean {
    return this.getInNode(this.order.getNodeFor(pos), pos.innerIndex)[1];
  }

  /**
   * Returns info about the value at innerIndex in node:
   * [value - undefined if not present, whether it's present,
   * count of node's present values before it]
   */
  private getInNode(
    node: BunchNode,
    innerIndex: number
  ): [value: T | undefined, isPresent: boolean, nodeValuesBefore: number] {
    const data = this.state.get(node);
    if (data === undefined) return [undefined, false, 0];
    return this.itemsMan.getInfo(data.values, innerIndex);
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
    const [, isPresent, nodeValuesBefore] = this.getInNode(
      node,
      pos.innerIndex
    );
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
      // TODO: test
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
        beforeNode += this.state.get(current.parent)?.parentValuesBefore ?? 0;
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
      let prevNextinnerIndex = 0;
      let prevParentValuesBefore = 0;
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
            innerIndex: this.itemsMan.findPresentIndex(
              currentData.values,
              prevNextinnerIndex,
              remaining
            ),
          };
        } else {
          remaining -= valuesBetween;
          if (remaining < childData.total) {
            // Recurse into child.
            current = child;
            // Breaks the for loop, taking us to the next iteration of while(true).
            break;
          } else remaining -= childData.total;
        }

        prevNextinnerIndex = child.nextInnerIndex;
        prevParentValuesBefore = childData.parentValuesBefore;
      }

      // We should always end by the break statement (recursion), not by
      // the for loop's finishing.
      throw new Error("Internal error: failed to find index among children");
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
   * Returns an iterator of [pos, value] tuples for every
   * value in the list, in list order.
   *
   * Args as in Array.slice.
   */
  *entries(
    start?: number,
    end?: number
  ): IterableIterator<[pos: Position, value: T]> {
    const range = this.normalizeSliceRange(start, end);
    if (range === null) return;
    [start, end] = range;

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
        valuesSlicer: this.itemsMan.newSlicer(rootData.values),
      },
    ];
    while (stack.length !== 0) {
      const top = stack[stack.length - 1];
      const node = top.node;

      // Emit node values between the previous and next child.
      // Use nextinnerIndex b/c it's an exclusive end.
      // OPT: shortcut if we won't start by the end.
      const endinnerIndex =
        top.nextChildIndex === node.childrenLength
          ? null
          : node.getChild(top.nextChildIndex).nextInnerIndex;
      for (const [innerIndex, value] of top.valuesSlicer.nextSlice(
        endinnerIndex
      )) {
        if (index >= start) {
          yield [
            {
              bunchID: node.bunchID,
              innerIndex: innerIndex,
            },
            value,
          ];
        }
        index++;
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
              valuesSlicer: this.itemsMan.newSlicer(childData.values),
            });
          }
        }
      }
    }
  }

  /**
   * Normalizes the range so that start < end and they are both in bounds
   * (possibly end=length), following Array.slice.
   * If the range is empty, returns null.
   */
  private normalizeSliceRange(
    start?: number,
    end?: number
  ): [start: number, end: number] | null {
    const len = this.length;
    if (start === undefined || start < -len) start = 0;
    else if (start < 0) start += len;
    else if (start >= len) return null;

    if (end === undefined || end >= len) end = len;
    else if (end < -len) end = 0;
    else if (end < 0) end += len;

    if (end <= start) return null;
    return [start, end];
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
  save<S>(saveItems: (items: SparseItems<I>) => S): { [bunchID: string]: S } {
    const savedState: { [bunchID: string]: S } = {};
    for (const [node, data] of this.state) {
      if (!this.itemsMan.isEmpty(data.values)) {
        savedState[node.bunchID] = saveItems(data.values);
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
  load<S>(
    savedState: { [bunchID: string]: S },
    loadItems: (savedItems: S) => SparseItems<I>
  ): void {
    this.clear();

    for (const [bunchID, savedArr] of Object.entries(savedState)) {
      const node = this.order.getNode(bunchID);
      if (node === undefined) {
        throw new Error(
          `List/Outline savedState references missing bunchID: "${bunchID}". You must call Order.receive before referencing a bunch.`
        );
      }
      // TODO: wait until end to compute all parentValuesBefores, totals.
      // To avoid ?? complexity.
      // Defensive trim, in case user hand-wrote the save.
      const values = this.itemsMan.trim(loadItems(savedArr));
      const size = this.itemsMan.size(values);
      if (size !== 0) {
        const data = this.getOrCreateData(node);
        data.values = values;
        this.onUpdate(node, this.itemsMan.size(values));
      }
    }
  }
}
