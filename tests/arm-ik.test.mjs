import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { solveArm, ARM_LENGTH, ARM_LIMITS } from '../public/js/scene/arm-ik.js';
const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const fixture = () => ({shoulder:V(.2,.92,-.01),elbow:V(),wrist:V(),a:ARM_LENGTH,b:ARM_LENGTH});
function valid(a) {
  assert.ok([...a.elbow.toArray(),...a.wrist.toArray(),a.flex].every(Number.isFinite));
  assert.ok(Math.abs(a.elbow.distanceTo(a.shoulder)-a.a)<1e-10);
  assert.ok(Math.abs(a.elbow.distanceTo(a.wrist)-a.b)<1e-10);
  assert.ok(a.flex>=ARM_LIMITS.minFlex-1e-10 && a.flex<=ARM_LIMITS.maxFlex+1e-10);
}
test('fixed-length arms preserve bone lengths and flex limits for a full target sweep',()=>{
 const a=fixture();
 for(let i=0;i<5000;i++){
  solveArm(a,V(Math.sin(i*.17),.92+Math.cos(i*.07),Math.sin(i*.09)),V(.7,-.6,.3));valid(a);
 }
});
test('zero distance and parallel poles cannot collapse or invert the elbow',()=>{
 const a=fixture();
 for(const target of [a.shoulder.clone(),V(.2,.52,-.01),V(.2,1.32,-.01),V(.2,.92,-.41)]){
  for(const pole of [V(),target.clone().sub(a.shoulder),V(0,-1,0)]){solveArm(a,target,pole);valid(a);}
 }
});
test('an elbow remains continuous when its pole crosses the reach axis',()=>{
 const a=fixture(),target=V(.2,.52,-.01);let previous;
 for(let i=-100;i<=100;i++){
  solveArm(a,target,V(i*.0001,-1,0));valid(a);
  if(previous)assert.ok(a.elbow.distanceTo(previous)<.001);
  previous=a.elbow.clone();
 }
});
test('unreachable targets report the contact error instead of stretching bones',()=>{
 const a=fixture();solveArm(a,V(3,.7,-1),V(.7,-.6,.3));valid(a);assert.ok(a.targetError>2);
});
