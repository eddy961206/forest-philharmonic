import assert from 'node:assert/strict';
import test from 'node:test';
import { Performance, fetchPiece } from '../public/js/audio/performance.js';
import { PieceChooser, ScoreLibrary, transportState } from '../public/js/pieces.js';

// Issue #13: a piece chosen while another is on its way, and a download that
// fails. The real transport and the real chooser; the network is a set of
// answers resolved by hand, one per request, in whatever order a test wants.
const score = (id, duration = 100) => ({
  id, titleKo: id, duration,
  tracks: [{ section: 'vn1', inst: 'violin', chairs: [0], notes: [0, 0.5, 60, 80, 1, 0.5, 62, 80, 50, 0.5, 64, 80, duration - 1, 0.5, 65, 80] }],
});

function fixture(t) {
  const previous = { document: globalThis.document, fetch: globalThis.fetch };
  globalThis.document = { hidden: false, addEventListener() {} };
  const requests = [];
  globalThis.fetch = (url) => new Promise((resolve, reject) => {
    const id = /music\/(.+)\.json$/.exec(url)[1];
    requests.push({
      id,
      ok: () => resolve({ ok: true, status: 200, json: async () => score(id) }),
      status: (code) => resolve({ ok: false, status: code, json: async () => ({ error: code }) }),
      body: (data) => resolve({ ok: true, status: 200, json: async () => data }),
      fail: () => reject(new TypeError('Failed to fetch')),
    });
  });
  t.after(() => {
    for (const [k, v] of Object.entries(previous)) if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  });
  const stops = [];
  const engine = { now: 0, outputLatency: 0, ctx: { state: 'running' }, onTick() {}, playNote() {}, stopAll() { stops.push(engine.now); } };
  const perf = new Performance(engine);
  const applied = [];
  const prepared = [];
  const chooser = new PieceChooser({
    fetch: fetchPiece,
    prepare: (p) => { prepared.push(p.id); return perf.prepare(p); },
    apply: (prep) => { applied.push(prep.piece.id); return perf.use(prep); },
    loaded: () => perf.piece,
  });
  const pending = (id) => requests.filter((r) => r.id === id);
  return { perf, engine, chooser, requests, pending, stops, applied, prepared };
}
const tick = () => new Promise((r) => setImmediate(r));

test('roster and playback share scores; recent use controls the bounded cache', async () => {
  const calls = [];
  const library = new ScoreLibrary(async id => { calls.push(id); return score(id); }, 2);
  const roster = library.get('A'), playback = library.get('A');
  assert.equal(roster, playback);
  assert.equal(await roster, await playback);
  await library.get('B');
  await library.get('A'); // A is still needed: B is the next to leave.
  await library.get('C');
  assert.deepEqual([...library.ready.keys()], ['A', 'C']);
  await library.get('B');
  assert.deepEqual(calls, ['A', 'B', 'C', 'B']);
  assert.equal(library.ready.size, 2);
  assert.equal(library.pending.size, 0);
});

test('failed look-ahead downloads are retried and never cached as empty scores', async () => {
  let calls = 0;
  const library = new ScoreLibrary(async id => {
    if (++calls === 1) throw Error('offline');
    return score(id);
  });
  await assert.rejects(library.get('A'), /offline/);
  assert.equal(library.ready.size, 0);
  assert.equal(library.pending.size, 0);
  assert.equal((await library.get('A')).id, 'A');
  assert.equal(calls, 2);
});

// A playing at 50 s, as the user hears it
async function playingA(f) {
  const a = f.chooser.choose('A');
  await tick();
  f.pending('A')[0].ok();
  assert.equal((await a).id, 'A');
  f.perf.seek(50);
  f.perf.play();
  f.stops.length = 0;
  f.applied.length = 0;
}

