import { NodeID } from "../node";

/**
 * A map from NodeIDs to values. You can also pass
 * other node-related types that include NodeID's fields, including Position.
 *
 * We can't use Map for this because we want by-value equality for object keys.
 */
export class NodeMap<T> {
  /**
   * A two-level map (creatorID -> (timestamp -> T)) storing this NodeMap's state.
   */
  readonly state = new Map<string, Map<number, T>>();

  get(node: NodeID): T | undefined {
    return this.state.get(node.creatorID)?.get(node.counter);
  }

  /**
   * Exploded form of `get`.
   */
  get2(creatorID: string, counter: number): T | undefined {
    return this.state.get(creatorID)?.get(counter);
  }

  set(node: NodeID, value: T): void {
    let byCreator = this.state.get(node.creatorID);
    if (byCreator === undefined) {
      byCreator = new Map();
      this.state.set(node.creatorID, byCreator);
    }
    byCreator.set(node.counter, value);
  }

  delete(node: NodeID): boolean {
    const byCreator = this.state.get(node.creatorID);
    if (byCreator === undefined) return false;
    const had = byCreator.delete(node.counter);
    if (byCreator.size === 0) this.state.delete(node.creatorID);
    return had;
  }

  *values(): IterableIterator<T> {
    for (const byCreator of this.state.values()) yield* byCreator.values();
  }

  isEmpty() {
    return this.state.size === 0;
  }

  /**
   * Returns an arbitrary key that is present in this map.
   *
   * If the map is empty, behavior is undefined.
   */
  someKey(): NodeID {
    const [creatorID, byCreator] = this.state.entries().next().value as [
      string,
      Map<number, T>
    ];
    const counter = byCreator.keys().next().value as number;
    return { creatorID, counter };
  }
}
