import { AbsBunchMeta, AbsPosition, AbsPositions } from "./abs_position";
import { List, ListSavedState } from "./list";
import { Order } from "./order";

/**
 * A JSON-serializable saved state for an `AbsList<T>`.
 *
 * See AbsList.save and AbsList.load.
 *
 * ## Format
 *
 * For advanced usage, you may read and write AbsListSavedStates directly.
 *
 * The format is an array containing one entry for each [bunch](https://github.com/mweidner037/list-positions#bunches)
 * with AbsPositions present in the list, in no particular order.
 * Each bunch's entry contains:
 * - `bunchMeta` The bunch's {@link AbsBunchMeta}, which describes the bunch and all of its dependent metadata in a compressed form.
 * - `values` The bunch's values in the list, stored as a serialized form of
 *    the sparse array
 *    ```
 *    innerIndex -> (value at AbsPosition { bunchMeta, innerIndex })
 *    ```
 *
 * ### Value Format
 *
 * Each `values` serialized sparse array (type `(T[] | number)[]`)
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
export type AbsListSavedState<T> = Array<{
  bunchMeta: AbsBunchMeta;
  values: (T[] | number)[];
}>;

/**
 * A list of values of type `T`, represented as an ordered map with AbsPosition keys.
 *
 * See [AbsList and AbsPosition](https://github.com/mweidner037/list-positions#abslist-and-absposition) in the readme.
 *
 * AbsList's API is a hybrid between `Array<T>` and `Map<AbsPosition, T>`.
 * Use `insertAt` or `insert` to insert new values into the list in the style of `Array.splice`.
 *
 * @typeParam T The value type.
 */
export class AbsList<T> {
  /**
   * The Order that manages this list's Positions and their metadata.
   *
   * Unlike with List/Text/Outline, you do not need to [Manage Metadata](https://github.com/mweidner037/list-positions#managing-metadata)
   * when using AbsList. However, you can still access the Order
   * to convert between AbsPositions and Positions (using `Order.abs` / `Order.unabs`)
   * or to share the Order with other data structures.
   */
  readonly order: Order;
  /**
   * The List backing this AbsList.
   *
   * You can manipulate the List directly. AbsList is merely an API wrapper that converts
   * between AbsPositions and Positions on every call.
   */
  readonly list: List<T>;

  /**
   * Constructs a AbsList, initially empty.
   *
   * @param order The Order to use for `this.order`.
   * Multiple Lists/Texts/Outlines/AbsLists can share an Order; they then automatically
   * share metadata. If not provided, a `new Order()` is used.
   *
   * @see {@link AbsList.fromEntries} To construct a AbsList from an initial set of entries.
   */
  constructor(order?: Order);
  /**
   * Constructs a AbsList wrapping the given List, which is used as `this.list`.
   *
   * Changes to the List affect this AbsList and vice-versa.
   */
  constructor(list: List<T>);
  constructor(orderOrList?: Order | List<T>) {
    this.list =
      orderOrList instanceof List ? orderOrList : new List(orderOrList);
    this.order = this.list.order;
  }

  /**
   * Returns a new AbsList with the given
   * ordered-map entries.
   *
   * @param order Optionally, the Order to use for the AbsList's `order`.
   * Unlike with List.from, you do not need to deliver metadata to this
   * Order beforehand.
   */
  static fromEntries<T>(
    entries: Iterable<[pos: AbsPosition, value: T]>,
    order?: Order
  ): AbsList<T> {
    const list = new AbsList<T>(order);
    for (const [pos, value] of entries) {
      list.set(pos, value);
    }
    return list;
  }

