// Chibi forest-animal musicians built from primitives, with two-bone IK
// arms. Local frame: right = +X, up = +Y, forward = -Z. Origin on the floor
// under the seat.
import { ARM_LENGTH, solveArm } from './arm-ik.js';
import * as THREE from 'three';
import { furMaterial, clothMaterial, plainMaterial, isLite, M } from './materials.js';
import { mergeChildren, bakeColor } from './merge.js';
import { raccoonPatchGeometry } from './playing-motion.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

const SPECIES = {
  bear: { ears: 'round', snout: 0.5, muzzle: '#d9b28c', nose: '#2a1a12' },
  panda: { ears: 'round', snout: 0.35, muzzle: '#f4f1ea', nose: '#1a1a1a', earColor: '#1d1d1f', patches: '#1d1d1f' },
  rabbit: { ears: 'long', snout: 0.2, muzzle: '#ffffff', nose: '#f29aa8', earInner: '#f6c2cb' },
  cat: { ears: 'pointed', snout: 0.22, muzzle: '#fff8ef', nose: '#e88a9a', earInner: '#f6c2cb', whiskers: true },
  fox: { ears: 'tall', snout: 0.55, muzzle: '#fff6ea', nose: '#1d1412', earTip: '#2b1d16', pointy: true },
  dog: { ears: 'pointed', snout: 0.42, muzzle: '#fff4e2', nose: '#21160f', earInner: '#f0c9a0' },
  raccoon: { ears: 'round', snout: 0.35, muzzle: '#f2efe9', nose: '#1a1a1a', mask: '#51463f', earInner: '#e9e4de' },
  deer: { ears: 'side', snout: 0.4, muzzle: '#f4e6d4', nose: '#2a1a12', spots: true },
  sheep: { ears: 'side', snout: 0.25, muzzle: '#e8dccb', nose: '#6b4d3e', wool: true, face: '#e8dccb' },
  mouse: { ears: 'big', snout: 0.3, muzzle: '#f2eee9', nose: '#f29aa8', earInner: '#f6c2cb', whiskers: true },
  squirrel: { ears: 'tufted', snout: 0.3, muzzle: '#f5e3cc', nose: '#2a1a12', earInner: '#e3a77a' },
  hedgehog: { ears: 'small', snout: 0.45, muzzle: '#f2e2cc', nose: '#1d1412', spines: '#5a4433' },
  koala: { ears: 'fluffy', snout: 0.1, muzzle: '#d7d9dc', nose: '#2b2b2f', bigNose: true },
  lion: { ears: 'round', snout: 0.4, muzzle: '#f7e2bd', nose: '#5a3a2a', mane: '#b5652a' },
  owl: { ears: 'tufts', snout: 0, muzzle: '#f2e2c4', nose: '#e0a33a', beak: true, bigEyes: true },
};

// phones: half the tessellation
const sphereG = (r, w, h, ...rest) => new THREE.SphereGeometry(r, isLite() ? Math.max(6, Math.round(w / 2)) : w, isLite() ? Math.max(4, Math.round(h / 2)) : h, ...rest);
const capsuleG = (r, len, cs, rs) => new THREE.CapsuleGeometry(r, len, isLite() ? Math.max(2, cs >> 1) : cs, isLite() ? Math.max(6, rs >> 1) : rs);

