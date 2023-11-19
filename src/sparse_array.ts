/**
 * Utility functions for manipulating the "runs" used by List to store
 * its values efficiently (NodeData.runs in list.ts).
 *
 * Each "run" is either a non-empty array of present values (T[]) or a
 * positive integer indicating that many deleted values.
 * An array of these runs then represents an array of present-or-deleted values.
 *
 * In a "runs" array, the elements always alternate between present
 * vs deleted runs (T[] vs number). If the last run would represent
 * deleted values (type number), it is omitted.
 */
type Runs<T> = (T[] | number)[];

function runLength<T>(run: T[] | number): number {
  if (typeof run === "number") return run;
  else return run.length;
}

/**
 * Converts runs into an object mapping index to value.
 *
 * Inverse: objectToRuns.
 */
function runsToObject<T>(runs: Runs<T>): {
  [index: number]: T;
} {
  const obj: { [index: number]: T } = {};
  let index = 0;
  for (const run of runs) {
    if (typeof run === "number") index += run;
    else {
      for (const value of run) {
        obj[index] = value;
        index++;
      }
    }
  }
  return obj;
}

/**
 * Converts an object mapping index to value into runs.
 *
 * Inverse: runsToObject.
 */
function objectToRuns<T>(obj: { [index: number]: T }): Runs<T> {
  const runs: Runs<T> = [];

  let lastIndex = -1;
  // Here we use the guarantee that an object's nonnegative integer keys
  // are visited first, in numeric order.
  for (const [key, value] of Object.entries(obj)) {
    const index = Number.parseInt(key);
    if (isNaN(index)) {
      // We're done visiting integer keys.
      break;
    }
    const gap = index - lastIndex - 1;
    if (gap !== 0) runs.push(gap, [value]);
    else {
      if (runs.length === 0) runs.push([value]);
      else (runs[runs.length - 1] as T[]).push(value);
    }
    lastIndex = index;
  }

  return runs;
}

/**
 * Merges the given runs-arrays into a single runs-arrays, in order.
 *
 * Note: this may modify array runs in-place.
 * So stop using the inputs after calling.
 */
function mergeRuns<T>(...allRuns: Runs<T>[]): Runs<T> {
  const merged: Runs<T> = [];
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
 * Splits the given runs-array at the given indexes,
 * returning `indexes.length + 1` runs-arrays.
 *
 * Note: this may copy array runs by-reference, which might then be changed later.
 * So stop using the input after calling.
 */
function splitRuns<T>(runs: Runs<T>, ...indexes: number[]): Runs<T>[] {
  const ans = new Array<Runs<T>>(indexes.length + 1);
  let r = 0;
  let leftoverRun: T[] | number | undefined = undefined;
  for (let i = 0; i < indexes.length; i++) {
    const slice: Runs<T> = [];
    ans[i] = slice;

    let remaining = i === 0 ? indexes[i] : indexes[i] - indexes[i - 1];
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
  const finalSlice: Runs<T> = [];
  ans[indexes.length] = finalSlice;
  if (leftoverRun !== undefined) {
    finalSlice.push(leftoverRun);
    r++;
  }
  finalSlice.push(...runs.slice(r));

  return ans;
}

export class SparseArray<T> {
  /**
   * @param runs Stored by-reference (we wrap it).
   */
  private constructor(private runs: Runs<T> = []) {}

  static new<T>(): SparseArray<T> {
    return new SparseArray();
  }

  /**
   * The number of *present* values.
   */
  get size(): number {
    let ans = 0;
    for (const run of this.runs) {
      if (typeof run !== "number") ans += run.length;
    }
    return ans;
  }

  get length(): number {
    let ans = 0;
    for (const run of this.runs) {
      ans += runLength(run);
    }
    return ans;
  }

  /**
   *
   * @param startIndex
   * @param valuesOrLength May be copied by-reference, so not safe afterwards.
   * @returns The replaced values, padded with deleted values to match values.length.
   */
  set(startIndex: number, valuesOrLength: T[] | number): SparseArray<T> {
    const [before, existing, after] = splitRuns(
      this.runs,
      startIndex,
      startIndex + runLength(valuesOrLength)
    );
    this.runs = mergeRuns(before, [valuesOrLength], after);
    return new SparseArray(existing);
  }

  /**
   * Removes any deleted entries at the end, possibly reducing this.length.
   */
  trim() {
    if (typeof this.runs.at(-1) === "number") this.runs.pop();
  }

  /**
   * Returns info about the value at index in runs:
   * [value - undefined if not present, whether it's present,
   * count of present values before it]
   * @returns [value at position, whether position is present,
   * number of present values within node
   * (not descendants) strictly prior to position]
   */
  getInfo(
    index: number
  ): [value: T | undefined, isPresent: boolean, beforeCount: number] {
    let remaining = index;
    let beforeCount = 0;
    for (const run of this.runs) {
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
    // If we get here, then the index is after all present values.
    return [undefined, false, beforeCount];
  }

  /**
   * Starting at startIndex (inclusive), find the count-th present value
   * and return its index.
   *
   * @throws If such an index is not found.
   */
  findPresentIndex(startIndex: number, count: number): number {
    let startRemaining = startIndex;
    let countRemaining = count;
    let ans = startIndex;
    for (const run of this.runs) {
      const len = runLength(run);
      if (startRemaining < len) {
        // startIndex is at run[startRemaining].
        if (typeof run !== "number") {
          // Search the rest of run.
          const searchedLength = run.length - startRemaining;
          if (countRemaining < searchedLength) {
            return ans + countRemaining;
          } else {
            countRemaining -= searchedLength;
            ans += searchedLength;
          }
        }
      } else startRemaining -= len;
    }
    throw new Error(
      `Internal error: findPresentIndex result not found (startIndex=${startIndex}, count=${count}, runs=${JSON.stringify(
        this.runs
      )}`
    );
  }

  newSlicer(): Slicer<T> {
    return new Slicer(this.runs);
  }

  save(): { [index: number]: T } {
    return runsToObject(this.runs);
  }

  load(savedState: { [index: number]: T }): void {
    this.runs = objectToRuns(savedState);
  }
}

export class Slicer<T> {
  private index = 0;
  private r = 0;
  private withinR = 0;

  /**
   * Private
   */
  constructor(private readonly runs: Runs<T>) {}

  /**
   * Iterator must be consumed before you call nextSlice again.
   */
  *nextSlice(end: number | null): IterableIterator<[index: number, value: T]> {
    const runs = this.runs;
    for (; this.r < runs.length; this.r++) {
      if (end !== null && this.index >= end) return;

      const run = runs[this.r];
      if (typeof run === "number") {
        this.index += run;
      } else {
        for (; this.withinR < run.length; this.withinR++) {
          if (this.index === end) return;
          yield [this.index, run[this.withinR]];
          this.index++;
        }
        this.withinR = 0;
      }
    }
  }
}
