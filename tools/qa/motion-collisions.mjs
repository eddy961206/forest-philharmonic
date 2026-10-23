// Shaft/head regression guard. This does not replace a rendered-video review.
import * as THREE from 'three';
const start = new THREE.Vector3(), delta = new THREE.Vector3(), radii = new THREE.Vector3();
const inverseHead = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3();

// Distance in ellipsoid radii: < 1 means the segment enters the volume.
export function segmentEllipsoidDistance(from, to, volume, padding = 0) {
  radii.copy(volume.radii).addScalar(padding);
  start.copy(from).sub(volume.center).divide(radii);
  delta.copy(to).sub(volume.center).divide(radii).sub(start);
  const length2 = delta.lengthSq();
  const t = length2 > 1e-12 ? THREE.MathUtils.clamp(-start.dot(delta) / length2, 0, 1) : 0;
  return start.addScaledVector(delta, t).length();
}

export function beaterHeadClearance(player) {
  if (!player.mallets?.length || !player.char.headVolumes) return Infinity;
  player.char.head.updateMatrix();
  inverseHead.copy(player.char.head.matrix).invert();
  let minimum = Infinity;
  for (const mallet of player.mallets) {
    if (!mallet) continue;
    a.copy(mallet.group.position).applyMatrix4(inverseHead);
    b.copy(mallet.tip).applyQuaternion(mallet.group.quaternion).add(mallet.group.position).applyMatrix4(inverseHead);
    for (const volume of player.char.headVolumes) {
      minimum = Math.min(minimum, segmentEllipsoidDistance(a, b, volume, .006));
    }
  }
  return minimum;
}
