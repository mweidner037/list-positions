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

- Sender time (ms): 659
- Avg update size (bytes): 73.5
- Receiver time (ms): 403
- Save time (ms): 10
- Save size (bytes): 689516
- Load time (ms): 20
- Save time GZIP'd (ms): 128
- Save size GZIP'd (bytes): 87358
- Load time GZIP'd (ms): 39
- Mem used (MB): 2.2

## LexList Direct

Use `LexList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1308
- Avg update size (bytes): 156.6
- LexPosition length stats: avg = 126.7, percentiles [25, 50, 75, 100] = 100,120,150,258
- Receiver time (ms): 618
- Save time (ms): 15
- Save size (bytes): 762273
- Load time (ms): 28
- Save time GZIP'd (ms): 86
- Save size GZIP'd (bytes): 79646
- Load time GZIP'd (ms): 40
- Mem used (MB): 2.3

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use a custom string encoding; saved states use JSON with optional GZIP.

- Sender time (ms): 540
- Avg update size (bytes): 18.0
- Receiver time (ms): 311
- Save time (ms): 6
- Save size (bytes): 689516
- Load time (ms): 11
- Save time GZIP'd (ms): 77
- Save size GZIP'd (bytes): 87357
- Load time GZIP'd (ms): 31
- Mem used (MB): 2.2

## Text Direct

Use `Text` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 711
- Avg update size (bytes): 73.5
- Receiver time (ms): 511
- Save time (ms): 7
- Save size (bytes): 379331
- Load time (ms): 10
- Save time GZIP'd (ms): 63
- Save size GZIP'd (bytes): 69756
- Load time GZIP'd (ms): 30
- Mem used (MB): 1.4

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 668
- Avg update size (bytes): 65.0
- Receiver time (ms): 379
- Save time (ms): 5
- Save size (bytes): 267915
- Load time (ms): 9
- Save time GZIP'd (ms): 51
- Save size GZIP'd (bytes): 36972
- Load time GZIP'd (ms): 25
- Mem used (MB): 1.3

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 783
- Avg update size (bytes): 73.5
- Receiver time (ms): 530
- Save time (ms): 14
- Save size (bytes): 752573
- Load time (ms): 18
- Save time GZIP'd (ms): 82
- Save size GZIP'd (bytes): 100013
- Load time GZIP'd (ms): 37
- Mem used (MB): 2.6

## LexPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses LexPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1365
- Avg update size (bytes): 156.6
- Receiver time (ms): 614
- Save time (ms): 8
- Save size (bytes): 752573
- Load time (ms): 16
- Save time GZIP'd (ms): 82
- Save size GZIP'd (bytes): 100014
- Load time GZIP'd (ms): 47
- Mem used (MB): 2.7
