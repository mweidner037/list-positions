import { BunchNode } from "./bunch";
import { ItemList } from "./internal/item_list";
import { ArrayItemManager, SparseItems } from "./internal/sparse_items";
import { Order } from "./order";
import { Position } from "./position";

/**
 * A JSON-serializable saved state for a `List<T>`.
 *
 * See List.save and List.load.
 *
 * ### Format
 *
 * For advanced usage, you may read and write ListSavedStates directly.
 *
 * The format is: For each [bunch](https://github.com/mweidner037/position-structs#bunches)
 * with Positions present in the List, map the bunch's ID to a sparse array
 * representing the map
 * ```
 * innerIndex -> (value at Position { bunchID, innerIndex }).
 * ```
 * bunchID keys are in no particular order.
 *
 * Each sparse array of type `(T[] | number)[]` alternates between "runs" of present and deleted
 * values. Each even index is an array of present values; each odd
 * index is a count of deleted values.
 * E.g. `[["a", "b"], 3, ["c"]]` means `["a", "b", null, null, null, "c"]`.
 */
export type ListSavedState<T> = {
  [bunchID: string]: (T[] | number)[];
};

/**
 * A list of values of type `T`, represented as an ordered map with Position keys.
 *
 * See [List, Position, and Order](https://github.com/mweidner037/position-structs#list-position-and-order) in the readme.
 *
 * List's API is a hybrid between `Array<T>` and `Map<Position, T>`.
 * Use `insertAt` or `insert` to insert new values into the list in the style of `Array.splice`.
 *
 * @typeParam T The value type.
 */
export class List<T> {
  /**
   * The Order that manages this list's Positions and their metadata.
   * See [Managing Metadata](https://github.com/mweidner037/position-structs#managing-metadata).
   */
  readonly order: Order;
  private readonly itemList: ItemList<T[], T>;

  /**
   * Constructs a List, initially empty.
   *
   * @param order The Order to use for `this.order`.
   * Multiple Lists/Outlines/LexLists can share an Order; they then automatically
   * share metadata. If not provided, a `new Order()` is used.
   *
   * @see List.from To construct a List from an initial set of entries.
   */
  constructor(order?: Order) {
    this.order = order ?? new Order();
    this.itemList = new ItemList(this.order, new ArrayItemManager());
  }

