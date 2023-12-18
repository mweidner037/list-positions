import type { BunchMeta } from "./bunch";
import { BunchIDs } from "./bunch_ids";
import type { LexPosition } from "./position";

/**
 * Utilities for manipulating LexPositions.
 *
 * For info about the format of LexPositions, see
 * [Internals](https://github.com/mweidner037/list-positions/blob/master/internals.md).
 */
export const LexUtils = {
  /**
   * The minimum LexPosition in any Order.
   *
   * This LexPosition is defined to be less than all other LexPositions.
   * It is equivalent to Order.MIN_POSITION.
   *
   * Copy of Order.MIN_LEX_POSITION.
   */
  MIN_LEX_POSITION: "" as LexPosition,
  /**
   * The maximum LexPosition in any Order.
   *
   * This LexPosition is defined to be greater than all other LexPositions.
   * It is equivalent to Order.MAX_POSITION.
   *
   * Copy of Order.MAX_LEX_POSITION.
   */
  MAX_LEX_POSITION: "~" as LexPosition,

  /**
   * Combines a bunch prefix (see LexUtils.splitPos) and `innerIndex` into a LexPosition.
   */
  combinePos(bunchPrefix: string, innerIndex: number): LexPosition {
    if (bunchPrefix === "") {
      // Root node.
      if (innerIndex === 0) return this.MIN_LEX_POSITION;
      if (innerIndex === 1) return this.MAX_LEX_POSITION;
      throw new Error(
        `Position uses rootNode but is not MIN_POSITION or MAX_POSITION (innerIndex 0 or 1): innerIndex=${innerIndex}`
      );
    }
    return bunchPrefix + "," + encodeInnerIndex(innerIndex);
  },

  /**
   * Splits a LexPosition into its `innerIndex` and a *bunch prefix* - a string
   * that embeds all of its bunch's dependencies (including its ancestors' BunchMetas), and that appears as a
   * prefix of all of its LexPositions.
   *
   * This decomposition is the LexPosition analog of Position's obvious decomposition
   * ```ts
   * type Position = {
   *   bunchID: string;
   *   innerIndex: number;
   * };
   * ```
   *
   * Recombine with LexUtils.combine.
   */
  splitPos(lexPos: LexPosition): [bunchPrefix: string, innerIndex: number] {
    if (lexPos === this.MIN_LEX_POSITION) return ["", 0];
    if (lexPos === this.MAX_LEX_POSITION) return ["", 1];
    const lastComma = lexPos.lastIndexOf(",");
    if (lastComma === -1) {
      throw new Error(`Not a LexPosition (no comma): "${lexPos}"`);
    }
    return [
      lexPos.slice(0, lastComma),
      decodeInnerIndex(lexPos.slice(lastComma + 1)),
    ];
  },

  /**
   * Returns a bunch's prefix (see LexUtils.splitPos), given the
   * BunchMetas of its ancestors in order from
   * the root downwards (excluding the root and including the bunch, unless root).
   *
   * Usually you will just call `bunchNode.lexPrefix()` to get a bunch's prefix.
   * This function is instead meant as a reference for working with LexPositions
   * in other languages.
   */
  combineBunchPrefix(metas: BunchMeta[]): string {
    if (metas.length === 0) return "";

    const parts = new Array<string>(metas.length);
    if (metas[0].parentID !== BunchIDs.ROOT) {
      throw new Error(
        `Invalid tree path: does not start with root child (${JSON.stringify(
          metas[0]
        )}))`
      );
    }
    parts[0] = metas[0].bunchID;

    for (let i = 1; i < metas.length; i++) {
      if (metas[i].parentID !== metas[i - 1].bunchID) {
        throw new Error(
          `Invalid tree path: metas[${i}] is not a child of metas[${
            i - 1
          }] (${JSON.stringify(metas[i])}, ${JSON.stringify(metas[i - 1])})`
        );
      }
      parts[i] = encodeOffset(metas[i].offset) + "." + metas[i].bunchID;
    }

    return parts.join(",");
  },

  /**
   * Splits a bunch prefix (see LexUtils.splitPos) into its embedded BunchMetas.
   *
   * These are the BunchMetas of the original bunch and all of its ancestors,
   * excluding the root, in order from the root downwards. It is equivalent to `bunchNode.ancestors().map(node => node.meta())`.
   */
  splitBunchPrefix(bunchPrefix: string): BunchMeta[] {
    if (bunchPrefix === "") return [];

    const parts = bunchPrefix.split(",");
    const metas: BunchMeta[] = [];
    // First part is child of the root; no offset string.
    metas.push({
      bunchID: parts[0],
      parentID: BunchIDs.ROOT,
      // It's a child of MIN_POSITION with innerIndex 0, so
      // offset = 2 * innerIndex + 1 = 1.
      offset: 1,
    });
    // Other parts are "offset.bunchID".
    let parentID = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const period = parts[i].indexOf(".");
      if (period === -1) {
        throw new Error(
          `Bad bunchPrefix format; did you pass a LexPosition instead? (bunchPrefix="${bunchPrefix}", missing "." in part ${parts[i]})`
        );
      }
      const id = parts[i].slice(period + 1);
      metas.push({
        bunchID: id,
        parentID,
        offset: decodeOffset(parts[i].slice(0, period)),
      });
      parentID = id;
    }
    return metas;
  },

  /**
   * Given a bunch's prefix, returns its bunchID.
   */
  bunchIDFor(bunchPrefix: string): string {
    if (bunchPrefix === "") return BunchIDs.ROOT;

    const lastComma = bunchPrefix.lastIndexOf(",");
    if (lastComma === -1) {
      // Child of root; prefix is just bunchID.
      return bunchPrefix;
    } else {
      // lastPart is "offset.bunchID".
      const lastPart = bunchPrefix.slice(lastComma + 1);
      const period = lastPart.indexOf(".");
      if (period === -1) {
        throw new Error(
          `Invalid bunchPrefix; did you pass a LexPosition instead? (bunchPrefix="${bunchPrefix}", missing "." in part ${lastPart})`
        );
      }
      return lastPart.slice(period + 1);
    }
  },
} as const;

