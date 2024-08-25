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
 *
 * The map values may also be embedded objects of type `E`.
 * Each embed takes the place of a single character. You can use embeds to represent
 * non-text content, like images and videos, that may appear inline in a text document.
 * If you do not specify the generic type `E`, it defaults to `never`, i.e., no embeds are allowed.
 *
 * @typeParam E - The type of embeds, or `never` (no embeds allowed) if not specified.
 * Embeds must be non-null objects.
 */
export class PositionCharMap<E extends object | never = never> {
  /**
   * The internal state of this PositionCharMap: A map from bunchID
   * to the [SparseString](https://github.com/mweidner037/sparse-array-rled#readme)
   * of values for that bunch.
   *
   * You are free to manipulate this state directly.
   */
  readonly state: Map<string, SparseString<E>>;

  constructor() {
    this.state = new Map();
  }

  // ----------
  // Mutators
  // ----------

  /**
   * Sets the char (or embed) at the given position.
   */
  set(pos: Position, charOrEmbed: string | E): void;
  /**
   * Sets the chars at a sequence of Positions within the same [bunch](https://github.com/mweidner037/list-positions#bunches).
   *
   * The Positions start at `startPos` and have the same `bunchID` but increasing `innerIndex`.
   *
   * @see {@link expandPositions}
   */
  set(startPos: Position, chars: string): void;
  set(startPos: Position, charsOrEmbed: string | E): void {
    let arr = this.state.get(startPos.bunchID);
    if (arr === undefined) {
      arr = SparseString.new();
      this.state.set(startPos.bunchID, arr);
    }
    // @ts-expect-error TODO: remove once sparse-array-rled is updated to 2.0.1.
    arr.set(startPos.innerIndex, charsOrEmbed);
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
  get(pos: Position): string | E | undefined {
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
   * Iterates over [pos, char (or embed)] pairs in the map, **in no particular order**.
   */
  [Symbol.iterator](): IterableIterator<
    [pos: Position, charOrEmbed: string | E]
  > {
    return this.entries();
  }

  /**
   * Iterates over [pos, char (or embed)] pairs in the map, **in no particular order**.
   */
  *entries(): IterableIterator<[pos: Position, charOrEmbed: string | E]> {
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
   * The saved state describes our current (Position -> char/embed) map in JSON-serializable form.
   * You can load this state on another PositionCharMap (or Text) by calling `load(savedState)`,
   * possibly in a different session or on a different device.
   */
  save(): TextSavedState<E> {
    const savedState: { [bunchID: string]: SerializedSparseString<E> } = {};
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
   * Loading sets our (Position -> char/embed) map to match the saved PositionCharMap, *overwriting*
   * our current state.
   */
  load(savedState: TextSavedState<E>): void {
    this.clear();

    for (const [bunchID, savedArr] of Object.entries(savedState)) {
      this.state.set(bunchID, SparseString.deserialize(savedArr));
    }
  }
}
