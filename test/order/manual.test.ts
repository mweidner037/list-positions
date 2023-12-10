import { assert } from "chai";
import seedrandom from "seedrandom";
import { BunchIDs, Order, Position } from "../../src";
import { assertIsOrdered, testUniqueAfterDelete } from "./util";

describe("Order - manual", () => {
  const rng = seedrandom("42");
  const randomName = BunchIDs.newReplicaID({ rng });
  const randomAlice = BunchIDs.newReplicaID({ rng });
  const randomBobby = BunchIDs.newReplicaID({ rng });
  const randomBob = BunchIDs.newReplicaID({ rng, length: 5 });

  describe("single user", () => {
    describe("random replicaID", () => {
      testSingleUser(randomName);
    });
    describe("alphabetic replicaID", () => {
      testSingleUser("alice");
    });
    describe("numeric replicaID", () => {
      testSingleUser("0");
    });
    describe("empty replicaID", () => {
      testSingleUser("");
    });
  });

  describe("two users", () => {
    describe("random replicaIDs", () => {
      testTwoUsers(randomAlice, randomBobby);
    });
    describe("random replicaIDs, unequal lengths", () => {
      testTwoUsers(randomAlice, randomBob);
    });
    describe("random replicaIDs, prefixes", () => {
      testTwoUsers(randomBobby, randomBob);
    });
    describe("numeric replicaIDs", () => {
      testTwoUsers("57834", "00143");
    });
    describe("random and empty replicaIDs", () => {
      testTwoUsers(randomAlice, "");
    });
  });
});

function testSingleUser(replicaID: string) {
  let alice!: Order;

  beforeEach(() => {
    alice = new Order({ newBunchID: BunchIDs.usingReplicaID(replicaID) });
  });

  it("LtR", () => {
    let previous = Order.MIN_POSITION;
    const list: Position[] = [];
    for (let i = 0; i < 20; i++) {
      [previous] = alice.createPositions(previous, Order.MAX_POSITION, 1);
      list.push(previous);
    }
    assertIsOrdered(list, alice);
  });

  it("RtL", () => {
    let previous = Order.MAX_POSITION;
    const list: Position[] = [];
    for (let i = 0; i < 20; i++) {
      [previous] = alice.createPositions(Order.MIN_POSITION, previous, 1);
      list.unshift(previous);
    }
    assertIsOrdered(list, alice);
  });

  it("restart", () => {
    const list: Position[] = [];
    for (let j = 0; j < 5; j++) {
      let previous = Order.MIN_POSITION;
      const after = list[0] ?? Order.MAX_POSITION;
      for (let i = 0; i < 10; i++) {
        [previous] = alice.createPositions(previous, after, 1);
        list.splice(i, 0, previous);
      }
    }
    assertIsOrdered(list, alice);
  });

  it("LtR bulk", () => {
    const [startPos] = alice.createPositions(
      Order.MIN_POSITION,
      Order.MAX_POSITION,
      1000
    );
    const list = Order.startPosToArray(startPos, 1000);
    assertIsOrdered(list, alice);
    // LexPosition efficiency check.
    assert.isBelow(alice.lex(list.at(-1)!).length, 30);
  });

  it("LtR long", () => {
    let previous = Order.MIN_POSITION;
    const list: Position[] = [];
    for (let i = 0; i < 1000; i++) {
      [previous] = alice.createPositions(previous, Order.MAX_POSITION, 1);
      list.push(previous);
    }
    assertIsOrdered(list, alice);
    // LexPosition efficiency check.
    assert.isBelow(alice.lex(list.at(-1)!).length, 30);
  });

  it("RtL long", () => {
    let previous = Order.MAX_POSITION;
    const list: Position[] = [];
    for (let i = 0; i < 1000; i++) {
      [previous] = alice.createPositions(Order.MIN_POSITION, previous, 1);
      list.unshift(previous);
    }
    assertIsOrdered(list, alice);
  });

  it("LtR, mid LtR", () => {
    let previous = Order.MIN_POSITION;
    const list: Position[] = [];
    for (let i = 0; i < 20; i++) {
      [previous] = alice.createPositions(previous, Order.MAX_POSITION, 1);
      list.push(previous);
    }
    const midRight = list[10];
    previous = list[9];
    for (let i = 0; i < 20; i++) {
      [previous] = alice.createPositions(previous, midRight, 1);
      list.splice(10 + i, 0, previous);
    }
    assertIsOrdered(list, alice);
  });

  it("LtR, mid RtL", () => {
    let previous = Order.MIN_POSITION;
    const list: Position[] = [];
    for (let i = 0; i < 20; i++) {
      [previous] = alice.createPositions(previous, Order.MAX_POSITION, 1);
      list.push(previous);
    }
    const midLeft = list[9];
    previous = list[10];
    for (let i = 0; i < 20; i++) {
      [previous] = alice.createPositions(midLeft, previous, 1);
      list.splice(10, 0, previous);
    }
    assertIsOrdered(list, alice);
  });

  it("unique after delete", () => {
    let previous = Order.MIN_POSITION;
    const list: Position[] = [];
    for (let i = 0; i < 20; i++) {
      [previous] = alice.createPositions(previous, Order.MAX_POSITION, 1);
      list.push(previous);
    }
    const midLeft = list[9];
    previous = list[10];
    for (let i = 0; i < 20; i++) {
      [previous] = alice.createPositions(midLeft, previous, 1);
      list.splice(10, 0, previous);
    }

    testUniqueAfterDelete(list, alice);
  });

  it("bulk vs sequential", () => {
    // One way to create bulk positions: one createPositions call.
    const [startPos] = alice.createPositions(
      Order.MIN_POSITION,
      Order.MAX_POSITION,
      100
    );
    const list1 = Order.startPosToArray(startPos, 100);
    // 2nd way to create bulk positions: series of calls.
    const alice2 = new Order({
      newBunchID: BunchIDs.usingReplicaID(replicaID),
    });
    const list2: Position[] = [];
    let previous = Order.MIN_POSITION;
    for (let i = 0; i < 100; i++) {
      [previous] = alice2.createPositions(previous, Order.MAX_POSITION, 1);
      list2.push(previous);
    }
    assert.deepStrictEqual(list2, list1);
  });
}

