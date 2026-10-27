import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Performance } from '../public/js/audio/performance.js';
import { SECTIONS } from '../public/js/layout.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const score = {
  duration: 4,
  tracks: [
    { section: 'vn1', inst: 'violin', chairs: [0], notes: [0, 0.4, 60, 40, 0.02, 0.5, 62, 96, 0.3, 0.6, 64, 60, 1.2, 0.5, 65, 80, 2, 0.6, 67, 95] },
    { section: 'vn1', inst: 'violin', chairs: [0, 1], notes: [0, 0.2, 67, 127, 0.1, 0.6, 69, 70, 2.2, 0.4, 72, 90] },
    { section: 'piano', inst: 'piano', notes: [0.25, 0.25, 48, 90, 0.25, 1.25, 60, 100, 0.6, 0.3, 64, 110, 1.5, 0.5, 67, 60, 3, 0.4, 72, 100] },
  ],
};

async function fixture(t, piece = score) {
  const previous = { document: globalThis.document, fetch: globalThis.fetch };
  globalThis.document = { hidden: false, addEventListener() {} };
  globalThis.fetch = async url => ({ ok: true, json: async () => ({ ...structuredClone(piece), id: url.split('/').pop().replace('.json', '') }) });
  t.after(() => {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.fetch === undefined) delete globalThis.fetch; else globalThis.fetch = previous.fetch;
  });
  const notes = [];
  const stops = [];
  const engine = {
    now: 0, outputLatency: 0.03, ctx: { state: 'running' },
    onTick(fn) { this.tick = fn; },
    playNote(note) { notes.push(note); },
    stopAll(...args) { stops.push(args); },
  };
  const transport = new Performance(engine);
  if (piece) await transport.load('fixture');
  return { transport, engine, notes, stops };
}

test('visual updates before loading and retained note-on lists keep independent results', async t => {
  const { transport } = await fixture(t, null);
  const first = transport.updateVisual(0);
  assert.deepEqual(first, []);
  assert.notEqual(first, transport.updateVisual(0));
});

test('in-place expiry preserves polyphonic order, timing, peak velocity and event lists', async t => {
  const { transport } = await fixture(t);
  const chair = transport.chairs.vn1[0];
  const active = chair.active;
  const firstEvents = transport.updateVisual(0.1);
  const eventCopy = structuredClone(firstEvents);
  assert.deepEqual(active.map(n => n.midi), [60, 62, 67, 69]);
  assert.equal(chair.energy, 0.12);
  assert.equal(chair.strokes, 2);
  assert.equal(chair.nextOn, 0.3);
  const surviving = [active[0], active[1], active[3]];
  const secondEvents = transport.updateVisual(0.3);
  assert.equal(chair.active, active);
  assert.deepEqual(active.map(n => n.midi), [60, 62, 69, 64]);
  surviving.forEach((note, i) => assert.equal(active[i], note));
  assert.equal(chair.energy, 0.12 + (96 / 127 - 0.12) * 0.12);
  assert.equal(chair.nextOn, 1.2);
  assert.notEqual(firstEvents, secondEvents);
  transport.updateVisual(0.52);
  assert.deepEqual(active.map(n => n.midi), [69, 64]); // Exact off time expires.
  transport.updateVisual(1);
  assert.equal(chair.active, active);
  assert.deepEqual(active, []);
  assert.equal(chair.playing, false);
  assert.deepEqual(firstEvents, eventCopy); // Callers can retain particle events.
});

