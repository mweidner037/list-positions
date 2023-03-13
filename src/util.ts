export function assert(
  statement: boolean,
  ...message: unknown[]
): asserts statement is true {
  if (!statement) {
    throw new Error(
      "Assertion failed: " + message.map((value) => String(value)).join()
    );
  }
}
