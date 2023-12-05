import { ItemList } from "./internal/item_list";
import { ArrayItemManager, SparseItems } from "./internal/sparse_items";
import { OrderNode } from "./node";
import { Order } from "./order";
import { Position } from "./position";

/**
 * TODO: Explain format (double-map to alternating present values, deleted
 * counts, starting with present (maybe [])). JSON ordering guarantees.
 */
export type ListSavedState<T> = {
  [nodeID: string]: (T[] | number)[];
};

function cloneItems<T>(items: SparseItems<T[]>): SparseItems<T[]> {
  // Defensive deep copy
  const copy = new Array<T[] | number>(items.length);
  for (let i = 0; i < items.length; i++) {
    if (i % 2 === 0) copy[i] = (items[i] as T[]).slice();
    else copy[i] = items[i];
  }
  return copy;
}

/**
 * A local (non-collaborative) data structure mapping [[Position]]s to
 * values, in list order.
 *
 * You can use a LocalList to maintain a sorted, indexable view of a
 * [[CValueList]], [[CList]], or [[CText]]'s values.
 * For example, when using a [[CList]],
 * you could store its archived values in a LocalList.
 * That would let you iterate over the archived values in list order.
 *
 * To construct a LocalList that uses an existing list's positions, pass
 * that list's `totalOrder` to our constructor.
 *
 * It is *not* safe to modify a LocalList while iterating over it. The iterator
 * will attempt to throw an exception if it detects such modification,
 * but this is not guaranteed.
 *
 * @typeParam T The value type.
 */
export class List<T> {
  readonly order: Order;
  private readonly itemList: ItemList<T[], T>;

  /**
   * Constructs a LocalList whose allowed [[Position]]s are given by
   * `source`.
   *
   * Using positions that were not generated by `source` (or a replica of
   * `source`) will cause undefined behavior.
   *
   * @param order The source for positions that may be used with this
   * LocalList.
   */
  constructor(order?: Order) {
    this.order = order ?? new Order();
    this.itemList = new ItemList(this.order, new ArrayItemManager());
  }

  /**
   *
   * @param entries Don't need to be in list order.
   * @param order Mandatory to remind you to load its NodeMetas first.
   * @returns
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
   * Sets the value at `pos`.
   *
   * @throws TODO pos invalid
   */
  set(pos: Position, value: T): void;
  /**
   * TODO
   *
   * If multiple values are given, they are set starting at startPos
   * in the same OrderNode. Note these might not be contiguous anymore,
   * unless they are new (no causally-future Positions set yet).
   * @param startPos
   * @param sameNodeValues
   */
  set(startPos: Position, ...sameNodeValues: T[]): void;
  set(startPos: Position, ...values: T[]): void {
    // TODO: return existing.save()? Likewise in delete, setAt?, deleteAt?
    this.itemList.set(startPos, values);
  }

  /**
   * Sets the value at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  setAt(index: number, value: T): void {
    this.set(this.positionAt(index), value);
  }

  /**
   * Deletes the given position, making it no longer
   * present in this list.
   *
   * @returns Whether the position was actually deleted, i.e.,
   * it was initially present.
   */
  delete(pos: Position): void;
  delete(startPos: Position, sameNodeCount?: number): void;
  delete(startPos: Position, count = 1): void {
    this.itemList.delete(startPos, count);
  }

  /**
   * Deletes `count` values starting at `index`.
   *
   * @throws If index...index+count-1 are not in `[0, this.length)`.
   */
  deleteAt(index: number, count = 1): void {
    const toDelete = new Array<Position>(count);
    for (let i = 0; i < count; i++) {
      toDelete[i] = this.positionAt(index + i);
    }
    for (const pos of toDelete) this.itemList.delete(pos, 1);
  }

  /**
   * Deletes every value in the list.
   *
   * The Order is unaffected (retains all Nodes).
   */
  clear() {
    this.itemList.clear();
  }

