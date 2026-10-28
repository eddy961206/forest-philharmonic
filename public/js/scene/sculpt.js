// Sculpting by distance. A figure is written as rounded shapes merged
// smoothly into each other (and lines cut into them), the way clay is
// worked, then meshed once: surface nets over a grid that is only filled
// near the surface, normals from the field, and the hollows darkened by
// how near the field says other surfaces are (ambient occlusion). Used for
// the cast figures of the room of contemplation (pensive.js).
import * as THREE from 'three';

export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};

// A local frame: its centre and rotation (Euler, radians). local() turns a
// point of the figure into the frame's coordinates, world() the other way.
export function frame(c, euler = [0, 0, 0]) {
  const e = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...euler)).elements;
  const r = [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]]; // (the local axes)
  return {
    c,
    local(x, y, z, out) {
      const dx = x - c[0];
      const dy = y - c[1];
      const dz = z - c[2];
      out[0] = r[0] * dx + r[1] * dy + r[2] * dz;
      out[1] = r[3] * dx + r[4] * dy + r[5] * dz;
      out[2] = r[6] * dx + r[7] * dy + r[8] * dz;
      return out;
    },
    world([x, y, z]) {
      return [c[0] + r[0] * x + r[3] * y + r[6] * z, c[1] + r[1] * x + r[4] * y + r[7] * z, c[2] + r[2] * x + r[5] * y + r[8] * z];
    },
  };
}

// ---------------------------------------------------------- the shapes
// Each is { d(x, y, z), c, r }: the distance, and a sphere that holds it.
export const sphere = (c, r) => ({ d: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r, c, r });

export function ellipsoid(c, [a, b, k], euler) {
  const f = frame(c, euler);
  const t = [0, 0, 0];
  return {
    d(x, y, z) {
      f.local(x, y, z, t);
      const u = t[0] / a;
      const v = t[1] / b;
      const w = t[2] / k;
      const k0 = Math.sqrt(u * u + v * v + w * w);
      const k1 = Math.sqrt((u / a) ** 2 + (v / b) ** 2 + (w / k) ** 2);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(a, b, k);
    },
    c, r: Math.max(a, b, k),
  };
}

// a cone with rounded ends, radius ra at a and rb at b (Inigo Quilez)
export function roundCone(a, b, ra, rb) {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return {
    d(x, y, z) {
      const px = x - a[0];
      const py = y - a[1];
      const pz = z - a[2];
      const yv = px * bx + py * by + pz * bz;
      const zv = yv - l2;
      const qx = px * l2 - bx * yv;
      const qy = py * l2 - by * yv;
      const qz = pz * l2 - bz * yv;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yv * yv * l2;
      const z2 = zv * zv * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
    },
    c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: Math.sqrt(l2) / 2 + Math.max(ra, rb),
  };
}
export const capsule = (a, b, r) => roundCone(a, b, r, r);

// a ring round the frame's y axis
export function torus(c, R, r, euler) {
  const f = frame(c, euler);
  const t = [0, 0, 0];
  return { d(x, y, z) { f.local(x, y, z, t); return Math.hypot(Math.hypot(t[0], t[2]) - R, t[1]) - r; }, c, r: R + r };
}

// part of a ring in the frame's xy plane, from angle a0 to a1 (radians,
// 0 along +x, pi/2 along +y): a line drawn on a face, a fold, a crescent
export function arc(c, R, r, euler, a0, a1) {
  const f = frame(c, euler);
  const t = [0, 0, 0];
  return {
    d(x, y, z) {
      f.local(x, y, z, t);
      let a = Math.atan2(t[1], t[0]);
      if (a < a0 - 1e-9) a += Math.PI * 2;
      if (a > a1) a = a - a1 > a0 + Math.PI * 2 - a ? a0 : a1;
      return Math.hypot(t[0] - R * Math.cos(a), t[1] - R * Math.sin(a), t[2]) - r;
    },
    c, r: R + r,
  };
}

// a tube along a polyline of points: a line drawn into a surface
export function tube(points, r) {
  const c = [0, 1, 2].map((i) => points.reduce((a, p) => a + p[i], 0) / points.length);
  const segs = points.slice(1).map((b, i) => capsule(points[i], b, r));
  return {
    d(x, y, z) { let d = Infinity; for (const s of segs) d = Math.min(d, s.d(x, y, z)); return d; },
    c, r: Math.max(...points.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]))) + r,
  };
}

