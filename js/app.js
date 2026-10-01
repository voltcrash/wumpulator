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
    boardFrame: $('board-frame'),
    axisCols: $('axis-cols'),
    axisRows: $('axis-rows'),
    cells: $('cells'),
    overlay: $('overlay'),
    notice: $('notice'),
    toolbarView: $('toolbar-view'),
    toolbarEdit: $('toolbar-edit'),
    exampleSelect: $('example-select'),
    sizeSelect: $('size-select'),
    editBtn: $('edit-btn'),
    doneBtn: $('done-btn'),
    randomBtn: $('random-btn'),
    startBtn: $('start-btn'),
    playBtn: $('play-btn'),
    prevBtn: $('prev-btn'),
    nextBtn: $('next-btn'),
    resetBtn: $('reset-btn'),
    stepRange: $('step-range'),
    stepCount: $('step-count'),
    speedSelect: $('speed-select'),
    legendFrontier: $('legend-frontier'),
    structureHeading: $('structure-heading'),
    structureBody: $('structure-body'),
    frontierLabel: $('c-frontier-label'),
    stepIndex: $('step-index'),
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
    cChecks: $('c-checks'),
    cMoves: $('c-moves'),
    graphSize: $('graph-size'),
    adjacency: $('adjacency'),
    orderCompare: $('order-compare'),
    costTable: $('cost-table'),
  };

  const app = {
    map: Grid.EXAMPLES.classic.map,
    example: 'classic',
    graph: null,
    algorithm: 'bfs',
    tool: 'pit',
    editing: false,
    shortest: null,
  };
  app.graph = Grid.buildGraph(app.map);

  const renderer = Render.createRenderer(els);
  const player = Player.createPlayer({ delay: Number(els.speedSelect.value), onChange: render });

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
    if (app.editing) setEditing(false);
    notify('');
    buildRun();
    player.play();
  }

  // Returns a sentence to append to a notice when a run was discarded.
  function clearRun() {
    const had = hasRun();
    player.reset();
    app.shortest = null;
    return had ? ' The previous run was cleared.' : '';
  }

  function setMap(next, message, example) {
    const cleared = clearRun();
    app.map = next;
    app.graph = Grid.buildGraph(next);
    app.example = example || 'custom';
    els.exampleSelect.value = app.example;
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
    const cleared = clearRun();
    notify(cleared ? 'Switched to ' + Algorithms.ALGORITHMS[id].short + '.' + cleared : '', 'info');
    render(player.getState());
  }

  function setTool(tool) {
    app.tool = tool;
    document.querySelectorAll('.tool').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.tool === tool));
    });
  }

  function setEditing(on) {
    app.editing = on;
    els.toolbarView.hidden = on;
    els.toolbarEdit.hidden = !on;
    els.editBtn.setAttribute('aria-pressed', String(on));
    if (on) {
      player.pause();
      notify('Pick a tool, then click cells. Changing the map clears the current run.', 'info');
      const active = els.toolbarEdit.querySelector('.tool[aria-checked="true"]');
      if (active) active.focus();
    } else {
      notify('');
      els.editBtn.focus();
    }
    render(player.getState());
  }

  // ---- drawing -----------------------------------------------------------

  function render(state) {
    const snap = state.snapshot;
    renderer.renderBoard(app.map, snap, app.editing);
    renderer.renderStructure(app.map, snap, app.algorithm);
    renderer.renderPseudocode(app.algorithm, snap);
    renderer.renderStep(snap, state, app.algorithm);
    renderer.renderResults(snap, app.shortest);
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
    els.startBtn.textContent = state.hasTrace ? 'Restart' : 'Start';

    els.stepRange.disabled = !state.hasTrace;
    els.stepRange.max = String(Math.max(0, state.length - 1));
    els.stepRange.value = String(Math.max(0, state.index));
    els.stepRange.style.setProperty('--fill', state.length > 1 ? (state.index / (state.length - 1)) * 100 + '%' : '0%');
    const stepText = state.hasTrace ? 'Step ' + (state.index + 1) + ' of ' + state.length : 'Not started';
    els.stepRange.setAttribute('aria-valuetext', stepText);
    els.stepCount.textContent = state.hasTrace ? (state.index + 1) + ' / ' + state.length : 'Not started';
  }

  // ---- events: map -------------------------------------------------------

  els.cells.addEventListener('click', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) return;
    if (!app.editing) {
      notify('Choose Edit map to change cells.', 'info');
      return;
    }
    const res = Grid.applyTool(app.map, app.tool, Number(cell.dataset.index));
    if (!res.ok) notify(res.message, 'error');
    else if (res.changed) setMap(res.map, res.message);
    else notify(res.message, 'info');
  });

  document.querySelectorAll('.tool').forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  els.editBtn.addEventListener('click', () => setEditing(!app.editing));
  els.doneBtn.addEventListener('click', () => setEditing(false));

  els.exampleSelect.addEventListener('change', () => {
    const id = els.exampleSelect.value;
    const ex = Grid.EXAMPLES[id];
    if (ex) setMap(ex.map, ex.description, id);
  });

  els.randomBtn.addEventListener('click', () => {
    const next = Grid.randomMap(app.map.size);
    setMap(next, 'Random ' + next.size + ' × ' + next.size + ' map with ' + next.pits.length + ' pits.');
  });

  els.sizeSelect.addEventListener('change', () => {
    const next = Grid.resizeMap(app.map, Number(els.sizeSelect.value));
    setMap(next, 'Grid resized to ' + next.size + ' × ' + next.size + '.');
  });

  document.querySelectorAll('.algo-option').forEach((btn) => {
    btn.addEventListener('click', () => setAlgorithm(btn.dataset.algo));
  });

  // ---- events: playback --------------------------------------------------

  els.startBtn.addEventListener('click', startSearch);

  els.playBtn.addEventListener('click', () => {
    if (!hasRun()) startSearch();
    else player.toggle();
  });

  els.nextBtn.addEventListener('click', () => {
    if (!hasRun()) {
      if (app.editing) setEditing(false);
      buildRun();
    } else {
      player.next();
    }
  });

  els.prevBtn.addEventListener('click', () => player.previous());

  els.resetBtn.addEventListener('click', () => {
    clearRun();
    notify('');
  });

  els.stepRange.addEventListener('input', () => player.seek(Number(els.stepRange.value)));

  els.speedSelect.addEventListener('change', () => player.setDelay(Number(els.speedSelect.value)));

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : document.body;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (target.getAttribute('role') === 'tab') return;
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

  // ---- tabs --------------------------------------------------------------

  const tabs = Array.from(document.querySelectorAll('.tab'));

  function selectTab(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    render(player.getState());
  }

  tabs.forEach((tab, k) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      let next = -1;
      if (event.key === 'ArrowRight') next = (k + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (k - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next >= 0) {
        event.preventDefault();
        tabs[next].focus();
        selectTab(tabs[next]);
      }
    });
  });

  // ---- boot --------------------------------------------------------------

  setTool(app.tool);
  els.exampleSelect.value = app.example;
  els.sizeSelect.value = String(app.map.size);
  render(player.getState());

  // Exposed for debugging in the browser console.
  NS.app = { state: app, player };
})(window);
