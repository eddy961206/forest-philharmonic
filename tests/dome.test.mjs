import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { makeWorldRenderer } from '../public/js/scene/dome3d.js';
import { buildDome } from '../public/js/scene/domeshow.js';

function fixture() {
  const previousTarget = { name: 'previous-target' };
  const state = { target: previousTarget, face: 2, mip: 3, failAt: -1, attempted: 0 };
  const renders = [];
  const renderer = {
    coordinateSystem: THREE.WebGLCoordinateSystem,
    xr: { enabled: true },
    getRenderTarget: () => state.target,
    getActiveCubeFace: () => state.face,
    getActiveMipmapLevel: () => state.mip,
    setRenderTarget(target, face = 0, mip = 0) { Object.assign(state, { target, face, mip }); },
    render(scene, camera) {
      assert.equal(renderer.xr.enabled, false);
      assert.ok(state.target.isWebGLCubeRenderTarget);
      if (++state.attempted === state.failAt) throw new Error('cube face failed');
      renders.push({ target: state.target, size: state.target.width, face: state.face, scene, camera });
    },
  };
  return { state, renderer, renders, previousTarget };
}

function assertRestored(f) {
  assert.equal(f.renderer.getRenderTarget(), f.previousTarget);
  assert.equal(f.renderer.getActiveCubeFace(), 2);
  assert.equal(f.renderer.getActiveMipmapLevel(), 3);
  assert.equal(f.renderer.xr.enabled, true);
}

test('context recovery redraws lost cube faces without restarting the world flight', () => {
  const f = fixture();
  const worlds = makeWorldRenderer(f.renderer, { every: 90 });
  worlds.update(['FOREST3D'], 12, 0.2, 1);
  const slot = worlds.slots[0];
  assert.equal(slot.start, 12);
  f.renders.length = 0;
  worlds.update(['FOREST3D'], 13, 0.2, 1);
  assert.equal(f.renders.length, 0);
  worlds.invalidate();
  worlds.update(['FOREST3D'], 14, 0.2, 1);
  assert.deepEqual(f.renders.map(row => row.face), [0]);
  assert.equal(slot.start, 12);
  assert.equal(slot.world, 'FOREST3D');
  f.renders.length = 0;
  worlds.update(['FOREST3D'], 15, 0.2, 1 << 4);
  assert.deepEqual(f.renders.map(row => row.face), [4]);
  assertRestored(f);
});

test('cube rendering updates only the five visible faces and restores caller render state', () => {
  const f = fixture();
  const worlds = makeWorldRenderer(f.renderer);
  worlds.update(['FOREST3D'], 1, 0.2);
  assert.deepEqual(f.renders.map((render) => render.face), [0, 1, 2, 4, 5]);
  assertRestored(f);
  f.renders.length = 0;
  worlds.update(['FOREST3D', 'OCEAN3D'], 2, 0.3);
  assert.equal(new Set(f.renders.map((render) => render.target)).size, 2);
  assert.equal(f.renders.length, 10);
  assertRestored(f);
  const [first, second] = worlds.slots;
  f.renders.length = 0;
  worlds.update(['FOREST3D', 'OCEAN3D'], 3, 0.3);
  assert.equal(f.renders.length, 5, 'crossfades refresh only one world per turn');
  assert.ok(f.renders.every((render) => render.target === second.rt));
  f.renders.length = 0;
  worlds.update(['FOREST3D', 'OCEAN3D'], 4, 0.3);
  assert.equal(f.renders.length, 5);
  assert.ok(f.renders.every((render) => render.target === first.rt));
  f.renders.length = 0;
  worlds.update([], 5, 0);
  assert.equal(f.renders.length, 0);
});

test('a failed cube face restores render state and retries the fresh world on the next update', () => {
  const f = fixture();
  const worlds = makeWorldRenderer(f.renderer, { every: 3 });
  f.state.failAt = 3;
  assert.throws(() => worlds.update(['FOREST3D'], 1, 0), /cube face failed/);
  assertRestored(f);
  f.state.failAt = -1;
  f.renders.length = 0;
  worlds.update(['FOREST3D'], 2, 0); // Frame 2 would normally be skipped.
  assert.equal(f.renders.length, 5);
  assertRestored(f);
});

test('face masks skip hidden faces and resizing invalidates even the previously cached offscreen faces', () => {
  const f = fixture();
  const worlds = makeWorldRenderer(f.renderer, { size: 640, every: 4 });
  worlds.update(['FOREST3D'], 1, 0, 1);
  assert.deepEqual(f.renders.map((render) => render.face), [0]);
  f.renders.length = 0;
  worlds.update(['FOREST3D'], 2, 0, 1);
  assert.equal(f.renders.length, 0);
  worlds.update(['FOREST3D'], 3, 0, 1 | 4);
  assert.deepEqual(f.renders.map((render) => render.face), [2], 'a newly seen face draws on a skipped frame');
  f.renders.length = 0;
  worlds.update(['FOREST3D'], 4, 0, 1 | 4);
  assert.deepEqual(f.renders.map((render) => render.face), [0, 2]);
  worlds.setSize(384);
  assert.ok(worlds.slots.every((slot) => slot.rt.width === 384 && slot.faceWorld.length === 0));
  f.renders.length = 0;
  worlds.update(['FOREST3D'], 5, 0, 1);
  assert.deepEqual(f.renders.map((render) => render.face), [0]);
  f.renders.length = 0;
  worlds.update(['FOREST3D'], 6, 0, 1 | 4);
  assert.deepEqual(f.renders.map((render) => render.face), [2], 'resizing must not leave an old face cache valid');
  assert.equal(f.renders[0].size, 384);
  assertRestored(f);
});

