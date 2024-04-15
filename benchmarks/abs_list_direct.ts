import { assert } from "chai";
import pako from "pako";
import { AbsList, AbsListSavedState, AbsPosition } from "../src";
import realTextTraceEdits from "./internal/real_text_trace_edits.json";
import { avg, getMemUsed, percentiles, sleep } from "./internal/util";

const { edits, finalText } = realTextTraceEdits as unknown as {
  finalText: string;
  edits: Array<[number, number, string | undefined]>;
};

type Update =
  | {
      type: "set";
      pos: AbsPosition;
      value: string;
      // No meta because AbsPosition embeds all dependencies.
    }
  | { type: "delete"; pos: AbsPosition };

// No OrderSavedState because AbsListSavedState embeds all dependencies.
type SavedState = AbsListSavedState<string>;

export async function absListDirect() {
  console.log("\n## AbsList Direct\n");
  console.log(
    "Use `AbsList` and send updates directly over a reliable link (e.g. WebSocket)."
  );
  console.log(
    "Updates and saved states use JSON encoding, with optional GZIP for saved states.\n"
  );

  const updates: string[] = [];
  let startTime = process.hrtime.bigint();
  const sender = new AbsList<string>();
  for (const edit of edits) {
    let updateObj: Update;
    if (edit[2] !== undefined) {
      const pos = sender.insertAt(edit[0], edit[2]);
      updateObj = { type: "set", pos, value: edit[2] };
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
  assert.strictEqual(sender.slice().join(""), finalText);

  // Out of curiosity, also report the distribution of AbsPosition JSON sizes.
  reportPositionSizes();

  // Receive all updates.
  startTime = process.hrtime.bigint();
  const receiver = new AbsList<string>();
  for (const update of updates) {
    const updateObj: Update = JSON.parse(update);
    if (updateObj.type === "set") {
      receiver.set(updateObj.pos, updateObj.value);
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
  assert.strictEqual(receiver.slice().join(""), finalText);

  const savedState = (await saveLoad(receiver, false)) as string;
  await saveLoad(receiver, true);

  await memory(savedState);
}

function reportPositionSizes(): void {
  const absPosLengths: number[] = [];
  const sender = new AbsList<string>();
  for (const edit of edits) {
    let updateObj: Update;
    if (edit[2] !== undefined) {
      const pos = sender.insertAt(edit[0], edit[2]);
      updateObj = { type: "set", pos, value: edit[2] };
      absPosLengths.push(JSON.stringify(pos).length);
    } else {
      const pos = sender.positionAt(edit[0]);
      sender.delete(pos);
      updateObj = { type: "delete", pos };
    }
  }

  console.log(
    `- AbsPosition length stats: avg = ${avg(absPosLengths).toFixed(
      1
    )}, percentiles [25, 50, 75, 100] = ${percentiles(
      absPosLengths,
      [25, 50, 75, 100]
    )}`
  );
}

async function saveLoad(
  saver: AbsList<string>,
  gzip: boolean
): Promise<string | Uint8Array> {
  // Save.
  let startTime = process.hrtime.bigint();
  const savedStateObj: SavedState = saver.save();
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
  const loader = new AbsList<string>();
  const toLoadStr = gzip
    ? pako.ungzip(savedState as Uint8Array, { to: "string" })
    : (savedState as string);
  const toLoadObj: SavedState = JSON.parse(toLoadStr);
  loader.load(toLoadObj);

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

  const loader = new AbsList<string>();
  // Keep the parsed saved state in a separate scope so it can be GC'd
  // before we measure memory.
  (function () {
    const savedStateObj: SavedState = JSON.parse(savedState);
    loader.load(savedStateObj);
  })();

  console.log(
    "- Mem used (MB):",
    ((getMemUsed() - startMem) / 1000000).toFixed(1)
  );

  // Keep stuff in scope so we don't accidentally subtract its memory usage.
  void loader;
  void savedState;
}
