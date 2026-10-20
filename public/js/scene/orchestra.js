// Seats the orchestra and animates every musician from the live note state.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SECTIONS, CAST, CONDUCTOR, PODIUM, STAGE_Y } from '../layout.js';
import { buildCharacter, setArm, updateFace } from './characters.js';
import * as I from './instruments.js';
import { M, plainMaterial, glowTexture, noteGlyphTexture } from './materials.js';
import { mergeChildren } from './merge.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tmpM = new THREE.Matrix4();

function basis(yDir, zHint) {
  const Y = yDir.clone().normalize();
  const Z = zHint.clone().addScaledVector(Y, -zHint.dot(Y)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(tmpM.makeBasis(X, Y, Z));
}

function placeBy(obj, quat, anchorLocal, targetPos) {
  obj.quaternion.copy(quat);
  obj.position.copy(targetPos).sub(anchorLocal.clone().applyQuaternion(quat));
}

const toParent = (obj, v) => v.clone().applyQuaternion(obj.quaternion).add(obj.position);
const smooth = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const easeOut = (x) => 1 - (1 - x) * (1 - x);

// open-string pitch per string family
const OPEN = {
  violin: [55, 62, 69, 76],
  viola: [48, 55, 62, 69],
  cello: [36, 43, 50, 57],
  bass: [28, 33, 38, 43],
};

const RIG_FOR = { vn1: 'violin', vn2: 'violin', va: 'viola', vc: 'cello', cb: 'bass', fl: 'flute', ob: 'oboe', cl: 'clarinet', bn: 'bassoon', hn: 'horn', tp: 'trumpet', timp: 'timpani', harp: 'harp', piano: 'piano', choir: 'choir' };

const MOUTH = V(0, 1.15, -0.27);

export function buildOrchestra(scene) {
  const group = new THREE.Group();
  group.name = 'orchestra';
  scene.add(group);
  const players = [];
  const chairGeos = [];
  const stoolGeos = [];
  const standMetal = [];
  const standPaper = [];
  const standLamp = [];
  const glowMat = (color) => new THREE.MeshBasicMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

  const stand = I.standParts(0.86);

  for (const [sid, sec] of Object.entries(SECTIONS)) {
    sec.chairs.forEach((c, ci) => {
      const spec = { ...CAST[sid][ci] };
      const rigKind = RIG_FOR[sid];
      if (rigKind === 'bass') spec.seatY = 0.68;
      if (rigKind === 'timpani') spec.seatY = 0.62;
      if (sec.standing) spec.standing = true;
      const char = buildCharacter(spec, sec.color);
      const root = char.root;
      root.position.set(c.x, c.y, c.z);
      // face the podium (pianist faces stage-right, along +x)
      let yaw;
      if (sid === 'piano') yaw = -Math.PI / 2;
      else {
        const fx = PODIUM.x - c.x;
        const fz = PODIUM.z + 0.6 - c.z;
        yaw = Math.atan2(-fx, -fz);
      }
      root.rotation.y = yaw;
      group.add(root);

      // furniture in world space (merged later)
      const world = new THREE.Matrix4().compose(root.position, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1));
      const sc = char.scale;
      if (rigKind === 'bass' || rigKind === 'timpani') {
        stoolGeos.push(I.stoolGeometry(spec.seatY * sc).applyMatrix4(world));
      } else if (rigKind !== 'piano' && rigKind !== 'choir') {
        chairGeos.push(I.chairGeometry().applyMatrix4(world));
      }
      if (!['piano', 'harp', 'timpani', 'choir'].includes(rigKind)) {
        const off = new THREE.Matrix4().makeTranslation(rigKind === 'cello' || rigKind === 'bass' ? 0.25 : 0.1, 0, -0.95 - (rigKind === 'bass' ? 0.2 : 0));
        const m = world.clone().multiply(off);
        const flip = new THREE.Matrix4().makeRotationY(0);
        standMetal.push(stand.metal.clone().applyMatrix4(flip).applyMatrix4(m));
        standPaper.push(stand.paper.clone().applyMatrix4(flip).applyMatrix4(m));
        standLamp.push(stand.lamp.clone().applyMatrix4(flip).applyMatrix4(m));
      }

      // floor glow under the player
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.85 * sc, 32), glowMat(sec.color));
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(c.x, c.y + 0.012, c.z);
      group.add(glow);

      const p = { sid, ci, char, rigKind, glow, chair: c, yaw, ready: 0, sway: Math.random() * 10, anchor: new THREE.Vector3(), home: new THREE.Vector3(c.x, c.y, c.z) };
      RIGS[rigKind].build(p);
      players.push(p);
    });
  }

  // conductor
  const cond = buildCharacter({ ...CONDUCTOR, standing: true }, '#fff1c1');
  cond.root.position.set(PODIUM.x, STAGE_Y + 0.22, PODIUM.z + 0.05);
  cond.root.rotation.y = 0;
  group.add(cond.root);
  const baton = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.006, 0.34, 6), M.ivory());
  baton.geometry.translate(0, 0.17, 0);
  cond.body.add(baton);
  const conductor = { char: cond, baton, bow: 0, turn: 0, home: cond.root.position.clone() };
  // conductor's score desk
  const deskGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.018, 0.018, 0.72, 6).translate(0, 0.36, 0),
    new THREE.BoxGeometry(0.46, 0.3, 0.02).rotateX(-1.05).translate(0, 0.76, 0),
  ]);
  const desk = new THREE.Mesh(deskGeo, M.darkWood());
  desk.position.set(PODIUM.x, STAGE_Y + 0.22, PODIUM.z - 0.42);
  desk.castShadow = true;
  group.add(desk);

  // merged furniture
  const add = (geos, mat, cast = true) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
  };
  add(chairGeos, plainMaterial('#1a1716', { roughness: 0.55 }));
  add(stoolGeos, plainMaterial('#1a1716', { roughness: 0.55 }));
  add(standMetal, plainMaterial('#121214', { roughness: 0.35, metalness: 0.6 }));
  add(standPaper, M.paper(), false);
  add(standLamp, new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffc982', emissiveIntensity: 0.3 }), false);

  const particles = buildNoteParticles(group);
  const byKey = new Map(players.map((p) => [`${p.sid}:${p.ci}`, p]));

  return {
    group, players, conductor, particles,
    playerAt: (sid, ci) => byKey.get(`${sid}:${ci}`),
    update(t, dt, perf, opts) { updateAll(players, conductor, particles, t, dt, perf, opts); },
    pickables: players.map((p) => p.char.root).concat([cond.root]),
  };
}

