import { assert } from "chai";
import seedrandom from "seedrandom";
import { IDs, PositionSource } from "../src";
import { assertIsOrdered } from "./util";

describe("manual", () => {
  const rng = seedrandom("42");
  const randomName = IDs.pseudoRandom(rng);
  const randomAlice = IDs.pseudoRandom(rng);
  const randomBobby = IDs.pseudoRandom(rng);
  const randomBob = IDs.pseudoRandom(rng, { length: 5 });

  describe("single user", () => {
    describe("random ID", () => {
      testSingleUser(randomName);
    });
    describe("alphabetic ID", () => {
      testSingleUser("alice");
    });
    describe("numeric ID", () => {
      testSingleUser("0");
    });
    describe("empty ID", () => {
      testSingleUser("");
    });
  });

  describe("two users", () => {
    describe("random IDs", () => {
      testTwoUsers(randomAlice, randomBobby);
    });
    describe("random IDs, unequal lengths", () => {
      testTwoUsers(randomAlice, randomBob);
    });
    describe("random IDs, prefixes", () => {
      testTwoUsers(randomBobby, randomBob);
    });
    describe("numeric IDs", () => {
      testTwoUsers("57834", "00143");
    });
    describe("random and empty IDs", () => {
      testTwoUsers(randomAlice, "");
    });
  });
});

function testSingleUser(ID: string) {
  let alice!: PositionSource;

  beforeEach(() => {
    alice = new PositionSource({ ID });
  });

  it("LtR", () => {
    let previous = PositionSource.FIRST;
    const list: string[] = [];
    for (let i = 0; i < 20; i++) {
      previous = alice.createBetween(previous, PositionSource.LAST);
      list.push(previous);
    }
    assertIsOrdered(list);
  });

  it("RtL", () => {
    let previous = PositionSource.LAST;
    const list: string[] = [];
    for (let i = 0; i < 20; i++) {
      previous = alice.createBetween(PositionSource.FIRST, previous);
      list.unshift(previous);
    }
    assertIsOrdered(list);
  });

  it("restart", () => {
    const list: string[] = [];
    for (let j = 0; j < 5; j++) {
      let previous: string = PositionSource.FIRST;
      let after = list[0]; // Out-of-bounds okay
      for (let i = 0; i < 10; i++) {
        previous = alice.createBetween(previous, after);
        list.splice(i, 0, previous);
      }
    }
    assertIsOrdered(list);
  });

  it("LtR long", () => {
    let previous = PositionSource.FIRST;
    const list: string[] = [];
    for (let i = 0; i < 1000; i++) {
      previous = alice.createBetween(previous, PositionSource.LAST);
      list.push(previous);
    }
    assertIsOrdered(list);
    // Efficiency check.
    assert.isBelow(list.at(-1)!.length, 30);
  });

  it("RtL long", () => {
    let previous = PositionSource.LAST;
    const list: string[] = [];
    for (let i = 0; i < 1000; i++) {
      previous = alice.createBetween(PositionSource.FIRST, previous);
      list.unshift(previous);
    }
    assertIsOrdered(list);
  });

  it("LtR, mid LtR", () => {
    let previous = PositionSource.FIRST;
    const list: string[] = [];
    for (let i = 0; i < 20; i++) {
      previous = alice.createBetween(previous, PositionSource.LAST);
      list.push(previous);
    }
    const midRight = list[10];
    previous = list[9];
    for (let i = 0; i < 20; i++) {
      previous = alice.createBetween(previous, midRight);
      list.splice(10 + i, 0, previous);
    }
    assertIsOrdered(list);
  });

  it("LtR, mid RtL", () => {
    let previous = PositionSource.FIRST;
    const list: string[] = [];
    for (let i = 0; i < 20; i++) {
      previous = alice.createBetween(previous, PositionSource.LAST);
      list.push(previous);
    }
    const midLeft = list[9];
    previous = list[10];
    for (let i = 0; i < 20; i++) {
      previous = alice.createBetween(midLeft, previous);
      list.splice(10, 0, previous);
    }
    assertIsOrdered(list);
  });
}

