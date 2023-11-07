import { IDs } from "./ids";
import { Order, Outline, Position } from "./order";

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

class ListOutline<T> implements Outline {
  constructor(
    private readonly state = new Map<string, Map<number, NodeData<T>>>(),
    private readonly rootData: NodeData<T>
  ) {}

  descCount(creatorID: string, timestamp: number): number {
    return this.state.get(creatorID)?.get(timestamp)?.total ?? 0;
  }

  valueCount(
    creatorID: string,
    timestamp: number,
    startValueIndex: number,
    endValueIndex: number
  ): number {
    throw new Error("Method not implemented.");
  }

  nthValueIndex(
    creatorID: string,
    timestamp: number,
    startValueIndex: number,
    n: number
  ): number {
    throw new Error("Method not implemented.");
  }

  has(pos: Position): boolean {
    const values = this.state.get(pos.creatorID)?.get(pos.timestamp)?.values;
    if (values === undefined) return false;
    else return pos.valueIndex in values;
  }
}

export class List<T> {
  /**
   * Maps from (creatorID, timestamp) to that Node's NodeValues.
   */
  private readonly state = new Map<string, Map<number, NodeData<T>>>();
  readonly outline: Outline;

  constructor(readonly order: Order) {
    const rootData: NodeData<T> = { total: 0 };
    this.state.set(
      this.order.rootPosition.creatorID,
      new Map([[this.order.rootPosition.timestamp, rootData]])
    );

    this.outline = new ListOutline(this.state, rootData);
  }

  set(pos: Position, value: T): void {
    this.order.validate(pos);
    if (pos.creatorID === IDs.ROOT) {
      throw new Error("Cannot have a value at the root Position");
    }

    const data = this.getOrCreateData(pos);
    if (data.values === undefined) data.values = {};

    const had = pos.valueIndex in data.values;
    data.values[pos.valueIndex] = value;
    if (!had) this.updateTotals(pos, 1);
  }

  delete(pos: Position): boolean {
    this.order.validate(pos);
    if (pos.creatorID === IDs.ROOT) {
      throw new Error("Cannot have a value at the root Position");
    }

    const data = this.state.get(pos.creatorID)?.get(pos.timestamp);
    if (data?.values === undefined) return false;
    else {
      const had = pos.valueIndex in data.values;
      delete data.values[pos.valueIndex];
      if (had) this.updateTotals(pos, -1);
      return had;
    }
  }

  private updateTotals(pos: Position, delta: number): void {
    let currentPos: Position | null = pos;
    while (currentPos !== null) {
      const data = this.getOrCreateData(currentPos);
      data.total += delta;
      if (data.total === 0) {
        // Tombstone subtree; delete to save space.
        this.state.get(currentPos.creatorID)!.delete(currentPos.timestamp);
      }

      currentPos = this.order.getParent(currentPos);
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

  get(pos: Position): T | undefined {
    return this.state.get(pos.creatorID)?.get(pos.timestamp)?.values?.[
      pos.valueIndex
    ];
  }

  has(pos: Position): boolean {
    const values = this.state.get(pos.creatorID)?.get(pos.timestamp)?.values;
    if (values === undefined) return false;
    else return pos.valueIndex in values;
  }
}
