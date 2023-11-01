import * as crypto from "crypto";
import type seedrandom from "seedrandom";

/**
 * Utitilies for generating `PositionSource` IDs
 * (the `options.ID` constructor argument).
 */
export class IDs {
  private constructor() {
    // Not instantiable.
  }

  /**
   * Default characters used in IDs: alphanumeric chars.
   */
  static readonly DEFAULT_CHARS: string =
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
   * The default length of an ID, in characters.
   */
  static readonly DEFAULT_LENGTH: number = 8;

  /**
   * Returns a cryptographically random ID made of alphanumeric characters.
   *
   * @param options.length The length of the ID, in characters.
   * Default: `IDs.DEFAULT_LENGTH`.
   * @param options.chars The characters to draw from. Default: `IDs.DEFAULT_CHARS`.
   *
   * If specified, only the first 256 elements are used, and you achieve
   * about `log_2(chars.length)` bits of entropy per `length`.
   */
  static random(options?: { length?: number; chars?: string }): string {
    const length = options?.length ?? this.DEFAULT_LENGTH;
    const chars = options?.chars ?? this.DEFAULT_CHARS;

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
   * Returns a psuedorandom ID made of alphanumeric characters,
   * generated using `rng` from package [seedrandom](https://www.npmjs.com/package/seedrandom).
   *
   * Pseudorandom IDs with a fixed seed are recommended for
   * tests and benchmarks, to make them deterministic.
   *
   * @param options.length The length of the ID, in characters.
   * Default: `IDs.DEFAULT_LENGTH`.
   * @param options.chars The characters to draw from. Default: `IDs.DEFAULT_CHARS`.
   *
   * If specified, only the first 256 elements are used, and you achieve
   * about `log_2(chars.length)` bits of entropy per `length`.
   */
  static pseudoRandom(
    rng: seedrandom.prng,
    options?: { length?: number; chars?: string }
  ): string {
    const length = options?.length ?? this.DEFAULT_LENGTH;
    const chars = options?.chars ?? this.DEFAULT_CHARS;

    const arr = new Array<string>(length);
    for (let i = 0; i < arr.length; i++) {
      // Although we could pick chars without bias, we instead use the
      // same bias as `random`, for consistency.
      arr[i] = chars[Math.floor(rng() * 256) % chars.length];
    }
    return arr.join("");
  }
}
