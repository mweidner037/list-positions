import { SerializedSparseArray, SparseArray } from "sparse-array-rled";
import { ListSavedState } from "../list";
import { Position } from "../position";

/**
 * A map from Positions to values of type `T`, **without ordering info**.
 *
 * This class is a simplified version of `List<T>` that does not consider the list order.
 * As a result, it does not require managing metadata, and it is slightly more efficient
 * than `List<T>`.
 *
 * For example, you can use a PositionMap to accumulate changes to save in a batch later.
 * There the list order is unnecessary and managing metadata could be inconvenient.
 *
 * @typeParam T The value type.
 */
export class PositionMap<T> {
  /**
   * The internal state of this PositionMap: A map from bunchID
   * to the [SparseArray](https://github.com/mweidner037/sparse-array-rled#readme)
   * of values for that bunch.
   *
   * You are free to manipulate this state directly.
   */
  readonly state: Map<string, SparseArray<T>>;

  constructor() {
    this.state = new Map();
  }

  // ----------
  // Mutators
  // ----------

  /**
   * Sets the value at the given position.
   */
  set(pos: Position, value: T): void;
  /**
   * Sets the values at a sequence of Positions within the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   *
   * The Positions start at `startPos` and have the same `bunchID` but increasing `innerIndex`.
   *
   * @see {@link expandPositions}
   */
  set(startPos: Position, ...sameBunchValues: T[]): void;
  set(startPos: Position, ...values: T[]): void {
    let arr = this.state.get(startPos.bunchID);
    if (arr === undefined) {
      arr = SparseArray.new();
      this.state.set(startPos.bunchID, arr);
    }
    arr.set(startPos.innerIndex, ...values);
  }

  /**
   * Deletes the given position, making it and its value no longer present in the map.
   */
  delete(pos: Position): void;
  /**
   * Deletes a sequence of Positions within the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   *
   * The Positions start at `startPos` and have the same `bunchID` but increasing `innerIndex`.
   *
   * @see {@link expandPositions}
   */
  delete(startPos: Position, sameBunchCount?: number): void;
  delete(startPos: Position, count = 1): void {
    const arr = this.state.get(startPos.bunchID);
    if (arr === undefined) {
      // Already deleted.
      return;
    }
    arr.delete(startPos.innerIndex, count);

    // Clean up empty bunches.
    // Note: the invariant "empty => not present" might not hold if the
    // user directly manipulates this.state.
    if (arr.isEmpty()) this.state.delete(startPos.bunchID);
  }

  /**
   * Deletes every position in the map, making it empty.
   */
  clear() {
    this.state.clear();
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the value at the given position, or undefined if it is not currently present.
   */
  get(pos: Position): T | undefined {
    return this.state.get(pos.bunchID)?.get(pos.innerIndex);
  }

  /**
   * Returns whether the given position is currently present in the map.
   */
  has(pos: Position): boolean {
    return this.state.get(pos.bunchID)?.has(pos.innerIndex) ?? false;
  }

  // ----------
  // Iterators
  // ----------

  /**
   * Iterates over [pos, value] pairs in the map, **in no particular order**.
   */
  [Symbol.iterator](): IterableIterator<[pos: Position, value: T]> {
    return this.entries();
  }

  /**
   * Iterates over [pos, value] pairs in the map, **in no particular order**.
   */
  *entries(): IterableIterator<[pos: Position, value: T]> {
    for (const [bunchID, arr] of this.state) {
      for (const [innerIndex, value] of arr.entries()) {
        yield [{ bunchID, innerIndex }, value];
      }
    }
  }

  // ----------
  // Save & Load
  // ----------

  /**
   * Returns a saved state for this map, which is identical to its saved state as a `List<T>`.
   *
   * The saved state describes our current (Position -> value) map in JSON-serializable form.
   * You can load this state on another PositionMap (or List) by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   */
  save(): ListSavedState<T> {
    const savedState: { [bunchID: string]: SerializedSparseArray<T> } = {};
    for (const [bunchID, arr] of this.state) {
      if (!arr.isEmpty()) {
        savedState[bunchID] = arr.serialize();
      }
    }
    return savedState;
  }

  /**
   * Loads a saved state returned by another PositionMap's (or List's) `save()` method.
   *
   * Loading sets our (Position -> value) map to match the saved PositionMap, *overwriting*
   * our current state.
   */
  load(savedState: ListSavedState<T>): void {
    this.clear();

    for (const [bunchID, savedArr] of Object.entries(savedState)) {
      this.state.set(bunchID, SparseArray.deserialize(savedArr));
    }
  }
}
