import { maybeRandomString } from "maybe-random-string";

// Rationale for value 8:
// Each character of the ID gives us ~6 bits of entropy,
// for a total of ~48 bits.  This gives a < 1%
// probability that two connected replicas
// will ever choose the same IDs, even if we
// consider the total probability across 100,000,000
// documents with 1,000 IDs each
// (= 10 users x 100 days x 1 ID/user/day).
/**
 * Default length of a newReplicaID.
 */
const REPLICA_ID_LENGTH = 8;

/**
 * Base (radix) for stringifying the counter in usingReplicaIDs.
 *
 * Higher is better (shorter nodeIDs), but JavaScript only supports up to 36
 * by default.
 */
const COUNTER_BASE = 36;

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
   * since `Order.MAX_LEX_POSITION = "~"`.)
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
   * Returns a `newBunchID` function for Order that uses
   * [causal dots](https://mattweidner.com/2022/10/21/basic-list-crdt.html#causal-dot):
   * pairs (replicaID, counter), where replicaID is a globally-unique random
   * string and the counter counts from 0.
   *
   * Specifically, each pair is encoded as `replicaID + "_" + counter.toString(36)`.
   *
   * @param replicaID The replicaID to use. Default: `BunchIDs.newReplicaID()`.
   * @see BunchIDs.parseUsingReplicaID
   */
  usingReplicaID(replicaID?: string): () => string {
    if (replicaID !== undefined) {
      // Validate replicaID. It must follow the same rules as node IDs.
      this.validate(replicaID);
    }
    const theReplicaID = replicaID ?? this.newReplicaID();

    let counter = 0;
    return function () {
      const bunchID = theReplicaID + "_" + counter.toString(COUNTER_BASE);
      counter++;
      return bunchID;
    };
  },

  /**
   * Returns a random (or pseudorandom) new replicaID for BunchIDs.usingReplicaIDs.
   *
   * @param options.rng If provided, generates a *pseudorandom* replicaID using the given rng.
   * Use this to get reproducible bunchIDs, e.g., in a test environment.
   * It should output floating-point values in the range [0, 1.0), e.g.,
   * using a PRNG from package [seedrandom](https://www.npmjs.com/package/seedrandom).
   * @param options.chars Characters to choose from.
   * Note that regardless of the characters in the replicaID, the resulting
   * bunchIDs may contain base-36 chars and "_".
   * Default: all alphanumeric chars.
   * @param options.length The replicaID's length. Longer reduces the
   * chance of accidental collisions (reused replicaIDs); you get about
   * `length * log_2(chars.length)` bits of entropy total.
   * Default: 8.
   */
  newReplicaID(options?: {
    rng?: () => number;
    chars?: string;
    length?: number;
  }): string {
    return maybeRandomString({
      prng: options?.rng,
      chars: options?.chars,
      length: options?.length ?? REPLICA_ID_LENGTH,
    });
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
    const underscore = bunchID.lastIndexOf("_");
    if (underscore === -1) {
      throw new Error(
        `bunchID is not from NodeIDs.usingReplicaID (missing "_"): ${bunchID}`
      );
    }

    const counter = Number.parseInt(
      bunchID.slice(underscore + 1),
      COUNTER_BASE
    );
    if (isNaN(counter)) {
      throw new Error(
        `bunchID is not from NodeIDs.usingReplicaID (bad counter): ${bunchID}`
      );
    }

    return [bunchID.slice(0, underscore), counter];
  },
} as const;
