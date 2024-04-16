import { assert } from "chai";
import { maybeRandomString } from "maybe-random-string";
import seedrandom from "seedrandom";
import {
  MAX_POSITION,
  MIN_POSITION,
  Order,
  Position,
  lexicographicString,
} from "../../src";

/**
 * Asserts that the Positions are ordered under Order.compare,
 * their lexicographic strings are ordered lexicographically,
 * and that abs/unabs work correctly.
 */
export function assertIsOrdered(positions: Position[], order: Order) {
  for (let i = 0; i < positions.length - 1; i++) {
    assert(
      order.compare(positions[i], positions[i + 1]) < 0,
      `Out of order @ ${i}: ${JSON.stringify(positions[i])} !< ${JSON.stringify(
        positions[i + 1]
      )}`
    );
  }
  for (let i = 0; i < positions.length - 1; i++) {
    const lexA = lexicographicString(order.abs(positions[i]));
    const lexB = lexicographicString(order.abs(positions[i + 1]));
    assert(lexA < lexB, `Out of order @ ${i}: ${lexA} !< ${lexB}`);
  }
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const absPos = order.abs(pos);
    const pos2 = order.unabs(absPos);
    assert.deepStrictEqual(pos2, pos);

    const newOrder = new Order();
    const pos3 = newOrder.unabs(absPos);
    assert.deepStrictEqual(pos3, pos);
    const absPos2 = newOrder.abs(pos3);
    assert.deepStrictEqual(absPos2, absPos);
  }
}

export function newOrders(
  prng: seedrandom.PRNG,
  count: number,
  linkedMeta: boolean
): Order[] {
  const orders: Order[] = [];
  for (let i = 0; i < count; i++) {
    const order = new Order({
      replicaID: maybeRandomString({ prng }),
    });
    if (linkedMeta) {
      order.onNewMeta = (meta) => orders.forEach((o) => o.addMetas([meta]));
    }
    orders.push(order);
  }
  return orders;
}

export function testUniqueAfterDelete(positions: Position[], order: Order) {
  // In each slot, create two Positions with same left & right,
  // simulating that the first was deleted. Then make sure they
  // are still distinct, in case the first is resurrected.
  for (let i = 0; i <= positions.length; i++) {
    const [a] = order.createPositions(
      positions[i - 1] ?? MIN_POSITION,
      positions[i] ?? MAX_POSITION,
      1
    );
    const [b] = order.createPositions(
      positions[i - 1] ?? MIN_POSITION,
      positions[i] ?? MAX_POSITION,
      1
    );
    assert.notDeepEqual(a, b);
    assert.notStrictEqual(
      lexicographicString(order.abs(a)),
      lexicographicString(order.abs(b))
    );
  }
}
