import { Node, NodeDesc } from "./node";
import { Order } from "./order";
import { Position } from "./position";

/**
 * List data associated to a Node.
 */
type NodeData<T> = {
  /**
   * The total number of present values at this
   * node and its descendants.
   */
  total: number;
  /**
   * The values (or not) at the node's positions,
   * in order from left to right. Represented as
   * an array of "runs" of present values (T[]) or
   * not present values (number).
   *
   * The items always alternate types. If the last
   * item would be a number (deleted), it is omitted.
   */
  runs: (T[] | number)[];
};

/**
 * Converts runs into an array of values, using undefined in place of
 * deleted values. Note that this is ambiguous if T includes undefined.
 *
 * Inverse: toRuns.
 */
function toValues<T>(runs: (T[] | number)[]): (T | undefined)[] {
  const values: (T | undefined)[] = [];
  for (const run of runs) {
    if (typeof run === "number") {
      for (let i = 0; i < run; i++) values.push(undefined);
    } else values.push(...run);
  }
  return values;
}

/**
 * Converts values into runs, treating undefined as a delete value.
 * Note that this is ambiguous if T includes undefined.
 *
 * Inverse: toValues.
 */
function toRuns<T>(values: (T | undefined)[]): (T[] | number)[] {
  if (values.length === 0) return [];

  const runs: (T[] | number)[] = [];
  let currentRun = values[0] === undefined ? 1 : [values[0] as T];
  for (let i = 1; i < values.length; i++) {
    const value = values[i];
    if (value === undefined) {
      if (typeof currentRun === "number") currentRun++;
      else {
        runs.push(currentRun);
        currentRun = 1;
      }
    } else {
      if (typeof currentRun !== "number") currentRun.push(value);
      else {
        runs.push(currentRun);
        currentRun = [value];
      }
    }
  }
  runs.push(currentRun);

  return runs;
}

/**
 * @returns Number of *present* values in runs.
 */
function countPresent<T>(runs: (T[] | number)[]): number {
  let count = 0;
  for (const run of runs) {
    if (typeof run !== "number") count += run.length;
  }
  return count;
}

/**
 * Returns info about the value at valueIndex in runs:
 * [value - undefined if not present, whether it's present,
 * count of present values before it]
 * @returns [value at position, whether position is present,
 * number of present values within node
 * (not descendants) strictly prior to position]
 */
function getInRuns<T>(
  runs: (T[] | number)[],
  valueIndex: number
): [value: T | undefined, isPresent: boolean, beforeCount: number] {
  let remaining = valueIndex;
  let beforeCount = 0;
  for (const run of runs) {
    if (typeof run === "number") {
      if (remaining < run) {
        return [undefined, false, beforeCount];
      } else remaining -= run;
    } else {
      if (remaining < run.length) {
        return [run[remaining], true, beforeCount + remaining];
      } else {
        remaining -= run.length;
        beforeCount += run.length;
      }
    }
  }
  // If we get here, then the valueIndex is after all present values.
  return [undefined, false, beforeCount];
}

/**
 * Note: may modify array runs in-place.
 * So stop using the inputs after calling.
 */
function mergeRuns<T>(...allRuns: (T[] | number)[][]): (T[] | number)[] {
  const merged: (T[] | number)[] = [];
  for (let i = 0; i < allRuns.length; i++) {
    const currentRuns = allRuns[i];
    // currentRuns[0]
    if (currentRuns.length === 0) continue;
    const nextRun = currentRuns[0];
    const prevRun = merged.at(-1);
    if (prevRun !== undefined && typeof prevRun === typeof nextRun) {
      // We need to merge nextRun into prevRun.
      if (typeof nextRun === "number") {
        (merged[merged.length - 1] as number) += nextRun;
      } else (prevRun as T[]).push(...nextRun);
    } else merged.push(nextRun);
    // currentRuns[1+]
    for (let j = 1; j < currentRuns.length; j++) {
      merged.push(currentRuns[j]);
    }
  }

  // If the last run is a number (deleted), omit it.
  if (merged.length !== 0 && typeof merged[merged.length - 1] === "number") {
    merged.pop();
  }

  return merged;
}

