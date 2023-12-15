# Benchmark Results
Output of
```bash
npm run benchmarks -s > benchmark_results.md
```

## List Direct

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use plain JSON encoding; saved states use plain JSON encoding.

- Sender time (ms): 1186
- Avg update size (bytes): 73.5
- Receiver time (ms): 767
- Save time (ms): 9
- Save size (bytes): 689516
- Load time (ms): 36
- Mem used (MB): 2.1

## List Direct - Gzip

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use plain JSON encoding; saved states use gzip'd JSON encoding.

- Sender time (ms): 1224
- Avg update size (bytes): 73.5
- Receiver time (ms): 853
- Save time (ms): 133
- Save size (bytes): 87358
- Load time (ms): 57
- Mem used (MB): 2.4

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates use plain JSON encoding; saved states use plain JSON encoding.
Neither updates nor saved states include values (chars).

- Sender time (ms): 1111
- Avg update size (bytes): 65.0
- Receiver time (ms): 858
- Save time (ms): 5
- Save size (bytes): 267918
- Load time (ms): 21
- Mem used (MB): 1.0

## Outline Direct - Gzip

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates use plain JSON encoding; saved states use gzip'd JSON encoding.
Neither updates nor saved states include values (chars).

- Sender time (ms): 1094
- Avg update size (bytes): 65.0
- Receiver time (ms): 819
- Save time (ms): 56
- Save size (bytes): 36974
- Load time (ms): 49
- Mem used (MB): 1.1

## LexList Direct

Use `LexList` and send updates directly over a reliable link (e.g. WebSocket).
Updates use plain JSON encoding; saved states use plain JSON encoding.

- Sender time (ms): 1999
- Avg update size (bytes): 156.6
- LexPosition length stats: avg = 126.7, percentiles [25, 50, 75, 100] = 100,120,150,258
- Receiver time (ms): 1070
- Save time (ms): 15
- Save size (bytes): 762273
- Load time (ms): 56
- Mem used (MB): 2.0

## LexList Direct - Gzip

Use `LexList` and send updates directly over a reliable link (e.g. WebSocket).
Updates use plain JSON encoding; saved states use gzip'd JSON encoding.

- Sender time (ms): 2010
- Avg update size (bytes): 156.6
- LexPosition length stats: avg = 126.7, percentiles [25, 50, 75, 100] = 100,120,150,258
- Receiver time (ms): 1018
- Save time (ms): 101
- Save size (bytes): 79647
- Load time (ms): 74
- Mem used (MB): 2.0
