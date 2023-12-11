export function getMemUsed() {
  if (global.gc) {
    // Experimentally, calling gc() twice makes memory msmts more reliable -
    // otherwise may get negative diffs (last trial getting GC'd in the middle?).
    global.gc();
    global.gc();
  }
  return process.memoryUsage().heapUsed;
}
