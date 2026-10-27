import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULTS, loadSettings, saveSettings, crowdKey } from '../public/js/app/settings.js';
import { createAppState, clockOf, isGuest, waitFor, untilFor, seeded } from '../public/js/app/state.js';

// The controllers in public/js/app share one state object and one settings
// object; the pieces that need no browser are checked here.
const memory = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, data };
};
const QUALITIES = ['high', 'medium', 'low'];

test('settings start from the defaults and keep what was saved', () => {
  assert.deepEqual(loadSettings(memory(), QUALITIES), DEFAULTS);
  const s = loadSettings(memory({ 'fp-settings': JSON.stringify({ volume: 0.3, quality: 'efficient' }) }), QUALITIES);
  assert.equal(s.volume, 0.3);
  assert.equal(s.quality, 'efficient');
});

test('old switches are carried over and an unknown quality falls back to auto', () => {
  const s = loadSettings(memory({ 'fp-settings': JSON.stringify({ audience: false, applause: false, quality: 'ultra' }) }), QUALITIES);
  assert.equal(s.crowdHall, 0);
  assert.equal(s.crowdSphere, 0);
  assert.equal(s.crowdOutdoor, 0);
  assert.equal(s.applauseVol, 0);
  assert.equal('audience' in s, false);
  assert.equal('applause' in s, false);
  assert.equal(s.quality, 'auto');
});

test('settings survive broken or missing storage', () => {
  assert.deepEqual(loadSettings(memory({ 'fp-settings': '{not json' }), QUALITIES), DEFAULTS);
  assert.deepEqual(loadSettings(null, QUALITIES), DEFAULTS);
  assert.doesNotThrow(() => saveSettings(null, DEFAULTS));
  const store = memory();
  saveSettings(store, { ...DEFAULTS, gap: 3 });
  assert.equal(JSON.parse(store.data['fp-settings']).gap, 3);
});

test('each venue has its own audience setting', () => {
  assert.equal(crowdKey({ sphere: true }), 'crowdSphere');
  assert.equal(crowdKey({ outdoor: true }), 'crowdOutdoor');
  assert.equal(crowdKey({}), 'crowdHall');
});

test('the room clock and the guest role come from the shared state', () => {
  const S = createAppState('hall');
  assert.equal(S.phase, 'lobby');
  assert.equal(isGuest(S), false);
  assert.ok(Math.abs(clockOf(S) - performance.now() / 1000) < 1);
  S.room = { isHost: false, now: () => 42 };
  assert.equal(isGuest(S), true);
  assert.equal(clockOf(S), 42);
  S.room.isHost = true;
  assert.equal(isGuest(S), false);
});

test('a newer concert sequence cancels the steps of the older one', async () => {
  const S = createAppState('hall');
  const tok = ++S.seq;
  assert.equal(await waitFor(S, 5, tok), true);
  const waiting = untilFor(S, () => false, tok, 5000);
  S.seq++;
  assert.equal(await waiting, false);
  const fresh = ++S.seq;
  assert.equal(await untilFor(S, () => true, fresh), true);
});

test('the seeded generator is the same on every screen', () => {
  const a = seeded(1234);
  const b = seeded(1234);
  const xs = Array.from({ length: 5 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs, Array.from({ length: 5 }, seeded(4321)));
});
