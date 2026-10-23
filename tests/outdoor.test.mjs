import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import * as THREE from 'three';

// Venue plans select their real navigation adapter once, just as a browser
// load does. Node runs this file in its own process, away from hall fixtures.
const priorLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
Object.defineProperty(globalThis, 'location', { value: { search: '?venue=outdoor' }, configurable: true });
after(() => priorLocation ? Object.defineProperty(globalThis, 'location', priorLocation) : delete globalThis.location);
const { OUTDOOR, OUTDOOR_ENTRY, OUTDOOR_ACOUSTICS, outdoorSeatList } = await import('../public/js/scene/outdoorplan.js');
const { ENTRY, HALL, LEVELS, surfacesAt, floorAt, stepTo, groundBelow, headroomAt, barrierTop, levelName, STAGE_STAIRS, stageStairsY, stageFloorY, DOORS } = await import('../public/js/scene/hallplan.js');
const { STAGE_Y, PODIUM } = await import('../public/js/layout.js');
const { NavGrid } = await import('../public/js/scene/navgrid.js');

function walk(points) {
  let height = floorAt(points[0].x, points[0].z);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.04));
    for (let j = 1; j <= n; j++) {
      const x = a.x + (b.x - a.x) * j / n, z = a.z + (b.z - a.z) * j / n;
      const next = stepTo(x, z, height, { up: 0.23, down: 0.23 });
      assert.notEqual(next, null, `missing walkable step at ${x},${z} from ${height}`);
      assert.equal(barrierTop(x, z, next), null, `blocked path at ${x},${z}`);
      height = next;
    }
  }
  return height;
}

test('outdoor entry and every stable seat ID stand on the active lawn navigation surface', () => {
  const seats = outdoorSeatList();
  assert.ok(seats.length > 100);
  assert.deepEqual(outdoorSeatList(), seats);
  assert.equal(new Set(seats.map(s => s.label)).size, seats.length);
  assert.deepEqual(ENTRY.pos, OUTDOOR_ENTRY.pos);
  assert.deepEqual(ENTRY.look, OUTDOOR_ENTRY.look);
  assert.ok(ENTRY.wide.length > 0);
  assert.deepEqual(LEVELS, [0, 0, 0, 0]);
  assert.equal(HALL.halfW, OUTDOOR.halfW);
  seats.forEach((seat, index) => {
    assert.equal(seat.index, index);
    assert.ok(['x', 'y', 'z', 'yaw'].every(key => Number.isFinite(seat[key])), seat.label);
    assert.ok(Math.abs(seat.x) < OUTDOOR.halfW && seat.z > OUTDOOR.front && seat.z < OUTDOOR.back);
    assert.ok(surfacesAt(seat.x, seat.z).some(y => Math.abs(y - seat.y) < 1e-9), seat.label);
    assert.equal(floorAt(seat.x, seat.z), seat.y, seat.label);
    assert.equal(groundBelow(seat.x, seat.z, seat.y + 1), seat.y);
    assert.equal(headroomAt(seat.x, seat.z, seat.y), Infinity);
    assert.equal(barrierTop(seat.x, seat.z, seat.y), null);
    assert.equal(levelName(seat.y), seat.level);
  });
  assert.equal(walk([ENTRY.pos, { x: 0, z: seats[0].z }, seats[0]]), seats[0].y);
});

test('outdoor boundaries reject walking and canopy posts block a standing visitor', () => {
  for (const [x, z] of [[OUTDOOR.halfW, 10], [-OUTDOOR.halfW, 10], [0, OUTDOOR.front], [0, OUTDOOR.back]]) {
    assert.deepEqual(surfacesAt(x, z), []);
    assert.equal(stepTo(x, z, 0), null);
    assert.equal(groundBelow(x, z, 0), undefined);
  }
  for (const pole of OUTDOOR.poles) {
    assert.equal(barrierTop(pole.x, pole.z, 0), OUTDOOR.canopy.eaveY);
    assert.equal(barrierTop(pole.x, pole.z, OUTDOOR.canopy.eaveY + 1), null);
    assert.equal(barrierTop(pole.x + pole.r + 0.3, pole.z, 0), null);
  }
});

test('both shared stage stairs can be climbed from the outdoor entrance without a floor jump', () => {
  for (const stair of STAGE_STAIRS) {
    assert.equal(walk([ENTRY.pos, { x: stair.cx, z: ENTRY.pos.z }, { x: stair.cx, z: stair.z0 - 0.2 }]), STAGE_Y);
    for (let k = 0; k < stair.n - 1; k++) {
      const z = stair.z0 + (k + 0.5) * stair.tread;
      const expected = STAGE_Y - stair.rise * (k + 1);
      assert.ok(Math.abs(stageStairsY(stair.cx, z) - expected) < 1e-9);
      assert.ok(surfacesAt(stair.cx, z).some(y => Math.abs(y - expected) < 1e-9));
    }
  }
});

