// Procedurally modelled instruments. Each builder returns { group, ...anchors }
// where anchors are positions in the instrument's local space that the
// character rigs grab (bridge contact point, neck positions, keys, ...).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, plainMaterial } from './materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mesh(geo, mat, { cast = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------- violin family
// Outline of a violin-family body (half widths in units of body length b)
function bodyShape(b, kind) {
  const s = new THREE.Shape();
  const bass = kind === 'bass';
  const lower = 0.3 * b;
  const waist = 0.17 * b;
  const upper = (bass ? 0.21 : 0.245) * b;
  s.moveTo(0, 0);
  s.bezierCurveTo(0.2 * b, 0, lower, 0.06 * b, lower, 0.2 * b);
  s.bezierCurveTo(lower, 0.31 * b, 0.25 * b, 0.36 * b, 0.22 * b, 0.38 * b); // lower corner
  s.bezierCurveTo(waist, 0.42 * b, waist, 0.56 * b, 0.21 * b, 0.6 * b); // C-bout
  s.bezierCurveTo(upper + 0.01 * b, 0.62 * b, upper, bass ? 0.7 * b : 0.68 * b, upper, 0.78 * b);
  s.bezierCurveTo(upper, 0.92 * b, 0.12 * b, b, 0, b);
  s.bezierCurveTo(-0.12 * b, b, -upper, 0.92 * b, -upper, 0.78 * b);
  s.bezierCurveTo(-upper, bass ? 0.7 * b : 0.68 * b, -upper - 0.01 * b, 0.62 * b, -0.21 * b, 0.6 * b);
  s.bezierCurveTo(-waist, 0.56 * b, -waist, 0.42 * b, -0.22 * b, 0.38 * b);
  s.bezierCurveTo(-0.25 * b, 0.36 * b, -lower, 0.31 * b, -lower, 0.2 * b);
  s.bezierCurveTo(-lower, 0.06 * b, -0.2 * b, 0, 0, 0);
  return s;
}

const SIZES = {
  // b: body length (m, chibi scale), depth ratio, neck ratio
  violin: { b: 0.27, depth: 0.13, neck: 0.42, varnish: '#9a4316' },
  viola: { b: 0.31, depth: 0.14, neck: 0.4, varnish: '#7d3412' },
  cello: { b: 0.52, depth: 0.2, neck: 0.42, varnish: '#8a3a14' },
  bass: { b: 0.78, depth: 0.22, neck: 0.44, varnish: '#6a2c10' },
};