// --------------------------------------------------------------- per frame
function updateAll(players, conductor, particles, t, dt, perf, opts) {
  const piece = perf.piece;
  const chairs = perf.chairs || {};
  const energyAll = { v: 0 };
  for (const p of players) {
    const st = chairs[p.sid]?.[p.ci];
    const inPiece = !!(piece && perf.playingSections?.has(p.sid) && st && (perf.piece.tracks.some((tr) => tr.section === p.sid && (!tr.chairs || tr.chairs.includes(p.ci)))));
    const playing = !!st?.playing && opts.running;
    const soon = st ? st.nextOn - t : 99;
    const recent = st ? t - st.lastOn : 99;
    const want = inPiece && opts.running && (playing || (soon < 1.6 && soon > -0.2) || recent < 1.2) ? 1 : 0;
    p.ready = smooth(p.ready, want, want ? 3.2 : 1.1, dt);
    p.energy = st ? st.energy : 0;
    energyAll.v += p.energy;
    const ctx = { t, dt, st, playing, soon, recent, inPiece, running: opts.running, piece, perf };
    RIGS[p.rigKind].update(p, ctx);
    // body sway with the music, breathing
    p.sway += dt * (0.6 + p.energy * 0.9);
    const amp = 0.015 + p.energy * 0.05 * p.ready;
    p.char.body.rotation.z = Math.sin(p.sway) * amp;
    p.char.body.rotation.x = Math.sin(p.sway * 0.7 + 1) * amp * 0.6 - p.ready * 0.04;
    p.char.torso.scale.y = 1 + Math.sin(t * 1.6 + p.sway) * 0.012;
    // blissful eyes on long, soft notes
    const bliss = playing && st.lastDur > 1.2 && st.lastVel < 85 ? 1 : 0;
    updateFace(p.char, dt, bliss);
    const g = opts.glow ? p.energy * 0.32 * p.ready : 0;
    p.glow.material.opacity = smooth(p.glow.material.opacity, g, 6, dt);
  }
  // note particles
  if (opts.particles && opts.events) {
    for (const e of opts.events) {
      const p = players.find((q) => q.sid === e.section && q.ci === e.chair);
      if (p) particles.spawn(p, e, t);
    }
  }
  particles.update(dt);
  updateConductor(conductor, t, dt, perf, opts, energyAll.v / Math.max(1, players.length));
}

// ------------------------------------------------------------------- rigs
const RIGS = {};

