export interface ItemManager<I, T> {
  get(item: I, index: number): T;

  length(item: I): number;

  isEmpty(item: I): boolean;

  /**
   * New reference to an empty item.
   */
  empty(): I;

  merge(a: I, b: I): I;

  slice(item: I, start: number, end: number): I;
}

export class ArrayItemManager<T> implements ItemManager<T[], T> {
  get(item: T[], index: number): T {
    return item[index];
  }

  length(item: T[]): number {
    return item.length;
  }

  isEmpty(item: T[]): boolean {
    return item.length === 0;
  }

  empty(): T[] {
    return [];
  }

  merge(a: T[], b: T[]): T[] {
    a.push(...b);
    return a;
  }

  slice(item: T[], start: number, end: number): T[] {
    return item.slice(start, end);
  }
}

export class NumberItemManager implements ItemManager<number, true> {
  get(item: number, index: number): true {
    return true;
  }

  length(item: number): number {
    return item;
  }

  isEmpty(item: number): boolean {
    return item === 0;
  }

  empty(): number {
    return 0;
  }

  merge(a: number, b: number): number {
    return a + b;
  }

  slice(item: number, start: number, end: number): number {
    return end - start;
  }
}

/**
 * Alternating (item, positive number = deleted). If nonempty, starts with an item
 * (possibly empty).
 */
export type SparseItems<I> = (I | number)[];

/**
 * Some methods in functional style (return result) but may also reuse/modify
 * inputs. So stop using the inputs after calling.
 */
export class SparseItemsManager<I, T> {
  constructor(readonly itemMan: ItemManager<I, T>) {}

  new(length = 0): SparseItems<I> {
    return length === 0 ? [] : [this.itemMan.empty(), length];
  }

  /**
   * Empty *and* no deleted values.
   */
  isEmpty(items: SparseItems<I>): boolean {
    return items.length === 0;
  }

  /**
   * The number of *present* values.
   */
  size(items: SparseItems<I>): number {
    let ans = 0;
    for (let i = 0; i < items.length; i += 2) {
      ans += this.itemMan.length(items[i] as I);
    }
    return ans;
  }

  trim(items: SparseItems<I>): SparseItems<I> {
    // Omit last deleted item.
    if (items.length !== 0 && items.length % 2 === 0) items.pop();
    // Omit only item if it's empty.
    if (items.length === 0 && this.itemMan.isEmpty(items[0] as I)) items.pop();
    return items;
  }

  /**
   * @param item May be copied by-reference, so not safe afterwards.
   * @returns [new SparseArray, the replaced values padded with deleted values to match item's length.]
   */
  set(
    items: SparseItems<I>,
    startIndex: number,
    item: I
  ): [arr: SparseItems<I>, existing: SparseItems<I>] {
    const [before, existing, after] = this.split(
      items,
      startIndex,
      startIndex + this.itemMan.length(item)
    );
    return [this.merge(before, [item], after), existing];
  }

  /**
   * @returns [new SparseArray, the replaced values padded with deleted values to match item's length.]
   */
  delete(
    items: SparseItems<I>,
    startIndex: number,
    count: number
  ): [arr: SparseItems<I>, previous: SparseItems<I>] {
    const [before, existing, after] = this.split(
      items,
      startIndex,
      startIndex + count
    );
    return [this.merge(before, [this.itemMan.empty(), count], after), existing];
  }

  /**
   * Splits arr at the given indexes,
   * returning `indexes.length + 1` SparseArrays.
   *
   * Length is preserved, except possibly extended to the last index.
   */
  private split(items: SparseItems<I>, ...indexes: number[]): SparseItems<I>[] {
    const ans = new Array<SparseItems<I>>(indexes.length + 1);
    let itemsI = 0;
    let withinItem = 0;
    for (let i = 0; i < indexes.length + 1; i++) {
      const slice: SparseItems<I> = [];
      ans[i] = slice;

      let remaining: number;
      if (i === 0) remaining = indexes[0];
      else if (i === indexes.length) {
        // Last slice; consume the rest of arr.
        remaining = Number.MAX_SAFE_INTEGER;
      } else remaining = indexes[i] - indexes[i - 1];
      while (itemsI < items.length) {
        const length =
          itemsI % 2 === 0
            ? this.itemMan.length(items[itemsI] as I)
            : (items[itemsI] as number);
        if (withinItem === length) {
          itemsI++;
          withinItem = 0;
          continue;
        }

        if (itemsI % 2 === 0) {
          let item = items[itemsI] as I;
          if (remaining < length - withinItem) {
            item = this.itemMan.slice(item, withinItem, withinItem + remaining);
            withinItem += remaining;
          }
          slice.push(item);
          remaining -= this.itemMan.length(item);
        } else {
          let item = items[itemsI] as number;
          if (remaining < length - withinItem) {
            item = remaining;
            withinItem += remaining;
          }
          if (slice.length === 0) slice.push(this.itemMan.empty());
          slice.push(item);
          remaining -= item;
        }
      }

      // If arr doesn't go all the way, pad with deleted items.
      // Except, the last slice can stay empty.
      if (i !== indexes.length) {
        if (slice.length === 0) slice.push(this.itemMan.empty());
        slice.push(remaining);
      }
    }

    return ans;
  }

