'use strict';

// Small deterministic RNG (mulberry32) so random-map tests are reproducible.
function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Independent shortest-distance oracle: repeated relaxation over grid cells,
// written without using the graph builder or either search.
function bruteForceDistance(map) {
  const n = map.size;
  const blocked = new Set(map.pits.concat([map.wumpus]));
  const dist = new Array(n * n).fill(Infinity);
  dist[map.start] = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n * n; i++) {
      if (blocked.has(i) || dist[i] === Infinity) continue;
      const r = Math.floor(i / n);
      const c = i % n;
      const around = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
      for (const [nr, nc] of around) {
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        const j = nr * n + nc;
        if (blocked.has(j)) continue;
        if (dist[i] + 1 < dist[j]) {
          dist[j] = dist[i] + 1;
          changed = true;
        }
      }
    }
  }
  return dist[map.gold];
}

function isAdjacent(n, a, b) {
  const ra = Math.floor(a / n);
  const ca = a % n;
  const rb = Math.floor(b / n);
  const cb = b % n;
  return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
}

// A valid route starts at the start, ends at the gold, only steps between
// side-adjacent cells, never enters a hazard and never repeats a cell.
function assertValidPath(assert, map, path) {
  assert.ok(Array.isArray(path) && path.length >= 2, 'path has at least two cells');
  assert.equal(path[0], map.start, 'path begins at the start');
  assert.equal(path[path.length - 1], map.gold, 'path ends at the gold');
  assert.equal(new Set(path).size, path.length, 'path never repeats a cell');
  for (const cell of path) {
    assert.ok(cell !== map.wumpus && !map.pits.includes(cell), 'path avoids hazards');
  }
  for (let k = 1; k < path.length; k++) {
    assert.ok(isAdjacent(map.size, path[k - 1], path[k]), 'consecutive cells share a side');
  }
}

module.exports = { seededRng, bruteForceDistance, isAdjacent, assertValidPath };
