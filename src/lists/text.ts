import { SparseString } from "sparse-array-rled";
import { ItemList, SparseItemsFactory } from "../internal/item_list";
import { normalizeSliceRange } from "../internal/util";
import { BunchMeta } from "../order/bunch";
import { Order } from "../order/order";
import { Position } from "../order/position";
import { Outline, OutlineSavedState } from "./outline";

const sparseStringFactory: SparseItemsFactory<
  string | object,
  SparseString<object>
> = {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  new: SparseString.new,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  deserialize: SparseString.deserialize,
  length(item) {
    if (typeof item === "string") return item.length;
    else return 1;
  },
  slice(item, start, end) {
    if (typeof item === "string") return item.slice(start, end);
    else return item;
  },
} as const;

function checkCharOrEmbed<E extends object | never = never>(
  charOrEmbed: string | E
): void {
  if (typeof charOrEmbed === "string" && charOrEmbed.length !== 1) {
    throw new Error(`Values must be single chars, not "${charOrEmbed}"`);
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
 * innerIndex -> (char (or embed) at Position { bunchID, innerIndex })
 * ```
 * The bunches are in no particular order.
 *
 * ### Per-Bunch Format
 *
 * Each bunch's serialized sparse string (type `(string | E | number)[]`)
 * uses a compact JSON representation with run-length encoded deletions, identical to `SerializedSparseString<E>` from the
 * [sparse-array-rled](https://github.com/mweidner037/sparse-array-rled#readme) package.
 * It consists of:
 * - strings of concatenated present chars,
 * - embedded objects of type `E`, and
 * - numbers, representing that number of deleted indices.
 *
 * For example, the sparse string `["a", "b", , , , "f", "g"]` serializes to `["ab", 3, "fg"]`.
 *
 * As an example with an embed, the sparse string `["h", "i", " ", { type: "image", ... }, "!"]`
 * serializes to `["hi ", { type: "image", ... }, "!"]`.
 *
 * Trivial entries (empty strings, 0s, & trailing deletions) are always omitted.
 * For example, the sparse string `[, , "x", "y"]` serializes to `[2, "xy"]`.
 */
export type TextSavedState<E extends object | never = never> = {
  [bunchID: string]: (string | E | number)[];
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
 * The list may also contain embedded objects of type `E`.
 * Each embed takes the place of a single character. You can use embeds to represent
 * non-text content, like images and videos, that may appear inline in a text document.
 * If you do not specify the generic type `E`, it defaults to `never`, i.e., no embeds are allowed.
 *
 * Technically, Text is a sequence of UTF-16 code units, like an ordinary JavaScript
 * string ([MDN reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String#utf-16_characters_unicode_code_points_and_grapheme_clusters)).
 *
 * @typeParam E - The type of embeds, or `never` (no embeds allowed) if not specified.
 * Embeds must be non-null objects.
 */
export class Text<E extends object | never = never> {
  /**
   * The Order that manages this list's Positions and their metadata.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#managing-metadata).
   */
  readonly order: Order;
  private readonly itemList: ItemList<string | E, SparseString<E>>;

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
    this.itemList = new ItemList(
      this.order,
      sparseStringFactory as SparseItemsFactory<string | E, SparseString<E>>
    );
  }

  /**
   * Returns a new Text using the given Order and with the given
   * ordered-map entries.
   *
   * Like when loading a saved state, you must deliver all of the Positions'
   * dependent metadata to `order` before calling this method.
   */
  static fromEntries<E extends object | never = never>(
    entries: Iterable<[pos: Position, charOrEmbed: string | E]>,
    order: Order
  ): Text<E> {
    const text = new Text<E>(order);
    for (const [pos, charOrEmbed] of entries) {
      checkCharOrEmbed(charOrEmbed);
      text.set(pos, charOrEmbed);
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
  static fromItems<E extends object | never = never>(
    items: Iterable<[startPos: Position, charsOrEmbed: string | E]>,
    order: Order
  ): Text<E> {
    const text = new Text<E>(order);
    for (const [startPos, charsOrEmbed] of items) {
      text.set(startPos, charsOrEmbed);
    }
    return text;
  }

  // ----------
  // Mutators
  // ----------

  /**
   * Sets the char (or embed) at the given position.
   *
   * If the position is already present, its value is overwritten.
   * Otherwise, later values in the list shift right
   * (increment their index).
   */
  set(pos: Position, charOrEmbed: string | E): void;
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
  set(startPos: Position, charsOrEmbed: string | E): void {
    this.itemList.set(startPos, charsOrEmbed);
  }

  /**
   * Sets the char (or embed) at the given index (equivalently, at Position `this.positionAt(index)`),
   * overwriting the existing value.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  setAt(index: number, charOrEmbed: string | E): void {
    checkCharOrEmbed(charOrEmbed);
    this.set(this.positionAt(index), charOrEmbed);
  }

  /**
   * Deletes the given position, making it and its char (or embed) no longer present in the list.
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
    const toDelete: Position[] = [];
    for (let i = 0; i < count; i++) {
      toDelete.push(this.positionAt(index + i));
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
   * Inserts the given char (or embed) just after prevPos, at a new Position.

   * Later values in the list shift right
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
    charOrEmbed: string | E
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
    charsOrEmbed: string | E
  ): [startPos: Position, newMeta: BunchMeta | null] {
    return this.itemList.insert(prevPos, charsOrEmbed);
  }

  /**
   * Inserts the given char (or embed) at `index` (i.e., between the values at `index - 1` and `index`), at a new Position.
   *
   * Later values in the list shift right
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
    charOrEmbed: string | E
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
    charsOrEmbed: string
  ): [startPos: Position, newMeta: BunchMeta | null] {
    return this.itemList.insertAt(index, charsOrEmbed);
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the char (or embed) at the given position, or undefined if it is not currently present.
   */
  get(pos: Position): string | E | undefined {
    const located = this.itemList.getItem(pos);
    if (located === null) return undefined;
    const [item, offset] = located;
    if (typeof item === "string") return item[offset];
    else return item;
  }

  /**
   * Returns the char (or embed) currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  getAt(index: number): string | E {
    const [item, offset] = this.itemList.getItemAt(index);
    if (typeof item === "string") return item[offset];
    else return item;
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

  /** Iterates over chars (and embeds) in the list, in list order. */
  [Symbol.iterator](): IterableIterator<string | E> {
    return this.values();
  }

  /**
   * Iterates over chars (and embeds) in the list, in list order.
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  *values(start?: number, end?: number): IterableIterator<string | E> {
    for (const [, item] of this.itemList.items(start, end)) {
      if (typeof item === "string") yield* item;
      else yield item;
    }
  }

  /**
   * Returns a copy of a section of this list, as a string.
   *
   * If the section contains embeds, they are replaced with `\uFFFC`, the object
   * replacement character. Text editors might render this as a box containing "OBJ".
   * To preserve embeds, use {@link sliceWithEmbeds}.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  slice(start?: number, end?: number): string {
    [start, end] = normalizeSliceRange(this.length, start, end);
    let ans = "";
    for (const [, charsOrEmbed] of this.itemList.items(start, end)) {
      if (typeof charsOrEmbed === "string") ans += charsOrEmbed;
      else ans += "\uFFFC";
    }
    return ans;
  }

  /**
   * Returns a copy of a section of this list, as an array of strings and embeds.
   *
   * The string sections are separated by embeds.
   * For example, suppose `list` has char/embed values `["H", "i", " ", { type: "image", ... }, "!"]`.
   * Then `list.sliceWithEmbeds()` returns `["Hi ", { type: "image", ... }, "!"]`.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  sliceWithEmbeds(start?: number, end?: number): (string | E)[] {
    [start, end] = normalizeSliceRange(this.length, start, end);
    const ans: (string | E)[] = [];
    for (const [, charsOrEmbed] of this.itemList.items(start, end)) {
      if (
        ans.length !== 0 &&
        typeof charsOrEmbed === "string" &&
        typeof ans[ans.length - 1] === "string"
      ) {
        ans[ans.length - 1] += charsOrEmbed;
      } else ans.push(charsOrEmbed);
    }
    return ans;
  }

  /**
   * Returns the current text as a literal string.
   *
   * If the string contains embeds, they are replaced with `\uFFFC`, the object
   * replacement character. Text editors might render this as a box containing "OBJ".
   * To preserve embeds, use {@link sliceWithEmbeds}.
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
   * Iterates over [pos, char (or embed)] pairs in the list, in list order. These are its entries as an ordered map.
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  *entries(
    start?: number,
    end?: number
  ): IterableIterator<[pos: Position, charOrEmbed: string | E]> {
    for (const [
      { bunchID, innerIndex: startInnerIndex },
      item,
    ] of this.itemList.items(start, end)) {
      if (typeof item === "string") {
        for (let i = 0; i < item.length; i++) {
          yield [{ bunchID, innerIndex: startInnerIndex + i }, item[i]];
        }
      } else yield [{ bunchID, innerIndex: startInnerIndex }, item];
    }
  }

  /**
   * Iterates over items, in list order.
   *
   * Each *item* [startPos, charsOrEmbed] is either an individual embed at startPos,
   * or a series of characters that have contiguous positions
   * from the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   * Specifically, for a string-valued item [startPos, chars: string],
   * the individual chars' positions start at `startPos`
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
  ): IterableIterator<[startPos: Position, charsOrEmbed: string | E]> {
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
   * The saved state describes our current (Position -> char/embed) map in JSON-serializable form.
   * You can load this state on another Text by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   */
  save(): TextSavedState<E> {
    return this.itemList.save();
  }

  /**
   * Loads a saved state returned by another Text's `save()` method.
   *
   * Loading sets our (Position -> char/embed) map to match the saved Text's, *overwriting*
   * our current state.
   *
   * **Before loading a saved state, you must deliver its dependent metadata
   * to this.order**. For example, you could save and load the Order's state
   * alongside the Text's state, making sure to load the Order first.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#save-load) for an example
   * with List (Text is analogous).
   */
  load(savedState: TextSavedState<E>): void {
    this.itemList.load(savedState);
  }

  /**
   * Returns a saved state for this Text's *positions*, independent of its values.
   *
   * `saveOutline` and `loadOutline` let you save a Text's values (chars and embeds)
   * separately from the list-positions info. That is useful for storing the string in a transparent
   * format (e.g., to allow full-text searches) and for migrating data between List/Text/Outline.
   *
   * Specifically, this method returns a saved state for an {@link Outline} with the same Positions as this Text.
   * You can load the state on another Text by calling `loadOutline(savedState, this.sliceWithEmbeds())`,
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
   * Loading sets our (Position -> char/embed) map so that:
   * - its keys are the saved state's set of Positions, and
   * - its chars and embeds are given by `charsWithEmbeds`, in list order.
   * The `charsWithEmbeds` must use the same format as {@link sliceWithEmbeds}.
   *
   * **Before loading a saved state, you must deliver its dependent metadata
   * to this.order**. For example, you could save and load the Order's state
   * alongside the Text's state, making sure to load the Order first.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#save-load) for an example
   * with List (Text is analogous).
   *
   * @throws If the saved state's length does not match `chars.length`.
   */
  loadOutline(
    savedState: OutlineSavedState,
    charsWithEmbeds: (string | E)[]
  ): void {
    const outline = new Outline(this.order);
    outline.load(savedState);

    let index = 0;
    for (const charsOrEmbed of charsWithEmbeds) {
      if (typeof charsOrEmbed === "string") {
        let charsIndex = 0;
        for (const [startPos, count] of outline.items(
          index,
          index + charsOrEmbed.length
        )) {
          this.itemList.set(
            startPos,
            charsOrEmbed.slice(charsIndex, charsIndex + count)
          );
          charsIndex += count;
        }
        index += charsOrEmbed.length;
      } else {
        this.itemList.set(outline.positionAt(index), charsOrEmbed);
        index++;
      }
    }
  }
}
