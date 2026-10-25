// Folding chairs on the grass, a timber platform and a borrowed canvas
// canopy: a small community concert in the park at dusk.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { woodTexture } from './materials.js';
import { buildStage } from './hall.js';
import { DOORS } from './hallplan.js';
import { STAGE_Y } from '../layout.js';
import { OUTDOOR, outdoorSeatList, outdoorTreeList } from './outdoorplan.js';
import { accelerateInstancePicking } from './instance-batches.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
function merged(geometries) { return mergeGeometries(geometries.map(g => g.index ? g.toNonIndexed() : g)); }
function add(parent, geometry, material, { cast = false, receive = true, name = '' } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}
function rod(a, b, radius = 0.04, segments = 6) {
  const d = b.clone().sub(a);
  return new THREE.CylinderGeometry(radius, radius, d.length(), segments)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize()))
    .translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
}
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function lawnTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const r = rng(1049);
  g.fillStyle = '#526748'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 10000; i++) {
    g.fillStyle = i % 3 ? 'rgba(162,170,112,.13)' : 'rgba(27,52,31,.18)';
    const x = r() * 256; const y = r() * 256;
    g.fillRect(x, y, 0.5 + r(), 1 + r() * 3);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(32, 32);
  return t;
}

function foldingChairs(list) {
  const group = new THREE.Group(); group.name = 'outdoor-folding-chairs';
  const fabricGeo = merged([
    new THREE.BoxGeometry(0.48, 0.055, 0.43).translate(0, 0.45, 0),
    new THREE.BoxGeometry(0.47, 0.28, 0.035).rotateX(-0.1).translate(0, 0.78, 0.25),
  ]);
  const frameGeo = [];
  for (const side of [-1, 1]) {
    const x = side * 0.235;
    frameGeo.push(rod(V(x, 0.03, -0.23), V(x, 0.89, 0.27), 0.017));
    frameGeo.push(rod(V(x, 0.03, 0.29), V(x, 0.49, -0.22), 0.017));
    frameGeo.push(new THREE.SphereGeometry(0.028, 6, 4).translate(x, 0.32, 0.02));
  }
  frameGeo.push(rod(V(-0.25, 0.16, 0.25), V(0.25, 0.16, 0.25), 0.013));
  const frame = merged(frameGeo);
  const frameMat = mat('#5e6662', { metalness: 0.35, roughness: 0.62 });
  const fabricMat = mat('#98a393');
  const matrix = new THREE.Matrix4(); const q = new THREE.Quaternion();
  const one = V(1, 1, 1); const pickBatches = [];
  // Three rows per batch keep chairs behind the camera off the GPU.
  for (let start = 0; start < list.length; start += 72) {
    const batch = list.slice(start, start + 72);
    const fabric = new THREE.InstancedMesh(fabricGeo, fabricMat, batch.length);
    const metal = new THREE.InstancedMesh(frame, frameMat, 0);
    metal.instanceMatrix = fabric.instanceMatrix; metal.count = batch.length;
    batch.forEach((s, i) => {
      q.setFromAxisAngle(Y, s.yaw); matrix.compose(V(s.x, s.y, s.z), q, one);
      fabric.setMatrixAt(i, matrix);
    });
    for (const mesh of [fabric, metal]) { mesh.receiveShadow = true; mesh.computeBoundingSphere(); }
    group.add(fabric, metal);
    pickBatches.push({ mesh: fabric, indices: batch.map(s => s.index) });
  }
  const pick = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.95, 0.55).translate(0, 0.48, 0.05), new THREE.MeshBasicMaterial({ visible: false }), list.length);
  list.forEach((s, i) => {
    q.setFromAxisAngle(Y, s.yaw); matrix.compose(V(s.x, s.y, s.z), q, one); pick.setMatrixAt(i, matrix);
  });
  pick.computeBoundingSphere(); accelerateInstancePicking(pick, pickBatches); group.add(pick);
  return { group, pick };
}

