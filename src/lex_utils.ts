import { lexSequence } from "lex-sequence";
import type { BunchMeta } from "./bunch";
import { BunchIDs } from "./bunch_ids";

/**
 * A position in a list, as a lexicographically-sorted string.
 *
 * LexPositions let you treat a list as an ordered map `(position -> value)`,
 * where a value's *position* doesn't change over time - unlike an array index.
 *
 * The list order on LexPositions matches their lexicographic order as strings.
 * That makes it easy to work with LexPositions outside of this library, but it has a cost in metadata overhead.
 * See the [readme](https://github.com/mweidner037/list-positions#lexlist-and-lexposition)
 * for details.
 *
 * See also:
 * - Position: An alternative representation of positions that is used with
 * List, Text, Outline, and Order and has less metadata overhead.
 * - LexUtils: Utilities for manipulating LexPositions.
 */
export type LexPosition = string;

/**
 * The minimum LexPosition in any Order.
 *
 * This LexPosition is defined to be less than all other LexPositions.
 * It is equivalent to MIN_POSITION.
 *
 * Its value is `""`.
 */
export const MIN_LEX_POSITION: LexPosition = "";

/**
 * The maximum LexPosition in any Order.
 *
 * This LexPosition is defined to be greater than all other LexPositions.
 * It is equivalent to MAX_POSITION.
 *
 * Its value is `"~"`.
 */
export const MAX_LEX_POSITION: LexPosition = "~";

/**
 * Utilities for manipulating LexPositions.
 *
 * For info about the format of LexPositions, see
 * [Internals](https://github.com/mweidner037/list-positions/blob/master/internals.md).
 */
export const LexUtils = {
  /**
   * Combines a bunch prefix (see LexUtils.splitPos) and `innerIndex` into a LexPosition.
   */
  combinePos(bunchPrefix: string, innerIndex: number): LexPosition {
    if (bunchPrefix === "") {
      // Root node.
      if (innerIndex === 0) return MIN_LEX_POSITION;
      if (innerIndex === 1) return MAX_LEX_POSITION;
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
    if (lexPos === MIN_LEX_POSITION) return ["", 0];
    if (lexPos === MAX_LEX_POSITION) return ["", 1];
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
   * excluding the root, in order from the root downwards.
   * It is equivalent to the reverse of `bunchNode.dependencies()`.
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

const BASE = 36;
const { sequence, sequenceInv } = lexSequence(BASE);

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
