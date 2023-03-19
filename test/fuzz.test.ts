import seedrandom from "seedrandom";
import { assertIsOrdered, newSources, testUniqueAfterDelete } from "./util";

describe("fuzz", () => {
  describe("sequential", () => {
    describe("1 user", () => sequential(1));
    describe("10 users", () => sequential(10));
  });
});

function sequential(numUsers: number) {
  let rng!: seedrandom.prng;

  beforeEach(() => {
    rng = seedrandom("42");
  });

  it("random", () => {
    const sources = newSources(rng, numUsers);

    // Randomly create positions in a single list, simulating sequential access.
    const list: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const source = sources[Math.floor(rng() * sources.length)];
      const index = Math.floor(rng() * (list.length + 1));
      // Out-of-bounds okay.
      const newPosition = source.createBetween(list[index - 1], list[index]);
      list.splice(index, 0, newPosition);
    }

    assertIsOrdered(list);
    testUniqueAfterDelete(list, sources[0]);
  });

  it("random LtR runs", () => {
    const sources = newSources(rng, numUsers);

    // Randomly create positions in a single list, simulating sequential access.
    // This time, create short LtR runs at a time.
    const list: string[] = [];
    for (let i = 0; i < 200; i++) {
      const source = sources[Math.floor(rng() * sources.length)];
      const index = Math.floor(rng() * (list.length + 1));
      // Out-of-bounds okay.
      for (let j = 0; j < 5; j++) {
        const newPosition = source.createBetween(
          list[index - 1 + j],
          list[index + j]
        );
        list.splice(index + j, 0, newPosition);
      }
    }

    assertIsOrdered(list);
    testUniqueAfterDelete(list, sources[0]);
  });

  it("random RtL runs", () => {
    const sources = newSources(rng, numUsers);

    // Randomly create positions in a single list, simulating sequential access.
    // This time, create short RtL runs at a time.
    const list: string[] = [];
    for (let i = 0; i < 200; i++) {
      const source = sources[Math.floor(rng() * sources.length)];
      const index = Math.floor(rng() * (list.length + 1));
      // Out-of-bounds okay.
      for (let j = 0; j < 5; j++) {
        const newPosition = source.createBetween(list[index - 1], list[index]);
        list.splice(index, 0, newPosition);
      }
    }

    assertIsOrdered(list);
    testUniqueAfterDelete(list, sources[0]);
  });

  it("biased", () => {
    const sources = newSources(rng, numUsers);

    // Randomly create positions in a single list, simulating sequential access.
    // This time, bias towards smaller indices using a sqrt.
    const list: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const source =
        sources[Math.floor(Math.sqrt(rng() * sources.length * sources.length))];
      const index = Math.floor(rng() * (list.length + 1));
      // Out-of-bounds okay.
      const newPosition = source.createBetween(list[index - 1], list[index]);
      list.splice(index, 0, newPosition);
    }

    assertIsOrdered(list);
    testUniqueAfterDelete(list, sources[0]);
  });
}
