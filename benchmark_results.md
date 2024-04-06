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

- Sender time (ms): 650
- Avg update size (bytes): 86.8
- Receiver time (ms): 392
- Save time (ms): 8
- Save size (bytes): 804020
- Load time (ms): 19
- Save time GZIP'd (ms): 116
- Save size GZIP'd (bytes): 88987
- Load time GZIP'd (ms): 40
- Mem used (MB): 2.4

## LexList Direct

Use `LexList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1488
- Avg update size (bytes): 267.1
- LexPosition length stats: avg = 239.1, percentiles [25, 50, 75, 100] = 191,224,280,479
- Receiver time (ms): 669
- Save time (ms): 16
- Save size (bytes): 1043918
- Load time (ms): 32
- Save time GZIP'd (ms): 86
- Save size GZIP'd (bytes): 84202
- Load time GZIP'd (ms): 45
- Mem used (MB): 2.4

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use a custom string encoding; saved states use JSON with optional GZIP.

- Sender time (ms): 553
- Avg update size (bytes): 31.2
- Receiver time (ms): 342
- Save time (ms): 6
- Save size (bytes): 804020
- Load time (ms): 11
- Save time GZIP'd (ms): 87
- Save size GZIP'd (bytes): 88984
- Load time GZIP'd (ms): 33
- Mem used (MB): 2.2

## Text Direct

Use `Text` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 706
- Avg update size (bytes): 86.8
- Receiver time (ms): 467
- Save time (ms): 6
- Save size (bytes): 493835
- Load time (ms): 12
- Save time GZIP'd (ms): 68
- Save size GZIP'd (bytes): 71575
- Load time GZIP'd (ms): 23
- Mem used (MB): 1.5

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 667
- Avg update size (bytes): 78.4
- Receiver time (ms): 393
- Save time (ms): 4
- Save size (bytes): 382419
- Load time (ms): 9
- Save time GZIP'd (ms): 52
- Save size GZIP'd (bytes): 38305
- Load time GZIP'd (ms): 19
- Mem used (MB): 1.3

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 709
- Avg update size (bytes): 86.8
- Receiver time (ms): 463
- Save time (ms): 12
- Save size (bytes): 909990
- Load time (ms): 17
- Save time GZIP'd (ms): 89
- Save size GZIP'd (bytes): 101901
- Load time GZIP'd (ms): 40
- Mem used (MB): 2.5

## LexPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses LexPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1545
- Avg update size (bytes): 267.1
- Receiver time (ms): 621
- Save time (ms): 8
- Save size (bytes): 909990
- Load time (ms): 20
- Save time GZIP'd (ms): 82
- Save size GZIP'd (bytes): 101899
- Load time GZIP'd (ms): 38
- Mem used (MB): 2.7
