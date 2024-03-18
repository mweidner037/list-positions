import { maybeRandomString } from "maybe-random-string";
import seedrandom from "seedrandom";
import { Order } from "../../src";
import { Checker } from "./util";

describe("lists - fuzz", () => {
  describe("single user", () => {
    let prng!: seedrandom.PRNG;
    let checker!: Checker;

    beforeEach(() => {
      prng = seedrandom("42");
      const replicaID = maybeRandomString({ prng });
      checker = new Checker(new Order({ replicaID: replicaID }));
    });

    it("single-char at methods", function () {
      this.timeout(5000);
      for (let i = 0; i < 500; i++) {
        if (checker.list.length === 0 || prng() < 0.5) {
          // 1/2: insertAt
          checker.insertAt(
            Math.floor(prng() * (checker.list.length + 1)),
            Math.floor(prng() * 10000)
          );
          // eslint-disable-next-line no-dupe-else-if
        } else if (prng() < 0.5) {
          // 1/4: setAt
          checker.setAt(
            Math.floor(prng() * checker.list.length),
            Math.floor(prng() * 10000)
          );
        } else {
          // 1/4: deleteAt
          checker.deleteAt(Math.floor(prng() * checker.list.length));
        }
      }
    });

    it("bulk ops", function () {
      this.timeout(10000);
      for (let i = 0; i < 200; i++) {
        if (checker.list.length === 0 || prng() < 0.5) {
          // 1/2: insertAt bulk
          checker.insertAt(
            Math.floor(prng() * (checker.list.length + 1)),
            ...new Array<number>(1 + Math.floor(prng() * 10)).fill(
              Math.floor(prng() * 10000)
            )
          );
          // eslint-disable-next-line no-dupe-else-if
        } else if (prng() < 0.5) {
          // 1/4: setAt
          checker.setAt(
            Math.floor(prng() * checker.list.length),
            Math.floor(prng() * 10000)
          );
        } else {
          // 1/4: deleteAt bulk
          const index = Math.floor(prng() * checker.list.length);
          const count = Math.min(
            checker.list.length - index,
            Math.floor(prng() * 10)
          );
          checker.deleteAt(index, count);
        }
      }
    });
  });
});
