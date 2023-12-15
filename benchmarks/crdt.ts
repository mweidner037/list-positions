import { assert } from "chai";
import pako from "pako";
import { LexPositionCRDT } from "./internal/lex_position_crdt";
import { PositionCRDT } from "./internal/position_crdt";
import realTextTraceEdits from "./internal/real_text_trace_edits.json";
import { avg, getMemUsed, sleep } from "./internal/util";

const { edits, finalText } = realTextTraceEdits as unknown as {
  finalText: string;
  edits: Array<[number, number, string | undefined]>;
};

export async function crdt(CRDT: typeof PositionCRDT | typeof LexPositionCRDT) {
  console.log("\n## " + CRDT.name + "\n");
  console.log("Use a hybrid op-based/state-based CRDT on top of List+Outline.");
  if (CRDT === PositionCRDT) {
    console.log(
      "This variant uses Positions in messages, manually managing BunchMetas."
    );
  } else {
    console.log(
      "This variant uses LexPositions in messages instead of manually managing BunchMetas."
    );
  }
  console.log(
    "Updates and saved states use JSON encoding, with optional GZIP for saved states.\n"
  );

  // Perform the whole trace, sending all updates.
  const updates: string[] = [];
  let startTime = process.hrtime.bigint();
  const sender = new CRDT<string>((message) => updates.push(message));
  for (const edit of edits) {
    if (edit[2] !== undefined) {
      sender.insertAt(edit[0], edit[2]);
    } else sender.deleteAt(edit[0]);
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
  assert.strictEqual(sender.list.slice().join(""), finalText);

  // Receive all updates.
  startTime = process.hrtime.bigint();
  const receiver = new CRDT<string>(() => {});
  for (const update of updates) {
    receiver.receive(update);
  }

  console.log(
    "- Receiver time (ms):",
    Math.round(
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
    )
  );
  assert.strictEqual(receiver.list.slice().join(""), finalText);

  const savedState = (await saveLoad(CRDT, receiver, false)) as string;
  await saveLoad(CRDT, receiver, true);

  await memory(CRDT, savedState);
}

async function saveLoad(
  CRDT: typeof PositionCRDT | typeof LexPositionCRDT,
  saver: PositionCRDT<string> | LexPositionCRDT<string>,
  gzip: boolean
): Promise<string | Uint8Array> {
  // Save.
  let startTime = process.hrtime.bigint();
  const savedStateStr = saver.save();
  const savedState = gzip ? pako.gzip(savedStateStr) : savedStateStr;

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
  const loader = new CRDT<string>(() => {});
  const toLoadStr = gzip
    ? pako.ungzip(savedState as Uint8Array, { to: "string" })
    : (savedState as string);
  loader.load(toLoadStr);

  console.log(
    `- Load time ${gzip ? "GZIP'd " : ""}(ms):`,
    Math.round(
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
    )
  );

  return savedState;
}

async function memory(
  CRDT: typeof PositionCRDT | typeof LexPositionCRDT,
  savedState: string
) {
  // Measure memory usage of loading the saved state.

  // Pause (& separate function)seems to make GC more consistent -
  // less likely to get negative diffs.
  await sleep(1000);
  const startMem = getMemUsed();

  const loader = new CRDT<string>(() => {});
  loader.load(savedState);

  console.log(
    "- Mem used (MB):",
    ((getMemUsed() - startMem) / 1000000).toFixed(1)
  );

  // Keep stuff in scope so we don't accidentally subtract its memory usage.
  void loader;
  void savedState;
}
