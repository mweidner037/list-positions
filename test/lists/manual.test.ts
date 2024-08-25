import { assert } from "chai";
import { maybeRandomString } from "maybe-random-string";
import { describe, test } from "mocha";
import seedrandom from "seedrandom";
import { List, MAX_POSITION, MIN_POSITION, Order, Text } from "../../src";
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
      list = new List(new Order({ replicaID }));
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

  describe("cursors", () => {
    let list!: List<number>;

    beforeEach(() => {
      const replicaID = maybeRandomString({ prng });
      list = new List(new Order({ replicaID }));
      // 10 elements
      list.insertAt(0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
    });

    function bindIndependent(bind: "left" | "right" | undefined) {
      test("errors", () => {
        assert.throws(() => list.cursorAt(-1, bind));
        assert.throws(() => list.cursorAt(list.length + 1, bind));

        assert.doesNotThrow(() => list.cursorAt(0, bind));
        assert.doesNotThrow(() => list.cursorAt(list.length, bind));
      });

      test("inverses", () => {
        for (let i = 0; i <= list.length; i++) {
          const cursor = list.cursorAt(i, bind);
          assert.strictEqual(list.indexOfCursor(cursor, bind), i);
        }
      });

      test("delete on left", () => {
        const midCursor = list.cursorAt(5, bind);

        list.deleteAt(0);
        assert.strictEqual(list.indexOfCursor(midCursor, bind), 4);

        // Delete left-binding position.
        if (bind === "left") {
          assert.deepStrictEqual(midCursor, list.positionAt(3));
        }
        list.deleteAt(3);
        assert.strictEqual(list.indexOfCursor(midCursor, bind), 3);

        list.deleteAt(0);
        assert.strictEqual(list.indexOfCursor(midCursor, bind), 2);

        list.clear();
        assert.strictEqual(list.indexOfCursor(midCursor, bind), 0);
      });

      test("delete on right", () => {
        const midCursor = list.cursorAt(5, bind);

        list.deleteAt(9);
        assert.strictEqual(list.indexOfCursor(midCursor, bind), 5);

        // Delete right-binding position.
        if (bind === "right") {
          assert.deepStrictEqual(midCursor, list.positionAt(5));
        }
        list.deleteAt(5);
        assert.strictEqual(list.indexOfCursor(midCursor, bind), 5);

        list.deleteAt(7);
        assert.strictEqual(list.indexOfCursor(midCursor, bind), 5);

        list.clear();
        assert.strictEqual(list.indexOfCursor(midCursor, bind), 0);
      });
    }

    describe("bind left", () => {
      bindIndependent("left");

      test("insert in gap", () => {
        const midCursor = list.cursorAt(5, "left");

        // Gap at cursor: bind dependent.
        list.insertAt(5, 100);
        assert.strictEqual(list.indexOfCursor(midCursor, "left"), 5);

        // Gap before cursor: always shifts.
        list.insertAt(4, 101);
        assert.strictEqual(list.indexOfCursor(midCursor, "left"), 6);

        // Gap after cursor: never shifts.
        list.insertAt(7, 102);
        assert.strictEqual(list.indexOfCursor(midCursor, "left"), 6);
      });

      test("min position", () => {
        const cursor = list.cursorAt(0, "left");
        assert.deepStrictEqual(cursor, MIN_POSITION);

        list.insertAt(0, 101);
        assert.strictEqual(list.indexOfCursor(cursor, "left"), 0);

        list.deleteAt(0, 2);
        assert.strictEqual(list.indexOfCursor(cursor, "left"), 0);

        list.clear();
        assert.strictEqual(list.indexOfCursor(cursor, "left"), 0);
      });
    });

    describe("bind right", () => {
      bindIndependent("right");

      test("insert in gap", () => {
        const midCursor = list.cursorAt(5, "right");

        // Gap at cursor: bind dependent.
        list.insertAt(5, 100);
        assert.strictEqual(list.indexOfCursor(midCursor, "right"), 6);

        // Gap before cursor: always shifts.
        list.insertAt(5, 101);
        assert.strictEqual(list.indexOfCursor(midCursor, "right"), 7);

        // Gap after cursor: never shifts.
        list.insertAt(8, 102);
        assert.strictEqual(list.indexOfCursor(midCursor, "right"), 7);
      });

      test("max position", () => {
        const cursor = list.cursorAt(list.length, "right");
        assert.deepStrictEqual(cursor, MAX_POSITION);

        list.insertAt(list.length, 101);
        assert.strictEqual(list.indexOfCursor(cursor, "right"), list.length);

        list.deleteAt(list.length - 2, 2);
        assert.strictEqual(list.indexOfCursor(cursor, "right"), list.length);

        list.clear();
        assert.strictEqual(list.indexOfCursor(cursor, "right"), list.length);
      });
    });

    describe("bind default", () => {
      bindIndependent(undefined);

      test("is left", () => {
        assert.deepStrictEqual(list.cursorAt(5), list.cursorAt(5, "left"));
      });
    });
  });

  describe("set and delete", () => {
    let checker!: Checker;

    beforeEach(() => {
      const replicaID = maybeRandomString({ prng });
      checker = new Checker(new Order({ replicaID }));
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

  describe("Text embeds", () => {
    interface Embed {
      a?: string;
      b?: string;
    }

    let text!: Text<Embed>;

    beforeEach(() => {
      const replicaID = maybeRandomString({ prng });
      text = new Text(new Order({ replicaID }));
    });

    test("slice and sliceWithEmbeds", () => {
      // Create mis-aligned bunches and string sections.
      text.insertAt(0, "hello world");
      text.setAt(5, { a: "foo" });
      text.insertAt(8, "RLD WO");

      assert.strictEqual(text.slice(), "hello\uFFFCwoRLD WOrld");
      assert.deepStrictEqual(text.sliceWithEmbeds(), [
        "hello",
        { a: "foo" },
        "woRLD WOrld",
      ]);
    });

    test("save and load", () => {
      // Create mis-aligned bunches and string sections.
      text.insertAt(0, "hello world");
      text.setAt(5, { a: "foo" });
      text.insertAt(8, "RLD WO");

      // Check the exact saved state.
      const bunchId0 = text.positionAt(0).bunchID;
      const bunchId1 = text.positionAt(8).bunchID;
      assert.notStrictEqual(bunchId0, bunchId1);
      assert.deepStrictEqual(text.save(), {
        [bunchId0]: ["hello", { a: "foo" }, "world"],
        [bunchId1]: ["RLD WO"],
      });

      // Load on another instance.
      const text2 = new Text<Embed>(text.order);
      text2.load(text.save());

      assert.deepStrictEqual([...text.entries()], [...text2.entries()]);
      assert.deepStrictEqual(text.save(), text2.save());
      assert.deepStrictEqual(text.saveOutline(), text2.saveOutline());
    });

    test("saveOutline and loadOutline", () => {
      // Create mis-aligned bunches and string sections.
      text.insertAt(0, "hello world");
      text.setAt(5, { a: "foo" });
      text.insertAt(8, "RLD WO");

      const text2 = new Text<Embed>(text.order);
      text2.loadOutline(text.saveOutline(), text.sliceWithEmbeds());

      assert.deepStrictEqual([...text.entries()], [...text2.entries()]);
      assert.deepStrictEqual(text.save(), text2.save());
      assert.deepStrictEqual(text.saveOutline(), text2.saveOutline());
    });
  });
});
