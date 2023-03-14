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

function run(ops?: number, rotateFreq?: number) {
  console.log(
    "\nRun:",
    ops ?? "all",
    "ops; rotate",
    rotateFreq ? `every ${rotateFreq} ops` : "never"
  );

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
  printStats(
    "length",
    metrics.map((metric) => metric.length)
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
  const fileName = rotateFreq ? `results_${rotateFreq}.csv` : "results.csv";
  const csv =
    "Length,Nodes,ValueIndexCount\n" +
    metrics
      .map(
        (metric) => `${metric.length},${metric.nodes},${metric.valueIndexCount}`
      )
      .join("\n");
  fs.writeFileSync(resultsDir + fileName, csv);
}

interface PositionMetric {
  length: number;
  nodes: number;
  valueIndexCount: number;
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
  const valueIndex = Number.parseInt(position.slice(lastComma + 1, -1));

  return {
    length: position.length,
    nodes,
    valueIndexCount: lexSuccCount(valueIndex),
  };
}

/**
 * Returns n's index in the lexSucc output sequence.
 */
function lexSuccCount(n: number): number {
  const d = n === 0 ? 1 : Math.floor(Math.log10(n)) + 1;
  // First d-digit number is 10^d - 10 * 9^(d-1); check how far
  // we are from there (= index in d-digit sequence)
  let ans = n - (Math.pow(10, d) - 10 * Math.pow(9, d - 1));
  // Previous digits d2 get 9^(d2-1) digits each.
  for (let d2 = 1; d2 < d; d2++) {
    ans += Math.pow(9, d2 - 1);
  }
  return ans;
}

function printStats(name: string, data: number[]) {
  console.log(`${name} statistics:`);
  console.log(
    "\tAverage:",
    Math.round(data.reduce((a, b) => a + b, 0) / data.length)
  );
  data.sort((a, b) => a - b);
  console.log("\tMedian:", percentile(data, 0.5));
  console.log("\t99th percentile:", percentile(data, 0.99));
  console.log("\tMax:", percentile(data, 1));
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
