import { LexUtils } from "./lex_utils";
import { NodeMeta, OrderNode } from "./node";
import { NodeIDs } from "./node_ids";
import { LexPosition, Position } from "./position";

/**
 * JSON serializable array. Many opt opportunities.
 */
export type OrderSavedState = NodeMeta[];

class NodeInternal implements OrderNode {
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
  createdChildren?: Map<number, NodeInternal>;

  constructor(
    readonly id: string,
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

  getChild(index: number): OrderNode {
    return this.children![index];
  }

  meta(): NodeMeta {
    if (this.parent === null) {
      throw new Error("Cannot call meta() on the root OrderNode");
    }
    return {
      id: this.id,
      parentID: this.parent.id,
      offset: this.offset,
    };
  }

  dependencies(): OrderNode[] {
    const ans: OrderNode[] = [];
    for (
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let currentNode: OrderNode = this;
      // Exclude the root.
      currentNode.parent !== null;
      currentNode = currentNode.parent
    ) {
      ans.push(currentNode);
    }
    ans.reverse();
    return ans;
  }

  lexPrefix(): string {
    return LexUtils.combineNodePrefix(
      this.dependencies().map((node) => node.meta())
    );
  }

  toString() {
    // Similar to NodeMeta, but valid for rootNode as well.
    return JSON.stringify({
      id: this.id,
      parentID: this.parent === null ? null : this.parent.id,
      offset: this.offset,
    });
  }
}

export class Order {
  private readonly newNodeID: () => string;

  readonly rootNode: OrderNode;

  /**
   * Maps from node ID to the *unique* corresponding NodeInternal.
   */
  private readonly tree = new Map<string, NodeInternal>();

  /**
   * Set this to be notified when we locally create a new OrderNode in createPosition.
   * The NodeMeta for createdNode (which is also returned by createPosition & List.insert etc.)
   * must be broadcast to other replicas before they can use the new Position.
   */
  onCreateNode: ((createdNode: OrderNode) => void) | undefined = undefined;

  /**
   *
   * @param options.newNodeID Function that returns a globally unique new
   * node ID, used for our created node's IDs. Default: `NodeIDs.usingReplicaID()`.
   */
  constructor(options?: { newNodeID?: () => string }) {
    this.newNodeID = options?.newNodeID ?? NodeIDs.usingReplicaID();

    this.rootNode = new NodeInternal(NodeIDs.ROOT, null, 0);
    this.tree.set(this.rootNode.id, this.rootNode);
  }

  // ----------
  // Accessors
  // ----------

  getNode(nodeID: string): OrderNode | undefined {
    return this.tree.get(nodeID);
  }

  /**
   * Also validates pos.
   */
  getNodeFor(pos: Position): OrderNode {
    if (!Number.isInteger(pos.valueIndex) || pos.valueIndex < 0) {
      throw new Error(
        `Position.valueIndex is not a nonnegative integer: ${JSON.stringify(
          pos
        )}`
      );
    }
    const node = this.tree.get(pos.nodeID);
    if (node === undefined) {
      throw new Error(
        `Position references missing OrderNode: ${JSON.stringify(
          pos
        )}. You must call Order.receive before referencing an OrderNode.`
      );
    }
    if (
      node === this.rootNode &&
      !(pos.valueIndex === 0 || pos.valueIndex === 1)
    ) {
      throw new Error(
        `Position uses rootNode but is not MIN_POSITION or MAX_POSITION (valueIndex 0 or 1): valueIndex=${pos.valueIndex}`
      );
    }
    return node;
  }

  // Bind as variable instead of class method, in case callers forget.
  compare = (a: Position, b: Position): number => {
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
      // aAnc.parent is non-null because we are at depth > bNode.depth >= 0,
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
    // Walk up the tree in lockstep until we find a common node parent.
    while (aAnc.parent !== bAnc.parent) {
      // parents are non-null because we would reach a common parent
      // (rootNode) before reaching aAnc = bAnc = rootNode.
      aAnc = aAnc.parent!;
      bAnc = bAnc.parent!;
    }

    // Now aAnc and bAnc are distinct siblings. Use sibling order.
    return Order.compareSiblingNodes(aAnc, bAnc);
  };

  // ----------
  // Mutators
  // ----------