function stringRig(kind) {
  return {
    build(p) {
      const inst = I.violinFamily(kind);
      const bowObj = I.bow(kind === 'violin' ? 0.5 : kind === 'viola' ? 0.53 : kind === 'cello' ? 0.58 : 0.6);
      p.inst = inst;
      p.bow = bowObj;
      mergeChildren(inst.group);
      mergeChildren(bowObj.group);
      p.char.body.add(inst.group, bowObj.group);
      p.u = 0.5; p.u0 = 0.5; p.u1 = 0.5; p.stroke = 0; p.strokeOn = -1; p.tilt = 0; p.shift = 0.2;
      const chinOrPin = kind === 'violin' || kind === 'viola';
      if (chinOrPin) {
        const s = kind === 'viola' ? 1.06 : 1;
        p.playQ = basis(V(-0.6, 0.24, -0.76), V(0.5, 0.86, 0.05));
        p.playAnchor = inst.chin;
        p.playPos = V(-0.17 * s, 1.03, -0.05 * s);
        p.restQ = basis(V(-0.15, 0.25, -0.95), V(0.05, 0.97, 0.2));
        p.restAnchor = inst.chin;
        p.restPos = V(0.02, 0.6, -0.12);
      } else {
        const big = kind === 'bass';
        p.playQ = basis(V(big ? -0.24 : -0.3, 1, big ? 0.22 : 0.16), V(0.22, 0, -1));
        p.playAnchor = inst.endpin;
        p.playPos = big ? V(-0.02, 0.0, -0.46) : V(0.05, 0.0, -0.38);
        p.restQ = p.playQ;
        p.restAnchor = inst.endpin;
        p.restPos = p.playPos;
      }
      p.bowDirSign = 1;
    },
    update(p, c) {
      const { t, dt, st } = c;
      const inst = p.inst;
      const g = inst.group;
      const r = p.ready;
      // instrument pose
      const q = p.restQ.clone().slerp(p.playQ, easeOut(r));
      const pos = p.restPos.clone().lerp(p.playPos, easeOut(r));
      placeBy(g, q, r > 0.5 ? p.playAnchor : p.restAnchor, pos);

      // bow stroke logic
      if (st && c.playing && st.strokes !== p.stroke) {
        p.stroke = st.strokes;
        const dur = Math.max(0.12, st.lastDur);
        let dir = p.stroke % 2 === 0 ? 1 : -1;
        const amount = Math.min(0.75, 0.12 + dur * 0.22 + (st.lastVel / 127) * 0.18);
        if (p.u + dir * amount > 0.92 || p.u + dir * amount < 0.08) dir = -dir;
        p.u0 = p.u;
        p.u1 = Math.min(0.92, Math.max(0.08, p.u + dir * amount));
        p.strokeOn = st.lastOn;
        p.strokeDur = dur;
        // which string? -> bow tilt; where on it -> left hand shift
        const open = OPEN[kind];
        let si = 0;
        for (let k = open.length - 1; k >= 0; k--) if (st.lastMidi >= open[k]) { si = k; break; }
        p.tiltTarget = (si - 1.5) * (kind === 'violin' || kind === 'viola' ? 0.17 : 0.13);
        p.shiftTarget = Math.min(0.85, Math.max(0.04, (st.lastMidi - open[si]) / 14));
      }
      if (c.playing && p.strokeOn >= 0) {
        const x = Math.min(1, Math.max(0, (t - p.strokeOn) / p.strokeDur));
        p.u = p.u0 + (p.u1 - p.u0) * easeOut(x);
      } else {
        p.u = smooth(p.u, 0.45, 0.8, dt);
      }
      p.tilt = smooth(p.tilt, p.tiltTarget ?? 0, 10, dt);
      p.shift = smooth(p.shift, p.shiftTarget ?? 0.2, 7, dt);

      // world-in-body frame vectors of the instrument
      const vY = V(0, 1, 0).applyQuaternion(g.quaternion);
      const vZ = V(0, 0, 1).applyQuaternion(g.quaternion);
      let bowDir = new THREE.Vector3().crossVectors(vZ, vY).normalize();
      if (bowDir.x > 0) bowDir.negate(); // down-bow pulls the frog to the player's right
      const tiltQ = new THREE.Quaternion().setFromAxisAngle(vY, p.tilt);
      bowDir.applyQuaternion(tiltQ);
      const bowUp = vZ.clone().applyQuaternion(tiltQ);
      const contact = toParent(g, inst.contact);
      const L = p.bow.length;
      const lift = (1 - r) * 0.12 + (c.playing ? 0 : 0.02);
      const frog = contact.clone().addScaledVector(bowDir, -p.u * L).addScaledVector(bowUp, 0.006 + lift);
      const bq = new THREE.Quaternion().setFromRotationMatrix(tmpM.makeBasis(bowDir, bowUp, new THREE.Vector3().crossVectors(bowDir, bowUp)));
      // resting bow lies across the lap
      if (r < 0.999) {
        const restFrog = V(0.22, 0.62, -0.2);
        const restQ = basis(V(0, 0, -1), V(0, 1, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2));
        frog.lerp(restFrog, 1 - easeOut(r));
        bq.slerp(restQ, 1 - easeOut(r));
      }
      p.bow.group.position.copy(frog);
      p.bow.group.quaternion.copy(bq);

      // right hand on the frog, left hand on the neck with vibrato
      const rh = frog.clone().addScaledVector(bowUp, 0.035);
      setArm(p.char, 'R', rh, V(0.7, -0.6, 0.3));
      const vib = c.playing && st.lastDur > 0.4 ? Math.sin(t * 34) * 0.004 : 0;
      const neck = toParent(g, inst.neckAt(Math.min(1, p.shift + vib * 6)));
      const lh = neck.addScaledVector(vZ, -0.025).addScaledVector(bowDir, 0.02);
      if (r < 0.5 && (kind === 'violin' || kind === 'viola')) {
        setArm(p.char, 'L', toParent(g, inst.neckAt(0.6)).addScaledVector(vZ, -0.02), V(-0.5, -0.8, 0.2));
      } else {
        setArm(p.char, 'L', lh, V(-0.6, -0.7, 0.2));
      }
      // head tilts onto the chinrest
      const h = p.char.head;
      if (kind === 'violin' || kind === 'viola') {
        h.rotation.z = smooth(h.rotation.z, 0.3 * r, 4, dt);
        h.rotation.y = smooth(h.rotation.y, 0.32 * r, 4, dt);
        h.rotation.x = smooth(h.rotation.x, 0.12 * r, 4, dt);
      } else {
        h.rotation.z = smooth(h.rotation.z, 0.1 * r + Math.sin(t * 0.8 + p.sway) * 0.04 * r, 3, dt);
        h.rotation.x = smooth(h.rotation.x, 0.12 * r, 3, dt);
      }
      p.anchor.copy(contact);
    },
  };
}

