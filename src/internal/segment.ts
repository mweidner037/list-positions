export abstract class Segment {
  next: Segment | null = null;
  abstract readonly isDeleted: boolean;
  abstract readonly isMergeable: boolean;
  // TODO: in tests, check always > 0.
  abstract readonly length: number;
  /**
   * Set this one to the first half in-place; return a new second half. Don't update next pointers.
   *
   * @param index 0 < index < length
   */
  abstract splitContent(index: number): Segment;
  /**
   * Merge other's content with ours (appending other).
   */
  abstract mergeContent(other: this): void;
}

export class SegmentList {
  head: Segment | null = null;

  // TODO: trim deleted ends
  // TODO: check for no-deleted-ends in tests
  // TODO: if segment is externally accessible or settable, need to defend against aliasing+mutation.
  // Likewise for whole list.

  overwrite(index: number, segment: Segment): void {
    if (segment.length === 0) return;

    if (this.head === null) {
      this.head = new DeletedSegment(index + segment.length);
    }
    const left = createSplit(this.head, index);

    if (left.next === null) {
      left.next = new DeletedSegment(segment.length);
    }
    const preRight = createSplit(left.next, segment.length);

    left.next = segment;
    segment.next = preRight.next;
  }
}

/**
 * Creates a split (segment boundary) at delta in the given list, returning
 * the PreSegment before the split. If needed, the list is extended to length
 * delta using a DeletedSegment.
 *
 * @returns The Segment just before the split.
 */
function createSplit(start: Segment, delta: number): Segment {
  if (delta === 0) return start;

  // eslint-disable-next-line prefer-const
  let [left, leftOffset, leftOutside] = locate(start, delta);
  if (leftOutside) {
    const preLeft = left;
    left = new DeletedSegment(leftOffset - preLeft.length);
    append(preLeft, left);
    leftOffset -= preLeft.length;
  } else split(left, leftOffset);
  return left;
}

/**
 * Given delta > 0, returns the segment containing that index and the offset within it.
 * The returned offset satisfies 0 < offset <= segment.length, unless delta is outside
 * the list, in which case offset is greater and outside is true.
 */
function locate(
  start: Segment,
  delta: number
): [segment: Segment, offset: number, outside: boolean] {
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
function append(before: Segment, after: Segment): Segment {
  // TODO: is this safe & efficient?
  if (before.constructor === after.constructor && before.isMergeable) {
    before.mergeContent(after);
    return before;
  } else {
    before.next = after;
    return after;
  }
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

export class DeletedSegment extends Segment {
  constructor(public length: number) {
    super();
  }

  get isDeleted() {
    return true;
  }

  get isMergeable() {
    return true;
  }

  trimFront(index: number): Segment {
    return new DeletedSegment(this.length - index);
  }

  trimBack(index: number): Segment {
    return new DeletedSegment(index);
  }

  mergeContent(other: this): void {
    this.length += other.length;
  }
}

export class ArraySegment<T> extends Segment {
  constructor(readonly values: T[]) {
    super();
  }

  get isDeleted() {
    return false;
  }

  get isMergeable() {
    return true;
  }

  get length() {
    return this.values.length;
  }

  trimFront(index: number): Segment {
    return new ArraySegment(this.values.slice(index));
  }

  trimBack(index: number): Segment {
    return new ArraySegment(this.values.slice(0, index));
  }

  mergeContent(other: this): void {
    this.values.push(...other.values);
  }
}

export class StringSegment extends Segment {
  constructor(public chars: string) {
    super();
  }

  get isDeleted() {
    return false;
  }

  get isMergeable() {
    return true;
  }

  get length() {
    return this.chars.length;
  }

  trimFront(index: number): Segment {
    return new StringSegment(this.chars.slice(index));
  }

  trimBack(index: number): Segment {
    return new StringSegment(this.chars.slice(0, index));
  }

  mergeContent(other: this): void {
    this.chars = this.chars + other.chars;
  }
}

export class PresentSegment extends Segment {
  constructor(public length: number) {
    super();
  }

  get isDeleted() {
    return false;
  }

  get isMergeable() {
    return true;
  }

  trimFront(index: number): Segment {
    return new PresentSegment(this.length - index);
  }

  trimBack(index: number): Segment {
    return new PresentSegment(index);
  }

  mergeContent(other: this): void {
    this.length += other.length;
  }
}

export class AtomSegment<A> extends Segment {
  constructor(readonly value: A) {
    super();
  }

  get isDeleted() {
    return false;
  }

  get isMergeable() {
    return false;
  }

  get length() {
    return 1;
  }

  trimFront(): Segment {
    throw new Error("Invalid for AtomSegment");
  }

  trimBack(): Segment {
    throw new Error("Invalid for AtomSegment");
  }

  mergeContent(): void {
    throw new Error("Invalid for AtomSegment");
  }
}
