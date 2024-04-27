import {
  BunchMeta,
  List,
  ListSavedState,
  OrderSavedState,
  Outline,
  OutlineSavedState,
  Position,
  PositionSet,
} from "../../src";

type Message<T> =
  | {
      type: "set";
      pos: Position;
      value: T;
      meta?: BunchMeta;
    }
  | { type: "delete"; pos: Position };

type SavedState<T> = {
  order: OrderSavedState;
  list: ListSavedState<T>;
  seen: OutlineSavedState;
};

/**
 * A traditional op-based/state-based list CRDT implemented on top of the library.
 *
 * send/receive work on general networks (they build in exactly-once partial-order delivery),
 * and save/load work as state-based merging.
 *
 * Internally, its state is a `List<T>` (for values) and a PositionSet (for tracking
 * which Positions have been "seen"). This implementation uses Positions in messages
 * and manually manages metadata; in particular, it must buffer certain out-of-order
 * messages.
 */
export class ListCRDT<T> {
  /** When accessing externally, only query. */
  readonly list: List<T>;
  /**
   * A set of all Positions we've ever seen, whether currently present or deleted.
   * Used for state-based merging and handling reordered messages.
   *
   * We use PositionSet here because we don't care about the list order. If you did,
   * you could use Outline instead, with the same Order as this.list
   * (`this.seen = new Outline(this.order);`).
   */
  private readonly seen: PositionSet;
  /**
   * Maps from bunchID to a Set of messages that are waiting on that
   * bunch's BunchMeta before they can be processed.
   */
  private readonly pending: Map<string, Set<string>>;

  constructor(private readonly send: (msg: string) => void) {
    this.list = new List();
    this.seen = new PositionSet();
    this.pending = new Map();
  }

  insertAt(index: number, value: T): void {
    const [pos, newMeta] = this.list.insertAt(index, value);
    const messageObj: Message<T> = { type: "set", pos, value };
    if (newMeta !== null) messageObj.meta = newMeta;
    this.send(JSON.stringify(messageObj));
  }

  deleteAt(index: number): void {
    const pos = this.list.positionAt(index);
    this.list.delete(pos);
    const messageObj: Message<T> = { type: "delete", pos };
    this.send(JSON.stringify(messageObj));
  }

  receive(msg: string): void {
    // TODO: test dedupe & partial ordering.
    const decoded = JSON.parse(msg) as Message<T>;
    const bunchID = decoded.pos.bunchID;

    switch (decoded.type) {
      case "delete":
        // Mark the position as seen immediately, even if we don't have metadata
        // for its bunch yet. Okay because this.seen is a PositionSet instead of an Outline.
        this.seen.add(decoded.pos);
        // Delete the position if present.
        // If the bunch is unknown, it's definitely not present, and we
        // should skip calling list.has to avoid a "Missing metadata" error.
        if (
          this.list.order.getNode(bunchID) !== undefined &&
          this.list.has(decoded.pos)
        ) {
          // For a hypothetical event, compute the index.
          void this.list.indexOfPosition(decoded.pos);

          this.list.delete(decoded.pos);
        }
        break;
      case "set":
        // This check is okay even if we don't have metadata for pos's bunch yet,
        // because this.seen is a PositionSet instead of an Outline.
        if (this.seen.has(decoded.pos)) {
          // The position has already been seen (inserted, inserted & deleted, or
          // deleted by an out-of-order message). So don't need to insert it again.
          return;
        }

        if (decoded.meta) {
          const parentID = decoded.meta.parentID;
          if (this.list.order.getNode(parentID) === undefined) {
            // The meta can't be processed yet because its parent bunch is unknown.
            // Add it to pending.
            this.addToPending(parentID, msg);
            return;
          } else this.list.order.addMetas([decoded.meta]);

          if (this.list.order.getNode(bunchID) === undefined) {
            // The message can't be processed yet because its bunch is unknown.
            // Add it to pending.
            this.addToPending(bunchID, msg);
            return;
          }
        }

        // At this point, BunchMeta dependencies are satisfied. Process the message.
        this.list.set(decoded.pos, decoded.value);
        // Add to seen even before it's deleted, to reduce sparse-array fragmentation.
        this.seen.add(decoded.pos);
        // For a hypothetical event, compute the index.
        void this.list.indexOfPosition(decoded.pos);

        if (decoded.meta) {
          // The meta may have unblocked pending messages.
          const unblocked = this.pending.get(decoded.meta.parentID);
          if (unblocked !== undefined) {
            // TODO: if you unblock a long dependency chain (unlikely),
            // this recursion could overflow the stack.
            for (const msg2 of unblocked) this.receive(msg2);
          }
        }
        break;
    }
  }

  private addToPending(bunchID: string, msg: string): void {
    let bunchPending = this.pending.get(bunchID);
    if (bunchPending === undefined) {
      bunchPending = new Set();
      this.pending.set(bunchID, bunchPending);
    }
    bunchPending.add(msg);
  }

  save(): string {
    const savedStateObj: SavedState<T> = {
      order: this.list.order.save(),
      list: this.list.save(),
      seen: this.seen.save(),
    };
    return JSON.stringify(savedStateObj);
  }

  load(savedState: string): void {
    const savedStateObj = JSON.parse(savedState) as SavedState<T>;
    if (this.seen.state.size === 0) {
      // Never been used, so okay to load directly instead of doing a state-based
      // merge.
      this.list.order.load(savedStateObj.order);
      this.list.load(savedStateObj.list);
      this.seen.load(savedStateObj.seen);
    } else {
      // TODO: benchmark merging.
      // TODO: events.
      const otherList = new List<T>();
      const otherSeen = new Outline(otherList.order);
      otherList.order.load(savedStateObj.order);
      otherList.load(savedStateObj.list);
      otherSeen.load(savedStateObj.seen);

      // Loop over all positions that had been inserted or deleted into
      // the other list.
      // We don't have to manage metadata because a saved state always includes
      // all of its dependent metadata.
      for (const pos of otherSeen) {
        if (!this.seen.has(pos)) {
          // pos is new to us. Copy its state from the other list.
          if (otherList.has(pos)) this.list.set(pos, otherList.get(pos)!);
          this.seen.add(pos);
        } else {
          // We already know of pos. If it's deleted in the other list,
          // ensure it's deleted here too.
          if (!otherList.has(pos)) this.list.delete(pos);
        }
      }
    }
  }
}
