// Share only exactly equal vertex attributes. Unlike position-only welding,
// this keeps hard normals, UV seams and colours byte-for-byte unchanged.
import * as THREE from 'three';

export function indexGeometry(geometry) {
  if (geometry.index) return geometry;
  const entries = Object.entries(geometry.attributes);
  const count = geometry.attributes.position?.count ?? 0;
  // This utility is for the static BufferGeometry produced by our builders.
  if (!count || entries.some(([, a]) => a.isInterleavedBufferAttribute) || Object.keys(geometry.morphAttributes).length) return geometry;
  const unique = [];
  const indices = new Array(count);
  const vertices = new Map();
  for (let i = 0; i < count; i++) {
    let key = '';
    for (const [, a] of entries) {
      for (let k = 0; k < a.itemSize; k++) {
        const value = a.array[i * a.itemSize + k];
        key += `${Object.is(value, -0) ? '-0' : value},`;
      }
    }
    let index = vertices.get(key);
    if (index === undefined) {
      index = unique.length;
      vertices.set(key, index);
      unique.push(i);
    }
    indices[i] = index;
  }
  for (const [name, src] of entries) {
    const array = new src.array.constructor(unique.length * src.itemSize);
    unique.forEach((from, to) => {
      array.set(src.array.subarray(from * src.itemSize, (from + 1) * src.itemSize), to * src.itemSize);
    });
    const attribute = new THREE.BufferAttribute(array, src.itemSize, src.normalized);
    attribute.name = src.name;
    attribute.usage = src.usage;
    attribute.gpuType = src.gpuType;
    geometry.setAttribute(name, attribute);
  }
  geometry.setIndex(indices);
  return geometry;
}