test('both musicians entrances still route to the shared podium over actual stage treads', () => {
  const nav = new NavGrid();
  for (const door of DOORS) {
    const route = nav.find(door.inside.x, door.inside.z, PODIUM.x, PODIUM.z);
    assert.ok(route?.length >= 2, door.side);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.04));
      let last = stageFloorY(a.x, a.z);
      for (let k = 1; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
        const height = floorAt(x, z);
        assert.equal(height, stageFloorY(x, z));
        assert.ok(Math.abs(height - last) <= 0.23 + 1e-9, `${door.side}: stage step ${height - last}`);
        assert.ok(surfacesAt(x, z).includes(height));
        last = height;
      }
    }
  }
});

test('outdoor acoustics provide finite dry open air parameters', () => {
  assert.equal(OUTDOOR_ACOUSTICS.model, 'linear');
  assert.equal(OUTDOOR_ACOUSTICS.er, 'outdoor');
  for (const [key, value] of Object.entries(OUTDOOR_ACOUSTICS)) if (!['model', 'er'].includes(key)) assert.ok(Number.isFinite(value) && value > 0, key);
  assert.ok(OUTDOOR_ACOUSTICS.rt60 < 1);
  assert.ok(OUTDOOR_ACOUSTICS.reverb < 0.25);
});

test('rendered outdoor lawn, stairs and chair picking agree with the active navigation plan', async t => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'document');
  // Canvas paint is not involved in geometric raycasting; retain real Three
  // geometry, matrices, materials and instance-picking acceleration.
  const context = new Proxy({}, { get: (_, key) => key.startsWith('create') ? () => ({ addColorStop() {} }) : () => {} });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => context }) } });
  t.after(() => old ? Object.defineProperty(globalThis, 'document', old) : delete globalThis.document);
  const { buildOutdoor } = await import('../public/js/scene/outdoor.js');
  for (const lite of [false, true]) {
    const built = buildOutdoor({ lite, quality: lite ? 'low' : 'high' });
    try {
      built.group.updateMatrixWorld(true);
      built.group.traverse(object => {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!material) continue;
          for (const [slot, value] of Object.entries(material)) {
            if ((slot === 'map' || slot.endsWith('Map')) && value != null) {
              assert.equal(value.isTexture, true, `${lite}: ${object.name || object.type} ${material.type}.${slot} must be a Three texture`);
            }
          }
        }
      });
      assert.deepEqual(built.seats, outdoorSeatList());
      assert.equal(built.seatMesh.count, built.seats.length);
      const lawn = built.group.getObjectByName('park-lawn');
      assert.ok(lawn?.isMesh);
      const matrix = new THREE.Matrix4();
      for (const seat of built.seats) {
        const lawnRay = new THREE.Raycaster(new THREE.Vector3(seat.x, 2, seat.z), new THREE.Vector3(0, -1, 0));
        const ground = lawnRay.intersectObject(lawn)[0];
        assert.ok(ground, seat.label);
        assert.ok(Math.abs(ground.point.y - floorAt(seat.x, seat.z)) < 1e-6, seat.label);
        built.seatMesh.getMatrixAt(seat.index, matrix);
        const origin = new THREE.Vector3().setFromMatrixPosition(matrix);
        for (const axis of ['x', 'y', 'z']) assert.equal(origin[axis], Math.fround(seat[axis]));
        const ray = new THREE.Raycaster(new THREE.Vector3(0, 2, 0.05).applyMatrix4(matrix), new THREE.Vector3(0, -1, 0).transformDirection(matrix));
        const hit = ray.intersectObject(built.seatMesh)[0];
        assert.ok(hit, seat.label);
        assert.equal(hit.instanceId, seat.index, seat.label);
      }
      for (const stair of STAGE_STAIRS) for (let k = 0; k < stair.n - 1; k++) {
        const z = stair.z0 + (k + 0.5) * stair.tread;
        const ray = new THREE.Raycaster(new THREE.Vector3(stair.cx, 3, z), new THREE.Vector3(0, -1, 0));
        const top = ray.intersectObject(built.group, true)[0];
        assert.ok(top);
        // The shared stage explicitly draws a 1 cm carpet runner above
        // each structural tread; keep that rendered offset in the contract.
        assert.ok(Math.abs(top.point.y - (floorAt(stair.cx, z) + 0.01)) < 1e-6, `${lite}: stair ${stair.side} tread ${k}: ${top.point.y}`);
      }
      const levels = built.lights.house.map(h => h.light.intensity);
      built.setHouseLights(0);
      built.update(2);
      assert.ok(built.lights.house.every((h, i) => h.light.intensity < levels[i] && h.light.intensity > 0));
      assert.equal(built.lights.key.castShadow, !lite);
    } finally {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      built.group.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) {
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
    }
  }
});
