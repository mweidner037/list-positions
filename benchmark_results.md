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

- Sender time (ms): 623
- Avg update size (bytes): 86.8
- Receiver time (ms): 342
- Save time (ms): 9
- Save size (bytes): 804020
- Load time (ms): 14
- Save time GZIP'd (ms): 54
- Save size GZIP'd (bytes): 89118
- Load time GZIP'd (ms): 36
- Mem used estimate (MB): 2.2

## AbsList Direct

Use `AbsList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1504
- Avg update size (bytes): 216.2
- AbsPosition length stats: avg = 187.4, percentiles [25, 50, 75, 100] = 170,184,202,272
- Receiver time (ms): 739
- Save time (ms): 15
- Save size (bytes): 868579
- Load time (ms): 19
- Save time GZIP'd (ms): 64
- Save size GZIP'd (bytes): 87086
- Load time GZIP'd (ms): 44
- Mem used estimate (MB): 2.1

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use a custom string encoding; saved states use JSON with optional GZIP.

- Sender time (ms): 509
- Avg update size (bytes): 31.2
- Receiver time (ms): 299
- Save time (ms): 8
- Save size (bytes): 804020
- Load time (ms): 11
- Save time GZIP'd (ms): 49
- Save size GZIP'd (bytes): 89113
- Load time GZIP'd (ms): 36
- Mem used estimate (MB): 2.2

## Text Direct

Use `Text` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 619
- Avg update size (bytes): 86.8
- Receiver time (ms): 389
- Save time (ms): 5
- Save size (bytes): 493835
- Load time (ms): 8
- Save time GZIP'd (ms): 36
- Save size GZIP'd (bytes): 73737
- Load time GZIP'd (ms): 22
- Mem used estimate (MB): 1.3

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 587
- Avg update size (bytes): 78.4
- Receiver time (ms): 326
- Save time (ms): 5
- Save size (bytes): 382419
- Load time (ms): 7
- Save time GZIP'd (ms): 24
- Save size GZIP'd (bytes): 39367
- Load time GZIP'd (ms): 14
- Mem used estimate (MB): 1.2

## TextCrdt

Use a hybrid op-based/state-based CRDT implemented on top of the library's data structures, copied from [@list-positions/crdts](https://github.com/mweidner037/list-positions-crdts).
This variant uses a Text + PositionSet to store the state and Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 655
- Avg update size (bytes): 92.7
- Receiver time (ms): 369
- Save time (ms): 11
- Save size (bytes): 599817
- Load time (ms): 10
- Save time GZIP'd (ms): 42
- Save size GZIP'd (bytes): 87006
- Load time GZIP'd (ms): 30
- Mem used estimate (MB): 1.8

## ListCrdt

Use a hybrid op-based/state-based CRDT implemented on top of the library's data structures, copied from [@list-positions/crdts](https://github.com/mweidner037/list-positions-crdts).
This variant uses a List of characters + PositionSet to store the state and Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 701
- Avg update size (bytes): 94.8
- Receiver time (ms): 472
- Save time (ms): 13
- Save size (bytes): 910002
- Load time (ms): 21
- Save time GZIP'd (ms): 64
- Save size GZIP'd (bytes): 102650
- Load time GZIP'd (ms): 35
- Mem used estimate (MB): 2.5
