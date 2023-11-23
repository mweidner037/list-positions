import { Node, NodeDesc } from "../node";
import { Order } from "../order";
import { Position } from "../position";
import { ItemManager, SparseArray, SparseArrayManager } from "./sparse_array";

/**
 * List data associated to a Node.
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
   * TODO: omit before use, with ?? arrMan.empty()? Or could add null as value to SparseArray
   * (8 bytes vs new array).
   */
  values: SparseArray<I>;
};

export class ItemList<I, T> {
  private readonly arrayMan: SparseArrayManager<I, T>;

  /**
   * Map from Node to its data (total & values).
   *
   * Always omits entries with total = 0.
   */
  private state = new Map<Node, NodeData<I>>();

  constructor(readonly order: Order, readonly itemMan: ItemManager<I, T>) {
    this.arrayMan = new SparseArrayManager(this.itemMan);
  }

  // ----------
  // Mutators
  // ----------

  /**
   * @returns Replaced values
   */
  set(startPos: Position, item: I): SparseArray<I> {
    // Validate startPos even if length = 0.
    const node = this.order.getNodeFor(startPos);
    const length = this.itemMan.length(item);
    if (length === 0) return this.arrayMan.new();
    if (node === this.order.rootNode && startPos.valueIndex + length - 1 > 1) {
      throw new Error(
        `Last value's Position is invalid (rootNode only allows valueIndex 0 or 1): startPos=${JSON.stringify(
          startPos
        )}, length=${length}`
      );
    }

    const data = this.getOrCreateData(node);
    const [newArr, existing] = this.arrayMan.set(
      data.values,
      startPos.valueIndex,
      item
    );
    data.values = this.arrayMan.trim(newArr);
    this.onUpdate(node, length - this.arrayMan.size(existing));
    return existing;
  }

  /**
   * @returns Replaced values
   */
  delete(startPos: Position, count: number): SparseArray<I> {
    // Validate startPos even if count = 0.
    const node = this.order.getNodeFor(startPos);
    if (count === 0) return this.arrayMan.new();
    if (node === this.order.rootNode && startPos.valueIndex + count - 1 > 1) {
      throw new Error(
        `Last value's Position is invalid (rootNode only allows valueIndex 0 or 1): startPos=${JSON.stringify(
          startPos
        )}, length=${count}`
      );
    }

    const data = this.state.get(node);
    if (data === undefined) {
      // Already deleted.
      return this.arrayMan.new(count);
    }
    const [newArr, existing] = this.arrayMan.delete(
      data.values,
      startPos.valueIndex,
      count
    );
    data.values = this.arrayMan.trim(newArr);
    this.onUpdate(node, 0 - this.arrayMan.size(existing));
    return existing;
  }

  private getOrCreateData(node: Node): NodeData<I> {
    let data = this.state.get(node);
    if (data === undefined) {
      let parentValuesBefore = 0;
      if (node.parent !== null) {
        const parentData = this.state.get(node.parent);
        if (parentData !== undefined) {
          parentValuesBefore = this.arrayMan.getInfo(
            parentData.values,
            node.nextValueIndex
          )[2];
        }
      }
      data = { total: 0, parentValuesBefore, values: this.arrayMan.new() };
      this.state.set(node, data);
    }
    return data;
  }

  /**
   * Call this after updating node's values.
   *
   * @param delta The change in the number of present values at node.
   */
  private onUpdate(node: Node, delta: number): void {
    // Invalidate caches.
    if (this.cachedIndexNode !== node) this.cachedIndexNode = null;

    // Update total for node and its ancestors.
    if (delta !== 0) {
      for (
        let current: Node | null = node;
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
        // of O((# runs) * (# children)).
        childData.parentValuesBefore = this.arrayMan.getInfo(
          nodeData.values,
          child.nextValueIndex
        )[2];
      }
    }
  }

