import { BunchMeta } from "./bunch";
import { BunchIDs } from "./bunch_ids";
import { parseMaybeDotID, stringifyMaybeDotID } from "./internal/util";

/**
 * AbsPosition analog of a BunchMeta.
 *
 * It encodes a bunch's ID together with all of its dependent metadata,
 * in a compressed form.
 *
 * The precise encoding is described in
 * [Internals.md](https://github.com/mweidner037/list-positions/blob/master/internals.md#abspositions).
 *
 * @see {@link AbsPositions} Utilities for manipulating AbsBunchMetas and AbsPositions.
 */
export type AbsBunchMeta = {
  /**
   * Deduplicated replicaIDs, indexed into by replicaIndices.
   */
  replicaIDs: readonly string[];
  /**
   * Non-negative integers.
   */
  replicaIndices: readonly number[];
  /**
   * Non-negative integers. Same length as replicaIndices.
   */
  counterIncs: readonly number[];
  /**
   * Non-negative integers. One shorter than replicaIndices, unless both are empty.
   */
  offsets: readonly number[];
};

/**
 * A position in a list, as a JSON object that embeds all of its dependent metadata.
 *
 * AbsPositions let you treat a list as an ordered map `(position -> value)`,
 * where a value's *position* doesn't change over time - unlike an array index.
 *
 * Unlike with this library's Positions, you do not need to [Manage Metadata](https://github.com/mweidner037/list-positions#managing-metadata)
 * when using AbsPositions. However, an AbsPosition is larger than its corresponding Position. See the
 * [readme](https://github.com/mweidner037/list-positions#abslist-and-absposition) for details.
 *
 * @see {@link AbsPositions} Utilities for manipulating AbsPositions.
 */
export type AbsPosition = {
  /**
   * A description of the [bunch](https://github.com/mweidner037/list-positions#bunches) containing this position.
   *
   * It encodes the bunch's ID together with all of its dependent metadata,
   * in a compressed form.
   */
  bunchMeta: AbsBunchMeta;
  /**
   * The index of this position within its [bunch](https://github.com/mweidner037/list-positions#bunches).
   * A nonnegative integer.
   */
  innerIndex: number;
};

