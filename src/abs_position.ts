import { BunchMeta } from "./bunch";

/**
 * All of the metadata for a bunch.
 */
export type AbsBunchMeta = {
  replicaIDs: readonly string[];
  replicaIndices: readonly number[];
  counters: readonly number[];
  offsets: readonly number[];
};

/**
 * A position that embeds all of its dependent metadata.
 *
 * so that it can be used
 * without needing to managing metadata.
 */
export type AbsPosition = {
  bunchMeta: AbsBunchMeta;
  innerIndex: number;
};

const ROOT_BUNCH_META: AbsBunchMeta = {
  replicaIDs: [],
  replicaIndices: [],
  counters: [],
  offsets: [],
};

const MIN_POSITION: AbsPosition = {
  bunchMeta: ROOT_BUNCH_META,
  innerIndex: 0,
};

const MAX_POSITION: AbsPosition = {
  bunchMeta: ROOT_BUNCH_META,
  innerIndex: 1,
};

/**
 * Utilities for working with AbsPositions.
 */
export const AbsPositions = {
  /**
   * The special root node's AbsBunchMeta, used by AbsPositions.MIN_POSITION and AbsPositions.MAX_POSITION only.
   */
  ROOT_BUNCH_META,

  /**
   * The minimum AbsPosition in any Order.
   *
   * This Position is defined to be less than all other Positions.
   * Its value is
   * ```
   * { bunchMeta: AbsPositions.ROOT_BUNCH_META, innerIndex: 0 }
   * ```
   */
  MIN_POSITION,

  /**
   * The maximum AbsPosition in any Order.
   *
   * This Position is defined to be greater than all other Positions.
   * Its value is
   * ```
   * { bunchMeta: AbsPositions.ROOT_BUNCH_META, innerIndex: 1 }
   * ```
   */
  MAX_POSITION,

  encodeMetas(pathToRoot: BunchMeta[]): AbsBunchMeta {},

  decodeMetas(absBunchMeta: AbsBunchMeta): BunchMeta[] {},

  getBunchID(absBunchMeta: AbsBunchMeta): string {},

  /**
   * Returns whether two AbsPositions are equal, i.e., they correspond to the same position.
   *
   * Note: We do not check the dependent metadata for equality, only the final bunchID and innerIndex.
   */
  positionEquals(a: AbsPosition, b: AbsPosition): boolean {
    return (
      a.innerIndex === b.innerIndex &&
      (a.bunchMeta === b.bunchMeta ||
        this.getBunchID(a.bunchMeta) === this.getBunchID(b.bunchMeta))
    );
  },

  /**
   * Returns an array of AbsPositions that start at `startPos` and have
   * sequentially increasing `innerIndex`.
   *
   * You can use this method to expand on the startPos returned by
   * the bulk versions of `AbsList.insertAt`, etc.
   */
  expandPositions(
    startPos: AbsPosition,
    sameBunchCount: number
  ): AbsPosition[] {
    const ans = new Array<AbsPosition>(sameBunchCount);
    for (let i = 0; i < sameBunchCount; i++) {
      ans[i] = {
        bunchMeta: startPos.bunchMeta,
        innerIndex: startPos.innerIndex + i,
      };
    }
    return ans;
  },
} as const;