// Instrument local space: +Y toward the scroll, +Z out of the top plate,
// origin at the bridge foot on the centre line.
export function violinFamily(kind = 'violin') {
  const S = SIZES[kind];
  const b = S.b;
  const group = new THREE.Group();
  const bridgeY = 0.42 * b;
  const depth = S.depth * b;
  const bevel = 0.018 * b;

  const shape = bodyShape(b, kind);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel * 1.6, bevelSize: bevel, bevelSegments: 4, curveSegments: 20 });
  geo.translate(0, -bridgeY, -depth / 2);
  // dome the plates (arching) - push z outward toward the centre
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i) + bridgeY;
    const z = p.getZ(i);
    const nx = x / (0.3 * b);
    const ny = (y - 0.5 * b) / (0.5 * b);
    const arch = Math.max(0, 1 - nx * nx - ny * ny * 0.35) * 0.05 * b;
    if (z > 0) p.setZ(i, z + arch);
    else p.setZ(i, z - arch * 0.7);
  }
  geo.computeVertexNormals();
  const body = mesh(geo, M.varnish(S.varnish));
  group.add(body);
  const topZ = depth / 2 + bevel * 1.6 + 0.05 * b;

  // f-holes (dark slots)
  const fMat = plainMaterial('#140a05', { roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const fh = new THREE.Mesh(new THREE.CapsuleGeometry(0.008 * b, 0.16 * b, 4, 8), fMat);
    fh.position.set(sx * 0.11 * b, 0, topZ - 0.01 * b);
    fh.rotation.z = sx * 0.12;
    fh.scale.set(1, 1, 0.4);
    group.add(fh);
  }
  // neck, pegbox and scroll
  const neckLen = S.neck * b * 1.55;
  const topY = b - bridgeY;
  const neck = mesh(new THREE.BoxGeometry(0.06 * b, neckLen, 0.07 * b), M.varnish(S.varnish));
  neck.position.set(0, topY + neckLen / 2, topZ - 0.06 * b);
  group.add(neck);
  const peg = mesh(new THREE.BoxGeometry(0.07 * b, 0.16 * b, 0.08 * b), M.varnish(S.varnish));
  peg.position.set(0, topY + neckLen + 0.08 * b, topZ - 0.09 * b);
  peg.rotation.x = -0.3;
  group.add(peg);
  const scroll = mesh(new THREE.TorusGeometry(0.035 * b, 0.022 * b, 8, 16), M.varnish(S.varnish));
  scroll.position.set(0, topY + neckLen + 0.18 * b, topZ - 0.13 * b);
  scroll.rotation.y = Math.PI / 2;
  group.add(scroll);
  for (let i = 0; i < 4; i++) {
    const pg = mesh(new THREE.CylinderGeometry(0.006 * b, 0.008 * b, 0.14 * b, 6), M.ebony(), { cast: false });
    pg.rotation.z = Math.PI / 2;
    pg.position.set(0, topY + neckLen + 0.03 * b + i * 0.035 * b, topZ - 0.09 * b);
    group.add(pg);
  }
  // fingerboard (ebony)
  const fbLen = neckLen + 0.28 * b;
  const fb = mesh(new THREE.BoxGeometry(0.075 * b, fbLen, 0.022 * b), M.ebony());
  fb.position.set(0, topY + neckLen - fbLen / 2, topZ + 0.015 * b);
  group.add(fb);
  // tailpiece + chinrest/endpin
  const tail = mesh(new THREE.BoxGeometry(0.09 * b, 0.26 * b, 0.02 * b), M.ebony());
  tail.position.set(0, -0.26 * b, topZ + 0.01 * b);
  group.add(tail);
  // bridge
  const bridge = mesh(new THREE.BoxGeometry(0.14 * b, 0.012 * b, 0.075 * b), plainMaterial('#e6c9a0', { roughness: 0.6 }));
  bridge.position.set(0, 0, topZ + 0.035 * b);
  group.add(bridge);
  // strings
  const nutY = topY + neckLen;
  const strings = [];
  const sGeo = new THREE.CylinderGeometry(0.0016, 0.0016, nutY + 0.38 * b, 4);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(sGeo, M.string());
    s.position.set((i - 1.5) * 0.016 * b * (kind === 'violin' ? 1.4 : 1.1), (nutY - 0.38 * b) / 2, topZ + 0.07 * b);
    group.add(s);
    strings.push(s);
  }
  if (kind === 'cello' || kind === 'bass') {
    const pin = mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.42 * b, 6), M.silver());
    pin.position.set(0, -bridgeY - 0.2 * b, 0);
    group.add(pin);
  } else {
    const chin = mesh(new THREE.CylinderGeometry(0.06 * b, 0.07 * b, 0.04 * b, 16), M.ebony());
    chin.rotation.x = Math.PI / 2;
    chin.position.set(-0.11 * b, -0.36 * b, topZ + 0.02 * b);
    group.add(chin);
  }

  const contact = V(0, 0.05 * b, topZ + 0.07 * b); // where the bow meets the strings
  const nut = V(0, nutY - 0.02 * b, topZ + 0.05 * b);
  const neckEnd = V(0, topY + 0.08 * b, topZ + 0.06 * b);
  return {
    group, kind, b, strings, contact,
    neckAt: (n) => new THREE.Vector3().lerpVectors(nut, neckEnd, n),
    chin: V(-0.12 * b, -0.36 * b, topZ + 0.04 * b),
    endpin: V(0, -bridgeY - 0.41 * b, 0),
  };
}

// Bow: frog at origin, stick along +X, hair hanging -Y
export function bow(length = 0.5) {
  const group = new THREE.Group();
  const stick = mesh(new THREE.CylinderGeometry(0.0035, 0.0055, length, 6), plainMaterial('#5a2a14', { roughness: 0.4 }));
  stick.rotation.z = -Math.PI / 2;
  stick.position.set(length / 2, 0.012, 0);
  const hair = mesh(new THREE.BoxGeometry(length * 0.96, 0.002, 0.007), M.bowHair(), { cast: false });
  hair.position.set(length * 0.5, 0, 0);
  const frog = mesh(new THREE.BoxGeometry(0.03, 0.018, 0.01), M.ebony());
  frog.position.set(0.012, 0.006, 0);
  const tip = mesh(new THREE.BoxGeometry(0.012, 0.016, 0.008), M.ivory());
  tip.position.set(length - 0.006, 0.008, 0);
  group.add(stick, hair, frog, tip);
  return { group, length };
}

// ------------------------------------------------------------------ winds
// Flute: embouchure hole at origin, tube along +X
export function flute() {
  const group = new THREE.Group();
  const L = 0.5;
  const tube = mesh(new THREE.CylinderGeometry(0.0095, 0.0095, L, 16), M.silver());
  tube.rotation.z = -Math.PI / 2;
  tube.position.x = L / 2 - 0.06;
  group.add(tube);
  const keyGeos = [];
  for (let i = 0; i < 13; i++) {
    const g = new THREE.CylinderGeometry(0.007, 0.007, 0.004, 12);
    g.translate(0.07 + i * 0.026, 0.0105, 0);
    keyGeos.push(g);
  }
  group.add(mesh(mergeGeometries(keyGeos), M.silver(), { cast: false }));
  const lip = mesh(new THREE.BoxGeometry(0.02, 0.004, 0.014), M.silver(), { cast: false });
  lip.position.set(0, 0.011, 0);
  group.add(lip);
  return { group, lh: V(0.12, -0.012, 0.01), rh: V(0.3, -0.012, 0.01), mouth: V(0, 0, 0) };
}

