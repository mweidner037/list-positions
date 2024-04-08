import { SparseArray } from "sparse-array-rled";
import { BunchMeta } from "./bunch";
import { ItemList, SparseItemsFactory } from "./internal/item_list";
import { normalizeSliceRange } from "./internal/util";
import { Order } from "./order";
import { MIN_POSITION, Position, positionEquals } from "./position";

const sparseArrayFactory: SparseItemsFactory<
  unknown[],
  SparseArray<unknown>
> = {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  new: SparseArray.new,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  deserialize: SparseArray.deserialize,
  length(item) {
    return item.length;
  },
  slice(item, start, end) {
    return item.slice(start, end);
  },
} as const;

/**
 * A JSON-serializable saved state for a `List<T>`.
 *
 * See List.save and List.load.
 *
 * ## Format
 *
 * For advanced usage, you may read and write ListSavedStates directly.
 *
 * The format is: For each [bunch](https://github.com/mweidner037/list-positions#bunches)
 * with Positions present in the List, map its bunchID to a serialized form of
 * the sparse array
 * ```
 * innerIndex -> (value at Position { bunchID, innerIndex })
 * ```
 * The bunches are in no particular order.
 *
 * ### Per-Bunch Format
 *
 * Each bunch's serialized sparse array (type `(T[] | number)[]`)
 * uses a compact JSON representation with run-length encoded deletions, identical to `SerializedSparseArray<T>` from the
 * [sparse-array-rled](https://github.com/mweidner037/sparse-array-rled#readme) package.
 * It alternates between:
 * - arrays of present values (even indices), and
 * - numbers (odd indices), representing that number of deleted values.
 *
 * For example, the sparse array `["foo", "bar", , , , "X", "yy"]` serializes to
 * `[["foo", "bar"], 3, ["X", "yy"]]`.
 *
 * Trivial entries (empty arrays, 0s, & trailing deletions) are always omitted,
 * except that the 0th entry may be an empty array.
 * For example, the sparse array `[, , "biz", "baz"]` serializes to `[[], 2, ["biz", "baz"]]`.
 */
export type ListSavedState<T> = {
  [bunchID: string]: (T[] | number)[];
};

/**
 * A list of values of type `T`, represented as an ordered map with Position keys.
 *
 * See [List, Position, and Order](https://github.com/mweidner037/list-positions#list-position-and-order) in the readme.
 *
 * List's API is a hybrid between `Array<T>` and `Map<Position, T>`.
 * Use `insertAt` or `insert` to insert new values into the list in the style of `Array.splice`.
 *
 * @typeParam T The value type.
 */
export class List<T> {
  /**
   * The Order that manages this list's Positions and their metadata.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#managing-metadata).
   */
  readonly order: Order;
  private readonly itemList: ItemList<T[], SparseArray<T>>;

  /**
   * Constructs a List, initially empty.
   *
   * @param order The Order to use for `this.order`.
   * Multiple Lists/Texts/Outlines/AbsLists can share an Order; they then automatically
   * share metadata. If not provided, a `new Order()` is used.
   *
   * @see {@link List.fromEntries} To construct a List from an initial set of entries.
   */
  constructor(order?: Order) {
    this.order = order ?? new Order();
    this.itemList = new ItemList(
      this.order,
      sparseArrayFactory as SparseItemsFactory<T[], SparseArray<T>>
    );
  }

  /**
   * Returns a new List using the given Order and with the given
   * ordered-map entries.
   *
   * Like when loading a saved state, you must deliver all of the Positions'
   * dependent metadata to `order` before calling this method.
   */
  static fromEntries<T>(
    entries: Iterable<[pos: Position, value: T]>,
    order: Order
  ): List<T> {
    const list = new List<T>(order);
    for (const [pos, value] of entries) {
      list.set(pos, value);
    }
    return list;
  }

  /**
   * Returns a new List using the given Order and with the given
   * items (as defined by List.items).
   *
   * Like when loading a saved state, you must deliver all of the Positions'
   * dependent metadata to `order` before calling this method.
   */
  static fromItems<T>(
    items: Iterable<[startPos: Position, values: T[]]>,
    order: Order
  ): List<T> {
    const list = new List<T>(order);
    for (const [startPos, values] of items) {
      list.set(startPos, ...values);
    }
    return list;
  }

  // ----------
  // Mutators
  // ----------

  /**
   * Sets the value at the given position.
   *
   * If the position is already present, its value is overwritten.
   * Otherwise, later values in the list shift right
   * (increment their index).
   */
  set(pos: Position, value: T): void;
  /**
   * Sets the values at a sequence of Positions within the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   *
   * The Positions start at `startPos` and have the same `bunchID` but increasing `innerIndex`.
   * Note that these Positions might not be contiguous anymore, if later
   * Positions were created between them.
   *
   * @see {@link expandPositions}
   */
  set(startPos: Position, ...sameBunchValues: T[]): void;
  set(startPos: Position, ...values: T[]): void {
    this.itemList.set(startPos, values);
  }

