import { IDs } from "./ids";

export type Position = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly valueIndex: number;
};

export type MetaEntry = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly parent: Position;
};

/**
 * Info about a waypoint's values within a LocalList.
 */
interface WaypointInfo<T> {
  readonly parent: Position;
  /**
   * The total number of present values at this
   * waypoint and its descendants.
   */
  total: number;
  /**
   * The values (or not) at the waypoint's positions,
   * in order from left to right, represented as
   * an array of "items": T[] for present values,
   * positive count for deleted values.
   *
   * The items always alternate types. If the last
   * item would be a number (deleted), it is omitted.
   *
   * TODO: omit when empty?
   */
  items: (T[] | number)[];
}

export class List<T> {
  // Can't be set etc., but can be insertAfter'd or appear in a Cursor.
  // Or should we just use null for that?
  readonly rootPos: Position = {
    creatorID: "ROOT",
    timestamp: 0,
    valueIndex: 0,
  };
  private readonly rootInfo = {
    parent: this.rootPos,
    total: 0,
    items: [],
  };

  readonly ID: string;
  private timestamp = 0;

  /**
   * Maps from (creatorID, timestamp) to that waypoint's info.
   */
  private readonly state = new Map<string, Map<number, WaypointInfo<T>>>();

  constructor(options?: { ID?: string }) {
    if (options?.ID !== undefined) {
      IDs.validate(options.ID);
    }
    this.ID = options?.ID ?? IDs.random();

    this.state.set(
      this.rootPos.creatorID,
      new Map([[this.rootPos.timestamp, this.rootInfo]])
    );
  }

  // TODO: events: on, off. Has-a instead of subclass?
  // Meta mgmt & normal list changes.

  addMeta(meta: MetaEntry): void {
    let byCreator = this.state.get(meta.creatorID);
    if (byCreator === undefined) {
      byCreator = new Map();
      this.state.set(meta.creatorID, byCreator);
    }

    const existing = byCreator.get(meta.timestamp);
    if (existing === undefined) {
      // New MetaEntry.
      this.validate(meta.parent);
      byCreator.set(meta.timestamp, {
        parent: meta.parent,
        total: 0,
        items: [],
      });
    } else {
      // Redundant MetaEntry. Make sure it matches existing.
      if (!this.posEqual(meta.parent, existing.parent)) {
        throw new Error(
          `MetaEntry added twice with different parents: existing = ${JSON.stringify(
            existing.parent
          )}, new = ${JSON.stringify(meta.parent)}`
        );
      }
    }
  }

  addMetas(metas: Iterable<MetaEntry>): void {
    for (const meta of metas) this.addMeta(meta);
  }

  *metas(): IterableIterator<MetaEntry> {
    for (const [creatorID, byCreator] of this.state) {
      for (const [timestamp, info] of byCreator) {
        yield { creatorID, timestamp, parent: info.parent };
      }
    }
  }

  updateTimestamp(otherTimestamp: number): number {
    this.timestamp = Math.max(otherTimestamp, this.timestamp);
    return this.timestamp;
  }

  set(index: number, value: T): Position {
    const pos = this.positionOfIndex(index);
    this.setAt(pos, value);
    return pos;
  }

  setAt(pos: Position, value: T): void {}

  // For loading quickly
  setBulk(startPos: Position, values: T[]): void {}

  insert(index: number, value: T): { pos: Position; meta: MetaEntry | null } {
    if (index < 0 || index > this.length) {
      throw new Error(
        `index out of bounds for insert: ${index}, length=${this.length}`
      );
    }

    const prevPos =
      index === 0 ? this.rootPos : this.positionOfIndex(index - 1);
    return this.insertAfter(prevPos, value);
  }

  insertAfter(
    prevPos: Position,
    value: T
  ): { pos: Position; meta: MetaEntry | null } {}

  delete(index: number): Position {
    const pos = this.positionOfIndex(index);
    this.deleteAt(pos);
    return pos;
  }

  deleteAt(pos: Position): void {}

  clear(): void {}

  get(index: number): T {
    const pos = this.positionOfIndex(index);
    return this.getAt(pos)!;
  }

  getAt(pos: Position): T | undefined {}

  hasAt(pos: Position): boolean {}

  get length(): number {
    return this.rootInfo.total;
  }

  positionOfIndex(index: number): Position {}

  indexOfPosition(
    pos: Position,
    searchDir: "none" | "left" | "right" = "none"
  ): number {}

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
  *entries(): IterableIterator<[index: number, value: T, position: Position]> {}

  // TODO: bulk representation of values? Mirroring internal / saved state.

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
      // OPT: optimize.
      const ans = new Array<T>(end - start);
      for (let i = 0; i < end - start; i++) {
        ans[i] = this.get(start + i);
      }
      return ans;
    }
  }
}
