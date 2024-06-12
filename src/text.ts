import { SparseString } from "sparse-array-rled";
import { BunchMeta } from "./bunch";
import { ItemList, SparseItemsFactory } from "./internal/item_list";
import { normalizeSliceRange } from "./internal/util";
import { Order } from "./order";
import { Position } from "./position";
import { OutlineSavedState, Outline } from "./outline";

const sparseStringFactory: SparseItemsFactory<string, SparseString> = {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  new: SparseString.new,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  deserialize: SparseString.deserialize,
  length(item) {
    return item.length;
  },
  slice(item, start, end) {
    return item.slice(start, end);
  },
} as const;

function checkChar(char: string): void {
  if (char.length !== 1) {
    throw new Error(`Values must be single chars, not "${char}"`);
  }
}

/**
 * A JSON-serializable saved state for a `Text`.
 *
 * See {@link Text.save} and {@link Text.load}.
 *
 * ## Format
 *
 * For advanced usage, you may read and write TextSavedStates directly.
 *
 * The format is: For each [bunch](https://github.com/mweidner037/list-positions#bunches)
 * with Positions present in the Text, map its bunchID to a serialized form of
 * the sparse string
 * ```
 * innerIndex -> (char at Position { bunchID, innerIndex })
 * ```
 * The bunches are in no particular order.
 *
 * ### Per-Bunch Format
 *
 * Each bunch's serialized sparse string (type `(string | number)[]`)
 * uses a compact JSON representation with run-length encoded deletions, identical to `SerializedSparseString` from the
 * [sparse-array-rled](https://github.com/mweidner037/sparse-array-rled#readme) package.
 * It alternates between:
 * - strings of concatenated present chars (even indices), and
 * - numbers (odd indices), representing that number of deleted values.
 *
 * For example, the sparse string `["a", "b", , , , "f", "g"]` serializes to `["ab", 3, "fg"]`.
 *
 * Trivial entries (empty strings, 0s, & trailing deletions) are always omitted,
 * except that the 0th entry may be an empty string.
 * For example, the sparse string `[, , "x", "y"]` serializes to `["", 2, "xy"]`.
 */
export type TextSavedState = {
  [bunchID: string]: (string | number)[];
};

/**
 * A list of characters, represented as an ordered map with Position keys.
 *
 * See [List, Position, and Order](https://github.com/mweidner037/list-positions#list-position-and-order) in the readme.
 *
 * Text is functionally equivalent to `List<string>` with single-char values,
 * but it uses strings internally and in bulk methods, instead of arrays
 * of single chars. This reduces memory usage and the size of saved states.
 *
 * Technically, Text is a sequence of UTF-16 code units, like an ordinary JavaScript
 * string ([MDN reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String#utf-16_characters_unicode_code_points_and_grapheme_clusters)).
 */
export class Text {
  /**
   * The Order that manages this list's Positions and their metadata.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#managing-metadata).
   */
  readonly order: Order;
  private readonly itemList: ItemList<string, SparseString>;

  /**
   * Constructs a Text, initially empty.
   *
   * @param order The Order to use for `this.order`.
   * Multiple Lists/Texts/Outlines/AbsLists can share an Order; they then automatically
   * share metadata. If not provided, a `new Order()` is used.
   *
   * @see {@link Text.fromEntries} To construct a Text from an initial set of entries.
   */
  constructor(order?: Order) {
    this.order = order ?? new Order();
    this.itemList = new ItemList(this.order, sparseStringFactory);
  }

  /**
   * Returns a new Text using the given Order and with the given
   * ordered-map entries.
   *
   * Like when loading a saved state, you must deliver all of the Positions'
   * dependent metadata to `order` before calling this method.
   */
  static fromEntries(
    entries: Iterable<[pos: Position, char: string]>,
    order: Order
  ): Text {
    const text = new Text(order);
    for (const [pos, char] of entries) {
      checkChar(char);
      text.set(pos, char);
    }
    return text;
  }

  /**
   * Returns a new Text using the given Order and with the given
   * items (as defined by {@link Text.items}).
   *
   * Like when loading a saved state, you must deliver all of the Positions'
   * dependent metadata to `order` before calling this method.
   */
  static fromItems(
    items: Iterable<[startPos: Position, chars: string]>,
    order: Order
  ): Text {
    const text = new Text(order);
    for (const [startPos, chars] of items) {
      text.set(startPos, chars);
    }
    return text;
  }

  // ----------
  // Mutators
  // ----------

