import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildFX } from '../public/js/scene/fx.js';

function fixture(t) {
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  globalThis.window = { innerHeight: 844 };
  globalThis.document = { createElement() {
    return { getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) };
  } };
  t.after(() => { globalThis.document = previousDocument; globalThis.window = previousWindow; });
  const scene = new THREE.Scene();
  const fx = buildFX(scene, {});
  return { scene, fx };
}

test('a firework burst after an idle or exhausted show becomes visible again', t => {
  const { scene, fx } = fixture(t);
  const points = scene.children.find(child => child.isPoints);
  assert.equal(points.visible, false);
  fx.fireworks.burst(new THREE.Vector3(0, 6, 0), '#ffd166');
  fx.fireworks.update(1 / 60);
  assert.equal(points.visible, true);
  assert.ok(points.geometry.attributes.psize.array.some(size => size > 0));
  fx.fireworks.update(10);
  assert.equal(points.visible, false);
  fx.fireworks.burst(new THREE.Vector3(0, 7, 0), '#ff6b6b');
  fx.fireworks.update(1 / 60);
  assert.equal(points.visible, true);
});

test('expired confetti clears its instance immediately while other confetti lives', t => {
  const { scene, fx } = fixture(t);
  const mesh = scene.children.find(child => child.isInstancedMesh);
  fx.confetti.burst(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0), 1);
  fx.confetti.burst(new THREE.Vector3(0, 8, 0), new THREE.Vector3(0, 1, 0), 1);
  fx.confetti.update(1 / 60);
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  assert.deepEqual([matrix.elements[0], matrix.elements[5], matrix.elements[10]], [0, 0, 0]);
  mesh.getMatrixAt(1, matrix);
  assert.ok(matrix.determinant() > 0.99);
  assert.equal(mesh.visible, true);
});

test('fireworks keep the point-light shader layout stable through a burst', t => {
  const { scene, fx } = fixture(t);
  const flash = scene.children.find(child => child.isPointLight);
  const visibleLights = () => scene.children.filter(child => child.isLight && child.visible).length;
  const initialCount = visibleLights();
  assert.ok(flash);
  assert.equal(flash.visible, true);
  assert.equal(flash.intensity, 0);
  fx.fireworks.burst(new THREE.Vector3(0, 6, 0), '#ffd166');
  fx.fireworks.update(1 / 60);
  assert.ok(flash.intensity > 0);
  assert.equal(visibleLights(), initialCount);
  fx.fireworks.update(10);
  assert.equal(flash.intensity, 0);
  assert.equal(flash.visible, true);
  assert.equal(visibleLights(), initialCount);
});