/**
 * Note: may copy array runs by-reference, which might then be changed later.
 * So stop using the input after calling.
 */
function splitRuns<T>(
  runs: (T[] | number)[],
  ...valueIndexes: number[]
): (T[] | number)[][] {
  const ans = new Array<(T[] | number)[]>(valueIndexes.length + 1);
  let r = 0;
  let leftoverRun: T[] | number | undefined = undefined;
  for (let i = 0; i < valueIndexes.length; i++) {
    const slice: (T[] | number)[] = [];
    ans[i] = slice;

    let remaining =
      i === 0 ? valueIndexes[i] : valueIndexes[i] - valueIndexes[i - 1];
    while (r < runs.length) {
      const run: T[] | number = leftoverRun ?? runs[r];
      leftoverRun = undefined;

      if (typeof run === "number") {
        if (run <= remaining) {
          slice.push(run);
          remaining -= run;
          r++;
          if (remaining === 0) break;
        } else {
          // run > remaining
          slice.push(remaining);
          leftoverRun = run - remaining;
          remaining = 0;
          break;
        }
      } else {
        // run has type T[]
        if (run.length <= remaining) {
          slice.push(run);
          remaining -= run.length;
          r++;
          if (remaining === 0) break;
        } else {
          // run.length > remaining
          slice.push(run.slice(0, remaining));
          leftoverRun = run.slice(remaining);
          remaining = 0;
          break;
        }
      }
    }

    if (remaining > 0) {
      // We reached the end of runs before filling slice.
      // Finish with a deleted run.
      if (slice.length !== 0 && typeof slice[slice.length - 1] === "number") {
        (slice[slice.length - 1] as number) += remaining;
      } else slice.push(remaining);
    }
  }

  // Final slice: everything left in runs.
  const finalSlice: (T[] | number)[] = [];
  ans[valueIndexes.length] = finalSlice;
  if (leftoverRun !== undefined) {
    finalSlice.push(leftoverRun);
    r++;
  }
  finalSlice.push(...runs.slice(r));

  return ans;
}

/**
 * Type used in LocalList.slicesAndChildren.
 *
 * Either a slice of values in a Node that are also contiguous in the list order,
 * or a Node child.
 */
type SliceOrChild<T> =
  | {
      type: "slice";
      /** Use item.slice(start, end) */
      values: T[];
      start: number;
      end: number;
      /** valueIndex of first value */
      valueIndex: number;
    }
  | {
      type: "child";
      child: Node;
      /** Always non-zero (zero total children are skipped). */
      total: number;
    };

/**
 * A local (non-collaborative) data structure mapping [[Position]]s to
 * values, in list order.
 *
 * You can use a LocalList to maintain a sorted, indexable view of a
 * [[CValueList]], [[CList]], or [[CText]]'s values.
 * For example, when using a [[CList]],
 * you could store its archived values in a LocalList.
 * That would let you iterate over the archived values in list order.
 *
 * To construct a LocalList that uses an existing list's positions, pass
 * that list's `totalOrder` to our constructor.
 *
 * It is *not* safe to modify a LocalList while iterating over it. The iterator
 * will attempt to throw an exception if it detects such modification,
 * but this is not guaranteed.
 *
 * @typeParam T The value type.
 */
export class List<T> {
  /**
   * TODO: delete empty ones (total = 0).
   */
  private state = new Map<Node, NodeData<T>>();

  /**
   * Constructs a LocalList whose allowed [[Position]]s are given by
   * `source`.
   *
   * Using positions that were not generated by `source` (or a replica of
   * `source`) will cause undefined behavior.
   *
   * @param order The source for positions that may be used with this
   * LocalList.
   */
  constructor(readonly order: Order) {}

