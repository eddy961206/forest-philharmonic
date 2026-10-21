// Every seat in the house, and the furniture they are made of. Seats differ
// by where they are: plush theatre seats in the stalls, wide tufted
// "premium" seats in the centre stalls, gilt armchairs in the 2층 boxes,
// and each balcony tier upholstered in its own colour.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HALL, rakeY, BALCONIES, BALCONY_AISLES, AISLE_HALF, balconyZ, BOX_DAIS_X, BOX_DAIS_H } from './hallplan.js';
import { M } from './materials.js';

const RB = (w, h, d, r, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);
const strip = (g) => {
  // merge-friendly: position / normal / uv only, non-indexed
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  return n;
};
// (welded back into an indexed mesh: drawn a couple of thousand times over,
// shared corners matter - a third of the vertex work)
const merge = (list) => mergeVertices(mergeGeometries(list.map(strip)), 1e-4);

// ------------------------------------------------------------- furniture
// Local frame: origin on the floor under the seat, sitter faces -z.
function theaterSeat(width = 0.54, tall = false) {
  const w = width - 0.08;
  const backH = tall ? 0.6 : 0.54; // low enough to see over from the row behind
  const fabric = [
    RB(w, 0.12, 0.46, 0.05).translate(0, 0.44, -0.03),
    RB(w, backH, 0.11, 0.05).rotateX(-0.14).translate(0, 0.5 + backH / 2, 0.25),
  ];
  if (tall) fabric.push(RB(w * 0.8, 0.1, 0.12, 0.05).rotateX(-0.14).translate(0, 0.5 + backH - 0.08, 0.22)); // head roll
  const frame = [];
  for (const sx of [-1, 1]) {
    frame.push(RB(0.05, 0.6, 0.5, 0.02).translate(sx * (width / 2 - 0.02), 0.3, 0.06));
    frame.push(RB(0.075, 0.045, 0.54, 0.02).translate(sx * (width / 2 - 0.02), 0.635, 0.03));
  }
  frame.push(RB(w + 0.04, backH + 0.04, 0.035, 0.015).rotateX(-0.14).translate(0, 0.5 + backH / 2, 0.315));
  const accent = [];
  // brass seat number plate on the back
  accent.push(new THREE.BoxGeometry(0.08, 0.03, 0.006).rotateX(-0.14).translate(0, 0.5 + backH - 0.06, 0.336));
  for (const sx of [-1, 1]) accent.push(new THREE.SphereGeometry(0.022, 10, 8).translate(sx * (width / 2 - 0.02), 0.645, -0.24));
  if (tall) {
    // gilt buttons of the tufting
    for (const [x, y] of [[-0.12, 0.72], [0.12, 0.72], [0, 0.88], [-0.12, 1.02], [0.12, 1.02]]) {
      accent.push(new THREE.SphereGeometry(0.014, 8, 6).translate(x * (w / 0.52), y + 0.02, 0.19 - (y - 0.6) * 0.14));
    }
  }
  return { fabric: merge(fabric), frame: merge(frame), accent: merge(accent) };
}

// Louis XVI style armchair for the boxes: fluted gilt legs, oval back
function armchair() {
  const fabric = [
    RB(0.5, 0.1, 0.48, 0.045).translate(0, 0.45, -0.02),
    new THREE.SphereGeometry(0.25, 20, 14).scale(0.92, 1.18, 0.22).translate(0, 0.86, 0.22),
  ];
  for (const sx of [-1, 1]) fabric.push(RB(0.07, 0.04, 0.26, 0.018).translate(sx * 0.26, 0.66, -0.06));
  const frame = [];
  for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.21, 0.2], [0.21, 0.2]]) {
    frame.push(new THREE.CylinderGeometry(0.022, 0.014, 0.42, 10).translate(x, 0.21, z));
    frame.push(new THREE.SphereGeometry(0.03, 10, 8).translate(x, 0.41, z));
  }
  frame.push(RB(0.54, 0.05, 0.5, 0.02).translate(0, 0.39, -0.01)); // seat rail
  frame.push(new THREE.TorusGeometry(0.255, 0.022, 8, 40).scale(0.92, 1.18, 1).translate(0, 0.86, 0.235)); // back frame
  for (const sx of [-1, 1]) {
    frame.push(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 8).translate(sx * 0.26, 0.53, -0.17));
    frame.push(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 8).rotateX(Math.PI / 2).translate(sx * 0.26, 0.64, -0.05));
    frame.push(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8).rotateZ(0.1 * sx).translate(sx * 0.23, 0.62, 0.21));
  }
  const accent = [new THREE.SphereGeometry(0.035, 10, 8).translate(0, 1.18, 0.23)];
  return { fabric: merge(fabric), frame: merge(frame), accent: merge(accent) };
}