// Oboe / clarinet: mouthpiece at origin, body along -Y
export function reed(kind = 'oboe') {
  const group = new THREE.Group();
  const L = kind === 'clarinet' ? 0.5 : 0.46;
  const mat = kind === 'clarinet' ? M.ebony() : plainMaterial('#1c1412', { roughness: 0.3 });
  const body = mesh(new THREE.CylinderGeometry(0.011, kind === 'clarinet' ? 0.012 : 0.015, L, 14), mat);
  body.position.y = -L / 2 - 0.03;
  group.add(body);
  const bell = mesh(new THREE.CylinderGeometry(kind === 'clarinet' ? 0.012 : 0.015, kind === 'clarinet' ? 0.034 : 0.026, 0.07, 18, 1, true), mat);
  bell.position.y = -L - 0.06;
  group.add(bell);
  const mp = mesh(new THREE.CylinderGeometry(0.004, 0.009, 0.05, 10), kind === 'clarinet' ? M.ebony() : plainMaterial('#c8a66e'));
  mp.position.y = -0.01;
  group.add(mp);
  const keys = [];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.TorusGeometry(0.008, 0.0018, 6, 12);
    g.rotateX(Math.PI / 2);
    g.translate(0.004, -0.08 - i * 0.034, 0.011);
    keys.push(g);
  }
  group.add(mesh(mergeGeometries(keys), M.silver(), { cast: false }));
  return { group, lh: V(0, -0.15, 0.02), rh: V(0, -0.32, 0.02), mouth: V(0, 0, 0) };
}

// Bassoon: tall maple tube, bocal to the mouth at origin
export function bassoon() {
  const group = new THREE.Group();
  const wood = M.varnish('#7a3a18');
  const L = 0.95;
  const tube = mesh(new THREE.CylinderGeometry(0.022, 0.026, L, 14), wood);
  tube.position.set(0.09, -L / 2 + 0.28, 0.02);
  group.add(tube);
  const boot = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 14), wood);
  boot.position.set(0.09, 0.28 - L - 0.04, 0.02);
  group.add(boot);
  const ring = mesh(new THREE.TorusGeometry(0.027, 0.004, 6, 16), M.silver(), { cast: false });
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0.09, 0.28, 0.02);
  group.add(ring);
  const bocal = new THREE.CubicBezierCurve3(V(0, 0, 0), V(0.03, 0.02, 0.03), V(0.07, 0.04, 0.03), V(0.09, 0.05, 0.02));
  group.add(mesh(new THREE.TubeGeometry(bocal, 16, 0.004, 6), M.silver(), { cast: false }));
  return { group, lh: V(0.07, -0.05, 0.04), rh: V(0.07, -0.42, 0.04), mouth: V(0, 0, 0) };
}

// French horn: coiled brass with a wide bell
export function horn() {
  const group = new THREE.Group();
  const coil = mesh(new THREE.TorusGeometry(0.12, 0.012, 10, 40), M.brass());
  const coil2 = mesh(new THREE.TorusGeometry(0.095, 0.01, 10, 40), M.brass());
  coil2.position.z = 0.025;
  group.add(coil, coil2);
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    prof.push(new THREE.Vector2(0.015 + Math.pow(t, 3.2) * 0.13, t * 0.24));
  }
  const bell = mesh(new THREE.LatheGeometry(prof, 32), M.brass());
  bell.material = bell.material.clone();
  bell.material.side = THREE.DoubleSide;
  bell.rotation.z = -Math.PI / 2 - 0.35;
  bell.position.set(0.09, -0.08, 0.02);
  group.add(bell);
  const valves = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.CylinderGeometry(0.01, 0.01, 0.06, 10);
    g.translate(-0.06 + i * 0.026, 0.06, 0.03);
    valves.push(g);
  }
  group.add(mesh(mergeGeometries(valves), M.brass(), { cast: false }));
  const lead = new THREE.CubicBezierCurve3(V(-0.12, 0.02, 0), V(-0.18, 0.05, 0.02), V(-0.2, 0.12, 0.04), V(-0.16, 0.18, 0.06));
  group.add(mesh(new THREE.TubeGeometry(lead, 14, 0.005, 6), M.brass(), { cast: false }));
  // mouth (lead pipe end), left hand on valves, right hand in the bell
  return { group, mouth: V(-0.16, 0.18, 0.06), lh: V(-0.035, 0.08, 0.06), rh: V(0.2, -0.12, 0.0) };
}

// Trumpet: mouthpiece at origin, bell along -Z (forward)
export function trumpet() {
  const group = new THREE.Group();
  const lead = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 10), M.brass());
  lead.rotation.x = Math.PI / 2;
  lead.position.set(0, 0, -0.15);
  group.add(lead);
  const lower = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.26, 10), M.brass());
  lower.rotation.x = Math.PI / 2;
  lower.position.set(0, -0.045, -0.17);
  group.add(lower);
  const prof = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    prof.push(new THREE.Vector2(0.008 + Math.pow(t, 3.5) * 0.05, t * 0.14));
  }
  const bell = mesh(new THREE.LatheGeometry(prof, 28), M.brass());
  bell.material = bell.material.clone();
  bell.material.side = THREE.DoubleSide;
  bell.rotation.x = -Math.PI / 2;
  bell.position.set(0, 0, -0.3);
  group.add(bell);
  for (let i = 0; i < 3; i++) {
    const v = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.07, 10), M.brass(), { cast: false });
    v.position.set(0, -0.022, -0.12 - i * 0.022);
    group.add(v);
  }
  return { group, mouth: V(0, 0, 0), lh: V(-0.012, -0.03, -0.1), rh: V(0.01, 0.02, -0.14) };
}

