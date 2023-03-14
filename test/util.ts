import { assert } from "chai";

export function assertIsOrdered(list: string[]) {
  for (let i = 0; i < list.length - 1; i++) {
    assert(list[i] < list[i + 1], `Out of order: ${list[i]} !< ${list[i + 1]}`);
  }
}
