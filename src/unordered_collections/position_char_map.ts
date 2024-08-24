import { SerializedSparseString, SparseString } from "sparse-array-rled";
import { Position } from "../position";
import { TextSavedState } from "../text";

/**
 * A map from Positions to characters, **without ordering info**.
 *
 * This class is a simplified version of Text that does not consider the list order.
 * As a result, it does not require managing metadata, and it is slightly more efficient
 * than Text.
 *
 * For example, you can use a PositionCharMap to accumulate changes to save in a batch later.
 * There the list order is unnecessary and managing metadata could be inconvenient.
 */
export class PositionCharMap {
  /**
   * The internal state of this PositionCharMap: A map from bunchID
   * to the [SparseString](https://github.com/mweidner037/sparse-array-rled#readme)
   * of values for that bunch.
   *
   * You are free to manipulate this state directly.
   */
  readonly state: Map<string, SparseString>;

  constructor() {
    this.state = new Map();
  }

  // ----------
  // Mutators
  // ----------

  /**
   * Sets the char at the given position.
   */
  set(pos: Position, char: string): void;
  /**
   * Sets the chars at a sequence of Positions within the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   *
   * The Positions start at `startPos` and have the same `bunchID` but increasing `innerIndex`.
   *
   * @see {@link expandPositions}
   */
  set(startPos: Position, chars: string): void;
  set(startPos: Position, chars: string): void {
    let arr = this.state.get(startPos.bunchID);
    if (arr === undefined) {
      arr = SparseString.new();
      this.state.set(startPos.bunchID, arr);
    }
    arr.set(startPos.innerIndex, chars);
  }

  /**
   * Deletes the given position, making it and its char no longer present in the list.
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
   * Deletes every char in the list, making it empty.
   */
  clear() {
    this.state.clear();
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the char at the given position, or undefined if it is not currently present.
   */
  get(pos: Position): string | undefined {
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
   * Iterates over [pos, char] pairs in the map, **in no particular order**.
   */
  [Symbol.iterator](): IterableIterator<[pos: Position, char: string]> {
    return this.entries();
  }

  /**
   * Iterates over [pos, char] pairs in the map, **in no particular order**.
   */
  *entries(): IterableIterator<[pos: Position, char: string]> {
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
   * Returns a saved state for this map, which is identical to its saved state as a Text.
   *
   * The saved state describes our current (Position -> char) map in JSON-serializable form.
   * You can load this state on another PositionCharMap (or Text) by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   */
  save(): TextSavedState {
    const savedState: { [bunchID: string]: SerializedSparseString } = {};
    for (const [bunchID, arr] of this.state) {
      if (!arr.isEmpty()) {
        savedState[bunchID] = arr.serialize();
      }
    }
    return savedState;
  }

  /**
   * Loads a saved state returned by another PositionCharMap's (or Text's) `save()` method.
   *
   * Loading sets our (Position -> char) map to match the saved PositionCharMap, *overwriting*
   * our current state.
   */
  load(savedState: TextSavedState): void {
    this.clear();

    for (const [bunchID, savedArr] of Object.entries(savedState)) {
      this.state.set(bunchID, SparseString.deserialize<never>(savedArr));
    }
  }
}