  /**
   * Sets the value at position.
   *
   * @returns Whether their was an existing value at position.
   */
  set(pos: Position, value: T): boolean {
    const node = this.order.getNodeFor(pos);
    let data = this.state.get(node);
    if (data === undefined) {
      data = { total: 0, runs: [] };
      this.state.set(node, data);
    }

    const [before, existing, after] = splitRuns(
      data.runs,
      pos.valueIndex,
      pos.valueIndex + 1
    );
    data.runs = mergeRuns(before, [[value]], after);

    const existingCount = countPresent(existing);
    if (existingCount === 0) this.updateTotals(node, 1);
    return existingCount !== 0;
  }

  /**
   * Sets values in startPos's Node starting at startPos.valueIndex.
   * Use this for bulk loading (e.g., load all of a Node's values if
   * you store values by Node).
   *
   * Undefined entries in
   * the array are interpreted as deleted values; note that this is
   * unsafe if T includes undefined.
   *
   * Note that values might not be contiguous in the list.
   */
  setBulk(startPos: Position, values: (T | undefined)[]): void {
    const node = this.order.getNodeFor(startPos);
    let data = this.state.get(node);
    if (data === undefined) {
      data = { total: 0, runs: [] };
      this.state.set(node, data);
    }

    const [before, existing, after] = splitRuns(
      data.runs,
      startPos.valueIndex,
      startPos.valueIndex + values.length
    );
    const valuesRuns = toRuns(values);
    data.runs = mergeRuns(before, valuesRuns, after);

    const existingCount = countPresent(existing);
    const delta = countPresent(valuesRuns) - existingCount;
    if (delta !== 0) this.updateTotals(node, delta);
  }

  /**
   * Sets the value at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  setAt(index: number, value: T): void {
    this.set(this.positionAt(index), value);
  }

  /**
   * Deletes the given position, making it no longer
   * present in this list.
   *
   * @returns Whether the position was actually deleted, i.e.,
   * it was initially present.
   */
  delete(pos: Position): boolean {
    const node = this.order.getNodeFor(pos);
    const data = this.state.get(node);
    if (data === undefined) {
      // Already not present.
      return false;
    }

    const [before, existing, after] = splitRuns(
      data.runs,
      pos.valueIndex,
      pos.valueIndex + 1
    );
    data.runs = mergeRuns(before, [1], after);

    const existingCount = countPresent(existing);
    if (existingCount === 1) this.updateTotals(node, -1);
    return existingCount !== 0;
  }

  /**
   * Deletes the value at index.
   *
   * @throws If index is not in `[0, this.length)`.
   */
  deleteAt(index: number): void {
    this.delete(this.positionAt(index));
  }

  /**
   * Changes total by delta for node and all of its ancestors.
   * Creates NodeValues as needed.
   *
   * delta must not be 0.
   */
  private updateTotals(node: Node, delta: number): void {
    for (
      let current: Node | null = node;
      current !== null;
      current = current.parentNode
    ) {
      let data = this.state.get(current);
      if (data === undefined) {
        data = { total: 0, runs: [] };
        this.state.set(current, data);
      }
      data.total += delta;
    }
  }

  /**
   * Deletes every value in the list.
   *
   * The Order is unaffected (retains all Nodes).
   */
  clear() {
    this.state.clear();
  }

  insert(
    prevPos: Position,
    value: T
  ): { pos: Position; newNodeDesc: NodeDesc | null } {
    const ret = this.order.createPosition(prevPos);
    this.set(ret.pos, value);
    return ret;
  }

  insertAt(
    index: number,
    value: T
  ): { pos: Position; newNodeDesc: NodeDesc | null } {
    const prevPos =
      index === 0 ? this.order.startPosition : this.positionAt(index - 1);
    return this.insert(prevPos, value);
  }

  /**
   * Returns the value at position, or undefined if it is not currently present
   * ([[hasPosition]] returns false).
   */
  get(pos: Position): T | undefined {
    return this.getInNode(this.order.getNodeFor(pos), pos.valueIndex)[0];
  }

