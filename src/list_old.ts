import { IDs } from "./ids";
import { Node, Order, Position } from "./order";

/**
 * A Node's data in a List.
 */
interface NodeData<T> {
  /**
   * The total number of present values at this
   * Node and its descendants.
   */
  total: number;
  /**
   * Map from valueIndex to value. Possibly omitted when empty.
   *
   * We use an object instead of a Map so that we can iterate over
   * keys (valueIndex's) in numeric order.
   */
  values?: { [valueIndex: number]: T };
}

export type ListSavedState<T> = {
  [creatorID: string]: {
    [timestamp: number]: {
      [valueIndex: number]: T;
    };
  };
};

export class List<T> {
  private readonly rootData: NodeData<T>;

  /**
   * Maps from (creatorID, timestamp) to that Node's NodeValues.
   */
  private readonly state = new Map<string, Map<number, NodeData<T>>>();

  constructor(readonly order: Order) {
    this.rootData = { total: 0 };
    this.state.set(
      this.order.rootPosition.creatorID,
      new Map([[this.order.rootPosition.timestamp, this.rootData]])
    );
  }

  // TODO: name insert instead? Or "insertPosition", "newPosition".
  createPosition(index: number): { pos: Position; meta: Node | null } {
    if (index < 0 || index > this.length) {
      throw new Error(
        `index out of bounds for createPosition: ${index}, length=${this.length}`
      );
    }

    const prevPos =
      index === 0 ? this.order.rootPosition : this.position(index - 1);
    return this.order.createPositionAfter(prevPos);
  }

  /**
   *
   * @param prevPos TODO: e.g. the Cursor
   * @returns
   */
  createPositionAfter(prevPos: Position): {
    pos: Position;
    meta: Node | null;
  } {
    return this.order.createPositionAfter(prevPos);
  }

  set(index: number, value: T): Position {
    const pos = this.position(index);
    this.setAt(pos, value);
    return pos;
  }

  setAt(pos: Position, value: T): void {
    // Check that pos's Node is known.
    const nodeInfo = this.order.getNode(pos);

    const data = this.getOrCreateData(pos);
    if (data.values === undefined) data.values = new Map();

    const had = data.values.has(pos.valueIndex);
    data.values.set(pos.valueIndex, value);
    if (!had) this.updateTotals(pos, data, nodeInfo, 1);
  }

  delete(index: number): Position {
    const pos = this.position(index);
    this.deleteAt(pos);
    return pos;
  }

  deleteAt(pos: Position): boolean {
    // Check that pos's Node is known.
    const nodeInfo = this.order.getNode(pos);

    const data = this.state.get(pos.creatorID)?.get(pos.timestamp);
    if (data?.values === undefined) return false;
    else {
      const had = data.values.delete(pos.valueIndex);
      if (had) this.updateTotals(pos, data, nodeInfo, -1);
      return had;
    }
  }

  private updateTotals(
    pos: Position,
    data: NodeData<T>,
    nodeInfo: NodeInfo,
    delta: number
  ): void {
    data.total += delta;
    if (data.total === 0) this.deleteData(pos);

    while (nodeInfo.parent !== null) {
      const ancData = this.getOrCreateData(nodeInfo.parent);
      ancData.total += delta;
      if (ancData.total === 0) this.deleteData(nodeInfo.parent);

      nodeInfo = this.order.getNode(nodeInfo.parent);
    }
  }

  private getOrCreateData(pos: Position): NodeData<T> {
    let byCreator = this.state.get(pos.creatorID);
    if (byCreator === undefined) {
      byCreator = new Map();
      this.state.set(pos.creatorID, byCreator);
    }

    let data = byCreator.get(pos.timestamp);
    if (data === undefined) {
      data = { total: 0 };
      byCreator.set(pos.timestamp, data);
    }

    return data;
  }

  /**
   * Delete the NodeData for pos's Node.
   */
  private deleteData(pos: Position): void {
    this.state.get(pos.creatorID)?.delete(pos.timestamp);
  }

  clear(): void {
    this.rootData.total = 0;
    this.state.clear();
    this.state.set(
      this.order.rootPosition.creatorID,
      new Map([[this.order.rootPosition.timestamp, this.rootData]])
    );
  }

  get(index: number): T {
    const pos = this.position(index);
    return this.getAt(pos)!;
  }

  /**
   * Okay to call on not-received Node - it's just not present.
   * @param pos
   * @returns
   */
  getAt(pos: Position): T | undefined {
    return this.state
      .get(pos.creatorID)
      ?.get(pos.timestamp)
      ?.values?.get(pos.valueIndex);
  }

  /**
   * Okay to call on not-received Node - it's just not present.
   * @param pos
   * @returns
   */
  hasAt(pos: Position): boolean {
    const values = this.state.get(pos.creatorID)?.get(pos.timestamp)?.values;
    return values === undefined ? false : values.has(pos.valueIndex);
  }

