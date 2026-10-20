// Sphere, Las Vegas - the inside of the building, built from sphereplan.js
// so that every tread you see is a tread you can stand on. A black bowl of
// four steep cantilevered tiers fanned round an end stage, the 16K screen
// wrapping overhead (domeshow.js draws what is on it), glass-railed balcony
// fronts with a ribbon of LED and rows of moving lights under them, aisle
// step lights, section numbers and EXIT signs over the vomitories, and lifts
// behind them between the levels. Same interface as buildHall().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { phys } from './materials.js';
import { STAGE_Y } from '../layout.js';
import {
  SP, TIERS, AISLE_FR, AISLE_HALF, VOMS, VOM, LIFT_SHUT, polarF, vomUV, sphereSeatList,
} from './sphereplan.js';
import { buildStage, buildShell } from './hall.js';
import { buildDome } from './domeshow.js';

const F = SP.F;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const P = (r, th, y) => [F.x + r * Math.sin(th), y, F.z + r * Math.cos(th)];
const radial = (th) => [Math.sin(th), 0, Math.cos(th)];
const tangent = (th) => [Math.cos(th), 0, -Math.sin(th)];
const UNDER = 1.0; // slab depth under each tread line

export const underY = (T, r) => T.y0 - UNDER + ((r - T.r0) / T.depth) * T.rise;

// ------------------------------------------------------------ geometry kit
// quads with a wanted facing; the winding is fixed up to match it
class Acc {
  constructor(tile = 2) { this.p = []; this.n = []; this.uv = []; this.tile = tile; }
  quad(a, b, c, d, N) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (cr[0] * N[0] + cr[1] * N[1] + cr[2] * N[2] < 0) { const t = b; b = d; d = t; }
    const ax = Math.abs(N[0]) > Math.abs(N[1]) && Math.abs(N[0]) > Math.abs(N[2]) ? 0 : Math.abs(N[1]) >= Math.abs(N[2]) ? 1 : 2;
    const uvOf = (q) => (ax === 1 ? [q[0], q[2]] : ax === 0 ? [q[2], q[1]] : [q[0], q[1]]);
    for (const q of [a, b, c, a, c, d]) {
      this.p.push(q[0], q[1], q[2]);
      this.n.push(N[0], N[1], N[2]);
      const [u, v] = uvOf(q);
      this.uv.push(u / this.tile, v / this.tile);
    }
  }
  build() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}
const segsFor = (r, a, b) => Math.max(1, Math.ceil((Math.abs(b - a) * r) / 1.2));

// horizontal (or sloped) annular strip; ya at ra, yb at rb
function arcStrip(acc, ra, rb, a, b, ya, yb = ya, down = false) {
  const n = segsFor(rb, a, b);
  for (let i = 0; i < n; i++) {
    const t0 = a + ((b - a) * i) / n;
    const t1 = a + ((b - a) * (i + 1)) / n;
    acc.quad(P(ra, t0, ya), P(rb, t0, yb), P(rb, t1, yb), P(ra, t1, ya), [0, down ? -1 : 1, 0]);
  }
}
// vertical arc at radius r facing the stage (in) or away (out)
function arcWall(acc, r, a, b, y0, y1, inward = true) {
  const n = segsFor(r, a, b);
  for (let i = 0; i < n; i++) {
    const t0 = a + ((b - a) * i) / n;
    const t1 = a + ((b - a) * (i + 1)) / n;
    const rn = radial((t0 + t1) / 2);
    const N = inward ? [-rn[0], 0, -rn[2]] : rn;
    acc.quad(P(r, t0, y0), P(r, t1, y0), P(r, t1, y1), P(r, t0, y1), N);
  }
}
// vertical wall along the radial line th, from ra to rb, bottoms ya0/yb0, tops ya1/yb1
function radialWall(acc, th, ra, rb, ya0, ya1, yb0, yb1, side) {
  const t = tangent(th);
  acc.quad(P(ra, th, ya0), P(rb, th, yb0), P(rb, th, yb1), P(ra, th, ya1), [t[0] * side, 0, t[2] * side]);
}

// angular intervals of a row free of aisles: [[a, b], ...]
function rowSpans(T, r, thM, { aisles = false } = {}) {
  const cuts = [];
  for (const f of AISLE_FR) {
    const c = f * T.spanRad;
    const w = AISLE_HALF / r;
    if (c + w < -thM || c - w > thM) continue;
    cuts.push([Math.max(-thM, c - w), Math.min(thM, c + w)]);
  }
  if (aisles) return cuts;
  const out = [];
  let a = -thM;
  for (const [c0, c1] of cuts) { if (c0 > a) out.push([a, c0]); a = Math.max(a, c1); }
  if (a < thM) out.push([a, thM]);
  return out;
}

// ------------------------------------------------------------- textures
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const FONT = '"IBM Plex Sans KR", "Helvetica Neue", Arial, sans-serif';

