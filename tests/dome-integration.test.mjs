import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { makeWorldRenderer } from '../public/js/scene/dome3d.js';
import { buildDome } from '../public/js/scene/domeshow.js';

// No WebGL context: exercise the merged controller with the actual Three
// geometry, targets and uniforms, and record requests to the renderer.
function fixture() {
  const original = { target: { name: 'caller' }, face: 4, mip: 2 };
  const state = { ...original, fail: false };
  const draws = [];
  const renderer = {
    coordinateSystem: THREE.WebGLCoordinateSystem,
    xr: { enabled: true },
    getRenderTarget: () => state.target,
    getActiveCubeFace: () => state.face,
    getActiveMipmapLevel: () => state.mip,
    setRenderTarget(target, face = 0, mip = 0) { Object.assign(state, { target, face, mip }); },
    render(scene) {
      assert.equal(renderer.xr.enabled, false);
      if (state.fail) throw new Error('warm face failed');
      const proxy = scene.children[0];
      const uniforms = proxy.material.uniforms;
      draws.push({
        target: state.target, face: state.face, size: state.target.width,
        world: uniforms.uWorld.value, flight: uniforms.uT.value,
        time: uniforms.uTime.value, loopBound: uniforms.uOne.value,
        triangles: proxy.geometry.index.count / 3,
      });
    },
  };
  const restored = () => {
    assert.equal(state.target, original.target);
    assert.equal(state.face, original.face);
    assert.equal(state.mip, original.mip);
    assert.equal(renderer.xr.enabled, true);
  };
  return { renderer, state, draws, restored };
}

test('world warm-up draws one face through the box and leaves the first flight fresh', () => {
  const f = fixture();
  const worlds = makeWorldRenderer(f.renderer, { size: 640, every: 4 });
  worlds.warm();
  assert.equal(f.draws.length, 1);
  assert.deepEqual({ ...f.draws[0], target: null }, {
    target: null, face: 0, size: 640, world: 0, flight: 0,
    time: 0, loopBound: 1, triangles: 12,
  });
  assert.ok(worlds.slots.every((slot) => slot.world === null && slot.faceWorld.length === 0));
  f.restored();
  f.draws.length = 0;
  worlds.update(['FOREST3D'], 12, 0, 1 | 4);
  assert.deepEqual(f.draws.map((draw) => draw.face), [0, 2]);
  assert.ok(f.draws.every((draw) => draw.flight === 0 && draw.time === 12));
  f.restored();
});

test('failed world warm-up releases its temporary slot and restores the caller state', () => {
  const f = fixture();
  const worlds = makeWorldRenderer(f.renderer);
  f.state.fail = true;
  assert.throws(() => worlds.warm(), /warm face failed/);
  f.restored();
  assert.ok(worlds.slots.every((slot) => slot.world === null && slot.faceWorld.length === 0));
  f.state.fail = false;
  worlds.update(['FOREST3D'], 17, 0, 1);
  assert.equal(f.draws.length, 1);
  assert.equal(f.draws[0].world, 0);
  assert.equal(f.draws[0].flight, 0);
  f.restored();
});

test('the two-pass dome shares resized cube uniforms and keeps both flights during a crossfade', () => {
  const f = fixture();
  const dome = buildDome({ renderer: f.renderer, quality: 'high' });
  const overlay = dome.mesh.children[0];
  assert.equal(dome.mesh.renderOrder, 10);
  assert.equal(dome.mesh.material.blending, THREE.NoBlending);
  assert.equal(dome.mesh.material.depthWrite, true);
  assert.equal(overlay.renderOrder, -1);
  assert.equal(overlay.material.transparent, true);
  assert.equal(overlay.material.depthWrite, false);
  assert.equal(overlay.material.blendSrc, THREE.OneFactor);
  assert.equal(overlay.material.blendDst, THREE.OneMinusSrcAlphaFactor);
  assert.equal(overlay.geometry, dome.mesh.geometry);
  assert.equal(overlay.material.vertexShader, dome.mesh.material.vertexShader);
  assert.equal(overlay.material.fragmentShader, dome.mesh.material.fragmentShader);
  assert.equal(overlay.material.uniforms.uOne.value, 1);
  assert.equal(overlay.material.uniforms.uOverlay.value, 1);
  assert.equal(dome.uniforms.uOverlay.value, 0);
  for (const key of ['uMix', 'uCubeA', 'uCubeB', 'uCubeAId', 'uCubeBId', 'uLiveTex', 'uCapTex']) {
    assert.equal(overlay.material.uniforms[key], dome.uniforms[key]);
  }
  assert.equal(overlay.visible, false);

  dome.setViewers([{ faces: 1 }]);
  dome.warm();
  dome.go('FOREST3D', { dur: 0.01 });
  dome.update(0.1);
  dome.drawWorlds();
  assert.equal(overlay.visible, false);
  dome.go('OCEAN3D', { dur: 2 });
  dome.update(0.5);
  dome.drawWorlds();
  assert.equal(overlay.visible, true);
  const mix = dome.uniforms.uMix.value;
  assert.ok(mix > 0 && mix < 1);
  const textures = [dome.uniforms.uCubeA.value, dome.uniforms.uCubeB.value];
  const ids = [dome.uniforms.uCubeAId.value, dome.uniforms.uCubeBId.value];
  const targets = new Set(f.draws.map((draw) => draw.target));
  assert.equal(targets.size, 2);
  f.draws.length = 0;

  dome.setQuality('medium');
  dome.drawWorlds();
  assert.equal(overlay.visible, true);
  assert.equal(dome.uniforms.uMix.value, mix);
  assert.deepEqual([dome.uniforms.uCubeAId.value, dome.uniforms.uCubeBId.value], ids);
  assert.deepEqual([dome.uniforms.uCubeA.value, dome.uniforms.uCubeB.value], textures);
  assert.deepEqual(f.draws.map((draw) => draw.size), [512, 512]);
  assert.ok(f.draws.every((draw) => targets.has(draw.target)));
  assert.equal(f.draws.find((draw) => draw.world === 0).flight, 0.5);
  assert.equal(f.draws.find((draw) => draw.world === 1).flight, 0);

  f.draws.length = 0;
  dome.update(2);
  dome.drawWorlds();
  assert.equal(dome.current, 'OCEAN3D');
  assert.equal(overlay.visible, false);
  assert.equal(dome.uniforms.uMix.value, 0);
  assert.equal(dome.uniforms.uCubeA.value, null, 'the old world slot is no longer sampled');
  assert.equal(dome.uniforms.uCubeB.value, textures[1]);
  f.restored();
});

test('Lite warm-up keeps cube rendering disabled and the painted transition completes in two passes', () => {
  const f = fixture();
  const dome = buildDome({ renderer: f.renderer, lite: true, quality: 'low' });
  const overlay = dome.mesh.children[0];
  dome.warm();
  dome.setQuality('high');
  dome.go('FOREST3D', { dur: 1 });
  dome.update(0.5);
  dome.drawWorlds();
  assert.equal(dome.current, 'FOREST');
  assert.equal(overlay.visible, true);
  assert.equal(dome.uniforms.uMix.value, 0.5);
  assert.equal(dome.uniforms.uCubeA.value, null);
  assert.equal(dome.uniforms.uCubeB.value, null);
  assert.equal(f.draws.length, 0);
  dome.update(0.5);
  assert.equal(overlay.visible, false);
  assert.equal(dome.uniforms.uMix.value, 0);
  f.restored();
});
