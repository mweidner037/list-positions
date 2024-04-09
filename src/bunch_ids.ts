import { maybeRandomString } from "maybe-random-string";
import { parseMaybeDotID, stringifyMaybeDotID } from "./internal/util";

/**
 * Utilities for generating `bunchIDs`.
 *
 * Use these with Order's `newBunchID` constructor option.
 */
export const BunchIDs = {
  /**
   * Reserved for the special root bunch's ID.
   */
  ROOT: "ROOT",

  /**
   * Throws an error if bunchID is invalid.
   *
   * Rules:
   * - Must not be "ROOT" (`BunchIDs.ROOT`).
   * - Must not contain "." or ",".
   * - Must be lexicographically less than "\~".
   * (This is a technicality needed to match the sort order on LexPositions,
   * since `MAX_LEX_POSITION = "~"`.)
   */
  validate(bunchID: string): void {
    if (bunchID === this.ROOT) {
      throw new Error(
        `Invalid bunchID or replicaID: "${this.ROOT}" (NodeIDs.ROOT) is reserved.`
      );
    }
    if (bunchID.indexOf(".") !== -1 || bunchID.indexOf(",") !== -1) {
      throw new Error(
        `Invalid bunchID or replicaID "${bunchID}": must not contain "." or ",".`
      );
    }
    if (!(bunchID < "~")) {
      throw new Error(
        `Invalid bunchID or replicaID "${bunchID}": must be lexicographically less than "~".`
      );
    }
  },

  /**
   * Returns a `newBunchID` function for Order's constructor that uses
   * [dot IDs](https://mattweidner.com/2023/09/26/crdt-survey-3.html#unique-ids-dots):
   * each bunchID has the form `` `${replicaID}_${counter.toString(36)}` ``,
   * where replicaID is a globally-unique string and the counter counts from 0.
   *
   * @param replicaID The replicaID to use.
   * Default: A random alphanumeric string from the
   * [maybe-random-string](https://github.com/mweidner037/maybe-random-string#readme) package.
   * @see {@link BunchIDs.parseUsingReplicaID}
   */
  usingReplicaID(replicaID?: string): () => string {
    if (replicaID !== undefined) {
      // Validate replicaID. It must follow the same rules as node IDs.
      this.validate(replicaID);
    }
    const theReplicaID = replicaID ?? maybeRandomString();

    let counter = 0;
    return function () {
      const bunchID = stringifyMaybeDotID(theReplicaID, counter);
      counter++;
      return bunchID;
    };
  },

  /**
   * Parses a bunchID created by BunchIDs.usingReplicaID into its pair (replicaID, counter).
   *
   * In advanced usage, parsing may allow you to optimize the size of saved
   * states that include many bunchIDs.
   * For example, you could turn ListSavedState's map
   * ```ts
   * {
   *   [bunchID: string]: (T[] | number)[];
   * }
   * ```
   * into a double map
   * ```ts
   * {
   *   [replicaID: string]: {
   *     [counter: number]: (T[] | number)[];
   *   }
   * }
   * ```
   * in order to deduplicate the often-repeated replicaIDs. (However, GZIP may work
   * just as well.)
   */
  parseUsingReplicaID(bunchID: string): [replicaID: string, counter: number] {
    const [replicaID, counter] = parseMaybeDotID(bunchID);
    if (counter === -1) {
      throw new Error(
        `bunchID is not from BunchIDs.usingReplicaID: "${bunchID}"`
      );
    }
    return [replicaID, counter];
  },
} as const;
