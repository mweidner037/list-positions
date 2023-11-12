/**
 * Utility functions for manipulating the "runs" used by List to store
 * its values efficiently (NodeData.runs in list.ts).
 *
 * Each "run" is either an array of present values (T[]) or a number
 * indicating that many deleted values. An array of these runs
 * then represents an array of present-or-deleted values.
 *
 * In a "runs" array, the elements always alternate between present
 * vs deleted runs (T[] vs number). If the last run would represent
 * deleted values (type number), it is omitted.
 */

export type ValuesAsRuns<T> = (T[] | number)[];

/**
 * Converts runs into an array of values, using undefined in place of
 * deleted values. Note that this is ambiguous if T includes undefined.
 *
 * Inverse: toRuns.
 */
export function toValues<T>(runs: ValuesAsRuns<T>): (T | undefined)[] {
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
export function toRuns<T>(values: (T | undefined)[]): ValuesAsRuns<T> {
  if (values.length === 0) return [];

  const runs: ValuesAsRuns<T> = [];
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
export function countPresent<T>(runs: ValuesAsRuns<T>): number {
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
export function getInRuns<T>(
  runs: ValuesAsRuns<T>,
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
export function mergeRuns<T>(...allRuns: ValuesAsRuns<T>[]): ValuesAsRuns<T> {
  const merged: ValuesAsRuns<T> = [];
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
export function splitRuns<T>(
  runs: ValuesAsRuns<T>,
  ...valueIndexes: number[]
): ValuesAsRuns<T>[] {
  const ans = new Array<ValuesAsRuns<T>>(valueIndexes.length + 1);
  let r = 0;
  let leftoverRun: T[] | number | undefined = undefined;
  for (let i = 0; i < valueIndexes.length; i++) {
    const slice: ValuesAsRuns<T> = [];
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
  const finalSlice: ValuesAsRuns<T> = [];
  ans[valueIndexes.length] = finalSlice;
  if (leftoverRun !== undefined) {
    finalSlice.push(leftoverRun);
    r++;
  }
  finalSlice.push(...runs.slice(r));

  return ans;
}
