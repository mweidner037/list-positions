export abstract class Segment {
  next: Segment | null = null;
  abstract readonly isDeleted: boolean;
  abstract readonly canAppend: boolean;
  abstract readonly length: number;
  /**
   *
   * @param index 0 < index < length
   */
  abstract trimFront(index: number): Segment;
  /**
   *
   * @param index 0 < index < length
   */
  abstract trimBack(index: number): Segment;
  abstract append(other: this): void;
}

export class DeletedSegment extends Segment {
  constructor(public length: number) {
    super();
  }

  get isDeleted() {
    return true;
  }

  get canAppend() {
    return true;
  }

  trimFront(index: number): Segment {
    return new DeletedSegment(this.length - index);
  }

  trimBack(index: number): Segment {
    return new DeletedSegment(index);
  }

  append(other: this): void {
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

  get canAppend() {
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

  append(other: this): void {
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

  get canAppend() {
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

  append(other: this): void {
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

  get canAppend() {
    return true;
  }

  trimFront(index: number): Segment {
    return new PresentSegment(this.length - index);
  }

  trimBack(index: number): Segment {
    return new PresentSegment(index);
  }

  append(other: this): void {
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

  get canAppend() {
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

  append(): void {
    throw new Error("Invalid for AtomSegment");
  }
}
