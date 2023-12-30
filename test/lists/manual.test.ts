import { assert } from "chai";
import { describe, test } from "mocha";
import seedrandom from "seedrandom";
import { BunchIDs, List, Order } from "../../src";

describe("lists - manual", () => {
  let rng!: seedrandom.prng;

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
});