RIGS.violin = stringRig('violin');
RIGS.viola = stringRig('viola');
RIGS.cello = stringRig('cello');
RIGS.bass = stringRig('bass');

function windRig(make, cfg) {
  return {
    build(p) {
      const inst = make();
      p.inst = inst;
      mergeChildren(inst.group);
      p.char.body.add(inst.group);
      p.cfg = cfg;
      p.fing = 0;
    },
    update(p, c) {
      const { t, dt, st } = c;
      const r = easeOut(p.ready);
      const g = p.inst.group;
      const bob = c.playing ? Math.sin(t * 2 + p.sway) * 0.012 * p.energy : 0;
      const playPos = MOUTH.clone().add(V(0, bob, 0));
      const q = cfg.restQ.clone().slerp(cfg.playQ, r);
      const anchor = p.inst.mouth;
      const pos = cfg.restPos.clone().lerp(playPos, r);
      placeBy(g, q, anchor, pos);
      // fingers: small hand motion on each new pitch
      if (st && st.lastMidi !== p.lastMidi) {
        p.lastMidi = st.lastMidi;
        p.fing = 1;
      }
      p.fing = smooth(p.fing, 0, 14, c.dt);
      const wig = p.fing * 0.012;
      const lh = toParent(g, p.inst.lh).add(V(0, wig, 0));
      const rh = toParent(g, p.inst.rh).add(V(0, -wig, 0));
      setArm(p.char, 'L', lh, cfg.poleL);
      setArm(p.char, 'R', rh, cfg.poleR);
      const h = p.char.head;
      h.rotation.x = smooth(h.rotation.x, (cfg.headX || 0.08) * r, 4, dt);
      h.rotation.z = smooth(h.rotation.z, (cfg.headZ || 0) * r, 4, dt);
      p.anchor.copy(toParent(g, cfg.tip || V(0, -0.4, 0)));
    },
  };
}