// --------------------------------------------------------------- percussion
export function timpani() {
  const group = new THREE.Group();
  const drums = [];
  const defs = [
    { x: -0.42, z: -0.32, r: 0.34 },
    { x: 0, z: -0.46, r: 0.31 },
    { x: 0.42, z: -0.32, r: 0.28 },
  ];
  for (const d of defs) {
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      prof.push(new THREE.Vector2(Math.sin((t * Math.PI) / 2) * d.r, -Math.cos((t * Math.PI) / 2) * d.r * 0.9));
    }
    const kettle = mesh(new THREE.LatheGeometry(prof, 36), M.copper());
    kettle.position.set(d.x, 0.62, d.z);
    group.add(kettle);
    const head = mesh(new THREE.CircleGeometry(d.r, 36), plainMaterial('#efe6d2', { roughness: 0.75 }), { cast: false });
    head.rotation.x = -Math.PI / 2;
    head.position.set(d.x, 0.625, d.z);
    group.add(head);
    const hoop = mesh(new THREE.TorusGeometry(d.r, 0.012, 6, 36), M.silver(), { cast: false });
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(d.x, 0.625, d.z);
    group.add(hoop);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      const leg = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), M.silver(), { cast: false });
      leg.position.set(d.x + Math.cos(a) * d.r * 0.6, 0.2, d.z + Math.sin(a) * d.r * 0.6);
      group.add(leg);
    }
    drums.push({ head, center: V(d.x, 0.63, d.z), r: d.r });
  }
  return { group, drums };
}

export function mallet() {
  const group = new THREE.Group();
  const shaft = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.32, 6), plainMaterial('#d9b98a'));
  shaft.rotation.z = -Math.PI / 2;
  shaft.position.x = 0.16;
  const head = mesh(new THREE.SphereGeometry(0.022, 12, 8), plainMaterial('#f4efe4', { roughness: 0.95 }));
  head.position.x = 0.32;
  group.add(shaft, head);
  return { group, tip: V(0.32, 0, 0) };
}

// ------------------------------------------------------------------- harp
// Strings plane is local YZ at x = 0; the column stands at +Z... harpist
// sits at -Z side. Returns per-string anchors and a colour buffer for glow.
export function harp() {
  const group = new THREE.Group();
  const N = 47;
  const base = V(0, 0.08, -0.5);
  const top = V(0, 1.32, 0.02);
  const columnZ = -0.58;
  const neckY = (z) => 1.78 - (z - columnZ) * 0.42 + Math.sin(((z - columnZ) / 0.6) * Math.PI) * 0.12;

  // soundboard
  const sbLen = base.distanceTo(top);
  const sb = mesh(new THREE.CylinderGeometry(0.035, 0.12, sbLen, 12), M.varnish('#b8783e'));
  sb.position.copy(base).lerp(top, 0.5);
  sb.quaternion.setFromUnitVectors(V(0, 1, 0), top.clone().sub(base).normalize());
  group.add(sb);
  // column
  const col = mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.75, 16), M.gold());
  col.position.set(0, 0.92, columnZ);
  group.add(col);
  const crown = mesh(new THREE.SphereGeometry(0.06, 16, 10), M.gold());
  crown.position.set(0, 1.82, columnZ);
  group.add(crown);
  // base
  const ped = mesh(new THREE.BoxGeometry(0.3, 0.08, 0.42), M.varnish('#b8783e'));
  ped.position.set(0, 0.04, -0.42);
  group.add(ped);
  // neck (curved)
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const z = columnZ + (i / 20) * (top.z - columnZ + 0.05);
    pts.push(V(0, neckY(z), z));
  }
  group.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.03, 8), M.gold()));

  // strings as line segments with per-vertex colour
  const pos = [];
  const col3 = [];
  const anchors = [];
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1); // 0 = bass (long), 1 = treble (short)
    const lo = base.clone().lerp(top, 0.06 + 0.9 * k);
    const z = lo.z;
    const hi = V(0, neckY(z) - 0.03, z);
    pos.push(0, lo.y, z, 0, hi.y, z);
    // C strings red, F strings dark blue (like real harps)
    const note = i % 7;
    const c = note === 0 ? [0.85, 0.2, 0.2] : note === 3 ? [0.15, 0.2, 0.55] : [0.92, 0.88, 0.8];
    col3.push(...c, ...c);
    anchors.push({ lo, hi, base: c, glow: 0 });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col3, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }));
  group.add(lines);

  // diatonic string index for a midi note: C1 (24) is string 0
  const DIA = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const stringFor = (midi) => {
    const oct = Math.floor(midi / 12) - 2;
    return Math.max(0, Math.min(N - 1, oct * 7 + DIA[midi % 12]));
  };
  const pluck = (idx, amount = 1) => { anchors[idx].glow = Math.max(anchors[idx].glow, amount); };
  const update = (dt) => {
    const c = g.attributes.color;
    let dirty = false;
    for (let i = 0; i < N; i++) {
      const a = anchors[i];
      if (a.glow > 0.001) {
        a.glow *= Math.exp(-dt * 2.2);
        const gl = a.glow;
        c.setXYZ(i * 2, a.base[0] + gl, a.base[1] + gl * 0.85, a.base[2] + gl * 0.5);
        c.setXYZ(i * 2 + 1, a.base[0] + gl, a.base[1] + gl * 0.85, a.base[2] + gl * 0.5);
        dirty = true;
      }
    }
    if (dirty) c.needsUpdate = true;
  };
  return { group, anchors, stringFor, pluck, update };
}

