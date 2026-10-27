// Path planning for the stage crew: a height-aware grid over the stage
// (risers and their stairs included) with the furniture rasterised as
// obstacles. A* finds a route a musician could really walk - around chairs
// and stands, up the riser steps - which is then smoothed by line of sight.
import { HALL, stageFloorY, onStage, insideShell, DOORS, SHELL, RISERS, SERVICE_STEPS, PODIUM_R } from './hallplan.js';
import { PODIUM } from '../layout.js';

const CELL = 0.12;
const MAX_STEP = 0.23; // riser steps are <= 0.18, the podium 0.22
const FLOOR_RADII = [...new Set([PODIUM_R, ...RISERS.flatMap(r => [r.r0, r.r1]), ...SERVICE_STEPS.flatMap(s => [s.r0, s.r1])])];
const FLOOR_RAYS = [...new Set([
  ...RISERS.flatMap(r => Array.from({ length: r.treads + 1 }, (_, k) => r.aRad + k * r.span / r.treads).flatMap(a => [-a, a])),
  ...SERVICE_STEPS.flatMap(s => [s.angle - s.aRad, s.angle + s.aRad]),
])].map(a => ({ x: Math.sin(a), z: -Math.cos(a) }));

export class NavGrid {
  constructor() {
    this.x0 = -HALL.stageHalfW;
    this.z0 = HALL.front + 0.2;
    this.w = Math.ceil((HALL.stageHalfW * 2) / CELL);
    this.h = Math.ceil((1.2 - this.z0) / CELL);
    const n = this.w * this.h;
    this.height = new Float32Array(n);
    this.open = new Uint8Array(n); // walkable floor
    this.block = new Uint16Array(n); // obstacle count
    // A cell can straddle the curved edge of a riser. Its centre height
    // alone cannot certify that the segment into the next cell is walkable.
    this.checkedEdges = new Uint8Array(n);
    this.safeEdges = new Uint8Array(n);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const { x, z } = this.center(i, j);
        const k = j * this.w + i;
        if (onStage(x, z) && insideShell(x, z, 0.18)) {
          this.open[k] = 1;
          this.height[k] = stageFloorY(x, z);
        }
      }
    }
    // the corridors through the musicians' doors
    for (const d of DOORS) {
      for (let t = -1.4; t <= 1.6; t += CELL * 0.5) {
        for (let s = -SHELL.doorW / 2 + 0.2; s <= SHELL.doorW / 2 - 0.2; s += CELL * 0.5) {
          const x = d.pos.x + d.normal.x * t - d.normal.z * s;
          const z = d.pos.z + d.normal.z * t + d.normal.x * s;
          const c = this.cell(x, z);
          if (!c) continue;
          const k = c.j * this.w + c.i;
          this.open[k] = 1;
          this.height[k] = stageFloorY(x, z);
        }
      }
    }
  }

  center(i, j) { return { x: this.x0 + (i + 0.5) * CELL, z: this.z0 + (j + 0.5) * CELL }; }

  cell(x, z) {
    const i = Math.floor((x - this.x0) / CELL);
    const j = Math.floor((z - this.z0) / CELL);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return null;
    return { i, j };
  }

  // circle or oriented box obstacles, inflated by the walker's radius
  addCircle(x, z, r, sign = 1) {
    const R = r + 0.14;
    this._raster(x - R, x + R, z - R, z + R, (px, pz) => (px - x) ** 2 + (pz - z) ** 2 <= R * R, sign);
  }

  addBox(box, sign = 1) {
    const m = 0.14;
    this._raster(box.min.x - m, box.max.x + m, box.min.z - m, box.max.z + m, () => true, sign);
  }

  _raster(xa, xb, za, zb, test, sign) {
    const a = this.cell(Math.max(this.x0, xa), Math.max(this.z0, za)) || { i: 0, j: 0 };
    const b = this.cell(Math.min(this.x0 + this.w * CELL - 1e-3, xb), Math.min(this.z0 + this.h * CELL - 1e-3, zb));
    if (!b) return;
    for (let j = a.j; j <= b.j; j++) {
      for (let i = a.i; i <= b.i; i++) {
        const c = this.center(i, j);
        if (test(c.x, c.z)) {
          const k = j * this.w + i;
          this.block[k] = Math.max(0, this.block[k] + sign);
        }
      }
    }
  }

  free(k) { return this.open[k] && !this.block[k]; }

  // A* from (sx,sz) to (tx,tz). Cells near the start/goal are allowed even
  // if blocked (you start at your own chair, you end at your own chair).
  find(sx, sz, tx, tz) {
    const W = this.w;
    const s = this.cell(sx, sz);
    const t = this.cell(tx, tz);
    if (!s || !t) return null;
    const near = (k, c, r) => {
      const i = k % W;
      const j = (k - i) / W;
      return Math.abs(i - c.i) <= r && Math.abs(j - c.j) <= r;
    };
    const R = Math.ceil(0.45 / CELL);
    const ok = (k) => this.open[k] && (!this.block[k] || near(k, s, R) || near(k, t, R));
    const n = W * this.h;
    const g = new Float32Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const sk = s.j * W + s.i;
    const tk = t.j * W + t.i;
    const hfn = (k) => {
      const i = k % W;
      const j = (k - i) / W;
      const dx = Math.abs(i - t.i);
      const dj = Math.abs(j - t.j);
      return (Math.max(dx, dj) + 0.414 * Math.min(dx, dj));
    };
    g[sk] = 0;
    heap.push(sk, hfn(sk));
    const DI = [1, -1, 0, 0, 1, 1, -1, -1];
    const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
    let found = false;
    while (heap.size) {
      const k = heap.pop();
      if (k === tk) { found = true; break; }
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % W;
      const j = (k - i) / W;
      for (let d = 0; d < 8; d++) {
        const ni = i + DI[d];
        const nj = j + DJ[d];
        if (ni < 0 || nj < 0 || ni >= W || nj >= this.h) continue;
        const nk = nj * W + ni;
        if (closed[nk] || !ok(nk)) continue;
        if (Math.abs(this.height[nk] - this.height[k]) > MAX_STEP) continue;
        if (d >= 4 && (!ok(j * W + ni) || !ok(nj * W + i))) continue; // no corner cutting
        if (!this._edgeClear(k, nk, d)) continue;
        const cost = g[k] + (d < 4 ? 1 : 1.414) + (this.height[nk] !== this.height[k] ? 0.6 : 0);
        if (cost < g[nk]) {
          g[nk] = cost;
          from[nk] = k;
          heap.push(nk, cost + hfn(nk));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = tk; k !== -1; k = from[k]) cells.push(k);
    cells.reverse();
    const pts = cells.map((k) => { const i = k % W; return this.center(i, (k - i) / W); });
    pts[0] = { x: sx, z: sz };
    pts[pts.length - 1] = { x: tx, z: tz };
    return this._smooth(pts, ok);
  }

  _heightClear(a, b) {
    // stageFloorY is piecewise constant between these exact circle/ray
    // boundaries. Sampling each interval catches even a very narrow slice
    // at a curved corner, which a fixed sampling pitch could skip entirely.
    const x = a.x - PODIUM.x, z = a.z - PODIUM.z;
    const dx = b.x - a.x, dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    if (length2 < 1e-20) return true;
    const cuts = [0, 1];
    const add = t => { if (t > 0 && t < 1) cuts.push(t); };
    const linear = 2 * (x * dx + z * dz);
    for (const radius of FLOOR_RADII) {
      const discriminant = linear * linear - 4 * length2 * (x * x + z * z - radius * radius);
      if (discriminant < 0) continue;
      const root = Math.sqrt(discriminant);
      add((-linear - root) / (2 * length2));
      add((-linear + root) / (2 * length2));
    }
    for (const ray of FLOOR_RAYS) {
      const denominator = dx * ray.z - dz * ray.x;
      if (Math.abs(denominator) < 1e-12) continue;
      const t = -(x * ray.z - z * ray.x) / denominator;
      if ((x + dx * t) * ray.x + (z + dz * t) * ray.z >= 0) add(t);
    }
    cuts.sort((p, q) => p - q);
    let previous = stageFloorY(a.x, a.z);
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < 1e-12) continue;
      const t = (cuts[i - 1] + cuts[i]) / 2;
      const height = stageFloorY(a.x + dx * t, a.z + dz * t);
      if (Math.abs(height - previous) > MAX_STEP) return false;
      previous = height;
    }
    return Math.abs(stageFloorY(b.x, b.z) - previous) <= MAX_STEP;
  }

  _edgeClear(k, nk, direction) {
    const bit = 1 << direction;
    if (!(this.checkedEdges[k] & bit)) {
      this.checkedEdges[k] |= bit;
      const a = this.center(k % this.w, Math.floor(k / this.w));
      const b = this.center(nk % this.w, Math.floor(nk / this.w));
      if (this._heightClear(a, b)) this.safeEdges[k] |= bit;
    }
    return !!(this.safeEdges[k] & bit);
  }

  // string pulling: keep only the corners a walker actually needs
  _smooth(pts, ok) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this._clear(pts[i], pts[j], ok)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  _clear(a, b, ok) {
    if (!this._heightClear(a, b)) return false;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / (CELL * 0.4));
    let prevH = null;
    for (let s = 0; s <= n; s++) {
      const x = a.x + ((b.x - a.x) * s) / n;
      const z = a.z + ((b.z - a.z) * s) / n;
      const c = this.cell(x, z);
      if (!c) return false;
      const k = c.j * this.w + c.i;
      if (!ok(k)) return false;
      const h = this.height[k];
      if (prevH !== null && Math.abs(h - prevH) > MAX_STEP) return false;
      // on stairs keep to the grid path: a diagonal across steps reads badly
      if (prevH !== null && h !== prevH && s > 0 && s < n && d > 1.2) return false;
      prevH = h;
    }
    return true;
  }
}

class MinHeap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) {
    const K = this.k;
    const P = this.p;
    K.push(k);
    P.push(p);
    let i = K.length - 1;
    while (i > 0) {
      const q = (i - 1) >> 1;
      if (P[q] <= P[i]) break;
      [K[q], K[i]] = [K[i], K[q]];
      [P[q], P[i]] = [P[i], P[q]];
      i = q;
    }
  }
  pop() {
    const K = this.k;
    const P = this.p;
    const top = K[0];
    const lk = K.pop();
    const lp = P.pop();
    if (K.length) {
      K[0] = lk;
      P[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < K.length && P[l] < P[m]) m = l;
        if (r < K.length && P[r] < P[m]) m = r;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]];
        [P[m], P[i]] = [P[i], P[m]];
        i = m;
      }
    }
    return top;
  }
}
