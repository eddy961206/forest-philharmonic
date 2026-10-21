// The concert hall: a grand four-level shoebox in walnut, ivory and gold.
// Raked stalls, three bowed balcony tiers with gilt fronts and boxes, a
// coffered ceiling with crystal chandeliers, a fluted wooden shell around
// the orchestra, a golden organ flanking the big screen and, above it, an
// arched window onto the moonlit forest. Behind the stalls: the foyer with
// its spiral staircases (see foyer.js). All floor heights come from
// hallplan.js so the meshes and the walking agree.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glowTexture, phys } from './materials.js';
import { STAGE_Y, PODIUM } from '../layout.js';
import {
  HALL, rakeY, lipZ, SHELL, shellPoint, DOORS, RISERS, PODIUM_R, PODIUM_H, STAGE_STAIRS, PROS_COLUMNS,
  BALCONIES, BALCONY_AISLES, AISLE_HALF, balconyZ, LEVELS, HALL_DOORS, HALL_DOOR_W, HALL_DOOR_H, BOX_DAIS_X, BOX_DAIS_H,
  rowFloorY, treadStart,
} from './hallplan.js';
import { seatList, buildSeats } from './seats.js';
import { buildFoyer } from './foyer.js';

export { HALL, rakeY, floorAt, stageFloorY } from './hallplan.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

// ----------------------------------------------------------------- helpers
const clean = (g) => {
  // Keep shared vertices on indexed primitives; expanding every triangle
  // tripled static geometry uploads without changing the rendered surface.
  const n = g;
  if (!n.index) n.setIndex(Array.from({ length: n.attributes.position.count }, (_, i) => i));
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
};
export const mergeAll = (geos) => mergeGeometries(geos.map(clean));

function addMesh(parent, geos, mat, { cast = false, receive = true } = {}) {
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeAll(geos), mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

// a box from a to b (xz) of given height and thickness, uv in metres / tile
export function wallSeg(a, b, y0, y1, t, tile = 0) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const g = new THREE.BoxGeometry(len, y1 - y0, t);
  if (tile) scaleUV(g, len / tile, (y1 - y0) / tile);
  g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
  g.translate((a.x + b.x) / 2, (y0 + y1) / 2, (a.z + b.z) / 2);
  return g;
}

function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

// planar uv from world xz (floors) or xy / zy (walls), in metres per tile
function worldUV(g, axis = 'xz', tile = 1) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const [u, v] = axis === 'xz' ? [x, z] : axis === 'xy' ? [x, y] : [z, y];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// a carpet runner laid along z: u across [x0, x0 + w], v along the run
function runnerXZ(g, x0, w) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) - x0) / w;
    uv[i * 2 + 1] = (p.getZ(i) + p.getY(i)) / (w * 1.4);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// annular sector prism around the podium; returns top and side geometries
function sectorPrism(r0, r1, a0, a1, y0, y1, seg = 24) {
  const top = [];
  const side = [];
  const P = (r, a) => [PODIUM.x + r * Math.sin(a), PODIUM.z - r * Math.cos(a)];
  for (let i = 0; i < seg; i++) {
    const aa = a0 + ((a1 - a0) * i) / seg;
    const ab = a0 + ((a1 - a0) * (i + 1)) / seg;
    const [ix0, iz0] = P(r0, aa);
    const [ox0, oz0] = P(r1, aa);
    const [ix1, iz1] = P(r0, ab);
    const [ox1, oz1] = P(r1, ab);
    top.push(ix0, y1, iz0, ox0, y1, oz0, ox1, y1, oz1, ix0, y1, iz0, ox1, y1, oz1, ix1, y1, iz1);
    // inner (front) face and outer (back) face
    side.push(ix0, y0, iz0, ix0, y1, iz0, ix1, y1, iz1, ix0, y0, iz0, ix1, y1, iz1, ix1, y0, iz1);
    side.push(ox0, y0, oz0, ox1, y0, oz1, ox1, y1, oz1, ox0, y0, oz0, ox1, y1, oz1, ox0, y1, oz0);
  }
  // end caps
  for (const a of [a0, a1]) {
    const [ix, iz] = P(r0, a);
    const [ox, oz] = P(r1, a);
    const s = a === a0 ? 1 : -1;
    if (s > 0) side.push(ix, y0, iz, ox, y0, oz, ox, y1, oz, ix, y0, iz, ox, y1, oz, ix, y1, iz);
    else side.push(ix, y0, iz, ix, y1, iz, ox, y1, oz, ix, y0, iz, ox, y1, oz, ox, y0, oz);
  }
  const mk = (arr, axis) => {
    // the loops above wind clockwise seen from outside; flip every triangle
    for (let i = 0; i < arr.length; i += 9) {
      for (let k = 0; k < 3; k++) { const t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return worldUV(g, axis, 4);
  };
  return { top: mk(top, 'xz'), side: mk(side, 'xy') };
}

// ======================================================================
// lite (phones): far fewer lights, simpler seats - see main.js
export function buildHall({ quality = 'high', lite = false } = {}) {
  const group = new THREE.Group();
  group.name = 'hall';
  const update = [];
  const H = HALL;
  const glow = glowTexture('rgba(255,214,150,1)', 'rgba(255,170,90,0)');
  const halos = []; // { sprite, base, house }
  const halo = (pos, scale, opacity = 0.5, color = '#ffd29a', house = true) => {
    // each glow is a draw call: phones keep only the big ones (chandeliers)
    if (lite && scale < 2) return null;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(pos);
    s.scale.setScalar(scale * 0.7);
    group.add(s);
    halos.push({ s, base: opacity * 0.45, house, phase: Math.random() * 10 });
    return s;
  };

  buildStage(group);
  const doorLeaves = buildShell(group);
  buildStageWall(group);
  buildStalls(group);
  buildWalls(group, halo);
  buildBalconies(group, halo);
  buildProscenium(group);
  buildCeiling(group);

  // ---------------------------------------------------------------- seats
  const seats = seatList();
  const seatData = buildSeats(seats, { lite });
  group.add(seatData.group);

  // ------------------------------------------------------------ chandeliers
  const chandeliers = [];
  // hung clear of the sightlines from the upper tiers
  for (const [z, s] of [[4.5, 0.85], [12.8, 1.1], [20.6, 0.8]]) {
    const c = buildChandelier(s);
    c.group.position.set(0, H.ceiling - 3.0 * s - 0.35, z);
    group.add(c.group);
    const topY = c.group.position.y + 0.45 * s;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, H.ceiling - topY, 8), M.gilt());
    rod.position.set(0, (H.ceiling + topY) / 2, z);
    group.add(rod);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * s, 1.15 * s, 0.12, 40), M.gilt());
    ped.position.set(0, H.ceiling - 0.06, z);
    group.add(ped);
    chandeliers.push(c);
    halo(c.group.position.clone().add(V(0, -0.4 * s, 0)), 6.5 * s, 0.32);
  }

  // ---------------------------------------------------------------- foyer
  const foyer = buildFoyer(group, { halo, lite });

  // ------------------------------------------------------------------ lights
  const lights = {};
  lights.hemi = new THREE.HemisphereLight('#ffe2c0', '#2a1a10', 0.35);
  group.add(lights.hemi);

  // front-of-house key from the ceiling, shadows on the stage
  const key = new THREE.SpotLight('#ffe9cc', 950, 0, 0.36, 0.6, 2);
  key.position.set(0, 20.5, 10);
  key.target.position.set(0, STAGE_Y, -5.4);
  key.castShadow = quality !== 'low';
  key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  key.shadow.camera.near = 8;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0001;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 4;
  group.add(key, key.target);
  lights.key = key;

  // every light is paid for by every pixel on a phone: lite keeps the key,
  // the hemisphere and one chandelier, and makes the key a little stronger
  if (lite) key.intensity *= 1.35;
  const fills = [];
  for (const sx of lite ? [] : [-1, 1]) {
    const f = new THREE.SpotLight(sx < 0 ? '#ffd7ae' : '#ffe0bf', 180, 0, 0.42, 0.75, 2);
    f.position.set(sx * 13.2, 14.5, 3);
    f.target.position.set(sx * 2.5, STAGE_Y, -5.5);
    group.add(f, f.target);
    fills.push(f);
  }
  lights.fills = fills;
  // back light from above the organ: a warm rim around the players
  if (!lite) {
    const rim = new THREE.SpotLight('#ffd6a0', 210, 0, 0.62, 0.8, 2);
    rim.position.set(0, 17, -12.5);
    rim.target.position.set(0, STAGE_Y, -3);
    group.add(rim, rim.target);
    lights.rim = rim;
  }

  // chandeliers + a soft fill under the balcony + the foyer
  const house = chandeliers.filter((c, i) => !lite || i === 1).map((c) => {
    const big = c === chandeliers[1];
    const pl = new THREE.PointLight('#ffc98a', lite ? 30 : big ? 18 : 13, lite ? 40 : 34, 1.5);
    pl.position.copy(c.group.position);
    group.add(pl);
    return { light: pl, base: pl.intensity };
  });
  if (!lite) {
    const under = new THREE.PointLight('#ffc98a', 1.6, 12, 1.2);
    under.position.set(0, rakeY(27) + 2.6, 27);
    group.add(under);
    house.push({ light: under, base: under.intensity });
  }
  for (const l of foyer.lights) house.push({ light: l, base: l.intensity, foyer: true });
  lights.house = house;

  // moonlight through the great window
  if (!lite) {
    const moon = new THREE.SpotLight('#9ab8ff', 60, 50, 0.5, 0.8, 2);
    moon.position.set(4, 21, H.front - 8);
    moon.target.position.set(-1, STAGE_Y, -5);
    group.add(moon, moon.target);
  }

  // ------------------------------------------------------------- animation
  let houseLevel = 1;
  let houseTarget = 1;
  update.push((dt, t) => {
    houseLevel += (houseTarget - houseLevel) * Math.min(1, dt * 0.8);
    for (const h of house) h.light.intensity = h.base * (h.foyer ? 0.6 + 0.4 * houseLevel : houseLevel);
    lights.hemi.intensity = 0.12 + 0.3 * houseLevel;
    M.bulb().emissiveIntensity = 0.9 + 1.6 * houseLevel;
    M.crystal().emissiveIntensity = 0.05 + 0.15 * houseLevel;
    for (const h of halos) {
      const flick = 0.94 + 0.06 * Math.sin(t * 2.3 + h.phase) * Math.sin(t * 5.1 + h.phase * 2);
      h.s.material.opacity = h.base * flick * (h.house ? 0.25 + 0.75 * houseLevel : 1);
    }
    // the musicians' doors swing open for whoever passes
    for (const d of doorLeaves) {
      d.open += ((d.door.want ? 1 : 0) - d.open) * Math.min(1, dt * 3.2);
      d.pivot.rotation.y = d.base + d.dir * d.open * 1.75;
    }
  });

  return {
    group,
    seats,
    seatMesh: seatData.pick,
    prepareRender: seatData.prepareRender,
    seatGroup: seatData.group,
    lights,
    setHouseLights(v) { houseTarget = v; },
    update(dt, t) { for (const f of update) f(dt, t); },
  };
}

