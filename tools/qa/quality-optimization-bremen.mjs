import { p, outputDir } from './quality-optimization-common.mjs';
import fs from 'node:fs';

const b=await p.connect({browserURL:'http://127.0.0.1:9224',defaultViewport:null});const page=(await b.pages()).find(p=>p.url().includes(':8096'));const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const read=()=>page.evaluate(()=>({open:__fp.bremen.active,voices:__fp.bremen.voices,playing:__fp.perf.playing,pos:__fp.perf.time,makeup:__fp.engine.makeup.gain.value,focus:document.activeElement.className,panelHidden:document.getElementById('panel').hidden,status:document.querySelector('.bremen-status')?.textContent}));
if(await page.$eval('#bremen',d=>d.open).catch(()=>false))await page.click('.bremen-close');await new Promise(r=>setTimeout(r,200));
await page.setViewport({width:1200,height:800,deviceScaleFactor:1});await page.evaluate(()=>__fp.perf.play());
if(await page.$eval('#panel',d=>d.hidden))await page.click('[data-panel=program]');
const before=await read();await page.click('#bremenTrail');const opened=await read();await page.keyboard.press('k');const keyboard=await read();
await new Promise(r=>setTimeout(r,10500));await page.screenshot({path:outputDir+'/bremen-desktop.png'});
await new Promise(r=>setTimeout(r,17500));const ended=await read();await page.click('.bremen-replay');await new Promise(r=>setTimeout(r,250));const replay=await read();await page.keyboard.press('Escape');await new Promise(r=>setTimeout(r,200));const closed=await read();
const repeats=[];for(let i=0;i<3;i++){await page.click('#bremenTrail');await new Promise(r=>setTimeout(r,120));await page.click('.bremen-close');await new Promise(r=>setTimeout(r,120));repeats.push(await read());}
await new Promise(r=>setTimeout(r,800));const settled=await read();
const audio=await page.evaluate(async()=>{const {playBremen}=await import('/js/bremen-audio.js'),{BREMEN_DURATION,bremenScore}=await import('/js/bremen-score.js');const ctx=new OfflineAudioContext(2,Math.ceil((BREMEN_DURATION+1)*48000),48000);const master=ctx.createGain();master.gain.value=.8;master.connect(ctx.destination);const play=playBremen({ctx,master,_nearest:__fp.engine._nearest.bind(__fp.engine)});const buffer=await ctx.startRendering();let peak=0,sum=0,finite=true;for(let c=0;c<2;c++)for(const x of buffer.getChannelData(c)){peak=Math.max(peak,Math.abs(x));sum+=x*x;if(!Number.isFinite(x))finite=false;}play.stop();return {duration:buffer.duration,notes:bremenScore().length,peak,rms:Math.sqrt(sum/(buffer.length*2)),finite,missing:play.missing,voicesAfterStop:play.activeVoices};});
await page.emulateMediaFeatures([]);await page.setViewport({width:1200,height:800,deviceScaleFactor:1});await page.evaluate(()=>__fp.perf.pause());
const result={before,opened,keyboard,ended,replay,closed,repeats,settled,audio,errors};fs.writeFileSync(outputDir+'/bremen-check.json',JSON.stringify(result,null,2));console.log(result);await b.disconnect();
