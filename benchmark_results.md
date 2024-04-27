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
- Avg update size (bytes): 86.8
- Receiver time (ms): 349
- Save time (ms): 8
- Save size (bytes): 804020
- Load time (ms): 20
- Save time GZIP'd (ms): 81
- Save size GZIP'd (bytes): 88986
- Load time GZIP'd (ms): 38
- Mem used (MB): 2.3

## AbsList Direct

Use `AbsList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1515
- Avg update size (bytes): 216.2
- AbsPosition length stats: avg = 187.4, percentiles [25, 50, 75, 100] = 170,184,202,272
- Receiver time (ms): 743
- Save time (ms): 17
- Save size (bytes): 868579
- Load time (ms): 20
- Save time GZIP'd (ms): 75
- Save size GZIP'd (bytes): 85361
- Load time GZIP'd (ms): 36
- Mem used (MB): 2.1

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use a custom string encoding; saved states use JSON with optional GZIP.

- Sender time (ms): 504
- Avg update size (bytes): 31.2
- Receiver time (ms): 301
- Save time (ms): 8
- Save size (bytes): 804020
- Load time (ms): 11
- Save time GZIP'd (ms): 66
- Save size GZIP'd (bytes): 88991
- Load time GZIP'd (ms): 32
- Mem used (MB): 2.4

## Text Direct

Use `Text` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 623
- Avg update size (bytes): 86.8
- Receiver time (ms): 401
- Save time (ms): 6
- Save size (bytes): 493835
- Load time (ms): 8
- Save time GZIP'd (ms): 46
- Save size GZIP'd (bytes): 71571
- Load time GZIP'd (ms): 24
- Mem used (MB): 1.3

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 609
- Avg update size (bytes): 78.4
- Receiver time (ms): 339
- Save time (ms): 5
- Save size (bytes): 382419
- Load time (ms): 7
- Save time GZIP'd (ms): 38
- Save size GZIP'd (bytes): 38304
- Load time GZIP'd (ms): 18
- Mem used (MB): 1.2

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 639
- Avg update size (bytes): 86.8
- Receiver time (ms): 404
- Save time (ms): 12
- Save size (bytes): 909990
- Load time (ms): 14
- Save time GZIP'd (ms): 74
- Save size GZIP'd (bytes): 101901
- Load time GZIP'd (ms): 30
- Mem used (MB): 2.7

## AbsPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses AbsPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1515
- Avg update size (bytes): 216.2
- Receiver time (ms): 722
- Save time (ms): 13
- Save size (bytes): 909990
- Load time (ms): 13
- Save time GZIP'd (ms): 80
- Save size GZIP'd (bytes): 101899
- Load time GZIP'd (ms): 36
- Mem used (MB): 2.5
