// Usage:
// node --inspect memory.js
// When it says "Ready", inspect with Chrome and take a heap snapshot.
// This program investigates the memory usage of various sparse-array representations
// for an OrderNode's values in a List, using synthetic sparse arrays instead of the real text trace.

const altArrays = [];
const dualArrays = [];
const indexMaps = [];
const indexObjs = [];

for (let i = 0; i < 1000; i++) {
  // As alternating array
  class AltArray {
    constructor() {
      this.runs = [];
    }
  }
  const altArray = new AltArray();
  altArrays.push(altArray);

  // As two arrays
  class DualArray {
    constructor() {
      this.struct = {
        present: [],
        deleted: [],
      };
    }
  }
  const dualArray = new DualArray();
  dualArrays.push(dualArray);

  // As Map
  class IndexMap {
    constructor() {
      this.map = new Map();
    }
  }
  const indexMap = new IndexMap();
  indexMaps.push(indexMap);

  // As object
  class IndexObj {
    constructor() {
      this.obj = {};
    }
  }
  const indexObj = new IndexObj();
  indexObjs.push(indexObj);

  // Average count 5 -> 10 items.
  const itemCount = Math.floor(Math.random() * 10);
  let index = 0;
  for (let i = 0; i < itemCount; i++) {
    const presentLength = Math.floor(Math.random() * 19) + 1;
    const presentArr = new Array(presentLength).fill("a");
    const deletedLength = Math.floor(Math.random() * 9) + 1;

    altArray.runs.push(presentArr.slice(), deletedLength);

    dualArray.struct.present.push(presentArr.slice());
    dualArray.struct.deleted.push(deletedLength);

    for (const val of presentArr) {
      indexMap.map.set(index, val);
      indexObj.obj[index] = val;
      index++;
    }
    index += deletedLength;
  }
  // Trim altArray.
  if (altArray.runs.length !== 0) altArray.runs.pop();
}

console.log("Ready");
setTimeout(
  () => console.log(altArrays, dualArrays, indexMaps, indexObjs),
  10000000
);

// Results (Chrome inspector retained size):
//
// 1. IndexObj, 1.59 MB
// 2. AltArray, 1.60 MB
// 3. DualArray, 1.79 MB
// 4. IndexMap, 2.72 MB
//
// AltArray is more convenient than IndexObj (faster iterate-past, compatability with Outline),
// and I'm less trustful of other browsers' sparse object representations,
// so I'll go with AltArray.
