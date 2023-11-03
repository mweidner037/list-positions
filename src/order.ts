import { IDs } from "./ids";

export type Position = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly valueIndex: number;
};

export type Node = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly parent: Position;
};

export type ItemDesc = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly startValueIndex: number;
  /**
   * The exclusive end of the item's valueIndex range.
   *
   * null to include all further Positions at this Node (unbounded valueIndex).
   */
  readonly endValueIndex: number | null;
};

export function positionEquals(a: Position, b: Position): boolean {
  return (
    a.creatorID === b.creatorID &&
    a.timestamp === b.timestamp &&
    a.valueIndex === b.valueIndex
  );
}

type NodeInternal = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly parentNode: NodeInternal | null;
  readonly parentValueIndex: number;

  /**
   * May be undefined if empty.
   */
  children?: NodeInternal[];

  /**
   * If this Node was created by us, the next valueIndex to create.
   */
  nextValueIndex?: number;
};

export class Order {
  readonly ID: string;
  private timestamp = 0;

  // Can't be set etc., but can be createPositionAfter'd or appear in a Cursor.
  // TODO: instead, start & end positions? (Latter is root, 1).
  readonly rootPosition: Position;
  private readonly rootNode: NodeInternal;

  /**
   * Maps from (creatorID, timestamp) to that node.
   */
  private readonly tree = new Map<string, Map<number, NodeInternal>>();

  constructor(options?: { ID?: string }) {
    if (options?.ID !== undefined) {
      IDs.validate(options.ID);
    }
    this.ID = options?.ID ?? IDs.random();

    this.rootNode = {
      creatorID: IDs.ROOT,
      timestamp: 0,
      parentNode: null,
      parentValueIndex: 0,
    };
    this.rootPosition = {
      creatorID: this.rootNode.creatorID,
      timestamp: this.rootNode.timestamp,
      valueIndex: 0,
    };
    this.tree.set(
      this.rootPosition.creatorID,
      new Map([[this.rootPosition.timestamp, this.rootNode]])
    );
    this.tree.set(this.ID, new Map());
  }

  /**
   * Also validates pos.
   */
  private getNode(pos: Position): NodeInternal {
    const info = this.tree.get(pos.creatorID)?.get(pos.timestamp);
    if (info === undefined) {
      throw new Error(
        `Position references unknown Node: ${JSON.stringify({
          creatorID: pos.creatorID,
          timestamp: pos.timestamp,
          parent: "<unknown>",
        })}. You must call Order.receiveNodes before referencing a Node.`
      );
    }
    if (pos.valueIndex < 0) {
      throw new Error(
        `Position has negative valueIndex: ${JSON.stringify(pos)}`
      );
    }
    if (info === this.rootNode && pos.valueIndex !== 0) {
      throw new Error(
        `Position uses root Node but non-zero valueIndex: ${JSON.stringify(
          pos
        )}`
      );
    }
    return info;
  }

  /**
   * Set this to get called when a new Node is created by a
   * createPosition* method (which also returns that Node).
   */
  onNewNode: ((meta: Node) => void) | undefined = undefined;

  /**
   * Also used for loading output of [...nodes()].
   */
  receiveNodes(nodes: Iterable<Node>): void {
    // TODO: needs to work with out-of-causal-order iteration.
    for (const meta of nodes) this.receiveNode(meta);
  }

  private receiveNode(node: Node): void {
    // This also checks that node is not the root.
    IDs.validate(node.creatorID);

    let byCreator = this.tree.get(node.creatorID);
    if (byCreator === undefined) {
      byCreator = new Map();
      this.tree.set(node.creatorID, byCreator);
    }

    const existing = byCreator.get(node.timestamp);
    if (existing === undefined) {
      // New Node.
      const nodeInternal: NodeInternal = {
        creatorID: node.creatorID,
        timestamp: node.timestamp,
        // getNode also validates node.parent.
        parentNode: this.getNode(node.parent),
        parentValueIndex: node.parent.valueIndex,
      };
      byCreator.set(nodeInternal.timestamp, nodeInternal);
      this.updateTimestamp(nodeInternal.timestamp);
      this.addToChildren(nodeInternal);
    } else {
      // Redundant Node. Make sure it matches existing.
      const existingParent: Position = {
        creatorID: existing.parentNode!.creatorID,
        timestamp: existing.parentNode!.timestamp,
        valueIndex: existing.parentValueIndex,
      };
      if (!positionEquals(node.parent, existingParent)) {
        throw new Error(
          `Node added twice with different parents: existing=${JSON.stringify(
            existingParent
          )}, new=${JSON.stringify(node.parent)}`
        );
      }
    }
  }

