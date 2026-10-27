import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildCharacter } from '../public/js/scene/characters.js';
import { CONDUCTOR } from '../public/js/layout.js';

test('tailcoat attaches inside the rear waist and hems fall down/rearward through bowing and walking', () => {
  for (const standing of [true, false]) {
    const ch = buildCharacter({ ...CONDUCTOR, standing });
    const { seam: top, hem } = ch.coatTailGeometry;
    assert.equal(ch.body.getObjectByName('coat-tails'), undefined, 'rigid cloth merged into body');
    assert.ok(top.length && hem.length);
    assert.ok(top.some(p => p.x < 0) && top.some(p => p.x > 0));
    const baked = ch.body.children.filter(o => o.isMesh && o !== ch.torso).flatMap(mesh => {
      const a = mesh.geometry.getAttribute('position');
      return Array.from({ length: a.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(a, i));
    });
    assert.ok([...top, ...hem].every(p => baked.some(v => v.distanceTo(p) < 1e-6)), 'contract vertices exist in rendered body geometry');
    for (const bow of [0, .3, .55]) for (const stand of [0, .5, 1]) {
      ch.setStanding(stand); ch.walk(.7, .35); ch.body.rotation.x = -bow;
      ch.root.rotation.y = 1.2; ch.root.position.set(2, 1.32, -2.35); ch.root.updateMatrixWorld(true);
      const inTorso = p => ch.torso.worldToLocal(ch.body.localToWorld(p.clone()));
      for (const p of top) {
        const t = inTorso(p);
        // Torso capsule: radius .19, straight centre segment y[-.1,.1].
        const outsideSegment = Math.max(0, Math.abs(t.y) - .1);
        assert.ok(t.z > 0, 'seam is behind the torso');
        assert.ok(t.x*t.x + t.z*t.z + outsideSegment*outsideSegment < .19*.19, 'seam stays embedded in coat');
      }
      assert.ok(Math.max(...hem.map(p => p.y)) < Math.min(...top.map(p => p.y)), 'hem below seam');
      assert.ok(Math.min(...hem.map(p => p.z)) > Math.max(...top.map(p => p.z)), 'hem slopes rearward, not forward');
    }
  }
});
