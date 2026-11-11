import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioEngine, resolveAcoustics, venueAcoustics } from '../public/js/audio/engine.js';
import { Performance } from '../public/js/audio/performance.js';
import { SPHERE_ACOUSTICS } from '../public/js/scene/sphereplan.js';
import { OUTDOOR_ACOUSTICS } from '../public/js/scene/outdoorplan.js';

function mockParam(initial = 0) {
  const events = [];
  return {
    value: initial,
    events,
    setValueAtTime(v, t) { events.push({ op: 'set', v, t }); },
    linearRampToValueAtTime(v, t) { events.push({ op: 'ramp', v, t }); },
    setTargetAtTime(v, t, k) { events.push({ op: 'target', v, t, k }); },
    setValueCurveAtTime(curve, t, d) { events.push({ op: 'curve', first: curve[0], last: curve.at(-1), t, d }); },
    cancelScheduledValues(t) { events.push({ op: 'cancel', t }); },
  };
}

function mockCtx(now = 1) {
  const created = { sources: [], gains: [], filters: [], panners: [] };
  const node = (extra = {}) => {
    const n = {
      connected: [],
      connect(dest) { n.connected.push(dest); return dest; },
      disconnect() { n.connected.length = 0; },
      ...extra,
    };
    return n;
  };
  return {
    currentTime: now,
    sampleRate: 48000,
    created,
    createGain() {
      const g = node({ gain: mockParam(1) });
      created.gains.push(g);
      return g;
    },
    createBiquadFilter() {
      const f = node({ type: 'lowpass', frequency: mockParam(20000), Q: mockParam(0.5) });
      created.filters.push(f);
      return f;
    },
    createBufferSource() {
      const s = node({
        buffer: null,
        playbackRate: mockParam(1),
        detune: mockParam(0),
        starts: [],
        stops: [],
        start(t, off) { s.starts.push({ t, off }); },
        stop(t) { s.stops.push({ t }); },
      });
      created.sources.push(s);
      return s;
    },
    createPanner() {
      const p = node({ positionX: mockParam(0), positionY: mockParam(0), positionZ: mockParam(0) });
      created.panners.push(p);
      return p;
    },
  };
}

test('resolveAcoustics and venueAcoustics preserve explicit Sphere acoustics over arena defaults', () => {
  const sphereInput = venueAcoustics('sphere', { sphere: SPHERE_ACOUSTICS, outdoor: OUTDOOR_ACOUSTICS });
  const ac = resolveAcoustics(sphereInput);
  assert.equal(ac.er, 'arena');
  assert.equal(ac.dark, 0.72);
  assert.equal(ac.spread, 1.15);
  assert.equal(ac.rt60, SPHERE_ACOUSTICS.rt60);
  assert.equal(ac.reverb, SPHERE_ACOUSTICS.reverb);
  assert.equal(ac.level, SPHERE_ACOUSTICS.level);
  assert.equal(ac.refDistance, SPHERE_ACOUSTICS.refDistance);
  assert.equal(ac.model, SPHERE_ACOUSTICS.model);

  const outdoor = resolveAcoustics(venueAcoustics('outdoor', { sphere: SPHERE_ACOUSTICS, outdoor: OUTDOOR_ACOUSTICS }));
  assert.equal(outdoor.reverb, OUTDOOR_ACOUSTICS.reverb);
  const hall = resolveAcoustics(venueAcoustics('hall', { sphere: SPHERE_ACOUSTICS, outdoor: OUTDOOR_ACOUSTICS }));
  assert.equal(hall.er, 'hall');
  assert.equal(hall.spread, 1);
});

test('_sustained handles short firstLen (< XFADE * 2.2) with total > firstLen without uncrossfaded overlap or t < when', () => {
  const engine = new AudioEngine();
  engine.ctx = mockCtx(10);
  const dest = engine.ctx.createGain();
  const voice = { srcs: [], bends: null, bendStart: 0, bendWhen: 10 };
  const smp = { buf: { duration: 1.8 }, meta: { s: 0, g: 1 } };

  // High playback rate makes firstLen (~0.77s) < XFADE * 2.2 (0.836s), while total (2.2s) > firstLen.
  engine._sustained(voice, smp, 2.2, 10, 2.2, dest, 1, 0);
  assert.ok(voice.srcs.length >= 2, 'chained multiple segments to cover total');
  for (let i = 0; i < voice.srcs.length; i++) {
    const startT = voice.srcs[i].starts[0].t;
    assert.ok(startT >= 10, `segment ${i} started at ${startT} < when (10)`);
    if (i > 0) {
      const prevStart = voice.srcs[i - 1].starts[0].t;
      assert.ok(startT > prevStart, `segment ${i} did not advance past previous segment`);
    }
  }
  const firstGain = engine.ctx.created.gains[1].gain.events;
  assert.ok(firstGain.some(e => e.op === 'curve' && e.last < 1e-4), 'first segment crossfades out cleanly');
});

