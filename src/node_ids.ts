import type * as crypto from "crypto";
import type seedrandom from "seedrandom";

/**
 * Characters used by newReplicaID: the alphanumeric chars.
 */
const REPLICA_ID_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Rationale for value 8:
// Each character of the ID gives us ~6 bits of entropy,
// for a total of ~48 bits.  This gives a < 1%
// probability that two connected replicas
// will ever choose the same IDs, even if we
// consider the total probability across 100,000,000
// documents with 1,000 IDs each
// (= 10 users x 100 days x 1 ID/user/day).
/**
 * The length of a newReplicaID.
 */
const REPLICA_ID_LENGTH = 8;

const COUNTER_BASE = 36;

/**
 * Utilities for Node IDs.
 */
export const NodeIDs = {
  /**
   * Reserved for the special root node's ID.
   */
  ROOT: "ROOT",

  /**
   * Throws an error if nodeID is invalid.
   *
   * Rules:
   * - Not NodeIDs.ROOT = "ROOT".
   * - Must not contain "." or ",".
   * - Must be lexicographically less than "~" (needed for Order.MAX_LEX_POSITION to work).
   */
  validate(nodeID: string): void {
    if (nodeID === this.ROOT) {
      throw new Error(
        `Invalid nodeID or replicaID: "${this.ROOT}" (NodeIDs.ROOT) is reserved.`
      );
    }
    if (nodeID.indexOf(".") !== -1 || nodeID.indexOf(",") !== -1) {
      throw new Error(
        `Invalid nodeID or replicaID "${nodeID}": must not contain "." or ",".`
      );
    }
    if (!(nodeID < "~")) {
      throw new Error(
        `Invalid nodeID or replicaID "${nodeID}": must be lexicographically less than "~".`
      );
    }
  },

  /**
   * Causal dots using unique replicaID; same rules a validate().
   *
   * Parse with parseUsingReplicaID, e.g., for map->array rep.
   */
  usingReplicaID(replicaID?: string): () => string {
    if (replicaID !== undefined) {
      // Validate replicaID. It must follow the same rules as node IDs.
      this.validate(replicaID);
    }
    const theReplicaID = replicaID ?? this.newReplicaID();

    let counter = 0;
    return function () {
      const nodeID = theReplicaID + "_" + counter.toString(COUNTER_BASE);
      counter++;
      return nodeID;
    };
  },

  /**
   * Don't use as newNodeID - call usingReplicaID instead.
   *
   * @param options.chars Get approx log_2(chars.length) entropy per length.
   * Only first 256 values are used.
   */
  newReplicaID(options?: {
    rng?: seedrandom.prng;
    chars?: string;
    length?: number;
  }): string {
    const chars = options?.chars ?? REPLICA_ID_CHARS;
    const length = options?.length ?? REPLICA_ID_LENGTH;

    const arr = new Array<string>(length);
    if (options?.rng === undefined) {
      // Random replicaID.
      let randomValues = new Uint8Array(length);
      if (typeof window === "undefined") {
        // Use Node crypto library.
        // We use eval("require") to prevent Webpack from attempting
        // to bundle the crypto module and complaining.
        // In theory we should also be able to do this by
        // adding "browser": {"crypto": false} to package.json, but every user
        // of this package would have to remember to do so.
        // See https://github.com/webpack/webpack/issues/8826
        const cryptoReal = <typeof crypto>(
          (<typeof require>eval("require"))("crypto")
        );
        const randomBuffer = cryptoReal.randomBytes(length);
        randomValues = new Uint8Array(randomBuffer);
      } else {
        // Use browser crypto library.
        window.crypto.getRandomValues(randomValues);
      }
      for (let i = 0; i < randomValues.length; i++) {
        // This can be biased if chars.length does not divide 256, but
        // it still gives at least floor(log_2(chars.length)) bits of entropy.
        arr[i] = chars[randomValues[i] % chars.length];
      }
    } else {
      // Pseudo-random replicaID.
      for (let i = 0; i < length; i++) {
        // Although we could pick chars without bias, we instead use the
        // same bias as `random`, for consistency.
        arr[i] = chars[Math.floor(options.rng() * 256) % chars.length];
      }
    }
    return arr.join("");
  },

  /**
   * Parses a nodeID from NodeIDs.usingReplicaID back into its replicaID
   * + counter. For optimized map-array representation.
   */
  parseUsingReplicaID(nodeID: string): [replicaID: string, counter: number] {
    const underscore = nodeID.lastIndexOf("_");
    if (underscore === -1) {
      throw new Error(
        `nodeID is not from NodeIDs.usingReplicaID (missing "_"): ${nodeID}`
      );
    }

    const counter = Number.parseInt(nodeID.slice(underscore + 1), COUNTER_BASE);
    if (isNaN(counter)) {
      throw new Error(
        `nodeID is not from NodeIDs.usingReplicaID (bad counter): ${nodeID}`
      );
    }

    return [nodeID.slice(0, underscore), counter];
  },
} as const;
