import seedrandom from "seedrandom";
import { BunchIDs, Order } from "../../src";
import { Checker } from "./util";

describe("lists - fuzz", () => {
  describe("single user", () => {
    let rng!: seedrandom.PRNG;
    let checker!: Checker;

    beforeEach(() => {
      rng = seedrandom("42");
      const replicaID = BunchIDs.newReplicaID({ rng });
      checker = new Checker(
        new Order({ newBunchID: BunchIDs.usingReplicaID(replicaID) })
      );
    });

    it("single-char at methods", function () {
      this.timeout(5000);
      for (let i = 0; i < 500; i++) {
        if (checker.list.length === 0 || rng() < 0.5) {
          // 1/2: insertAt
          checker.insertAt(
            Math.floor(rng() * (checker.list.length + 1)),
            Math.floor(rng() * 10000)
          );
          // eslint-disable-next-line no-dupe-else-if
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

    it("bulk ops", function () {
      this.timeout(10000);
      for (let i = 0; i < 200; i++) {
        if (checker.list.length === 0 || rng() < 0.5) {
          // 1/2: insertAt bulk
          checker.insertAt(
            Math.floor(rng() * (checker.list.length + 1)),
            ...new Array<number>(1 + Math.floor(rng() * 10)).fill(
              Math.floor(rng() * 10000)
            )
          );
          // eslint-disable-next-line no-dupe-else-if
        } else if (rng() < 0.5) {
          // 1/4: setAt
          checker.setAt(
            Math.floor(rng() * checker.list.length),
            Math.floor(rng() * 10000)
          );
        } else {
          // 1/4: deleteAt bulk
          const index = Math.floor(rng() * checker.list.length);
          const count = Math.min(
            checker.list.length - index,
            Math.floor(rng() * 10)
          );
          checker.deleteAt(index, count);
        }
      }
    });
  });
});
