import * as THREE from 'three';
import * as I from './instruments.js';
import { setArm } from './characters.js';
import { mergeChildren } from './merge.js';
import { basis, placeBy, toParent, smooth, easeOut } from './rig-utils.js';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const WIND_RIGS = {};
function windRig(make, cfg) {
  return {
    build(p) {
      const inst = make();
      p.inst = inst;
      mergeChildren(inst.group, inst.slide ? [inst.slide] : []);
      if (inst.slide) mergeChildren(inst.slide);
      p.char.body.add(inst.group);
      p.cfg = cfg;
      p.fing = 0;
    },
    update(p, c) {
      const { t, dt, st } = c;
      const r = easeOut(p.ready);
      const g = p.inst.group;
      const h = p.char.head;
      h.rotation.x = smooth(h.rotation.x, (cfg.headX ?? 0.08) * r, 4, dt);
      h.rotation.z = smooth(h.rotation.z, (cfg.headZ || 0) * r, 4, dt);
      const bob = c.playing ? Math.sin(t * 2 + p.sway) * 0.012 * p.energy : 0;
      const playPos = p.char.mouthPoint.clone().applyEuler(h.rotation).add(h.position).add(V(0, bob, 0));
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
      const right = p.inst.rh.clone();
      if (p.inst.slide) {
        const extension = c.playing ? ((72 - (st?.lastMidi ?? 60)) % 7 + 7) % 7 * 0.012 : 0.03;
        p.inst.slide.position.z = smooth(p.inst.slide.position.z, -extension, 12, dt);
        right.z += p.inst.slide.position.z;
      }
      const rh = toParent(g, right).add(V(0, -wig, 0));
      setArm(p.char, 'L', lh, cfg.poleL);
      setArm(p.char, 'R', rh, cfg.poleR);
      p.anchor.copy(toParent(g, cfg.tip || V(0, -0.4, 0)));
    },
  };
}

WIND_RIGS.flute = windRig(I.flute, {
  playQ: basis(V(0.10, 1, 0), V(0.15, 0, 1)),
  restQ: basis(V(0.3, 1, 0), V(0, 0, 1)),
  restPos: V(-0.14, 0.64, -0.24),
  poleL: V(-0.3, -0.7, 0.4), poleR: V(0.6, -0.7, 0.2), headZ: -0.12, tip: V(0.4, 0, 0),
});
WIND_RIGS.oboe = windRig(() => I.reed('oboe'), {
  playQ: basis(V(0, 0.85, 0.53), V(0, 0.53, -0.85)),
  restQ: basis(V(0, 1, 0.15), V(0, -0.15, -1)),
  restPos: V(0.1, 1.0, -0.28),
  poleL: V(-0.7, -0.6, 0.2), poleR: V(0.7, -0.6, 0.2), headX: 0.12, tip: V(0, -0.5, 0),
});
WIND_RIGS.clarinet = windRig(() => I.reed('clarinet'), {
  playQ: basis(V(0, 0.85, 0.53), V(0, 0.53, -0.85)),
  restQ: basis(V(0, 1, 0.15), V(0, -0.15, -1)),
  restPos: V(0.1, 1.0, -0.28),
  poleL: V(-0.7, -0.6, 0.2), poleR: V(0.7, -0.6, 0.2), headX: 0.12, tip: V(0, -0.55, 0),
});
WIND_RIGS.bassoon = windRig(I.bassoon, {
  playQ: basis(V(-0.4, 1, 0.08), V(0, 0, -1)),
  restQ: basis(V(-0.2, 1, 0.1), V(0, 0, -1)),
  restPos: V(0.05, 0.95, -0.3),
  poleL: V(-0.7, -0.5, 0.2), poleR: V(0.8, -0.5, 0.2), headX: 0.05, tip: V(0.1, 0.25, 0),
});
WIND_RIGS.horn = windRig(I.horn, {
  playQ: basis(V(0.05, 1, 0.1), V(0.15, 0, 1)),
  restQ: basis(V(0, 1, 0), V(0, 0, 1)),
  restPos: V(0.0, 0.9, -0.25),
  poleL: V(-0.7, -0.6, 0.1), poleR: V(0.8, -0.4, 0.3), headX: 0.05, tip: V(0.2, -0.1, 0),
});
WIND_RIGS.trumpet = windRig(I.trumpet, {
  playQ: basis(V(0, 0.97, -0.24), V(0, 0.24, 0.97)),
  restQ: basis(V(0, 0.4, -0.9), V(0, 0.9, 0.4)),
  restPos: V(0.0, 0.66, -0.12),
  poleL: V(-0.7, -0.6, 0.2), poleR: V(0.7, -0.6, 0.2), headX: 0.0, tip: V(0, 0, -0.42),
});

// Register the added orchestra families before buildOrchestra is called.
WIND_RIGS.piccolo = windRig(() => {
  const inst = I.flute(); inst.group.scale.setScalar(0.68);
  return inst;
}, {
  playQ: basis(V(0.10, 1, 0), V(0.15, 0, 1)),
  restQ: basis(V(0, 1, 0), V(0, 0, 1)), restPos: V(-0.14, 0.64, -0.24),
  poleL: V(-0.3, -0.7, 0.4), poleR: V(0.6, -0.7, 0.2), tip: V(0.3, 0, 0),
});
WIND_RIGS.englishHorn = windRig(() => {
  const inst = I.reed('oboe'); inst.group.scale.set(.94, 1.06, .94);
  return inst;
}, {
  playQ: basis(V(0, 0.85, 0.53), V(0, 0.53, -0.85)), restQ: basis(V(0, 1, 0.15), V(0, -0.15, -1)),
  restPos: V(0.1, 1, -0.28), poleL: V(-0.7, -0.6, 0.2), poleR: V(0.7, -0.6, 0.2), tip: V(0, -0.65, 0),
});
WIND_RIGS.trombone = windRig(() => { const inst = I.trombone(); inst.group.scale.setScalar(.72); return inst; }, {
  playQ: basis(V(0, 0.98, -0.18), V(0, 0.18, 0.98)), restQ: basis(V(0, 0.5, -0.86), V(0, 0.86, 0.5)),
  restPos: V(0, 0.72, -0.15), poleL: V(-0.7, -0.6, 0.2), poleR: V(0.7, -0.6, 0.2), tip: V(0, 0, -0.6),
});
WIND_RIGS.tuba = windRig(I.tuba, {
  playQ: basis(V(0, 1, 0), V(0, 0, -1)), restQ: basis(V(0, 1, 0), V(0, 0, -1)),
  restPos: V(0, 0.95, -0.22), poleL: V(-0.7, -0.6, 0.2), poleR: V(0.7, -0.6, 0.2), tip: V(0.15, 0.2, 0),
});
WIND_RIGS.saxophone = windRig(I.saxophone, {
  playQ: basis(V(0, 1, 0), V(0, 0, 1)), restQ: basis(V(0, 1, 0.15), V(0, -0.15, 1)),
  restPos: V(0, 0.9, -0.22), poleL: V(-0.7, -0.6, 0.2), poleR: V(0.7, -0.6, 0.2), tip: V(0, -0.35, -0.35),
});