function buildCanopy(group, cloth, timber, darkCloth) {
  const C = OUTDOOR.canopy;
  // Each roof half has a slight sag between its ridge and its rolled edge.
  const roof = new THREE.PlaneGeometry(C.halfW * 2, C.z1 - C.z0, 16, 6);
  const p = roof.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const z = p.getY(i) + (C.z0 + C.z1) / 2;
    const f = Math.abs(x) / C.halfW;
    p.setXYZ(i, x, C.ridgeY + (C.eaveY - C.ridgeY) * f - Math.sin(f * Math.PI) * 0.22, z);
  }
  roof.computeVertexNormals();
  add(group, roof, cloth, { name: 'canvas-canopy' });
  const beams = [];
  for (const pole of OUTDOOR.poles) beams.push(rod(V(pole.x, 0, pole.z), V(pole.x, C.eaveY, pole.z), 0.09, 8));
  for (const z of [C.z0 + 0.2, C.z1 - 0.2]) {
    beams.push(rod(V(-13.7, C.eaveY - 0.08, z), V(0, C.ridgeY - 0.1, z), 0.065));
    beams.push(rod(V(0, C.ridgeY - 0.1, z), V(13.7, C.eaveY - 0.08, z), 0.065));
  }
  for (const side of [-1, 1]) beams.push(rod(V(side * 13.7, C.eaveY - 0.08, C.z0), V(side * 13.7, C.eaveY - 0.08, C.z1), 0.065));
  beams.push(rod(V(0, C.ridgeY - 0.12, C.z0), V(0, C.ridgeY - 0.12, C.z1), 0.065));
  add(group, merged(beams), timber, { name: 'canopy-timber-frame' });
  // Narrow scallop-free canvas valances keep the silhouette simple.
  add(group, merged([-1, 1].map(side => new THREE.BoxGeometry(0.025, 0.28, C.z1 - C.z0)
    .translate(side * C.halfW, C.eaveY - 0.12, (C.z0 + C.z1) / 2))), cloth, { name: 'canopy-valances' });
  // Plain side drapes frame the shared 1.5m service entrances. Leave the
  // route open rather than making the musicians walk through a cloth mesh.
  const wings = [];
  for (const door of DOORS) {
    const tangent = V(-door.normal.z, 0, door.normal.x);
    const centre = V(door.pos.x + door.normal.x * 0.5, STAGE_Y + 1.85, door.pos.z + door.normal.z * 0.5);
    for (const side of [-1, 1]) {
      const p = centre.clone().addScaledVector(tangent, side * 1.25);
      const panel = new THREE.BoxGeometry(1, 3.7, 0.045);
      panel.rotateY(-Math.atan2(tangent.z, tangent.x)); panel.translate(...p.toArray());
      wings.push(panel);
    }
  }
  add(group, merged(wings), darkCloth, { name: 'canvas-stage-wings' });
}

function buildTrees(group, lite) {
  const trees = outdoorTreeList();
  // The clearing stays open. Taller trees form an irregular backdrop,
  // with a second ring whose silhouettes give the small park some depth.
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.24, 1, 7), mat('#544f3e'), trees.length);
  const foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, lite ? 0 : 1), mat('#ffffff', { flatShading: true }), trees.length * 3);
  const matrix = new THREE.Matrix4(); const q = new THREE.Quaternion(); const color = new THREE.Color();
  trees.forEach((t, i) => {
    matrix.compose(V(t.x, t.h * 0.3, t.z), q, V(1, t.h * 0.6, 1)); trunks.setMatrixAt(i, matrix);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.4 + i;
      matrix.compose(V(t.x + Math.sin(a) * t.w * 0.38, t.h * (0.55 + k * 0.12), t.z + Math.cos(a) * t.w * 0.36), q, V(t.w * (1 - k * 0.1), t.h * 0.27, t.w));
      foliage.setMatrixAt(i * 3 + k, matrix);
      foliage.setColorAt(i * 3 + k, color.setHSL(0.27 + t.tint * 0.04, 0.2 + t.tint * 0.15, 0.16 + t.tint * 0.075));
    }
  });
  trunks.computeBoundingSphere(); foliage.computeBoundingSphere();
  group.add(trunks, foliage);
}