// ------------------------------------------------------------------ piano
// Concert grand. Keyboard along local X (bass at -X), player sits at +Z
// side facing -Z, i.e. the instrument body extends toward -Z.
export function grandPiano() {
  const group = new THREE.Group();
  const W = 1.12; // case width (chibi scale)
  const Lc = 1.9; // length
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0);
  s.lineTo(W / 2, 0);
  s.lineTo(W / 2, -0.55);
  s.bezierCurveTo(W / 2, -0.9, -0.05, -0.95, -0.12, -1.35);
  s.bezierCurveTo(-0.18, -1.7, -0.32, -Lc, -0.45, -Lc);
  s.lineTo(-W / 2, -Lc + 0.05);
  s.closePath();
  const caseGeo = new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 24 });
  // shape y (0 .. -Lc) -> world -Z; extrusion depth becomes height
  caseGeo.rotateX(Math.PI / 2);
  caseGeo.translate(0, 0.78, 0);
  group.add(mesh(caseGeo, M.blackLacquer()));
  // soundboard / strings visible inside (gold plate)
  const plateGeo = new THREE.ShapeGeometry(s, 16);
  plateGeo.rotateX(Math.PI / 2);
  plateGeo.scale(0.94, 1, 0.97);
  plateGeo.translate(0, 0.75, -0.02);
  const plateMat = M.gold().clone();
  plateMat.side = THREE.DoubleSide;
  plateMat.roughness = 0.45;
  group.add(mesh(plateGeo, plateMat, { cast: false }));
  // strings over the plate
  const strGeo = [];
  for (let i = 0; i < 40; i++) {
    const x = -W / 2 + 0.08 + (i / 39) * (W - 0.2);
    const len = 1.65 - (i / 39) * 1.05;
    strGeo.push(new THREE.BoxGeometry(0.003, 0.003, len).translate(x, 0.765, -0.12 - len / 2));
  }
  group.add(mesh(mergeGeometries(strGeo), M.string(), { cast: false }));
  // lid, propped open toward the treble side (+X)
  const lidGeo = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: false, curveSegments: 24 });
  lidGeo.rotateX(Math.PI / 2);
  lidGeo.translate(0, 0.018, 0);
  const lid = new THREE.Group();
  const lidMesh = mesh(lidGeo, M.blackLacquer());
  lidMesh.position.x = W / 2; // hinge on the bass side? rotate around -X edge
  lid.add(lidMesh);
  lid.position.set(-W / 2, 0.79, 0);
  lid.rotation.z = 0.68;
  group.add(lid);
  const prop = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 6), M.blackLacquer());
  prop.position.set(0.35, 0.98, -0.95);
  prop.rotation.z = -0.25;
  group.add(prop);
  // legs + lyre
  for (const [x, z] of [[-W / 2 + 0.08, -0.2], [W / 2 - 0.08, -0.2], [-0.35, -Lc + 0.2]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.52, 10), M.blackLacquer());
    leg.position.set(x, 0.26, z);
    group.add(leg);
  }
  const lyre = mesh(new THREE.BoxGeometry(0.14, 0.38, 0.04), M.blackLacquer());
  lyre.position.set(0, 0.24, -0.18);
  group.add(lyre);
  for (let i = 0; i < 3; i++) {
    const p = mesh(new THREE.BoxGeometry(0.025, 0.012, 0.07), M.brass(), { cast: false });
    p.position.set(-0.04 + i * 0.04, 0.05, -0.12);
    group.add(p);
  }
  // keybed + key slip
  const bed = mesh(new THREE.BoxGeometry(W + 0.02, 0.06, 0.22), M.blackLacquer());
  bed.position.set(0, 0.62, 0.1);
  group.add(bed);
  for (const sx of [-1, 1]) {
    const cheek = mesh(new THREE.BoxGeometry(0.05, 0.1, 0.24), M.blackLacquer());
    cheek.position.set(sx * (W / 2 - 0.0), 0.67, 0.1);
    group.add(cheek);
  }
  const fallboard = mesh(new THREE.BoxGeometry(W - 0.06, 0.08, 0.04), M.blackLacquer());
  fallboard.position.set(0, 0.72, -0.01);
  group.add(fallboard);

  // 88 keys (A0..C8) as two instanced meshes
  const kbW = W - 0.1;
  const whites = [];
  for (let m = 21; m <= 108; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
  const wW = kbW / whites.length;
  const keyX = new Map();
  whites.forEach((m, i) => keyX.set(m, -kbW / 2 + wW * (i + 0.5)));
  for (let m = 21; m <= 108; m++) if (!keyX.has(m)) keyX.set(m, (keyX.get(m - 1) + keyX.get(m + 1)) / 2);
  const whiteGeo = new THREE.BoxGeometry(wW * 0.92, 0.018, 0.15);
  whiteGeo.translate(0, 0, 0.075); // pivot at back edge
  const blackGeo = new THREE.BoxGeometry(wW * 0.55, 0.02, 0.09);
  blackGeo.translate(0, 0, 0.045);
  const whiteMesh = new THREE.InstancedMesh(whiteGeo, M.ivory(), whites.length);
  const blackMidis = [];
  for (let m = 21; m <= 108; m++) if ([1, 3, 6, 8, 10].includes(m % 12)) blackMidis.push(m);
  const blackMesh = new THREE.InstancedMesh(blackGeo, M.ebony(), blackMidis.length);
  const keyY = 0.665;
  const keyZ = 0.02;
  const index = new Map();
  whites.forEach((m, i) => index.set(m, { mesh: whiteMesh, i, black: false }));
  blackMidis.forEach((m, i) => index.set(m, { mesh: blackMesh, i, black: true }));
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const setKey = (m, angle) => {
    const k = index.get(m);
    if (!k) return;
    q.setFromAxisAngle(V(1, 0, 0), angle);
    mtx.compose(V(keyX.get(m), keyY + (k.black ? 0.016 : 0), keyZ), q, V(1, 1, 1));
    k.mesh.setMatrixAt(k.i, mtx);
    k.mesh.instanceMatrix.needsUpdate = true;
  };
  for (let m = 21; m <= 108; m++) setKey(m, 0);
  whiteMesh.castShadow = false;
  blackMesh.castShadow = false;
  group.add(whiteMesh, blackMesh);
  // bench
  const bench = mesh(new THREE.BoxGeometry(0.62, 0.06, 0.32), M.blackLacquer());
  bench.position.set(0, 0.47, 0.62);
  group.add(bench);
  const cushion = mesh(new THREE.BoxGeometry(0.6, 0.04, 0.3), plainMaterial('#2a1414', { roughness: 0.9 }));
  cushion.position.set(0, 0.52, 0.62);
  group.add(cushion);
  for (const [x, z] of [[-0.27, 0.5], [0.27, 0.5], [-0.27, 0.74], [0.27, 0.74]]) {
    const l = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), M.blackLacquer());
    l.position.set(x, 0.225, z);
    group.add(l);
  }

  const pressed = new Map();
  return {
    group,
    keyPos: (m) => V(keyX.get(Math.max(21, Math.min(108, Math.round(m)))), keyY + 0.02, keyZ + 0.09),
    // set of currently held keys -> animate presses
    setPressed(set) {
      for (const [m] of pressed) if (!set.has(m)) { setKey(m, 0); pressed.delete(m); }
      for (const m of set) if (!pressed.has(m)) { setKey(m, 0.07); pressed.set(m, true); }
    },
    benchSeat: V(0, 0.54, 0.62),
  };
}

