// Geometry/pose audit. Complement this with actual rendered video: numerical
// contacts cannot certify silhouette, occlusion, collisions or artistic quality.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { buildOrchestra } from '../../public/js/scene/orchestra.js';
import { StageManager } from '../../public/js/scene/stage.js';
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
const orchestra = buildOrchestra(new THREE.Scene());
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
  const row=fresh(entry.id,{venues:entry.venues,sections:[...perf.playingSections],windows:motionWindows(piece)});
  const expected=orchestra.players.filter(p=>piece.tracks.some(tr=>tr.section===p.sid&&tr.notes.length&&(!tr.chairs||tr.chairs.includes(p.ci))));
  const observed=new Set();
  for (const {start} of row.windows) {
    windowStart=start;phase='playing';
    perf._resetVisual(start); previous.clear();
    for(let frame=0;frame<120;frame++) {
      const time=Math.min(piece.duration-.001,start+frame/60);
      perf.updateVisual(time); orchestra.update(time,1/60,perf,{running:true});
      for(const p of expected)if(perf.chairs[p.sid]?.[p.ci]?.playing)observed.add(`${p.sid}:${p.ci}`);
      inspect(row,time,p=>p.sid==='conductor'||perf.playingSections.has(p.sid),frame>0);
    }
    // Pause keeps score time fixed while arms lower; backward seek resets the
    // visual cursors, exactly as the playback UI does.
    phase='pause';for(let frame=0;frame<30;frame++) {
      orchestra.update(start+119/60,1/60,perf,{running:false});
      inspect(row,start+119/60,p=>p.sid==='conductor'||perf.playingSections.has(p.sid),true);
    }
  }
  for(const p of expected)if(!observed.has(`${p.sid}:${p.ci}`))fail(row,'unobserved-playing-chair',{sid:p.sid,ci:p.ci});
  row.observedPlayingChairs=[...observed];rows.push(row);
}

// Full roster lifecycle, including existing instruments and every cast member.
phase='route';windowStart=0;
const stage=new StageManager(orchestra), lifecycle=fresh('stage-lifecycle',{states:{},maxWalkingRootFloorGap:0});
for (const w of [...stage.walkers,stage.conductor]) if (!w.routeFound) fail(lifecycle,'missing-stage-route',{sid:w.player?.sid || 'conductor',ci:w.player?.ci});
stage.snapOnstage();
const phases=[['rise',2,()=>stage.orchestraRise(true)],['bow',2,()=>{stage.orchestraBow(true);stage.conductorBow(true);}],['recover',2,()=>{stage.orchestraBow(false);stage.conductorBow(false);stage.orchestraRise(false);}],['exit',65,()=>{stage.exitAll();stage.conductorExit();}],['enter',85,()=>{stage.enterAll();stage.conductorEnter();}]];
previous.clear();let t=0;
for(const [stagePhase,duration,begin] of phases){phase=stagePhase;begin();for(let frame=0;frame<duration*60;frame++){
 t+=1/60;stage.update(1/60);orchestra.update(t,1/60,perf,{running:false});
 inspect(lifecycle,t,p=>p.char.root.visible,frame>0);
 for(const w of [...stage.walkers,stage.conductor]){
  lifecycle.states[w.state]=(lifecycle.states[w.state]||0)+1;
  if(w.state==='walking')lifecycle.maxWalkingRootFloorGap=Math.max(lifecycle.maxWalkingRootFloorGap,Math.abs(w.char.root.position.y-floorAt(w.char.root.position.x,w.char.root.position.z)));
 }
}if(phase==='exit'&&(!stage.allOffstage||!stage.conductorOffstage))fail(lifecycle,'incomplete-exit',{});}
if(!stage.arrived(stage.walkers)||!stage.conductorReady)fail(lifecycle,'incomplete-entry',{});
const report={description:'Actual score state, full scene rigs, synthetic 60 Hz. Not a rendered-video or FPS benchmark.',createdAt:new Date().toISOString(),source:motionSource(),seed:2326,limits,coverage,songs:rows.length,cast:orchestra.players.length,rigs:Object.keys(rigs).length,frames:rows.reduce((n,r)=>n+r.frames,0)+lifecycle.frames,armSamples:rows.reduce((n,r)=>n+r.armSamples,0)+lifecycle.armSamples,rows,lifecycle,rigSummary:rigs};
const filename=path.resolve(process.argv[2]||'work/motion-audit.json');fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(report,null,2));
const failures=[...rows,lifecycle].filter(r=>r.failures.length);
console.log(JSON.stringify({songs:report.songs,cast:report.cast,rigs:report.rigs,frames:report.frames,armSamples:report.armSamples,maxContactError:Math.max(...[...rows,lifecycle].map(r=>r.maxContactError)),failures:failures.map(r=>({id:r.id,failures:r.failures}))}));
if(failures.length||coverage.failures.length)process.exitCode=1;