  receive(nodeMetas: Iterable<NodeMeta>): void {
    // 1. Pick out the new (non-redundant) nodes in nodeMetas.
    // For the redundant ones, check that their parents match.
    // Redundancy also applies to duplicates within nodeMetas.

    // New NodeMetas, keyed by id.
    const newNodeMetas = new Map<string, NodeMeta>();

    for (const nodeMeta of nodeMetas) {
      if (nodeMeta.id === NodeIDs.ROOT) {
        throw new Error(
          `Received NodeMeta describing the root node: ${JSON.stringify(
            nodeMeta
          )}.`
        );
      }
      const existing = this.tree.get(nodeMeta.id);
      if (existing !== undefined) {
        if (!Order.equalsNodeMeta(nodeMeta, existing.meta())) {
          throw new Error(
            `Received NodeMeta describing an existing node but with different metadata: received=${JSON.stringify(
              nodeMeta
            )}, existing=${JSON.stringify(existing.meta())}.`
          );
        }
      } else {
        const otherNew = newNodeMetas.get(nodeMeta.id);
        if (otherNew !== undefined) {
          if (!Order.equalsNodeMeta(nodeMeta, otherNew)) {
            throw new Error(
              `Received two NodeMetas for the same node but with different metadata: first=${JSON.stringify(
                otherNew
              )}, second=${JSON.stringify(nodeMeta)}.`
            );
          }
        } else {
          NodeIDs.validate(nodeMeta.id);
          newNodeMetas.set(nodeMeta.id, nodeMeta);
        }
      }
    }

    // 2. Sort newNodeMetas into a valid processing order, in which each node
    // follows its parent (or its parent already exists).
    const toProcess: NodeMeta[] = [];
    // New NodeMetas that are waiting on a parent in newNodeMetas, keyed by
    // that parent's id.
    const pendingChildren = new Map<string, NodeMeta[]>();

    for (const nodeMeta of newNodeMetas.values()) {
      if (this.tree.get(nodeMeta.parentID) !== undefined) {
        // Parent already exists - ready to process.
        toProcess.push(nodeMeta);
      } else {
        // Parent should be in newNodeMetas. Store in pendingChildren for now.
        let pendingArr = pendingChildren.get(nodeMeta.parentID);
        if (pendingArr === undefined) {
          pendingArr = [];
          pendingChildren.set(nodeMeta.parentID, pendingArr);
        }
        pendingArr.push(nodeMeta);
      }
    }
    // For each node in toProcess, if it has pending children, append those.
    // That way they'll be processed after the node, including by this loop.
    for (const nodeMeta of toProcess) {
      const pendingArr = pendingChildren.get(nodeMeta.id);
      if (pendingArr !== undefined) {
        toProcess.push(...pendingArr);
        // Delete so we can later check whether all pendingChildren were
        // moved to toProcess.
        pendingChildren.delete(nodeMeta.id);
      }
    }

    // Check that all pendingChildren were moved to toProcess.
    if (pendingChildren.size !== 0) {
      // Nope; find a failed nodeMeta for the error message.
      let someFailedMeta = (
        pendingChildren.values().next().value as NodeMeta[]
      )[0];
      // Walk up the tree until we find a nodeMeta with missing parent or a cycle.
      const seenNodeIDs = new Set<string>();
      while (newNodeMetas.has(someFailedMeta.parentID)) {
        someFailedMeta = newNodeMetas.get(someFailedMeta.parentID)!;
        if (seenNodeIDs.has(someFailedMeta.id)) {
          // Found a cycle.
          throw new Error(
            `Failed to process nodeMetas due to a cycle involving ${JSON.stringify(
              someFailedMeta
            )}.`
          );
        }
        seenNodeIDs.add(someFailedMeta.id);
      }
      // someFailedMeta's parent does not exist and is not in newNodeMetas.
      throw new Error(
        `Received NodeMeta ${JSON.stringify(
          someFailedMeta
        )}, but we have not yet received a NodeMeta for its parent node.`
      );
    }

    // Finally, we are guaranteed that:
    // - All NodeMetas in toProcess are new, valid, and distinct.
    // - They are in a valid order (a node's parent will be known by the time
    // it is reached).
    for (const nodeMeta of toProcess) this.newNode(nodeMeta);
  }

