import { assert } from "chai";
import seedrandom from "seedrandom";
import { Cursors, IDs, PositionSource } from "../src";

describe("Cursors", () => {
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
        for (let i = 0; i <= list.length; i++) {
          const cursor = Cursors.fromIndex(i, list);
          assert.strictEqual(Cursors.toIndex(cursor, list), i);
          if (i !== 0) {
            // Insert a char in the next gap to the left, shifting the cursor.
            const list2 = [
              ...list.slice(0, i - 1),
              source.createBetween(list[i - 2], list[i - 1]),
              ...list.slice(i - 1),
            ];
            assert.strictEqual(Cursors.toIndex(cursor, list2), i + 1);
          }
          if (i !== list.length) {
            // Insert a char in the next gap to the right, which shouldn't shift the cursor.
            const list3 = [
              ...list.slice(0, i + 1),
              source.createBetween(list[i], list[i + 1]),
              ...list.slice(i),
            ];
            assert.strictEqual(Cursors.toIndex(cursor, list3), i);
          }
          // Insert a char in the cursor's gap, which
          // still shouldn't shift the cursor, since we
          // bind to the left char.
          const list4 = [
            ...list.slice(0, i),
            source.createBetween(list[i - 1], list[i]),
            ...list.slice(i),
          ];
          assert.strictEqual(Cursors.toIndex(cursor, list4), i);
        }
      });

      it("not present", () => {
        for (let i = 0; i <= list.length; i++) {
          // Set the cursor to a new position that we "delete"
          // (actually just leave not-present) in list.
          const listExtended = [
            ...list.slice(0, i),
            source.createBetween(list[i - 1], list[i]),
            ...list.slice(i),
          ];
          const cursor = Cursors.fromIndex(i + 1, listExtended);

          // In list, the index falls back by 1 to i.
          assert.strictEqual(Cursors.toIndex(cursor, list), i);
          if (i !== 0) {
            // Insert a char in the next gap to the left, shifting the cursor.
            const list2 = [
              ...list.slice(0, i - 1),
              source.createBetween(list[i - 2], list[i - 1]),
              ...list.slice(i - 1),
            ];
            assert.strictEqual(Cursors.toIndex(cursor, list2), i + 1);
          }
          if (i !== list.length) {
            // Insert a char in the next gap to the right, which shouldn't shift the cursor.
            const list3 = [
              ...list.slice(0, i + 1),
              source.createBetween(list[i], list[i + 1]),
              ...list.slice(i),
            ];
            assert.strictEqual(Cursors.toIndex(cursor, list3), i);
          }
          // Insert a char in the cursor's gap, which
          // may or may not shift the cursor, depending on how
          // the new position compares to the cursor's.
          const list4 = [
            ...list.slice(0, i),
            source.createBetween(list[i - 1], list[i]),
            ...list.slice(i),
          ];
          const index4 = Cursors.toIndex(cursor, list4);
          assert(i <= index4 && index4 <= i + 1);
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
