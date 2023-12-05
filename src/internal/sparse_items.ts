export interface ItemManager<I, T> {
  get(item: I, index: number): T;

  length(item: I): number;

  isEmpty(item: I): boolean;

  /**
   * New empty item.
   */
  empty(): I;

  /**
   * Immutable style (returns result), but may choose to modify
   * and return one of the inputs. So don't use the inputs after calling.
   */
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
 * A representation of a sparse array in which runs of present values
 * are represented by "items" of type I (e.g. an array of the values).
 *
 * This representation is designed to be memory efficient and to let you
 * quickly skip over runs of deleted values when iterating. To mutate
 * and query, use a SparseItemsManager. (We save a bit of memory by
 * not wrapping the literal array in a class.)
 *
 * The representation is an array of alternating items & positive numbers,
 * where a number represents a run of that many deleted values.
 * Items are always at even indices (in particular, the first entry is an
 * item, possibly empty). Non-first items are always non-empty.
 */
export type SparseItems<I> = (I | number)[];

export class SparseItemsManager<I, T> {
  constructor(readonly itemMan: ItemManager<I, T>) {}

  new(length = 0): SparseItems<I> {
    return length === 0 ? [] : [this.itemMan.empty(), length];
  }

  /**
   * No present values *and* trimmed (no deleted values; no empty first item).
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
   * Immutable style (returns result), but may choose to modify
   * and return items in the input. So don't use the input after calling.
   *
   * @returns [new SparseArray, the replaced values padded with deleted values to match item's length.]
   */
  set(
    items: SparseItems<I>,
    startIndex: number,
    item: I
  ): [arr: SparseItems<I>, previous: SparseItems<I>] {
    const [before, existing, after] = this.split(
      items,
      startIndex,
      startIndex + this.itemMan.length(item)
    );
    return [this.merge(before, [item], after), existing];
  }

  /**
   * Immutable style (returns result), but may choose to modify
   * and return items in the input. So don't use the input after calling.
   *
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

      // Number of slots remaining before indexes[i].
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
      if (remaining !== 0 && i !== indexes.length) {
        if (slice.length === 0) {
          slice.push(this.itemMan.empty(), remaining);
        } else if (slice.length % 2 === 1) slice.push(remaining);
        else {
          // Last item in slice is already deleted. Add to it.
          (slice[slice.length - 1] as number) += remaining;
        }
      }
    }

    return ans;
  }

  /**
   * Merges arrs into a single SparseArray, preserving lengths.
   *
   * Immutable style (returns result), but may choose to modify
   * items in the inputs. So don't use the inputs after calling.
   */
  private merge(...itemss: SparseItems<I>[]): SparseItems<I> {
    // Start so empty() so that we always have an item.
    const merged: SparseItems<I> = [this.itemMan.empty()];
    for (const items of itemss) {
      if (items.length === 0) continue;

      if (merged.length % 2 === 1) {
        // Combine merged[-1] with items[0] (both present), then push the rest.
        merged[merged.length - 1] = this.itemMan.merge(
          merged[merged.length - 1] as I,
          items[0] as I
        );
        merged.push(...items.slice(1));
      } else {
        if (this.itemMan.isEmpty(items[0] as I)) {
          // To prevent empty items in the middle, skip items[0].
          // Instead, combine merged[-1] with arr[1] (both deleted), then push the rest.
          if (items.length === 1) continue;
          (merged[merged.length - 1] as number) += items[1] as number;
          merged.push(...items.slice(2));
        } else {
          // Push items (starts present & non-empty) after merged (ends deleted).
          merged.push(...items);
        }
      }
    }
    return merged;
  }

  /**
   * Returns info about the value at index in runs:
   * [value - undefined if not present, whether it's present,
   * count of present values strictly before it].
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
        // Act as if startIndex is at item[startRemaining].
        // (It may be earlier, but then countRemaining is adjusted to compensate.)
        if (i % 2 === 0) {
          // Search the rest of items[i].
          const searchedLength = length - startRemaining;
          if (countRemaining < searchedLength) {
            return ans + countRemaining;
          } else {
            countRemaining -= searchedLength;
            ans += searchedLength;
          }
        }
        // Record that we've passed start.
        startRemaining = 0;
      } else startRemaining -= length;
    }
    throw new Error(
      `Internal error: findPresentIndex result not found (startIndex=${startIndex}, count=${count}, items=${JSON.stringify(
        items
      )}`
    );
  }

  /**
   * Used to walk through the sparse array in slices.
   */
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
   * Returns [index, value] pairs for present values starting after the
   * previous slice and ending at end (exclusive).
   * When end is null, visits all remaining present values.
   */
  nextSlice(end: number | null): Array<[index: number, value: T]> {
    const slice: Array<[index: number, value: T]> = [];
    while (this.itemsI < this.items.length) {
      if (end !== null && this.index >= end) return slice;
      if (this.itemsI % 2 === 0) {
        const item = this.items[this.itemsI] as I;
        const length = this.itemMan.length(item);
        while (this.withinItem < length) {
          if (this.index === end) return slice;
          slice.push([this.index, this.itemMan.get(item, this.withinItem)]);
          // Move to the next value.
          this.index++;
          this.withinItem++;
        }
        // If we get here, we've exhausted item.
        this.withinItem = 0;
        this.itemsI++;
      } else {
        // Skip over the whole deleted run.
        this.index += this.items[this.itemsI] as number;
        this.itemsI++;
      }
    }
    // Ran out of present values.
    return slice;
  }
}
