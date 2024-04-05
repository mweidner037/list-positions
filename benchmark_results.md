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

- Sender time (ms): 648
- Avg update size (bytes): 86.8
- Receiver time (ms): 388
- Save time (ms): 10
- Save size (bytes): 804020
- Load time (ms): 18
- Save time GZIP'd (ms): 115
- Save size GZIP'd (bytes): 88991
- Load time GZIP'd (ms): 39
- Mem used (MB): 2.2

## LexList Direct

Use `LexList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1521
- Avg update size (bytes): 267.1
- LexPosition length stats: avg = 239.1, percentiles [25, 50, 75, 100] = 191,224,280,479
- Receiver time (ms): 676
- Save time (ms): 17
- Save size (bytes): 1043918
- Load time (ms): 34
- Save time GZIP'd (ms): 87
- Save size GZIP'd (bytes): 84240
- Load time GZIP'd (ms): 48
- Mem used (MB): 2.3

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use a custom string encoding; saved states use JSON with optional GZIP.

- Sender time (ms): 522
- Avg update size (bytes): 31.2
- Receiver time (ms): 347
- Save time (ms): 6
- Save size (bytes): 804020
- Load time (ms): 11
- Save time GZIP'd (ms): 77
- Save size GZIP'd (bytes): 88984
- Load time GZIP'd (ms): 34
- Mem used (MB): 2.2

## Text Direct

Use `Text` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 709
- Avg update size (bytes): 86.8
- Receiver time (ms): 459
- Save time (ms): 7
- Save size (bytes): 493835
- Load time (ms): 10
- Save time GZIP'd (ms): 68
- Save size GZIP'd (bytes): 71576
- Load time GZIP'd (ms): 23
- Mem used (MB): 1.4

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 654
- Avg update size (bytes): 78.4
- Receiver time (ms): 379
- Save time (ms): 5
- Save size (bytes): 382419
- Load time (ms): 8
- Save time GZIP'd (ms): 51
- Save size GZIP'd (bytes): 38302
- Load time GZIP'd (ms): 21
- Mem used (MB): 1.3

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 692
- Avg update size (bytes): 86.8
- Receiver time (ms): 451
- Save time (ms): 7
- Save size (bytes): 804030
- Load time (ms): 14
- Save time GZIP'd (ms): 129
- Save size GZIP'd (bytes): 88996
- Load time GZIP'd (ms): 46
- Mem used (MB): 2.5

## LexPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses LexPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1553
- Avg update size (bytes): 267.1
- Receiver time (ms): 597
- Save time (ms): 9
- Save size (bytes): 804030
- Load time (ms): 10
- Save time GZIP'd (ms): 77
- Save size GZIP'd (bytes): 88997
- Load time GZIP'd (ms): 35
- Mem used (MB): 2.4