function testTwoUsers(ID1: string, ID2: string) {
  let alice!: PositionSource;
  let bob!: PositionSource;

  beforeEach(() => {
    alice = new PositionSource({ ID: ID1 });
    bob = new PositionSource({ ID: ID2 });
  });

  it("LtR sequential", () => {
    let previous = PositionSource.FIRST;
    const list: string[] = [];
    for (let i = 0; i < 40; i++) {
      const user = i >= 20 ? bob : alice;
      previous = user.createBetween(previous, PositionSource.LAST);
      list.push(previous);
    }
    assertIsOrdered(list);
  });

  it("LtR alternating", () => {
    let previous = PositionSource.FIRST;
    const list: string[] = [];
    for (let i = 0; i < 40; i++) {
      const user = i % 2 == 0 ? bob : alice;
      previous = user.createBetween(previous, PositionSource.LAST);
      list.push(previous);
    }
    assertIsOrdered(list);
  });

  it("RtL sequential", () => {
    let previous = PositionSource.LAST;
    const list: string[] = [];
    for (let i = 0; i < 40; i++) {
      const user = i >= 20 ? bob : alice;
      previous = user.createBetween(PositionSource.FIRST, previous);
      list.unshift(previous);
    }
    assertIsOrdered(list);
  });

  it("RtL alternating", () => {
    let previous = PositionSource.LAST;
    const list: string[] = [];
    for (let i = 0; i < 40; i++) {
      const user = i % 2 == 0 ? bob : alice;
      previous = user.createBetween(PositionSource.FIRST, previous);
      list.unshift(previous);
    }
    assertIsOrdered(list);
  });

  it("restart alternating", () => {
    const list: string[] = [];
    for (let j = 0; j < 5; j++) {
      let previous = PositionSource.FIRST;
      let after = list[0]; // out-of-bounds okay
      for (let i = 0; i < 10; i++) {
        const user = i % 2 === 0 ? bob : alice;
        previous = user.createBetween(previous, after);
        list.splice(i, 0, previous);
      }
    }
    assertIsOrdered(list);
  });

  it("LtR concurrent", () => {
    let previous: string | undefined = undefined;
    const list1: string[] = [];
    for (let i = 0; i < 20; i++) {
      previous = alice.createBetween(previous, undefined);
      list1.push(previous);
    }
    previous = undefined;
    const list2: string[] = [];
    for (let i = 0; i < 20; i++) {
      previous = bob.createBetween(previous, undefined);
      list2.push(previous);
    }
    // list1 and list2 should be sorted one after the other, according
    // to their first element (non-interleaving).
    let list: string[];
    if (list1[0] < list2[0]) {
      // list1 < list2
      list = [...list1, ...list2];
    } else list = [...list2, ...list1];
    assertIsOrdered(list);
  });

  it("RtL concurrent", () => {
    let previous: string | undefined = undefined;
    const list1: string[] = [];
    for (let i = 0; i < 20; i++) {
      previous = alice.createBetween(undefined, previous);
      list1.unshift(previous);
    }
    previous = undefined;
    const list2: string[] = [];
    for (let i = 0; i < 20; i++) {
      previous = bob.createBetween(undefined, previous);
      list2.unshift(previous);
    }
    // list1 and list2 should be sorted one after the other, according
    // to their first element (non-interleaving).
    let list: string[];
    if (list1[0] < list2[0]) {
      // list1 < list2
      list = [...list1, ...list2];
    } else list = [...list2, ...list1];
    assertIsOrdered(list);
  });

  it("insert between concurrent", () => {
    // "Hard case" from the blog post - see
    // https://mattweidner.com/2022/10/05/basic-list-crdt.html#between-concurrent
    const a = alice.createBetween(undefined, undefined);
    const b = alice.createBetween(a, undefined);

    let c = alice.createBetween(a, b);
    let d = bob.createBetween(a, b);
    // Order so c < d.
    if (d < c) [c, d] = [d, c];

    // Try making e on both alice and bob.
    let e1 = alice.createBetween(c, d);
    let e2 = bob.createBetween(c, d);

    assert.notEqual(e1, e2);
    assertIsOrdered([a, c, e1, d, b]);
    assertIsOrdered([a, c, e2, d, b]);
  });
}
