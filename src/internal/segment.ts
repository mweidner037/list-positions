export abstract class Segment<S = unknown> {
  next: (S & Segment<S>) | DeletedSegment<S> | null = null;
  // TODO: in tests, check always > 0.
  abstract readonly length: number;
  abstract readonly isMergeable: boolean;
  /**
   * Set this one to the first half in-place; return a new second half. Don't update next pointers.
   *
   * @param index 0 < index < length
   */
  abstract splitContent(index: number): Segment<S>;
  /**
   * Merge other's content with ours (appending other).
   */
  abstract mergeContent(other: this): void;
}

export class SegmentList<S extends Segment<S>> {
  next: S | DeletedSegment<S> | null = null;

  // TODO: check for no-deleted-ends in tests

  overwrite(index: number, segment: S | DeletedSegment<S>): void {
    if (segment.length === 0) return;

    if (this.next === null) {
      this.next = new DeletedSegment(index + segment.length);
    }
    const left = index === 0 ? this : createSplit(this.next, index);

    if (left.next === null) {
      left.next = new DeletedSegment(segment.length);
    }
    const preRight = createSplit(left.next, segment.length);

    left.next = segment;
    segment.next = preRight.next;

    // If the new segment is last and it's deleted, trim it.
    if (segment.next === null && segment instanceof DeletedSegment) {
      left.next = null;
    }
  }

  *presentSegments(): IterableIterator<[index: number, segment: S]> {
    let index = 0;
    for (let current = this.next; current !== null; current = current.next) {
      if (!(current instanceof DeletedSegment)) yield [index, current];
      index += current.length;
    }
  }

  get(index: number): [segment: S, offset: number] | null {
    let remaining = index;
    for (let current = this.next; current !== null; current = current.next) {
      if (current.length < remaining) {
        if (current instanceof DeletedSegment) return null;
        else return [current, remaining];
      }
      remaining -= current.length;
    }
    return null;
  }
}

/**
 * Creates a split (segment boundary) at delta in the given list, returning
 * the PreSegment before the split. If needed, the list is extended to length
 * delta using a DeletedSegment.
 *
 * @param index Must be > 0.
 * @returns The Segment just before the split.
 */
function createSplit(start: Segment, delta: number): Segment {
  // eslint-disable-next-line prefer-const
  let [left, leftOffset, leftOutside] = locate(start, delta);
  if (leftOutside) {
    const preLeft = left;
    left = new DeletedSegment(leftOffset - preLeft.length);
    leftOffset -= preLeft.length;
    append(preLeft, left);
  } else split(left, leftOffset);
  return left;
}

/**
 * Given delta > 0, returns the segment containing that index and the offset within it.
 * The returned offset satisfies 0 < offset <= segment.length, unless delta is outside
 * the list, in which case offset is greater and outside is true.
 */
function locate<S extends Segment<S>>(
  start: S | DeletedSegment<S>,
  delta: number
): [segment: S | DeletedSegment<S>, offset: number, outside: boolean] {
  let current = start;
  let remaining = delta;
  for (; current.next !== null; current = current.next) {
    if (remaining <= current.length) {
      return [current, remaining, false];
    }
    remaining -= current.length;
  }
  return [current, remaining, remaining > current.length];
}

/**
 * Connects before to after in the list, merging if possible.
 * Returns the final segment, whose next pointer is *not* updated.
 */
function append(before: Segment, after: Segment): void {
  // TODO: is this safe & efficient?
  if (before.constructor === after.constructor && before.isMergeable) {
    before.mergeContent(after);
  } else before.next = after;
}

/**
 * Splits the segment at the given offset (if needed).
 *
 * @param offset 0 < offset <= segment.length
 */
function split(segment: Segment, offset: number) {
  if (offset !== segment.length) {
    const after = segment.splitContent(offset);
    after.next = segment.next;
    segment.next = after;
  }
}

export class DeletedSegment<S> extends Segment<S> {
  constructor(public length: number) {
    super();
  }

  get isMergeable() {
    return true;
  }

  splitContent(index: number) {
    const after = new DeletedSegment<S>(this.length - index);
    this.length = index;
    return after;
  }

  mergeContent(other: this): void {
    this.length += other.length;
  }
}

export class PresentSegment extends Segment {
  constructor(public length: number) {
    super();
  }

  get isMergeable() {
    return true;
  }

  splitContent(index: number) {
    const after = new PresentSegment(this.length - index);
    this.length = index;
    return after;
  }

  mergeContent(other: this): void {
    this.length += other.length;
  }
}

export class ArraySegment<T> extends Segment {
  constructor(readonly values: T[]) {
    super();
  }

  get length() {
    return this.values.length;
  }

  get isMergeable() {
    return true;
  }

  splitContent(index: number) {
    const after = new ArraySegment(this.values.slice(index));
    this.values.length = index;
    return after;
  }

  mergeContent(other: this): void {
    this.values.push(...other.values);
  }
}

export class StringSegment extends Segment {
  constructor(public chars: string) {
    super();
  }

  get length() {
    return this.chars.length;
  }

  get isMergeable() {
    return true;
  }

  splitContent(index: number) {
    const after = new StringSegment(this.chars.slice(index));
    this.chars = this.chars.slice(0, index);
    return after;
  }

  mergeContent(other: this): void {
    this.chars = this.chars + other.chars;
  }
}

export class AtomSegment<A> extends Segment {
  constructor(readonly value: A) {
    super();
  }

  get length() {
    return 1;
  }

  get isMergeable() {
    return false;
  }

  splitContent(): never {
    throw new Error("Invalid for AtomSegment");
  }

  mergeContent(): never {
    throw new Error("Invalid for AtomSegment");
  }
}
