import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioEngine } from '../public/js/audio/engine.js';

function install(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
}

function voiceFixture() {
  const nodes = [], sustained = [];
  const param = () => ({ value: 0, events: [],
    setValueAtTime(...args) { this.events.push(['value', ...args]); },
    linearRampToValueAtTime(...args) { this.events.push(['ramp', ...args]); },
    setTargetAtTime(...args) { this.events.push(['target', ...args]); },
  });
  const node = properties => {
    const value = { ...properties, connect(target) { return target; }, disconnect() {} };
    nodes.push(value);
    return value;
  };
  const engine = new AudioEngine();
  engine.ctx = { currentTime: 10, sampleRate: 24000,
    createBiquadFilter: () => node({ frequency: param(), Q: param() }),
    createGain: () => node({ gain: param() }),
    createBufferSource: () => node({ playbackRate: param(), start(...args) { this.started = args; }, stop(...args) { this.stopped = args; } }),
  };
  engine.sections = { vn1: { input: {} }, piano: { input: {} } };
  const sample = { notes: [60], meta: { 60: { s: 0.05, g: 1 } }, buf: new Map([[60, { duration: 6 }]]) };
  engine.samples = { violin: sample, piano: sample, strings: sample };
  engine._sustained = (voice, sample, rate, when, total, dest, level, skip) => {
    sustained.push({ voice, sample, rate, when, total, dest, level, skip });
    voice.srcs.push({});
  };
  return { engine, nodes, sustained };
}

const note = { section: 'vn1', inst: 'violin', midi: 60, vel: 90, when: 10.2, dur: 2 };

test('a stalled scheduler discards ended notes before allocating any audio nodes', () => {
  const { engine, nodes } = voiceFixture();
  for (let i = 0; i < 200; i++) engine.playNote({ ...note, when: 2 + i * 0.025, dur: 0.2 });
  assert.equal(nodes.length, 0);
  assert.equal(engine.voices.size, 0);
});

test('a tone with less than one re-entry swell left is not extended past its score ending', () => {
  const { engine, nodes } = voiceFixture();
  engine.playNote({ ...note, when: 8, dur: 2.08 });
  assert.equal(nodes.length, 0);
  assert.equal(engine.voices.size, 0);
});

test('late sustained notes continue at their score position and keep the original end time', () => {
  const { engine, nodes, sustained } = voiceFixture();
  engine.playNote({ ...note, when: 8, dur: 4 });
  assert.equal(sustained.length, 1);
  const actual = sustained[0];
  assert.equal(actual.when, 10.005);
  assert.ok(Math.abs(actual.skip - 2.005) < 1e-12);
  assert.ok(Math.abs(actual.total - (1.995 + 0.34 * 2.4 + 0.05)) < 1e-12);
  assert.deepEqual(nodes[1].gain.events, [
    ['value', 0, 10.005],
    ['ramp', nodes[1].gain.events[1][1], 10.085],
    ['value', nodes[1].gain.events[1][1], 11.99],
    ['target', 0, 12, 0.34 / 3],
  ]);
});

test('late held-note continuation advances its existing skip and optional layer equally', () => {
  const { engine, sustained } = voiceFixture();
  engine.playNote({ ...note, when: 9, dur: 3, skip: 2, layer: 'strings' });
  assert.equal(sustained.length, 2);
  assert.ok(Math.abs(sustained[0].skip - 3.005) < 1e-12);
  assert.equal(sustained[1].skip, sustained[0].skip);
  assert.equal(sustained[1].when, sustained[0].when + 0.012);
});

test('late struck notes are not re-attacked, while normal jitter and future notes retain their envelopes', () => {
  const late = voiceFixture();
  late.engine.playNote({ ...note, section: 'piano', inst: 'piano', when: 8, dur: 4 });
  assert.equal(late.nodes.length, 0);
  for (const when of [9.9, 9.96, 10.2]) {
    const { engine, nodes } = voiceFixture();
    engine.playNote({ ...note, section: 'piano', inst: 'piano', when });
    assert.equal(nodes.length, 3);
    assert.deepEqual(nodes[2].started, [Math.max(when, 10.005), 0.05]);
  }
  const beyondTolerance = voiceFixture();
  beyondTolerance.engine.playNote({ ...note, section: 'piano', inst: 'piano', when: 9.899 });
  assert.equal(beyondTolerance.nodes.length, 0);
  const { engine, sustained } = voiceFixture();
  engine.playNote(note);
  assert.equal(sustained[0].when, note.when);
  assert.equal(sustained[0].skip, 0);
  assert.equal(sustained[0].total, note.dur + 0.34 * 2.4 + 0.05);
});

function clockFixture(t, { throws = false, postThrows = false } = {}) {
  const workers = [], intervals = [], revoked = [];
  install(t, 'URL', { createObjectURL: () => `blob:clock-${workers.length}`, revokeObjectURL: url => revoked.push(url) });
  install(t, 'setInterval', (fn, ms) => { const interval = { fn, ms, cleared: false }; intervals.push(interval); return interval; });
  install(t, 'clearInterval', interval => { interval.cleared = true; });
  install(t, 'Worker', class {
    constructor(url) {
      if (throws) throw new Error('Worker disallowed');
      this.url = url;
      workers.push(this);
    }
    postMessage(ms) { this.ms = ms; if (postThrows) throw new Error('Worker unavailable'); }
    terminate() { this.terminated = true; }
  });
  const engine = new AudioEngine();
  let ticks = 0;
  engine.onTick(() => ticks++);
  return { engine, workers, intervals, revoked, ticks: () => ticks };
}

