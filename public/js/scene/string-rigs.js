import * as THREE from 'three';
import * as I from './instruments.js';
import { setArm } from './characters.js';
import { mergeChildren } from './merge.js';
import { basis, placeBy, toParent, smooth, easeOut } from './rig-utils.js';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
import { stringTechniqueAt } from './playing-motion.js';
import { ARM_LIMITS } from './arm-ik.js';
const tmpM = new THREE.Matrix4();
// open-string pitch per string family
const OPEN = {
  violin: [55, 62, 69, 76],
  viola: [48, 55, 62, 69],
  cello: [36, 43, 50, 57],
  bass: [28, 33, 38, 43],
};

export function stringRig(kind) {
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
        p.playQ = basis(V(big ? -0.24 : -0.15, 1, big ? 0.22 : 0.10), V(0.22, 0, -1));
        p.playAnchor = inst.endpin;
        p.playPos = big ? V(-0.02, 0.0, -0.25) : V(0.04, 0.0, -0.29);
        p.restQ = p.playQ;
        p.restAnchor = inst.endpin;
        p.restPos = p.playPos;
      }
      p.bowDirSign = 1;
    },
    update(p, c) {
      const { t, dt, st } = c;
      if (p.motionPiece !== c.piece || t < (p.motionTime ?? t) - .1 || t - (p.motionTime ?? t) > .5) {
        p.stroke = -1; p.strokeOn = -1; p.u0 = p.u1 = p.u; p.motionPiece = c.piece;
      }
      p.motionTime = t;
      const inst = p.inst;
      const g = inst.group;
      const r = p.ready;
      // instrument pose
      const q = p.restQ.clone().slerp(p.playQ, easeOut(r));
      const pos = p.restPos.clone().lerp(p.playPos, easeOut(r));
      if (kind === 'cello' || kind === 'bass') {
        // The endpin belongs to the floor, not to the swaying torso. Lift it
        // clear when carrying the instrument between the wings and the seat.
        pos.y += p.char.walking ? .08 : 0;
        q.premultiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), (p.walker?.bow || 0) * .55));
        p.char.body.updateMatrix();
        p.rootToBody ??= new THREE.Matrix4();
        pos.applyMatrix4(p.rootToBody.copy(p.char.body.matrix).invert());
      }
      placeBy(g, q, r > 0.5 ? p.playAnchor : p.restAnchor, pos);

      const previousBow = p.u;
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
      // Bound visual travel across dense/chordal note changes and seek recovery.
      p.u = previousBow + Math.max(-2.5 * dt, Math.min(2.5 * dt, p.u - previousBow));
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
      if (kind === 'cello') {
        // Limit the bow stroke itself to the player's reach. The contact stays
        // on the string and the hand stays on the frog; never stretch the arm.
        const arm = p.char.arms.R;
        const reach = Math.sqrt(arm.a ** 2 + arm.b ** 2 + 2 * arm.a * arm.b * Math.cos(ARM_LIMITS.minFlex)) * .98;
        const d = contact.clone().addScaledVector(bowUp, .041 + lift).sub(arm.shoulder);
        const along = d.dot(bowDir);
        const half = Math.sqrt(Math.max(0, reach * reach - (d.lengthSq() - along * along)));
        const lo = Math.max(.08, (along - half) / L);
        const hi = Math.max(lo, Math.min(.92, (along + half) / L));
        p.u = Math.max(lo, Math.min(hi, p.u));
        p.u1 = Math.max(lo, Math.min(hi, p.u1));
      }
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
      if (p.techniquePiece !== c.piece) {
        p.techniquePiece = c.piece;
        p.techniqueTracks = c.piece?.tracks.filter(tr => tr.section === p.sid && (!tr.chairs || tr.chairs.includes(p.ci))) || [];
      }
      const pizzicato = stringTechniqueAt(p.techniqueTracks, t);
      p.pluckMix = smooth(p.pluckMix ?? 0, pizzicato ? r : 0, 16, dt);
      p.bow.group.visible = true;

      // right hand on the frog, left hand on the neck with vibrato
      const pluck = c.running ? Math.sin(c.recent * 28) * Math.exp(-Math.max(0, c.recent) * 12) * 0.025 : 0;
      const pluckHand = contact.clone().add(V(0.02, 0, pluck));
      // Cellists pluck near the lower fingerboard, above the bowing contact.
      // Reaching down to the bridge overextends the arm on soft pizzicato.
      if (kind === 'cello') pluckHand.addScaledVector(vY, .12);
      const rh = frog.clone().addScaledVector(bowUp, 0.035).lerp(pluckHand, p.pluckMix);
      // Retain the bow in the hand, pointing down while the finger plucks.
      // Hiding it for each short note made it flash in and out between rests.
      p.bow.group.position.lerp(pluckHand.clone().add(V(0.02, -0.015, 0.04)), p.pluckMix);
      p.bow.group.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), V(0.2, -0.98, 0.06).normalize()), p.pluckMix);
      setArm(p.char, 'R', rh, V(0.7, -0.6, 0.3));
      const vib = c.playing && st.lastDur > 0.4 ? Math.sin(t * 34) * 0.004 : 0;
      const neckShift = (kind === 'cello' || kind === 'bass') ? Math.max(p.shift, 1 - r) : p.shift;
      const neck = toParent(g, inst.neckAt(Math.min(1, neckShift + vib * 6)));
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

