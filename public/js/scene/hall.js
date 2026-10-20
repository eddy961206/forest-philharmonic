// The concert hall: a shoebox hall (the acoustically classic shape) whose
// columns grow into a vaulted forest canopy, with a moonlit forest seen
// through the great window behind the stage.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glowTexture } from './materials.js';
import { STAGE_Y, PODIUM } from '../layout.js';

export const HALL = {
  halfW: 15,
  front: -13.6, // stage back wall
  back: 31.5,
  ceiling: 17.5,
  firstRow: 3.2,
  rowGap: 0.95,
  rows: 25,
  balconyY: 6.6,
  balconyZ: 23.5,
  sideBoxY: 5.3,
};

export function rakeY(z) {
  return z < HALL.firstRow - 0.6 ? 0 : (z - (HALL.firstRow - 0.6)) * 0.118;
}

const RISERS = [
  { r0: 4.55, r1: 5.85, h: 0.3 },
  { r0: 5.85, r1: 7.15, h: 0.6 },
  { r0: 7.15, r1: 9.2, h: 0.9 },
];

export function stageFloorY(x, z) {
  const dx = x - PODIUM.x;
  const dz = z - PODIUM.z;
  const r = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, -dz);
  let y = STAGE_Y;
  if (Math.abs(ang) < (80 * Math.PI) / 180 && dz < 0.5) {
    for (const R of RISERS) if (r >= R.r0 && r < R.r1) y = STAGE_Y + R.h;
  }
  return y;
}

// floor height for walking
export function floorAt(x, z) {
  if (z < 0.6 && Math.abs(x) < 12.2) return stageFloorY(x, z);
  return rakeY(z);
}