test('a successful worker clock releases its Blob URL and reinitialization stops the previous clock', t => {
  const { engine, workers, intervals, revoked, ticks } = clockFixture(t);
  engine._initTimer();
  assert.equal(workers[0].ms, 25);
  const staleTick = workers[0].onmessage;
  staleTick();
  staleTick();
  assert.equal(ticks(), 2);
  assert.deepEqual(revoked, ['blob:clock-0']);
  engine._initTimer();
  assert.equal(workers[0].terminated, true);
  assert.equal(workers[0].onmessage, null);
  staleTick();
  assert.equal(ticks(), 2);
  workers[1].onmessage();
  assert.equal(ticks(), 3);
  assert.equal(intervals.length, 0);
  engine._stopTimer();
  assert.equal(workers[1].terminated, true);
  assert.equal(engine.timer, null);
  assert.deepEqual(revoked, ['blob:clock-0', 'blob:clock-1']);
});

for (const failure of ['constructor', 'postMessage', 'error', 'messageerror']) {
  test(`worker ${failure} failure starts one tracked fallback and ignores stale callbacks`, t => {
    const { engine, workers, intervals, revoked, ticks } = clockFixture(t, { throws: failure === 'constructor', postThrows: failure === 'postMessage' });
    engine._initTimer();
    if (failure === 'error' || failure === 'messageerror') {
      const fail = workers[0][`on${failure}`];
      assert.equal(typeof fail, 'function');
      let prevented = 0;
      fail({ preventDefault() { prevented++; } });
      fail({ preventDefault() { prevented++; } });
      assert.equal(prevented, 1);
    }
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].ms, 25);
    assert.equal(revoked.length, 1);
    assert.ok(workers.every(worker => worker.terminated));
    intervals[0].fn();
    assert.equal(ticks(), 1);
    engine._stopTimer();
    assert.equal(intervals[0].cleared, true);
    intervals[0].fn();
    assert.equal(ticks(), 1);
  });
}

test('audio reinitialization stops a pending worker even if the new context fails', async t => {
  const { engine, workers, revoked } = clockFixture(t);
  engine._initTimer();
  const failure = new Error('AudioContext unavailable');
  install(t, 'window', { AudioContext: class { constructor() { throw failure; } } });
  await assert.rejects(engine.init(), error => error === failure);
  assert.equal(workers[0].terminated, true);
  assert.deepEqual(revoked, ['blob:clock-0']);
});

test('reinitializing a fallback clock clears its interval and accepts ticks from only the replacement', t => {
  const { engine, intervals, ticks } = clockFixture(t, { throws: true });
  engine._initTimer();
  engine._initTimer();
  assert.equal(intervals.length, 2);
  assert.equal(intervals[0].cleared, true);
  intervals[0].fn();
  intervals[1].fn();
  assert.equal(ticks(), 1);
  engine._stopTimer();
  assert.equal(intervals[1].cleared, true);
});

test('fast bowed notes speak promptly and release without smearing the next stroke', () => {
  const { engine, nodes, sustained } = voiceFixture();
  engine.playNote({ ...note, dur: 0.12, vel: 40 });
  const events = nodes[1].gain.events;
  assert.ok(Math.abs(events[1][2] - (note.when + 0.12 * 0.28)) < 1e-12);
  assert.deepEqual(events.at(-1), ['target', 0, note.when + 0.12, 0.12 * 0.65 / 3]);
  assert.ok(sustained[0].total < 0.4);
});

test('phrase expression follows the held tone and resumes its existing position and brightness', () => {
  const { engine, nodes } = voiceFixture();
  engine.playNote({ ...note, dur: 2, skip: 2, expression: [1.2, 0.8] });
  const events = nodes[1].gain.events;
  assert.equal(events.length, 4); // attack, phrase end, release; midpoint already passed
  const resumedRatio = 1.2 + (0.8 - 1.2) * 0.08 / 2;
  const amp = events[1][1] / resumedRatio;
  assert.ok(Math.abs(events[2][1] - amp * 0.8) < 1e-12);
  assert.equal(events[2][2], note.when + 2);
  const color = nodes[0].frequency.events;
  assert.equal(color.length, 3);
  assert.ok(color[0][1] > color.at(-1)[1]);
  assert.equal(color.at(-1)[2], note.when + 2);
});

test('original dynamic tones hold their intensity without a compulsory identical per-note swell', () => {
  const { engine, nodes } = voiceFixture();
  engine.playNote({ ...note, dur: 4, expression: [1, 1] });
  const events = nodes[1].gain.events;
  assert.equal(events[1][1], events[2][1]);
  assert.equal(nodes[0].frequency.events.length, 0);
});
