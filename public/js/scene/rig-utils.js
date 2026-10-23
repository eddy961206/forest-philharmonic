import * as THREE from 'three';
const tmpM = new THREE.Matrix4();

export function basis(yDir, zHint) {
  const Y = yDir.clone().normalize();
  const Z = zHint.clone().addScaledVector(Y, -zHint.dot(Y)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(tmpM.makeBasis(X, Y, Z));
}

export function placeBy(obj, quat, anchorLocal, targetPos) {
  obj.quaternion.copy(quat);
  obj.position.copy(targetPos).sub(anchorLocal.clone().multiply(obj.scale).applyQuaternion(quat));
}

export const toParent = (obj, v) => v.clone().multiply(obj.scale).applyQuaternion(obj.quaternion).add(obj.position);
export const smooth = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
export const easeOut = (x) => 1 - (1 - x) * (1 - x);