  /**
   * Sets the value at the given index (equivalently, at Position `this.positionAt(index)`),
   * overwriting the existing value.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  setAt(index: number, value: T): void {
    this.set(this.positionAt(index), value);
  }

  /**
   * Deletes the given position, making it and its value no longer present in the list.
   *
   * If the position was indeed present, later values in the list shift left (decrement their index).
   */
  delete(pos: Position): void;
  /**
   * Deletes a sequence of Positions within the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   *
   * The Positions start at `startPos` and have the same `bunchID` but increasing `innerIndex`.
   * Note that these Positions might not be contiguous anymore, if later
   * Positions were created between them.
   *
   * @see {@link expandPositions}
   */
  delete(startPos: Position, sameBunchCount?: number): void;
  delete(startPos: Position, count = 1): void {
    this.itemList.delete(startPos, count);
  }

  /**
   * Deletes `count` values starting at `index`.
   *
   * @throws If any of `index`, ..., `index + count - 1` are not in `[0, this.length)`.
   */
  deleteAt(index: number, count = 1): void {
    const toDelete = new Array<Position>(count);
    for (let i = 0; i < count; i++) {
      toDelete[i] = this.positionAt(index + i);
    }
    for (const pos of toDelete) this.itemList.delete(pos, 1);
  }

  /**
   * Deletes every value in the list, making it empty.
   *
   * `this.order` is unaffected (retains all metadata).
   */
  clear() {
    this.itemList.clear();
  }

  /**
   * Inserts the given value just after prevPos, at a new Position.

   * Later values in the list shift right
   * (increment their index).
   * 
   * In a collaborative setting, the new Position is *globally unique*, even
   * if other users call `List.insert` (or similar methods) concurrently.
   * 
   * @returns [insertion Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * @throws If prevPos is MAX_POSITION.
   */
  insert(
    prevPos: Position,
    value: T
  ): [pos: Position, newMeta: BunchMeta | null];
  /**
   * Inserts the given values just after prevPos, at a series of new Positions.
   *
   * The new Positions all use the same [bunch](https://github.com/mweidner037/list-positions#bunches), with sequential
   * `innerIndex` (starting at the returned startPos).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new Positions are created between them.
   *
   * @returns [starting Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * Use {@link expandPositions} to convert (startPos, values.length) to an array of Positions.
   * @throws If prevPos is MAX_POSITION.
   * @throws If no values are provided.
   */
  insert(
    prevPos: Position,
    ...values: T[]
  ): [startPos: Position, newMeta: BunchMeta | null];
  insert(
    prevPos: Position,
    ...values: T[]
  ): [startPos: Position, newMeta: BunchMeta | null] {
    return this.itemList.insert(prevPos, values);
  }

