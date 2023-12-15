import { assert } from "chai";
import pako from "pako";
import { LexList } from "../src";
import { ListCRDT } from "./list_crdt";
import realTextTraceEdits from "./real_text_trace_edits.json";
const { edits, finalText } = realTextTraceEdits as unknown as {
  finalText: string;
  edits: Array<[number, number, string | undefined]>;
};

(async function () {
  const messages: string[] = [];
  const crdt = new ListCRDT<string>((message) => messages.push(message));

  // Perform the whole trace.
  let startTime = process.hrtime.bigint();
  for (const edit of edits) {
    if (edit[2] !== undefined) {
      crdt.insertAt(edit[0], edit[2]);
    } else crdt.deleteAt(edit[0]);
  }
  const senderTimeMS = Math.round(
    new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
  );

  assert.strictEqual(crdt.list.slice().join(""), finalText);
  console.log("Sender time (ms):", senderTimeMS);
  const updateSizeBytes = messages
    .map((message) => message.length)
    .reduce((a, b) => a + b, 0);
  console.log("Update size (bytes):", updateSizeBytes);

  // Deliver all messages to another replica.
  const crdt2 = new ListCRDT<string>(() => {});
  startTime = process.hrtime.bigint();
  for (const message of messages) crdt2.receive(message);
  const receiverTimeMS = Math.round(
    new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
  );

  assert.strictEqual(crdt2.list.slice().join(""), finalText);
  console.log("Receiver time (ms):", receiverTimeMS);

  // TODO: memory. Node inspector says 2.75 MB retained.

  for (const gzip of [false, true]) {
    const desc = gzip ? "gzip " : "";

    // Save.
    startTime = process.hrtime.bigint();
    const savedState = crdt2.save();
    let savedStateGzip: Uint8Array | null = null;
    if (gzip) {
      savedStateGzip = pako.gzip(savedState);
    }
    const saveTimeMS = Math.round(
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
    );

    console.log("Save time " + desc + "(ms):", saveTimeMS);
    console.log(
      "Saved size " + desc + "(bytes):",
      gzip ? savedStateGzip!.byteLength : savedState.length
    );

    // Load.
    const crdt3 = new ListCRDT<string>(() => {});
    startTime = process.hrtime.bigint();
    if (gzip) {
      crdt3.load(pako.ungzip(savedStateGzip!, { to: "string" }));
    } else crdt3.load(savedState);
    const loadTimeMS = Math.round(
      new Number(process.hrtime.bigint() - startTime).valueOf() / 1000000
    );

    assert.strictEqual(crdt3.list.slice().join(""), finalText);
    console.log("Load time " + desc + "(ms):", loadTimeMS);
  }

  // LexPosition lengths.
  // TODO: also timing, message size, save size; check order.
  const lexList = new LexList<string>();
  let lengths: number[] = [];
  for (const edit of edits) {
    if (edit[2] !== undefined) {
      const [pos] = lexList.insertAt(edit[0], edit[2]);
      lengths.push(pos.length);
    } else lexList.deleteAt(edit[0]);
  }
  lengths.sort((a, b) => a - b);
  const sum = lengths.reduce((a, b) => a + b, 0);
  console.log(
    `LexList lengths: avg=${Math.round(sum / lengths.length)}, max=${lengths.at(
      -1
    )}, median=${lengths[Math.floor(lengths.length / 2)]}, total=${(
      sum / 1000000
    ).toFixed(1)}MB`
  );
})();