// ================================================================= stage
// Materials of the stage and shell. The hall dresses them in walnut and
// gilt; other venues pass their own (see sphere.js).
const HALL_STYLE = {
  boards: () => M.stageWood(), skirt: () => M.walnut(), trim: () => M.gilt(), rail: () => M.brass(),
  carpet: () => M.carpetRoyal(), shell: () => M.shell(), leaf: () => M.walnut(),
  strip: { color: '#ffd9a0', emissive: '#ffb860', intensity: 0.8 },
  backstage: '#0b0705', shelf: true, apronPilasters: true,
};

export function buildStage(group, S = HALL_STYLE) {
  const H = HALL;
  // platform: polished boards on top, walnut skirt
  const shape = new THREE.Shape();
  shape.moveTo(-H.stageHalfW, H.front + 0.1);
  shape.lineTo(H.stageHalfW, H.front + 0.1);
  shape.lineTo(H.stageHalfW, -0.3);
  shape.quadraticCurveTo(0, 1.6, -H.stageHalfW, -0.3);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: STAGE_Y, bevelEnabled: false, curveSegments: 64 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, STAGE_Y, 0);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4);
  const stage = new THREE.Mesh(geo, [S.boards(), S.skirt()]);
  stage.receiveShadow = true;
  group.add(stage);

  // apron: gilt lip, a warm glow strip under the nosing, gilt pilasters
  const curve = (y, inset = 0) => new THREE.QuadraticBezierCurve3(V(-H.stageHalfW, y, -0.3 + inset), V(0, y, 1.6 + inset), V(H.stageHalfW, y, -0.3 + inset));
  const gilt = [new THREE.TubeGeometry(curve(STAGE_Y), 96, 0.04, 8), new THREE.TubeGeometry(curve(0.16, 0.01), 96, 0.025, 6)];
  const c0 = curve(0.5, 0.012);
  for (let i = 1; i < (S.apronPilasters ? 24 : 0); i++) {
    const p = c0.getPoint(i / 24);
    const tng = c0.getTangent(i / 24);
    const g = new THREE.BoxGeometry(0.07, STAGE_Y - 0.3, 0.03);
    g.rotateY(-Math.atan2(tng.z, tng.x));
    g.translate(p.x, 0.16 + (STAGE_Y - 0.3) / 2 + 0.04, p.z);
    gilt.push(g);
  }
  addMesh(group, gilt, S.trim());
  const strip = new THREE.Mesh(new THREE.TubeGeometry(curve(STAGE_Y - 0.09, 0.03), 96, 0.012, 6), new THREE.MeshStandardMaterial({ color: S.strip.color, emissive: S.strip.emissive, emissiveIntensity: S.strip.intensity }));
  group.add(strip);

  // risers with gilt nosing and steps at both ends
  const tops = [];
  const sides = [];
  const nosing = [];
  for (const R of RISERS) {
    const p = sectorPrism(R.r0, R.r1, -R.aRad, R.aRad, STAGE_Y, STAGE_Y + R.h, 48);
    tops.push(p.top);
    sides.push(p.side);
    const arc = [];
    for (let i = 0; i <= 48; i++) {
      const a = -R.aRad + (2 * R.aRad * i) / 48;
      arc.push(V(PODIUM.x + (R.r0 + 0.02) * Math.sin(a), STAGE_Y + R.h, PODIUM.z - (R.r0 + 0.02) * Math.cos(a)));
    }
    nosing.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 64, 0.018, 6));
    for (const s of [-1, 1]) {
      const dA = R.span / R.treads;
      for (let k = 0; k < R.treads; k++) {
        const a0 = R.aRad + k * dA;
        const y = STAGE_Y + R.rise * (R.treads - k);
        const q = s > 0 ? sectorPrism(R.r0, R.r1, a0, a0 + dA, STAGE_Y, y, 4) : sectorPrism(R.r0, R.r1, -a0 - dA, -a0, STAGE_Y, y, 4);
        tops.push(q.top);
        sides.push(q.side);
      }
    }
  }
  addMesh(group, tops, S.boards(), { cast: false });
  addMesh(group, sides, S.skirt(), { cast: true });
  addMesh(group, nosing, S.trim());

  // conductor's podium with brass rail
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(PODIUM_R - 0.05, PODIUM_R, PODIUM_H, 40), S.skirt());
  pod.position.set(PODIUM.x, STAGE_Y + PODIUM_H / 2, PODIUM.z);
  pod.receiveShadow = true;
  pod.castShadow = true;
  group.add(pod);
  const podGilt = [new THREE.TorusGeometry(PODIUM_R - 0.04, 0.012, 6, 48).rotateX(Math.PI / 2).translate(PODIUM.x, STAGE_Y + PODIUM_H, PODIUM.z)];
  podGilt.push(new THREE.TorusGeometry(0.55, 0.02, 8, 32, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI).translate(PODIUM.x, STAGE_Y + 1.05, PODIUM.z + 0.02));
  for (const a of [0.15, Math.PI / 2, Math.PI - 0.15]) {
    podGilt.push(new THREE.CylinderGeometry(0.015, 0.015, 0.84, 8).translate(PODIUM.x + Math.cos(a) * 0.55, STAGE_Y + 0.63, PODIUM.z + Math.sin(a) * 0.55));
  }
  addMesh(group, podGilt, S.rail());

  // carpeted stairs from the stalls up to the stage, brass rails
  const treads = [];
  const risersW = [];
  const rails = [];
  for (const S of STAGE_STAIRS) {
    // landing from the lip to the first step: its top sits a hair under the
    // stage boards (two surfaces at one height flicker), carpeted on top
    const landLen = S.z0 - lipZ(S.cx) + 0.4;
    const land = new THREE.BoxGeometry(S.w, STAGE_Y - 0.008, landLen);
    land.translate(S.cx, (STAGE_Y - 0.008) / 2, (S.z0 + lipZ(S.cx) - 0.4) / 2);
    risersW.push(land);
    // the landing's carpet starts exactly at the curved stage lip, so none
    // of it lies on the stage boards
    const cs = new THREE.Shape();
    const xa = S.x0 + 0.03;
    const xb = S.x1 - 0.03;
    cs.moveTo(xa, -S.z0);
    cs.lineTo(xb, -S.z0);
    for (let i = 0; i <= 12; i++) {
      const x = xb - ((xb - xa) * i) / 12;
      cs.lineTo(x, -(lipZ(x) + 0.03));
    }
    cs.closePath();
    // shape drawn in (x, -z): rotating -90deg about X lays it on the floor
    treads.push(runnerXZ(new THREE.ShapeGeometry(cs).rotateX(-Math.PI / 2).translate(0, STAGE_Y - 0.002, 0), S.x0, S.w));
    for (let k = 1; k < S.n; k++) {
      const y = STAGE_Y - S.rise * k;
      const z0 = S.z0 + (k - 1) * S.tread;
      const b = new THREE.BoxGeometry(S.w, y, S.tread + 0.02);
      b.translate(S.cx, y / 2, z0 + S.tread / 2);
      risersW.push(b);
      // carpet mapped in metres, so its pattern is not squeezed into the
      // shallow tread (that shimmered when you moved)
      treads.push(runnerXZ(new THREE.PlaneGeometry(S.w - 0.06, S.tread - 0.03).rotateX(-Math.PI / 2).translate(S.cx, y + 0.01, z0 + S.tread / 2 + 0.01), S.x0, S.w));
      rails.push(new THREE.CylinderGeometry(0.012, 0.012, S.w, 6).rotateZ(Math.PI / 2).translate(S.cx, y + 0.01, z0 + 0.012));
    }
    for (const sx of [-1, 1]) {
      const x = S.cx + sx * (S.w / 2 + 0.04);
      const a = V(x, STAGE_Y + 0.92, S.z0 - 0.3);
      const b = V(x, 0.92 + S.rise, S.z1 + 0.1);
      rails.push(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 2, 0.025, 8));
      for (let k = 0; k <= 3; k++) {
        const p = a.clone().lerp(b, k / 3);
        rails.push(new THREE.CylinderGeometry(0.014, 0.014, 0.92, 6).translate(p.x, p.y - 0.46, p.z));
      }
    }
  }
  addMesh(group, risersW, S.skirt(), { cast: true });
  addMesh(group, treads, S.carpet());
  addMesh(group, rails, S.rail());
}