// a box with rounded edges (half sizes)
export function box(c, [hx, hy, hz], round, euler) {
  const f = frame(c, euler);
  const t = [0, 0, 0];
  return {
    d(x, y, z) {
      f.local(x, y, z, t);
      const qx = Math.abs(t[0]) - hx + round;
      const qy = Math.abs(t[1]) - hy + round;
      const qz = Math.abs(t[2]) - hz + round;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - round;
    },
    c, r: Math.hypot(hx, hy, hz),
  };
}

// a disc or drum along the frame's y axis (radius r, half height h)
export function cylinder(c, r, h, euler) {
  const f = frame(c, euler);
  const t = [0, 0, 0];
  return {
    d(x, y, z) {
      f.local(x, y, z, t);
      const dx = Math.hypot(t[0], t[2]) - r;
      const dy = Math.abs(t[1]) - h;
      return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    },
    c, r: Math.hypot(r, h),
  };
}

// any shape, kept between two heights (a clean cut at each)
export function between(shape, y0, y1) {
  return { d: (x, y, z) => Math.max(shape.d(x, y, z), y0 - y, y - y1), c: shape.c, r: shape.r };
}

// any shape, made thin: a shell of thickness t round its surface, kept
// only where keep(x, y, z) <= 0 (the hem: a cut rounded by k)
export function shell(shape, t, keep, k = 0.008) {
  return { d: (x, y, z) => smax(Math.abs(shape.d(x, y, z)) - t, keep(x, y, z), k), c: shape.c, r: shape.r + t };
}

// ---------------------------------------------------------- the field
// ops: [{ shape, k, cut?, disp?, amp? }] in order: shapes merged with
// smooth radius k, cuts carved (after all the merging), disp(x, y, z) added
// to a shape's distance (folds), amp its largest size.
export function evaluate(ops, x, y, z) {
  let d = 1e9;
  for (const o of ops) {
    let s = o.shape.d(x, y, z);
    if (o.disp) s += o.disp(x, y, z);
    d = o.cut ? smax(d, -s, o.k) : smin(d, s, o.k);
  }
  return d;
}

const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

// Mesh the surface (d = 0). h: the grid's step; gives an indexed geometry
// with normals and an `ao` attribute (1 open, 0 shut in). sculpt() does it
// at once; sculptLater() a few milliseconds at a time, between frames.
export function sculpt(rawOps, opts) {
  const job = sculptSteps(rawOps, opts);
  let r;
  while (!(r = job.next()).done);
  return r.value;
}
export function sculptLater(rawOps, opts, budget = 7) {
  return new Promise((resolve, reject) => {
    const job = sculptSteps(rawOps, opts);
    const slice = () => {
      const t = performance.now();
      try {
        for (;;) {
          const r = job.next();
          if (r.done) { resolve(r.value); return; }
          if (performance.now() - t > budget) break;
        }
      } catch (e) { reject(e); return; }
      setTimeout(slice, 0);
    };
    slice();
  });
}

