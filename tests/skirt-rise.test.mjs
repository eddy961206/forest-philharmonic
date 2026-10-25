import assert from 'node:assert/strict';import test from 'node:test';import * as THREE from 'three';
import {StageManager} from '../public/js/scene/stage.js';
const character=()=>({root:new THREE.Group(),scale:1,spec:{outfit:'dress'},walk(){},setStanding(t){this.stand=t}});
function setup(){const players=[false,true].map((fixedInstrument,i)=>({sid:'vn1',ci:i,home:new THREE.Vector3(i*4-2,0,-2),yaw:.5,fixedInstrument,char:character()}));return new StageManager({players,obstacles:[],conductor:{home:new THREE.Vector3(0,0,-2.4),char:character()}})}
test('dress rise clears chair while preserving home, fixed instruments, skips and travel',()=>{
 const s=setup(),w=s.walkers[0],fixed=s.walkers[1],home=w.home.clone();
 for(let round=0;round<3;round++){
  s.orchestraRise(true);for(let i=0;i<180;i++)s.update(1/60);
  assert.deepEqual(w.home.toArray(),home.toArray());assert.ok(w.pos.distanceTo(home)>.53);assert.ok(fixed.pos.distanceTo(fixed.home)<1e-9);
  s.orchestraRise(false);for(let i=0;i<180;i++)s.update(1/60);
  assert.ok(w.pos.distanceTo(home)<1e-9);
 }
 s.setSkipTransitions(true);s.clearStage();s.callOn([w],0,{stand:true});assert.ok(w.pos.distanceTo(home)>.53);
 s.setSkipTransitions(false);s.sendOff([w],0);for(let i=0;i<60;i++)s.update(1/60);s.setSkipTransitions(true);assert.equal(w.state,'off');
 s.setSkipTransitions(false);s.callOn([w],0,{stand:true});for(let i=0;i<10;i++)s.update(1/60);s.setSkipTransitions(true);assert.ok(w.pos.distanceTo(home)>.53);
 s.snapRoster(new Set(['vn1:0']));assert.ok(w.pos.distanceTo(home)<1e-9);
});

test('actual dressed CAST rise path stays on its floor and clear of chair, desk geometry and colleagues',async t=>{
 const old=globalThis.document,context=new Proxy({},{get:(_,k)=>k.startsWith('create')?()=>({addColorStop(){}}):()=>{}});
 globalThis.document={hidden:false,addEventListener(){},createElement:()=>({getContext:()=>context})};t.after(()=>globalThis.document=old);
 const {buildOrchestra,musicStandOffset}=await import('../public/js/scene/orchestra.js');
 const {standParts}=await import('../public/js/scene/instruments.js');
 const {floorAt,stageFloorY}=await import('../public/js/scene/hallplan.js');
 const orch=buildOrchestra(new THREE.Scene()),s=new StageManager(orch),up=new THREE.Vector3(0,1,0);
 // Match orchestra's actual furniture contract, including handheld percussion
 // which has a seat but no music stand.
 const withoutDesk=new Set(['piano','harp','timpani','tambourine','tom','snare','bassDrum','cymbals','triangle','celesta','organ','mallet','bells','choir']);
 const vertices=orch.players.filter(p=>!withoutDesk.has(p.rigKind)).flatMap(p=>{
  const o=musicStandOffset(p.rigKind),pos=new THREE.Vector3(o.x,0,o.z).applyAxisAngle(up,p.yaw).add(p.home),y=stageFloorY(pos.x,pos.z);pos.y=y;
  const a=standParts(.86+p.home.y-y).metal.attributes.position;
  return Array.from({length:a.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(a,i).applyAxisAngle(up,p.yaw).add(pos));
 });
 for(const w of s.walkers.filter(w=>w.riseDistance)){
  const p=w.player,q=w.home.clone().add(w.riseOffset),label=`${p.sid}:${p.ci}`;
  for(let i=0;i<=20;i++){
   const v=w.home.clone().lerp(q,i/20);assert.ok(Math.abs(floorAt(v.x,v.z)-w.home.y)<1e-6,`${label} floor`);
  }
  const local=w.riseOffset.clone().applyAxisAngle(up,-w.homeYaw);
  assert.ok(Math.hypot(Math.max(0,Math.abs(local.x)-.22),Math.max(0,Math.abs(local.z)-.21))>.30,`${label} chair seat clearance`);
  for(const v of vertices){const y=v.y-q.y;if(y<.22||y>1.12)continue;assert.ok(Math.hypot(v.x-q.x,v.z-q.z)>(y<.72?.30:.22)+.03,`${label} desk geometry`)}
  for(const other of s.walkers.filter(o=>o!==w)){
   for(const target of [other.home,other.home.clone().add(other.riseOffset)])assert.ok(Math.hypot(q.x-target.x,q.z-target.z)>.65,`${label} colleague`);
  }
 }
});
