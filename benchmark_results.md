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

- Sender time (ms): 622
- Avg update size (bytes): 86.8
- Receiver time (ms): 337
- Save time (ms): 8
- Save size (bytes): 804020
- Load time (ms): 14
- Save time GZIP'd (ms): 80
- Save size GZIP'd (bytes): 88983
- Load time GZIP'd (ms): 38
- Mem used estimate (MB): 2.3

## AbsList Direct

Use `AbsList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1490
- Avg update size (bytes): 216.2
- AbsPosition length stats: avg = 187.4, percentiles [25, 50, 75, 100] = 170,184,202,272
- Receiver time (ms): 756
- Save time (ms): 16
- Save size (bytes): 868579
- Load time (ms): 19
- Save time GZIP'd (ms): 75
- Save size GZIP'd (bytes): 85361
- Load time GZIP'd (ms): 35
- Mem used estimate (MB): 2.1

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use a custom string encoding; saved states use JSON with optional GZIP.

- Sender time (ms): 527
- Avg update size (bytes): 31.2
- Receiver time (ms): 368
- Save time (ms): 8
- Save size (bytes): 804020
- Load time (ms): 12
- Save time GZIP'd (ms): 66
- Save size GZIP'd (bytes): 88987
- Load time GZIP'd (ms): 29
- Mem used estimate (MB): 2.4

## Text Direct

Use `Text` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 615
- Avg update size (bytes): 86.8
- Receiver time (ms): 415
- Save time (ms): 7
- Save size (bytes): 493835
- Load time (ms): 8
- Save time GZIP'd (ms): 46
- Save size GZIP'd (bytes): 71568
- Load time GZIP'd (ms): 20
- Mem used estimate (MB): 1.3

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 600
- Avg update size (bytes): 78.4
- Receiver time (ms): 333
- Save time (ms): 5
- Save size (bytes): 382419
- Load time (ms): 7
- Save time GZIP'd (ms): 36
- Save size GZIP'd (bytes): 38309
- Load time GZIP'd (ms): 18
- Mem used estimate (MB): 1.1

## TextCRDT

Use a hybrid op-based/state-based CRDT implemented on top of the library's data structures.
This variant uses a Text + PositionSet to store the state and Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 664
- Avg update size (bytes): 86.1
- Receiver time (ms): 412
- Save time (ms): 13
- Save size (bytes): 599805
- Load time (ms): 10
- Save time GZIP'd (ms): 42
- Save size GZIP'd (bytes): 84347
- Load time GZIP'd (ms): 27
- Mem used estimate (MB): 1.8

## AbsTextCRDT

Use a hybrid op-based/state-based CRDT implemented on top of the library's data structures.
This variant uses a Text + PositionSet to store the state and AbsPositions in messages.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1396
- Avg update size (bytes): 215.5
- Receiver time (ms): 762
- Save time (ms): 9
- Save size (bytes): 599805
- Load time (ms): 10
- Save time GZIP'd (ms): 44
- Save size GZIP'd (bytes): 84347
- Load time GZIP'd (ms): 26
- Mem used estimate (MB): 1.8

## ListCRDT

Use a hybrid op-based/state-based CRDT implemented on top of the library's data structures.
This variant uses a List of characters + PositionSet to store the state and Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 681
- Avg update size (bytes): 86.8
- Receiver time (ms): 426
- Save time (ms): 11
- Save size (bytes): 909990
- Load time (ms): 13
- Save time GZIP'd (ms): 169
- Save size GZIP'd (bytes): 101901
- Load time GZIP'd (ms): 41
- Mem used estimate (MB): 2.4
