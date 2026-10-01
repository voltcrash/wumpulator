/*
 * Playback controller. It owns the step index and the autoplay timer and
 * nothing else: it replays a precomputed trace of frozen snapshots.
 *
 * Every pause, step, seek, reset or reload bumps a generation counter, so a
 * timer callback that was already queued can never advance the trace after
 * the user has stopped it.
 */
(function (global) {
  'use strict';

  const MIN_DELAY = 60;
  const MAX_DELAY = 2000;

  function createPlayer(options) {
    const opts = Object.assign({
      delay: 700,
      onChange: function () {},
      schedule: function (fn, ms) { return setTimeout(fn, ms); },
      cancel: function (id) { clearTimeout(id); },
    }, options);

    let trace = null;
    let index = -1;
    let playing = false;
    let timer = null;
    let generation = 0;
    let delay = clampDelay(opts.delay);

    function clampDelay(ms) {
      const v = Number(ms);
      if (!Number.isFinite(v)) return 700;
      return Math.min(MAX_DELAY, Math.max(MIN_DELAY, v));
    }

    function lastIndex() {
      return trace ? trace.length - 1 : -1;
    }

    function stopTimer() {
      generation += 1;
      if (timer !== null) {
        opts.cancel(timer);
        timer = null;
      }
    }

    function emit() {
      opts.onChange(getState());
    }

    function getState() {
      return {
        hasTrace: trace !== null,
        index,
        length: trace ? trace.length : 0,
        playing,
        atStart: index <= 0,
        atEnd: trace !== null && index === lastIndex(),
        snapshot: trace && index >= 0 ? trace[index] : null,
        delay,
      };
    }

    function scheduleTick() {
      const myGeneration = generation;
      timer = opts.schedule(function () {
        if (myGeneration !== generation || !playing) return;
        timer = null;
        if (index < lastIndex()) index += 1;
        if (index >= lastIndex()) playing = false;
        emit();
        if (playing) scheduleTick();
      }, delay);
    }

    function load(newTrace) {
      stopTimer();
      trace = newTrace && newTrace.length ? newTrace : null;
      index = trace ? 0 : -1;
      playing = false;
      emit();
    }

    function play() {
      if (!trace || playing) return;
      stopTimer();
      if (index >= lastIndex()) index = 0;
      playing = true;
      emit();
      scheduleTick();
    }

    function pause() {
      if (!playing && timer === null) return;
      stopTimer();
      playing = false;
      emit();
    }

    function toggle() {
      if (playing) pause();
      else play();
    }

    function seek(i) {
      if (!trace) return;
      stopTimer();
      playing = false;
      index = Math.min(lastIndex(), Math.max(0, Math.round(i)));
      emit();
    }

    function next() {
      if (trace) seek(index + 1);
    }

    function previous() {
      if (trace) seek(index - 1);
    }

    function reset() {
      stopTimer();
      trace = null;
      index = -1;
      playing = false;
      emit();
    }

    function setDelay(ms) {
      delay = clampDelay(ms);
      if (playing) {
        stopTimer();
        scheduleTick();
      }
    }

    return { load, play, pause, toggle, next, previous, seek, reset, setDelay, getState };
  }

  const api = { createPlayer, MIN_DELAY, MAX_DELAY };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.WumpusNav = global.WumpusNav || {}).Player = api;
})(typeof window !== 'undefined' ? window : globalThis);
