import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildSeats } from '../public/js/scene/seats.js';
import { M } from '../public/js/scene/materials.js';

function fixture(t) {
  // Canvas textures are irrelevant to these matrix, visibility and picking
  // checks; keep each material shared just as the real material cache does.
  for (const name of ['walnut', 'gilt', 'velvetTint']) {
    const material = new THREE.MeshStandardMaterial();
    t.mock.method(M, name, () => material);
  }
  const seats = [-22, 22].flatMap((x, side) => ['theater', 'premium', 'armchair'].map((type, i) => ({
    x, y: i * 2, z: -12 - i * 4, yaw: side ? -0.2 : 0.2,
    type, color: ['#8e1a2b', '#203462', '#d8c49a'][i], level: 'test',
  })));
  const built = buildSeats(seats, { lite: true });
  const parent = new THREE.Group();
  parent.add(built.group);
  parent.updateMatrixWorld(true);
  const furniture = built.group.children.filter((m) => m.name.endsWith('|fabric') || m.name.endsWith('|frame') || m.name.endsWith('|accent'));
  const coarse = furniture.filter((m) => m.name.includes('|coarse|'));
  const fine = furniture.filter((m) => !m.name.includes('|coarse|'));
  const camera = (position, target) => {
    const c = new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 500);
    c.position.fromArray(position);
    c.lookAt(new THREE.Vector3(...target));
    c.updateMatrixWorld(true);
    return c;
  };
  return { ...built, parent, seats, furniture, coarse, fine,
    wide: camera([0, 8, 90], [0, 2, -16]),
    close: camera([-22, 1.5, -4], [-22, 1, -18]), camera };
}

function submitted(meshes, camera, visibleOnly = true) {
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  const shown = meshes.filter((m) => (!visibleOnly || m.visible) && m.intersectsFrustum(frustum));
  return { calls: shown.length, triangles: shown.reduce((sum, m) => sum + m.geometry.index.count / 3 * m.count, 0) };
}

test('fine/coarse seats share geometry and part matrices while preserving every seat transform and colour', (t) => {
  const f = fixture(t);
  const matrix = new THREE.Matrix4();
  const expected = new THREE.Matrix4();
  const color = new THREE.Color();
  for (const mesh of f.furniture) {
    const key = mesh.name.slice(0, mesh.name.lastIndexOf('|'));
    const fabric = f.furniture.find((m) => m.name === `${key}|fabric`);
    assert.equal(mesh.instanceMatrix, fabric.instanceMatrix);
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.receiveShadow, true);
  }
  for (const mesh of f.coarse) {
    const [type, , part] = mesh.name.split('|');
    const originals = f.seats.map((s, id) => ({ s, id })).filter(({ s }) => s.type === type);
    assert.equal(mesh.count, originals.length);
    const fine = f.fine.find((m) => m.name.startsWith(`${type}|`) && m.name.endsWith(`|${part}`));
    assert.equal(mesh.geometry, fine.geometry);
    assert.equal(mesh.material, fine.material);
    originals.forEach(({ s, id }, i) => {
      mesh.getMatrixAt(i, matrix);
      f.pick.getMatrixAt(id, expected);
      assert.deepEqual(matrix.elements, expected.elements);
      if (part === 'fabric') {
        mesh.getColorAt(i, color);
        assert.deepEqual(color.toArray(), Array.from(new Float32Array(new THREE.Color(s.color).toArray())));
      }
    });
  }
});

test('broadcast and main cameras can alternate coarse/fine selection without reusing the other camera state', (t) => {
  const f = fixture(t);
  for (let repeat = 0; repeat < 2; repeat++) {
    f.prepareRender(f.wide);
    assert.ok(f.coarse.every((m) => m.visible));
    assert.ok(f.fine.every((m) => !m.visible));
    assert.equal(submitted(f.furniture, f.wide).calls, 9);
    f.prepareRender(f.close);
    assert.ok(f.fine.every((m) => m.visible));
    assert.ok(f.coarse.every((m) => !m.visible));
  }
});

test('per-camera selection never submits more triangles, including parent transforms and a view away from the hall', (t) => {
  const f = fixture(t);
  const poses = [f.wide, f.close, f.camera([0, 6, 30], [0, 6, 100]), f.camera([24, 8, -4], [-10, 0, -20])];
  for (const transformed of [false, true]) {
    if (transformed) {
      f.parent.position.set(3, 2, -4);
      f.parent.rotation.y = 0.31;
      f.parent.scale.set(1.1, 0.8, 1.3);
      f.parent.updateMatrixWorld(true);
    }
    for (const camera of poses) {
      const before = submitted(f.fine, camera, false);
      f.prepareRender(camera);
      const after = submitted(f.furniture, camera);
      assert.ok(after.triangles <= before.triangles);
      assert.ok(after.calls <= before.calls);
      for (const type of ['theater', 'premium', 'armchair']) {
        const activeCoarse = f.coarse.some((m) => m.name.startsWith(`${type}|`) && m.visible);
        const activeFine = f.fine.some((m) => m.name.startsWith(`${type}|`) && m.visible);
        assert.notEqual(activeCoarse, activeFine, 'exactly one representation of each family is active');
      }
    }
  }
});

test('seat picking keeps the same global IDs and hit distances after each render-camera switch', (t) => {
  const f = fixture(t);
  const raw = new THREE.InstancedMesh(f.pick.geometry, f.pick.material, 0);
  raw.instanceMatrix = f.pick.instanceMatrix;
  raw.count = f.pick.count;
  raw.computeBoundingSphere();
  const matrix = new THREE.Matrix4();
  for (const camera of [f.wide, f.close, f.wide]) {
    f.prepareRender(camera);
    raw.matrixWorld.copy(f.pick.matrixWorld);
    f.seats.forEach((seat, id) => {
      f.pick.getMatrixAt(id, matrix);
      matrix.premultiply(f.pick.matrixWorld);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(0, 2, 0.05).applyMatrix4(matrix),
        new THREE.Vector3(0, -1, 0).transformDirection(matrix),
      );
      const expected = ray.intersectObject(raw, false);
      const actual = ray.intersectObject(f.pick, false);
      assert.ok(actual.length > 0);
      assert.equal(actual.length, expected.length);
      actual.forEach((hit, i) => {
        assert.equal(hit.object, f.pick);
        assert.equal(hit.instanceId, expected[i].instanceId);
        assert.equal(hit.instanceId, id);
        assert.ok(Math.abs(hit.distance - expected[i].distance) < 1e-9);
      });
    });
  }
});
