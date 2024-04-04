import { assert } from "chai";
import createRBTree, { Tree } from "functional-red-black-tree";
import {
  LexList,
  LexPosition,
  List,
  Order,
  Outline,
  Position,
  expandPositions,
} from "../../src";

/**
 * Compares a List (and an equivalent Outline and LexList) to another library's
 * ordered map after each operation, to make sure it had the expected effect.
 */
export class Checker {
  readonly list: List<number>;
  readonly outline: Outline;
  readonly lexList: LexList<number>;
  tree: Tree<LexPosition, number>;

  constructor(readonly order: Order) {
    this.list = new List(order);
    this.lexList = new LexList(order);
    this.outline = new Outline(order);
    this.tree = createRBTree();
  }

  check() {
    // Check that all list values are equivalent.
    assert.deepStrictEqual([...this.list.values()], this.tree.values);
    assert.deepStrictEqual([...this.lexList.values()], this.tree.values);

    // Check that all list positions are equivalent.
    assert.deepStrictEqual([...this.lexList.positions()], this.tree.keys);
    const positions = this.tree.keys.map((lexPos) => this.order.unlex(lexPos));
    assert.deepStrictEqual([...this.list.positions()], positions);
    assert.deepStrictEqual([...this.outline.positions()], positions);

    // Check that individual accessors agree.
    // We skip LexList b/c it is the same code as List.
    assert.strictEqual(this.list.length, this.tree.length);
    assert.strictEqual(this.outline.length, this.tree.length);
    for (let i = 0; i < this.tree.length; i++) {
      const iter = this.tree.at(i);
      const pos = this.order.unlex(iter.key!);
      assert.strictEqual(this.list.getAt(i), iter.value!);
      assert.deepStrictEqual(this.list.positionAt(i), pos);
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
      const lexPos = this.order.lex(positions[i]);
      this.lexList.set(lexPos, sameBunchValues[i]);
      this.tree = this.tree
        .find(lexPos)
        .remove()
        .insert(lexPos, sameBunchValues[i]);
    }

    assert(this.list.has(startPos));
    this.check();
  }

  setAt(index: number, value: number) {
    // console.log("\tsetAt", index, value, this.list.slice());
    this.list.setAt(index, value);
    this.lexList.setAt(index, value);
    const key = this.tree.at(index).key!;
    this.tree = this.tree.find(key).remove().insert(key, value);

    this.check();
  }

  delete(startPos: Position, sameBunchCount: number): void {
    this.list.delete(startPos, sameBunchCount);
    this.outline.delete(startPos, sameBunchCount);
    const positions = expandPositions(startPos, sameBunchCount);
    for (let i = 0; i < positions.length; i++) {
      const lexPos = this.order.lex(positions[i]);
      this.lexList.delete(lexPos);
      this.tree = this.tree.find(lexPos).remove();
    }

    assert(!this.list.has(startPos));
    this.check();
  }

  deleteAt(index: number, count = 1) {
    // console.log("\tdeleteAt", index, this.list.slice());
    this.list.deleteAt(index, count);
    this.outline.deleteAt(index, count);
    this.lexList.deleteAt(index, count);
    const keys: LexPosition[] = [];
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
    this.lexList.clear();
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
      const lexPos = this.order.lex(positions[i]);
      this.lexList.set(lexPos, values[i]);
      this.tree = this.tree.find(lexPos).remove().insert(lexPos, values[i]);
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
      const lexPos = this.order.lex(positions[i]);
      this.lexList.set(lexPos, values[i]);
      this.tree = this.tree.find(lexPos).remove().insert(lexPos, values[i]);
    }

    // insertAt should be equivalent to a splice.
    before.splice(index, 0, ...values);
    assert.deepStrictEqual(this.tree.values, before);
    this.check();
  }
}