// ---------------------------------------------------------------- seats
// Modern bowl seats: charcoal fabric on a black shell, numbered on the back.
// Thirteen thousand of them, so plain boxes (the cushions read at distance).
function seatGeometry() {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const fabric = mergeGeometries([
    B(0.46, 0.1, 0.45).translate(0, 0.45, -0.04),
    B(0.45, 0.58, 0.07).rotateX(-0.17).translate(0, 0.8, 0.23),
  ]);
  const frame = mergeGeometries([
    B(0.04, 0.62, 0.5).translate(-0.255, 0.31, 0.03),
    B(0.04, 0.62, 0.5).translate(0.255, 0.31, 0.03),
    B(0.07, 0.035, 0.46).translate(-0.255, 0.635, -0.01),
    B(0.07, 0.035, 0.46).translate(0.255, 0.635, -0.01),
    B(0.49, 0.64, 0.035).rotateX(-0.17).translate(0, 0.8, 0.285),
  ]);
  return { fabric, frame };
}

function buildSeatMeshes(list, lite) {
  const group = new THREE.Group();
  group.name = 'seats';
  const G = seatGeometry();
  const fabricMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#0c0c0e', roughness: 0.45 });
  const fabric = new THREE.InstancedMesh(G.fabric, fabricMat, list.length);
  const frame = new THREE.InstancedMesh(G.frame, frameMat, list.length);
  const pick = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.95, 0.55).translate(0, 0.48, 0.05), new THREE.MeshBasicMaterial({ visible: false }), list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = V3(1, 1, 1);
  const Y = V3(0, 1, 0);
  const c = new THREE.Color();
  // the floor and each level in its own deep tone, a few seats in a
  // slightly different dye, as in a real house
  const tone = { 플로어: '#2a2d36', '100 레벨': '#272a33', '200 레벨': '#2b2833', '300 레벨': '#262b31', '400 레벨': '#2a2a2e' };
  list.forEach((s, i) => {
    q.setFromAxisAngle(Y, s.yaw);
    m.compose(V3(s.x, s.y, s.z), q, one);
    fabric.setMatrixAt(i, m);
    frame.setMatrixAt(i, m);
    pick.setMatrixAt(i, m);
    c.set(tone[s.level] || '#2a2d36').multiplyScalar(0.92 + ((i * 7919) % 17) / 100);
    fabric.setColorAt(i, c);
  });
  for (const im of [fabric, frame]) { im.receiveShadow = !lite; im.computeBoundingSphere(); }
  pick.computeBoundingSphere();
  group.add(fabric, frame, pick);
  return { group, pick };
}

// ---------------------------------------------------------------- styles
const SPHERE_STYLE = (() => {
  const deck = new THREE.MeshStandardMaterial({ color: '#141417', roughness: 0.52, metalness: 0.05 });
  const skirt = new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: '#8e939c', roughness: 0.32, metalness: 0.9 });
  const carpet = new THREE.MeshStandardMaterial({ color: '#1c1d22', roughness: 0.96 });
  const shell = new THREE.MeshStandardMaterial({ color: '#2b2e36', roughness: 0.42, metalness: 0.35 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.5, metalness: 0.3 });
  return {
    boards: () => deck, skirt: () => skirt, trim: () => steel, rail: () => steel, carpet: () => carpet, shell: () => shell, leaf: () => leaf,
    strip: { color: '#d9f0ff', emissive: '#8fd0ff', intensity: 1.8 },
    backstage: '#000000', shelf: false, apronPilasters: false,
  };
})();

