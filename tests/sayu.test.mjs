import test from 'node:test';
import assert from 'node:assert/strict';
import { SAYU, WAYS, floorY, rodTipY, walkable, headroom, inRoom } from '../public/js/scene/sayuRoom.js';
import { STATUES, POSE, pensiveShapes, buildPensiveStatue, cheekPoint, headFrame } from '../public/js/scene/pensive.js';
import { evaluate } from '../public/js/scene/sculpt.js';
import { adaptation, ADAPT } from '../public/js/sayu.js';
import { PLAZA, walkable as onSquare, gateYaw } from '../public/js/scene/plazaWorld.js';

// The room of quiet contemplation, after the National Museum of Korea's
// (docs/sayu-room.md): what its design is said to do, held to here.
const P = SAYU.platform;

test('the floor rises one degree toward the figures, then stays level', () => {
  const { from, to } = SAYU.rise;
  const slope = (floorY(0, to) - floorY(0, from)) / (from - to);
  assert.ok(Math.abs(Math.atan(slope) * 180 / Math.PI - 1) < 1e-9, `${slope}`);
  assert.equal(floorY(0, -8), floorY(0, to), 'level round the figures');
  assert.equal(floorY(SAYU.arrive.x, SAYU.arrive.z), 0, 'the corridors are flat');
});

test('the rods hang lower over the figures than anywhere else', () => {
  const over = rodTipY(P.x, P.z);
  assert.equal(over, SAYU.rodTip.low);
  for (const [x, z] of [[0, 11], [-7, 0], [7, -10], [3, 5]]) assert.ok(rodTipY(x, z) > over);
});

test('the long way in leads to the room, and the way out to the door', () => {
  const step = (pts) => pts.every((p) => walkable(p.x, p.z) || p.z > SAYU.inWay[0][1] - 0.4 || p.z > SAYU.outWay.at(-1)[1] - 0.4);
  assert.ok(walkable(SAYU.arrive.x, SAYU.arrive.z), 'you arrive standing');
  assert.ok(step(WAYS.in) && step(WAYS.out), 'every step of both corridors');
  assert.ok(inRoom(WAYS.in.at(-1).x, WAYS.in.at(-1).z - 0.5) && inRoom(WAYS.out[0].x, WAYS.out[0].z - 0.5), 'both open into the room');
  // (24 m from the way in to the far wall)
  assert.equal(SAYU.room.b * 2, 24);
  // the camera may be wherever you may stand
  for (const p of [...WAYS.in, ...WAYS.out]) if (walkable(p.x, p.z)) assert.ok(headroom(p.x, p.z) > 1.5);
});

test('no glass: you walk all the way round them, kept back by the low rail', () => {
  assert.equal(walkable(P.x, P.z), false);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const near = [P.x + Math.sin(a) * (P.rx + SAYU.keepOut - 0.1), P.z + Math.cos(a) * (P.rz + SAYU.keepOut - 0.1)];
    const round = [P.x + Math.sin(a) * (P.rx + SAYU.keepOut + 0.6), P.z + Math.cos(a) * (P.rz + SAYU.keepOut + 0.6)];
    assert.equal(walkable(...near), false, 'not over the rail');
    assert.ok(walkable(...round), `round the back too (${a.toFixed(2)})`);
  }
});

test('the smaller, older figure sits on the left, a little forward', () => {
  const [left, right] = STATUES;
  assert.equal(left.id, 'late-6c');
  assert.equal(right.id, 'early-7c');
  assert.ok(Math.abs(left.scale / right.scale - 81.5 / 93.5) < 0.002, 'heights as the real ones to each other');
  const [l, r] = SAYU.places;
  // (the figures face the way in, +z: the visitor's left is -x)
  assert.ok(l.x < 0 && r.x > 0 && l.dz > r.dz);
  assert.equal(left.crown, 'sunMoon');
  assert.equal(right.crown, 'threePeaks');
});

test('the pose: fingertips on the cheek, the elbow on the crossed knee', () => {
  for (const spec of STATUES) {
    const ops = pensiveShapes(spec);
    // the fingertips are there, resting just off the skull
    const touch = cheekPoint(0.014);
    assert.ok(evaluate(ops, ...touch) < 0, `${spec.id}: a fingertip at the cheek`);
    const onCheek = cheekPoint(0);
    const gap = Math.hypot(touch[0] - onCheek[0], touch[1] - onCheek[1], touch[2] - onCheek[2]);
    assert.ok(gap < 0.02, 'resting, not reaching');
    // the elbow rests on the knee of the crossed leg
    const e = POSE.elbow.R;
    const k = POSE.right.knee;
    assert.ok(Math.hypot(e[0] - k[0], e[1] - k[1], e[2] - k[2]) - 0.07 - 0.036 < 0.02, 'elbow on the knee');
    assert.ok(e[1] > k[1], 'above it');
    // the head bowed toward the hand
    const f = headFrame();
    const face = f.world([0, 0, -1]);
    assert.ok(face[1] < f.c[1] - 0.25, 'looking down');
    // the right ankle over the left knee, the left foot on the lotus
    assert.ok(POSE.right.ankle[1] > POSE.left.knee[1] && Math.abs(POSE.right.ankle[0] - POSE.left.knee[0]) < 0.03);
    assert.ok(POSE.left.toes[1] < 0.13 && Math.hypot(POSE.left.toes[0] - POSE.lotus.at[0], POSE.left.toes[2] - POSE.lotus.at[2]) < POSE.lotus.r * 1.1);
  }
});

test('each figure is cast as one closed, outward mesh standing on the platform', () => {
  for (const spec of STATUES) {
    const mesh = buildPensiveStatue(spec, undefined, { h: 0.012 });
    const g = mesh.geometry;
    g.computeBoundingBox();
    const b = g.boundingBox;
    assert.ok(b.min.y > -0.012 && b.min.y < 0.02, `on its base, within a step of the grid (${b.min.y})`);
    assert.ok(b.max.y > 1.45 && b.max.y < 1.8, `crown on top (${b.max.y})`);
    for (const k of ['position', 'normal', 'color']) assert.ok(g.getAttribute(k).array.every(Number.isFinite), k);
    assert.equal(mesh.scale.x, spec.scale);
  }
});

test('the eyes get used to the dark down the corridor', () => {
  assert.equal(adaptation(0), ADAPT.from);
  let before = 0;
  for (let t = 0; t <= 20; t += 0.5) { const e = adaptation(t); assert.ok(e >= before && e <= 1); before = e; }
  assert.ok(adaptation(10) > 0.9, 'used to it before the room');
});

test('the room has its door on the square, clear of the others', () => {
  const S = PLAZA.sayu;
  assert.deepEqual(Object.keys(PLAZA.gates), ['hall', 'sphere', 'outdoor'], 'the venues keep their gates');
  for (const g of Object.values(PLAZA.gates)) assert.ok(Math.hypot(g.x - S.x, g.z - S.z) > 8);
  assert.ok(onSquare(S.x * 0.86, S.z * 0.86), 'you can walk into it');
  const yaw = gateYaw(S);
  for (const s of [-1, 1]) assert.equal(onSquare(S.x + Math.cos(yaw) * s * 1.55, S.z - Math.sin(yaw) * s * 1.55), false, 'not through its pillars');
});
