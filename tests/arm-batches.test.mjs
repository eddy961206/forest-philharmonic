import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { batchCharacterArms } from '../public/js/scene/arm-batches.js';

function fixture() {
  const scene = new THREE.Scene(), rig = new THREE.Group();
  scene.add(rig);
  const material = new THREE.MeshPhysicalMaterial({ color: '#b16432', sheen: 0.22, roughness: 0.9 });
  const chars = [0, 1].map(i => {
    const root = new THREE.Group();
    root.position.set(i * 3, 1, -2);
    rig.add(root);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.17, 4, 10), material);
    upper.castShadow = upper.receiveShadow = true;
    root.add(upper);
    return { root, arms: { L: { upper } } };
  });
  return { scene, rig, material, chars };
}

test('batched arms preserve animated world vertices, material and shadows under transformed parents', () => {
  const f = fixture(), batch = batchCharacterArms(f.scene, f.chars);
  const { mesh, sources } = batch.batches[0];
  assert.equal(batch.batches.length, 1);
  assert.equal(mesh.material, f.material);
  assert.ok(mesh.castShadow && mesh.receiveShadow);
  const matrix = new THREE.Matrix4();
  for (let frame = 0; frame < 8; frame++) {
    f.scene.rotation.y = frame * .1;
    f.rig.position.x = frame * .2;
    for (const char of f.chars) {
      char.root.rotation.z = frame * .05;
      char.arms.L.upper.scale.set(1, 1 + frame * .1, .9);
    }
    f.scene.updateMatrixWorld(true); batch.update(); f.scene.updateMatrixWorld(true);
    for (let i = 0; i < sources.length; i++) {
      mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld);
      const positions = mesh.geometry.attributes.position;
      for (let j = 0; j < positions.count; j++) {
        const expected = new THREE.Vector3().fromBufferAttribute(positions, j).applyMatrix4(sources[i].matrixWorld);
        const actual = new THREE.Vector3().fromBufferAttribute(positions, j).applyMatrix4(matrix);
        assert.ok(expected.distanceTo(actual) < 1e-6);
      }
    }
  }
});

test('hidden musicians leave every view and return at the current pose', () => {
  const f = fixture(), batch = batchCharacterArms(f.scene, f.chars);
  f.chars[0].root.visible = false;
  f.scene.updateMatrixWorld(true); batch.update();
  assert.equal(batch.batches[0].mesh.count, 1);
  f.rig.visible = false; batch.update();
  assert.equal(batch.batches[0].mesh.visible, false);
  f.rig.visible = f.chars[0].root.visible = true;
  f.chars[0].root.position.y = 4;
  f.scene.updateMatrixWorld(true); batch.update();
  assert.equal(batch.batches[0].mesh.count, 2);
  assert.equal(batch.batches[0].mesh.visible, true);
});

test('original arm intersections and musician ownership survive batching and disposal', () => {
  const f = fixture(); f.scene.updateMatrixWorld(true);
  const source = f.chars[0].arms.L.upper;
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
  const before = ray.intersectObject(f.chars[0].root, true);
  assert.ok(before.length);
  const batch = batchCharacterArms(f.scene, f.chars); batch.update();
  const after = ray.intersectObject(f.chars[0].root, true);
  assert.equal(after.length, before.length);
  assert.equal(after[0].object, source);
  assert.equal(after[0].object.parent, f.chars[0].root);
  assert.equal(after[0].distance, before[0].distance);
  batch.dispose();
  assert.equal(source.visible, true);
  assert.ok(!f.scene.children.some(m => m.name === 'musician-arms'));
});
