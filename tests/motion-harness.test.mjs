import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { motionCoverage, verificationSummary, actionableFailures } from '../tools/qa/motion-contracts.mjs';
import { recordingOptions } from '../tools/qa/motion-record-options.mjs';
const players=[{sid:'vn1',ci:0,rigKind:'violin'}];
const catalog=[{id:'fixture',venues:['hall'],piece:{id:'fixture',duration:10,tracks:[{section:'vn1',notes:[1,1,60,80]}]}}];
const validAudit=()=>({songs:1,cast:1,frames:1,armSamples:2,limits:{contactError:.03,boneError:1e-8,continuousStep:.15},
  coverage:{chairs:1,failures:[],cases:[],venues:[{id:'hall',stage:'shared-hall-stage'}]},
  rows:[{id:'fixture',venues:['hall'],frames:1,failures:[]}],lifecycle:{id:'stage-lifecycle',frames:1,failures:[]}});
test('new chairs, score parts and venues cannot silently escape motion coverage',()=>{
  const result=motionCoverage(catalog,players);assert.equal(result.failures.length,0);assert.equal(result.cases.length,1);
  assert.equal(result.cases[0].song,'fixture');
  assert.ok(motionCoverage(catalog,[...players,{sid:'new',ci:0,rigKind:'new'}]).failures.some(f=>f.kind==='unexercised-chair'));
  assert.ok(motionCoverage([{...catalog[0],venues:['new-hall']}],players).failures.some(f=>f.kind==='missing-venue-stage-adapter'));
  const missing=structuredClone(catalog);missing[0].piece.tracks[0].chairs=[2];
  assert.ok(motionCoverage(missing,players).failures.some(f=>f.kind==='missing-chair'));
  assert.ok(motionCoverage(catalog,[]).failures.some(f=>f.kind==='missing-section-rig'));
});
test('machine report fails on crashed commands, absent audit and known pose failures',()=>{
  assert.equal(verificationSummary(null,[],{}).status,'fail');
  assert.equal(verificationSummary({},[{exitCode:0}],{}).status,'fail');
  const audit=validAudit();
  assert.equal(verificationSummary(audit,[{exitCode:1}],{}).status,'fail');
  assert.equal(verificationSummary(audit,[{exitCode:0}],{}).status,'pass');
  audit.rows[0]={frames:1,id:'fixture',venues:['hall'],failures:[{kind:'unreachable-contact',sid:'vn1',ci:0,time:2,error:.05,windowStart:1.5}]};
  const [failure]=actionableFailures(audit);assert.equal(failure.limit,.03);assert.equal(failure.value,.05);
  assert.match(failure.preview,/--start 1.5000/);assert.equal(failure.reproduce,'npm run verify:motion');
  assert.equal(verificationSummary(audit,[],{}).status,'fail');
});
test('malformed required audit data returns a failure summary without throwing',()=>{
  const mutations=[
    audit=>{audit.rows=[null];},
    audit=>{audit.rows[0].failures=[null];},
    audit=>{audit.rows[0].failures=[{kind:'pose-jump',windowStart:'1'}];},
    audit=>{delete audit.rows[0].venues;},
    audit=>{audit.rows[0].venues=[null];},
    audit=>{delete audit.rows[0].id;},
    audit=>{audit.lifecycle=null;},
    audit=>{audit.lifecycle.failures={};},
    audit=>{audit.limits=null;},
    audit=>{delete audit.limits.contactError;},
    audit=>{audit.limits.boneError=NaN;},
    audit=>{audit.frames='1';},
    audit=>{audit.armSamples=Infinity;},
    audit=>{audit.coverage=null;},
    audit=>{audit.coverage.failures=[null];},
    audit=>{audit.coverage.cases=[null];},
    audit=>{audit.coverage.venues=[null];},
  ];
  for(const mutate of mutations){
    const audit=validAudit();mutate(audit);
    const summary=verificationSummary(audit,[{exitCode:0}],{});
    assert.equal(summary.status,'fail',mutate.toString());
    assert.ok(summary.failures.some(f=>f.kind==='incomplete-audit-report'),mutate.toString());
    assert.equal(summary.coverage,null);
  }
});
test('unobserved chair failures explain which score and sampling contracts to inspect',()=>{
  const audit=validAudit();audit.rows[0].failures=[{kind:'unobserved-playing-chair',sid:'vn1',ci:0}];
  const summary=verificationSummary(audit,[{exitCode:0}],{});
  assert.equal(summary.status,'fail');
  assert.match(summary.failures[0].action,/chair assignment, note durations and sampled windows/);
});
test('unknown failure names cannot read inherited rule properties',()=>{
  for(const kind of ['constructor','toString','__proto__']){
    const audit=validAudit();audit.rows[0].failures=[{kind}];
    const summary=verificationSummary(audit,[{exitCode:0}],{});
    assert.equal(summary.status,'fail');
    assert.equal(summary.failures[0].kind,kind);
  }
});
test('recorder supports named, generated and failure-specific cases and rejects invalid options',t=>{
  assert.equal(recordingOptions(['review','bells']).cases[0].sid,'bells');
  const args=['--song','fixture','--venue','hall','--section','vn1','--chair','0','--start','1.5'];
  assert.equal(recordingOptions(args).cases[0].start,1.5);
  assert.throws(()=>recordingOptions([...args,'--seconds','NaN']));
  assert.throws(()=>recordingOptions(['--song']));
  assert.throws(()=>recordingOptions(['../bad','bells']));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-plan-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'plan.json');fs.writeFileSync(file,JSON.stringify(motionCoverage(catalog,players).cases));
  assert.equal(recordingOptions(['--plan',file,'--case','vn1-0']).cases.length,1);
  assert.throws(()=>recordingOptions(['--plan',file,'--case','absent']));
});

test('sparse chair-specific entrances are sampled even when section density is elsewhere',async()=>{
  const {motionWindows}=await import('../tools/qa/motion-catalog.mjs');
  const windows=motionWindows({duration:100,tracks:[{section:'vn1',chairs:[0],notes:[0,.1,60,80,.1,.1,60,80]},{section:'vn1',chairs:[1],notes:[10,.1,60,80]}]});
  assert.ok(windows.some(w=>w.start===9.5));
});
