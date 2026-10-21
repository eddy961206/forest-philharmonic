// The audience: a well-dressed crowd of forest animals. Every evening (each
// time the audience is switched on) a new crowd arrives - how many, who, and
// where they sit is random, with friends sitting together. All instanced and
// animated on the GPU: breathing, a little swaying, and clapping paws.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clean = (g) => {
  // Keep the primitive's shared vertices: the per-vertex breathing/clapping
  // shader does not need a separate copy for every triangle corner.
  if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  return g;
};
const merge = (list) => mergeGeometries(list.map(clean));
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

// --------------------------------------------------------------- species
const SPECIES = {
  bear: { ears: 'round', fur: ['#8a5a3b', '#6e4529', '#a87148', '#5e3d29'], muzzle: '#d9b28c' },
  rabbit: { ears: 'long', fur: ['#f1ebe2', '#d9c7b0', '#b9a58f', '#8f7f72'], muzzle: '#fbf6ef', noHat: true },
  cat: { ears: 'pointed', fur: ['#f2a65a', '#6f6a70', '#d8c8b4', '#2f2b2e', '#e9e4dc'], muzzle: '#f6efe6' },
  fox: { ears: 'pointed', fur: ['#e8823a', '#d9662b', '#c9733a'], muzzle: '#fbf1e4' },
  dog: { ears: 'floppy', fur: ['#c28e55', '#e6d3b3', '#7b5a3c', '#d99a55'], muzzle: '#f4e6d0' },
  mouse: { ears: 'big', fur: ['#b9b2ab', '#9a948f', '#d4cbc1'], muzzle: '#f2eee9' },
  deer: { ears: 'side', fur: ['#c48b57', '#b07a4a', '#d4a06c'], muzzle: '#f4e6d4' },
  panda: { ears: 'round', earColor: '#1d1d1f', fur: ['#efece4'], muzzle: '#f4f1ea', patches: true },
  sheep: { ears: 'side', fur: ['#efe8da', '#e2d8c6'], muzzle: '#e8dccb', wool: true },
  koala: { ears: 'big', fur: ['#a3a6ab', '#8d9096'], muzzle: '#d7d9dc' },
  raccoon: { ears: 'pointed', fur: ['#8f8a85', '#7b7672'], muzzle: '#f2efe9', patches: true },
  lion: { ears: 'round', fur: ['#e0a95b', '#d49a4d'], muzzle: '#f7e2bd', mane: ['#b5652a', '#8f4f22'] },
};
const NAMES = Object.keys(SPECIES);
const TUX = ['#15151b', '#1b1f2e', '#22232a', '#2a1d1d', '#1f2620'];
const GOWNS = ['#7a1730', '#1e5040', '#1f3a78', '#c9a14e', '#b05a7a', '#efe6d6', '#4b2a6a', '#0f3b4a', '#a0442a'];
const TIES = ['#e6c07b', '#c62a3a', '#f3efe6', '#2b4a8a', '#d06a92'];

