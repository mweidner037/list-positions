export type Position = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly valueIndex: number;
};

/**
 * A waypoint in the tree of positions. See
 * [[CTotalOrder]] for a description of the tree.
 *
 * Each waypoint is identified by its pair ([[senderID]], [[counter]]).
 */
class WaypointInternal {
  constructor(
    readonly creatorID: string,
    readonly timestamp: number,
    /** null only for the root. */
    readonly parent: Position | null
  ) {}

  /**
   * This waypoint's child waypoints in sort order: left children
   * by valueIndex, then right children by reverse valueIndex,
   * with ties broken by senderID.
   *
   * Only [[CTotalOrder]] may mutate this array.
   */
  readonly children: WaypointInternal[] = [];
}

/**
 * A collaborative abstract total order on [[Position]]s.
 *
 * This is a low-level API intended for internal use by list CRDT implementations.
 * In most apps, you are better off using [[CValueList]] or [[CList]].
 *
 * A CTotalOrder represents the core of a list CRDT: a collaborative
 * list of Positions
 * that can be expanded over time, but without any associated values.
 * Instead, you use a [[LocalList]] to map a subset of Positions to
 * values, in list order with indexed access.
 * Note that LocalList is a local (non-collaborative) data structure, i.e.,
 * its value assignments are not automatically replicated.
 *
 * ### Waypoints
 *
 * Internally, CTotalOrder stores an append-only log of [[Waypoint]]s.
 * The allowed [[Position]]s correspond to pairs (waypoint, valueIndex)
 * where waypoint is an existing Waypoint and
 * valueIndex is a nonnegative number. Methods [[decode]],
 * [[encode]], and [[encodeAll]] convert between the two representations.
 *
 * Note that waypoints and positions are only created, never destroyed.
 * To create new positions (creating a new waypoint if needed),
 * call [[createPositions]].
 *
 * ### List Order
 *
 * The positions are ordered using a tree.
 * Each waypoint's positions form a descending, left-to-right branch
 * in the tree rooted at the position with valueIndex 0.
 * The position with valueIndex 0 is a child of the waypoint's
 * parent position, on the side given by [[Waypoint.isRight]].
 *
 * The position order is then an in-order traversal of this tree:
 * we traverse a position's left children, then visit
 * the position, then traverse its right children.
 * Same-side siblings are ordered by the tiebreakers:
 * - A position belonging to the same waypoint as the parent
 * (just with valueIndex + 1) is to the left of any other siblings.
 * - Other siblings (each belonging to different waypoints and with
 * valueIndex 0) are sorted lexicographically by their waypoints'
 * [[Waypoint.senderID]]s. We call these *waypoint children*.
 *
 * Note that positions belonging to the same waypoint are contiguous
 * when first created. Later, (left-side) waypoint children may
 * appear between them.
 */
export class CTotalOrder {
  /**
   * Maps creatorID, then timestamp, to the WaypointInternal.
   */
  private readonly waypointsByID = new Map<
    string,
    Map<number, WaypointInternal>
  >();
  /**
   * The root waypoint.
   *
   * The special position (rootWaypoint, 0) is the root of the tree of
   * positions. It technically appears first in the total order
   * but is usually not used.
   */
  readonly rootWaypoint: WaypointInternal;

  // TODO: way to read/bump lamport?
  private lamport = 0;

  /**
   * Tracks waypoints created by this specific object (i.e., the current
   * replica & session). These are the only waypoints that we can
   * extend, to prevent multiple users from extending a waypoint
   * concurrently (giving non-unique positions).
   *
   * Each waypoint maps to the next valueIndex to create for that waypoint.
   *
   * This state is ephemeral (not saved), since a future loader will
   * be in a different session.
   */
  private ourWaypoints = new Map<WaypointInternal, number>();

  /**
   * Constructs a CTotalOrder.
   */
  constructor() {
    // TODO: constant for "ROOT"
    // TODO: do we need root waypoint? I guess best to avoid null-parent case in real positions
    // (think DB table).
    this.rootWaypoint = new WaypointInternal("ROOT", 0, null);
    this.waypointsByID.set("ROOT", new Map([[0, this.rootWaypoint]]));
  }

