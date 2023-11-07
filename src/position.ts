export type Position = {
  readonly creatorID: string;
  readonly timestamp: number;
  readonly valueIndex: number;
};

export function positionEquals(a: Position, b: Position): boolean {
  return (
    a.creatorID === b.creatorID &&
    a.timestamp === b.timestamp &&
    a.valueIndex === b.valueIndex
  );
}
