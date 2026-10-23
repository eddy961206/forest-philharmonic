import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { beaterHeadClearance, segmentEllipsoidDistance } from '../tools/qa/motion-collisions.mjs';
import { strikeLift, visualPitch, instrumentToBody, raccoonPatchGeometry, stringTechniqueAt } from '../public/js/scene/playing-motion.js';
import { percussionRig, handPercussionRig } from '../public/js/scene/percussion-rigs.js';
import { buildCharacter } from '../public/js/scene/characters.js';
import { percussion, mallet } from '../public/js/scene/instruments.js';

test('strikes contact at onset and rebound continuously at 30, 60 and 120 fps', () => {
  assert.equal(strikeLift(0), 0);
  assert.equal(strikeLift(1, 0), 0);
  assert.equal(strikeLift(Infinity), 0.12);
  for (const fps of [30, 60, 120]) {
    let previous = 0;
    for (let frame = 0; frame < fps; frame++) {
      const value = strikeLift(frame / fps);
      assert.ok(value >= previous && value <= 0.12);
      assert.ok(Math.abs(value - previous) < 0.06);
      previous = value;
    }
  }
});

test('compact keyboard mapping preserves every MIDI pitch class', () => {
  for (let midi = 0; midi <= 127; midi++) {
    const key = visualPitch(midi);
    assert.ok(key >= 48 && key <= 84);
    assert.equal(key % 12, midi % 12);
  }
});

test('pizzicato persists between short notes, switches to bowed notes and follows backward seeks', () => {
  const tracks = [{ inst: 'pizzicato', notes: [1, .1, 60, 80, 3, .1, 64, 80] }, { inst: 'strings', notes: [5, .2, 67, 90] }];
  for (const time of [0, 1, 1.1, 2, 3, 4.9]) assert.equal(stringTechniqueAt(tracks, time), true);
  for (const time of [5, 5.2, 9]) assert.equal(stringTechniqueAt(tracks, time), false);
  assert.equal(stringTechniqueAt(tracks, 2), true);
});

test('instrument contacts remain fixed through body sway, player scale and stage transforms', () => {
  const scene = new THREE.Group(), root = new THREE.Group(), body = new THREE.Group(), group = new THREE.Group();
  scene.add(root, group); root.add(body);
  root.scale.setScalar(1.28); root.position.set(3, 2, -5); group.position.set(3, 2, -5);
  const p = { char: { body }, inst: { group } }, point = new THREE.Vector3(0.2, 0.8, -0.5);
  for (let i = 0; i < 80; i++) {
    scene.rotation.y = i * .03; root.rotation.y = i * .02;
    body.rotation.set(Math.sin(i) * .1, 0, Math.cos(i) * .1);
    body.position.y = .07 * Math.sin(i);
    const local = point.clone().applyMatrix4(instrumentToBody(p));
    assert.ok(body.localToWorld(local).distanceTo(group.localToWorld(point.clone())) < 1e-9);
  }
});

test('raccoon markings have separated rounded contours and outward normals', () => {
  for (const side of [-1, 1]) {
    const geometry = raccoonPatchGeometry(side, '#8f8a85', '#51463f');
    const p = geometry.attributes.position, normal = geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      assert.ok(p.getX(i) * side > .02, 'nose bridge remains clear');
      assert.ok(Math.abs(p.getY(i)) < .11, 'no full-width band');
      assert.ok(Number.isFinite(p.getZ(i)));
      if (normal.getZ(i)) assert.ok(normal.getZ(i) < 0, 'front faces the audience');
    }
    assert.equal(geometry.attributes.color.count, p.count);
  }
});

function canvasStub(t) {
  const previous = globalThis.document;
  const context = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => { globalThis.document = previous; });
}

for (const kind of ['snare', 'tom', 'bassDrum', 'cymbals', 'mallet', 'bells', 'timpani', 'triangle', 'tambourine']) {
  test(`${kind}: live-note poses keep beaters/grips attached and finite through a seek`, t => {
    canvasStub(t);
    const scene = new THREE.Scene();
    const char = buildCharacter({ species: 'mouse', fur: '#aaa3a2', outfit: 'tail' });
    scene.add(char.root); char.root.position.set(2, 1.7, -4); char.root.rotation.y = .8;
    const p = { char, ready: 1, yaw: .8, sid: 'fixture', anchor: new THREE.Vector3() };
    const rig = ['triangle', 'tambourine'].includes(kind) ? handPercussionRig(kind) : percussionRig(kind);
    rig.build(p);
    const piece = {};
    for (let frame = 0; frame < 120; frame++) {
      const time = frame < 80 ? frame / 60 : (frame - 80) / 60;
      const on = Math.floor(time / .2) * .2, midi = 55 + Math.floor(time / .2) % 24;
      const st = { strokes: Math.floor(time / .2) + 1, lastOn: on, lastMidi: midi, active: [{ on, midi }], lastVel: 100 };
      char.body.rotation.set(.04 * Math.sin(time * 3), 0, .06 * Math.cos(time * 2));
      rig.update(p, { t: time, dt: 1 / 60, st, piece, playing: true, running: true, recent: time - on, soon: on + .2 - time });
      for (const side of ['L', 'R']) for (const value of char.arms[side].wrist.toArray()) assert.ok(Number.isFinite(value));
      for (let k = 0; k < (p.mallets?.length ?? 0); k++) {
        const tool = p.mallets[k]; if (!tool) continue;
        assert.ok(char.arms[k ? 'R' : 'L'].wrist.distanceTo(tool.group.position) < .025, 'hand stays on handle');
      }
      assert.ok(beaterHeadClearance(p) >= 1, `${kind}: shaft stays outside head and muzzle`);
      if (p.inst.grip) {
        const target = p.inst.grip.clone().applyEuler(p.inst.group.rotation).add(p.inst.group.position);
        assert.ok(char.arms.L.wrist.distanceTo(target) < .025, 'left hand supports held instrument');
      }
    }
    if (kind === 'tambourine') assert.equal(p.mallets, undefined, 'played with palm, not timpani beaters');
    if (kind === 'triangle') assert.equal(p.mallets.filter(Boolean).length, 1);
  });
}

test('keyboard percussion contact points follow pitch across actual bars/pipes', t => {
  canvasStub(t);
  for (const kind of ['mallet', 'bells']) {
    const inst = percussion(kind), positions = new Set();
    for (let midi = 48; midi <= 84; midi++) positions.add(inst.targetForMidi(midi).center.x);
    assert.ok(positions.size >= 10);
  }
  assert.equal(mallet('triangle').group.children.length, 1, 'metal beater has no felt head');
});

test('beater collision guard detects crossing, clearance and zero-length segments', () => {
  const volume = { center: new THREE.Vector3(), radii: new THREE.Vector3(1, 2, 1) };
  assert.equal(segmentEllipsoidDistance(new THREE.Vector3(-2, 0, 0), new THREE.Vector3(2, 0, 0), volume), 0);
  assert.ok(Math.abs(segmentEllipsoidDistance(new THREE.Vector3(1.1, -4, 0), new THREE.Vector3(1.1, 4, 0), volume) - 1.1) < 1e-9);
  assert.equal(segmentEllipsoidDistance(new THREE.Vector3(), new THREE.Vector3(), volume), 0);
});
