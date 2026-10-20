// Draw-call reduction: bake every rigid descendant mesh of `parent` into one
// mesh per (material, shadow) bucket, expressed in `parent`'s local space.
// Objects in `keep` (and their subtrees) are left untouched because code
// animates them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const inv = new THREE.Matrix4();
const rel = new THREE.Matrix4();

export function mergeChildren(parent, keep = []) {
  const keepSet = new Set(keep);
  parent.updateMatrixWorld(true);
  inv.copy(parent.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  const visit = (obj) => {
    for (const child of obj.children) {
      if (keepSet.has(child)) continue;
      if (child.isMesh && !child.isInstancedMesh && !child.isSkinnedMesh && child.visible && !Array.isArray(child.material)) {
        rel.multiplyMatrices(inv, child.matrixWorld);
        let g = child.geometry.clone();
        g.applyMatrix4(rel);
        if (g.index) g = g.toNonIndexed();
        for (const name of Object.keys(g.attributes)) {
          if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        }
        if (!g.attributes.uv) {
          g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        }
        if (!g.attributes.normal) g.computeVertexNormals();
        const key = `${child.material.uuid}|${child.castShadow ? 1 : 0}|${child.receiveShadow ? 1 : 0}|${child.renderOrder}`;
        if (!buckets.has(key)) buckets.set(key, { mat: child.material, cast: child.castShadow, recv: child.receiveShadow, order: child.renderOrder, geos: [] });
        buckets.get(key).geos.push(g);
        victims.push(child);
      }
      visit(child);
    }
  };
  visit(parent);
  if (victims.length < 2) return parent;
  // detach originals (keep any non-mesh descendants they might carry)
  for (const v of victims) {
    const kids = [...v.children];
    v.parent.remove(v);
    for (const k of kids) {
      k.applyMatrix4(v.matrix);
      if (v.parent) v.parent.add(k);
    }
  }
  // remove groups left empty
  const prune = (obj) => {
    for (const c of [...obj.children]) {
      prune(c);
      if (c.type === 'Group' && c.children.length === 0 && !keepSet.has(c)) obj.remove(c);
    }
  };
  prune(parent);
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!geo) continue;
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    m.renderOrder = b.order;
    parent.add(m);
  }
  return parent;
}