// ================================================================= shell
export function buildShell(group, S = HALL_STYLE) {
  // (an arena keeps it low, so the seats round the sides see in over it)
  const height = S.shellHeight ?? SHELL.height;
  const top = STAGE_Y + height;
  const doorHalf = (SHELL.doorW / 2) / SHELL.R;
  // sample the arc, splitting exactly at the door jambs
  const angles = [];
  const N = 64;
  for (let i = 0; i <= N; i++) angles.push(SHELL.a0 + ((SHELL.a1 - SHELL.a0) * i) / N);
  for (const d of DOORS) angles.push(d.a - doorHalf, d.a + doorHalf);
  angles.sort((a, b) => a - b);
  const inDoor = (a) => DOORS.find((d) => Math.abs(a - d.a) < doorHalf - 1e-4);
  const panels = [];
  const giltG = [];
  const skirt = [];
  const caps = [];
  const T = 0.2;
  const R = SHELL.R + T / 2;
  for (let i = 0; i < angles.length - 1; i++) {
    const a = angles[i];
    const b = angles[i + 1];
    if (b - a < 1e-4) continue;
    const pa = shellPoint(a, R);
    const pb = shellPoint(b, R);
    const door = inDoor((a + b) / 2);
    const y0 = door ? STAGE_Y + SHELL.doorH : STAGE_Y;
    // past the doors the sides may step down to a low wall (S.shellSides)
    const am = Math.abs((a + b) / 2);
    const past = (am - (SHELL.doorA + doorHalf + 0.05)) / 0.1;
    const segTop = S.shellSides && past > 0 ? STAGE_Y + Math.max(S.shellSides, height - Math.min(1, past) * (height - S.shellSides)) : top;
    panels.push(wallSeg(pa, pb, y0, segTop, T));
    caps.push(wallSeg(shellPoint(a, R + 0.05), shellPoint(b, R + 0.05), segTop, segTop + 0.16, T + 0.25));
    giltG.push(wallSeg(shellPoint(a, R - 0.12), shellPoint(b, R - 0.12), segTop - 0.05, segTop + 0.02, 0.06));
    if (!door) {
      skirt.push(wallSeg(shellPoint(a, R - 0.12), shellPoint(b, R - 0.12), STAGE_Y, STAGE_Y + 0.22, 0.05));
      giltG.push(wallSeg(shellPoint(a, R - 0.13), shellPoint(b, R - 0.13), STAGE_Y + 1.02, STAGE_Y + 1.06, 0.05));
    }
    // a slim gilt fillet at every other joint
    if (i % 2 === 0 && !door && !inDoor(a + 1e-3) && segTop - STAGE_Y > 0.8) {
      const p = shellPoint(a, R - 0.12);
      const hh = segTop - STAGE_Y;
      giltG.push(new THREE.BoxGeometry(0.035, hh - 0.4, 0.035).translate(p.x, STAGE_Y + hh / 2 + 0.1, p.z));
    }
  }
  addMesh(group, panels, S.shell(), { cast: false });
  addMesh(group, caps, S.skirt());
  addMesh(group, skirt, S.skirt());
  addMesh(group, giltG, S.trim());

  // shelf above the shell, out to the hall walls
  const H = HALL;
  const sh = new THREE.Shape();
  sh.moveTo(-H.halfW, -H.prosZ);
  sh.lineTo(-H.halfW, -H.front);
  sh.lineTo(H.halfW, -H.front);
  sh.lineTo(H.halfW, -H.prosZ);
  for (let i = 0; i <= 80; i++) {
    const a = SHELL.a1 - ((SHELL.a1 - SHELL.a0) * i) / 80;
    const p = shellPoint(a, SHELL.R + T);
    sh.lineTo(p.x, -p.z);
  }
  sh.closePath();
  // shape is drawn in (x, -z) so that rotating -90deg about X lands it on xz
  const shelfGeo = new THREE.ShapeGeometry(sh);
  shelfGeo.rotateX(-Math.PI / 2);
  shelfGeo.translate(0, top + 0.16, 0);
  worldUV(shelfGeo, 'xz', 3);
  const shelfMat = S.skirt().clone();
  shelfMat.side = THREE.DoubleSide;
  if (S.shelf) group.add(new THREE.Mesh(shelfGeo, shelfMat));

  // backstage behind the doors stays dark: a dark room (inside a hall),
  // or in an open arena a black masking curtain hung just behind each door
  // (a room there would stand in the side seats' view of the stage)
  const back = [];
  for (const d of DOORS) {
    const b = d.behind;
    let g;
    if (S.backstageCurtain) {
      g = new THREE.PlaneGeometry(SHELL.doorW + 0.4, SHELL.doorH + 0.15);
      g.rotateY(Math.atan2(d.normal.x, d.normal.z));
      g.translate(d.pos.x + d.normal.x * 0.6, STAGE_Y + (SHELL.doorH + 0.15) / 2, d.pos.z + d.normal.z * 0.6);
    } else {
      g = new THREE.BoxGeometry(2.6, 3.2, 2.4);
      g.rotateY(-Math.atan2(d.normal.z, d.normal.x));
      g.translate(b.x + d.normal.x * 0.4, STAGE_Y + 1.6, b.z + d.normal.z * 0.4);
    }
    back.push(g);
  }
  const dark = new THREE.Mesh(mergeAll(back), new THREE.MeshBasicMaterial({ color: S.backstage, side: S.backstageCurtain ? THREE.DoubleSide : THREE.BackSide }));
  group.add(dark);

  // doors: gilt architrave, two walnut leaves that swing outward
  const leaves = [];
  const leafGeo = new THREE.BoxGeometry(SHELL.doorW / 2 - 0.02, SHELL.doorH - 0.04, 0.05).translate((SHELL.doorW / 2 - 0.02) / 2, (SHELL.doorH - 0.04) / 2, 0);
  const panelGeo = mergeAll([
    new THREE.BoxGeometry(0.42, 0.9, 0.012).translate(0.37, 1.65, 0.03),
    new THREE.BoxGeometry(0.42, 0.9, 0.012).translate(0.37, 0.6, 0.03),
    new THREE.BoxGeometry(0.42, 0.9, 0.012).translate(0.37, 1.65, -0.03),
    new THREE.BoxGeometry(0.42, 0.9, 0.012).translate(0.37, 0.6, -0.03),
    new THREE.SphereGeometry(0.03, 10, 8).translate(0.64, 1.1, 0.045),
  ]);
  for (const d of DOORS) {
    const yaw = Math.atan2(d.normal.x, d.normal.z); // box depth along the normal
    const tx = -d.normal.z;
    const tz = d.normal.x; // along the wall
    const fr = [];
    for (const s of [-1, 1]) {
      const jx = d.pos.x + tx * s * (SHELL.doorW / 2 + 0.05);
      const jz = d.pos.z + tz * s * (SHELL.doorW / 2 + 0.05);
      fr.push(new THREE.BoxGeometry(0.12, SHELL.doorH + 0.12, 0.3).rotateY(yaw).translate(jx, STAGE_Y + (SHELL.doorH + 0.12) / 2, jz));
    }
    fr.push(new THREE.BoxGeometry(SHELL.doorW + 0.34, 0.14, 0.3).rotateY(yaw).translate(d.pos.x, STAGE_Y + SHELL.doorH + 0.07, d.pos.z));
    addMesh(group, fr, S.trim());
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(d.pos.x + tx * s * (SHELL.doorW / 2 - 0.01), STAGE_Y + 0.02, d.pos.z + tz * s * (SHELL.doorW / 2 - 0.01));
      const leaf = new THREE.Mesh(leafGeo, S.leaf());
      const pan = new THREE.Mesh(panelGeo, S.trim());
      leaf.castShadow = true;
      pivot.add(leaf, pan);
      // closed: local +x runs from the hinge toward the door centre (-s * t)
      const base = Math.atan2(s * tz, -s * tx);
      // opening swings the free edge outward, away from the stage
      const dir = Math.sign(-Math.sin(base) * d.normal.x - Math.cos(base) * d.normal.z) || 1;
      pivot.rotation.y = base;
      group.add(pivot);
      leaves.push({ pivot, door: d, open: 0, base, dir });
    }
  }
  return leaves;
}

