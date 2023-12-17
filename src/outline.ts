import { BunchMeta } from "./bunch";
import { ItemList } from "./internal/item_list";
import { numberItemManager } from "./internal/sparse_items";
import { Order } from "./order";
import { Position } from "./position";

/**
 * A JSON-serializable saved state for an Outline.
 *
 * See Outline.save and Outline.load.
 *
 * ### Format
 *
 * For advanced usage, you may read and write OutlineSavedStates directly.
 *
 * The format is: For each [bunch](https://github.com/mweidner037/list-positions#bunches)
 * with Positions present in the Outline, map the bunch's ID to a sparse array
 * representing the map
 * ```
 * innerIndex -> (true if Position { bunchID, innerIndex } is present).
 * ```
 * bunchID keys are in no particular order.
 *
 * Each sparse array of type `number[]` alternates between "runs" of present and deleted
 * values. Each even index is a count of present values; each odd
 * index is a count of deleted values.
 * E.g. `[2, 3, 1]` means `[true, true, null, null, null, true]`.
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
  private readonly itemList: ItemList<number, true>;

  /**
   * Constructs an Outline, initially empty.
   *
   * @param order The Order to use for `this.order`.
   * Multiple Lists/Outlines/LexLists can share an Order; they then automatically
   * share metadata. If not provided, a `new Order()` is used.
   *
   * @see Outline.from To construct an Outline from an initial set of Positions.
   */
  constructor(order?: Order) {
    this.order = order ?? new Order();
    this.itemList = new ItemList(this.order, numberItemManager);
  }

  /**
   * Returns a new Outline using the given Order and with the given set of Positions.
   *
   * Like when loading a saved state, you must deliver all of the Positions'
   * dependent metadata to `order` before calling this method.
   */
  static from(positions: Iterable<Position>, order: Order): Outline {
    const outline = new Outline(order);
    for (const pos of positions) {
      outline.add(pos);
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
   * @see Order.startPosToArray
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
   * @see Order.startPosToArray
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
    const toDelete = new Array<Position>(count);
    for (let i = 0; i < count; i++) {
      toDelete[i] = this.positionAt(index + i);
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
   * @returns [insertion Position, [created bunch's](https://github.com/mweidner037/list-positions#createdBunch) BunchMeta (or null)].
   * @throws If prevPos is Order.MAX_POSITION.
   */
  insert(prevPos: Position): [pos: Position, createdBunch: BunchMeta | null];
  /**
   * Inserts `count` new Positions just after prevPos.
   *
   * The new Positions all use the same [bunch](https://github.com/mweidner037/list-positions#bunches), with sequential
   * `innerIndex` (starting at the returned startPos).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new Positions are created between them.
   *
   * @returns [starting Position, [created bunch's](https://github.com/mweidner037/list-positions#createdBunch) BunchMeta (or null)].
   * @throws If prevPos is Order.MAX_POSITION.
   * @throws If no values are provided.
   * @see Order.startPosToArray To convert (startPos, count) to an array of Positions.
   */
  insert(
    prevPos: Position,
    count?: number
  ): [startPos: Position, createdBunch: BunchMeta | null];
  insert(
    prevPos: Position,
    count = 1
  ): [startPos: Position, createdBunch: BunchMeta | null] {
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
   * @returns [insertion Position, [created bunch's](https://github.com/mweidner037/list-positions#createdBunch) BunchMeta (or null)].
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append, unless this list's current last Position is Order.MAX_POSITION.
   */
  insertAt(index: number): [pos: Position, createdBunch: BunchMeta | null];
  /**
   * Inserts `count` new Positions at `index` (i.e., between the values at `index - 1` and `index`).
   *
   * The new Positions all use the same [bunch](https://github.com/mweidner037/list-positions#bunches), with sequential
   * `innerIndex` (starting at the returned startPos).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new Positions are created between them.
   *
   * @returns [insertion Position, [created bunch's](https://github.com/mweidner037/list-positions#createdBunch) BunchMeta (or null)].
   * @throws If index is not in `[0, this.length]`. The index `this.length` is allowed and will cause an append, unless this list's current last Position is Order.MAX_POSITION.
   * @throws If count is 0.
   * @see Order.startPosToArray To convert (startPos, count) to an array of Positions.
   */
  insertAt(
    index: number,
    count?: number
  ): [startPos: Position, createdBunch: BunchMeta | null];
  insertAt(
    index: number,
    count = 1
  ): [startPos: Position, createdBunch: BunchMeta | null] {
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
   * Returns the cursor at `index` within the list, i.e., between the positions at `index - 1` and `index`.
   * See [Cursors](https://github.com/mweidner037/list-positions#cursors).
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

  /**
   * Returns an iterator for present positions, in list order.
   */
  [Symbol.iterator](): IterableIterator<Position> {
    return this.positions();
  }

  /**
   * Returns an iterator for present positions, in list order.
   *
   * Arguments are as in [Array.slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).
   */
  *positions(start?: number, end?: number): IterableIterator<Position> {
    for (const [pos] of this.itemList.entries(start, end)) yield pos;
  }

  // ----------
  // Save & Load
  // ----------

  /**
   * Returns a saved state for this Outline.
   *
   * The saved state describes our current set of Positions in JSON-serializable form.
   * You can load these Positions on another Outline by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   */
  save(): OutlineSavedState {
    return this.itemList.save(cloneItems);
  }

  /**
   * Loads a saved state returned by another Outline's `save()` method.
   *
   * Loading sets our set of Positions to match the saved Outline's, *overwriting*
   * our current state.
   *
   * **Before loading a saved state, you must deliver its dependent metadata
   * to this.Order**. For example, you could save and load the Order's state
   * alongside the Outline's state, making sure to load the Order first.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#save-load) for an example
   * with List (Outline is analogous).
   */
  load(savedState: OutlineSavedState): void {
    this.itemList.load(savedState, cloneItems);
  }
}

function cloneItems(items: number[]): number[] {
  // Defensive copy
  return items.slice();
}
