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

- Sender time (ms): 618
- Avg update size (bytes): 86.8
- Receiver time (ms): 344
- Save time (ms): 10
- Save size (bytes): 804020
- Load time (ms): 17
- Save time GZIP'd (ms): 79
- Save size GZIP'd (bytes): 88990
- Load time GZIP'd (ms): 41
- Mem used estimate (MB): 2.2

## AbsList Direct

Use `AbsList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1495
- Avg update size (bytes): 216.2
- AbsPosition length stats: avg = 187.4, percentiles [25, 50, 75, 100] = 170,184,202,272
- Receiver time (ms): 791
- Save time (ms): 14
- Save size (bytes): 868579
- Load time (ms): 19
- Save time GZIP'd (ms): 78
- Save size GZIP'd (bytes): 85361
- Load time GZIP'd (ms): 37
- Mem used estimate (MB): 2.1

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use a custom string encoding; saved states use JSON with optional GZIP.

- Sender time (ms): 505
- Avg update size (bytes): 31.2
- Receiver time (ms): 303
- Save time (ms): 8
- Save size (bytes): 804020
- Load time (ms): 11
- Save time GZIP'd (ms): 66
- Save size GZIP'd (bytes): 88985
- Load time GZIP'd (ms): 34
- Mem used estimate (MB): 2.3

## Text Direct

Use `Text` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 648
- Avg update size (bytes): 86.8
- Receiver time (ms): 510
- Save time (ms): 6
- Save size (bytes): 493835
- Load time (ms): 10
- Save time GZIP'd (ms): 43
- Save size GZIP'd (bytes): 71570
- Load time GZIP'd (ms): 22
- Mem used estimate (MB): 1.4

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 602
- Avg update size (bytes): 78.4
- Receiver time (ms): 344
- Save time (ms): 5
- Save size (bytes): 382419
- Load time (ms): 7
- Save time GZIP'd (ms): 37
- Save size GZIP'd (bytes): 38309
- Load time GZIP'd (ms): 18
- Mem used estimate (MB): 1.2

## TextCrdt

Use a hybrid op-based/state-based CRDT implemented on top of the library's data structures.
This variant uses a Text + PositionSet to store the state and Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 771
- Avg update size (bytes): 92.7
- Receiver time (ms): 387
- Save time (ms): 12
- Save size (bytes): 599817
- Load time (ms): 10
- Save time GZIP'd (ms): 48
- Save size GZIP'd (bytes): 84364
- Load time GZIP'd (ms): 30
- Mem used estimate (MB): 1.8

## ListCrdt

Use a hybrid op-based/state-based CRDT implemented on top of the library's data structures.
This variant uses a List of characters + PositionSet to store the state and Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 712
- Avg update size (bytes): 94.8
- Receiver time (ms): 472
- Save time (ms): 14
- Save size (bytes): 910002
- Load time (ms): 14
- Save time GZIP'd (ms): 87
- Save size GZIP'd (bytes): 101911
- Load time GZIP'd (ms): 34
- Mem used estimate (MB): 2.6
