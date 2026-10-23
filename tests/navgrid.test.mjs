import assert from 'node:assert/strict';
import test from 'node:test';
import { NavGrid } from '../public/js/scene/navgrid.js';
import { DOORS, stageFloorY } from '../public/js/scene/hallplan.js';
import { PODIUM, SECTIONS } from '../public/js/layout.js';

function assertSupported(route, label) {
  assert.ok(route?.length >= 2, `${label}: missing route`);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.01));
    let previous = stageFloorY(a.x, a.z);
    for (let k = 1; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
      const height = stageFloorY(x, z);
      assert.ok(Math.abs(height - previous) <= 0.23, `${label}: ${x},${z} rises ${height - previous}`);
      previous = height;
    }
  }
}

test('stage smoothing rejects a curved riser edge hidden inside a grid cell', () => {
  const nav = new NavGrid();
  const a = { x: 8.54, z: -3.02 }, b = { x: 8.18, z: -2.66 };
  const p = { x: 8.51230769230769, z: -2.9923076923076937 };
  assert.deepEqual(nav.cell(a.x, a.z), nav.cell(p.x, p.z));
  assert.ok(Math.abs(stageFloorY(p.x, p.z) - stageFloorY(a.x, a.z)) > 0.23);
  assert.equal(nav._clear(a, b, () => true), false);
});

test('A* and smoothing preserve real tread heights for both doors and every shared stage chair', () => {
  const nav = new NavGrid();
  const left = DOORS.find(door => door.side === 'L');
  assertSupported(nav.find(left.inside.x, left.inside.z, PODIUM.x, PODIUM.z), 'conductor');
  for (const [section, spec] of Object.entries(SECTIONS)) for (const [index, chair] of spec.chairs.entries()) {
    const door = DOORS.find(d => d.side === (chair.x < 0 || section === 'piano' ? 'L' : 'R'));
    assertSupported(nav.find(door.inside.x, door.inside.z, chair.x, chair.z), `${section}:${index}`);
  }
});