export function buildHall({ quality = 'high' } = {}) {
  const group = new THREE.Group();
  group.name = 'hall';
  const seats = [];
  const update = [];
  const H = HALL;

  // ---------------------------------------------------------------- stage
  {
    const shape = new THREE.Shape();
    shape.moveTo(-12.4, H.front + 0.1);
    shape.lineTo(12.4, H.front + 0.1);
    shape.lineTo(12.4, -0.3);
    shape.quadraticCurveTo(0, 1.6, -12.4, -0.3);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: STAGE_Y, bevelEnabled: false, curveSegments: 48 });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, STAGE_Y, 0);
    // planar UVs on the top
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4);
    const stage = new THREE.Mesh(geo, [M.stageWood(), M.darkWood()]);
    stage.receiveShadow = true;
    group.add(stage);

    // risers (annular sectors around the podium)
    const riserGeos = [];
    for (const R of RISERS) {
      const s = new THREE.Shape();
      const a0 = (-80 * Math.PI) / 180;
      const a1 = (80 * Math.PI) / 180;
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const a = a0 + ((a1 - a0) * i) / N;
        const px = PODIUM.x + R.r1 * Math.sin(a);
        const pz = PODIUM.z - R.r1 * Math.cos(a);
        if (i === 0) s.moveTo(px, pz); else s.lineTo(px, pz);
      }
      for (let i = N; i >= 0; i--) {
        const a = a0 + ((a1 - a0) * i) / N;
        s.lineTo(PODIUM.x + R.r0 * Math.sin(a), PODIUM.z - R.r0 * Math.cos(a));
      }
      const g = new THREE.ExtrudeGeometry(s, { depth: R.h, bevelEnabled: false });
      g.rotateX(Math.PI / 2);
      g.translate(0, STAGE_Y + R.h, 0);
      const p = g.attributes.position;
      const u = g.attributes.uv;
      for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
      riserGeos.push(g);
    }
    const risers = new THREE.Mesh(mergeGeometries(riserGeos, true), [M.stageWood(), M.darkWood()]);
    risers.receiveShadow = true;
    risers.castShadow = true;
    group.add(risers);

    // conductor's podium with rail
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.22, 32), M.darkWood());
    pod.position.set(PODIUM.x, STAGE_Y + 0.11, PODIUM.z);
    pod.receiveShadow = true;
    pod.castShadow = true;
    group.add(pod);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.02, 8, 32, Math.PI), M.brass());
    rail.rotation.x = Math.PI / 2;
    rail.rotation.z = Math.PI;
    rail.position.set(PODIUM.x, STAGE_Y + 1.05, PODIUM.z + 0.02);
    group.add(rail);
    for (const a of [0.15, Math.PI / 2, Math.PI - 0.15]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.84, 8), M.brass());
      post.position.set(PODIUM.x + Math.cos(a) * 0.55, STAGE_Y + 0.63, PODIUM.z + Math.sin(a) * 0.55);
      group.add(post);
    }

    // front lip trim (gold edge on the stage apron)
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-12.4, STAGE_Y, -0.3), new THREE.Vector3(0, STAGE_Y, 1.6), new THREE.Vector3(12.4, STAGE_Y, -0.3));
    const lip = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.035, 8), M.gold());
    group.add(lip);
  }

  // ------------------------------------------------------------ acoustic shell
  {
    const geos = [];
    const R = 11.2;
    const N = 15;
    for (let i = 0; i < N; i++) {
      const a = (-98 + (196 * (i + 0.5)) / N) * (Math.PI / 180);
      const h = 4.6 + Math.cos(a) * 0.6;
      const g = new THREE.BoxGeometry(2.25, h, 0.12);
      g.rotateX(-0.08);
      g.rotateY(-a);
      g.translate(PODIUM.x + R * Math.sin(a), STAGE_Y + h / 2, PODIUM.z - R * Math.cos(a) * 0.9);
      if (PODIUM.z - R * Math.cos(a) * 0.9 > H.front + 0.3 || Math.abs(a) > 1.2) geos.push(g);
    }
    const shell = new THREE.Mesh(mergeGeometries(geos), M.panelWood());
    shell.receiveShadow = true;
    group.add(shell);
  }

  // ---------------------------------------------------------- audience floor
  {
    // raked floor as a strip mesh
    const w = H.halfW * 2;
    const zs = [];
    for (let z = 0.4; z <= H.back + 0.01; z += 0.5) zs.push(z);
    const pos = [];
    const uvs = [];
    const idx = [];
    zs.forEach((z, i) => {
      pos.push(-H.halfW, rakeY(z), z, H.halfW, rakeY(z), z);
      uvs.push(0, z / 3, w / 3, z / 3);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const floor = new THREE.Mesh(g, M.floorWood());
    floor.receiveShadow = true;
    group.add(floor);

    // carpeted aisles
    for (const ax of [-7.1, 7.1]) {
      const ag = g.clone();
      const p = ag.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, i % 2 === 0 ? ax - 0.6 : ax + 0.6);
      p.needsUpdate = true;
      ag.translate(0, 0.01, 0);
      const aisle = new THREE.Mesh(ag, M.carpet());
      aisle.receiveShadow = true;
      group.add(aisle);
    }
    // front cross-aisle
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.6), M.carpet());
    front.rotation.x = -Math.PI / 2;
    front.position.set(0, 0.005, 1.6);
    front.receiveShadow = true;
    group.add(front);
  }

  // ---------------------------------------------------------------- seats
  const seatData = buildSeats(seats);
  group.add(seatData.group);

  // ------------------------------------------------------------- balconies
  {
    const geos = [];
    const rails = [];
    // rear balcony: stepped tiers
    const bz = H.balconyZ;
    const tiers = 5;
    for (let r = 0; r < tiers; r++) {
      const z0 = bz + r * 1.05;
      const y = H.balconyY + r * 0.42;
      const g = new THREE.BoxGeometry(H.halfW * 2 - 0.2, 0.4 + r * 0.42, 1.05);
      g.translate(0, y - (0.4 + r * 0.42) / 2 + 0.2 - 0.2, z0 + 0.525);
      geos.push(g);
    }
    // soffit (underside) of the balcony
    const soff = new THREE.BoxGeometry(H.halfW * 2 - 0.2, 0.5, H.back - bz + 0.6);
    soff.translate(0, H.balconyY - 0.45, (bz + H.back) / 2 - 0.3);
    geos.push(soff);
    // rail
    const railCurve = new THREE.LineCurve3(new THREE.Vector3(-H.halfW + 0.2, H.balconyY + 0.82, bz - 0.15), new THREE.Vector3(H.halfW - 0.2, H.balconyY + 0.82, bz - 0.15));
    rails.push(new THREE.TubeGeometry(railCurve, 2, 0.035, 8));
    const front = new THREE.BoxGeometry(H.halfW * 2 - 0.2, 0.86, 0.18);
    front.translate(0, H.balconyY + 0.36, bz - 0.12);
    geos.push(front);

    // side box balconies
    for (const side of [-1, 1]) {
      const bx = side * (H.halfW - 0.9);
      const g = new THREE.BoxGeometry(1.8, 0.45, 19.5);
      g.translate(bx, H.sideBoxY - 0.22, 12.5);
      geos.push(g);
      const f = new THREE.BoxGeometry(0.16, 0.95, 19.5);
      f.translate(bx - side * 0.92, H.sideBoxY + 0.45, 12.5);
      geos.push(f);
      const c = new THREE.LineCurve3(new THREE.Vector3(bx - side * 0.92, H.sideBoxY + 0.96, 2.8), new THREE.Vector3(bx - side * 0.92, H.sideBoxY + 0.96, 22.2));
      rails.push(new THREE.TubeGeometry(c, 2, 0.045, 8));
    }
    const balc = new THREE.Mesh(mergeGeometries(geos), M.darkWood());
    balc.receiveShadow = true;
    balc.castShadow = true;
    group.add(balc);
    group.add(new THREE.Mesh(mergeGeometries(rails), new THREE.MeshStandardMaterial({ color: '#8a6a3c', metalness: 0.7, roughness: 0.55 })));
  }

  // --------------------------------------------------------- walls & canopy
  const lanterns = [];
  {
    const wallGeos = [];
    const panelGeos = [];
    // side walls
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.4, H.ceiling, H.back - H.front);
      g.translate(side * (H.halfW + 0.2), H.ceiling / 2, (H.back + H.front) / 2);
      wallGeos.push(g);
      // wainscot panels
      for (let z = H.front + 1; z < H.back - 1; z += 2.2) {
        const p = new THREE.BoxGeometry(0.08, 2.4, 1.9);
        p.translate(side * (H.halfW - 0.02), rakeY(Math.max(z, 1)) + 1.4, z + 1.1);
        panelGeos.push(p);
      }
    }
    // back wall
    const bw = new THREE.BoxGeometry(H.halfW * 2 + 0.8, H.ceiling, 0.4);
    bw.translate(0, H.ceiling / 2, H.back + 0.2);
    wallGeos.push(bw);
    // ceiling
    const cg = new THREE.BoxGeometry(H.halfW * 2 + 0.8, 0.4, H.back - H.front);
    cg.translate(0, H.ceiling + 0.2, (H.back + H.front) / 2);
    wallGeos.push(cg);
    const walls = new THREE.Mesh(mergeGeometries(wallGeos), M.wall());
    walls.receiveShadow = true;
    group.add(walls);
    const panels = new THREE.Mesh(mergeGeometries(panelGeos), M.panelWood());
    panels.receiveShadow = true;
    group.add(panels);

    // stage-end wall with the great window opening
    const shape = new THREE.Shape();
    shape.moveTo(-H.halfW - 0.4, 0);
    shape.lineTo(H.halfW + 0.4, 0);
    shape.lineTo(H.halfW + 0.4, H.ceiling + 0.4);
    shape.lineTo(-H.halfW - 0.4, H.ceiling + 0.4);
    shape.closePath();
    const hole = new THREE.Path();
    const wx = 6.2;
    const wy0 = 5.6;
    const wy1 = 12.4;
    hole.moveTo(-wx, wy0);
    hole.lineTo(wx, wy0);
    hole.lineTo(wx, wy1);
    hole.absarc(0, wy1, wx, 0, Math.PI, false);
    hole.lineTo(-wx, wy0);
    shape.holes.push(hole);
    const fw = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false, curveSegments: 48 });
    fw.translate(0, 0, H.front - 0.6);
    const frontWall = new THREE.Mesh(fw, M.wall());
    frontWall.receiveShadow = true;
    group.add(frontWall);

    // window frame + mullions
    const frameGeos = [];
    const arch = new THREE.EllipseCurve(0, wy1, wx, wx, 0, Math.PI, false);
    const pts = arch.getPoints(48).map((p) => new THREE.Vector3(p.x, p.y, H.front + 0.02));
    const archPath = new THREE.CatmullRomCurve3([new THREE.Vector3(wx, wy0, H.front + 0.02), ...pts, new THREE.Vector3(-wx, wy0, H.front + 0.02)]);
    frameGeos.push(new THREE.TubeGeometry(archPath, 96, 0.14, 8));
    frameGeos.push(new THREE.BoxGeometry(wx * 2 + 0.3, 0.22, 0.3).translate(0, wy0, H.front + 0.02));
    for (let i = -2; i <= 2; i++) {
      const x = (i * wx) / 3;
      const top = wy1 + Math.sqrt(Math.max(0, wx * wx - x * x));
      frameGeos.push(new THREE.BoxGeometry(0.07, top - wy0, 0.08).translate(x, (top + wy0) / 2, H.front + 0.02));
    }
    for (const y of [wy0 + 2.3, wy0 + 4.6, wy1 + 2.8]) {
      const half = y <= wy1 ? wx : Math.sqrt(Math.max(0, wx * wx - (y - wy1) ** 2));
      frameGeos.push(new THREE.BoxGeometry(half * 2, 0.06, 0.08).translate(0, y, H.front + 0.02));
    }
    group.add(new THREE.Mesh(mergeGeometries(frameGeos), new THREE.MeshStandardMaterial({ color: '#4a3622', metalness: 0.35, roughness: 0.55 })));

    // the view: moonlit forest painted on a backdrop far behind the glass
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 34), new THREE.MeshBasicMaterial({ map: nightForestTexture(), toneMapped: false, fog: false }));
    sky.position.set(0, 10, H.front - 14);
    group.add(sky);
    // faint glass reflection
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(wx * 2, wy1 - wy0 + wx), new THREE.MeshPhysicalMaterial({ color: '#9fb4d0', transparent: true, opacity: 0.06, roughness: 0.05, metalness: 0, depthWrite: false }));
    glass.position.set(0, (wy0 + wy1 + wx) / 2, H.front - 0.25);
    group.add(glass);
    // moonlight through the window
    const moon = new THREE.SpotLight('#9ab8ff', 0, 40, 0.5, 0.8, 0);
    moon.position.set(4, 16, H.front - 10);
    moon.target.position.set(-1, STAGE_Y, -5);
    moon.intensity = 0.5;
    group.add(moon, moon.target);

    // ---- forest canopy: tree-trunk pilasters that branch into vault ribs
    const trunkGeos = [];
    const ribGeos = [];
    const leafPos = [];
    const pilasterZ = [];
    for (let z = H.front + 2.2; z < H.back - 0.5; z += 4.1) pilasterZ.push(z);
    for (const z of pilasterZ) {
      for (const side of [-1, 1]) {
        const x = side * (H.halfW - 0.35);
        const base = z < 0.6 ? 0 : rakeY(z);
        const tg = new THREE.CylinderGeometry(0.32, 0.5, 13 - base, 10, 4);
        // gnarl the trunk a little
        const tp = tg.attributes.position;
        for (let i = 0; i < tp.count; i++) {
          const yy = tp.getY(i);
          const k = 1 + 0.08 * Math.sin(yy * 2.1 + z) + 0.05 * Math.sin(Math.atan2(tp.getZ(i), tp.getX(i)) * 3 + yy);
          tp.setX(i, tp.getX(i) * k);
          tp.setZ(i, tp.getZ(i) * k);
        }
        tg.translate(x, base + (13 - base) / 2, z);
        trunkGeos.push(tg);
        // two branching ribs: one across the vault, one diagonal
        for (const dz of [0, 1.6]) {
          const c = new THREE.CubicBezierCurve3(
            new THREE.Vector3(x, 12.4, z),
            new THREE.Vector3(x * 0.92, 16.6, z + dz * 0.5),
            new THREE.Vector3(x * 0.35, 17.6, z + dz),
            new THREE.Vector3(0, 17.4, z + dz * 1.2),
          );
          ribGeos.push(new THREE.TubeGeometry(c, 24, dz ? 0.12 : 0.2, 6));
          for (let k = 0; k < 7; k++) {
            const p = c.getPoint(0.15 + (k / 7) * 0.85);
            leafPos.push([p.x + (Math.random() - 0.5) * 1.2, p.y - 0.3 - Math.random() * 0.4, p.z + (Math.random() - 0.5) * 1.4]);
          }
        }
        // lanterns hanging from ribs
        if (Math.abs(z % 8.2) < 4.1) {
          lanterns.push(new THREE.Vector3(x * 0.55, 13.2 + Math.random() * 1.6, z + 0.8));
        }
      }
    }
    const trunks = new THREE.Mesh(mergeGeometries(trunkGeos), M.bark());
    trunks.castShadow = false;
    trunks.receiveShadow = true;
    group.add(trunks);
    group.add(new THREE.Mesh(mergeGeometries(ribGeos), M.bark()));

    // leaf clusters (instanced)
    const leafGeo = new THREE.IcosahedronGeometry(0.55, 0);
    const leaves = new THREE.InstancedMesh(leafGeo, M.leaf(), leafPos.length);
    const leaves2 = new THREE.InstancedMesh(leafGeo, M.leafLight(), leafPos.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    leafPos.forEach((p, i) => {
      const s = 0.7 + Math.random() * 0.9;
      q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      m4.compose(new THREE.Vector3(...p), q, new THREE.Vector3(s * 1.3, s * 0.7, s));
      leaves.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(p[0] + 0.4, p[1] - 0.2, p[2] + 0.3), q, new THREE.Vector3(s * 0.8, s * 0.5, s * 0.7));
      leaves2.setMatrixAt(i, m4);
    });
    group.add(leaves, leaves2);
  }

  // --------------------------------------------------- lanterns & sconces
  const glow = glowTexture('rgba(255,214,150,1)', 'rgba(255,170,90,0)');
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ffb45c', emissiveIntensity: 1.6, roughness: 0.4 });
  const lanternGroup = new THREE.Group();
  const lanternParts = [];
  for (const p of lanterns) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 8), lanternMat);
    body.position.copy(p);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 8), M.gold());
    cap.position.set(p.x, p.y + 0.3, p.z);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 17.4 - p.y, 4), M.ebony());
    cord.position.set(p.x, (17.4 + p.y) / 2 + 0.2, p.z);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffd29a', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.copy(p);
    halo.scale.setScalar(1.8);
    lanternGroup.add(body, cap, cord, halo);
    lanternParts.push({ body, halo, phase: Math.random() * 10 });
  }
  group.add(lanternGroup);

  // wall sconces on each pilaster
  const sconceMat = new THREE.MeshStandardMaterial({ color: '#fff0d0', emissive: '#ffc77a', emissiveIntensity: 1.8, roughness: 0.3 });
  for (let z = HALL.front + 2.2; z < HALL.back - 0.5; z += 4.1) {
    for (const side of [-1, 1]) {
      const y = (z < 0.6 ? 0 : rakeY(z)) + 3.6;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), sconceMat);
      b.position.set(side * (HALL.halfW - 0.95), y, z);
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffc98a', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
      h.position.copy(b.position);
      h.scale.setScalar(1.3);
      group.add(b, h);
      lanternParts.push({ body: b, halo: h, phase: Math.random() * 10, sconce: true });
    }
  }

  // ------------------------------------------------------------------ lights
  const lights = {};
  lights.hemi = new THREE.HemisphereLight('#ffdcb8', '#2a1a10', 0.4);
  group.add(lights.hemi);

  const key = new THREE.SpotLight('#ffe7c4', 2.6, 0, 0.62, 0.55, 0);
  key.position.set(0, 16.5, 9);
  key.target.position.set(0, STAGE_Y, -5.2);
  key.castShadow = quality !== 'low';
  key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  key.shadow.camera.near = 6;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.00012;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  group.add(key, key.target);
  lights.key = key;

  const fillL = new THREE.SpotLight('#ffcf9e', 0.95, 0, 0.55, 0.7, 0);
  fillL.position.set(-13, 12, 6);
  fillL.target.position.set(-2, STAGE_Y, -5);
  const fillR = new THREE.SpotLight('#ffd9b0', 0.95, 0, 0.55, 0.7, 0);
  fillR.position.set(13, 12, 6);
  fillR.target.position.set(2, STAGE_Y, -5);
  group.add(fillL, fillL.target, fillR, fillR.target);
  lights.fills = [fillL, fillR];

  // back-light rim from above the shell
  const rim = new THREE.SpotLight('#ffd8a8', 0.9, 0, 0.8, 0.8, 0);
  rim.position.set(0, 12, -13);
  rim.target.position.set(0, STAGE_Y, -2);
  group.add(rim, rim.target);
  lights.rim = rim;

  // warm house lights (dimmed during performance)
  const house = [];
  for (const [x, z] of [[-9, 8], [9, 8], [-9, 20], [9, 20], [0, 14]]) {
    const pl = new THREE.PointLight('#ffbf7a', 14, 26, 1.6);
    pl.position.set(x, 11.5, z);
    group.add(pl);
    house.push(pl);
  }
  lights.house = house;

  // volumetric light beams from the key light (subtle, additive)
  const beam = makeBeam(key.position, new THREE.Vector3(0, STAGE_Y, -4.6), 6.4);
  group.add(beam);
  const beamL = makeBeam(fillL.position, new THREE.Vector3(-3, STAGE_Y, -4), 4.6, 0.022);
  const beamR = makeBeam(fillR.position, new THREE.Vector3(3, STAGE_Y, -4), 4.6, 0.022);
  group.add(beamL, beamR);

  // ------------------------------------------------------------- animation
  let houseLevel = 1;
  let houseTarget = 1;
  update.push((dt, t) => {
    houseLevel += (houseTarget - houseLevel) * Math.min(1, dt * 0.8);
    for (const pl of house) pl.intensity = 14 * houseLevel;
    lights.hemi.intensity = 0.22 + 0.22 * houseLevel;
    for (const l of lanternParts) {
      const flick = 0.92 + 0.08 * Math.sin(t * 2.3 + l.phase) * Math.sin(t * 5.1 + l.phase * 2);
      const lv = l.sconce ? 0.45 + 0.55 * houseLevel : 0.75 + 0.25 * houseLevel;
      l.halo.material.opacity = (l.sconce ? 0.6 : 0.55) * flick * lv;
    }
    lanternMat.emissiveIntensity = 1.6 * (0.8 + 0.2 * houseLevel);
    sconceMat.emissiveIntensity = 1.8 * (0.4 + 0.6 * houseLevel);
    beam.material.uniforms.uOpacity.value = 0.06 + 0.03 * (1 - houseLevel);
  });

  return {
    group,
    seats,
    seatMesh: seatData.pick,
    lights,
    setHouseLights(v) { houseTarget = v; },
    update(dt, t) { for (const f of update) f(dt, t); },
  };
}

