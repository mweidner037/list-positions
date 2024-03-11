import { assert } from "chai";
import { describe, test } from "mocha";
import seedrandom from "seedrandom";
import { BunchIDs } from "../src";

describe("BunchIDs", () => {
  let rng!: seedrandom.PRNG;

  beforeEach(() => {
    rng = seedrandom("42");
  });

  describe("newReplicaID", () => {
    test("random", () => {
      const previous = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const replicaID = BunchIDs.newReplicaID();
        assert.lengthOf(replicaID, 8);
        BunchIDs.validate(replicaID);
        // All distinct
        assert(!previous.has(replicaID), replicaID);
        previous.add(replicaID);
      }
    });

    test("pseudorandom", () => {
      const previous = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const replicaID = BunchIDs.newReplicaID({ rng });
        assert.lengthOf(replicaID, 8);
        BunchIDs.validate(replicaID);
        // All distinct
        assert(!previous.has(replicaID), replicaID);
        previous.add(replicaID);
      }
    });

    test("different length", () => {
      const replicaID = BunchIDs.newReplicaID({ length: 6 });
      assert.lengthOf(replicaID, 6);
      const replicaID2 = BunchIDs.newReplicaID({ length: 6, rng });
      assert.lengthOf(replicaID2, 6);
    });

    test("different chars", () => {
      const replicaID = BunchIDs.newReplicaID({ chars: "abcdef" });
      assert.lengthOf(replicaID, 8);
      for (const char of replicaID) {
        assert(char.search(/[a-f]/) !== -1);
      }
      const replicaID2 = BunchIDs.newReplicaID({ chars: "abcdef", rng });
      assert.lengthOf(replicaID2, 8);
      for (const char of replicaID2) {
        assert(char.search(/[a-f]/) !== -1);
      }
    });
  });

  describe("usingReplicaID", () => {
    test("validates", () => {
      const newBunchID = BunchIDs.usingReplicaID(
        BunchIDs.newReplicaID({ rng })
      );
      for (let i = 0; i < 10000; i++) {
        BunchIDs.validate(newBunchID());
      }
    });

    test("distinct", () => {
      const previous = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const newBunchID = BunchIDs.usingReplicaID(
          BunchIDs.newReplicaID({ rng })
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
        const replicaID = BunchIDs.newReplicaID({ rng });
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