  /**
   * Sets the char at the given position.
   *
   * If the position is already present, its char is overwritten.
   * Otherwise, later chars in the list shift right
   * (increment their index).
   */
  set(pos: Position, char: string): void;
  /**
   * Sets the chars at a sequence of Positions within the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   *
   * The Positions start at `startPos` and have the same `bunchID` but increasing `innerIndex`.
   * Note that these Positions might not be contiguous anymore, if later
   * Positions were created between them.
   *
   * @see {@link expandPositions}
   */
  set(startPos: Position, chars: string): void;
  set(startPos: Position, chars: string): void {
    this.itemList.set(startPos, chars);
  }

  /**
   * Sets the char at the given index (equivalently, at Position `this.positionAt(index)`),
   * overwriting the existing char.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  setAt(index: number, char: string): void {
    checkChar(char);
    this.set(this.positionAt(index), char);
  }

  /**
   * Deletes the given position, making it and its char no longer present in the list.
   *
   * If the position was indeed present, later chars in the list shift left (decrement their index).
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
   * Deletes `count` chars starting at `index`.
   *
   * @throws If any of `index`, ..., `index + count - 1` are not in `[0, this.length)`.
   */
  deleteAt(index: number, count = 1): void {
    const toDelete: Position[] = [];
    for (let i = 0; i < count; i++) {
      toDelete.push(this.positionAt(index + i));
    }
    for (const pos of toDelete) this.itemList.delete(pos, 1);
  }

  /**
   * Deletes every char in the list, making it empty.
   *
   * `this.order` is unaffected (retains all metadata).
   */
  clear() {
    this.itemList.clear();
  }

  /**
   * Inserts the given char just after prevPos, at a new Position.

   * Later chars in the list shift right
   * (increment their index).
   * 
   * In a collaborative setting, the new Position is *globally unique*, even
   * if other users call `List.insert` (or similar methods) concurrently.
   * 
   * @returns [new Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * @throws If prevPos is MAX_POSITION.
   */
  insert(
    prevPos: Position,
    char: string
  ): [pos: Position, newMeta: BunchMeta | null];
  /**
   * Inserts the given chars just after prevPos, at a series of new Positions.
   *
   * The new Positions all use the same [bunch](https://github.com/mweidner037/list-positions#bunches), with sequential
   * `innerIndex` (starting at the returned startPos).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new Positions are created between them.
   *
   * @returns [starting Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * Use {@link expandPositions} to convert (startPos, chars.length) to an array of Positions.
   * @throws If prevPos is MAX_POSITION.
   * @throws If no chars are provided.
   */
  insert(
    prevPos: Position,
    chars: string
  ): [startPos: Position, newMeta: BunchMeta | null];
  insert(
    prevPos: Position,
    chars: string
  ): [startPos: Position, newMeta: BunchMeta | null] {
    return this.itemList.insert(prevPos, chars);
  }