const ROOT_BUNCH_META: AbsBunchMeta = {
  replicaIDs: [],
  replicaIndices: [],
  counterIncs: [],
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
   * The special root node's AbsBunchMeta.
   *
   * The only valid AbsPositions using this are {@link AbsPositions.MIN_POSITION} and {@link AbsPositions.MAX_POSITION}.
   */
  ROOT_BUNCH_META,

  /**
   * The minimum AbsPosition in any Order.
   *
   * This position is defined to be less than all other positions.
   * Its value is
   * ```
   * { bunchMeta: AbsPositions.ROOT_BUNCH_META, innerIndex: 0 }
   * ```
   */
  MIN_POSITION,

  /**
   * The maximum AbsPosition in any Order.
   *
   * This position is defined to be greater than all other positions.
   * Its value is
   * ```
   * { bunchMeta: AbsPositions.ROOT_BUNCH_META, innerIndex: 1 }
   * ```
   */
  MAX_POSITION,

  /**
   * Encodes a bunch's ID and dependencies as an AbsBunchMeta.
   *
   * Typically, you will not call this method directly, instead using either
   * `Order.abs` or `BunchNode.absMeta`.
   *
   * Invert with {@link AbsPositions.decodeMetas}.
   *
   * @param pathToRoot The BunchMetas on the bunch's path to the root, as returned
   * by `BunchNode.dependencies`.
   * @throws If `pathToRoot` is not a valid path, i.e., one entry's `parentID`
   * does not match the next entry's `bunchID`.
   */
  encodeMetas(pathToRoot: Iterable<BunchMeta>): AbsBunchMeta {
    // Encode the pathToRoot in order, deduplicating replicaIDs.
    // See https://github.com/mweidner037/list-positions/blob/master/internals.md#abspositions
    // for a description of the format.

    const replicaIDs: string[] = [];
    const replicaIDsInv = new Map<string, number>();
    const replicaIndices: number[] = [];
    const counterIncs: number[] = [];
    const offsets: number[] = [];

    let prevParentID: string | null = null;
    for (const bunchMeta of pathToRoot) {
      if (prevParentID !== null && bunchMeta.bunchID !== prevParentID) {
        throw new Error(
          `Invalid pathToRoot: bunchID "${bunchMeta.bunchID}" does not match previous parentID "${prevParentID}"`
        );
      }
      prevParentID = bunchMeta.parentID;

      const [replicaID, counter] = parseMaybeDotID(bunchMeta.bunchID);
      let replicaIndex = replicaIDsInv.get(replicaID);
      if (replicaIndex === undefined) {
        replicaIndex = replicaIDs.length;
        replicaIDs.push(replicaID);
        replicaIDsInv.set(replicaID, replicaIndex);
      }

      replicaIndices.push(replicaIndex);
      counterIncs.push(counter + 1);
      offsets.push(bunchMeta.offset);
    }

    if (prevParentID === null) {
      // Empty iterator => it was the root node.
      // Reuse the existing object instead of creating a new one.
      return ROOT_BUNCH_META;
    }

    // The last node must be a child of MIN_POSITION.
    if (!(prevParentID === BunchIDs.ROOT && offsets.at(-1) === 1)) {
      throw new Error("Invalid pathToRoot: does not end at root");
    }
    // We omit the last offset because it is always 1.
    offsets.pop();

    return { replicaIDs, replicaIndices, counterIncs, offsets };
  },

  /**
   * Decodes an AbsBunchMeta, returning the corresponding bunch's dependencies.
   *
   * Inverse of {@link AbsPositions.encodeMetas}.
   *
   * @see {@link AbsPositions.getBunchID} Function to quickly return just the bunch's ID.
   */
  decodeMetas(absBunchMeta: AbsBunchMeta): BunchMeta[] {
    if (absBunchMeta.replicaIndices.length === 0) return [];

    const bunchMetas: BunchMeta[] = [];
    let nextBunchID = stringifyMaybeDotID(
      absBunchMeta.replicaIDs[absBunchMeta.replicaIndices[0]],
      absBunchMeta.counterIncs[0] - 1
    );
    for (let i = 0; i < absBunchMeta.replicaIndices.length - 1; i++) {
      const parentID = stringifyMaybeDotID(
        absBunchMeta.replicaIDs[absBunchMeta.replicaIndices[i + 1]],
        absBunchMeta.counterIncs[i + 1] - 1
      );
      bunchMetas.push({
        bunchID: nextBunchID,
        parentID,
        offset: absBunchMeta.offsets[i],
      });
      nextBunchID = parentID;
    }
    // The last bunch is a child of MIN_POSITION.
    bunchMetas.push({
      bunchID: nextBunchID,
      parentID: BunchIDs.ROOT,
      offset: 1,
    });
    return bunchMetas;
  },

  /**
   * Returns the bunchID corresponding to the given AbsBunchMeta.
   */
  getBunchID(absBunchMeta: AbsBunchMeta): string {
    if (absBunchMeta.replicaIndices.length === 0) {
      return BunchIDs.ROOT;
    }

    const replicaID = absBunchMeta.replicaIDs[absBunchMeta.replicaIndices[0]];
    const counterInc = absBunchMeta.counterIncs[0];
    return stringifyMaybeDotID(replicaID, counterInc - 1);
  },

  /**
   * Returns whether two AbsPositions are equal, i.e., they correspond to the same position.
   *
   * Note: We do **not** check the dependent metadata for equality, only the final bunchID and innerIndex.
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
   * You can use this method to expand on the `startPos` returned by
   * the bulk versions of `AbsList.insertAt`, etc.
   */
  expandPositions(
    startPos: AbsPosition,
    sameBunchCount: number
  ): AbsPosition[] {
    const ans: AbsPosition[] = [];
    for (let i = 0; i < sameBunchCount; i++) {
      ans.push({
        bunchMeta: startPos.bunchMeta,
        innerIndex: startPos.innerIndex + i,
      });
    }
    return ans;
  },
} as const;
