// Sphere (Las Vegas) as pure geometry: the dome screen, the four stacked
// seating tiers (100-400 levels) fanned around the end stage, the floor, the
// vomitories and the lifts behind them - as height functions over (x, z), the
// same way hallplan.js describes the concert hall. The stage itself (boards,
// risers, shell, stairs) is shared with the hall, so the orchestra, the stage
// crew and their routes work unchanged.
//
// Proportions follow the real building: the interior screen is a spherical
// cap about 73 m (240 ft) tall wrapping ~270 degrees round the audience, the
// seating bowl is four steep cantilevered tiers taking two thirds of the
// interior, the 200 level overhangs the back of the 100 level, and the lowest
// edge of the screen sits just behind the stage.
import { IS_SPHERE } from './venue.js';
import { STAGE_Y } from '../layout.js';
import { HALL, LEVELS, ENTRY, setPlanOverride, onStage, insideShell, stageFloorY, stageStairsY, lipZ } from './hallplan.js';

const DEG = Math.PI / 180;

// ------------------------------------------------------------------ dome
// The inner surface is a sphere; the screen is the part of it above a plane
// tilted up toward the back (low behind the stage, high behind the 400s).
export const SP = {
  C: { x: 0, y: 24, z: 30 }, // centre of the inner sphere
  R: 58,
  F: { x: 0, z: -6 }, // the seating fans out around this point
  // screen where y - EDGE.k * z > EDGE.d   (k: tilt, d: offset)
  EDGE: { k: 0.42, d: 0 },
  VIEW: { x: 0, y: 19, z: 34 }, // the content's sweet spot (centre of the 300s)
};
{
  // the screen comes down to ~1.2 m above the floor behind the stage
  const y = 1.2;
  const r = Math.sqrt(SP.R * SP.R - (y - SP.C.y) ** 2);
  const z = SP.C.z - r;
  SP.EDGE.d = y - SP.EDGE.k * z;
  SP.EDGE.zFront = z;
}
export const onScreen = (x, y, z) => y - SP.EDGE.k * z > SP.EDGE.d;
export function insideSphere(x, y, z, margin = 0) {
  return Math.hypot(x - SP.C.x, y - SP.C.y, z - SP.C.z) < SP.R - margin;
}

// ------------------------------------------------------------------ tiers
// r: distance from F in plan; th: angle from the stage axis (+x is th > 0).
// Every row is a level tread [r0 + i*depth, r0 + (i+1)*depth) at y0 + i*rise.
export const TIERS = [
  { n: 1, name: '100 레벨', r0: 22.0, rows: 22, depth: 0.92, rise: 0.40, y0: 0.4, span: 80, solid: true },
  { n: 2, name: '200 레벨', r0: 37.0, rows: 18, depth: 0.95, rise: 0.54, y0: 12.6, span: 74 },
  { n: 3, name: '300 레벨', r0: 50.0, rows: 16, depth: 0.95, rise: 0.62, y0: 24.6, span: 66 },
  { n: 4, name: '400 레벨', r0: 60.0, rows: 15, depth: 0.95, rise: 0.7, y0: 36.8, span: 58 },
].map((T) => {
  const rEnd = T.r0 + T.rows * T.depth;
  const T2 = { ...T, spanRad: T.span * DEG, rEnd, aisleY: T.y0 + T.rows * T.rise, rBack: rEnd + 2.4 };
  // how far round each row may run before it meets the dome (head room 2.2 m)
  T2.thMax = [];
  for (let i = 0; i <= T.rows; i++) {
    const r = i < T.rows ? T.r0 + (i + 0.5) * T.depth : rEnd + 1.2;
    const y = (i < T.rows ? T.y0 + i * T.rise : T2.aisleY) + 1.4;
    let lo = 0;
    let hi = T2.spanRad;
    if (fits(r, hi, y)) lo = hi;
    else for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (fits(r, m, y)) lo = m; else hi = m; }
    T2.thMax.push(lo);
  }
  return T2;
});
function fits(r, th, y) {
  const x = SP.F.x + r * Math.sin(th);
  const z = SP.F.z + r * Math.cos(th);
  return insideSphere(x, y, z, 2.2) && insideSphere(x, y + 1.2, z, 1.0);
}
export const LEVEL_Y = [0, ...TIERS.map((T) => T.aisleY)];
export const LEVEL_NAMES = ['플로어', ...TIERS.map((T) => T.name)];

