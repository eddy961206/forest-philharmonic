// Seats the orchestra and animates every musician from the live note state.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SECTIONS, CAST, CONDUCTOR, PODIUM, STAGE_Y } from '../layout.js';
import { buildCharacter, setArm, updateFace, liteArmMeshes, syncLiteArms } from './characters.js';
import * as I from './instruments.js';
import { M, plainMaterial, glowTexture, noteGlyphTexture, isLite } from './materials.js';
import { mergeChildren } from './merge.js';
import { batchCharacterArms } from './arm-batches.js';
import { stageFloorY, PODIUM_H } from './hallplan.js';
import { instrumentToBody } from './playing-motion.js';
import { smooth } from './rig-utils.js';
import { stringRig } from './string-rigs.js';
import { WIND_RIGS } from './wind-rigs.js';
import { KEYBOARD_RIGS } from './keyboard-rigs.js';
import { percussionRig, handPercussionRig } from './percussion-rigs.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const RIG_FOR = { vn1: 'violin', vn2: 'violin', va: 'viola', vc: 'cello', cb: 'bass', fl: 'flute', ob: 'oboe', cl: 'clarinet', bn: 'bassoon', hn: 'horn', tp: 'trumpet', timp: 'timpani', harp: 'harp', piano: 'piano', choir: 'choir', picc: 'piccolo', eh: 'englishHorn', tb: 'trombone', tu: 'tuba', sax: 'saxophone', tamb: 'tambourine', tom: 'tom', sd: 'snare', bd: 'bassDrum', cy: 'cymbals', tri: 'triangle', cel: 'celesta', mallet: 'mallet', bells: 'bells', organ: 'organ' };

const FIXED_RIGS = new Set(['piano', 'harp', 'timpani', 'tambourine', 'tom', 'snare', 'bassDrum', 'cymbals', 'triangle', 'celesta', 'organ', 'mallet', 'bells']);

// The trombone slide sweeps straight ahead; read the score beside that lane.
export function musicStandOffset(rigKind) {
  return {
    x: rigKind === 'trombone' ? -.4 : rigKind === 'cello' || rigKind === 'bass' ? .24 : .1,
    z: -.78 - (rigKind === 'bass' ? .16 : rigKind === 'cello' ? .06 : 0),
  };
}

