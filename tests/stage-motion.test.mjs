import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildOrchestra } from '../public/js/scene/orchestra.js';
import { StageManager } from '../public/js/scene/stage.js';
import { Performance } from '../public/js/audio/performance.js';
import { SERVICE_STEPS, stageFloorY } from '../public/js/scene/hallplan.js';
import { PODIUM } from '../public/js/layout.js';
import { motionCatalog, motionWindows } from '../tools/qa/motion-catalog.mjs';
import { MOTION_CASES } from '../tools/qa/motion-cases.mjs';

test('live venue registry automatically supplies score and every section entry to the audit',()=>{
 const catalog=motionCatalog();assert.ok(catalog.length>0);
 for(const {id,piece,venues} of catalog){
  assert.equal(id,piece.id);assert.ok(venues.length);const windows=motionWindows(piece);
  for(const tr of piece.tracks)if(tr.notes.length)assert.ok(windows.some(w=>Math.abs(w.start-Math.max(0,tr.notes[0]-.5))<.0001)||piece.tracks.some(other=>other.section===tr.section&&other.notes[0]<tr.notes[0]));
 }
});
test('video cases select a real part for the named performer and venue',()=>{
 const catalog=motionCatalog();
 for(const [name,spec] of Object.entries(MOTION_CASES)){
  const entry=catalog.find(item=>item.id===spec.song);
  assert.ok(entry?.venues.includes(spec.venue),`${name}: score/venue`);
  if(spec.sid==='conductor')continue;
  const notes=entry.piece.tracks.filter(tr=>tr.section===spec.sid&&(!tr.chairs||tr.chairs.includes(spec.ci||0))).flatMap(tr=>Array.from({length:tr.notes.length/4},(_,i)=>tr.notes[i*4]));
  assert.ok(notes.length,`${name}: empty part`);
  if(spec.start!==undefined)assert.ok(notes.some(on=>on>=spec.start&&on<spec.start+(spec.seconds||8)),`${name}: silent window`);
 }
});
test('service steps share their rendered height and navigation height',()=>{
 for(const s of SERVICE_STEPS){
  const r=(s.r0+s.r1)/2;
  const at=radius=>stageFloorY(PODIUM.x+radius*Math.sin(s.angle),PODIUM.z-radius*Math.cos(s.angle));
  assert.ok(Math.abs(at(r)-(1.1+s.h))<1e-9);
  assert.ok(Math.abs(at(s.r0-.01)-at(r))<.181);
  assert.ok(Math.abs(at(s.r1+.01)-at(r))<.181);
 }
});
test('every musician and conductor has a planned route; travel never reaches back to fixed furniture',t=>{
 const old=globalThis.document;
 const context=new Proxy({},{get:(_,k)=>k.startsWith('create')?()=>({addColorStop(){}}):()=>{}});
 globalThis.document={hidden:false,addEventListener(){},createElement:()=>({getContext:()=>context})};t.after(()=>{globalThis.document=old;});
 const orchestra=buildOrchestra(new THREE.Scene()),stage=new StageManager(orchestra),perf=new Performance({onTick(){},setTrim(){},stopAll(){}});
 for(const w of [...stage.walkers,stage.conductor])assert.ok(w.routeFound,`route: ${w.player?.sid||'conductor'}:${w.player?.ci||0}`);
 const pianist=orchestra.playerAt('piano',0);stage.snapOnstage();stage.sendOff([pianist.walker],0);
 for(let i=0;i<600;i++){
  stage.update(1/60);orchestra.update(i/60,1/60,perf,{running:false});
  for(const side of ['L','R'])assert.ok(pianist.char.arms[side].targetError<.03);
 }
 assert.ok(pianist.walker.state==='off');
 stage.snapRoster(new Set(['piano:0']));assert.equal(pianist.char.walking,false);
});
