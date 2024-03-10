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

- Sender time (ms): 634
- Avg update size (bytes): 73.5
- Receiver time (ms): 376
- Save time (ms): 8
- Save size (bytes): 689516
- Load time (ms): 18
- Save time GZIP'd (ms): 114
- Save size GZIP'd (bytes): 87356
- Load time GZIP'd (ms): 37
- Mem used (MB): 2.2

## LexList Direct

Use `LexList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1250
- Avg update size (bytes): 156.6
- LexPosition length stats: avg = 126.7, percentiles [25, 50, 75, 100] = 100,120,150,258
- Receiver time (ms): 580
- Save time (ms): 15
- Save size (bytes): 762273
- Load time (ms): 28
- Save time GZIP'd (ms): 90
- Save size GZIP'd (bytes): 79652
- Load time GZIP'd (ms): 40
- Mem used (MB): 2.1

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use a custom string encoding, with optional GZIP for saved states.

- Sender time (ms): 503
- Avg update size (bytes): 18.0
- Receiver time (ms): 366
- Save time (ms): 6
- Save size (bytes): 689516
- Load time (ms): 13
- Save time GZIP'd (ms): 75
- Save size GZIP'd (bytes): 87358
- Load time GZIP'd (ms): 31
- Mem used (MB): 2.2

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 656
- Avg update size (bytes): 65.0
- Receiver time (ms): 411
- Save time (ms): 5
- Save size (bytes): 267915
- Load time (ms): 9
- Save time GZIP'd (ms): 48
- Save size GZIP'd (bytes): 36970
- Load time GZIP'd (ms): 17
- Mem used (MB): 1.5

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 676
- Avg update size (bytes): 73.5
- Receiver time (ms): 509
- Save time (ms): 10
- Save size (bytes): 752573
- Load time (ms): 20
- Save time GZIP'd (ms): 81
- Save size GZIP'd (bytes): 100020
- Load time GZIP'd (ms): 37
- Mem used (MB): 2.7

## LexPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses LexPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1188
- Avg update size (bytes): 156.6
- Receiver time (ms): 600
- Save time (ms): 8
- Save size (bytes): 752573
- Load time (ms): 15
- Save time GZIP'd (ms): 80
- Save size GZIP'd (bytes): 100017
- Load time GZIP'd (ms): 36
- Mem used (MB): 2.8