  getBulk(startPos: Position, count: number): (T | undefined)[] {
    const node = this.order.getNodeFor(startPos);
    const data = this.state.get(node);
    if (data === undefined) {
      return new Array<T | undefined>(count).fill(undefined);
    }

    const [, existing] = splitRuns(
      data.runs,
      startPos.valueIndex,
      startPos.valueIndex + count
    );
    return toValues(existing);
  }

  /**
   * Returns the value currently at index.
   *
   * @throws If index is not in `[0, this.length)`.
   * Note that this differs from an ordinary Array,
   * which would instead return undefined.
   */
  getAt(index: number): T {
    return this.get(this.positionAt(index))!;
  }

  /**
   * Returns whether position is currently present in the list,
   * i.e., its value is present.
   */
  has(pos: Position): boolean {
    return this.getInNode(this.order.getNodeFor(pos), pos.valueIndex)[1];
  }

  /**
   * Returns info about the value at valueIndex in node:
   * [value - undefined if not present, whether it's present,
   * count of node's present values before it]
   */
  private getInNode(
    node: Node,
    valueIndex: number
  ): [value: T | undefined, isPresent: boolean, nodeValuesBefore: number] {
    const runs = this.state.get(node)?.runs;
    if (runs === undefined) {
      // No values within node.
      return [undefined, false, 0];
    }
    return getInRuns(runs, valueIndex);
  }

  /**
   * Returns the current index of position.
   *
   * If position is not currently present in the list
   * ([[hasPosition]] returns false), then the result depends on searchDir:
   * - "none" (default): Returns -1.
   * - "left": Returns the next index to the left of position.
   * If there are no values to the left of position,
   * returns -1.
   * - "right": Returns the next index to the right of position.
   * If there are no values to the right of position,
   * returns [[length]].
   *
   * To find the index where a position would be if
   * present, use `searchDir = "right"`.
   */
  indexOfPosition(
    pos: Position,
    searchDir: "none" | "left" | "right" = "none"
  ): number {
    const node = this.order.getNodeFor(pos);
    const [, isPresent, nodeValuesBefore] = this.getInNode(
      node,
      pos.valueIndex
    );
    // Will be the total number of values prior to position.
    let valuesBefore = nodeValuesBefore;

    // Add totals for child nodes that come before valueIndex.
    // These are precisely the left children with
    // parentValueIndex <= valueIndex.
    for (const child of node.children()) {
      if (child.parentValueIndex > pos.valueIndex) break;
      valuesBefore += this.total(child);
    }

    // Walk up the tree and add totals for sibling values & nodes
    // that come before our ancestor.
    for (
      let current = node;
      current.parentNode !== null;
      current = current.parentNode
    ) {
      // Sibling values that come before current.
      valuesBefore += this.getInNode(
        current.parentNode,
        current.parentValueIndex
      )[2];
      // Sibling nodes that come before current.
      for (const child of current.parentNode.children()) {
        if (child === current) break;
        valuesBefore += this.total(child);
      }
    }

    if (isPresent) return valuesBefore;
    else {
      switch (searchDir) {
        case "none":
          return -1;
        case "left":
          return valuesBefore - 1;
        case "right":
          return valuesBefore;
      }
    }
  }

