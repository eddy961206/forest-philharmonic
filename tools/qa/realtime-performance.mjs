// Descriptive actual-scene observer. A dedicated CDP_PORT is required.
// npm install --global puppeteer-core; CDP_PORT=9224 node tools/qa/realtime-performance.mjs reset-elgar hall-elgar-concert-full 415
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const localRequire=createRequire(import.meta.url);
let puppeteer;try{puppeteer=localRequire('puppeteer-core')}catch{const globalRoot=execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();puppeteer=localRequire(process.env.PUPPETEER_PATH||path.join(globalRoot,'puppeteer-core'));}
const port=Number(process.env.CDP_PORT||9224), [mode='observe',name='hall-elgar-concert-full',seconds='415']=process.argv.slice(2);
const out='docs/evidence/repertoire/performance'; fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.connect({browserURL:`http://127.0.0.1:${port}`,defaultViewport:null});
const page=(await browser.pages()).find(p=>p.url().includes('127.0.0.1:8096'));
if(!page)throw Error('No dedicated QA page'); await page.bringToFront();
const client=await page.createCDPSession(),systemClient=await browser.target().createCDPSession();await client.send('Performance.enable');
const errors=[];const onError=e=>errors.push(String(e)),onConsole=m=>{if(['error','warn'].includes(m.type()))errors.push({type:m.type(),text:m.text()});};page.on('pageerror',onError);page.on('console',onConsole);
await page.waitForFunction(()=>window.__fp?.engine.ctx,{timeout:120000});
if(mode==='reset-elgar')await page.evaluate(()=>{__fp.perf.pause();__fp.perf.seek(0);__fp.director.setMode('cinema')});
const environment=await page.evaluate(()=>{const f=__fp,g=f.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {url:location.href,title:document.title,userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,gpu:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):null,settings:{...f.settings},quality:f.quality,renderer:{...f.renderer.info.memory},visibility:document.visibilityState,camera:{position:f.camera.position.toArray(),quaternion:f.camera.quaternion.toArray(),fov:f.camera.fov,mode:f.director.mode},audio:{state:f.engine.ctx.state,sampleRate:f.engine.ctx.sampleRate,baseLatency:f.engine.ctx.baseLatency,outputLatency:f.engine.ctx.outputLatency,playbackStats:f.engine.ctx.playbackStats?.toJSON()}}});
environment.browser=await browser.version();
await page.screenshot({path:`${out}/${name}-start.png`});
let audioContexts=[];client.on('WebAudio.contextCreated',v=>audioContexts.push(v.context));await client.send('WebAudio.enable');
await page.evaluate(()=>{
 const f=__fp,q=window.__rtQA={start:performance.now(),frames:[],samples:[],notes:[],states:[],longtasks:[],active:true};
 let last=performance.now();const frame=t=>{if(!q.active)return;q.frames.push([t-q.start,t-last]);last=t;requestAnimationFrame(frame)}; requestAnimationFrame(frame);
 try{q.po=new PerformanceObserver(list=>{for(const e of list.getEntries())q.longtasks.push([e.startTime-q.start,e.duration]);});q.po.observe({type:'longtask',buffered:false});}catch{}
 const original=f.engine.playNote;q.original=original;f.engine.playNote=function(note){q.notes.push([performance.now()-q.start,(note.when-this.ctx.currentTime)*1000,note.section,note.inst]);return original.call(this,note)};
 const sample=()=>q.samples.push({wall:performance.now()-q.start,piece:f.perf.piece?.id,pos:f.perf.time,playing:f.perf.playing,phase:f.phase,heap:performance.memory?.usedJSHeapSize,voices:f.engine.voices.size,resources:{...f.renderer.info.memory},stats:{...f.stats},quality:f.quality,qualityState:f.qualityState,audioTime:f.engine.ctx.currentTime,audioState:f.engine.ctx.state,visibility:document.visibilityState,outputTimestamp:f.engine.ctx.getOutputTimestamp?.(),playbackStats:f.engine.ctx.playbackStats?.toJSON(),camera:{position:f.camera.position.toArray(),mode:f.director.mode}});
 q.timer=setInterval(sample,1000);sample();q.onState=()=>q.states.push([performance.now()-q.start,f.engine.ctx.state]);f.engine.ctx.addEventListener('statechange',q.onState);
});
if(mode==='reset-elgar')await page.evaluate(()=>__fp.perf.play());
const system=[],cdp=[],audio=[]; const start=Date.now();
for(let i=0;i<Math.ceil(Number(seconds)/5);i++){
 await new Promise(r=>setTimeout(r,5000));
 const snap=await page.evaluate(()=>{const q=__rtQA;return {elapsed:performance.now()-q.start,last:q.samples.at(-1),frames:q.frames.length,notes:q.notes.length}});
 cdp.push({wallMs:Date.now()-start,...await client.send('Performance.getMetrics')});
 const processes=(await systemClient.send('SystemInfo.getProcessInfo')).processInfo;
 const ids=processes.map(p=>String(p.id));let ps='';try{ps=execFileSync('ps',['-p',ids.join(','),'-o','pid=,ppid=,%cpu=,rss='],{encoding:'utf8'})}catch{}
 system.push({wallMs:Date.now()-start,processes,ps});
 for(const context of audioContexts)try{audio.push({wallMs:Date.now()-start,context,...await client.send('WebAudio.getRealtimeData',{contextId:context.contextId})})}catch(e){audio.push({wallMs:Date.now()-start,error:String(e)})}
 if(i%6===0){fs.writeFileSync(`${out}/${name}-progress.json`,JSON.stringify(snap,null,2));console.log(JSON.stringify(snap));}
}
const data=await page.evaluate(()=>{const f=__fp,q=__rtQA;q.active=false;clearInterval(q.timer);q.po?.disconnect();f.engine.playNote=q.original;f.engine.ctx.removeEventListener('statechange',q.onState);const result={start:q.start,frames:q.frames,samples:q.samples,notes:q.notes,states:q.states,longtasks:q.longtasks,finalPlaybackStats:f.engine.ctx.playbackStats?.toJSON()};delete window.__rtQA;return result;});
fs.writeFileSync(`${out}/${name}.json`,JSON.stringify({date:new Date().toISOString(),environment,errors,system,cdp,audio,...data}));
await page.screenshot({path:`${out}/${name}-end.png`});
page.off('pageerror',onError);page.off('console',onConsole);console.log('SAVED '+name);await browser.disconnect();
