import { LexUtils } from "./lex_utils";
import { List } from "./list";
import { Order } from "./order";
import { LexPosition, Position } from "./position";

/**
 * A JSON-serializable saved state for a `LexList<T>`.
 *
 * See LexList.save and LexList.load.
 *
 * ### Format
 *
 * For advanced usage, you may read and write LexListSavedStates directly.
 *
 * The format is: For each [bunch](https://github.com/mweidner037/list-positions#bunches)
 * with LexPositions present in the LexList, map the [bunch's prefix](https://github.com/mweidner037/list-positions#bunch-prefix) to a sparse array
 * representing the map
 * ```
 * innerIndex -> (value at Position { bunchID, innerIndex }).
 * ```
 * bunchPrefix keys are in no particular order.
 *
 * Each sparse array of type `(T[] | number)[]` alternates between "runs" of present and deleted
 * values. Each even index is an array of present values; each odd
 * index is a count of deleted values.
 * E.g. `[["a", "b"], 3, ["c"]]` means `["a", "b", null, null, null, "c"]`.
 */
export type LexListSavedState<T> = {
  [bunchPrefix: string]: (T[] | number)[];
};

/**
 * A list of values of type `T`, represented as an ordered map with LexPosition keys.
 *
 * See [LexList and LexPosition](https://github.com/mweidner037/list-positions#lexlist-and-lexposition) in the readme.
 *
 * LexList's API is a hybrid between `Array<T>` and `Map<LexPosition, T>`.
 * Use `insertAt` or `insert` to insert new values into the list in the style of `Array.splice`.
 *
 * @typeParam T The value type.
 */
export class LexList<T> {
  /**
   * The Order that manages this list's Positions and their metadata.
   *
   * Unlike with List and Outline, you do not need to [Manage Metadata](https://github.com/mweidner037/list-positions#managing-metadata)
   * when using LexList. However, you can still access the Order
   * to convert between LexPositions and Positions (using `Order.lex` / `Order.unlex`)
   * or to share the Order with other data structures.
   */
  readonly order: Order;
  /**
   * The List backing this LexList.
   *
   * You can manipulate the List directly. LexList is merely an API wrapper that converts
   * between LexPositions and Positions on every call.
   */
  readonly list: List<T>;

  /**
   * Constructs a LexList, initially empty.
   *
   * @param order The Order to use for `this.order`.
   * Multiple Lists/Outlines/LexLists can share an Order; they then automatically
   * share metadata. If not provided, a `new Order()` is used.
   *
   * @see LexList.from To construct a LexList from an initial set of entries.
   */
  constructor(order?: Order) {
    this.list = new List(order);
    this.order = this.list.order;
  }