// ================================================================= build
export function buildSphere({ quality = 'high', lite = false } = {}) {
  const group = new THREE.Group();
  group.name = 'sphere';
  const update = [];

  // ------------------------------------------------------------ materials
  const mat = {
    concrete: new THREE.MeshStandardMaterial({ color: '#17181c', roughness: 0.82 }),
    tread: new THREE.MeshStandardMaterial({ color: '#1a1b20', roughness: 0.9 }),
    aisle: new THREE.MeshStandardMaterial({ color: '#202127', roughness: 0.75 }),
    riser: new THREE.MeshStandardMaterial({ color: '#0f1013', roughness: 0.85 }),
    soffit: new THREE.MeshStandardMaterial({ color: '#0b0b0e', roughness: 0.95, side: THREE.DoubleSide }),
    fascia: new THREE.MeshStandardMaterial({ color: '#0d0e11', roughness: 0.4, metalness: 0.4 }),
    wall: new THREE.MeshStandardMaterial({ color: '#121317', roughness: 0.88 }),
    floor: lite ? new THREE.MeshStandardMaterial({ color: '#0f1013', roughness: 0.5 }) : phys({ color: '#0e0f12', roughness: 0.42, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: '#9aa0aa', roughness: 0.3, metalness: 0.92 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#cfe3ff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
    led: new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#8fd0ff', emissiveIntensity: 1.6 }),
    tunnel: new THREE.MeshStandardMaterial({ color: '#1d1e23', roughness: 0.8 }),
    tunnelLight: new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffe2b8', emissiveIntensity: 1.4 }),
    car: new THREE.MeshStandardMaterial({ color: '#7f848c', roughness: 0.34, metalness: 0.88 }),
    carFloor: new THREE.MeshStandardMaterial({ color: '#2a2b30', roughness: 0.6 }),
    step: new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffd8a0', emissiveIntensity: 1.2 }),
    down: new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#fff1da', emissiveIntensity: 1.5 }),
  };
  const add = (acc, m, { cast = false, receive = true } = {}) => {
    const g = acc.build();
    if (!g) return null;
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive && !lite;
    group.add(mesh);
    return mesh;
  };

  // ---------------------------------------------------------------- dome
  const dome = buildDome({ lite });
  group.add(dome.mesh);

  // --------------------------------------------------------------- floor
  {
    const R = Math.sqrt(SP.R * SP.R - SP.C.y * SP.C.y) + 0.5;
    const g = new THREE.CircleGeometry(R, lite ? 64 : 128).rotateX(-Math.PI / 2).translate(SP.C.x, 0, SP.C.z);
    const f = new THREE.Mesh(g, mat.floor);
    f.receiveShadow = !lite;
    group.add(f);
  }

  // ------------------------------------------------------------- the stage
  buildStage(group, SPHERE_STYLE);
  const doorLeaves = buildShell(group, SPHERE_STYLE);
  // a black plinth round the deck's back where the screen meets the floor
  {
    const g = new THREE.BoxGeometry(26, 0.02, 0.3).translate(0, STAGE_Y - 0.08, -13.5);
    const strip = new THREE.Mesh(g, mat.led);
    group.add(strip);
  }

  // -------------------------------------------------------------- the tiers
  const A = {
    tread: new Acc(2), aisle: new Acc(1), riser: new Acc(2), soffit: new Acc(3), side: new Acc(2), fascia: new Acc(2),
    wall: new Acc(3), glass: new Acc(2), led: new Acc(2), tunnel: new Acc(2), tunnelLight: new Acc(2), car: new Acc(1), carFloor: new Acc(1),
  };
  const steps = []; // aisle step light positions [x, y, z, th]
  const downs = []; // soffit downlights
  const fixtures = []; // moving lights under the balcony fronts [x, y, z, th]
  const rails = []; // steel rail geometries

  for (const [ti, T] of TIERS.entries()) {
    const next = TIERS[ti + 1];
    const base = (r) => (T.solid ? 0 : underY(T, r));
    for (let i = 0; i <= T.rows; i++) {
      const last = i === T.rows;
      const ra = T.r0 + i * T.depth;
      const rb = last ? T.rBack : ra + T.depth;
      const y = last ? T.aisleY : T.y0 + i * T.rise;
      const thM = T.thMax[i];
      const prevM = i > 0 ? T.thMax[i - 1] : thM;
      const rm = (ra + rb) / 2;
      // treads (seat rows) and the aisle half steps
      if (last) arcStrip(A.aisle, ra, rb, -thM, thM, y);
      else {
        for (const [a, b] of rowSpans(T, rm, thM)) arcStrip(A.tread, ra, rb, a, b, y);
        for (const [a, b] of rowSpans(T, rm, thM, { aisles: true })) {
          const rh = ra + T.depth / 2;
          arcStrip(A.aisle, ra, rh, a, b, y);
          arcStrip(A.aisle, rh, rb, a, b, y + T.rise / 2);
          arcWall(A.riser, rh, a, b, y, y + T.rise / 2);
          const mid = (a + b) / 2;
          for (const [rr, yy] of [[ra, y], [rh, y + T.rise / 2]]) {
            const p = P(rr + 0.03, mid, yy + 0.012);
            steps.push([p[0], p[1], p[2], mid]);
          }
        }
      }
      // the riser in front of this row (the aisles have their own halves)
      if (i > 0) {
        const spans = last ? [[-Math.min(thM, prevM), Math.min(thM, prevM)]] : rowSpans(T, ra + 0.05, Math.min(thM, prevM));
        for (const [a, b] of spans) arcWall(A.riser, ra, a, b, y - T.rise, y);
        if (!last) for (const [a, b] of rowSpans(T, ra + 0.05, Math.min(thM, prevM), { aisles: true })) arcWall(A.riser, ra, a, b, y - T.rise / 2, y);
        // a row reaching further round than the one in front shows its end
        if (thM > prevM + 1e-4) for (const s of [-1, 1]) arcWall(A.side, ra, s < 0 ? -thM : prevM, s < 0 ? -prevM : thM, base(ra), y);
        if (prevM > thM + 1e-4) for (const s of [-1, 1]) arcWall(A.side, ra, s < 0 ? -prevM : thM, s < 0 ? -thM : prevM, base(ra), y - T.rise, false);
      } else if (T.solid) arcWall(A.riser, ra, -thM, thM, 0, y);
      // the open ends of the row
      const bA = last && !T.solid ? underY(T, T.rEnd) : base(ra);
      const bB = last && !T.solid ? underY(T, T.rEnd) : base(rb);
      for (const s of [-1, 1]) radialWall(A.side, s * thM, ra, rb, bA, y, bB, y, s);
      // the slab underneath
      if (!T.solid) arcStrip(A.soffit, ra, rb, -thM, thM, last ? underY(T, T.rEnd) : underY(T, ra), last ? underY(T, T.rEnd) : underY(T, rb), true);
      // rails along the open ends of the higher rows
      if (!T.solid || y > 0.9) {
        for (const s of [-1, 1]) {
          const a = P(ra + 0.05, s * (thM - 0.06 / rb), y + 1.0);
          const b = P(rb - 0.05, s * (thM - 0.06 / rb), y + 1.0);
          const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
          rails.push(new THREE.CylinderGeometry(0.022, 0.022, len, 8).rotateX(Math.PI / 2).rotateY(Math.atan2(b[0] - a[0], b[2] - a[2])).translate((a[0] + b[0]) / 2, y + 1.0, (a[2] + b[2]) / 2));
          const g0 = P(ra, s * (thM - 0.04 / rb), 0);
          const g1 = P(rb, s * (thM - 0.04 / rb), 0);
          A.glass.quad([g0[0], y + 0.05, g0[2]], [g1[0], y + 0.05, g1[2]], [g1[0], y + 0.98, g1[2]], [g0[0], y + 0.98, g0[2]], tangent(s * thM).map((v) => v * s));
        }
      }
    }
    // the bowed front of the upper tiers: fascia, LED ribbon, glass, rail
    if (!T.solid) {
      const thF = T.thMax[0];
      const rf = T.r0 - 0.45;
      arcWall(A.fascia, rf, -thF, thF, T.y0 - UNDER, T.y0 + 0.25);
      arcStrip(A.fascia, rf, T.r0, -thF, thF, T.y0 + 0.25);
      arcStrip(A.soffit, rf, T.r0, -thF, thF, T.y0 - UNDER, T.y0 - UNDER, true);
      arcWall(A.led, rf - 0.012, -thF, thF, T.y0 - 0.52, T.y0 - 0.44);
      arcWall(A.led, rf - 0.012, -thF, thF, T.y0 + 0.16, T.y0 + 0.19);
      arcWall(A.glass, T.r0 - 0.25, -thF, thF, T.y0 + 0.25, T.y0 + 0.98);
      for (const s of [-1, 1]) radialWall(A.fascia, s * thF, rf, T.r0, T.y0 - UNDER, T.y0 + 0.25, T.y0 - UNDER, T.y0 + 0.25, s);
      const n = Math.ceil((2 * thF * T.r0) / 1.5);
      const pts = [];
      for (let k = 0; k <= n; k++) { const p = P(T.r0 - 0.25, -thF + (2 * thF * k) / n, T.y0 + 1.0); pts.push(V3(p[0], p[1], p[2])); }
      rails.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.03, 8));
      // moving heads hung under the front, every 3 m
      const nf = Math.floor((2 * thF * T.r0) / 3.2);
      for (let k = 0; k <= nf; k++) {
        const th = -thF + 0.02 + ((2 * thF - 0.04) * k) / nf;
        const p = P(T.r0 + 0.35, th, T.y0 - UNDER - 0.02);
        fixtures.push([p[0], p[1], p[2], th]);
      }
      // downlights in the soffit
      for (let r = T.r0 + 2; r < T.rEnd; r += 4.2) {
        const i = Math.floor((r - T.r0) / T.depth);
        const thM = T.thMax[i] - 0.5 / r;
        const n2 = Math.floor((2 * thM * r) / 4.5);
        for (let k = 0; k <= n2; k++) {
          const th = -thM + (2 * thM * k) / Math.max(1, n2);
          const p = P(r, th, underY(T, r) - 0.01);
          downs.push([p[0], p[1], p[2]]);
        }
      }
    }

    // --------------------------------------------------- back wall & voms
    const thW = T.thMax[T.rows];
    const top = next ? underY(next, T.rBack) + 0.15 : T.aisleY + 4.6;
    const myVoms = VOMS.filter((V) => V.tier === T);
    const holes = myVoms.map((V) => [V.th - (VOM.w / 2) / T.rBack, V.th + (VOM.w / 2) / T.rBack]).sort((a, b) => a[0] - b[0]);
    let a = -thW;
    for (const [h0, h1] of holes) { arcWall(A.wall, T.rBack, a, h0, T.aisleY, top); arcWall(A.wall, T.rBack, h0, h1, T.aisleY + VOM.h, top); a = h1; }
    arcWall(A.wall, T.rBack, a, thW, T.aisleY, top);
    // cap on top of the last wall, and the wall's ends
    if (!next) arcStrip(A.wall, T.rBack, T.rBack + 0.6, -thW, thW, top);
    const bW = T.solid ? 0 : underY(T, T.rEnd);
    for (const s of [-1, 1]) radialWall(A.side, s * thW, T.rEnd, T.rBack + 0.01, bW, top, bW, top, s);
    // a ribbon of light along the foot of the back wall
    arcWall(A.led, T.rBack - 0.01, -thW, thW, T.aisleY + 0.05, T.aisleY + 0.08);
    for (const V of myVoms) buildVom(V);
  }

  // a tunnel through the back wall and the lift car behind it
  function buildVom(V) {
    const half = VOM.w / 2;
    const ch = VOM.carW / 2;
    const at = (u, v, y) => [F.x + u * Math.sin(V.th) + v * Math.cos(V.th), y, F.z + u * Math.cos(V.th) - v * Math.sin(V.th)];
    const ru = radial(V.th);
    const tv = tangent(V.th);
    const y = V.y;
    const box = (acc, u0, u1, w, h, floorAcc, lightAcc) => {
      // floor, ceiling, two sides (all facing in)
      floorAcc.quad(at(u0, -w, y), at(u1, -w, y), at(u1, w, y), at(u0, w, y), [0, 1, 0]);
      acc.quad(at(u0, -w, y + h), at(u1, -w, y + h), at(u1, w, y + h), at(u0, w, y + h), [0, -1, 0]);
      acc.quad(at(u0, -w, y), at(u1, -w, y), at(u1, -w, y + h), at(u0, -w, y + h), tv);
      acc.quad(at(u0, w, y), at(u1, w, y), at(u1, w, y + h), at(u0, w, y + h), tv.map((q) => -q));
      if (lightAcc) lightAcc.quad(at(u0 + 0.4, -0.25, y + h - 0.01), at(u1 - 0.4, -0.25, y + h - 0.01), at(u1 - 0.4, 0.25, y + h - 0.01), at(u0 + 0.4, 0.25, y + h - 0.01), [0, -1, 0]);
    };
    box(A.tunnel, V.r0 - 0.02, V.r1, half, VOM.h, A.aisle, A.tunnelLight);
    box(A.car, V.r1, V.r2, ch, VOM.h, A.carFloor, A.tunnelLight);
    // the car's back wall and the front wall round the doors
    A.car.quad(at(V.r2, -ch, y), at(V.r2, ch, y), at(V.r2, ch, y + VOM.h), at(V.r2, -ch, y + VOM.h), ru.map((q) => -q));
    const dh = VOM.h - 0.35;
    for (const s of [-1, 1]) A.car.quad(at(V.r1 + 0.01, s * half, y), at(V.r1 + 0.01, s * ch, y), at(V.r1 + 0.01, s * ch, y + VOM.h), at(V.r1 + 0.01, s * half, y + VOM.h), ru);
    A.car.quad(at(V.r1 + 0.01, -half, y + dh), at(V.r1 + 0.01, half, y + dh), at(V.r1 + 0.01, half, y + VOM.h), at(V.r1 + 0.01, -half, y + VOM.h), ru);
    A.tunnel.quad(at(V.r1 - 0.01, -half, y + dh), at(V.r1 - 0.01, half, y + dh), at(V.r1 - 0.01, half, y + VOM.h), at(V.r1 - 0.01, -half, y + VOM.h), ru.map((q) => -q));
  }

  add(A.tread, mat.tread);
  add(A.aisle, mat.aisle);
  add(A.riser, mat.riser);
  add(A.soffit, mat.soffit);
  add(A.side, mat.concrete);
  add(A.fascia, mat.fascia);
  add(A.wall, mat.wall);
  add(A.tunnel, mat.tunnel);
  add(A.tunnelLight, mat.tunnelLight);
  add(A.car, mat.car);
  add(A.carFloor, mat.carFloor);
  add(A.led, mat.led);
  const glassMesh = add(A.glass, mat.glass, { receive: false });
  if (glassMesh) glassMesh.renderOrder = 2;
  {
    const m = new THREE.Mesh(mergeGeometries(rails.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; })), mat.steel);
    group.add(m);
  }

  // aisle step lights and soffit downlights (instanced)
  const inst = (geo, m, list, orient) => {
    const im = new THREE.InstancedMesh(geo, m, list.length);
    const q = new THREE.Quaternion();
    const M4 = new THREE.Matrix4();
    list.forEach((p, i) => {
      q.setFromAxisAngle(V3(0, 1, 0), orient ? p[3] : 0);
      M4.compose(V3(p[0], p[1], p[2]), q, V3(1, 1, 1));
      im.setMatrixAt(i, M4);
    });
    im.computeBoundingSphere();
    group.add(im);
    return im;
  };
  inst(new THREE.BoxGeometry(0.7, 0.018, 0.03), mat.step, steps, true);
  inst(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 12), mat.down, downs, false);

  // --------------------------------------------------- moving lights + beams
  const fix = buildFixtures(group, fixtures, lite);

  // ----------------------------------------------------------- the lifts
  const lifts = buildLifts(group, mat);

  // --------------------------------------------- section numbers, EXIT signs
  buildSigns(group);

  // ---------------------------------------------------------------- seats
  const seats = sphereSeatList();
  const seatData = buildSeatMeshes(seats, lite);
  group.add(seatData.group);

  // --------------------------------------------------------------- lights
  const lights = {};
  // the screen is the room's main light: a hemisphere whose sky takes its colour
  lights.hemi = new THREE.HemisphereLight('#9fb4d8', '#07080a', 0.6);
  group.add(lights.hemi);
  const domeLight = new THREE.DirectionalLight('#ffffff', 0.4);
  domeLight.position.set(0, 60, 40);
  domeLight.target.position.set(0, 0, 10);
  group.add(domeLight, domeLight.target);
  const key = new THREE.SpotLight('#fff3e2', 1100, 0, 0.36, 0.6, 2);
  key.position.set(0, 21, 12);
  key.target.position.set(0, STAGE_Y, -5.4);
  key.castShadow = quality !== 'low';
  key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  key.shadow.camera.near = 8;
  key.shadow.camera.far = 44;
  key.shadow.bias = -0.0001;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 4;
  group.add(key, key.target);
  lights.key = key;
  if (lite) key.intensity *= 1.35;
  const fills = [];
  for (const sx of lite ? [] : [-1, 1]) {
    const f = new THREE.SpotLight('#e8f0ff', 260, 0, 0.42, 0.75, 2);
    f.position.set(sx * 16, 15, 6);
    f.target.position.set(sx * 2.5, STAGE_Y, -5.5);
    group.add(f, f.target);
    fills.push(f);
  }
  lights.fills = fills;
  if (!lite) {
    const rim = new THREE.SpotLight('#cfe0ff', 260, 0, 0.62, 0.8, 2);
    rim.position.set(0, 17, -16);
    rim.target.position.set(0, STAGE_Y, -3);
    group.add(rim, rim.target);
    lights.rim = rim;
  }
  lights.house = [];

  // -------------------------------------------------------------- the show
  // what the main loop tells us each frame
  const live = { time: 0, level: 0, playing: false, beat: 0, down: 0, lively: false, phase: 'lobby' };
  let houseLevel = 1;
  let houseTarget = 1;
  let prevLevel = 0;
  const glowCol = new THREE.Color();
  const ledBase = new THREE.Color('#8fd0ff');
  update.push((dt, t) => {
    houseLevel += (houseTarget - houseLevel) * Math.min(1, dt * 0.8);
    // a crude onset: the level jumping above its recent average
    const lv = live.level;
    const onset = Math.max(0, lv - prevLevel * 1.15);
    prevLevel += (lv - prevLevel) * Math.min(1, dt * 3);
    live.down = Math.max(live.down * Math.exp(-dt * 3), Math.min(1, onset * 30));
    live.beat = live.down;
    const g = dome.update(dt, { time: live.time, level: lv, beat: live.beat, down: live.down, playing: live.playing });
    glowCol.copy(g.color);
    lights.hemi.color.copy(glowCol).lerp(new THREE.Color('#ffffff'), 0.25);
    lights.hemi.intensity = 0.25 + g.intensity * 1.6 + 0.25 * houseLevel;
    domeLight.color.copy(glowCol);
    domeLight.intensity = 0.15 + g.intensity * 1.1;
    // the LED ribbons follow the screen
    mat.led.emissive.copy(ledBase).lerp(glowCol, 0.75);
    mat.led.emissiveIntensity = 0.6 + 1.6 * g.intensity + 0.6 * live.down;
    mat.step.emissiveIntensity = 0.5 + 0.9 * houseLevel;
    mat.down.emissiveIntensity = 0.15 + 1.6 * houseLevel;
    mat.tunnelLight.emissiveIntensity = 0.9 + 0.6 * houseLevel;
    fix.update(dt, t, { level: lv, down: live.down, on: live.playing && live.lively, color: glowCol, house: houseLevel });
    lifts.update(dt);
    for (const d of doorLeaves) {
      d.open += ((d.door.want ? 1 : 0) - d.open) * Math.min(1, dt * 3.2);
      d.pivot.rotation.y = d.base + d.dir * d.open * 1.75;
    }
  });

  return {
    group,
    seats,
    seatMesh: seatData.pick,
    lights,
    dome,
    lifts,
    venue: 'sphere',
    setHouseLights(v) { houseTarget = v; },
    // the concert's moments, for the screen
    show(phase, { piece = null, time = 0 } = {}) {
      live.phase = phase;
      live.lively = piece?.mood === 'lively' || piece?.mood === 'grand';
      if (phase === 'playing' && piece) dome.startPiece(piece, time);
      else if (phase === 'finale') dome.finale();
      else if (phase === 'house') dome.house();
    },
    feed({ time = 0, level = 0, playing = false } = {}) { live.time = time; live.level = level; live.playing = playing; },
    update(dt, t) { for (const f of update) f(dt, t); },
  };
}

