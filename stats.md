
> position-strings@1.0.0 benchmarks
> ts-node --project tsconfig.dev.json benchmarks/main.ts

## Run: 1000 ops; rotate never

### length

- Average: 97
- Median: 109
- 99th percentile: 163
- Max: 164

### compressedLength

- Average: 56
- Median: 61
- 99th percentile: 81
- Max: 82

### nodes

- Average: 7
- Median: 8
- 99th percentile: 12
- Max: 12

### valueIndexCount

- Average: 84
- Median: 53
- 99th percentile: 315
- Max: 324

## Run: 10000 ops; rotate every 1000 ops

### length

- Average: 268
- Median: 260
- 99th percentile: 463
- Max: 478

### compressedLength

- Average: 124
- Median: 126
- 99th percentile: 190
- Max: 196

### nodes

- Average: 20
- Median: 19
- 99th percentile: 34
- Max: 35

### valueIndexCount

- Average: 56
- Median: 38
- 99th percentile: 243
- Max: 324

## Run: all ops; rotate never

### length

- Average: 423
- Median: 390
- 99th percentile: 916
- Max: 1091

### compressedLength

- Average: 148
- Median: 141
- 99th percentile: 271
- Max: 316

### nodes

- Average: 29
- Median: 27
- 99th percentile: 62
- Max: 72

### valueIndexCount

- Average: 86
- Median: 44
- 99th percentile: 671
- Max: 1395

## Run: all ops; rotate every 1000 ops

### length

- Average: 457
- Median: 432
- 99th percentile: 949
- Max: 1100

### compressedLength

- Average: 210
- Median: 206
- 99th percentile: 364
- Max: 431

### nodes

- Average: 33
- Median: 31
- 99th percentile: 69
- Max: 80

### valueIndexCount

- Average: 70
- Median: 39
- 99th percentile: 454
- Max: 999

