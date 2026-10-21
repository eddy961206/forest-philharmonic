import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { indexGeometry } from '../public/js/scene/geometry.js';
import { bakeColor, mergeChildren } from '../public/js/scene/merge.js';

function expandedAttribute(geometry, name) {
  const attribute = geometry.attributes[name];
  const count = geometry.index?.count ?? attribute.count;
  const values = [];
  for (let i = 0; i < count; i++) {
    const vertex = geometry.index ? geometry.index.getX(i) : i;
    for (let k = 0; k < attribute.itemSize; k++) values.push(attribute.array[vertex * attribute.itemSize + k]);
  }
  return values;
}

test('indexing preserves every triangle attribute, hard normal and UV seam exactly', () => {
  const original = new THREE.BoxGeometry(1, 2, 3).toNonIndexed();
  const compact = indexGeometry(original.clone());
  assert.equal(compact.attributes.position.count, 24);
  assert.equal(compact.index.count, 36);
  for (const name of Object.keys(original.attributes)) {
    assert.deepEqual(expandedAttribute(compact, name), expandedAttribute(original, name));
  }

  // The same position/normal with a different UV or colour must remain separate.
  const seam = original.clone();
  seam.attributes.uv.setXY(3, 0.123, 0.456);
  const colors = new Float32Array(seam.attributes.position.count * 3).fill(1);
  colors[0] = 0.25;
  seam.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const indexedSeam = indexGeometry(seam.clone());
  for (const name of Object.keys(seam.attributes)) {
    assert.deepEqual(expandedAttribute(indexedSeam, name), expandedAttribute(seam, name));
  }
});

test('lite colour baking retains indexed geometry and leaves a shared source intact', () => {
  const source = new THREE.SphereGeometry(1, 12, 8);
  const before = source.attributes.position.array.slice();
  const material = new THREE.MeshStandardMaterial({ color: '#6e1822' });
  const mesh = new THREE.Mesh(source, material);
  bakeColor(mesh);
  assert.notEqual(mesh.geometry, source);
  assert.equal(mesh.geometry.index.count, source.index.count);
  assert.equal(mesh.geometry.attributes.position.count, source.attributes.position.count);
  assert.deepEqual(source.attributes.position.array, before);
  assert.equal(source.attributes.color, undefined);
  assert.equal(mesh.material.vertexColors, true);
  const expected = new Float32Array(material.color.toArray());
  assert.deepEqual(mesh.geometry.attributes.color.array.subarray(0, 3), expected);
});

test('rigid mesh merging preserves triangles and a kept animated descendant in world space', () => {
  const parent = new THREE.Group();
  parent.position.set(7, 2, 8);
  parent.rotation.y = 0.2;
  const material = new THREE.MeshStandardMaterial();
  const first = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), material);
  first.position.set(1, 2, 3);
  first.rotation.y = 0.3;
  const second = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material);
  second.position.set(4, 5, 6);
  const animated = new THREE.Group();
  animated.position.set(1, 4, 2);
  first.add(animated);
  parent.add(first, second);
  parent.updateMatrixWorld(true);
  const animatedWorld = animated.matrixWorld.clone();
  const inverse = parent.matrixWorld.clone().invert();
  const expected = [first, second].flatMap((mesh) => {
    const geometry = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    return expandedAttribute(geometry, 'position');
  });

  mergeChildren(parent, [animated]);
  parent.updateMatrixWorld(true);
  const merged = parent.children.filter((child) => child.isMesh);
  assert.equal(merged.length, 1);
  assert.ok(merged[0].geometry.index);
  assert.deepEqual(expandedAttribute(merged[0].geometry, 'position'), expected);
  assert.equal(animated.parent, parent);
  for (let i = 0; i < 16; i++) {
    assert.ok(Math.abs(animated.matrixWorld.elements[i] - animatedWorld.elements[i]) < 1e-9);
  }
});
