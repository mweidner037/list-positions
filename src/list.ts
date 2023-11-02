import { IDs } from "./ids";
import { MetaEntry, Position, positionEqual } from "./types";

/**
 * Info about a MetaEntry within a List.
 */
interface EntryInfo<T> {
  readonly parent: Position;
  /**
   * Child EntryInfo's, in list order.
   */
  children?: EntryInfo<T>[];
  /**
   * The total number of present values at this
   * waypoint and its descendants.
   *
   * Possibly omitted when 0.
   */
  total?: number;
  /**
   * Map from valueIndex to value. Possibly omitted when empty.
   */
  values?: Map<number, T>;
  /**
   * If this MetaEntry was created by us, the next valueIndex to create.
   */
  nextValueIndex?: number;
}

export class List<T> {
  readonly ID: string;
  private timestamp = 0;

  // Can't be set etc., but can be insertAfter'd or appear in a Cursor.
  // Or should we just use null for that?
  // Make static / const?
  readonly rootPos: Position = {
    creatorID: "ROOT",
    timestamp: 0,
    valueIndex: 0,
  };
  private readonly rootInfo: EntryInfo<T> = {
    parent: this.rootPos,
    total: 0,
  };

  /**
   * Maps from (creatorID, timestamp) to that waypoint's info.
   */
  private readonly state = new Map<string, Map<number, EntryInfo<T>>>();

  constructor(options?: { ID?: string }) {
    if (options?.ID !== undefined) {
      IDs.validate(options.ID);
    }
    this.ID = options?.ID ?? IDs.random();

    this.state.set(
      this.rootPos.creatorID,
      new Map([[this.rootPos.timestamp, this.rootInfo]])
    );
    this.state.set(this.ID, new Map());
  }

  private getInfo(pos: Position): EntryInfo<T> {
    const info = this.state.get(pos.creatorID)?.get(pos.timestamp);
    if (info === undefined) {
      throw new Error(
        `Position references unknown MetaEntry: ${JSON.stringify({
          creatorID: pos.creatorID,
          timestamp: pos.timestamp,
        })}. You must call addMeta/addMetas before referencing a MetaEntry.`
      );
    }
    if (pos.valueIndex < 0) {
      throw new Error(
        `Position has negative valueIndex: ${JSON.stringify(pos)}`
      );
    }
    return info;
  }

  /**
   * Set this to get called when a new MetaEntry is created by an
   * insert* method (which also returns that MetaEntry).
   */
  onNewMeta: ((meta: MetaEntry) => void) | undefined = undefined;

  addMetas(metas: Iterable<MetaEntry>): void {
    for (const meta of metas) this.addMeta(meta);
  }

  addMeta(meta: MetaEntry): void {
    let byCreator = this.state.get(meta.creatorID);
    if (byCreator === undefined) {
      byCreator = new Map();
      this.state.set(meta.creatorID, byCreator);
    }

    const existing = byCreator.get(meta.timestamp);
    if (existing === undefined) {
      // New MetaEntry.
      // getInfo also checks that parent is valid.
      const parentInfo = this.getInfo(meta.parent);
      const info = {
        parent: meta.parent,
      };
      byCreator.set(meta.timestamp, info);
      this.updateTimestamp(meta.timestamp);
      this.addToChildren(info, parentInfo);
      // TODO: add to children
    } else {
      // Redundant MetaEntry. Make sure it matches existing.
      if (!positionEqual(meta.parent, existing.parent)) {
        throw new Error(
          `MetaEntry added twice with different parents: existing = ${JSON.stringify(
            existing.parent
          )}, new = ${JSON.stringify(meta.parent)}`
        );
      }
    }
  }

