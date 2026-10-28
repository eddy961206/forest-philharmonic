import test from 'node:test';
import assert from 'node:assert/strict';
import { sculpt, sculptLater, sphere, capsule, ellipsoid, roundCone, evaluate } from '../public/js/scene/sculpt.js';

// The figures of the room of contemplation are sculpted as distance fields
// and meshed by surface nets (sculpt.js). The mesher must give the surface
// where the field says it is, facing out, closed, with clean normals.
function facesOut(g) {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const idx = g.index.array;
  let agree = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
    const u = [p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a)];
    const v = [p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a)];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (f[0] * n.getX(a) + f[1] * n.getY(a) + f[2] * n.getZ(a) > 0) agree++;
  }
  return agree / (idx.length / 3);
}

test('a sphere comes out where its field puts it, facing out', () => {
  const g = sculpt([{ shape: sphere([0.1, 0.2, -0.05], 0.12), k: 0.01 }], { h: 0.01 });
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  let worst = 0;
  let bent = 0;
  for (let i = 0; i < p.count; i++) {
    const d = [p.getX(i) - 0.1, p.getY(i) - 0.2, p.getZ(i) + 0.05];
    const r = Math.hypot(...d);
    worst = Math.max(worst, Math.abs(r - 0.12));
    bent = Math.max(bent, 1 - (d[0] * n.getX(i) + d[1] * n.getY(i) + d[2] * n.getZ(i)) / r);
  }
  assert.ok(worst < 0.0015, `on the surface (${worst})`);
  assert.ok(bent < 0.01, `normals out of the surface (${bent})`);
  assert.ok(facesOut(g) > 0.99, 'wound to face out');
  // (and every edge shared by two faces: no holes)
  const edges = new Map();
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    edges.set(key, (edges.get(key) || 0) + 1);
  }
  assert.ok([...edges.values()].every((c) => c === 2), 'closed');
});

test('shapes merged smoothly and lines cut stay where they are put', () => {
  const ops = [
    { shape: capsule([-0.1, 0, 0], [0.1, 0, 0], 0.05), k: 0.03 },
    { shape: ellipsoid([0, 0.06, 0], [0.04, 0.03, 0.04]), k: 0.03 },
    { shape: sphere([0, 0, -0.05], 0.012), k: 0.004, cut: true },
  ];
  // (the merge fills the corner between the two; the cut is a hollow)
  assert.ok(evaluate(ops, 0.035, 0.055, 0) < 0, 'filled corner');
  assert.ok(evaluate(ops, 0, 0, -0.048) > 0, 'the cut is open');
  const g = sculpt(ops, { h: 0.006 });
  const ao = g.getAttribute('ao').array;
  assert.ok(ao.every((v) => v >= 0 && v <= 1));
  assert.ok(facesOut(g) > 0.98);
});

test('the cone with rounded ends is a true distance', () => {
  const c = roundCone([0, 0, 0], [0, 0.3, 0], 0.08, 0.03);
  assert.ok(Math.abs(c.d(0.08, 0, 0)) < 1e-9);
  assert.ok(Math.abs(c.d(0, 0.33, 0)) < 1e-9);
  assert.ok(Math.abs(c.d(0, -0.18, 0) - 0.1) < 1e-9);
});

test('worked a little at a time, it gives the same mesh', async () => {
  const ops = [{ shape: sphere([0, 0, 0], 0.1), k: 0.01 }, { shape: capsule([0, 0, 0], [0.15, 0.1, 0], 0.03), k: 0.03 }];
  const now = sculpt(ops, { h: 0.01 });
  const later = await sculptLater(ops, { h: 0.01 }, 1);
  assert.equal(later.getAttribute('position').count, now.getAttribute('position').count);
  assert.deepEqual(Array.from(later.index.array), Array.from(now.index.array));
});
