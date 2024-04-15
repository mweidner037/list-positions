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

- Sender time (ms): 664
- Avg update size (bytes): 86.8
- Receiver time (ms): 355
- Save time (ms): 8
- Save size (bytes): 804020
- Load time (ms): 17
- Save time GZIP'd (ms): 79
- Save size GZIP'd (bytes): 88992
- Load time GZIP'd (ms): 39
- Mem used (MB): 2.4

## AbsList Direct

Use `AbsList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1566
- Avg update size (bytes): 218.2
- AbsPosition length stats: avg = 189.4, percentiles [25, 50, 75, 100] = 172,186,204,274
- Receiver time (ms): 786
- Save time (ms): 17
- Save size (bytes): 872992
- Load time (ms): 21
- Save time GZIP'd (ms): 76
- Save size GZIP'd (bytes): 85397
- Load time GZIP'd (ms): 36
- Mem used (MB): 2.1

## List Direct w/ Custom Encoding

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates use a custom string encoding; saved states use JSON with optional GZIP.

- Sender time (ms): 528
- Avg update size (bytes): 31.2
- Receiver time (ms): 337
- Save time (ms): 8
- Save size (bytes): 804020
- Load time (ms): 12
- Save time GZIP'd (ms): 66
- Save size GZIP'd (bytes): 88987
- Load time GZIP'd (ms): 30
- Mem used (MB): 2.2

## Text Direct

Use `Text` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 645
- Avg update size (bytes): 86.8
- Receiver time (ms): 426
- Save time (ms): 7
- Save size (bytes): 493835
- Load time (ms): 8
- Save time GZIP'd (ms): 39
- Save size GZIP'd (bytes): 71572
- Load time GZIP'd (ms): 24
- Mem used (MB): 1.4

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 627
- Avg update size (bytes): 78.4
- Receiver time (ms): 351
- Save time (ms): 5
- Save size (bytes): 382419
- Load time (ms): 8
- Save time GZIP'd (ms): 33
- Save size GZIP'd (bytes): 38309
- Load time GZIP'd (ms): 18
- Mem used (MB): 1.2

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 667
- Avg update size (bytes): 86.8
- Receiver time (ms): 416
- Save time (ms): 12
- Save size (bytes): 909990
- Load time (ms): 16
- Save time GZIP'd (ms): 74
- Save size GZIP'd (bytes): 101899
- Load time GZIP'd (ms): 38
- Mem used (MB): 2.6

## AbsPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses AbsPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1649
- Avg update size (bytes): 218.2
- Receiver time (ms): 782
- Save time (ms): 13
- Save size (bytes): 909990
- Load time (ms): 12
- Save time GZIP'd (ms): 77
- Save size GZIP'd (bytes): 101901
- Load time GZIP'd (ms): 33
- Mem used (MB): 2.5
