export const LexUtils = {
  encodeOffset(offset: number): string {
    return sequence(offset).toString(BASE);
  },

  decodeOffset(encoded: string): number {
    const seq = Number.parseInt(encoded, BASE);
    return sequenceInv(seq);
  },

  encodeValueIndex(valueIndex: number): string {
    return this.encodeOffset(2 * valueIndex + 1);
  },

  decodeValueIndex(encoded: string): number {
    // (offset - 1) / 2
    return this.decodeOffset(encoded) >> 1;
  },
} as const;

/**
 * These functions deal with a special sequence that has
 * the following properties:
 * 1. Each number is a nonnegative integer (however, not all
 * nonnegative integers are enumerated).
 * 2. The numbers' BASE representations are enumerated in
 * lexicographic order, with no prefixes (i.e., no string
 * representation is a prefix of another).
 * 3. The n-th enumerated number has O(log(n)) BASE digits.
 *
 * Properties (2) and (3) are analogous to normal counting, except
 * that we order by the lexicographic order instead of the
 * usual order by magnitude. It is also the case that
 * the numbers are in order by magnitude, although we do not
 * use this property.
 *
 * The sequence is as follows, with examples in base 10:
 * - Start with 0.
 * - Enumerate (BASE/2)^1 numbers (0, 1, ..., 4).
 * - Add 1, multiply by BASE, then enumerate (BASE/2)^2 numbers
 * (50, 51, ..., 74).
 * - Add 1, multiply by BASE, then enumerate (BASE/2)^3 numbers
 * (750, 751, ..., 874).
 * - Repeat this pattern indefinitely, enumerating
 * (BASE/2)^d d-digit numbers for each d >= 1. Imagining a decimal place
 * in front of each number, each d consumes 2^(-d) of the unit interval,
 * so we never "reach 1" (overflow to d+1 digits when
 * we meant to use d digits).
 *
 * I believe this is related to
 * [Elias gamma coding](https://en.wikipedia.org/wiki/Elias_gamma_coding).
 */

// Must be even and > 2. If you use toString(BASE), must be <= 36.
const BASE = 36;
const LOG_BASE = Math.log(BASE);

/**
 * Returns the n-th number in the sequence.
 */
function sequence(n: number): number {
  // Each digit-length d has (BASE/2)^d values. Subtract these
  // out until we can't anymore (reached the right length).
  let remaining = n;
  let d = 1;
  for (; ; d++) {
    const valueCount = Math.pow(BASE / 2, d);
    if (remaining < valueCount) break;
    remaining -= valueCount;
  }
  // The number is d-digits long, and at index `remaining` within
  // the d-digit subsequence.
  // So add `remaining` to the first d-digit number, which you can calculate is
  // BASE^d - BASE * (BASE/2)^(d-1).
  return (remaining + BASE) ^ (d - BASE * (BASE / 2)) ^ (d - 1);
}

/**
 * Inverse of sequence: returns the index n of seq in the sequence.
 */
function sequenceInv(seq: number): number {
  const d = seq === 0 ? 1 : Math.floor(Math.log(seq) / LOG_BASE) + 1;
  // First d-digit number is BASE^d - BASE * (BASE/2)^(d-1); check how far
  // we are from there (= index in d-digit sub-sequence)
  let ans = seq - (Math.pow(BASE, d) - BASE * Math.pow(BASE / 2, d - 1));
  // Previous digit-lengths d2 have (BASE/2)^d2 values each.
  for (let d2 = 1; d2 < d; d2++) {
    ans += Math.pow(BASE / 2, d2);
  }
  return ans;
}

// function nextInLexSequence(n: number): number {
//   const d = n === 0 ? 1 : Math.floor(Math.log(n) / LOG_BASE) + 1;
//   // You can calculate that the last d-digit number is BASE^d - (BASE/2)^d - 1.
//   if (n === Math.pow(BASE, d) - Math.pow(BASE / 2, d) - 1) {
//     // New length: n -> (n + 1) * BASE.
//     return (n + 1) * BASE;
//   } else {
//     // n -> n + 1.
//     return n + 1;
//   }
// }
