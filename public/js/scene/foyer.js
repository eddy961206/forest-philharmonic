// The grand foyer behind the stalls: marble floor, galleries on every level
// along the hall's back wall, two spiral staircases that climb all four
// floors, a crystal chandelier in the atrium and tall windows onto the
// moonlit forest. You arrive here, and you climb from here to the balconies.
import * as THREE from 'three';
import { M } from './materials.js';
import { HALL, LEVELS, LEVEL_NAMES, FOYER, FOYER_COLUMNS, SPIRAL, HALL_DOORS, HALL_DOOR_W, HALL_DOOR_H, spiralStepY } from './hallplan.js';
import { mergeAll, wallSeg, buildChandelier, nightForestTexture } from './hall.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

function add(parent, geos, mat, opts = {}) {
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeAll(geos), mat);
  m.receiveShadow = opts.receive ?? true;
  m.castShadow = false;
  parent.add(m);
  return m;
}

function uvXZ(g, tile) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / tile; uv[i * 2 + 1] = p.getZ(i) / tile; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function signTexture(text, sub = '') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#1a120c';
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#c9a14e';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 144);
  g.fillStyle = '#e8c878';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 58px "Gowun Batang", serif';
  g.fillText(text, 256, sub ? 66 : 82);
  if (sub) {
    g.font = '500 26px "IBM Plex Sans KR", sans-serif';
    g.fillStyle = 'rgba(232,200,120,0.75)';
    g.fillText(sub, 256, 120);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function sign(parent, text, sub, pos, yaw, w = 1.2) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.3125), new THREE.MeshStandardMaterial({ map: signTexture(text, sub), roughness: 0.6, emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0 }));
  m.position.copy(pos);
  m.rotation.y = yaw;
  parent.add(m);
}

