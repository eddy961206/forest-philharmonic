import assert from 'node:assert/strict';
import test from 'node:test';
import { Performance } from '../public/js/audio/performance.js';
import { SoundRecovery, wantsSound } from '../public/js/audio/resume.js';

// Issue #15: the audio context taken away by the browser (interrupted /
// suspended) while the transport still plays. A stub context whose resume()
// answers when a test says so; the real transport on the stub's clock.
function context(state = 'interrupted') {
  const ctx = {
    state, resumes: 0, suspends: 0, answers: [],
    resume() {
      ctx.resumes++;
      return new Promise((ok, no) => ctx.answers.push({ ok: () => { ctx.state = 'running'; ok(); }, no: () => no(new DOMException('not allowed', 'NotAllowedError')), hang: () => {} }));
    },
    suspend() { ctx.suspends++; ctx.state = 'suspended'; return Promise.resolve(); },
  };
  return ctx;
}

function fixture(t, { state = 'interrupted', playing = true, asleep = false, between = false } = {}) {
  const ctx = context(state);
  const me = { inside: true, asleep, playing, between };
  const seen = { blocked: [], recovered: 0 };
  const sound = new SoundRecovery({
    ctx: () => ctx,
    wanted: (gesture) => wantsSound(me, gesture),
    asleep: () => me.asleep,
    blocked: (on) => seen.blocked.push(on),
    recovered: () => seen.recovered++,
    wait: 20,
  });
  t.after(() => clearTimeout(sound._timer));
  return { ctx, me, seen, sound };
}
const tick = () => new Promise((r) => setImmediate(r));
const later = (ms) => new Promise((r) => setTimeout(r, ms));

test('what is wanted: the user\'s intent, the page\'s sleep and a gesture kept apart', () => {
  const base = { inside: true, asleep: false, playing: false, between: false };
  assert.equal(wantsSound({ ...base, playing: true }), true);
  assert.equal(wantsSound({ ...base, between: true }), true, 'the show going on between pieces');
  assert.equal(wantsSound(base), false, 'paused by the user');
  assert.equal(wantsSound(base, true), true, 'a touch while paused: the context may run, the music stays paused');
  assert.equal(wantsSound({ ...base, playing: true, asleep: true }, true), false, 'asleep');
  assert.equal(wantsSound({ ...base, playing: true, inside: false }, true), false, 'not in yet');
});

test('back to the page, the context\'s change, a touch and the media keys at once: one resume, recovered once', async (t) => {
  const f = fixture(t);
  const asks = [f.sound.check(), f.sound.changed(), f.sound.check(), f.sound.check()];
  assert.equal(f.ctx.resumes, 1);
  f.ctx.answers[0].ok();
  f.sound.changed(); // (the 'statechange' to running)
  assert.equal((await asks[0]), true);
  await Promise.all(asks);
  assert.equal(f.seen.recovered, 1);
  assert.equal(f.sound.lost, false);
});

test('paused by the user, or the page asleep: no resume', (t) => {
  for (const opt of [{ playing: false }, { asleep: true }]) {
    const f = fixture(t, opt);
    f.sound.check();
    f.sound.changed();
    assert.equal(f.ctx.resumes, 0, JSON.stringify(opt));
    assert.equal(f.seen.recovered, 0);
  }
});

test('a resume asked for in the background that never answers: coming back asks afresh, once', async (t) => {
  const f = fixture(t);
  f.sound.changed(); // (the browser took it, the page hidden: asked at once - it may be allowed)
  f.sound.check(); // (more asks meanwhile share it)
  assert.equal(f.ctx.resumes, 1);
  assert.equal(f.sound.lost, true);
  // back to the page: asked afresh (not the one from the background), shared again
  const back = f.sound.check({ fresh: true });
  f.sound.check();
  f.sound.changed();
  assert.equal(f.ctx.resumes, 2);
  f.ctx.answers[1].ok();
  assert.equal(await back, true);
  assert.equal(f.seen.recovered, 1);
  // (and one that has had its time without an answer is not waited on for ever)
  const g = fixture(t);
  g.sound.check();
  await later(40);
  g.sound.check();
  assert.equal(g.ctx.resumes, 2);
});

test('a resume that never answers (the browser waits for a touch): the button, and the touch resumes inside the gesture', async (t) => {
  const f = fixture(t);
  f.sound.check();
  await later(40);
  assert.deepEqual(f.seen.blocked, [true]);
  // the press on "소리 다시 켜기": asked again inside the gesture, not the old request
  const touch = f.sound.check({ gesture: true });
  assert.equal(f.ctx.resumes, 2);
  f.ctx.answers[1].ok();
  assert.equal(await touch, true);
  assert.deepEqual(f.seen.blocked, [true, false]);
  assert.equal(f.seen.recovered, 1);
});

