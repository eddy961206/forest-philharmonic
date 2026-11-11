// Geometry/pose audit. Complement this with actual rendered video: numerical
// contacts cannot certify silhouette, occlusion, collisions or artistic quality.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { buildOrchestra } from '../../public/js/scene/orchestra.js';
import { StageManager } from '../../public/js/scene/stage.js';
import { buildRecital } from '../../public/js/scene/recital.js';
import { Practice } from '../../public/js/scene/lobby.js';
import { BREMEN_BEAT, BREMEN_DURATION, BREMEN_PLAYERS, bremenScore, createBremenTrail } from '../../public/js/bremen-score.js';
import { Performance } from '../../public/js/audio/performance.js';
import { ARM_LIMITS } from '../../public/js/scene/arm-ik.js';
import { floorAt } from '../../public/js/scene/hallplan.js';
import { motionSource } from './motion-source.mjs';
import { motionCatalog, motionWindows } from './motion-catalog.mjs';
import { beaterHeadClearance } from './motion-collisions.mjs';
import { motionCoverage } from './motion-contracts.mjs';

const context = new Proxy({}, { get: (_, k) => k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {} });
globalThis.document = { hidden: false, addEventListener() {}, createElement: () => ({ getContext: () => context }) };
let seed = 2326;
Math.random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const scene = new THREE.Scene();
const orchestra = buildOrchestra(scene);
const recital = buildRecital(scene, orchestra, []);
const perf = new Performance({ onTick() {}, setTrim() {}, stopAll() {} });
const catalog = motionCatalog(), rows = [], rigs = {};
const coverage = motionCoverage(catalog, orchestra.players);
const all = [...orchestra.players, { ...orchestra.conductor, rigKind: 'conductor', sid: 'conductor', ci: 0 }];
const previous = new Map();
const limits = { contactError: .03, boneError: 1e-8, continuousStep: .15 };
const fresh = (id, extra={}) => ({ id, ...extra, frames: 0, armSamples: 0, nonFinite: 0, maxContactError: 0, maxBoneError: 0, maxStep: 0, maxHandleGap: 0, minBeaterHeadClearance: Infinity, minFlex: Infinity, maxFlex: 0, failures: [] });
let windowStart=0,phase='playing';
function fail(row, kind, detail) {
  const previous=row.failures.find(f=>f.kind===kind&&f.sid===detail.sid&&f.ci===detail.ci&&f.side===detail.side&&f.phase===phase);
  if(previous){previous.occurrences++;previous.lastTime=detail.time;return;}
  row.failures.push({kind,...detail,windowStart,phase,occurrences:1});
}
function inspect(row, time, eligible, measureStep) {
  row.frames++;
  for (const p of all) {
    if (!eligible(p)) {
      // Reappearing after a long offstage gap is not a consecutive frame.
      for (const side of Object.keys(p.char.arms)) previous.delete(`${p.sid}:${p.ci}:${side}`);
      continue;
    }
    const rig = rigs[p.rigKind] ??= fresh(p.rigKind);
    for (const [side, a] of Object.entries(p.char.arms)) {
      const key = `${p.sid}:${p.ci}:${side}`;
      const boneError = Math.max(Math.abs(a.elbow.distanceTo(a.shoulder)-a.a), Math.abs(a.wrist.distanceTo(a.elbow)-a.b));
      const prev = previous.get(key), step = prev && measureStep ? a.wrist.distanceTo(prev) : 0;
      previous.set(key, a.wrist.clone());
      const finite = [...a.wrist.toArray(), ...a.elbow.toArray(), a.flex, a.targetError].every(Number.isFinite);
      for (const r of [row,rig]) {
        r.armSamples++; if (!finite) r.nonFinite++;
        r.maxBoneError = Math.max(r.maxBoneError,boneError); r.maxContactError = Math.max(r.maxContactError,a.targetError);
        r.minFlex = Math.min(r.minFlex,a.flex); r.maxFlex = Math.max(r.maxFlex,a.flex); r.maxStep = Math.max(r.maxStep,step);
      }
      const detail = { time, sid:p.sid, ci:p.ci, side };
      if (!finite) fail(row,'non-finite',detail);
      if (boneError>limits.boneError) fail(row,'bone-length',{...detail,boneError});
      if (a.flex<ARM_LIMITS.minFlex-1e-7 || a.flex>ARM_LIMITS.maxFlex+1e-7) fail(row,'elbow-limit',{...detail,flex:a.flex});
      if (a.targetError>limits.contactError) fail(row,'unreachable-contact',{...detail,error:a.targetError});
      if (step>limits.continuousStep) fail(row,'pose-jump',{...detail,step});
    }
    for (let k=0;k<(p.mallets?.length||0);k++) {
      const m=p.mallets[k]; if (!m) continue;
      const gap=p.char.arms[k?'R':'L'].wrist.distanceTo(m.group.position);
      if(!Number.isFinite(gap))fail(row,'non-finite-beater',{time,sid:p.sid,ci:p.ci});
      row.maxHandleGap=Math.max(row.maxHandleGap,gap);
      if(gap>.001)fail(row,'beater-detached',{time,sid:p.sid,ci:p.ci,gap});
    }
    const clearance=beaterHeadClearance(p);
    if(p.mallets?.some(Boolean)&&!Number.isFinite(clearance))fail(row,'non-finite-beater',{time,sid:p.sid,ci:p.ci});
    row.minBeaterHeadClearance=Math.min(row.minBeaterHeadClearance,clearance);
    rig.minBeaterHeadClearance=Math.min(rig.minBeaterHeadClearance,clearance);
    if(clearance<1)fail(row,'beater-head-intersection',{time,sid:p.sid,ci:p.ci,clearance});
  }
}
for (const entry of catalog) {
  const {piece}=entry; perf.use(perf.prepare(piece));
  const isRecital = perf.playingSections.size === 1 && perf.playingSections.has('piano');
  recital.open(isRecital, isRecital ? piece : null);
  const row=fresh(entry.id,{venues:entry.venues,sections:[...perf.playingSections],windows:motionWindows(piece)});
  const expected=orchestra.players.filter(p=>piece.tracks.some(tr=>tr.section===p.sid&&tr.notes.length&&(!tr.chairs||tr.chairs.includes(p.ci))));
  const observed=new Set();
  for (const {start} of row.windows) {
    windowStart=start;phase='playing';
    perf._resetVisual(start); previous.clear();
    if (isRecital) recital.open(true, piece);
    for(let frame=0;frame<120;frame++) {
      const time=Math.min(piece.duration-.001,start+frame/60);
      const recitalNod = isRecital ? recital.update(1/60, time, true) : 0;
      perf.updateVisual(time); orchestra.update(time,1/60,perf,{running:true,recitalNod});
      for(const p of expected)if(perf.chairs[p.sid]?.[p.ci]?.playing)observed.add(`${p.sid}:${p.ci}`);
      inspect(row,time,p=>p.sid==='conductor'||perf.playingSections.has(p.sid),frame>0);
    }
    // Pause keeps score time fixed while arms lower; backward seek resets the
    // visual cursors, exactly as the playback UI does.
    phase='pause';for(let frame=0;frame<30;frame++) {
      const recitalNod = isRecital ? recital.update(1/60, start+119/60, false) : 0;
      orchestra.update(start+119/60,1/60,perf,{running:false,recitalNod});
      inspect(row,start+119/60,p=>p.sid==='conductor'||perf.playingSections.has(p.sid),true);
    }
  }
  if (isRecital) recital.open(false);
  for(const p of expected)if(!observed.has(`${p.sid}:${p.ci}`))fail(row,'unobserved-playing-chair',{sid:p.sid,ci:p.ci});
  row.observedPlayingChairs=[...observed];rows.push(row);
}