  /**
   * Creates `count` new positions between prevPosition and nextPosition.
   * The positions are created collaboratively
   * (replicated on all devices).
   *
   * If !(prevPosition < nextPosition), behavior is undefined.
   *
   * Note that this might not actually send a message.
   *
   * @param prevPosition The previous position, or null to
   * create positions at the beginning of the list.
   * @param count The number of positions to create.
   * @returns The created [[Position]]s, in list order.
   * Internally, they use the same waypoint with contiguously
   * increasing valueIndex.
   * @throws If count <= 0.
   */
  createPositions(prevPosition: Position | null, count: number): Position[] {
    // TODO: allow 0?
    if (count <= 0) throw new Error(`count is <= 0: ${count}`);

    if (prevPosition === null)
      prevPosition = { creatorID: "ROOT", timestamp: 0, valueIndex: 0 };

    const prevWaypoint = this.getWaypoint(
      prevPosition.creatorID,
      prevPosition.timestamp
    );

    // First see if we can extend prevWaypoint.
    const extendValueIndex = this.ourWaypoints.get(prevWaypoint);
    if (extendValueIndex !== undefined) {
      // It's our waypoint, so we can extend it.
      this.ourWaypoints.set(prevWaypoint, extendValueIndex + count);
      return this.encodeAll(prevWaypoint, extendValueIndex, count);
    }

    // Else, create a new waypoint child of prevPosition.
    this.lamport++;
    const newWaypoint = new WaypointInternal(
      this.replicaID,
      this.lamport,
      prevPosition
    );

    // TODO: "send" newWaypoint, add to own state, and also return it from this function (w/ parent).

    return this.encodeAll(newWaypoint, 0, count);
  }

  // TODO: rename
  private encodeAll(
    waypoint: WaypointInternal,
    startValueIndex: number,
    count: number
  ): Position[] {
    const ans = new Array<Position>(count);
    for (let i = 0; i < count; i++) {
      ans[i] = {
        creatorID: waypoint.creatorID,
        timestamp: waypoint.timestamp,
        valueIndex: startValueIndex + i,
      };
    }
    return ans;
  }

  protected receivePrimitive(
    message: string | Uint8Array,
    meta: MessageMeta
  ): void {
    const decoded = TotalOrderCreateMessage.decode(<Uint8Array>message);

    // Get parentWaypoint.
    const parentWaypointSender = protobufHas(decoded, "parentWaypointSenderID")
      ? nonNull(decoded.parentWaypointSenderID)
      : meta.senderID;
    const [parentWaypointCounter, isRight] = this.valueAndSideDecode(
      decoded.parentWaypointCounterAndSide
    );
    const parentWaypoint = this.getWaypoint(
      parentWaypointSender,
      parentWaypointCounter
    );

    let senderWaypoints = this.waypointsByID.get(meta.senderID);
    if (senderWaypoints === undefined) {
      senderWaypoints = [];
      this.waypointsByID.set(meta.senderID, senderWaypoints);
    }
    const waypoint = new WaypointInternal(
      meta.senderID,
      senderWaypoints.length,
      parentWaypoint,
      decoded.parentValueIndex,
      isRight
    );
    // Store the waypoint.
    senderWaypoints.push(waypoint);
    this.addToChildren(waypoint);
  }

  /**
   * Adds newWaypoint to parentWaypoint.childWaypoints
   * in the proper order.
   */
  private addToChildren(newWaypoint: WaypointInternal): void {
    // Recall child waypoints' sort order: left children
    // by valueIndex, then right children by reverse valueIndex.
    const children = nonNull(newWaypoint.parentWaypoint).children;
    // Find i, the index of the first entry after newWaypoint.
    // OPT: If children is large, use binary search.
    let i = 0;
    for (; i < children.length; i++) {
      if (this.isSiblingLess(newWaypoint, children[i])) break;
    }
    children.splice(i, 0, newWaypoint);
  }

  /**
   * Returns true if sibling1 < sibling2 in the sibling order.
   */
  private isSiblingLess(
    sibling1: WaypointInternal,
    sibling2: WaypointInternal
  ) {
    // Recall child order: left children ordered by
    // valueIndex, then right children ordered by
    // reverse valueIndex. senderID tiebreaker.
    if (sibling1.isRight === sibling2.isRight) {
      if (sibling1.parentValueIndex === sibling2.parentValueIndex) {
        // senderID order. Identical senderIDs are impossible.
        return sibling1.senderID < sibling2.senderID;
      } else {
        // isRight: reverse valueIndex order;
        // isLeft: valueIndex order.
        // Use === as XNOR.
        return (
          sibling1.isRight ===
          sibling1.parentValueIndex > sibling2.parentValueIndex
        );
      }
    } else return sibling2.isRight;
  }

  /**
   * Returns the waypoint with the given senderID and counter,
   * throwing an error if it does not exist.
   */
  private getWaypoint(creatorID: string, timestamp: number): WaypointInternal {
    const bySender = this.waypointsByID.get(creatorID);
    if (bySender === undefined) {
      throw new Error("Invalid position: unknown creatorID");
    }

    const waypoint = bySender.get(timestamp);
    if (waypoint === undefined) {
      throw new Error("Invalid position: unknown timestamp");
    }
    return waypoint;
  }

  // TODO: load/save?
  // Load can skip dep checks until the end, for ease of use.
}
