// The pensive bodhisattva, cast in gilt bronze, as two of the forest's
// animals: seated on a round stool, the right leg crossed over the left
// knee, the right elbow on that knee and the fingertips just touching the
// cheek, the head bowed toward them, the eyes lowered and a faint smile;
// the left hand on the right ankle, the left foot on a lotus. The skirt
// falls over the stool in folds. One figure wears the tall crown with the
// sun on a crescent moon and a shawl over the shoulders, the other the low
// crown of three peaks, bare to the waist but for a necklace - the late
// 6th and early 7th century figures of the room of contemplation.
// Sculpted as a distance field (sculpt.js) and cast into one mesh; the
// head is the animals' own skull (body-shape.js).
import * as THREE from 'three';
import { HEAD, skullFrontZ } from './body-shape.js';
import { sculpt, sculptLater, frame, sphere, ellipsoid, roundCone, capsule, torus, arc, cylinder, shell, between, tube } from './sculpt.js';

const PI = Math.PI;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / len(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// the rotation that turns the frame's y axis onto dir (and z toward face)
function aim(dir, face = [0, 0, -1]) {
  const y = new THREE.Vector3(...unit(dir));
  const x = new THREE.Vector3().crossVectors(y, new THREE.Vector3(...face)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return [e.x, e.y, e.z];
}
// a shape made in a frame's own coordinates, placed in the figure
function placed(f, shape) {
  const t = [0, 0, 0];
  return { d: (x, y, z) => { f.local(x, y, z, t); return shape.d(t[0], t[1], t[2]); }, c: f.world(shape.c), r: shape.r };
}
// a crown's band: an elliptic ring round the head
function band(c, rx, rz, hh, t) {
  return {
    d(x, y, z) {
      const q = (Math.hypot((x - c[0]) / rx, (z - c[2]) / rz) - 1) * Math.min(rx, rz);
      const a = Math.abs(q) - t;
      const b = Math.abs(y - c[1]) - hh;
      return Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0));
    },
    c, r: Math.max(rx, rz) + t + hh,
  };
}

// The pose, in the figure's own frame (right +X, up +Y, facing -Z, the
// floor under the stool at 0; metres before the figure is scaled).
export const POSE = {
  head: { at: [0.025, 1.245, -0.135], bow: 0.32, tilt: 0.14 },
  shoulder: { R: [0.172, 0.935, -0.075], L: [-0.172, 0.935, -0.075] },
  elbow: { R: [0.33, 0.758, -0.19], L: [-0.3, 0.765, -0.11] },
  right: { hip: [0.09, 0.585, -0.03], knee: [0.345, 0.645, -0.175], ankle: [-0.095, 0.7, -0.31], toes: [-0.215, 0.748, -0.335] },
  left: { hip: [-0.09, 0.585, -0.03], knee: [-0.115, 0.565, -0.305], ankle: [-0.13, 0.155, -0.365], toes: [-0.13, 0.112, -0.478] },
  lotus: { at: [-0.13, 0, -0.42], r: 0.088 },
  seat: { at: [0, 0, 0.035], top: 0.56, r: 0.215, foot: 0.29 },
  cheek: { x: 0.15, y: -0.07 }, // where the fingertips rest, on the skull
  hand: 0.135, // wrist to fingertips
};

// the two figures of the room (to each other as the real ones, 81.5 and
// 93.5 cm; the size and the animals are the forest's own)
export const STATUES = [
  { id: 'late-6c', species: 'deer', crown: 'sunMoon', shawl: true, scale: 0.72, tone: 0.62 },
  { id: 'early-7c', species: 'bear', crown: 'threePeaks', shawl: false, scale: 0.826, tone: 0.5 },
];

// where the head is, and points on it
export function headFrame() {
  const { at, bow, tilt } = POSE.head;
  return frame(at, [-bow, 0, -tilt]);
}
const [HX, HY, HZ] = HEAD.scale.map((s) => s * HEAD.r);
export function cheekPoint(lift = 0) {
  const { x, y } = POSE.cheek;
  const p = [x, y, skullFrontZ(x, y)];
  const n = unit([p[0] / (HX * HX), p[1] / (HY * HY), p[2] / (HZ * HZ)]);
  return headFrame().world(add(p, mul(n, lift)));
}