// ===================================================== stage end wall & organ
function buildStageWall(group) {
  const H = HALL;
  const z = H.front;
  // wall with the arched window hole
  const wx = 4.2;
  const wy0 = 14.8;
  const wy1 = 17.8;
  const shape = new THREE.Shape();
  shape.moveTo(-H.halfW - 0.4, 0);
  shape.lineTo(H.halfW + 0.4, 0);
  shape.lineTo(H.halfW + 0.4, H.ceiling + 0.4);
  shape.lineTo(-H.halfW - 0.4, H.ceiling + 0.4);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-wx, wy0);
  hole.lineTo(wx, wy0);
  hole.lineTo(wx, wy1);
  hole.absarc(0, wy1, wx, 0, Math.PI, false);
  hole.lineTo(-wx, wy0);
  shape.holes.push(hole);
  const fw = new THREE.ShapeGeometry(shape, 48);
  worldUV(fw, 'xy', 2.2);
  fw.translate(0, 0, z);
  group.add(new THREE.Mesh(fw, M.fluted()));
  const reveal = new THREE.ExtrudeGeometry(holeShape(wx, wy0, wy1), { depth: 0.8, bevelEnabled: false, curveSegments: 48 });
  reveal.translate(0, 0, z - 0.8);
  group.add(new THREE.Mesh(reveal, M.walnut()));

  // gilt window frame and mullions
  const frame = [];
  const arch = new THREE.EllipseCurve(0, wy1, wx, wx, 0, Math.PI, false);
  const pts = arch.getPoints(48).map((p) => V(p.x, p.y, z + 0.04));
  frame.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(wx, wy0, z + 0.04), ...pts, V(-wx, wy0, z + 0.04)]), 96, 0.12, 8));
  frame.push(new THREE.BoxGeometry(wx * 2 + 0.4, 0.24, 0.3).translate(0, wy0, z + 0.04));
  for (let i = -2; i <= 2; i++) {
    const x = (i * wx) / 3;
    const tp = wy1 + Math.sqrt(Math.max(0, wx * wx - x * x));
    frame.push(new THREE.BoxGeometry(0.06, tp - wy0, 0.06).translate(x, (tp + wy0) / 2, z - 0.3));
  }
  for (const y of [wy0 + 1.5, wy1 + 1.6]) {
    const half = y <= wy1 ? wx : Math.sqrt(Math.max(0, wx * wx - (y - wy1) ** 2));
    frame.push(new THREE.BoxGeometry(half * 2, 0.05, 0.06).translate(0, y, z - 0.3));
  }
  addMesh(group, frame, M.gilt());
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 34), new THREE.MeshBasicMaterial({ map: nightForestTexture(), toneMapped: false, fog: false }));
  sky.position.set(0, 14, z - 16);
  group.add(sky);

  // organ case on the shelf, golden pipes either side of the screen
  const caseG = [];
  const giltG = [];
  const pipes = [];
  const shelfY = STAGE_Y + SHELL.height + 0.16;
  for (const sx of [-1, 1]) {
    const x0 = sx * 6.6;
    const x1 = sx * 13.6;
    const cx = (x0 + x1) / 2;
    const w = Math.abs(x1 - x0);
    caseG.push(new THREE.BoxGeometry(w, 1.1, 0.9).translate(cx, shelfY + 0.55, z + 0.5));
    giltG.push(new THREE.BoxGeometry(w + 0.1, 0.08, 0.95).translate(cx, shelfY + 1.12, z + 0.52));
    // towers and flats of pipes in a gentle V
    const towers = [0, 0.25, 0.5, 0.75, 1];
    towers.forEach((u, ti) => {
      const tx = x0 + (x1 - x0) * u;
      const big = ti % 2 === 0;
      const n = big ? 5 : 7;
      const r = big ? 0.13 : 0.085;
      for (let k = 0; k < n; k++) {
        const off = (k - (n - 1) / 2) * r * 2.25;
        const hh = (big ? 6.2 : 4.3) - Math.abs(k - (n - 1) / 2) * (big ? 0.55 : 0.32) + (ti === 2 ? 1.2 : 0);
        pipes.push({ x: tx + off, z: z + (big ? 0.62 : 0.4), r, h: hh, y: shelfY + 1.16 });
      }
      if (big) {
        // a gilt crown above each tower
        giltG.push(new THREE.BoxGeometry(n * r * 2.3 + 0.2, 0.14, 0.4).translate(tx, shelfY + 1.16 + 6.2 + (ti === 2 ? 1.2 : 0) + 0.3, z + 0.62));
      }
    });
  }
  addMesh(group, caseG, M.walnut());
  addMesh(group, giltG, M.gilt());
  // pipe body scales with its length; the conical foot and the mouth don't
  const pipeGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);
  const footGeo = new THREE.ConeGeometry(1, 0.5, 16, 1, true).rotateX(Math.PI).translate(0, -0.25, 0);
  const mouthGeo = new THREE.BoxGeometry(1.1, 0.16, 0.25).translate(0, 0.14, 0.88);
  const pm = new THREE.InstancedMesh(pipeGeo, M.gilt(), pipes.length);
  const fm = new THREE.InstancedMesh(footGeo, M.gilt(), pipes.length);
  const mm = new THREE.InstancedMesh(mouthGeo, M.ebony(), pipes.length);
  const mat = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  pipes.forEach((p, i) => {
    mat.compose(V(p.x, p.y + 0.5, p.z), q0, V(p.r, p.h, p.r));
    pm.setMatrixAt(i, mat);
    mat.compose(V(p.x, p.y + 0.5, p.z), q0, V(p.r, 1, p.r));
    fm.setMatrixAt(i, mat);
    mm.setMatrixAt(i, mat);
  });
  group.add(pm, fm, mm);
}

function holeShape(wx, wy0, wy1) {
  const s = new THREE.Shape();
  s.moveTo(-wx - 0.25, wy0 - 0.25);
  s.lineTo(wx + 0.25, wy0 - 0.25);
  s.lineTo(wx + 0.25, wy1);
  s.absarc(0, wy1, wx + 0.25, 0, Math.PI, false);
  s.lineTo(-wx - 0.25, wy0 - 0.25);
  const h = new THREE.Path();
  h.moveTo(-wx, wy0);
  h.lineTo(wx, wy0);
  h.lineTo(wx, wy1);
  h.absarc(0, wy1, wx, 0, Math.PI, false);
  h.lineTo(-wx, wy0);
  s.holes.push(h);
  return s;
}