// ------------------------------------------------------------ furniture
export function chairGeometry() {
  const seat = new THREE.BoxGeometry(0.44, 0.05, 0.42).translate(0, 0.46, 0);
  const back = new THREE.BoxGeometry(0.42, 0.36, 0.035).rotateX(0.12).translate(0, 0.72, 0.21);
  const legs = [];
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    legs.push(new THREE.CylinderGeometry(0.014, 0.012, 0.46, 6).translate(x, 0.23, z));
  }
  return mergeGeometries([seat, back, ...legs]);
}

export function stoolGeometry(h = 0.72) {
  const seat = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20).translate(0, h, 0);
  const ring = new THREE.TorusGeometry(0.16, 0.012, 6, 20).rotateX(Math.PI / 2).translate(0, h * 0.35, 0);
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    legs.push(new THREE.CylinderGeometry(0.014, 0.016, h, 6).translate(Math.cos(a) * 0.15, h / 2, Math.sin(a) * 0.15));
  }
  return mergeGeometries([seat, ring, ...legs]);
}

// Orchestral music stand (tripod, telescopic pole, solid desk with a lip)
// with the part on it. Local -z faces the player... the desk tilts back
// toward +z, where the musician sits.
export function standParts(height = 1.05) {
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.011, 0.011, height - 0.04, 6).translate(0, height / 2, 0);
  const sleeve = new THREE.CylinderGeometry(0.016, 0.016, height * 0.45, 6).translate(0, height * 0.25 + 0.05, 0);
  parts.push(pole, sleeve);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const leg = new THREE.CylinderGeometry(0.007, 0.008, 0.3, 4);
    leg.rotateZ(1.25).rotateY(-a).translate(Math.cos(a) * 0.13, 0.06, Math.sin(a) * 0.13);
    parts.push(leg);
  }
  const desk = new THREE.BoxGeometry(0.52, 0.36, 0.01).rotateX(-0.42).translate(0, height + 0.1, 0.02);
  const lip = new THREE.BoxGeometry(0.52, 0.012, 0.045).translate(0, height - 0.065, 0.075);
  parts.push(desk, lip);
  const paper = new THREE.PlaneGeometry(0.44, 0.3).translate(0, 0.01, 0.007).rotateX(-0.42).translate(0, height + 0.1, 0.02);
  return { metal: mergeGeometries(parts), paper };
}