// aisles: section boundaries as fractions of each tier's span; seven
// sections per level, numbered 101..107 from the audience's left
export const AISLE_FR = [-0.72, -0.46, -0.2, 0.2, 0.46, 0.72];
export const AISLE_HALF = 0.6; // metres either side of the aisle line
export const VOM_FR = [-0.2, 0.2]; // the doorways sit at the centre section's aisles
export const VOM = { w: 2.2, h: 3.0, len: 3.8, carLen: 2.7, carW: 2.5 };

export function polarF(x, z) {
  const dx = x - SP.F.x;
  const dz = z - SP.F.z;
  return { r: Math.hypot(dx, dz), th: Math.atan2(dx, dz) };
}
export function fromPolar(r, th) {
  return { x: SP.F.x + r * Math.sin(th), z: SP.F.z + r * Math.cos(th) };
}

export function inAisle(T, r, th) {
  return AISLE_FR.some((f) => Math.abs((th - f * T.spanRad) * r) < AISLE_HALF);
}
export function sectionOf(T, th) {
  const f = th / T.spanRad;
  let k = 0;
  for (const a of AISLE_FR) if (f > a) k++;
  return k + 1; // 1..7
}

// the height of tier T at (r, th), or null off the tier
function tierY(T, r, th) {
  if (r < T.r0 || r >= T.rBack) return null;
  const ath = Math.abs(th);
  if (r < T.rEnd) {
    const i = Math.floor((r - T.r0) / T.depth);
    if (ath > T.thMax[i]) return null;
    if (inAisle(T, r, th)) {
      // aisle stairs: two half steps per row
      const h = Math.floor(((r - T.r0) / T.depth) * 2);
      return T.y0 + (h * T.rise) / 2;
    }
    return T.y0 + i * T.rise;
  }
  // the cross-aisle behind the last row
  if (ath > T.thMax[T.rows]) return null;
  return T.aisleY;
}

// vomitory tunnels and the lift cars behind them: rectangles in the frame of
// the radial line at th (u outward from the back wall, v across)
export const VOMS = [];
for (const T of TIERS) {
  for (const f of VOM_FR) {
    const th = f * T.spanRad;
    VOMS.push({ index: VOMS.length, tier: T, th, side: f < 0 ? 'L' : 'R', y: T.aisleY, r0: T.rBack, r1: T.rBack + VOM.len, r2: T.rBack + VOM.len + VOM.carLen });
  }
}
// the lift doors (at u = r1) are walls while they are shut; the scene sets this
export const LIFT_SHUT = new Set();
// (u, v) of a point relative to a vom's radial line
export function vomUV(V, x, z) {
  const sx = Math.sin(V.th);
  const cz = Math.cos(V.th);
  const dx = x - SP.F.x;
  const dz = z - SP.F.z;
  return { u: dx * sx + dz * cz, v: dx * cz - dz * sx };
}
export function vomAt(x, z, fy = null) {
  for (const V of VOMS) {
    if (fy !== null && Math.abs(fy - V.y) > 1.2) continue;
    const { u, v } = vomUV(V, x, z);
    if (u >= V.r0 - 0.05 && u < V.r1 && Math.abs(v) < VOM.w / 2) return { V, car: false, u, v };
    if (u >= V.r1 && u < V.r2 && Math.abs(v) < VOM.carW / 2) return { V, car: true, u, v };
  }
  return null;
}

// ------------------------------------------------------------- the floor
// Flat floor at y = 0 inside the dome's footprint, wherever the 100 level
// (built solid down to the floor) or the stage isn't.
const FLOOR_R = Math.sqrt(SP.R * SP.R - SP.C.y * SP.C.y) - 1.2;
function floorOK(x, z) {
  if (Math.hypot(x - SP.C.x, z - SP.C.z) > FLOOR_R) return false;
  if (Math.abs(x) <= HALL.stageHalfW + 0.05 && z >= HALL.front - 0.3 && z <= lipZ(Math.max(-HALL.stageHalfW, Math.min(HALL.stageHalfW, x)))) return false;
  const { r, th } = polarF(x, z);
  const T = TIERS[0];
  if (r >= T.r0 - 0.02) {
    // under the 100 level, or out behind it in the concourse ring
    if (r < T.rEnd) { const i = Math.floor((r - T.r0) / T.depth); if (Math.abs(th) <= T.thMax[i] + 0.004) return false; }
    else if (Math.abs(th) <= T.spanRad + 0.03) return false;
  }
  return true;
}