// ================================================================ stalls
function buildStalls(group) {
  const H = HALL;
  const H0 = rowFloorY(0);
  const HL = rowFloorY(H.rows - 1);
  const frontY = (z) => Math.min(rakeY(z), H0);
  const backY = (z) => Math.max(rakeY(z), HL);
  // Stepped floor over [xa, xb]: a ramp in front of the first row, one level
  // tread per row (bowed like the row) with its riser, a ramp behind the last
  const stepped = (xa, xb, lift = 0) => {
    const n = Math.max(1, Math.ceil((xb - xa) / 0.5));
    const xs = [];
    for (let i = 0; i <= n; i++) xs.push(xa + ((xb - xa) * i) / n);
    const pos = [];
    const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    const ramp = (x0, x1, za0, za1, zb0, zb1, f, N) => {
      for (let k = 0; k < N; k++) {
        const t0 = k / N;
        const t1 = (k + 1) / N;
        const a = za0 + (za1 - za0) * t0;
        const a2 = za0 + (za1 - za0) * t1;
        const b = zb0 + (zb1 - zb0) * t0;
        const b2 = zb0 + (zb1 - zb0) * t1;
        quad([x0, f(a) + lift, a], [x0, f(a2) + lift, a2], [x1, f(b2) + lift, b2], [x1, f(b) + lift, b]);
      }
    };
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      ramp(x0, x1, H.prosZ, treadStart(0, x0), H.prosZ, treadStart(0, x1), frontY, 8);
      for (let r = 0; r < H.rows; r++) {
        const y = rowFloorY(r) + lift;
        const a0 = treadStart(r, x0);
        const a1 = treadStart(r + 1, x0);
        const b0 = treadStart(r, x1);
        const b1 = treadStart(r + 1, x1);
        quad([x0, y, a0], [x0, y, a1], [x1, y, b1], [x1, y, b0]);
        const ya = (r === 0 ? frontY(a0) : rowFloorY(r - 1)) + lift;
        const yb = (r === 0 ? frontY(b0) : rowFloorY(r - 1)) + lift;
        quad([x0, ya, a0], [x0, y, a0], [x1, y, b0], [x1, yb, b0]);
      }
      const e0 = treadStart(H.rows, x0);
      const e1 = treadStart(H.rows, x1);
      quad([x0, HL + lift, e0], [x0, backY(e0) + lift, e0], [x1, backY(e1) + lift, e1], [x1, HL + lift, e1]);
      ramp(x0, x1, e0, H.back, e1, H.back, backY, 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  // runner uv: u across the runner (gold borders at its edges), v along it
  const runnerUV = (g, across0, width, along = (x, y, z) => z + y) => {
    const p = g.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      uv[i * 2] = (x - across0) / width;
      uv[i * 2 + 1] = along(x, y, z) / (width * 1.4);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  };

  const floor = new THREE.Mesh(worldUV(stepped(-H.halfW, H.halfW), 'xz', 3), M.floorWood());
  floor.receiveShadow = true;
  group.add(floor);

  // carpeted stair runners in the aisles and along the walls, brass nosings
  const runners = [];
  const brass = [];
  const lights = [];
  const aisles = [[-7.82, -6.38], [6.38, 7.82], [-H.halfW, -13.85], [13.85, H.halfW]];
  for (const [xa, xb] of aisles) {
    runners.push(runnerUV(stepped(xa, xb, 0.012), xa, xb - xa));
    for (let r = 1; r < H.rows; r++) {
      const y = rowFloorY(r) + 0.02;
      brass.push(new THREE.TubeGeometry(new THREE.LineCurve3(V(xa + 0.03, y, treadStart(r, xa) + 0.01), V(xb - 0.03, y, treadStart(r, xb) + 0.01)), 1, 0.011, 6));
    }
  }
  // the two main aisles get a warm step light in every riser, both sides
  for (const ax of [-7.1, 7.1]) {
    for (let r = 1; r < H.rows; r++) {
      const ym = (rowFloorY(r - 1) + rowFloorY(r)) / 2;
      for (const s of [-1, 1]) {
        const x = ax + s * 0.6;
        lights.push(V(x, ym, treadStart(r, x) - 0.008));
      }
    }
  }
  // cross-aisles in front of the first row and at the back
  const cross = (z0, z1, f) => {
    const g = new THREE.PlaneGeometry(H.halfW * 2, z1 - z0, 1, 10);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const zz = p.getZ(i) + (z0 + z1) / 2;
      p.setZ(i, zz);
      p.setY(i, f(zz) + 0.014);
    }
    g.computeVertexNormals();
    // a runner along x: borders run the length of the aisle
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getZ(i) - z0) / (z1 - z0), p.getX(i) / ((z1 - z0) * 1.4));
    return g;
  };
  runners.push(cross(1.2, 2.6, () => 0), cross(H.back - 1.5, H.back, backY));
  addMesh(group, runners, M.carpetRoyal());
  addMesh(group, brass, M.brass());
  const lg = new THREE.BoxGeometry(0.07, 0.025, 0.012);
  const lm = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffae4a', emissiveIntensity: 1.3 }), lights.length);
  const m = new THREE.Matrix4();
  lights.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); lm.setMatrixAt(i, m); });
  group.add(lm);
}

// ================================================================= walls
function buildWalls(group, halo) {
  const H = HALL;
  // the side walls run the whole length, enclosing the stage house too
  const len = H.back - H.front;
  const wall = [];
  const wains = [];
  const giltG = [];
  const pil = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.PlaneGeometry(len, H.ceiling);
    g.rotateY(-sx * Math.PI / 2);
    g.translate(sx * H.halfW, H.ceiling / 2, (H.back + H.front) / 2);
    worldUV(g, 'zy', 2.2);
    wall.push(g);
    // walnut wainscot following the rake, gilt chair rail
    const zs = [];
    for (let z = H.prosZ; z <= H.back; z += 1) zs.push(Math.min(z, H.back));
    for (let i = 0; i < zs.length - 1; i++) {
      const a = { x: sx * (H.halfW - 0.04), z: zs[i] };
      const b = { x: sx * (H.halfW - 0.04), z: zs[i + 1] };
      const y = rakeY((a.z + b.z) / 2);
      wains.push(wallSeg(a, b, y - 0.2, y + 1.25, 0.06)); // reaches below the stepped floor
      giltG.push(wallSeg({ x: a.x - sx * 0.04, z: a.z }, { x: b.x - sx * 0.04, z: b.z }, y + 1.25, y + 1.31, 0.05));
    }
    // ivory pilasters with gilt capitals between the bays
    for (let z = 1.5; z < H.back - 0.5; z += 4) {
      const y0 = rakeY(z);
      pil.push(new THREE.BoxGeometry(0.1, H.ceiling - y0 - 0.9, 0.5).translate(sx * (H.halfW - 0.06), (H.ceiling + y0 - 0.9) / 2, z));
      for (const L of [...BALCONIES.map((B) => B.y0 - 0.75), H.ceiling - 1.1]) {
        giltG.push(new THREE.BoxGeometry(0.22, 0.3, 0.7).translate(sx * (H.halfW - 0.1), L, z));
      }
      // sconces: a pair of candles on a gilt arm, at stalls height and on each tier
      for (const y of [y0 + 2.7, ...BALCONIES.map((B) => B.y0 + 2.1)]) {
        if (y > H.ceiling - 2) continue;
        for (const dz of [-0.16, 0.16]) {
          const p = V(sx * (H.halfW - 0.28), y, z + 0.9 + dz);
          giltG.push(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6).rotateZ(Math.PI / 2).translate(p.x + sx * 0.12, y - 0.08, p.z));
          giltG.push(new THREE.CylinderGeometry(0.03, 0.02, 0.06, 8).translate(p.x, y - 0.07, p.z));
          sconceBulbs.push(p);
        }
        halo(V(sx * (H.halfW - 0.3), y, z + 0.9), 1.25, 0.42);
      }
    }
  }
  const wm = new THREE.Mesh(mergeAll(wall), M.fluted());
  wm.receiveShadow = true;
  group.add(wm);
  addMesh(group, wains, M.walnut());
  addMesh(group, giltG, M.gilt());
  addMesh(group, pil, M.ivoryPlaster());
  // candle bulbs (shared bulb material dims with the house lights)
  const bg = new THREE.SphereGeometry(0.035, 10, 8).scale(1, 1.5, 1);
  const bm = new THREE.InstancedMesh(bg, M.bulb(), sconceBulbs.length);
  const m = new THREE.Matrix4();
  sconceBulbs.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); bm.setMatrixAt(i, m); });
  group.add(bm);
  sconceBulbs.length = 0;

  // back wall of the hall: doors on every level into the foyer
  const z = H.back;
  const shape = new THREE.Shape();
  shape.moveTo(-H.halfW, 0);
  shape.lineTo(H.halfW, 0);
  shape.lineTo(H.halfW, H.ceiling);
  shape.lineTo(-H.halfW, H.ceiling);
  shape.closePath();
  const frames = [];
  const reveals = [];
  for (const Y of LEVELS) {
    for (const dx of HALL_DOORS) {
      const p = new THREE.Path();
      const x0 = dx - HALL_DOOR_W / 2;
      const x1 = dx + HALL_DOOR_W / 2;
      p.moveTo(x0, Y);
      p.lineTo(x1, Y);
      p.lineTo(x1, Y + HALL_DOOR_H);
      p.lineTo(x0, Y + HALL_DOOR_H);
      p.lineTo(x0, Y);
      shape.holes.push(p);
      // architrave on the hall side and the reveal through the wall
      for (const s of [-1, 1]) {
        frames.push(new THREE.BoxGeometry(0.14, HALL_DOOR_H + 0.14, 0.08).translate(dx + s * (HALL_DOOR_W / 2 + 0.07), Y + (HALL_DOOR_H + 0.14) / 2, z - 0.04));
        reveals.push(new THREE.BoxGeometry(0.04, HALL_DOOR_H, H.wallT).translate(dx + s * (HALL_DOOR_W / 2 + 0.02), Y + HALL_DOOR_H / 2, z + H.wallT / 2));
      }
      frames.push(new THREE.BoxGeometry(HALL_DOOR_W + 0.42, 0.18, 0.1).translate(dx, Y + HALL_DOOR_H + 0.09, z - 0.05));
      frames.push(new THREE.BoxGeometry(HALL_DOOR_W + 0.7, 0.08, 0.16).translate(dx, Y + HALL_DOOR_H + 0.24, z - 0.06));
      reveals.push(new THREE.BoxGeometry(HALL_DOOR_W, 0.04, H.wallT).translate(dx, Y + HALL_DOOR_H + 0.02, z + H.wallT / 2));
    }
  }
  const hallSide = new THREE.ShapeGeometry(shape);
  worldUV(hallSide, 'xy', 2.2);
  hallSide.rotateY(Math.PI);
  hallSide.translate(0, 0, z);
  // ShapeGeometry faces +z; after the flip the hall side faces -z (into the hall)
  group.add(new THREE.Mesh(hallSide, M.fluted()));
  const foyerSide = new THREE.ShapeGeometry(shape);
  worldUV(foyerSide, 'xy', 3);
  foyerSide.translate(0, 0, z + H.wallT);
  group.add(new THREE.Mesh(foyerSide, M.marble()));
  addMesh(group, frames, M.gilt());
  addMesh(group, reveals, M.walnut());
}
const sconceBulbs = [];

