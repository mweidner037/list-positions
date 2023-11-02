export type Position = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly valueIndex: number;
};

export type MetaEntry = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly parent: Position;
};

export function positionEqual(a: Position, b: Position): boolean {
  return (
    a.creatorID === b.creatorID &&
    a.timestamp === b.timestamp &&
    a.valueIndex === b.valueIndex
  );
}