// ------------------------------------------------------------ all surfaces
function surfacesAt(x, z, out) {
  if (onStage(x, z) && insideShell(x, z)) out.push(stageFloorY(x, z));
  const st = stageStairsY(x, z);
  if (st !== null) out.push(st);
  if (floorOK(x, z)) out.push(0);
  const { r, th } = polarF(x, z);
  for (const T of TIERS) {
    const y = tierY(T, r, th);
    if (y !== null) out.push(y);
  }
  const vm = vomAt(x, z);
  if (vm) out.push(vm.V.y);
  return out;
}

function floorAt(x, z) {
  const st = stageStairsY(x, z);
  if (st !== null) return st;
  const { r, th } = polarF(x, z);
  const y = tierY(TIERS[0], r, th);
  return y ?? 0;
}

// Balcony fronts and the open ends of the upper tiers carry glass rails;
// you can't walk through them, only jump over.
const VAULT = 0.2;
function barrierTop(x, z, fy) {
  if (LIFT_SHUT.size) {
    for (const i of LIFT_SHUT) {
      const V = VOMS[i];
      if (Math.abs(fy - V.y) > 1.2) continue;
      const { u, v } = vomUV(V, x, z);
      if (Math.abs(u - V.r1) < 0.12 && Math.abs(v) < VOM.carW / 2) return V.y + VOM.h;
    }
  }
  const { r, th } = polarF(x, z);
  const ath = Math.abs(th);
  for (const T of TIERS) {
    if (fy < T.y0 - 0.45 || fy > T.aisleY + 0.5) continue;
    // the front parapet, along the bowed front of the tier
    const top = T.y0 + 1.0;
    if (!T.solid && r > T.r0 - 0.45 && r < T.r0 + 0.06 && ath <= T.thMax[0] + 0.02 && fy < top - VAULT) return top;
    // the open side ends of each row
    if (r >= T.r0 && r < T.rBack) {
      const i = Math.min(T.rows, Math.floor((r - T.r0) / T.depth));
      const yRow = i < T.rows ? T.y0 + i * T.rise : T.aisleY;
      const edge = T.thMax[i];
      const d = (ath - edge) * r;
      // (the 100 level is solid to the floor: its low front rows need none)
      if (T.solid && yRow < 0.9) continue;
      // (the cross-aisle behind the last row ends in a full-height wall - no
      // rail to swing over, see sphere.js)
      if (i >= T.rows) { if (d > -0.12 && d < 0.18 && fy > yRow - 0.45 && fy < yRow + 3.0) return yRow + 4.0; } else if (d > -0.12 && d < 0.18 && fy > yRow - 0.45 && fy < yRow + 1.0 - VAULT) return yRow + 1.0;
    }
  }
  return null;
}

function levelName(y) {
  let k = 0;
  for (let i = 0; i < LEVEL_Y.length; i++) if (y > LEVEL_Y[i] - 2.5) k = i;
  return LEVEL_NAMES[k];
}

// --------------------------------------------------------------- entrance
// You come in through the right-hand vomitory of the 200 level: out of a dark
// tunnel, into the bowl, with the dome opening over your head.
const V2 = VOMS.find((v) => v.tier.n === 2 && v.side === 'R');
export const SPHERE_ENTRY = (() => {
  const p = fromPolar(V2.r0 + 1.6, V2.th);
  const look = fromPolar(10, 0);
  return { pos: { x: p.x, y: V2.y, z: p.z }, look: { x: look.x, y: 8, z: look.z } };
})();

// wide shots for the auto-director (and nothing hall-specific)
const WIDE = [
  // (every one checked to be in open air - not inside a tier or under a slab)
  { kind: 'wide', pos: [0, 12, 22], look: [0, 4, -6], fov: 60, drift: [0, -1, -4] },
  { kind: 'wide2', pos: [-20.3, 30, 37.5], look: [0, 6, -6], fov: 58, drift: [6, 0, 0] },
  { kind: 'wide3', pos: [26, 9, 14], look: [-2, 5, -6], fov: 60, drift: [0, 0, 4] },
  { kind: 'floor', pos: [0, 1.7, 8], look: [0, 18, -14], fov: 74, drift: [2, 0, -2] },
  { kind: 'top', pos: [0, 50, 63], look: [0, 10, -4], fov: 64, drift: [-4, 0, 0] },
  { kind: 'dome', pos: [0, 6, 12], look: [0, 40, 30], fov: 84, drift: [0, 0, 4] },
];

