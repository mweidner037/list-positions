import { assert } from "chai";
import pako from "pako";
import {
  BunchMeta,
  List,
  OrderSavedState,
  Outline,
  OutlineSavedState,
  Position,
} from "../src";
import realTextTraceEdits from "./internal/real_text_trace_edits.json";
import { avg, getMemUsed, sleep } from "./internal/util";

const { edits, finalText } = realTextTraceEdits as unknown as {
  finalText: string;
  edits: Array<[number, number, string | undefined]>;
};

type Update =
  | {
      type: "set";
      pos: Position;
      meta?: BunchMeta;
    }
  | { type: "delete"; pos: Position };

type SavedState = {
  order: OrderSavedState;
  outline: OutlineSavedState;
};

export async function outlineDirect(gzip: boolean) {
  console.log("\n## Outline Direct" + (gzip ? " - Gzip" : "") + "\n");
  console.log(
    "Use `Outline` and send updates directly over a reliable link (e.g. WebSocket)."
  );
  console.log(
    "Updates use plain JSON encoding; saved states use",
    gzip ? "gzip'd" : "plain",
    "JSON encoding."
  );
  console.log("Neither updates nor saved states include values (chars).\n");

  // Perform the whole trace, sending all updates.
  const updates: string[] = [];
  let startTime = process.hrtime.bigint();
  const sender = new Outline();
  for (const edit of edits) {
    let updateObj: Update;
    if (edit[2] !== undefined) {
      const [pos, createdBunch] = sender.insertAt(edit[0]);
      // Still send the value for realism.
      updateObj = { type: "set", pos };
      if (createdBunch !== null) updateObj.meta = createdBunch.meta();
    } else {
      const pos = sender.positionAt(edit[0]);
      sender.delete(pos);
      updateObj = { type: "delete", pos };
    }

    // Experimentally, GZIP doesn't actually reduce update sizes, and it makes
    // things way slower. So we only GZIP saved states when gzip = true.
    updates.push(JSON.stringify(updateObj));
  }

  console.log(
    "- Sender time (ms):",
    Math.round(
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
    )
  );
  console.log(
    "- Avg update size (bytes):",
    avg(updates.map((message) => message.length)).toFixed(1)
  );
  // assert.strictEqual(sender.slice().join(""), finalText);

  // Receive all updates.
  startTime = process.hrtime.bigint();
  const receiver = new Outline();
  for (const update of updates) {
    const updateObj: Update = JSON.parse(update);
    if (updateObj.type === "set") {
      if (updateObj.meta) receiver.order.receive([updateObj.meta]);
      receiver.add(updateObj.pos);
      // To simulate events, also compute the inserted index.
      void receiver.indexOfPosition(updateObj.pos);
    } else {
      // type "delete"
      if (receiver.has(updateObj.pos)) {
        // To simulate events, also compute the inserted index.
        void receiver.indexOfPosition(updateObj.pos);
        receiver.delete(updateObj.pos); // Also okay to call outside of the "has" guard.
      }
    }
  }

  console.log(
    "- Receiver time (ms):",
    Math.round(
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
    )
  );
  // assert.strictEqual(receiver.slice().join(""), finalText);

  // Save the receiver's state.
  startTime = process.hrtime.bigint();
  const savedStateObj: SavedState = {
    order: receiver.order.save(),
    outline: receiver.save(),
  };
  const savedState = gzip
    ? pako.gzip(JSON.stringify(savedStateObj))
    : JSON.stringify(savedStateObj);

  console.log(
    "- Save time (ms):",
    Math.round(
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
    )
  );
  console.log("- Save size (bytes):", savedState.length);

  // Load the saved state. Measure time and memory usage.
  await measureLoad(gzip, savedState);
}

async function measureLoad(gzip: boolean, savedState: string | Uint8Array) {
  // Pause (& separate function)seems to make GC more consistent -
  // less likely to get negative diffs.
  await sleep(1000);
  const startMem = getMemUsed();

  const startTime = process.hrtime.bigint();
  const loader = new Outline();
  // Keep the parsed saved state in a separate scope so it can be GC'd
  // before we measure memory.
  (function () {
    const savedStateStr = gzip
      ? pako.ungzip(savedState as Uint8Array, { to: "string" })
      : (savedState as string);
    const savedStateObj: SavedState = JSON.parse(savedStateStr);
    // Important to load Order first.
    loader.order.load(savedStateObj.order);
    loader.load(savedStateObj.outline);
  })();

  console.log(
    "- Load time (ms):",
    Math.round(
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
    )
  );
  console.log(
    "- Mem used (MB):",
    ((getMemUsed() - startMem) / 1000000).toFixed(1)
  );
  // assert.strictEqual(loader.slice().join(""), finalText);
  // Keep savedState in scope so we don't accidentally subtract its memory usage.
  void savedState;
}
