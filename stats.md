
> position-strings@2.0.0 benchmarks
> ts-node --project tsconfig.dev.json benchmarks/main.ts

## Run: all ops; rotate never

### length

- Average: 33
- Median: 32
- 99th percentile: 51
- Max: 55

### longNames

- Average: 1
- Median: 1
- 99th percentile: 1
- Max: 1

### waypoints

- Average: 9
- Median: 8
- 99th percentile: 15
- Max: 17

### valueIndex

- Average: 615
- Median: 208
- 99th percentile: 5780
- Max: 7603

### PositionSource memory usage

- Map size: 3333
- Sum of map key lengths: 112034

## Run: all ops; rotate every 1000 ops

### length

- Average: 111
- Median: 109
- 99th percentile: 206
- Max: 237

### longNames

- Average: 8
- Median: 8
- 99th percentile: 16
- Max: 18

### waypoints

- Average: 13
- Median: 13
- 99th percentile: 24
- Max: 26

### valueIndex

- Average: 185
- Median: 108
- 99th percentile: 851
- Max: 999

### PositionSource memory usage

- Map size: 20
- Sum of map key lengths: 2574

## Run: 10000 ops; rotate never

### length

- Average: 23
- Median: 25
- 99th percentile: 32
- Max: 35

### longNames

- Average: 1
- Median: 1
- 99th percentile: 1
- Max: 1

### waypoints

- Average: 5
- Median: 6
- 99th percentile: 8
- Max: 9

### valueIndex

- Average: 293
- Median: 183
- 99th percentile: 1029
- Max: 1069

### PositionSource memory usage

- Map size: 151
- Sum of map key lengths: 3666

## Run: 10000 ops; rotate every 1000 ops

### length

- Average: 50
- Median: 49
- 99th percentile: 86
- Max: 86

### longNames

- Average: 3
- Median: 3
- 99th percentile: 6
- Max: 6

### waypoints

- Average: 7
- Median: 7
- 99th percentile: 11
- Max: 12

### valueIndex

- Average: 173
- Median: 113
- 99th percentile: 686
- Max: 759

### PositionSource memory usage

- Map size: 7
- Sum of map key lengths: 580

