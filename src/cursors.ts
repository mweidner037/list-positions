import { Position } from "./c_total_order";
import { LocalList } from "./local_list";

/**
 * A cursor in a collaborative list or text string.
 *
 * A Cursor points to a particular spot in a list, in between
 * two list elements (or text characters).
 * You can use Cursors as ordinary cursors or selection endpoints.
 *
 * Use the [[Cursors]] class to convert between indices and Cursors.
 *
 * Internally, a cursor is represented as a string.
 * Specifically, it is the [[Position]] of the list element
 * to its left, or "START" if it is at the beginning
 * of the list. If that position is later deleted, the cursor stays the
 * same, but its index shifts to the next element on its left.
 */
// TODO: make "START" have same type sig as Position. E.g. (root, 0).
export type Cursor = Position | "START";

/**
 * Utilities for working with [[Cursor]]s.
 */
export class Cursors {
  private constructor() {
    // Not instantiable.
  }

  /**
   * Returns the [[Cursor]] at `index` within the given list.
   * Invert with [[toIndex]].
   *
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * @param list The target list.
   */
  static fromIndex(index: number, list: LocalList<any>): Cursor {
    return index === 0 ? "START" : list.getPosition(index - 1);
  }

  /**
   * Returns the current index of `cursor` within the given list. Inverse of [[fromIndex]].
   *
   * That is, the cursor is between the list elements at `index - 1` and `index`.
   *
   * @param cursor The [[Cursor]].
   * @param list The target list.
   */
  static toIndex(cursor: Cursor, list: LocalList<any>): number {
    return cursor === "START" ? 0 : list.indexOfPosition(cursor, "left") + 1;
  }
}