test('600 frames and time discontinuities exactly match the original visual states and events', async t => {
  const piece = JSON.parse(await readFile(new URL('../public/music/bach-nun-seid-ihr.json', import.meta.url), 'utf8'));
  const { transport } = await fixture(t, piece);
  // Recorded before the allocation optimization, including every chair field,
  // active-note order, track cursor and emitted event at each frame.
  const originalSections = ['vn1', 'vn2', 'va', 'vc', 'cb', 'harp', 'fl', 'ob', 'cl', 'bn', 'hn', 'tp', 'timp', 'piano', 'choir'];
  const snapshot = (time, events) => JSON.stringify({ t: time, events, chairs: Object.fromEntries(originalSections.map(id => [id, transport.chairs[id]])), visualIndices: transport.piece.tracks.map(track => track.vi), lastVisualT: transport.lastVisualT });
  const all = createHash('sha256');
  for (let frame = 0; frame < 600; frame++) {
    const time = frame / 60;
    all.update(snapshot(time, transport.updateVisual(time)) + '\n');
  }
  assert.equal(all.digest('hex'), 'f289238a4b106e8ba2541633179faf8b62a6babe9db6134a5016e770b9cfe590');
  const discontinuities = [
    [10.3, '123a7eb29ad9e135fd5ad0bbbee3324edf2b3ad9f14ca9c9b6db1e70af1a3c0b'],
    [25, '86c88b75ebeec6f49612db5b3b5fe0d18775ebb7d4d0987b26c16fe2d74840e9'],
    [24.9, 'cb774d7fe7dc4bc6340e93ea77a6e0f73b3dfe37cd3bc9a1cf39cc63656761ae'],
    [24.5, '241727b583f8e324ec7d5b4452b94af2e5380cb5f109f9dd214ae7b693f3b915'],
    [80, 'c5f67cc6d65e5ea1ec5c08b4f3e1b7a8e7e5dbb3163f87521ae151af7d02ac49'],
    [1, '7df7b5ede4fdbe6c443c24caf8c41943e91d8651e0993a701afd25b916002a63'],
    [1, '7df7b5ede4fdbe6c443c24caf8c41943e91d8651e0993a701afd25b916002a63'],
    [0, 'd99afd79242768f238d71c32cbee30dccfa6bccee7e5ddcc9d7c3a4264f1cf28'],
    [186.4, 'afd02f14f8936702b29cd75d71efbb9b3b3146e45b4c14cc9d6dfc96fdda7534'],
  ];
  for (const [time, expected] of discontinuities) assert.equal(hash(snapshot(time, transport.updateVisual(time))), expected, `time ${time}`);
});

test('seek, rewind, stop and loading a new score rebuild the cached chair references', async t => {
  const { transport } = await fixture(t);
  transport.updateVisual(0.3);
  const oldChair = transport.chairs.vn1[0];
  const oldState = structuredClone(oldChair);
  transport.seek(1.2);
  assert.notEqual(transport.chairs.vn1[0], oldChair);
  assert.ok(transport._visualChairs.includes(transport.chairs.vn1[0]));
  assert.ok(!transport._visualChairs.includes(oldChair));
  transport.updateVisual(1.2);
  assert.deepEqual(transport.chairs.vn1[0].active.map(n => n.midi), [65]);
  assert.deepEqual(oldChair, oldState);
  const afterSeek = transport.chairs.vn1[0];
  transport.updateVisual(0);
  assert.notEqual(transport.chairs.vn1[0], afterSeek);
  assert.equal(transport._visualChairs.length, Object.values(SECTIONS).reduce((n, section) => n + section.chairs.length, 0));
  transport.stop();
  assert.equal(transport.chairs.vn1[0].active.length, 0);
  const afterStop = transport.chairs.vn1[0];
  await transport.load('next-fixture');
  assert.notEqual(transport.chairs.vn1[0], afterStop);
  transport.updateVisual(0);
  assert.equal(transport.chairs.vn1[0].playing, true);
});

test('frame updates reuse active arrays without filter, map or Object.values allocations', async t => {
  const { transport } = await fixture(t);
  const activeArrays = transport._visualChairs.map(chair => chair.active);
  const original = { filter: Array.prototype.filter, map: Array.prototype.map, values: Object.values };
  const calls = { filter: 0, map: 0, values: 0 };
  Array.prototype.filter = function (...args) { calls.filter++; return original.filter.apply(this, args); };
  Array.prototype.map = function (...args) { calls.map++; return original.map.apply(this, args); };
  Object.values = function (...args) { calls.values++; return original.values.apply(this, args); };
  try {
    for (let frame = 0; frame < 600; frame++) transport.updateVisual(frame / 60);
  } finally {
    Array.prototype.filter = original.filter;
    Array.prototype.map = original.map;
    Object.values = original.values;
  }
  assert.deepEqual(calls, { filter: 0, map: 0, values: 0 });
  transport._visualChairs.forEach((chair, i) => assert.equal(chair.active, activeArrays[i]));
});