// Phones: the arms of every animal are drawn as two instanced meshes (arm
// segments, paws). The IK still moves per-character proxies; syncLiteArms()
// copies their world matrices across before each render.
const liteArms = [];
let liteSeg = null;
let litePaw = null;
const EXTRA = 60; // room for visitors' avatars (watching together)
export function liteArmMeshes() {
  if (liteSeg || !liteArms.length) return [];
  const make = (geo, n) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.75 }), n);
    m.frustumCulled = false;
    return m;
  };
  const segs = liteArms.filter((e) => e.seg).length;
  liteSeg = make(new THREE.CapsuleGeometry(0.055, 0.17, 2, 8), segs + EXTRA * 4);
  litePaw = make(new THREE.SphereGeometry(0.058, 10, 7), liteArms.length - segs + EXTRA * 2);
  return [liteSeg, litePaw];
}
// a character that leaves the scene gives its arms back
export function releaseCharacter(char) {
  for (let i = liteArms.length - 1; i >= 0; i--) if (liteArms[i].root === char.root) liteArms.splice(i, 1);
}
const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
export function syncLiteArms() {
  if (!liteSeg) return;
  const roots = new Set();
  let ns = 0;
  let np = 0;
  for (const e of liteArms) {
    if (!roots.has(e.root)) {
      roots.add(e.root);
      e.root.userData.shown = shown(e.root);
      if (e.root.userData.shown) e.root.updateMatrixWorld(true);
    }
    if (!e.root.userData.shown || !shown(e.proxy)) continue;
    const m = e.seg ? liteSeg : litePaw;
    const i = e.seg ? ns++ : np++;
    if (i >= m.instanceMatrix.count) continue;
    m.setMatrixAt(i, e.proxy.matrixWorld);
    // Instance colours are static between joins/leaves. Compare the GPU's
    // Float32 values so unchanged colours do not upload again every frame.
    const colors = m.instanceColor?.array;
    const offset = i * 3;
    if (!colors || colors[offset] !== Math.fround(e.color.r)
      || colors[offset + 1] !== Math.fround(e.color.g)
      || colors[offset + 2] !== Math.fround(e.color.b)) {
      m.setColorAt(i, e.color);
      m.instanceColor.needsUpdate = true;
    }
  }
  for (const [m, n] of [[liteSeg, ns], [litePaw, np]]) {
    m.count = Math.min(n, m.instanceMatrix.count);
    m.instanceMatrix.needsUpdate = true;
  }
}