// Seat-local chair/stool clearance for standing legs and garments during curtain-call rise/bow.
const upAxis = new THREE.Vector3(0, 1, 0);
const tmpWorld = new THREE.Vector3();
function standingChairClearance(p) {
  p.char.root.updateMatrixWorld(true);
  const toSeat = (worldPt) => worldPt.sub(p.home).applyAxisAngle(upAxis, -p.yaw);
  const halfX = p.rigKind === 'bass' ? 0.20 : 0.22;
  const halfZ = p.rigKind === 'bass' ? 0.20 : 0.21;
  const boxDist = (pt, radius) => Math.hypot(Math.max(0, Math.abs(pt.x) - halfX), Math.max(0, Math.abs(pt.z) - halfZ)) - radius;
  let minClear = Infinity;
  const scale = p.char.scale ?? 1;
  for (const pivot of p.char.legPivots) {
    pivot.getWorldPosition(tmpWorld);
    minClear = Math.min(minClear, boxDist(toSeat(tmpWorld), 0.085 * scale));
  }
  if (p.char.coatTailGeometry) {
    for (const v of p.char.coatTailGeometry.hem) {
      tmpWorld.copy(v);
      p.char.body.localToWorld(tmpWorld);
      minClear = Math.min(minClear, boxDist(toSeat(tmpWorld), 0.015 * scale));
    }
  } else if (p.char.skirt) {
    p.char.body.getWorldPosition(tmpWorld);
    minClear = Math.min(minClear, boxDist(toSeat(tmpWorld), 0.26 * scale));
  }
  return minClear;
}

