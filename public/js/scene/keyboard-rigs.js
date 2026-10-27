import * as THREE from 'three';
import * as I from './instruments.js';
import { setArm } from './characters.js';
import { mergeChildren } from './merge.js';
import { smooth } from './rig-utils.js';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
import { instrumentToBody, visualPitch } from './playing-motion.js';
export const KEYBOARD_RIGS = {};
KEYBOARD_RIGS.piano = {
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

    const act = st ? st.active : [];
    // Keep hands ordered even when MIDI sources combine or swap staff tracks.
    const isR = a => a.midi >= 60;
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
    // Shift the torso towards the register, while the hips stay on the bench.
    const center = (inst.keyPos(p.mR).x + inst.keyPos(p.mL).x) / 2;
    p.char.body.position.x = smooth(p.char.body.position.x, center * 0.65 * r, 6, dt);
    p.char.body.position.z = -0.10 * r;
    const matrix = instrumentToBody(p);
    const toBody = v => v.clone().applyMatrix4(matrix);
    const kr = toBody(inst.keyPos(Math.max(p.mR, p.mL + 5)));
    const kl = toBody(inst.keyPos(Math.min(p.mL, p.mR - 5)));
    kr.y += p.liftR + (1 - r) * 0.08;
    kl.y += p.liftL + (1 - r) * 0.08;
    kr.lerp(V(.16, .65, -.2), 1 - r);
    kl.lerp(V(-.16, .65, -.2), 1 - r);
    setArm(p.char, 'R', kr, V(0.7, -0.6, 0.4));
    setArm(p.char, 'L', kl, V(-0.7, -0.6, 0.4));
    const h = p.char.head;
    h.rotation.x = smooth(h.rotation.x, 0.22 * r, 3, dt);
    h.rotation.y = smooth(h.rotation.y, ((p.mR + p.mL) / 2 - 60) / -120, 2, dt);

    p.anchor.copy(toBody(inst.keyPos(64)));
  },
};

for (const kind of ['celesta', 'organ']) {
  KEYBOARD_RIGS[kind] = {
    build(p) {
      p.inst = I.chamberKeyboard(kind === 'organ');
      mergeChildren(p.inst.group, p.inst.keys);
      p.inst.group.position.copy(p.char.root.position); p.inst.group.rotation.y = p.yaw;
      p.char.root.parent.add(p.inst.group);
    },
    update(p, c) {
      const active = c.running ? c.st?.active || [] : [];
      p.inst.setPressed(new Set(active.map(a => visualPitch(a.midi))));
      const matrix = instrumentToBody(p);
      for (const [side, high, fallback] of [['L', false, 55], ['R', true, 74]]) {
        const notes = active.filter(a => (a.midi >= 64) === high);
        const key = `key${side}`;
        const midi = notes.length ? notes.reduce((n, a) => n + visualPitch(a.midi), 0) / notes.length : (p[key] ?? fallback);
        p[key] = smooth(p[key] ?? fallback, midi, 12, c.dt);
        const hand = p.inst.keyPos(p[key]);
        const liftKey = `lift${side}`;
        p[liftKey] = smooth(p[liftKey] ?? 0.04, notes.length ? 0 : 0.04, 18, c.dt);
        hand.y += p[liftKey]; hand.applyMatrix4(matrix);
        hand.lerp(V(side === 'L' ? -0.16 : 0.16, 0.67, -0.18), 1 - p.ready);
        setArm(p.char, side, hand, V(side === 'L' ? -0.7 : 0.7, -0.6, 0.3));
      }
      p.char.head.rotation.x = smooth(p.char.head.rotation.x, 0.16 * p.ready, 3, c.dt);
      p.anchor.copy(p.inst.keyPos(66)).applyMatrix4(matrix);
    },
  };
}