  /**
   * Returns a new LexList with the given
   * ordered-map entries.
   *
   * @param order Optionally, the Order to use for the LexList's `order`.
   * Unlike with List.from, you do not need to deliver metadata to this
   * Order beforehand.
   */
  static from<T>(
    entries: Iterable<[lexPos: LexPosition, value: T]>,
    order?: Order
  ): LexList<T> {
    const lexList = new LexList<T>(order);
    for (const [lexPos, value] of entries) {
      lexList.set(lexPos, value);
    }
    return lexList;
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
  set(lexPos: LexPosition, value: T): void {
    this.list.set(this.order.unlex(lexPos), value);
  }

  /**
   * Sets the value at the given index (equivalently, at LexPosition `this.positionAt(index)`),
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
  delete(lexPos: LexPosition): void {
    this.list.delete(this.order.unlex(lexPos));
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
   * Inserts the given values just after prevLexPos, at a series of new LexPositions.

   * Later values in the list shift right
   * (increase their index).
   * 
   * In a collaborative setting, the new LexPositions are *globally unique*, even
   * if other users call `LexList.insert` (or similar methods) concurrently.
   *
   * @returns The inserted values' LexPositions.
   * @throws If prevLexPos is Order.MAX_LEX_POSITION.
   * @throws If no values are provided.
   */
  insert(prevLexPos: LexPosition, ...values: T[]): LexPosition[] {
    const [startPos] = this.list.insert(
      this.order.unlex(prevLexPos),
      ...values
    );
    return this.lexAll(startPos, values.length);
  }

  /**
   * Inserts the given values at `index` (i.e., between the values at `index - 1` and `index`), at a series of new LexPositions.

   * Later values in the list shift right
   * (increase their index).
   * 
   * In a collaborative setting, the new LexPositions are *globally unique*, even
   * if other users call `LexList.insert` (or similar methods) concurrently.
   *
   * @returns The inserted values' LexPositions.
   * @throws If prevLexPos is Order.MAX_LEX_POSITION.
   * @throws If no values are provided.
   */
  insertAt(index: number, ...values: T[]): LexPosition[] {
    const [startPos] = this.list.insertAt(index, ...values);
    return this.lexAll(startPos, values.length);
  }

  private lexAll(startPos: Position, count: number): LexPosition[] {
    // Reuse the bunchPrefix instead of calling lex on each position.
    const bunchPrefix = this.order.getNodeFor(startPos).lexPrefix();
    const lexPositions = new Array<LexPosition>(count);
    for (let i = 0; i < count; i++) {
      lexPositions[i] = LexUtils.combinePos(
        bunchPrefix,
        startPos.innerIndex + i
      );
    }
    return lexPositions;
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the value at the given position, or undefined if it is not currently present.
   */
  get(lexPos: LexPosition): T | undefined {
    return this.list.get(this.order.unlex(lexPos));
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
  has(lexPos: LexPosition): boolean {
    return this.list.has(this.order.unlex(lexPos));
  }

  /**
   * Returns the current index of the given position.
   *
   * If lexPos is not currently present in the list,
   * then the result depends on searchDir:
   * - "none" (default): Returns -1.
   * - "left": Returns the next index to the left of lexPos.
   * If there are no values to the left of pos,
   * returns -1.
   * - "right": Returns the next index to the right of lexPos.
   * If there are no values to the right of lexPos,
   * returns `this.length`.
   *
   * To find the index where a position would be if
   * present, use `searchDir = "right"`.
   */
  indexOfPosition(
    lexPos: LexPosition,
    searchDir: "none" | "left" | "right" = "none"
  ): number {
    return this.list.indexOfPosition(this.order.unlex(lexPos), searchDir);
  }

  /**
   * Returns the position currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  positionAt(index: number): LexPosition {
    return this.order.lex(this.list.positionAt(index));
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
   * Invert with indexOfCursor, possibly on a different List/Outline/LexList or a different device.
   */
  cursorAt(index: number): LexPosition {
    return index === 0 ? Order.MIN_LEX_POSITION : this.positionAt(index - 1);
  }

  /**
   * Returns the current index of `cursor` within the list.
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * Inverts cursorAt.
   */
  indexOfCursor(cursor: LexPosition): number {
    return cursor === Order.MIN_LEX_POSITION
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
   * Returns an iterator for present positions, in list order.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  *positions(start?: number, end?: number): IterableIterator<LexPosition> {
    for (const pos of this.list.positions(start, end))
      yield this.order.lex(pos);
  }

  /**
   * Returns an iterator of [lexPos, value] tuples in the list, in list order. These are its entries as an ordered map.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  *entries(
    start?: number,
    end?: number
  ): IterableIterator<[lexPos: LexPosition, value: T]> {
    for (const [pos, value] of this.list.entries(start, end)) {
      yield [this.order.lex(pos), value];
    }
  }

  // ----------
  // Save & Load
  // ----------

  /**
   * Returns a saved state for this List.
   *
   * The saved state describes our current (LexPosition -> value) map in JSON-serializable form.
   * You can load these entries on another List by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   *
   * Note: You can also use `Object.fromEntries(this.entries())` as a simple,
   * easy-to-interpret saved state, and load it with `LexList.from`.
   * However, `save` and `load` use a more compact representation.
   */
  save(): LexListSavedState<T> {
    // OPT: loop over nodes directly, to avoid double-object.
    const savedState: LexListSavedState<T> = {};
    for (const [bunchID, values] of Object.entries(this.list.save())) {
      savedState[this.order.getNode(bunchID)!.lexPrefix()] = values;
    }
    return savedState;
  }

  /**
   * Loads a saved state returned by another LexList's `save()` method.
   *
   * Loading sets our (LexPosition -> value) map to match the saved LexList's, *overwriting*
   * our current state.
   *
   * Unlike with List.load, you do not need to deliver metadata to `this.order`
   * beforehand.
   */
  load(savedState: LexListSavedState<T>): void {
    // OPT: loop over nodes directly, to avoid double-object.
    const listSavedState: LexListSavedState<T> = {};
    for (const [bunchPrefix, values] of Object.entries(savedState)) {
      this.order.receive(LexUtils.splitBunchPrefix(bunchPrefix));
      listSavedState[LexUtils.bunchIDFor(bunchPrefix)] = values;
    }
    this.list.load(listSavedState);
  }
}