export function buildOrchestra(scene, { brightFloor = false } = {}) {
  const group = new THREE.Group();
  group.name = 'orchestra';
  scene.add(group);
  const players = [];
  const chairGeos = [];
  const stoolGeos = [];
  const standMetal = [];
  const standPaper = [];
  const obstacles = [];
  const glowMat = (color) => new THREE.MeshBasicMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), color, transparent: true, opacity: 0, depthWrite: false, blending: brightFloor ? THREE.NormalBlending : THREE.AdditiveBlending });


  for (const [sid, sec] of Object.entries(SECTIONS)) {
    sec.chairs.forEach((c, ci) => {
      const spec = { ...CAST[sid][ci] };
      const rigKind = RIG_FOR[sid];
      if (rigKind === 'cello') spec.celloSeat = true;
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
      if (!FIXED_RIGS.has(rigKind) && rigKind !== 'choir') {
        // the stand stands on whatever floor is in front (it may be the step
        // below a riser) and reaches up to the player's eye line
        const { x: lx, z: lz } = musicStandOffset(rigKind);
        const sp = V(lx, 0, lz).applyAxisAngle(V(0, 1, 0), yaw).add(root.position);
        const fy = stageFloorY(sp.x, sp.z);
        const parts = I.standParts(0.86 + (c.y - fy) + (rigKind === 'bass' ? 0.12 : 0));
        const m = new THREE.Matrix4().compose(V(sp.x, fy, sp.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), V(1, 1, 1));
        standMetal.push(parts.metal.applyMatrix4(m));
        standPaper.push(parts.paper.applyMatrix4(m));
        obstacles.push({ x: sp.x, z: sp.z, r: 0.2 });
      }
      // chairs are furniture; the choir's places are just spots on the riser
      if (rigKind !== 'piano' && !sec.standing) obstacles.push({ x: c.x, z: c.z, r: 0.26 });

      // floor glow under the player
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.85 * sc, 32), glowMat(sec.color));
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(c.x, c.y + 0.012, c.z);
      group.add(glow);
      glow.userData.strength = brightFloor ? .7 : .32;
      glow.visible = false;

      const p = { sid, ci, char, rigKind, glow, chair: c, yaw, ready: 0, sway: Math.random() * 10, anchor: new THREE.Vector3(), home: new THREE.Vector3(c.x, c.y, c.z) };
      if (!RIGS[rigKind]) throw new Error(`Missing animation rig for section ${sid}: ${rigKind}`);
      RIGS[rigKind].build(p);
      p.fixedInstrument = !!p.inst && p.inst.group.parent !== char.body;
      players.push(p);
    });
  }

  // conductor
  const cond = buildCharacter({ ...CONDUCTOR, standing: true }, '#fff1c1');
  cond.root.position.set(PODIUM.x, STAGE_Y + PODIUM_H, PODIUM.z + 0.05);
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
  desk.position.set(PODIUM.x, STAGE_Y + PODIUM_H, PODIUM.z - 0.42);
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

  // instruments that live on the stage are obstacles for the walkers
  group.updateMatrixWorld(true);
  for (const p of players) {
    if (FIXED_RIGS.has(p.rigKind) && p.inst.group.parent !== p.char.body) {
      const box = new THREE.Box3().setFromObject(p.inst.group);
      if (p.rigKind === 'piano') {
        // keep the bench side open: the pianist sits down from behind it
        const toBench = V(0, 0, 1).applyQuaternion(p.inst.group.quaternion);
        if (Math.abs(toBench.x) > 0.5) { if (toBench.x > 0) box.max.x -= 0.75; else box.min.x += 0.75; } else if (toBench.z > 0) box.max.z -= 0.75; else box.min.z += 0.75;
      }
      obstacles.push({ box });
    }
  }
  obstacles.push({ x: PODIUM.x, z: PODIUM.z - 0.42, r: 0.25 }); // the conductor's desk

  // phones: everyone's arms in two instanced draws (see characters.js)
  for (const m of liteArmMeshes()) scene.add(m);
  const armBatches = isLite() ? null : batchCharacterArms(scene, players.map(p => p.char).concat(cond));
  const particles = buildNoteParticles(group);
  const byKey = new Map(players.map((p) => [`${p.sid}:${p.ci}`, p]));

  return {
    group, players, conductor, particles, obstacles,
    playerAt: (sid, ci) => byKey.get(`${sid}:${ci}`),
    update(t, dt, perf, opts) { updateAll(players, conductor, particles, t, dt, perf, opts); },
    syncLite() { // after all movement, before either camera renders
      if (armBatches) {
        group.updateWorldMatrix(true, true);
        armBatches.update();
      } else syncLiteArms();
    },
    pickables: players.map((p) => p.char.root).concat([cond.root]),
  };
}

