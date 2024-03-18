import { SparseString } from "sparse-array-rled";
import { BunchMeta } from "./bunch";
import { ItemList, SparseItemsFactory } from "./internal/item_list";
import { normalizeSliceRange } from "./internal/util";
import { Order } from "./order";
import { Position } from "./position";

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
 * See Text.save and Text.load.
 *
 * ### Format
 *
 * For advanced usage, you may read and write TextSavedStates directly.
 *
 * The format is: For each [bunch](https://github.com/mweidner037/list-positions#bunches)
 * with Positions present in the Text, map the bunch's ID to a sparse string
 * representing the map
 * ```
 * innerIndex -> (char at Position { bunchID, innerIndex }).
 * ```
 * bunchID keys are in no particular order.
 *
 * Each sparse string of type `(string | number)[]` alternates between "runs" of present and deleted
 * values. Each even index is a string of concatenated present chars; each odd
 * index is a count of deleted values.
 * E.g. `["ab", 3, "c"]` means `["a", "b", null, null, null, "c"]`.
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
   * Multiple Lists/Outlines/Texts/LexLists can share an Order; they then automatically
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
   * items (as defined by Text.items).
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
   * @see {@link Order.startPosToArray}
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
   * @see {@link Order.startPosToArray}
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
    const toDelete = new Array<Position>(count);
    for (let i = 0; i < count; i++) {
      toDelete[i] = this.positionAt(index + i);
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
   * @returns [insertion Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * @throws If prevPos is Order.MAX_POSITION.
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
   * @throws If prevPos is Order.MAX_POSITION.
   * @throws If no chars are provided.
   * @see {@link Order.startPosToArray} To convert (startPos, chars.length) to an array of Positions.
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
   * @returns [insertion Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append, unless this list's current last Position is Order.MAX_POSITION.
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
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append, unless this list's current last Position is Order.MAX_POSITION.
   * @throws If no chars are provided.
   * @see {@link Order.startPosToArray} To convert (startPos, chars.length) to an array of Positions.
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
   * Returns the cursor at `index` within the list, i.e., between the positions at `index - 1` and `index`.
   * See [Cursors](https://github.com/mweidner037/list-positions#cursors).
   *
   * Invert with indexOfCursor, possibly on a different List/Text/Outline/LexList or a different device.
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
   * an alternative in-order save format (see List.fromItems).
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
   * Returns a saved state for this List.
   *
   * The saved state describes our current (Position -> char) map in JSON-serializable form.
   * You can load this state on another List by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   */
  save(): TextSavedState {
    return this.itemList.save();
  }

  /**
   * Loads a saved state returned by another List's `save()` method.
   *
   * Loading sets our (Position -> char) map to match the saved List's, *overwriting*
   * our current state.
   *
   * **Before loading a saved state, you must deliver its dependent metadata
   * to this.order**. For example, you could save and load the Order's state
   * alongside the List's state, making sure to load the Order first.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#save-load) for an example.
   */
  load(savedState: TextSavedState): void {
    this.itemList.load(savedState);
  }
}
