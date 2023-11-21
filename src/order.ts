import {
  Node,
  NodeDesc,
  NodeID,
  compareSiblingNodes,
  nodeDescEquals,
} from "./node";
import { NodeMap } from "./node_map";
import { Position } from "./position";
import { ReplicaIDs } from "./replica_ids";

export type Item = {
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
 * Maps (creatorID, timestamp) -> rest of NodeDesc. Excludes rootNode.
 */
export type OrderSavedState = {
  [creatorID: string]: {
    [counter: number]: {
      parentID: NodeID;
      offset: number;
    };
  };
};

class NodeInternal implements Node {
  readonly depth: number;

  /**
   * May be undefined when empty.
   */
  children?: NodeInternal[];

  /**
   * If this node was created by us, the next valueIndex to create.
   */
  createdCounter?: number;

  /**
   * Nodes created by us that are children of Positions in this node,
   * keyed by offset.
   *
   * May be undefined when empty.
   */
  ourChildren?: Map<number, NodeInternal>;

  constructor(
    readonly creatorID: string,
    readonly counter: number,
    readonly parent: NodeInternal | null,
    readonly offset: number
  ) {
    this.depth = parent === null ? 0 : parent.depth + 1;
  }

  get nextValueIndex(): number {
    return (this.offset + 1) >> 1;
  }

  get childrenLength(): number {
    return this.children?.length ?? 0;
  }

  getChild(index: number): Node {
    return this.children![index];
  }

  id(): NodeID {
    return { creatorID: this.creatorID, counter: this.counter };
  }

  desc(): NodeDesc {
    if (this.parent === null) {
      throw new Error("Cannot call desc() on the root Node");
    }
    return {
      creatorID: this.creatorID,
      counter: this.counter,
      parentID: this.parent.id(),
      offset: this.offset,
    };
  }

  toString() {
    // Similar to NodeDesc, but valid for rootNode as well.
    return JSON.stringify({
      creatorID: this.creatorID,
      timestamp: this.counter,
      parentID: this.parent === null ? null : this.parent.id(),
      offset: this.offset,
    });
  }
}

export class Order {
  readonly replicaID: string;
  private counter = 0;

  readonly rootNode: Node;
  // Can't be set etc., but can be createPosition'd or appear in a Cursor.
  // TODO: test these: hit by all iterators; can set/delete/get; error cases
  readonly minPosition: Position;
  readonly maxPosition: Position;

  /**
   * Maps from a Node's desc to that Node.
   */
  private readonly tree = new NodeMap<NodeInternal>();

  constructor(options?: { replicaID?: string }) {
    if (options?.replicaID !== undefined) {
      ReplicaIDs.validate(options.replicaID);
    }
    this.replicaID = options?.replicaID ?? ReplicaIDs.random();

    this.rootNode = new NodeInternal(ReplicaIDs.ROOT, 0, null, 0);
    this.tree.set(this.rootNode, this.rootNode);
    this.minPosition = {
      creatorID: this.rootNode.creatorID,
      counter: this.rootNode.counter,
      valueIndex: 0,
    };
    this.maxPosition = {
      creatorID: this.rootNode.creatorID,
      counter: this.rootNode.counter,
      valueIndex: 1,
    };
  }

  // ----------
  // Accessors
  // ----------

  // TODO: NodeID/NodeDesc version?
  getNode(creatorID: string, timestamp: number): Node | undefined {
    return this.tree.get2(creatorID, timestamp);
  }

  /**
   * Also validates pos (minPosition/maxPosition okay).
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
    if (
      node === this.rootNode &&
      !(pos.valueIndex === 0 || pos.valueIndex === 1)
    ) {
      throw new Error(
        `Position uses rootNode but is not minPosition or maxPosition (valueIndex 0 or 1): ${JSON.stringify(
          pos
        )}`
      );
    }
    if (node === undefined) {
      throw new Error(
        `Position references missing Node: ${JSON.stringify(
          pos
        )}. You must call Order.receive/receiveSavedState before referencing a Node.`
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
      if (aAnc.parent === bNode) {
        if (aAnc.nextValueIndex === b.valueIndex + 1) {
          // aAnc is between b and the next Position, hence greater.
          return 1;
        } else return aAnc.nextValueIndex - (b.valueIndex + 1);
      }
      // parentNode is non-null because we are not at b's depth yet,
      // hence aAnc is not the root.
      aAnc = aAnc.parent!;
    }
    for (let i = bNode.depth; i > aNode.depth; i--) {
      if (bAnc.parent === aNode) {
        if (bAnc.nextValueIndex === a.valueIndex + 1) return -1;
        else return -(bAnc.nextValueIndex - (b.valueIndex + 1));
      }
      bAnc = bAnc.parent!;
    }

    // Now aAnc and bAnc are distinct nodes at the same depth.
    // Walk up the tree in lockstep until we find a common Node parent.
    while (aAnc.parent !== bAnc.parent) {
      // parentNode is non-null because we would reach a common parent
      // (rootNode) before reaching aAnc = bAnc = rootNode.
      aAnc = aAnc.parent!;
      bAnc = bAnc.parent!;
    }

    // Now aAnc and bAnc are distinct siblings. Use sibling order.
    return compareSiblingNodes(aAnc, bAnc);
  }

  // ----------
  // Mutators
  // ----------

  /**
   * Set this to be notified when we locally create a new Node in createPosition.
   * createdNodeDesc (which is also returned by createPosition & List.insert) must be broadcast to
   * other replicas before they can use the new Position.
   */
  onCreateNode: ((createdNodeDesc: NodeDesc) => void) | undefined = undefined;

  receive(nodeDescs: Iterable<NodeDesc>): void {
    // 1. Pick out the new (non-redundant) nodes in nodeDescs.
    // For the redundant ones, check that their parents match.
    // Redundancy also applies to duplicates within nodeDescs.

    // New NodeDescs, stored as the identity map.
    const createdNodeDescs = new NodeMap<NodeDesc>();

    for (const nodeDesc of nodeDescs) {
      if (nodeDesc.creatorID === ReplicaIDs.ROOT) {
        throw new Error(
          `Received NodeDesc describing the root node: ${JSON.stringify(
            nodeDesc
          )}`
        );
      }
      const existing = this.tree.get(nodeDesc);
      if (existing !== undefined) {
        if (!nodeDescEquals(nodeDesc, existing.desc())) {
          throw new Error(
            `Received NodeDesc describing an existing node but with different metadata: received=${JSON.stringify(
              nodeDesc
            )}, existing=${JSON.stringify(existing.desc())}`
          );
        }
      } else {
        const otherNew = createdNodeDescs.get(nodeDesc);
        if (otherNew !== undefined) {
          if (!nodeDescEquals(nodeDesc, otherNew)) {
            throw new Error(
              `Received two NodeDescs for the same node with different parents: first=${JSON.stringify(
                otherNew
              )}, second=${JSON.stringify(nodeDesc)}`
            );
          }
        } else createdNodeDescs.set(nodeDesc, nodeDesc);
      }
    }

    // 2. Sort createdNodeDescs into a valid processing order, in which each node
    // follows its parent (or its parent already exists).
    const toProcess: NodeDesc[] = [];
    // New NodeDescs that are waiting on a parent in createdNodeDescs, keyed by
    // that parent.
    const pendingChildren = new NodeMap<NodeDesc[]>();

    for (const nodeDesc of createdNodeDescs.values()) {
      if (this.tree.get(nodeDesc.parentID) !== undefined) {
        // Parent already exists - ready to process.
        toProcess.push(nodeDesc);
      } else {
        // Parent should be in createdNodeDescs. Store in pendingChildren for now.
        let siblings = pendingChildren.get(nodeDesc.parentID);
        if (siblings === undefined) {
          siblings = [];
          pendingChildren.set(nodeDesc.parentID, siblings);
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
      if (createdNodeDescs.get(someParent) === undefined) {
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
    const parentNode = this.tree.get(nodeDesc.parentID);
    if (parentNode === undefined) {
      throw new Error(
        `Internal error: NodeDesc ${JSON.stringify(
          nodeDesc
        )} passed validation checks, but its parent node was not found.`
      );
    }
    const node = new NodeInternal(
      nodeDesc.creatorID,
      nodeDesc.counter,
      parentNode,
      nodeDesc.offset
    );
    this.tree.set(node, node);

    // Add node to parentNode._children.
    if (parentNode.children === undefined) parentNode.children = [node];
    else {
      // Find the index of the first sibling > node.
      let i = 0;
      for (; i < parentNode.children.length; i++) {
        // Break if sibling > node.
        if (compareSiblingNodes(parentNode.children[i], node) > 0) break;
      }
      // Insert node just before that sibling.
      parentNode.children.splice(i, 0, node);
    }

    return node;
  }

  /**
   * @param prevPos
   * @param count Use pos as startPos (node & startIndex)
   * @returns
   * @throws If prevPos >= nextPos.
   */
  createPositions(
    prevPos: Position,
    nextPos: Position,
    count = 1
  ): {
    startPos: Position;
    createdNodeDesc: NodeDesc | null;
  } {
    // Also validates the positions.
    if (this.compare(prevPos, nextPos) >= 0) {
      throw new Error(
        `prevPos >= nextPos: prevPos=${JSON.stringify(
          prevPos
        )}, nextPos=${JSON.stringify(nextPos)}`
      );
    }
    if (count < 1) throw new Error(`Invalid count: ${count}`);

    /* 
      Unlike in the Fugue paper, we don't track all tombstones (in particular,
      the max valueIndex for each Node).
      Instead, we use the provided nextPos as the rightOrigin, and apply the rule:
      
      1. If nextPos is a *not* descendant of prevPos, make a right child of prevPos.
      2. Else make a left child of nextPos.
      
      Either way, pos is a descendant of prevPos, which roughly guarantees
      forward non-interleaving; and if possible, pos is also a descendant of
      nextPos, which roughly guarantees backward non-interleaving.
      
      Exception: We don't want to create a Position with the same parent Position,
      side, and creatorID as an existing Position - to avoid extra tiebreakers.
      Instead, we become a right child of such a Position (or its right child
      if needed, etc.). As a consequence, if a user repeatedly types and deletes
      a char at the same place, then "resurrects" all of the chars, the chars
      be in time order (LtR).
    */

    // TODO: in tree structure (?): doc senderID sort different from Fugue:
    // same-as-parent last. Would like first (as in Collabs), but trickier, esp
    // in lex rep (need reverse lex numbers).

    let newNodeParent: NodeInternal;
    let newNodeOffset: number;

    if (!this.isDescendant(nextPos, prevPos)) {
      // Make a right child of prevPos.
      const prevNode = this.tree.get(prevPos)!;
      if (prevPos.creatorID === this.replicaID) {
        // Use the next Position in prevPos's Node.
        // It's okay if nextValueIndex is not prevPos.valueIndex + 1:
        // pos will still be < nextPos, and going farther along prevNode
        // amounts to following the Exception above.
        const startPos: Position = {
          ...prevNode.id(),
          valueIndex: prevNode.createdCounter!,
        };
        prevNode.createdCounter! += count;
        return { startPos, createdNodeDesc: null };
      }

      newNodeParent = prevNode;
      newNodeOffset = 2 * prevPos.valueIndex + 1;
    } else {
      // Make a left child of nextPos.
      newNodeParent = this.tree.get(nextPos)!;
      newNodeOffset = 2 * prevPos.valueIndex;
    }

    // Apply the Exception above: if we already created a node with the same
    // parent and offset, append a new Position to it instead, with is its
    // right child of a right child of ...
    const conflict = newNodeParent.ourChildren?.get(newNodeOffset);
    if (conflict !== undefined) {
      const startPos: Position = {
        ...conflict.id(),
        valueIndex: conflict.createdCounter!,
      };
      conflict.createdCounter! += count;
      return { startPos, createdNodeDesc: null };
    }

    const createdNodeDesc: NodeDesc = {
      creatorID: this.replicaID,
      counter: this.counter,
      parentID: newNodeParent.id(),
      offset: newNodeOffset,
    };
    this.counter++;

    const node = this.newNode(createdNodeDesc);
    node.createdCounter = count;
    if (newNodeParent.ourChildren === undefined) {
      newNodeParent.ourChildren = new Map();
    }
    newNodeParent.ourChildren.set(createdNodeDesc.offset, node);

    this.onCreateNode?.(createdNodeDesc);

    return { startPos: { ...node.id(), valueIndex: 0 }, createdNodeDesc };
  }

  /**
   * @returns True if `a` is a descendant of `b` in the *Position* tree,
   * in which a Node's Positions form a rightward chain.
   */
  private isDescendant(a: Position, b: Position): boolean {
    const aNode = this.tree.get(a)!;
    const bNode = this.tree.get(b)!;

    let aAnc = aNode;
    // The greatest valueIndex that `a` descends from (left or right) in aAnc.
    let curValueIndex = a.valueIndex;
    if (aAnc.depth > bNode.depth) {
      curValueIndex = aAnc.offset >> 1;
      aAnc = aAnc.parent!;
    }

    return aAnc === bNode && curValueIndex >= b.valueIndex;
  }

  // ----------
  // Iterators
  // ----------

  /**
   * Order guarantees: rootNode, then others grouped by creatorID.
   * No particular order on creatorID or timestamps (in part., timestamps
   * may be out of order).
   */
  nodes(): IterableIterator<Node> {
    return this.tree.values();
  }

  /**
   * Unlike nodes(), excludes rootNode. Otherwise same order.
   */
  *nodeDescs(): IterableIterator<NodeDesc> {
    for (const node of this.tree.values()) {
      if (node === this.rootNode) continue;
      yield node.desc();
    }
  }

  /**
   * Includes minPosition & maxPosition.
   */
  *items(): IterableIterator<Item> {
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
      if (top.nextChildIndex === top.node.childrenLength) {
        // Out of children. Finish the values and then go up.
        yield {
          node: top.node,
          startValueIndex: top.nextValueIndex,
          endValueIndex: undefined,
        };
        stack.pop();
      } else {
        const nextChild = top.node.getChild(top.nextChildIndex);
        top.nextChildIndex++;
        // Emit values less than that child.
        const startValueIndex = top.nextValueIndex;
        const endValueIndex = nextChild.nextValueIndex;
        if (endValueIndex !== startValueIndex) {
          yield {
            node: top.node,
            startValueIndex,
            endValueIndex,
          };
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
      if (creatorID !== ReplicaIDs.ROOT) creatorIDs.push(creatorID);
    }

    const sortedCreatorIDs = [...creatorIDs];
    sortedCreatorIDs.sort();
    for (const creatorID of sortedCreatorIDs) savedState[creatorID] = {};

    // Nodes
    for (const [creatorID, byCreator] of this.tree.state) {
      if (creatorID === ReplicaIDs.ROOT) continue;
      for (const [timestamp, node] of byCreator) {
        savedState[creatorID][timestamp] = {
          parentID: node.parent!.id(),
          offset: node.offset,
        };
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
      for (const [timestampStr, { parentID, offset }] of Object.entries(
        byCreator
      )) {
        nodeDescs.push({
          creatorID,
          counter: Number.parseInt(timestampStr),
          parentID,
          offset,
        });
      }
    }
    this.receive(nodeDescs);
  }
}