  /**
   * Deletes every value in the list.
   *
   * The Order is unaffected (retains all Nodes).
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
   * @returns { first value's new position, createdNodeDesc if created by Order }.
   * If values.length > 1, their positions start at pos using the same Node
   * with increasing valueIndex.
   * If values.length = 0, a new position is created but the List state is not
   * changed - can use this instead of calling Order.createPosition directly.
   * @throws If prevPos is order.maxPosition.
   */
  insert(
    prevPos: Position,
    item: I
  ): { startPos: Position; createdNodeDesc: NodeDesc | null } {
    // TODO: way to do it without getting index?
    const nextIndex = this.indexOfPosition(prevPos, "left") + 1;
    const nextPos = this.positionAt(nextIndex);
    const ret = this.order.createPositions(
      prevPos,
      nextPos,
      this.itemMan.length(item)
    );
    this.set(ret.startPos, item);
    return ret;
  }

  /**
   *
   * @param index
   * @param values
   * @returns
   * @throws If index is this.length and our last value is at order.maxPosition.
   */
  insertAt(
    index: number,
    item: I
  ): { startPos: Position; createdNodeDesc: NodeDesc | null } {
    const prevPos =
      index === 0 ? this.order.minPosition : this.positionAt(index - 1);
    const nextPos =
      index === this.length ? this.order.maxPosition : this.positionAt(index);
    const ret = this.order.createPositions(
      prevPos,
      nextPos,
      this.itemMan.length(item)
    );
    this.set(ret.startPos, item);
    return ret;
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the value at position, or undefined if it is not currently present
   * ([[hasPosition]] returns false).
   */
  get(pos: Position): T | undefined {
    return this.getInNode(this.order.getNodeFor(pos), pos.valueIndex)[0];
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
    return this.getInNode(this.order.getNodeFor(pos), pos.valueIndex)[1];
  }

  /**
   * Returns info about the value at valueIndex in node:
   * [value - undefined if not present, whether it's present,
   * count of node's present values before it]
   */
  private getInNode(
    node: Node,
    valueIndex: number
  ): [value: T | undefined, isPresent: boolean, nodeValuesBefore: number] {
    const data = this.state.get(node);
    if (data === undefined) return [undefined, false, 0];
    return this.arrayMan.getInfo(data.values, valueIndex);
  }

  private cachedIndexNode: Node | null = null;
  private cachedIndex = -1;

  /**
   * Returns the current index of position.
   *
   * If position is not currently present in the list
   * ([[hasPosition]] returns false), then the result depends on searchDir:
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
      pos.valueIndex
    );
    // Will be the total number of values prior to position.
    let valuesBefore = nodeValuesBefore;

    // Add totals for child nodes that come before valueIndex.
    for (let i = 0; i < node.childrenLength; i++) {
      const child = node.getChild(i);
      if (!(child.nextValueIndex <= pos.valueIndex)) break;
      valuesBefore += this.total(child);
    }

    // Get the number of values prior to node itself.
    let beforeNode: number;
    if (this.cachedIndexNode === node) {
      // Shortcut: We already computed beforeNode and it has not changed.
      // Use its cached value to prevent re-walking up the tree when
      // our caller loops over the same Node's Positions.
      // TODO: test
      beforeNode = this.cachedIndex;
    } else {
      // Walk up the tree and add totals for ancestors' values & nodes
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
      // Cache beforeNode for future calls to indexOfPosition at Node.
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
   *
   * Won't return minPosition or maxPosition. TODO: actually, will if they're
   * part of the list - check that code is compatible.
   */
  positionAt(index: number): Position {
    if (index < 0 || index >= this.length) {
      throw new Error(`Index out of bounds: ${index} (length: ${this.length})`);
    }
    let remaining = index;
    let current = this.order.rootNode;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const currentData = this.state.get(current)!;
      let nextValueIndex = 0;
      let prevParentValuesBefore = 0;
      for (let i = 0; i < current.childrenLength; i++) {
        const child = current.getChild(i);
        const childData = this.state.get(child);
        if (childData === undefined) continue;

        const valuesBetween =
          childData.parentValuesBefore - prevParentValuesBefore;
        if (remaining < valuesBetween) {
          // The position is among node's values, between child and the
          // previous child-with-data.
          return {
            creatorID: current.creatorID,
            counter: current.counter,
            valueIndex: this.arrayMan.findPresentIndex(
              currentData.values,
              nextValueIndex,
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

        nextValueIndex = child.nextValueIndex;
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
  private total(node: Node): number {
    return this.state.get(node)?.total ?? 0;
  }

  // ----------
  // Iterators
  // ----------

  /**
   * Returns an iterator of [pos, value, index] tuples for every
   * value in the list, in list order.
   *
   * Args as in Array.slice.
   */
  *entries(
    start?: number,
    end?: number
  ): IterableIterator<[pos: Position, value: T, index: number]> {
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
        valuesSlicer: this.arrayMan.newSlicer(rootData.values),
      },
    ];
    while (stack.length !== 0) {
      const top = stack[stack.length - 1];
      const node = top.node;

      // Emit node values between the previous and next child.
      // Use rightValueIndex b/c it's an exclusive end.
      // OPT: shortcut if we won't start by the end.
      const endValueIndex =
        top.nextChildIndex === node.childrenLength
          ? null
          : node.getChild(top.nextChildIndex).nextValueIndex;
      for (const [valueIndex, value] of top.valuesSlicer.nextSlice(
        endValueIndex
      )) {
        if (index >= start) {
          yield [
            {
              creatorID: node.creatorID,
              counter: node.counter,
              valueIndex,
            },
            value,
            index,
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
              valuesSlicer: this.arrayMan.newSlicer(childData.values),
            });
          }
        }
      }
    }
  }

  /**
   * Normalizes the range so that start < end and they are both in bounds
   * (possibly end=length). If the range is empty, returns null.
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

  saveOneNode(node: Node): SparseArray<I> | undefined {
    return this.state.get(node)?.values;
  }

  /**
   * Overwrites all of node's existing values - so non-present keys become
   * deleted, even if they come after the last present key.
   *
   * Note that values might not be contiguous in the list.
   */
  loadOneNode(node: Node, values: SparseArray<I>): void {
    const data = this.getOrCreateData(node);
    const existingCount = this.arrayMan.size(data.values);
    data.values = values;
    this.onUpdate(node, this.arrayMan.size(values) - existingCount);
  }

  /**
   * Returns saved state describing the current state of this LocalList,
   * including its values.
   *
   * The saved state may later be passed to [[load]]
   * on a new instance of LocalList, to reconstruct the
   * same list state.
   *
   * Only saves values, not Order. "Natural" format; order
   * guarantees.
   */
  save<S>(saveArray: (arr: SparseArray<I>) => S): {
    [creatorID: string]: { [counter: number]: S };
  } {
    const savedStatePre: {
      [creatorID: string]: { [counter: number]: S };
    } = {};
    for (const [node, data] of this.state) {
      if (this.arrayMan.isEmpty(data.values)) continue;

      let byCreator = savedStatePre[node.creatorID];
      if (byCreator === undefined) {
        byCreator = {};
        savedStatePre[node.creatorID] = byCreator;
      }

      byCreator[node.counter] = saveArray(data.values);
    }

    // Make a (shallow) copy of savedStatePre that touches all
    // creatorIDs in lexicographic order, to ensure consistent JSON
    // serialization order for identical states. (JSON field order is: non-negative
    // integers in numeric order, then string keys in creation order.)
    const sortedCreatorIDs = Object.keys(savedStatePre);
    sortedCreatorIDs.sort();
    const savedState: {
      [creatorID: string]: { [counter: number]: S };
    } = {};
    for (const creatorID of sortedCreatorIDs) {
      savedState[creatorID] = savedStatePre[creatorID];
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
    savedState: {
      [creatorID: string]: { [counter: number]: S };
    },
    loadArray: (savedArr: S) => SparseArray<I>
  ): void {
    this.clear();

    for (const [creatorID, byCreator] of Object.entries(savedState)) {
      for (const [timestampStr, savedArr] of Object.entries(byCreator)) {
        const timestamp = Number.parseInt(timestampStr);
        if (isNaN(timestamp)) {
          throw new Error(
            `Non-integer timestamp in ListSavedState: ${timestampStr}`
          );
        }
        const node = this.order.getNode(creatorID, timestamp);
        if (node === undefined) {
          throw new Error(
            `List.load savedState references missing Node: ${JSON.stringify({
              creatorID,
              timestamp,
            })}. You must call Order.addNodeDescs before referencing a Node.`
          );
        }
        // TODO: wait until end to compute all parentValuesBefores, totals.
        // To avoid ?? complexity.
        this.loadOneNode(node, loadArray(savedArr));
      }
    }
  }
}