  private newNode(nodeMeta: NodeMeta): NodeInternal {
    const parentNode = this.tree.get(nodeMeta.parentID);
    if (parentNode === undefined) {
      throw new Error(
        `Internal error: NodeMeta ${JSON.stringify(
          nodeMeta
        )} passed validation checks, but its parent node was not found.`
      );
    }
    const node = new NodeInternal(nodeMeta.id, parentNode, nodeMeta.offset);
    this.tree.set(node.id, node);

    // Add node to parentNode.children.
    if (parentNode.children === undefined) parentNode.children = [node];
    else {
      // Find the index of the first sibling > node (possibly none).
      let i = 0;
      for (; i < parentNode.children.length; i++) {
        // Break if sibling > node.
        if (Order.compareSiblingNodes(parentNode.children[i], node) > 0) break;
      }
      // Insert node just before that sibling, or at the end if none.
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
    nextPos: Position
  ): [pos: Position, createdNode: OrderNode | null];
  createPositions(
    prevPos: Position,
    nextPos: Position,
    count: number
  ): [startPos: Position, createdNode: OrderNode | null];
  createPositions(
    prevPos: Position,
    nextPos: Position,
    count = 1
  ): [startPos: Position, createdNode: OrderNode | null] {
    // Also validates the positions.
    if (this.compare(prevPos, nextPos) >= 0) {
      throw new Error(
        `prevPos >= nextPos: prevPos=${JSON.stringify(
          prevPos
        )}, nextPos=${JSON.stringify(nextPos)}`
      );
    }
    if (count < 1)
      throw new Error(`Invalid count: ${count} (must be positive)`);

    /* 
      Unlike in the Fugue paper, we don't track all tombstones (in particular,
      the max valueIndex for each OrderNode).
      Instead, we use the provided nextPos as the rightOrigin, and apply the rule:
      
      1. If nextPos is a *not* descendant of prevPos, make a right child of prevPos.
      2. Else make a left child of nextPos.
      
      Either way, pos is a descendant of prevPos, which roughly guarantees
      forward non-interleaving; and if possible, pos is also a descendant of
      nextPos, which roughly guarantees backward non-interleaving.
      
      Exception: We don't want to create a Position in the same place as one of
      our existing positions, to minimize same-side siblings.
      Instead, we become a right child of such a Position (or its right child
      if needed, etc.). As a consequence, if a user repeatedly types and deletes
      a char at the same place, then "resurrects" all of the chars, the chars will
      be in time order (LtR) and share an OrderNode.
    */

    // TODO: in tree structure (?): doc senderID sort different from Fugue:
    // same-as-parent last. Would like first (as in Collabs), but trickier, esp
    // in lex rep (need reverse lex numbers).

    let newNodeParent: NodeInternal;
    let newNodeOffset: number;

    if (!this.isDescendant(nextPos, prevPos)) {
      // Make a right child of prevPos.
      const prevNode = this.tree.get(prevPos.nodeID)!;
      if (prevNode.createdCounter !== undefined) {
        // We created prevNode. Use its next Position.
        // It's okay if nextValueIndex is not prevPos.valueIndex + 1:
        // pos will still be < nextPos, and going farther along prevNode
        // amounts to following the Exception above.
        const startPos: Position = {
          nodeID: prevNode.id,
          valueIndex: prevNode.createdCounter,
        };
        prevNode.createdCounter += count;
        return [startPos, null];
      }

      newNodeParent = prevNode;
      newNodeOffset = 2 * prevPos.valueIndex + 1;
    } else {
      // Make a left child of nextPos.
      newNodeParent = this.tree.get(nextPos.nodeID)!;
      newNodeOffset = 2 * nextPos.valueIndex;
    }

    // Apply the Exception above: if we already created a node with the same
    // parent and offset, append a new Position to it instead, which is its
    // right descendant.
    const conflict = newNodeParent.createdChildren?.get(newNodeOffset);
    if (conflict !== undefined) {
      const startPos: Position = {
        nodeID: conflict.id,
        valueIndex: conflict.createdCounter!,
      };
      conflict.createdCounter! += count;
      return [startPos, null];
    }

    const createdNodeMeta: NodeMeta = {
      id: this.newNodeID(),
      parentID: newNodeParent.id,
      offset: newNodeOffset,
    };
    if (this.tree.has(createdNodeMeta.id)) {
      throw new Error(
        `newNodeID() returned node ID that already exists: ${createdNodeMeta.id}`
      );
    }

    const createdNode = this.newNode(createdNodeMeta);
    createdNode.createdCounter = count;
    if (newNodeParent.createdChildren === undefined) {
      newNodeParent.createdChildren = new Map();
    }
    newNodeParent.createdChildren.set(createdNodeMeta.offset, createdNode);

    this.onCreateNode?.(createdNode);

    return [
      {
        nodeID: createdNode.id,
        valueIndex: 0,
      },
      createdNode,
    ];
  }

  /**
   * @returns True if `a` is a descendant of `b` in the *Position* tree,
   * in which a node's Positions form a rightward chain.
   */
  private isDescendant(a: Position, b: Position): boolean {
    const aNode = this.tree.get(a.nodeID)!;
    const bNode = this.tree.get(b.nodeID)!;

    let aAnc = aNode;
    // The greatest valueIndex that `a` descends from (left or right) in aAnc.
    let curValueIndex = a.valueIndex;
    while (aAnc.depth > bNode.depth) {
      // Integer division by 2: offset 0 is left desc of valueIndex 0,
      // offset 1 is right desc of valueIndex 0,
      // offset 2 is left desc of valueIndex 1, etc.
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
  nodes(): IterableIterator<OrderNode> {
    return this.tree.values();
  }

  /**
   * Unlike nodes(), excludes rootNode. Otherwise same order.
   *
   * Useful for saving; pass the result to Order.receive to load/merge.
   * Can also turn into map (id -> { parentID, offset }).
   */
  *nodeMetas(): IterableIterator<NodeMeta> {
    for (const node of this.tree.values()) {
      if (node === this.rootNode) continue;
      yield node.meta();
    }
  }

  // ----------
  // Save & Load
  // ----------

  save(): OrderSavedState {
    return [...this.nodeMetas()];
  }

  /**
   * Merge, not overwrite.
   *
   * Same as receive; save/load names for discoverability.
   */
  load(savedState: OrderSavedState): void {
    this.receive(savedState);
  }

  // ----------
  // LexPosition
  // ----------

  lex(pos: Position): LexPosition {
    const node = this.getNodeFor(pos);
    // OPT: construct it directly with a tree walk and single join.
    return LexUtils.combinePos(node.lexPrefix(), pos.valueIndex);
  }

  unlex(lexPos: LexPosition): Position {
    const [nodePrefix, valueIndex] = LexUtils.splitPos(lexPos);
    const nodeID = LexUtils.nodeIDFor(nodePrefix);
    if (!this.tree.has(nodeID)) {
      // Receive the node.
      this.receive(LexUtils.splitNodePrefix(nodePrefix));
    }
    // Else we skip checking agreement with the existing node, for efficiency.

    return { nodeID, valueIndex };
  }

  // ----------
  // Static utilities
  // ----------

  static readonly MIN_POSITION: Position = {
    nodeID: NodeIDs.ROOT,
    valueIndex: 0,
  };
  static readonly MAX_POSITION: Position = {
    nodeID: NodeIDs.ROOT,
    valueIndex: 1,
  };

  static readonly MIN_LEX_POSITION: LexPosition = LexUtils.MIN_LEX_POSITION;
  static readonly MAX_LEX_POSITION: LexPosition = LexUtils.MAX_LEX_POSITION;

  /**
   * Returns whether two Positions are equal, i.e., they have equal contents.
   */
  static equalsPosition(a: Position, b: Position): boolean {
    return a.nodeID === b.nodeID && a.valueIndex === b.valueIndex;
  }

  /**
   * Returns whether two NodeMetas are equal, i.e., they have equal contents.
   */
  static equalsNodeMeta(a: NodeMeta, b: NodeMeta): boolean {
    return a.id === b.id && a.parentID === b.parentID && a.offset === b.offset;
  }

  /**
   * Expands output of Order.createPositions, List.insert, etc. into an array
   * of Positions.
   *
   * @param startPos
   * @param count
   * @returns
   */
  static startPosToArray(startPos: Position, count: number): Position[] {
    const ans = new Array<Position>(count);
    for (let i = 0; i < count; i++) {
      ans[i] = {
        nodeID: startPos.nodeID,
        valueIndex: startPos.valueIndex + i,
      };
    }
    return ans;
  }

  /**
   * [Compare function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#comparefn)
   * for **sibling** Nodes in an Order, i.e., Nodes with the same parentNode.
   *
   * You do not need to call this function unless you are doing something advanced.
   * To compare Positions, instead use `Order.compare` or a List. To iterate over
   * an OrderNode's children in order, use its childrenLength and getChild methods.
   */
  static compareSiblingNodes(a: OrderNode, b: OrderNode): number {
    if (a.parent !== b.parent) {
      throw new Error(
        `nodeSiblingCompare can only compare Nodes with the same parentNode, not a=${a}, b=${b}`
      );
    }

    // Sibling sort order: first by offset, then by id.
    if (a.offset !== b.offset) {
      return a.offset - b.offset;
    }
    if (a.id !== b.id) {
      // Need to add the comma to match how LexPositions are sorted.
      return a.id + "," > b.id + "," ? 1 : -1;
    }
    return 0;
  }
}