  /**
   * Inserts the given char at `index` (i.e., between the chars at `index - 1` and `index`), at a new Position.
   *
   * Later chars in the list shift right
   * (increment their index).
   *
   * In a collaborative setting, the new Position is *globally unique*, even
   * if other users call `List.insertAt` (or similar methods) concurrently.
   *
   * @returns [new Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append.
   */
  insertAt(
    index: number,
    char: string
  ): [pos: Position, newMeta: BunchMeta | null];
  /**
   * Inserts the given chars at `index` (i.e., between the chars at `index - 1` and `index`), at a series of new Positions.
   *
   * The new Positions all use the same [bunch](https://github.com/mweidner037/list-positions#bunches), with sequential
   * `innerIndex` (starting at the returned startPos).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new Positions are created between them.
   *
   * @returns [starting Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * Use {@link expandPositions} to convert (startPos, chars.length) to an array of Positions.
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append.
   * @throws If no chars are provided.
   */
  insertAt(
    index: number,
    chars: string
  ): [startPos: Position, newMeta: BunchMeta | null];
  insertAt(
    index: number,
    chars: string
  ): [startPos: Position, newMeta: BunchMeta | null] {
    return this.itemList.insertAt(index, chars);
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the char at the given position, or undefined if it is not currently present.
   */
  get(pos: Position): string | undefined {
    const located = this.itemList.getItem(pos);
    if (located === null) return undefined;
    const [item, offset] = located;
    return item[offset];
  }

  /**
   * Returns the char currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  getAt(index: number): string {
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
   * If there are no chars to the left of pos,
   * returns -1.
   * - "right": Returns the next index to the right of pos.
   * If there are no chars to the right of pos,
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
   * Returns the cursor at `index` within the list, i.e., in the gap between the positions at `index - 1` and `index`.
   * See [Cursors](https://github.com/mweidner037/list-positions#cursors).
   *
   * Invert with {@link indexOfCursor}, possibly on a different List/Text/Outline/AbsList or a different device.
   *
   * @param bind Whether to bind to the left or the right side of the gap, in case positions
   * later appear between `index - 1` and `index`. Default: `"left"`, which is typical for text cursors.
   * @throws If index is not in the range `[0, list.length]`.
   */
  cursorAt(index: number, bind?: "left" | "right"): Position {
    return this.itemList.cursorAt(index, bind);
  }

  /**
   * Returns the current index of `cursor` within the list.
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * Inverts {@link cursorAt}.
   *
   * @param bind The `bind` value that was used with {@link cursorAt}, if any.
   */
  indexOfCursor(cursor: Position, bind?: "left" | "right"): number {
    return this.itemList.indexOfCursor(cursor, bind);
  }

  // ----------
  // Iterators
  // ----------

  /** Iterates over chars in the list, in list order. */
  [Symbol.iterator](): IterableIterator<string> {
    return this.values();
  }

  /**
   * Iterates over chars in the list, in list order.
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  *values(start?: number, end?: number): IterableIterator<string> {
    for (const [, item] of this.itemList.items(start, end)) yield* item;
  }

  /**
   * Returns a copy of a section of this list, as a string.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  slice(start?: number, end?: number): string {
    [start, end] = normalizeSliceRange(this.length, start, end);
    let ans = "";
    for (const [, chars] of this.itemList.items(start, end)) {
      ans += chars;
    }
    return ans;
  }

  /**
   * Returns the current text as a literal string.
   */
  toString(): string {
    return this.slice();
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
   * Iterates over [pos, char] pairs in the list, in list order. These are its entries as an ordered map.
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  *entries(
    start?: number,
    end?: number
  ): IterableIterator<[pos: Position, char: string]> {
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
   * Specifically, for an item [startPos, chars], the positions start at `startPos`
   * and have the same `bunchID` but increasing `innerIndex`.
   *
   * You can use this method as an optimized version of other iterators, or as
   * an alternative save format that is in list order (see {@link Text.fromItems}).
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  items(
    start?: number,
    end?: number
  ): IterableIterator<[startPos: Position, chars: string]> {
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
   * Returns a saved state for this Text.
   *
   * The saved state describes our current (Position -> char) map in JSON-serializable form.
   * You can load this state on another Text by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   */
  save(): TextSavedState {
    return this.itemList.save();
  }

  /**
   * Loads a saved state returned by another Text's `save()` method.
   *
   * Loading sets our (Position -> char) map to match the saved Text's, *overwriting*
   * our current state.
   *
   * **Before loading a saved state, you must deliver its dependent metadata
   * to this.order**. For example, you could save and load the Order's state
   * alongside the Text's state, making sure to load the Order first.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#save-load) for an example
   * with List (Text is analogous).
   */
  load(savedState: TextSavedState): void {
    this.itemList.load(savedState);
  }

  /**
   * Returns a saved state for this Text's *positions*, independent of its values.
   *
   * `saveOutline` and `loadOutline` let you save a Text's chars (values) as an ordinary string,
   * separate from the list-positions info. That is useful for storing the string in a transparent
   * format (e.g., to allow full-text searches) and for migrating data between List/Text/Outline.
   *
   * Specifically, this method returns a saved state for an {@link Outline} with the same Positions as this Text.
   * You can load the state on another Text by calling `loadOutline(savedState, this.slice())`,
   * possibly in a different session or on a different device.
   * You can also load the state with `Outline.load` or `List.loadOutline`.
   */
  saveOutline(): OutlineSavedState {
    return this.itemList.saveOutline();
  }

  /**
   * Loads a saved state returned by another Text's `saveOutline()` method
   * or by an Outline's `save()` method.
   *
   * Loading sets our (Position -> char) map so that:
   * - its keys are the saved state's set of Positions, and
   * - its chars are the given `chars`, in list order.
   *
   * **Before loading a saved state, you must deliver its dependent metadata
   * to this.order**. For example, you could save and load the Order's state
   * alongside the Text's state, making sure to load the Order first.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#save-load) for an example
   * with List (Text is analogous).
   *
   * @throws If the saved state's length does not match `chars.length`.
   */
  loadOutline(savedState: OutlineSavedState, chars: string): void {
    const outline = new Outline(this.order);
    outline.load(savedState);

    if (outline.length !== chars.length) {
      throw new Error(
        `Outline length (${outline.length}) does not match chars.length (${chars.length})`
      );
    }

    // Here we rely on the fact that outline.items() is in list order.
    let index = 0;
    for (const [startPos, count] of outline.items()) {
      this.itemList.set(startPos, chars.slice(index, index + count));
      index += count;
    }
  }
}