// Full roster lifecycle, including existing instruments and every cast member.
phase='route';windowStart=0;
const stage=new StageManager(orchestra), lifecycle=fresh('stage-lifecycle',{states:{},maxWalkingRootFloorGap:0,minStandingChairClearance:Infinity,maxRecitalNod:0,intervalPracticeFrames:0,bremenFrames:0});
for (const w of [...stage.walkers,stage.conductor]) if (!w.routeFound) fail(lifecycle,'missing-stage-route',{sid:w.player?.sid || 'conductor',ci:w.player?.ci});
stage.snapOnstage();
const phases=[['rise',2,()=>stage.orchestraRise(true)],['bow',2,()=>{stage.orchestraBow(true);stage.conductorBow(true);}],['recover',2,()=>{stage.orchestraBow(false);stage.conductorBow(false);stage.orchestraRise(false);}],['exit',65,()=>{stage.exitAll();stage.conductorExit();}],['enter',85,()=>{stage.enterAll();stage.conductorEnter();}]];
previous.clear();let t=0;
for(const [stagePhase,duration,begin] of phases){
 phase=stagePhase;begin();
 for(let frame=0;frame<duration*60;frame++){
  t+=1/60;stage.update(1/60);orchestra.update(t,1/60,perf,{running:false});
  inspect(lifecycle,t,p=>p.char.root.visible,frame>0);
  if(stagePhase==='rise'||stagePhase==='bow'||stagePhase==='recover'){
   for(const w of stage.walkers){
    const p=w.player;
    if(w.standingRole||p.fixedInstrument||!(p.char.stand>0.5))continue;
    const clearance=standingChairClearance(p);
    lifecycle.minStandingChairClearance=Math.min(lifecycle.minStandingChairClearance,clearance);
    if(clearance<=0)fail(lifecycle,'chair-standing-intersection',{time:t,sid:p.sid,ci:p.ci,outfit:p.char.spec.outfit,clearance});
   }
  }
  for(const w of [...stage.walkers,stage.conductor]){
   lifecycle.states[w.state]=(lifecycle.states[w.state]||0)+1;
   if(w.state==='walking')lifecycle.maxWalkingRootFloorGap=Math.max(lifecycle.maxWalkingRootFloorGap,Math.abs(w.char.root.position.y-floorAt(w.char.root.position.x,w.char.root.position.z)));
  }
 }
 if(phase==='exit'){
  if(!stage.allOffstage||!stage.conductorOffstage)fail(lifecycle,'incomplete-exit',{});
  // Interval practice: borrow the offstage principal cellist (`vc:0`) and run real Practice frames.
  phase='interval-practice';previous.clear();
  const celloEntry=catalog.find(e=>e.piece.tracks.some(tr=>tr.section==='vc'&&tr.notes.length>=24&&(!tr.chairs||tr.chairs.includes(0))));
  let practiceClock=0;
  const mockPracticeEngine={get now(){return practiceClock;},onTick(){return()=>{};},playNote(){}};
  const practice=new Practice(mockPracticeEngine);
  const borrowed=stage.borrow('vc:0',{x:3.62,y:0,z:37.6},Math.PI/2);
  let observedPractice=false;
  if(!borrowed||!celloEntry||!practice.start(celloEntry.piece,{sid:'vc',ci:0,section:'lobby',seed:2326})){
   fail(lifecycle,'unexercised-interval-practice',{sid:'vc',ci:0});
  }else{
   for(let frame=0;frame<180;frame++){
    t+=1/60;practiceClock+=1/60;lifecycle.intervalPracticeFrames++;
    stage.update(1/60);
    const pr=practice.frame('vc:0');
    if(pr.st.playing)observedPractice=true;
    orchestra.update(t,1/60,perf,{running:false,practice:pr});
    inspect(lifecycle,t,p=>p.sid==='vc'&&p.ci===0,frame>0);
   }
   if(!observedPractice)fail(lifecycle,'unobserved-interval-practice',{sid:'vc',ci:0});
   practice.stop();stage.giveBack(borrowed);
  }
  previous.clear();
 }
}
if(!stage.arrived(stage.walkers)||!stage.conductorReady)fail(lifecycle,'incomplete-entry',{});

