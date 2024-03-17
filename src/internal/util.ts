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
