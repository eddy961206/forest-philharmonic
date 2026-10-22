import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { Performance } from '../public/js/audio/performance.js';
import { installAudioNoteAuditFactory, summarizeAudioNoteAudit } from '../tools/bench/audio-note-audit.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function browserGlobals(t) {
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  globalThis.window = {};
  globalThis.document = { hidden: false, addEventListener() {} };
  // Exercise the exact serialization used by page.evaluate, with no closure.
  vm.runInThisContext(`(${installAudioNoteAuditFactory.toString()})()`);
  t.after(() => { for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
  } });
}
function summary(notes, audit) { return summarizeAudioNoteAudit(notes, audit.snapshot(), hash); }
function mock({ held = true, mutate = note => note, heldOrder = [0, 1], skipSchedule = false } = {}) {
  const received = [], token = {};
  const engine = { ctx: { currentTime: 10 }, voices: new Set(),
    playNote(note) { assert.equal(this, engine); received.push(note); return token; } };
  const perf = { playing: true, startPos: 2, startCtx: 10.12, schedIdx: 2, evCount: 3,
    ev: new Float32Array([0, 0, 4, 60, 80, 0, 1, 3, 64, 90, 0, 2, 1, 67, 100]),
    piece: { id: 'fixture', tracks: [{ section: 'vn1', inst: 'violin', gain: 0.8 }] },
    _schedule() {
      const k = this.schedIdx++ * 5;
      if (!skipSchedule) return engine.playNote({ section: 'vn1', inst: 'violin', midi: this.ev[k + 3],
        dur: this.ev[k + 2], vel: this.ev[k + 4], gain: 0.8, when: this.startCtx });
      return token;
    },
  };
  if (held) perf._resumeHeld = function (pos) {
    for (const index of heldOrder) {
      const k = index * 5;
      engine.playNote(mutate({ section: 'vn1', inst: 'violin', midi: this.ev[k + 3], vel: this.ev[k + 4],
        gain: 0.8, when: this.startCtx, dur: this.ev[k + 1] + this.ev[k + 2] - pos, skip: pos - this.ev[k + 1] }));
    }
    return token;
  };
  return { engine, perf, received, token };
}

test('actual Performance keeps identical audio requests and transport state with the observer attached', async t => {
  browserGlobals(t);
  const piece = { id: 'actual-transport', duration: 5, tracks: [{ section: 'vn1', inst: 'violin',
    notes: [0, 4, 60, 80, 0.5, 3, 64, 90, 1.5, 2.5, 67, 70, 3, 1, 69, 85] }] };
  globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(piece) });
  const run = async observed => {
    const calls = [], notes = [], stops = [];
    const engine = { ctx: { state: 'running', currentTime: 0 }, voices: new Set(), outputLatency: 0.03,
      get now() { return this.ctx.currentTime; }, onTick(fn) { this.tick = fn; },
      playNote(note) { calls.push(structuredClone(note)); return note; }, stopAll(...args) { stops.push(args); } };
    const perf = new Performance(engine);
    await perf.load('fixture');
    const audit = observed ? window.__createAudioNoteAudit(engine, perf, note => notes.push(note)) : null;
    const originalRandom = Math.random;
    let seed = 41;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    try {
      perf.play();
      for (let tick = 1; tick <= 150; tick++) {
        engine.ctx.currentTime = tick * 0.025;
        if (tick === 30) perf.seek(1.2);
        if (tick === 56) perf.pause();
        if (tick === 64) perf.play();
        document.hidden = tick >= 80 && tick < 100;
        engine.tick();
        if (tick % 8 === 0) perf.updateVisual(perf.time);
      }
    } finally { Math.random = originalRandom; document.hidden = false; audit?.stop(); }
    return { calls, stops, state: { pos: perf.pos, playing: perf.playing, index: perf.schedIdx },
      notes, result: audit ? summary(notes, audit) : null };
  };
  const plain = await run(false), observed = await run(true);
  assert.deepEqual(observed.calls, plain.calls);
  assert.deepEqual(observed.stops, plain.stops);
  assert.deepEqual(observed.state, plain.state);
  assert.ok(observed.result.summary.heldRequests > 0);
  assert.ok(observed.result.summary.scheduledRequests > 0);
  assert.ok(Object.values(observed.result.checks).every(Boolean), JSON.stringify(observed.result));
  const held = observed.notes.filter(note => note.origin === 'held');
  assert.ok(held.some(note => note.scoreIndex !== note.schedulerIndex), 'the old schedIdx-1 assumption is demonstrably invalid');
  for (const note of held) {
    assert.equal(note.skip, note.startPos - note.original.on);
    assert.equal(note.actual[3], note.original.on + note.original.dur - note.startPos);
    assert.equal(note.velocity, note.original.vel);
    assert.equal(note.when, note.startCtx);
  }
});

