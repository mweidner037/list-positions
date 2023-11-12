import { Position } from "./position";

/**
 * Serializable form of a Node, used for collaboration.
 *
 * Note: not for rootNode.
 */
export type NodeDesc = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly parent: Position;
};

/**
 * By-reference = by-value (within same Order).
 *
 * Will be a class with extra properties - not JSON serialiable.
 */
export interface Node {
  readonly creatorID: string;
  readonly timestamp: number;
  /** null for the root. */
  readonly parentNode: Node | null;
  /** Unspecified for the root. */
  readonly parentValueIndex: number;
  /** null for the root. */
  readonly parent: Position | null;
  /** 0 for the root. */
  readonly depth: number;

  /**
   * Returns this Node's NodeDesc.
   *
   * Errors if this is the rootNode.
   */
  desc(): NodeDesc;
  children(): IterableIterator<Node>;

  toString(): string;
}

export function siblingNodeCompare(a: Node, b: Node): number {
  if (a.parentNode !== b.parentNode) {
    throw new Error(
      `nodeSiblingCompare can only compare Nodes with the same parentNode, not a=${a}, b=${b}`
    );
  }

  // Sibling sort order: first by parentValueIndex, then by *reverse* timestamp,
  // then by creatorID.
  if (a.parentValueIndex !== b.parentValueIndex) {
    return a.parentValueIndex - b.parentValueIndex;
  }
  if (a.timestamp !== b.timestamp) {
    // Reverse order.
    return b.timestamp - a.timestamp;
  }
  if (a.creatorID !== b.creatorID) {
    return a.creatorID > b.creatorID ? 1 : -1;
  }
  return 0;
}
