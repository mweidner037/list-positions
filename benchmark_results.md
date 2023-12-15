# Benchmark Results
To generate this file:
```bash
npm run benchmarks -s > benchmark_results.md
```

## List Direct

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use plain JSON encoding; saved states use plain JSON encoding.

- Sender time (ms): 1229
- Avg update size (bytes): 73.5
- Receiver time (ms): 835
- Save time (ms): 9
- Save size (bytes): 689516
- Load time (ms): 27
- Mem used (MB): 2.1

## List Direct - Gzip

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use plain JSON encoding; saved states use gzip'd JSON encoding.

- Sender time (ms): 1274
- Avg update size (bytes): 73.5
- Receiver time (ms): 871
- Save time (ms): 142
- Save size (bytes): 87357
- Load time (ms): 55
- Mem used (MB): 2.4
