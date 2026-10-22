import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildSphereSeatMeshes } from '../public/js/scene/sphere.js';
import { sphereSeatList } from '../public/js/scene/sphereplan.js';

function chunks(built) {
  const visible = built.group.children.filter((mesh) => mesh.isInstancedMesh);
  return built.pick.children.map((pick, i) => ({ near: visible[i * 2], far: visible[i * 2 + 1], pick }));
}

test('Sphere seat representations retain one transform and colour buffer per section', () => {
  const seats = sphereSeatList();
  const built = buildSphereSeatMeshes(seats, false);
  const buffers = new Set();
  const ids = new Set();
  const matrix = new THREE.Matrix4();
  for (const { near, far, pick } of chunks(built)) {
    assert.equal(far.instanceMatrix, near.instanceMatrix);
    assert.equal(pick.instanceMatrix, near.instanceMatrix);
    assert.equal(far.instanceColor, near.instanceColor);
    assert.equal(pick.instanceColor, null);
    for (const mesh of [near, far, pick]) {
      assert.equal(mesh.count, pick.userData.seatIdx.length);
      assert.equal(mesh.instanceMatrix.count, mesh.count);
      assert.ok(Number.isFinite(mesh.boundingSphere.radius) && mesh.boundingSphere.radius > 0);
      buffers.add(mesh.instanceMatrix.array.buffer);
      if (mesh.instanceColor) buffers.add(mesh.instanceColor.array.buffer);
    }
    assert.notEqual(near.boundingSphere, far.boundingSphere, 'each geometry keeps its own bounds');
    assert.notEqual(near.boundingSphere, pick.boundingSphere);
    pick.userData.seatIdx.forEach((id, localId) => {
      assert.equal(ids.has(id), false);
      ids.add(id);
      const seat = seats[id];
      near.getMatrixAt(localId, matrix);
      const origin = new THREE.Vector3().setFromMatrixPosition(matrix);
      for (const axis of ['x', 'y', 'z']) assert.equal(origin[axis], Math.fround(seat[axis]));
      const forward = new THREE.Vector3(0, 0, -1).transformDirection(matrix);
      assert.ok(Math.abs(forward.x + Math.sin(seat.yaw)) < 1e-7);
      assert.ok(Math.abs(forward.z + Math.cos(seat.yaw)) < 1e-7);
    });
  }
  assert.equal(ids.size, seats.length, 'every global seat ID survives the shared representations');
  const retainedBytes = [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
  assert.equal(retainedBytes, seats.length * (16 + 3) * Float32Array.BYTES_PER_ELEMENT);
  const originalBytes = seats.length * (3 * 16 + 2 * 3) * Float32Array.BYTES_PER_ELEMENT;
  assert.equal(originalBytes - retainedBytes, seats.length * 140);
});

test('Sphere LOD changes preserve seat picking IDs, distances and static buffer versions', () => {
  const seats = [
    { x: -4, y: 0, z: 0, yaw: -0.2, level: '플로어', section: 'FL' },
    { x: -2, y: 0, z: 0, yaw: -0.1, level: '플로어', section: 'FL' },
    { x: 4, y: 5, z: 12, yaw: 0.4, level: '100 레벨', section: '101' },
  ];
  for (const lite of [false, true]) {
    const built = buildSphereSeatMeshes(seats, lite);
    built.group.position.set(7, 2, -4);
    built.group.rotation.y = 0.31;
    built.group.updateMatrixWorld(true);
    const sections = chunks(built);
    const original = new THREE.InstancedMesh(sections[0].pick.geometry, sections[0].pick.material, seats.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    seats.forEach((seat, id) => {
      quaternion.setFromAxisAngle(up, seat.yaw);
      matrix.compose(new THREE.Vector3(seat.x, seat.y, seat.z), quaternion, one);
      original.setMatrixAt(id, matrix);
    });
    original.matrixWorld.copy(built.pick.matrixWorld);
    original.computeBoundingSphere();
    const versions = sections.map(({ near }) => [near.instanceMatrix.version, near.instanceColor.version]);
    for (const camera of [new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 1.6, 200), new THREE.Vector3(0, 1.6, 0)]) {
      built.update(camera);
      for (const { near, far } of sections) assert.notEqual(near.visible, far.visible);
      assert.deepEqual(sections.map(({ near }) => [near.instanceMatrix.version, near.instanceColor.version]), versions);
      seats.forEach((_seat, id) => {
        original.getMatrixAt(id, matrix);
        matrix.premultiply(original.matrixWorld);
        const ray = new THREE.Raycaster(
          new THREE.Vector3(0, 2, 0.05).applyMatrix4(matrix),
          new THREE.Vector3(0, -1, 0).transformDirection(matrix),
        );
        const expected = ray.intersectObject(original, false)[0];
        const actual = ray.intersectObject(built.pick, true)[0];
        assert.ok(expected && actual);
        assert.equal(expected.instanceId, id);
        assert.equal(actual.object.userData.seatIdx[actual.instanceId], id);
        assert.ok(Math.abs(actual.distance - expected.distance) < 1e-9);
      });
    }
  }
});
