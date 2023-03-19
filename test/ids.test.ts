import { assert } from "chai";
import { PositionSource } from "../src";

describe("IDs", () => {
  describe("validate", () => {
    it("rejects period", () => {
      assert.throws(() => new PositionSource({ ID: "ali.ce" }));
    });

    it("rejects comma", () => {
      assert.throws(() => new PositionSource({ ID: "ali,ce" }));
    });

    it("rejects LAST or greater", () => {
      assert.throws(() => new PositionSource({ ID: PositionSource.LAST }));
      assert.throws(
        () => new PositionSource({ ID: PositionSource.LAST + "alice" })
      );
    });
  });
});
