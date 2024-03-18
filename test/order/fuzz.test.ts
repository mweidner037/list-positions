import seedrandom from "seedrandom";
import {
  MAX_POSITION,
  MIN_POSITION,
  Position,
  expandPositions,
} from "../../src";
import { assertIsOrdered, newOrders, testUniqueAfterDelete } from "./util";

describe("Order - fuzz", () => {
  describe("sequential", () => {
    describe("1 user", () => sequential(1));
    describe("10 users", () => sequential(10));
  });
});

function sequential(numUsers: number) {
  let rng!: seedrandom.PRNG;

  beforeEach(() => {
    rng = seedrandom("42");
  });

  it("random", () => {
    const orders = newOrders(rng, numUsers, true);

    // Randomly create positions in a single list, simulating sequential access.
    const list: Position[] = [];
    for (let i = 0; i < 1000; i++) {
      const source = orders[Math.floor(rng() * orders.length)];
      const index = Math.floor(rng() * (list.length + 1));
      const [newPosition] = source.createPositions(
        list[index - 1] ?? MIN_POSITION,
        list[index] ?? MAX_POSITION,
        1
      );
      list.splice(index, 0, newPosition);
    }

    for (const source of orders) assertIsOrdered(list, source);
    testUniqueAfterDelete(list, orders[0]);
  });

  it("random LtR runs", () => {
    const orders = newOrders(rng, numUsers, true);

    // Randomly create positions in a single list, simulating sequential access.
    // This time, create short LtR runs at a time.
    const list: Position[] = [];
    for (let i = 0; i < 200; i++) {
      const source = orders[Math.floor(rng() * orders.length)];
      const index = Math.floor(rng() * (list.length + 1));
      const [startPos] = source.createPositions(
        list[index - 1] ?? MIN_POSITION,
        list[index] ?? MAX_POSITION,
        5
      );
      list.splice(index, 0, ...expandPositions(startPos, 5));
    }

    for (const source of orders) assertIsOrdered(list, source);
    testUniqueAfterDelete(list, orders[0]);
  });

  it("random RtL runs", () => {
    const orders = newOrders(rng, numUsers, true);

    // Randomly create positions in a single list, simulating sequential access.
    // This time, create short RtL runs at a time.
    const list: Position[] = [];
    for (let i = 0; i < 200; i++) {
      const source = orders[Math.floor(rng() * orders.length)];
      const index = Math.floor(rng() * (list.length + 1));
      const [startPos] = source.createPositions(
        list[index - 1] ?? MIN_POSITION,
        list[index] ?? MAX_POSITION,
        5
      );
      list.splice(index, 0, ...expandPositions(startPos, 5));
    }

    for (const source of orders) assertIsOrdered(list, source);
    testUniqueAfterDelete(list, orders[0]);
  });

  it("biased", () => {
    const orders = newOrders(rng, numUsers, true);

    // Randomly create positions in a single list, simulating sequential access.
    // This time, bias towards smaller indices using a sqrt.
    const list: Position[] = [];
    for (let i = 0; i < 1000; i++) {
      const source =
        orders[Math.floor(Math.sqrt(rng() * orders.length * orders.length))];
      const index = Math.floor(rng() * (list.length + 1));
      const [newPosition] = source.createPositions(
        list[index - 1] ?? MIN_POSITION,
        list[index] ?? MAX_POSITION,
        1
      );
      list.splice(index, 0, newPosition);
    }

    for (const source of orders) assertIsOrdered(list, source);
    testUniqueAfterDelete(list, orders[0]);
  });
}