RIGS.flute = windRig(I.flute, {
  playQ: basis(V(0.12, 0.99, 0.0), V(0.0, 0.25, 0.97)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -Math.PI / 2 + 0.12)),
  restQ: basis(V(0, 1, 0), V(0, 0, 1)).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -Math.PI / 2)),
  restPos: V(-0.14, 0.64, -0.24),
  poleL: V(-0.3, -0.7, 0.4), poleR: V(0.6, -0.7, 0.2), headZ: -0.12, tip: V(0.4, 0, 0),
});
RIGS.oboe = windRig(() => I.reed('oboe'), {
  playQ: basis(V(0, 0.72, 0.69), V(0, 0.69, -0.72)),
  restQ: basis(V(0, 1, 0.15), V(0, -0.15, -1)),
  restPos: V(0.1, 1.0, -0.28),
  poleL: V(-0.7, -0.6, 0.2), poleR: V(0.7, -0.6, 0.2), headX: 0.12, tip: V(0, -0.5, 0),
});
RIGS.clarinet = windRig(() => I.reed('clarinet'), {
  playQ: basis(V(0, 0.7, 0.71), V(0, 0.71, -0.7)),
  restQ: basis(V(0, 1, 0.15), V(0, -0.15, -1)),
  restPos: V(0.1, 1.0, -0.28),
  poleL: V(-0.7, -0.6, 0.2), poleR: V(0.7, -0.6, 0.2), headX: 0.12, tip: V(0, -0.55, 0),
});
RIGS.bassoon = windRig(I.bassoon, {
  playQ: basis(V(-0.4, 1, 0.08), V(0, 0, -1)),
  restQ: basis(V(-0.2, 1, 0.1), V(0, 0, -1)),
  restPos: V(0.05, 0.95, -0.3),
  poleL: V(-0.7, -0.5, 0.2), poleR: V(0.8, -0.5, 0.2), headX: 0.05, tip: V(0.1, 0.25, 0),
});
RIGS.horn = windRig(I.horn, {
  playQ: basis(V(0.05, 1, 0.1), V(0.35, 0, -0.94)),
  restQ: basis(V(0, 1, 0), V(0.3, -0.4, -0.85)),
  restPos: V(0.0, 0.9, -0.25),
  poleL: V(-0.7, -0.6, 0.1), poleR: V(0.8, -0.4, 0.3), headX: 0.05, tip: V(0.2, -0.1, 0),
});
RIGS.trumpet = windRig(I.trumpet, {
  playQ: basis(V(0, 0.97, -0.24), V(0, 0.24, 0.97)),
  restQ: basis(V(0, 0.4, -0.9), V(0, 0.9, 0.4)),
  restPos: V(0.0, 0.66, -0.12),
  poleL: V(-0.7, -0.6, 0.2), poleR: V(0.7, -0.6, 0.2), headX: 0.0, tip: V(0, 0, -0.42),
});

RIGS.timpani = {
  build(p) {
    const inst = I.timpani();
    p.inst = inst;
    mergeChildren(inst.group);
    // the drums stay on stage while the player comes and goes
    inst.group.position.copy(p.char.root.position);
    inst.group.rotation.y = p.yaw;
    p.char.root.parent.add(inst.group);
    p.mallets = [I.mallet(), I.mallet()];
    p.mallets.forEach((m) => mergeChildren(m.group));
    p.char.body.add(p.mallets[0].group, p.mallets[1].group);
    p.hand = 0;
    p.hit = [0, 0];
    p.drum = [0, 2];
  },
  update(p, c) {
    const { t, dt, st } = c;
    const drums = p.inst.drums;
    const pickDrum = (m) => (m < 46 ? 0 : m < 50 ? 1 : 2);
    if (st && st.strokes !== p.stroke) {
      p.stroke = st.strokes;
      if (c.playing || c.recent < 0.2) {
        p.hand = 1 - p.hand;
        p.drum[p.hand] = pickDrum(st.lastMidi);
        p.hit[p.hand] = 1;
        p.ring = 1;
      }
    }
    for (let k = 0; k < 2; k++) {
      p.hit[k] = smooth(p.hit[k], 0, 9, dt);
      const d = drums[p.drum[k]];
      const side = k === 0 ? -1 : 1;
      // anticipation: lift as the next note approaches
      let lift = 0.16;
      if (c.soon < 0.35 && c.soon > 0 && ((p.hand === 0 ? 1 : 0) === k)) lift = 0.03 + (c.soon / 0.35) * 0.14;
      if (p.hit[k] > 0.6) lift = 0.01 + (1 - p.hit[k]) * 0.3;
      if (!c.inPiece) lift = 0.22;
      const tip = d.center.clone().add(V(side * 0.06, 0.02 + lift * p.ready + (1 - p.ready) * 0.25, d.r * 0.35));
      const dir = V(-side * 0.3, -0.35, -0.88).normalize();
      const hand = tip.clone().addScaledVector(dir, -0.32);
      const mg = p.mallets[k].group;
      mg.position.copy(hand);
      mg.quaternion.setFromUnitVectors(V(1, 0, 0), dir);
      setArm(p.char, k === 0 ? 'L' : 'R', hand, V(side * 0.8, -0.5, 0.3));
    }
    p.char.head.rotation.x = smooth(p.char.head.rotation.x, 0.22 * p.ready, 3, dt);
    p.anchor.copy(drums[1].center);
  },
};

