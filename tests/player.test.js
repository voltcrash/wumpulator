'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Grid = require('../js/grid.js');
const Algorithms = require('../js/algorithms.js');
const { createPlayer } = require('../js/player.js');

// Manual clock so timer behaviour can be tested without real waiting.
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    schedule(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    cancel(id) {
      timers.delete(id);
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        let soonest = null;
        for (const [id, t] of timers) {
          if (t.at <= until && (!soonest || t.at < soonest[1].at)) soonest = [id, t];
        }
        if (!soonest) break;
        timers.delete(soonest[0]);
        now = soonest[1].at;
        soonest[1].fn();
      }
      now = until;
    },
    pending() {
      return timers.size;
    },
  };
}

function setup() {
  const clock = fakeClock();
  const events = [];
  const player = createPlayer({
    delay: 100,
    schedule: clock.schedule,
    cancel: clock.cancel,
    onChange: (s) => events.push(s),
  });
  const { trace } = Algorithms.bfs(Grid.EXAMPLES.detour.map);
  player.load(trace);
  return { clock, player, trace, events };
}

test('play advances one step per tick and stops at the end', () => {
  const { clock, player, trace } = setup();
  player.play();
  clock.advance(350);
  assert.equal(player.getState().index, 3);
  clock.advance(100 * trace.length);
  const s = player.getState();
  assert.equal(s.index, trace.length - 1);
  assert.equal(s.playing, false);
  assert.equal(clock.pending(), 0);
});

test('pause cancels the pending tick and resume continues from the same step', () => {
  const { clock, player } = setup();
  player.play();
  clock.advance(250);
  player.pause();
  const paused = player.getState().index;
  assert.equal(clock.pending(), 0);
  clock.advance(1000);
  assert.equal(player.getState().index, paused, 'nothing moves while paused');
  player.play();
  clock.advance(100);
  assert.equal(player.getState().index, paused + 1);
});

test('reset cancels playback and clears the trace', () => {
  const { clock, player } = setup();
  player.play();
  clock.advance(150);
  player.reset();
  assert.equal(clock.pending(), 0);
  clock.advance(1000);
  const s = player.getState();
  assert.equal(s.hasTrace, false);
  assert.equal(s.index, -1);
  assert.equal(s.playing, false);
});

test('previous restores the exact earlier snapshot', () => {
  const { player, trace } = setup();
  player.seek(10);
  const tenth = player.getState().snapshot;
  player.next();
  player.next();
  player.previous();
  player.previous();
  const back = player.getState().snapshot;
  assert.equal(back, trace[10]);
  assert.equal(back, tenth);
  assert.deepEqual(back.structure, trace[10].structure);
  assert.deepEqual(back.counters, trace[10].counters);
});

test('next and previous pause autoplay and clamp at the ends', () => {
  const { clock, player, trace } = setup();
  player.play();
  player.next();
  assert.equal(player.getState().playing, false);
  assert.equal(clock.pending(), 0);
  player.seek(0);
  player.previous();
  assert.equal(player.getState().index, 0);
  player.seek(trace.length + 50);
  player.next();
  assert.equal(player.getState().index, trace.length - 1);
});

test('loading a new trace cancels an older pending tick', () => {
  const { clock, player } = setup();
  player.play();
  const { trace: other } = Algorithms.dfs(Grid.EXAMPLES.classic.map);
  player.load(other);
  clock.advance(1000);
  assert.equal(player.getState().index, 0);
  assert.equal(player.getState().snapshot, other[0]);
});

test('play from the last step restarts at the beginning', () => {
  const { clock, player, trace } = setup();
  player.seek(trace.length - 1);
  player.play();
  assert.equal(player.getState().index, 0);
  clock.advance(100);
  assert.equal(player.getState().index, 1);
});

test('changing speed while playing keeps a single timer', () => {
  const { clock, player } = setup();
  player.play();
  player.setDelay(500);
  player.setDelay(200);
  assert.equal(clock.pending(), 1);
  clock.advance(199);
  assert.equal(player.getState().index, 0);
  clock.advance(1);
  assert.equal(player.getState().index, 1);
});
