import * as THREE from 'three';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrchestra } from '../public/js/scene/orchestra.js';
import { percussionRig } from '../public/js/scene/percussion-rigs.js';

test('timpani hoops are separate and all three striking areas remain reachable', t => {
  const previousDocument = globalThis.document;
  t.after(() => { globalThis.document = previousDocument; });
  const context = new Proxy({}, {
    get: (_, key) => key.startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  const orchestra = buildOrchestra(new THREE.Scene());
  const player = orchestra.playerAt('timp', 0);
  const rig = percussionRig('timpani');
  const drums = player.inst.drums;
  for (let a = 0; a < drums.length; a++) for (let b = a + 1; b < drums.length; b++) {
    const gap = drums[a].center.distanceTo(drums[b].center) - drums[a].r - drums[b].r - .024;
    assert.ok(gap > .02, `Hoop clearance ${gap} for drums ${a}/${b}`);
  }
  player.ready = 1;
  const piece = {};
  let stroke = 0, time = 0, worstArmError = 0, worstTipError = 0;
  for (const pitch of [36, 48, 60, 48, 36, 60]) for (const lean of [-.08, 0, .08]) {
    player.char.body.rotation.x = lean;
    player.char.body.rotation.z = -lean;
    // Let each hand travel to its next head before checking the next downbeat.
    for (let frame = 0; frame < 90; frame++) {
      const on = frame % 30 === 0;
      if (on) stroke++;
      const lastOn = time - (frame % 30) / 60;
      rig.update(player, { t: time, dt: 1 / 60, running: true, playing: true, piece,
        recent: time - lastOn, soon: .5 - (time - lastOn),
        st: { strokes: stroke, lastMidi: pitch, lastOn, active: [] } });
      player.char.root.updateWorldMatrix(true, true);
      player.inst.group.updateWorldMatrix(true, true);
      for (const arm of Object.values(player.char.arms)) {
        worstArmError = Math.max(worstArmError, arm.wrist.distanceTo(arm.target));
      }
      if (on && frame >= 60) {
        const side = player.hand, drum = drums[pitch < 46 ? 0 : pitch < 50 ? 1 : 2];
        const mallet = player.mallets[side];
        const tip = mallet.tip.clone().applyMatrix4(mallet.group.matrixWorld)
          .applyMatrix4(player.inst.group.matrixWorld.clone().invert());
        // Felt radius .022: the surface touches at center.y + .022 on the beat.
        worstTipError = Math.max(worstTipError, Math.abs(tip.y - drum.center.y - .022));
        assert.ok(Math.hypot(tip.x - drum.center.x, tip.z - drum.center.z) < drum.r * .65);
      }
      time += 1 / 60;
    }
  }
  t.diagnostic(`maximum arm error=${worstArmError}, downbeat error=${worstTipError}`);
  assert.ok(worstArmError < .03, `Arm contact error ${worstArmError}`);
  assert.ok(worstTipError < .02, `Downbeat contact error ${worstTipError}`);
});
