import {
  BunchMeta,
  OrderSavedState,
  Outline,
  OutlineSavedState,
  Position,
  PositionSet,
  Text,
  TextSavedState,
  expandPositions,
} from "../../src";

export type TextCrdtMessage =
  | {
      readonly type: "set";
      readonly startPos: Position;
      readonly chars: string;
      readonly meta?: BunchMeta;
    }
  | {
      readonly type: "delete";
      readonly items: [startPos: Position, count: number][];
    };

export type TextCrdtSavedState = {
  readonly order: OrderSavedState;
  readonly text: TextSavedState;
  readonly seen: OutlineSavedState;
  readonly buffer: TextCrdtMessage[];
};

// TODO: events

/**
 * A traditional op-based/state-based text CRDT implemented on top of list-positions.
 *
 * Copied from [@list-positions/crdts](https://github.com/mweidner037/list-positions-crdts/)
 * to make benchmarking easier.
 *
 * send/receive work on general networks (they build in exactly-once partial-order delivery),
 * and save/load work as state-based merging.
 *
 * Internally, its state is a Text (for values) and a PositionSet (for tracking
 * which Positions have been "seen"). This implementation uses Positions in messages
 * and manually manages metadata; in particular, it must buffer certain out-of-order
 * messages.
 */
export class TextCrdt {
  private readonly text: Text;
  /**
   * A set of all Positions we've ever seen, whether currently present or deleted.
   * Used for state-based merging and handling reordered messages.
   *
   * We use PositionSet here because we don't care about the list order. If you did,
   * you could use Outline instead, with the same Order as this.list
   * (`this.seen = new Outline(this.order);`).
   *
   * Tracking all seen Positions (instead of just deleted ones) reduces
   * internal sparse array fragmentation, leading to smaller memory and saved state sizes.
   */
  private readonly seen: PositionSet;
  /**
   * Maps from bunchID to a Set of messages that are waiting on that
   * bunch's BunchMeta before they can be processed.
   */
  private readonly pending: Map<string, Set<TextCrdtMessage>>;

  constructor(private readonly send: (message: TextCrdtMessage) => void) {
    this.text = new Text();
    this.seen = new PositionSet();
    this.pending = new Map();
  }

  getAt(index: number): string {
    return this.text.getAt(index);
  }

  [Symbol.iterator](): IterableIterator<string> {
    return this.text.values();
  }

  values(): IterableIterator<string> {
    return this.text.values();
  }

  slice(start?: number, end?: number): string {
    return this.text.slice(start, end);
  }

  toString(): string {
    return this.text.toString();
  }

  insertAt(index: number, chars: string): void {
    if (chars.length === 0) return;

    const [pos, newMeta] = this.text.insertAt(index, chars);
    this.seen.add(pos, chars.length);
    const message: TextCrdtMessage = {
      type: "set",
      startPos: pos,
      chars,
      ...(newMeta ? { meta: newMeta } : {}),
    };
    this.send(message);
  }

  deleteAt(index: number, count = 1): void {
    if (count === 0) return;

    const items: [startPos: Position, count: number][] = [];
    if (count === 1) {
      // Common case: use positionAt, which is faster than items.
      items.push([this.text.positionAt(index), 1]);
    } else {
      for (const [startPos, chars] of this.text.items(index, index + count)) {
        items.push([startPos, chars.length]);
      }
    }

    for (const [startPos, itemCount] of items) {
      this.text.delete(startPos, itemCount);
    }
    this.send({ type: "delete", items });
  }