// --------------------------------------------------------------------------
// Moving heads on the balcony fronts: black yokes with a lens that glows
// in the screen's colour; beams sweep the stage in lively pieces.
function buildFixtures(group, list, lite) {
  const body = mergeGeometries([
    new THREE.BoxGeometry(0.34, 0.08, 0.2).translate(0, -0.04, 0),
    new THREE.BoxGeometry(0.04, 0.3, 0.12).translate(-0.17, -0.2, 0),
    new THREE.BoxGeometry(0.04, 0.3, 0.12).translate(0.17, -0.2, 0),
    new THREE.CylinderGeometry(0.13, 0.13, 0.3, 14).rotateX(Math.PI / 2).translate(0, -0.3, 0),
  ].map((g) => g.toNonIndexed()));
  const yoke = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.5, metalness: 0.4 }), list.length);
  const lensMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const lens = new THREE.InstancedMesh(new THREE.CircleGeometry(0.1, 16).rotateY(Math.PI), lensMat, list.length);
  // beams: a long open cone, brightest at the lens, fading along and at the edges
  const beamGeo = new THREE.CylinderGeometry(0.06, 1.6, 30, 20, 1, true).translate(0, -15, 0).rotateX(Math.PI / 2);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uI: { value: 0 } },
    vertexShader: `varying float vAlong; varying vec3 vN; varying vec3 vV;
      void main(){ vAlong = clamp(-position.z / 30.0, 0.0, 1.0);
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; varying float vAlong; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float a = edge * pow(1.0 - vAlong, 1.7) * uI * 0.22;
        gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beamIdx = list.map((_, i) => i).filter((i) => i % (lite ? 4 : 2) === 0);
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, beamIdx.length);
  beams.frustumCulled = false;
  beams.renderOrder = 3;
  const M4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = V3(1, 1, 1);
  const aim = (i, pan, tilt, pos) => {
    // pan about the vertical, tilt down toward the stage; local -z is the beam
    e.set(-tilt, pan, 0, 'YXZ');
    q.setFromEuler(e);
    M4.compose(pos, q, one);
  };
  const base = list.map((p) => ({ pos: V3(p[0], p[1], p[2]), pan: p[3], seed: Math.random() * 10 }));
  base.forEach((b, i) => {
    q.setFromAxisAngle(V3(0, 1, 0), b.pan);
    M4.compose(b.pos, q, one);
    yoke.setMatrixAt(i, M4);
    // the lens looks toward the stage, a little down
    aim(i, b.pan, 0.35, b.pos.clone().add(V3(-Math.sin(b.pan) * 0.16, -0.3, -Math.cos(b.pan) * 0.16)));
    lens.setMatrixAt(i, M4);
  });
  yoke.computeBoundingSphere();
  lens.computeBoundingSphere();
  group.add(yoke, lens, beams);
  let on = 0;
  return {
    update(dt, t, { level, down, on: want, color, house }) {
      on += ((want ? 1 : 0) - on) * Math.min(1, dt * 1.2);
      lensMat.color.copy(color).multiplyScalar(0.35 + 1.4 * on + 0.6 * down * on + 0.25 * (1 - house));
      beamMat.uniforms.uColor.value.copy(color).lerp(new THREE.Color('#ffffff'), 0.35);
      beamMat.uniforms.uI.value = on * (0.55 + 1.2 * level * 4 + 0.8 * down);
      beams.visible = on > 0.01;
      if (!beams.visible) return;
      beamIdx.forEach((bi, k) => {
        const b = base[bi];
        // toward the stage, sweeping in a slow figure eight
        const dx = -b.pos.x;
        const dz = -5 - b.pos.z;
        const pan = Math.atan2(-dx, -dz) + 0.35 * Math.sin(t * 0.45 + b.seed) * on;
        const dist = Math.hypot(dx, dz);
        const tilt = Math.atan2(b.pos.y - STAGE_Y - 2, dist) + 0.12 * Math.sin(t * 0.7 + b.seed * 1.7);
        aim(k, pan, tilt, b.pos.clone().add(V3(0, -0.3, 0)));
        beams.setMatrixAt(k, M4);
      });
      beams.instanceMatrix.needsUpdate = true;
    },
  };
}

// --------------------------------------------------------------------------
// The lifts: one car behind each vomitory. Doors slide, the panel shows the
// levels; a ride closes the doors, hums, and opens on the chosen level.
function buildLifts(group, mat) {
  const panelTex = canvasTex(1024, 256, (g, w, h) => {
    for (let k = 0; k < 4; k++) {
      const x0 = k * 256;
      g.fillStyle = '#0d0e11';
      g.fillRect(x0, 0, 256, 256);
      g.strokeStyle = '#5c6068';
      g.lineWidth = 6;
      g.strokeRect(x0 + 8, 8, 240, 240);
      for (let n = 4; n >= 1; n--) {
        const y = 30 + (4 - n) * 54;
        const cur = n === k + 1;
        g.beginPath();
        g.arc(x0 + 70, y + 20, 20, 0, Math.PI * 2);
        g.fillStyle = cur ? '#ffd27a' : '#2a2c31';
        g.fill();
        g.strokeStyle = '#9aa0aa';
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = cur ? '#1a1206' : '#cfd3da';
        g.font = `700 22px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(n), x0 + 70, y + 21);
        g.fillStyle = '#cfd3da';
        g.textAlign = 'left';
        g.font = `600 26px ${FONT}`;
        g.fillText(`${n}00 레벨`, x0 + 104, y + 21);
      }
    }
  });
  const panelGeo = new THREE.PlaneGeometry(0.42, 0.42);
  const cars = [];
  const leafMat = new THREE.MeshStandardMaterial({ color: '#a2a7b0', roughness: 0.28, metalness: 0.9 });
  const leafGeo = new THREE.BoxGeometry(VOM.w / 2, VOM.h - 0.35, 0.04).translate(0, (VOM.h - 0.35) / 2, 0);
  for (const V of VOMS) {
    const at = (u, v, y) => V3(F.x + u * Math.sin(V.th) + v * Math.cos(V.th), y, F.z + u * Math.cos(V.th) - v * Math.sin(V.th));
    const leaves = [];
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(leafGeo, leafMat);
      m.rotation.y = V.th;
      group.add(m);
      leaves.push({ m, s });
    }
    // the panel on the car's right-hand wall as you walk in
    const pm = new THREE.MeshBasicMaterial({ map: panelTex.clone(), toneMapped: false });
    pm.map.needsUpdate = true;
    pm.map.repeat.set(0.25, 1);
    pm.map.offset.set(V.tier.n * 0.25 - 0.25, 0);
    const panel = new THREE.Mesh(panelGeo, pm);
    const pp = at(V.r1 + 0.8, VOM.carW / 2 - 0.01, V.y + 1.25);
    panel.position.copy(pp);
    panel.rotation.y = V.th - Math.PI / 2;
    group.add(panel);
    // a level number over the door, on the tunnel side
    cars.push({ V, at, leaves, open: 0, want: 0, hold: 0 });
  }
  const place = (c) => {
    for (const { m, s } of c.leaves) {
      const v = s * (VOM.w / 4 + (VOM.w / 2) * c.open * 0.98);
      m.position.copy(c.at(c.V.r1, v, c.V.y));
    }
  };
  cars.forEach((c) => place(c));
  const ride = { from: null, to: null, stage: 'idle', t: 0, onArrive: null };
  return {
    cars,
    // the car you are standing in, if any
    carAt(x, z, fy) {
      for (const c of cars) {
        if (Math.abs(fy - c.V.y) > 0.6) continue;
        const { u, v } = vomUV(c.V, x, z);
        if (u > c.V.r1 + 0.05 && u < c.V.r2 && Math.abs(v) < VOM.carW / 2) return c;
      }
      return null;
    },
    // the doors open for anyone close (on either side)
    near(x, z, fy) {
      for (const c of cars) {
        if (c === ride.from || c === ride.to) continue;
        if (Math.abs(fy - c.V.y) > 0.8) { c.want = 0; continue; }
        const { u, v } = vomUV(c.V, x, z);
        c.want = Math.abs(u - c.V.r1) < 2.2 && Math.abs(v) < 1.6 ? 1 : 0;
      }
    },
    get busy() { return ride.stage !== 'idle'; },
    // ride from car c to the same side on level n; arrive(c2) moves the rider
    go(c, n, arrive) {
      if (ride.stage !== 'idle') return false;
      const to = cars.find((k) => k.V.tier.n === n && k.V.side === c.V.side);
      if (!to || to === c) return false;
      Object.assign(ride, { from: c, to, stage: 'closing', t: 0, onArrive: arrive });
      c.want = 0;
      to.want = 0;
      return true;
    },
    update(dt) {
      if (ride.stage !== 'idle') {
        ride.t += dt;
        if (ride.stage === 'closing' && ride.from.open < 0.02 && ride.t > 0.9) { ride.stage = 'moving'; ride.t = 0; }
        else if (ride.stage === 'moving' && ride.t > 1.6) {
          ride.onArrive?.(ride.from, ride.to);
          ride.to.open = 0;
          ride.stage = 'opening';
          ride.t = 0;
        } else if (ride.stage === 'opening') {
          ride.to.want = 1;
          if (ride.t > 1.2) { ride.stage = 'idle'; ride.from = null; ride.to = null; }
        }
      }
      LIFT_SHUT.clear();
      for (const c of cars) {
        c.open += (c.want - c.open) * Math.min(1, dt * 3.5);
        if (Math.abs(c.want - c.open) < 0.003) c.open = c.want;
        if (c.open < 0.6) LIFT_SHUT.add(c.V.index);
        place(c);
      }
    },
    get stage() { return ride.stage; },
  };
}

