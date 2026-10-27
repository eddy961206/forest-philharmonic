import * as THREE from 'three';
import * as I from './instruments.js';
import { setArm } from './characters.js';
import { mergeChildren } from './merge.js';
import { instrumentToBody, strikeLift } from './playing-motion.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);
const poles = [V(-0.7, -0.6, 0.2), V(0.7, -0.6, 0.2)];
const rest = [V(-0.17, 0.67, -0.16), V(0.17, 0.67, -0.16)];
const smooth = (a, b, dt) => a + (b - a) * (1 - Math.exp(-18 * dt));
const travel = (a, b, dt) => a + Math.max(-2.5 * dt, Math.min(2.5 * dt, smooth(a, b, dt) - a));

function placeBeater(p, side, tip, direction) {
  const mallet = p.mallets[side], hand = tip.clone().addScaledVector(direction, -mallet.tip.x);
  hand.lerp(rest[side], 1 - p.ready);
  setArm(p.char, side ? 'R' : 'L', hand, poles[side]);
  mallet.group.position.copy(p.char.arms[side ? 'R' : 'L'].wrist);
  mallet.group.quaternion.setFromUnitVectors(X, direction);
}

export function percussionRig(kind) {
  const pitched = kind === 'mallet' || kind === 'bells';
  return {
    build(p) {
      p.inst = kind === 'timpani' ? I.timpani() : I.percussion(kind);
      mergeChildren(p.inst.group);
      p.inst.group.position.copy(p.char.root.position); p.inst.group.rotation.y = p.yaw;
      p.char.root.parent.add(p.inst.group);
      p.mallets = [I.mallet(kind === 'snare' || kind === 'tom' ? 'stick' : 'felt'), I.mallet(kind === 'snare' || kind === 'tom' ? 'stick' : 'felt')];
      for (const m of p.mallets) { mergeChildren(m.group); p.char.body.add(m.group); }
      p.strikes = [{ on: -Infinity, pitch: 55 }, { on: -Infinity, pitch: 74 }];
      p.hand = 0;
      p.hitTargets = [V(), V()];
    },
    update(p, c) {
      const st = c.st;
      if (p.motionPiece !== c.piece || c.t < (p.motionTime ?? -Infinity) - 0.1 || c.t - (p.motionTime ?? c.t) > 0.5) {
        for (const h of p.strikes) h.on = -Infinity;
        p.stroke = -1; p.motionPiece = c.piece;
      }
      p.motionTime = c.t;
      if (c.running && st && st.strokes !== p.stroke && c.recent < 0.25) {
        p.stroke = st.strokes;
        const strike = midi => {
          const k = pitched ? (p.inst.targetForMidi(midi).center.x < 0 ? 0 : 1)
            : kind === 'timpani' && midi < 46 ? 0
            : kind === 'timpani' && midi >= 50 ? 1 : 1 - p.hand;
          p.hand = k; p.strikes[k].on = st.lastOn; p.strikes[k].pitch = midi;
        };
        // Chords can strike both sides of a keyboard percussion instrument.
        const chord = pitched ? st.active.filter(a => Math.abs(a.on - st.lastOn) < 0.035) : [];
        if (chord.length) {
          const pitches = chord.map(a => a.midi); strike(Math.min(...pitches));
          if (Math.max(...pitches) !== Math.min(...pitches)) strike(Math.max(...pitches));
        } else strike(st.lastMidi);
      }
      const matrix = instrumentToBody(p);
      let nextHands = 0;
      if (pitched && c.running && c.soon < 0.2) {
        for (const track of c.piece?.tracks || []) {
          if (track.section !== p.sid || (track.chairs && !track.chairs.includes(p.ci))) continue;
          const i = track.vi * 4;
          if (Math.abs(track.notes[i] - st.nextOn) > 0.035) continue;
          nextHands |= p.inst.targetForMidi(track.notes[i + 2]).center.x < 0 ? 1 : 2;
        }
      }
      for (let k = 0; k < 2; k++) {
        const h = p.strikes[k], side = k ? 1 : -1;
        const d = pitched ? p.inst.targetForMidi(h.pitch) : p.inst.drums[kind === 'timpani' ? (h.pitch < 46 ? 0 : h.pitch < 50 ? 1 : 2) : 0];
        const target = d.center.clone();
        if (!pitched) {
          // Reach the inward portion of each outer timpano after spacing the
          // kettles apart; the grip and arm lengths stay unchanged.
          target.x += kind === 'timpani' && d.center.x !== 0
            ? -Math.sign(d.center.x) * d.r * .45 : side * d.r * .30;
          target.z += d.r * .15;
        }
        const prepares = pitched ? !!(nextHands & (1 << k)) : k === 1 - p.hand;
        const lift = strikeLift(c.running ? c.t - h.on : Infinity, c.running && prepares ? c.soon : Infinity, .08);
        // Tubular bells are struck towards the pipe, drums/bars downwards.
        if (kind === 'bells') target.z += 0.025 + lift;
        else target.y += 0.022 + lift;
        if (!p.targetsReady) p.hitTargets[k].copy(target);
        // Pitch travels smoothly; the vertical contact envelope stays locked to
        // the score rather than being smoothed into a perpetual hover.
        const tip = p.hitTargets[k];
        tip.x = travel(tip.x, target.x, c.dt); tip.y = target.y;
        tip.z = kind === 'bells' ? target.z : travel(tip.z, target.z, c.dt);
        const bodyTip = tip.clone().applyMatrix4(matrix);
        // Aim from a comfortable grip below the face. A fixed shaft angle
        // pushes short players' hands into their muzzle or beyond arm reach.
        const direction = kind === 'bells'
          ? V(0, 0.8, -0.6).transformDirection(matrix)
          : bodyTip.clone().sub(V(side * .22, .82, -.18)).normalize();
        placeBeater(p, k, bodyTip, direction);
      }
      p.targetsReady = true;
      p.char.head.rotation.x = smooth(p.char.head.rotation.x, 0.16 * p.ready, c.dt * 0.2);
      p.anchor.copy(p.inst.drums[0].center).applyMatrix4(matrix);
    },
  };
}

