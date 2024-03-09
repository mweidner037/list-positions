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

- Sender time (ms): 705
- Avg update size (bytes): 73.5
- Receiver time (ms): 446
- Save time (ms): 8
- Save size (bytes): 689516
- Load time (ms): 17
- Save time GZIP'd (ms): 115
- Save size GZIP'd (bytes): 87357
- Load time GZIP'd (ms): 35
- Mem used (MB): 2.2

## LexList Direct

Use `LexList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1319
- Avg update size (bytes): 156.6
- LexPosition length stats: avg = 126.7, percentiles [25, 50, 75, 100] = 100,120,150,258
- Receiver time (ms): 648
- Save time (ms): 13
- Save size (bytes): 762273
- Load time (ms): 28
- Save time GZIP'd (ms): 80
- Save size GZIP'd (bytes): 79651
- Load time GZIP'd (ms): 38
- Mem used (MB): 2.1

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 855
- Avg update size (bytes): 65.0
- Receiver time (ms): 644
- Save time (ms): 4
- Save size (bytes): 267915
- Load time (ms): 8
- Save time GZIP'd (ms): 50
- Save size GZIP'd (bytes): 36974
- Load time GZIP'd (ms): 17
- Mem used (MB): 1.4

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 915
- Avg update size (bytes): 73.5
- Receiver time (ms): 815
- Save time (ms): 12
- Save size (bytes): 752573
- Load time (ms): 16
- Save time GZIP'd (ms): 97
- Save size GZIP'd (bytes): 100017
- Load time GZIP'd (ms): 34
- Mem used (MB): 2.7

## LexPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses LexPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1460
- Avg update size (bytes): 156.6
- Receiver time (ms): 788
- Save time (ms): 7
- Save size (bytes): 752573
- Load time (ms): 14
- Save time GZIP'd (ms): 79
- Save size GZIP'd (bytes): 100016
- Load time GZIP'd (ms): 49
- Mem used (MB): 2.7