// --------------------------------------------------------------------------
// Section numbers over the cross-aisle, EXIT over each vomitory. All of them
// share one texture atlas and one mesh.
function buildSigns(group) {
  const cols = 8;
  const rows = 5;
  const cw = 128;
  const chh = 64;
  const tex = canvasTex(cols * cw, rows * chh, (g) => {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let t = 0; t < 4; t++) {
      for (let s = 0; s < 7; s++) {
        const x = s * cw;
        const y = t * chh;
        g.fillStyle = '#0a0b0e';
        g.fillRect(x, y, cw, chh);
        g.fillStyle = '#e8ecf2';
        g.font = `700 40px ${FONT}`;
        g.fillText(`${t + 1}0${s + 1}`, x + cw / 2, y + chh / 2 + 2);
      }
    }
    // EXIT (row 4)
    const y = 4 * chh;
    g.fillStyle = '#120404';
    g.fillRect(0, y, cw * 2, chh);
    g.fillStyle = '#ff3b30';
    g.font = `800 42px ${FONT}`;
    g.fillText('EXIT', cw, y + chh / 2 + 2);
  });
  const quads = [];
  const uvs = [];
  const pushSign = (cx, cy, cz, th, w, h, u0, v0, u1, v1) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateY(th + Math.PI);
    g.translate(cx, cy, cz);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    quads.push(g);
    uvs.push(0);
  };
  for (const T of TIERS) {
    for (let s = 0; s < 7; s++) {
      const edges = [-1, ...AISLE_FR, 1];
      const th = ((edges[s] + edges[s + 1]) / 2) * T.spanRad;
      if (Math.abs(th) > T.thMax[T.rows] - 0.05) continue;
      const p = P(T.rBack - 0.03, th, T.aisleY + 2.5);
      const u0 = (s * cw) / (cols * cw);
      const v1 = 1 - ((T.n - 1) * chh) / (rows * chh);
      pushSign(p[0], p[1], p[2], th, 0.9, 0.45, u0, v1 - chh / (rows * chh), u0 + cw / (cols * cw), v1);
    }
  }
  for (const V of VOMS) {
    const p = P(V.r0 - 0.03, V.th, V.y + VOM.h + 0.35);
    pushSign(p[0], p[1], p[2], V.th, 0.7, 0.24, 0, 0, (2 * cw) / (cols * cw), chh / (rows * chh));
  }
  const geo = mergeGeometries(quads);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  group.add(m);
}
