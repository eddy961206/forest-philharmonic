import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildCharacter, shirtFrontGeometry, SHIRT_FRONT, skullPatchGeometry, FACE_MARKINGS, M } from '../public/js/scene/characters.js';
import { HEAD, SNOUT, torsoFrontZ, skullFrontZ, snoutFrontZ } from '../public/js/scene/body-shape.js';
import { CONDUCTOR } from '../public/js/layout.js';

// Markings drawn as balls set inside the head (the owl's facial disc and eye
// rings, the panda's patches) and a shirt front held off the chest showed
// as slivers or a floating white lump. They are now laid on the surfaces.
const points = (geometry) => {
  const a = geometry.getAttribute('position');
  return Array.from({ length: a.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(a, i));
};
const facesFront = (geometry) => {
  const n = geometry.getAttribute('normal');
  let front = 0;
  for (let i = 0; i < n.count; i++) if (n.getZ(i) < 0) front++;
  return front / n.count;
};
const skullZ = (p) => skullFrontZ(p.x, p.y);

test('the shirt front lies on the torso, a V from under the bow tie to the waist', () => {
  const torsoY = 0.75;
  const g = shirtFrontGeometry(torsoY);
  const ps = points(g);
  assert.ok(facesFront(g) > 0.95, 'faces the house');
  for (const p of ps) {
    const gap = torsoFrontZ(p.y - torsoY, p.x) - p.z;
    assert.ok(gap > 0 && gap <= SHIRT_FRONT.lift + 1e-6, `on the coat, not floating (${gap.toFixed(4)})`);
  }
  const width = (dy) => Math.max(...ps.filter(p => Math.abs(p.y - torsoY - dy) < 0.02).map(p => Math.abs(p.x)));
  assert.ok(width(SHIRT_FRONT.top) > 3 * width(SHIRT_FRONT.bottom + 0.01), 'wide at the collar, a point at the waist');
});

test('the shared skull is the one the characters are drawn with', () => {
  const ch = buildCharacter({ species: 'bear', name: '곰', fur: '#8a5a3c', outfit: 'tail' });
  // (the collision audit's head volume is taken from the rendered skull)
  assert.deepEqual(ch.headVolumes[0].radii.toArray().map(v => +v.toFixed(6)), HEAD.scale.map(s => +(s * HEAD.r).toFixed(6)));
});

test('face markings lie on the skull and face out of it', () => {
  for (const [name, marking] of Object.entries(FACE_MARKINGS)) {
    for (const side of [-1, 1]) {
      const g = skullPatchGeometry(marking, side);
      assert.ok(facesFront(g) > 0.95, `${name} faces out`);
      for (const p of points(g)) {
        const gap = skullZ(p) - p.z;
        assert.ok(gap > 0 && gap <= marking.lift + 1e-6, `${name} on the skull (${gap.toFixed(4)})`);
      }
    }
  }
});

// what a viewer straight in front of the face sees at (x, y) on the head
function firstHit(char, x, y) {
  char.root.updateMatrixWorld(true);
  const m = char.head.matrixWorld;
  const origin = new THREE.Vector3(x, y, -1).applyMatrix4(m);
  const target = new THREE.Vector3(x, y, 0).applyMatrix4(m);
  const ray = new THREE.Raycaster(origin, target.sub(origin).normalize());
  const hit = ray.intersectObject(char.head, true).find(h => h.object.visible && h.object.parent?.visible !== false);
  return hit && `#${hit.object.material.color.getHexString()}`;
}

test('the owl conductor shows its facial disc and pale eye rings', () => {
  const owl = buildCharacter({ ...CONDUCTOR, standing: true });
  const { owlDisc, owlRing } = FACE_MARKINGS;
  const ringEdge = owlRing.x + owlRing.rx * 0.85;
  assert.equal(firstHit(owl, ringEdge, owlRing.y), '#fff6dc', 'eye ring outside the eye');
  assert.equal(firstHit(owl, 0, owlDisc.y + owlDisc.ry * 0.85), '#f2e2c4', 'facial disc between the eyes');
  assert.equal(firstHit(owl, owlRing.x, owlRing.y), '#120c0a', 'the eye itself in front of its ring');
});

test("a panda's eye patches are seen round its eyes", () => {
  const panda = buildCharacter({ species: 'panda', name: '판다', fur: '#f4f1ea', outfit: 'tail' });
  const { pandaPatch: p } = FACE_MARKINGS;
  for (const side of [-1, 1]) {
    assert.equal(firstHit(panda, side * (p.x + p.rx * 0.6), p.y), '#1d1d1f', 'patch beside the eye');
    assert.equal(firstHit(panda, side * p.x, p.y + p.ry * 0.75), '#1d1d1f', 'patch above the eye');
  }
});

const ALL_SPECIES = ['bear', 'panda', 'rabbit', 'cat', 'fox', 'dog', 'raccoon', 'deer', 'sheep', 'mouse', 'squirrel', 'hedgehog', 'koala', 'lion', 'owl'];

test('every species projects nose, mouth, singing mouth, closed eyes and markings outside the skull/snout', () => {
  assert.ok(SNOUT.r > 0 && snoutFrontZ(0, -0.07, { snout: 0.55, pointy: true }) < skullFrontZ(0, -0.07), 'pointy snout protrudes ahead of skull');
  for (const species of ALL_SPECIES) {
    const ch = buildCharacter({ species, name: species, fur: '#9a7a5c', outfit: 'tail' });
    const mouthY = species === 'koala' ? -0.114 : -0.092;
    if (species !== 'owl') {
      const noseY = species === 'koala' ? -0.03 : -0.038;
      const noseHit = firstHit(ch, 0, noseY);
      assert.ok(noseHit && noseHit !== '#9a7a5c', `${species} nose visible outside snout (${noseHit})`);
      assert.notEqual(noseHit, firstHit(ch, 0.08, -0.075), `${species} nose distinct from muzzle fur`);
      assert.equal(firstHit(ch, 0, mouthY - 0.008), '#141012', `${species} closed smile visible outside snout`);
    }
    ch.mouthOpen.visible = true;
    ch.mouthOpen.scale.set(1.1, 0.85, 0.5);
    assert.equal(firstHit(ch, 0, mouthY), '#5a1d22', `${species} singing mouth visible outside snout`);
    ch.mouthOpen.visible = false;

    ch.eyes.open.visible = false;
    ch.eyes.closed.visible = true;
    const eyeX = species === 'owl' ? 0.1 : 0.095;
    const eyeR = species === 'owl' ? 0.055 : 0.036;
    for (const side of [-1, 1]) {
      assert.equal(firstHit(ch, side * eyeX, 0.02 + eyeR * 0.55), '#141012', `${species} closed eye arc visible`);
      assert.equal(firstHit(ch, side * FACE_MARKINGS.blush.x, FACE_MARKINGS.blush.y), '#ff9fae', `${species} blush visible`);
    }
    if (species === 'deer') {
      for (const [x, y] of [[0.115, 0.16], [-0.14, 0.145], [0.02, 0.205]]) {
        assert.equal(firstHit(ch, x, y), '#f6ead8', `deer forehead spot at (${x}, ${y})`);
      }
    }
  }
});

test('shared eye-highlight and blush materials merge per head, and hedgehog spines are deterministic', () => {
  const a = buildCharacter({ species: 'hedgehog', name: '밤송', fur: '#a5856a', outfit: 'tail' }, '#ebb682');
  const b = buildCharacter({ species: 'hedgehog', name: '밤송', fur: '#a5856a', outfit: 'tail' }, '#ebb682');
  assert.equal(a.ownedMaterials.size, 0, 'stage characters do not allocate per-instance eye/blush materials');
  const shineMeshes = a.eyes.open.children.filter((o) => o.isMesh && o.material === M.eyeShine());
  const blushMeshes = a.head.children.filter((o) => o.isMesh && o.material === M.blush());
  assert.equal(shineMeshes.length, 1, 'both eye highlights merged into one draw');
  assert.equal(blushMeshes.length, 1, 'both blushes merged into one draw');

  const headPositions = (ch) => ch.head.children.filter((o) => o.isMesh).flatMap((o) => [...o.geometry.getAttribute('position').array]);
  assert.deepEqual(headPositions(a), headPositions(b), 'hedgehog spine placement is deterministic for the same character');
});
