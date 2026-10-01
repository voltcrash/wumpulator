/*
 * Grid model for Wumpus Navigator.
 *
 * A map is an immutable plain object:
 *   { size, start, gold, wumpus, pits }
 * where every position is a cell index (row * size + col) and `pits` is a
 * sorted array of indices. Edits never mutate a map; they return a new one.
 *
 * This file has no DOM code so it can be unit-tested in Node.
 */
(function (global) {
  'use strict';

  const MIN_SIZE = 4;
  const MAX_SIZE = 8;
  const DEFAULT_SIZE = 4;

  // The fixed neighbour order used by both algorithms: up, right, down, left.
  const DIRECTIONS = Object.freeze([
    Object.freeze({ name: 'up', dr: -1, dc: 0, arrow: '↑' }),
    Object.freeze({ name: 'right', dr: 0, dc: 1, arrow: '→' }),
    Object.freeze({ name: 'down', dr: 1, dc: 0, arrow: '↓' }),
    Object.freeze({ name: 'left', dr: 0, dc: -1, arrow: '←' }),
  ]);

  const ITEM_NAMES = Object.freeze({
    start: 'the explorer start',
    gold: 'the gold',
    wumpus: 'the Wumpus',
    pit: 'a pit',
  });

  function index(size, r, c) {
    return r * size + c;
  }

  function toRC(size, i) {
    return { r: Math.floor(i / size), c: i % size };
  }

  function inBounds(size, r, c) {
    return r >= 0 && r < size && c >= 0 && c < size;
  }

  function label(size, i) {
    const { r, c } = toRC(size, i);
    return '(' + r + ',' + c + ')';
  }

  function clampSize(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return DEFAULT_SIZE;
    return Math.min(MAX_SIZE, Math.max(MIN_SIZE, v));
  }

  function freeze(map) {
    Object.freeze(map.pits);
    return Object.freeze(map);
  }

  /**
   * Build a map from row/column pairs, e.g.
   *   createMap({ size: 4, start: [3,0], gold: [1,1], wumpus: [1,0], pits: [[3,2]] })
   * Throws if the layout is invalid.
   */
  function createMap(spec) {
    const size = spec.size;
    const at = (pair) => index(size, pair[0], pair[1]);
    const map = {
      size,
      start: at(spec.start),
      gold: at(spec.gold),
      wumpus: at(spec.wumpus),
      pits: (spec.pits || []).map(at).sort((a, b) => a - b),
    };
    const errors = validateMap(map);
    if (errors.length) throw new Error('Invalid map: ' + errors.join(' '));
    return freeze(map);
  }

  /** Returns a list of human-readable problems; an empty list means valid. */
  function validateMap(map) {
    const errors = [];
    const size = map.size;
    if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
      errors.push('Grid size must be between ' + MIN_SIZE + ' and ' + MAX_SIZE + '.');
      return errors;
    }
    const total = size * size;
    const valid = (i) => Number.isInteger(i) && i >= 0 && i < total;
    for (const key of ['start', 'gold', 'wumpus']) {
      if (!valid(map[key])) errors.push('The ' + key + ' cell is outside the grid.');
    }
    const seen = new Map();
    const claim = (i, what) => {
      if (seen.has(i)) {
        errors.push('Cell ' + label(size, i) + ' holds both ' + seen.get(i) + ' and ' + what + '.');
      } else {
        seen.set(i, what);
      }
    };
    claim(map.start, 'start');
    claim(map.gold, 'gold');
    claim(map.wumpus, 'Wumpus');
    for (const p of map.pits) {
      if (!valid(p)) errors.push('A pit is outside the grid.');
      else claim(p, 'a pit');
    }
    return errors;
  }

  function cellType(map, i) {
    if (i === map.start) return 'start';
    if (i === map.gold) return 'gold';
    if (i === map.wumpus) return 'wumpus';
    if (map.pits.includes(i)) return 'pit';
    return 'empty';
  }

  function isHazard(map, i) {
    return i === map.wumpus || map.pits.includes(i);
  }

  function withChanges(map, changes) {
    const next = Object.assign({}, map, changes);
    if (changes.pits) next.pits = changes.pits.slice().sort((a, b) => a - b);
    else next.pits = map.pits.slice();
    return freeze(next);
  }

  /**
   * Apply an editor tool to a cell.
   * Tools: 'start' | 'gold' | 'wumpus' (move the single item),
   *        'pit' (toggle a pit), 'erase' (remove a pit).
   * Returns { ok, changed, map, message }. Invalid placements leave the map
   * untouched and explain why.
   */
  function applyTool(map, tool, i) {
    const total = map.size * map.size;
    if (!Number.isInteger(i) || i < 0 || i >= total) {
      return { ok: false, changed: false, map, message: 'That cell is outside the grid.' };
    }
    const here = cellType(map, i);
    const where = label(map.size, i);

    if (tool === 'start' || tool === 'gold' || tool === 'wumpus') {
      if (here === tool) {
        return { ok: true, changed: false, map, message: 'Already at ' + where + '.' };
      }
      if (here !== 'empty') {
        return {
          ok: false, changed: false, map,
          message: where + ' already holds ' + ITEM_NAMES[here] + '. Choose an empty cell.',
        };
      }
      const moved = withChanges(map, { [tool]: i });
      return { ok: true, changed: true, map: moved, message: 'Moved ' + ITEM_NAMES[tool] + ' to ' + where + '.' };
    }

    if (tool === 'pit') {
      if (here === 'pit') {
        const pits = map.pits.filter((p) => p !== i);
        return { ok: true, changed: true, map: withChanges(map, { pits }), message: 'Removed the pit at ' + where + '.' };
      }
      if (here !== 'empty') {
        return {
          ok: false, changed: false, map,
          message: where + ' already holds ' + ITEM_NAMES[here] + '. Pits can only go on empty cells.',
        };
      }
      const pits = map.pits.concat([i]);
      return { ok: true, changed: true, map: withChanges(map, { pits }), message: 'Added a pit at ' + where + '.' };
    }

    if (tool === 'erase') {
      if (here === 'pit') {
        const pits = map.pits.filter((p) => p !== i);
        return { ok: true, changed: true, map: withChanges(map, { pits }), message: 'Removed the pit at ' + where + '.' };
      }
      if (here === 'empty') {
        return { ok: true, changed: false, map, message: where + ' is already empty.' };
      }
      return {
        ok: false, changed: false, map,
        message: 'Every map needs ' + ITEM_NAMES[here] + '. Move it with its own tool instead of erasing it.',
      };
    }

    return { ok: false, changed: false, map, message: 'Unknown tool "' + tool + '".' };
  }

  /**
   * Change the grid size. Items that still fit keep their row/column;
   * required items that fall outside are moved to the nearest free cell,
   * and pits that fall outside are dropped.
   */
  function resizeMap(map, newSize) {
    const size = clampSize(newSize);
    if (size === map.size) return map;
    const used = new Set();
    const carry = (i) => {
      const { r, c } = toRC(map.size, i);
      if (inBounds(size, r, c)) {
        const j = index(size, r, c);
        if (!used.has(j)) {
          used.add(j);
          return j;
        }
      }
      return -1;
    };
    const start = carry(map.start);
    const gold = carry(map.gold);
    const wumpus = carry(map.wumpus);
    const pits = [];
    for (const p of map.pits) {
      const j = carry(p);
      if (j >= 0) pits.push(j);
    }
    // Place any required item that did not fit, scanning from the far corner.
    const firstFree = (preferred) => {
      const order = [];
      for (let i = size * size - 1; i >= 0; i--) order.push(i);
      if (preferred !== undefined) order.unshift(preferred);
      for (const i of order) {
        if (!used.has(i)) {
          used.add(i);
          return i;
        }
      }
      throw new Error('No free cell available.');
    };
    const next = {
      size,
      start: start >= 0 ? start : firstFree(index(size, size - 1, 0)),
      gold: gold >= 0 ? gold : firstFree(index(size, 0, size - 1)),
      wumpus: wumpus >= 0 ? wumpus : firstFree(),
      pits: pits.sort((a, b) => a - b),
    };
    return freeze(next);
  }

  /**
   * Convert the grid into an undirected graph stored as adjacency lists.
   * Vertices are safe cells (start, gold, empty). Edges join safe cells that
   * share a side. Each list is ordered up, right, down, left.
   *
   * Returns { size, vertices, adj, V, E } where adj[i] is an array of
   * { to, dir } for safe cells and null for hazards.
   */
  function buildGraph(map) {
    const size = map.size;
    const total = size * size;
    const adj = new Array(total).fill(null);
    const vertices = [];
    let entries = 0;
    for (let i = 0; i < total; i++) {
      if (isHazard(map, i)) continue;
      vertices.push(i);
      const { r, c } = toRC(size, i);
      const list = [];
      for (const d of DIRECTIONS) {
        const nr = r + d.dr;
        const nc = c + d.dc;
        if (!inBounds(size, nr, nc)) continue;
        const j = index(size, nr, nc);
        if (isHazard(map, j)) continue;
        list.push(Object.freeze({ to: j, dir: d.name }));
      }
      adj[i] = Object.freeze(list);
      entries += list.length;
    }
    return Object.freeze({
      size,
      vertices: Object.freeze(vertices),
      adj: Object.freeze(adj),
      V: vertices.length,
      E: entries / 2,
    });
  }

  // Flood fill used only to keep random maps solvable; the teaching
  // algorithms live in algorithms.js.
  function reachable(map, from, to) {
    const graph = buildGraph(map);
    const seen = new Set([from]);
    const todo = [from];
    while (todo.length) {
      const u = todo.pop();
      if (u === to) return true;
      for (const { to: v } of graph.adj[u]) {
        if (!seen.has(v)) {
          seen.add(v);
          todo.push(v);
        }
      }
    }
    return false;
  }

  /**
   * Random layout. `rng` returns numbers in [0, 1). With `solvable: true`
   * (the default) it retries until the gold can be reached.
   */
  function randomMap(size, options) {
    const opts = Object.assign({ rng: Math.random, pitDensity: 0.18, solvable: true }, options);
    const n = clampSize(size);
    const total = n * n;
    const pick = (taken) => {
      let i;
      do {
        i = Math.floor(opts.rng() * total);
      } while (taken.has(i));
      taken.add(i);
      return i;
    };
    let last = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      const taken = new Set();
      const start = pick(taken);
      const gold = pick(taken);
      const wumpus = pick(taken);
      const pitCount = Math.max(1, Math.round((total - 3) * opts.pitDensity));
      const pits = [];
      for (let k = 0; k < pitCount; k++) pits.push(pick(taken));
      last = freeze({ size: n, start, gold, wumpus, pits: pits.sort((a, b) => a - b) });
      if (!opts.solvable || reachable(last, start, gold)) return last;
    }
    return last;
  }

  // Ready-made layouts. Rows count from the top (row 0) and columns from the left.
  const EXAMPLES = Object.freeze({
    classic: Object.freeze({
      name: 'Classic 4×4',
      description: 'The textbook Wumpus World layout. The gold is reachable in 3 moves.',
      map: createMap({
        size: 4, start: [3, 0], gold: [1, 1], wumpus: [1, 0],
        pits: [[3, 2], [1, 2], [0, 3]],
      }),
    }),
    detour: Object.freeze({
      name: 'DFS detour 5×5',
      description: 'BFS walks 4 moves along the bottom row. DFS climbs the left wall, hits a dead end, backtracks, and settles for a longer route.',
      map: createMap({
        size: 5, start: [4, 0], gold: [4, 4], wumpus: [2, 2],
        pits: [[1, 2], [3, 2], [2, 4], [3, 3]],
      }),
    }),
    adjacent: Object.freeze({
      name: 'Gold next door',
      description: 'The gold is one move to the right of the start. Watch which algorithm notices first.',
      map: createMap({
        size: 4, start: [3, 0], gold: [3, 1], wumpus: [1, 1],
        pits: [[2, 2], [0, 3]],
      }),
    }),
    blocked: Object.freeze({
      name: 'No path',
      description: 'A pit and the Wumpus seal off the gold. Both searches explore every reachable cell, then report failure.',
      map: createMap({
        size: 4, start: [3, 0], gold: [0, 3], wumpus: [1, 3],
        pits: [[0, 2], [2, 1], [2, 2]],
      }),
    }),
  });

  const api = {
    MIN_SIZE, MAX_SIZE, DEFAULT_SIZE, DIRECTIONS, EXAMPLES,
    index, toRC, inBounds, label, clampSize,
    createMap, validateMap, cellType, isHazard, applyTool, resizeMap,
    buildGraph, reachable, randomMap,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.WumpusNav = global.WumpusNav || {}).Grid = api;
})(typeof window !== 'undefined' ? window : globalThis);