test('a refused resume is not success: the button stays, nothing recovered', async (t) => {
  const f = fixture(t);
  const p = f.sound.check();
  f.ctx.answers[0].no();
  assert.equal(await p, false);
  assert.deepEqual(f.seen.blocked, [true]);
  assert.equal(f.seen.recovered, 0);
  assert.notEqual(f.ctx.state, 'running');
});

test('paused while the resume was on its way: no button for music that is not wanted', async (t) => {
  const f = fixture(t);
  const p = f.sound.check();
  f.me.playing = false; // the user pauses
  f.sound.check();
  await later(40);
  f.ctx.answers[0].no();
  await p;
  assert.ok(!f.seen.blocked.includes(true));
});

test('asleep before a late resume answered: the sound stays off', async (t) => {
  const f = fixture(t);
  const p = f.sound.check();
  f.me.asleep = true; // the sleep timer runs out meanwhile
  f.ctx.answers[0].ok();
  assert.equal(await p, false);
  assert.equal(f.ctx.state, 'suspended');
  assert.equal(f.ctx.suspends, 1);
  assert.equal(f.seen.recovered, 0);
});

test('a context the browser gave back by itself: no resume, the button away', (t) => {
  const f = fixture(t, { state: 'running' });
  f.sound.changed();
  f.sound.check();
  assert.equal(f.ctx.resumes, 0);
  assert.equal(f.seen.recovered, 0);
});

test('the transport keeps its clock and its schedule: no restart, no second scheduler, no doubled notes', async (t) => {
  const previous = globalThis.document;
  globalThis.document = { hidden: false, addEventListener() {} };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const ctx = context('running');
  const notes = [];
  const engine = { now: 0, outputLatency: 0, ctx, onTick(fn) { this.tick = fn; }, playNote(n) { notes.push(n.when); }, stopAll() {} };
  const perf = new Performance(engine);
  const piece = { duration: 60, tracks: [{ section: 'vn1', inst: 'violin', chairs: [0], notes: Array.from({ length: 240 }, (_, k) => [k * 0.25, 0.2, 60, 80]).flat() }] };
  perf.use(perf.prepare(piece));
  const me = { inside: true, asleep: false, playing: true, between: false };
  const sound = new SoundRecovery({ ctx: () => ctx, wanted: (g) => wantsSound({ ...me, playing: perf.playing }, g), wait: 1e6 });
  perf.wake = () => { sound.check(); };
  t.after(() => clearTimeout(sound._timer));
  perf.play();
  for (let k = 1; k <= 40; k++) { engine.now = k * 0.025; engine.tick(); }
  const at = perf.time;
  const scheduled = notes.length;
  const { startCtx, startPos } = perf;
  // the browser takes the sound: its clock stands still
  ctx.state = 'interrupted';
  for (let k = 0; k < 20; k++) engine.tick();
  perf.play(); // (a second ▶ while "playing": nothing new)
  assert.equal(notes.length, scheduled, 'nothing more scheduled on a clock that stands still');
  assert.equal(perf.time, at);
  // back: one resume, the same clock and schedule
  const back = sound.check();
  sound.check();
  assert.equal(ctx.resumes, 1);
  ctx.answers[0].ok();
  assert.equal(await back, true);
  assert.equal(perf.playing, true);
  assert.deepEqual({ startCtx: perf.startCtx, startPos: perf.startPos }, { startCtx, startPos });
  for (let k = 41; k <= 80; k++) { engine.now = k * 0.025; engine.tick(); }
  assert.ok(perf.time > at, 'the music goes on from where it stood');
  assert.equal(notes.length, perf.schedIdx, 'each note scheduled once: one scheduler, nothing restarted');
});

test('play() on a context that is not running asks by the shared way, after it is playing', async (t) => {
  const previous = globalThis.document;
  globalThis.document = { hidden: false, addEventListener() {} };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const ctx = context('suspended');
  const engine = { now: 0, outputLatency: 0, ctx, onTick() {}, playNote() {}, stopAll() {} };
  const perf = new Performance(engine);
  perf.use(perf.prepare({ duration: 10, tracks: [{ section: 'vn1', inst: 'violin', chairs: [0], notes: [0, 1, 60, 80] }] }));
  const sound = new SoundRecovery({ ctx: () => ctx, wanted: (g) => wantsSound({ inside: true, asleep: false, playing: perf.playing, between: false }, g), wait: 1e6 });
  perf.wake = () => { sound.check(); };
  t.after(() => clearTimeout(sound._timer));
  perf.play();
  assert.equal(ctx.resumes, 1);
  await tick();
});