  /**
   * Adds a new MetaEntry info to parentInfo.children.
   */
  private addToChildren(info: EntryInfo<T>, parentInfo: EntryInfo<T>) {
    if (parentInfo.children === undefined) parentInfo.children = [info];
    else {
      // Find the index of the first child > info.
      let i = 0;
      for (; i < parentInfo.children.length; i++) {
        const child = parentInfo.children[i];
        // Children sort order: first by valueIndex, then by *reverse* timestamp,
        // then by creatorID.
        // Break if child > info.
        if (child.parent.valueIndex > info.parent.valueIndex) break;
        else if (child.parent.valueIndex === info.parent.valueIndex) {
          if (child.parent.timestamp < info.parent.timestamp) break;
          else if (child.parent.timestamp === info.parent.timestamp) {
            if (child.parent.creatorID > info.parent.creatorID) break;
          }
        }
      }
      // Insert info just before that child.
      parentInfo.children.splice(i, 0, info);
    }
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

  insert(index: number, value: T): { pos: Position; meta: MetaEntry | null } {
    const ret = this.insertPosition(index);
    // OPT: pass index hint
    this.setAt(ret.pos, value);
    return ret;
  }

  insertAfter(
    prevPos: Position,
    value: T
  ): { pos: Position; meta: MetaEntry | null } {
    const ret = this.insertPositionAfter(prevPos);
    this.setAt(ret.pos, value);
    return ret;
  }

  insertPosition(index: number): { pos: Position; meta: MetaEntry | null } {
    if (index < 0 || index > this.length) {
      throw new Error(
        `index out of bounds for insert: ${index}, length=${this.length}`
      );
    }

    const prevPos = index === 0 ? this.rootPos : this.position(index - 1);
    return this.insertPositionAfter(prevPos);
  }

  insertPositionAfter(prevPos: Position): {
    pos: Position;
    meta: MetaEntry | null;
  } {
    // getInfo also checks that prevPos is valid.
    const prevInfo = this.getInfo(prevPos);

    // First try to extend prevPos's MetaEntry.
    if (prevPos.creatorID === this.ID) {
      if (prevInfo.nextValueIndex! === prevPos.valueIndex + 1) {
        // Success.
        const pos: Position = {
          creatorID: prevPos.creatorID,
          timestamp: prevPos.timestamp,
          valueIndex: prevInfo.nextValueIndex,
        };
        prevInfo.nextValueIndex++;
        return { pos, meta: null };
      }
    }

    // Else create a new MetaEntry.
    const meta: MetaEntry = {
      creatorID: this.ID,
      timestamp: ++this.timestamp,
      parent: prevPos,
    };
    const pos: Position = {
      creatorID: meta.creatorID,
      timestamp: meta.timestamp,
      valueIndex: 0,
    };

    const info = {
      parent: meta.parent,
      nextValueIndex: 1,
    };
    this.state.get(this.ID)!.set(meta.timestamp, info);
    this.addToChildren(info, prevInfo);
    this.onNewMeta?.(meta);

    return { pos, meta };
  }

  set(index: number, value: T): Position {
    const pos = this.position(index);
    this.setAt(pos, value);
    return pos;
  }

  setAt(pos: Position, value: T): void {
    const info = this.getInfo(pos);
    if (info.values === undefined) info.values = new Map();
    const had = info.values.has(pos.valueIndex);
    info.values.set(pos.valueIndex, value);
    if (!had) this.updateTotals(info, 1);
  }

  delete(index: number): Position {
    const pos = this.position(index);
    this.deleteAt(pos);
    return pos;
  }

  deleteAt(pos: Position): void {
    const info = this.getInfo(pos);
    if (info.values !== undefined) {
      const had = info.values.delete(pos.valueIndex);
      if (had) this.updateTotals(info, -1);
    }
  }

  private updateTotals(info: EntryInfo<T>, delta: number): void {
    for (; info.parent !== null; info = this.getInfo(info.parent)) {
      info.total = (info.total ?? 0) + delta;
    }
  }

  clear(): void {
    for (const byCreator of this.state.values()) {
      for (const info of byCreator.values()) {
        // We don't delete the fields to avoid hidden class de-opts.
        if (info.total !== undefined) info.total = 0;
        if (info.values !== undefined) info.values.clear();
      }
    }
  }

  get(index: number): T {
    const pos = this.position(index);
    return this.getAt(pos)!;
  }

  getAt(pos: Position): T | undefined {
    return this.getInfo(pos).values?.get(pos.valueIndex);
  }

  hasAt(pos: Position): boolean {
    const values = this.getInfo(pos).values;
    return values === undefined ? false : values.has(pos.valueIndex);
  }

  get length(): number {
    return this.rootInfo.total!;
  }

  position(index: number): Position {}

  index(pos: Position, searchDir: "none" | "left" | "right" = "none"): number {}

  // TODO: compare method? Better than index() when both not present.

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
      // TODO: optimize.
      const ans = new Array<T>(end - start);
      for (let i = 0; i < end - start; i++) {
        ans[i] = this.get(start + i);
      }
      return ans;
    }
  }
}
