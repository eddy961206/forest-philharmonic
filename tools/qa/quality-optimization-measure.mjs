import { p, outputDir } from './quality-optimization-common.mjs';

import fs from 'node:fs';
import { motionSource, useBrowserRevision } from './motion-source.mjs';

const [label='baseline',venue='hall',seconds='25',mode='profile']=process.argv.slice(2);
const browser=await p.connect({browserURL:'http://127.0.0.1:9224',defaultViewport:null});
const old=(await browser.pages()).filter(p=>/:(8096|8098)/.test(p.url()));
const page=await browser.newPage();for(const tab of old) await tab.close();
await page.bringToFront();
const source=process.env.QA_REV?await useBrowserRevision(page,process.env.QA_REV):motionSource();
const mobile=process.env.MOBILE==='1';
await page.setUserAgent(mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':await browser.userAgent());
await page.setViewport(mobile?{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true}:{width:1200,height:800,deviceScaleFactor:1});
await page.evaluateOnNewDocument(mobile=>{try{const settings=JSON.parse(localStorage.getItem('fp-settings')||'{}');settings.quality=mobile?'low':'high';localStorage.setItem('fp-settings',JSON.stringify(settings));}catch{}let seed=20261023;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);},mobile);
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.goto(`http://127.0.0.1:${process.env.APP_PORT||8096}/?venue=${venue}&lobby`,{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__fp&&!document.querySelector('#enterBtn').disabled,{timeout:120000});
await page.click('#enterBtn');
await page.evaluate(async venue=>{const f=__fp;f.ui.onSetting('quality',navigator.userAgent.includes('iPhone')?'low':'high');const {SETLISTS}=await import('/js/programs.js');f.ui.emit('select',SETLISTS[venue].indexOf(venue==='hall'?'elgar-pomp-and-circumstance':'wagner-valkyries'));},venue);
await page.waitForFunction(venue=>__fp.phase==='playing'&&__fp.perf.playing&&__fp.perf.piece.id===(venue==='hall'?'elgar-pomp-and-circumstance':'wagner-valkyries'),{timeout:60000},venue);
await page.evaluate(venue=>{__fp.perf.seek(venue==='hall'?280:277);const d=__fp.director;d.setMode('cinema');d.placeAt({x:0,y:14.8,z:5.9},{x:0,y:2,z:-9});d.targetFov=d.fov=52;d.cine.shot={kind:'qa-fixed-stage',hold:Infinity};d.cine.until=Infinity;d.cine.clock=0;d.cine.drift=null;},venue);
await new Promise(r=>setTimeout(r,5000));
await page.screenshot({path:`${outputDir}/${label}-${venue}.png`});
const c=await page.createCDPSession();await c.send('Performance.enable');
if(mode==='profile'){await c.send('Profiler.enable');await c.send('Profiler.start');}
const start=await c.send('Performance.getMetrics');
await page.evaluate(()=>{window._measure={frames:[],submit:[],calls:[],triangles:[],late:0,voices:0,statsStart:__fp.engine.ctx.playbackStats?.toJSON()};const q=_measure, f=__fp;const original=f.engine.playNote;q.original=original;f.engine.playNote=function(...a){if(f.engine.ctx.currentTime-a[0].when>.1)q.late++;return original.apply(this,a)};let last=performance.now();q.active=true;const tick=t=>{if(!q.active)return;q.frames.push(t-last);last=t;q.submit.push(f.stats.submitMs);q.calls.push(f.stats.calls);q.triangles.push(f.stats.triangles);q.voices=Math.max(q.voices,f.engine.voices.size);requestAnimationFrame(tick)};requestAnimationFrame(tick);});
await new Promise(r=>setTimeout(r,Number(seconds)*1000));
const end=await c.send('Performance.getMetrics');
if(mode==='profile'){const {profile}=await c.send('Profiler.stop');fs.writeFileSync(`${outputDir}/${label}-${venue}.cpuprofile`,JSON.stringify(profile));}
const data=await page.evaluate(()=>{const q=_measure;q.active=false;__fp.engine.playNote=q.original;delete q.original;q.frames.shift();q.statsEnd=__fp.engine.ctx.playbackStats?.toJSON();q.quality=__fp.quality;q.scale=__fp.qualityState.renderScale;q.camera=__fp.camera.position.toArray();q.pixelRatio=__fp.renderer.getPixelRatio();q.viewport={width:innerWidth,height:innerHeight,dpr:devicePixelRatio};q.resources={...__fp.renderer.info.memory};q.visible=document.visibilityState;q.phase=__fp.phase;__fp.perf.pause();return q;});
const summary=a=>{const s=[...a].sort((a,b)=>a-b);return {mean:a.reduce((a,b)=>a+b,0)/a.length,p95:s[Math.floor(s.length*.95)],p99:s[Math.floor(s.length*.99)],max:s.at(-1)}};
data.source=source;data.seconds=Number(seconds);data.mobile=mobile;data.mode=mode;data.createdAt=new Date().toISOString();
data.errors=errors;data.metrics={start,end};data.summary={frames:summary(data.frames),submit:summary(data.submit),calls:summary(data.calls),triangles:summary(data.triangles)};
fs.writeFileSync(`${outputDir}/${label}-${venue}.json`,JSON.stringify(data));console.log(JSON.stringify({label,venue,...data.summary,late:data.late,errors}));await browser.disconnect();
