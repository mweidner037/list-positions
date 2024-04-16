/**
 * Normalizes the range so that start < end and they are both in bounds
 * (possibly start=end=length), following Array.slice.
 */
export function normalizeSliceRange(
  length: number,
  start?: number,
  end?: number
): [start: number, end: number] {
  if (start === undefined || start < -length) start = 0;
  else if (start < 0) start += length;
  else if (start >= length) return [length, length];

  if (end === undefined || end >= length) end = length;
  else if (end < -length) end = 0;
  else if (end < 0) end += length;

  if (end <= start) return [start, start];
  return [start, end];
}

/**
 * Base (radix) for stringifying the counter in bunchIDs that are formatted as dot IDs.
 *
 * Higher is better (shorter nodeIDs), but JavaScript only supports up to 36
 * by default.
 */
const COUNTER_BASE = 36;

/**
 * Stringifies a dot ID, in the form `` `${replicaID}_${counter.toString(36)}` ``.
 * See https://mattweidner.com/2023/09/26/crdt-survey-3.html#unique-ids-dots
 *
 * If counter is -1, replicaID is returned instead, so that this function is an
 * inverse to parseMaybeDotID.
 */
export function stringifyMaybeDotID(
  replicaID: string,
  counter: number
): string {
  if (counter === -1) return replicaID;
  return `${replicaID}_${counter.toString(36)}`;
}

/**
 * Parses a dot ID of the form `` `${replicaID}_${counter.toString(36)}` ``
 * if possible, returning `[replicaID, counter]`.
 *
 * If not possible, returns `[maybeDotID, -1]`.
 */
export function parseMaybeDotID(
  maybeDotID: string
): [replicaID: string, counter: number] {
  const underscore = maybeDotID.lastIndexOf("_");
  if (underscore === -1) return [maybeDotID, -1];

  const counter = Number.parseInt(
    maybeDotID.slice(underscore + 1),
    COUNTER_BASE
  );
  if (!(Number.isSafeInteger(counter) && counter >= 0)) return [maybeDotID, -1];

  return [maybeDotID.slice(0, underscore), counter];
}

export function arrayShallowEquals<T>(
  a: readonly T[],
  b: readonly T[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
