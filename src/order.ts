import { AbsPosition } from "./abs_position";
import { BunchMeta, BunchNode, compareSiblingNodes } from "./bunch";
import { BunchIDs } from "./bunch_ids";
import { LexUtils } from "./lex_utils";
import { MAX_POSITION, Position, positionEquals } from "./position";

/**
 * A JSON-serializable saved state for an Order.
 *
 * See Order.save and Order.load.
 *
 * ### Format
 *
 * For advanced usage, you may read and write OrderSavedStates directly.
 *
 * Its format is merely the array `[...order.dependencies()]`.
 */
export type OrderSavedState = BunchMeta[];

/**
 * Internal class for BunchNode.
 *
 * We expose BunchNode publicly as an interface (instead of a class with private
 * fields) so that we can leave internal fields public
 * for Order to access.
 */
class NodeInternal implements BunchNode {
  readonly depth: number;

  /**
   * The current children, in list order.
   *
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

  *dependencies(): IterableIterator<BunchMeta> {
    for (
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let currentNode: BunchNode = this;
      // Exclude the root.
      currentNode.parent !== null;
      currentNode = currentNode.parent
    ) {
      yield currentNode.meta();
    }
  }

  lexPrefix(): string {
    const topDown = [...this.dependencies()].reverse();
    return LexUtils.combineBunchPrefix(topDown);
  }

  toString() {
    // Similar to BunchMeta, but valid for rootNode as well.
    return JSON.stringify({
      bunchID: this.bunchID,
      parentID: this.parent === null ? null : this.parent.bunchID,
      offset: this.offset,
    });
  }
}

// Not exported because I have yet to use it externally.
// Normally you should compare BunchMetas by their bunchIDs alone.
/**
 * Returns whether two BunchMetas are equal, i.e., they have equal contents.
 */
function bunchMetaEquals(a: BunchMeta, b: BunchMeta): boolean {
  return (
    a.bunchID === b.bunchID &&
    a.parentID === b.parentID &&
    a.offset === b.offset
  );
}

/**
 * A total order on Positions, independent of any specific assignment of values.
 *
 * See [List, Position, and Order](https://github.com/mweidner037/list-positions#list-position-and-order) in the readme.
 *
 * An Order manages metadata ([bunches](https://github.com/mweidner037/list-positions#bunches))
 * for any number of Lists, AbsLists, and Outlines.
 * You can also use an Order to create Positions independent of a List (`createPositions`),
 * convert between Positions and AbsPositions
 * (`lex` and `unlex`), and directly view the tree of bunches (`getBunch`, `getBunchFor`).
 */
export class Order {
  private readonly newBunchID: (parent: BunchNode, offset: number) => string;

  /**
   * The root bunch's BunchNode.
   *
   * The root is the unique bunch with `bunchID == "ROOT"` (BunchIDs.ROOT).
   *
   * It has no parent, no BunchMeta, and only two valid Positions:
   * - MIN_POSITION (innerIndex = 0)
   * - MAX_POSITION (innerIndex = 1).
   *
   * All of its child bunches have `offset == 1`, so that they sort between
   * MIN_POSITION and MAX_POSITION.
   */
  readonly rootNode: BunchNode;

  /**
   * Maps from node ID to the *unique* corresponding NodeInternal.
   */
  private readonly tree = new Map<string, NodeInternal>();

  /**
   * Event handler that you can set to be notified when `this.createPositions`
   * creates a new bunch.
   *
   * It is called with the same `newMeta` that is returned by the createPositions call.
   * Other collaborators will need to add that BunchMeta using `addMetas` before they can use
   * the new Positions; see [Managing Metadata](https://github.com/mweidner037/list-positions#newMeta).
   */
  onNewMeta: ((newMeta: BunchMeta) => void) | undefined = undefined;

