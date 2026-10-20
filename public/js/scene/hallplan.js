// The floor plan of the hall as pure geometry: every walkable surface
// (stage, risers, stairs, raked stalls, three balcony tiers, the foyer and
// its spiral staircases) as height functions over (x, z). The scene builds
// meshes from the same numbers, the stage crew plans walks over them and
// you walk on them - so nothing floats and nothing is climbed without stairs.
import { STAGE_Y, PODIUM } from '../layout.js';

const DEG = Math.PI / 180;

export const HALL = {
  halfW: 15,
  front: -13.6, // stage back wall
  back: 31.5, // hall back wall (inner face)
  wallT: 0.4,
  ceiling: 23.5, // set from the floor levels below
  firstRow: 3.2,
  rowGap: 0.95,
  rows: 26,
  stageHalfW: 12.4,
  prosZ: -0.65, // proscenium return walls
};

export function rakeY(z) {
  // steep enough that every row sees over the heads in front
  return z < 2.6 ? 0 : (z - 2.6) * 0.15;
}

// floor-to-floor levels: stalls top / lobby, then 2층, 3층, 4층
export const Y1 = rakeY(HALL.back);
export const LEVELS = [Y1, Y1 + 5, Y1 + 10, Y1 + 15];
HALL.ceiling = Math.round((LEVELS[3] + 4.1) * 100) / 100;
export const LEVEL_NAMES = ['1층', '2층', '3층', '4층'];

// stage front lip: a gentle curve bulging toward the audience
export function lipZ(x) {
  const t = (x + HALL.stageHalfW) / (HALL.stageHalfW * 2);
  return -0.3 + 2 * t * (1 - t) * 1.9;
}

// --------------------------------------------------------------- the shell
// Curved wooden acoustic shell around the orchestra, elliptical about the
// podium, open to the audience. Doors for the musicians at +-DOOR_A.
export const SHELL = { R: 11.2, zScale: 0.9, a0: -100 * DEG, a1: 100 * DEG, height: 6.0, doorA: 72 * DEG, doorW: 1.5, doorH: 2.5 };

export function shellPoint(a, r = SHELL.R) {
  return { x: PODIUM.x + r * Math.sin(a), z: PODIUM.z - r * Math.cos(a) * SHELL.zScale };
}

// outward normal of the ellipse at angle a (xz)
export function shellNormal(a) {
  const nx = Math.sin(a) / 1;
  const nz = -Math.cos(a) / SHELL.zScale;
  const l = Math.hypot(nx, nz);
  return { x: nx / l, z: nz / l };
}

function shellRadius(x, z) {
  const dx = x - PODIUM.x;
  const dz = (z - PODIUM.z) / SHELL.zScale;
  return Math.hypot(dx, dz);
}

export function insideShell(x, z, margin = 0.22) {
  if (z >= HALL.prosZ + margin) return true;
  return shellRadius(x, z) < SHELL.R - margin;
}

export const DOORS = [-1, 1].map((side) => {
  const a = side * SHELL.doorA;
  const p = shellPoint(a);
  const n = shellNormal(a);
  return {
    side: side < 0 ? 'L' : 'R',
    a,
    pos: p,
    normal: n,
    // a step inside the stage and a hidden spot behind the door
    inside: { x: p.x - n.x * 0.9, z: p.z - n.z * 0.9 },
    behind: { x: p.x + n.x * 1.1, z: p.z + n.z * 1.1 },
  };
});

// ----------------------------------------------------------------- risers
// Annular sectors around the podium. Each has a flight of steps at both
// ends continuing the arc down to the stage floor.
export const RISERS = [
  { r0: 4.6, r1: 5.9, h: 0.3, a: 80 },
  { r0: 5.9, r1: 7.2, h: 0.6, a: 80 },
  { r0: 7.2, r1: 8.55, h: 0.9, a: 80 },
  { r0: 8.55, r1: 9.3, h: 1.25, a: 48 },
  { r0: 9.3, r1: 9.95, h: 1.6, a: 42 },
].map((R) => {
  const n = Math.max(1, Math.ceil(R.h / 0.18) - 1); // treads
  const rm = (R.r0 + R.r1) / 2;
  const tread = 0.3;
  return { ...R, aRad: R.a * DEG, treads: n, rise: R.h / (n + 1), span: (n * tread) / rm };
});

export const PODIUM_R = 0.6;
export const PODIUM_H = 0.22;

function polar(x, z) {
  const dx = x - PODIUM.x;
  const dz = z - PODIUM.z;
  return { r: Math.hypot(dx, dz), a: Math.atan2(dx, -dz) };
}

// height of the stage floor at (x, z), risers and their steps included
export function stageFloorY(x, z) {
  const { r, a } = polar(x, z);
  const aa = Math.abs(a);
  for (const R of RISERS) {
    if (r < R.r0 || r >= R.r1) continue;
    if (aa < R.aRad) return STAGE_Y + R.h;
    if (aa < R.aRad + R.span) {
      const k = Math.floor(((aa - R.aRad) / R.span) * R.treads);
      return STAGE_Y + R.rise * (R.treads - k);
    }
  }
  if (r < PODIUM_R) return STAGE_Y + PODIUM_H;
  return STAGE_Y;
}

