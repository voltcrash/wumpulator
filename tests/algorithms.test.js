'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Grid = require('../js/grid.js');
const Algorithms = require('../js/algorithms.js');
const { seededRng, bruteForceDistance, isAdjacent, assertValidPath } = require('./helpers.js');

const { classic, detour, adjacent, blocked } = Grid.EXAMPLES;

test('BFS finds the 3-move route on the classic map', () => {
  const res = Algorithms.bfs(classic.map);
  assert.equal(res.found, true);
  assert.equal(res.moves, 3);
  assertValidPath(assert, classic.map, res.path);
});

test('DFS finds a valid route on the classic map', () => {
  const res = Algorithms.dfs(classic.map);
  assert.equal(res.found, true);
  assertValidPath(assert, classic.map, res.path);
});

test('DFS takes a longer route than BFS on the detour map', () => {
  const b = Algorithms.bfs(detour.map);
  const d = Algorithms.dfs(detour.map);
  assert.equal(b.moves, 4);
  assertValidPath(assert, detour.map, d.path);
  assert.ok(d.moves > b.moves, 'DFS ' + d.moves + ' vs BFS ' + b.moves);
});

test('adjacent start and gold: BFS needs one move, DFS still returns a valid route', () => {
  const b = Algorithms.bfs(adjacent.map);
  assert.equal(b.moves, 1);
  assert.deepEqual(b.path, [adjacent.map.start, adjacent.map.gold]);
  const d = Algorithms.dfs(adjacent.map);
  assertValidPath(assert, adjacent.map, d.path);
});

test('unreachable gold ends with an explicit no-path step', () => {
  for (const run of [Algorithms.bfs, Algorithms.dfs]) {
    const res = run(blocked.map);
    assert.equal(res.found, false);
    assert.equal(res.path, null);
    const last = res.trace[res.trace.length - 1];
    assert.equal(last.kind, 'nopath');
    assert.equal(last.status, 'nopath');
    assert.match(last.title, /No safe path exists/);
    assert.equal(last.structure.length, 0, 'data structure is empty');
    assert.equal(last.states[blocked.map.gold], 'undiscovered');
    // Everything connected to the start was explored and finished.
    assert.equal(last.counters.processed, last.counters.discovered);
  }
});

test('a start sealed in by hazards reports no path', () => {
  const map = Grid.createMap({ size: 4, start: [3, 0], gold: [0, 3], wumpus: [2, 0], pits: [[3, 1]] });
  for (const run of [Algorithms.bfs, Algorithms.dfs]) {
    const res = run(map);
    assert.equal(res.found, false);
    assert.equal(res.trace[res.trace.length - 1].counters.discovered, 1);
  }
});

test('traces are reproducible', () => {
  for (const run of [Algorithms.bfs, Algorithms.dfs]) {
    assert.deepEqual(run(detour.map).trace, run(detour.map).trace);
  }
});

test('snapshots are frozen and start with initialise', () => {
  const { trace } = Algorithms.bfs(classic.map);
  assert.equal(trace[0].kind, 'init');
  assert.deepEqual(trace[0].structure, [classic.map.start]);
  for (const snap of trace) {
    assert.ok(Object.isFrozen(snap));
    assert.ok(Object.isFrozen(snap.states));
    assert.ok(Object.isFrozen(snap.structure));
    assert.ok(Object.isFrozen(snap.counters));
    assert.ok(snap.message.length > 20, 'every step has an explanation');
    assert.ok(snap.lines.length > 0, 'every step highlights pseudocode');
  }
});

test('pseudocode line numbers referenced by steps exist', () => {
  for (const id of ['bfs', 'dfs']) {
    const lines = Algorithms.ALGORITHMS[id].pseudocode.length;
    for (const map of [classic.map, detour.map, blocked.map]) {
      for (const snap of Algorithms.run(map, id).trace) {
        for (const n of snap.lines) assert.ok(n >= 1 && n <= lines, id + ' line ' + n);
      }
    }
  }
});

test('BFS queue is ordered by distance and never holds a cell twice', () => {
  const { trace } = Algorithms.bfs(detour.map);
  for (const snap of trace) {
    const d = snap.structure.map((v) => snap.depth[v]);
    for (let k = 1; k < d.length; k++) assert.ok(d[k] >= d[k - 1], 'non-decreasing distance');
    if (d.length) assert.ok(d[d.length - 1] - d[0] <= 1, 'queue spans at most two levels');
    assert.equal(new Set(snap.structure).size, snap.structure.length);
    snap.structure.forEach((v) => assert.equal(snap.states[v], 'frontier'));
  }
});

test('DFS stack is always a connected route from the start (backtracking is real)', () => {
  const { trace, path } = Algorithms.dfs(detour.map);
  assert.ok(trace.some((s) => s.kind === 'backtrack'), 'this map forces backtracking');
  assertValidPath(assert, detour.map, path);
  for (const snap of trace) {
    const stack = snap.structure;
    if (!stack.length) continue;
    assert.equal(stack[0], detour.map.start);
    assert.equal(snap.current, stack[stack.length - 1], 'highlighted cell is the top of the stack');
    for (let k = 1; k < stack.length; k++) {
      assert.ok(isAdjacent(detour.map.size, stack[k - 1], stack[k]));
      assert.equal(snap.parent[stack[k]], stack[k - 1]);
    }
  }
});

test('cell states agree with counters on every step', () => {
  for (const id of ['bfs', 'dfs']) {
    for (const map of [classic.map, detour.map, adjacent.map, blocked.map]) {
      for (const snap of Algorithms.run(map, id).trace) {
        const count = (s) => snap.states.filter((x) => x === s).length;
        assert.equal(count('processed'), snap.counters.processed);
        assert.equal(snap.states.length - count('undiscovered'), snap.counters.discovered);
        assert.equal(snap.counters.frontier, snap.structure.length);
        assert.ok(count('current') <= 1);
      }
    }
  }
});

test('randomised: BFS is shortest, DFS is valid, both agree on reachability, work is O(V + E)', () => {
  const rng = seededRng(2024);
  for (let k = 0; k < 600; k++) {
    const size = Grid.MIN_SIZE + (k % (Grid.MAX_SIZE - Grid.MIN_SIZE + 1));
    const map = Grid.randomMap(size, { rng, solvable: false, pitDensity: 0.1 + 0.25 * rng() });
    const expected = bruteForceDistance(map);
    const b = Algorithms.bfs(map);
    const d = Algorithms.dfs(map);

    if (expected === Infinity) {
      assert.equal(b.found, false);
      assert.equal(d.found, false);
    } else {
      assert.equal(b.moves, expected, 'BFS moves equal the true shortest distance');
      assertValidPath(assert, map, b.path);
      assertValidPath(assert, map, d.path);
      assert.ok(d.moves >= b.moves);
      const dfsLast = d.trace[d.trace.length - 1];
      assert.deepEqual(dfsLast.structure, d.path, 'DFS route equals its final stack');
    }

    for (const res of [b, d]) {
      const last = res.trace[res.trace.length - 1];
      const order = last.order.filter((x) => x !== -1);
      assert.equal(new Set(order).size, order.length, 'each vertex discovered once');
      assert.ok(last.counters.discovered <= res.graph.V);
      assert.ok(last.counters.checks <= 2 * res.graph.E, 'each adjacency entry checked at most once');
      assert.ok(res.trace.length <= 2 + 2 * res.graph.V + 2 * res.graph.E, 'steps bounded by O(V + E)');
    }
  }
});
