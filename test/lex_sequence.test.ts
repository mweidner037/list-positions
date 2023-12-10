import { assert } from "chai";
import { describe, test } from "mocha";
import { BASE, LOG_BASE, sequence, sequenceInv } from "../src/lex_utils";

// Tests for the special sequence used by LexUtils.

function nextInLexSequence(n: number): number {
  const d = n === 0 ? 1 : Math.floor(Math.log(n) / LOG_BASE) + 1;
  // You can calculate that the last d-digit number is BASE^d - (BASE/2)^d - 1.
  if (n === Math.pow(BASE, d) - Math.pow(BASE / 2, d) - 1) {
    // New length: n -> (n + 1) * BASE.
    return (n + 1) * BASE;
  } else {
    // n -> n + 1.
    return n + 1;
  }
}

describe("Lex sequence", () => {
  // The first 10k numbers in the sequence.
  const first10k: number[] = [];

  before(() => {
    first10k.push(0);
    for (let i = 1; i < 10000; i++) {
      first10k.push(nextInLexSequence(first10k.at(-1)!));
    }
  });

  test("in lex order, no prefixes", () => {
    for (let i = 1; i < first10k.length; i++) {
      const a = first10k[i - 1].toString(BASE);
      const b = first10k[i].toString(BASE);
      assert(a < b, `${i - 1}: ${a}    ${b}`);
      assert(!b.startsWith(a), `${i - 1}: ${a}    ${b}`);
    }
  });

  test("log length", () => {
    const last = first10k.at(-1)!.toString(BASE);
    assert.isBelow(last.length, 5);
  });

  test("sequence()", () => {
    for (let i = 0; i < first10k.length; i++) {
      assert.strictEqual(sequence(i), first10k[i]);
    }
  });

  test("sequenceInv()", () => {
    for (let i = 0; i < first10k.length; i++) {
      assert.strictEqual(sequenceInv(first10k[i]), i);
    }
  });
});
