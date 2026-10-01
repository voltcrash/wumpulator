/*
 * DOM rendering. Every function here draws from a map, a graph and (when a
 * run is loaded) one frozen snapshot. Nothing in this file changes the
 * algorithm state or the playback position.
 */
(function (global) {
  'use strict';

  const NS = global.WumpusNav;
  const Grid = NS.Grid;
  const Algorithms = NS.Algorithms;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const ITEMS = {
    start: { icon: '🧭', name: 'Start' },
    gold: { icon: '💰', name: 'Gold' },
    pit: { icon: '🕳️', name: 'Pit' },
    wumpus: { icon: '👹', name: 'Wumpus' },
  };

  const STATE_TEXT = {
    undiscovered: 'undiscovered',
    frontier: 'discovered, waiting',
    current: 'current cell',
    processed: 'processed',
  };

  const KIND_TEXT = {
    init: 'Initialise',
    dequeue: 'Dequeue',
    inspect: 'Inspect stack',
    discover: 'Discover',
    skip: 'Already seen',
    backtrack: 'Backtrack',
    found: 'Finished',
    nopath: 'Finished',
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svg(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  }

  function parentArrow(size, i, parent) {
    if (parent < 0) return '';
    const a = Grid.toRC(size, i);
    const b = Grid.toRC(size, parent);
    if (b.r < a.r) return '↑';
    if (b.r > a.r) return '↓';
    if (b.c > a.c) return '→';
    return '←';
  }

  function createRenderer(els) {
    let cellNodes = [];
    let builtSize = 0;
    let lastOverlayKey = '';

    function buildCells(size) {
      els.cells.textContent = '';
      els.cells.style.setProperty('--n', size);
      els.board.style.setProperty('--n', size);
      cellNodes = [];
      for (let r = 0; r < size; r++) {
        const row = el('div', 'row');
        row.setAttribute('role', 'row');
        for (let c = 0; c < size; c++) {
          const i = Grid.index(size, r, c);
          const btn = el('button', 'cell');
          btn.type = 'button';
          btn.dataset.index = String(i);
          btn.setAttribute('role', 'gridcell');
          const parts = {
            root: btn,
            order: el('span', 'cell-order'),
            badge: el('span', 'cell-badge'),
            item: el('span', 'cell-item'),
            coord: el('span', 'cell-coord', Grid.label(size, i)),
            parent: el('span', 'cell-parent'),
            step: el('span', 'cell-step'),
          };
          btn.append(parts.order, parts.badge, parts.item, parts.coord, parts.parent, parts.step);
          row.appendChild(btn);
          cellNodes.push(parts);
        }
        els.cells.appendChild(row);
      }
      builtSize = size;
      lastOverlayKey = '';
    }

    function renderBoard(map, snapshot, algorithmId) {
      const size = map.size;
      if (builtSize !== size) buildCells(size);
      const pathIndex = new Map();
      if (snapshot && snapshot.path) snapshot.path.forEach((v, k) => pathIndex.set(v, k));
      const frontierMark = algorithmId === 'dfs' ? 'S' : 'Q';

      for (let i = 0; i < size * size; i++) {
        const parts = cellNodes[i];
        const type = Grid.cellType(map, i);
        const hazard = type === 'pit' || type === 'wumpus';
        const state = snapshot && !hazard ? snapshot.states[i] : 'undiscovered';
        const onPath = pathIndex.has(i);
        const isNeighbour = snapshot && snapshot.neighbour === i;

        parts.root.className =
          'cell type-' + type + ' state-' + state +
          (hazard ? ' is-hazard' : '') +
          (onPath ? ' on-path' : '') +
          (isNeighbour ? ' is-neighbour' : '');

        parts.item.textContent = '';
        if (ITEMS[type]) {
          parts.item.append(el('span', 'item-icon', ITEMS[type].icon), el('span', 'item-name', ITEMS[type].name));
        }

        const order = snapshot ? snapshot.order[i] : -1;
        parts.order.textContent = order >= 0 ? '#' + (order + 1) : '';

        let badge = '';
        if (state === 'frontier') badge = frontierMark;
        else if (state === 'current') badge = '▶';
        else if (state === 'processed') badge = '✓';
        parts.badge.textContent = badge;

        parts.parent.textContent = snapshot ? parentArrow(size, i, snapshot.parent[i]) : '';
        parts.step.textContent = onPath && pathIndex.get(i) > 0 ? String(pathIndex.get(i)) : '';

        const desc = [Grid.label(size, i)];
        if (type !== 'empty') desc.push(ITEMS[type].name);
        if (hazard) desc.push('impassable');
        else if (snapshot) desc.push(STATE_TEXT[state]);
        if (order >= 0) desc.push('discovered #' + (order + 1));
        if (onPath) desc.push('path move ' + pathIndex.get(i));
        parts.root.setAttribute('aria-label', desc.join(', '));
      }

      renderOverlay(map, snapshot);
    }

    function centre(size, i) {
      const { r, c } = Grid.toRC(size, i);
      return { x: c + 0.5, y: r + 0.5 };
    }

    function arrow(size, from, to, className) {
      const a = centre(size, from);
      const b = centre(size, to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const trim = 0.22;
      return svg('line', {
        class: className,
        x1: a.x + (dx / len) * trim,
        y1: a.y + (dy / len) * trim,
        x2: b.x - (dx / len) * trim,
        y2: b.y - (dy / len) * trim,
        'marker-end': 'url(#arrowhead-' + className + ')',
      });
    }

    function renderOverlay(map, snapshot) {
      const size = map.size;
      const key = size + ':' + (snapshot ? snapshot.algorithm + snapshot.index : 'none');
      if (key === lastOverlayKey) return;
      lastOverlayKey = key;

      const root = els.overlay;
      root.textContent = '';
      root.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
      const defs = svg('defs', {});
      for (const name of ['edge-new', 'edge-old', 'edge-back']) {
        const marker = svg('marker', {
          id: 'arrowhead-' + name, viewBox: '0 0 10 10', refX: '7', refY: '5',
          markerWidth: '3.2', markerHeight: '3.2', orient: 'auto-start-reverse',
        });
        marker.appendChild(svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'head-' + name }));
        defs.appendChild(marker);
      }
      root.appendChild(defs);
      if (!snapshot) return;

      if (snapshot.path && snapshot.path.length > 1) {
        const points = snapshot.path.map((v) => {
          const p = centre(size, v);
          return p.x + ',' + p.y;
        }).join(' ');
        root.appendChild(svg('polyline', { class: 'route', points, pathLength: '1' }));
      }

      const nb = snapshot.neighbour;
      if (nb >= 0) {
        const from = snapshot.kind === 'discover' ? snapshot.parent[nb] : snapshot.current;
        if (from >= 0) root.appendChild(arrow(size, from, nb, snapshot.kind === 'discover' ? 'edge-new' : 'edge-old'));
      }
      if (snapshot.kind === 'backtrack' && snapshot.removed >= 0 && snapshot.current >= 0) {
        root.appendChild(arrow(size, snapshot.removed, snapshot.current, 'edge-back'));
      }
    }

    function renderStructure(map, snapshot, algorithmId) {
      const isQueue = algorithmId !== 'dfs';
      els.structureHeading.textContent = isQueue ? 'Queue' : 'Stack';
      els.structureHint.textContent = isQueue
        ? 'First in, first out: dequeue at the front, enqueue at the rear'
        : 'Last in, first out: push and pop at the top';
      els.legendFrontier.textContent = isQueue ? 'Discovered, in the queue' : 'Discovered, on the stack';
      els.legendFrontierMark.textContent = isQueue ? 'Q' : 'S';
      els.structureBody.className = 'structure-body ' + (isQueue ? 'is-queue' : 'is-stack');

      const body = els.structureBody;
      body.textContent = '';
      if (!snapshot) {
        body.appendChild(el('p', 'structure-empty', isQueue
          ? 'The queue appears here when the search starts.'
          : 'The stack appears here when the search starts.'));
        return;
      }

      const items = snapshot.structure.slice();
      const list = el('ol', 'ds-list');
      list.setAttribute('aria-label', isQueue ? 'Queue from front to rear' : 'Stack from top to bottom');
      const ordered = isQueue ? items : items.slice().reverse();
      const added = snapshot.kind === 'discover' ? snapshot.neighbour : -1;
      ordered.forEach((v, k) => {
        const li = el('li', 'ds-item');
        if (v === added) li.classList.add('is-new');
        if (!isQueue && k === 0) li.classList.add('is-top');
        if (isQueue && k === 0) li.classList.add('is-front');
        li.appendChild(el('span', 'ds-cell', Grid.label(map.size, v)));
        let tag = '';
        if (isQueue && k === 0) tag = 'front';
        if (isQueue && k === ordered.length - 1) tag = tag ? 'front, rear' : 'rear';
        if (!isQueue && k === 0) tag = 'top';
        if (!isQueue && k === ordered.length - 1) tag = tag ? 'top, bottom' : 'bottom';
        if (tag) li.appendChild(el('span', 'ds-tag', tag));
        list.appendChild(li);
      });
      if (!items.length) {
        body.appendChild(el('p', 'structure-empty', isQueue ? 'Queue is empty.' : 'Stack is empty.'));
      } else {
        body.appendChild(list);
      }

      if (snapshot.removed >= 0) {
        const verb = snapshot.kind === 'backtrack' ? 'Just popped' : 'Just dequeued';
        body.appendChild(el('p', 'ds-removed', verb + ': ' + Grid.label(map.size, snapshot.removed)));
      }
    }

    function renderPseudocode(algorithmId, snapshot) {
      const lines = Algorithms.ALGORITHMS[algorithmId].pseudocode;
      const active = new Set(snapshot ? snapshot.lines : []);
      const list = els.pseudocode;
      list.textContent = '';
      lines.forEach((line, k) => {
        const li = el('li', 'code-line' + (active.has(k + 1) ? ' is-active' : ''));
        li.appendChild(el('code', '', line.text));
        if (line.note) li.appendChild(el('span', 'code-note', line.note));
        if (active.has(k + 1)) li.setAttribute('aria-current', 'step');
        list.appendChild(li);
      });
    }

    function renderExplanation(snapshot, idleMessage) {
      if (!snapshot) {
        els.stepKind.textContent = '';
        els.stepKind.className = 'step-kind';
        els.stepTitle.textContent = 'Ready when you are';
        els.stepMessage.textContent = idleMessage;
        return;
      }
      els.stepKind.textContent = KIND_TEXT[snapshot.kind] || snapshot.kind;
      els.stepKind.className = 'step-kind kind-' + snapshot.kind;
      els.stepTitle.textContent = snapshot.title;
      els.stepMessage.textContent = snapshot.message;
    }

    function renderResults(snapshot, extras) {
      const c = snapshot ? snapshot.counters : null;
      els.cDiscovered.textContent = c ? c.discovered : '0';
      els.cProcessed.textContent = c ? c.processed : '0';
      els.cFrontier.textContent = c ? c.frontier : '0';
      els.cMax.textContent = c ? c.maxFrontier : '0';
      els.cChecks.textContent = c ? c.checks : '0';

      const verdict = els.verdict;
      verdict.className = 'verdict';
      if (!snapshot) {
        els.cMoves.textContent = '–';
        els.verdictValue.textContent = 'Not run yet';
        els.verdictNote.textContent = 'Press Start search to explore the cave.';
        return;
      }
      if (snapshot.status === 'found') {
        verdict.classList.add('is-found');
        els.cMoves.textContent = snapshot.moves + (snapshot.moves === 1 ? ' move' : ' moves');
        els.verdictValue.textContent = 'Path found: ' + snapshot.moves + (snapshot.moves === 1 ? ' move' : ' moves');
        if (snapshot.algorithm === 'bfs') {
          els.verdictNote.textContent = 'BFS guarantees this is a shortest safe path.';
        } else if (extras && extras.shortest !== null && extras.shortest < snapshot.moves) {
          els.verdictNote.textContent = 'A valid route, but not the shortest: BFS needs only ' + extras.shortest + '.';
        } else {
          els.verdictNote.textContent = 'A valid route. This time it happens to be as short as possible, but DFS does not promise that.';
        }
      } else if (snapshot.status === 'nopath') {
        verdict.classList.add('is-nopath');
        els.cMoves.textContent = 'none';
        els.verdictValue.textContent = 'No safe path exists';
        els.verdictNote.textContent = 'Every cell reachable from the start was explored and the gold was not among them.';
      } else {
        verdict.classList.add('is-running');
        els.cMoves.textContent = '–';
        els.verdictValue.textContent = 'Searching';
        els.verdictNote.textContent = 'Step ' + (snapshot.index + 1) + ' of ' + extras.length + '.';
      }
    }

    function renderAdjacency(map, graph, snapshot) {
      const size = map.size;
      const hazards = map.pits.length + 1;
      els.graphSize.textContent =
        'This map: V = ' + graph.V + ' vertices, E = ' + graph.E + ' edges (' + 2 * graph.E +
        ' adjacency-list entries). ' + hazards + ' hazard cell' + (hazards === 1 ? ' is' : 's are') + ' left out.';

      const current = snapshot ? snapshot.current : -1;
      const nb = snapshot ? snapshot.neighbour : -1;
      const nbFrom = snapshot && nb >= 0 ? (snapshot.kind === 'discover' ? snapshot.parent[nb] : snapshot.current) : -1;
      const box = els.adjacency;
      box.textContent = '';
      let activeRow = null;
      for (const v of graph.vertices) {
        const row = el('div', 'adj-row');
        if (v === current || v === nbFrom) row.classList.add('is-current');
        if (v === current) activeRow = row;
        row.appendChild(el('span', 'adj-vertex', Grid.label(size, v)));
        const list = el('span', 'adj-list');
        const edges = graph.adj[v];
        if (!edges.length) list.appendChild(el('span', 'adj-none', 'no neighbours'));
        for (const e of edges) {
          const item = el('span', 'adj-item', Grid.label(size, e.to));
          item.title = e.dir;
          if (v === nbFrom && e.to === nb) item.classList.add('is-checking');
          list.appendChild(item);
        }
        row.appendChild(list);
        box.appendChild(row);
      }
      if (activeRow) {
        const top = activeRow.offsetTop - box.offsetTop;
        if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - activeRow.offsetHeight) {
          box.scrollTop = Math.max(0, top - box.clientHeight / 3);
        }
      }
    }

    function renderOrder(map, snapshot) {
      const box = els.orderCompare;
      box.textContent = '';
      if (!snapshot) {
        box.appendChild(el('p', 'muted', 'Run a search to compare its discovery order with the route it returns.'));
        return;
      }
      const size = map.size;
      const discovered = [];
      snapshot.order.forEach((o, v) => { if (o >= 0) discovered[o] = v; });
      const onPath = new Set(snapshot.path || []);

      const row1 = el('div', 'order-row');
      row1.appendChild(el('span', 'order-label', 'Discovered so far (' + discovered.length + ')'));
      const seq = el('ol', 'order-seq');
      discovered.forEach((v) => {
        const li = el('li', onPath.has(v) ? 'is-route' : '', Grid.label(size, v));
        seq.appendChild(li);
      });
      row1.appendChild(seq);
      box.appendChild(row1);

      const row2 = el('div', 'order-row');
      row2.appendChild(el('span', 'order-label', 'Final route'));
      if (snapshot.path) {
        const route = el('ol', 'order-seq is-route-list');
        snapshot.path.forEach((v) => route.appendChild(el('li', 'is-route', Grid.label(size, v))));
        row2.appendChild(route);
        const wasted = discovered.length - snapshot.path.length;
        box.appendChild(row2);
        box.appendChild(el('p', 'muted',
          wasted > 0
            ? wasted + ' discovered cell' + (wasted === 1 ? ' was' : 's were') + ' explored but are not on the route.'
            : 'Every discovered cell ended up on the route this time.'));
      } else if (snapshot.status === 'nopath') {
        row2.appendChild(el('span', 'order-none', 'None: the gold is unreachable.'));
        box.appendChild(row2);
      } else {
        row2.appendChild(el('span', 'order-none', 'Not known until the search finishes.'));
        box.appendChild(row2);
      }
    }

    function renderCost(graph, snapshot, traceLength) {
      const box = els.costTable;
      box.textContent = '';
      const rows = [
        ['Vertices V', graph.V],
        ['Edges E', graph.E],
        ['V + E', graph.V + graph.E],
        ['Adjacency entries 2E (max neighbour checks)', 2 * graph.E],
        ['Neighbour checks so far', snapshot ? snapshot.counters.checks : 0],
        ['Cells discovered so far (max V)', snapshot ? snapshot.counters.discovered : 0],
        ['Largest queue or stack (max V)', snapshot ? snapshot.counters.maxFrontier : 0],
        ['Recorded steps in this run', traceLength || 0],
      ];
      for (const [k, v] of rows) {
        const wrap = el('div');
        wrap.append(el('dt', '', k), el('dd', '', String(v)));
        box.appendChild(wrap);
      }
    }

    return {
      renderBoard, renderStructure, renderPseudocode, renderExplanation,
      renderResults, renderAdjacency, renderOrder, renderCost,
    };
  }

  (global.WumpusNav = global.WumpusNav || {}).Render = { createRenderer };
})(window);
