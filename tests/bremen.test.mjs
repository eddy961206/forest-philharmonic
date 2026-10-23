import test from 'node:test';
import assert from 'node:assert/strict';
import { BREMEN_BEAT, BREMEN_DURATION, bremenScore, createBremenTrail } from '../public/js/bremen-score.js';
import { playBremen } from '../public/js/bremen-audio.js';

test('Bremen score introduces four players in order and ends inside the miniature', () => {
  const notes = bremenScore();
  assert.deepEqual(new Set(notes.map(n => n.player)), new Set([0, 1, 2, 3]));
  for (let p = 0; p < 4; p++) {
    const first = notes.find(n => n.player === p);
    assert.ok(first.at >= p * 4 * BREMEN_BEAT);
    assert.ok(first.at < (p * 4 + 1) * BREMEN_BEAT);
  }
  assert.ok(notes.length > 100);
  notes.forEach((n, i) => {
    assert.ok(n.at >= 0 && n.dur > 0 && n.at + n.dur + .1 < BREMEN_DURATION);
    assert.ok(n.midi >= 24 && n.midi <= 96 && n.velocity > 0 && n.velocity <= 1);
    if (i) assert.ok(n.at >= notes[i - 1].at);
  });
  assert.deepEqual(bremenScore(), notes);
});

test('four footsteps unlock once, slow abandoned attempts reset, saved discoveries reopen', () => {
  const trail = createBremenTrail();
  assert.equal(trail.tap(0), 1); assert.equal(trail.tap(800), 2);
  assert.equal(trail.tap(8000), 1);
  assert.deepEqual([trail.tap(8200), trail.tap(8400), trail.tap(8600)], [2, 3, 4]);
  assert.equal(trail.tap(60000), 4);
  assert.equal(createBremenTrail(true).tap(0), 4);
});

function fakeEngine(missing = false) {
  const nodes = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} });
  const make = () => {
    const n = { gain: param(), pan: param(), playbackRate: param(), connected: false,
      connect(to) { this.connected = true; return to; }, disconnect() { this.connected = false; },
      start() { this.started = true; }, stop() { this.stopped = true; } };
    nodes.push(n); return n;
  };
  return { nodes, master: {}, ctx: { currentTime: 0, createGain: make, createStereoPanner: make, createBufferSource: make },
    _nearest: () => missing ? null : ({ buf: { duration: 5 }, root: 60, meta: { s: 0, g: 1 } }) };
}

test('miniature uses existing samples, and stop disconnects every scheduled source and bus', () => {
  const engine = fakeEngine(), play = playBremen(engine);
  assert.equal(play.activeVoices, bremenScore().length);
  assert.deepEqual(play.missing, []);
  play.stop(); play.stop();
  assert.equal(play.activeVoices, 0);
  assert.ok(engine.nodes.every(n => !n.connected));
  assert.ok(engine.nodes.filter(n => n.started).every(n => n.stopped));
});

test('missing samples are reported and empty audio graphs are still disposed', () => {
  const engine = fakeEngine(true), play = playBremen(engine);
  assert.equal(play.missing.length, 4); assert.equal(play.activeVoices, 0);
  play.stop(); assert.ok(engine.nodes.every(n => !n.connected));
});