test('undamped plucked and mallet instruments ring past short staccato notation while piano damps at note end', () => {
  const engine = new AudioEngine();
  engine.ctx = mockCtx(1);
  engine.sections = { vn1: { input: engine.ctx.createGain() }, cel: { input: engine.ctx.createGain() }, piano: { input: engine.ctx.createGain() } };
  engine.samples = {
    pizzicato: { notes: [60], buf: new Map([[60, { duration: 1.5 }]]), meta: { 60: { s: 0, g: 1 } } },
    celesta: { notes: [72], buf: new Map([[72, { duration: 2.0 }]]), meta: { 72: { s: 0, g: 1 } } },
    piano: { notes: [60], buf: new Map([[60, { duration: 3.0 }]]), meta: { 60: { s: 0, g: 1 } } },
  };

  engine.playNote({ section: 'vn1', inst: 'pizzicato', midi: 60, vel: 90, when: 2, dur: 0.05 });
  const pizzReleaseAt = engine.ctx.created.gains.at(-1).gain.events.find(e => e.op === 'target').t;
  assert.ok(pizzReleaseAt >= 2 + 0.35, `pizzicato damped too early at ${pizzReleaseAt}`);

  engine.playNote({ section: 'cel', inst: 'celesta', midi: 72, vel: 90, when: 2, dur: 0.06 });
  const celReleaseAt = engine.ctx.created.gains.at(-1).gain.events.find(e => e.op === 'target').t;
  assert.ok(celReleaseAt >= 2 + 0.5, `celesta damped too early at ${celReleaseAt}`);

  engine.playNote({ section: 'piano', inst: 'piano', midi: 60, vel: 90, when: 2, dur: 0.08 });
  const pianoReleaseAt = engine.ctx.created.gains.at(-1).gain.events.find(e => e.op === 'target').t;
  assert.ok(Math.abs(pianoReleaseAt - 2.08) < 1e-6, `piano damper should release at 2.08, got ${pianoReleaseAt}`);
});

test('addSpot routes foyer reverb send behind wall occlusion and setReverb(0) reaches zero', () => {
  const prevGain = globalThis.GainNode, prevPanner = globalThis.PannerNode;
  globalThis.GainNode = function (ctx) { return ctx.createGain(); };
  globalThis.PannerNode = function (ctx) { return ctx.createPanner(); };
  try {
    const engine = new AudioEngine();
    engine.ctx = mockCtx(3);
    engine.ac = resolveAcoustics(null);
    engine.makeup = engine.ctx.createGain();
    engine.reverbIn = engine.ctx.createGain();
    engine.reverbReturn = engine.ctx.createGain();
    engine._open = 1;

    engine.addSpot('foyer-vc', { x: 4, y: 1, z: 12 });
    const spot = engine.sections['foyer-vc'];
    assert.ok(spot.spot.g.connected.includes(spot.send), 'reverb send sits downstream of wall occlusion gain');
    assert.ok(spot.send.connected.includes(engine.reverbIn), 'spot send feeds reverbIn');

    engine.setReverb(0);
    assert.equal(engine.reverbReturn.gain.events.at(-1).v, 0);
    engine.setReverb(0.45);
    assert.ok(engine.reverbReturn.gain.events.at(-1).v > 0.4 && engine.reverbReturn.gain.events.at(-1).v < 0.46);
  } finally {
    globalThis.GainNode = prevGain;
    globalThis.PannerNode = prevPanner;
  }
});

test('Performance.prepare keeps cached score objects immutable, rejects unknown sections, and shapes terrace tracks', () => {
  const prevDoc = globalThis.document;
  globalThis.document = { addEventListener() {} };
  try {
    const perf = new Performance({ onTick() {}, setTrim() {}, setEnsemble() {}, stopAll() {} });
    const rawTrack = Object.freeze({
      section: 'vc',
      inst: 'cello',
      chairs: Object.freeze([0]),
      notes: Object.freeze([
        0, 1.0, 48, 80, 1, 1.0, 50, 80, 2, 1.0, 52, 80, 3, 1.0, 53, 80,
        4, 1.0, 55, 80, 5, 1.0, 57, 80, 6, 1.0, 59, 80, 7, 1.0, 60, 80,
        8, 1.0, 62, 80, 9, 1.0, 64, 80, 10, 1.0, 65, 80, 11, 1.0, 67, 80,
        12, 1.0, 69, 80, 13, 1.0, 71, 80, 14, 1.0, 72, 96, 15, 1.2, 60, 80,
      ]),
    });
    const rawScore = Object.freeze({
      id: 'frozen-cello',
      duration: 17,
      mood: 'calm',
      beats: Object.freeze([[0, 0, 4], [1, 1, 4]]),
      tracks: Object.freeze([rawTrack]),
    });

    const prep = perf.prepare(rawScore);
    assert.equal('vi' in rawTrack, false);
    assert.equal('count' in rawTrack, false);
    perf.use(prep);
    perf.updateVisual(3.5);
    assert.equal('vi' in rawTrack, false);
    assert.ok(perf.piece.tracks[0].vi > 0);
    assert.equal(perf.dominantSection(0, 6), 'vc');

    // Mostly flat terrace track (15 notes at 80, 1 accent at 96) still receives phrase shaping.
    const velocities = [];
    for (let i = 0; i < prep.evCount; i++) velocities.push(prep.ev[i * 5 + 4]);
    assert.ok(new Set(velocities.map(v => Math.round(v))).size > 2);

    assert.throws(
      () => perf.prepare({ id: 'bad', duration: 2, beats: [[0, 0, 4]], tracks: [{ section: 'kazoo', inst: 'flute', notes: [0, 1, 60, 80] }] }),
      /unknown section "kazoo"/,
    );
  } finally {
    globalThis.document = prevDoc;
  }
});
