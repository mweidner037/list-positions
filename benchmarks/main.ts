import { lexListDirect } from "./lex_list_direct";
import { listDirect } from "./list_direct";
import { outlineDirect } from "./outline_direct";

(async function () {
  console.log("# Benchmark Results");
  console.log(
    "Output of\n```bash\nnpm run benchmarks -s > benchmark_results.md\n```"
  );

  await listDirect();
  await outlineDirect();
  await lexListDirect();
})();