test('audio scheduling is identical with frequent, 5 FPS or absent visual updates', async t => {
  const traces = [];
  const { transport, engine, notes, stops } = await fixture(t);
  const originalRandom = Math.random;
  try {
    for (const visualEvery of [1, 8, Infinity]) {
      await transport.load('fixture');
      engine.now = 0;
      document.hidden = false;
      notes.length = stops.length = 0;
      let seed = 41;
      Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      transport.play();
      for (let tick = 1; tick <= 160; tick++) {
        engine.now = tick * 0.025;
        if (tick === 30) transport.seek(1.2);
        if (tick === 56) transport.pause();
        if (tick === 64) transport.play();
        document.hidden = tick >= 80 && tick < 100;
        engine.tick();
        if (tick % visualEvery === 0) transport.updateVisual(transport.time);
      }
      traces.push(structuredClone({ notes, stops, playing: transport.playing, pos: transport.pos, schedIdx: transport.schedIdx }));
    }
  } finally {
    Math.random = originalRandom;
  }
  assert.ok(traces[0].notes.length > score.tracks.reduce((n, track) => n + track.notes.length / 4, 0)); // Seek/resume reschedules notes.
  assert.deepEqual(traces[1], traces[0]);
  assert.deepEqual(traces[2], traces[0]);
});

test('phrase shaping carries through flat held tones while preserving written dynamics and score notes', async t => {
  const piece = { duration: 16, beats: Array.from({ length: 32 }, (_, i) => [i * 0.5, i % 4]), tracks: [
    { section: 'vn1', inst: 'violin', notes: [0, 4, 60, 80, 4, 4, 64, 80, 8, 4, 67, 80, 12, 4, 60, 80] },
    { section: 'vc', inst: 'cello', notes: [0, 4, 48, 50, 4, 4, 52, 90, 8, 4, 55, 60, 12, 4, 48, 100] },
  ] };
  const { transport, notes } = await fixture(t, piece);
  assert.deepEqual(transport.piece.tracks.map(tr => tr.notes), piece.tracks.map(tr => tr.notes));
  assert.equal(transport.expression.length, transport.evCount * 2);
  let shaped = false;
  for (let i = 0; i < transport.evCount; i++) {
    const k = i * 5;
    if (transport.ev[k] === 1) {
      assert.deepEqual(Array.from(transport.expression.subarray(i * 2, i * 2 + 2)), [1, 1]);
      assert.equal(transport.ev[k + 4], piece.tracks[1].notes[transport.ev[k + 1] + 3]);
    } else if (transport.expression[i * 2] !== 1) shaped = true;
  }
  assert.ok(shaped);
  transport.seek(2);
  transport.play();
  assert.equal(notes[0].skip, 2);
  assert.deepEqual(Array.from(notes[0].expression), Array.from(transport.expression.subarray(0, 2)));
});

test('ensemble uses unique sounding chairs across tracks and default chairs mean the complete section', async t => {
  const { transport, engine } = await fixture(t, null);
  const counts = [], energyPlayers = [];
  engine.setEnsemble = ensemble => counts.push(ensemble);
  engine.setTrim = () => {};
  engine.noteEnergy = (...args) => { energyPlayers.push(args[7]); return 1; };
  const prep = transport.prepare({ duration: 3, tracks: [
    { section: 'vn1', inst: 'violin', chairs: [0], notes: [0, 2, 60, 80] },
    { section: 'vn1', inst: 'violin', chairs: [0], notes: [1, 2, 64, 80] },
    { section: 'vn1', inst: 'violin', chairs: [1], notes: [] },
    { section: 'vc', inst: 'cello', notes: [0, 2, 48, 80] },
  ] });
  assert.equal(prep.ensemble.vn1, 1);
  assert.equal(prep.ensemble.vc, SECTIONS.vc.chairs.length);
  assert.deepEqual(energyPlayers, [1, SECTIONS.vc.chairs.length, 1]);
  assert.equal(counts.length, 0, 'preparing the next piece never changes the currently sounding stage');
  transport.use(prep);
  assert.deepEqual(counts, [prep.ensemble]);
});
