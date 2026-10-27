// Resource lifecycle regression. Run alone, separately from FPS measurements.
// Uses actual UI handlers/transport and post-GC heap; does not equate a transient
// heap increase with a leak. Dedicated QA browser only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { p, outputDir } from './quality-optimization-common.mjs';
import { motionSource, useBrowserRevision } from './motion-source.mjs';
// A reused output directory must not advertise a previous run's failure.
fs.rmSync(`${outputDir}/lifecycle-failure.png`, {force:true});
const base = `http://127.0.0.1:${process.env.APP_PORT || 8096}`;
const browser = await p.connect({browserURL:`http://127.0.0.1:${process.env.CDP_PORT || 9224}`,defaultViewport:null});
const page = await browser.newPage();
for (const old of await browser.pages()) if (old !== page && old.url().startsWith(base)) await old.close();
await page.bringToFront();
await page.setViewport({width:1200,height:800,deviceScaleFactor:1});
const cdp = await page.createCDPSession();
await cdp.send('Performance.enable');
const report = {source:process.env.QA_REV?await useBrowserRevision(page,process.env.QA_REV):motionSource(),createdAt:new Date().toISOString(),browser:await browser.version(),method:'Actual UI handlers and fixed playing-stage camera; paused/drained/GC snapshots, not an FPS benchmark',rows:[],errors:[],status:'fail'};
page.on('pageerror',e=>report.errors.push(String(e)));
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
await page.evaluateOnNewDocument(()=>{
  if (!['http:','https:'].includes(location.protocol)) return;
  localStorage.setItem('fp-settings',JSON.stringify({quality:'high',skipStageTransitions:true,volume:.15}));
  addEventListener('pagehide',event=>sessionStorage.setItem('qa-lifecycle-pagehide',JSON.stringify({persisted:event.persisted,url:location.href})));
});
async function enter(venue) {
  await page.goto(`${base}/?venue=${venue}&lobby`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__fp&&!document.querySelector('#enterBtn').disabled,{timeout:120000});
  await page.evaluate(async()=>{
    const {BufferGeometry}=await import('three');
    const add=BufferGeometry.prototype.addEventListener;
    window._geometryUploads=[];
    BufferGeometry.prototype.addEventListener=function(type,listener){
      if(type==='dispose'&&listener.name==='onGeometryDispose')_geometryUploads.push(this.uuid);
      return add.call(this,type,listener);
    };
  });
  await page.click('#enterBtn');
}
async function select(venue,song) {
  await page.evaluate(async({venue,song})=>{
    const {SETLISTS}=await import('/js/programs.js');
    const index=SETLISTS[venue].indexOf(song); if(index<0)throw Error('Unknown lifecycle song');
    __fp.ui.emit('select',index);
  },{venue,song});
  await page.waitForFunction(song=>__fp.phase==='playing'&&__fp.perf.playing&&__fp.perf.piece?.id===song,{timeout:90000},song);
  await page.evaluate(venue=>{
    __fp.perf.seek(Math.min(40,__fp.perf.duration/3));
    const d=__fp.director;d.setMode('cinema');
    d.placeAt(venue==='outdoor'?{x:0,y:4,z:17}:{x:0,y:14.8,z:5.9},{x:0,y:2,z:-9});
    d.targetFov=d.fov=52;d.cine.shot={kind:'qa-fixed-stage',hold:Infinity};d.cine.until=Infinity;d.cine.clock=0;d.cine.drift=null;
  },venue);
  await sleep(1200);
}
async function snapshot(label) {
  await page.evaluate(()=>__fp.perf.pause());
  await sleep(1800);
  await cdp.send('HeapProfiler.collectGarbage');
  const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const row=await page.evaluate(()=>{
    const f=__fp,buffers=new Set();
    for(const sample of Object.values(f.engine.samples))for(const buf of sample.buf.values())buffers.add(buf);
    let objects=0;const geometries=new Set();f.scene.traverse(o=>{objects++;if(o.geometry)geometries.add(o.geometry.uuid);});
    const uploads=_geometryUploads.splice(0);
    return {venue:new URLSearchParams(location.search).get('venue'),song:f.perf.piece?.id,phase:f.phase,visible:document.visibilityState,previousPagehide:JSON.parse(sessionStorage.getItem('qa-lifecycle-pagehide')||'null'),
      voices:f.engine.voices.size,audioState:f.engine.ctx.state,quality:f.qualityState,resources:{...f.renderer.info.memory},programs:f.renderer.info.programs.length,programRefs:f.renderer.info.programs.reduce((n,p)=>n+p.usedTimes,0),sceneObjects:objects,sceneGeometries:geometries.size,
      geometryUploads:{total:uploads.length,knownScene:uploads.filter(id=>geometries.has(id)).length},
      sampleBuffers:buffers.size,samplePCMBytes:[...buffers].reduce((sum,b)=>sum+b.length*b.numberOfChannels*4,0)};
  });
  Object.assign(row,{label,heapBytes:metrics.JSHeapUsedSize,dom:await cdp.send('Memory.getDOMCounters')});
  report.rows.push(row);console.log(JSON.stringify(row));
  assert.equal(row.voices,0,`${label}: stopped notes must drain`);
  assert.equal(row.visible,'visible');
  fs.writeFileSync(`${outputDir}/lifecycle.json`,JSON.stringify(report,null,2));
  return row;
}
function plateau(a,b,label) {
  assert.equal(b.resources.textures,a.resources.textures,`${label}: GPU textures accumulate`);
  assert.equal(b.sceneGeometries,a.sceneGeometries,`${label}: scene geometry accumulates`);
  assert.equal(b.sceneObjects,a.sceneObjects,`${label}: scene objects accumulate`);
  // Blinking eyelids upload lazily, even with a fixed camera. Count those
  // first-use uploads separately from newly created/unreleased geometry.
  const from=report.rows.indexOf(a),to=report.rows.indexOf(b);
  const knownUploads=report.rows.slice(from+1,to+1).reduce((n,r)=>n+r.geometryUploads.knownScene,0);
  assert.ok(b.resources.geometries-a.resources.geometries<=knownUploads,`${label}: GPU geometry growth without an existing scene upload`);
  assert.equal(b.sampleBuffers,a.sampleBuffers,`${label}: decoded samples accumulate`);
  assert.equal(b.samplePCMBytes,a.samplePCMBytes);
  assert.ok(b.dom.jsEventListeners<=a.dom.jsEventListeners+3,`${label}: listeners accumulate`);
  // Allow engine/UI caches, JIT and asynchronous UI cleanup. A large sustained
  // increase is a regression signal requiring a retaining-path investigation.
  assert.ok(b.heapBytes-a.heapBytes<8*1024*1024,`${label}: post-GC heap grew >8 MiB`);
}
try {
  await enter('outdoor');
  await select('outdoor','mozart-symphony-40');
  await snapshot('initial');
  let qualityWarm;
  for(let round=0;round<3;round++) {
    await page.evaluate(()=>__fp.perf.play());
    for(const mode of ['efficient','medium','low','high']) {
      await page.evaluate(mode=>__fp.ui.onSetting('quality',mode),mode);await sleep(600);
    }
    const row=await snapshot(`quality-round-${round+1}`);
    if(!qualityWarm)qualityWarm=row;else plateau(qualityWarm,row,'quality');
  }
  let songWarm;
  for(let round=0;round<3;round++) {
    for(const song of ['liszt-liebestraum-3','bach-air','mozart-symphony-40'])await select('outdoor',song);
    const row=await snapshot(`song-round-${round+1}`);
    if(!songWarm)songWarm=row;else plateau(songWarm,row,'songs');
  }
  await page.evaluate(()=>__fp.perf.play());
  for(let i=0;i<30;i++) {
    await page.evaluate(i=>{__fp.perf.seek(30+i*2);__fp.perf.pause();__fp.perf.play();},i);await sleep(80);
  }
  const transport=await snapshot('30-seek-pause-resume');
  plateau(songWarm,transport,'transport');
  await page.evaluate(()=>__fp.perf.play());
  await page.screenshot({path:`${outputDir}/lifecycle-playing.png`});
  const navigation=[];
  for(const venue of ['hall','sphere','outdoor','hall','sphere','outdoor']) {
    await enter(venue);
    await select(venue,venue==='hall'?'beethoven-symphony-5':venue==='sphere'?'wagner-valkyries':'mozart-symphony-40');
    navigation.push(await snapshot(`navigation-${navigation.length+1}-${venue}`));
  }
  for(let i=0;i<3;i++){
    assert.equal(navigation[i].sampleBuffers,navigation[i+3].sampleBuffers);
    assert.equal(navigation[i].samplePCMBytes,navigation[i+3].samplePCMBytes);
    assert.equal(navigation[i].sceneObjects,navigation[i+3].sceneObjects);
    assert.equal(navigation[i].sceneGeometries,navigation[i+3].sceneGeometries);
  }
  // Browser-managed BFCache retains previous documents on purpose. Global
  // renderer heap/listener counts across navigations are not per-page leaks.
  report.navigationCache={persistedTransitions:navigation.filter(r=>r.previousPagehide?.persisted).length,
    peakDocuments:Math.max(...navigation.map(r=>r.dom.documents)),peakRendererHeapBytes:Math.max(...navigation.map(r=>r.heapBytes)),
    scope:'Renderer-wide metrics include BFCache; no claim that cached venue memory is immediately released.'};
  await page.goBack({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__fp&&new URLSearchParams(location.search).get('venue')==='sphere',{timeout:120000});
  await page.evaluate(()=>__fp.perf.play());
  await page.waitForFunction(()=>__fp.perf.playing&&__fp.engine.ctx.state==='running',{timeout:10000});
  report.backNavigation=await page.evaluate(()=>({venue:new URLSearchParams(location.search).get('venue'),song:__fp.perf.piece?.id,playing:__fp.perf.playing,audioState:__fp.engine.ctx.state}));
  await page.goto('about:blank');await sleep(1500);await cdp.send('HeapProfiler.collectGarbage');
  report.blankRenderer={dom:await cdp.send('Memory.getDOMCounters'),scope:'Current target renderer after leaving the application; not browser-wide OS memory'};
  assert.equal(report.blankRenderer.dom.documents,1);
  assert.equal(report.blankRenderer.dom.jsEventListeners,0);
  assert.equal(report.errors.length,0,report.errors.join('\n'));
  report.status='pass';
} catch(error) { report.failure=String(error.stack||error);process.exitCode=1;await page.screenshot({path:`${outputDir}/lifecycle-failure.png`}).catch(()=>{}); }
finally {if(!process.env.QA_REV){report.sourceEnd=motionSource();if(report.sourceEnd.sourceSHA256!==report.source.sourceSHA256){report.status='fail';report.failure='Product source changed during verification';process.exitCode=1;}}fs.writeFileSync(`${outputDir}/lifecycle.json`,JSON.stringify(report,null,2));await page.close();await browser.disconnect();console.log(JSON.stringify({status:report.status,failure:report.failure,rows:report.rows.length,errors:report.errors}));}
