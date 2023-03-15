import { assert } from "chai";
import seedrandom from "seedrandom";
import { findPosition, IDs, PositionSource } from "../src";

describe("findPosition", () => {
  let rng!: seedrandom.prng;
  let source!: PositionSource;

  beforeEach(() => {
    rng = seedrandom("42");
    source = new PositionSource({ ID: IDs.pseudoRandom(rng) });
  });

  function testLength(len: number) {
    let list!: string[];

    describe(`length ${len}`, () => {
      beforeEach(() => {
        list = [];
        for (let i = 0; i < len; i++) {
          list.push(source.createBetween(list.at(-1), undefined));
        }
      });

      it("present", () => {
        for (let i = 0; i < list.length; i++) {
          assert.deepStrictEqual(findPosition(list[i], list), {
            index: i,
            isPresent: true,
          });
        }
      });

      it("not present", () => {
        for (let i = 0; i <= list.length; i++) {
          const newPos = source.createBetween(list[i - 1], list[i]);
          // newPos would be at index i if present (between the current
          // i - 1 & i).
          assert.deepStrictEqual(findPosition(newPos, list), {
            index: i,
            isPresent: false,
          });
        }
      });
    });
  }

  testLength(32);
  testLength(31);
  testLength(33);
  testLength(23);
  testLength(1);
  testLength(0);
});