  /**
   * Constructs an Order.
   *
   * Any data structures (List, Text, Outline, AbsList) that share this Order
   * automatically share the same total order on Positions.
   * To share total orders between Order instances (possibly on different devices),
   * you will need to
   * [Manage Metadata](https://github.com/mweidner037/list-positions#managing-metadata),
   * or communicate using AbsPositions instead of Positions.
   *
   * @param options.replicaID An ID for this Order, used to generate our bunchIDs (via {@link BunchIDs.usingReplicaID}).
   * It must be *globally unique* among all Orders that share the same Positions,
   * and it must satisfy the rules documented on {@link BunchIDs.validate}.
   * Default: A random alphanumeric string from the
   * [maybe-random-string](https://github.com/mweidner037/maybe-random-string#readme) package.
   *
   * @param options.newBunchID For more control over bunchIDs, you may supply
   * this function in place of `options.replicaID`. Each call must output a new bunchID
   * that is *globally unique* among all orders that share the same Positions,
   * and that satisfies the rules documented on {@link BunchIDs.validate}.
   */
  constructor(options?: {
    replicaID?: string;
    newBunchID?: (parent: BunchNode, offset: number) => string;
  }) {
    this.newBunchID =
      options?.newBunchID ?? BunchIDs.usingReplicaID(options?.replicaID);

    this.rootNode = new NodeInternal(BunchIDs.ROOT, null, 0);
    this.tree.set(this.rootNode.bunchID, this.rootNode);
  }

  // ----------
  // Accessors
  // ----------

  /**
   * Returns the BunchNode with the given bunchID, or undefined if it is not
   * yet known (i.e., its BunchMeta has not been delivered to `this.addMetas`).
   */
  getNode(bunchID: string): BunchNode | undefined {
    return this.tree.get(bunchID);
  }

  /**
   * Returns the BunchNode corresponding to the given Position's bunch.
   *
   * @throws If we have not received a BunchMeta for the Position's bunch; see
   * [Managing Metadata](https://github.com/mweidner037/list-positions#managing-metadata).
   * @throws If the Position is misformatted, e.g., it uses a negative `innerIndex`.
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
        )}. You must call Order.addMetas before referencing a bunch.`
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

  /**
   * [Compare function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#comparefn)
   * for Positions within this Order.
   *
   * You may use this method to work with Positions in a list-as-ordered-map
   * data structure other than our built-in classes, e.g.,
   * [functional-red-black-tree](https://www.npmjs.com/package/functional-red-black-tree)
   * or `Array.sort`.
   *
   * However, doing so is less memory-efficient than using our built-in classes.
   */
  compare(a: Position, b: Position): number {
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
        else return -(bAnc.nextInnerIndex - (a.innerIndex + 1));
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
    return compareSiblingNodes(aAnc, bAnc);
  }

  // ----------
  // Mutators
  // ----------