// ------------------------------------------------------------------ seats
function buildSeats(seats) {
  const H = HALL;
  const group = new THREE.Group();
  // one seat = cushion + back (fabric) and frame/armrests (wood)
  const cushion = new THREE.BoxGeometry(0.48, 0.1, 0.46, 1, 1, 1);
  cushion.translate(0, 0.45, 0.02);
  const back = new THREE.BoxGeometry(0.48, 0.6, 0.09);
  back.rotateX(-0.16);
  back.translate(0, 0.8, 0.27);
  const fabric = mergeGeometries([cushion, back]);
  const armL = new THREE.BoxGeometry(0.05, 0.08, 0.5).translate(-0.27, 0.66, 0.08);
  const armR = new THREE.BoxGeometry(0.05, 0.08, 0.5).translate(0.27, 0.66, 0.08);
  const legL = new THREE.BoxGeometry(0.05, 0.62, 0.42).translate(-0.27, 0.31, 0.12);
  const legR = new THREE.BoxGeometry(0.05, 0.62, 0.42).translate(0.27, 0.31, 0.12);
  const backShell = new THREE.BoxGeometry(0.5, 0.64, 0.03).rotateX(-0.16).translate(0, 0.8, 0.33);
  const frame = mergeGeometries([armL, armR, legL, legR, backShell]);

  const list = [];
  const rowName = (i) => String.fromCharCode(65 + i);
  // main floor: centre block + two side blocks, gently curved rows
  for (let r = 0; r < H.rows; r++) {
    const z = H.firstRow + r * H.rowGap;
    const blocks = [
      { x0: -12.9, x1: -7.9 },
      { x0: -6.3, x1: 6.3 },
      { x0: 7.9, x1: 12.9 },
    ];
    let num = 1;
    for (const b of blocks) {
      const n = Math.floor((b.x1 - b.x0) / 0.56) + 1;
      for (let i = 0; i < n; i++) {
        const x = b.x0 + i * ((b.x1 - b.x0) / Math.max(1, n - 1));
        const curve = (x * x) * 0.006; // rows curve toward the stage
        const zz = z + curve;
        if (zz > H.back - 0.6) continue;
        const yaw = Math.atan2(x, 18) * 0.6; // angle toward the stage centre
        list.push({ x, y: rakeY(zz), z: zz, yaw, level: '1층', row: rowName(r), num: num++ });
      }
    }
  }
  // rear balcony
  for (let r = 0; r < 5; r++) {
    const z = H.balconyZ + 0.55 + r * 1.05;
    const y = H.balconyY + r * 0.42;
    let num = 1;
    for (let x = -13.6; x <= 13.61; x += 0.58) {
      list.push({ x, y, z, yaw: Math.atan2(x, 30) * 0.5, level: '2층', row: rowName(r), num: num++ });
    }
  }
  // side boxes
  for (const side of [-1, 1]) {
    let num = 1;
    for (let z = 3.4; z < 21.8; z += 0.62) {
      list.push({ x: side * (H.halfW - 1.2), y: H.sideBoxY, z, yaw: side * 1.05 + Math.atan2(0, 1), level: side < 0 ? '박스석 L' : '박스석 R', row: 'BOX', num: num++ });
    }
  }

  const fabricMesh = new THREE.InstancedMesh(fabric, M.velvet(), list.length);
  const frameMesh = new THREE.InstancedMesh(frame, M.darkWood(), list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  list.forEach((s, i) => {
    // seats face the stage: local -z toward stage => rotate PI
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, one);
    fabricMesh.setMatrixAt(i, m);
    frameMesh.setMatrixAt(i, m);
    s.label = s.row === 'BOX' ? `${s.level} ${s.num}번` : `${s.level} ${s.row}열 ${s.num}번`;
    s.index = i;
    seats.push(s);
  });
  fabricMesh.receiveShadow = true;
  frameMesh.receiveShadow = true;
  fabricMesh.castShadow = true;
  group.add(fabricMesh, frameMesh);
  return { group, pick: fabricMesh };
}