RIGS.harp = {
  build(p) {
    const inst = I.harp();
    p.inst = inst;
    mergeChildren(inst.group);
    inst.group.scale.setScalar(0.85);
    // the harp stays on stage; place it in world space where the seated harpist expects it
    const local = new THREE.Vector3(0.08, 0, -0.14).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
    inst.group.position.copy(p.char.root.position).add(local);
    inst.group.rotation.y = p.yaw;
    p.char.root.parent.add(inst.group);
    p.harpLocal = new THREE.Vector3(0.08, 0, -0.14);
    p.lastL = V(-0.02, 0.85, -0.45);
    p.lastR = V(0.16, 1.05, -0.22);
    p.pull = [0, 0];
  },
  update(p, c) {
    const { dt, st } = c;
    const inst = p.inst;
    const sToBody = (v) => v.clone().multiplyScalar(0.85).add(p.harpLocal);
    if (st) {
      const act = st.active || [];
      if (st.strokes !== p.stroke) {
        p.stroke = st.strokes;
        for (const a of act) {
          if (a.on > c.t - 0.06) inst.pluck(inst.stringFor(a.midi), 0.9 * (a.vel / 127) + 0.2);
        }
      }
      const low = act.filter((a) => a.midi < 60);
      const high = act.filter((a) => a.midi >= 60);
      const target = (list, fallback) => {
        if (!list.length) return fallback;
        const newest = list.reduce((x, y) => (y.on > x.on ? y : x));
        const s = inst.anchors[inst.stringFor(newest.midi)];
        return sToBody(s.lo.clone().lerp(s.hi, 0.36));
      };
      const L = target(low, p.lastL);
      const R = target(high, p.lastR);
      p.lastL.lerp(L, 1 - Math.exp(-dt * 14));
      p.lastR.lerp(R, 1 - Math.exp(-dt * 14));
    }
    inst.update(dt);
    const r = p.ready;
    const lh = p.lastL.clone().add(V(-0.05, 0, 0.02)).lerp(V(-0.12, 0.62, -0.22), 1 - r);
    const rh = p.lastR.clone().add(V(0.05, 0, 0.02)).lerp(V(0.12, 0.62, -0.22), 1 - r);
    setArm(p.char, 'L', lh, V(-0.8, -0.4, 0.3));
    setArm(p.char, 'R', rh, V(0.8, -0.4, 0.3));
    p.char.head.rotation.y = smooth(p.char.head.rotation.y, -0.25 * r, 3, dt);
    p.char.head.rotation.x = smooth(p.char.head.rotation.x, 0.1 * r, 3, dt);
    p.anchor.copy(sToBody(V(0, 1.2, -0.3)));
  },
};

RIGS.piano = {
  build(p) {
    const inst = I.grandPiano();
    p.inst = inst;
    mergeChildren(inst.group);
    // the piano lives in world space; the pianist sits on its bench
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), p.yaw);
    const benchOffset = inst.benchSeat.clone().setY(0).applyQuaternion(q);
    inst.group.position.copy(p.char.root.position).sub(benchOffset).add(V(0, 0, 0));
    inst.group.quaternion.copy(q);
    p.char.root.parent?.add(inst.group);
    p.pending = inst.group;
    p.handL = null;
    p.handR = null;
    p.liftL = 0;
    p.liftR = 0;
  },
  update(p, c) {
    const { dt, st } = c;
    if (p.pending && p.char.root.parent && !p.pending.parent) p.char.root.parent.add(p.pending);
    const inst = p.inst;
    const toBody = (v) => p.char.body.worldToLocal(inst.group.localToWorld(v.clone()));
    p.char.root.updateMatrixWorld(true);
    inst.group.updateMatrixWorld(true);
    const act = st ? st.active : [];
    const piece = c.piece;
    // right hand = first piano track, left hand = second
    let rhTrack = -1;
    let lhTrack = -1;
    if (piece) {
      const pts = piece.tracks.map((tr, i) => (tr.inst === 'piano' ? i : -1)).filter((i) => i >= 0);
      rhTrack = pts[0] ?? -1;
      lhTrack = pts[1] ?? -1;
    }
    const isR = (a) => (lhTrack < 0 ? a.midi >= 60 : a.ti === rhTrack);
    const pressed = new Set();
    const rMid = [];
    const lMid = [];
    for (const a of act) {
      if (c.t - a.on < Math.max(0.25, Math.min(1.2, (a.off - a.on) * 0.5)) || a.off - c.t > 0) {
        // keys stay down only while the finger holds; pedal sustain is audio-only
        if (c.t - a.on < 0.6) pressed.add(Math.round(a.midi));
      }
      if (c.t - a.on < 0.5) (isR(a) ? rMid : lMid).push(a.midi);
    }
    inst.setPressed(c.running ? pressed : new Set());
    const avg = (arr, fb) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : fb);
    p.mR = smooth(p.mR ?? 72, avg(rMid, p.mR ?? 72), 10, dt);
    p.mL = smooth(p.mL ?? 48, avg(lMid, p.mL ?? 48), 10, dt);
    p.liftR = smooth(p.liftR, rMid.length ? 0 : 0.04, 12, dt);
    p.liftL = smooth(p.liftL, lMid.length ? 0 : 0.04, 12, dt);
    const r = p.ready;
    const kr = toBody(inst.keyPos(Math.max(p.mR, p.mL + 5)));
    const kl = toBody(inst.keyPos(Math.min(p.mL, p.mR - 5)));
    kr.y += p.liftR + (1 - r) * 0.08;
    kl.y += p.liftL + (1 - r) * 0.08;
    setArm(p.char, 'R', kr, V(0.7, -0.6, 0.4));
    setArm(p.char, 'L', kl, V(-0.7, -0.6, 0.4));
    const h = p.char.head;
    h.rotation.x = smooth(h.rotation.x, 0.22 * r, 3, dt);
    h.rotation.y = smooth(h.rotation.y, ((p.mR + p.mL) / 2 - 60) / -120, 2, dt);
    p.char.body.rotation.y = smooth(p.char.body.rotation.y, ((p.mR + p.mL) / 2 - 60) / -200, 2, dt);
    p.anchor.copy(toBody(inst.keyPos(64)));
  },
};