export function onStage(x, z) {
  return Math.abs(x) <= HALL.stageHalfW && z >= HALL.front + 0.2 && z <= lipZ(x);
}

// ------------------------------------------------- stairs: stage <-> stalls
export const STAGE_STAIRS = [-1, 1].map((side) => {
  const cx = side * 9.6;
  const w = 1.7;
  const n = 6; // risers
  const top = Math.max(lipZ(cx - w / 2), lipZ(cx + w / 2)) + 0.05;
  return { side, cx, w, x0: cx - w / 2, x1: cx + w / 2, z0: top, tread: 0.3, n, rise: STAGE_Y / n, z1: top + (n - 1) * 0.3 };
});

function stageStairsY(x, z) {
  for (const S of STAGE_STAIRS) {
    if (x < S.x0 || x > S.x1) continue;
    if (z <= lipZ(x) || z >= S.z1) continue;
    if (z < S.z0) return STAGE_Y;
    const k = Math.floor((z - S.z0) / S.tread) + 1; // 1..n-1
    return STAGE_Y - S.rise * k;
  }
  return null;
}

// ---------------------------------------------------------------- balconies
// Rear tiers bowed toward the stage, plus side galleries along the walls.
// Seats sit on rows; aisles have half-height steps.
const bow = (x, c) => -c * (1 - (x / HALL.halfW) ** 2);
export const BALCONIES = [
  { level: 1, name: '2층', zFront: 23.2, rows: 7, depth: 0.95, rise: 0.36, sideX: 12.6, sideZ0: 5.0, bow: 1.3 },
  { level: 2, name: '3층', zFront: 25.1, rows: 5, depth: 0.95, rise: 0.46, sideX: 13.0, sideZ0: 6.5, bow: 1.0 },
  { level: 3, name: '4층', zFront: 27.0, rows: 3, depth: 0.95, rise: 0.58, sideX: 13.4, sideZ0: 8.0, bow: 0.7 },
].map((B) => {
  const top = LEVELS[B.level];
  const y0 = top - B.rows * B.rise;
  const zRows0 = B.zFront + 0.35;
  return { ...B, top, y0, zRows0, zAisle: zRows0 + B.rows * B.depth };
});
export const BALCONY_AISLES = [-7.1, 7.1]; // in line with the doors
// the second row in the 2층 boxes sits on a low dais
export const BOX_DAIS_X = 13.75;
export const BOX_DAIS_H = 0.42;
export const AISLE_HALF = 0.55;

// s: distance along the rows measured from the (bowed) parapet line
export function balconyS(B, x, z) {
  return z - (B.zRows0 + bow(x, B.bow));
}
export function balconyZ(B, x, s) {
  return B.zRows0 + bow(x, B.bow) + s;
}

function balconyY(B, x, z) {
  const ax = Math.abs(x);
  if (ax > HALL.halfW || z > HALL.back) return null;
  const s = balconyS(B, x, z);
  const rowsLen = B.rows * B.depth;
  if (s >= rowsLen) return B.top; // cross aisle at the back
  if (s >= 0) {
    const inAisle = BALCONY_AISLES.some((c) => Math.abs(x - c) < AISLE_HALF);
    if (inAisle) return B.y0 + (Math.floor((s / B.depth) * 2) * B.rise) / 2;
    return B.y0 + Math.floor(s / B.depth) * B.rise;
  }
  // in front of the rows: the side gallery, or nothing (the parapet / void)
  if (ax >= B.sideX && z >= B.sideZ0) return B.y0 + (B.level === 1 && ax >= BOX_DAIS_X ? BOX_DAIS_H : 0);
  return null;
}

// --------------------------------------------------------------- foyer
export const FOYER = {
  z0: HALL.back + HALL.wallT, // 31.9
  z1: 42,
  galleryZ: 34.9, // galleries run along the hall's back wall
  bridgeW: 1.6,
};
export const HALL_DOORS = [-7.1, 7.1]; // through the back wall, every level
export const HALL_DOOR_W = 2.0;
export const HALL_DOOR_H = 2.6;

// Each turn of a spiral climbs one floor. At every floor there is a flat
// landing (a sector of the circle) facing the gallery bridge; the steps run
// from one landing round to the next.
export const SPIRAL = {
  centers: [{ x: -10.4, z: 38.4 }, { x: 10.4, z: 38.4 }],
  rIn: 0.42,
  rOut: 2.45,
  pitch: 5, // one turn per floor
  steps: 26, // treads between two landings
  landing: 0.17, // fraction of a turn that is flat landing
};
export const SPIRAL_RISE = SPIRAL.pitch / (SPIRAL.steps + 1);

