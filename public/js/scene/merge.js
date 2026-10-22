// Draw-call reduction: bake every rigid descendant mesh of `parent` into one
// mesh per (material, shadow) bucket, expressed in `parent`'s local space.
// Objects in `keep` (and their subtrees) are left untouched because code
// animates them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isLite } from './materials.js';

// Phones: opaque parts are recoloured into a few shared vertex-coloured
// materials, so a whole animal or instrument bakes into one or two meshes.
const LITE_MAT = new Map();
export function liteMaterial(src) {
  const metal = (src.metalness ?? 0) > 0.5;
  const key = `${src.side}|${metal}`;
  if (!LITE_MAT.has(key)) {
    LITE_MAT.set(key, new THREE.MeshStandardMaterial({ vertexColors: true, side: src.side, roughness: metal ? 0.35 : 0.75, metalness: metal ? 0.8 : 0 }));
  }
  return LITE_MAT.get(key);
}
const avgCache = new WeakMap();
function textureTint(tex) {
  const img = tex?.image;
  if (!img || !img.width) return null;
  if (!avgCache.has(img)) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 8, 8);
    const d = x.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    avgCache.set(img, new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace));
  }
  return avgCache.get(img);
}
// bake a mesh's colour into its geometry and give it the shared material
export function bakeColor(mesh) {
  const m = mesh.material;
  if (m.vertexColors || m.transparent) return;
  const col = m.color.clone();
  const tint = textureTint(m.map);
  if (tint) col.multiply(tint);
  const g = mesh.geometry.clone();
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  mesh.geometry = g;
  mesh.material = liteMaterial(m);
}

const inv = new THREE.Matrix4();
const rel = new THREE.Matrix4();

export function mergeChildren(parent, keep = []) {
  const keepSet = new Set(keep);
  const lite = isLite();
  parent.updateMatrixWorld(true);
  inv.copy(parent.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  const visit = (obj) => {
    for (const child of obj.children) {
      if (keepSet.has(child)) continue;
      if (child.isMesh && !child.isInstancedMesh && !child.isSkinnedMesh && child.visible && !Array.isArray(child.material)) {
        if (lite) bakeColor(child);
        rel.multiplyMatrices(inv, child.matrixWorld);
        let g = child.geometry.clone();
        g.applyMatrix4(rel);
        if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
        for (const name of Object.keys(g.attributes)) {
          if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
        }
        if (!g.attributes.uv) {
          g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        }
        if (!g.attributes.normal) g.computeVertexNormals();
        // (no shadows on phones, so the shadow flags don't split buckets there)
        const key = lite ? `${child.material.uuid}|${child.renderOrder}` : `${child.material.uuid}|${child.castShadow ? 1 : 0}|${child.receiveShadow ? 1 : 0}|${child.renderOrder}`;
        if (!buckets.has(key)) buckets.set(key, { mat: child.material, cast: child.castShadow, recv: child.receiveShadow, order: child.renderOrder, geos: [] });
        buckets.get(key).geos.push(g);
        victims.push(child);
      }
      visit(child);
    }
  };
  visit(parent);
  if (victims.length < 2) {
    for (const b of buckets.values()) for (const g of b.geos) g.dispose();
    return parent;
  }
  // detach originals (keep any non-mesh descendants they might carry)
  for (const v of victims) {
    // Preserve kept descendants in world space before detaching their mesh
    // parent. remove() clears v.parent, so reattaching afterwards lost them.
    for (const k of [...v.children]) parent.attach(k);
    v.removeFromParent();
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
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
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