  /**
   * Inserts the given value at `index` (i.e., between the values at `index - 1` and `index`), at a new Position.
   *
   * Later values in the list shift right
   * (increment their index).
   *
   * In a collaborative setting, the new Position is *globally unique*, even
   * if other users call `List.insertAt` (or similar methods) concurrently.
   *
   * @returns [insertion Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append.
   */
  insertAt(index: number, value: T): [pos: Position, newMeta: BunchMeta | null];
  /**
   * Inserts the given values at `index` (i.e., between the values at `index - 1` and `index`), at a series of new Positions.
   *
   * The new Positions all use the same [bunch](https://github.com/mweidner037/list-positions#bunches), with sequential
   * `innerIndex` (starting at the returned startPos).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new Positions are created between them.
   *
   * @returns [starting Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * Use {@link expandPositions} to convert (startPos, values.length) to an array of Positions.
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append.
   * @throws If no values are provided.
   */
  insertAt(
    index: number,
    ...values: T[]
  ): [startPos: Position, newMeta: BunchMeta | null];
  insertAt(
    index: number,
    ...values: T[]
  ): [startPos: Position, newMeta: BunchMeta | null] {
    return this.itemList.insertAt(index, values);
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the value at the given position, or undefined if it is not currently present.
   */
  get(pos: Position): T | undefined {
    const located = this.itemList.getItem(pos);
    if (located === null) return undefined;
    const [item, offset] = located;
    return item[offset];
  }

  /**
   * Returns the value currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  getAt(index: number): T {
    const [item, offset] = this.itemList.getItemAt(index);
    return item[offset];
  }

  /**
   * Returns whether the given position is currently present in the list.
   */
  has(pos: Position): boolean {
    return this.itemList.has(pos);
  }

  /**
   * Returns the current index of the given position.
   *
   * If pos is not currently present in the list,
   * then the result depends on searchDir:
   * - "none" (default): Returns -1.
   * - "left": Returns the next index to the left of pos.
   * If there are no values to the left of pos,
   * returns -1.
   * - "right": Returns the next index to the right of pos.
   * If there are no values to the right of pos,
   * returns `this.length`.
   *
   * To find the index where a position would be if
   * present, use `searchDir = "right"`.
   */
  indexOfPosition(
    pos: Position,
    searchDir: "none" | "left" | "right" = "none"
  ): number {
    return this.itemList.indexOfPosition(pos, searchDir);
  }

  /**
   * Returns the position currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  positionAt(index: number): Position {
    return this.itemList.positionAt(index);
  }

  /**
   * The length of the list.
   */
  get length() {
    return this.itemList.length;
  }

  /**
   * Returns the cursor at `index` within the list, i.e., between the positions at `index - 1` and `index`.
   * See [Cursors](https://github.com/mweidner037/list-positions#cursors).
   *
   * Invert with indexOfCursor, possibly on a different List/Text/Outline/AbsList or a different device.
   */
  cursorAt(index: number): Position {
    return index === 0 ? MIN_POSITION : this.positionAt(index - 1);
  }

  /**
   * Returns the current index of `cursor` within the list.
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * Inverts cursorAt.
   */
  indexOfCursor(cursor: Position): number {
    return positionEquals(cursor, MIN_POSITION)
      ? 0
      : this.indexOfPosition(cursor, "left") + 1;
  }

  // ----------
  // Iterators
  // ----------

  /** Iterates over values in the list, in list order. */
  [Symbol.iterator](): IterableIterator<T> {
    return this.values();
  }

  /**
   * Iterates over values in the list, in list order.
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  *values(start?: number, end?: number): IterableIterator<T> {
    for (const [, item] of this.itemList.items(start, end)) yield* item;
  }

  /**
   * Returns a copy of a section of this list, as an array.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  slice(start?: number, end?: number): T[] {
    [start, end] = normalizeSliceRange(this.length, start, end);
    const ans: T[] = [];
    for (const [, values] of this.itemList.items(start, end)) {
      ans.push(...values);
    }
    return ans;
  }

  /**
   * Iterates over present positions, in list order.
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  *positions(start?: number, end?: number): IterableIterator<Position> {
    for (const [pos] of this.entries(start, end)) yield pos;
  }

  /**
   * Iterates over [pos, value] pairs in the list, in list order. These are its entries as an ordered map.
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  *entries(
    start?: number,
    end?: number
  ): IterableIterator<[pos: Position, value: T]> {
    for (const [
      { bunchID, innerIndex: startInnerIndex },
      item,
    ] of this.itemList.items(start, end)) {
      for (let i = 0; i < item.length; i++) {
        yield [{ bunchID, innerIndex: startInnerIndex + i }, item[i]];
      }
    }
  }

  /**
   * Iterates over items, in list order.
   *
   * Each *item* is a series of entries that have contiguous positions
   * from the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   * Specifically, for an item [startPos, values], the positions start at `startPos`
   * and have the same `bunchID` but increasing `innerIndex`.
   *
   * You can use this method as an optimized version of other iterators, or as
   * an alternative in-order save format (see {@link List.fromItems}).
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  items(
    start?: number,
    end?: number
  ): IterableIterator<[startPos: Position, values: T[]]> {
    return this.itemList.items(start, end);
  }

  /**
   * Iterates over all dependencies of the current state,
   * in no particular order.
   *
   * These are the combined dependencies of all
   * currently-present Positions - see [Managing Metadata](https://github.com/mweidner037/list-positions#save-load).
   *
   * As an optimization, you can save just these dependencies instead of the entire Order's state.
   * Be cautious, though, because that may omit BunchMetas that you
   * need for other reasons - e.g., to understand a cursor stored separately,
   * or a concurrent message from a collaborator.
   */
  dependencies(): IterableIterator<BunchMeta> {
    return this.itemList.dependencies();
  }

  // ----------
  // Save & Load
  // ----------

  /**
   * Returns a saved state for this List.
   *
   * The saved state describes our current (Position -> value) map in JSON-serializable form.
   * You can load this state on another List by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   */
  save(): ListSavedState<T> {
    return this.itemList.save();
  }

  /**
   * Loads a saved state returned by another List's `save()` method.
   *
   * Loading sets our (Position -> value) map to match the saved List's, *overwriting*
   * our current state.
   *
   * **Before loading a saved state, you must deliver its dependent metadata
   * to this.order**. For example, you could save and load the Order's state
   * alongside the List's state, making sure to load the Order first.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#save-load) for an example.
   */
  load(savedState: ListSavedState<T>): void {
    this.itemList.load(savedState);
  }
}
