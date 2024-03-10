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

- Sender time (ms): 631
- Avg update size (bytes): 73.5
- Receiver time (ms): 371
- Save time (ms): 9
- Save size (bytes): 689516
- Load time (ms): 18
- Save time GZIP'd (ms): 113
- Save size GZIP'd (bytes): 87357
- Load time GZIP'd (ms): 38
- Mem used (MB): 2.2

## LexList Direct

Use `LexList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1289
- Avg update size (bytes): 156.6
- LexPosition length stats: avg = 126.7, percentiles [25, 50, 75, 100] = 100,120,150,258
- Receiver time (ms): 572
- Save time (ms): 13
- Save size (bytes): 762273
- Load time (ms): 30
- Save time GZIP'd (ms): 84
- Save size GZIP'd (bytes): 79647
- Load time GZIP'd (ms): 41
- Mem used (MB): 2.1

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 646
- Avg update size (bytes): 65.0
- Receiver time (ms): 368
- Save time (ms): 5
- Save size (bytes): 267915
- Load time (ms): 9
- Save time GZIP'd (ms): 49
- Save size GZIP'd (bytes): 36969
- Load time GZIP'd (ms): 17
- Mem used (MB): 1.3

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 672
- Avg update size (bytes): 73.5
- Receiver time (ms): 547
- Save time (ms): 13
- Save size (bytes): 752573
- Load time (ms): 19
- Save time GZIP'd (ms): 98
- Save size GZIP'd (bytes): 100022
- Load time GZIP'd (ms): 44
- Mem used (MB): 2.7

## LexPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses LexPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1328
- Avg update size (bytes): 156.6
- Receiver time (ms): 581
- Save time (ms): 9
- Save size (bytes): 752573
- Load time (ms): 13
- Save time GZIP'd (ms): 81
- Save size GZIP'd (bytes): 100029
- Load time GZIP'd (ms): 42
- Mem used (MB): 2.8
