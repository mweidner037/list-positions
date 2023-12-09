import { BunchMeta, BunchNode } from "./bunch";
import { BunchIDs } from "./bunch_ids";
import { LexUtils } from "./lex_utils";
import { LexPosition, Position } from "./position";

/**
 * JSON serializable array. Many opt opportunities.
 */
export type OrderSavedState = BunchMeta[];

class NodeInternal implements BunchNode {
  readonly depth: number;

  /**
   * May be undefined when empty.
   */
  children?: NodeInternal[];

  /**
   * If this node was created by us, the next innerIndex to create.
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
    readonly bunchID: string,
    readonly parent: NodeInternal | null,
    readonly offset: number
  ) {
    this.depth = parent === null ? 0 : parent.depth + 1;
  }

  get nextInnerIndex(): number {
    return (this.offset + 1) >> 1;
  }

  get childrenLength(): number {
    return this.children?.length ?? 0;
  }

  getChild(index: number): BunchNode {
    return this.children![index];
  }

  meta(): BunchMeta {
    if (this.parent === null) {
      throw new Error("Cannot call meta() on the root BunchNode");
    }
    return {
      bunchID: this.bunchID,
      parentID: this.parent.bunchID,
      offset: this.offset,
    };
  }

  ancestors(): BunchNode[] {
    const ans: BunchNode[] = [];
    for (
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let currentNode: BunchNode = this;
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
      this.ancestors().map((node) => node.meta())
    );
  }

  toString() {
    // Similar to BunchMeta, but valid for rootNode as well.
    return JSON.stringify({
      id: this.bunchID,
      parentID: this.parent === null ? null : this.parent.bunchID,
      offset: this.offset,
    });
  }
}

export class Order {
  private readonly newBunchID: () => string;

  readonly rootNode: BunchNode;

  /**
   * Maps from node ID to the *unique* corresponding NodeInternal.
   */
  private readonly tree = new Map<string, NodeInternal>();

  /**
   * Set this to be notified when we locally create a new BunchNode in createPosition.
   * The BunchMeta for createdNode (which is also returned by createPosition & List.insert etc.)
   * must be broadcast to other replicas before they can use the new Position.
   */
  onCreateNode: ((createdNode: BunchNode) => void) | undefined = undefined;

  /**
   *
   * @param options.newBunchID Function that returns a globally unique new
   * node ID, used for our created node's IDs. Default: `NodeIDs.usingReplicaID()`.
   */
  constructor(options?: { newBunchID?: () => string }) {
    this.newBunchID = options?.newBunchID ?? BunchIDs.usingReplicaID();

    this.rootNode = new NodeInternal(BunchIDs.ROOT, null, 0);
    this.tree.set(this.rootNode.bunchID, this.rootNode);
  }

  // ----------
  // Accessors
  // ----------

  getNode(bunchID: string): BunchNode | undefined {
    return this.tree.get(bunchID);
  }

  /**
   * Also validates pos.
   */
  getNodeFor(pos: Position): BunchNode {
    if (!Number.isInteger(pos.innerIndex) || pos.innerIndex < 0) {
      throw new Error(
        `Position.innerIndex is not a nonnegative integer: ${JSON.stringify(
          pos
        )}`
      );
    }
    const node = this.tree.get(pos.bunchID);
    if (node === undefined) {
      throw new Error(
        `Position references missing bunchID: ${JSON.stringify(
          pos
        )}. You must call Order.receive before referencing a bunch.`
      );
    }
    if (
      node === this.rootNode &&
      !(pos.innerIndex === 0 || pos.innerIndex === 1)
    ) {
      throw new Error(
        `Position uses rootNode but is not MIN_POSITION or MAX_POSITION (innerIndex 0 or 1): innerIndex=${pos.innerIndex}`
      );
    }
    return node;
  }