// --------------------------------------------------------------- per frame
function updateAll(players, conductor, particles, t0, dt, perf, opts) {
  particles.setBudget(opts.effectBudget ?? 1);
  const t = t0;
  const piece = perf.piece;
  const chairs = perf.chairs || {};
  const energyAll = { v: 0 };
  for (const p of players) {
    // (someone practising on their own in the interval: their own notes and clock)
    const pr = opts.practice && opts.practice.key === `${p.sid}:${p.ci}` ? opts.practice : null;
    const t = pr ? pr.t : t0;
    const st = pr ? pr.st : chairs[p.sid]?.[p.ci];
    const inPiece = pr ? true : !!(piece && perf.playingSections?.has(p.sid) && st && (perf.piece.tracks.some((tr) => tr.section === p.sid && (!tr.chairs || tr.chairs.includes(p.ci)))));
    const atInstrument = !p.walker || (p.walker.atHome && p.walker.bow < .02 && (p.walker.standingRole || p.walker.sit > .95));
    const running = pr ? true : opts.running && atInstrument;
    const playing = !!st?.playing && running;
    const soon = st ? st.nextOn - t : 99;
    const recent = st ? t - st.lastOn : 99;
    const want = inPiece && running && (playing || (soon < 1.6 && soon > -0.2) || recent < 1.2) ? 1 : 0;
    p.ready = smooth(p.ready, want, want ? 3.2 : 1.1, dt);
    p.energy = st ? st.energy : 0;
    energyAll.v += p.energy;
    const ctx = { t, dt, st, playing, soon, recent, inPiece, running, piece, perf };
    // body sway with the music, breathing
    p.sway += dt * (0.6 + p.energy * 0.9);
    const amp = 0.015 + p.energy * 0.05 * p.ready;
    p.char.body.rotation.z = Math.sin(p.sway) * amp;
    p.char.body.rotation.x = Math.sin(p.sway * 0.7 + 1) * amp * 0.6 - p.ready * 0.04 - (p.walker?.bow || 0) * .55;
    p.char.torso.scale.y = 1 + Math.sin(t * 1.6 + p.sway) * 0.012;
    // Solve fixed-instrument contacts after this frame's sway is known.
    if (p.fixedInstrument && !atInstrument && !pr) {
      // Furniture stays on stage. Musicians carry only their beaters on the way.
      updateTravelArms(p, dt);
      p.rejoining = .4;
      p.inst.setPressed?.(new Set());
    } else {
      const settling = p.rejoining > 0;
      if (settling) { p.lastTravelL ??= V(); p.lastTravelR ??= V(); p.lastTravelL.copy(p.char.arms.L.wrist); p.lastTravelR.copy(p.char.arms.R.wrist); }
      RIGS[p.rigKind].update(p, ctx);
      if (settling) {
        p.rejoining = Math.max(0, p.rejoining - dt);
        for (const [side, previous, sign, k] of [['L', p.lastTravelL, -1, 0], ['R', p.lastTravelR, 1, 1]]) {
          previous.lerp(p.char.arms[side].target, 1 - Math.exp(-14 * dt));
          setArm(p.char, side, previous, V(sign * .7, -.6, .3));
          if (p.mallets?.[k]) p.mallets[k].group.position.copy(p.char.arms[side].wrist);
        }
      }
    }
    // blissful eyes on long, soft notes
    const bliss = playing && st.lastDur > 1.2 && st.lastVel < 85 ? 1 : 0;
    updateFace(p.char, dt, bliss);
    p.effectsActive = !!(inPiece && running && atInstrument && p.char.root.visible);
    const g = opts.glow && p.effectsActive ? p.energy * p.glow.userData.strength * p.ready : 0;
    p.glow.material.opacity = opts.glow && p.effectsActive ? smooth(p.glow.material.opacity, g, 6, dt) : 0;
    p.glow.visible = p.glow.material.opacity > 0.004; // unlit glows cost a draw each
  }
  // note particles
  if (opts.particles && opts.events) {
    for (const e of opts.events) {
      const p = players.find((q) => q.sid === e.section && q.ci === e.chair);
      if (p?.effectsActive && p.ready > .1) particles.spawn(p, e, t);
    }
  }
  if (!opts.particles || !opts.running) particles.clear();
  else particles.update(dt);
  updateConductor(conductor, t, dt, perf, opts, energyAll.v / Math.max(1, players.length));
}

function updateTravelArms(p, dt) {
  p.char.body.position.x = smooth(p.char.body.position.x, 0, 8, dt);
  p.char.body.position.z = smooth(p.char.body.position.z, 0, 8, dt);
  for (const [side, sign, index] of [['L', -1, 0], ['R', 1, 1]]) {
    const arm = p.char.arms[side];
    const swing = p.char.walking ? Math.sin(p.char.walkPhase) * .09 * sign : 0;
    const hand = V(sign * .23, arm.shoulder.y - .36, -.12 + swing);
    hand.lerp(arm.wrist, Math.exp(-14 * dt));
    setArm(p.char, side, hand, V(sign * .6, -.6, .3));
    const beater = p.mallets?.[index];
    if (beater) {
      beater.group.position.copy(arm.wrist);
      beater.group.quaternion.setFromUnitVectors(V(1, 0, 0), V(sign * .1, -.9, -.4).normalize());
    }
  }
}

