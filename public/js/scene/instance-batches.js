import * as THREE from 'three';

// Static seat batches use the same local coordinate system as `pick`.
// Reuse their instance matrices for broad-phase raycasting while preserving
// the single pick mesh and global seat IDs expected by the UI and room state.
// No proxy is added to the scene or given its own matrix buffer.
export function accelerateInstancePicking(pick, batches) {
  const proxies = batches.map(({ mesh, indices }) => {
    const proxy = new THREE.InstancedMesh(pick.geometry, pick.material, 0);
    proxy.instanceMatrix = mesh.instanceMatrix;
    proxy.count = indices.length;
    proxy.computeBoundingSphere();
    return { proxy, indices };
  });
  pick.raycast = function raycast(raycaster, intersections) {
    for (const { proxy, indices } of proxies) {
      proxy.matrixWorld.copy(this.matrixWorld);
      const start = intersections.length;
      proxy.raycast(raycaster, intersections);
      for (let i = start; i < intersections.length; i++) {
        const hit = intersections[i];
        hit.instanceId = indices[hit.instanceId];
        hit.object = this;
      }
    }
  };
  return pick;
}