// Additional orchestral instruments. Rigid bodies are merged by the caller;
// slides and keys remain separate so their movement follows the live score.
export function trombone() {
  const group = new THREE.Group(), slide = new THREE.Group();
  const brass = M.brass();
  const tube = (parent, a, b, r = 0.008) => {
    const d = b.clone().sub(a);
    const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), brass);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); parent.add(m);
  };
  tube(group, V(0, 0, 0), V(-0.07, 0, -0.24));
  tube(group, V(-0.07, 0, -0.24), V(-0.07, 0.08, -0.55));
  const profile = Array.from({ length: 13 }, (_, i) => new THREE.Vector2(0.012 + (i / 12) ** 3 * 0.1, i / 12 * 0.2));
  const bell = mesh(new THREE.LatheGeometry(profile, 20), brass);
  bell.rotation.x = -Math.PI / 2; bell.position.set(-0.07, 0.08, -0.55); group.add(bell);
  tube(slide, V(0.03, -0.06, -0.1), V(0.03, -0.06, -0.62));
  tube(slide, V(0.09, -0.06, -0.1), V(0.09, -0.06, -0.62));
  tube(slide, V(0.03, -0.06, -0.62), V(0.09, -0.06, -0.62));
  tube(slide, V(0.03, -0.06, -0.24), V(0.09, -0.06, -0.24));
  group.add(slide);
  return { group, slide, mouth: V(0, 0, 0), lh: V(-0.02, -0.04, -0.13), rh: V(0.06, -0.06, -0.24) };
}

export function tuba() {
  const group = new THREE.Group(), brass = M.brass();
  const loop = mesh(new THREE.TorusGeometry(0.23, 0.036, 8, 28), brass);
  loop.scale.y = 1.35; loop.position.y = -0.25; group.add(loop);
  const profile = Array.from({ length: 15 }, (_, i) => new THREE.Vector2(0.035 + (i / 14) ** 3 * 0.17, i / 14 * 0.39));
  const bell = mesh(new THREE.LatheGeometry(profile, 24), brass);
  bell.position.set(0.15, -0.2, 0); group.add(bell);
  const lead = new THREE.CatmullRomCurve3([V(-0.08, 0.06, 0.12), V(-0.2, 0.02, 0.08), V(-0.23, -0.2, 0), V(-0.1, -0.3, 0)]);
  group.add(mesh(new THREE.TubeGeometry(lead, 12, 0.01, 6), brass));
  for (let i = 0; i < 3; i++) {
    const valve = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), brass);
    valve.position.set(-0.08 + i * 0.05, -0.2, 0.06); group.add(valve);
  }
  return { group, mouth: V(-0.08, 0.06, 0.12), lh: V(-0.16, -0.32, 0.06), rh: V(0, -0.12, 0.08) };
}

export function saxophone() {
  const group = new THREE.Group(), brass = M.brass();
  const path = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, -0.1, -0.1), V(0, -0.5, -0.13), V(0, -0.58, -0.27), V(0, -0.4, -0.35)]);
  group.add(mesh(new THREE.TubeGeometry(path, 22, 0.024, 10), brass));
  const bell = mesh(new THREE.CylinderGeometry(0.08, 0.025, 0.15, 18, 1, true), brass);
  bell.position.set(0, -0.35, -0.35); group.add(bell);
  for (let i = 0; i < 7; i++) {
    const key = mesh(new THREE.SphereGeometry(0.014, 8, 5), M.silver(), { cast: false });
    key.position.set(0.025, -0.13 - i * 0.045, -0.1); group.add(key);
  }
  return { group, mouth: V(0, 0, 0), lh: V(-0.02, -0.2, -0.1), rh: V(0.02, -0.38, -0.13) };
}

