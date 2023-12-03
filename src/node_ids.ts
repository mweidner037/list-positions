import * as crypto from "crypto";
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
   * The only invalid replicaID is `ReplicaIDs.ROOT = "ROOT"`, which is reserved.
   * TODO: also ,.~ for LexPosition stuff.
   */
  validate(nodeID: string): void {
    if (nodeID === this.ROOT) {
      throw new Error(
        `Invalid nodeID: "${this.ROOT}" (NodeIDs.ROOT) is reserved.`
      );
    }
  },

  usingReplicaID(replicaID?: string): () => string {
    const theReplicaID = replicaID ?? this.newReplicaID();
    let counter = 0;
    return function () {
      const nodeID = theReplicaID + "_" + counter.toString(36);
      counter++;
      return nodeID;
    };
  },

  newReplicaID(rng?: seedrandom.prng): string {
    const arr = new Array<string>(REPLICA_ID_LENGTH);
    if (rng === undefined) {
      // Random replicaID.
      let randomValues = new Uint8Array(REPLICA_ID_LENGTH);
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
        const randomBuffer = cryptoReal.randomBytes(REPLICA_ID_LENGTH);
        randomValues = new Uint8Array(randomBuffer);
      } else {
        // Use browser crypto library.
        window.crypto.getRandomValues(randomValues);
      }
      for (let i = 0; i < randomValues.length; i++) {
        // This is biased b/c REPLICA_ID_CHARS.length does not divide 256,
        // but it still gives almost 6 bits of entropy.
        arr[i] = REPLICA_ID_CHARS[randomValues[i] % REPLICA_ID_CHARS.length];
      }
    } else {
      // Pseudo-random replicaID.
      for (let i = 0; i < REPLICA_ID_LENGTH; i++) {
        // Although we could pick chars without bias, we instead use the
        // same bias as `random`, for consistency.
        arr[i] =
          REPLICA_ID_CHARS[Math.floor(rng() * 256) % REPLICA_ID_CHARS.length];
      }
    }
    return arr.join("");
  },
} as const;
