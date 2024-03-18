import { assert } from "chai";
import { maybeRandomString } from "maybe-random-string";
import { describe, test } from "mocha";
import seedrandom from "seedrandom";
import { List, MAX_POSITION, MIN_POSITION, Order } from "../../src";
import { Checker } from "./util";

describe("lists - manual", () => {
  let prng!: seedrandom.PRNG;

  beforeEach(() => {
    prng = seedrandom("42");
  });

  // TODO: test lists containing min/max Position.

  describe("indexOfPosition", () => {
    let list!: List<number>;

    beforeEach(() => {
      const replicaID = maybeRandomString({ prng });
      list = new List(new Order({ replicaID: replicaID }));
    });

    test("contains min and max", () => {
      list.set(MIN_POSITION, 0);
      list.set(MAX_POSITION, 1);

      assert.isTrue(list.has(MIN_POSITION));
      assert.isTrue(list.has(MAX_POSITION));

      assert.deepStrictEqual(
        [...list.positions()],
        [MIN_POSITION, MAX_POSITION]
      );

      assert.deepStrictEqual(list.positionAt(0), MIN_POSITION);
      assert.deepStrictEqual(list.positionAt(1), MAX_POSITION);

      assert.strictEqual(list.indexOfPosition(MIN_POSITION), 0);
      assert.strictEqual(list.indexOfPosition(MAX_POSITION), 1);

      const between = list.order.createPositions(
        MIN_POSITION,
        MAX_POSITION,
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
      const replicaID = maybeRandomString({ prng });
      checker = new Checker(new Order({ replicaID: replicaID }));
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

  describe("items", () => {
    let list!: List<number>;

    beforeEach(() => {
      let bunchIdCount = 0;
      list = new List(new Order({ newBunchID: () => `b${bunchIdCount++}` }));
    });

    test("whole list", () => {
      list.insertAt(0, 0, 1, 2, 3);
      assert.deepStrictEqual(
        [...list.items()],
        [[{ bunchID: "b0", innerIndex: 0 }, [0, 1, 2, 3]]]
      );

      list.insertAt(2, 5, 6, 7, 8);
      assert.deepStrictEqual(
        [...list.items()],
        [
          [{ bunchID: "b0", innerIndex: 0 }, [0, 1]],
          [{ bunchID: "b1", innerIndex: 0 }, [5, 6, 7, 8]],
          [{ bunchID: "b0", innerIndex: 2 }, [2, 3]],
        ]
      );

      list.delete({ bunchID: "b1", innerIndex: 2 });
      assert.deepStrictEqual(
        [...list.items()],
        [
          [{ bunchID: "b0", innerIndex: 0 }, [0, 1]],
          [{ bunchID: "b1", innerIndex: 0 }, [5, 6]],
          [{ bunchID: "b1", innerIndex: 3 }, [8]],
          [{ bunchID: "b0", innerIndex: 2 }, [2, 3]],
        ]
      );
    });

    test("range args", () => {
      list.insertAt(0, 0, 1, 2, 3);
      assert.deepStrictEqual(
        [...list.items(0)],
        [[{ bunchID: "b0", innerIndex: 0 }, [0, 1, 2, 3]]]
      );
      assert.deepStrictEqual(
        [...list.items(undefined, 3)],
        [[{ bunchID: "b0", innerIndex: 0 }, [0, 1, 2]]]
      );
      assert.deepStrictEqual(
        [...list.items(1, 3)],
        [[{ bunchID: "b0", innerIndex: 1 }, [1, 2]]]
      );

      list.insertAt(2, 5, 6, 7, 8);
      assert.deepStrictEqual(
        [...list.items(0, 3)],
        [
          [{ bunchID: "b0", innerIndex: 0 }, [0, 1]],
          [{ bunchID: "b1", innerIndex: 0 }, [5]],
        ]
      );
      assert.deepStrictEqual(
        [...list.items(1, 7)],
        [
          [{ bunchID: "b0", innerIndex: 1 }, [1]],
          [{ bunchID: "b1", innerIndex: 0 }, [5, 6, 7, 8]],
          [{ bunchID: "b0", innerIndex: 2 }, [2]],
        ]
      );

      list.delete({ bunchID: "b1", innerIndex: 2 });
      assert.deepStrictEqual(
        [...list.items(3, 7)],
        [
          [{ bunchID: "b1", innerIndex: 1 }, [6]],
          [{ bunchID: "b1", innerIndex: 3 }, [8]],
          [{ bunchID: "b0", innerIndex: 2 }, [2, 3]],
        ]
      );
      assert.deepStrictEqual(
        [...list.items(2, 3)],
        [[{ bunchID: "b1", innerIndex: 0 }, [5]]]
      );
    });

    test("fromItems inverse", () => {
      list.insertAt(0, 0, 1, 2, 3);
      list.insertAt(2, 5, 6, 7, 8);
      list.delete({ bunchID: "b1", innerIndex: 2 });

      let newList = List.fromItems(list.items(), list.order);
      assert.deepStrictEqual([...newList.entries()], [...list.entries()]);
      assert.deepStrictEqual([...newList.items()], [...list.items()]);

      for (const [start, end] of [
        [0, 4],
        [2, 5],
        [3, 7],
        [4, 5],
      ]) {
        newList = List.fromItems(list.items(start, end), list.order);
        assert.deepStrictEqual(
          [...newList.entries()],
          [...list.entries(start, end)]
        );
        assert.deepStrictEqual(
          [...newList.items()],
          [...list.items(start, end)]
        );
      }
    });
  });
});