test('A -> B (held) -> A: the late B never replaces A, nor stops it', async (t) => {
  const f = fixture(t);
  await playingA(f);
  const b = f.chooser.choose('B');
  await tick();
  assert.equal(f.chooser.loading('B'), true);
  // back to A, which is loaded: no download, but B is no longer wanted
  assert.equal((await f.chooser.choose('A')).id, 'A');
  assert.equal(f.chooser.loading('B'), false);
  f.pending('B')[0].ok();
  assert.equal(await b, null);
  assert.equal(f.perf.piece.id, 'A');
  assert.equal(f.perf.playing, true);
  assert.deepEqual(f.stops, []);
  assert.deepEqual(f.applied, []);
});

test('A -> B -> C answered in reverse: C stays, B arriving or failing late changes nothing', async (t) => {
  for (const late of ['ok', 'fail']) {
    const f = fixture(t);
    await playingA(f);
    const b = f.chooser.choose('B');
    const c = f.chooser.choose('C');
    await tick();
    f.pending('C')[0].ok();
    assert.equal((await c).id, 'C');
    f.perf.play();
    f.pending('B')[0][late]();
    assert.equal(await b, null, `B ${late}: superseded, never an error for the newer choice`);
    assert.equal(f.perf.piece.id, 'C');
    assert.equal(f.perf.playing, true);
    assert.deepEqual(f.applied, ['C']);
  }
});

test('a failed download rejects the latest choice, leaves the loaded piece alone, and is tried afresh', async (t) => {
  for (const failure of [(r) => r.fail(), (r) => r.status(503), (r) => r.body({ not: 'a score' })]) {
    const f = fixture(t);
    await playingA(f);
    f.perf.pause();
    const at = f.perf.pos;
    const b = f.chooser.choose('B');
    await tick();
    failure(f.pending('B')[0]);
    await assert.rejects(b);
    assert.equal(f.perf.piece.id, 'A');
    assert.equal(f.perf.pos, at);
    assert.equal(f.chooser.loading('B'), false);
    // the retry asks the network again (the failure is not kept) and comes through
    const again = f.chooser.choose('B');
    await tick();
    assert.equal(f.pending('B').length, 2);
    f.pending('B')[1].ok();
    assert.equal((await again).id, 'B');
    assert.equal(f.perf.piece.id, 'B');
    assert.equal(f.perf.pos, 0);
  }
});

test('the same piece asked for again and again while on its way is one download; the latest ask applies it', async (t) => {
  const f = fixture(t);
  await playingA(f);
  f.perf.pause();
  // a guest told "B" by five snapshots before B arrives
  const asks = [];
  for (let k = 0; k < 5; k++) { asks.push(f.chooser.choose('B')); await tick(); }
  assert.equal(f.pending('B').length, 1);
  f.pending('B')[0].ok();
  const got = await Promise.all(asks);
  assert.deepEqual(got.map((p) => p?.id ?? null), [null, null, null, null, 'B']);
  assert.equal(f.prepared.filter(id => id === 'B').length, 1);
  assert.deepEqual(f.applied, ['B']);
  assert.equal(f.perf.piece.id, 'B');
});

test('a shared download of B then a choice of C or of the loaded A: B does not land', async (t) => {
  for (const then of ['A', 'C']) {
    const f = fixture(t);
    await playingA(f);
    const asks = [f.chooser.choose('B')];
    await tick();
    asks.push(f.chooser.choose('B'));
    const other = f.chooser.choose(then);
    await tick();
    if (then === 'C') f.pending('C')[0].ok();
    f.pending('B')[0].ok();
    assert.deepEqual((await Promise.all(asks)).map((p) => p?.id ?? null), [null, null]);
    assert.equal((await other).id, then);
    assert.equal(f.perf.piece.id, then);
  }
});

