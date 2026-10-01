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
    inspect: 'Inspect top',
    discover: 'Discover',
    skip: 'Already seen',
    backtrack: 'Backtrack',
    found: 'Gold found',
    nopath: 'No path',
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

  function moves(n) {
    return n + (n === 1 ? ' move' : ' moves');
  }

  function createRenderer(els) {
    let cellNodes = [];
    let builtSize = 0;
    let lastOverlayKey = '';

    function buildCells(size) {
      els.cells.textContent = '';
      els.boardFrame.style.setProperty('--n', size);
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
            item: el('span', 'cell-item'),
          };
          btn.append(parts.order, parts.item);
          row.appendChild(btn);
          cellNodes.push(parts);
        }
        els.cells.appendChild(row);
      }

      els.axisCols.textContent = '';
      els.axisRows.textContent = '';
      for (let k = 0; k < size; k++) {
        els.axisCols.appendChild(el('span', '', String(k)));
        els.axisRows.appendChild(el('span', '', String(k)));
      }

      builtSize = size;
      lastOverlayKey = '';
    }

    function renderBoard(map, snapshot, editing) {
      const size = map.size;
      if (builtSize !== size) buildCells(size);
      const onRoute = new Set(snapshot && snapshot.path ? snapshot.path : []);
      els.boardFrame.classList.toggle('is-editing', !!editing);

      for (let i = 0; i < size * size; i++) {
        const parts = cellNodes[i];
        const type = Grid.cellType(map, i);
        const hazard = type === 'pit' || type === 'wumpus';
        const state = snapshot && !hazard ? snapshot.states[i] : 'undiscovered';
        const isNeighbour = snapshot && snapshot.neighbour === i && state !== 'current';

        parts.root.className =
          'cell type-' + type + ' state-' + state +
          (onRoute.has(i) ? ' on-route' : '') +
          (isNeighbour ? ' is-neighbour' : '');

        parts.item.textContent = ITEMS[type] ? ITEMS[type].icon : '';

        const order = snapshot ? snapshot.order[i] : -1;
        parts.order.textContent = order >= 0 ? String(order + 1) : '';

        const desc = [Grid.label(size, i)];
        if (type !== 'empty') desc.push(ITEMS[type].name);
        if (hazard) desc.push('impassable');
        else if (snapshot) desc.push(STATE_TEXT[state]);
        if (order >= 0) desc.push('discovered ' + ordinal(order + 1));
        if (onRoute.has(i)) desc.push('on the route');
        parts.root.setAttribute('aria-label', desc.join(', '));
      }

      renderOverlay(map, snapshot);
    }

    function ordinal(n) {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
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
      const trim = 0.24;
      return svg('line', {
        class: className,
        x1: a.x + (dx / len) * trim,
        y1: a.y + (dy / len) * trim,
        x2: b.x - (dx / len) * trim,
        y2: b.y - (dy / len) * trim,
        'marker-end': 'url(#head-' + className + ')',
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
          id: 'head-' + name, viewBox: '0 0 10 10', refX: '7', refY: '5',
          markerWidth: '3', markerHeight: '3', orient: 'auto-start-reverse',
        });
        marker.appendChild(svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'fill-' + name }));
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
      els.legendFrontier.textContent = isQueue ? 'In the queue' : 'On the stack';
      els.frontierLabel.textContent = isQueue ? 'In queue' : 'On stack';

      const body = els.structureBody;
      body.textContent = '';
      body.className = 'tape ' + (isQueue ? 'is-queue' : 'is-stack');

      if (!snapshot) {
        body.appendChild(el('p', 'tape-empty', isQueue
          ? 'Cells wait here in first-in, first-out order.'
          : 'Cells pile up here; the newest is on top.'));
        return;
      }

      const items = snapshot.structure;
      if (!items.length) {
        body.appendChild(el('p', 'tape-empty', isQueue ? 'The queue is empty.' : 'The stack is empty.'));
      } else {
        // The end labels sit inside the list so they wrap with the cells.
        const list = el('ol', 'tape-items');
        list.setAttribute('aria-label', isQueue ? 'Queue from front to rear' : 'Stack from bottom to top');
        const endLabel = (text) => {
          const li = el('li', 'tape-end', text);
          li.setAttribute('aria-hidden', 'true');
          return li;
        };
        list.appendChild(endLabel(isQueue ? 'front' : 'bottom'));
        const added = snapshot.kind === 'discover' ? snapshot.neighbour : -1;
        items.forEach((v, k) => {
          const li = el('li', 'tape-item', Grid.label(map.size, v));
          if (v === added) li.classList.add('is-new');
          if (isQueue && k === 0) li.classList.add('is-next');
          if (!isQueue && k === items.length - 1) li.classList.add('is-next');
          list.appendChild(li);
        });
        list.appendChild(endLabel(isQueue ? 'rear' : 'top'));
        body.appendChild(list);
      }

      if (snapshot.removed >= 0) {
        const verb = snapshot.kind === 'backtrack' ? 'Popped' : 'Dequeued';
        body.appendChild(el('p', 'tape-removed', verb + ' ' + Grid.label(map.size, snapshot.removed)));
      }
    }

    function renderPseudocode(algorithmId, snapshot) {
      const lines = Algorithms.ALGORITHMS[algorithmId].pseudocode;
      const active = new Set(snapshot ? snapshot.lines : []);
      const list = els.pseudocode;
      list.textContent = '';
      lines.forEach((line, k) => {
        const on = active.has(k + 1);
        const li = el('li', 'code-line' + (on ? ' is-active' : ''));
        li.appendChild(el('code', '', line.text));
        if (line.note) li.appendChild(el('span', 'code-note', line.note));
        if (on) li.setAttribute('aria-current', 'step');
        list.appendChild(li);
      });
    }

    function renderStep(snapshot, state, algorithmId) {
      const name = Algorithms.ALGORITHMS[algorithmId].short;
      if (!snapshot) {
        els.stepIndex.textContent = 'Ready';
        els.stepKind.textContent = '';
        els.stepKind.className = 'step-kind';
        els.stepTitle.textContent = 'Press Start to watch ' + name + ' search the cave';
        els.stepMessage.textContent = algorithmId === 'bfs'
          ? 'BFS fans out ring by ring from the start, so the first time it reaches the gold it has found a shortest route.'
          : 'DFS follows one corridor as far as it can, then backtracks. It finds a route if one exists, but not always the shortest.';
        return;
      }
      els.stepIndex.textContent = 'Step ' + (state.index + 1) + ' of ' + state.length;
      els.stepKind.textContent = KIND_TEXT[snapshot.kind] || snapshot.kind;
      els.stepKind.className = 'step-kind kind-' + snapshot.kind;
      els.stepTitle.textContent = snapshot.title;
      els.stepMessage.textContent = snapshot.message;
    }

    function renderResults(snapshot, shortest) {
      const c = snapshot ? snapshot.counters : null;
      els.cDiscovered.textContent = c ? c.discovered : '0';
      els.cProcessed.textContent = c ? c.processed : '0';
      els.cFrontier.textContent = c ? c.frontier : '0';
      els.cChecks.textContent = c ? c.checks : '0';

      const verdict = els.verdict;
      if (!snapshot || snapshot.status === 'searching') {
        els.cMoves.textContent = '–';
        verdict.hidden = true;
        return;
      }
      verdict.hidden = false;
      if (snapshot.status === 'found') {
        verdict.className = 'verdict is-found';
        els.cMoves.textContent = moves(snapshot.moves);
        els.verdictValue.textContent = 'Route found: ' + moves(snapshot.moves);
        if (snapshot.algorithm === 'bfs') {
          els.verdictNote.textContent = 'BFS guarantees no shorter safe route exists.';
        } else if (shortest !== null && shortest < snapshot.moves) {
          els.verdictNote.textContent = 'Valid, but not the shortest. BFS needs only ' + moves(shortest) + '.';
        } else {
          els.verdictNote.textContent = 'Valid, and this time as short as possible. DFS does not promise that.';
        }
      } else {
        verdict.className = 'verdict is-nopath';
        els.cMoves.textContent = 'none';
        els.verdictValue.textContent = 'No safe path exists';
        els.verdictNote.textContent = 'Every cell reachable from the start was explored; the gold was not among them.';
      }
    }

    function renderAdjacency(map, graph, snapshot) {
      const size = map.size;
      const hazards = map.pits.length + 1;
      els.graphSize.textContent =
        'This map has V = ' + graph.V + ' vertices and E = ' + graph.E + ' edges, so the lists hold ' +
        2 * graph.E + ' entries. ' + hazards + ' hazard cell' + (hazards === 1 ? ' is' : 's are') + ' left out.';

      const current = snapshot ? snapshot.current : -1;
      const nb = snapshot ? snapshot.neighbour : -1;
      const nbFrom = snapshot && nb >= 0 ? (snapshot.kind === 'discover' ? snapshot.parent[nb] : snapshot.current) : -1;
      const box = els.adjacency;
      box.textContent = '';
      let activeRow = null;
      for (const v of graph.vertices) {
        const row = el('div', 'adj-row');
        if (v === nbFrom || (nbFrom < 0 && v === current)) {
          row.classList.add('is-current');
          activeRow = row;
        }
        row.appendChild(el('span', 'adj-vertex', Grid.label(size, v)));
        const list = el('span', 'adj-list');
        const edges = graph.adj[v];
        if (!edges.length) list.appendChild(el('span', 'adj-none', 'none'));
        for (const e of edges) {
          const item = el('span', 'adj-item', Grid.label(size, e.to));
          item.title = e.dir;
          if (v === nbFrom && e.to === nb) item.classList.add('is-checking');
          list.appendChild(item);
        }
        row.appendChild(list);
        box.appendChild(row);
      }
      if (activeRow && box.offsetParent) {
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
        box.appendChild(el('p', 'muted', 'Run a search to compare the order cells were discovered with the route returned.'));
        return;
      }
      const size = map.size;
      const discovered = [];
      snapshot.order.forEach((o, v) => { if (o >= 0) discovered[o] = v; });
      const route = new Set(snapshot.path || []);

      box.appendChild(el('h3', 'order-label', 'Discovered, in order (' + discovered.length + ')'));
      const seq = el('ol', 'order-seq');
      discovered.forEach((v) => seq.appendChild(el('li', route.has(v) ? 'is-route' : '', Grid.label(size, v))));
      box.appendChild(seq);

      box.appendChild(el('h3', 'order-label', 'Route'));
      if (snapshot.path) {
        const list = el('ol', 'order-seq');
        snapshot.path.forEach((v) => list.appendChild(el('li', 'is-route', Grid.label(size, v))));
        box.appendChild(list);
        const extra = discovered.length - snapshot.path.length;
        box.appendChild(el('p', 'muted', extra > 0
          ? extra + ' discovered cell' + (extra === 1 ? ' is' : 's are') + ' not on the route.'
          : 'Every discovered cell ended up on the route this time.'));
      } else {
        box.appendChild(el('p', 'muted', snapshot.status === 'nopath'
          ? 'None. The gold cannot be reached.'
          : 'Known once the search finishes.'));
      }
    }

    function renderCost(graph, snapshot, traceLength) {
      const box = els.costTable;
      box.textContent = '';
      const rows = [
        ['Vertices, V', graph.V],
        ['Edges, E', graph.E],
        ['V + E', graph.V + graph.E],
        ['List entries, 2E', 2 * graph.E],
        ['Neighbour checks so far', snapshot ? snapshot.counters.checks : 0],
        ['Cells discovered so far', snapshot ? snapshot.counters.discovered : 0],
        ['Largest queue or stack', snapshot ? snapshot.counters.maxFrontier : 0],
        ['Recorded steps', traceLength || 0],
      ];
      for (const [k, v] of rows) {
        const wrap = el('div');
        wrap.append(el('dt', '', k), el('dd', '', String(v)));
        box.appendChild(wrap);
      }
    }

    return {
      renderBoard, renderStructure, renderPseudocode, renderStep,
      renderResults, renderAdjacency, renderOrder, renderCost,
    };
  }

  (global.WumpusNav = global.WumpusNav || {}).Render = { createRenderer };
})(window);
