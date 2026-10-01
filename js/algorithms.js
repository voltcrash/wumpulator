/*
 * Breadth-first and depth-first search over the grid graph.
 *
 * Each search runs to completion once and records a frozen snapshot after
 * every meaningful operation. The playback controller only replays these
 * snapshots; it never re-runs or fakes algorithm behaviour.
 *
 * Cell states inside a snapshot:
 *   undiscovered  never reached yet
 *   frontier      discovered and waiting (in the queue / on the stack below the top)
 *   current       being expanded (just dequeued / top of the stack)
 *   processed     every neighbour has been examined
 */
(function (global) {
  'use strict';

  const Grid = typeof require === 'function' ? require('./grid.js') : global.WumpusNav.Grid;

  const BFS_PSEUDOCODE = Object.freeze([
    { text: 'BFS(G, s, goal):' },
    { text: '  discovered[s] ← true;  parent[s] ← nil' },
    { text: '  Q ← empty queue;  ENQUEUE(Q, s)' },
    { text: '  while Q is not empty:' },
    { text: '    u ← DEQUEUE(Q)', note: 'take from the front' },
    { text: '    if u = goal: return PATH(parent, u)' },
    { text: '    for each v in Adj[u]:', note: 'up, right, down, left' },
    { text: '      if not discovered[v]:' },
    { text: '        discovered[v] ← true;  parent[v] ← u' },
    { text: '        ENQUEUE(Q, v)', note: 'add at the rear' },
    { text: '  return NO PATH' },
  ]);

  const DFS_PSEUDOCODE = Object.freeze([
    { text: 'DFS(G, s, goal):' },
    { text: '  visited[s] ← true;  parent[s] ← nil' },
    { text: '  S ← empty stack;  PUSH(S, s)' },
    { text: '  while S is not empty:' },
    { text: '    u ← TOP(S)', note: 'look, do not remove' },
    { text: '    if u = goal: return S', note: 'stack = route from s' },
    { text: '    if u has an unchecked v in Adj[u]:', note: 'up, right, down, left' },
    { text: '      if not visited[v]:' },
    { text: '        visited[v] ← true;  parent[v] ← u' },
    { text: '        PUSH(S, v)', note: 'go deeper' },
    { text: '    else: POP(S)', note: 'dead end, backtrack' },
    { text: '  return NO PATH' },
  ]);

  const ALGORITHMS = Object.freeze({
    bfs: Object.freeze({
      id: 'bfs',
      name: 'Breadth-first search',
      short: 'BFS',
      structure: 'queue',
      pseudocode: BFS_PSEUDOCODE,
    }),
    dfs: Object.freeze({
      id: 'dfs',
      name: 'Depth-first search',
      short: 'DFS',
      structure: 'stack',
      pseudocode: DFS_PSEUDOCODE,
    }),
  });

  function freezeArray(a) {
    return Object.freeze(a.slice());
  }

  function pathFromParents(parent, goal) {
    const path = [];
    for (let v = goal; v !== -1; v = parent[v]) path.push(v);
    return path.reverse();
  }

  function names(size, list) {
    return list.map((i) => Grid.label(size, i)).join(', ');
  }

  /** Shared bookkeeping used by both searches to record snapshots. */
  function createRecorder(map, graph, algorithm) {
    const total = map.size * map.size;
    const s = {
      states: new Array(total).fill('undiscovered'),
      order: new Array(total).fill(-1),
      parent: new Array(total).fill(-1),
      depth: new Array(total).fill(-1),
      discovered: 0,
      processed: 0,
      checks: 0,
      maxFrontier: 0,
    };
    const trace = [];

    s.discover = function (v, from) {
      s.order[v] = s.discovered;
      s.discovered += 1;
      s.parent[v] = from;
      s.depth[v] = from === -1 ? 0 : s.depth[from] + 1;
      s.states[v] = 'frontier';
    };

    s.record = function (step, structure) {
      s.maxFrontier = Math.max(s.maxFrontier, structure.length);
      const path = step.path ? freezeArray(step.path) : null;
      trace.push(Object.freeze({
        index: trace.length,
        algorithm,
        kind: step.kind,
        title: step.title,
        message: step.message,
        lines: freezeArray(step.lines),
        current: step.current === undefined ? -1 : step.current,
        neighbour: step.neighbour === undefined ? -1 : step.neighbour,
        neighbourDir: step.neighbourDir || null,
        removed: step.removed === undefined ? -1 : step.removed,
        states: freezeArray(s.states),
        order: freezeArray(s.order),
        parent: freezeArray(s.parent),
        depth: freezeArray(s.depth),
        structure: freezeArray(structure),
        counters: Object.freeze({
          discovered: s.discovered,
          processed: s.processed,
          frontier: structure.length,
          maxFrontier: s.maxFrontier,
          checks: s.checks,
          V: graph.V,
          E: graph.E,
        }),
        status: step.status || 'searching',
        path,
        moves: path ? path.length - 1 : null,
      }));
    };

    return { s, trace };
  }

  /**
   * Breadth-first search from map.start to map.gold.
   * Returns { graph, trace, found, path, moves }.
   */
  function bfs(map) {
    const graph = Grid.buildGraph(map);
    const size = map.size;
    const L = (i) => Grid.label(size, i);
    const { s, trace } = createRecorder(map, graph, 'bfs');

    // The queue is an array with a moving head, so DEQUEUE is O(1).
    const queue = [];
    let head = 0;
    const live = () => queue.slice(head);

    s.discover(map.start, -1);
    queue.push(map.start);
    s.record({
      kind: 'init',
      title: 'Initialise',
      lines: [2, 3],
      current: -1,
      message:
        'Mark the start ' + L(map.start) + ' as discovered and enqueue it. ' +
        'The queue holds discovered cells waiting to be expanded, first in, first out. ' +
        'The graph has V = ' + graph.V + ' safe cells and E = ' + graph.E + ' edges.',
    }, live());

    let previous = -1;
    while (head < queue.length) {
      const u = queue[head];
      head += 1;
      let finishedNote = '';
      if (previous !== -1) {
        s.states[previous] = 'processed';
        s.processed += 1;
        finishedNote = 'All neighbours of ' + L(previous) + ' have been checked, so it is now processed. ';
      }
      s.states[u] = 'current';

      if (u === map.gold) {
        const path = pathFromParents(s.parent, u);
        s.record({
          kind: 'found',
          title: 'Gold found at ' + L(u),
          lines: [5, 6],
          current: u,
          removed: u,
          status: 'found',
          path,
          message:
            finishedNote +
            'Dequeue ' + L(u) + ' from the front: it holds the gold. Follow the parent links back to the start: ' +
            names(size, path) + '. That is ' + (path.length - 1) + ' move' + (path.length === 2 ? '' : 's') +
            '. BFS expands cells in order of distance from the start, so no shorter safe path exists.',
        }, live());
        return { graph, trace, found: true, path, moves: path.length - 1 };
      }

      const list = graph.adj[u];
      s.record({
        kind: 'dequeue',
        title: 'Dequeue ' + L(u),
        lines: [5, 6],
        current: u,
        removed: u,
        message:
          finishedNote +
          'Dequeue ' + L(u) + ' from the front of the queue. It is ' + s.depth[u] +
          ' move' + (s.depth[u] === 1 ? '' : 's') + ' from the start and is not the gold. ' +
          (list.length
            ? 'Adj' + L(u) + ' = [' + names(size, list.map((e) => e.to)) + '], checked up, right, down, left.'
            : 'Adj' + L(u) + ' is empty: every side is a wall or a hazard.'),
      }, live());

      for (const edge of list) {
        const v = edge.to;
        s.checks += 1;
        if (s.order[v] !== -1) {
          s.record({
            kind: 'skip',
            title: 'Check ' + L(v) + ' (' + edge.dir + ')',
            lines: [7, 8],
            current: u,
            neighbour: v,
            neighbourDir: edge.dir,
            message:
              'Neighbour ' + L(v) + ' (' + edge.dir + ' of ' + L(u) + ') was already discovered, so skip it. ' +
              'BFS never enqueues a cell twice, which keeps the work linear.',
          }, live());
        } else {
          s.discover(v, u);
          queue.push(v);
          s.record({
            kind: 'discover',
            title: 'Discover ' + L(v) + ' (' + edge.dir + ')',
            lines: [8, 9, 10],
            current: u,
            neighbour: v,
            neighbourDir: edge.dir,
            message:
              'Neighbour ' + L(v) + ' (' + edge.dir + ' of ' + L(u) + ') is new. Mark it discovered, set its parent to ' +
              L(u) + ', and enqueue it at the rear. Its distance from the start is ' + s.depth[v] + '.',
          }, live());
        }
      }
      previous = u;
    }

    if (previous !== -1) {
      s.states[previous] = 'processed';
      s.processed += 1;
    }
    s.record({
      kind: 'nopath',
      title: 'No safe path exists',
      lines: [4, 11],
      current: -1,
      status: 'nopath',
      message:
        'The queue is empty and the gold ' + L(map.gold) + ' was never discovered. BFS has reached all ' +
        s.discovered + ' cells connected to the start, so no safe path exists. ' +
        'Pits and the Wumpus wall the gold off.',
    }, live());
    return { graph, trace, found: false, path: null, moves: null };
  }

  /**
   * Depth-first search with an explicit stack of the current route.
   * Like recursive DFS, a cell stays on the stack until all of its
   * neighbours have been tried; only then is it popped (backtracking).
   * Returns { graph, trace, found, path, moves }.
   */
  function dfs(map) {
    const graph = Grid.buildGraph(map);
    const size = map.size;
    const L = (i) => Grid.label(size, i);
    const { s, trace } = createRecorder(map, graph, 'dfs');

    const stack = [];
    // nextEdge[u] = how many entries of Adj[u] have been checked so far.
    const nextEdge = new Array(size * size).fill(0);
    const live = () => stack.slice();

    s.discover(map.start, -1);
    stack.push(map.start);
    s.states[map.start] = 'current';
    s.record({
      kind: 'init',
      title: 'Initialise',
      lines: [2, 3],
      current: map.start,
      message:
        'Mark the start ' + L(map.start) + ' as visited and push it. ' +
        'The stack always holds the route from the start to the cell on top. ' +
        'The graph has V = ' + graph.V + ' safe cells and E = ' + graph.E + ' edges.',
    }, live());

    let needInspect = true;
    while (stack.length) {
      const u = stack[stack.length - 1];

      if (needInspect) {
        needInspect = false;
        if (u === map.gold) {
          const path = stack.slice();
          s.record({
            kind: 'found',
            title: 'Gold found at ' + L(u),
            lines: [5, 6],
            current: u,
            status: 'found',
            path,
            message:
              'The top of the stack is ' + L(u) + ': the gold. Read the stack from bottom to top for the route: ' +
              names(size, path) + ', ' + (path.length - 1) + ' move' + (path.length === 2 ? '' : 's') +
              '. DFS guarantees a valid path, not the shortest one.',
          }, live());
          return { graph, trace, found: true, path, moves: path.length - 1 };
        }
        const list = graph.adj[u];
        s.record({
          kind: 'inspect',
          title: 'Inspect top ' + L(u),
          lines: [5, 6],
          current: u,
          message:
            'Look at the top of the stack: ' + L(u) + ', not the gold. ' +
            (list.length
              ? 'Adj' + L(u) + ' = [' + names(size, list.map((e) => e.to)) + ']. DFS follows the first unvisited one immediately.'
              : 'Adj' + L(u) + ' is empty, so this is a dead end.'),
        }, live());
      }

      const list = graph.adj[u];
      if (nextEdge[u] < list.length) {
        const edge = list[nextEdge[u]];
        nextEdge[u] += 1;
        const v = edge.to;
        s.checks += 1;
        if (s.order[v] !== -1) {
          s.record({
            kind: 'skip',
            title: 'Check ' + L(v) + ' (' + edge.dir + ')',
            lines: [7, 8],
            current: u,
            neighbour: v,
            neighbourDir: edge.dir,
            message:
              'Neighbour ' + L(v) + ' (' + edge.dir + ' of ' + L(u) + ') was already visited, so skip it ' +
              'and try the next neighbour of ' + L(u) + '.',
          }, live());
        } else {
          s.discover(v, u);
          s.states[u] = 'frontier';
          s.states[v] = 'current';
          stack.push(v);
          needInspect = true;
          s.record({
            kind: 'discover',
            title: 'Push ' + L(v) + ' (' + edge.dir + ')',
            lines: [8, 9, 10],
            current: v,
            neighbour: v,
            neighbourDir: edge.dir,
            message:
              'Neighbour ' + L(v) + ' (' + edge.dir + ' of ' + L(u) + ') is unvisited. Mark it, set its parent to ' +
              L(u) + ', and push it. DFS dives into ' + L(v) + ' now and leaves the rest of ' + L(u) +
              '’s neighbours for later.',
          }, live());
        }
      } else {
        stack.pop();
        s.states[u] = 'processed';
        s.processed += 1;
        const back = stack.length ? stack[stack.length - 1] : -1;
        if (back !== -1) s.states[back] = 'current';
        s.record({
          kind: 'backtrack',
          title: 'Backtrack from ' + L(u),
          lines: [11],
          current: back,
          removed: u,
          message:
            'Every neighbour of ' + L(u) + ' has been checked and none leads on. Pop it from the stack' +
            (back !== -1
              ? ' and backtrack to ' + L(back) + ', which resumes with its next unchecked neighbour.'
              : '. The stack is now empty.'),
        }, live());
      }
    }

    s.record({
      kind: 'nopath',
      title: 'No safe path exists',
      lines: [4, 12],
      current: -1,
      status: 'nopath',
      message:
        'The stack is empty and the gold ' + L(map.gold) + ' was never visited. DFS has tried every route from the start, ' +
        'reaching ' + s.discovered + ' cells, so no safe path exists.',
    }, live());
    return { graph, trace, found: false, path: null, moves: null };
  }

  function run(map, algorithmId) {
    if (algorithmId === 'bfs') return bfs(map);
    if (algorithmId === 'dfs') return dfs(map);
    throw new Error('Unknown algorithm "' + algorithmId + '".');
  }

  const api = { ALGORITHMS, BFS_PSEUDOCODE, DFS_PSEUDOCODE, bfs, dfs, run, pathFromParents };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.WumpusNav = global.WumpusNav || {}).Algorithms = api;
})(typeof window !== 'undefined' ? window : globalThis);