// end standard at an aisle: walnut panel with a gilt medallion
function aisleEnd() {
  const frame = merge([RB(0.06, 0.78, 0.58, 0.025).translate(0, 0.39, 0.05)]);
  const accent = merge([
    new THREE.CylinderGeometry(0.075, 0.075, 0.012, 24).rotateZ(Math.PI / 2).translate(0, 0.46, 0.02),
    new THREE.BoxGeometry(0.075, 0.02, 0.6).translate(0, 0.79, 0.05),
  ]);
  return { frame, accent };
}

// ------------------------------------------------------------------ seats
const rowName = (i) => String.fromCharCode(65 + i);
const towardStage = (x, z, k = 1, fz = -7) => Math.atan2(x, z - fz) * k;

export function seatList() {
  const list = [];
  const H = HALL;
  // ---- 1층 stalls: three blocks; the centre rows E..L are premium
  for (let r = 0; r < H.rows; r++) {
    const z0 = H.firstRow + r * H.rowGap;
    let num = 1;
    for (const b of [{ x0: -13.5, x1: -7.95 }, { x0: -6.25, x1: 6.25, centre: true }, { x0: 7.95, x1: 13.5 }]) {
      const premium = b.centre && r >= 4 && r <= 11;
      const pitch = premium ? 0.68 : 0.56;
      // every other row shifts half a seat: you look between two heads
      const shift = r % 2 ? pitch / 2 : 0;
      const n = Math.floor((b.x1 - b.x0 - shift) / pitch) + 1;
      const span = (n - 1) * pitch + shift;
      const xs = b.x0 + ((b.x1 - b.x0) - span) / 2 + shift;
      const rowSeats = [];
      for (let i = 0; i < n; i++) {
        const x = xs + i * pitch;
        const z = z0 + x * x * 0.005;
        if (z > H.back - 1.6) continue;
        rowSeats.push({
          x, y: rakeY(z0), z, yaw: towardStage(x, z, 0.75), // the row's tread
          type: premium ? 'premium' : 'theater',
          color: premium ? '#8e1a2b' : '#6e1822',
          level: '1층', row: rowName(r), num: num++, pitch,
          rowSlope: 2 * 0.005 * x, // the row bows: dz/dx along it
        });
      }
      if (rowSeats.length) { rowSeats[0].endL = true; rowSeats[rowSeats.length - 1].endR = true; }
      list.push(...rowSeats);
    }
  }
  // ---- balconies
  const tierColor = ['#1d4a39', '#203462', '#4b2348'];
  BALCONIES.forEach((B, bi) => {
    for (let r = 0; r < B.rows; r++) {
      let num = 1;
      const s = r * B.depth + 0.6; // legroom behind the parapet
      for (let x = -14.35 + (r % 2) * 0.28; x <= 14.36; x += 0.56) {
        if (BALCONY_AISLES.some((c) => Math.abs(x - c) < AISLE_HALF + 0.27)) continue;
        const z = balconyZ(B, x, s);
        list.push({ x, y: B.y0 + r * B.rise, z, yaw: towardStage(x, z, 0.85), type: 'theater', color: tierColor[bi], level: B.name, row: rowName(r), num: num++, rowSlope: (2 * B.bow * x) / (HALL.halfW * HALL.halfW) });
      }
    }
    // side galleries
    for (const side of [-1, 1]) {
      const zEnd = balconyZ(B, side * 14, 0) - 0.4;
      if (bi === 0) {
        // the boxes: gilt armchairs, two staggered rows, a colour per box
        const boxLen = 3.0;
        const nBox = Math.floor((zEnd - B.sideZ0) / boxLen);
        for (let k = 0; k < nBox; k++) {
          const z0 = B.sideZ0 + k * boxLen;
          let num = 1;
          const col = ['#d8c49a', '#b26a78', '#9fb39a'][k % 3];
          // two at the rail, two on the dais behind: room to walk between
          for (const [dx, dz] of [[0.47, 0.9], [0.47, 2.1], [1.62, 0.65], [1.62, 2.35]]) {
            const x = side * (B.sideX + dx);
            const z = z0 + dz;
            const y = B.y0 + (Math.abs(x) >= BOX_DAIS_X ? BOX_DAIS_H : 0);
            list.push({ x, y, z, yaw: towardStage(x, z, 1, -4), type: 'armchair', color: col, level: B.name, row: 'BOX', box: `${side < 0 ? 'L' : 'R'}${k + 1}`, num: num++ });
          }
        }
      } else {
        let num = 1;
        // spaced so the next seat toward the stage is out of your sightline,
        // and close to the edge: near the stage you look down under the rail,
        // across the hall you look over it
        for (let z = B.sideZ0 + 0.5; z < zEnd; z += 0.9) {
          const x = side * (B.sideX + 0.45);
          list.push({ x, y: B.y0, z, yaw: towardStage(x, z, 1, -4), type: 'theater', color: tierColor[bi], level: B.name, row: 'SIDE', side: side < 0 ? 'L' : 'R', num: num++ });
        }
      }
    }
  });
  list.forEach((s, i) => {
    s.index = i;
    if (s.row === 'BOX') s.label = `${s.level} 박스 ${s.box} · ${s.num}번`;
    else if (s.row === 'SIDE') s.label = `${s.level} 사이드 ${s.side} ${s.num}번`;
    else s.label = `${s.level} ${s.row}열 ${s.num}번`;
  });
  return list;
}

