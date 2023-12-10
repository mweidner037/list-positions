import { assert } from "chai";
import { describe, test } from "mocha";
import {
  ArrayItemManager,
  SparseItems,
  SparseItemsManager,
} from "../src/internal/sparse_items";

const man = new SparseItemsManager(new ArrayItemManager<string>());

function validate(items: SparseItems<string[]>, trimmed = false): void {
  // Alternation rule.
  for (let i = 0; i < items.length; i++) {
    if (i % 2 === 0) assert.isArray(items[i]);
    else assert.typeOf(items[i], "number");
  }

  // No empty items except the first.
  for (let i = 1; i < items.length; i++) {
    if (i % 2 === 0) assert.isNotEmpty(items[i]);
    else assert.notStrictEqual(items[i], 0);
  }

  if (trimmed && items.length !== 0) {
    // Check trimmed.
    assert(items.length % 2 === 1, "Ends in deleted item");
    if (items.length === 1) assert.isNotEmpty(items[0]);
  }
}

function getLength(items: SparseItems<string[]>): number {
  let ans = 0;
  for (let i = 0; i < items.length; i++) {
    if (i % 2 === 0) ans += (items[i] as string[]).length;
    else ans += items[i] as number;
  }
  return ans;
}

function checkEquals(
  items: SparseItems<string[]>,
  values: (string | null)[],
  trimmed = false
) {
  validate(items, trimmed);

  assert.strictEqual(getLength(items), values.length, "length");
  let beforeCount = 0;
  for (let i = 0; i < values.length; i++) {
    const info = man.getInfo(items, i);
    if (values[i] === null)
      assert.deepStrictEqual(info, [undefined, false, beforeCount]);
    else {
      assert.deepStrictEqual(info, [values[i]!, true, beforeCount]);
      beforeCount++;
    }
  }

  // getInfo should also work on indexes past the length.
  for (let i = 0; i < 10; i++) {
    assert.deepStrictEqual(man.getInfo(items, values.length + i), [
      undefined,
      false,
      beforeCount,
    ]);
  }
}

class Checker {
  items: SparseItems<string[]>;
  values: (string | null)[];

  constructor(length = 0) {
    this.items = man.new(length);
    this.values = new Array(length).fill(null);
  }

  check() {
    checkEquals(this.items, this.values);
  }

  trim() {
    this.items = man.trim(this.items);
    while (this.values.length !== 0 && this.values.at(-1) === null) {
      this.values.pop();
    }
    this.check();
  }

  set(index: number, newValues: string[]) {
    const replacedValues = new Array<string | null>(newValues.length);
    for (let i = 0; i < newValues.length; i++) {
      replacedValues[i] = this.values[index + i] ?? null;
    }

    let replaced: SparseItems<string[]>;
    [this.items, replaced] = man.set(this.items, index, newValues.slice());

    // Update this.values in parallel.
    for (let i = this.values.length; i < index + newValues.length; i++) {
      this.values.push(null);
    }
    for (let i = 0; i < newValues.length; i++) {
      this.values[index + i] = newValues[i];
    }

    // Check agreement.
    this.check();
    checkEquals(replaced, replacedValues);
  }

  delete(index: number, count: number) {
    const replacedValues = new Array<string | null>(count);
    for (let i = 0; i < count; i++) {
      replacedValues[i] = this.values[index + i] ?? null;
    }

    let replaced: SparseItems<string[]>;
    [this.items, replaced] = man.delete(this.items, index, count);

    // Update this.values in parallel.
    for (let i = this.values.length; i < index + count; i++) {
      this.values.push(null);
    }
    for (let i = 0; i < count; i++) {
      this.values[index + i] = null;
    }

    // Check agreement.
    this.check();
    checkEquals(replaced, replacedValues);
  }
}

describe("Sparse Array", () => {
  test("new", () => {
    checkEquals(man.new(), []);
    checkEquals(man.new(3), [null, null, null]);
  });

  test("set once", () => {
    let items = man.new();
    let replaced: SparseItems<string[]>;

    [items, replaced] = man.set(items, 0, ["a", "b", "c"]);
    checkEquals(items, ["a", "b", "c"]);
    checkEquals(replaced, [null, null, null]);
  });

  test("delete once", () => {
    let items = man.new();
    let replaced: SparseItems<string[]>;

    [items, replaced] = man.delete(items, 0, 3);
    items = man.trim(items);
    checkEquals(items, [], true);
    checkEquals(replaced, [null, null, null]);

    [items, replaced] = man.delete(items, 2, 3);
    items = man.trim(items);
    checkEquals(items, [], true);
    checkEquals(replaced, [null, null, null]);
  });

  test("set twice", () => {
    const values = ["a", "b", "c", "d", "e"];

    for (let i = 0; i < 5; i++) {
      for (let j = 1; j < 5 - i; j++) {
        const checker = new Checker();
        checker.set(0, values);

        checker.set(i, new Array(j).fill("x"));
      }
    }
  });

  test("set and delete", () => {
    const values = ["a", "b", "c", "d", "e"];

    for (let i = 0; i < 5; i++) {
      for (let j = 1; j < 5 - i; j++) {
        const checker = new Checker();
        checker.set(0, values);

        checker.delete(i, j);
      }
    }
  });
});
