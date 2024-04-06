import { SerializedSparseIndices, SparseIndices } from "sparse-array-rled";
import { OutlineSavedState } from "../outline";
import { Position } from "../position";

/**
 * A set of Positions, **without ordering info**.
 *
 * This class is a simplified version of Outline that does not consider the list order.
 * As a result, it does not require managing metadata, and it is slightly more efficient
 * than Outline.
 *
 * For example, you can use a PositionSet to track the set of deleted Positions in a CRDT.
 * See the benchmarks' [PositionCRDT](https://github.com/mweidner037/list-positions/blob/master/benchmarks/internal/position_crdt.ts)
 * for an example.
 */
export class PositionSet {
  /**
   * The internal state of this PositionSet: A map from bunchID
   * to the [SparseIndices](https://github.com/mweidner037/sparse-array-rled#readme)
   * corresponding to that bunch's present Positions.
   *
   * You are free to manipulate this state directly.
   */
  readonly state: Map<string, SparseIndices>;

  constructor() {
    this.state = new Map();
  }

  // ----------
  // Mutators
  // ----------

  /**
   * Adds the given Position.
   */
  add(pos: Position): void;
  /**
   * Adds a sequence of Positions within the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   *
   * The Positions start at `startPos` and have the same `bunchID` but increasing `innerIndex`.
   *
   * @see {@link expandPositions}
   */
  add(startPos: Position, sameBunchCount?: number): void;
  add(startPos: Position, count = 1): void {
    let arr = this.state.get(startPos.bunchID);
    if (arr === undefined) {
      arr = SparseIndices.new();
      this.state.set(startPos.bunchID, arr);
    }
    arr.set(startPos.innerIndex, count);
  }

  /**
   * Deletes the given position, making it no longer present in the set.
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
   * Deletes every position in the set, making it empty.
   */
  clear() {
    this.state.clear();
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns whether the given position is currently present in the set.
   */
  has(pos: Position): boolean {
    return this.state.get(pos.bunchID)?.has(pos.innerIndex) ?? false;
  }

  // ----------
  // Iterators
  // ----------

  /**
   * Iterates over present positions, **in no particular order**.
   */
  [Symbol.iterator](): IterableIterator<Position> {
    return this.positions();
  }

  /**
   * Iterates over present positions, **in no particular order**.
   */
  *positions(): IterableIterator<Position> {
    for (const [bunchID, arr] of this.state) {
      for (const innerIndex of arr.keys()) {
        yield { bunchID, innerIndex };
      }
    }
  }

  // ----------
  // Save & Load
  // ----------

  /**
   * Returns a saved state for this set, which is identical to its saved state as an Outline.
   *
   * The saved state describes our current set of Positions in JSON-serializable form.
   * You can load this state on another PositionSet (or Outline) by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   */
  save(): OutlineSavedState {
    const savedState: { [bunchID: string]: SerializedSparseIndices } = {};
    for (const [bunchID, arr] of this.state) {
      if (!arr.isEmpty()) {
        savedState[bunchID] = arr.serialize();
      }
    }
    return savedState;
  }

  /**
   * Loads a saved state returned by another PositionSet's (or Outline's) `save()` method.
   *
   * Loading sets our set of Positions to match the saved PositionSet's, *overwriting*
   * our current state.
   */
  load(savedState: OutlineSavedState): void {
    this.clear();

    for (const [bunchID, savedArr] of Object.entries(savedState)) {
      this.state.set(bunchID, SparseIndices.deserialize(savedArr));
    }
  }
}