// --------------------------------------------------------- part geometry
// Seat-local frame: origin on the floor under the seat, facing -z.
// lite: about a quarter of the triangles (phones)
function parts(lite = false) {
  const S = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, lite ? Math.max(6, w >> 1) : w, lite ? Math.max(4, h >> 1) : h);
  const P = {};
  P.torso = merge([new THREE.CapsuleGeometry(0.15, 0.13, lite ? 3 : 6, lite ? 8 : 14).scale(1.08, 1, 0.86).translate(0, 0.71, 0.11)]);
  const legs = [];
  for (const sx of [-1, 1]) {
    legs.push(new THREE.CapsuleGeometry(0.068, 0.2, 4, 10).rotateX(Math.PI / 2).translate(sx * 0.085, 0.52, -0.05));
    legs.push(new THREE.CapsuleGeometry(0.06, 0.24, 4, 10).translate(sx * 0.09, 0.28, -0.2));
  }
  P.legs = merge(legs);
  P.shoes = merge([-1, 1].map((sx) => S(0.065, 12, 8).scale(1, 0.6, 1.5).translate(sx * 0.09, 0.04, -0.25)));
  P.shirt = merge([S(0.09, 14, 10).scale(0.8, 1.15, 0.45).translate(0, 0.78, -0.02)]);
  P.tie = merge([-1, 1].map((sx) => new THREE.ConeGeometry(0.03, 0.06, 4).rotateZ((sx * Math.PI) / 2).translate(sx * 0.03, 0.88, -0.05)));
  P.head = merge([S(0.17, 22, 16).scale(1.05, 0.96, 0.98).translate(0, 1.06, 0.05)]);
  P.muzzle = merge([S(0.072, 16, 12).scale(1.2, 0.8, 0.9).translate(0, 1.015, -0.09)]);
  P.nose = merge([S(0.022, 10, 8).scale(1.3, 0.9, 1).translate(0, 1.04, -0.156)]);
  P.eyes = merge([-1, 1].map((sx) => S(0.022, 10, 8).scale(1, 1.2, 0.6).translate(sx * 0.062, 1.09, -0.105)));
  P.shine = merge([-1, 1].map((sx) => S(0.007, 6, 4).translate(sx * 0.062 + 0.006, 1.098, -0.118)));
  P.patches = merge([-1, 1].map((sx) => S(0.04, 12, 8).scale(1, 1.25, 0.5).rotateZ(sx * 0.5).translate(sx * 0.064, 1.085, -0.095)));
  P.round = merge([-1, 1].map((sx) => S(0.055, 12, 8).scale(1, 1, 0.5).translate(sx * 0.115, 1.19, 0.06)));
  P.big = merge([-1, 1].map((sx) => S(0.078, 12, 8).scale(1, 1, 0.4).translate(sx * 0.14, 1.17, 0.06)));
  P.long = merge([-1, 1].map((sx) => new THREE.CapsuleGeometry(0.036, 0.18, lite ? 2 : 4, lite ? 6 : 10).scale(1, 1, 0.5).rotateZ(-sx * 0.14).translate(sx * 0.06, 1.34, 0.07)));
  P.pointed = merge([-1, 1].map((sx) => new THREE.ConeGeometry(0.05, 0.1, 4).rotateY(Math.PI / 4).scale(1, 1, 0.55).rotateZ(-sx * 0.32).translate(sx * 0.095, 1.21, 0.06)));
  P.floppy = merge([-1, 1].map((sx) => S(0.06, 12, 8).scale(0.6, 1.3, 0.5).rotateZ(sx * 0.4).translate(sx * 0.16, 1.04, 0.07)));
  P.side = merge([-1, 1].map((sx) => S(0.06, 12, 8).scale(1.45, 0.5, 0.4).rotateZ(sx * 0.3).translate(sx * 0.18, 1.1, 0.06)));
  P.mane = merge([new THREE.TorusGeometry(0.16, 0.065, lite ? 5 : 10, lite ? 10 : 20).translate(0, 1.06, 0.1)]);
  P.wool = merge([[0, 1.22, 0.05, 0.09], [-0.08, 1.19, 0.07, 0.07], [0.08, 1.19, 0.07, 0.07], [0, 1.2, 0.13, 0.07]].map(([x, y, z, r]) => S(r, 10, 8).translate(x, y, z)));
  P.hat = merge([new THREE.CylinderGeometry(0.085, 0.09, 0.16, lite ? 8 : 18).translate(0, 1.29, 0.05), new THREE.CylinderGeometry(0.14, 0.14, 0.012, lite ? 8 : 22).translate(0, 1.212, 0.05)]);
  P.flower = merge([[0, 0, 0], [0.025, 0.02, 0], [-0.02, 0.025, 0.01], [0.01, -0.02, 0.01]].map(([x, y, z]) => S(0.022, 8, 6).translate(0.1 + x, 1.2 + y, 0.02 + z)));
  // paws with a forearm, resting on the lap (animated toward a clap)
  for (const [k, sx] of [['pawL', -1], ['pawR', 1]]) {
    P[k] = merge([S(0.045, 12, 8).scale(1, 0.85, 1.1).translate(sx * 0.09, 0.6, -0.13)]);
    P[`sleeve${k.slice(-1)}`] = merge([new THREE.CapsuleGeometry(0.042, 0.12, 4, 8).rotateX(-1.2).translate(sx * 0.12, 0.62, -0.04)]);
  }
  return P;
}