  // Bind as variable instead of class method, in case callers forget.
  compare = (a: Position, b: Position): number => {
    const aNode = this.getNodeFor(a);
    const bNode = this.getNodeFor(b);

    // Shortcut for equal nodes, for which we can use reference equality.
    if (aNode === bNode) return a.innerIndex - b.innerIndex;

    // Walk up the tree until aAnc & bAnc are the same depth.
    let aAnc = aNode;
    let bAnc = bNode;
    for (let i = aNode.depth; i > bNode.depth; i--) {
      if (aAnc.parent === bNode) {
        if (aAnc.nextInnerIndex === b.innerIndex + 1) {
          // aAnc is between b and the next Position, hence greater.
          return 1;
        } else return aAnc.nextInnerIndex - (b.innerIndex + 1);
      }
      // aAnc.parent is non-null because we are at depth > bNode.depth >= 0,
      // hence aAnc is not the root.
      aAnc = aAnc.parent!;
    }
    for (let i = bNode.depth; i > aNode.depth; i--) {
      if (bAnc.parent === aNode) {
        if (bAnc.nextInnerIndex === a.innerIndex + 1) return -1;
        else return -(bAnc.nextInnerIndex - (b.innerIndex + 1));
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

  receive(bunchMetas: Iterable<BunchMeta>): void {
    // 1. Pick out the new (non-redundant) nodes in bunchMetas.
    // For the redundant ones, check that their parents match.
    // Redundancy also applies to duplicates within bunchMetas.

    // New BunchMetas, keyed by id.
    const newBunchMetas = new Map<string, BunchMeta>();

    for (const bunchMeta of bunchMetas) {
      if (bunchMeta.bunchID === BunchIDs.ROOT) {
        throw new Error(
          `Received BunchMeta describing the root node: ${JSON.stringify(
            bunchMeta
          )}.`
        );
      }
      const existing = this.tree.get(bunchMeta.bunchID);
      if (existing !== undefined) {
        if (!Order.equalsBunchMeta(bunchMeta, existing.meta())) {
          throw new Error(
            `Received BunchMeta describing an existing node but with different metadata: received=${JSON.stringify(
              bunchMeta
            )}, existing=${JSON.stringify(existing.meta())}.`
          );
        }
      } else {
        const otherNew = newBunchMetas.get(bunchMeta.bunchID);
        if (otherNew !== undefined) {
          if (!Order.equalsBunchMeta(bunchMeta, otherNew)) {
            throw new Error(
              `Received two BunchMetas for the same node but with different metadata: first=${JSON.stringify(
                otherNew
              )}, second=${JSON.stringify(bunchMeta)}.`
            );
          }
        } else {
          BunchIDs.validate(bunchMeta.bunchID);
          newBunchMetas.set(bunchMeta.bunchID, bunchMeta);
        }
      }
    }

    // 2. Sort newBunchMetas into a valid processing order, in which each node
    // follows its parent (or its parent already exists).
    const toProcess: BunchMeta[] = [];
    // New BunchMetas that are waiting on a parent in newBunchMetas, keyed by
    // that parent's id.
    const pendingChildren = new Map<string, BunchMeta[]>();

    for (const bunchMeta of newBunchMetas.values()) {
      if (this.tree.get(bunchMeta.parentID) !== undefined) {
        // Parent already exists - ready to process.
        toProcess.push(bunchMeta);
      } else {
        // Parent should be in newBunchMetas. Store in pendingChildren for now.
        let pendingArr = pendingChildren.get(bunchMeta.parentID);
        if (pendingArr === undefined) {
          pendingArr = [];
          pendingChildren.set(bunchMeta.parentID, pendingArr);
        }
        pendingArr.push(bunchMeta);
      }
    }
    // For each node in toProcess, if it has pending children, append those.
    // That way they'll be processed after the node, including by this loop.
    for (const bunchMeta of toProcess) {
      const pendingArr = pendingChildren.get(bunchMeta.bunchID);
      if (pendingArr !== undefined) {
        toProcess.push(...pendingArr);
        // Delete so we can later check whether all pendingChildren were
        // moved to toProcess.
        pendingChildren.delete(bunchMeta.bunchID);
      }
    }

    // Check that all pendingChildren were moved to toProcess.
    if (pendingChildren.size !== 0) {
      // Nope; find a failed bunchMeta for the error message.
      let someFailedMeta = (
        pendingChildren.values().next().value as BunchMeta[]
      )[0];
      // Walk up the tree until we find a bunchMeta with missing parent or a cycle.
      const seenNodeIDs = new Set<string>();
      while (newBunchMetas.has(someFailedMeta.parentID)) {
        someFailedMeta = newBunchMetas.get(someFailedMeta.parentID)!;
        if (seenNodeIDs.has(someFailedMeta.bunchID)) {
          // Found a cycle.
          throw new Error(
            `Failed to process bunchMetas due to a cycle involving ${JSON.stringify(
              someFailedMeta
            )}.`
          );
        }
        seenNodeIDs.add(someFailedMeta.bunchID);
      }
      // someFailedMeta's parent does not exist and is not in newBunchMetas.
      throw new Error(
        `Received BunchMeta ${JSON.stringify(
          someFailedMeta
        )}, but we have not yet received a BunchMeta for its parent node.`
      );
    }

    // Finally, we are guaranteed that:
    // - All BunchMetas in toProcess are new, valid, and distinct.
    // - They are in a valid order (a node's parent will be known by the time
    // it is reached).
    for (const bunchMeta of toProcess) this.newNode(bunchMeta);
  }

  private newNode(bunchMeta: BunchMeta): NodeInternal {
    const parentNode = this.tree.get(bunchMeta.parentID);
    if (parentNode === undefined) {
      throw new Error(
        `Internal error: BunchMeta ${JSON.stringify(
          bunchMeta
        )} passed validation checks, but its parent node was not found.`
      );
    }
    const node = new NodeInternal(
      bunchMeta.bunchID,
      parentNode,
      bunchMeta.offset
    );
    this.tree.set(node.bunchID, node);

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
  ): [pos: Position, createdNode: BunchNode | null];
  createPositions(
    prevPos: Position,
    nextPos: Position,
    count: number
  ): [startPos: Position, createdNode: BunchNode | null];
  createPositions(
    prevPos: Position,
    nextPos: Position,
    count = 1
  ): [startPos: Position, createdNode: BunchNode | null] {
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
      the max innerIndex created for each bunch).
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
      be in time order (LtR) and share a bunch.
    */

    // TODO: in tree structure (?): doc senderID sort different from Fugue:
    // same-as-parent last. Would like first (as in Collabs), but trickier, esp
    // in lex rep (need reverse lex numbers).

    let newNodeParent: NodeInternal;
    let newNodeOffset: number;

    if (!this.isDescendant(nextPos, prevPos)) {
      // Make a right child of prevPos.
      const prevNode = this.tree.get(prevPos.bunchID)!;
      if (prevNode.createdCounter !== undefined) {
        // We created prevNode. Use its next Position.
        // It's okay if nextinnerIndex is not prevPos.innerIndex + 1:
        // pos will still be < nextPos, and going farther along prevNode
        // amounts to following the Exception above.
        const startPos: Position = {
          bunchID: prevNode.bunchID,
          innerIndex: prevNode.createdCounter,
        };
        prevNode.createdCounter += count;
        return [startPos, null];
      }

      newNodeParent = prevNode;
      newNodeOffset = 2 * prevPos.innerIndex + 1;
    } else {
      // Make a left child of nextPos.
      newNodeParent = this.tree.get(nextPos.bunchID)!;
      newNodeOffset = 2 * nextPos.innerIndex;
    }

    // Apply the Exception above: if we already created a node with the same
    // parent and offset, append a new Position to it instead, which is its
    // right descendant.
    const conflict = newNodeParent.createdChildren?.get(newNodeOffset);
    if (conflict !== undefined) {
      const startPos: Position = {
        bunchID: conflict.bunchID,
        innerIndex: conflict.createdCounter!,
      };
      conflict.createdCounter! += count;
      return [startPos, null];
    }

    const createdBunchMeta: BunchMeta = {
      bunchID: this.newBunchID(),
      parentID: newNodeParent.bunchID,
      offset: newNodeOffset,
    };
    if (this.tree.has(createdBunchMeta.bunchID)) {
      throw new Error(
        `newBunchID() returned node ID that already exists: ${createdBunchMeta.bunchID}`
      );
    }

    const createdNode = this.newNode(createdBunchMeta);
    createdNode.createdCounter = count;
    if (newNodeParent.createdChildren === undefined) {
      newNodeParent.createdChildren = new Map();
    }
    newNodeParent.createdChildren.set(createdBunchMeta.offset, createdNode);

    this.onCreateNode?.(createdNode);

    return [
      {
        bunchID: createdNode.bunchID,
        innerIndex: 0,
      },
      createdNode,
    ];
  }

  /**
   * @returns True if `a` is a descendant of `b` in the *Position* tree,
   * in which a node's Positions form a rightward chain.
   */
  private isDescendant(a: Position, b: Position): boolean {
    const aNode = this.tree.get(a.bunchID)!;
    const bNode = this.tree.get(b.bunchID)!;

    let aAnc = aNode;
    // The greatest innerIndex that `a` descends from (left or right) in aAnc.
    let curInnerIndex = a.innerIndex;
    while (aAnc.depth > bNode.depth) {
      // Integer division by 2: offset 0 is left desc of innerIndex 0,
      // offset 1 is right desc of innerIndex 0,
      // offset 2 is left desc of innerIndex 1, etc.
      curInnerIndex = aAnc.offset >> 1;
      aAnc = aAnc.parent!;
    }

    return aAnc === bNode && curInnerIndex >= b.innerIndex;
  }

  // ----------
  // Iterators
  // ----------

  /**
   * Order guarantees: rootNode, then others grouped by creatorID.
   * No particular order on creatorID or timestamps (in part., timestamps
   * may be out of order).
   */
  nodes(): IterableIterator<BunchNode> {
    return this.tree.values();
  }

  /**
   * Unlike nodes(), excludes rootNode. Otherwise same order.
   *
   * Useful for saving; pass the result to Order.receive to load/merge.
   * Can also turn into map (id -> { parentID, offset }).
   */
  *bunchMetas(): IterableIterator<BunchMeta> {
    for (const node of this.tree.values()) {
      if (node === this.rootNode) continue;
      yield node.meta();
    }
  }

  // ----------
  // Save & Load
  // ----------

  save(): OrderSavedState {
    return [...this.bunchMetas()];
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
    return LexUtils.combinePos(node.lexPrefix(), pos.innerIndex);
  }

  unlex(lexPos: LexPosition): Position {
    const [nodePrefix, innerIndex] = LexUtils.splitPos(lexPos);
    const bunchID = LexUtils.bunchIDFor(nodePrefix);
    if (!this.tree.has(bunchID)) {
      // Receive the node.
      this.receive(LexUtils.splitNodePrefix(nodePrefix));
    }
    // Else we skip checking agreement with the existing node, for efficiency.

    return { bunchID, innerIndex: innerIndex };
  }

  // ----------
  // Static utilities
  // ----------

  static readonly MIN_POSITION: Position = {
    bunchID: BunchIDs.ROOT,
    innerIndex: 0,
  };
  static readonly MAX_POSITION: Position = {
    bunchID: BunchIDs.ROOT,
    innerIndex: 1,
  };

  static readonly MIN_LEX_POSITION: LexPosition = LexUtils.MIN_LEX_POSITION;
  static readonly MAX_LEX_POSITION: LexPosition = LexUtils.MAX_LEX_POSITION;

  /**
   * Returns whether two Positions are equal, i.e., they have equal contents.
   */
  static equalsPosition(a: Position, b: Position): boolean {
    return a.bunchID === b.bunchID && a.innerIndex === b.innerIndex;
  }

  /**
   * Returns whether two BunchMetas are equal, i.e., they have equal contents.
   */
  static equalsBunchMeta(a: BunchMeta, b: BunchMeta): boolean {
    return (
      a.bunchID === b.bunchID &&
      a.parentID === b.parentID &&
      a.offset === b.offset
    );
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
        bunchID: startPos.bunchID,
        innerIndex: startPos.innerIndex + i,
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
   * an BunchNode's children in order, use its childrenLength and getChild methods.
   */
  static compareSiblingNodes(a: BunchNode, b: BunchNode): number {
    if (a.parent !== b.parent) {
      throw new Error(
        `nodeSiblingCompare can only compare Nodes with the same parentNode, not a=${a}, b=${b}`
      );
    }

    // Sibling sort order: first by offset, then by id.
    if (a.offset !== b.offset) {
      return a.offset - b.offset;
    }
    if (a.bunchID !== b.bunchID) {
      // Need to add the comma to match how LexPositions are sorted.
      return a.bunchID + "," > b.bunchID + "," ? 1 : -1;
    }
    return 0;
  }
}