export function buildCharacter(spec, sectionColor = '#ffffff') {
  const sp = SPECIES[spec.species] || SPECIES.bear;
  const scale = spec.big ? 1.28 : 1;
  const root = new THREE.Group();
  const body = new THREE.Group(); // sways
  root.add(body);
  const fur = furMaterial(spec.fur);
  const muzzleMat = furMaterial(sp.muzzle);
  const isDress = spec.outfit === 'dress';
  const coat = clothMaterial(isDress ? '#2a1830' : '#18171d', 0.5);
  const shirt = clothMaterial('#f3efe6', 0.2);
  const accent = clothMaterial(sectionColor, 0.8);
  const dark = plainMaterial('#141012', { roughness: 0.4 });

  const add = (parent, geo, mat, pos, opts = {}) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.copy(pos);
    m.castShadow = opts.cast !== false;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const seatY = spec.seatY ?? 0.5;
  const standing = !!spec.standing;
  const STAND_HIP = 0.62;
  const hipY = standing ? STAND_HIP : seatY + 0.05;
  const standLift = STAND_HIP - hipY; // how far the body rises when standing up

  // ---- legs: a seated pair and a standing pair (swung while walking)
  const trouser = isDress ? coat : clothMaterial('#141318', 0.4);
  const legsSit = new THREE.Group();
  const legsStand = new THREE.Group();
  root.add(legsSit, legsStand);
  const legPivots = [];
  const seatedLegVolumes = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.09, STAND_HIP, 0);
    add(pivot, capsuleG(0.075, STAND_HIP - 0.12, 4, 10), trouser, V(0, -STAND_HIP / 2 + 0.02, 0));
    add(pivot, sphereG(0.085, 12, 8), dark, V(0, -STAND_HIP + 0.05, -0.04)).scale.set(1, 0.6, 1.4);
    legsStand.add(pivot);
    legPivots.push(pivot);
    if (!standing) {
      if (spec.celloSeat) {
        // A cello sits between the knees. Keep hips attached to the torso,
        // then open the thighs instead of translating a pair of straight legs.
        const hip = V(sx * 0.10, hipY, 0.02);
        const knee = V(sx * 0.34, hipY - 0.04, -0.12);
        const axis = knee.clone().sub(hip);
        const thigh = add(legsSit, capsuleG(0.075, axis.length() - 0.15, 4, 10), trouser, hip.clone().add(knee).multiplyScalar(0.5));
        thigh.quaternion.setFromUnitVectors(UP, axis.normalize());
        // Capsule centreline endpoints; use these same dimensions in the guard.
        const direction = knee.clone().sub(hip).normalize();
        seatedLegVolumes.push({ a: hip.clone().addScaledVector(direction, .075), b: knee.clone().addScaledVector(direction, -.075), radius: .075 });
        seatedLegVolumes.push({ a: V(knee.x, .10, knee.z), b: V(knee.x, knee.y - .06, knee.z), radius: .068 });
        add(legsSit, capsuleG(0.068, knee.y - 0.16, 4, 10), trouser, V(knee.x, knee.y / 2 + 0.02, knee.z));
        add(legsSit, sphereG(0.08, 12, 8), dark, V(knee.x, 0.05, knee.z - 0.05)).scale.set(1, 0.6, 1.4);
        continue;
      }
      const thigh = add(legsSit, capsuleG(0.075, 0.2, 4, 10), trouser, V(sx * 0.1, hipY, -0.12));
      thigh.rotation.x = Math.PI / 2;
      add(legsSit, capsuleG(0.068, hipY - 0.16, 4, 10), trouser, V(sx * 0.11, hipY / 2 + 0.02, -0.26));
      add(legsSit, sphereG(0.08, 12, 8), dark, V(sx * 0.11, 0.05, -0.31)).scale.set(1, 0.6, 1.4);
    }
  }
  legsStand.visible = standing;
  legsSit.visible = !standing;

  // ---- torso
  const torsoY = hipY + 0.2;
  const torso = add(body, capsuleG(0.19, 0.2, 6, 16), coat, V(0, torsoY, 0));
  torso.scale.set(1.08, 1, 0.92);
  let coatTailGeometry = null;
  if (isDress) {
    // flowing skirt over the lap/legs
    const skirt = add(body, new THREE.CylinderGeometry(0.2, standing ? 0.3 : 0.34, standing ? 0.5 : 0.28, 20, 1, true), coat, V(0, standing ? hipY - 0.12 : hipY - 0.03, standing ? 0 : -0.06));
    skirt.material = coat.clone();
    skirt.material.side = THREE.DoubleSide;
    if (!standing) skirt.rotation.x = -0.25;
    const sash = add(body, new THREE.TorusGeometry(0.19, 0.025, 8, 24), accent, V(0, hipY + 0.1, 0));
    sash.rotation.x = Math.PI / 2;
    sash.scale.set(1.08, 0.92, 1);
  } else {
    // shirt front and bow tie
    const front = add(body, sphereG(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shirt, V(0, torsoY + 0.1, -0.14), { cast: false });
    front.rotation.x = -Math.PI / 2 - 0.25;
    front.scale.set(0.8, 1, 0.55);
    // Character front is -Z. Anchor the coat at the back waist, then let
    // both tapered tails fall down and slightly rearward (+Z). Rotating a
    // detached box around its centre left the old top floating off the back.
    const coatTails = new THREE.Group();
    coatTails.name = 'coat-tails';
    coatTails.position.set(0, hipY + 0.14, 0.12);
    coatTails.rotation.x = -0.25;
    body.add(coatTails);
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(side * 0.008, 0);
      shape.lineTo(side * 0.13, 0);
      shape.lineTo(side * 0.105, -0.32);
      shape.lineTo(side * 0.025, -0.34);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false, steps: 1 });
      geometry.translate(0, 0, -0.0125);
      add(coatTails, geometry, coat, null, { cast: false });
    }
    coatTails.updateMatrix();
    const vertices = coatTails.children.flatMap(mesh => {
      const position = mesh.geometry.getAttribute('position');
      return Array.from({ length: position.count }, (_, i) => V().fromBufferAttribute(position, i));
    });
    // Contract comes from the actual mesh vertices, in body coordinates.
    // Rigid cloth is merged below, so it adds no separate scene draw.
    coatTailGeometry = {
      seam: vertices.filter(p => Math.abs(p.y) < 1e-6).map(p => p.clone().applyMatrix4(coatTails.matrix)),
      hem: vertices.filter(p => p.y < -0.3).map(p => p.clone().applyMatrix4(coatTails.matrix)),
    };
  }
  const tieY = torsoY + 0.24;
  const tie = new THREE.Group();
  tie.position.set(0, tieY, -0.16);
  body.add(tie);
  for (const sx of [-1, 1]) {
    const w = add(tie, new THREE.ConeGeometry(0.035, 0.07, 4), accent, V(sx * 0.035, 0, 0), { cast: false });
    w.rotation.z = (sx * Math.PI) / 2;
  }
  add(tie, sphereG(0.018, 8, 6), accent, V(0, 0, 0), { cast: false });

  // ---- head
  const neckY = torsoY + 0.3;
  const head = new THREE.Group();
  head.position.set(0, neckY + 0.22, 0);
  body.add(head);
  const headR = 0.27;
  const skull = add(head, sphereG(headR, 32, 24), sp.face ? furMaterial(sp.face) : fur, V(0, 0, 0));
  skull.scale.set(1.05, 0.95, 0.97);
  // The QA collision audit uses the same ellipsoids as the rendered face.
  const headVolumes = [{ center: skull.position.clone(), radii: skull.scale.clone().multiplyScalar(headR) }];

  // snout / muzzle
  if (sp.snout > 0) {
    const sn = add(head, sphereG(0.11, 20, 14), muzzleMat, V(0, -0.07, -0.21));
    sn.scale.set(1.15, 0.8, 0.7 + sp.snout * 0.9);
    if (sp.pointy) sn.scale.set(0.95, 0.7, 1.5);
    headVolumes.push({ center: sn.position.clone(), radii: sn.scale.clone().multiplyScalar(.11) });
    const nose = add(head, sphereG(sp.bigNose ? 0.05 : 0.028, 12, 8), plainMaterial(sp.nose, { roughness: 0.25 }), V(0, -0.03, -0.23 - sp.snout * 0.11 - (sp.pointy ? 0.06 : 0)), { cast: false });
    nose.scale.set(1.3, sp.bigNose ? 1.4 : 0.9, 1);
    headVolumes.push({ center: nose.position.clone(), radii: nose.scale.clone().multiplyScalar(sp.bigNose ? .05 : .028) });
    // mouth: small smile
    const mouth = add(head, new THREE.TorusGeometry(0.022, 0.005, 6, 12, Math.PI), dark, V(0, -0.1, -0.29 - sp.snout * 0.05), { cast: false });
    mouth.rotation.z = Math.PI;
  }
  // open mouth (singing); scaled by the choir rig, invisible otherwise
  const mouthOpen = new THREE.Mesh(sphereG(0.03, 12, 8), plainMaterial('#5a1d22', { roughness: 0.6 }));
  mouthOpen.position.set(0, -0.1, -0.29 - sp.snout * 0.05);
  mouthOpen.scale.set(1, 0.001, 0.5);
  mouthOpen.visible = false;
  head.add(mouthOpen);
  if (sp.beak) {
    const beak = add(head, new THREE.ConeGeometry(0.04, 0.09, 8), plainMaterial(sp.nose, { roughness: 0.3 }), V(0, -0.06, -0.26), { cast: false });
    beak.rotation.x = -Math.PI / 2 - 0.4;
    const face = add(head, sphereG(0.2, 20, 14), muzzleMat, V(0, -0.01, -0.12));
    face.scale.set(1.15, 0.85, 0.6);
  }

  // patches & masks
  if (sp.patches) {
    for (const sx of [-1, 1]) {
      const p = add(head, sphereG(0.065, 12, 8), plainMaterial(sp.patches), V(sx * 0.1, 0.02, -0.2), { cast: false });
      p.scale.set(1, 1.3, 0.5);
      p.rotation.z = sx * 0.5;
    }
  }
  if (sp.mask) {
    const marking = plainMaterial('#ffffff', { vertexColors: true, roughness: 0.92 });
    for (const side of [-1, 1]) add(head, raccoonPatchGeometry(side, spec.fur, sp.mask), marking, V(), { cast: false });
  }

  // eyes (open) + closed arcs for blinking / blissful moments
  const eyes = { open: new THREE.Group(), closed: new THREE.Group() };
  head.add(eyes.open, eyes.closed);
  eyes.closed.visible = false;
  const eyeR = sp.bigEyes ? 0.055 : 0.036;
  for (const sx of [-1, 1]) {
    const ep = V(sx * (sp.bigEyes ? 0.1 : 0.095), 0.03, -0.235);
    if (sp.bigEyes) add(head, new THREE.CircleGeometry(0.075, 20), plainMaterial('#fff6dc', { roughness: 0.5 }), ep.clone().add(V(0, 0, 0.012)), { cast: false }).rotation.y = Math.PI;
    const eye = add(eyes.open, sphereG(eyeR, 16, 12), plainMaterial('#120c0a', { roughness: 0.15 }), ep, { cast: false });
    eye.scale.set(1, 1.15, 0.6);
    add(eye, sphereG(eyeR * 0.32, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), V(eyeR * 0.3, eyeR * 0.35, -eyeR * 0.7), { cast: false });
    add(eyes.closed, new THREE.TorusGeometry(eyeR * 0.85, 0.008, 6, 12, Math.PI), dark, ep.clone().add(V(0, -0.005, 0)), { cast: false });
  }
  // blush
  for (const sx of [-1, 1]) {
    const b = add(head, new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: '#ff9fae', transparent: true, opacity: 0.45, depthWrite: false }), V(sx * 0.165, -0.06, -0.205), { cast: false });
    b.rotation.y = Math.PI + sx * 0.6;
  }
  if (sp.whiskers) {
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const w = add(head, new THREE.CylinderGeometry(0.0018, 0.0018, 0.14, 3), plainMaterial('#3a3030'), V(sx * 0.14, -0.06 - k * 0.025, -0.24), { cast: false });
        w.rotation.z = Math.PI / 2 + sx * (0.12 - k * 0.2);
        w.rotation.y = sx * 0.35;
      }
    }
  }

  // ears & head features
  const earMat = sp.earColor ? plainMaterial(sp.earColor, { roughness: 0.8 }) : fur;
  const innerMat = sp.earInner ? plainMaterial(sp.earInner, { roughness: 0.8 }) : muzzleMat;
  for (const sx of [-1, 1]) {
    switch (sp.ears) {
      case 'round': {
        const e = add(head, sphereG(0.085, 16, 12), earMat, V(sx * 0.19, 0.19, 0.01));
        e.scale.set(1, 1, 0.5);
        break;
      }
      case 'big': {
        const e = add(head, sphereG(0.12, 16, 12), earMat, V(sx * 0.2, 0.2, 0.03));
        e.scale.set(1, 1, 0.35);
        const i = add(head, sphereG(0.085, 16, 12), innerMat, V(sx * 0.2, 0.2, -0.0), { cast: false });
        i.scale.set(1, 1, 0.2);
        break;
      }
      case 'fluffy': {
        const e = add(head, sphereG(0.11, 16, 12), earMat, V(sx * 0.25, 0.13, 0.02));
        e.scale.set(0.8, 1, 0.55);
        add(head, sphereG(0.07, 12, 10), furMaterial('#f1efea'), V(sx * 0.25, 0.13, -0.03), { cast: false }).scale.set(0.8, 1, 0.4);
        break;
      }
      case 'long': {
        const e = add(head, capsuleG(0.055, 0.28, 6, 12), earMat, V(sx * 0.09, 0.38, 0.02));
        e.rotation.z = -sx * 0.12;
        e.scale.set(1, 1, 0.5);
        const i = add(head, capsuleG(0.034, 0.22, 6, 10), innerMat, V(sx * 0.09, 0.38, -0.01), { cast: false });
        i.rotation.z = -sx * 0.12;
        i.scale.set(1, 1, 0.3);
        break;
      }
      case 'pointed':
      case 'tall':
      case 'tufted': {
        const h = sp.ears === 'tall' ? 0.2 : 0.14;
        // (eight sides, flattened: a soft ear, not a four-sided spike that
        // flashed like metal under the stage lights)
        const e = add(head, new THREE.ConeGeometry(0.075, h, 8), earMat, V(sx * 0.15, 0.24, 0.02));
        e.rotation.z = -sx * 0.32;
        e.rotation.y = Math.PI / 4;
        e.scale.set(1, 1, 0.55);
        const i = add(head, new THREE.ConeGeometry(0.045, h * 0.7, 8), innerMat, V(sx * 0.148, 0.23, -0.012), { cast: false });
        i.rotation.copy(e.rotation);
        i.scale.set(1, 1, 0.3);
        if (sp.earTip) add(head, new THREE.ConeGeometry(0.035, 0.06, 4), plainMaterial(sp.earTip), V(sx * (0.15 + 0.038), 0.24 + h * 0.36, 0.02), { cast: false }).rotation.z = -sx * 0.32;
        if (sp.ears === 'tufted') add(head, new THREE.ConeGeometry(0.02, 0.07, 5), earMat, V(sx * 0.2, 0.34, 0.02), { cast: false }).rotation.z = -sx * 0.4;
        break;
      }
      case 'side': {
        const e = add(head, sphereG(0.08, 14, 10), earMat, V(sx * 0.26, 0.08, 0.02));
        e.scale.set(1.5, 0.55, 0.35);
        e.rotation.z = sx * 0.35;
        break;
      }
      case 'small': {
        add(head, sphereG(0.05, 12, 8), earMat, V(sx * 0.18, 0.17, 0.0)).scale.set(1, 1, 0.5);
        break;
      }
      case 'tufts': {
        const e = add(head, new THREE.ConeGeometry(0.05, 0.13, 5), earMat, V(sx * 0.15, 0.25, 0.0));
        e.rotation.z = -sx * 0.5;
        break;
      }
      default:
    }
  }
  if (sp.wool) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 0.2 + (i % 2) * 0.03;
      add(head, sphereG(0.075, 10, 8), fur, V(Math.cos(a) * r * 0.9, 0.14 + Math.sin(a * 2) * 0.03, Math.sin(a) * r * 0.75 + 0.03));
    }
    add(head, sphereG(0.12, 12, 10), fur, V(0, 0.22, 0.02));
  }
  if (sp.spines) {
    const spineMat = plainMaterial(sp.spines, { roughness: 0.8 });
    for (let i = 0; i < 26; i++) {
      const u = Math.random() * Math.PI * 0.9 + 0.05;
      const v = (Math.random() - 0.5) * Math.PI * 1.3;
      const dir = V(Math.sin(v) * Math.sin(u), Math.cos(u), Math.cos(v) * Math.sin(u) * 0.9 + 0.35).normalize();
      if (dir.z < -0.1) continue;
      const c = add(head, new THREE.ConeGeometry(0.03, 0.14, 5), spineMat, dir.clone().multiplyScalar(headR * 0.95), { cast: false });
      c.quaternion.setFromUnitVectors(UP, dir);
    }
  }
  if (sp.mane) {
    const maneMat = furMaterial(sp.mane);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      add(head, sphereG(0.1, 10, 8), maneMat, V(Math.cos(a) * 0.27, Math.sin(a) * 0.25 - 0.02, 0.06));
    }
  }
  if (sp.spots) {
    for (const [x, y] of [[0.12, 0.17], [-0.15, 0.15], [0.02, 0.22]]) {
      add(head, new THREE.CircleGeometry(0.018, 10), plainMaterial('#f6ead8'), V(x, y, -0.2 + Math.abs(y) * 0.3), { cast: false }).lookAt(V(x * 4, y * 4, -1));
    }
  }
  // tails (behind the chair)
  if (['fox', 'cat', 'squirrel', 'lion', 'raccoon', 'mouse'].includes(spec.species)) {
    const big = spec.species === 'squirrel' || spec.species === 'fox';
    const tail = add(root, capsuleG(big ? 0.1 : 0.04, big ? 0.36 : 0.32, 6, 10), fur, V(0.08, hipY + (big ? 0.25 : 0.05), 0.32));
    tail.rotation.x = big ? -0.35 : 0.9;
    if (spec.species === 'fox') add(tail, sphereG(0.08, 10, 8), furMaterial('#fff6ea'), V(0, big ? 0.26 : 0.2, 0));
    if (spec.species === 'raccoon') {
      for (let k = 0; k < 3; k++) add(tail, new THREE.TorusGeometry(0.042, 0.012, 6, 12), plainMaterial('#3b3634'), V(0, -0.1 + k * 0.1, 0), { cast: false }).rotation.x = Math.PI / 2;
    }
  }

  // ---- arms (IK)
  const sleeve = coat;
  const shoulderY = torsoY + 0.17;
  const arms = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'R' ? 1 : -1;
    const shoulder = V(sx * 0.2, shoulderY, -0.01);
    const upper = add(body, capsuleG(0.055, 0.17, 4, 10), sleeve, V());
    const fore = add(body, capsuleG(0.048, 0.17, 4, 10), sleeve, V());
    const cuff = add(body, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), shirt, V(), { cast: false });
    const paw = add(body, sphereG(0.058, 14, 10), fur, V());
    paw.scale.set(1, 0.85, 1.1);
    arms[side] = { shoulder, upper, fore, cuff, paw, a: ARM_LENGTH, b: ARM_LENGTH, elbow: V(), wrist: V(), target: V() };
  }

  if (isLite()) {
    // phones: no see-through blush; every part takes the shared vertex-coloured
    // material (see merge.js), and the cuff rides on the paw: one mesh per hand
    const blush = [];
    root.traverse((o) => { if (o.isMesh && o.material.transparent) blush.push(o); });
    for (const o of blush) o.parent.remove(o);
    root.traverse((o) => { if (o.isMesh) bakeColor(o); });
    // arms become proxies for the shared instanced arms (no cuffs)
    for (const A of Object.values(arms)) {
      for (const k of ['upper', 'fore', 'paw', 'cuff']) {
        const px = new THREE.Object3D();
        px.scale.copy(A[k].scale);
        body.remove(A[k]);
        if (k !== 'cuff') body.add(px);
        A[k] = px;
      }
      A.fore.scale.set(0.048 / 0.055, 1, 0.048 / 0.055);
      liteArms.push(
        { proxy: A.upper, root, color: sleeve.color, seg: true },
        { proxy: A.fore, root, color: sleeve.color, seg: true },
        { proxy: A.paw, root, color: fur.color, seg: false },
      );
    }
  }
  // bake rigid parts into a few meshes (animated parts stay separate)
  mergeChildren(eyes.open);
  mergeChildren(eyes.closed);
  mergeChildren(head, [eyes.open, eyes.closed, mouthOpen]);
  const armParts = Object.values(arms).flatMap((A) => [A.upper, A.fore, A.cuff, A.paw]);
  mergeChildren(body, [head, torso, ...armParts]);
  mergeChildren(legsSit);
  for (const lp of legPivots) mergeChildren(lp);
  mergeChildren(root, [body, legsSit, legsStand]);

  root.scale.setScalar(scale);
  const char = {
    root, body, head, torso, coatTailGeometry, eyes, arms, scale, spec, mouthOpen, legPivots, headVolumes, seatedLegVolumes,
    mouthPoint: V(0, -0.085, -0.28 - sp.snout * 0.08),
    headBase: head.position.clone(),
    blinkT: Math.random() * 4,
    bliss: 0,
    stand: standing ? 1 : 0,
    // 0 = seated on the chair, 1 = standing; walking swings the legs
    setStanding(t) {
      this.stand = t;
      body.position.y = standLift * t;
      legsStand.visible = t > 0.5 || standing;
      legsSit.visible = !standing && t <= 0.5;
    },
    walk(phase, amp) {
      legPivots[0].rotation.x = Math.sin(phase) * amp;
      legPivots[1].rotation.x = -Math.sin(phase) * amp;
    },
  };
  // default arms resting on the lap
  setArm(char, 'L', V(-0.12, hipY + 0.1, -0.22), V(-0.4, -0.5, 0.3));
  setArm(char, 'R', V(0.12, hipY + 0.1, -0.22), V(0.4, -0.5, 0.3));
  return char;
}