function encodeOffset(offset: number): string {
  return sequence(offset).toString(BASE);
}

function decodeOffset(encoded: string): number {
  const seq = Number.parseInt(encoded, BASE);
  if (isNaN(seq)) {
    throw new Error(`Invalid bunchPrefix: bad offset "${encoded}"`);
  }
  return sequenceInv(seq);
}

function encodeInnerIndex(innerIndex: number): string {
  return sequence(2 * innerIndex + 1).toString(BASE);
}

function decodeInnerIndex(encoded: string): number {
  const seq = Number.parseInt(encoded, BASE);
  if (isNaN(seq)) {
    throw new Error(`Invalid LexPosition: bad innerIndex "${encoded}"`);
  }
  // (n - 1) / 2
  return sequenceInv(seq) >> 1;
}

// Exports below are only for unit tests (not re-exported by index.ts).

// Must be even and > 2. If you use toString(BASE), must be <= 36.
export const BASE = 36;
export const LOG_BASE = Math.log(BASE);

/**
 * These functions deal with a special sequence that has
 * the following properties:
 * 1. Each number is a nonnegative integer (however, not all
 * nonnegative integers are enumerated).
 * 2. The numbers' BASE representations are enumerated in
 * lexicographic order, with no prefixes (i.e., no string
 * representation is a prefix of another).
 * 3. The n-th enumerated number has O(log(n)) BASE digits.
 *
 * Properties (2) and (3) are analogous to normal counting, except
 * that we order by the lexicographic order instead of the
 * usual order by magnitude. It is also the case that
 * the numbers are in order by magnitude, although we do not
 * use this property.
 *
 * The sequence is as follows, with examples in base 10:
 * - Start with 0.
 * - Enumerate (BASE/2)^1 numbers (0, 1, ..., 4).
 * - Add 1, multiply by BASE, then enumerate (BASE/2)^2 numbers
 * (50, 51, ..., 74).
 * - Add 1, multiply by BASE, then enumerate (BASE/2)^3 numbers
 * (750, 751, ..., 874).
 * - Repeat this pattern indefinitely, enumerating
 * (BASE/2)^d d-digit numbers for each d >= 1. Imagining a decimal place
 * in front of each number, each d consumes 2^(-d) of the unit interval,
 * so we never "reach 1" (overflow to d+1 digits when
 * we meant to use d digits).
 *
 * I believe this is related to
 * [Elias gamma coding](https://en.wikipedia.org/wiki/Elias_gamma_coding).
 */

// /**
//  * Given a number in the sequence, outputs the next number in the sequence.
//  *
//  * To yield the sequence in order, call this function repeatedly starting at 0.
//  *
//  * This function is commented because it is not actually called, but you can
//  * use it as a reference or to test sequence/sequenceInv.
//  */
// function nextInLexSequence(n: number): number {
//   const d = n === 0 ? 1 : Math.floor(Math.log(n) / LOG_BASE) + 1;
//   // You can calculate that the last d-digit number is BASE^d - (BASE/2)^d - 1.
//   if (n === Math.pow(BASE, d) - Math.pow(BASE / 2, d) - 1) {
//     // New length: n -> (n + 1) * BASE.
//     return (n + 1) * BASE;
//   } else {
//     // n -> n + 1.
//     return n + 1;
//   }
// }

/**
 * Returns the n-th number in the sequence.
 */
export function sequence(n: number): number {
  // Each digit-length d has (BASE/2)^d values. Subtract these
  // out until we can't anymore (reached the right length).
  let remaining = n;
  let d = 1;
  for (; ; d++) {
    const valueCount = Math.pow(BASE / 2, d);
    if (remaining < valueCount) break;
    remaining -= valueCount;
  }
  // The number is d-digits long, and at index `remaining` within
  // the d-digit subsequence.
  // So add `remaining` to the first d-digit number, which you can calculate is
  // BASE^d - BASE * (BASE/2)^(d-1).
  return remaining + Math.pow(BASE, d) - BASE * Math.pow(BASE / 2, d - 1);
}

/**
 * Inverse of sequence: returns the index n of seq in the sequence.
 */
export function sequenceInv(seq: number): number {
  const d = seq === 0 ? 1 : Math.floor(Math.log(seq) / LOG_BASE) + 1;
  // First d-digit number is BASE^d - BASE * (BASE/2)^(d-1); check how far
  // we are from there (= index in d-digit sub-sequence)
  let ans = seq - (Math.pow(BASE, d) - BASE * Math.pow(BASE / 2, d - 1));
  // Previous digit-lengths d2 have (BASE/2)^d2 values each.
  for (let d2 = 1; d2 < d; d2++) {
    ans += Math.pow(BASE / 2, d2);
  }
  return ans;
}
