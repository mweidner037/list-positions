import { IDs } from "./ids";
import { NodeMap } from "./node_map";
import { Position, positionEquals } from "./position";

/**
 * Serializable form of a Node, used for collaboration.
 */
export type NodeDesc = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly parent: Position;
};

export type MissingNode = {
  readonly creatorID: string;
  readonly timestamp: number;
};

/**
 * By-reference = by-value (within same Order)
 */
export interface Node {
  readonly creatorID: string;
  readonly timestamp: number;
  /** null for the root. */
  readonly parentNode: Node | null;
  readonly parentValueIndex: number;
  /** null for the root. */
  readonly parent: Position | null;
  readonly children: Node[];

  desc(): NodeDesc;
}

class NodeInternal implements Node {
  /**
   * May be undefined when empty.
   */
  _children?: NodeInternal[];

  /**
   * If this Node was created by us, the next valueIndex to create.
   */
  nextValueIndex?: number;

  constructor(
    readonly creatorID: string,
    readonly timestamp: number,
    readonly parentNode: NodeInternal | null,
    readonly parentValueIndex: number
  ) {}

  get parent(): Position | null {
    if (this.parentNode === null) return null;
    return {
      creatorID: this.parentNode.creatorID,
      timestamp: this.parentNode.timestamp,
      valueIndex: this.parentValueIndex,
    };
  }

  get children(): NodeInternal[] {
    // TODO: will reflect mutations except when [] - confusing.
    return this._children ?? [];
  }

  /**
   * Returns a JSON-serializable description of this Node.
   *
   * TODO: Order method to get NodeDesc for node with missing parent?
   */
  desc(): NodeDesc {
    if (this.parentNode === null) {
      throw new Error("Cannot call desc() on the root Node");
    }
    return {
      creatorID: this.creatorID,
      timestamp: this.timestamp,
      parent: {
        creatorID: this.parentNode.creatorID,
        timestamp: this.parentNode.timestamp,
        valueIndex: this.parentValueIndex,
      },
    };
  }
}

export type ItemDesc = {
  readonly node: Node;
  readonly startValueIndex: number;
  /**
   * The exclusive end of the item's valueIndex range.
   *
   * undefined to include all further Positions at this Node (unbounded valueIndex).
   *
   * Either way, (startValueIndex, endValueIndex) form slice() args.
   */
  readonly endValueIndex: number | undefined;
};

/**
 * JSON saved state for an Order, representing all of its Nodes.
 *
 * Maps (creatorID, timestamp) -> parent Position. Excludes rootNode.
 *
 * TODO: include MissingNodes as well? Yes, can do this without extra fields
 * (they'll just ref a non-existent parent). Doc that this is possible.
 */
export type OrderSavedState = {
  [creatorID: string]: {
    [timestamp: number]: Position;
  };
};

export class Order {
  readonly ID: string;
  private timestamp = 0;

  readonly rootNode: Node;
  // Can't be set etc., but can be createPositionAfter'd or appear in a Cursor.
  // TODO: instead, start & end positions? (Latter is root, 1).
  readonly rootPosition: Position;

  /**
   * Maps from a Node's desc to that Node.
   */
  private readonly tree = new NodeMap<NodeInternal>();

  /**
   * Maps from a pending node's ID to its NodeDesc.
   */
  private readonly pendingDescs = new NodeMap<NodeDesc>();
  /**
   * Maps from a missing or pending node to array of child NodeDescs waiting on it.
   */
  private readonly pendingChildren = new NodeMap<NodeDesc[]>();

  constructor(options?: { ID?: string }) {
    if (options?.ID !== undefined) {
      IDs.validate(options.ID);
    }
    this.ID = options?.ID ?? IDs.random();

    this.rootNode = new NodeInternal(IDs.ROOT, 0, null, 0);
    this.rootPosition = {
      creatorID: this.rootNode.creatorID,
      timestamp: this.rootNode.timestamp,
      valueIndex: 0,
    };
    this.tree.set(this.rootNode, this.rootNode);
  }

  // ----------
  // Mutators
  // ----------

