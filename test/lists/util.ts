import { assert } from "chai";
import createRBTree, { Tree } from "functional-red-black-tree";
import {
  AbsList,
  List,
  Order,
  Outline,
  Position,
  lexicographicString,
  expandPositions,
} from "../../src";

/**
 * Compares a List (and an equivalent Outline and AbsList) to another library's
 * ordered map after each operation, to make sure it had the expected effect.
 */
export class Checker {
  readonly list: List<number>;
  readonly outline: Outline;
  readonly absList: AbsList<number>;
  // Lexicographic strings.
  tree: Tree<string, number>;

  constructor(readonly order: Order) {
    this.list = new List(order);
    this.absList = new AbsList();
    this.outline = new Outline(order);
    this.tree = createRBTree();
  }

  check() {
    // Check that all list values are equivalent.
    assert.deepStrictEqual([...this.list.values()], this.tree.values);
    assert.deepStrictEqual([...this.absList.values()], this.tree.values);

    // Check that all list positions are equivalent.
    const positions = [...this.list.positions()];
    assert.deepStrictEqual([...this.outline.positions()], positions);
    assert.deepStrictEqual(
      [...this.absList.positions()],
      positions.map((pos) => this.order.abs(pos))
    );
    assert.deepStrictEqual(
      this.tree.keys,
      positions.map((pos) => lexicographicString(this.order.abs(pos)))
    );

    // Check that individual accessors agree.
    // We skip AbsList b/c it is the same code as List.
    assert.strictEqual(this.list.length, this.tree.length);
    assert.strictEqual(this.outline.length, this.tree.length);
    for (let i = 0; i < this.list.length; i++) {
      const iter = this.tree.at(i);
      const pos = this.list.positionAt(i);
      assert.strictEqual(this.list.getAt(i), iter.value!);
      assert.deepStrictEqual(
        iter.key!,
        lexicographicString(this.order.abs(pos))
      );
      assert.strictEqual(this.list.get(pos), iter.value);
      assert.strictEqual(this.list.indexOfPosition(pos), i);
      assert.deepStrictEqual(this.outline.positionAt(i), pos);
      assert.strictEqual(this.outline.indexOfPosition(pos), i);
    }
  }

  set(startPos: Position, ...sameBunchValues: number[]): void {
    this.list.set(startPos, ...sameBunchValues);
    this.outline.add(startPos, sameBunchValues.length);
    const positions = expandPositions(startPos, sameBunchValues.length);
    for (let i = 0; i < positions.length; i++) {
      const absPos = this.order.abs(positions[i]);
      this.absList.set(absPos, sameBunchValues[i]);
      const lex = lexicographicString(absPos);
      this.tree = this.tree.find(lex).remove().insert(lex, sameBunchValues[i]);
    }

    assert(this.list.has(startPos));
    this.check();
  }

  setAt(index: number, value: number) {
    // console.log("\tsetAt", index, value, this.list.slice());
    this.list.setAt(index, value);
    this.absList.setAt(index, value);
    const key = this.tree.at(index).key!;
    this.tree = this.tree.find(key).remove().insert(key, value);

    this.check();
  }

  delete(startPos: Position, sameBunchCount: number): void {
    this.list.delete(startPos, sameBunchCount);
    this.outline.delete(startPos, sameBunchCount);
    const positions = expandPositions(startPos, sameBunchCount);
    for (let i = 0; i < positions.length; i++) {
      const absPos = this.order.abs(positions[i]);
      this.absList.delete(absPos);
      const lex = lexicographicString(absPos);
      this.tree = this.tree.find(lex).remove();
    }

    assert(!this.list.has(startPos));
    this.check();
  }

  deleteAt(index: number, count = 1) {
    // console.log("\tdeleteAt", index, this.list.slice());
    this.list.deleteAt(index, count);
    this.outline.deleteAt(index, count);
    this.absList.deleteAt(index, count);
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      keys.push(this.tree.at(index + i).key!);
    }
    for (const key of keys) {
      this.tree = this.tree.find(key).remove();
    }

    this.check();
  }

  clear() {
    this.list.clear();
    this.outline.clear();
    this.absList.clear();
    this.tree = createRBTree();

    this.check();
  }

  insert(prevPos: Position, ...values: number[]): void {
    // Since insert creates Positions on the shared order, we can only
    // call it one of the data structures.
    const [startPos] = this.list.insert(prevPos, ...values);
    this.outline.add(startPos, values.length);
    const positions = expandPositions(startPos, values.length);
    for (let i = 0; i < positions.length; i++) {
      const absPos = this.order.abs(positions[i]);
      this.absList.set(absPos, values[i]);
      const lex = lexicographicString(absPos);
      this.tree = this.tree.find(lex).remove().insert(lex, values[i]);
    }

    assert(this.list.has(startPos));
    this.check();
  }

  insertAt(index: number, ...values: number[]) {
    // console.log("\tinsertAt", index, values[0], this.list.slice());
    const before = this.tree.values;
    // Since insertAt creates Positions on the shared order, we can only
    // call it one of the data structures.
    const [startPos] = this.list.insertAt(index, ...values);
    // console.log(startPos);
    this.outline.add(startPos, values.length);
    const positions = expandPositions(startPos, values.length);
    for (let i = 0; i < positions.length; i++) {
      const absPos = this.order.abs(positions[i]);
      this.absList.set(absPos, values[i]);
      const lex = lexicographicString(absPos);
      this.tree = this.tree.find(lex).remove().insert(lex, values[i]);
    }

    // insertAt should be equivalent to a splice.
    before.splice(index, 0, ...values);
    assert.deepStrictEqual(this.tree.values, before);
    this.check();
  }
}
