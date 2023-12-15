# Benchmark Results
Output of
```bash
npm run benchmarks -s > benchmark_results.md
```

## List Direct

Use `List` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 986
- Avg update size (bytes): 73.5
- Receiver time (ms): 693
- Save time (ms): 9
- Save size (bytes): 689516
- Load time (ms): 25
- Save time GZIP'd (ms): 151
- Save size GZIP'd (bytes): 87361
- Load time GZIP'd (ms): 39
- Mem used (MB): 2.2

## LexList Direct

Use `LexList` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1679
- Avg update size (bytes): 156.6
- LexPosition length stats: avg = 126.7, percentiles [25, 50, 75, 100] = 100,120,150,258
- Receiver time (ms): 888
- Save time (ms): 13
- Save size (bytes): 762273
- Load time (ms): 31
- Save time GZIP'd (ms): 86
- Save size GZIP'd (bytes): 79647
- Load time GZIP'd (ms): 37
- Mem used (MB): 2.0

## Outline Direct

Use `Outline` and send updates directly over a reliable link (e.g. WebSocket).
Updates and saved states use JSON encoding, with optional GZIP for saved states.
Neither updates nor saved states include values (chars).

- Sender time (ms): 956
- Avg update size (bytes): 65.0
- Receiver time (ms): 680
- Save time (ms): 4
- Save size (bytes): 267915
- Load time (ms): 9
- Save time GZIP'd (ms): 49
- Save size GZIP'd (bytes): 36973
- Load time GZIP'd (ms): 16
- Mem used (MB): 1.2

## PositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses Positions in messages, manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1035
- Avg update size (bytes): 73.5
- Receiver time (ms): 897
- Save time (ms): 9
- Save size (bytes): 752573
- Load time (ms): 14
- Save time GZIP'd (ms): 92
- Save size GZIP'd (bytes): 100016
- Load time GZIP'd (ms): 35
- Mem used (MB): 2.5

## LexPositionCRDT

Use a hybrid op-based/state-based CRDT on top of List+Outline.
This variant uses LexPositions in messages instead of manually managing BunchMetas.
Updates and saved states use JSON encoding, with optional GZIP for saved states.

- Sender time (ms): 1661
- Avg update size (bytes): 156.6
- Receiver time (ms): 1003
- Save time (ms): 8
- Save size (bytes): 752573
- Load time (ms): 15
- Save time GZIP'd (ms): 92
- Save size GZIP'd (bytes): 100016
- Load time GZIP'd (ms): 45
- Mem used (MB): 2.6
