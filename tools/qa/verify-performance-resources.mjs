// Real rendered resource checks. QA_REV pins every browser module for before/
// after reproduction. Not a frame-rate benchmark and not real network clients.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { p, outputDir } from './quality-optimization-common.mjs';
import { motionSource, useBrowserRevision } from './motion-source.mjs';
const base=`http://127.0.0.1:${process.env.APP_PORT||8096}`;
const browser=await p.connect({browserURL:`http://127.0.0.1:${process.env.CDP_PORT||9224}`,defaultViewport:null});
const page=await browser.newPage();
for(const old of await browser.pages())if(old!==page&&old.url().startsWith(base))await old.close();
const report={source:process.env.QA_REV?await useBrowserRevision(page,process.env.QA_REV):motionSource(),createdAt:new Date().toISOString(),checks:{},errors:[],status:'fail'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
page.on('pageerror',e=>report.errors.push(String(e)));
await page.setViewport({width:1200,height:800,deviceScaleFactor:1});await page.bringToFront();
await page.evaluateOnNewDocument(()=>localStorage.setItem('fp-settings',JSON.stringify({quality:'high',skipStageTransitions:true,volume:.1})));
try{
 await page.goto(`${base}/?venue=outdoor&lobby`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__fp&&!document.querySelector('#enterBtn').disabled,{timeout:120000});
 await page.click('#enterBtn');
 await page.evaluate(()=>__fp.ui.emit('select',4));
 await page.waitForFunction(()=>__fp.phase==='playing'&&__fp.perf.playing&&__fp.perf.piece.id==='mozart-symphony-40',{timeout:60000});
 await page.evaluate(()=>{
  __fp.perf.seek(199);const d=__fp.director;d.setMode('cinema');d.placeAt({x:0,y:4,z:17},{x:0,y:2,z:-9});
  d.fov=d.targetFov=52;d.cine.shot={kind:'qa-fixed-stage',hold:Infinity};d.cine.until=Infinity;d.cine.drift=null;
 });await sleep(1600);
 await page.screenshot({path:`${outputDir}/resources-playing.png`});
 await page.evaluate(()=>__fp.perf.pause());
 const refs=()=>page.evaluate(()=>__fp.renderer.info.programs.filter(p=>p.getUniforms().seq.some(u=>u.id==='luminosityThreshold')).reduce((n,p)=>n+p.usedTimes,0));
 const bloom=[await refs()];
 for(let i=0;i<6;i++){
  await page.evaluate(()=>__fp.ui.onSetting('quality','low'));await sleep(100);
  await page.evaluate(()=>__fp.ui.onSetting('quality','high'));await sleep(250);
  bloom.push(await refs());
 }
 report.checks.bloomReferences=bloom;
 await page.evaluate(async()=>{const T=await import('three');window._disposeCalls=0;window._disposeOriginal=T.Material.prototype.dispose;T.Material.prototype.dispose=function(){_disposeCalls++;return _disposeOriginal.call(this)};});
 for(let i=0;i<6;i++)await page.evaluate(()=>__fp.ui.onSetting('quality','high'));
 report.checks.sameQualityDisposals=await page.evaluate(async()=>{const T=await import('three');T.Material.prototype.dispose=_disposeOriginal;return _disposeCalls;});
 report.checks.avatar=[];
 for(let i=0;i<6;i++){
  await page.evaluate(()=>{const a=__fp.avatars.add({id:9999,name:'재접속 자원 검사',avatar:'rabbit',p:{x:0,y:0,z:3,r:Math.PI,s:-1}});window._skirtDisposed=0;a.char.skirt.material.addEventListener('dispose',()=>_skirtDisposed++);});
  await sleep(180);
  report.checks.avatar.push(await page.evaluate(()=>{__fp.avatars.clear();return {skirtDisposed:_skirtDisposed,remaining:__fp.avatars.list.size};}));
 }
 // Real score fetches and actual UI selection, held until all ten choices are
 // pending. Counts only heavy prepare(), not HTTP/cache activity.
 report.checks.rapidChoice=await page.evaluate(async()=>{
  const originalFetch=window.fetch,originalPrepare=__fp.perf.prepare;
  const prepared=[],held=[];let release;
  const gate=new Promise(r=>release=r);
  window.fetch=async(...args)=>{if(/^music\/(?!index)[\w-]+\.json$/.test(String(args[0]))){held.push(String(args[0]));await gate;}return originalFetch(...args);};
  __fp.perf.prepare=function(score){prepared.push(score.id);return originalPrepare.call(this,score);};
  const {OUTDOOR_SETLIST}=await import('/js/programs.js');
  const indices=[8,9,10,11,12,13,14,15,16,17];
  for(const index of indices)__fp.ui.emit('select',index);
  await new Promise(r=>setTimeout(r,50));release();
  const wanted=OUTDOOR_SETLIST[indices.at(-1)],deadline=performance.now()+30000;
  while((__fp.perf.piece?.id!==wanted||__fp.phase!=='playing')&&performance.now()<deadline)await new Promise(r=>setTimeout(r,100));
  await new Promise(r=>setTimeout(r,500));
  window.fetch=originalFetch;__fp.perf.prepare=originalPrepare;
  return {held:held.length,prepared,wanted,actual:__fp.perf.piece?.id,phase:__fp.phase};
 });
 assert.equal(report.errors.length,0,report.errors.join('\n'));
 if(!process.env.QA_REV){
  assert.ok(bloom.every(n=>n===1),`Bloom shader references: ${bloom}`);
  assert.equal(report.checks.sameQualityDisposals,0);
  assert.ok(report.checks.avatar.every(a=>a.skirtDisposed===1&&a.remaining===0));
  assert.deepEqual(report.checks.rapidChoice.prepared,[report.checks.rapidChoice.wanted]);
  assert.equal(report.checks.rapidChoice.actual,report.checks.rapidChoice.wanted);
 }
 report.status=process.env.QA_REV?'baseline-observed':'pass';
}catch(e){report.failure=String(e.stack||e);process.exitCode=1;}
finally{
 if(!process.env.QA_REV){report.sourceEnd=motionSource();if(report.sourceEnd.sourceSHA256!==report.source.sourceSHA256){report.status='fail';report.failure='Product source changed during verification';process.exitCode=1;}}
 fs.writeFileSync(`${outputDir}/resources.json`,JSON.stringify(report,null,2));await page.close();await browser.disconnect();console.log(JSON.stringify(report));
}
