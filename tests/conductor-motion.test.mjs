import assert from 'node:assert/strict';
import test from 'node:test';
import { conductorScore, createConductorPose, sampleConductorPose } from '../public/js/scene/conductor-motion.js';

const fixture = (velocity = 80) => ({
  duration: 16,
  beats: Array.from({ length: 32 }, (_, i) => [i * .5, i % 4, 4]),
  tracks: [{ section: 'vn1', notes: [0, 4, 60, velocity, 4, 4, 64, velocity, 8, 4, 67, velocity, 12, 4, 60, velocity] }],
});
const poseAt = (score, t) => sampleConductorPose(score, t, createConductorPose());

test('conductor caches score analysis and reuses output without reading tracks while sampling', () => {
  const piece = fixture(), score = conductorScore(piece), out = createConductorPose();
  assert.equal(conductorScore(piece), score);
  Object.defineProperty(piece, 'tracks', { get() { throw new Error('runtime score scan'); } });
  for (const t of [0, 9.2, 3.3, 15.8, 0, 3.3]) {
    assert.equal(sampleConductorPose(score, t, out), out);
    assert.deepEqual(out, poseAt(score, t));
    assert.equal(conductorScore(piece), score);
  }
});

test('written dynamics enlarge ictus and left hand; phrase shapes both hands independently', () => {
  const soft = conductorScore(fixture(30)), loud = conductorScore(fixture(115));
  assert.ok(poseAt(loud, 2).ry < poseAt(soft, 2).ry);
  assert.ok(poseAt(loud, 2).ly > poseAt(soft, 2).ly);
  const start = poseAt(loud, 2), crest = poseAt(loud, 4);
  assert.notEqual(start.lx, crest.lx);
  assert.notEqual(start.lz, crest.lz);
  assert.notEqual(start.rz, crest.rz);
});

test('rests cue the actual entering section, with preparation and release', () => {
  const piece = fixture();
  piece.tracks = [{ section: 'vc', notes: [4, 2, 48, 110] }];
  const score = conductorScore(piece);
  const prepare = poseAt(score, 3.5), entrance = poseAt(score, 4), released = poseAt(score, 6);
  assert.ok(prepare.cue > .1);
  assert.ok(entrance.cue > prepare.cue);
  assert.ok(entrance.headY < 0, 'stage-right cellos receive a rightward look');
  assert.ok(released.cue < .01);
  // Identical onset on another chair is still one section entry.
  piece.tracks.push({ section: 'vc', notes: [4, 2, 55, 110] });
  const duplicate = conductorScore({ ...piece });
  assert.deepEqual(Array.from(duplicate.cue), Array.from(score.cue));
});

test('meter changes, phrase boundaries and arbitrary seeks keep bounded continuous targets', () => {
  const piece = fixture();
  for (let i = 12; i < 24; i++) piece.beats[i] = [i * .5, (i - 12) % 3, 3];
  const score = conductorScore(piece);
  for (let t = .5; t < 15; t += .5) {
    const a = poseAt(score, t - 1e-5), b = poseAt(score, t + 1e-5);
    for (const field of Object.keys(a)) assert.ok(Math.abs(a[field] - b[field]) < .0001, `${field} discontinuous at ${t}`);
  }
  for (let t = -1; t < 18; t += 1 / 120) {
    const p = poseAt(score, t);
    for (const value of Object.values(p)) assert.ok(Number.isFinite(value));
    assert.ok(p.rx >= -.12 && p.rx <= .4 && p.ry >= .89 && p.ry <= 1.36);
    assert.ok(p.ly >= .88 && p.ly <= 1.26 && Math.abs(p.headY) <= .42);
  }
  assert.deepEqual(poseAt(score, 3.125), poseAt(conductorScore(structuredClone(piece)), 3.125));
});

test('missing beats reset a reused pose without stale cue or body motion', () => {
  const out = poseAt(conductorScore(fixture()), 2);
  sampleConductorPose(conductorScore({ tracks: [], duration: 1 }), 0, out);
  assert.deepEqual(out, createConductorPose());
});

test('conductor targets reach with the actual character arm lengths and joint limits', async () => {
  const THREE = await import('three');
  const { buildCharacter, setArm } = await import('../public/js/scene/characters.js');
  const { CONDUCTOR } = await import('../public/js/layout.js');
  const { ARM_LIMITS } = await import('../public/js/scene/arm-ik.js');
  const char = buildCharacter({ ...CONDUCTOR, standing: true }, '#fff1c1');
  const target = new THREE.Vector3(), pole = new THREE.Vector3();
  for (const velocity of [1, 50, 127]) {
    const score = conductorScore(fixture(velocity)), pose = createConductorPose();
    for (let t = 0; t <= 16; t += 1 / 60) {
      sampleConductorPose(score, t, pose);
      for (const side of ['R', 'L']) {
        const prefix = side.toLowerCase();
        target.set(pose[`${prefix}x`], pose[`${prefix}y`], pose[`${prefix}z`]);
        pole.set(side === 'R' ? .8 : -.8, -.5, .3);
        setArm(char, side, target, pole);
        const arm = char.arms[side];
        assert.ok(arm.targetError < 1e-7, `${side} hand unreachable at ${t}: ${arm.targetError}`);
        assert.ok(arm.flex >= ARM_LIMITS.minFlex - 1e-8 && arm.flex <= ARM_LIMITS.maxFlex + 1e-8);
      }
    }
  }
});
