import * as THREE from 'three';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrchestra } from '../public/js/scene/orchestra.js';
import { stringRig } from '../public/js/scene/string-rigs.js';

// Sample the actual leg capsule centrelines against the carved soundbox mesh.
// This is a regression guard, supplemented by the rendered close-up recordings.
function soundboxLegGap(player) {
  const toInstrument = player.inst.group.matrixWorld.clone().invert().multiply(player.char.root.matrixWorld);
  const { position } = player.inst.bodyGeometry.attributes;
  const index = player.inst.bodyGeometry.index;
  const triangle = new THREE.Triangle();
  const nearest = new THREE.Vector3();
  const point = new THREE.Vector3();
  let minimum = Infinity;
  for (const leg of player.char.seatedLegVolumes) {
    for (let sample = 0; sample <= 20; sample++) {
      point.lerpVectors(leg.a, leg.b, sample / 20).applyMatrix4(toInstrument);
      for (let vertex = 0; vertex < (index?.count || position.count); vertex += 3) {
        for (const [offset, corner] of [triangle.a, triangle.b, triangle.c].entries()) {
          corner.fromBufferAttribute(position, index ? index.getX(vertex + offset) : vertex + offset);
        }
        triangle.closestPointToPoint(point, nearest);
        minimum = Math.min(minimum, point.distanceTo(nearest) - leg.radius);
      }
    }
  }
  return minimum;
}

function orchestraFixture(t) {
  const previousDocument = globalThis.document;
  t.after(() => { globalThis.document = previousDocument; });
  const context = new Proxy({}, {
    get: (_, key) => key.startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  return buildOrchestra(new THREE.Scene());
}

test('cello soundbox clears both seated cast members and the full bow stroke remains reachable', t => {
  const orchestra = orchestraFixture(t);
  const rig = stringRig('cello');
  let worstGap = Infinity;
  let worstContact = 0;
  let worstPose;
  for (const player of orchestra.players.filter(p => p.sid === 'vc')) {
    for (let pose = 0; pose < 12; pose++) {
      player.ready = (pose % 3) / 2;
      player.char.body.rotation.x = Math.sin(pose) * .08;
      player.char.body.rotation.z = Math.cos(pose) * .08;
      // Include the old extreme tip-of-bow request, pauses, and partial readiness.
      player.u = player.u0 = player.u1 = pose % 2 ? .92 : .08;
      player.strokeOn = -1;
      const pizzicato = pose % 4 === 0;
      player.pluckMix = pizzicato ? 1 : 0;
      const piece = { tracks: pizzicato ? [{ section: 'vc', inst: 'pizzicato', notes: [0, 30, 48, 90] }] : [] };
      rig.update(player, {
        t: pose / 30, dt: 1 / 30, piece, recent: 0, running: true,
        playing: pose % 2 === 0,
        st: { strokes: pose, lastDur: 3, lastVel: 110, lastOn: pose / 30, lastMidi: 36 + pose },
      });
      player.char.root.updateWorldMatrix(true, true);
      const gap = soundboxLegGap(player);
      if (gap < worstGap) {
        worstGap = gap;
        worstPose = { chair: player.ci, pose };
      }
      for (const arm of Object.values(player.char.arms)) {
        worstContact = Math.max(worstContact, arm.wrist.distanceTo(arm.target));
      }
    }
  }
  assert.ok(worstGap > .01, `Soundbox/leg gap ${worstGap} at ${JSON.stringify(worstPose)}`);
  assert.ok(worstContact < .03, `Arm contact error ${worstContact}`);
});
