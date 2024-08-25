import { SparseIndices } from "sparse-array-rled";
import { ItemList, SparseItemsFactory } from "../internal/item_list";
import { BunchMeta } from "../order/bunch";
import { Order } from "../order/order";
import { Position } from "../order/position";

const sparseIndicesFactory: SparseItemsFactory<number, SparseIndices> = {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  new: SparseIndices.new,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  deserialize: SparseIndices.deserialize,
  length(item) {
    return item;
  },
  slice(_item, start, end) {
    return end - start;
  },
} as const;

/**
 * A JSON-serializable saved state for an Outline.
 *
 * See {@link Outline.save} and {@link Outline.load}.
 *
 * ## Format
 *
 * For advanced usage, you may read and write OutlineSavedStates directly.
 *
 * The format is: For each [bunch](https://github.com/mweidner037/list-positions#bunches)
 * with Positions present in the Outline, map its bunchID to a serialized form of the sparse array
 * ```
 * innerIndex -> (true if Position { bunchID, innerIndex } is present)
 * ```
 * The bunches are in no particular order.
 *
 * ### Per-Bunch Format
 *
 * Each bunch's serialized sparse array (type `number[]`)
 * uses a compact JSON representation with run-length encoding, identical to `SerializedSparseIndices` from the
 * [sparse-array-rled](https://github.com/mweidner037/sparse-array-rled#readme) package.
 * It alternates between:
 * - counts of present values (even indices), and
 * - counts of deleted values (odd indices).
 *
 * For example, the sparse array `[true, true, , , , true, true]` serializes to `[2, 3, 2]`.
 *
 * Trivial entries (0s & trailing deletions) are always omitted,
 * except that the 0th entry may be 0.
 * For example, the sparse array `[, , true, true, true]` serializes to `[0, 2, 3]`.
 */
export type OutlineSavedState = {
  [bunchID: string]: number[];
};

/**
 * An outline for a list of values. It represents an ordered set of Positions. Unlike List,
 * it only tracks which Positions are present - not their associated values.
 *
 * See [Outline](https://github.com/mweidner037/list-positions#outline) in the readme.
 *
 * Outline's API is a hybrid between `Array<Position>` and `Set<Position>`.
 * Use `insertAt` or `insert` to insert new Positions into the list in the style of `Array.splice`.
 */
export class Outline {
  /**
   * The Order that manages this list's Positions and their metadata.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#managing-metadata).
   */
  readonly order: Order;
  private readonly itemList: ItemList<number, SparseIndices>;

  /**
   * Constructs an Outline, initially empty.
   *
   * @param order The Order to use for `this.order`.
   * Multiple Lists/Texts/Outlines/AbsLists can share an Order; they then automatically
   * share metadata. If not provided, a `new Order()` is used.
   *
   * @see {@link Outline.fromPositions} To construct an Outline from an initial set of Positions.
   */
  constructor(order?: Order) {
    this.order = order ?? new Order();
    this.itemList = new ItemList(this.order, sparseIndicesFactory);
  }

  /**
   * Returns a new Outline using the given Order and with the given set of Positions.
   *
   * Like when loading a saved state, you must deliver all of the Positions'
   * dependent metadata to `order` before calling this method.
   */
  static fromPositions(positions: Iterable<Position>, order: Order): Outline {
    const outline = new Outline(order);
    for (const pos of positions) {
      outline.add(pos);
    }
    return outline;
  }

  /**
   * Returns a new Outline using the given Order and with the given
   * items (as defined by {@link Outline.items}).
   *
   * Like when loading a saved state, you must deliver all of the Positions'
   * dependent metadata to `order` before calling this method.
   */
  static fromItems(
    items: Iterable<[startPos: Position, count: number]>,
    order: Order
  ): Outline {
    const outline = new Outline(order);
    for (const [startPos, count] of items) {
      outline.add(startPos, count);
    }
    return outline;
  }

  // ----------
  // Mutators
  // ----------

  /**
   * Adds the given Position.
   *
   * If the position is already present, nothing happens.
   * Otherwise, later positions in the list shift right
   * (increment their index).
   */
  add(pos: Position): void;
  /**
   * Adds a sequence of Positions within the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   *
   * The Positions start at `startPos` and have the same `bunchID` but increasing `innerIndex`.
   * Note that these Positions might not be contiguous anymore, if later
   * Positions were created between them.
   *
   * @see {@link expandPositions}
   */
  add(startPos: Position, sameBunchCount?: number): void;
  add(startPos: Position, count = 1): void {
    this.itemList.set(startPos, count);
  }

