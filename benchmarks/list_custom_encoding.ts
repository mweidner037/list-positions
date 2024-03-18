import { assert } from "chai";
import pako from "pako";
import { List, ListSavedState, OrderSavedState, Position } from "../src";
import realTextTraceEdits from "./internal/real_text_trace_edits.json";
import { avg, getMemUsed, sleep } from "./internal/util";

const { edits, finalText } = realTextTraceEdits as unknown as {
  finalText: string;
  edits: Array<[number, number, string | undefined]>;
};

type SavedState = {
  order: OrderSavedState;
  list: ListSavedState<string>;
};

export async function listCustomEncoding() {
  console.log("\n## List Direct w/ Custom Encoding\n");
  console.log(
    "Use `List` and send updates directly over a reliable link (e.g. WebSocket)."
  );
  console.log(
    "Updates use a custom string encoding; saved states use JSON with optional GZIP.\n"
  );
  // TODO: custom savedState encoding too

  // Perform the whole trace, sending all updates.
  const updates: string[] = [];
  let startTime = process.hrtime.bigint();
  const sender = new List<string>();
  for (const edit of edits) {
    // Update format is a concatenated string with space-separated parts.
    // We use the fact that strings don't contain space except for set chars.
    // Numbers are base-36 encoded.
    // - Set: "s", bunchID, innerIndex, [meta parent, meta, ] char
    // - Delete: "d", bunchID, innerIndex
    let update: string;
    if (edit[2] !== undefined) {
      const [pos, newMeta] = sender.insertAt(edit[0], edit[2]);
      update = "s " + pos.bunchID + " " + pos.innerIndex.toString(36) + " ";
      if (newMeta !== null) {
        update += newMeta.parentID + " " + newMeta.offset.toString(36) + " ";
      }
      update += edit[2];
    } else {
      const pos = sender.positionAt(edit[0]);
      sender.delete(pos);
      update = "d " + pos.bunchID + " " + pos.innerIndex.toString(36);
    }

    updates.push(update);
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

  // Receive all updates.
  startTime = process.hrtime.bigint();
  const receiver = new List<string>();
  for (const update of updates) {
    if (update[0] === "s") {
      const char = update.at(-1)!;
      const parts = update.slice(2, -2).split(" ");
      if (parts.length === 4) {
        receiver.order.receiveMetas([
          {
            bunchID: parts[0],
            parentID: parts[2],
            offset: Number.parseInt(parts[3], 36),
          },
        ]);
      }
      const pos: Position = {
        bunchID: parts[0],
        innerIndex: Number.parseInt(parts[1], 36),
      };
      receiver.set(pos, char);
      // To simulate events, also compute the inserted index.
      void receiver.indexOfPosition(pos);
    } else {
      // type "delete"
      const parts = update.slice(2).split(" ");
      const pos: Position = {
        bunchID: parts[0],
        innerIndex: Number.parseInt(parts[1], 36),
      };
      if (receiver.has(pos)) {
        // To simulate events, also compute the inserted index.
        void receiver.indexOfPosition(pos);
        receiver.delete(pos); // Also okay to call outside of the "has" guard.
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

async function saveLoad(
  saver: List<string>,
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
  const loader = new List<string>();
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

  const loader = new List<string>();
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