  addNodeDescs(nodeDescs: Iterable<NodeDesc>): MissingNode[] {
    // We avoid making any state changes in this loop so that
    // failed validation = nothing happens. Instead, we put new
    // (non-redundant) NodeDescs in newNodeDescs for after the loop.
    const newNodeDescs: NodeDesc[] = [];
    for (const nodeDesc of nodeDescs) {
      // Reject invalid IDs, including root node (can't have a valid parent).
      IDs.validate(nodeDesc.creatorID);

      // Check if nodeDesc is already known. If so, compare its parent to
      // the existing parent.
      const existing = this.tree.get(nodeDesc);
      if (existing !== undefined) {
        if (!positionEquals(nodeDesc.parent, existing.parent!)) {
          throw new Error(
            `NodeDesc added twice with different parents: existing=${JSON.stringify(
              existing
            )}, new=${JSON.stringify(nodeDesc)}`
          );
        }
        continue;
      }

      const pending = this.pendingDescs.get(nodeDesc);
      if (pending !== undefined) {
        if (!positionEquals(nodeDesc.parent, pending.parent)) {
          throw new Error(
            `NodeDesc added twice with different parents: existing=${JSON.stringify(
              existing
            )}, new=${JSON.stringify(nodeDesc)}`
          );
        }
        continue;
      }

      newNodeDescs.push(nodeDesc);
    }

    // Stack of newly created Nodes that need checking for pending children.
    const toCheck: NodeInternal[] = [];

    for (const nodeDesc of newNodeDescs) {
      const parentNode = this.maybeGetNodeFor(nodeDesc.parent);
      if (parentNode !== undefined) {
        // Ready. Create Node.
        toCheck.push(this.newNode(nodeDesc, parentNode));
      } else {
        // Not ready. Add to pending data structures.
        this.pendingDescs.set(nodeDesc, nodeDesc);
        let parentArray = this.pendingChildren.get(nodeDesc.parent);
        if (parentArray === undefined) {
          parentArray = [];
          this.pendingChildren.set(nodeDesc.parent, parentArray);
        }
        parentArray.push(nodeDesc);
      }
    }

    while (toCheck.length !== 0) {
      const node = toCheck.pop()!;
      // If node is a parent of any pending NodeDescs, create those as well.
      const children = this.pendingChildren.get(node);
      if (children !== undefined) {
        for (const childDesc of children) {
          // Push the newly created child onto the stack so it is also visited.
          toCheck.push(this.newNode(childDesc, node));
          this.pendingDescs.delete(childDesc);
        }
        this.pendingChildren.delete(node);
      }
    }
  }

  private newNode(nodeDesc: NodeDesc, parentNode: NodeInternal): NodeInternal {
    const node = new NodeInternal(
      nodeDesc.creatorID,
      nodeDesc.timestamp,
      parentNode,
      nodeDesc.parent.valueIndex
    );
    this.tree.set(node, node);
    this.updateTimestamp(node.timestamp);

    // Add node to parentNode._children.
    if (parentNode._children === undefined) parentNode._children = [node];
    else {
      // Find the index of the first sibling > node.
      let i = 0;
      for (; i < parentNode._children.length; i++) {
        // Break if sibling > node.
        if (this.isSiblingLess(node, parentNode._children[i])) break;
      }
      // Insert node just before that sibling.
      parentNode._children.splice(i, 0, node);
    }

    return node;
  }

  private isSiblingLess(a: Node, b: Node): boolean {
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

  createPosition(prevPos: Position): {
    pos: Position;
    newNodeDesc: NodeDesc | null;
  } {
    this.validate(prevPos);
    const prevNode = this.tree.get(prevPos)!;

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
        return { pos, newNodeDesc: null };
      }
    }

    // Else create a new Node.
    const newNodeDesc: NodeDesc = {
      creatorID: this.ID,
      timestamp: ++this.timestamp,
      parent: prevPos,
    };
    const pos: Position = {
      creatorID: newNodeDesc.creatorID,
      timestamp: newNodeDesc.timestamp,
      valueIndex: 0,
    };
    const node = this.newNode(newNodeDesc, prevNode);
    node.nextValueIndex = 1;

