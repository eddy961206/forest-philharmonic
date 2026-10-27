import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildOrchestra } from '../public/js/scene/orchestra.js';
import { Performance } from '../public/js/audio/performance.js';

function fixture(t, brightFloor, scoreNotes = null) {
  const previousDocument = globalThis.document;
  t.after(() => { globalThis.document = previousDocument; });
  const context = new Proxy({}, { get: (_, key) => key.startsWith('create') ? () => ({ addColorStop() {} }) : () => {} });
  globalThis.document = { hidden: false, addEventListener() {}, createElement: () => ({ getContext: () => context }) };
  let seed = 9217;
  t.mock.method(Math, 'random', () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296));
  const orchestra = buildOrchestra(new THREE.Scene(), { brightFloor });
  const performance = new Performance({ onTick() {}, setTrim() {}, stopAll() {} });
  const notes = [];
  for (let i = 0; i < 80; i++) notes.push(i * .1, .25, 60, 100);
  performance.use(performance.prepare({ id: 'effects', duration: 10, tracks: [{ section: 'vn1', inst: 'violin', notes: scoreNotes ?? notes }] }));
  performance._resetVisual(0);
  return { orchestra, performance };
}

for (const venue of ['hall', 'sphere', 'outdoor']) {
  test(`${venue}: a sustained opening note emits before the playing pose fades in`, t => {
    const { orchestra, performance } = fixture(t, venue === 'outdoor', [0, 8, 60, 100]);
    // Keep this regression about onset delivery, independent of particle sampling.
    t.mock.method(Math, 'random', () => .25);
    const events = performance.updateVisual(0);
    orchestra.update(0, 1 / 60, performance, { running: true, particles: true, glow: true, events });
    const violinists = orchestra.players.filter(p => p.sid === 'vn1');
    assert.ok(violinists.every(p => p.effectsActive && p.ready < .1));
    assert.ok(orchestra.particles.stats.visible > 0, 'the only onset of a long note is retained');
  });

  test(`${venue}: notes and floor glow respect settings, efficient budget, and stage presence`, t => {
    const { orchestra, performance } = fixture(t, venue === 'outdoor');
    const frame = (time, options = {}) => {
      const events = performance.updateVisual(time);
      orchestra.update(time, 1 / 30, performance, { running: true, particles: true, glow: true, events, ...options });
    };
    for (let i = 0; i < 90; i++) frame(i / 30);
    const violinists = orchestra.players.filter(p => p.sid === 'vn1');
    assert.ok(violinists.some(p => p.glow.visible), 'active players are identified');
    assert.ok(orchestra.particles.stats.visible > 0, 'active notes spawn glyphs');
    assert.ok(orchestra.players.filter(p => p.sid !== 'vn1').every(p => !p.glow.visible), 'silent sections stay dark');
    assert.equal(orchestra.particles.stats.limit, orchestra.particles.stats.capacity);
    for (let i = 90; i < 150; i++) frame(i / 30, { effectBudget: .2 });
    assert.ok(orchestra.particles.stats.visible > 0, 'efficient mode retains notes');
    assert.ok(orchestra.particles.stats.visible <= 24);
    assert.ok(violinists.some(p => p.glow.visible), 'efficient mode retains the active-player marker');
    frame(5, { particles: false, glow: false });
    assert.equal(orchestra.particles.stats.visible, 0, 'off removes old notes immediately');
    assert.ok(orchestra.players.every(p => !p.glow.visible));
    for (const p of violinists) p.walker = { atHome: false, bow: 0, sit: 0 };
    for (let i = 151; i < 180; i++) frame(i / 30);
    assert.equal(orchestra.particles.stats.visible, 0, 'walking players do not leave floating notes');
    assert.ok(violinists.every(p => !p.glow.visible), 'empty home chairs do not glow during entry');
    for (const p of violinists) p.walker = null;
    for (let i = 180; i < 210; i++) frame(i / 30, { effectBudget: 1 });
    assert.equal(orchestra.particles.stats.limit, orchestra.particles.stats.capacity, 'normal mode restores the original pool');
    assert.ok(orchestra.particles.stats.visible > 0);
    frame(7, { running: false });
    assert.equal(orchestra.particles.stats.visible, 0);
    assert.ok(orchestra.players.every(p => !p.glow.visible));
  });
}