// ============================================================== balconies
function buildBalconies(group, halo) {
  const H = HALL;
  const steps = [];
  const soffits = [];
  const fronts = [];
  const caps = [];
  const giltG = [];
  const walnut = [];
  const lampPts = [];
  const downPts = [];
  const railG = [];
  const xs = [];
  for (let x = -H.halfW; x <= H.halfW + 1e-3; x += 0.75) xs.push(x);
  for (const B of BALCONIES) {
    // stepped floor: tread + riser per row, following the bow
    const pos = [];
    const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i];
      const xb = xs[i + 1];
      for (let r = 0; r <= B.rows; r++) {
        const y = r < B.rows ? B.y0 + r * B.rise : B.top;
        const s0 = r * B.depth;
        const s1 = r < B.rows ? s0 + B.depth : null;
        const za0 = balconyZ(B, xa, s0);
        const zb0 = balconyZ(B, xb, s0);
        const za1 = s1 === null ? H.back : balconyZ(B, xa, s1);
        const zb1 = s1 === null ? H.back : balconyZ(B, xb, s1);
        quad([xa, y, za0], [xa, y, za1], [xb, y, zb1], [xb, y, zb0]);
        if (r > 0) {
          const yp = B.y0 + (r - 1) * B.rise;
          quad([xa, yp, za0], [xa, y, za0], [xb, y, zb0], [xb, yp, zb0]);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    steps.push(worldUV(g, 'xz', 2));
    // half steps in the aisles
    for (const ax of BALCONY_AISLES) {
      for (let r = 0; r < B.rows; r++) {
        const y = B.y0 + r * B.rise + B.rise / 2;
        const s = r * B.depth + B.depth / 2;
        const zc = balconyZ(B, ax, s + B.depth / 4);
        const b = new THREE.BoxGeometry(AISLE_HALF * 2, B.rise / 2, B.depth / 2);
        b.translate(ax, y - B.rise / 4, zc);
        walnut.push(b);
        steps.push(worldUV(new THREE.PlaneGeometry(AISLE_HALF * 2, B.depth / 2).rotateX(-Math.PI / 2).translate(ax, y + 0.01, zc), 'xz', 2));
      }
    }
    // soffit under the tier: it climbs with the rows above it (the way a
    // real balcony's underside does), then runs level under the back aisle
    // to the wall - well above the doors below. Recessed downlights.
    const rowsLen = B.rows * B.depth;
    const sA = -0.35;
    const yA = B.y0 - 0.55;
    const yB = B.top - 0.5;
    const soffY = (s) => (s >= rowsLen ? yB : yA + ((s - sA) / (rowsLen - sA)) * (yB - yA));
    const soff = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i];
      const xb = xs[i + 1];
      const za0 = balconyZ(B, xa, sA);
      const zb0 = balconyZ(B, xb, sA);
      const za1 = balconyZ(B, xa, rowsLen);
      const zb1 = balconyZ(B, xb, rowsLen);
      soff.push(xa, yA, za0, xb, yA, zb0, xb, yB, zb1, xa, yA, za0, xb, yB, zb1, xa, yB, za1);
      soff.push(xa, yB, za1, xb, yB, zb1, xb, yB, H.back, xa, yB, za1, xb, yB, H.back, xa, yB, H.back);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(soff, 3));
    sg.computeVertexNormals();
    soffits.push(worldUV(sg, 'xz', 3));
    for (let x = -12; x <= 12.01; x += 3) {
      for (let s = 0.8; balconyZ(B, x, s) < H.back - 0.5; s += 2.6) downPts.push(V(x, soffY(s) - 0.04, balconyZ(B, x, s)));
    }

    // the bowed front: ornament face, velvet-padded rail, gilt mouldings
    const frontPts = [];
    for (let x = -B.sideX; x <= B.sideX + 1e-3; x += (B.sideX * 2) / 14) frontPts.push({ x, z: balconyZ(B, x, -0.2) });
    const runs = [
      [{ x: -B.sideX, z: B.sideZ0 }, { x: -B.sideX, z: frontPts[0].z }],
      frontPts,
      [{ x: B.sideX, z: frontPts[frontPts.length - 1].z }, { x: B.sideX, z: B.sideZ0 }],
    ];
    const yb = B.y0 - 0.55;
    // a low ornamented front and, above it, a slim brass rail on posts:
    // from the upper tiers you look steeply down, over the front, between
    // the posts
    const yt = B.y0 + (B.level === 1 ? 0.5 : 0.42);
    const yr = B.y0 + (B.level === 1 ? 0.86 : 0.74); // the upper tiers look down more steeply
    // the side galleries of the upper tiers look down across their own
    // front at the steepest angle: their solid front is lower still
    const sideTop = B.level === 3 ? B.y0 + 0.14 : B.level === 2 ? B.y0 + 0.25 : yt;
    const railRun = (pa, pb, top = yt) => {
      railG.push(new THREE.TubeGeometry(new THREE.LineCurve3(V(pa.x, yr, pa.z), V(pb.x, yr, pb.z)), 1, 0.022, 8));
      const len = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      const n = Math.max(1, Math.round(len / 1.1));
      for (let k = 0; k <= n; k++) {
        const x = pa.x + ((pb.x - pa.x) * k) / n;
        const z = pa.z + ((pb.z - pa.z) * k) / n;
        railG.push(new THREE.CylinderGeometry(0.012, 0.016, yr - top, 8).translate(x, (yr + top) / 2, z));
      }
    };
    // which way each run faces (out over the stalls)
    const outward = [{ x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 }];
    runs.forEach((run, ri) => {
      const top = ri === 1 ? yt : sideTop;
      for (let i = 0; i < run.length - 1; i++) {
        const a = run[i];
        const b = run[i + 1];
        const segLen = Math.hypot(b.x - a.x, b.z - a.z);
        const nSub = Math.max(1, Math.round(segLen / 2.2));
        for (let k = 0; k < nSub; k++) {
          const pa = { x: a.x + ((b.x - a.x) * k) / nSub, z: a.z + ((b.z - a.z) * k) / nSub };
          const pb = { x: a.x + ((b.x - a.x) * (k + 1)) / nSub, z: a.z + ((b.z - a.z) * (k + 1)) / nSub };
          fronts.push(wallSeg(pa, pb, yb + 0.12, top - 0.08, 0.3));
          caps.push(wallSeg(pa, pb, top - 0.08, top, 0.24));
          giltG.push(wallSeg(pa, pb, top - 0.12, top - 0.08, 0.36));
          giltG.push(wallSeg(pa, pb, yb, yb + 0.12, 0.38));
          railRun(pa, pb, top);
        }
        // lamps on the outer face of the front: they light the gilt
        // ornament for the stalls and never stand in anyone's view
        if (ri !== 1 || i % 2 === 1) {
          const o = outward[ri];
          const m = ri === 1 ? b : { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
          lampPts.push(V(m.x + o.x * 0.24, B.y0 + 0.12, m.z + o.z * 0.24));
        }
      }
    });
    // the short return at the front end of each side gallery
    for (const sx of [-1, 1]) {
      const a = { x: sx * B.sideX, z: B.sideZ0 };
      const b = { x: sx * H.halfW, z: B.sideZ0 };
      fronts.push(wallSeg(a, b, yb + 0.12, sideTop - 0.08, 0.3));
      caps.push(wallSeg(a, b, sideTop - 0.08, sideTop, 0.24));
      giltG.push(wallSeg(a, b, yb, yb + 0.12, 0.38));
      railRun(a, b, sideTop);
      // side gallery slab and soffit
      const len = balconyZ(B, sx * 14, 0) - B.sideZ0;
      const slab = new THREE.BoxGeometry(H.halfW - B.sideX, 0.55, len);
      slab.translate(sx * (H.halfW + B.sideX) / 2, B.y0 - 0.275, B.sideZ0 + len / 2);
      walnut.push(slab);
      steps.push(worldUV(new THREE.PlaneGeometry(H.halfW - B.sideX, len).rotateX(-Math.PI / 2).translate(sx * (H.halfW + B.sideX) / 2, B.y0 + 0.01, B.sideZ0 + len / 2), 'xz', 2));
      // carved corbels under the gallery front
      for (let z = B.sideZ0 + 1.2; z < B.sideZ0 + len - 0.5; z += 3) {
        const c = new THREE.BoxGeometry(0.22, 0.8, 0.22).translate(sx * (B.sideX + 0.25), B.y0 - 0.95, z);
        giltG.push(c);
        giltG.push(new THREE.SphereGeometry(0.1, 10, 8).translate(sx * (B.sideX + 0.25), B.y0 - 1.38, z));
      }
      // the 2층 boxes: low partitions that keep the view open, and a
      // carpeted dais for the second row of chairs
      if (B.level === 1) {
        const px0 = B.sideX + 0.7;
        const pw = H.halfW - px0;
        for (let z = B.sideZ0 + 3; z < B.sideZ0 + len - 0.5; z += 3) {
          walnut.push(new THREE.BoxGeometry(pw, 0.78, 0.06).translate(sx * (px0 + pw / 2), B.y0 + 0.39, z));
          giltG.push(new THREE.BoxGeometry(pw, 0.04, 0.09).translate(sx * (px0 + pw / 2), B.y0 + 0.8, z));
          giltG.push(new THREE.SphereGeometry(0.05, 10, 8).translate(sx * px0, B.y0 + 0.86, z));
        }
        const dw = H.halfW - BOX_DAIS_X;
        walnut.push(new THREE.BoxGeometry(dw, BOX_DAIS_H, len).translate(sx * (BOX_DAIS_X + dw / 2), B.y0 + BOX_DAIS_H / 2, B.sideZ0 + len / 2));
        steps.push(worldUV(new THREE.PlaneGeometry(dw, len).rotateX(-Math.PI / 2).translate(sx * (BOX_DAIS_X + dw / 2), B.y0 + BOX_DAIS_H + 0.01, B.sideZ0 + len / 2), 'xz', 2));
        giltG.push(new THREE.BoxGeometry(0.04, 0.03, len).translate(sx * BOX_DAIS_X, B.y0 + BOX_DAIS_H, B.sideZ0 + len / 2));
      }
    }
  }
  addMesh(group, steps, M.carpetField());
  addMesh(group, soffits, M.ivoryPlaster());
  const fm = addMesh(group, fronts, M.ornament(), { cast: true });
  if (fm) fm.castShadow = true;
  addMesh(group, caps, phys({ color: '#4e1019', roughness: 0.85, sheen: 0.7, sheenColor: new THREE.Color('#c86a5e') }));
  addMesh(group, giltG, M.gilt());
  addMesh(group, walnut, M.walnut());
  addMesh(group, railG, M.brass());
  // balcony-front lamps: a frosted globe in a little gilt cup
  const post = new THREE.CylinderGeometry(0.055, 0.03, 0.07, 12).translate(0, -0.06, 0);
  const pm = new THREE.InstancedMesh(post, M.gilt(), lampPts.length);
  const gm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 12, 10), M.bulb(), lampPts.length);
  const m = new THREE.Matrix4();
  lampPts.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    pm.setMatrixAt(i, m);
    gm.setMatrixAt(i, m);
    halo(p, 0.55, 0.3);
  });
  group.add(pm, gm);
  // soffit downlights
  const dm = new THREE.InstancedMesh(new THREE.CircleGeometry(0.09, 16).rotateX(Math.PI / 2), M.bulb(), downPts.length);
  downPts.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); dm.setMatrixAt(i, m); });
  group.add(dm);
}

