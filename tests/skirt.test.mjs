import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildCharacter} from '../public/js/scene/characters.js';
import {CAST} from '../public/js/layout.js';

test('seated drape encloses upper legs without hiding them; upright morph preserves waist',()=>{
 const specs=Object.values(CAST).flat().filter(s=>s.outfit==='dress');
 specs.push({...specs[0],celloSeat:true});
 for(const spec of specs){
  const c=buildCharacter(spec);c.root.scale.setScalar(1);c.root.updateMatrixWorld(true);
  const skirt=c.skirt;assert.equal(skirt.parent,c.body);assert.equal(skirt.geometry.attributes.position.count,100);
  const legs=c.root.children.find(o=>o!==c.body&&o.visible&&o.children.some(x=>x.isMesh));
  assert.ok(legs?.visible,'seated legs remain rendered');
  let checked=0;
  for(const mesh of legs.children.filter(x=>x.isMesh)){
   const a=mesh.geometry.attributes.position;
   for(let i=0;i<a.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(a,i);
    if(v.y<.26||v.y>.625)continue;
    for(const d of [new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)]){
     const hits=new THREE.Raycaster(v,d,.00001,2).intersectObject(skirt);
     assert.ok(hits.length,`${spec.species} cello=${!!spec.celloSeat} leg point ${v.toArray()} escapes drape`);
    }checked++;
   }
  }assert.ok(checked>20);
  for(const t of [0,.25,.5,.75,1]){c.setStanding(t);assert.equal(skirt.morphTargetInfluences[0],Math.max(0,(t-.5)*2));}
  const base=skirt.geometry.attributes.position, target=skirt.geometry.morphAttributes.position[0];
  for(let i=0;i<25;i++)for(let j=0;j<3;j++)assert.equal(base.array[i*3+j],target.array[i*3+j]);
  c.walk(.8,.35);assert.ok(c.legPivots.every(p=>p.visible));
 }
});
