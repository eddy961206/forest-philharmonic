import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildScreen } from '../public/js/scene/screen.js';

function fixture(t, options = {}) {
  let now = 0;
  const canvasOps = { clears: 0, texts: [] };
  const context = {
    clearRect() { canvasOps.clears++; },
    createLinearGradient() { return { addColorStop() {} }; },
    fillRect() {},
    fillText(text) { canvasOps.texts.push(text); },
    measureText(text) { return { width: text.length * 12 }; },
  };
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const oldPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  const fonts = new EventTarget();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    fonts,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return { width: 0, height: 0, getContext(type) { assert.equal(type, '2d'); return context; } };
    },
  } });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now * 1000 } });
  t.after(() => {
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete globalThis.document;
    Object.defineProperty(globalThis, 'performance', oldPerformance);
  });
  t.mock.method(Math, 'random', () => 0); // A seven-second wide shot with a known drift.
  const scene = new THREE.Scene();
  const previousTarget = { name: 'previous-render-target' };
  let target = previousTarget;
  const renders = [];
  const hooks = [];
  let fail = null;
  let screen;
  const renderer = {
    getRenderTarget: () => target,
    setRenderTarget: (next) => { target = next; },
    render(renderedScene, camera) {
      assert.equal(renderedScene, scene);
      assert.equal(screen.group.visible, false, 'the broadcast never films its own screen');
      assert.notEqual(target, previousTarget);
      assert.equal(target.texture, screen.texture);
      if (fail === 'render') throw new Error('render failed');
      renders.push({ position: camera.position.clone(), fov: camera.fov });
    },
  };
  screen = buildScreen(scene, renderer, {
    ...options,
    before() { hooks.push('before'); if (fail === 'before') throw new Error('before failed'); },
    after() {
      hooks.push('after');
      assert.equal(target, previousTarget, 'the render target is restored before the after hook');
      if (fail === 'after') throw new Error('after failed');
    },
  });
  const ctx = { perf: { piece: null, playing: false }, time: 0, phase: 'lobby', nextPiece: null };
  const tick = (dt = 1 / 60, every = 2) => { now += dt; screen.update(dt, ctx, every); };
  return {
    screen, renderer, previousTarget, renders, hooks, canvasOps, fonts, ctx, tick,
    setTime: (seconds) => { now = seconds; },
    setFailure: (where) => { fail = where; },
  };
}

test('low quality draws its first live frame immediately, then uses the existing cadence', (t) => {
  const f = fixture(t, { lite: true, headless: true });
  f.tick(1 / 60, 90);
  assert.equal(f.renders.length, 1);
  for (let frame = 2; frame < 90; frame++) f.tick(1 / 60, 90);
  assert.equal(f.renders.length, 1);
  f.tick(1 / 60, 90);
  assert.equal(f.renders.length, 2);
});

test('a zero cadence suppresses initial and invalidated renders, then resumes immediately', (t) => {
  const f = fixture(t, { lite: true, headless: true });
  const initialPosition = f.screen.cam.position.clone();
  f.tick(1 / 60, 0);
  f.tick(1 / 60, 0);
  assert.equal(f.renders.length, 0, 'the initial refresh must respect an unseen feed');
  assert.deepEqual(f.hooks, []);
  assert.deepEqual(f.screen.cam.position, initialPosition);
  assert.equal(f.renderer.getRenderTarget(), f.previousTarget);

  f.tick(1 / 60, 90); // Frame 3 is not a periodic broadcast frame.
  assert.equal(f.renders.length, 1, 'enabling the feed keeps its pending initial refresh');
  f.tick(1 / 60, 90);
  assert.equal(f.renders.length, 1);

  const renderedPosition = f.screen.cam.position.clone();
  f.screen.invalidate();
  f.tick(1 / 60, 0);
  f.tick(1 / 60, 0);
  assert.equal(f.renders.length, 1, 'explicit invalidation must also respect a zero cadence');
  assert.deepEqual(f.hooks, ['before', 'after']);
  assert.deepEqual(f.screen.cam.position, renderedPosition);
  assert.equal(f.renderer.getRenderTarget(), f.previousTarget);

  f.tick(1 / 60, 90); // Frame 7 must consume the refresh without waiting until frame 90.
  assert.equal(f.renders.length, 2);
  assert.deepEqual(f.hooks, ['before', 'after', 'before', 'after']);
  f.tick(1 / 60, 90);
  assert.equal(f.renders.length, 2, 'the refresh is consumed once');
});

test('reactivating the live feed refreshes its texture before the next periodic frame', (t) => {
  const f = fixture(t, { lite: true, headless: true });
  f.tick(1 / 60, 90);
  f.tick(1 / 60, 90);
  assert.equal(f.renders.length, 1);
  f.setTime(40); // No broadcast updates while a Sphere world covers the dome.
  f.screen.invalidate();
  f.tick(1 / 60, 90);
  assert.equal(f.renders.length, 2);
  f.tick(1 / 60, 90);
  assert.equal(f.renders.length, 2);
});

