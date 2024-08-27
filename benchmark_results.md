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

- Sender time (ms): 671
- Avg update size (bytes): 86.8
- Receiver time (ms): 384
- Save time (ms): 8
- Save size (bytes): 803120
- Load time (ms): 17
- Save time GZIP'd (ms): 55
- Save size GZIP'd (bytes): 89013
- Load time GZIP'd (ms): 37
- Mem used estimate (MB): 2.2

## AbsList Direct

Use `AbsList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1576
- Avg update size (bytes): 216.2
- AbsPosition length stats: avg = 187.4, percentiles [25, 50, 75, 100] = 170,184,202,272
- Receiver time (ms): 791
- Save time (ms): 14
- Save size (bytes): 867679
- Load time (ms): 21
- Save time GZIP'd (ms): 63
- Save size GZIP'd (bytes): 87108
- Load time GZIP'd (ms): 46
- Mem used estimate (MB): 2.2

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use a custom string encoding; saved states use JSON with optional GZIP.

- Sender time (ms): 556
- Avg update size (bytes): 31.2
- Receiver time (ms): 357
- Save time (ms): 9
- Save size (bytes): 803120
- Load time (ms): 11
- Save time GZIP'd (ms): 47
- Save size GZIP'd (bytes): 89021
- Load time GZIP'd (ms): 36
- Mem used estimate (MB): 2.2

## Text Direct

Use `Text` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 693
- Avg update size (bytes): 86.8
- Receiver time (ms): 444
- Save time (ms): 5
- Save size (bytes): 492935
- Load time (ms): 8
- Save time GZIP'd (ms): 35
- Save size GZIP'd (bytes): 73709
- Load time GZIP'd (ms): 24
- Mem used estimate (MB): 1.4

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 648
- Avg update size (bytes): 78.4
- Receiver time (ms): 365
- Save time (ms): 6
- Save size (bytes): 382419
- Load time (ms): 7
- Save time GZIP'd (ms): 24
- Save size GZIP'd (bytes): 39364
- Load time GZIP'd (ms): 13
- Mem used estimate (MB): 1.1

## TextCrdt

Use a hybrid op-based/state-based CRDT implemented on top of the library's data structures, copied from [@list-positions/crdts](https://github.com/mweidner037/list-positions-crdts).
This variant uses a Text + PositionSet to store the state and Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 722
- Avg update size (bytes): 92.7
- Receiver time (ms): 416
- Save time (ms): 11
- Save size (bytes): 598917
- Load time (ms): 11
- Save time GZIP'd (ms): 40
- Save size GZIP'd (bytes): 86969
- Load time GZIP'd (ms): 30
- Mem used estimate (MB): 2.0

## ListCrdt

Use a hybrid op-based/state-based CRDT implemented on top of the library's data structures, copied from [@list-positions/crdts](https://github.com/mweidner037/list-positions-crdts).
This variant uses a List of characters + PositionSet to store the state and Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 762
- Avg update size (bytes): 94.8
- Receiver time (ms): 507
- Save time (ms): 13
- Save size (bytes): 909102
- Load time (ms): 15
- Save time GZIP'd (ms): 57
- Save size GZIP'd (bytes): 102554
- Load time GZIP'd (ms): 36
- Mem used estimate (MB): 2.6
