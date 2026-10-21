import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { accelerateInstancePicking } from '../public/js/scene/instance-batches.js';

function fixture() {
  const geometry = new THREE.BoxGeometry(0.52, 0.95, 0.55).translate(0, 0.48, 0.05);
  const material = new THREE.MeshBasicMaterial({ visible: false });
  const positions = [[-20, 0, 0], [20, 3, 5], [-18, 0, 0], [22, 3, 5], [0, 0, -10], [0, 0, -12]];
  const pick = new THREE.InstancedMesh(geometry, material, positions.length);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  positions.forEach((position, i) => {
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.17);
    pick.setMatrixAt(i, matrix.compose(new THREE.Vector3(...position), rotation, one));
  });
  pick.computeBoundingSphere();
  // IDs are intentionally interleaved and reversed within spatial batches.
  const batches = [[2, 0], [3, 1], [5, 4]].map((indices) => {
    const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
    indices.forEach((id, i) => { pick.getMatrixAt(id, matrix); mesh.setMatrixAt(i, matrix); });
    return { mesh, indices };
  });
  const raw = new THREE.InstancedMesh(geometry, material, pick.count);
  raw.instanceMatrix = pick.instanceMatrix;
  raw.computeBoundingSphere();
  const parent = new THREE.Group();
  parent.add(pick);
  parent.updateMatrixWorld(true);
  accelerateInstancePicking(pick, batches);
  const rayFor = (id, x = 0, z = 0.05) => {
    pick.getMatrixAt(id, matrix);
    const world = new THREE.Matrix4().multiplyMatrices(pick.matrixWorld, matrix);
    return new THREE.Raycaster(
      new THREE.Vector3(x, 2, z).applyMatrix4(world),
      new THREE.Vector3(0, -1, 0).transformDirection(world),
    );
  };
  return { pick, raw, parent, rayFor };
}

function compare(f, ray) {
  f.raw.matrixWorld.copy(f.pick.matrixWorld);
  const order = (a, b) => a.distance - b.distance || a.instanceId - b.instanceId || a.faceIndex - b.faceIndex;
  const expected = ray.intersectObject(f.raw, false).sort(order);
  const actual = ray.intersectObject(f.pick, false).sort(order);
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    assert.equal(actual[i].object, f.pick);
    assert.equal(actual[i].instanceId, expected[i].instanceId);
    assert.equal(actual[i].faceIndex, expected[i].faceIndex);
    assert.ok(Math.abs(actual[i].distance - expected[i].distance) < 1e-9);
    assert.ok(actual[i].point.distanceTo(expected[i].point) < 1e-9);
  }
  return actual;
}

test('batched picking returns the original global IDs and all raw raycast intersections', () => {
  const f = fixture();
  for (let id = 0; id < f.pick.count; id++) {
    const hits = compare(f, f.rayFor(id));
    assert.ok(hits.length > 0);
    assert.equal(hits[0].instanceId, id);
  }
  // One ray crosses two seats in the last batch, not just the closest seat.
  const through = new THREE.Raycaster(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0, -1));
  const hits = compare(f, through);
  assert.deepEqual([...new Set(hits.map((hit) => hit.instanceId))], [4, 5]);
});

test('parent movement, rotation and nonuniform scale preserve picking and edge hits', () => {
  const f = fixture();
  f.parent.position.set(7, 3, -11);
  f.parent.rotation.set(0.2, 0.7, -0.13);
  f.parent.scale.set(1.3, 0.7, 1.1);
  f.parent.updateMatrixWorld(true);
  for (let id = 0; id < f.pick.count; id++) {
    assert.ok(compare(f, f.rayFor(id)).length > 0);
    // Just inside and just outside the actual Float32 box edge.
    const halfWidth = f.pick.geometry.attributes.position.getX(0);
    assert.ok(compare(f, f.rayFor(id, halfWidth - 1e-7)).length > 0);
    assert.equal(compare(f, f.rayFor(id, halfWidth + 1e-7)).length, 0);
    compare(f, f.rayFor(id, halfWidth)); // Exact grazing rays match the original.
  }
});

test('misses and near/far limits behave like the original mesh without changing existing hits', () => {
  const f = fixture();
  const miss = new THREE.Raycaster(new THREE.Vector3(100, 2, 100), new THREE.Vector3(0, -1, 0));
  assert.equal(compare(f, miss).length, 0);
  const ray = f.rayFor(0);
  ray.far = 0.5;
  assert.equal(compare(f, ray).length, 0);
  ray.far = 10;
  ray.near = 3;
  assert.equal(compare(f, ray).length, 0);
  ray.near = 0;
  const existing = { object: { name: 'earlier-hit' }, instanceId: 91, distance: 0.1 };
  const hits = [existing];
  f.pick.raycast(ray, hits);
  assert.equal(hits[0], existing);
  assert.equal(existing.instanceId, 91);
  assert.ok(hits.length > 1);
  assert.ok(hits.slice(1).every((hit) => hit.object === f.pick && hit.instanceId === 0));
});

test('a ray only inspects instances in intersected spatial bounds', (t) => {
  const f = fixture();
  const ray = f.rayFor(0);
  const original = THREE.InstancedMesh.prototype.getMatrixAt;
  let inspected = 0;
  t.mock.method(THREE.InstancedMesh.prototype, 'getMatrixAt', function (...args) {
    inspected++;
    return original.apply(this, args);
  });
  assert.ok(ray.intersectObject(f.pick, false).length > 0);
  assert.equal(inspected, 2, 'the other four seats must be rejected by batch bounds');
  inspected = 0;
  ray.ray.origin.set(100, 2, 100);
  assert.equal(ray.intersectObject(f.pick, false).length, 0);
  assert.equal(inspected, 0, 'a broad-phase miss must not inspect any seat instance');
});
