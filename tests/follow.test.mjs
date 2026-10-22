import assert from 'node:assert/strict';
import test from 'node:test';
import { Performance, fetchPiece } from '../public/js/audio/performance.js';
import { PieceChooser } from '../public/js/pieces.js';
import { Follower, END_MARGIN } from '../public/js/follow.js';

// Issue #14 (and #13's same-piece snapshots): a guest already in step gets
// the host's playback by command and by snapshot. The real transport and
// piece chooser; the room clock, the network and the audio clock by hand.
const DURATION = 100;
const score = (id) => ({
  id, duration: DURATION,
  tracks: [{ section: 'vn1', inst: 'violin', chairs: [0], notes: [0, 1, 60, 80, 30, 1, 62, 80, 99, 0.5, 64, 80] }],
});
const program = ['A', 'B', 'C'];

function fixture(t, { hold = false } = {}) {
  const previous = { document: globalThis.document, fetch: globalThis.fetch };
  globalThis.document = { hidden: false, addEventListener() {} };
  const requests = [];
  globalThis.fetch = (url) => new Promise((resolve) => {
    const id = /music\/(.+)\.json$/.exec(url)[1];
    const answer = () => resolve({ ok: true, status: 200, json: async () => score(id) });
    if (hold) requests.push({ id, answer }); else answer();
  });
  t.after(() => {
    for (const [k, v] of Object.entries(previous)) if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  });
  const count = { stopAll: 0, onEnd: 0, stage: 0, started: 0, ensure: [] };
  const engine = { now: 10, outputLatency: 0, ctx: { state: 'running' }, onTick(fn) { this.tick = fn; }, playNote() {}, stopAll() { count.stopAll++; } };
  const perf = new Performance(engine);
  perf.onEnd = () => count.onEnd++; // (main.js: endOfPiece - the applause, the bows)
  const chooser = new PieceChooser({ fetch: fetchPiece, prepare: (p) => perf.prepare(p), apply: (prep) => perf.use(prep), loaded: () => perf.piece });
  const room = { now: 1000 };
  const ui = { playing: null };
  const follower = new Follower({
    perf,
    async ensurePiece(i) { count.ensure.push(i); return !!(await chooser.choose(program[i])); },
    now: () => room.now,
    stage: () => count.stage++,
    started: () => count.started++,
    playing: (on) => { ui.playing = on; },
  });
  return { perf, engine, chooser, follower, room, ui, count, requests };
}
const tick = () => new Promise((r) => setImmediate(r));
const play = (pos, at) => ({ i: 0, playing: true, pos, at });
const snap = (phase, extra = {}) => ({ i: 0, phase, playing: phase === 'playing', pos: 0, at: 0, ...extra });

// the guest playing piece A at 30 s, in step
async function at30(f) {
  assert.equal(await f.follower.playback(play(30, f.room.now)), true);
  assert.equal(f.perf.playing, true);
  f.count.stopAll = 0;
}

test('the host at the end of the piece: a guest playing at 30 s stops there, on each of the boundaries', async (t) => {
  for (const [host, ends] of [[99.79, false], [DURATION - END_MARGIN, true], [99.95, true]]) {
    const f = fixture(t);
    await at30(f);
    const r = await f.follower.playback(play(host, f.room.now));
    if (!ends) {
      assert.equal(r, true);
      assert.equal(f.perf.playing, true);
      assert.ok(Math.abs(f.perf.pos - Math.min(host + 0.12, DURATION - 0.05)) < 1e-9, `${host}: sought to where the host is`);
      assert.equal(f.count.onEnd, 0);
      continue;
    }
    assert.equal(r, 'over', `${host}`);
    assert.equal(f.perf.playing, false, `${host}: not playing on from 30 s`);
    assert.equal(f.perf.pos, DURATION);
    assert.equal(f.count.onEnd, 1, `${host}: the end, once`);
    assert.equal(f.count.stopAll, 1);
  }
});

test('a command, a snapshot, or both repeated: the same end, its side effects once', async (t) => {
  const finals = [];
  for (const how of ['cmd', 'snapshot', 'both']) {
    const f = fixture(t);
    await at30(f);
    const now = f.room.now;
    const sends = how === 'cmd' ? [play(99.95, now)] : how === 'snapshot' ? [snap('playing', { pos: 99.95, at: now })]
      : [play(99.95, now), snap('playing', { pos: 99.95, at: now }), play(99.95, now), snap('playing', { pos: 99.95, at: now })];
    for (const s of sends) await f.follower.playback(s);
    // and the host's phases after its end
    for (const phase of ['afterglow', 'applause', 'intermission']) f.follower.between(snap(phase), { index: 0, ceremony: false });
    finals.push({ playing: f.perf.playing, pos: f.perf.pos, ...f.count, ensure: [...new Set(f.count.ensure)] });
  }
  assert.deepEqual(finals[1], finals[0]);
  assert.deepEqual(finals[2], finals[0]);
  assert.equal(finals[0].onEnd, 1);
  assert.equal(finals[0].stopAll, 1);
  assert.deepEqual(finals[0].ensure, [0], 'never the next piece on its own');
});

test('the host already bowing while a guest still plays the piece: it ends here, once', async (t) => {
  const f = fixture(t);
  await at30(f);
  assert.equal(f.follower.between(snap('afterglow'), { index: 0, ceremony: false }), true);
  for (const phase of ['applause', 'intermission', 'intermission']) assert.equal(f.follower.between(snap(phase), { index: 0, ceremony: false }), false);
  assert.equal(f.perf.playing, false);
  assert.equal(f.count.onEnd, 1);
  assert.equal(f.count.stopAll, 1);
});

