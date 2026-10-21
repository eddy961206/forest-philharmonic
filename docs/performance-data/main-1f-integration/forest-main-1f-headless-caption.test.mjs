import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildScreen } from 'file:///workspace/scratch/296fafc0af7f/forest-philharmonic/public/js/scene/screen.js';
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


test('headless dome caption is uploaded empty once after a visible title', (t) => {
  const f = fixture(t, { headless: true });
  f.ctx.phase = 'playing';
  f.ctx.perf = { piece: { id: 'one', composerKo: '바흐', titleKo: '제목', year: '1722' }, playing: true, dominantSection: () => null };
  f.ctx.time = 2;
  for (let i = 0; i < 90; i++) f.tick();
  assert.ok(f.canvasOps.texts.includes('제목'));
  const before = f.screen.capTex.version;
  const beforeClears = f.canvasOps.clears;
  f.ctx.time = 11;
  for (let i = 0; i < 3; i++) f.tick();
  assert.equal(f.screen.capTex.version, before + 1, 'the dome must receive the cleared canvas');
  assert.equal(f.canvasOps.clears, beforeClears + 1);
  for (let i = 0; i < 600; i++) f.tick();
  assert.equal(f.screen.capTex.version, before + 1);
  assert.equal(f.canvasOps.clears, beforeClears + 1);
});