export function buildFoyer(group, { halo }) {
  const H = HALL;
  const Y1 = LEVELS[0];
  const top = LEVELS[3] + 5;
  const z0 = FOYER.z0;
  const z1 = FOYER.z1;
  const zc = (z0 + z1) / 2;
  const lights = [];

  // ---------------------------------------------------------------- floor
  const floor = new THREE.PlaneGeometry(H.halfW * 2, z1 - z0).rotateX(-Math.PI / 2).translate(0, Y1, zc);
  const fm = new THREE.Mesh(uvXZ(floor, 4.8), M.marbleFloor());
  fm.receiveShadow = true;
  group.add(fm);
  // red carpet: entrance to the hall doors
  const runner = [
    uvXZ(new THREE.PlaneGeometry(2.4, z1 - 33.4).rotateX(-Math.PI / 2).translate(0, Y1 + 0.006, (33.4 + z1) / 2), 2.4),
    uvXZ(new THREE.PlaneGeometry(2.4, 16.6).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(0, Y1 + 0.007, 33.0), 2.4),
  ];
  add(group, runner, M.carpetRoyal());

  // ------------------------------------------------------------ walls
  const marble = [];
  const giltG = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.PlaneGeometry(z1 - z0, top - Y1);
    g.rotateY(-sx * Math.PI / 2);
    g.translate(sx * H.halfW, (top + Y1) / 2, zc);
    const p = g.attributes.position;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getZ(i) / 3; uv[i * 2 + 1] = p.getY(i) / 3; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    marble.push(g);
    for (let z = z0 + 1.6; z < z1; z += 3.2) {
      giltG.push(new THREE.BoxGeometry(0.08, top - Y1, 0.36).translate(sx * (H.halfW - 0.04), (top + Y1) / 2, z));
    }
    // gilt-framed mirrors on the lobby walls
    for (const z of [37.2, 40.4]) {
      const mir = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.6), new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 1, roughness: 0.06 }));
      mir.position.set(sx * (H.halfW - 0.06), Y1 + 2.1, z);
      mir.rotation.y = -sx * Math.PI / 2;
      group.add(mir);
      giltG.push(new THREE.BoxGeometry(0.08, 2.8, 0.12).translate(sx * (H.halfW - 0.07), Y1 + 2.1, z - 0.81));
      giltG.push(new THREE.BoxGeometry(0.08, 2.8, 0.12).translate(sx * (H.halfW - 0.07), Y1 + 2.1, z + 0.81));
      giltG.push(new THREE.BoxGeometry(0.08, 0.12, 1.74).translate(sx * (H.halfW - 0.07), Y1 + 3.46, z));
      giltG.push(new THREE.BoxGeometry(0.08, 0.12, 1.74).translate(sx * (H.halfW - 0.07), Y1 + 0.74, z));
    }
  }
  // back wall: grand entrance and three tall arched windows
  const shape = new THREE.Shape();
  shape.moveTo(-H.halfW, Y1);
  shape.lineTo(H.halfW, Y1);
  shape.lineTo(H.halfW, top);
  shape.lineTo(-H.halfW, top);
  shape.closePath();
  const archHole = (cx, w, y0, y1) => {
    const p = new THREE.Path();
    p.moveTo(cx - w / 2, y0);
    p.lineTo(cx + w / 2, y0);
    p.lineTo(cx + w / 2, y1);
    p.absarc(cx, y1, w / 2, 0, Math.PI, false);
    p.lineTo(cx - w / 2, y0);
    return p;
  };
  const wins = [[0, 4.4, Y1 + 6.2, Y1 + 15], [-6.2, 2.6, Y1 + 2.4, Y1 + 13.5], [6.2, 2.6, Y1 + 2.4, Y1 + 13.5]];
  for (const [cx, w, a, b] of wins) shape.holes.push(archHole(cx, w, a, b));
  const back = new THREE.ShapeGeometry(shape, 32);
  const bp = back.attributes.position;
  const buv = new Float32Array(bp.count * 2);
  for (let i = 0; i < bp.count; i++) { buv[i * 2] = bp.getX(i) / 3; buv[i * 2 + 1] = bp.getY(i) / 3; }
  back.setAttribute('uv', new THREE.BufferAttribute(buv, 2));
  back.rotateY(Math.PI);
  back.translate(0, 0, z1);
  marble.push(back);
  add(group, marble, M.marble());
  for (const [cx, w, a, b] of wins) {
    const arch = new THREE.EllipseCurve(cx, b, w / 2, w / 2, 0, Math.PI, false);
    const pts = arch.getPoints(32).map((p) => V(p.x, p.y, z1 - 0.05));
    giltG.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(cx + w / 2, a, z1 - 0.05), ...pts, V(cx - w / 2, a, z1 - 0.05)]), 64, 0.09, 8));
    giltG.push(new THREE.BoxGeometry(w + 0.3, 0.16, 0.24).translate(cx, a, z1 - 0.05));
    for (let k = 1; k < 3; k++) giltG.push(new THREE.BoxGeometry(0.05, b - a + w / 2 - 0.1, 0.05).translate(cx - w / 2 + (w * k) / 3, (a + b + w / 2) / 2 - 0.05, z1 + 0.1));
    for (let y = a + 1.6; y < b; y += 1.6) giltG.push(new THREE.BoxGeometry(w, 0.04, 0.05).translate(cx, y, z1 + 0.1));
  }
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(90, 50), new THREE.MeshBasicMaterial({ map: nightForestTexture(), toneMapped: false, fog: false }));
  sky.position.set(0, Y1 + 12, z1 + 22);
  sky.rotation.y = Math.PI;
  group.add(sky);
  // the entrance doors (closed for the performance)
  const doorW = 3.0;
  const doorH = 4.2;
  const dg = [];
  for (const s of [-1, 1]) {
    dg.push(new THREE.BoxGeometry(doorW / 2 - 0.02, doorH, 0.1).translate(s * doorW / 4, Y1 + doorH / 2, z1 - 0.08));
  }
  add(group, dg, M.walnut());
  for (const s of [-1, 1]) {
    giltG.push(new THREE.BoxGeometry(0.22, doorH + 0.3, 0.3).translate(s * (doorW / 2 + 0.11), Y1 + (doorH + 0.3) / 2, z1 - 0.1));
    for (const y of [1.3, 3.1]) giltG.push(new THREE.BoxGeometry(doorW / 2 - 0.4, 1.3, 0.03).translate(s * doorW / 4, Y1 + y, z1 - 0.14));
    giltG.push(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8).translate(s * 0.18, Y1 + 1.9, z1 - 0.2));
  }
  giltG.push(new THREE.BoxGeometry(doorW + 0.9, 0.3, 0.4).translate(0, Y1 + doorH + 0.25, z1 - 0.12));

  // ------------------------------------------------------------- ceiling
  const ceil = new THREE.PlaneGeometry(H.halfW * 2, z1 - z0).rotateX(Math.PI / 2).translate(0, top, zc);
  group.add(new THREE.Mesh(uvXZ(ceil, 3), M.coffer()));
  for (let x = -H.halfW; x <= H.halfW + 1e-3; x += 3) giltG.push(new THREE.BoxGeometry(0.2, 0.3, z1 - z0).translate(x, top - 0.15, zc));

  // ------------------------------------------------------------ galleries
  const slabs = [];
  const under = [];
  const fascia = [];
  const balusterPts = [];
  const rails = [];
  const bridgeEnd = (c) => c.z - SPIRAL.rOut + 0.35;
  for (let k = 1; k < LEVELS.length; k++) {
    const Y = LEVELS[k];
    const depth = FOYER.galleryZ - z0;
    slabs.push(uvXZ(new THREE.PlaneGeometry(H.halfW * 2, depth).rotateX(-Math.PI / 2).translate(0, Y, (z0 + FOYER.galleryZ) / 2), 4.8));
    under.push(new THREE.PlaneGeometry(H.halfW * 2, depth).rotateX(Math.PI / 2).translate(0, Y - 0.4, (z0 + FOYER.galleryZ) / 2));
    fascia.push(new THREE.BoxGeometry(H.halfW * 2, 0.4, 0.06).translate(0, Y - 0.2, FOYER.galleryZ));
    giltG.push(new THREE.BoxGeometry(H.halfW * 2, 0.05, 0.1).translate(0, Y - 0.02, FOYER.galleryZ + 0.02));
    giltG.push(new THREE.BoxGeometry(H.halfW * 2, 0.05, 0.1).translate(0, Y - 0.38, FOYER.galleryZ + 0.02));
    // balustrade along the gallery edge, open where the bridges leave
    const spans = [[-H.halfW + 0.1, SPIRAL.centers[0].x - FOYER.bridgeW / 2], [SPIRAL.centers[0].x + FOYER.bridgeW / 2, SPIRAL.centers[1].x - FOYER.bridgeW / 2], [SPIRAL.centers[1].x + FOYER.bridgeW / 2, H.halfW - 0.1]];
    for (const [a, b] of spans) {
      for (let x = a + 0.12; x < b - 0.05; x += 0.26) balusterPts.push(V(x, Y, FOYER.galleryZ - 0.08));
      rails.push(new THREE.BoxGeometry(b - a, 0.07, 0.14).translate((a + b) / 2, Y + 0.95, FOYER.galleryZ - 0.08));
      rails.push(new THREE.BoxGeometry(b - a, 0.06, 0.12).translate((a + b) / 2, Y + 0.06, FOYER.galleryZ - 0.08));
    }
    // bridges to the staircases
    for (const c of SPIRAL.centers) {
      const zb = bridgeEnd(c);
      const len = zb - FOYER.galleryZ;
      slabs.push(uvXZ(new THREE.PlaneGeometry(FOYER.bridgeW, len).rotateX(-Math.PI / 2).translate(c.x, Y + 0.001, FOYER.galleryZ + len / 2), 4.8));
      under.push(new THREE.PlaneGeometry(FOYER.bridgeW, len).rotateX(Math.PI / 2).translate(c.x, Y - 0.4, FOYER.galleryZ + len / 2));
      for (const s of [-1, 1]) {
        const x = c.x + s * (FOYER.bridgeW / 2 - 0.05);
        fascia.push(new THREE.BoxGeometry(0.06, 0.4, len).translate(c.x + s * FOYER.bridgeW / 2, Y - 0.2, FOYER.galleryZ + len / 2));
        for (let z = FOYER.galleryZ + 0.1; z < zb - 0.25; z += 0.26) balusterPts.push(V(x, Y, z));
        rails.push(new THREE.BoxGeometry(0.14, 0.07, len - 0.3).translate(x, Y + 0.95, FOYER.galleryZ + (len - 0.3) / 2));
      }
      sign(group, LEVEL_NAMES[k], '객석 · 계단', V(c.x, Y + 2.35, FOYER.galleryZ - 0.02 + 0.0), Math.PI, 1.0);
    }
  }
  add(group, slabs, M.marbleFloor());
  add(group, under, M.ivoryPlaster());
  add(group, fascia, M.marble());
  add(group, rails, M.walnut());

  // ------------------------------------------------------------- columns
  const cols = [];
  for (const c of FOYER_COLUMNS) {
    cols.push(new THREE.CylinderGeometry(c.r - 0.06, c.r - 0.02, top - Y1, 24).translate(c.x, (top + Y1) / 2, c.z));
    for (const Y of LEVELS) {
      giltG.push(new THREE.CylinderGeometry(c.r + 0.04, c.r + 0.04, 0.22, 24).translate(c.x, Y + 0.11, c.z));
      if (Y > Y1) giltG.push(new THREE.CylinderGeometry(c.r + 0.14, c.r - 0.02, 0.4, 24).translate(c.x, Y - 0.6, c.z));
    }
  }
  add(group, cols, M.marbleDark());

  // ------------------------------------------------------- spiral stairs
  const steps = [];
  const stepCarpet = [];
  const soffit = [];
  const stringer = [];
  const newels = [];
  const S = SPIRAL.steps;
  const dA = TAU / S;
  for (const c of SPIRAL.centers) {
    const m = c.x < 0 ? -1 : 1;
    const P = (r, a) => V(c.x + r * Math.sin(a * m), 0, c.z - r * Math.cos(a * m));
    for (let turn = 0; turn < 3; turn++) {
      for (let j = 0; j < S; j++) {
        if (turn === 0 && j === 0) continue; // that one is the floor
        const y = spiralStepY((j + 0.5) / S, turn);
        const a0 = j * dA;
        steps.push(wedge(P, SPIRAL.rIn, SPIRAL.rOut, a0, a0 + dA * 1.04, y - 0.12, y));
        stepCarpet.push(wedgeTop(P, 0.95, 2.05, a0 + dA * 0.04, a0 + dA * 0.96, y + 0.004));
        const bp = P(SPIRAL.rOut - 0.06, a0 + dA * 0.5);
        balusterPts.push(V(bp.x, y, bp.z));
      }
      // continuous helical underside and outer stringer
      const N = S * 2;
      for (let i = 0; i < N; i++) {
        const ua = i / N;
        const ub = (i + 1) / N;
        if (turn === 0 && ua < 1 / S) continue;
        const ya = LEVELS[0] + SPIRAL.pitch * (turn + ua) - 0.32;
        const yb = LEVELS[0] + SPIRAL.pitch * (turn + ub) - 0.32;
        const iA = P(SPIRAL.rIn, ua * TAU);
        const oA = P(SPIRAL.rOut, ua * TAU);
        const iB = P(SPIRAL.rIn, ub * TAU);
        const oB = P(SPIRAL.rOut, ub * TAU);
        soffit.push(tri([iA.x, ya, iA.z], [oB.x, yb, oB.z], [oA.x, ya, oA.z], m), tri([iA.x, ya, iA.z], [iB.x, yb, iB.z], [oB.x, yb, oB.z], m));
        const oA2 = P(SPIRAL.rOut + 0.04, ua * TAU);
        const oB2 = P(SPIRAL.rOut + 0.04, ub * TAU);
        stringer.push(tri([oA2.x, ya, oA2.z], [oB2.x, yb, oB2.z], [oB2.x, yb + 0.3, oB2.z], -m), tri([oA2.x, ya, oA2.z], [oB2.x, yb + 0.3, oB2.z], [oA2.x, ya + 0.3, oA2.z], -m));
      }
    }
    // handrail: a helix of walnut capped in gilt
    const hp = [];
    for (let i = 0; i <= S * 3; i++) {
      const u = i / S;
      if (u < 1 / S) continue;
      const p = P(SPIRAL.rOut - 0.06, u * TAU);
      hp.push(V(p.x, LEVELS[0] + SPIRAL.pitch * u + 0.95, p.z));
    }
    rails.length = 0;
    add(group, [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), S * 6, 0.035, 8)], M.walnut());
    // the newel: marble, gilt rings at every floor, a lamp on top
    newels.push(new THREE.CylinderGeometry(SPIRAL.rIn, SPIRAL.rIn + 0.04, LEVELS[3] - Y1 + 1.2, 24).translate(c.x, (LEVELS[3] + Y1 + 1.2) / 2, c.z));
    for (const Y of LEVELS) giltG.push(new THREE.TorusGeometry(SPIRAL.rIn + 0.03, 0.03, 8, 32).rotateX(Math.PI / 2).translate(c.x, Y + 0.6, c.z));
    giltG.push(new THREE.SphereGeometry(0.22, 16, 12).translate(c.x, LEVELS[3] + 1.35, c.z));
    halo(V(c.x, LEVELS[3] + 1.75, c.z), 1.4, 0.5);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), M.bulb());
    globe.position.set(c.x, LEVELS[3] + 1.7, c.z);
    group.add(globe);
    sign(group, '계단', '2층 · 3층 · 4층', V(c.x, Y1 + 2.4, c.z + SPIRAL.rIn + 0.02), 0, 0.85);
  }
  add(group, steps, M.marble());
  add(group, stepCarpet, M.carpetRoyal());
  add(group, soffit, M.ivoryPlaster());
  add(group, stringer, M.walnut());
  add(group, newels, M.marbleDark());

  // turned balusters (galleries, bridges, stairs)
  const lathe = new THREE.LatheGeometry([
    new THREE.Vector2(0.045, 0), new THREE.Vector2(0.045, 0.08), new THREE.Vector2(0.025, 0.12), new THREE.Vector2(0.05, 0.32),
    new THREE.Vector2(0.03, 0.55), new THREE.Vector2(0.022, 0.78), new THREE.Vector2(0.04, 0.86), new THREE.Vector2(0.04, 0.92),
  ], 10);
  const bm = new THREE.InstancedMesh(lathe, M.gilt(), balusterPts.length);
  const mt = new THREE.Matrix4();
  balusterPts.forEach((p, i) => { mt.makeTranslation(p.x, p.y, p.z); bm.setMatrixAt(i, mt); });
  group.add(bm);

  // ------------------------------------------- hall doors from the foyer
  // the doors stand open for the audience, leaves folded back to the wall
  const doorLeaves = [];
  const sills = [];
  for (const Y of LEVELS) {
    for (const dx of HALL_DOORS) {
      const z = z0 + 0.02;
      // marble sill through the thickness of the wall, so the hall floor and
      // the foyer floor meet - no gap to look down through
      const sd = z0 - H.back + 0.1;
      sills.push(new THREE.BoxGeometry(HALL_DOOR_W + 0.02, 0.5, sd).translate(dx, Y - 0.252, (H.back + z0) / 2));
      giltG.push(new THREE.BoxGeometry(HALL_DOOR_W, 0.012, 0.05).translate(dx, Y + 0.006, z0 - 0.02));
      for (const s of [-1, 1]) {
        giltG.push(new THREE.BoxGeometry(0.16, HALL_DOOR_H + 0.16, 0.1).translate(dx + s * (HALL_DOOR_W / 2 + 0.08), Y + (HALL_DOOR_H + 0.16) / 2, z));
        const lx = dx + s * (HALL_DOOR_W / 2 + 0.2 + HALL_DOOR_W / 4);
        doorLeaves.push(new THREE.BoxGeometry(HALL_DOOR_W / 2 - 0.04, HALL_DOOR_H - 0.04, 0.06).translate(lx, Y + HALL_DOOR_H / 2, z + 0.06));
        giltG.push(new THREE.BoxGeometry(HALL_DOOR_W / 2 - 0.3, 0.9, 0.02).translate(lx, Y + 1.75, z + 0.1));
        giltG.push(new THREE.BoxGeometry(HALL_DOOR_W / 2 - 0.3, 0.9, 0.02).translate(lx, Y + 0.7, z + 0.1));
      }
      giltG.push(new THREE.BoxGeometry(HALL_DOOR_W + 0.5, 0.2, 0.14).translate(dx, Y + HALL_DOOR_H + 0.1, z));
      const k = LEVELS.indexOf(Y);
      sign(group, `${LEVEL_NAMES[k]} 객석`, dx < 0 ? '왼쪽 출입구' : '오른쪽 출입구', V(dx, Y + HALL_DOOR_H + 0.55, z + 0.1), 0, 1.1);
    }
  }
  add(group, doorLeaves, M.walnut());
  add(group, sills, M.marbleDark());

  // the moonlit forest the hall is named for, in a great gilt frame
  const pw = 5.6;
  const ph = 3.1;
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: nightForestTexture(), roughness: 0.7 }));
  paint.position.set(0, Y1 + 2.55, z0 + 0.06);
  group.add(paint);
  for (const [w, h, x, y] of [[pw + 0.5, 0.25, 0, ph / 2 + 0.12], [pw + 0.5, 0.25, 0, -ph / 2 - 0.12], [0.25, ph + 0.5, pw / 2 + 0.12, 0], [0.25, ph + 0.5, -pw / 2 - 0.12, 0]]) {
    giltG.push(new THREE.BoxGeometry(w, h, 0.12).translate(x, Y1 + 2.55 + y, z0 + 0.08));
  }
  halo(V(0, Y1 + 4.6, z0 + 0.4), 1.2, 0.3);
  giltG.push(new THREE.BoxGeometry(1.2, 0.08, 0.3).translate(0, Y1 + 4.48, z0 + 0.2));

  // -------------------------------------------------------------- decor
  const pots = [];
  const leaves = [];
  for (const [x, z] of [[-3.6, 41.0], [3.6, 41.0], [-13.6, 33.4], [13.6, 33.4]]) {
    pots.push(new THREE.CylinderGeometry(0.42, 0.3, 0.7, 20).translate(x, Y1 + 0.35, z));
    pots.push(new THREE.TorusGeometry(0.42, 0.04, 8, 24).rotateX(Math.PI / 2).translate(x, Y1 + 0.7, z));
    leaves.push(new THREE.SphereGeometry(0.62, 14, 10).translate(x, Y1 + 1.55, z));
    leaves.push(new THREE.SphereGeometry(0.42, 12, 9).translate(x, Y1 + 2.35, z));
    leaves.push(new THREE.SphereGeometry(0.24, 10, 8).translate(x, Y1 + 2.85, z));
  }
  add(group, pots, M.gilt());
  add(group, leaves, M.leaf());
  // round velvet ottomans
  const ott = [];
  for (const x of [-4.4, 4.4]) {
    ott.push(new THREE.CylinderGeometry(1.0, 1.0, 0.42, 32).translate(x, Y1 + 0.24, 37.6));
    ott.push(new THREE.CylinderGeometry(0.28, 0.32, 0.6, 20).translate(x, Y1 + 0.6, 37.6));
    giltG.push(new THREE.TorusGeometry(1.0, 0.03, 6, 40).rotateX(Math.PI / 2).translate(x, Y1 + 0.05, 37.6));
  }
  add(group, ott, new THREE.MeshPhysicalMaterial({ color: '#5c1520', roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#ff9a8a') }));
  add(group, giltG, M.gilt());

  // ---------------------------------------------------------- chandelier
  const ch = buildChandelier(1.35);
  ch.group.position.set(0, top - 6.2, 38.4);
  group.add(ch.group);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 5.6, 8), M.gilt());
  rod.position.set(0, top - 2.8, 38.4);
  group.add(rod);
  halo(ch.group.position.clone().add(V(0, -0.5, 0)), 8, 0.32);
  const pl = new THREE.PointLight('#ffc98a', 26, 40, 1.4);
  pl.position.copy(ch.group.position).add(V(0, -1, 0));
  group.add(pl);
  lights.push(pl);
  const low = new THREE.PointLight('#ffd6a8', 3, 18, 1.4);
  low.position.set(0, Y1 + 4.6, 37.5);
  group.add(low);
  lights.push(low);
  return { lights };
}