// Phones: the same seats as plain boxes (a tenth of the triangles)
function liteSeat(width, armchairStyle = false) {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const w = width - 0.08;
  const fabric = [B(w, 0.11, 0.46).translate(0, 0.44, -0.03), B(w, armchairStyle ? 0.5 : 0.56, 0.1).rotateX(-0.14).translate(0, armchairStyle ? 0.86 : 0.78, 0.25)];
  const frame = armchairStyle
    ? [B(0.52, 0.05, 0.48).translate(0, 0.39, -0.01), ...[[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]].map(([x, z]) => B(0.035, 0.42, 0.035).translate(x, 0.21, z))]
    : [B(0.05, 0.6, 0.5).translate(-(width / 2 - 0.02), 0.3, 0.06), B(0.05, 0.6, 0.5).translate(width / 2 - 0.02, 0.3, 0.06), B(w + 0.04, 0.6, 0.035).rotateX(-0.14).translate(0, 0.78, 0.315)];
  const accent = [B(0.08, 0.03, 0.006).translate(0, armchairStyle ? 1.12 : 1.02, 0.34)];
  return { fabric: merge(fabric), frame: merge(frame), accent: merge(accent) };
}

export function buildSeats(list, { lite = false } = {}) {
  const group = new THREE.Group();
  group.name = 'seats';
  const kinds = lite ? {
    theater: liteSeat(0.54),
    premium: liteSeat(0.64),
    armchair: liteSeat(0.56, true),
  } : {
    theater: theaterSeat(0.54),
    premium: theaterSeat(0.64, true),
    armchair: armchair(),
  };
  const frameMat = { theater: M.walnut(), premium: M.walnut(), armchair: M.gilt() };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const c = new THREE.Color();
  const Y = new THREE.Vector3(0, 1, 0);
  for (const [type, geo] of Object.entries(kinds)) {
    const mine = list.filter((s) => s.type === type);
    if (!mine.length) continue;
    const fabric = new THREE.InstancedMesh(geo.fabric, M.velvetTint(), mine.length);
    const frame = new THREE.InstancedMesh(geo.frame, frameMat[type], mine.length);
    const accent = new THREE.InstancedMesh(geo.accent, M.gilt(), mine.length);
    mine.forEach((s, i) => {
      q.setFromAxisAngle(Y, s.yaw);
      m.compose(new THREE.Vector3(s.x, s.y, s.z), q, one);
      fabric.setMatrixAt(i, m);
      frame.setMatrixAt(i, m);
      accent.setMatrixAt(i, m);
      fabric.setColorAt(i, c.set(s.color));
    });
    for (const im of [fabric, frame, accent]) {
      im.receiveShadow = true;
      im.castShadow = false;
      im.renderOrder = 1; // after the walls: what they hide is never shaded
    }
    group.add(fabric, frame, accent);
  }
  // aisle end standards in the stalls
  const ends = list.filter((s) => s.level === '1층' && (s.endL || s.endR));
  const E = aisleEnd();
  const endF = new THREE.InstancedMesh(E.frame, M.walnut(), ends.length);
  const endA = new THREE.InstancedMesh(E.accent, M.gilt(), ends.length);
  ends.forEach((s, i) => {
    q.setFromAxisAngle(Y, s.yaw);
    const off = new THREE.Vector3((s.endL ? -1 : 1) * (s.pitch / 2 + 0.02), 0, 0).applyQuaternion(q);
    m.compose(new THREE.Vector3(s.x + off.x, s.y, s.z + off.z), q, one);
    endF.setMatrixAt(i, m);
    endA.setMatrixAt(i, m);
  });
  endF.renderOrder = endA.renderOrder = 1;
  group.add(endF, endA);

  // one invisible box per seat for picking
  const pickGeo = new THREE.BoxGeometry(0.52, 0.95, 0.55).translate(0, 0.48, 0.05);
  const pick = new THREE.InstancedMesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false }), list.length);
  list.forEach((s, i) => {
    q.setFromAxisAngle(Y, s.yaw);
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, one);
    pick.setMatrixAt(i, m);
  });
  pick.computeBoundingSphere();
  group.add(pick);
  return { group, pick };
}
