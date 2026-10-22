import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SP } from '../public/js/scene/sphereplan.js';
import { buildDome, SCENES } from '../public/js/scene/domeshow.js';
import { domeDirection, usesViewerDirection, normalizeDomeProjection, SCREEN_LOCKED_SCENES } from '../public/js/scene/dome-projection.js';

const length = v => Math.hypot(v.x, v.y, v.z);
const error = (a, b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
function screenPoint(viewer, direction) {
  const o = new THREE.Vector3(viewer.x, viewer.y, viewer.z);
  const d = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
  const oc = o.clone().sub(new THREE.Vector3(SP.C.x, SP.C.y, SP.C.z));
  const b = oc.dot(d), disc = b*b - oc.lengthSq() + SP.R*SP.R;
  return o.addScaledVector(d, -b + Math.sqrt(disc));
}
const viewpoints = [SP.VIEW, {x:0,y:1.7,z:20}, {x:32,y:28,z:42}, {x:-32,y:28,z:42}, {x:0,y:46,z:62}];
test('distant scenery keeps the same direction across floor, sides and upper tiers', () => {
  const ray = new THREE.Vector3(0.18,0.52,-0.83).normalize();
  for (const viewer of viewpoints) {
    const point = screenPoint(viewer, ray);
    const actual = domeDirection(SCENES.indexOf('MOON'), point, viewer, SP.VIEW, 'immersive');
    assert.ok(error(actual, ray) < 1e-12);
    assert.ok(Math.abs(length(actual)-1) < 1e-12);
  }
  const side = viewpoints[2], point = screenPoint(side, ray);
  assert.ok(error(domeDirection(3, point, side, SP.VIEW, 'venue'), ray) > 0.1, 'off-axis baseline distortion is real');
});
test('sweet-spot image matches and physical architectural scenes stay locked in both modes', () => {
  assert.deepEqual(SCREEN_LOCKED_SCENES.map(i=>SCENES[i]), ['ARCH','CATHEDRAL','GOLD','DECO']);
  for (const name of SCENES) {
    const id = SCENES.indexOf(name), point = {x:20,y:70,z:-10};
    assert.deepEqual(domeDirection(id,point,SP.VIEW,SP.VIEW,'venue'),domeDirection(id,point,SP.VIEW,SP.VIEW,'immersive'));
    if (SCREEN_LOCKED_SCENES.includes(id)) {
      assert.equal(usesViewerDirection(id),false);
      assert.deepEqual(domeDirection(id,point,viewpoints[2],SP.VIEW,'venue'),domeDirection(id,point,viewpoints[2],SP.VIEW,'immersive'));
    }
  }
});
test('natural 2D, mobile fallbacks and all cube worlds use viewer rays', () => {
  for (const name of ['MOON','FOREST','OCEAN','STARS','FOREST3D','OCEAN3D','CLOUDS3D','PEAKS3D']) assert.equal(usesViewerDirection(SCENES.indexOf(name)),true);
  assert.equal(normalizeDomeProjection('venue'),'venue');
  for (const value of [null,undefined,'bad',{},1]) assert.equal(normalizeDomeProjection(value),'immersive');
});
test('projection/calibration changes share uniforms across passes without resetting the show', () => {
  const dome = buildDome({lite:true});
  dome.go('MOON',{dur:1}); dome.update(0.4,{time:12});
  const before = [dome.uniforms.uTime.value,dome.uniforms.uMix.value,dome.current];
  const shader = dome.mesh.material.fragmentShader;
  const overlay = dome.mesh.children[0];
  dome.setProjection('venue'); dome.setCalibration(true);
  assert.equal(dome.projection,'venue');
  assert.equal(overlay.material.uniforms.uImmersive,dome.uniforms.uImmersive);
  assert.equal(overlay.material.uniforms.uCalibration,dome.uniforms.uCalibration);
  assert.equal(dome.uniforms.uCalibration.value,1);
  assert.deepEqual([dome.uniforms.uTime.value,dome.uniforms.uMix.value,dome.current],before);
  assert.equal(dome.mesh.material.fragmentShader,shader);
  assert.match(shader,/screenAz - uLiveRect.x/);
  assert.match(shader,/dot\(screenDir, normalize/);
  dome.setCalibration(false); dome.setProjection('invalid');
  assert.equal(dome.projection,'immersive');
  dome.mesh.geometry.dispose(); dome.mesh.material.dispose(); overlay.material.dispose();
});
