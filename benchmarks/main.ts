import { assert } from "chai";
import fs from "fs";
import createRBTree from "functional-red-black-tree";
import pako from "pako";
import seedrandom from "seedrandom";
import { IDs, PositionSource } from "../src";
import realTextTraceEdits from "./real_text_trace_edits.json";

const resultsDir = "benchmark_results/";

const { edits, finalText } = realTextTraceEdits as unknown as {
  finalText: string;
  edits: Array<[number, number, string | undefined]>;
};

function run(ops?: number, rotateFreq?: number) {
  console.log(
    "## Run:",
    ops ?? "all",
    "ops; rotate",
    rotateFreq ? `every ${rotateFreq} ops` : "never"
  );
  console.log();

  const rng = seedrandom("42");
  let source = new PositionSource({ ID: IDs.pseudoRandom(rng) });
  let list = createRBTree<string, string>();
  // In order of creation, so we can watch time trends.
  const metrics: PositionMetric[] = [];

  for (let i = 0; i < (ops ?? edits.length); i++) {
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
      metrics.push(getMetric(position));
    } else {
      // Delete character at edit[0].
      list = list.at(edit[0]).remove();
    }
  }

  if (ops === undefined) {
    // Check answer.
    assert.strictEqual(finalText, list.values.join(""));
  }

  // Print summary stats.
  // Note: collecting & summarizing data contributes a noticable
  // fraction of the runtime.
  printStats(
    "length",
    metrics.map((metric) => metric.length)
  );
  printStats(
    "compressedLength",
    metrics.map((metric) => metric.compressedLength)
  );
  printStats(
    "nodes",
    metrics.map((metric) => metric.nodes)
  );
  printStats(
    "valueIndexCount",
    metrics.map((metric) => metric.valueIndexCount)
  );

  // Write data files.
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
  const fileName = `results_${ops ?? "all"}_${rotateFreq ?? "never"}.csv`;
  const csv =
    "Length,CompressedLength,Nodes,ValueIndexCount\n" +
    metrics
      .map(
        (metric) =>
          `${metric.length},${metric.compressedLength},${metric.nodes},${metric.valueIndexCount}`
      )
      .join("\n");
  fs.writeFileSync(resultsDir + fileName, csv);
}

interface PositionMetric {
  length: number;
  compressedLength: number;
  nodes: number;
  valueIndexCount: number;
}

function parseValueIndex(s: string): number {
  return Number.parseInt(s.toLowerCase(), 36);
}

function getMetric(position: string): PositionMetric {
  // Nodes = # commas / 2.
  let commas = 0;
  for (const char of position) {
    if (char === ",") commas++;
  }
  const nodes = commas / 2;
  // Get valueIndex: after last comma, before last R.
  const lastComma = position.lastIndexOf(",");
  const valueIndex = parseValueIndex(position.slice(lastComma + 1, -1));

  return {
    length: position.length,
    // Note: this deflate contributes > 75% of the runtime.
    // OPT: Write a faster compression algorithm that just dedupes IDs.
    compressedLength: pako.deflate(position).byteLength,
    nodes,
    valueIndexCount: lexSuccCount(valueIndex),
  };
}

/**
 * Returns n's index in the lexSucc output sequence.
 */
function lexSuccCount(n: number): number {
  const d = n === 0 ? 1 : Math.floor(Math.log(n) / Math.log(36)) + 1;
  // First d-digit number is 36^d - 36 * 18^(d-1); check how far
  // we are from there (= index in d-digit sequence)
  let ans = n - (Math.pow(36, d) - 36 * Math.pow(18, d - 1));
  // Previous digits d2 get 18^d2 digits each.
  for (let d2 = 1; d2 < d; d2++) {
    ans += Math.pow(18, d2);
  }
  return ans;
}

function printStats(name: string, data: number[]) {
  console.log(`### ${name}\n`);
  console.log(
    "- Average:",
    Math.round(data.reduce((a, b) => a + b, 0) / data.length)
  );
  data.sort((a, b) => a - b);
  console.log("- Median:", percentile(data, 0.5));
  console.log("- 99th percentile:", percentile(data, 0.99));
  console.log("- Max:", percentile(data, 1));
  console.log();
}

function percentile(sortedData: number[], alpha: number) {
  const index = Math.ceil(alpha * sortedData.length) - 1;
  return sortedData[index];
}

// In order of difficulty.
run(1000);
run(10000, 1000);
run();
run(undefined, 1000);
