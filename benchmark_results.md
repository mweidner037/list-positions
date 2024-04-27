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

- Sender time (ms): 627
- Avg update size (bytes): 86.8
- Receiver time (ms): 343
- Save time (ms): 8
- Save size (bytes): 804020
- Load time (ms): 17
- Save time GZIP'd (ms): 78
- Save size GZIP'd (bytes): 88988
- Load time GZIP'd (ms): 42
- Mem used (MB): 2.4

## AbsList Direct

Use `AbsList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1520
- Avg update size (bytes): 216.2
- AbsPosition length stats: avg = 187.4, percentiles [25, 50, 75, 100] = 170,184,202,272
- Receiver time (ms): 747
- Save time (ms): 16
- Save size (bytes): 868579
- Load time (ms): 19
- Save time GZIP'd (ms): 79
- Save size GZIP'd (bytes): 85360
- Load time GZIP'd (ms): 36
- Mem used (MB): 2.3

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use a custom string encoding; saved states use JSON with optional GZIP.

- Sender time (ms): 528
- Avg update size (bytes): 31.2
- Receiver time (ms): 300
- Save time (ms): 8
- Save size (bytes): 804020
- Load time (ms): 11
- Save time GZIP'd (ms): 66
- Save size GZIP'd (bytes): 88989
- Load time GZIP'd (ms): 30
- Mem used (MB): 2.3

## Text Direct

Use `Text` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 618
- Avg update size (bytes): 86.8
- Receiver time (ms): 401
- Save time (ms): 5
- Save size (bytes): 493835
- Load time (ms): 8
- Save time GZIP'd (ms): 47
- Save size GZIP'd (bytes): 71570
- Load time GZIP'd (ms): 22
- Mem used (MB): 1.3

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 591
- Avg update size (bytes): 78.4
- Receiver time (ms): 344
- Save time (ms): 5
- Save size (bytes): 382419
- Load time (ms): 7
- Save time GZIP'd (ms): 37
- Save size GZIP'd (bytes): 38310
- Load time GZIP'd (ms): 18
- Mem used (MB): 1.2

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 630
- Avg update size (bytes): 86.8
- Receiver time (ms): 400
- Save time (ms): 12
- Save size (bytes): 909990
- Load time (ms): 16
- Save time GZIP'd (ms): 73
- Save size GZIP'd (bytes): 101895
- Load time GZIP'd (ms): 33
- Mem used (MB): 2.7

## AbsPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses AbsPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1494
- Avg update size (bytes): 216.2
- Receiver time (ms): 735
- Save time (ms): 14
- Save size (bytes): 909990
- Load time (ms): 12
- Save time GZIP'd (ms): 73
- Save size GZIP'd (bytes): 101903
- Load time GZIP'd (ms): 31
- Mem used (MB): 2.5