// GPU animation: breathing, swaying heads, clapping paws
const U = { uTime: { value: 0 }, uClap: { value: 0 } };
const MOTION = {
  body: 'transformed.y += sin(uTime * 1.3 + aPhase) * 0.004 + uClap * abs(sin(uTime * 12.0 + aPhase)) * 0.008;',
  head: `transformed.x += sin(uTime * 0.55 + aPhase) * 0.009;
         transformed.y += sin(uTime * 1.3 + aPhase) * 0.004 + uClap * abs(sin(uTime * 12.0 + aPhase)) * 0.012;`,
  pawL: `float o = 0.5 + 0.5 * sin(uTime * 24.0 + aPhase * 7.0);
         transformed += uClap * (vec3(0.055, 0.2, -0.08) + vec3(-o * 0.04, 0.0, 0.0));
         transformed.y += sin(uTime * 1.3 + aPhase) * 0.004;`,
  pawR: `float o = 0.5 + 0.5 * sin(uTime * 24.0 + aPhase * 7.0);
         transformed += uClap * (vec3(-0.055, 0.2, -0.08) + vec3(o * 0.04, 0.0, 0.0));
         transformed.y += sin(uTime * 1.3 + aPhase) * 0.004;`,
};

function animated(mat, kind) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uClap = U.uClap;
    shader.vertexShader = `attribute float aPhase;\nuniform float uTime;\nuniform float uClap;\n${shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${MOTION[kind]}`)}`;
  };
  mat.customProgramCacheKey = () => `aud-${kind}`;
  return mat;
}

const KIND = { pawL: 'pawL', sleeveL: 'pawL', pawR: 'pawR', sleeveR: 'pawR', torso: 'body', legs: 'body', shoes: 'body', shirt: 'body', tie: 'body' };

const GEO = {};
// on phones only what reads at a distance: body, head, face, ears, paws
const LITE_PARTS = new Set(['torso', 'head', 'muzzle', 'nose', 'eyes', 'round', 'big', 'long', 'pointed', 'floppy', 'side', 'mane', 'hat', 'tie', 'pawL', 'pawR']);
const LITE_MAX = 200;


// one guest: species, outfit, scale and the parts they are drawn with
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _Y = V(0, 1, 0);
function dress(s, rand, push) {
  const sp = SPECIES[pick(NAMES, rand())];
  const fur = pick(sp.fur, rand());
  const lady = rand() < 0.5;
  const outfit = lady ? pick(GOWNS, rand()) : pick(TUX, rand());
  const sc = 0.8 + rand() * 0.12; // compact enough to see past
  _q.setFromAxisAngle(_Y, s.yaw + (rand() - 0.5) * 0.25);
  const m = _m4.compose(V(s.x, s.y, s.z), _q, V(sc, sc, sc)).clone();
  const phase = rand() * 100;
  push('torso', m, outfit, phase);
  push('legs', m, outfit, phase);
  push('shoes', m, '#151112', phase);
  push('sleeveL', m, outfit, phase);
  push('sleeveR', m, outfit, phase);
  push('pawL', m, fur, phase);
  push('pawR', m, fur, phase);
  if (!lady) { push('shirt', m, '#f3efe6', phase); push('tie', m, pick(TIES, rand()), phase); }
  push('head', m, fur, phase);
  push('muzzle', m, sp.muzzle, phase);
  push('nose', m, '#2a1a14', phase);
  push('eyes', m, '#120c0a', phase);
  push('shine', m, '#ffffff', phase);
  if (sp.patches) push('patches', m, sp.earColor || '#3b3634', phase);
  push(sp.ears, m, sp.earColor || fur, phase);
  if (sp.mane) push('mane', m, pick(sp.mane, rand()), phase);
  if (sp.wool) push('wool', m, fur, phase);
  const r = rand();
  if (!lady && !sp.noHat && r < 0.1) push('hat', m, '#141216', phase);
  if (lady && r < 0.16) push('flower', m, pick(['#e8506a', '#f3e2a0', '#ffffff', '#c77dd8'], rand()), phase);
  return { m, fur, outfit, phase };
}

// --------------------------------------------------------------- the crowd
// seats: hall.seats; exclude: seat indices that must stay free
// rand: a seeded generator gives the same house to everyone in a room;
// reserveAll: a phone draws fewer people but keeps all their seats taken,
// so nobody sits in someone else's lap on another screen
// Very large houses (the Sphere) pass detail: only that many people nearest
// the camera are drawn in full; everyone else is a simple seated figure in
// their own colours, swapped as you move (see updateLOD).
export function buildAudience(seats, { exclude = new Set(), rand = Math.random, lite = false, reserveAll = false, fill: fillIn = null, detail = Infinity, mid = 0, cap = Infinity } = {}) {
  const key = lite ? 'lite' : 'full';
  if (!GEO[key]) GEO[key] = parts(lite);
  const G = GEO[key];
  const fill = fillIn ?? 0.22 + rand() * 0.45; // tonight's house: from a fifth to four fifths full
  const chosen = [];
  let prev = false;
  let prevRow = '';
  for (const s of seats) {
    const rowKey = `${s.level}${s.row}${s.box || ''}${s.side || ''}`;
    if (rowKey !== prevRow) prev = false;
    prevRow = rowKey;
    // good seats sell first; friends and couples sit together
    let w = 1;
    if (s.level === '1층') w = 1.15 - Math.min(0.45, Math.abs(s.x) / 30) - Math.abs(s.z - 12) / 60;
    if (s.type === 'premium' || s.type === 'armchair') w = 1.3;
    if (s.level === '4층') w = 0.75;
    const p = Math.min(0.95, fill * w * (prev ? 1.3 : 0.85));
    prev = rand() < p;
    // (the draw is made even for a kept-free seat, so the house is the same)
    if (prev && exclude.has(s.index)) prev = false;
    if (prev) chosen.push(s);
  }
  const taken = new Set(chosen.map((s) => s.index));

  const lists = {};
  const lod = Number.isFinite(detail);
  // a phone gets a smaller crowd, still spread round the house
  const max = lod ? cap : lite ? LITE_MAX : Infinity;
  if (chosen.length > max) {
    for (let i = chosen.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [chosen[i], chosen[j]] = [chosen[j], chosen[i]]; }
    chosen.length = max;
  }
  if (lod) return lodCrowd(chosen, { G, lite, rand, taken, reserveAll, detail, mid });
  const push = (part, m, color, phase) => {
    if (lite && !LITE_PARTS.has(part)) return;
    if (!lists[part]) lists[part] = [];
    lists[part].push({ m, color, phase });
  };
  for (const s of chosen) dress(s, rand, push);

  const group = new THREE.Group();
  group.name = 'audience';
  const meshes = [];
  const c = new THREE.Color();
  for (const [part, list] of Object.entries(lists)) {
    const geo = G[part].clone();
    const phases = new Float32Array(list.length);
    list.forEach((it, i) => { phases[i] = it.phase; });
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    const glossy = part === 'eyes' || part === 'nose' || part === 'hat' || part === 'shoes';
    const kind = KIND[part] || 'head';
    const mat = part === 'shine'
      ? animated(new THREE.MeshBasicMaterial({ color: '#ffffff' }), kind)
      : animated(new THREE.MeshStandardMaterial({ roughness: glossy ? 0.25 : 0.8 }), kind);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      im.setMatrixAt(i, it.m);
      im.setColorAt(i, c.set(it.color));
    });
    im.frustumCulled = false;
    im.receiveShadow = true;
    group.add(im);
    meshes.push(im);
  }
  return {
    group,
    occupied: reserveAll ? taken : new Set(chosen.map((s) => s.index)),
    count: chosen.length,
    dispose() {
      for (const im of meshes) { im.geometry.dispose(); im.material.dispose(); im.dispose?.(); }
      group.removeFromParent();
    },
  };
}


// ------------------------------------------------------------ a huge house
// Three levels of detail, by distance from the camera:
//   near  - the `detail` nearest guests, every part (as in a small house)
//   mid   - the next `mid` guests, the simplified (phone) parts
//   far   - everyone else: one merged seated figure (body in their outfit,
//           head and ears in their fur), ~90 triangles, grouped per
//           section so whole sections off screen are skipped by the GPU
let BLOB = null;
function blobGeo() {
  if (BLOB) return BLOB;
  const tone = (g, v) => {
    g = clean(g);
    g.setAttribute('aTone', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
    return g;
  };
  // a smooth low-poly ball: icosahedron with shared normals
  const ball = (r, detail) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    const m = mergeVerticesSimple(g);
    m.computeVertexNormals();
    return m;
  };
  const ear = (x) => {
    const g = new THREE.OctahedronGeometry(0.065, 0);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    const m = mergeVerticesSimple(g);
    m.computeVertexNormals();
    return m.translate(x, 1.2, 0.06);
  };
  const parts2 = [
    tone(new THREE.CylinderGeometry(0.14, 0.165, 0.46, 6, 1, true).scale(1.1, 1, 0.85).translate(0, 0.7, 0.1), 0), // (the head and lap close it)
    tone(new THREE.BoxGeometry(0.3, 0.13, 0.36).translate(0, 0.5, -0.08), 0),
    tone(new THREE.BoxGeometry(0.26, 0.4, 0.12).translate(0, 0.24, -0.24), 0),
    tone(ball(0.17, 0).scale(1.05, 0.96, 0.98).translate(0, 1.06, 0.05), 1),
    tone(ear(-0.11), 1),
    tone(ear(0.11), 1),
  ];
  BLOB = mergeGeometries(parts2);
  return BLOB;
}
// weld coincident vertices (icosahedra come unindexed) so normals are smooth
function mergeVerticesSimple(g) {
  const pos = g.attributes.position;
  const map = new Map();
  const verts = [];
  const index = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let j = map.get(k);
    if (j === undefined) { j = verts.length / 3; map.set(k, j); verts.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    index.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(index);
  return out;
}

// the far figure: two colours (outfit = instance colour, fur = aFur) and
// the same breathing / clapping bob as everyone else
function blobMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uClap = U.uClap;
    shader.vertexShader = `attribute float aPhase;\nattribute float aTone;\nattribute vec3 aFur;\nuniform float uTime;\nuniform float uClap;\n${shader.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += sin(uTime * 1.3 + aPhase) * 0.004 + uClap * abs(sin(uTime * 12.0 + aPhase)) * (0.008 + 0.004 * aTone);
        transformed.x += aTone * sin(uTime * 0.55 + aPhase) * 0.009;`)
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb = mix(vColor.rgb, aFur, aTone);')}`;
  };
  mat.customProgramCacheKey = () => 'aud-blob';
  return mat;
}

