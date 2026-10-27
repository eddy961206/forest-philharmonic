import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildAudience, planHouse } from '../public/js/scene/audience.js';

const seats = Array.from({ length: 160 }, (_, index) => ({
  index, level: '1층', row: Math.floor(index / 16), section: `section-${Math.floor(index / 40)}`,
  x: index % 16 - 8, y: 0, z: 2 + Math.floor(index / 16), yaw: 0,
}));

test('increasing the audience share keeps existing guests in the same seats and colours', () => {
  const plan = planHouse(seats, () => 0.417);
  const quiet = buildAudience(plan, { share: 0.25 });
  const busy = buildAudience(plan, { share: 0.75 });
  try {
    assert.equal(quiet.count, 40);
    assert.equal(busy.count, 120);
    assert.deepEqual(quiet.occupied, new Set(plan.order.slice(0, 40).map((seat) => seat.index)));
    assert.ok([...quiet.occupied].every((index) => busy.occupied.has(index)));

    // Every guest has a body. Check its actual instance data, not just the
    // occupancy count: a rebuilt slider state must retain poses and outfits.
    const firstBodies = quiet.group.children.find((mesh) => mesh.count === quiet.drawn);
    const moreBodies = busy.group.children.find((mesh) => mesh.count === busy.drawn);
    assert.deepEqual(moreBodies.instanceMatrix.array.slice(0, quiet.drawn * 16), firstBodies.instanceMatrix.array);
    assert.deepEqual(moreBodies.instanceColor.array.slice(0, quiet.drawn * 3), firstBodies.instanceColor.array);
    assert.deepEqual(moreBodies.geometry.attributes.aPhase.array.slice(0, quiet.drawn), firstBodies.geometry.attributes.aPhase.array);
    assert.ok(quiet.group.children.every((mesh) => mesh.geometry.index));
    assert.ok(busy.group.children.every((mesh) => mesh.geometry.index));
  } finally {
    quiet.dispose();
    busy.dispose();
  }
});

test('a capped Lite audience keeps room reservations and full-house applause count', () => {
  const plan = planHouse(seats, () => 0.417);
  const ownSeat = plan.order[0].index;
  const crowd = buildAudience(plan, {
    share: 0.8, reserve: 0.6, exclude: new Set([ownSeat]),
    lite: true, detail: 8, cap: 20,
  });
  try {
    assert.equal(crowd.count, 95, 'the sound follows all reserved guests except the listener');
    assert.equal(crowd.drawn, 20, 'the existing Lite cap only reduces rendered guests');
    assert.equal(crowd.occupied.size, 95);
    assert.equal(crowd.occupied.has(ownSeat), false);
    assert.deepEqual(crowd.occupied, new Set(plan.order.slice(1, 96).map((seat) => seat.index)));
    crowd.updateLOD(new THREE.Vector3(0, 1.6, 4), true);
    assert.ok(crowd.group.children.every((mesh) => mesh.count <= mesh.instanceMatrix.count));
    crowd.updateLOD(new THREE.Vector3(12, 2, 25), true);
    assert.equal(crowd.occupied.size, 95, 'moving through LOD tiers cannot release occupied seats');
    assert.equal(crowd.count, 95, 'moving through LOD tiers cannot change the applause count');
  } finally {
    crowd.dispose();
  }
});

test('live efficient audience budget preserves occupied seats, whole guests and original geometry on restore', () => {
  for (const opts of [{}, { detail: 40, mid: 30 }]) {
    const crowd = buildAudience(planHouse(seats, () => 0.417), { share: 0.75, reserve: 0.8, ...opts });
    const occupied = new Set(crowd.occupied);
    const meshes = [...crowd.group.children];
    const cam = new THREE.Vector3(0, 1, 4);
    crowd.updateLOD?.(cam, true);
    const baseline = meshes.map(m => ({ count: m.count, matrices: [...m.instanceMatrix.array.slice(0, m.count * 16)] }));
    crowd.setBudget(0.35); crowd.updateLOD?.(cam, true);
    assert.deepEqual(crowd.occupied, occupied);
    assert.ok(crowd.drawn < crowd.count);
    assert.deepEqual(crowd.group.children, meshes);
    if (!opts.detail) {
      const phases = meshes.filter(m => ['torso', 'head', 'pawL'].includes(m.userData.audiencePart)).map(m => [...m.geometry.attributes.aPhase.array.slice(0, m.count)]);
      assert.deepEqual(phases[0], phases[1]); assert.deepEqual(phases[0], phases[2]);
    }
    crowd.setBudget(1); crowd.updateLOD?.(cam, true);
    assert.deepEqual(crowd.occupied, occupied);
    meshes.forEach((m, i) => { assert.equal(m.count, baseline[i].count); assert.deepEqual([...m.instanceMatrix.array.slice(0, m.count * 16)], baseline[i].matrices); });
    crowd.dispose();
  }
});