// ------------------------------------------------------------------- rigs
const RIGS = { violin: stringRig('violin'), viola: stringRig('viola'), cello: stringRig('cello'), bass: stringRig('bass'), ...WIND_RIGS, ...KEYBOARD_RIGS };

RIGS.timpani = percussionRig('timpani');

RIGS.harp = {
  build(p) {
    const inst = I.harp();
    p.inst = inst;
    mergeChildren(inst.group);
    inst.group.scale.setScalar(0.85);
    // the harp stays on stage, between the harpist's knees with the
    // soundboard on the right shoulder: the strings run past the right side
    // of the face and angle away from it
    p.harpLocal = new THREE.Vector3(0.12, 0, -0.04);
    p.harpYaw = -0.25;
    p.harpQ = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), p.harpYaw);
    const local = p.harpLocal.clone().applyAxisAngle(V(0, 1, 0), p.yaw);
    inst.group.position.copy(p.char.root.position).add(local);
    inst.group.rotation.y = p.yaw + p.harpYaw;
    p.char.root.parent.add(inst.group);
    p.lastL = V(-0.02, 0.85, -0.45);
    p.lastR = V(0.16, 1.05, -0.22);
    p.pull = [0, 0];
  },
  update(p, c) {
    const { dt, st } = c;
    const inst = p.inst;
    const matrix = instrumentToBody(p);
    const sToBody = v => v.clone().applyMatrix4(matrix);
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
        return sToBody(s.lo.clone().lerp(s.hi, 0.48));
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
  ch.body.rotation.x = -(cd.walker?.bow || 0) * .55;

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
  cd.handR ??= hand.clone(); cd.handL ??= lh.clone();
  cd.handR.lerp(hand, 1 - Math.exp(-16 * dt));
  cd.handL.lerp(lh, 1 - Math.exp(-16 * dt));
  setArm(ch, 'R', cd.handR, V(0.8, -0.5, 0.3));
  setArm(ch, 'L', cd.handL, V(-0.8, -0.5, 0.3));
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
  // each note is a draw call: phones keep a small pool and spawn half as often
  const lite = isLite();
  const N = lite ? 36 : 220;
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
  let budget = 1, limit = N;
  const lastSpawn = new Map();
  const wp = new THREE.Vector3();
  return {
    get stats() { return { capacity: N, limit, visible: pool.filter(it => it.s.visible).length }; },
    setBudget(value) {
      const wanted = Math.max(.05, Math.min(1, value));
      if (wanted === budget) return;
      budget = wanted;
      limit = budget < 1 ? Math.min(24, Math.max(8, Math.round(N * budget))) : N;
      next %= limit;
      for (let i = limit; i < N; i++) pool[i].s.visible = false;
    },
    clear() { for (const it of pool) it.s.visible = false; lastSpawn.clear(); },
    spawn(p, e, t) {
      const key = `${p.sid}:${p.ci}`;
      const gap = (p.rigKind === 'piano' || p.rigKind === 'harp' ? 0.12 : 0.22) * (lite ? 2 : 1) / Math.sqrt(budget);
      const last = lastSpawn.get(key);
      if (last !== undefined && t >= last && t - last < gap) return;
      if (Math.random() > 0.35 + (e.vel / 127) * 0.5) return;
      lastSpawn.set(key, t);
      const it = pool[next];
      next = (next + 1) % limit;
      it.owner = p;
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
      for (let i = 0; i < limit; i++) {
        const it = pool[i];
        if (!it.s.visible) continue;
        if (!it.owner.effectsActive) { it.s.visible = false; continue; }
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

for (const kind of ['tom', 'snare', 'bassDrum', 'cymbals', 'mallet', 'bells']) RIGS[kind] = percussionRig(kind);
for (const kind of ['tambourine', 'triangle']) RIGS[kind] = handPercussionRig(kind);