const TAU = Math.PI * 2;
// u in [0,1): fraction of a turn from the start of the landing; the landing
// [0, landing) is centred on the bridge, which points toward -z
function spiralU(c, x, z) {
  const a = Math.atan2(x - c.x, -(z - c.z)) * (c.x < 0 ? -1 : 1);
  const u = (((a % TAU) + TAU) % TAU) / TAU + SPIRAL.landing / 2;
  return u - Math.floor(u);
}

// the angle (before mirroring) at which a given u lies
export function spiralAngle(u) {
  return (u - SPIRAL.landing / 2) * TAU;
}

// tread height on `turn` (0 = from the lobby) at u in [landing, 1)
export function spiralStepY(u, turn) {
  const L = SPIRAL.landing;
  const k = Math.min(SPIRAL.steps - 1, Math.floor(((u - L) / (1 - L)) * SPIRAL.steps));
  return LEVELS[0] + SPIRAL.pitch * turn + SPIRAL_RISE * (k + 1);
}

export const BRIDGE_END = (c) => c.z - 2.25;

function foyerSurfaces(x, z, out) {
  const ax = Math.abs(x);
  if (ax > HALL.halfW || z < HALL.back || z > FOYER.z1) return;
  // door thresholds through the back wall
  if (z < FOYER.z0) {
    if (HALL_DOORS.some((d) => Math.abs(x - d) < HALL_DOOR_W / 2 - 0.15)) {
      for (const Y of LEVELS) out.push(Y);
    }
    return;
  }
  let nearNewel = false;
  for (const c of SPIRAL.centers) {
    const r = Math.hypot(x - c.x, z - c.z);
    if (r < SPIRAL.rIn + 0.1) { nearNewel = true; break; }
    if (r <= SPIRAL.rOut) {
      const u = spiralU(c, x, z);
      if (u < SPIRAL.landing) for (let k = 1; k < LEVELS.length; k++) out.push(LEVELS[k]);
      else for (let turn = 0; turn < 3; turn++) out.push(spiralStepY(u, turn));
    }
  }
  if (!nearNewel && !foyerColumnAt(x, z)) out.push(LEVELS[0]);
  // galleries and their bridges to the stairs
  const onGallery = z <= FOYER.galleryZ;
  const onBridge = SPIRAL.centers.some((c) => Math.abs(x - c.x) < FOYER.bridgeW / 2 && z > FOYER.galleryZ - 0.01 && z < BRIDGE_END(c));
  if (onGallery || onBridge) for (let k = 1; k < LEVELS.length; k++) out.push(LEVELS[k]);
}

export const FOYER_COLUMNS = [-6, -2.2, 2.2, 6].map((x) => ({ x, z: FOYER.galleryZ - 0.35, r: 0.36 }));
function foyerColumnAt(x, z) {
  return FOYER_COLUMNS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.2);
}

// ------------------------------------------------------------ all surfaces
// Every walkable height at (x, z), unordered. Walls are simply places where
// no surface exists.
export function surfacesAt(x, z, out = []) {
  out.length = 0;
  const ax = Math.abs(x);
  if (ax > HALL.halfW - 0.25) return out;
  // stage and its stairs
  if (onStage(x, z) && insideShell(x, z)) out.push(stageFloorY(x, z));
  const st = stageStairsY(x, z);
  if (st !== null) out.push(st);
  // stalls (raked); the sides in front of the stage too
  if (z <= HALL.back && (z > lipZ(Math.min(ax, HALL.stageHalfW) * Math.sign(x || 1)) || (ax > HALL.stageHalfW && z > HALL.prosZ + 0.25))) {
    out.push(rakeY(z));
  }
  // balconies
  if (z > 4) for (const B of BALCONIES) { const y = balconyY(B, x, z); if (y !== null) out.push(y); }
  foyerSurfaces(x, z, out);
  return out;
}

// the stage-or-stalls ground (lowest level), for the stage crew
export function floorAt(x, z) {
  if (onStage(x, z)) return stageFloorY(x, z);
  const st = stageStairsY(x, z);
  if (st !== null) return st;
  return rakeY(z);
}

const _s = [];
// Walk from feet height `fy` onto (x, z): the highest surface we can step
// up to, provided it is not a drop and nothing blocks the head.
export function stepTo(x, z, fy, { up = 0.45, down = 0.5, head = 1.8 } = {}) {
  surfacesAt(x, z, _s);
  let best = null;
  for (const h of _s) {
    if (h <= fy + up && h >= fy - down && (best === null || h > best)) best = h;
  }
  if (best === null) return null;
  for (const h of _s) {
    if (h > best + up && h - 0.35 < best + head) return null; // slab or stair above our head
  }
  return best;
}

// which floor are we on (for labels)
export function levelName(y) {
  let k = 0;
  for (let i = 0; i < LEVELS.length; i++) if (y > LEVELS[i] - 2.2) k = i;
  return LEVEL_NAMES[k];
}