// ------------------------------------------------------------ the head
// A line drawn on the face: points (x, y) of the head, each taken in along
// +z from in front until it meets the face's shapes, then a little out (so
// the cut is `depth` deep where the tube of radius r goes in).
function onFace(face, xy, r, depth) {
  return tube(xy.map(([x, y]) => {
    let z = -0.5;
    for (let i = 0; i < 80; i++) {
      let d = Infinity;
      for (const s of face) d = Math.min(d, s.d(x, y, z));
      if (d < 1e-4) break;
      z += Math.max(d * 0.9, 1e-4);
    }
    return [x, y, z - (r - depth)];
  }), r);
}
const curve = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));

function headShapes(spec, put) {
  const hf = headFrame();
  const h = (shape, k, extra) => put(placed(hf, shape), k, extra);
  const hc = (shape, k = 0.006) => put(placed(hf, shape), k, { cut: true });
  const face = [ellipsoid([0, 0, 0], [HX, HY, HZ])];
  h(face[0], 0.05);
  const bear = spec.species === 'bear';
  if (bear) {
    face.push(ellipsoid([0, -0.075, -0.2], [0.118, 0.082, 0.115]));
    h(face[1], 0.045);
    h(ellipsoid([0, -0.038, -0.312], [0.036, 0.025, 0.024]), 0.015);
    for (const s of [-1, 1]) {
      h(ellipsoid([s * 0.205, 0.165, 0.02], [0.082, 0.08, 0.04], [0, 0, -s * 0.35]), 0.03);
      hc(ellipsoid([s * 0.21, 0.165, -0.028], [0.047, 0.045, 0.022], [0, 0, -s * 0.35]), 0.012);
    }
  } else {
    face.push(ellipsoid([0, -0.078, -0.2], [0.1, 0.07, 0.15]));
    h(face[1], 0.05);
    h(ellipsoid([0, -0.05, -0.345], [0.032, 0.022, 0.02]), 0.015);
    for (const s of [-1, 1]) {
      h(ellipsoid([s * 0.26, 0.075, 0.02], [0.13, 0.044, 0.032], [0, s * 0.2, -s * 0.38]), 0.025);
      hc(ellipsoid([s * 0.27, 0.068, -0.006], [0.09, 0.024, 0.014], [0, s * 0.2, -s * 0.38]), 0.01);
    }
  }
  // the smile: a line down from the nose, parting into the corners of the
  // mouth, the corners turned up
  const nose = bear ? -0.06 : -0.066;
  const mouth = nose - 0.028;
  hc(onFace(face, curve(12, (t) => { const u = t * 2 - 1; return [u * 0.034, mouth + 0.009 * u * u]; }), 0.008, 0.0035), 0.008);
  // the eyes: lowered, closed, each a long gentle curve, the outer end
  // a little higher
  for (const s of [-1, 1]) {
    hc(onFace(face, curve(10, (t) => {
      const u = t * 2 - 1;
      return [s * (0.098 + u * 0.036), 0.024 - 0.008 * (1 - u * u) + s * u * 0.004];
    }), 0.007, 0.0045), 0.006);
  }
  // the crown
  const top = HY;
  const bandY = top * (bear ? 0.86 : 0.8);
  const ring = Math.sqrt(1 - (bandY / top) ** 2);
  const rx = HX * ring;
  const rz = HZ * ring;
  h(band([0, bandY, 0], rx + 0.004, rz + 0.004, 0.016, 0.009), 0.016);
  h(band([0, bandY - 0.018, 0], rx + 0.012, rz + 0.012, 0.005, 0.006), 0.008);
  if (spec.crown === 'threePeaks') {
    // a cap, three low rounded peaks rising from the band, a bead in each
    h(ellipsoid([0, top - 0.004, 0], [rx * 0.98, 0.05, rz * 0.98]), 0.03);
    for (const a of [-0.9, 0, 0.9]) {
      const p = [Math.sin(a) * (rx + 0.004), bandY + 0.04, -Math.cos(a) * (rz + 0.004)];
      h(ellipsoid(p, [0.062, 0.042, 0.016], [-0.22, -a, 0, 'YXZ']), 0.024);
      h(sphere(add(p, [Math.sin(a) * 0.012, -0.004, -Math.cos(a) * 0.012]), 0.011), 0.008);
    }
  } else {
    // a tall front plate, pointed like a leaf; on it the crescent moon
    // holding the sun; leaf plates at the sides
    h(ellipsoid([0, top - 0.008, 0], [rx * 0.96, 0.045, rz * 0.96]), 0.03);
    const fz = -rz - 0.002;
    h(ellipsoid([0, bandY + 0.065, fz + 0.008], [0.062, 0.078, 0.013], [0.18, 0, 0]), 0.022);
    h(ellipsoid([0, bandY + 0.145, fz + 0.022], [0.02, 0.032, 0.012], [0.18, 0, 0]), 0.016);
    h(arc([0, bandY + 0.205, fz + 0.03], 0.05, 0.012, [0.16, 0, 0], PI + 0.3, 2 * PI - 0.3), 0.012);
    h(cylinder([0, bandY + 0.214, fz + 0.03], 0.032, 0.008, [PI / 2 + 0.16, 0, 0]), 0.008);
    for (const s of [-1, 1]) {
      const a = s * 0.95;
      h(ellipsoid([Math.sin(a) * (rx + 0.004), bandY + 0.045, -Math.cos(a) * (rz + 0.004)], [0.042, 0.055, 0.013], [-0.16, -a, s * 0.2, 'YXZ']), 0.02);
      // the ribbons, falling past the ears to the shoulders
      h(roundCone([s * (rx + 0.012), bandY - 0.01, 0.03], [s * (rx + 0.06), bandY - 0.3, 0.07], 0.012, 0.016), 0.016);
    }
  }
}

