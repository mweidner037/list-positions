import {
  LexPosition,
  List,
  ListSavedState,
  OrderSavedState,
  OutlineSavedState,
  PositionSet,
} from "../../src";

type Message<T> =
  | {
      type: "set";
      pos: LexPosition;
      value: T;
    }
  | { type: "delete"; pos: LexPosition };

type SavedState<T> = {
  // With saved states, metadata management is easy even with List, so don't
  // bother with LexListSavedState.
  order: OrderSavedState;
  list: ListSavedState<T>;
  seen: OutlineSavedState;
};

/**
 * A hybrid op-based/state-based list CRDT that uses LexPositions in messages
 * instead of manually managing BunchMetas.
 *
 * Internally, it wraps a List (for values) and an Outline (for tracking
 * which Positions have been "seen"). Send/receive work on general
 * networks (they build in exactly-once partial-order delivery),
 * and save/load work as state-based merging.
 */
export class LexPositionCRDT<T> {
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

  constructor(private readonly send: (msg: string) => void) {
    this.list = new List();
    this.seen = new PositionSet();
  }

  insertAt(index: number, value: T): void {
    const [pos] = this.list.insertAt(index, value);
    const messageObj: Message<T> = {
      type: "set",
      pos: this.list.order.lex(pos),
      value,
    };
    this.send(JSON.stringify(messageObj));
  }

  deleteAt(index: number): void {
    const pos = this.list.positionAt(index);
    this.list.delete(pos);
    const messageObj: Message<T> = {
      type: "delete",
      pos: this.list.order.lex(pos),
    };
    this.send(JSON.stringify(messageObj));
  }

  // No set op - classic list CRDT with insert-once values, no LWW.

  receive(msg: string): void {
    const decoded = JSON.parse(msg) as Message<T>;
    const pos = this.list.order.unlex(decoded.pos);
    if (decoded.type === "set") {
      if (!this.seen.has(pos)) {
        this.list.set(pos, decoded.value);
        // Add to seen even before it's deleted, to reduce sparse-array fragmentation.
        this.seen.add(pos);
        // For a hypothetical event, compute the index.
        void this.list.indexOfPosition(pos);
      }
      // Else redundant or already deleted.
    } else {
      if (this.list.has(pos)) {
        this.list.delete(pos);
        // For a hypothetical event, compute the index.
        void this.list.indexOfPosition(pos);
      }
      this.seen.add(pos);
    }
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
      const otherSeen = new PositionSet();
      otherList.order.load(savedStateObj.order);
      otherList.load(savedStateObj.list);
      otherSeen.load(savedStateObj.seen);

      // Loop over all positions that had been inserted or deleted into
      // the other list.
      // We don't have to manage metadata because a saved state always includes
      // all of its dependent metadata.
      for (const pos of otherSeen) {
        if (!this.seen.has(pos)) {
          // pos is new to use. Copy its state from the other list.
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