// k-th smallest of a (partially reorders a copy); O(n) on average
function kth(src, k) {
  const a = Float32Array.from(src);
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const p = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < p) i++;
      while (a[j] > p) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else break;
  }
  return a[k];
}

function lodCrowd(chosen, { G, lite, rand, taken, reserveAll, detail, mid }) {
  if (lite) mid = 0; // phones: near guests and far figures only
  const GL = GEO.lite || (GEO.lite = parts(true));
  const people = [];
  // each guest's parts (the same draws, in the same order, as a small house)
  for (const s of chosen) {
    const ps = [];
    const info = dress(s, rand, (part, m, color) => { if (lite && !LITE_PARTS.has(part)) return; ps.push([part, new THREE.Color(color)]); });
    people.push({ s, m: info.m, fur: new THREE.Color(info.fur), outfit: new THREE.Color(info.outfit), phase: info.phase, parts: ps, tier: -1, chunk: null, slot: 0 });
  }
  const group = new THREE.Group();
  group.name = 'audience';
  const meshes = [];
  const mk = (geo0, part, n, kind) => {
    const geo = geo0.clone();
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n)), 1));
    const glossy = part === 'eyes' || part === 'nose' || part === 'hat' || part === 'shoes';
    const mat = part === 'shine'
      ? animated(new THREE.MeshBasicMaterial({ color: '#ffffff' }), kind)
      : animated(new THREE.MeshStandardMaterial({ roughness: glossy ? 0.25 : 0.8 }), kind);
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    im.count = 0;
    im.frustumCulled = false; // they surround the camera
    im.receiveShadow = !lite;
    im.setColorAt(0, new THREE.Color());
    group.add(im);
    meshes.push(im);
    return im;
  };
  const nFor = {};
  const nLite = {};
  for (const p of people) {
    for (const [part] of p.parts) {
      nFor[part] = (nFor[part] || 0) + 1;
      if (LITE_PARTS.has(part)) nLite[part] = (nLite[part] || 0) + 1;
    }
  }
  const near = {};
  const midM = {};
  for (const part of Object.keys(nFor)) near[part] = mk(G[part], part, Math.min(nFor[part], detail), KIND[part] || 'head');
  if (mid > 0) for (const part of Object.keys(nLite)) midM[part] = mk(GL[part], part, Math.min(nLite[part], mid), KIND[part] || 'head');

  // far figures, one instanced mesh per section (culled as a whole)
  const blob = blobGeo();
  const blobMat = blobMaterial();
  const chunks = new Map();
  for (const p of people) {
    const key = p.s.section || p.s.level || 'all';
    if (!chunks.has(key)) chunks.set(key, []);
    p.slot = chunks.get(key).length;
    chunks.get(key).push(p);
  }
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const chunkList = [];
  for (const list of chunks.values()) {
    const n = list.length;
    const geo = blob.clone();
    const ph = new Float32Array(n);
    const fur = new Float32Array(n * 3);
    list.forEach((p, i) => { ph[i] = p.phase; fur[i * 3] = p.fur.r; fur[i * 3 + 1] = p.fur.g; fur[i * 3 + 2] = p.fur.b; });
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
    geo.setAttribute('aFur', new THREE.InstancedBufferAttribute(fur, 3));
    const im = new THREE.InstancedMesh(geo, blobMat, n);
    list.forEach((p, i) => { im.setMatrixAt(i, p.m); im.setColorAt(i, p.outfit); p.chunk = im; });
    im.computeBoundingSphere();
    // a little slack for the bobbing
    im.boundingSphere.radius += 0.5;
    im.receiveShadow = !lite;
    group.add(im);
    meshes.push(im);
    chunkList.push(im);
  }

  const put = (im, i, m, col, phase) => {
    im.setMatrixAt(i, m);
    im.setColorAt(i, col);
    im.geometry.attributes.aPhase.array[i] = phase;
  };
  const flush = (im, n) => {
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.geometry.attributes.aPhase.needsUpdate = true;
  };
  const dist = new Float32Array(people.length);
  const last = new THREE.Vector3(1e9, 0, 0);
  let lastT = -1e9;
  // who is near, mid, far - redone when the camera has moved a little
  // (at most five times a second; only the changes touch the far chunks)
  function updateLOD(cam, force = false) {
    const now = performance.now();
    if (!force && (cam.distanceToSquared(last) < 2.25 || now - lastT < 200)) return;
    last.copy(cam);
    lastT = now;
    for (let i = 0; i < people.length; i++) {
      const s = people[i].s;
      const dx = s.x - cam.x;
      const dy = s.y - cam.y;
      const dz = s.z - cam.z;
      dist[i] = dx * dx + dy * dy + dz * dz;
    }
    const nNear = Math.min(detail, people.length);
    const nMid = Math.min(mid, people.length - nNear);
    const limNear = nNear > 0 ? (nNear >= people.length ? Infinity : kth(dist, nNear - 1)) : -1;
    const limMid = nMid > 0 ? (nNear + nMid >= people.length ? Infinity : kth(dist, nNear + nMid - 1)) : limNear;
    const cnt = {};
    const cntMid = {};
    let kn = 0;
    let km = 0;
    const dirty = new Set();
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      let tier = 2;
      if (dist[i] <= limNear && kn < nNear) { tier = 0; kn++; } else if (dist[i] <= limMid && km < nMid) { tier = 1; km++; }
      if (tier === 0) {
        for (const [part, col] of p.parts) { const im = near[part]; const j = cnt[part] || 0; if (j >= im.instanceMatrix.count) continue; put(im, j, p.m, col, p.phase); cnt[part] = j + 1; }
      } else if (tier === 1) {
        for (const [part, col] of p.parts) { const im = midM[part]; if (!im) continue; const j = cntMid[part] || 0; if (j >= im.instanceMatrix.count) continue; put(im, j, p.m, col, p.phase); cntMid[part] = j + 1; }
      }
      // the far figure stands in whenever the person is not drawn in detail
      if ((tier === 2) !== (p.tier === 2) || p.tier === -1) {
        p.chunk.setMatrixAt(p.slot, tier === 2 ? p.m : ZERO);
        dirty.add(p.chunk);
      }
      p.tier = tier;
    }
    for (const [part, im] of Object.entries(near)) flush(im, cnt[part] || 0);
    for (const [part, im] of Object.entries(midM)) flush(im, cntMid[part] || 0);
    for (const im of dirty) im.instanceMatrix.needsUpdate = true;
  }
  return {
    group,
    occupied: reserveAll ? taken : new Set(chosen.map((s) => s.index)),
    count: chosen.length,
    updateLOD,
    dispose() {
      for (const im of meshes) { im.geometry.dispose(); if (im.material !== blobMat) im.material.dispose(); im.dispose?.(); }
      blobMat.dispose();
      group.removeFromParent();
    },
  };
}

// shared animation state for every crowd
let clap = 0;
export function animateAudience(t, dt, clapping) {
  U.uTime.value = t;
  clap += ((clapping ? 1 : 0) - clap) * Math.min(1, dt * (clapping ? 5 : 2));
  U.uClap.value = clap;
}