    return { pos, newNodeDesc };
  }

  updateTimestamp(otherTimestamp: number): number {
    this.timestamp = Math.max(otherTimestamp, this.timestamp);
    return this.timestamp;
  }

  // ----------
  // Accessors
  // ----------

  getNode(creatorID: string, timestamp: number): Node | undefined {
    return this.tree.get2(creatorID, timestamp);
  }

  /**
   * Validates pos except for checking that Node exists (rootPos okay).
   */
  private maybeGetNodeFor(pos: Position): Node | undefined {
    if (!Number.isInteger(pos.valueIndex) || pos.valueIndex < 0) {
      throw new Error(
        `Position.valueIndex is not a nonnegative integer: ${JSON.stringify(
          pos
        )}`
      );
    }
    const node = this.tree.get(pos);
    if (node === this.rootNode && pos.valueIndex !== 0) {
      throw new Error(
        `Position uses the root Node but does not have valueIndex 0: ${JSON.stringify(
          pos
        )}`
      );
    }
    return node;
  }

  /**
   * Also validates pos (rootPos okay).
   */
  getNodeFor(pos: Position): Node {
    const node = this.maybeGetNodeFor(pos);
    if (node === undefined) {
      throw new Error(
        `Position references missing Node: ${JSON.stringify(
          pos
        )}. You must call Order.addNodeDescs before referencing a Node.`
      );
    }
    return node;
  }

  compare(a: Position, b: Position): number {
    const aInfo = this.getNodeFor(a);
    const bInfo = this.getNodeFor(b);

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
        aAncInfo = this.tree.get(aAnc)!;
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
        bAncInfo = this.tree.get(bAnc)!;
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
      const aAncParentInfo = this.tree.get(aAnc)!;
      const bAncParentInfo = this.tree.get(bAnc)!;
    }
  }

  // ----------
  // Iterators
  // ----------

  /**
   * No particular order - usually not causal or tree-order.
   * (TODO: separate method to loop over in list order (DFS), like items()?)
   *
   * Includes root.
   */
  nodes(): IterableIterator<Node> {
    return this.tree.values();
  }

  pendingNodes(): IterableIterator<NodeDesc> {
    return this.pendingDescs.values();
  }

  /**
   * TODO: want top-level missing nodes only, not intermediate (which still show
   * up in pendingChildren keys).)
   */
  *missingNodes(): IterableIterator<MissingNode> {}

  // TODO: slice args (startPos, endPos). For when you only view part of a doc.
  // Opt to avoid depth scan when they're in the same subtree?
  *items(): IterableIterator<ItemDesc> {
    // Use a manual stack instead of recursion, to prevent stack overflows
    // in deep trees.
    const stack = [
      {
        node: this.rootNode as NodeInternal,
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
            node: top.node,
            startValueIndex: top.nextValueIndex,
            endValueIndex: undefined,
          };
        }
        stack.pop();
      } else {
        const nextChild = top.node._children![top.nextChildIndex];
        top.nextChildIndex++;
        // Emit values less than that child.
        const startValueIndex = top.nextValueIndex;
        const endValueIndex = nextChild.parentValueIndex + 1;
        if (endValueIndex !== startValueIndex) {
          if (top.node !== this.rootNode) {
            yield {
              node: top.node,
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

  // ----------
  // Save & Load
  // ----------

  save(): OrderSavedState {
    const savedState: OrderSavedState = {};
    // Nodes
    for (const [creatorID, byCreator] of this.tree.state) {
      if (creatorID === IDs.ROOT) continue;
      const byCreatorSave: { [timestamp: number]: Position } = {};
      savedState[creatorID] = byCreatorSave;
      for (const [timestamp, node] of byCreator) {
        byCreatorSave[timestamp] = node.parent!;
      }
    }
    // Pending nodes
    for (const [creatorID, byCreator] of this.pendingDescs.state) {
      if (creatorID === IDs.ROOT) continue;
      let byCreatorSave = savedState[creatorID];
      if (byCreatorSave === undefined) {
        byCreatorSave = {};
        savedState[creatorID] = byCreatorSave;
      }
      savedState[creatorID] = byCreatorSave;
      for (const [timestamp, node] of byCreator) {
        byCreatorSave[timestamp] = node.parent!;
      }
    }
    return savedState;
  }

  load(savedState: OrderSavedState): MissingNode[] {
    const nodeDescs: NodeDesc[] = [];
    for (const [creatorID, byCreator] of Object.entries(savedState)) {
      for (const [timestampStr, parent] of Object.entries(byCreator)) {
        nodeDescs.push({
          creatorID,
          timestamp: Number.parseInt(timestampStr),
          parent,
        });
      }
    }
    return this.addNodeDescs(nodeDescs);
  }
}
