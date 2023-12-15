import {
  BunchMeta,
  List,
  ListSavedState,
  OrderSavedState,
  Position,
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
};

export class ListCRDT<T> {
  /** For queries only. */
  readonly list: List<T>;

  constructor(private readonly send: (msg: string) => void) {
    this.list = new List();
  }

  insertAt(index: number, value: T): void {
    const [pos, createdBunch] = this.list.insertAt(index, value);
    const message: Message<T> = { type: "set", pos, value };
    if (createdBunch !== null) message.meta = createdBunch.meta();
    this.send(JSON.stringify(message));
  }

  deleteAt(index: number): void {
    const pos = this.list.positionAt(index);
    this.list.delete(pos);
    this.send(JSON.stringify({ type: "delete", pos }));
  }

  receive(msg: string): void {
    // TODO: deduplication & causal order enforcement.
    const decoded = JSON.parse(msg) as Message<T>;
    if (decoded.type === "set") {
      if (decoded.meta) this.list.order.receive([decoded.meta]);
      this.list.set(decoded.pos, decoded.value);
      // For a hypothetical event, compute the index.
      void this.list.indexOfPosition(decoded.pos);
    } else {
      if (this.list.has(decoded.pos)) {
        this.list.delete(decoded.pos);
        // For a hypothetical event, compute the index.
        void this.list.indexOfPosition(decoded.pos);
      }
    }
  }

  save(): string {
    return JSON.stringify({
      order: this.list.order.save(),
      list: this.list.save(),
    });
  }

  // TODO: not a state-based merge.
  load(savedState: string): void {
    const decoded = JSON.parse(savedState) as SavedState<T>;
    this.list.order.load(decoded.order);
    this.list.load(decoded.list);
  }
}
