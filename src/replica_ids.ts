import * as crypto from "crypto";

/**
 * Utitilies for generating [[IRuntime.replicaID]]s.
 */
export class ReplicaIDs {
  private constructor() {
    // Not instantiable.
  }

  /**
   * Characters used for generated replicaIDs: alphanumeric chars.
   */
  static readonly DEFAULT_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  /**
   * The default length of a replicaID, in characters.
   *
   * Rationale for value 10:
   * Each character of the replicaID gives us ~6 bits of entropy,
   * for a total of 60 bits.  This gives a < 1%
   * probability that two replicas in the same conversation
   * will ever choose the same replicaID's, even if we
   * consider the total probability across 100,000,000
   * conversations with 10,000 replicaIDs each
   * (= 10 users * 1,000 days * 1 replica/user/day).
   */
  static readonly DEFAULT_LENGTH = 10;

  /**
   * Returns a cryptographically random replicaID made of alphanumeric characters.
   *
   * @param chars TODO: only first 256 used; bias okay but lose up to a bit
   */
  static random(
    length: number = this.DEFAULT_LENGTH,
    chars: string = this.DEFAULT_CHARS
  ): string {
    const arr = new Array<string>(length);
    let randomValues = new Uint8Array(length);
    if (typeof window === "undefined") {
      // Use Node crypto library.
      // We use eval("require") to prevent Webpack from attempting
      // to bundle the crypto module and complaining.
      // In theory we should also be able to do this by
      // adding "browser": {"crypto": false} to package.json,
      // but that is not working, and besides, every user
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
    for (let i = 0; i < length; i++) {
      // This will be biased if chars.length does not divide 256,
      // but it will still give at least floor(log_2(chars.length))
      // bits of entropy.
      arr[i] = chars[randomValues[i] % chars.length];
    }
    return arr.join("");
  }

  /**
   * Returns a pseudorandom replicaID made of base64 characters
   * generated from `rng` (npm package "seedrandom").
   *
   * For tests and benchmarks, it is recommended to use such a
   * replicaID with a fixed seed. You can supply the replicaID
   * to [[CRuntime]] using its `options.debugReplicaID` constructor
   * arg.
   */
  static pseudoRandom(
    rng: seedrandom.prng,
    length: number = this.DEFAULT_LENGTH,
    chars: string = this.DEFAULT_CHARS
  ) {
    const arr = new Array<string>(length);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = chars[Math.floor(rng() * chars.length)];
    }
    return arr.join("");
  }
}