export function chamberKeyboard(organ = false) {
  const group = new THREE.Group(), keys = [], wood = M.darkWood();
  const body = mesh(new THREE.BoxGeometry(1.12, 0.36, 0.45), wood);
  body.position.set(0, 0.76, -0.62); group.add(body);
  for (const x of [-0.48, 0.48]) {
    const leg = mesh(new THREE.BoxGeometry(0.06, 0.62, 0.06), wood); leg.position.set(x, 0.31, -0.63); group.add(leg);
  }
  for (let m = 48; m <= 84; m++) {
    const black = [1, 3, 6, 8, 10].includes(m % 12);
    const key = mesh(new THREE.BoxGeometry(0.025, 0.025, black ? 0.12 : 0.2), black ? M.ebony() : M.ivory(), { cast: false });
    key.position.set((m - 66) * 0.027, 0.96 + (black ? 0.018 : 0), black ? -0.51 : -0.46);
    key.userData.homeY = key.position.y; key.userData.midi = m; keys.push(key); group.add(key);
  }
  if (organ) for (let i = 0; i < 13; i++) {
    const h = 0.6 + Math.abs(i - 6) * 0.1;
    const pipe = mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 8), M.silver());
    pipe.position.set((i - 6) * 0.075, 0.95 + h / 2, -0.83); group.add(pipe);
  }
  return { group, keys, keyPos: m => V((Math.max(48, Math.min(84, m)) - 66) * 0.027, 0.99, -0.4),
    setPressed: pitches => { for (const k of keys) k.position.y = k.userData.homeY - (pitches.has(k.userData.midi) ? 0.012 : 0); } };
}

export function percussion(kind = 'snare') {
  const group = new THREE.Group(), metal = M.silver(), wood = M.darkWood();
  const targets = [];
  const stand = (x, z, h) => {
    const pole = mesh(new THREE.CylinderGeometry(0.012, 0.016, h, 8), metal); pole.position.set(x, h / 2, z); group.add(pole);
    for (let j = 0; j < 3; j++) {
      const foot = mesh(new THREE.BoxGeometry(0.38, 0.025, 0.025), metal);
      foot.rotation.y = j * Math.PI / 3; foot.position.set(x, 0.025, z); group.add(foot);
    }
  };
  if (kind === 'mallet') {
    for (let i = 0; i < 18; i++) {
      const bar = mesh(new THREE.BoxGeometry(0.055, 0.035, 0.36 - i * 0.008), wood);
      bar.position.set((i - 8.5) * 0.061, 0.78, -0.45); group.add(bar);
    }
    stand(-0.43, -0.45, 0.74); stand(0.43, -0.45, 0.74);
    for (const x of [-0.3, 0, 0.3]) targets.push({ center: V(x, 0.8, -0.45), r: 0.2 });
  } else if (kind === 'bells') {
    for (let i = 0; i < 10; i++) {
      const h = 1.2 - i * 0.045;
      const pipe = mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 8), M.brass());
      pipe.position.set((i - 4.5) * 0.065, 1.55 - h / 2, -0.55); group.add(pipe);
    }
    stand(-0.4, -0.55, 1.65); stand(0.4, -0.55, 1.65);
    targets.push({ center: V(0, 1.3, -0.55), r: 0.18 });
  } else if (kind === 'triangle') {
    const points = [V(-0.18, 1.05, -0.45), V(0, 1.35, -0.45), V(0.18, 1.05, -0.45), V(-0.12, 1.05, -0.45)];
    for (let i = 0; i < 3; i++) {
      const d = points[i + 1].clone().sub(points[i]);
      const rod = mesh(new THREE.CylinderGeometry(0.009, 0.009, d.length(), 8), metal);
      rod.position.copy(points[i]).add(points[i + 1]).multiplyScalar(0.5); rod.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); group.add(rod);
    }
    stand(0.28, -0.45, 1.4); targets.push({ center: V(0.08, 1.08, -0.45), r: 0.1 });
  } else if (kind === 'tambourine') {
    const rim = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 24, 1, true), wood);
    rim.position.set(0, 0.95, -0.45); group.add(rim);
    const head = mesh(new THREE.CircleGeometry(0.217, 24), M.ivory());
    head.rotation.x = -Math.PI / 2; head.position.set(0, 1, -0.45); group.add(head);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      for (const y of [0.938, 0.957]) {
        const jingle = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.006, 12), metal);
        jingle.position.set(Math.cos(a) * 0.218, y, -0.45 + Math.sin(a) * 0.218); group.add(jingle);
      }
    }
    stand(0, -0.45, 0.9); targets.push({ center: V(0, 1.01, -0.45), r: 0.2 });
  } else if (kind === 'cymbals') {
    const disc = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.012, 32), M.brass());
    disc.position.set(0, 0.9, -0.45); disc.rotation.x = 0.12; group.add(disc);
    stand(0, -0.45, 0.9); targets.push({ center: V(0, 0.91, -0.45), r: 0.3 });
  } else {
    const r = kind === 'bassDrum' ? 0.42 : 0.27;
    const shell = mesh(new THREE.CylinderGeometry(r, r, kind === 'bassDrum' ? 0.38 : 0.18, 24), kind === 'bassDrum' || kind === 'tom' ? wood : metal);
    shell.position.set(0, 0.68, -0.45); group.add(shell);
    const head = mesh(new THREE.CylinderGeometry(r, r, 0.012, 24), M.ivory());
    head.position.set(0, kind === 'bassDrum' ? 0.88 : 0.78, -0.45); group.add(head);
    stand(0, -0.45, 0.6); targets.push({ center: head.position.clone(), r });
  }
  while (targets.length < 3) targets.push(targets[0]);
  return { group, drums: targets };
}
