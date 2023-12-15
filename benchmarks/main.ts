import { listDirect } from "./list_direct";

(async function () {
  console.log("# Benchmark Results");
  console.log(
    "Output of\n```bash\nnpm run benchmarks -s > benchmark_results.md\n```"
  );

  await listDirect(false);
  await listDirect(true);
})();