  /**
   * Returns a new List using the given Order and with the given
   * ordered-map entries.
   *
   * Like when loading a saved state, you must deliver all of the Positions'
   * dependent metadata to `order` before calling this method.
   */
  static from<T>(
    entries: Iterable<[pos: Position, value: T]>,
    order: Order
  ): List<T> {
    const list = new List<T>(order);
    for (const [pos, value] of entries) {
      list.set(pos, value);
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
   * Sets the values at a sequence of Positions within the same [bunch](https://github.com/mweidner037/position-structs#bunches).
   *
   * The Positions start at `startPos` and have the same `bunchID` but increasing `innerIndex`.
   * Note that these Positions might not be contiguous anymore, if later
   * Positions were created between them.
   *
   * @see Order.startPosToArray
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
   * Deletes a sequence of Positions within the same [bunch](https://github.com/mweidner037/position-structs#bunches).
   *
   * The Positions start at `startPos` and have the same `bunchID` but increasing `innerIndex`.
   * Note that these Positions might not be contiguous anymore, if later
   * Positions were created between them.
   *
   * @see Order.startPosToArray
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
   * @returns [insertion Position, [created bunch's](https://github.com/mweidner037/position-structs#createdBunch) BunchNode (or null)].
   * @throws If prevPos is Order.MAX_POSITION.
   */
  insert(
    prevPos: Position,
    value: T
  ): [pos: Position, createdBunch: BunchNode | null];
  /**
   * Inserts the given values just after prevPos, at a series of new Positions.
   *
   * The new Positions all use the same [bunch](https://github.com/mweidner037/position-structs#bunches), with sequential
   * `innerIndex` (starting at the returned startPos).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new Positions are created between them.
   *
   * @returns [starting Position, [created bunch's](https://github.com/mweidner037/position-structs#createdBunch) BunchNode (or null)].
   * @throws If prevPos is Order.MAX_POSITION.
   * @throws If no values are provided.
   * @see Order.startPosToArray To convert (startPos, values.length) to an array of Positions.
   */
  insert(
    prevPos: Position,
    ...values: T[]
  ): [startPos: Position, createdBunch: BunchNode | null];
  insert(
    prevPos: Position,
    ...values: T[]
  ): [startPos: Position, createdBunch: BunchNode | null] {
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
   * @returns [insertion Position, [created bunch's](https://github.com/mweidner037/position-structs#createdBunch) BunchNode (or null)].
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append, unless this list's current last Position is Order.MAX_POSITION.
   */
  insertAt(
    index: number,
    value: T
  ): [pos: Position, createdBunch: BunchNode | null];
  /**
   * Inserts the given values at `index` (i.e., between the values at `index - 1` and `index`), at a series of new Positions.
   *
   * The new Positions all use the same [bunch](https://github.com/mweidner037/position-structs#bunches), with sequential
   * `innerIndex` (starting at the returned startPos).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new Positions are created between them.
   *
   * @returns [insertion Position, [created bunch's](https://github.com/mweidner037/position-structs#createdBunch) BunchNode (or null)].
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append, unless this list's current last Position is Order.MAX_POSITION.
   * @throws If no values are provided.
   * @see Order.startPosToArray To convert (startPos, values.length) to an array of Positions.
   */
  insertAt(
    index: number,
    ...values: T[]
  ): [startPos: Position, createdBunch: BunchNode | null];
  insertAt(
    index: number,
    ...values: T[]
  ): [startPos: Position, createdBunch: BunchNode | null] {
    return this.itemList.insertAt(index, values);
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the value at the given position, or undefined if it is not currently present.
   */
  get(pos: Position): T | undefined {
    return this.itemList.get(pos);
  }

  /**
   * Returns the value currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  getAt(index: number): T {
    return this.itemList.getAt(index);
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
   * See [Cursors](https://github.com/mweidner037/position-structs#cursors).
   *
   * Invert with indexOfCursor, possibly on a different List/Outline/LexList or a different device.
   */
  cursorAt(index: number): Position {
    return index === 0 ? Order.MIN_POSITION : this.positionAt(index - 1);
  }

  /**
   * Returns the current index of `cursor` within the list.
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * Inverts cursorAt.
   */
  indexOfCursor(cursor: Position): number {
    return Order.equalsPosition(cursor, Order.MIN_POSITION)
      ? 0
      : this.indexOfPosition(cursor, "left") + 1;
  }

  // ----------
  // Iterators
  // ----------

  /** Returns an iterator for values in the list, in list order. */
  [Symbol.iterator](): IterableIterator<T> {
    return this.values();
  }

  /**
   * Returns an iterator for values in the list, in list order.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  *values(start?: number, end?: number): IterableIterator<T> {
    for (const [, value] of this.entries(start, end)) yield value;
  }

  /**
   * Returns a copy of a section of this list, as an array.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  slice(start?: number, end?: number): T[] {
    return [...this.values(start, end)];
  }

  /**
   * Returns an iterator for present positions, in list order.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  *positions(start?: number, end?: number): IterableIterator<Position> {
    for (const [pos] of this.entries(start, end)) yield pos;
  }

  /**
   * Returns an iterator of [pos, value] tuples in the list, in list order. These are its entries as an ordered map.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  entries(
    start?: number,
    end?: number
  ): IterableIterator<[pos: Position, value: T]> {
    return this.itemList.entries(start, end);
  }

  // ----------
  // Save & Load
  // ----------

  /**
   * Returns a saved state for this List.
   *
   * The saved state describes our current (Position -> value) map in JSON-serializable form.
   * You can load these entries on another List by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   */
  save(): ListSavedState<T> {
    return this.itemList.save(deepCloneItems);
  }

  /**
   * Loads a saved state returned by another List's `save()` method.
   *
   * Loading sets our (Position -> value) map to match the saved List's, *overwriting*
   * our current state.
   *
   * **Before loading a saved state, you must deliver its dependent metadata
   * to this.Order**. For example, you could save and load the Order's state
   * alongside the List's state, making sure to load the Order first.
   * See [Managing Metadata](https://github.com/mweidner037/position-structs#save-load) for an example.
   */
  load(savedState: ListSavedState<T>): void {
    this.itemList.load(savedState, deepCloneItems);
  }
}

function deepCloneItems<T>(items: SparseItems<T[]>): SparseItems<T[]> {
  // Defensive deep copy
  const copy = new Array<T[] | number>(items.length);
  for (let i = 0; i < items.length; i++) {
    if (i % 2 === 0) copy[i] = (items[i] as T[]).slice();
    else copy[i] = items[i];
  }
  return copy;
}