test('successful rendering restores the previous target and visibility', (t) => {
  const f = fixture(t);
  f.tick();
  assert.equal(f.renderer.getRenderTarget(), f.previousTarget);
  assert.equal(f.screen.group.visible, true);
  assert.deepEqual(f.hooks, ['before', 'after']);
  f.screen.setEnabled(false);
  f.tick(1 / 60, 1);
  assert.equal(f.screen.group.visible, false, 'a disabled screen stays disabled');
});

for (const failure of ['before', 'render', 'after']) {
  test(`${failure} errors restore the render target and screen visibility`, (t) => {
    const f = fixture(t);
    f.setFailure(failure);
    assert.throws(() => f.tick(1 / 60, 1), new RegExp(`${failure} failed`));
    assert.equal(f.renderer.getRenderTarget(), f.previousTarget);
    assert.equal(f.screen.group.visible, true);
    assert.deepEqual(f.hooks, ['before', 'after']);
  });
}

test('shot time advances on skipped frames while camera matrices update only when rendered', (t) => {
  const f = fixture(t);
  f.tick(0.5, 4); // The initial shot starts at t=0.
  const start = f.screen.cam.position.clone();
  f.tick(0.5, 4);
  f.tick(0.5, 4);
  assert.deepEqual(f.screen.cam.position, start);
  f.tick(0.5, 4);
  assert.equal(f.renders.length, 2);
  const expected = new THREE.Vector3(0, 5.2, 16).addScaledVector(new THREE.Vector3(0, -0.3, -2.5), 1.5 / 7);
  assert.ok(f.renders[1].position.distanceTo(expected) < 1e-12);
  assert.equal(f.renders[1].fov, 38);
  for (let frame = 5; frame <= 16; frame++) f.tick(0.5, 4);
  assert.ok(f.renders.at(-1).position.distanceTo(start) < 1e-12, 'the next shot still starts at the original seven-second boundary');
});

test('600 empty-caption frames clear and dirty the canvas texture only once', (t) => {
  const f = fixture(t);
  const version = f.screen.capTex.version;
  for (let frame = 0; frame < 600; frame++) f.tick();
  assert.equal(f.canvasOps.clears, 1);
  assert.equal(f.screen.capTex.version - version, 1);
  assert.deepEqual(f.canvasOps.texts, []);
});

test('settled captions stop uploading, repaint when fonts load, and change for the next piece', (t) => {
  const f = fixture(t);
  f.ctx.phase = 'intermission';
  f.ctx.nextPiece = { id: 'one', composerKo: '바흐', titleKo: '첫 곡' };
  for (let frame = 0; frame < 90; frame++) f.tick();
  assert.ok(f.canvasOps.texts.includes('바흐 — 첫 곡'));
  const settled = f.screen.capTex.version;
  for (let frame = 0; frame < 600; frame++) f.tick();
  assert.equal(f.screen.capTex.version, settled);
  f.fonts.dispatchEvent(new Event('loadingdone'));
  for (let frame = 0; frame < 3; frame++) f.tick();
  assert.equal(f.screen.capTex.version, settled + 1);
  f.ctx.nextPiece = { id: 'two', composerKo: '모차르트', titleKo: '둘째 곡' };
  for (let frame = 0; frame < 90; frame++) f.tick();
  assert.ok(f.canvasOps.texts.includes('모차르트 — 둘째 곡'));
});

test('a title still animates in, fades out, and clears before caching the empty caption', (t) => {
  const f = fixture(t);
  f.ctx.phase = 'playing';
  f.ctx.perf = {
    piece: { id: 'title', composerKo: '바흐', titleKo: '연주곡', year: '1722' },
    playing: true, dominantSection: () => null,
  };
  for (let frame = 0; frame < 90; frame++) { f.ctx.time = frame / 60; f.tick(); }
  assert.ok(f.canvasOps.texts.includes('연주곡'));
  const settled = f.screen.capTex.version;
  for (let frame = 0; frame < 60; frame++) { f.ctx.time = 2 + frame / 60; f.tick(); }
  assert.equal(f.screen.capTex.version, settled);
  for (let frame = 0; frame < 90; frame++) { f.ctx.time = 8.8 + frame / 60; f.tick(); }
  assert.ok(f.screen.capTex.version > settled);
  const ended = f.screen.capTex.version;
  for (let frame = 0; frame < 120; frame++) { f.ctx.time = 11 + frame / 60; f.tick(); }
  assert.equal(f.screen.capTex.version, ended);
});
