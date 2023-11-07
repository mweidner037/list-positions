import { IDs } from "./ids";
import { NodeMap } from "./node_map";
import { Position, positionEquals } from "./position";

/**
 * Serializable form of a Node, used for collaboration and save/load.
 *
 * TODO: actually just for collaboration/add. Rename this and Node.save()?
 */
export type NodeDesc = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly parent: Position;
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

export type MissingNode = {
  readonly creatorID: string;
  readonly timestamp: number;
};

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
  private readonly tree = new NodeMap<Node>();

  /**
   * Maps from a pending Node's desc to the existing NodeDesc.
   */
  private readonly pendingDescs = new NodeMap<NodeDesc>();
  /**
   * Maps from a MissingNode to an array of child NodeDescs waiting on it.
   */
  private readonly pendingChildren = new NodeMap<NodeDesc>();

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
    this.tree.set(
      this.rootNode.creatorID,
      this.rootNode.timestamp,
      this.rootNode
    );
  }

  // ----------
  // Mutators
  // ----------

  addNodeDescs(nodeDescs: Iterable<NodeDesc>): MissingNode[] {
    // Stack of newly-created Nodes, possibly from old pendingNodes.
    const newNodes: Node[] = [];

    //

    for (const nodeDesc of nodeDescs) {
      const existing = this.getNode(nodeDesc.creatorID, nodeDesc.timestamp);
      // TODO: also check against pending nodes?
      if (existing === undefined) {
        // New Node.
        const nodeInternal: Node = {
          creatorID: node.creatorID,
          timestamp: node.timestamp,
          // getNode also validates node.parent.
          parentNode: this.getNodeFor(node.parent),
          parentValueIndex: node.parent.valueIndex,
        };
        byCreator.set(nodeInternal.timestamp, nodeInternal);
        this.updateTimestamp(nodeInternal.timestamp);
        this.addToChildren(nodeInternal);
      } else {
        // Redundant Node. Make sure it matches existing.
        // TODO: what about Byzantine case where you need to overwrite a "bad" Node?
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
  }

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
      const nodeInternal: Node = {
        creatorID: node.creatorID,
        timestamp: node.timestamp,
        // getNode also validates node.parent.
        parentNode: this.getNodeFor(node.parent),
        parentValueIndex: node.parent.valueIndex,
      };
      byCreator.set(nodeInternal.timestamp, nodeInternal);
      this.updateTimestamp(nodeInternal.timestamp);
      this.addToChildren(nodeInternal);
    } else {
      // Redundant Node. Make sure it matches existing.
      // TODO: what about Byzantine case where you need to overwrite a "bad" Node?
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

  updateTimestamp(otherTimestamp: number): number {
    this.timestamp = Math.max(otherTimestamp, this.timestamp);
    return this.timestamp;
  }

  createPositionAfter(prevPos: Position): {
    pos: Position;
    newNode: Node | null;
  } {
    // getNode also checks that prevPos is valid.
    const prevNode = this.getNodeFor(prevPos);

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

    const newNodeInternal: Node = {
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

  // ----------
  // Accessors
  // ----------

  getNode(creatorID: string, timestamp: number): Node | undefined {
    return this.tree.get(creatorID, timestamp);
  }

  getNodeFor(pos: Position): Node | undefined {
    return this.tree.getObj(pos);
  }

  validate(pos: Position): void {
    const node = this.getNodeFor(pos);
    if (node === undefined) {
      throw new Error(
        `Position references missing Node: ${JSON.stringify(
          pos
        )}. You must call Order.TODOreceiveNodes before referencing a Node.`
      );
    }
    if (!Number.isInteger(pos.valueIndex) || pos.valueIndex < 0) {
      throw new Error(
        `Position.valueIndex is not a nonnegative integer: ${JSON.stringify(
          pos
        )}`
      );
    }
    if (node === this.rootNode && pos.valueIndex !== 0) {
      throw new Error(
        `Position uses the root Node but does not have valueIndex 0: ${JSON.stringify(
          pos
        )}`
      );
    }
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
        aAncInfo = this.getNodeFor(aAnc);
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
        bAncInfo = this.getNodeFor(bAnc);
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
      const aAncParentInfo = this.getNodeFor(aAnc);
      const bAncParentInfo = this.getNodeFor(bAnc);
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
  *nodes(): IterableIterator<Node> {
    for (const byCreator of this.tree.values()) {
      for (const node of byCreator.values()) {
        yield node;
      }
    }
  }

  /**
   * Unlike nodes(), also includes nodes with missing parents?
   */
  *nodeDescs(): IterableIterator<NodeDesc> {}

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

  // ----------
  // Save & Load
  // ----------

  save(): OrderSavedState {}

  load(savedState: OrderSavedState): MissingNode[] {}
}
