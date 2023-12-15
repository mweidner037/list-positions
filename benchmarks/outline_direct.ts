import pako from "pako";
import {
  BunchMeta,
  OrderSavedState,
  Outline,
  OutlineSavedState,
  Position,
} from "../src";
import realTextTraceEdits from "./internal/real_text_trace_edits.json";
import { avg, getMemUsed, sleep } from "./internal/util";

const { edits } = realTextTraceEdits as unknown as {
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
  list: OutlineSavedState;
};

export async function outlineDirect() {
  console.log("\n## Outline Direct\n");
  console.log(
    "Use `Outline` and send updates directly over a reliable link (e.g. WebSocket)."
  );
  console.log(
    "Updates and saved states use JSON encoding, with optional GZIP for saved states."
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
      updateObj = { type: "set", pos };
      if (createdBunch !== null) updateObj.meta = createdBunch.meta();
    } else {
      const pos = sender.positionAt(edit[0]);
      sender.delete(pos);
      updateObj = { type: "delete", pos };
    }

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

  const savedState = (await saveLoad(receiver, false)) as string;
  await saveLoad(receiver, true);

  await memory(savedState);
}

async function saveLoad(
  saver: Outline,
  gzip: boolean
): Promise<string | Uint8Array> {
  // Save.
  let startTime = process.hrtime.bigint();
  const savedStateObj: SavedState = {
    order: saver.order.save(),
    list: saver.save(),
  };
  const savedState = gzip
    ? pako.gzip(JSON.stringify(savedStateObj))
    : JSON.stringify(savedStateObj);

  console.log(
    `- Save time ${gzip ? "GZIP'd " : ""}(ms):`,
    Math.round(
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
    )
  );
  console.log(
    `- Save size ${gzip ? "GZIP'd " : ""}(bytes):`,
    savedState.length
  );

  // Load the saved state.
  startTime = process.hrtime.bigint();
  const loader = new Outline();
  const toLoadStr = gzip
    ? pako.ungzip(savedState as Uint8Array, { to: "string" })
    : (savedState as string);
  const toLoadObj: SavedState = JSON.parse(toLoadStr);
  // Important to load Order first.
  loader.order.load(toLoadObj.order);
  loader.load(toLoadObj.list);

  console.log(
    `- Load time ${gzip ? "GZIP'd " : ""}(ms):`,
    Math.round(
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
    )
  );

  return savedState;
}

async function memory(savedState: string) {
  // Measure memory usage of loading the saved state.

  // Pause (& separate function)seems to make GC more consistent -
  // less likely to get negative diffs.
  await sleep(1000);
  const startMem = getMemUsed();

  const loader = new Outline();
  // Keep the parsed saved state in a separate scope so it can be GC'd
  // before we measure memory.
  (function () {
    const savedStateObj: SavedState = JSON.parse(savedState);
    // Important to load Order first.
    loader.order.load(savedStateObj.order);
    loader.load(savedStateObj.list);
  })();

  console.log(
    "- Mem used (MB):",
    ((getMemUsed() - startMem) / 1000000).toFixed(1)
  );

  // Keep stuff in scope so we don't accidentally subtract its memory usage.
  void loader;
  void savedState;
}
