import { IDs } from "./ids";
import { NodeMap } from "./node_map";
import { Position, positionEquals } from "./position";

// TODO: OrderManager class, which wraps an Order to handle pending/missing
// nodes and also supports VV-based p2p sync?
// (Is that possible w/o extra causal dot / last-timestamp indicator
// on each NodeDesc? I guess the OrderManager could add it,
// or it could assume causal/PRAM consistency.)

/**
 * Serializable form of a Node, used for collaboration.
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

  desc(): NodeDesc;
  children(): IterableIterator<Node>;
}

class NodeInternal implements Node {
  readonly depth: number;

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
  ) {
    this.depth = parentNode === null ? 0 : parentNode.depth + 1;
  }

  get parent(): Position | null {
    if (this.parentNode === null) return null;
    return {
      creatorID: this.parentNode.creatorID,
      timestamp: this.parentNode.timestamp,
      valueIndex: this.parentValueIndex,
    };
  }

  children(): IterableIterator<NodeInternal> {
    return (this._children ?? [])[Symbol.iterator]();
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

export function compareSiblingNodes(a: Node, b: Node): number {
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

// TODO: Item instead? Unless used by List.
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

  // TODO: TimestampSource option.
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

  /**
   * Set this to be notified when we locally create a new Node in createPosition.
   * newNodeDesc (which is also returned by createPosition & List.insert) must be broadcast to
   * other replicas before they can use the new Position.
   */
  onCreatedNode: ((newNodeDesc: NodeDesc) => void) | undefined = undefined;

  receive(nodeDescs: Iterable<NodeDesc>): void {
    // 1. Pick out the new (non-redundant) nodes in nodeDescs.
    // For the redundant ones, check that their parents match.
    // Redundancy also applies to duplicates within nodeDescs.

    // New NodeDescs, stored as the identity map.
    const newNodeDescs = new NodeMap<NodeDesc>();

    for (const nodeDesc of nodeDescs) {
      if (nodeDesc.creatorID === IDs.ROOT) {
        throw new Error(
          `Received NodeDesc describing the root node: ${JSON.stringify(
            nodeDesc
          )}`
        );
      }
      const existing = this.tree.get(nodeDesc);
      if (existing !== undefined) {
        if (!positionEquals(nodeDesc.parent, existing.parent!)) {
          throw new Error(
            `Received NodeDesc describing an existing node but with a different parent: received=${JSON.stringify(
              nodeDesc
            )}, existing=${JSON.stringify(existing.desc())}`
          );
        }
      } else {
        const otherNew = newNodeDescs.get(nodeDesc);
        if (otherNew !== undefined) {
          if (!positionEquals(nodeDesc.parent, otherNew.parent)) {
            throw new Error(
              `Received two NodeDescs for the same node with different parents: first=${JSON.stringify(
                otherNew
              )}, second=${JSON.stringify(nodeDesc)}`
            );
          }
        } else newNodeDescs.set(nodeDesc, nodeDesc);
      }
    }

    // 2. Sort newNodeDescs into a valid processing order, in which each node
    // follows its parent (or its parent already exists).
    const toProcess: NodeDesc[] = [];
    // New NodeDescs that are waiting on a parent in newNodeDescs, keyed by
    // that parent.
    const pendingChildren = new NodeMap<NodeDesc[]>();

    for (const nodeDesc of newNodeDescs.values()) {
      if (this.tree.get(nodeDesc.parent) !== undefined) {
        // Parent already exists - ready to process.
        toProcess.push(nodeDesc);
      } else {
        // Parent should be in newNodeDescs. Store in pendingChildren for now.
        let siblings = pendingChildren.get(nodeDesc.parent);
        if (siblings === undefined) {
          siblings = [];
          pendingChildren.set(nodeDesc.parent, siblings);
        }
        siblings.push(nodeDesc);
      }
    }
    // For each node in toProcess, if it has pending children, append those.
    // That way they'll be processed after the node, including by this loop.
    for (const nodeDesc of toProcess) {
      const children = pendingChildren.get(nodeDesc);
      if (children !== undefined) {
        toProcess.push(...children);
        // Delete so we can later check whether all pendingChildren were
        // moved to toProcess.
        pendingChildren.delete(nodeDesc);
      }
    }

    // Check that all pendingChildren were moved to toProcess.
    if (!pendingChildren.isEmpty()) {
      const someParent = pendingChildren.someKey();
      const somePendingChild = pendingChildren.get(someParent)![0];
      // someParent was never added to toProcess.
      if (newNodeDescs.get(someParent) === undefined) {
        // someParent is not already known and not in nodeDescs.
        throw new Error(
          `Received NodeDesc ${JSON.stringify(
            somePendingChild
          )}, but we have not yet received a NodeDesc for its parent node ${JSON.stringify(
            someParent
          )}`
        );
      } else {
        // someParent is indeed in nodeDescs, but never reached. It must be
        // part of a cycle.
        throw new Error(
          `Failed to process nodeDescs due to a cycle involving ${JSON.stringify(
            somePendingChild
          )}`
        );
      }
    }

    // Finally, we are guaranteed that:
    // - All NodeDescs in toProcess are new and valid.
    // - They are in a valid order (a node's parent will be known by the time
    // it is reached).

    for (const nodeDesc of toProcess) this.newNode(nodeDesc);
  }

  private newNode(nodeDesc: NodeDesc): NodeInternal {
    const parentNode = this.tree.get(nodeDesc.parent);
    if (parentNode === undefined) {
      throw new Error(
        `Internal error: NodeDesc ${JSON.stringify(
          nodeDesc
        )} passed validation checks, but its parent node was not found.`
      );
    }
    const node = new NodeInternal(
      nodeDesc.creatorID,
      nodeDesc.timestamp,
      parentNode,
      nodeDesc.parent.valueIndex
    );
    this.tree.set(node, node);
    this.timestamp = Math.max(this.timestamp, node.timestamp);

    // Add node to parentNode._children.
    if (parentNode._children === undefined) parentNode._children = [node];
    else {
      // Find the index of the first sibling > node.
      let i = 0;
      for (; i < parentNode._children.length; i++) {
        // Break if sibling > node.
        if (compareSiblingNodes(parentNode._children[i], node) > 0) break;
      }
      // Insert node just before that sibling.
      parentNode._children.splice(i, 0, node);
    }

    return node;
  }

  createPosition(prevPos: Position): {
    pos: Position;
    newNodeDesc: NodeDesc | null;
  } {
    // Also validates pos.
    const prevNode = this.getNodeFor(prevPos) as NodeInternal;

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
    const node = this.newNode(newNodeDesc);
    node.nextValueIndex = 1;

    this.onCreatedNode?.(newNodeDesc);

    return { pos, newNodeDesc };
  }

  // ----------
  // Accessors
  // ----------

  getNode(creatorID: string, timestamp: number): Node | undefined {
    return this.tree.get2(creatorID, timestamp);
  }

  /**
   * Also validates pos (rootPos okay).
   */
  getNodeFor(pos: Position): Node {
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
    const aNode = this.getNodeFor(a);
    const bNode = this.getNodeFor(b);

    // Shortcut for equal nodes, for which we can use reference equality.
    if (aNode === bNode) return a.valueIndex - b.valueIndex;

    // Walk up the tree until aAnc & bAnc are the same depth.
    let aAnc = aNode;
    let bAnc = bNode;
    for (let i = aNode.depth; i > bNode.depth; i--) {
      if (aAnc.parentNode === bNode) {
        if (aAnc.parentValueIndex === b.valueIndex) {
          // Descendant is greater than its ancestors.
          return 1;
        } else return aAnc.parentValueIndex - b.valueIndex;
      }
      // parentNode is non-null because we are not at b's depth yet,
      // hence aAnc is not the root.
      aAnc = aAnc.parentNode!;
    }
    for (let i = bNode.depth; i > aNode.depth; i--) {
      if (bAnc.parentNode === aNode) {
        if (bAnc.parentValueIndex === a.valueIndex) return -1;
        else return a.valueIndex - bAnc.parentValueIndex;
      }
      bAnc = bAnc.parentNode!;
    }

    // Now aAnc and bAnc are distinct nodes at the same depth.
    // Walk up the tree in lockstep until we find a common Node parent.
    while (aAnc.parentNode !== bAnc.parentNode) {
      // parentNode is non-null because we would reach a common parent
      // (rootNode) before reaching aAnc = bAnc = rootNode.
      aAnc = aAnc.parentNode!;
      bAnc = bAnc.parentNode!;
    }

    // Now aAnc and bAnc are distinct siblings. Use sibling order.
    return compareSiblingNodes(aAnc, bAnc);
  }

  // ----------
  // Iterators
  // ----------

  /**
   * No particular order, but are grouped by sender.
   *
   * TODO: separate method to loop over senders explicitly, like you would need to
   * implement save() yourself?
   *
   * Includes root.
   */
  nodes(): IterableIterator<Node> {
    return this.tree.values();
  }

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
    // Touch all creatorIDs in lexicographic order, to ensure consistent JSON
    // serialization order for identical states. (JSON field order is: non-negative
    // integers in numeric order, then string keys in creation order.)
    const creatorIDs: string[] = [];
    for (const creatorID of this.tree.state.keys()) {
      if (creatorID !== IDs.ROOT) creatorIDs.push(creatorID);
    }

    const sortedCreatorIDs = [...creatorIDs];
    sortedCreatorIDs.sort();
    for (const creatorID of sortedCreatorIDs) savedState[creatorID] = {};

    // Nodes
    for (const [creatorID, byCreator] of this.tree.state) {
      if (creatorID === IDs.ROOT) continue;
      for (const [timestamp, node] of byCreator) {
        savedState[creatorID][timestamp] = node.parent!;
      }
    }

    return savedState;
  }

  /**
   * Receives all of the nodes described by savedState - merge op (not overwrite).
   */
  receiveSavedState(savedState: OrderSavedState): void {
    // Opt: Pass custom iterator instead of array, to avoid 2x memory when
    // merging nearly-identical states.
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
    this.receive(nodeDescs);
  }
}