export function handPercussionRig(kind) {
  return {
    build(p) {
      p.inst = I.percussion(kind); mergeChildren(p.inst.group); p.char.body.add(p.inst.group);
      if (kind === 'triangle') {
        p.mallets = [null, I.mallet('triangle')];
        mergeChildren(p.mallets[1].group); p.char.body.add(p.mallets[1].group);
      }
    },
    update(p, c) {
      const r = p.ready, g = p.inst.group;
      const age = c.running ? c.recent : Infinity;
      const lift = strikeLift(age, c.running ? c.soon : Infinity, 0.10);
      const shake = kind === 'tambourine' && c.playing ? Math.sin(Math.min(1, age / 0.18) * Math.PI * 4) * Math.exp(-age * 7) : 0;
      g.position.set(-0.14, 0.72 + r * 0.20 + shake * 0.018, -0.24 - r * 0.12);
      g.rotation.set(0, 0, kind === 'tambourine' ? shake * 0.13 : 0.06 * Math.sin(c.t * 1.2) * r);
      const local = v => v.clone().applyEuler(g.rotation).add(g.position);
      setArm(p.char, 'L', local(p.inst.grip), poles[0]);
      if (kind === 'triangle') {
        const tip = local(p.inst.drums[0].center).add(V(0, lift, 0.009));
        placeBeater(p, 1, tip, V(-0.92, -0.18, -0.35).normalize());
      } else {
        // A free palm taps the skin while the other hand supports/shakes the rim.
        const palm = local(V(0.07, 0, -0.045 - lift));
        palm.lerp(rest[1], 1 - r);
        setArm(p.char, 'R', palm, poles[1]);
      }
      p.anchor.copy(g.position);
      p.char.head.rotation.x = smooth(p.char.head.rotation.x, 0.1 * r, c.dt * 0.2);
    },
  };
}
