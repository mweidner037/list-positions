# Benchmark Results
Output of
```bash
npm run benchmarks -s > benchmark_results.md
```
Each benchmark applies the [automerge-perf](https://github.com/automerge/automerge-perf) 260k edit text trace and measures various stats, modeled on [crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks/)' B4 experiment.

For perspective on the save sizes: the final text (excluding deleted chars) is 104,852 bytes, or 27556 bytes GZIP'd. It is ~15 pages of two-column text (in LaTeX).


## List Direct

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1006
- Avg update size (bytes): 73.5
- Receiver time (ms): 683
- Save time (ms): 7
- Save size (bytes): 689516
- Load time (ms): 17
- Save time GZIP'd (ms): 114
- Save size GZIP'd (bytes): 87356
- Load time GZIP'd (ms): 37
- Mem used (MB): 2.0

## LexList Direct

Use `LexList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1627
- Avg update size (bytes): 156.6
- LexPosition length stats: avg = 126.7, percentiles [25, 50, 75, 100] = 100,120,150,258
- Receiver time (ms): 895
- Save time (ms): 15
- Save size (bytes): 762273
- Load time (ms): 31
- Save time GZIP'd (ms): 81
- Save size GZIP'd (bytes): 79647
- Load time GZIP'd (ms): 39
- Mem used (MB): 2.0

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 1093
- Avg update size (bytes): 65.0
- Receiver time (ms): 818
- Save time (ms): 3
- Save size (bytes): 267915
- Load time (ms): 13
- Save time GZIP'd (ms): 48
- Save size GZIP'd (bytes): 36962
- Load time GZIP'd (ms): 16
- Mem used (MB): 1.1

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1134
- Avg update size (bytes): 73.5
- Receiver time (ms): 1091
- Save time (ms): 8
- Save size (bytes): 752573
- Load time (ms): 15
- Save time GZIP'd (ms): 99
- Save size GZIP'd (bytes): 100014
- Load time GZIP'd (ms): 44
- Mem used (MB): 2.5

## LexPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses LexPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1739
- Avg update size (bytes): 156.6
- Receiver time (ms): 1133
- Save time (ms): 8
- Save size (bytes): 752573
- Load time (ms): 14
- Save time GZIP'd (ms): 79
- Save size GZIP'd (bytes): 100014
- Load time GZIP'd (ms): 43
- Mem used (MB): 2.6
