// A neighbourhood park recital. The orchestra keeps the shared stage and
// routes; the audience walks on one flat lawn, with no indoor floors.
import { VENUE } from './venue.js';
import {
  HALL, LEVELS, ENTRY, setPlanOverride, onStage,
  stageFloorY, stageStairsY,
} from './hallplan.js';

export const OUTDOOR = {
  halfW: 43, front: -37, back: 46,
  firstRow: 4.3, rowGap: 1.15, rows: 12,
  canopy: { halfW: 14.1, z0: -15.1, z1: 1.4, eaveY: 7.3, ridgeY: 9.7 },
  poles: [-1, 1].flatMap(side => [-14.6, 1.0].map(z => ({ x: side * 13.7, z, r: 0.17 }))),
};

export function outdoorTreeList() {
  let seed = 8343;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const trees = [];
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 36 : 28;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + (r() - 0.5) * 0.12;
      const radius = (ring ? 48 : 31) + r() * 6;
      const x = Math.sin(a) * radius; const z = 6 + Math.cos(a) * radius;
      if (Math.abs(x) < 8 && z > 25) continue;
      trees.push({ x, z, h: 7.5 + r() * 6, w: 2.4 + r() * 1.6, tint: r() });
    }
  }
  return trees;
}
const WALK_TREES = outdoorTreeList();

// Kept deterministic so seat IDs remain stable across visitors and reloads.
export function outdoorSeatList() {
  const seats = [];
  for (let r = 0; r < OUTDOOR.rows; r++) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 12; i++) {
        const x = side * (1.25 + i * 0.7 + (r % 2) * 0.12);
        const section = side < 0 ? 'L' : 'R';
        const row = String.fromCharCode(65 + r);
        const num = i + 1;
        seats.push({
          x, y: 0, z: OUTDOOR.firstRow + r * OUTDOOR.rowGap,
          yaw: Math.atan2(x, OUTDOOR.firstRow + r * OUTDOOR.rowGap + 7) * 0.3,
          type: 'outdoor', color: '#849084', level: '잔디마당', section, row, num,
          rowSlope: 0, pitch: 0.7, index: seats.length,
          label: `잔디마당 ${section} · ${row}열 ${num}번`,
        });
      }
    }
  }
  return seats;
}

function inPark(x, z) {
  return Math.abs(x) < OUTDOOR.halfW && z > OUTDOOR.front && z < OUTDOOR.back;
}

function surfacesAt(x, z, out) {
  if (!inPark(x, z)) return out;
  if (onStage(x, z)) {
    out.push(stageFloorY(x, z));
    return out;
  }
  const stair = stageStairsY(x, z);
  out.push(stair ?? 0);
  return out;
}

function floorAt(x, z) { return stageStairsY(x, z) ?? 0; }
function barrierTop(x, z, fy) {
  for (const p of OUTDOOR.poles) {
    if (Math.hypot(x - p.x, z - p.z) < p.r + 0.2 && fy < OUTDOOR.canopy.eaveY) return OUTDOOR.canopy.eaveY;
  }
  if (fy < 5.5 && [-15, 15].some(px => Math.hypot(x - px, z - 20) < 0.25)) return 5.5;
  for (const t of WALK_TREES) if (fy < t.h * 0.6 && Math.hypot(x - t.x, z - t.z) < 0.4) return t.h * 0.6;
  return null;
}

export const OUTDOOR_ENTRY = {
  pos: { x: 0, y: 0, z: 27 }, look: { x: 0, y: 2.8, z: -6 },
};

const WIDE = [
  { kind: 'wide', pos: [0, 5.2, 19], look: [0, 2.5, -6], fov: 58, drift: [0, -0.4, -2] },
  { kind: 'wide2', pos: [-16.5, 5.8, 15], look: [0, 2.6, -6], fov: 58, drift: [2, 0, 0] },
  { kind: 'wide3', pos: [15.5, 4.5, 9], look: [-1, 2.5, -6], fov: 64, drift: [0, 0, 2] },
  { kind: 'floor', pos: [0, 1.8, 4], look: [0, 2.8, -7], fov: 70, drift: [1.3, 0, 0] },
  { kind: 'top', pos: [0, 12.5, 29], look: [0, 2.2, -3], fov: 62, drift: [-2, -0.5, 0] },
];

if (VENUE === 'outdoor') {
  setPlanOverride({ surfacesAt, floorAt, barrierTop, levelName: y => y > 0.8 ? '마당 무대' : '잔디마당' });
  LEVELS.fill(0);
  HALL.halfW = OUTDOOR.halfW;
  HALL.back = OUTDOOR.back;
  HALL.ceiling = 25;
  Object.assign(ENTRY.pos, OUTDOOR_ENTRY.pos);
  Object.assign(ENTRY.look, OUTDOOR_ENTRY.look);
  ENTRY.wide = WIDE;
}

// Open air has a short, quiet reflection tail. A small PA keeps the far
// chairs intelligible without turning the park into a reverberant hall.
export const OUTDOOR_ACOUSTICS = {
  rt60: 0.6, preDelay: 0.016, length: 1.25, model: 'linear',
  refDistance: 8, rolloff: 0.75, airMin: 5800, airK: 0.035,
  reverb: 0.14, level: 0.4, er: 'outdoor', erLevel: 0.12,
};
