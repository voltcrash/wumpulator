/*
 * Application wiring: holds the current map, tool and algorithm, connects
 * the controls to the player, and asks the renderer to draw.
 */
(function (global) {
  'use strict';

  const NS = global.WumpusNav;
  const { Grid, Algorithms, Player, Render } = NS;
  const $ = (id) => document.getElementById(id);

  const els = {
    board: $('board'),
    cells: $('cells'),
    overlay: $('overlay'),
    notice: $('notice'),
    sizeSelect: $('size-select'),
    startBtn: $('start-btn'),
    playBtn: $('play-btn'),
    prevBtn: $('prev-btn'),
    nextBtn: $('next-btn'),
    resetBtn: $('reset-btn'),
    stepRange: $('step-range'),
    stepCount: $('step-count'),
    speedRange: $('speed-range'),
    speedValue: $('speed-value'),
    structureHeading: $('structure-heading'),
    structureHint: $('structure-hint'),
    structureBody: $('structure-body'),
    legendFrontier: $('legend-frontier'),
    legendFrontierMark: $('legend-frontier-mark'),
    stepKind: $('step-kind'),
    stepTitle: $('step-title'),
    stepMessage: $('step-message'),
    pseudocode: $('pseudocode'),
    verdict: $('verdict'),
    verdictValue: $('verdict-value'),
    verdictNote: $('verdict-note'),
    cDiscovered: $('c-discovered'),
    cProcessed: $('c-processed'),
    cFrontier: $('c-frontier'),
    cMax: $('c-max'),
    cChecks: $('c-checks'),
    cMoves: $('c-moves'),
    graphSize: $('graph-size'),
    adjacency: $('adjacency'),
    orderCompare: $('order-compare'),
    costTable: $('cost-table'),
  };

  const IDLE_MESSAGE =
    'Choose BFS or DFS, then press Start search. Click cells to edit the map; an edit clears the current run.';

  const app = {
    map: Grid.EXAMPLES.classic.map,
    graph: null,
    algorithm: 'bfs',
    tool: 'pit',
    shortest: null,
  };
  app.graph = Grid.buildGraph(app.map);

  const renderer = Render.createRenderer(els);
  const player = Player.createPlayer({ delay: speedToDelay(els.speedRange.value), onChange: render });

  // ---- speed -------------------------------------------------------------

  // Slider 0..100 maps onto 2 s .. 0.06 s per step on a log scale.
  function speedToDelay(value) {
    const t = Number(value) / 100;
    return Math.round(Player.MAX_DELAY * Math.pow(Player.MIN_DELAY / Player.MAX_DELAY, t));
  }

  function showSpeed() {
    const ms = speedToDelay(els.speedRange.value);
    els.speedValue.textContent = (ms >= 1000 ? (ms / 1000).toFixed(1) : (ms / 1000).toFixed(2)) + ' s per step';
  }

  // ---- notices -----------------------------------------------------------

  function notify(text, tone) {
    els.notice.textContent = text || '';
    els.notice.className = 'notice' + (tone ? ' is-' + tone : '');
  }

  // ---- run management ----------------------------------------------------

  function hasRun() {
    return player.getState().hasTrace;
  }

  function buildRun() {
    const result = Algorithms.run(app.map, app.algorithm);
    app.shortest = app.algorithm === 'dfs' ? Algorithms.bfs(app.map).moves : result.moves;
    player.load(result.trace);
  }

  function startSearch() {
    notify('');
    buildRun();
    player.play();
  }

  function clearRun(reason) {
    const had = hasRun();
    player.reset();
    app.shortest = null;
    return had ? reason : '';
  }

  function setMap(next, message) {
    const cleared = clearRun(' The previous run was cleared.');
    app.map = next;
    app.graph = Grid.buildGraph(next);
    els.sizeSelect.value = String(next.size);
    notify((message || '') + cleared, 'info');
    render(player.getState());
  }

  function setAlgorithm(id) {
    if (id === app.algorithm) return;
    app.algorithm = id;
    document.querySelectorAll('.algo-option').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.algo === id));
    });
    document.body.dataset.algo = id;
    const cleared = clearRun(' The previous run was cleared.');
    notify('Switched to ' + Algorithms.ALGORITHMS[id].name + '.' + cleared, 'info');
    render(player.getState());
  }

  function setTool(tool) {
    app.tool = tool;
    document.querySelectorAll('.tool').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.tool === tool));
    });
  }

  // ---- drawing -----------------------------------------------------------

  function render(state) {
    const snap = state.snapshot;
    renderer.renderBoard(app.map, snap, app.algorithm);
    renderer.renderStructure(app.map, snap, app.algorithm);
    renderer.renderPseudocode(app.algorithm, snap);
    renderer.renderExplanation(snap, IDLE_MESSAGE);
    renderer.renderResults(snap, { shortest: app.shortest, length: state.length });
    renderer.renderAdjacency(app.map, app.graph, snap);
    renderer.renderOrder(app.map, snap);
    renderer.renderCost(app.graph, snap, state.length);
    renderControls(state);
  }

  function renderControls(state) {
    els.playBtn.classList.toggle('is-playing', state.playing);
    els.playBtn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    els.prevBtn.disabled = !state.hasTrace || state.atStart;
    els.nextBtn.disabled = state.hasTrace && state.atEnd;
    els.resetBtn.disabled = !state.hasTrace;
    els.startBtn.textContent = state.hasTrace ? 'Restart search' : 'Start search';

    els.stepRange.disabled = !state.hasTrace;
    els.stepRange.max = String(Math.max(0, state.length - 1));
    els.stepRange.value = String(Math.max(0, state.index));
    els.stepCount.textContent = state.hasTrace
      ? 'Step ' + (state.index + 1) + ' of ' + state.length
      : 'Not started';
    document.body.classList.toggle('is-running', state.hasTrace);
  }

  // ---- events ------------------------------------------------------------

  els.cells.addEventListener('click', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) return;
    const res = Grid.applyTool(app.map, app.tool, Number(cell.dataset.index));
    if (!res.ok) notify(res.message, 'error');
    else if (res.changed) setMap(res.map, res.message);
    else notify(res.message, 'info');
  });

  document.querySelectorAll('.tool').forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  document.querySelectorAll('.algo-option').forEach((btn) => {
    btn.addEventListener('click', () => setAlgorithm(btn.dataset.algo));
  });

  document.querySelectorAll('.preset[data-example]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ex = Grid.EXAMPLES[btn.dataset.example];
      setMap(ex.map, 'Loaded "' + ex.name + '". ' + ex.description);
    });
  });

  $('random-btn').addEventListener('click', () => {
    const next = Grid.randomMap(app.map.size);
    setMap(next, 'Generated a random ' + next.size + ' × ' + next.size + ' map with ' + next.pits.length + ' pits.');
  });

  els.sizeSelect.addEventListener('change', () => {
    const next = Grid.resizeMap(app.map, Number(els.sizeSelect.value));
    setMap(next, 'Resized the grid to ' + next.size + ' × ' + next.size + '.');
  });

  els.startBtn.addEventListener('click', startSearch);

  els.playBtn.addEventListener('click', () => {
    if (!hasRun()) startSearch();
    else player.toggle();
  });

  els.nextBtn.addEventListener('click', () => {
    if (!hasRun()) buildRun();
    else player.next();
  });

  els.prevBtn.addEventListener('click', () => player.previous());

  els.resetBtn.addEventListener('click', () => {
    clearRun('');
    notify('Run reset. The map is unchanged.', 'info');
  });

  els.stepRange.addEventListener('input', () => player.seek(Number(els.stepRange.value)));

  els.speedRange.addEventListener('input', () => {
    showSpeed();
    player.setDelay(speedToDelay(els.speedRange.value));
  });

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (event.key === ' ' && tag !== 'BUTTON') {
      event.preventDefault();
      els.playBtn.click();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!els.nextBtn.disabled) els.nextBtn.click();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (!els.prevBtn.disabled) els.prevBtn.click();
    } else if (event.key === 'r' || event.key === 'R') {
      if (!els.resetBtn.disabled) els.resetBtn.click();
    }
  });

  // ---- boot --------------------------------------------------------------

  document.body.dataset.algo = app.algorithm;
  setTool(app.tool);
  showSpeed();
  els.sizeSelect.value = String(app.map.size);
  render(player.getState());

  // Exposed for debugging in the browser console.
  NS.app = { state: app, player };
})(window);
