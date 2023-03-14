import * as crypto from "crypto";
import { LastInternal, precond } from "./util";

/**
 * Utitilies for generating `PositionSource` IDs.
 */
export class IDs {
  private constructor() {
    // Not instantiable.
  }

  /**
   * Default characters used in IDs: alphanumeric chars.
   */
  static readonly DEFAULT_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  /**
   * The default length of an ID, in characters.
   *
   * Rationale for value 10:
   * Each character of the ID gives us ~6 bits of entropy,
   * for a total of ~60 bits.  This gives a < 1%
   * probability that two connected `PositionSource`s
   * will ever choose the same IDs, even if we
   * consider the total probability across 100,000,000
   * documents with 10,000 IDs each
   * (= 10 users * 1,000 days * 1 ID/user/day).
   */
  static readonly DEFAULT_LENGTH = 10;

  /**
   * Returns a cryptographically random ID made of alphanumeric characters.
   *
   * @param options.length The length of the ID, in characters.
   * Default: `DEFAULT_LENGTH`.
   * @param options.chars The characters to draw from. Default: `DEFAULT_CHARS`.
   *
   * If specified, only the first 256 elements are used, and you achieve
   * about `floor(log_2(chars.length))` bits of entropy per `length`.
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
   * generated using `rng`.
   *
   * @param options.length The length of the ID, in characters.
   * Default: `DEFAULT_LENGTH`.
   * @param options.chars The characters to draw from. Default: `DEFAULT_CHARS`.
   *
   * If specified, only the first 256 elements are used, and you achieve
   * about `floor(log_2(chars.length))` bits of entropy per `length`.
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

  /**
   * Throws an error if `ID` does not satisfy the requirements from
   * `PositionSource`'s constructor:
   * - All characters are lexicographically greater than `','` (code point 44).
   * - The first character is lexicographically less than `'~'` (code point 126).
   */
  static validate(ID: string): void {
    for (const char of ID) {
      precond(char > ",", "All ID chars must be greater than ',':", ID);
    }
    precond(ID < LastInternal, "ID must be less than", LastInternal, ":", ID);
  }
}
