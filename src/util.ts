export function precond(
  statement: boolean,
  message: string,
  ...optionalParams: unknown[]
): asserts statement is true {
  if (!statement) {
    if (optionalParams.length === 0) {
      throw new Error(message);
    } else {
      throw new Error(
        message + " " + optionalParams.map((value) => String(value)).join(" ")
      );
    }
  }
}

export function assert(
  statement: boolean,
  message?: string,
  ...optionalParams: unknown[]
): asserts statement is true {
  if (!statement) {
    if (message === undefined) {
      precond(statement, "Assertion failed", ...optionalParams);
    } else {
      precond(statement, "Assertion failed: " + message, ...optionalParams);
    }
  }
}

/**
 * [[PositionSource.LAST]] copy that avoids circular dependencies
 * (PositionSource <-> IDs).
 */
export const LastInternal = "~";
