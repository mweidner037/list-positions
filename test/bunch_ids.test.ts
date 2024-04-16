import { assert } from "chai";
import { maybeRandomString } from "maybe-random-string";
import { describe, test } from "mocha";
import seedrandom from "seedrandom";
import { BunchIDs } from "../src";

describe("BunchIDs", () => {
  let prng!: seedrandom.PRNG;

  beforeEach(() => {
    prng = seedrandom("42");
  });

  describe("usingReplicaID", () => {
    test("distinct", () => {
      const previous = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const newBunchID = BunchIDs.usingReplicaID(
          maybeRandomString({ prng, length: 10 })
        );
        for (let j = 0; j < 100; j++) {
          const bunchID = newBunchID();
          assert(!previous.has(bunchID));
          previous.add(bunchID);
        }
      }
    });

    test("parses", () => {
      for (let i = 0; i < 100; i++) {
        const replicaID = maybeRandomString({ prng, length: 10 });
        const newBunchID = BunchIDs.usingReplicaID(replicaID);
        for (let j = 0; j < 100; j++) {
          const bunchID = newBunchID();
          assert.deepStrictEqual(BunchIDs.parseUsingReplicaID(bunchID), [
            replicaID,
            j,
          ]);
        }
      }
    });
  });
});