  /**
   * Returns a new AbsList with the given
   * items (as defined by AbsList.items).
   *
   * @param order Optionally, the Order to use for the AbsList's `order`.
   * Unlike with List.from, you do not need to deliver metadata to this
   * Order beforehand.
   */
  static fromItems<T>(
    items: Iterable<[startPos: AbsPosition, values: T[]]>,
    order?: Order
  ): AbsList<T> {
    const list = new AbsList<T>(order);
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
  set(pos: AbsPosition, value: T): void;
  /**
   * Sets the values at a sequence of AbsPositions within the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   *
   * The AbsPositions start at `startPos` and have the same `bunchMeta` but increasing `innerIndex`.
   * Note that these positions might not be contiguous anymore, if later
   * positions were created between them.
   *
   * @see {@link AbsPositions.expandPositions}
   */
  set(startPos: AbsPosition, ...sameBunchValues: T[]): void;
  set(startPos: AbsPosition, ...values: T[]): void {
    this.list.set(this.order.unabs(startPos), ...values);
  }

  /**
   * Sets the value at the given index (equivalently, at AbsPosition `this.positionAt(index)`),
   * overwriting the existing value.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  setAt(index: number, value: T): void {
    this.list.setAt(index, value);
  }

  /**
   * Deletes the given position, making it and its value no longer present in the list.
   *
   * If the position was indeed present, later values in the list shift left (decrement their index).
   */
  delete(pos: AbsPosition): void;
  /**
   * Deletes a sequence of AbsPositions within the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   *
   * The AbsPositions start at `startPos` and have the same `bunchMeta` but increasing `innerIndex`.
   * Note that these positions might not be contiguous anymore, if later
   * positions were created between them.
   *
   * @see {@link AbsPositions.expandPositions}
   */
  delete(startPos: AbsPosition, sameBunchCount?: number): void;
  delete(startPos: AbsPosition, count = 1): void {
    this.list.delete(this.order.unabs(startPos), count);
  }

  /**
   * Deletes `count` values starting at `index`.
   *
   * @throws If any of `index`, ..., `index + count - 1` are not in `[0, this.length)`.
   */
  deleteAt(index: number, count = 1): void {
    this.list.deleteAt(index, count);
  }

  /**
   * Deletes every value in the list, making it empty.
   *
   * `this.order` is unaffected (retains all metadata).
   */
  clear() {
    this.list.clear();
  }

  /**
   * Inserts the given value just after prevPos, at a new AbsPosition.

   * Later values in the list shift right
   * (increment their index).
   * 
   * In a collaborative setting, the new AbsPosition is *globally unique*, even
   * if other users call `List.insert` (or similar methods) concurrently.
   * 
   * @returns [insertion AbsPosition, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * @throws If prevPos is AbsPositions.MAX_POSITION.
   */
  insert(prevPos: AbsPosition, value: T): AbsPosition;
  /**
   * Inserts the given values just after prevPos, at a series of new AbsPositions.
   *
   * The new AbsPositions all use the same [bunch](https://github.com/mweidner037/list-positions#bunches), with sequential
   * `innerIndex` (starting at the returned position).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new positions are created between them.
   *
   * @returns The starting AbsPosition.
   * @see {@link AbsPositions.expandPositions} To convert (returned position, values.length) to an array of AbsPositions.
   * @throws If prevPos is AbsPositions.MAX_POSITION.
   * @throws If no values are provided.
   */
  insert(prevPos: AbsPosition, ...values: T[]): AbsPosition;
  insert(prevPos: AbsPosition, ...values: T[]): AbsPosition {
    const [startPos] = this.list.insert(this.order.unabs(prevPos), ...values);
    return this.order.abs(startPos);
  }

  /**
   * Inserts the given values at `index` (i.e., between the values at `index - 1` and `index`), at a series of new AbsPositions.

   * Later values in the list shift right
   * (increase their index).
   * 
   * In a collaborative setting, the new AbsPositions are *globally unique*, even
   * if other users call `AbsList.insert` (or similar methods) concurrently.
   *
   * @returns The starting AbsPosition. Use {@link AbsPositions.expandPositions} to convert
   * (returned position, values.length) to an array of AbsPositions.
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append.
   * @throws If no values are provided.
   */
  insertAt(index: number, ...values: T[]): AbsPosition {
    const [startPos] = this.list.insertAt(index, ...values);
    return this.order.abs(startPos);
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the value at the given position, or undefined if it is not currently present.
   */
  get(pos: AbsPosition): T | undefined {
    return this.list.get(this.order.unabs(pos));
  }

  /**
   * Returns the value currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  getAt(index: number): T {
    return this.list.getAt(index);
  }

  /**
   * Returns whether the given position is currently present in the list.
   */
  has(pos: AbsPosition): boolean {
    return this.list.has(this.order.unabs(pos));
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
    pos: AbsPosition,
    searchDir: "none" | "left" | "right" = "none"
  ): number {
    return this.list.indexOfPosition(this.order.unabs(pos), searchDir);
  }

  /**
   * Returns the position currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  positionAt(index: number): AbsPosition {
    return this.order.abs(this.list.positionAt(index));
  }

  /**
   * The length of the list.
   */
  get length() {
    return this.list.length;
  }

  /**
   * Returns the cursor at `index` within the list, i.e., between the positions at `index - 1` and `index`.
   * See [Cursors](https://github.com/mweidner037/list-positions#cursors).
   *
   * Invert with indexOfCursor, possibly on a different List/Text/Outline/AbsList or a different device.
   */
  cursorAt(index: number): AbsPosition {
    return index === 0 ? AbsPositions.MIN_POSITION : this.positionAt(index - 1);
  }

  /**
   * Returns the current index of `cursor` within the list.
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * Inverts cursorAt.
   */
  indexOfCursor(cursor: AbsPosition): number {
    return AbsPositions.positionEquals(cursor, AbsPositions.MIN_POSITION)
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
  values(start?: number, end?: number): IterableIterator<T> {
    return this.list.values(start, end);
  }

  /**
   * Returns a copy of a section of this list, as an array.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  slice(start?: number, end?: number): T[] {
    return this.list.slice(start, end);
  }

  /**
   * Iterates over present positions, in list order.
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  *positions(start?: number, end?: number): IterableIterator<AbsPosition> {
    for (const pos of this.list.positions(start, end))
      yield this.order.abs(pos);
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
  ): IterableIterator<[pos: AbsPosition, value: T]> {
    for (const [pos, value] of this.list.entries(start, end)) {
      yield [this.order.abs(pos), value];
    }
  }

  /**
   * Iterates over items, in list order.
   *
   * Each *item* is a series of entries that have contiguous positions
   * from the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   * Specifically, for an item [startPos, values], the positions start at `startPos`
   * and have the same `bunchMeta` but increasing `innerIndex`.
   *
   * You can use this method as an optimized version of other iterators, or as
   * an alternative in-order save format (see {@link AbsList.fromItems}).
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  *items(
    start?: number,
    end?: number
  ): IterableIterator<[startPos: AbsPosition, values: T[]]> {
    for (const [pos, values] of this.list.items(start, end)) {
      yield [this.order.abs(pos), values];
    }
  }

  // ----------
  // Save & Load
  // ----------

  /**
   * Returns a saved state for this AbsList.
   *
   * The saved state describes our current (AbsPosition -> value) map in JSON-serializable form.
   * You can load this state on another AbsList by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   *
   * Note: You can instead use `Object.fromEntries(this.entries())` as a simple,
   * easy-to-interpret saved state, and load it with `AbsList.from`.
   * However, `save` and `load` use a more compact representation.
   */
  save(): AbsListSavedState<T> {
    // OPT: loop over nodes directly, to avoid double-object.
    const savedState: AbsListSavedState<T> = [];
    for (const [bunchID, values] of Object.entries(this.list.save())) {
      savedState.push({
        bunchMeta: AbsPositions.encodeMetas(
          this.order.getNode(bunchID)!.dependencies()
        ),
        values,
      });
    }
    return savedState;
  }

  /**
   * Loads a saved state returned by another AbsList's `save()` method.
   *
   * Loading sets our (AbsPosition -> value) map to match the saved AbsList's, *overwriting*
   * our current state.
   *
   * Unlike with List.load, you do not need to deliver metadata to `this.order`
   * beforehand.
   */
  load(savedState: AbsListSavedState<T>): void {
    // OPT: loop over nodes directly, to avoid double-object.
    const listSavedState: ListSavedState<T> = {};
    for (const { bunchMeta, values } of savedState) {
      this.order.addMetas(AbsPositions.decodeMetas(bunchMeta));
      listSavedState[AbsPositions.getBunchID(bunchMeta)] = values;
    }
    this.list.load(listSavedState);
  }
}