if (IS_SPHERE) {
  setPlanOverride({ surfacesAt, floorAt, barrierTop, levelName });
  for (let i = 0; i < LEVELS.length; i++) LEVELS[i] = LEVEL_Y[Math.min(i + 1, LEVEL_Y.length - 1)];
  // the stage, shell, risers and the stage stairs keep the hall's numbers;
  // only the room's extent changes
  HALL.halfW = SP.R;
  HALL.back = SP.C.z + SP.R;
  HALL.ceiling = SP.C.y + SP.R - 6;
  Object.assign(ENTRY.pos, SPHERE_ENTRY.pos);
  Object.assign(ENTRY.look, SPHERE_ENTRY.look);
  ENTRY.wide = WIDE;
}

// --------------------------------------------------------------- seats
const rowNo = (i) => i + 1;
export function sphereSeatList() {
  const list = [];
  // floor: straight rows facing the stage, a centre aisle and two side aisles
  let rowIdx = 0;
  for (let z = 4.6; z < 15.6; z += 1.0, rowIdx++) {
    let num = 1;
    const shift = rowIdx % 2 ? 0.27 : 0;
    for (let x = -18 + shift; x <= 18; x += 0.54) {
      if (Math.abs(x) < 0.9 || Math.abs(Math.abs(x) - 9) < 0.7) continue;
      if (polarF(x, z).r > TIERS[0].r0 - 1.0) continue;
      if (z < lipZ(Math.max(-HALL.stageHalfW, Math.min(HALL.stageHalfW, x))) + 3.2) continue;
      const yaw = Math.atan2(x, z + 6) * 0.35;
      list.push({ x, y: 0, z, yaw, type: 'sphere', color: '#1b2233', level: '플로어', section: x < 0 ? 'FL' : 'FR', row: `${rowIdx + 1}`, num: num++, rowSlope: 0 });
    }
  }
  for (const T of TIERS) {
    for (let i = 0; i < T.rows; i++) {
      const r = T.r0 + i * T.depth + 0.55;
      const pitch = 0.53;
      const thM = T.thMax[i] - 0.25 / r;
      const n = Math.floor((2 * thM * r) / pitch);
      const shift = i % 2 ? 0.5 : 0;
      const nums = {};
      for (let k = 0; k <= n; k++) {
        const th = -thM + ((k + shift) * pitch) / r;
        if (th > thM) break;
        if (AISLE_FR.some((f) => Math.abs((th - f * T.spanRad) * r) < AISLE_HALF + 0.24)) continue;
        // the low front rows at the far ends of the 100s look at the side of
        // the stage from below its deck: no seats there (an open wedge that
        // narrows row by row; measured from each seat's eye)
        if (T.n === 1 && i < 10 && Math.abs(th) > 1.13 + 0.025 * i) continue;
        const p = fromPolar(r, th);
        const sec = sectionOf(T, th);
        nums[sec] = (nums[sec] || 0) + 1;
        list.push({
          x: p.x, y: T.y0 + i * T.rise, z: p.z, yaw: th, type: 'sphere', color: '#1b2233',
          level: T.name, tier: T.n, section: `${T.n}0${sec}`, row: `${rowNo(i)}`, num: nums[sec], rowSlope: -Math.tan(th),
          // the seat is solid right back to the riser of the row behind (no
          // slot behind the shell to drop into from the row above)
          backLen: T.depth - 0.55 - 0.04,
        });
      }
    }
  }
  list.forEach((s, i) => {
    s.index = i;
    s.label = s.level === '플로어' ? `플로어 ${s.section} · ${s.row}열 ${s.num}번` : `섹션 ${s.section} · ${s.row}열 ${s.num}번`;
  });
  return list;
}

// the acoustics: a huge but heavily damped room, the music carried to every
// seat by beam-steered arrays behind the screen - so the level falls off
// gently (linear, ~3.5 dB from the floor to the top of the 400s, measured
// offline) while the image stays on the stage; little air loss, a dry tail
export const SPHERE_ACOUSTICS = { rt60: 1.6, preDelay: 0.05, length: 3.0, model: 'linear', refDistance: 8, rolloff: 0.55, airMin: 7500, airK: 0.018, reverb: 0.5, level: 0.33 };

export { STAGE_Y };
