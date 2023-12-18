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
  console.log(
    "Each benchmark applies the [automerge-perf](https://github.com/automerge/automerge-perf) 260k edit text trace and measures various stats, modeled on [crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks/)' B4 experiment.\n"
  );
  console.log(
    "For perspective on the save sizes: the final text (excluding deleted chars) is 104,852 bytes, or 27556 bytes GZIP'd. It is ~15 pages of two-column text (in LaTeX).\n"
  );

  await listDirect();
  await lexListDirect();
  await outlineDirect();
  await crdt(PositionCRDT);
  await crdt(LexPositionCRDT);
})();
