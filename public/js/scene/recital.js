// A recital: when one pianist plays alone, a few chairs come out on the
// stage behind them (the keys over their shoulder, the hall beyond) and a
// page turner's chair at their left, with the score on the piano's desk.
// Four draws in all, and only while a recital is on: the chairs, the desk,
// the open book and the leaf that turns.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chairGeometry } from './instruments.js';
import { M, plainMaterial } from './materials.js';
import { stageFloorY, onStage } from './hallplan.js';

function pageTexture() {
  const W = 256;
  const H = 340;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#f3ecd9';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#3a3330';
  g.fillStyle = '#2a2420';
  g.lineWidth = 1.4;
  let r = 7;
  const rand = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  for (let sys = 0; sys < 6; sys++) {
    const y0 = 30 + sys * 50;
    for (let l = 0; l < 5; l++) {
      g.beginPath();
      g.moveTo(16, y0 + l * 5);
      g.lineTo(W - 16, y0 + l * 5);
      g.stroke();
    }
    for (let x = 30; x < W - 24; x += 11 + rand() * 9) {
      const y = y0 + Math.floor(rand() * 9) * 2.5;
      g.beginPath();
      g.ellipse(x, y, 3.2, 2.3, -0.4, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x + 2.4, y - 15, 1.2, 15);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// seats: the venue's seat list (the recital's are added to it, switched off
// until a recital); orchestra: the pianist and their piano
export function buildRecital(scene, orchestra, seats) {
  const pianist = orchestra.playerAt('piano', 0);
  const P = pianist.home;
  const keys = { x: P.x + 0.55, z: P.z }; // the keyboard, from behind the player
  const spots = [];
  // the page turner: at the pianist's left (upstage), a little behind them
  spots.push({ x: P.x - 0.2, z: P.z - 0.8, turner: true });
  // an arc of chairs behind the pianist, stage left
  for (const [r, deg] of [[2.2, -32], [2.2, 0], [2.2, 32], [3.05, -18], [3.05, 14], [3.05, 44]]) {
    const a = (deg * Math.PI) / 180;
    spots.push({ x: keys.x - r * Math.cos(a), z: keys.z + r * Math.sin(a) });
  }
  const list = [];
  const geos = [];
  let n = 0;
  for (const s of spots) {
    if (!onStage(s.x, s.z)) continue;
    const y = stageFloorY(s.x, s.z);
    if (Math.abs(y - P.y) > 0.05) continue; // not up on a riser
    // the turner looks along the keys with the player; the others at the keys
    const yaw = s.turner ? pianist.yaw : Math.atan2(-(keys.x - s.x), -(keys.z - s.z));
    const seat = {
      x: s.x, y, z: s.z, yaw, index: seats.length, level: '무대', row: 'STAGE', num: s.turner ? 0 : ++n,
      label: s.turner ? '무대 위 · 악보 넘김이 자리' : `무대 위 객석 ${n}번`,
      type: 'stage', stage: true, turner: !!s.turner, off: true,
      look: s.turner ? { x: P.x + 0.75, y: P.y + 1.05, z: P.z - 0.05 } : { x: keys.x + 0.2, y: P.y + 0.95, z: keys.z },
    };
    seats.push(seat);
    list.push(seat);
    geos.push(chairGeometry().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(s.x, y, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1))));
  }
  const chairs = new THREE.Mesh(mergeGeometries(geos), plainMaterial('#1a1716', { roughness: 0.55 }));
  chairs.castShadow = true;
  chairs.receiveShadow = true;
  chairs.visible = false;
  scene.add(chairs);

  // the score on the piano's desk (in the piano's own frame: keys along x,
  // the player at +z)
  const inst = pianist.inst.group;
  const desk = new THREE.Group();
  desk.position.set(0, 0.99, -0.02);
  desk.rotation.x = -0.32;
  desk.visible = false;
  inst.add(desk);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.014).translate(0, 0, -0.008), M.blackLacquer());
  desk.add(board);
  const tex = pageTexture();
  const paper = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, side: THREE.DoubleSide });
  const book = new THREE.Mesh(mergeGeometries([
    new THREE.PlaneGeometry(0.2, 0.27).translate(-0.102, 0.01, 0.002),
    new THREE.PlaneGeometry(0.2, 0.27).translate(0.102, 0.01, 0.002),
  ]), paper);
  desk.add(book);
  const leaf = new THREE.Group(); // turns about the spine
  leaf.position.set(0, 0.01, 0.004);
  const leafMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.27).translate(0.102, 0, 0), paper);
  leaf.add(leafMesh);
  desk.add(leaf);

  let on = false;
  let every = 30;
  let page = 0;
  let turnT = -1;
  let nod = 0;
  return {
    seats: list,
    get on() { return on; },
    get turner() { return list.find((s) => s.turner) || null; },
    // (loading) everything drawn once so its shaders are ready before the show
    show(v) { chairs.visible = v; desk.visible = v; },
    // a recital begins (piece: its length decides how often a page turns) or ends
    open(want, piece = null) {
      on = want;
      chairs.visible = want;
      desk.visible = want;
      for (const s of list) s.off = !want;
      if (piece) {
        const pages = Math.max(2, Math.round(piece.duration / 32));
        every = piece.duration / pages;
        page = 0;
      }
      turnT = -1;
      leaf.rotation.y = 0;
    },
    // t: the performance time; returns how much the pianist nods (0..1)
    update(dt, t, playing) {
      if (!on) return 0;
      if (playing) {
        const idx = Math.floor((t + 1.2) / every); // a page goes a moment before its end
        if (idx > page && turnT < 0) { page = idx; turnT = 0; }
        if (idx < page) page = idx; // (sought back)
      }
      if (turnT >= 0) {
        turnT += dt;
        const x = Math.min(1, turnT / 0.75);
        leaf.rotation.y = -Math.PI * (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
        leaf.position.z = 0.004 + Math.sin(x * Math.PI) * 0.03;
        if (x >= 1) { turnT = -1; leaf.rotation.y = 0; leaf.position.z = 0.004; nod = 1; }
      }
      nod = Math.max(0, nod - dt * 1.4);
      return Math.sin(Math.min(1, nod) * Math.PI);
    },
  };
}
