import seedrandom from "seedrandom";
import { BunchIDs, Order } from "../../src";
import { Checker } from "./util";

describe("lists - fuzz", () => {
  describe("single user", () => {
    let rng!: seedrandom.prng;
    let checker!: Checker;

    beforeEach(() => {
      rng = seedrandom("42");
      const replicaID = BunchIDs.newReplicaID({ rng });
      checker = new Checker(
        new Order({ newBunchID: BunchIDs.usingReplicaID(replicaID) })
      );
    });

    it("single-char at methods", () => {
      for (let i = 0; i < 100; i++) {
        if (checker.list.length === 0 || rng() < 0.5) {
          // 1/2: insertAt
          checker.insertAt(
            Math.floor(rng() * (checker.list.length + 1)),
            Math.floor(rng() * 10000)
          );
        } else if (rng() < 0.5) {
          // 1/4: setAt
          checker.setAt(
            Math.floor(rng() * checker.list.length),
            Math.floor(rng() * 10000)
          );
        } else {
          // 1/4: deleteAt
          checker.deleteAt(Math.floor(rng() * checker.list.length));
        }
      }
    });
  });
});
