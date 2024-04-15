import { lexSequence } from "lex-sequence";
import { AbsPosition } from "./abs_position";
import { stringifyMaybeDotID } from "./internal/util";

const OFFSET_BASE = 36;
const { sequence } = lexSequence(OFFSET_BASE);

// This function is on its own, instead of a method on Order or AbsPositions,
// to avoid bringing in the lex-sequence dependency unless you actually
// use lexicographic strings.

/**
 * Returns a string with the property: The lexicographic order on strings matches
 * the list order on positions.
 *
 * Lexicographic strings are useful as an escape hatch for interacting with systems
 * that cannot use this library directly but still want to access the list order.
 * E.g., you can `ORDER BY` the lexicographic strings in a database table.
 *
 * However, storing a set of (lexicographic string, value) pairs directly uses much
 * more memory than our built-in data structures.
 * Also, a lexicographic string is generally somewhat larger than its corresponding AbsPosition.
 * Thus the strings are best used sparingly, or for short lists only.
 *
 * - If you plan to use lexicographic strings exclusively, consider using the
 * [position-strings](https://github.com/mweidner037/position-strings#readme)
 * package instead, which is optimized for that use case (smaller JS bundle & more compact strings).
 *
 * To call this function on a Position `pos` belonging to an Order `order`, use `lexicographicString(order.abs(pos))`.
 */
export function lexicographicString(pos: AbsPosition): string {
  const { replicaIndices, replicaIDs, counterIncs, offsets } = pos.bunchMeta;

  // See https://github.com/mweidner037/list-positions/blob/master/internals.md
  // for a description of the string format.

  if (replicaIndices.length === 0) {
    // Root bunch. MIN_POSITION -> "", MAX_POSITION -> "~".
    return pos.innerIndex === 0 ? "" : "~";
  }

  let ans = "";
  for (let i = replicaIndices.length - 1; i >= 0; i--) {
    if (i !== replicaIndices.length - 1) {
      // Offset layer.
      const offset = offsets[i];
      ans += sequence(offset).toString(OFFSET_BASE) + ".";
    }

    // BunchID layer.
    const bunchID = stringifyMaybeDotID(
      replicaIDs[replicaIndices[i]],
      counterIncs[i] - 1
    );
    // If the first char is >= 125 ('}'), escape it with '}', so that all strings
    // are less than the "~" used for MAX_POSITION.
    if (bunchID.length !== 0 && bunchID.charCodeAt(0) >= 125) {
      ans += "}";
    }
    let lastB = 0;
    for (let b = 0; b < bunchID.length; b++) {
      // If a char is <= 45 ('-'), escape it with '-', so that it compares as greater than ',',
      // the end-of-bunchID delimiter. That way, bunchID prefixes sort normally.
      if (bunchID.charCodeAt(b) <= 45) {
        ans += bunchID.slice(lastB, b) + "-";
        lastB = b;
      }
    }
    ans += bunchID.slice(lastB) + ",";
  }

  // Final innerIndex, converted to an offset.
  ans += sequence(2 * pos.innerIndex + 1).toString(OFFSET_BASE);

  return ans;
}