  /**
   * Adds a new Node info to parentInfo.children.
   */
  private addToChildren(node: NodeInternal) {
    const parentNode = node.parentNode!;
    if (parentNode.children === undefined) parentNode.children = [node];
    else {
      // Find the index of the first sibling > node.
      let i = 0;
      for (; i < parentNode.children.length; i++) {
        // Break if sibling > node.
        if (this.isSiblingLess(node, parentNode.children[i])) break;
      }
      // Insert node just before that sibling.
      parentNode.children.splice(i, 0, node);
    }
  }

  private isSiblingLess(a: NodeInternal, b: NodeInternal): boolean {
    // Sibling sort order: first by valueIndex, then by *reverse* timestamp,
    // then by creatorID.
    if (a.parentValueIndex < b.parentValueIndex) return true;
    else if (a.parentValueIndex === b.parentValueIndex) {
      if (a.timestamp > b.timestamp) return true;
      else if (a.timestamp === b.timestamp) {
        if (a.creatorID < b.creatorID) return true;
      }
    }
    return false;
  }

  // TODO: change to 'isPositionOkay' or similar? / isReady, isValid, readyFor
  hasNodeFor(pos: Position): boolean {
    return this.tree.get(pos.creatorID)?.get(pos.timestamp) !== undefined;
  }

  // TODO: hasMeta, to let you query if a meta is okay to add yet?

  /**
   * No particular order - usually not causal.
   *
   * Excludes root.
   *
   * Use for saving - natural JSON rep.
   */
  nodes(): Node[] {
    const ans: Node[] = [];
    for (const [creatorID, byCreator] of this.tree) {
      for (const [timestamp, nodeInternal] of byCreator) {
        if (nodeInternal.parentNode === null) continue; // Root
        ans.push({
          creatorID,
          timestamp,
          parent: {
            creatorID: nodeInternal.parentNode.creatorID,
            timestamp: nodeInternal.parentNode.timestamp,
            valueIndex: nodeInternal.parentValueIndex,
          },
        });
      }
    }
    return ans;
  }

  updateTimestamp(otherTimestamp: number): number {
    this.timestamp = Math.max(otherTimestamp, this.timestamp);
    return this.timestamp;
  }

  createPositionAfter(prevPos: Position): {
    pos: Position;
    newNode: Node | null;
  } {
    // getNode also checks that prevPos is valid.
    const prevNode = this.getNode(prevPos);

    // First try to extend prevPos's Node.
    if (prevPos.creatorID === this.ID) {
      if (prevNode.nextValueIndex === prevPos.valueIndex + 1) {
        // Success.
        const pos: Position = {
          creatorID: prevPos.creatorID,
          timestamp: prevPos.timestamp,
          valueIndex: prevNode.nextValueIndex,
        };
        prevNode.nextValueIndex++;
        return { pos, newNode: null };
      }
    }

    // Else create a new Node.
    const newNode: Node = {
      creatorID: this.ID,
      timestamp: ++this.timestamp,
      parent: prevPos,
    };
    const pos: Position = {
      creatorID: newNode.creatorID,
      timestamp: newNode.timestamp,
      valueIndex: 0,
    };

    const newNodeInternal: NodeInternal = {
      creatorID: newNode.creatorID,
      timestamp: newNode.timestamp,
      parentNode: prevNode,
      parentValueIndex: prevPos.valueIndex,
      nextValueIndex: 1,
    };
    this.tree.get(this.ID)!.set(newNodeInternal.timestamp, newNodeInternal);
    this.addToChildren(newNodeInternal);
    this.onNewNode?.(newNode);

    return { pos, newNode };
  }

  compare(a: Position, b: Position): number {
    const aInfo = this.getNode(a);
    const bInfo = this.getNode(b);

    if (aInfo === bInfo) return a.valueIndex - b.valueIndex;
    if (aInfo.depth === 0) return -1;
    if (bInfo.depth === 0) return 1;

    // Walk up the tree until a & b are the same depth.
    let aAnc = a;
    let bAnc = b;
    let aAncInfo = aInfo;
    let bAncInfo = bInfo;

    if (aInfo.depth > bInfo.depth) {
      for (let i = aInfo.depth; i > bInfo.depth; i--) {
        aAnc = aAncInfo.parent!;
        aAncInfo = this.getNode(aAnc);
      }
      if (aAncInfo === bInfo) {
        // Descendant is greater than its ancestors.
        if (aAnc.valueIndex === b.valueIndex) return 1;
        else return aAnc.valueIndex - b.valueIndex;
      }
    }
    if (bInfo.depth > aInfo.depth) {
      for (let i = bInfo.depth; i > aInfo.depth; i--) {
        bAnc = bAncInfo.parent!;
        bAncInfo = this.getNode(bAnc);
      }
      if (bAncInfo === aInfo) {
        // Descendant is greater than its ancestors.
        if (bAnc.valueIndex === a.valueIndex) return -1;
        else return bAnc.valueIndex - a.valueIndex;
      }
    }

    // Now aAnc and bAnc are distinct nodes at the same depth.
    // Walk up the tree in lockstep until we find a common Node parent.
    while (true) {
      const aAncParentInfo = this.getNode(aAnc);
      const bAncParentInfo = this.getNode(bAnc);
    }
  }

