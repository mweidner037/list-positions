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
    "## Run:",
    ops ?? "all",
    "ops; rotate",
    rotateFreq ? `every ${rotateFreq} ops` : "never"
  );
  console.log();

  const rng = seedrandom("42");
  let source = new PositionSource({
    ID: IDs.pseudoRandom(rng),
  });
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
  // Note that collecting stats increases the runtime.
  printStats(
    "length",
    metrics.map((metric) => metric.length)
  );
  printStats(
    "longNames",
    metrics.map((metric) => metric.longNames)
  );
  printStats(
    "waypoints",
    metrics.map((metric) => metric.waypoints)
  );
  printStats(
    "innerIndex",
    metrics.map((metric) => metric.innerIndex)
  );

  // Estimate PositionSource memory usage.
  // @ts-expect-error Private access
  const lastValueSeqs = source.lastValueSeqs;
  const keyLengths = [...lastValueSeqs.keys()]
    .map((prefix) => prefix.length)
    .reduce((a, b) => a + b, 0);
  console.log("### PositionSource memory usage\n");
  console.log("- Map size:", lastValueSeqs.size);
  console.log("- Sum of map key lengths:", keyLengths);
  console.log();

  // Write data files.
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
  const fileName = `results_${ops ?? "all"}_${rotateFreq ?? "never"}.csv`;
  const csv =
    "length,longNames,waypoints,innerIndex\n" +
    metrics
      .map(
        (metric) =>
          `${metric.length},${metric.longNames},${metric.waypoints},${metric.innerIndex}`
      )
      .join("\n");
  fs.writeFileSync(resultsDir + fileName, csv);
}

/**
 * Data for a single position string.
 */
interface PositionMetric {
  /** The position's length. */
  length: number;
  /**
   * The number of waypoints using long names.
   * Equivalently, the number of full IDs in the string.
   */
  longNames: number;
  /** The total number of waypoints. */
  waypoints: number;
  /**
   * The innerIndex. This is the normal, 0-indexed count of values
   * in a row, not the valueSeq.
   */
  innerIndex: number;
}

function getLastWaypointChar(position: string): number {
  // Last waypoint char is the last '.' or digit.
  // We know it's not the very last char (always a valueSeq).
  for (let i = position.length - 2; i >= 0; i--) {
    const char = position[i];
    if (char === "." || ("0" <= char && char <= "9")) {
      // i is the last waypoint char, i.e., the end of the prefix.
      return i;
    }
  }
  throw new Error("lastWaypointChar not found: " + position);
}

function parseBase52(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const digit = code - (code >= 97 ? 71 : 65);
    n = 52 * n + digit;
  }
  return n;
}

function getMetric(position: string): PositionMetric {
  // longNames = # periods, since we end each ID with one.
  let periods = 0;
  for (const char of position) {
    if (char === ".") periods++;
  }
  const longNames = periods;

  // Get valueSeq: after last waypoint char.
  const lastWaypointChar = getLastWaypointChar(position);
  const valueSeq = parseBase52(position.slice(lastWaypointChar + 1));

  return {
    length: position.length,
    longNames,
    waypoints: waypointCount(position),
    innerIndex: innerIndexFromSeq(valueSeq),
  };
}

function waypointCount(position: string): number {
  // One waypoint per:
  // - '.' (end of a long name)
  // - Digit outside of a long name
  // (end of a short name).
  let inLongName = false;
  let count = 0;
  for (let i = position.length - 1; i >= 0; i--) {
    const char = position[i];
    if (char === ".") {
      // End of a long name.
      count++;
      // Skip the rest of the long name in case in contains
      // a non-short-name digit.
      inLongName = true;
    } else if (inLongName) {
      if (char === ",") inLongName = false;
    } else if ("0" <= char && char <= "9") count++;
  }
  return count;
}

/**
 * Returns the innerIndex corresponding to the (odd) valueSeq n.
 */
function innerIndexFromSeq(n: number): number {
  const d = n === 0 ? 1 : Math.floor(Math.log(n) / Math.log(52)) + 1;
  // First d-digit number is 52^d - 52 * 26^(d-1); check how far
  // we are from there (= index in d-digit sequence)
  let ans = n - (Math.pow(52, d) - 52 * Math.pow(26, d - 1));
  // Previous digits d2 get 26^d2 digits each.
  for (let d2 = 1; d2 < d; d2++) {
    ans += Math.pow(26, d2);
  }
  // Sequence uses odds only, so discount that.
  return (ans - 1) / 2;
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

// In the order described in README.md#performance.
run();
run(undefined, 1000);
run(10000);
run(10000, 1000);