function buildStrings(group, bulbMat, timber, lite) {
  const wires = []; const sockets = []; const bulbs = [];
  const dark = mat('#39423b');
  const spans = [
    [V(-13.6, 7.1, 1.1), V(13.6, 7.1, 1.1), 0.7],
    [V(-15, 5.5, 20), V(15, 5.5, 20), 0.85],
    [V(-13.6, 7.1, 1.1), V(-15, 5.5, 20), 0.65],
    [V(13.6, 7.1, 1.1), V(15, 5.5, 20), 0.65],
  ];
  const poleGeo = [-1, 1].map(s => rod(V(s * 15, 0, 20), V(s * 15, 5.6, 20), 0.075, 8));
  add(group, merged(poleGeo), timber);
  for (const [a, b, sag] of spans) {
    const points = []; const n = Math.ceil(a.distanceTo(b) / (lite ? 1.9 : 1.4));
    const at = f => a.clone().lerp(b, f).add(V(0, -Math.sin(f * Math.PI) * sag, 0));
    for (let i = 0; i <= 24; i++) points.push(at(i / 24));
    wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.013, 4, false));
    for (let i = 1; i < n; i++) {
      const p = at(i / n); sockets.push(new THREE.CylinderGeometry(0.032, 0.032, 0.12, 6).translate(p.x, p.y - 0.06, p.z));
      bulbs.push(p.clone().add(V(0, -0.16, 0)));
    }
  }
  add(group, merged(wires.concat(sockets)), dark);
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 8, 6).scale(0.9, 1.15, 0.9), bulbMat, bulbs.length);
  const matrix = new THREE.Matrix4(); bulbs.forEach((p, i) => { matrix.makeTranslation(p.x, p.y, p.z); mesh.setMatrixAt(i, matrix); });
  mesh.computeBoundingSphere(); group.add(mesh);
}

function buildParkDetails(group, timber, darkMetal) {
  // One continuous gravel surface joins arrival, the rear cross aisle and
  // the 2m gap between chair blocks. Its narrow section leaves chair feet
  // on grass; a single polygon avoids flickering at overlapping path joins.
  const rear = OUTDOOR.firstRow + (OUTDOOR.rows - 1) * OUTDOOR.rowGap + 0.9;
  const path = new THREE.Shape();
  const outline = [
    [-0.775, 2.8], [0.775, 2.8], [0.775, rear], [10.3, rear],
    [10.3, rear + 1.4], [1.7, rear + 1.4], [1.7, OUTDOOR.back],
    [-1.7, OUTDOOR.back], [-1.7, rear + 1.4], [-10.3, rear + 1.4],
    [-10.3, rear], [-0.775, rear],
  ];
  outline.forEach(([x, z], i) => i ? path.lineTo(x, -z) : path.moveTo(x, -z));
  path.closePath();
  add(group, new THREE.ShapeGeometry(path).rotateX(-Math.PI / 2).translate(0, 0.006, 0), mat('#9e9c84'), { name: 'park-arrival-path' });
  for (const [x, z, color, yaw] of [[-10.8, 21.8, '#8e7462', 0.13], [10.6, 23.1, '#727f87', -0.16]]) {
    add(group, new THREE.BoxGeometry(2.5, 0.025, 1.85).rotateY(yaw).translate(x, 0.025, z), mat(color));
  }
  // Compact PA cabinets are functional park equipment, clear of the stairs.
  const equipment = [];
  for (const side of [-1, 1]) {
    const x = side * 12.9;
    equipment.push(new THREE.BoxGeometry(0.56, 0.9, 0.42).translate(x, 2.3, 1.5));
    equipment.push(rod(V(x, 0, 1.5), V(x, 1.9, 1.5), 0.035));
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3;
      equipment.push(rod(V(x, 0.65, 1.5), V(x + Math.sin(a) * 0.5, 0.03, 1.5 + Math.cos(a) * 0.5), 0.025));
    }
  }
  add(group, merged(equipment), darkMetal, { name: 'park-pa-equipment' });
  const board = document.createElement('canvas'); board.width = 512; board.height = 256;
  const g = board.getContext('2d');
  g.fillStyle = '#d7d0b7'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#3e5143'; g.textAlign = 'center'; g.font = '500 57px sans-serif'; g.fillText('숲속 마당', 256, 116);
  g.font = '27px sans-serif'; g.fillText('이웃과 함께 듣는 작은 음악회', 256, 177);
  const texture = new THREE.CanvasTexture(board); texture.colorSpace = THREE.SRGBColorSpace;
  add(group, new THREE.BoxGeometry(2.9, 1.5, 0.1).translate(-15.8, 1.85, 4.8), timber);
  add(group, new THREE.PlaneGeometry(2.78, 1.38).translate(-15.8, 1.85, 4.86), mat('#ffffff', { map: texture }));
  add(group, merged([-1, 1].map(s => rod(V(-15.8 + s * 1.05, 0, 4.8), V(-15.8 + s * 1.05, 1.8, 4.8), 0.055))), timber);
}

