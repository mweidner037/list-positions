import {
  AbsPosition,
  List,
  OrderSavedState,
  OutlineSavedState,
  PositionSet,
  Text,
  TextSavedState,
} from "../../src";

type Message =
  | {
      type: "set";
      pos: AbsPosition;
      char: string;
    }
  | { type: "delete"; pos: AbsPosition };

type SavedState = {
  // TODO: AbsListSavedState instead? Avoids tombstones, which could make it smaller.
  order: OrderSavedState;
  text: TextSavedState;
  seen: OutlineSavedState;
};

/**
 * A traditional op-based/state-based text CRDT implemented on top of the library.
 *
 * send/receive work on general networks (they build in exactly-once partial-order delivery),
 * and save/load work as state-based merging.
 *
 * This implementation uses AbsPositions in messages. Thus unlike TextCRDT,
 * it does not need to manage metadata or buffer out-of-order messages,
 * at the expense of larger messages.
 */
export class AbsTextCRDT {
  /** When accessing externally, only query. */
  readonly text: Text;
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
    this.text = new Text();
    this.seen = new PositionSet();
  }

  insertAt(index: number, char: string): void {
    const [pos] = this.text.insertAt(index, char);
    const messageObj: Message = {
      type: "set",
      pos: this.text.order.abs(pos),
      char,
    };
    this.send(JSON.stringify(messageObj));
  }

  deleteAt(index: number): void {
    const pos = this.text.positionAt(index);
    this.text.delete(pos);
    const messageObj: Message = {
      type: "delete",
      pos: this.text.order.abs(pos),
    };
    this.send(JSON.stringify(messageObj));
  }

  // No set op - classic list CRDT with insert-once values, no LWW.

  receive(msg: string): void {
    const decoded = JSON.parse(msg) as Message;
    const pos = this.text.order.unabs(decoded.pos);
    if (decoded.type === "set") {
      if (!this.seen.has(pos)) {
        this.text.set(pos, decoded.char);
        // Add to seen even before it's deleted, to reduce sparse-array fragmentation.
        this.seen.add(pos);
        // For a hypothetical event, compute the index.
        void this.text.indexOfPosition(pos);
      }
      // Else redundant or already deleted.
    } else {
      if (this.text.has(pos)) {
        this.text.delete(pos);
        // For a hypothetical event, compute the index.
        void this.text.indexOfPosition(pos);
      }
      this.seen.add(pos);
    }
  }

  save(): string {
    const savedStateObj: SavedState = {
      order: this.text.order.save(),
      text: this.text.save(),
      seen: this.seen.save(),
    };
    return JSON.stringify(savedStateObj);
  }

  load(savedState: string): void {
    const savedStateObj = JSON.parse(savedState) as SavedState;
    if (this.seen.state.size === 0) {
      // Never been used, so okay to load directly instead of doing a state-based
      // merge.
      this.text.order.load(savedStateObj.order);
      this.text.load(savedStateObj.text);
      this.seen.load(savedStateObj.seen);
    } else {
      // TODO: benchmark merging.
      // TODO: events.
      const otherText = new Text();
      const otherSeen = new PositionSet();
      otherText.order.load(savedStateObj.order);
      otherText.load(savedStateObj.text);
      otherSeen.load(savedStateObj.seen);

      // Loop over all positions that had been inserted or deleted into
      // the other list.
      // We don't have to manage metadata because a saved state always includes
      // all of its dependent metadata.
      for (const pos of otherSeen) {
        if (!this.seen.has(pos)) {
          // pos is new to use. Copy its state from the other list.
          if (otherText.has(pos)) this.text.set(pos, otherText.get(pos)!);
          this.seen.add(pos);
        } else {
          // We already know of pos. If it's deleted in the other list,
          // ensure it's deleted here too.
          if (!otherText.has(pos)) this.text.delete(pos);
        }
      }
    }
  }
}