test('legacy scheduler without _resumeHeld is supported explicitly and original arguments/returns survive', t => {
  browserGlobals(t);
  const { engine, perf, received, token } = mock({ held: false });
  const original = { note: engine.playNote, schedule: perf._schedule };
  const notes = [], audit = window.__createAudioNoteAudit(engine, perf, note => notes.push(note));
  assert.equal(perf._schedule(), token);
  assert.equal(received.length, 1);
  assert.equal(notes[0].origin, 'scheduler');
  const result = summary(notes, audit);
  assert.equal(result.summary.held.supported, false);
  assert.equal(result.summary.heldRequests, 0);
  assert.ok(Object.values(result.checks).every(Boolean));
  audit.stop(); audit.stop();
  assert.equal(engine.playNote, original.note);
  assert.equal(perf._schedule, original.schedule);
  assert.equal('_resumeHeld' in perf, false);
});

test('held and fresh notes retain separate original indices and all continuation arguments', t => {
  browserGlobals(t);
  const { engine, perf, token } = mock();
  const notes = [], audit = window.__createAudioNoteAudit(engine, perf, note => notes.push(note));
  assert.equal(perf._resumeHeld(2), token);
  assert.equal(perf._schedule(), token);
  assert.deepEqual(notes.map(note => [note.origin, note.scoreIndex, note.skip]), [['held', 0, 2], ['held', 1, 1], ['scheduler', 2, 0]]);
  assert.deepEqual(audit.snapshot().heldCalls[0].expectedIndices, [0, 1]);
  assert.equal(summary(notes, audit).summary.held.expectedRequests, 2);
  assert.ok(Object.values(summary(notes, audit).checks).every(Boolean));
  audit.stop();
});

test('wrong held skip, remaining duration, pitch, gain, start time or velocity remains an explicit mismatch', t => {
  browserGlobals(t);
  for (const field of ['skip', 'dur', 'midi', 'gain', 'when', 'vel']) {
    const { engine, perf } = mock({ mutate: note => ({ ...note, [field]: note[field] + 0.125 }) });
    const notes = [], audit = window.__createAudioNoteAudit(engine, perf, note => notes.push(note));
    perf._resumeHeld(2);
    assert.equal(summary(notes, audit).checks.heldRequestsMatchScore, false, field);
    assert.equal(summary(notes, audit).summary.heldScoreMismatches, 2);
    assert.ok(notes.every(note => note.mismatches.some(item => item.field === field)), field);
    audit.stop();
  }
});

test('missing, extra, duplicated and reordered held requests are not silently ignored', t => {
  browserGlobals(t);
  for (const order of [[0], [0, 1, 1], [0, 0], [1, 0], []]) {
    const { engine, perf } = mock({ heldOrder: order });
    const notes = [], audit = window.__createAudioNoteAudit(engine, perf, note => notes.push(note));
    perf._resumeHeld(2);
    const result = summary(notes, audit);
    assert.ok(!result.checks.heldCallsComplete || !result.checks.heldRequestsMatchScore, JSON.stringify(order));
    assert.equal(result.summary.held.observedRequests, order.length);
    assert.equal(result.summary.held.expectedRequests, 2);
    if (order.length < 2) assert.ok(result.summary.held.missingRequests > 0);
    if (order.length > 2) assert.ok(result.summary.held.extraRequests > 0);
    audit.stop();
  }
});

test('scheduler index advancement without a request and foreign music requests fail separately', t => {
  browserGlobals(t);
  const { engine, perf } = mock({ skipSchedule: true });
  const notes = [], audit = window.__createAudioNoteAudit(engine, perf, note => notes.push(note));
  perf._schedule();
  assert.equal(summary(notes, audit).checks.scheduledInvocationCountsMatchScoreAdvance, false);
  engine.playNote({ section: 'vn1', inst: 'violin', midi: 60, vel: 80, dur: 1, when: 10.12 });
  const result = summary(notes, audit);
  assert.equal(result.summary.otherRequestsWhilePlaying, 1);
  assert.equal(result.checks.noUnattributedMusicRequests, false);
  assert.equal(notes[0].origin, 'other');
  assert.equal(notes[0].scoreMatch, null);
  audit.stop();
});

test('native exceptions retain identity and observer callback errors cannot change product return values', t => {
  browserGlobals(t);
  const failure = new Error('original note error');
  const first = mock();
  first.engine.playNote = () => { throw failure; };
  const notes = [], audit = window.__createAudioNoteAudit(first.engine, first.perf, note => notes.push(note));
  assert.throws(() => first.perf._schedule(), error => error === failure);
  assert.equal(notes[0].error, failure.message);
  assert.equal(summary(notes, audit).checks.noObservedNoteErrors, false);
  audit.stop();
  const second = mock();
  const brokenObserver = window.__createAudioNoteAudit(second.engine, second.perf, () => { throw new Error('observer error'); });
  assert.equal(second.perf._schedule(), second.token);
  assert.equal(brokenObserver.snapshot().observerErrors[0].message, 'observer error');
  assert.equal(summary([], brokenObserver).checks.noteAuditCompletedWithoutErrors, false);
  brokenObserver.stop();
});