function testTwoUsers(replicaID1: string, replicaID2: string) {
  let alice!: Order;
  let bob!: Order;

  beforeEach(() => {
    alice = new Order({ newBunchID: BunchIDs.usingReplicaID(replicaID1) });
    bob = new Order({ newBunchID: BunchIDs.usingReplicaID(replicaID2) });
    // Automatically share metadata.
    alice.onCreateNode = (node) => bob.receive([node.meta()]);
    bob.onCreateNode = (node) => alice.receive([node.meta()]);
  });

  it("LtR sequential", () => {
    let previous = Order.MIN_POSITION;
    const list: Position[] = [];
    for (let i = 0; i < 40; i++) {
      const user = i >= 20 ? bob : alice;
      [previous] = user.createPositions(previous, Order.MAX_POSITION, 1);
      list.push(previous);
    }
    assertIsOrdered(list, alice);
    assertIsOrdered(list, bob);
  });

  it("LtR alternating", () => {
    let previous = Order.MIN_POSITION;
    const list: Position[] = [];
    for (let i = 0; i < 40; i++) {
      const user = i % 2 == 0 ? bob : alice;
      [previous] = user.createPositions(previous, Order.MAX_POSITION, 1);
      list.push(previous);
    }
    assertIsOrdered(list, alice);
    assertIsOrdered(list, bob);
  });

  it("RtL sequential", () => {
    let previous = Order.MAX_POSITION;
    const list: Position[] = [];
    for (let i = 0; i < 40; i++) {
      const user = i >= 20 ? bob : alice;
      [previous] = user.createPositions(Order.MIN_POSITION, previous, 1);
      list.unshift(previous);
    }
    assertIsOrdered(list, alice);
    assertIsOrdered(list, bob);
  });

  it("RtL alternating", () => {
    let previous = Order.MAX_POSITION;
    const list: Position[] = [];
    for (let i = 0; i < 40; i++) {
      const user = i % 2 == 0 ? bob : alice;
      [previous] = user.createPositions(Order.MIN_POSITION, previous, 1);
      list.unshift(previous);
    }
    assertIsOrdered(list, alice);
    assertIsOrdered(list, bob);
  });

  it("restart alternating", () => {
    const list: Position[] = [];
    for (let j = 0; j < 5; j++) {
      let previous = Order.MIN_POSITION;
      const after = list[0] ?? Order.MAX_POSITION;
      for (let i = 0; i < 10; i++) {
        const user = i % 2 === 0 ? bob : alice;
        [previous] = user.createPositions(previous, after, 1);
        list.splice(i, 0, previous);
      }
    }
    assertIsOrdered(list, alice);
    assertIsOrdered(list, bob);
  });

  it("LtR concurrent", () => {
    let previous = Order.MIN_POSITION;
    const list1: Position[] = [];
    for (let i = 0; i < 20; i++) {
      [previous] = alice.createPositions(previous, Order.MAX_POSITION, 1);
      list1.push(previous);
    }
    previous = Order.MIN_POSITION;
    const list2: Position[] = [];
    for (let i = 0; i < 20; i++) {
      [previous] = bob.createPositions(previous, Order.MAX_POSITION, 1);
      list2.push(previous);
    }
    // list1 and list2 should be sorted one after the other, according
    // to their first element (non-interleaving).
    let list: Position[];
    if (alice.compare(list1[0], list2[0]) < 0) {
      // list1 < list2
      list = [...list1, ...list2];
    } else list = [...list2, ...list1];
    assertIsOrdered(list, alice);
    assertIsOrdered(list, bob);
  });

  it("RtL concurrent", () => {
    let previous = Order.MAX_POSITION;
    const list1: Position[] = [];
    for (let i = 0; i < 20; i++) {
      [previous] = alice.createPositions(Order.MIN_POSITION, previous, 1);
      list1.unshift(previous);
    }
    previous = Order.MAX_POSITION;
    const list2: Position[] = [];
    for (let i = 0; i < 20; i++) {
      [previous] = bob.createPositions(Order.MIN_POSITION, previous, 1);
      list2.unshift(previous);
    }
    // list1 and list2 should be sorted one after the other, according
    // to their first element (non-interleaving).
    let list: Position[];
    if (alice.compare(list1[0], list2[0]) < 0) {
      // list1 < list2
      list = [...list1, ...list2];
    } else list = [...list2, ...list1];
    assertIsOrdered(list, alice);
    assertIsOrdered(list, bob);
  });

  it("insert between concurrent", () => {
    // "Hard case" from the blog post - see
    // https://mattweidner.com/2022/10/05/basic-list-crdt.html#between-concurrent
    const [startPos] = alice.createPositions(
      Order.MIN_POSITION,
      Order.MAX_POSITION,
      2
    );
    const [a, b] = Order.startPosToArray(startPos, 2);

    let [c] = alice.createPositions(a, b, 1);
    let [d] = bob.createPositions(a, b, 1);
    // Order so c < d.
    if (alice.compare(d, c) < 0) [c, d] = [d, c];

    // Try making e on both alice and bob.
    let [e1] = alice.createPositions(c, d, 1);
    let [e2] = bob.createPositions(c, d, 1);

    assert.notDeepEqual(e1, e2);
    assertIsOrdered([a, c, e1, d, b], alice);
    assertIsOrdered([a, c, e1, d, b], bob);
    assertIsOrdered([a, c, e2, d, b], alice);
    assertIsOrdered([a, c, e2, d, b], bob);
  });

  it("unique after delete", () => {
    const list: Position[] = [];
    for (let j = 0; j < 5; j++) {
      let previous = Order.MIN_POSITION;
      const after = list[0] ?? Order.MAX_POSITION;
      for (let i = 0; i < 10; i++) {
        const user = i % 2 === 0 ? bob : alice;
        [previous] = user.createPositions(previous, after, 1);
        list.splice(i, 0, previous);
      }
    }
    assertIsOrdered(list, alice);
    assertIsOrdered(list, bob);

    testUniqueAfterDelete(list, alice);
    testUniqueAfterDelete(list, bob);
  });

  it("left children", () => {
    const [gParent] = alice.createPositions(
      Order.MIN_POSITION,
      Order.MAX_POSITION,
      1
    );
    // Each parent is a child of gParent with the same bunch but
    // a range of valueIndex's.
    const [startPos] = bob.createPositions(gParent, Order.MAX_POSITION, 500);
    const parents = Order.startPosToArray(startPos, 500);
    const list = [gParent, ...parents];
    // Create positions between gParent and the parents; since parent
    // starts with gParent, they'll be left children of parent.
    for (let i = 0; i < parents.length; i++) {
      const [child] = bob.createPositions(gParent, parents[i], 1);
      list.splice(2 * i + 1, 0, child);
    }
    assertIsOrdered(list, alice);
    assertIsOrdered(list, bob);

    testUniqueAfterDelete(list, alice);
    testUniqueAfterDelete(list, bob);
  });
}