// ------------------------------------------------------------ the figure
export function pensiveShapes(spec) {
  const ops = [];
  const put = (shape, k = 0.03, extra = {}) => ops.push({ shape, k, ...extra });
  const cut = (shape, k = 0.006) => ops.push({ shape, k, cut: true });
  const P = POSE;

  // the body, slender, bent a little forward
  put(ellipsoid([0, 0.585, 0.02], [0.165, 0.105, 0.15]), 0.05);
  put(ellipsoid([0, 0.7, -0.005], [0.116, 0.085, 0.098]), 0.06);
  put(ellipsoid([0, 0.835, -0.04], [0.14, 0.14, 0.108], [-0.22, 0, 0]), 0.06);
  put(ellipsoid([0, 0.932, -0.07], [0.18, 0.058, 0.092], [-0.22, 0, 0]), 0.05);
  for (const s of ['R', 'L']) put(sphere(P.shoulder[s], 0.056), 0.04);
  put(roundCone([0, 0.94, -0.08], [0.012, 1.07, -0.12], 0.06, 0.053), 0.04);
  for (const s of [-1, 1]) put(ellipsoid([s * 0.06, 0.885, -0.122], [0.058, 0.04, 0.026], [-0.2, 0, s * 0.25]), 0.035);
  cut(sphere([0, 0.725, -0.104], 0.009), 0.006);
  headShapes(spec, put);
  // the sash at the waist, its knot in front
  put(torus([0, 0.666, -0.006], 0.108, 0.013, [0.08, 0, 0]), 0.012);
  put(ellipsoid([0.02, 0.655, -0.115], [0.03, 0.022, 0.016], [0, 0, 0.3]), 0.01);
  // a necklace lying on the chest, a drop at its front
  put(torus([0, 0.968, -0.075], 0.098, 0.0105, [-0.82, 0, 0]), 0.006);
  put(ellipsoid([0, 0.9, -0.15], [0.016, 0.022, 0.009], [-0.3, 0, 0]), 0.006);
  if (spec.shawl) {
    // over the shoulders and down the back, falling in folds, open in front
    const cape = ellipsoid([0, 0.89, -0.04], [0.2, 0.16, 0.14], [-0.2, 0, 0]);
    put(shell(cape, 0.012, (x, y, z) => Math.max(0.81 - y, Math.min(-0.02 - z, 0.1 + (0.97 - y) * 0.55 - Math.abs(x))), 0.012), 0.016, {
      disp: (x, y, z) => -0.004 * Math.sin(Math.atan2(x, z - 0.03) * 13) * smoothstep(0.95, 0.8, y), amp: 0.004,
    });
  }

  // the arms: the right one from the knee up to the cheek
  const touch = cheekPoint(0.014); // (resting on it, not grown into it)
  const fore = unit(sub(touch, P.elbow.R));
  const wristR = sub(touch, mul(fore, P.hand));
  const wristL = [-0.115, 0.752, -0.29];
  for (const [s, wrist] of [['R', wristR], ['L', wristL]]) {
    put(roundCone(P.shoulder[s], P.elbow[s], 0.048, 0.035), 0.035);
    put(sphere(P.elbow[s], 0.036), 0.02);
    put(roundCone(P.elbow[s], wrist, 0.033, 0.023), 0.02);
    const dir = unit(sub(wrist, P.elbow[s]));
    put(torus(sub(wrist, mul(dir, 0.02)), 0.025, 0.0055, aim(dir)), 0.006);
  }
  // the right hand: the palm turned to the face, two fingertips on the
  // cheek, the other two folded in, the thumb along
  {
    const toFace = unit(sub(cheekPoint(-0.05), wristR));
    const across = unit(cross(fore, toFace));
    const palm = add(wristR, mul(fore, 0.036));
    put(ellipsoid(palm, [0.03, 0.042, 0.016], aim(fore, toFace)), 0.022);
    for (const [i, off] of [[0, -0.015], [1, 0.009]]) {
      const base = add(add(wristR, mul(fore, 0.068)), mul(across, off));
      const tip = add(touch, add(mul(across, off * 0.8), mul(toFace, -0.006 * i)));
      const mid = add(lerp(base, tip, 0.5), mul(toFace, -0.009));
      put(roundCone(base, mid, 0.0115, 0.0104), 0.006);
      put(roundCone(mid, tip, 0.0104, 0.0092), 0.005);
    }
    // (the other two folded into the palm)
    for (const off of [0.027, 0.041]) {
      const base = add(add(wristR, mul(fore, 0.064)), mul(across, off));
      const knuckle = add(base, add(mul(fore, 0.02), mul(toFace, 0.01)));
      put(roundCone(base, knuckle, 0.0118, 0.011), 0.008);
      put(roundCone(knuckle, add(knuckle, add(mul(fore, -0.016), mul(toFace, 0.016))), 0.011, 0.0098), 0.006);
    }
    const thumb = add(add(wristR, mul(fore, 0.022)), mul(across, -0.03));
    put(roundCone(thumb, add(thumb, add(mul(fore, 0.038), mul(toFace, 0.014))), 0.014, 0.011), 0.014);
  }
  // the left hand over the right ankle, its fingers falling past it
  {
    const ankle = P.right.ankle;
    const over = add(ankle, [0.012, 0.05, -0.012]);
    const dir = unit(sub(over, wristL));
    const down = [0, -1, 0];
    put(ellipsoid(lerp(wristL, over, 0.45), [0.03, 0.036, 0.014], aim(dir, down)), 0.02);
    const across = unit(cross(dir, down));
    for (const off of [-0.018, -0.006, 0.006, 0.018]) {
      const base = add(over, mul(across, off));
      const tip = add(base, [0.004, -0.036, -0.03 - Math.abs(off) * 0.4]);
      put(roundCone(base, lerp(base, tip, 0.55), 0.0095, 0.0085), 0.008);
      put(roundCone(lerp(base, tip, 0.55), tip, 0.0085, 0.007), 0.006);
    }
    put(roundCone(add(wristL, mul(across, 0.022)), add(over, [0.012, 0.012, 0.03]), 0.011, 0.008), 0.01);
  }

  // the legs, in the skirt; the right one crossed, the left one hanging
  const R = P.right;
  const L = P.left;
  put(roundCone(R.hip, R.knee, 0.098, 0.07), 0.05);
  put(sphere(R.knee, 0.07), 0.03);
  {
    // (the skirt gathered round the crossed shin in rings)
    const axis = unit(sub(R.ankle, R.knee));
    const span = len(sub(R.ankle, R.knee));
    put(roundCone(R.knee, R.ankle, 0.068, 0.046), 0.035, {
      disp: (x, y, z) => {
        const t = ((x - R.knee[0]) * axis[0] + (y - R.knee[1]) * axis[1] + (z - R.knee[2]) * axis[2]) / span;
        return -0.004 * Math.sin(t * 19 + (y - R.knee[1]) * 30) * smoothstep(0.05, 0.3, t) * smoothstep(0.95, 0.7, t);
      },
      amp: 0.004,
    });
  }
  put(roundCone(L.hip, L.knee, 0.098, 0.072), 0.05);
  put(sphere(L.knee, 0.072), 0.03);
  put(roundCone(L.knee, L.ankle, 0.064, 0.042), 0.03);
  {
    // the skirt over the hanging leg: long folds, flaring to the hem
    const a = add(L.knee, [0, -0.03, 0.006]);
    const b = add(L.ankle, [0, 0.065, 0.004]);
    const axis = unit(sub(b, a));
    const side = unit(cross(axis, [1, 0, 0]));
    const other = cross(axis, side);
    put(roundCone(a, b, 0.078, 0.094), 0.03, {
      disp: (x, y, z) => {
        const p = [x - a[0], y - a[1], z - a[2]];
        const ang = Math.atan2(p[0] * side[0] + p[1] * side[1] + p[2] * side[2], p[0] * other[0] + p[1] * other[1] + p[2] * other[2]);
        const t = (p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2]) / len(sub(b, a));
        return -0.008 * Math.sin(ang * 9 + t * 1.5) * smoothstep(0.1, 0.9, t);
      },
      amp: 0.008,
    });
  }
  // the feet, bare: the right sole turned up, the left on the lotus
  for (const [leg, flat] of [[R, [0, 0, -1]], [L, [0, 1, 0]]]) {
    const dir = sub(leg.toes, leg.ankle);
    put(ellipsoid(lerp(leg.ankle, leg.toes, 0.5), [0.04, len(dir) * 0.56, 0.026], aim(dir, flat)), 0.03);
    const across = unit(cross(unit(dir), flat));
    [-0.024, -0.008, 0.008, 0.022].forEach((o, i) => put(sphere(add(add(leg.toes, mul(across, o)), mul(unit(dir), -0.004 * Math.abs(i - 1.2))), 0.0115 - Math.abs(o) * 0.1), 0.008));
  }

  // the skirt over the stool, falling in folds, U-shaped in front
  const S = P.seat;
  const top = add(S.at, [0, S.top, 0]);
  const foot = add(S.at, [0, 0.06, 0]);
  put(between(roundCone(top, foot, S.r, S.foot), 0.004, S.top + 0.04), 0.05, {
    disp: (x, y, z) => {
      const ang = Math.atan2(x - S.at[0], -(z - S.at[2])); // 0 in front
      const down = 1 - smoothstep(0.08, S.top, y);
      let d = -0.011 * Math.sin(ang * 17 + y * 6) * (0.35 + down);
      // the U folds hanging in front, one inside the other
      for (let i = 0; i < 3; i++) {
        const v = y - (0.44 - i * 0.1) - 0.55 * (ang - 0.18) ** 2;
        d += 0.0075 * Math.exp(-((v / 0.016) ** 2)) * smoothstep(1.3, 0.4, Math.abs(ang - 0.18));
      }
      return d;
    },
    amp: 0.025,
  });
  put(cylinder(add(S.at, [0, 0.028, 0]), 0.318, 0.028), 0.012);
  put(torus(add(S.at, [0, 0.058, 0]), 0.3, 0.012), 0.01);
  // the lotus
  const lo = P.lotus.at;
  put(cylinder(add(lo, [0, 0.04, 0]), P.lotus.r * 0.92, 0.035), 0.012);
  put(ellipsoid(add(lo, [0, 0.085, 0]), [P.lotus.r, 0.016, P.lotus.r]), 0.012);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * PI * 2;
    put(ellipsoid(add(lo, [Math.sin(a) * P.lotus.r * 0.98, 0.05, Math.cos(a) * P.lotus.r * 0.98]), [0.028, 0.044, 0.012], [0.42, a, 0, 'YXZ']), 0.01);
  }
  put(capsule(add(lo, [0, 0.036, 0.04]), add(S.at, [-0.06, 0.04, -0.25]), 0.026), 0.02);
  return ops;
}

