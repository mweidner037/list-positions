export type Position = {
  readonly creatorID: string;
  readonly timestamp: string;
  readonly valueIndex: number;
};

export type MetaEntry = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly parent: Position;
};

export class List<T> {
  // Can't be set etc., but can be insertAfter'd or appear in a Cursor.
  // Or should we just use null for that?
  readonly rootPos: Position;

  // TODO: events: on, off. Has-a instead of subclass?
  // Meta mgmt & normal list changes.

  addMetas(metas: Iterable<MetaEntry> | MetaEntry): void {
    // TODO
  }

  getMetas(): MetaEntry[] {}

  set(index: number, value: T): Position {}

  setAt(pos: Position, value: T): void {}

  // For loading quickly
  setBulk(startPos: Position, values: T[]): void {}

  insert(index: number, value: T): { pos: Position; meta: MetaEntry | null } {}

  insertAfter(
    pos: Position,
    value: T
  ): { pos: Position; meta: MetaEntry | null } {}

  delete(index: number): Position {}

  deleteAt(pos: Position): void {}

  clear(): void {}

  get(index: number): T {}

  getAt(pos: Position): T | undefined {}

  get length(): number {}

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
