import { assert } from "chai";
import seedrandom from "seedrandom";
import { IDs, PositionSource } from "../src";

export function assertIsOrdered(list: string[]) {
  for (let i = 0; i < list.length - 1; i++) {
    assert(list[i] < list[i + 1], `Out of order: ${list[i]} !< ${list[i + 1]}`);
  }
}

export function newSources(
  rng: seedrandom.prng,
  count: number
): PositionSource[] {
  const sources: PositionSource[] = [];
  for (let i = 0; i < 10; i++) {
    sources.push(new PositionSource({ ID: IDs.pseudoRandom(rng) }));
  }
  return sources;
}