export function buildOutdoor({ quality = 'high', lite = false } = {}) {
  const group = new THREE.Group(); group.name = 'outdoor';
  const boardMap = new THREE.CanvasTexture(woodTexture({ base: '#a58660', dark: '#786345', light: '#c0a781', seed: 61, planks: 8 }));
  boardMap.colorSpace = THREE.SRGBColorSpace;
  boardMap.wrapS = boardMap.wrapT = THREE.RepeatWrapping;
  boardMap.repeat.set(1, 1);
  boardMap.anisotropy = lite ? 2 : 4;
  const boards = mat('#b89b73', { map: boardMap, roughness: 0.93 });
  const timber = mat('#8b7658'); const skirt = mat('#76644d');
  const metal = mat('#404a43', { metalness: 0.25 });
  const cloth = mat('#ded8c3', { side: THREE.DoubleSide });
  const darkCloth = mat('#657062', { side: THREE.DoubleSide });
  const bulbMat = mat('#ffdf9e', { emissive: '#ffc575', emissiveIntensity: 2.5 });
  const style = {
    boards: () => boards, skirt: () => skirt, trim: () => timber,
    rail: () => metal, carpet: () => mat('#888474'),
    strip: { color: '#92846d', emissive: '#000000', intensity: 0 },
    apronPilasters: false,
  };
  add(group, new THREE.PlaneGeometry(180, 180).rotateX(-Math.PI / 2), mat('#ffffff', { map: lawnTexture() }), { name: 'park-lawn' });
  buildStage(group, style);
  buildCanopy(group, cloth, timber, darkCloth);
  buildTrees(group, lite);
  buildStrings(group, bulbMat, timber, lite);
  buildParkDetails(group, timber, metal);
  const seats = outdoorSeatList(); const furniture = foldingChairs(seats); group.add(furniture.group);

  const hemi = new THREE.HemisphereLight('#c4d9df', '#67714d', 1.15); group.add(hemi);
  const key = new THREE.SpotLight('#ffe1b2', lite ? 1000 : 850, 0, 0.59, 0.8, 2);
  key.position.set(0, 12, 8); key.target.position.set(0, STAGE_Y, -5.5);
  key.castShadow = quality !== 'low';
  key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  key.shadow.camera.near = 2; key.shadow.camera.far = 46;
  key.shadow.bias = -0.0001; key.shadow.normalBias = 0.025; key.shadow.radius = 3;
  group.add(key, key.target);
  const fills = [];
  if (!lite) for (const side of [-1, 1]) {
    const light = new THREE.SpotLight(side < 0 ? '#ffe5c6' : '#c6d9e0', 200, 0, 0.68, 0.85, 2);
    light.position.set(side * 12.4, 6.8, 0.7); light.target.position.set(side * 2, STAGE_Y + 1, -7);
    group.add(light, light.target); fills.push(light);
  }
  const house = [];
  for (const z of lite ? [14] : [7, 19]) {
    const light = new THREE.PointLight('#ffd59b', lite ? 17 : 11, 30, 1.5); light.position.set(0, 4.5, z); group.add(light);
    house.push({ light, base: light.intensity });
  }
  const lights = { key, hemi, fills, house };
  // Furniture and scenery never animate. Preserve world propagation (the
  // venue group can move), but skip recomposing every mesh's local matrix.
  group.traverse(object => {
    if (!object.isMesh) return;
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
  let level = 1; let target = 1;
  return {
    group, seats, seatMesh: furniture.pick, seatGroup: furniture.group, lights,
    prepareRender() {},
    setHouseLights(v) { target = Math.max(0, Math.min(1, v)); },
    update(dt) {
      level += (target - level) * Math.min(1, dt * 0.8);
      house.forEach(h => { h.light.intensity = h.base * (0.22 + level * 0.78); });
      hemi.intensity = 0.66 + level * 0.49;
      bulbMat.emissiveIntensity = 1.3 + level * 1.2;
    },
  };
}