RIGS.choir = {
  build(p) {
    // a music folder held at chest height
    const folder = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.015), plainMaterial('#1d1a2a', { roughness: 0.7 }));
    folder.castShadow = true;
    p.folder = folder;
    p.char.body.add(folder);
    p.char.mouthOpen.visible = true;
    p.sing = 0;
    p.breath = Math.random() * 6;
  },
  update(p, c) {
    const { dt, st } = c;
    const r = p.ready;
    // folder rises from the hip to the chest as the choir gets ready
    const fy = 0.78 + 0.22 * r;
    const fz = -0.22 - 0.04 * r;
    p.folder.position.set(0, fy, fz);
    p.folder.rotation.x = -0.55 * r;
    setArm(p.char, 'L', V(-0.11, fy - 0.07, fz + 0.02), V(-0.7, -0.6, 0.2));
    setArm(p.char, 'R', V(0.11, fy - 0.07, fz + 0.02), V(0.7, -0.6, 0.2));
    // mouth opens with the sung note; sopranos open a little wider
    const target = c.playing && st ? 0.35 + 0.65 * (st.lastVel / 127) : 0;
    p.sing = smooth(p.sing, target, 12, dt);
    const vowel = c.playing && st ? 0.6 + 0.4 * Math.sin(c.t * 6 + p.breath) * 0.3 : 0;
    p.char.mouthOpen.scale.set(0.9 + p.sing * 0.3, 0.05 + p.sing * (0.9 + vowel * 0.3), 0.5);
    // head lifts to the conductor, chest expands on long notes
    const h = p.char.head;
    h.rotation.x = smooth(h.rotation.x, -0.12 * r, 3, dt);
    p.char.torso.scale.y = 1 + p.sing * 0.03;
    p.anchor.set(0, 1.25, -0.3);
  },
};

// ------------------------------------------------------------- conductor
const PATTERNS = {
  1: [[0, -0.2]],
  2: [[0, -0.22], [0.08, 0.06]],
  3: [[0, -0.22], [0.26, -0.06], [0.06, 0.14]],
  4: [[0, -0.22], [-0.24, -0.08], [0.28, -0.08], [0.06, 0.14]],
};

