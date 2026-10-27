import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { StageManager } from '../public/js/scene/stage.js';
const char = (standing = false) => ({ root: new THREE.Group(), spec: { standing }, walk() {}, setStanding() {} });
function stage() {
  const s = new StageManager({ obstacles: [], players: [
    { sid: 'vn1', ci: 0, home: new THREE.Vector3(-3, 0, -2), yaw: 0, char: char() },
    { sid: 'choir', ci: 0, home: new THREE.Vector3(3, 0, -2), yaw: 0, char: char(true) },
  ], conductor: { home: new THREE.Vector3(0, 0, -2.4), char: char(true) } });
  s.clearStage(); return s;
}
test('skipping entries preserves solo standing, choir, conductor greeting and bows', () => {
  const s = stage(); s.setSkipTransitions(true);
  s.callOn(s.walkers, undefined, { stand: true });
  assert.ok(s.arrived(s.walkers));
  assert.ok(s.walkers.every(w => w.sit === 0 && w.char.root.visible));
  s.conductorEnter(); assert.ok(s.conductorReady); assert.equal(s.conductor.faceYaw, Math.PI);
  s.greet(s.walkers, true); s.conductorBow(true);
  s.setSkipTransitions(true);
  assert.equal(s.walkers[0].bowTarget, 0.5); assert.equal(s.conductor.bowTarget, 1);
  s.conductorExit(); s.exitAll();
  assert.ok(s.allOffstage); assert.ok(s.conductorOffstage);
});
test('enabling during queued or active travel completes the destination and disabling resumes future walking', () => {
  const s = stage(); s.callOn(s.walkers); s.conductorEnter();
  s.walkers[0].state = 'walking';
  s.setSkipTransitions(true);
  assert.ok(s.arrived(s.walkers)); assert.ok(s.conductorReady);
  assert.equal(s.walkers[0].sit, 1); assert.equal(s.walkers[1].sit, 0);
  s.setSkipTransitions(false); s.sendOff(s.walkers); s.conductorExit();
  assert.ok(s.walkers.every(w => w.state === 'queued'));
  s.walkers[0].state = 'walking'; s.setSkipTransitions(true);
  assert.ok(s.gone(s.walkers)); assert.ok(s.conductorOffstage);
  s.setSkipTransitions(false); s.callOn(s.walkers);
  assert.ok(s.walkers.every(w => w.state === 'queued'));
});
test('roster changes retain colleagues and final exit clears an already departing player', () => {
  const s = stage(); s.setSkipTransitions(true); s.enterAll();
  s.sendOff([s.walkers[0]]);
  assert.equal(s.walkers[0].state, 'off'); assert.equal(s.walkers[1].state, 'standing');
  s.setSkipTransitions(false); s.sendOff([s.walkers[1]]);
  s.setSkipTransitions(true); s.exitAll();
  assert.ok(s.allOffstage); assert.equal(s.onstage, false);
});