  /**
   * Merges arrs into a single SparseArray, preserving lengths.
   */
  private merge(...itemss: SparseItems<I>[]): SparseItems<I> {
    const merged: SparseItems<I> = [this.itemMan.empty()];
    for (const items of itemss) {
      if (items.length === 0) continue;

      if (merged.length % 2 === 1) {
        // Combine merged[-1] with arr[0] (both present), then push the rest.
        merged[merged.length - 1] = this.itemMan.merge(
          merged[merged.length - 1] as I,
          items[0] as I
        );
        merged.push(...items.slice(1));
      } else {
        if (this.itemMan.isEmpty(items[0] as I)) {
          // Skip arr[0], combine merged[-1] with arr[1] (both deleted), then push the rest.
          if (items.length === 1) continue;
          (merged[merged.length - 1] as number) += items[1] as number;
          merged.push(...items.slice(2));
        } else {
          // Push arr (starts present) after merged (ends deleted).
          merged.push(...items);
        }
      }
    }
    return merged;
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
    items: SparseItems<I>,
    index: number
  ): [value: T | undefined, isPresent: boolean, beforeCount: number] {
    let remaining = index;
    let beforeCount = 0;
    for (let i = 0; i < items.length; i++) {
      if (i % 2 === 0) {
        const length = this.itemMan.length(items[i] as I);
        if (remaining < length) {
          return [
            this.itemMan.get(items[i] as I, remaining),
            true,
            beforeCount + remaining,
          ];
        } else {
          remaining -= length;
          beforeCount += length;
        }
      } else {
        const length = items[i] as number;
        if (remaining < length) {
          return [undefined, false, beforeCount];
        } else remaining -= length;
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
  findPresentIndex(
    items: SparseItems<I>,
    startIndex: number,
    count: number
  ): number {
    let startRemaining = startIndex;
    let countRemaining = count;
    let ans = startIndex;
    for (let i = 0; i < items.length; i++) {
      const length =
        i % 2 === 0 ? this.itemMan.length(items[i] as I) : (items[i] as number);
      if (startRemaining < length) {
        // startIndex is at run[startRemaining].
        if (i % 2 === 0) {
          // Search the rest of arr[i].
          const searchedLength = length - startRemaining;
          if (countRemaining < searchedLength) {
            return ans + countRemaining;
          } else {
            countRemaining -= searchedLength;
            ans += searchedLength;
          }
        }
      } else startRemaining -= length;
    }
    throw new Error(
      `Internal error: findPresentIndex result not found (startIndex=${startIndex}, count=${count}, arr=${JSON.stringify(
        items
      )}`
    );
  }

  newSlicer(items: SparseItems<I>) {
    return new Slicer(this.itemMan, items);
  }
}

export class Slicer<I, T> {
  private index = 0;
  private itemsI = 0;
  private withinItem = 0;

  /**
   * Private
   */
  constructor(
    private readonly itemMan: ItemManager<I, T>,
    private readonly items: SparseItems<I>
  ) {}

  /**
   * Iterator must be consumed before you call nextSlice again.
   */
  *nextSlice(end: number | null): IterableIterator<[index: number, value: T]> {
    for (; this.itemsI < this.items.length; this.itemsI++) {
      if (end !== null && this.index >= end) return;
      if (this.itemsI % 2 === 0) {
        const item = this.items[this.itemsI] as I;
        const length = this.itemMan.length(item);
        for (; this.withinItem < length; this.withinItem++) {
          if (this.index === end) return;
          yield [this.index, this.itemMan.get(item, this.withinItem)];
          this.index++;
        }
        this.withinItem = 0;
      } else {
        this.index += this.items[this.itemsI] as number;
      }
    }
  }
}
