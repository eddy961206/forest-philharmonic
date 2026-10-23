// Two-bone arms in body-local coordinates. The bones never stretch to reach a
// bad instrument anchor: callers can inspect targetError and fix their pose.
import * as THREE from 'three';

export const ARM_LENGTH = 0.29;
export const ARM_LIMITS = Object.freeze({ minFlex: 10 * Math.PI / 180, maxFlex: 155 * Math.PI / 180 });
const direction = new THREE.Vector3(), bend = new THREE.Vector3();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function solveArm(arm, target, pole) {
  arm.target ??= new THREE.Vector3();
  arm.bendDirection ??= new THREE.Vector3();
  arm.target.copy(target);
  direction.subVectors(target, arm.shoulder);
  const requested = direction.length();
  // The target at the shoulder has no direction. Keep the previous direction
  // or use a downward rest direction on the first frame.
  if (requested > 1e-8 && Number.isFinite(requested)) direction.divideScalar(requested);
  else {
    direction.subVectors(arm.wrist, arm.shoulder);
    if (direction.lengthSq() < 1e-8 || !Number.isFinite(direction.lengthSq())) direction.set(0, -1, 0);
    direction.normalize();
  }
  const { a, b } = arm;
  const reach = flex => Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(flex));
  const distance = clamp(Number.isFinite(requested) ? requested : 0, reach(ARM_LIMITS.maxFlex), reach(ARM_LIMITS.minFlex));
  bend.copy(pole).addScaledVector(direction, -pole.dot(direction));
  if (bend.lengthSq() < 1e-6) {
    bend.copy(arm.bendDirection).addScaledVector(direction, -arm.bendDirection.dot(direction));
    if (bend.lengthSq() < 1e-6) {
      // Choose an axis that cannot be parallel to the reach direction.
      bend.set(Math.abs(direction.x) < .8 ? 1 : 0, Math.abs(direction.x) < .8 ? 0 : 1, 0);
      bend.addScaledVector(direction, -bend.dot(direction));
    }
  }
  bend.normalize();
  // A pole crossing the reach axis otherwise flips an elbow by 180 degrees.
  if (arm.bendDirection.lengthSq() && bend.dot(arm.bendDirection) < 0) bend.negate();
  arm.bendDirection.copy(bend);
  const along = (a * a + distance * distance - b * b) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  arm.elbow.copy(arm.shoulder).addScaledVector(direction, along).addScaledVector(bend, height);
  arm.wrist.copy(arm.shoulder).addScaledVector(direction, distance);
  arm.targetError = arm.wrist.distanceTo(target);
  arm.flex = Math.acos(clamp((distance * distance - a * a - b * b) / (2 * a * b), -1, 1));
  return arm;
}
