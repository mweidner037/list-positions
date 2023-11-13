import { List } from "./list";
import { Position, positionEquals } from "./position";

/**
 * Utilities for working with cursors.
 *
 * A **cursor** points to a particular spot in a list, in between
 * two list elements (or text characters).
 * You can use cursors as ordinary cursors or selection endpoints.
 *
 * Internally, a cursor is the Position of the list element to its left,
 * or `Order.minPosition` for a cursor at the start of the list.
 * If that position becomes not present in the list, the cursor
 * stays the same, but its index moves left.
 */
export class Cursors {
  private constructor() {
    // Not instantiable.
  }

  /**
   * Returns the cursor at `index` within the given list.
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * Invert with `Cursors.indexOf`.
   *
   * @param list The target List.
   */
  static cursorAt<T>(index: number, list: List<T>): Position {
    return index === 0 ? list.order.minPosition : list.positionAt(index - 1);
  }

  /**
   * Returns the current index of `cursor` within the given list.
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * Inverts `Cursors.cursorAt`.
   *
   * @param list The target List.
   */
  static indexOf<T>(cursor: Position, list: List<T>): number {
    return positionEquals(cursor, list.order.minPosition)
      ? 0
      : list.indexOfPosition(cursor, "left") + 1;
  }
}