// ============================================================= proscenium
function buildProscenium(group) {
  const H = HALL;
  const z = H.prosZ;
  const marble = [];
  const giltG = [];
  const dark = [];
  for (const sx of [-1, 1]) {
    // flank wall from the end of the shell to the side wall
    const x0 = sx * (SHELL.R * Math.sin(SHELL.a1) + 0.1);
    const x1 = sx * H.halfW;
    marble.push(wallSeg({ x: x0, z: z - 0.15 }, { x: x1, z: z - 0.15 }, 0, H.ceiling, 0.3, 2.5));
    // twin columns with gilt capitals and bases
    for (const cx of PROS_COLUMNS.map((c) => sx * c)) {
      marble.push(new THREE.CylinderGeometry(0.3, 0.34, H.ceiling - 3.4, 24).translate(cx, (H.ceiling - 3.4) / 2 + 0.5, z + 0.25));
      giltG.push(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 24).translate(cx, 0.25, z + 0.25));
      giltG.push(new THREE.CylinderGeometry(0.46, 0.3, 0.6, 24).translate(cx, H.ceiling - 2.6, z + 0.25));
      giltG.push(new THREE.BoxGeometry(0.98, 0.16, 0.98).translate(cx, H.ceiling - 2.22, z + 0.25));
      for (let k = 0; k < 3; k++) giltG.push(new THREE.TorusGeometry(0.31, 0.025, 6, 24).rotateX(Math.PI / 2).translate(cx, 4 + k * 6, z + 0.25));
    }
    // a tall niche between the columns
    const cx = sx * 13.65;
    dark.push(new THREE.BoxGeometry(0.9, 7, 0.1).translate(cx, 9, z - 0.01));
    giltG.push(new THREE.TorusGeometry(0.45, 0.04, 8, 32, Math.PI).translate(cx, 12.5, z + 0.02));
    for (const s of [-1, 1]) giltG.push(new THREE.BoxGeometry(0.08, 7, 0.08).translate(cx + s * 0.47, 9, z + 0.02));
    giltG.push(new THREE.BoxGeometry(1.05, 0.12, 0.2).translate(cx, 5.45, z + 0.04));
  }
  // the great entablature across the top of the stage opening
  marble.push(new THREE.BoxGeometry(H.halfW * 2, 2.1, 0.8).translate(0, H.ceiling - 1.05, z + 0.1));
  giltG.push(new THREE.BoxGeometry(H.halfW * 2, 0.14, 0.95).translate(0, H.ceiling - 2.1, z + 0.12));
  giltG.push(new THREE.BoxGeometry(H.halfW * 2, 0.1, 0.9).translate(0, H.ceiling - 0.25, z + 0.12));
  // central cartouche with a lyre
  giltG.push(new THREE.TorusGeometry(0.85, 0.07, 10, 48).scale(1, 0.75, 1).translate(0, H.ceiling - 1.1, z + 0.55));
  const lyre = new THREE.Shape();
  lyre.moveTo(-0.35, -0.4);
  lyre.quadraticCurveTo(-0.6, 0.1, -0.3, 0.45);
  lyre.lineTo(-0.22, 0.42);
  lyre.quadraticCurveTo(-0.45, 0.1, -0.25, -0.3);
  lyre.lineTo(0.25, -0.3);
  lyre.quadraticCurveTo(0.45, 0.1, 0.22, 0.42);
  lyre.lineTo(0.3, 0.45);
  lyre.quadraticCurveTo(0.6, 0.1, 0.35, -0.4);
  lyre.closePath();
  giltG.push(new THREE.ExtrudeGeometry(lyre, { depth: 0.06, bevelEnabled: false }).translate(0, H.ceiling - 1.1, z + 0.52));
  addMesh(group, marble, M.marbleDark(), { receive: true });
  addMesh(group, giltG, M.gilt());
  addMesh(group, dark, M.walnut());
}