  // TODO: slice args (startPos, endPos). For when you only view part of a doc.
  // Opt to avoid depth scan when they're in the same subtree?
  *items(): IterableIterator<ItemDesc> {
    // Use a manual stack instead of recursion, to prevent stack overflows
    // in deep trees.
    const stack = [
      {
        node: this.rootNode,
        nextChildIndex: 0,
        nextValueIndex: 0,
      },
    ];
    while (stack.length !== 0) {
      const top = stack[stack.length - 1];
      if (top.nextChildIndex === (top.node.children?.length ?? 0)) {
        // Out of children. Finish the values and then go up.
        if (top.node !== this.rootNode) {
          yield {
            creatorID: top.node.creatorID,
            timestamp: top.node.timestamp,
            startValueIndex: top.nextValueIndex,
            endValueIndex: null,
          };
        }
        stack.pop();
      } else {
        const nextChild = top.node.children![top.nextChildIndex];
        top.nextChildIndex++;
        // Emit values less than that child.
        const startValueIndex = top.nextValueIndex;
        const endValueIndex = nextChild.parentValueIndex + 1;
        if (endValueIndex !== startValueIndex) {
          if (top.node !== this.rootNode) {
            yield {
              creatorID: top.node.creatorID,
              timestamp: top.node.timestamp,
              startValueIndex,
              endValueIndex,
            };
          }
          top.nextValueIndex = endValueIndex;
        }
        // Visit the child.
        stack.push({
          node: nextChild,
          nextChildIndex: 0,
          nextValueIndex: 0,
        });
      }
    }
  }

  index(
    listData: ListData,
    pos: Position,
    searchDir: "none" | "left" | "right" = "none"
  ): number {
    // Count the number of values < pos.
    let valuesBefore = 0;

    let currentNode = this.getNode(pos);
    let currentValueIndex = pos.valueIndex;
    while (currentNode.parentNode !== null) {
      valuesBefore += listData.valueCount(
        currentNode.creatorID,
        currentNode.timestamp,
        0,
        currentValueIndex
      );
      if (currentNode.children !== undefined) {
        for (const child of currentNode.children) {
          if (child.parentValueIndex < currentValueIndex) {
            valuesBefore += listData.descCount(
              child.creatorID,
              child.timestamp
            );
          }
        }
      }

      currentValueIndex = currentNode.parentValueIndex;
      currentNode = currentNode.parentNode;
    }

    if (listData.has(pos)) return valuesBefore;
    else {
      switch (searchDir) {
        case "none":
          return -1;
        case "left":
          return valuesBefore - 1;
        case "right":
          return valuesBefore;
      }
    }
  }

  position(listData: ListData, index: number): Position {
    const length = listData.length;
    if (index < 0 || index >= length) {
      throw new Error(`index out of bounds: ${index}, length=${length}`);
    }

    let remaining = index;
    let currentNode = this.rootNode;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let recurse = false;
      let lastValueIndex = 0;
      for (const child of currentNode.children ?? []) {
        const valuesBefore = listData.valueCount(
          currentNode.creatorID,
          currentNode.timestamp,
          lastValueIndex,
          child.parentValueIndex + 1
        );
        if (remaining < valuesBefore) break;
        else {
          remaining -= valuesBefore;
          const childCount = listData.descCount(
            child.creatorID,
            child.timestamp
          );
          if (remaining < childCount) {
            currentNode = child;
            // continue the outer loop.
            recurse = true;
            break;
          } else {
            remaining -= childCount;
            lastValueIndex = child.parentValueIndex + 1;
          }
        }
      }
      if (!recurse) {
        // pos is within currentNode, before the next child (if any).
        return {
          creatorID: currentNode.creatorID,
          timestamp: currentNode.timestamp,
          valueIndex: listData.nthValueIndex(
            currentNode.creatorID,
            currentNode.timestamp,
            lastValueIndex,
            remaining
          ),
        };
      }
    }
  }
}

export interface ListData {
  /**
   * Should cache this (called often).
   */
  descCount(creatorID: string, timestamp: number): number;

  valueCount(
    creatorID: string,
    timestamp: number,
    startValueIndex: number,
    endValueIndex: number
  ): number;

  /**
   * valueIndex corresponding to the n-th present value in the node after startValueIndex (0-indexed).
   */
  nthValueIndex(
    creatorID: string,
    timestamp: number,
    startValueIndex: number,
    n: number
  ): number;

  readonly length: number;

  has(pos: Position): boolean;
}