  /**
   * Deletes the given position, making it no longer present in the list.
   *
   * If the position was indeed present, later positions in the list shift left (decrement their index).
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
   * Deletes `count` positions starting at `index`.
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
   * Deletes every Position in the list, making it empty.
   *
   * `this.order` is unaffected (retains all metadata).
   */
  clear() {
    this.itemList.clear();
  }

  /**
   * Inserts a new Position just after prevPos.

   * Later positions in the list shift right
   * (increment their index).
   * 
   * In a collaborative setting, the new Position is *globally unique*, even
   * if other users call `Outline.insert` (or similar methods) concurrently.
   * 
   * @returns [new Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * @throws If prevPos is MAX_POSITION.
   */
  insert(prevPos: Position): [pos: Position, newMeta: BunchMeta | null];
  /**
   * Inserts `count` new Positions just after prevPos.
   *
   * The new Positions all use the same [bunch](https://github.com/mweidner037/list-positions#bunches), with sequential
   * `innerIndex` (starting at the returned startPos).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new Positions are created between them.
   *
   * @returns [starting Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * Use {@link expandPositions} to convert (startPos, count) to an array of Positions.
   * @throws If prevPos is MAX_POSITION.
   * @throws If no values are provided.
   */
  insert(
    prevPos: Position,
    count?: number
  ): [startPos: Position, newMeta: BunchMeta | null];
  insert(
    prevPos: Position,
    count = 1
  ): [startPos: Position, newMeta: BunchMeta | null] {
    return this.itemList.insert(prevPos, count);
  }

  /**
   * Inserts a new Position at `index` (i.e., between the positions at `index - 1` and `index`).
   *
   * Later positions in the list shift right
   * (increment their index).
   *
   * In a collaborative setting, the new Position is *globally unique*, even
   * if other users call `Outline.insertAt` (or similar methods) concurrently.
   *
   * @returns [new Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append.
   */
  insertAt(index: number): [pos: Position, newMeta: BunchMeta | null];
  /**
   * Inserts `count` new Positions at `index` (i.e., between the values at `index - 1` and `index`).
   *
   * The new Positions all use the same [bunch](https://github.com/mweidner037/list-positions#bunches), with sequential
   * `innerIndex` (starting at the returned startPos).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new Positions are created between them.
   *
   * @returns [starting Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * Use {@link expandPositions} to convert (startPos, count) to an array of Positions.
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append.
   * @throws If count is 0.
   */
  insertAt(
    index: number,
    count?: number
  ): [startPos: Position, newMeta: BunchMeta | null];
  insertAt(
    index: number,
    count = 1
  ): [startPos: Position, newMeta: BunchMeta | null] {
    return this.itemList.insertAt(index, count);
  }

  // ----------
  // Accessors
  // ----------

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

  /**
   * Iterates over present positions, in list order.
   */
  [Symbol.iterator](): IterableIterator<Position> {
    return this.positions();
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
    for (const [
      { bunchID, innerIndex: startInnerIndex },
      item,
    ] of this.itemList.items(start, end)) {
      for (let i = 0; i < item; i++) {
        yield { bunchID, innerIndex: startInnerIndex + i };
      }
    }
  }

  /**
   * Iterates over items, in list order.
   *
   * Each *item* is a series of entries that have contiguous positions
   * from the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   * Specifically, for an item [startPos, count], the positions start at `startPos`
   * and have the same `bunchID` but increasing `innerIndex`.
   *
   * You can use this method as an optimized version of other iterators, or as
   * an alternative save format that is in list order (see {@link Outline.fromItems}).
   *
   * Optionally, you may specify a range of indices `[start, end)` instead of
   * iterating the entire list.
   *
   * @throws If `start < 0`, `end > this.length`, or `start > end`.
   */
  items(
    start?: number,
    end?: number
  ): IterableIterator<[startPos: Position, count: number]> {
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
   * Returns a saved state for this Outline.
   *
   * The saved state describes our current set of Positions in JSON-serializable form.
   * You can load this state on another Outline by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   */
  save(): OutlineSavedState {
    return this.itemList.save();
  }

  /**
   * Loads a saved state returned by another Outline's `save()` method.
   *
   * Loading sets our set of Positions to match the saved Outline's, *overwriting*
   * our current state.
   *
   * **Before loading a saved state, you must deliver its dependent metadata
   * to this.order**. For example, you could save and load the Order's state
   * alongside the Outline's state, making sure to load the Order first.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#save-load) for an example
   * with List (Outline is analogous).
   */
  load(savedState: OutlineSavedState): void {
    this.itemList.load(savedState);
  }
}