// ------------------------------------------------------------------ geo
function tri(a, b, c, m) {
  const g = new THREE.BufferGeometry();
  const arr = m > 0 ? [...a, ...b, ...c] : [...a, ...c, ...b];
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}

// a wedge-shaped step: prism over the annular sector [r0,r1] x [a0,a1]
function wedge(P, r0, r1, a0, a1, y0, y1) {
  const s = new THREE.Shape();
  const n = 3;
  for (let i = 0; i <= n; i++) {
    const p = P(r1, a0 + ((a1 - a0) * i) / n);
    if (i === 0) s.moveTo(p.x, -p.z); else s.lineTo(p.x, -p.z);
  }
  for (let i = n; i >= 0; i--) {
    const p = P(r0, a0 + ((a1 - a0) * i) / n);
    s.lineTo(p.x, -p.z);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return uvXZ(g, 1.2);
}

function wedgeTop(P, r0, r1, a0, a1, y) {
  const s = new THREE.Shape();
  const n = 3;
  for (let i = 0; i <= n; i++) {
    const p = P(r1, a0 + ((a1 - a0) * i) / n);
    if (i === 0) s.moveTo(p.x, -p.z); else s.lineTo(p.x, -p.z);
  }
  for (let i = n; i >= 0; i--) {
    const p = P(r0, a0 + ((a1 - a0) * i) / n);
    s.lineTo(p.x, -p.z);
  }
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return uvXZ(g, 1.1);
}

void wallSeg;
