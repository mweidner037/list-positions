import { crdt } from "./crdt";
import { LexPositionCRDT } from "./internal/lex_position_crdt";
import { PositionCRDT } from "./internal/position_crdt";
import { lexListDirect } from "./lex_list_direct";
import { listDirect } from "./list_direct";
import { outlineDirect } from "./outline_direct";

(async function () {
  console.log("# Benchmark Results");
  console.log(
    "Output of\n```bash\nnpm run benchmarks -s > benchmark_results.md\n```"
  );

  await listDirect();
  await lexListDirect();
  await outlineDirect();
  await crdt(PositionCRDT);
  await crdt(LexPositionCRDT);
})();
