'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Grid = require('../js/grid.js');
const { seededRng } = require('./helpers.js');

const at = (map, r, c) => Grid.index(map.size, r, c);

test('examples are valid maps and default to a 4x4 grid', () => {
  for (const ex of Object.values(Grid.EXAMPLES)) {
    assert.deepEqual(Grid.validateMap(ex.map), [], ex.name);
  }
  assert.equal(Grid.EXAMPLES.classic.map.size, 4);
});

test('createMap rejects overlapping items', () => {
  assert.throws(() => Grid.createMap({ size: 4, start: [0, 0], gold: [0, 0], wumpus: [1, 1] }), /both/);
  assert.throws(() => Grid.createMap({ size: 4, start: [0, 0], gold: [0, 1], wumpus: [1, 1], pits: [[1, 1]] }), /both/);
  assert.throws(() => Grid.createMap({ size: 9, start: [0, 0], gold: [0, 1], wumpus: [1, 1] }), /size/);
});

test('moving start, gold and wumpus to empty cells works', () => {
  const map = Grid.EXAMPLES.classic.map;
  for (const tool of ['start', 'gold', 'wumpus']) {
    const res = Grid.applyTool(map, tool, at(map, 0, 0));
    assert.ok(res.ok && res.changed, tool);
    assert.equal(res.map[tool], at(map, 0, 0));
    assert.deepEqual(Grid.validateMap(res.map), []);
  }
});

test('placing onto an occupied cell is refused and leaves the map unchanged', () => {
  const map = Grid.EXAMPLES.classic.map;
  const res = Grid.applyTool(map, 'gold', map.start);
  assert.equal(res.ok, false);
  assert.equal(res.map, map);
  assert.match(res.message, /explorer start/);

  const onPit = Grid.applyTool(map, 'wumpus', map.pits[0]);
  assert.equal(onPit.ok, false);

  const pitOnGold = Grid.applyTool(map, 'pit', map.gold);
  assert.equal(pitOnGold.ok, false);
});

test('pit tool toggles and erase only removes pits', () => {
  const map = Grid.EXAMPLES.classic.map;
  const cell = at(map, 0, 0);
  const added = Grid.applyTool(map, 'pit', cell);
  assert.ok(added.map.pits.includes(cell));
  const removed = Grid.applyTool(added.map, 'pit', cell);
  assert.ok(!removed.map.pits.includes(cell));

  const erased = Grid.applyTool(added.map, 'erase', cell);
  assert.ok(!erased.map.pits.includes(cell));

  const eraseStart = Grid.applyTool(map, 'erase', map.start);
  assert.equal(eraseStart.ok, false);
  assert.equal(eraseStart.map.start, map.start);
});

test('maps are immutable', () => {
  const map = Grid.EXAMPLES.classic.map;
  assert.ok(Object.isFrozen(map));
  assert.ok(Object.isFrozen(map.pits));
  const before = map.pits.slice();
  Grid.applyTool(map, 'pit', at(map, 0, 0));
  assert.deepEqual(map.pits, before);
});

test('resizing keeps items that fit and relocates the rest', () => {
  const small = Grid.EXAMPLES.classic.map;
  const big = Grid.resizeMap(small, 8);
  assert.equal(big.size, 8);
  assert.deepEqual(Grid.toRC(8, big.start), Grid.toRC(4, small.start));
  assert.deepEqual(Grid.validateMap(big), []);

  // Put everything in the far corner of an 8x8, then shrink to 4x4.
  const corner = Grid.createMap({ size: 8, start: [7, 7], gold: [7, 6], wumpus: [6, 7], pits: [[6, 6], [0, 0]] });
  const shrunk = Grid.resizeMap(corner, 4);
  assert.equal(shrunk.size, 4);
  assert.deepEqual(Grid.validateMap(shrunk), []);
  assert.deepEqual(shrunk.pits, [0]);

  assert.equal(Grid.resizeMap(small, 20).size, Grid.MAX_SIZE);
  assert.equal(Grid.resizeMap(small, 1).size, Grid.MIN_SIZE);
});

test('graph uses safe cells as vertices and orders neighbours up, right, down, left', () => {
  const empty = Grid.createMap({ size: 4, start: [3, 0], gold: [0, 3], wumpus: [0, 0] });
  const g = Grid.buildGraph(empty);
  assert.equal(g.V, 15);
  // 4x4 grid has 24 edges; the wumpus corner removes 2.
  assert.equal(g.E, 22);
  assert.equal(g.adj[empty.wumpus], null);
  const centre = Grid.index(4, 1, 1);
  assert.deepEqual(g.adj[centre].map((e) => e.dir), ['up', 'right', 'down', 'left']);
  assert.deepEqual(g.adj[centre].map((e) => e.to), [1, 6, 9, 4]);
  // (0,1): up is off the grid and left is the Wumpus, so neither is an edge.
  assert.deepEqual(g.adj[Grid.index(4, 0, 1)].map((e) => e.dir), ['right', 'down']);
  const total = g.adj.reduce((sum, list) => sum + (list ? list.length : 0), 0);
  assert.equal(total, 2 * g.E, 'undirected: each edge appears in two lists');
});

test('random maps are valid and solvable by default', () => {
  const rng = seededRng(42);
  for (let k = 0; k < 200; k++) {
    const size = Grid.MIN_SIZE + (k % (Grid.MAX_SIZE - Grid.MIN_SIZE + 1));
    const map = Grid.randomMap(size, { rng });
    assert.equal(map.size, size);
    assert.deepEqual(Grid.validateMap(map), []);
    assert.ok(Grid.reachable(map, map.start, map.gold));
  }
});
