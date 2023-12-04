import { LexUtils } from "./lex_utils";
import { List } from "./list";
import { Order } from "./order";
import { LexPosition, Position } from "./position";

export type LexListSavedState<T> = {
  [nodePrefix: string]: (T[] | number)[];
};

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
export class LexList<T> {
  readonly order: Order;
  readonly list: List<T>;

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
    this.list = new List(order);
    this.order = this.list.order;
  }

  /**
   *
   * @param entries Don't need to be in list order.
   * @param order
   * @returns
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
   * Sets the value at `pos`.
   *
   * @throws TODO pos invalid
   */
  set(lexPos: LexPosition, value: T): void {
    this.list.set(this.order.unlex(lexPos), value);
  }

  /**
   * Sets the value at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  setAt(index: number, value: T): void {
    this.list.setAt(index, value);
  }

  /**
   * Deletes the given position, making it no longer
   * present in this list.
   *
   * @returns Whether the position was actually deleted, i.e.,
   * it was initially present.
   */
  delete(lexPos: LexPosition): void {
    this.list.delete(this.order.unlex(lexPos));
  }

  /**
   * Deletes `count` values starting at `index`.
   *
   * @throws If index...index+count-1 are not in `[0, this.length)`.
   */
  deleteAt(index: number, count = 1): void {
    this.list.deleteAt(index, count);
  }

  /**
   * Deletes every value in the list.
   *
   * The Order is unaffected (retains all Nodes).
   */
  clear() {
    this.list.clear();
  }

  /**
   *
   * @param prevPos
   * @param values
   * @returns Array of created LexPositions.
   * @throws If prevPos is order.maxPosition.
   * @throws If values.length = 0 (doesn't know what to return)
   */
  insert(prevLexPos: LexPosition, ...values: T[]): LexPosition[] {
    const [startPos] = this.list.insert(
      this.order.unlex(prevLexPos),
      ...values
    );
    return this.lexAll(startPos, values.length);
  }

  /**
   *
   * @param index
   * @param values
   * @returns
   * @throws If index is this.length and our last value is at order.maxPosition.
   * @throws If item.length = 0 (doesn't know what to return)
   */
  insertAt(index: number, ...values: T[]): LexPosition[] {
    const [startPos] = this.list.insertAt(index, ...values);
    return this.lexAll(startPos, values.length);
  }

  private lexAll(startPos: Position, count: number): LexPosition[] {
    // TODO: Use nodeSummary as opt over calling order.lex on each Position.
    // const nodeSummary = this.order.summary(this.order.getNodeFor(startPos));
    // const lexPositions = new Array<LexPosition>(count);
    // for (let i = 0; i < count; i++) {
    //   lexPositions[i] = LexUtils.fromSummary(
    //     nodeSummary,
    //     startPos.valueIndex + i
    //   );
    // }
    // return lexPositions;

    const lexPositions = new Array<LexPosition>(count);
    for (let i = 0; i < count; i++) {
      lexPositions[i] = this.order.lex({
        nodeID: startPos.nodeID,
        valueIndex: startPos.valueIndex + i,
      });
    }
    return lexPositions;
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the value at position, or undefined if it is not currently present
   * ([[hasPosition]] returns false).
   */
  get(lexPos: LexPosition): T | undefined {
    return this.list.get(this.order.unlex(lexPos));
  }

  /**
   * Returns the value currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   * Note that this differs from an ordinary Array,
   * which would instead return undefined.
   */
  getAt(index: number): T {
    return this.list.getAt(index);
  }

  /**
   * Returns whether position is currently present in the list,
   * i.e., its value is present.
   */
  has(lexPos: LexPosition): boolean {
    return this.list.has(this.order.unlex(lexPos));
  }

  /**
   * Returns the current index of position.
   *
   * If position is not currently present in the list
   * ([[hasPosition]] returns false), then the result depends on searchDir:
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
    lexPos: LexPosition,
    searchDir: "none" | "left" | "right" = "none"
  ): number {
    return this.list.indexOfPosition(this.order.unlex(lexPos), searchDir);
  }

  /**
   * Returns the position currently at index.
   *
   * Won't return minPosition or maxPosition. TODO: actually, will if they're
   * part of the list - check that code is compatible.
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
   * Returns the cursor at `index` within the list.
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * Internally, a cursor is the Position of the list element to its left
   * (or `MIN_LEX_POSITION` for the start of the list).
   * If that position becomes not present in the list, the cursor stays the
   * same, but its index moves left.
   *
   * Invert with indexOfCursor.
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
   * Args as in Array.slice.
   */
  values(start?: number, end?: number): IterableIterator<T> {
    return this.list.values(start, end);
  }

  /**
   * Returns a copy of a section of this list, as an array.
   *
   * Args as in Array.slice.
   */
  slice(start?: number, end?: number): T[] {
    return this.list.slice(start, end);
  }

  /**
   * Returns an iterator for present positions, in list order.
   *
   * Args as in Array.slice.
   */
  *positions(start?: number, end?: number): IterableIterator<LexPosition> {
    for (const pos of this.list.positions(start, end))
      yield this.order.lex(pos);
  }

  /**
   * Returns an iterator of [pos, value] tuples for every
   * value in the list, in list order.
   *
   * Args as in Array.slice.
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
   * Same idea as [...entries()], but optimized rep.
   */
  save(): LexListSavedState<T> {
    // OPT: loop over nodes directly, to avoid double-object.
    const savedState: LexListSavedState<T> = {};
    for (const [nodeID, values] of Object.entries(this.list.save())) {
      savedState[this.order.getNode(nodeID)!.lexPrefix()] = values;
    }
    return savedState;
  }

  load(savedState: LexListSavedState<T>): void {
    // OPT: loop over nodes directly, to avoid double-object.
    const listSavedState: LexListSavedState<T> = {};
    for (const [nodePrefix, values] of Object.entries(savedState)) {
      // TODO: skip checking nodePrefix validity, for efficiency - like in unlex?
      this.order.receive(LexUtils.splitNodePrefix(nodePrefix));
      listSavedState[LexUtils.nodeIDFor(nodePrefix)] = values;
    }
    this.list.load(listSavedState);
  }
}