// ----------------------------------------------------------------- IK
const _d = new THREE.Vector3();

function placeLimb(m, from, to) {
  _d.subVectors(to, from);
  const len = _d.length();
  m.position.copy(from).addScaledVector(_d, 0.5);
  if (len > 1e-5) m.quaternion.setFromUnitVectors(UP, _d.multiplyScalar(1 / len));
  // capsule geometry total length = 0.17 + 2*r; stretch to fit
  m.scale.y = len / 0.27;
}

// target & pole in the character's local (unscaled) frame
export function setArm(char, side, target, pole) {
  const A = char.arms[side];
  solveArm(A, target, pole);
  placeLimb(A.upper, A.shoulder, A.elbow);
  placeLimb(A.fore, A.elbow, A.wrist);
  A.cuff.position.copy(A.elbow).lerp(A.wrist, 0.88);
  A.cuff.quaternion.copy(A.fore.quaternion);
  A.paw.position.copy(A.wrist);
  A.paw.quaternion.copy(A.fore.quaternion);
}

// eyes: blink every few seconds; close blissfully on long sweet notes
export function updateFace(char, dt, blissTarget = 0) {
  char.blinkT -= dt;
  char.bliss += (blissTarget - char.bliss) * Math.min(1, dt * 1.5);
  let closed = char.bliss > 0.6;
  if (char.blinkT < 0) {
    closed = true;
    if (char.blinkT < -0.12) char.blinkT = 2.5 + Math.random() * 4;
  }
  char.eyes.open.visible = !closed;
  char.eyes.closed.visible = closed;
}


export { M };
