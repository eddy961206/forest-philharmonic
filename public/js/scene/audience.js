// The audience: a well-dressed crowd of forest animals. Every evening (each
// time the audience is switched on) a new crowd arrives - how many, who, and
// where they sit is random, with friends sitting together. All instanced and
// animated on the GPU: breathing, a little swaying, and clapping paws.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clean = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k);
  return n;
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

// --------------------------------------------------------------- the crowd
// seats: hall.seats; exclude: seat indices that must stay free
// rand: a seeded generator gives the same house to everyone in a room;
// reserveAll: a phone draws fewer people but keeps all their seats taken,
// so nobody sits in someone else's lap on another screen
export function buildAudience(seats, { exclude = new Set(), rand = Math.random, lite = false, reserveAll = false } = {}) {
  const key = lite ? 'lite' : 'full';
  if (!GEO[key]) GEO[key] = parts(lite);
  const G = GEO[key];
  const fill = 0.22 + rand() * 0.45; // tonight's house: from a fifth to four fifths full
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
  // a phone gets a smaller crowd, still spread round the house
  if (lite && chosen.length > LITE_MAX) {
    for (let i = chosen.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [chosen[i], chosen[j]] = [chosen[j], chosen[i]]; }
    chosen.length = LITE_MAX;
  }
  const push = (part, m, color, phase) => {
    if (lite && !LITE_PARTS.has(part)) return;
    if (!lists[part]) lists[part] = [];
    lists[part].push({ m, color, phase });
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const Y = V(0, 1, 0);
  for (const s of chosen) {
    const sp = SPECIES[pick(NAMES, rand())];
    const fur = pick(sp.fur, rand());
    const lady = rand() < 0.5;
    const outfit = lady ? pick(GOWNS, rand()) : pick(TUX, rand());
    const sc = 0.8 + rand() * 0.12; // compact enough to see past
    q.setFromAxisAngle(Y, s.yaw + (rand() - 0.5) * 0.25);
    const m = m4.compose(V(s.x, s.y, s.z), q, V(sc, sc, sc)).clone();
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
  }

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

// shared animation state for every crowd
let clap = 0;
export function animateAudience(t, dt, clapping) {
  U.uTime.value = t;
  clap += ((clapping ? 1 : 0) - clap) * Math.min(1, dt * (clapping ? 5 : 2));
  U.uClap.value = clap;
}