// --------------------------------------------------------------- helpers
function makeBeam(from, to, radius, opacity = 0.07) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(0.15, radius, len, 48, 1, true);
  geo.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: opacity }, uColor: { value: new THREE.Color('#ffe2b8') }, uLen: { value: len } },
    vertexShader: /* glsl */`
      varying float vT; varying vec3 vN; varying vec3 vView;
      uniform float uLen;
      void main(){
        vT = -position.y / uLen;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vView = normalize(-mv.xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vT; varying vec3 vN; varying vec3 vView;
      uniform float uOpacity; uniform vec3 uColor;
      void main(){
        float edge = pow(abs(dot(vN, vView)), 1.6);
        float fall = smoothstep(0.0, 0.25, vT) * (1.0 - smoothstep(0.75, 1.0, vT));
        gl_FragColor = vec4(uColor, uOpacity * edge * fall);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;
  return mesh;
}

function nightForestTexture() {
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
  // milky way haze
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
  // stars
  for (let i = 0; i < 1600; i++) {
    const x = r() * c.width;
    const y = r() * c.height * 0.8;
    const m = Math.pow(r(), 3);
    g.fillStyle = `rgba(255,${235 + r() * 20},${210 + r() * 45},${0.25 + m * 0.75})`;
    g.beginPath();
    g.arc(x, y, 0.5 + m * 1.8, 0, Math.PI * 2);
    g.fill();
  }
  // moon with halo
  const mx = 1310;
  const my = 300;
  const halo = g.createRadialGradient(mx, my, 20, mx, my, 360);
  halo.addColorStop(0, 'rgba(255,244,214,0.55)');
  halo.addColorStop(0.2, 'rgba(220,226,255,0.18)');
  halo.addColorStop(1, 'rgba(200,210,255,0)');
  g.fillStyle = halo;
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
  // layered forest silhouettes (far = bluish, near = black)
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
      // conifer: stacked triangles
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
  // mist between layers
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
