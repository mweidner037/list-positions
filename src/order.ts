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

export function positionEquals(a: Position, b: Position): boolean {
  return (
    a.creatorID === b.creatorID &&
    a.timestamp === b.timestamp &&
    a.valueIndex === b.valueIndex
  );
}

export interface NodeInfo {
  /**
   * null only for the root.
   */
  readonly parent: Position | null;
  readonly depth: number;
  /**
   * Child NodeInfos, in list order.
   */
  readonly children: NodeInfo[];
}

class NodeInfoInternal implements NodeInfo {
  /**
   * Internal version of children.
   */
  _children?: NodeInfoInternal[];

  /**
   * If this Node was created by us, the next valueIndex to create.
   */
  nextValueIndex?: number;

  constructor(readonly parent: Position | null, readonly depth: number) {}

  get children() {
    return this._children ?? [];
  }
}

export class Order {
  readonly ID: string;
  private timestamp = 0;

  // Can't be set etc., but can be createPositionAfter'd or appear in a Cursor.
  readonly rootPosition: Position;
  private readonly rootInfo: NodeInfoInternal;

  /**
   * Maps from (creatorID, timestamp) to that node's NodeInfo.
   */
  private readonly tree = new Map<string, Map<number, NodeInfoInternal>>();

  constructor(options?: { ID?: string }) {
    if (options?.ID !== undefined) {
      IDs.validate(options.ID);
    }
    this.ID = options?.ID ?? IDs.random();

    this.rootPosition = {
      creatorID: IDs.ROOT,
      timestamp: 0,
      valueIndex: 0,
    };
    this.rootInfo = {
      parent: null,
      depth: 0,
      children: [],
    };
    this.tree.set(
      this.rootPosition.creatorID,
      new Map([[this.rootPosition.timestamp, this.rootInfo]])
    );
    this.tree.set(this.ID, new Map());
  }

  getNodeInfo(pos: Position): NodeInfo {
    return this.getNodeInfoInternal(pos);
  }

  private getNodeInfoInternal(pos: Position): NodeInfoInternal {
    const info = this.tree.get(pos.creatorID)?.get(pos.timestamp);
    if (info === undefined) {
      throw new Error(
        `Position references unknown Node: ${JSON.stringify({
          creatorID: pos.creatorID,
          timestamp: pos.timestamp,
        })}. You must call Order.receiveNodes before referencing a Node.`
      );
    }
    if (pos.valueIndex < 0) {
      throw new Error(
        `Position has negative valueIndex: ${JSON.stringify(pos)}`
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
    IDs.validate(node.creatorID);

    let byCreator = this.tree.get(node.creatorID);
    if (byCreator === undefined) {
      byCreator = new Map();
      this.tree.set(node.creatorID, byCreator);
    }

    const existing = byCreator.get(node.timestamp);
    if (existing === undefined) {
      // New Node.
      // getInfo also checks that parent is valid.
      const parentInfo = this.getNodeInfoInternal(node.parent);
      const info = new NodeInfoInternal(node.parent, parentInfo.depth + 1);
      byCreator.set(node.timestamp, info);
      this.updateTimestamp(node.timestamp);
      this.addToChildren(info, parentInfo);
    } else {
      // Redundant Node. Make sure it matches existing.
      if (!positionEquals(node.parent, existing.parent!)) {
        throw new Error(
          `Node added twice with different parents: existing = ${JSON.stringify(
            existing.parent
          )}, new = ${JSON.stringify(node.parent)}`
        );
      }
    }
  }

  /**
   * Adds a new Node info to parentInfo.children.
   */
  private addToChildren(toAdd: NodeInfoInternal, parentInfo: NodeInfoInternal) {
    if (parentInfo.children === undefined) parentInfo._children = [toAdd];
    else {
      // Find the index of the first child > info.
      const toAddParent = toAdd.parent!;
      let i = 0;
      for (; i < parentInfo.children.length; i++) {
        const childParent = parentInfo.children[i].parent!;
        // Children sort order: first by valueIndex, then by *reverse* timestamp,
        // then by creatorID.
        // Break if child > info.
        if (childParent.valueIndex > toAddParent.valueIndex) break;
        else if (childParent.valueIndex === toAddParent.valueIndex) {
          if (childParent.timestamp < toAddParent.timestamp) break;
          else if (childParent.timestamp === toAddParent.timestamp) {
            if (childParent.creatorID > toAddParent.creatorID) break;
          }
        }
      }
      // Insert info just before that child.
      parentInfo.children.splice(i, 0, toAdd);
    }
  }

  hasNodeFor(pos: Position): boolean {
    return this.tree.get(pos.creatorID)?.get(pos.timestamp) !== undefined;
  }

  // TODO: hasMeta, to let you query if a meta is okay to add yet?

  /**
   * No particular order - usually not causal.
   *
   * Excludes root.
   *
   * Use for saving.
   */
  *nodes(): IterableIterator<Node> {
    for (const [creatorID, byCreator] of this.tree) {
      if (creatorID === IDs.ROOT) continue;
      for (const [timestamp, info] of byCreator) {
        yield { creatorID, timestamp, parent: info.parent! };
      }
    }
  }

  // TODO: save() method that returns natural JSON rep?

  updateTimestamp(otherTimestamp: number): number {
    this.timestamp = Math.max(otherTimestamp, this.timestamp);
    return this.timestamp;
  }

  createPositionAfter(prevPos: Position): {
    pos: Position;
    meta: Node | null;
  } {
    // getInfo also checks that prevPos is valid.
    const prevInfo = this.getNodeInfoInternal(prevPos);

    // First try to extend prevPos's Node.
    if (prevPos.creatorID === this.ID) {
      if (prevInfo.nextValueIndex! === prevPos.valueIndex + 1) {
        // Success.
        const pos: Position = {
          creatorID: prevPos.creatorID,
          timestamp: prevPos.timestamp,
          valueIndex: prevInfo.nextValueIndex,
        };
        prevInfo.nextValueIndex++;
        return { pos, meta: null };
      }
    }

    // Else create a new Node.
    const meta: Node = {
      creatorID: this.ID,
      timestamp: ++this.timestamp,
      parent: prevPos,
    };
    const pos: Position = {
      creatorID: meta.creatorID,
      timestamp: meta.timestamp,
      valueIndex: 0,
    };

    const info = new NodeInfoInternal(meta.parent, prevInfo.depth + 1);
    info.nextValueIndex = 1;
    this.tree.get(this.ID)!.set(meta.timestamp, info);
    this.addToChildren(info, prevInfo);
    this.onNewNode?.(meta);

    return { pos, meta };
  }

  compare(a: Position, b: Position): number {
    const aInfo = this.getNodeInfo(a);
    const bInfo = this.getNodeInfo(b);

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
        aAncInfo = this.getNodeInfo(aAnc);
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
        bAncInfo = this.getNodeInfo(bAnc);
      }
      if (bAncInfo === aInfo) {
        // Descendant is greater than its ancestors.
        if (bAnc.valueIndex === a.valueIndex) return -1;
        else return bAnc.valueIndex - a.valueIndex;
      }
    }

    // Walk up the tree in lockstep until we find a common Node parent.
    // TODO
  }
}