test('between pieces never ends what is not this piece playing: a walk-on of ours, another piece, a choice on its way', async (t) => {
  const f = fixture(t);
  await at30(f);
  assert.equal(f.follower.between(snap('intermission'), { index: 0, ceremony: true }), false);
  assert.equal(f.follower.between(snap('intermission', { i: 1 }), { index: 0, ceremony: false }), false);
  assert.equal(f.follower.between(snap('intermission', { loading: true }), { index: 0, ceremony: false }), false);
  assert.equal(f.follower.between(snap('changing'), { index: 0, ceremony: false }), false);
  assert.equal(f.perf.playing, true);
  assert.equal(f.count.onEnd, 0);
});

test('a natural end, then the host saying so again: no second end', async (t) => {
  const f = fixture(t);
  await f.follower.playback(play(99, f.room.now));
  f.engine.now += 2; // the music plays out here
  f.engine.tick();
  assert.equal(f.count.onEnd, 1);
  await f.follower.playback(play(99.95, f.room.now));
  f.follower.between(snap('applause'), { index: 0, ceremony: false });
  assert.equal(f.count.onEnd, 1);
});

test('paused near the end is paused - and goes on from there', async (t) => {
  const f = fixture(t);
  await at30(f);
  assert.equal(await f.follower.playback({ i: 0, playing: false, pos: 99.9, at: f.room.now }), true);
  assert.equal(f.perf.playing, false);
  assert.equal(f.perf.pos, 99.9);
  assert.equal(f.count.onEnd, 0);
  assert.equal(f.ui.playing, false);
  // the host plays it from its start again
  assert.equal(await f.follower.playback(play(0, f.room.now)), true);
  assert.equal(f.perf.playing, true);
  assert.equal(f.count.onEnd, 0);
});

test('paused near the end, then the host plays the last moment: that is the end', async (t) => {
  const f = fixture(t);
  await at30(f);
  await f.follower.playback({ i: 0, playing: false, pos: 99.9, at: f.room.now });
  assert.equal(await f.follower.playback(play(99.9, f.room.now)), 'over');
  assert.equal(f.count.onEnd, 1);
});

test('the end told again and again, then the same piece once more (one piece on repeat): it plays, and ends again', async (t) => {
  const f = fixture(t);
  await at30(f);
  for (let k = 0; k < 3; k++) await f.follower.playback(play(99.95, f.room.now));
  assert.equal(f.count.onEnd, 1);
  // the host's 'run' of the same piece (runConcert: perf.seek(0)), then its play
  f.perf.seek(0);
  assert.equal(await f.follower.playback(play(0, f.room.now)), true);
  assert.equal(f.perf.playing, true);
  await f.follower.playback(play(99.95, f.room.now));
  assert.equal(f.count.onEnd, 2);
});

test('in late at the end: nothing is set up or stopped here, the caller sets the stage between pieces', async (t) => {
  const f = fixture(t);
  await f.chooser.choose('A');
  assert.equal(await f.follower.apply(play(99.95, f.room.now)), 'over');
  assert.equal(f.count.stage, 0);
  assert.equal(f.count.onEnd, 0);
  assert.equal(f.perf.playing, false);
});

test('a newer piece chosen while an old end is on its way: the old one does not touch it', async (t) => {
  const f = fixture(t, { hold: true });
  const first = f.follower.playback({ i: 0, playing: true, pos: 30, at: f.room.now });
  await tick();
  f.requests.shift().answer();
  await first;
  // the host's "B is over", B still on its way here...
  const late = f.follower.playback({ i: 1, playing: true, pos: 99.95, at: f.room.now });
  await tick();
  // ... and the host has moved on to C, which plays
  const next = f.follower.playback({ i: 2, playing: true, pos: 0, at: f.room.now });
  await tick();
  const c = f.requests.find((r) => r.id === 'C');
  c.answer();
  assert.equal(await next, true);
  f.requests.find((r) => r.id === 'B').answer();
  assert.equal(await late, false);
  assert.equal(f.perf.piece.id, 'C');
  assert.equal(f.perf.playing, true);
  assert.equal(f.count.onEnd, 0);
});

test('(#13) the same B by five snapshots while B is on its way: one download, the latest playback applied', async (t) => {
  const f = fixture(t, { hold: true });
  const asks = [];
  const states = [
    { i: 1, playing: true, pos: 10, at: 1000 },
    { i: 1, playing: true, pos: 13, at: 1003 },
    { i: 1, playing: false, pos: 14, at: 1004 }, // paused...
    { i: 1, playing: true, pos: 14, at: 1006 },
    { i: 1, playing: true, pos: 40, at: 1009 }, // ...played again, sought to 40
  ];
  for (const s of states) { f.room.now = s.at; asks.push(f.follower.playback(s)); await tick(); }
  assert.equal(f.requests.length, 1);
  f.room.now = 1010; // B arrives a second after the last state
  f.requests[0].answer();
  assert.deepEqual(await Promise.all(asks), [false, false, false, false, true]);
  assert.equal(f.perf.piece.id, 'B');
  assert.equal(f.perf.playing, true);
  assert.ok(Math.abs(f.perf.pos - (41 + 0.12)) < 1e-9, 'where the host is now: 40 s + 1 s, a little ahead');
  assert.equal(f.count.started, 1);
});