  insert(
    prevPos: Position,
    value: T
  ): [pos: Position, createdNode: OrderNode | null];
  /**
   *
   * @param prevPos
   * @param values
   * @returns [ first value's new position, createdNode if created by Order ].
   * If values.length > 1, their positions start at pos using the same OrderNode
   * with increasing valueIndex.
   * @throws If prevPos is order.maxPosition.
   * @throws If values.length = 0 (doesn't know what to return)
   */
  insert(
    prevPos: Position,
    ...values: T[]
  ): [startPos: Position, createdNode: OrderNode | null];
  insert(
    prevPos: Position,
    ...values: T[]
  ): [startPos: Position, createdNode: OrderNode | null] {
    return this.itemList.insert(prevPos, values);
  }

  /**
   *
   * @param index
   * @param values
   * @returns
   * @throws If index is this.length and our last value is at order.maxPosition.
   */
  insertAt(
    index: number,
    value: T
  ): [pos: Position, createdNode: OrderNode | null];
  insertAt(
    index: number,
    ...values: T[]
  ): [startPos: Position, createdNode: OrderNode | null];
  insertAt(
    index: number,
    ...values: T[]
  ): [startPos: Position, createdNode: OrderNode | null] {
    return this.itemList.insertAt(index, values);
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the value at position, or undefined if it is not currently present.
   */
  get(pos: Position): T | undefined {
    return this.itemList.get(pos);
  }

  /**
   * Returns the value currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   * Note that this differs from an ordinary Array,
   * which would instead return undefined.
   */
  getAt(index: number): T {
    return this.itemList.getAt(index);
  }

  /**
   * Returns whether position is currently present in the list,
   * i.e., its value is present.
   */
  has(pos: Position): boolean {
    return this.itemList.has(pos);
  }

  /**
   * Returns the current index of position.
   *
   * If position is not currently present in the list,
   * then the result depends on searchDir:
   * - "none" (default): Returns -1.
   * - "left": Returns the next index to the left of position.
   * If there are no values to the left of position,
   * returns -1.
   * - "right": Returns the next index to the right of position.
   * If there are no values to the right of position,
   * returns [[length]].
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
   * Won't return minPosition or maxPosition. TODO: actually, will if they're
   * part of the list - check that code is compatible.
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
   * Returns the cursor at `index` within the list.
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * Internally, a cursor is the Position of the list element to its left
   * (or `MIN_POSITION` for the start of the list).
   * If that position becomes not present in the list, the cursor stays the
   * same, but its index moves left.
   *
   * Invert with indexOfCursor.
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
   * Args as in Array.slice.
   */
  *values(start?: number, end?: number): IterableIterator<T> {
    for (const [, value] of this.entries(start, end)) yield value;
  }

  /**
   * Returns a copy of a section of this list, as an array.
   *
   * Args as in Array.slice.
   */
  slice(start?: number, end?: number): T[] {
    return [...this.values(start, end)];
  }

  /**
   * Returns an iterator for present positions, in list order.
   *
   * Args as in Array.slice.
   */
  *positions(start?: number, end?: number): IterableIterator<Position> {
    for (const [pos] of this.entries(start, end)) yield pos;
  }

  /**
   * Returns an iterator of [pos, value] tuples for every
   * value in the list, in list order.
   *
   * Args as in Array.slice.
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
   * Returns saved state describing the current state of this LocalList,
   * including its values.
   *
   * The saved state may later be passed to [[load]]
   * on a new instance of LocalList, to reconstruct the
   * same list state.
   *
   * Only saves values, not Order. "Natural" format; order
   * guarantees.
   */
  save(): ListSavedState<T> {
    return this.itemList.save(cloneItems);
  }

  /**
   * Loads saved state. The saved state must be from
   * a call to [[save]] on a LocalList whose `source`
   * constructor argument was a replica of this's
   * `source`, so that we can understand the
   * saved state's Positions.
   *
   * Overwrites whole state - not state-based merge.
   *
   * Need to load NodeMeta meta into Order first (not part of saved state).
   *
   * @param savedState Saved state from a List's
   * [[save]] call.
   */
  load(savedState: ListSavedState<T>): void {
    this.itemList.load(savedState, cloneItems);
  }
}
