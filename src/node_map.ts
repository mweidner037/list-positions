export class NodeMap<T> {
  private readonly state = new Map<string, Map<number, T>>();

  get(creatorID: string, timestamp: number): T | undefined {
    return this.state.get(creatorID)?.get(timestamp);
  }

  getObj(obj: { creatorID: string; timestamp: number }): T | undefined {
    return this.state.get(obj.creatorID)?.get(obj.timestamp);
  }

  set(creatorID: string, timestamp: number, value: T): void {
    let byCreator = this.state.get(creatorID);
    if (byCreator === undefined) {
      byCreator = new Map();
      this.state.set(creatorID, byCreator);
    }
    byCreator.set(timestamp, value);
  }

  delete(creatorID: string, timestamp: number): boolean {
    const byCreator = this.state.get(creatorID);
    if (byCreator === undefined) return false;
    const had = byCreator.delete(timestamp);
    if (byCreator.size === 0) this.state.delete(creatorID);
    return had;
  }
}
