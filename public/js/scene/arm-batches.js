// Full-quality arms share draws, not simplified geometry or materials.
// The original meshes remain in the character hierarchy for IK and picking.
import * as THREE from 'three';

export function batchCharacterArms(parent, characters) {
  const buckets = new Map();
  for (const char of characters) {
    for (const arm of Object.values(char.arms)) {
      for (const part of ['upper', 'fore', 'cuff', 'paw']) {
        const source = arm[part];
        if (!source?.isMesh || !source.visible) continue;
        const g = source.geometry, m = source.material;
        // These are unmodified primitive geometries from buildCharacter.
        const key = JSON.stringify([g.type, g.parameters, m.uuid,
          source.castShadow, source.receiveShadow, source.renderOrder]);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(source);
      }
    }
  }
  const batches = [];
  for (const sources of buckets.values()) {
    if (sources.length < 2) continue;
    const first = sources[0];
    const mesh = new THREE.InstancedMesh(first.geometry, first.material, sources.length);
    mesh.name = 'musician-arms';
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Both the viewer and broadcast camera, plus the shadow camera, use it.
    // Individual hidden musicians are removed in update(), independent of view.
    mesh.frustumCulled = false;
    mesh.count = 0;
    parent.add(mesh);
    for (const source of sources) source.visible = false;
    batches.push({ mesh, sources });
  }
  const inverse = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  const shown = object => {
    for (; object; object = object.parent) if (!object.visible) return false;
    return true;
  };
  return {
    batches,
    // Call after character world matrices have been updated for this frame.
    update() {
      parent.updateWorldMatrix(true, false);
      inverse.copy(parent.matrixWorld).invert();
      for (const { mesh, sources } of batches) {
        let count = 0;
        for (const source of sources) {
          if (!shown(source.parent)) continue;
          matrix.multiplyMatrices(inverse, source.matrixWorld);
          mesh.setMatrixAt(count++, matrix);
        }
        mesh.count = count;
        mesh.visible = count > 0;
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      for (const { mesh, sources } of batches) {
        for (const source of sources) source.visible = true;
        mesh.removeFromParent();
        mesh.dispose(); // source geometry/material are still owned by characters
      }
    },
  };
}