  /**
   * Adds the given BunchMetas to this Order.
   *
   * Before using a Position with this Order or an associated List/Text/Outline,
   * you must add its bunch's BunchMeta using this method.
   * See [Managing Metadata](https://github.com/mweidner037/list-positions#managing-metadata).
   *
   * (You do not need to manage metadata when using AbsPositions/AbsList,
   * since AbsPositions embed all of their metadata.)
   *
   * **Note:** A bunch depends on its parent bunch's metadata. So before (or at the same time
   * as) you call `addMetas` on a BunchMeta,
   * you must do so for the parent's BunchMeta, unless `parentID == "ROOT"`.
   *
   * @throws If an added BunchMeta's parentID references a bunch that we have
   * not already added and that is not included in this call.
   * @throws If any of the added BunchMetas are invalid or provide
   * conflicting metadata for the same bunchID.
   */
  addMetas(bunchMetas: Iterable<BunchMeta>): void {
    // We are careful to avoid changing the Order's state at all if an error
    // is thrown, even if some of the BunchMetas are valid.

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
      if (bunchMeta.parentID === BunchIDs.ROOT && bunchMeta.offset !== 1) {
        throw new Error(
          `Received invalid BunchMeta (child of the root with offset != 1): ${JSON.stringify(
            bunchMeta
          )}`
        );
      }
      const existing = this.tree.get(bunchMeta.bunchID);
      if (existing !== undefined) {
        if (!bunchMetaEquals(bunchMeta, existing.meta())) {
          throw new Error(
            `Received BunchMeta describing an existing node but with different metadata: received=${JSON.stringify(
              bunchMeta
            )}, existing=${JSON.stringify(existing.meta())}.`
          );
        }
      } else {
        const otherNew = newBunchMetas.get(bunchMeta.bunchID);
        if (otherNew !== undefined) {
          if (!bunchMetaEquals(bunchMeta, otherNew)) {
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

  /**
   * Adds a new BunchNode to the internal tree, either due to receiving a remote
   * bunch or creating a new one.
   */
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
        if (compareSiblingNodes(parentNode.children[i], node) > 0) break;
      }
      // Insert node just before that sibling, or at the end if none.
      parentNode.children.splice(i, 0, node);
    }

    return node;
  }

  /**
   * Creates `count` new Positions between the given Positions.
   *
   * Usually, you will call `List.insertAt` or a similar method instead of this one, to
   * create Positions at a specific spot in a list.
   *
   * In a collaborative setting, the new Positions are *globally unique*, even
   * if other users call `Order.createPositions` (or similar methods) concurrently.
   *
   * The new Positions all use the same bunch, with sequential
   * `innerIndex` (starting at the returned startPos).
   * They are originally contiguous, but may become non-contiguous in the future,
   * if new Positions are created between them.
   *
   * @returns [starting Position, [new bunch's BunchMeta](https://github.com/mweidner037/list-positions#newMeta) (or null)].
   * @see {@link expandPositions} To convert (startPos, count) to an array of Positions.
   * @throws If prevPos >= nextPos (i.e., `this.compare(prevPos, nextPos) >= 0`).
   * @param options.bunchID Forces the creation of a new bunch with a specific bunchID,
   * instead of reusing an existing bunch or using the constructor's newBunchID function.
   */
  createPositions(
    prevPos: Position,
    nextPos: Position,
    count: number,
    options?: { bunchID?: string }
  ): [startPos: Position, newMeta: BunchMeta | null] {
    // Also validates the positions.
    if (this.compare(prevPos, nextPos) >= 0) {
      throw new Error(
        `prevPos >= nextPos: prevPos=${JSON.stringify(
          prevPos
        )}, nextPos=${JSON.stringify(nextPos)}`
      );
    }
    if (count < 1) {
      throw new Error(`Invalid count: ${count} (must be positive)`);
    }

    /*
      We map list-position's tree to a Fugue tree as described in internals.md.    
      
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
      if needed, etc.); since it's our own bunch, the "right child" is actually just the
      next Position in the same bunch. As a consequence, if a user repeatedly types and deletes
      a char at the same place, then "resurrects" all of the chars, the chars will
      be in time order (LtR) and share a bunch.
      This exception is ignored when options.bunchID is supplied.
    */

    let newNodeParent: NodeInternal;
    let newNodeOffset: number;

    if (!this.isDescendant(nextPos, prevPos)) {
      // Make a right child of prevPos.
      const prevNode = this.tree.get(prevPos.bunchID)!;
      if (
        prevNode.createdCounter !== undefined &&
        options?.bunchID === undefined
      ) {
        // We created prevNode. Use its next Position.
        // It's okay if nextinnerIndex is not prevPos.innerIndex + 1:
        // pos will still be < nextPos (b/c nextPos is not descended from this bunch),
        // and going farther along prevNode
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
    if (conflict !== undefined && options?.bunchID === undefined) {
      const startPos: Position = {
        bunchID: conflict.bunchID,
        innerIndex: conflict.createdCounter!,
      };
      conflict.createdCounter! += count;
      return [startPos, null];
    }

    const newMeta: BunchMeta = {
      bunchID:
        options?.bunchID ?? this.newBunchID(newNodeParent, newNodeOffset),
      parentID: newNodeParent.bunchID,
      offset: newNodeOffset,
    };
    if (this.tree.has(newMeta.bunchID)) {
      if (options?.bunchID === undefined) {
        throw new Error(
          `newBunchID returned bunch ID that already exists: ${newMeta.bunchID}`
        );
      } else {
        throw new Error(
          `options.bunchID supplied bunch ID that already exists: ${newMeta.bunchID}`
        );
      }
    }

    const newMetaNode = this.newNode(newMeta);
    newMetaNode.createdCounter = count;
    if (newNodeParent.createdChildren === undefined) {
      newNodeParent.createdChildren = new Map();
    }
    newNodeParent.createdChildren.set(newMeta.offset, newMetaNode);

    this.onNewMeta?.(newMeta);

    return [
      {
        bunchID: newMetaNode.bunchID,
        innerIndex: 0,
      },
      newMeta,
    ];
  }

  /**
   * @returns True if `a` is a descendant of `b` in the implied Fugue tree,
   * in which a bunch's Positions form a rightward chain.
   */
  private isDescendant(a: Position, b: Position): boolean {
    if (positionEquals(a, MAX_POSITION)) {
      // Special case: We don't consider a to be a real node in the
      // implied Fugue tree. So it is never a descendant of b,
      // even when b is MIN_POSITION.
      return false;
    }

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
   * Iterates over this Order's BunchNodes.
   *
   * The root (`this.rootNode`) is always visited first, followed by the remaining
   * nodes in no particular order.
   */
  nodes(): IterableIterator<BunchNode> {
    return this.tree.values();
  }

  /**
   * Iterates over all dependencies of the current state,
   * in no particular order.
   *
   * These are the BunchMetas of all non-root nodes.
   */
  *dependencies(): IterableIterator<BunchMeta> {
    for (const node of this.tree.values()) {
      if (node === this.rootNode) continue;
      yield node.meta();
    }
  }

  // ----------
  // Save & Load
  // ----------

  /**
   * Returns a saved state for this Order.
   *
   * The saved state describes all of our known BunchMetas in JSON-serializable form.
   * (In fact, it is merely the array (`[...this.dependencies()]`.)
   * You can load this state on another Order by calling `load(savedState)`,
   * possibly in a different session or on a collaborator's device.
   */
  save(): OrderSavedState {
    return [...this.dependencies()];
  }

  /**
   * Loads a saved state from another Order's `save()` method.
   *
   * Loading another Order's saved state is equivalent to receiving all of its
   * BunchMetas. Unlike List.load, this method does **not** overwrite this Order's existing state;
   * instead, it merges the known BunchMetas (union of sets).
   */
  load(savedState: OrderSavedState): void {
    this.addMetas(savedState);
  }

  // ----------
  // AbsPosition
  // ----------

  /**
   * Converts a Position to the equivalent AbsPosition.
   */
  abs(pos: Position): AbsPosition {
    const node = this.getNodeFor(pos);
    // OPT: construct it directly with a tree walk and single join.
    return LexUtils.combinePos(node.lexPrefix(), pos.innerIndex);
  }

  /**
   * Converts a AbsPosition to the equivalent Position.
   *
   * Because AbsPositions embed all of their dependencies, you do not need to
   * worry about the Position's dependent BunchMetas. They will be extracted
   * from lexPos and delivered to `this.addMetas` internally if needed.
   */
  unabs(lexPos: AbsPosition): Position {
    const [bunchPrefix, innerIndex] = LexUtils.splitPos(lexPos);
    const bunchID = LexUtils.bunchIDFor(bunchPrefix);
    if (!this.tree.has(bunchID)) {
      // Add the node.
      this.addMetas(LexUtils.splitBunchPrefix(bunchPrefix));
    }
    // Else we skip checking agreement with the existing node, for efficiency.

    return { bunchID, innerIndex: innerIndex };
  }
}