export function* sculptSteps(rawOps, { h = 0.007, block = 8, pad = 0.03, aoReach = 0.07, stats = null } = {}) {
  const t0 = performance.now();
  const adds = rawOps.filter((o) => !o.cut);
  const cuts = rawOps.filter((o) => o.cut);
  const ops = [...adds, ...cuts];
  const kMax = Math.max(...ops.map((o) => o.k));
  const ampMax = Math.max(0, ...ops.map((o) => o.amp || 0));
  const reach = (o) => o.k / 4 + (o.amp || 0);
  const lo = [0, 1, 2].map((i) => Math.min(...adds.map((o) => o.shape.c[i] - o.shape.r)) - pad);
  const hi = [0, 1, 2].map((i) => Math.max(...adds.map((o) => o.shape.c[i] + o.shape.r)) + pad);
  const B = block;
  const nb = [0, 1, 2].map((i) => Math.ceil((hi[i] - lo[i]) / (h * B)));
  const n = nb.map((b) => b * B + 1);
  const NX = n[0];
  const NXY = n[0] * n[1];
  const val = new Float32Array(n[0] * n[1] * n[2]).fill(1);
  const done = new Uint8Array(val.length); // (a node shared by two blocks is worked once)
  const R = (Math.sqrt(3) * B * h) / 2;
  const margin = 2 * h + kMax / 4 + ampMax; // (the widest the surface can be from a block's estimate)
  const lists = new Map(); // block -> the shapes that matter in it
  const c = [0, 0, 0];

  for (let bk = 0; bk < nb[2]; bk++) {
    for (let bj = 0; bj < nb[1]; bj++) {
      for (let bi = 0; bi < nb[0]; bi++) {
        c[0] = lo[0] + (bi + 0.5) * B * h;
        c[1] = lo[1] + (bj + 0.5) * B * h;
        c[2] = lo[2] + (bk + 0.5) * B * h;
        // the whole field at the block's middle, before and after the cuts
        let du = 1e9;
        for (const o of adds) du = smin(du, o.shape.d(c[0], c[1], c[2]) + (o.disp ? o.disp(c[0], c[1], c[2]) : 0), o.k);
        let df = du;
        for (const o of cuts) df = smax(df, -(o.shape.d(c[0], c[1], c[2]) + (o.disp ? o.disp(c[0], c[1], c[2]) : 0)), o.k);
        if (Math.abs(df) > R + margin && df > 0) continue;
        const list = ops.filter((o) => {
          const lb = Math.hypot(c[0] - o.shape.c[0], c[1] - o.shape.c[1], c[2] - o.shape.c[2]) - o.shape.r - R - (o.amp || 0);
          return o.cut ? lb < o.k - du + R + margin : lb < df + R + o.k + margin;
        });
        // (how far off the estimate can be here: only the shapes near count)
        let local = 1.5 * h;
        for (const o of list) local = Math.max(local, 1.5 * h + reach(o));
        const i0 = bi * B;
        const j0 = bj * B;
        const k0 = bk * B;
        if (df > R + local) continue;
        if (df < -(R + local)) {
          for (let k = k0; k <= k0 + B; k++) for (let j = j0; j <= j0 + B; j++) for (let i = i0, q = k * NXY + j * NX + i0; i <= i0 + B; i++, q++) if (!done[q]) val[q] = -1;
          continue;
        }
        lists.set(bi + bj * nb[0] + bk * nb[0] * nb[1], list);
        if (lists.size % 6 === 0) yield;
        for (let k = k0; k <= k0 + B; k++) {
          const z = lo[2] + k * h;
          for (let j = j0; j <= j0 + B; j++) {
            const y = lo[1] + j * h;
            for (let i = i0, q = k * NXY + j * NX + i0; i <= i0 + B; i++, q++) {
              if (done[q]) continue;
              val[q] = evaluate(list, lo[0] + i * h, y, z);
              done[q] = 1;
            }
          }
        }
      }
    }
  }

  const t1 = performance.now();
  // surface nets: a vertex in every cell the surface passes through...
  const vid = new Map();
  const pos = [];
  const cellBlock = [];
  const corner = new Float32Array(8);
  let worked = 0;
  for (const key of lists.keys()) {
    if (++worked % 40 === 0) yield;
    const bi = key % nb[0];
    const bj = Math.floor(key / nb[0]) % nb[1];
    const bk = Math.floor(key / (nb[0] * nb[1]));
    for (let k = bk * B; k < bk * B + B; k++) {
      for (let j = bj * B; j < bj * B + B; j++) {
        for (let i = bi * B; i < bi * B + B; i++) {
          let mask = 0;
          for (let q = 0; q < 8; q++) {
            const v = val[(k + (q >> 2)) * NXY + (j + ((q >> 1) & 1)) * NX + i + (q & 1)];
            corner[q] = v;
            if (v < 0) mask |= 1 << q;
          }
          if (mask === 0 || mask === 255) continue;
          let sx = 0;
          let sy = 0;
          let sz = 0;
          let m = 0;
          for (const [a, b] of EDGES) {
            const va = corner[a];
            const vb = corner[b];
            if ((va < 0) === (vb < 0)) continue;
            const t = va / (va - vb);
            sx += (a & 1) + ((b & 1) - (a & 1)) * t;
            sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
            sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
            m++;
          }
          vid.set(k * NXY + j * NX + i, pos.length / 3);
          pos.push(lo[0] + (i + sx / m) * h, lo[1] + (j + sy / m) * h, lo[2] + (k + sz / m) * h);
          cellBlock.push(key);
        }
      }
    }
  }
  // ...and a face across every grid edge the surface crosses
  const index = [];
  const quad = (a, b, cc, d, flip) => {
    if (a === undefined || b === undefined || cc === undefined || d === undefined) return;
    if (flip) index.push(a, b, cc, a, cc, d); else index.push(a, cc, b, a, d, cc);
  };
  for (const [cell] of vid) {
    const i = cell % NX;
    const j = Math.floor(cell / NX) % n[1];
    const k = Math.floor(cell / NXY);
    const v0 = val[cell];
    if (j > 0 && k > 0) {
      const v1 = val[cell + 1];
      if ((v0 < 0) !== (v1 < 0)) quad(vid.get(cell), vid.get(cell - NX), vid.get(cell - NX - NXY), vid.get(cell - NXY), v0 < 0);
    }
    if (i > 0 && k > 0) {
      const v1 = val[cell + NX];
      if ((v0 < 0) !== (v1 < 0)) quad(vid.get(cell), vid.get(cell - NXY), vid.get(cell - NXY - 1), vid.get(cell - 1), v0 < 0);
    }
    if (i > 0 && j > 0) {
      const v1 = val[cell + NXY];
      if ((v0 < 0) !== (v1 < 0)) quad(vid.get(cell), vid.get(cell - 1), vid.get(cell - 1 - NX), vid.get(cell - NX), v0 < 0);
    }
  }

  const t2 = performance.now();
  // normals from the field; the hollows from how near other surfaces are
  const count = pos.length / 3;
  const normal = new Float32Array(count * 3);
  const ao = new Float32Array(count);
  const e = h * 0.5;
  const steps = [0.2, 0.4, 0.65, 1].map((f) => f * aoReach);
  for (let v = 0; v < count; v++) {
    if (v % 1500 === 0) yield;
    const list = lists.get(cellBlock[v]);
    let x = pos[v * 3];
    let y = pos[v * 3 + 1];
    let z = pos[v * 3 + 2];
    // (four taps on a tetrahedron, not six)
    const a = evaluate(list, x + e, y - e, z - e);
    const b = evaluate(list, x - e, y - e, z + e);
    const cc = evaluate(list, x - e, y + e, z - e);
    const d = evaluate(list, x + e, y + e, z + e);
    let gx = a - b - cc + d;
    let gy = -a - b + cc + d;
    let gz = -a + b - cc + d;
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l;
    gy /= l;
    gz /= l;
    normal.set([gx, gy, gz], v * 3);
    // (onto the surface itself, not where the grid guessed it: fine lines
    // cut into it stay clean)
    const off = Math.max(-h, Math.min(h, (a + b + cc + d) / 4));
    x -= gx * off;
    y -= gy * off;
    z -= gz * off;
    pos[v * 3] = x;
    pos[v * 3 + 1] = y;
    pos[v * 3 + 2] = z;
    let occ = 0;
    let w = 1;
    for (const s of steps) {
      // (from the grid itself: the field out there, as far as it was worked)
      const d = sampleGrid(val, n, lo, h, x + gx * s, y + gy * s, z + gz * s);
      occ += w * Math.max(0, s - d) / s;
      w *= 0.6;
    }
    ao[v] = Math.max(0, Math.min(1, 1 - occ * 0.55));
  }
  if (stats) Object.assign(stats, { field: t1 - t0, nets: t2 - t1, shade: performance.now() - t2, blocks: lists.size, ops: ops.length, meanList: [...lists.values()].reduce((a, l) => a + l.length, 0) / lists.size });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
  g.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// the grid's value at a point between its nodes (trilinear)
function sampleGrid(val, n, lo, h, x, y, z) {
  const fx = (x - lo[0]) / h;
  const fy = (y - lo[1]) / h;
  const fz = (z - lo[2]) / h;
  if (fx < 0 || fy < 0 || fz < 0 || fx >= n[0] - 1 || fy >= n[1] - 1 || fz >= n[2] - 1) return 1;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const k = Math.floor(fz);
  const tx = fx - i;
  const ty = fy - j;
  const tz = fz - k;
  const NX = n[0];
  const NXY = n[0] * n[1];
  const at = (a, b, c) => val[(k + c) * NXY + (j + b) * NX + i + a];
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(at(0, 0, 0), at(1, 0, 0), tx), l(at(0, 1, 0), at(1, 1, 0), tx), ty), l(l(at(0, 0, 1), at(1, 0, 1), tx), l(at(0, 1, 1), at(1, 1, 1), tx), ty), tz);
}