// ================================================================ ceiling
function buildCeiling(group) {
  const H = HALL;
  const y = H.ceiling;
  const z0 = H.front;
  const z1 = H.back;
  const recess = new THREE.PlaneGeometry(H.halfW * 2, z1 - z0);
  recess.rotateX(Math.PI / 2);
  recess.translate(0, y, (z0 + z1) / 2);
  worldUV(recess, 'xz', 3);
  group.add(new THREE.Mesh(recess, M.coffer()));
  const ribs = [];
  const giltG = [];
  for (let x = -H.halfW; x <= H.halfW + 1e-3; x += 3) {
    ribs.push(new THREE.BoxGeometry(0.34, 0.5, z1 - z0).translate(x, y - 0.25, (z0 + z1) / 2));
    giltG.push(new THREE.BoxGeometry(0.38, 0.04, z1 - z0).translate(x, y - 0.5, (z0 + z1) / 2));
  }
  for (let z = z0; z <= z1 + 1e-3; z += 3) {
    ribs.push(new THREE.BoxGeometry(H.halfW * 2, 0.5, 0.34).translate(0, y - 0.25, Math.min(z, z1)));
    giltG.push(new THREE.BoxGeometry(H.halfW * 2, 0.04, 0.38).translate(0, y - 0.5, Math.min(z, z1)));
  }
  // cornice round the room
  for (const sx of [-1, 1]) {
    ribs.push(new THREE.BoxGeometry(0.9, 0.7, z1 - z0).translate(sx * (H.halfW - 0.45), y - 0.35, (z0 + z1) / 2));
    giltG.push(new THREE.BoxGeometry(0.95, 0.06, z1 - z0).translate(sx * (H.halfW - 0.47), y - 0.72, (z0 + z1) / 2));
  }
  addMesh(group, ribs, M.ivoryPlaster());
  addMesh(group, giltG, M.gilt());
  // a warm cove glow just under the cornice
  const cove = [];
  for (const sx of [-1, 1]) cove.push(new THREE.BoxGeometry(0.04, 0.04, z1 - z0).translate(sx * (H.halfW - 0.92), y - 0.75, (z0 + z1) / 2));
  group.add(new THREE.Mesh(mergeAll(cove), new THREE.MeshStandardMaterial({ color: '#ffe0b0', emissive: '#ffb966', emissiveIntensity: 0.7 })));
}

// ============================================================= chandelier
// Gilt tiers of candle arms hung with crystal drops. One InstancedMesh per
// kind of part; the group origin is the centre of the top tier.
export function buildChandelier(scale = 1) {
  const group = new THREE.Group();
  const giltG = [];
  const bulbs = [];
  const drops = [];
  const tiers = [{ y: 0, r: 1.25, n: 16 }, { y: -0.95, r: 0.9, n: 12 }, { y: -1.75, r: 0.5, n: 8 }];
  giltG.push(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 10).translate(0, -0.9, 0));
  giltG.push(new THREE.SphereGeometry(0.22, 16, 12).translate(0, -2.3, 0));
  giltG.push(new THREE.ConeGeometry(0.12, 0.45, 12).rotateX(Math.PI).translate(0, -2.65, 0));
  giltG.push(new THREE.SphereGeometry(0.16, 16, 12).translate(0, 0.35, 0));
  for (const T of tiers) {
    giltG.push(new THREE.TorusGeometry(T.r, 0.03, 8, 64).rotateX(Math.PI / 2).translate(0, T.y, 0));
    giltG.push(new THREE.TorusGeometry(T.r * 0.55, 0.02, 6, 40).rotateX(Math.PI / 2).translate(0, T.y + 0.25, 0));
    for (let i = 0; i < T.n; i++) {
      const a = (i / T.n) * Math.PI * 2;
      const x = Math.cos(a) * T.r;
      const z = Math.sin(a) * T.r;
      // S-curved arm up to a candle cup
      const arm = new THREE.CatmullRomCurve3([V(x * 0.15, T.y - 0.2, z * 0.15), V(x * 0.7, T.y - 0.12, z * 0.7), V(x, T.y, z), V(x * 1.04, T.y + 0.16, z * 1.04)]);
      giltG.push(new THREE.TubeGeometry(arm, 8, 0.016, 5));
      giltG.push(new THREE.CylinderGeometry(0.045, 0.03, 0.06, 10).translate(x * 1.04, T.y + 0.19, z * 1.04));
      bulbs.push(V(x * 1.04, T.y + 0.29, z * 1.04));
      // festoons of crystals between arms
      for (let k = 1; k <= 3; k++) {
        const a2 = a + (k / 4) * ((Math.PI * 2) / T.n);
        const sag = Math.sin((k / 4) * Math.PI) * 0.22;
        drops.push({ p: V(Math.cos(a2) * T.r, T.y - 0.05 - sag, Math.sin(a2) * T.r), s: 0.6 });
      }
      drops.push({ p: V(x, T.y - 0.16, z), s: 1.3 });
    }
  }
  // cascade of drops under the bottom tier
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 0.3 + (i % 2) * 0.12;
    drops.push({ p: V(Math.cos(a) * r, -2.0 - (i % 3) * 0.12, Math.sin(a) * r), s: 1 });
  }
  const gm = new THREE.Mesh(mergeAll(giltG), M.gilt());
  group.add(gm);
  const bg = new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8);
  const flame = new THREE.SphereGeometry(0.045, 10, 8).scale(1, 1.6, 1).translate(0, 0.12, 0);
  const bm = new THREE.InstancedMesh(mergeAll([bg, flame]), M.bulb(), bulbs.length);
  const m = new THREE.Matrix4();
  bulbs.forEach((p, i) => { m.makeTranslation(p.x, p.y - 0.08, p.z); bm.setMatrixAt(i, m); });
  group.add(bm);
  const dg = new THREE.OctahedronGeometry(0.05, 0).scale(0.8, 1.6, 0.8);
  const dm = new THREE.InstancedMesh(dg, M.crystal(), drops.length);
  const q = new THREE.Quaternion();
  drops.forEach((d, i) => {
    q.setFromAxisAngle(V(0, 1, 0), i * 0.7);
    m.compose(d.p, q, V(d.s, d.s, d.s));
    dm.setMatrixAt(i, m);
  });
  group.add(dm);
  group.scale.setScalar(scale);
  return { group };
}

// --------------------------------------------------------------- backdrop
export function nightForestTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1160;
  const g = c.getContext('2d');
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const sky = g.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, '#060a1c');
  sky.addColorStop(0.45, '#131c3d');
  sky.addColorStop(0.75, '#2a2e54');
  sky.addColorStop(1, '#3b3557');
  g.fillStyle = sky;
  g.fillRect(0, 0, c.width, c.height);
  g.save();
  g.translate(1024, 380);
  g.rotate(-0.35);
  const mw = g.createRadialGradient(0, 0, 10, 0, 0, 900);
  mw.addColorStop(0, 'rgba(160,170,230,0.18)');
  mw.addColorStop(1, 'rgba(160,170,230,0)');
  g.fillStyle = mw;
  g.scale(1, 0.18);
  g.beginPath();
  g.arc(0, 0, 900, 0, Math.PI * 2);
  g.fill();
  g.restore();
  for (let i = 0; i < 1600; i++) {
    const x = r() * c.width;
    const y = r() * c.height * 0.8;
    const m = Math.pow(r(), 3);
    g.fillStyle = `rgba(255,${235 + r() * 20},${210 + r() * 45},${0.25 + m * 0.75})`;
    g.beginPath();
    g.arc(x, y, 0.5 + m * 1.8, 0, Math.PI * 2);
    g.fill();
  }
  const mx = 1180;
  const my = 330;
  const hl = g.createRadialGradient(mx, my, 20, mx, my, 360);
  hl.addColorStop(0, 'rgba(255,244,214,0.55)');
  hl.addColorStop(0.2, 'rgba(220,226,255,0.18)');
  hl.addColorStop(1, 'rgba(200,210,255,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, c.width, c.height);
  const moon = g.createRadialGradient(mx - 14, my - 14, 4, mx, my, 62);
  moon.addColorStop(0, '#fffaf0');
  moon.addColorStop(1, '#f1e6c8');
  g.fillStyle = moon;
  g.beginPath();
  g.arc(mx, my, 62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(190,180,150,0.25)';
  for (const [dx, dy, rr] of [[-18, -10, 12], [14, 12, 9], [-6, 22, 7], [20, -18, 6]]) {
    g.beginPath();
    g.arc(mx + dx, my + dy, rr, 0, Math.PI * 2);
    g.fill();
  }
  const layers = [
    { y: 760, h: 260, col: '#1d2547', n: 70 },
    { y: 860, h: 300, col: '#121831', n: 50 },
    { y: 980, h: 330, col: '#070a16', n: 34 },
  ];
  for (const L of layers) {
    g.fillStyle = L.col;
    g.fillRect(0, L.y, c.width, c.height - L.y);
    for (let i = 0; i < L.n; i++) {
      const x = r() * c.width;
      const h = L.h * (0.5 + r() * 0.6);
      const w = h * (0.22 + r() * 0.12);
      for (let k = 0; k < 4; k++) {
        const ty = L.y - h + (k * h) / 4.6;
        const tw = w * (0.45 + k * 0.22);
        g.beginPath();
        g.moveTo(x, ty);
        g.lineTo(x - tw / 2, ty + h / 2.6);
        g.lineTo(x + tw / 2, ty + h / 2.6);
        g.closePath();
        g.fill();
      }
    }
  }
  const mist = g.createLinearGradient(0, 760, 0, 1000);
  mist.addColorStop(0, 'rgba(150,160,210,0)');
  mist.addColorStop(0.5, 'rgba(150,160,210,0.12)');
  mist.addColorStop(1, 'rgba(150,160,210,0)');
  g.fillStyle = mist;
  g.fillRect(0, 760, c.width, 240);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