  receive(message: TextCrdtMessage): void {
    switch (message.type) {
      case "delete":
        for (const [startPos, count] of message.items) {
          // Mark each position as seen immediately, even if we don't have metadata
          // for its bunch yet. Okay because this.seen is a PositionSet instead of an Outline.
          this.seen.add(startPos, count);

          // Delete the positions if present.
          // If the bunch is unknown, it's definitely not present, and we
          // should skip calling text.has to avoid a "Missing metadata" error.
          if (this.text.order.getNode(startPos.bunchID) !== undefined) {
            // For future events, we may need to delete individually. Do it now for consistency.
            for (const pos of expandPositions(startPos, count)) {
              if (this.text.has(pos)) {
                this.text.delete(pos);
              }
            }
          }
        }
        break;
      case "set": {
        const bunchID = message.startPos.bunchID;
        if (message.meta) {
          const parentID = message.meta.parentID;
          if (this.text.order.getNode(parentID) === undefined) {
            // The meta can't be processed yet because its parent bunch is unknown.
            // Add it to pending.
            this.addToPending(parentID, message);
            return;
          } else this.text.order.addMetas([message.meta]);
        }

        if (this.text.order.getNode(bunchID) === undefined) {
          // The message can't be processed yet because its bunch is unknown.
          // Add it to pending.
          this.addToPending(bunchID, message);
          return;
        }

        // At this point, BunchMeta dependencies are satisfied. Process the message.

        // Note that the insertion may have already been (partly) seen, due to
        // redundant or out-of-order messages;
        // only unseen positions need to be inserted.
        const poss = expandPositions(message.startPos, message.chars.length);
        const toInsert: number[] = [];
        for (let i = 0; i < poss.length; i++) {
          if (!this.seen.has(poss[i])) toInsert.push(i);
        }
        if (toInsert.length === message.chars.length) {
          // All need inserting (normal case).
          this.text.set(message.startPos, message.chars);
        } else {
          for (const i of toInsert) {
            this.text.set(poss[i], message.chars[i]);
          }
        }

        this.seen.add(message.startPos, message.chars.length);

        if (message.meta) {
          // The meta may have unblocked pending messages.
          const unblocked = this.pending.get(message.meta.bunchID);
          if (unblocked !== undefined) {
            this.pending.delete(message.meta.bunchID);
            // TODO: if you unblock a long dependency chain (unlikely),
            // this recursion could overflow the stack.
            for (const msg2 of unblocked) this.receive(msg2);
          }
        }
        break;
      }
    }
  }

  private addToPending(bunchID: string, message: TextCrdtMessage): void {
    let bunchPending = this.pending.get(bunchID);
    if (bunchPending === undefined) {
      bunchPending = new Set();
      this.pending.set(bunchID, bunchPending);
    }
    bunchPending.add(message);
  }

  save(): TextCrdtSavedState {
    const buffer: TextCrdtMessage[] = [];
    for (const messageSet of this.pending.values()) {
      buffer.push(...messageSet);
    }
    return {
      order: this.text.order.save(),
      text: this.text.save(),
      seen: this.seen.save(),
      buffer,
    };
  }

  load(savedState: TextCrdtSavedState): void {
    if (this.seen.state.size === 0) {
      // Never been used, so okay to load directly instead of doing a state-based
      // merge.
      this.text.order.load(savedState.order);
      this.text.load(savedState.text);
      this.seen.load(savedState.seen);
    } else {
      // TODO: benchmark merging.
      const otherText = new Text();
      const otherSeen = new Outline(otherText.order);
      otherText.order.load(savedState.order);
      otherText.load(savedState.text);
      otherSeen.load(savedState.seen);

      // Loop over all positions that had been inserted or deleted into
      // the other list.
      this.text.order.load(savedState.order);
      for (const pos of otherSeen) {
        if (!this.seen.has(pos)) {
          // pos is new to us. Copy its state from the other list.
          if (otherText.has(pos)) this.text.set(pos, otherText.get(pos)!);
          this.seen.add(pos);
        } else {
          // We already know of pos. If it's deleted in the other list,
          // ensure it's deleted here too.
          if (!otherText.has(pos)) this.text.delete(pos);
        }
      }
    }

    // In either case, process buffer by re-delivering all of its messages.
    for (const message of savedState.buffer) {
      this.receive(message);
    }
  }
}
