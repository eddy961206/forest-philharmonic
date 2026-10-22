import test from 'node:test';
import assert from 'node:assert/strict';
import { layerDirection, smoothPhrase, NIGHT_LAYER_RADII } from '../public/js/scene/dome-depth.js';
import { buildDome } from '../public/js/scene/domeshow.js';
const angle = d => Math.atan2(d.x, -d.z);
test('finite scenery keeps center rays and near layers show stronger parallax', () => {
 const d={x:0,y:0,z:-1};
 for(const r of NIGHT_LAYER_RADII) assert.deepEqual(layerDirection(d,{x:0,y:0,z:0},r),d);
 const offsets=NIGHT_LAYER_RADII.map(r=>Math.abs(angle(layerDirection(d,{x:20,y:0,z:0},r))));
 assert.ok(offsets[0]<offsets[1] && offsets[1]<offsets[2]);
 assert.ok(Math.abs(offsets[2]-Math.asin(20/160))<1e-12);
});
test('a fixed world landmark stays fixed when the observer moves',()=>{
 const radius=160, landmark={x:40,y:25,z:-Math.sqrt(radius**2-40**2)};
 const normalize=p=>{const n=Math.hypot(p.x,p.y,p.z);return {x:p.x/n,y:p.y/n,z:p.z/n};};
 const expected=normalize(landmark);
 for(const origin of [{x:0,y:0,z:0},{x:32,y:24,z:42},{x:-32,y:10,z:-20}]){
  const d=normalize({x:landmark.x-origin.x,y:landmark.y-origin.y,z:landmark.z-origin.z});
  const actual=layerDirection(d,origin,radius);
  for(const key of ['x','y','z'])assert.ok(Math.abs(actual[key]-expected[key])<1e-12);
 }
});
test('zenith/nadir and all approved layer radii stay finite across the audience',()=>{
 for(const radius of [100,130,160,220,240,400,500,1000]) for(const x of [-40,0,40]) for(const y of [-10,0,30]) for(const d of [{x:0,y:1,z:0},{x:0,y:-1,z:0},{x:1,y:0,z:0},{x:0,y:0,z:-1}]){
  const result=layerDirection(d,{x,y,z:40},radius);
  assert.ok(Object.values(result).every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...Object.values(result))-1)<1e-12);
 }
});
test('musical phrase envelope is bounded and independent of frame rate',()=>{
 let a=0,b=0;
 for(let i=0;i<60;i++) a=smoothPhrase(a,1,1/60);
 for(let i=0;i<30;i++) b=smoothPhrase(b,1,1/30);
 assert.ok(Math.abs(a-b)<1e-12);
 assert.ok(a>0 && a<0.5);
 assert.equal(smoothPhrase(a,1,-1),a);
 assert.ok(smoothPhrase(a,NaN,1)<a);
});
test('phrase light stops following audio on pause and survives crossfade/projection changes',()=>{
 const dome=buildDome({lite:true,projection:'immersive'});
 dome.update(1,{level:1,playing:true}); const before=dome.uniforms.uPhrase.value;
 dome.go('MOON',{dur:1}); dome.setProjection('venue');
 assert.equal(dome.uniforms.uPhrase.value,before);
 dome.update(.1,{level:1,playing:false});
 assert.ok(dome.uniforms.uPhrase.value<before);
 assert.equal(dome.mesh.children[0].material.uniforms.uPhrase,dome.uniforms.uPhrase);
});
