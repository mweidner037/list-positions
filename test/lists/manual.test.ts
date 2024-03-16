import { assert } from "chai";
import { describe, test } from "mocha";
import seedrandom from "seedrandom";
import { BunchIDs, List, Order } from "../../src";
import { Checker } from "./util";

describe("lists - manual", () => {
  let rng!: seedrandom.PRNG;

  beforeEach(() => {
    rng = seedrandom("42");
  });

  // TODO: test lists containing min/max Position.

  describe("indexOfPosition", () => {
    let list!: List<number>;

    beforeEach(() => {
      const replicaID = BunchIDs.newReplicaID({ rng });
      list = new List(
        new Order({ newBunchID: BunchIDs.usingReplicaID(replicaID) })
      );
    });

    test("contains min and max", () => {
      list.set(Order.MIN_POSITION, 0);
      list.set(Order.MAX_POSITION, 1);

      assert.isTrue(list.has(Order.MIN_POSITION));
      assert.isTrue(list.has(Order.MAX_POSITION));

      assert.deepStrictEqual(
        [...list.positions()],
        [Order.MIN_POSITION, Order.MAX_POSITION]
      );

      assert.deepStrictEqual(list.positionAt(0), Order.MIN_POSITION);
      assert.deepStrictEqual(list.positionAt(1), Order.MAX_POSITION);

      assert.strictEqual(list.indexOfPosition(Order.MIN_POSITION), 0);
      assert.strictEqual(list.indexOfPosition(Order.MAX_POSITION), 1);

      const between = list.order.createPositions(
        Order.MIN_POSITION,
        Order.MAX_POSITION,
        1
      )[0];
      assert.strictEqual(list.indexOfPosition(between), -1);
      assert.strictEqual(list.indexOfPosition(between, "left"), 0);
      assert.strictEqual(list.indexOfPosition(between, "right"), 1);
    });
  });

  describe("set and delete", () => {
    let checker!: Checker;

    beforeEach(() => {
      const replicaID = BunchIDs.newReplicaID({ rng });
      checker = new Checker(
        new Order({ newBunchID: BunchIDs.usingReplicaID(replicaID) })
      );
    });

    describe("bulk set", () => {
      test("basic", () => {
        checker.insertAt(0, 0, 1, 2, 3);
        checker.set(checker.list.positionAt(0), 4, 5, 6, 7);
        checker.set(checker.list.positionAt(1), 8, 9);
      });

      test("replace partial", () => {
        // Test parentValuesBefore update logic by doing a set whose
        // replaced values are neither full nor empty, with interspersed children.
        checker.insertAt(0, ...new Array<number>(20).fill(31));
        const positions = [...checker.list.positions()];

        // Interspersed children.
        for (let i = 19; i >= 0; i -= 3) {
          checker.insertAt(i, 100 + i);
        }

        // Partially fill positions.
        for (let i = 0; i < 20; i += 2) {
          checker.delete(positions[i], 1);
        }

        // Overwrite partially-filled positions.
        checker.set(positions[4], ...new Array<number>(10).fill(25));
      });
    });

    describe("bulk delete", () => {
      test("basic", () => {
        checker.insertAt(0, 0, 1, 2, 3);
        checker.delete(checker.list.positionAt(1), 2);
        checker.delete(checker.list.positionAt(0), 4);
      });

      test("replace partial", () => {
        // Test parentValuesBefore update logic by doing a delete whose
        // replaced values are neither full nor empty, with interspersed children.
        checker.insertAt(0, ...new Array<number>(20).fill(31));
        const positions = [...checker.list.positions()];

        // Interspersed children.
        for (let i = 19; i >= 0; i -= 3) {
          checker.insertAt(i, 100 + i);
        }

        // Partially fill positions.
        for (let i = 0; i < 20; i += 2) {
          checker.delete(positions[i], 1);
        }

        // Overwrite partially-filled positions.
        checker.delete(positions[4], 10);
      });
    });
  });
});
