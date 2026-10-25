// Two real clients: private outdoor room, late join, reconnect, and host handoff.
// Run separately from frame-rate measurements. No chat is sent.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {p, outputDir} from './quality-optimization-common.mjs';
import {motionSource} from './motion-source.mjs';
const song = process.env.SONG_ID || 'mozart-symphony-40';
const base = `http://127.0.0.1:${process.env.APP_PORT || 8096}`;
const browser = await p.connect({browserURL:`http://127.0.0.1:${process.env.CDP_PORT || 9224}`,defaultViewport:null});
const contexts=[], pages=[], errors=[], snapshots=[];
const sample = page => page.evaluate(()=>({song:__fp.perf.piece?.id,time:__fp.perf.time,clock:__fp.room.now(),playing:__fp.perf.playing,phase:__fp.phase,id:__fp.room.id,host:__fp.room.host,members:__fp.room.members.size,connected:__fp.room.connected,audio:__fp.engine.ctx.state}));
async function ready(url){
  const context=await browser.createBrowserContext();contexts.push(context);
  const page=await context.newPage();pages.push(page);
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewport({width:1100,height:750,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>localStorage.setItem('fp-settings',JSON.stringify({quality:'low'})));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__fp&&!document.querySelector('#enterBtn').disabled,{timeout:120000});
  return page;
}
const report={source:motionSource(),song,snapshots,errors,status:'fail'};
try {
  // Pause old test pages so two-client behavior is not mixed with other shows.
  for(const page of await browser.pages())if(page.url().startsWith(base))await page.evaluate(()=>window.__fp?.perf.pause()).catch(()=>{});
  const host=await ready(`${base}/?venue=outdoor&lobby=1`);
  await host.click('#lbVis [data-pub="0"]');
  await host.type('#lbTitle','야외 연결 확인');
  await host.click('#lbCreate');
  await host.waitForFunction(()=>__fp.room?.isHost);
  const code=await host.evaluate(()=>__fp.room.room.code);
  await host.evaluate(async song=>{const {OUTDOOR_SETLIST}=await import('/js/programs.js');const i=OUTDOOR_SETLIST.indexOf(song);if(i<0)throw Error('Song not in outdoor programme');__fp.ui.emit('select',i);},song);
  await host.waitForFunction(song=>__fp.phase==='playing'&&__fp.perf.playing&&__fp.perf.piece?.id===song,{timeout:90000},song);
  await host.click('[data-mode="cinema"]');
  await host.evaluate(()=>{window._oldSocket=__fp.room.ws;__fp.room.ws.close();});
  await host.waitForFunction(()=>__fp.room.connected&&__fp.room.ws!==_oldSocket&&__fp.room.isHost,{timeout:20000});
  snapshots.push({case:'sole-host-reconnect',host:await sample(host)});
  const guest=await ready(`${base}/?venue=outdoor&lobby=1&room=${code}`);
  await guest.click('#lbInviteGo');
  await guest.waitForFunction(song=>__fp.room?.connected&&__fp.phase==='playing'&&__fp.perf.playing&&__fp.perf.piece?.id===song,{timeout:90000},song);
  await guest.click('[data-mode="cinema"]');
  const pair=async label=>{
    const a=await sample(host),b=await sample(guest);
    const drift=Math.abs((a.time-a.clock)-(b.time-b.clock));
    snapshots.push({case:label,host:a,guest:b,driftSeconds:drift});
    assert.equal(a.song,song);assert.equal(b.song,song);assert.ok(a.playing&&b.playing);
    assert.equal(a.members,2);assert.equal(b.members,2);assert.ok(drift<.6,`${label}: drift ${drift}`);
  };
  await pair('late-join');
  await guest.evaluate(()=>{window._oldSocket=__fp.room.ws;__fp.room.ws.close();});
  await guest.waitForFunction(()=>__fp.room.connected&&__fp.room.ws!==_oldSocket&&__fp.room.members.size===2,{timeout:20000});
  await pair('guest-reconnect');
  await guest.screenshot({path:`${outputDir}/multiplayer-guest.png`});
  await host.evaluate(()=>{__fp.room.leave();__fp.perf.pause();});
  await guest.waitForFunction(()=>__fp.room.isHost&&__fp.room.members.size===1&&__fp.perf.playing,{timeout:20000});
  snapshots.push({case:'host-handoff',guest:await sample(guest)});
  assert.equal(errors.length,0,errors.join('\n'));
  report.status='pass';
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{
  fs.writeFileSync(`${outputDir}/multiplayer.json`,JSON.stringify(report,null,2));
  for(const page of pages)await page.evaluate(()=>{__fp.room?.leave();__fp.perf.pause();}).catch(()=>{});
  for(const context of contexts)await context.close();
  await browser.disconnect();
  console.log(JSON.stringify(report));
}