// Recital page-turn thank-you nod: guarantee crossing a page turn with the turner seated.
{
 phase='recital-nod';previous.clear();
 const soloEntry=catalog.find(e=>{const s=new Set(e.piece.tracks.filter(tr=>tr.notes.length).map(tr=>tr.section));return s.size===1&&s.has('piano');});
 if(!soloEntry){
  fail(lifecycle,'unexercised-recital-nod',{sid:'piano',ci:0});
 }else{
  const {piece}=soloEntry;
  perf.use(perf.prepare(piece));
  const pages=Math.max(2,Math.round(piece.duration/32));
  const turnStart=Math.max(0,piece.duration/pages-1.35);
  perf._resetVisual(turnStart);
  recital.open(true,piece);
  for(let frame=0;frame<120;frame++){
   const time=Math.min(piece.duration-.001,turnStart+frame/60);
   const recitalNod=recital.update(1/60,time,true);
   lifecycle.maxRecitalNod=Math.max(lifecycle.maxRecitalNod,recitalNod);
   perf.updateVisual(time);
   orchestra.update(time,1/60,perf,{running:true,recitalNod});
   inspect(lifecycle,time,p=>p.sid==='piano'&&p.ci===0,frame>0);
  }
  recital.open(false);
  if(!(lifecycle.maxRecitalNod>0.9))fail(lifecycle,'unexercised-recital-nod',{sid:'piano',ci:0,maxRecitalNod:lifecycle.maxRecitalNod});
 }
}

// Bremen miniature: trail state machine, score bounds and quartet rig motion.
{
 phase='bremen';previous.clear();
 const trail=createBremenTrail(false);
 const taps=[trail.tap(0),trail.tap(1000),trail.tap(8000),trail.tap(9000),trail.tap(10000),trail.tap(11000),trail.tap(25000)];
 if(taps.join(',')!=='1,2,1,2,3,4,4')fail(lifecycle,'invalid-bremen-trail',{taps});
 const bNotes=bremenScore();
 const mapSec=['tu','cl','vn1','tp'];
 if(BREMEN_PLAYERS.length!==4||!bNotes.length||bNotes.some(n=>!Number.isFinite(n.at)||!Number.isFinite(n.dur)||n.at<0||n.at+n.dur>BREMEN_DURATION+1e-6)){
  fail(lifecycle,'invalid-bremen-score',{count:bNotes.length});
 }else{
  const bPiece={id:'bremen-miniature',conducted:false,duration:BREMEN_DURATION,tracks:BREMEN_PLAYERS.map((bp,idx)=>({
   section:mapSec[idx],inst:bp.inst,chairs:[0],
   notes:bNotes.filter(n=>n.player===idx).flatMap(n=>[n.at,n.dur,n.midi,Math.round(n.velocity*127)]),
  }))};
  perf.use(perf.prepare(bPiece));
  const start=12*BREMEN_BEAT; // bar 4: all four Bremen animals playing together
  perf._resetVisual(start);
  for(let frame=0;frame<120;frame++){
   const time=start+frame/60;lifecycle.bremenFrames++;
   perf.updateVisual(time);
   orchestra.update(time,1/60,perf,{running:true});
   inspect(lifecycle,time,p=>mapSec.includes(p.sid)&&p.ci===0,frame>0);
  }
 }
}
const report={description:'Actual score state, full scene rigs, synthetic 60 Hz. Not a rendered-video or FPS benchmark.',createdAt:new Date().toISOString(),source:motionSource(),seed:2326,limits,coverage,songs:rows.length,cast:orchestra.players.length,rigs:Object.keys(rigs).length,frames:rows.reduce((n,r)=>n+r.frames,0)+lifecycle.frames,armSamples:rows.reduce((n,r)=>n+r.armSamples,0)+lifecycle.armSamples,rows,lifecycle,rigSummary:rigs};
const filename=path.resolve(process.argv[2]||'work/motion-audit.json');fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(report,null,2));
const failures=[...rows,lifecycle].filter(r=>r.failures.length);
console.log(JSON.stringify({songs:report.songs,cast:report.cast,rigs:report.rigs,frames:report.frames,armSamples:report.armSamples,maxContactError:Math.max(...[...rows,lifecycle].map(r=>r.maxContactError)),failures:failures.map(r=>({id:r.id,failures:r.failures}))}));
if(failures.length||coverage.failures.length)process.exitCode=1;
