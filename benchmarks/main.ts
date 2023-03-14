import { assert } from "chai";
import fs from "fs";
import createRBTree from "functional-red-black-tree";
import seedrandom from "seedrandom";
import { IDs, PositionSource } from "../src";
import realTextTraceEdits from "./real_text_trace_edits.json";

const resultsDir = "benchmark_results/";

const { edits, finalText } = realTextTraceEdits as unknown as {
  finalText: string;
  edits: Array<[number, number, string | undefined]>;
};

function run(rotateFreq?: number) {
  console.log("Run", rotateFreq);

  const rng = seedrandom("42");
  let source = new PositionSource({ ID: IDs.pseudoRandom(rng) });
  let list = createRBTree<string, string>();
  // In order of creation, so we can watch time trends.
  const lengths: number[] = [];

  for (let i = 0; i < edits.length; i++) {
    if (rotateFreq && i > 0 && i % rotateFreq === 0) {
      source = new PositionSource({ ID: IDs.pseudoRandom(rng) });
    }
    const edit = edits[i];
    if (edit[2] !== undefined) {
      // Insert edit[2] at edit[0]
      const position = source.createBetween(
        edit[0] === 0 ? undefined : list.at(edit[0] - 1).key,
        edit[0] === list.length ? undefined : list.at(edit[0]).key
      );
      list = list.insert(position, edit[2]);
      lengths.push(position.length);
    } else {
      // Delete character at edit[0].
      list = list.at(edit[0]).remove();
    }
  }

  // Check answer.
  assert.strictEqual(finalText, list.values.join(""));

  // Generate statistics.
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
  const fileName = rotateFreq ? `results_${rotateFreq}.csv` : "results.csv";
  fs.writeFileSync(resultsDir + fileName, lengths.join("\n"));
}

run();
run(1000);
