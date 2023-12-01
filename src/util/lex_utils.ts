import { NodeDesc } from "../node";
import { LexPosition, Position } from "../position";
import { ReplicaIDs } from "./replica_ids";

export const LexUtils = {
  validate(lexPos: LexPosition): void {},

  decode(lexPos: LexPosition): [pos: Position, NodeDescs: NodeDesc[]] {},

  // TODO: explanation/demo of how to use these for efficient storage when using
  // LexPositions. Potentially, DB order query example (w/ splitting items) -
  // requires Node summary to be lex in-between its neighboring positions at each level
  // TODO: better names
  toSummary(lexPos: LexPosition): [nodeSummary: string, valueIndex: number] {},

  fromSummary(nodeSummary: string, valueIndex: number): LexPosition {},
} as const;

/**
 * Lightweight way to create LexPositions without loading a whole Order.
 *
 * Designed for backend use - e.g., easy to port (short, simple) source code
 * to other languages.
 *
 * Cf position-strings
 */
export class LexPositionSource {
  readonly replicaID: string;

  constructor(options?: { replicaID?: string }) {
    if (options?.replicaID !== undefined) {
      ReplicaIDs.validate(options.replicaID);
    }
    this.replicaID = options?.replicaID ?? ReplicaIDs.random();
  }

  createPositions(
    prevPos: Position,
    nextPos: Position,
    count = 1
  ): Position[] {}
}