function updateConductor(cd, t, dt, perf, opts, energy) {
  const ch = cd.char;
  const piece = perf.piece;
  const atPodium = !cd.walker || cd.walker.state === 'standing' || cd.walker.state === 'arrived';
  const conducting = !!(piece && piece.conducted && opts.running && atPodium);
  cd.active = smooth(cd.active ?? 0, conducting ? 1 : 0, 2, dt);
  const walking = cd.walker && cd.walker.state === 'walking';
  ch.body.rotation.x = 0;

  let tip = V(0.12, 1.0, -0.22);
  if (piece && piece.beats && piece.beats.length) {
    const beats = piece.beats;
    // find current beat
    let lo = 0;
    let hi = beats.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (beats[m][0] <= t) lo = m; else hi = m - 1;
    }
    const b = beats[lo];
    const nb = beats[Math.min(beats.length - 1, lo + 1)];
    const span = Math.max(0.2, nb[0] - b[0]);
    const x = t < beats[0][0] ? 0 : Math.min(1, (t - b[0]) / span);
    const pat = PATTERNS[Math.min(4, b[2])] || PATTERNS[4];
    const pA = pat[b[1] % pat.length];
    const pB = pat[nb[1] % pat.length];
    const size = 0.75 + energy * 1.4;
    // ictus then rebound: ease along the chord between beat points with a lift
    const e = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    const bx = pA[0] + (pB[0] - pA[0]) * e;
    const by = pA[1] + (pB[1] - pA[1]) * e + Math.sin(x * Math.PI) * 0.12;
    tip = V(0.06 + bx * size, 1.18 + by * size, -0.36);
  }
  const rest = V(0.16, 0.66, -0.12);
  let hand = rest.clone().lerp(tip, cd.active);
  let lh = V(-0.2, 0.66, -0.12).lerp(V(-0.24, 1.0 + energy * 0.5, -0.32), cd.active * Math.min(1, 0.3 + energy * 2));
  if (walking) {
    // arms swing while walking, baton down at the side
    const ph = cd.walker.phase;
    hand = V(0.22, 0.62 + Math.sin(ph) * 0.06, -0.05 - Math.sin(ph) * 0.14);
    lh = V(-0.22, 0.62 - Math.sin(ph) * 0.06, -0.05 + Math.sin(ph) * 0.14);
  } else if (cd.walker && cd.walker.bow > 0.05) {
    // hands together in front for the bow
    const b = cd.walker.bow;
    hand = hand.lerp(V(0.08, 0.72, -0.26), b);
    lh = lh.lerp(V(-0.08, 0.72, -0.26), b);
  }
  setArm(ch, 'R', hand, V(0.8, -0.5, 0.3));
  setArm(ch, 'L', lh, V(-0.8, -0.5, 0.3));
  // baton in the right paw, pointing forward and up
  const A = ch.arms.R;
  cd.baton.position.copy(A.wrist);
  const dir = new THREE.Vector3().subVectors(A.wrist, A.elbow).normalize().add(V(0, 0.3, -0.5)).normalize();
  cd.baton.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
  ch.head.rotation.x = smooth(ch.head.rotation.x, 0.08 * cd.active + Math.sin(t * 2.2) * 0.02 * cd.active, 3, dt);
  ch.body.rotation.z = Math.sin(t * 0.9) * 0.03 * cd.active;
  updateFace(ch, dt, !conducting && piece && opts.running && atPodium ? 1 : 0);
}

// --------------------------------------------------------- note particles
function buildNoteParticles(parent) {
  const glyphs = ['♪', '♫', '♩', '♬'].map(noteGlyphTexture);
  const N = 220;
  const pool = [];
  for (let i = 0; i < N; i++) {
    const mat = new THREE.SpriteMaterial({ map: glyphs[i % 4], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    s.scale.setScalar(0.16);
    parent.add(s);
    pool.push({ s, life: 0, max: 1, v: new THREE.Vector3(), phase: 0 });
  }
  let next = 0;
  const lastSpawn = new Map();
  const wp = new THREE.Vector3();
  return {
    spawn(p, e, t) {
      const key = `${p.sid}:${p.ci}`;
      const gap = p.rigKind === 'piano' || p.rigKind === 'harp' ? 0.12 : 0.22;
      const last = lastSpawn.get(key);
      if (last !== undefined && t >= last && t - last < gap) return;
      if (Math.random() > 0.35 + (e.vel / 127) * 0.5) return;
      lastSpawn.set(key, t);
      const it = pool[next];
      next = (next + 1) % N;
      wp.copy(p.anchor);
      p.char.body.localToWorld(wp);
      if (p.rigKind === 'piano' || p.rigKind === 'harp' || p.rigKind === 'timpani') {
        wp.copy(p.anchor);
        if (p.rigKind === 'piano') p.char.body.localToWorld(wp);
        else p.char.body.localToWorld(wp);
      }
      it.s.position.copy(wp).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3));
      it.s.material.color.set(SECTIONS[p.sid].color);
      it.v.set((Math.random() - 0.5) * 0.12, 0.38 + Math.random() * 0.25, (Math.random() - 0.5) * 0.12);
      it.life = 0;
      it.max = 2.2 + Math.random() * 1.4;
      it.phase = Math.random() * 6;
      it.size = 0.1 + (e.vel / 127) * 0.1;
      it.s.visible = true;
    },
    update(dt) {
      for (const it of pool) {
        if (!it.s.visible) continue;
        it.life += dt;
        const x = it.life / it.max;
        if (x >= 1) { it.s.visible = false; continue; }
        it.s.position.addScaledVector(it.v, dt);
        it.s.position.x += Math.sin(it.life * 2.4 + it.phase) * dt * 0.08;
        it.s.material.opacity = Math.min(1, x * 6) * (1 - x) * 0.9;
        it.s.scale.setScalar(it.size * (0.7 + x * 0.6));
        it.s.material.rotation = Math.sin(it.life * 1.7 + it.phase) * 0.3;
      }
    },
  };
}