test('a shared download that fails is tried again by the next ask', async (t) => {
  const f = fixture(t);
  await playingA(f);
  const first = f.chooser.choose('B');
  await tick();
  const second = f.chooser.choose('B');
  f.pending('B')[0].fail();
  assert.equal(await first, null); // (overtaken by the second ask: it is the one told)
  await assert.rejects(second, /Failed to fetch/);
  const third = f.chooser.choose('B');
  await tick();
  assert.equal(f.pending('B').length, 2);
  f.pending('B')[1].ok();
  assert.equal((await third).id, 'B');
});

test('the room is never told a piece with the time of the one before', () => {
  const A = { id: 'A' };
  const B = { id: 'B' };
  // B chosen, A still loaded (paused at 50 s, in A's 'playing' phase)
  assert.deepEqual(transportState({ chosen: B, loaded: A, phase: 'playing', playing: false, time: 50 }), { phase: 'changing', playing: false, pos: 0, loading: true });
  // between pieces it stays between pieces, the new piece at its start
  assert.deepEqual(transportState({ chosen: B, loaded: A, phase: 'intermission', playing: false, time: 100 }), { phase: 'intermission', playing: false, pos: 0, loading: true });
  // loaded: as it is
  assert.deepEqual(transportState({ chosen: B, loaded: B, phase: 'playing', playing: true, time: 12 }), { phase: 'playing', playing: true, pos: 12 });
});


test('superseded choices skip score preparation before the expensive work begins', async t => {
  const f = fixture(t);
  await playingA(f);
  f.prepared.length = 0;
  const choices = ['B', 'C', 'D'].map(id => f.chooser.choose(id));
  await tick();
  for (const id of ['B', 'C', 'D']) f.pending(id)[0].ok();
  assert.deepEqual((await Promise.all(choices)).map(p => p?.id ?? null), [null, null, 'D']);
  assert.deepEqual(f.prepared, ['D']);
  assert.deepEqual(f.applied, ['D']);
  assert.equal(f.chooser._pending.size, 0);
});

test('returning to the loaded piece discards preparation, but selecting the pending id again preserves it', async t => {
  const f = fixture(t);
  await playingA(f);
  f.prepared.length = 0;
  const stale = f.chooser.choose('B');
  await tick();
  await f.chooser.choose('A');
  f.pending('B')[0].ok();
  assert.equal(await stale, null);
  assert.deepEqual(f.prepared, []);

  const first = f.chooser.choose('B');
  await tick();
  await f.chooser.choose('A');
  const latest = f.chooser.choose('B');
  f.pending('B')[1].ok();
  assert.equal(await first, null);
  assert.equal((await latest).id, 'B');
  assert.equal(f.pending('B').length, 2); // one fetch per pending round
  assert.deepEqual(f.prepared, ['B']);
});

test('independent preload shares preparation and survives a different playback choice', async t => {
  for (const preloadFirst of [true, false]) {
    const f = fixture(t);
    await playingA(f);
    f.prepared.length = 0;
    let preload, choice;
    if (preloadFirst) {
      preload = f.chooser.prepare('B');
      choice = f.chooser.choose('B');
    } else {
      choice = f.chooser.choose('B');
      preload = f.chooser.prepare('B'); // promote a playback-only request
    }
    assert.equal(preload, f.chooser.prepare('B'));
    await tick();
    await f.chooser.choose('A');
    assert.equal(f.pending('B').length, 1);
    f.pending('B')[0].ok();
    assert.equal((await preload).piece.id, 'B');
    assert.equal(await choice, null);
    assert.deepEqual(f.prepared, ['B']);
    assert.deepEqual(f.applied, []);
  }
});

test('independent preload failures still reject after playback chooses elsewhere', async t => {
  const f = fixture(t);
  await playingA(f);
  const preload = f.chooser.prepare('B');
  const rejected = assert.rejects(preload, /Failed to fetch/);
  const choice = f.chooser.choose('B');
  await tick();
  await f.chooser.choose('A');
  f.pending('B')[0].fail();
  await rejected;
  assert.equal(await choice, null);
  assert.equal(f.chooser._pending.size, 0);
});