// Gilt bronze: the brown of the metal and the gold left on it, brighter on
// what stands out, dark in the hollows. Laid into the mesh as colours.
function patinate(geometry, tone, seed) {
  const p = geometry.getAttribute('position');
  const n = geometry.getAttribute('normal');
  const ao = geometry.getAttribute('ao');
  const c = new Float32Array(p.count * 3);
  const gold = new THREE.Color('#e0b56c');
  const brown = new THREE.Color('#6b4a2a');
  const dark = new THREE.Color('#2a1b10');
  const col = new THREE.Color();
  const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y, z, f) => {
    // (value noise, blotches some centimetres across)
    const X = x * f; const Y = y * f; const Z = z * f;
    const i = Math.floor(X); const j = Math.floor(Y); const k = Math.floor(Z);
    const u = X - i; const v = Y - j; const w = Z - k;
    const s = (t) => t * t * (3 - 2 * t);
    const l = (a, b, t) => a + (b - a) * s(t);
    return l(l(l(hash(i, j, k), hash(i + 1, j, k), u), l(hash(i, j + 1, k), hash(i + 1, j + 1, k), u), v),
      l(l(hash(i, j, k + 1), hash(i + 1, j, k + 1), u), l(hash(i, j + 1, k + 1), hash(i + 1, j + 1, k + 1), u), v), w);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const open = ao.getX(i);
    const worn = 0.55 * noise(x, y, z, 9) + 0.3 * noise(x, y, z, 31) + 0.25 * Math.max(0, n.getY(i)) - 0.15;
    col.copy(brown).lerp(gold, Math.min(1, Math.max(0, worn * open + tone - 0.45)));
    col.lerp(dark, Math.pow(1 - open, 1.4) * 0.85);
    c.set([col.r, col.g, col.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

let bronze = null;
const plainBronze = () => (bronze ??= new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.4 }));

// Sculpt, colour and cast one figure (a fine grid on a computer, coarser on
// a phone). The room gives its own material, with its light in it.
// castPensiveStatue() works between frames and resolves with the mesh.
export function buildPensiveStatue(spec = STATUES[1], material = plainBronze(), { h = 0.0065, stats } = {}) {
  return finish(spec, sculpt(pensiveShapes(spec), { h, stats }), material);
}
export async function castPensiveStatue(spec = STATUES[1], material = plainBronze(), { h = 0.0065, stats } = {}) {
  return finish(spec, await sculptLater(pensiveShapes(spec), { h, stats }), material);
}
function finish(spec, geometry, material) {
  patinate(geometry, spec.tone ?? 0.5, spec.id.length * 3.1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(spec.scale ?? 1);
  mesh.name = `pensive-${spec.id}`;
  mesh.userData.touch = cheekPoint(0.014);
  return mesh;
}
