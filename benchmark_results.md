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

- Sender time (ms): 633
- Avg update size (bytes): 86.8
- Receiver time (ms): 384
- Save time (ms): 10
- Save size (bytes): 804020
- Load time (ms): 18
- Save time GZIP'd (ms): 114
- Save size GZIP'd (bytes): 88985
- Load time GZIP'd (ms): 43
- Mem used (MB): 2.2

## LexList Direct

Use `LexList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1500
- Avg update size (bytes): 267.1
- LexPosition length stats: avg = 239.1, percentiles [25, 50, 75, 100] = 191,224,280,479
- Receiver time (ms): 663
- Save time (ms): 17
- Save size (bytes): 1043918
- Load time (ms): 33
- Save time GZIP'd (ms): 95
- Save size GZIP'd (bytes): 84203
- Load time GZIP'd (ms): 51
- Mem used (MB): 2.4

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use a custom string encoding; saved states use JSON with optional GZIP.

- Sender time (ms): 505
- Avg update size (bytes): 31.2
- Receiver time (ms): 328
- Save time (ms): 6
- Save size (bytes): 804020
- Load time (ms): 11
- Save time GZIP'd (ms): 77
- Save size GZIP'd (bytes): 88991
- Load time GZIP'd (ms): 33
- Mem used (MB): 2.2

## Text Direct

Use `Text` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 720
- Avg update size (bytes): 86.8
- Receiver time (ms): 508
- Save time (ms): 7
- Save size (bytes): 493835
- Load time (ms): 12
- Save time GZIP'd (ms): 72
- Save size GZIP'd (bytes): 71571
- Load time GZIP'd (ms): 23
- Mem used (MB): 1.5

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 681
- Avg update size (bytes): 78.4
- Receiver time (ms): 386
- Save time (ms): 5
- Save size (bytes): 382419
- Load time (ms): 9
- Save time GZIP'd (ms): 51
- Save size GZIP'd (bytes): 38308
- Load time GZIP'd (ms): 20
- Mem used (MB): 1.3

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 701
- Avg update size (bytes): 86.8
- Receiver time (ms): 529
- Save time (ms): 11
- Save size (bytes): 909990
- Load time (ms): 21
- Save time GZIP'd (ms): 81
- Save size GZIP'd (bytes): 101895
- Load time GZIP'd (ms): 41
- Mem used (MB): 2.7

## LexPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses LexPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1606
- Avg update size (bytes): 267.1
- Receiver time (ms): 676
- Save time (ms): 8
- Save size (bytes): 909990
- Load time (ms): 16
- Save time GZIP'd (ms): 87
- Save size GZIP'd (bytes): 101898
- Load time GZIP'd (ms): 38
- Mem used (MB): 2.8