  /**
   * Returns the position currently at index.
   */
  positionAt(index: number): Position {
    if (index < 0 || index >= this.length) {
      throw new Error(`Index out of bounds: ${index} (length: ${this.length})`);
    }
    let remaining = index;
    let node = this.order.rootNode;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      nodeLoop: {
        for (const next of this.slicesAndChildren(node)) {
          if (next.type === "slice") {
            const length = next.end - next.start;
            if (remaining < length) {
              // Answer is values[remaining].
              return {
                creatorID: node.creatorID,
                timestamp: node.timestamp,
                valueIndex: next.valueIndex + remaining,
              };
            } else remaining -= length;
          } else {
            if (remaining < next.total) {
              // Recurse into child.
              node = next.child;
              break nodeLoop;
            } else remaining -= next.total;
          }
        }
        // We should always end by the break statement (recursion), not by
        // the for loop's finishing.
        throw new Error("Internal error: failed to find index among children");
      }
    }
  }

  /**
   * The length of the list.
   */
  get length() {
    return this.total(this.order.rootNode);
  }

  /** Returns an iterator for values in the list, in list order. */
  [Symbol.iterator](): IterableIterator<T> {
    return this.values();
  }

  /**
   * Returns an iterator of [pos, value, index] tuples for every
   * value in the list, in list order.
   */
  *entries(): IterableIterator<[pos: Position, value: T, index: number]> {
    if (this.length === 0) return;

    let index = 0;
    let node: Node | null = this.order.rootNode;
    // Manage our own stack instead of recursing, to avoid stack overflow
    // in deep trees.
    const stack: IterableIterator<SliceOrChild<T>>[] = [
      // root will indeed have total != 0 since we checked length != 0.
      this.slicesAndChildren(this.order.rootNode),
    ];
    while (node !== null) {
      const iter = stack[stack.length - 1];
      const next = iter.next();
      if (next.done) {
        stack.pop();
        node = node.parentNode;
      } else {
        const valuesOrChild = next.value;
        if (valuesOrChild.type === "slice") {
          for (let i = 0; i < valuesOrChild.end - valuesOrChild.start; i++) {
            yield [
              {
                creatorID: node.creatorID,
                timestamp: node.timestamp,
                valueIndex: valuesOrChild.valueIndex + i,
              },
              valuesOrChild.values[valuesOrChild.start + i],
              index,
            ];
            index++;
          }
        } else {
          // Recurse into child.
          node = valuesOrChild.child;
          stack.push(this.slicesAndChildren(node));
        }
      }
    }
  }

  /**
   * Yields non-trivial values and Node children
   * for node, in list order. This is used when
   * iterating over the list.
   *
   * Specifically, it yields:
   * - Slices of a Node's values that are present and contiguous in the list order.
   * - Node children with non-zero total.
   *
   * together with enough info to infer their starting valueIndex's.
   *
   * @throws If valuesByNode does not have an entry for node.
   */
  private *slicesAndChildren(node: Node): IterableIterator<SliceOrChild<T>> {
    const runs = this.state.get(node)!.runs;
    const children = [...node.children()];
    let childIndex = 0;
    let startValueIndex = 0;
    for (const run of runs) {
      const runSize = typeof run === "number" ? run : run.length;
      // After (next startValueIndex)
      const endValueIndex = startValueIndex + runSize;
      // Next value to yield
      let valueIndex = startValueIndex;
      for (; childIndex < children.length; childIndex++) {
        const child = children[childIndex];
        if (child.parentValueIndex >= endValueIndex) {
          // child comes after run. End the loop and visit child
          // during the next run.
          break;
        }
        const total = this.total(child);
        if (total !== 0) {
          // Emit child. If needed, first emit values that come before it.
          if (valueIndex < child.parentValueIndex) {
            if (typeof run !== "number") {
              yield {
                type: "slice",
                values: run,
                start: valueIndex - startValueIndex,
                end: child.parentValueIndex - startValueIndex,
                valueIndex,
              };
            }
            valueIndex = child.parentValueIndex;
          }
          yield { type: "child", child, total };
        }
      }

      // Emit remaining values in run.
      if (typeof run !== "number" && valueIndex < endValueIndex) {
        yield {
          type: "slice",
          values: run,
          start: valueIndex - startValueIndex,
          end: runSize,
          valueIndex,
        };
      }
      startValueIndex = endValueIndex;
    }
    // Visit remaining children (left children among a possible deleted
    // final run (which runs omits) and right children).
    for (; childIndex < children.length; childIndex++) {
      const child = children[childIndex];
      const total = this.total(child);
      if (this.total(child) !== 0) {
        yield { type: "child", child, total };
      }
    }
  }

  /**
   * Returns the total number of present values at this
   * node and its descendants.
   */
  private total(node: Node): number {
    return this.state.get(node)?.total ?? 0;
  }

  /** Returns an iterator for values in the list, in list order. */
  *values(): IterableIterator<T> {
    // OPT: do own walk and yield* value runs, w/o encoding positions.
    for (const [, value] of this.entries()) yield value;
  }

  /** Returns an iterator for present positions, in list order. */
  *positions(): IterableIterator<Position> {
    for (const [pos] of this.entries()) yield pos;
  }

  /**
   * Returns a copy of a section of this list, as an array.
   * For both start and end, a negative index can be used to indicate an offset from the end of the list.
   * For example, -2 refers to the second to last element of the list.
   * @param start The beginning index of the specified portion of the list.
   * If start is undefined, then the slice begins at index 0.
   * @param end The end index of the specified portion of the list. This is exclusive of the element at the index 'end'.
   * If end is undefined, then the slice extends to the end of the list.
   */
  slice(start?: number, end?: number): T[] {
    const len = this.length;
    if (start === undefined || start < -len) {
      start = 0;
    } else if (start < 0) {
      start += len;
    } else if (start >= len) {
      return [];
    }
    if (end === undefined || end >= len) {
      end = len;
    } else if (end < -len) {
      end = 0;
    } else if (end < 0) {
      end += len;
    }
    if (end <= start) return [];

    // Optimize common case (slice())
    // TODO: opt with Order.items(...)
    if (start === 0 && end === len) {
      return [...this.values()];
    } else {
      // OPT: optimize.
      const ans = new Array<T>(end - start);
      for (let i = 0; i < end - start; i++) {
        ans[i] = this.getAt(start + i);
      }
      return ans;
    }
  }
  /**
   * Returns saved state describing the current state of this LocalList,
   * including its values.
   *
   * The saved state may later be passed to [[load]]
   * on a new instance of LocalList, to reconstruct the
   * same list state.
   *
   * TODO: only saves values, not Order. "Natural" format; order
   * guarantees.
   */
  save(): ListSavedState<T> {
    const savedStatePre: ListSavedState<T> = {};
    for (const [node, data] of this.state) {
      if (data.runs.length === 0) continue;

      let byCreator = savedStatePre[node.creatorID];
      if (byCreator === undefined) {
        byCreator = {};
        savedStatePre[node.creatorID] = byCreator;
      }

      // TODO
    }

    // Make a (shallow) copy of savedStatePre that touches all
    // creatorIDs in lexicographic order, to ensure consistent JSON
    // serialization order for identical states. (JSON field order is: non-negative
    // integers in numeric order, then string keys in creation order.)
    const sortedCreatorIDs = Object.keys(savedStatePre);
    sortedCreatorIDs.sort();
    const savedState: ListSavedState<T> = {};
    for (const creatorID of sortedCreatorIDs) {
      savedState[creatorID] = savedStatePre[creatorID];
    }

    return savedState;
  }

  /**
   * Loads saved state. The saved state must be from
   * a call to [[save]] on a LocalList whose `source`
   * constructor argument was a replica of this's
   * `source`, so that we can understand the
   * saved state's Positions.
   *
   * TODO: overwrites whole state
   *
   * @param savedState Saved state from a List's
   * [[save]] call.
   */
  load(savedState: ListSavedState<T>): void {
    this.clear();

    // TODO

    // TODO: updateTotals
  }
}

// TODO: change back to "obvious" rep? To make it easier to
// interpret yourself. Main reason for optimized rep is iterating
// through values in order, which is not necessary at rest.
export type ListSavedState<T> = {
  [creatorID: string]: {
    [timestamp: number]: {
      [valueIndex: number]: T;
    };
  };
};

// TODO: check "OPT" comments