test('drawWorlds combines only enabled viewers after camera movement', () => {
  const f = fixture();
  const dome = buildDome({ renderer: f.renderer, quality: 'medium' });
  let liveEnabled = false;
  dome.setViewers([{ faces: 1 }, { faces: 4, when: () => liveEnabled }]);
  dome.go('FOREST3D', { dur: 0.01 });
  dome.update(0.1);
  assert.equal(f.renders.length, 0);
  dome.drawWorlds();
  assert.deepEqual(f.renders.map((render) => render.face), [0]);
  f.renders.length = 0;
  liveEnabled = true;
  dome.drawWorlds();
  assert.deepEqual(f.renders.map((render) => render.face), [0, 2]);
  f.renders.length = 0;
  dome.setViewers([{ faces: 16 }, { faces: 4, when: () => false }]);
  dome.drawWorlds();
  assert.deepEqual(f.renders.map((render) => render.face), [4]);
  assertRestored(f);
});

test('the simplified cube proxy preserves ray directions on every face, including edges', () => {
  const f = fixture();
  makeWorldRenderer(f.renderer).update(['FOREST3D'], 1, 0);
  const proxy = f.renders[0].scene.children[0];
  assert.equal(proxy.material.side, THREE.BackSide);
  assert.equal(proxy.geometry.index.count / 3, 12);
  const original = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), proxy.material);
  for (const { camera, face } of f.renders) {
    // Avoid the old triangulated sphere's exact longitude seam in the
    // reference raycast; validate exact face centres analytically below.
    for (const x of [-0.999, -0.5, 0.013, 0.5, 0.999]) {
      for (const y of [-0.999, -0.5, 0.013, 0.5, 0.999]) {
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(x, y), camera);
        const before = ray.intersectObject(original, false)[0];
        const after = ray.intersectObject(proxy, false)[0];
        assert.ok(before && after, `face ${face}, ray (${x}, ${y}) must hit both proxies`);
        assert.ok(before.point.normalize().distanceTo(after.point.normalize()) < 1e-12);
      }
    }
    const centre = new THREE.Raycaster();
    centre.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hit = centre.intersectObject(proxy, false)[0];
    assert.ok(hit);
    assert.ok(hit.point.normalize().distanceTo(centre.ray.direction) < 1e-12);
  }
});

test('quality changes resize active cube targets immediately and preserve the worlds and cadence', () => {
  const f = fixture();
  const dome = buildDome({ renderer: f.renderer, quality: 'high' });
  dome.go('FOREST3D', { dur: 0.01 });
  dome.update(0.1);
  assert.equal(f.renders.length, 0, 'camera movement must finish before drawWorlds renders');
  dome.drawWorlds();
  assert.equal(dome.current, 'FOREST3D');
  assert.equal(f.renders.length, 5);
  assert.ok(f.renders.every((render) => render.size === 640));
  const target = f.renders[0].target;
  let disposals = 0;
  target.addEventListener('dispose', () => disposals++);
  dome.setQuality('high');
  assert.equal(disposals, 0, 'an unchanged setting must not reallocate textures');

  for (const [quality, size, every] of [['medium', 512, 2], ['low', 384, 2], ['high', 640, 1]]) {
    f.renders.length = 0;
    dome.setQuality(quality);
    dome.update(0.1);
    dome.drawWorlds(); // Resized textures must be filled before they are sampled.
    assert.equal(f.renders.length, 5);
    assert.ok(f.renders.every((render) => render.size === size));
    assert.equal(dome.current, 'FOREST3D');
    assert.equal(dome.uniforms.uCubeA.value, target.texture);
    f.renders.length = 0;
    for (let i = 0; i < every * 2; i++) { dome.update(0.1); dome.drawWorlds(); }
    assert.equal(f.renders.length, 10);
    assertRestored(f);
  }
  assert.equal(disposals, 3);
});

test('live video is needed immediately on request and through the complete visible fade-out', () => {
  const dome = buildDome({ lite: true });
  assert.equal(dome.liveActive, false);
  dome.showLive(true);
  assert.equal(dome.liveActive, true, 'request the first video frame before the dome fades in');
  assert.equal(dome.uniforms.uLive.value, 0);
  for (let i = 0; i < 60; i++) dome.update(1 / 60);
  assert.ok(dome.uniforms.uLive.value > 0.5);
  dome.showLive(false);
  let frames = 0;
  while (dome.uniforms.uLive.value > 0.001 && frames++ < 1000) {
    assert.equal(dome.liveActive, true);
    dome.update(1 / 60);
  }
  assert.ok(frames < 1000);
  assert.equal(dome.liveActive, false);
  dome.showLive(true);
  assert.equal(dome.liveActive, true);
});

test('explicit downward cube rays render -Y for immersive upper-tier views', () => {
  const f = fixture();
  const worlds = makeWorldRenderer(f.renderer);
  worlds.update(['OCEAN3D'], 1, 0, 1 << 3);
  assert.deepEqual(f.renders.map(r=>r.face),[3]);
  assertRestored(f);
});