  get length(): number {
    return this.rootData.total;
  }

  position(index: number): Position {}

  /**
   * Returns the current index of pos.
   *
   * If position is not currently present in the list
   * (`hasAt(pos)` returns false), then the result depends on searchDir:
   * - "none" (default): Returns -1.
   * - "left": Returns the next index to the left of position.
   * If there are no values to the left of position,
   * returns -1.
   * - "right": Returns the next index to the right of position.
   * If there are no values to the right of position,
   * returns `this.length`.
   *
   * To find the index where a position would be if
   * present, use `searchDir = "right"`.
   *
   * See also: Cursors
   */
  index(pos: Position, searchDir: "none" | "left" | "right" = "none"): number {
    // The count of values < pos.
    let valuesBefore = 0;

    // 1. Count lesser values at the same Node.
    const nodeValues = this.state
      .get(pos.creatorID)
      ?.get(pos.timestamp)?.values;
    if (nodeValues !== undefined) {
      // Loop over the map instead of the indices, so tombstones don't affect us.
      for (const valueIndex of nodeValues.keys()) {
        if (valueIndex < pos.valueIndex) valuesBefore++;
      }
    }

    // TODO

    if (this.hasAt(pos)) return valuesBefore;
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
   * Returns an iterator for values in the list, in list order.
   */
  [Symbol.iterator](): IterableIterator<T> {
    return this.values();
  }

  /**
   *  Returns an iterator for values in the list, in list order.
   */
  *values(): IterableIterator<T> {
    // OPT: do own walk and yield* value items, w/o encoding positions.
    for (const [, value] of this.entries()) yield value;
  }

  /**
   * Returns an iterator for present positions, in list order.
   */
  *positions(): IterableIterator<Position> {
    for (const [, , position] of this.entries()) yield position;
  }

  /**
   * Returns an iterator of [index, value, position] tuples for every
   * value in the list, in list order.
   */
  *entries(): IterableIterator<[index: number, value: T, position: Position]> {
    const stack: { childIndex: number }[] = [];
  }

  /**
   * Returns a copy of a section of this list, as an array.
   * For both start and end, a negative index can be used to indicate an offset from the end of the list.
   * For example, -2 refers to the second to last element of the list.
   * @param start The beginning index of the specified portion of the list.
   * If start is undefined, then the slice begins at index 0.
   * @param end The end index of the specified portion of the list. This is exclusive of the element at the index 'end'.
   * If end is undefined, then the slice extends to the end of the list.
   */
  slice(start?: number, end?: number): T[] {
    const len = this.length;
    if (start === undefined || start < -len) {
      start = 0;
    } else if (start < 0) {
      start += len;
    } else if (start >= len) {
      return [];
    }
    if (end === undefined || end >= len) {
      end = len;
    } else if (end < -len) {
      end = 0;
    } else if (end < 0) {
      end += len;
    }
    if (end <= start) return [];

    // Optimize common case (slice())
    if (start === 0 && end === len) {
      return [...this.values()];
    } else {
      // TODO: optimize.
      const ans = new Array<T>(end - start);
      for (let i = 0; i < end - start; i++) {
        ans[i] = this.get(start + i);
      }
      return ans;
    }
  }

  save(): ListSavedState<T> {
    const savedState: ListSavedState<T> = {};

    for (const [creatorID, byCreator] of this.state) {
      if (creatorID === IDs.ROOT) continue;

      savedState[creatorID] = {};
      for (const [timestamp, data] of byCreator) {
        if (data.values?.size) {
          savedState[creatorID][timestamp] = {};
          for (const [valueIndex, value] of data.values) {
            savedState[creatorID][timestamp][valueIndex] = value;
          }
        }
      }
    }

    return savedState;
  }

  /**
   * Overwrites the current state (not state-based merge).
   *
   * On failure due to missing nodes, the state is left empty.
   *
   * @param savedState
   */
  load(savedState: ListSavedState<T>): void {
    this.clear();

    try {
      for (const [creatorID, byCreatorSave] of Object.entries(savedState)) {
        for (const [timestampStr, dataSave] of Object.entries(byCreatorSave)) {
          // Fake pos corresonding to the current Node, for API reasons.
          const nodePos: Position = {
            creatorID,
            timestamp: Number.parseInt(timestampStr),
            valueIndex: 0,
          };

          const data = this.getOrCreateData(nodePos);
          data.values = new Map();
          for (const [valueIndexStr, value] of Object.entries(dataSave)) {
            data.values.set(Number.parseInt(valueIndexStr), value);
          }

          this.updateTotals(
            nodePos,
            data,
            this.order.getNode(nodePos),
            data.values.size
          );
        }
      }
    } catch (exc) {
      this.clear();
      throw exc;
    }
  }
}
