// Actual WebGL + live Web Audio recording, not a screenshot animation.
// Start a dedicated browser with cdp-direct, then:
// QA_OUT=work/motion node tools/qa/record-playing-motion.mjs label piano,triangle
// Optional: APP_PORT=8096 CDP_PORT=9224 MOBILE=1 QA_REV=<baseline commit>
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { p as puppeteer, outputDir } from './quality-optimization-common.mjs';
import { MOTION_CAMERAS } from './motion-cases.mjs';
import { recordingOptions } from './motion-record-options.mjs';
import { motionSource, repo, useBrowserRevision } from './motion-source.mjs';
const {label,cases}=recordingOptions(process.argv.slice(2));
const mobile=process.env.MOBILE==='1', port=process.env.APP_PORT||8096;
const url=`http://127.0.0.1:${port}`;
const source=process.env.QA_REV?{baselineCommit:execFileSync('git',['rev-parse',process.env.QA_REV],{cwd:repo,encoding:'utf8'}).trim()}:motionSource();
const browser=await puppeteer.connect({browserURL:`http://127.0.0.1:${process.env.CDP_PORT||9224}`,defaultViewport:null});
let page;
try {
  page=await browser.newPage();
  // Only our test app's tabs, never unrelated browsing sessions.
  for(const old of await browser.pages())if(old!==page&&old.url().startsWith(url))await old.close();
  await page.bringToFront();
  await page.setUserAgent(mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':await browser.userAgent());
  await page.setViewport(mobile?{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true}:{width:1000,height:760,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(quality=>{
    localStorage.setItem('fp-settings',JSON.stringify({...JSON.parse(localStorage.getItem('fp-settings')||'{}'),quality}));
    let seed=2326;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  },mobile?'low':'high');
  if(process.env.QA_REV)await useBrowserRevision(page,process.env.QA_REV);
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  for(const spec of cases){
    errors.length=0;
    await page.goto(`${url}/?venue=${spec.venue}&lobby`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__fp&&!document.querySelector('#enterBtn').disabled,{timeout:120000});
    await page.click('#enterBtn');
    await page.evaluate(async spec=>{
      const {SETLISTS}=await import('/js/programs.js');
      const index=SETLISTS[spec.venue].indexOf(spec.song);
      if(index<0)throw Error(`Missing ${spec.song} in ${spec.venue}`);
      __fp.ui.emit('select',index);
    },spec);
    await page.waitForFunction(spec=>__fp.phase==='playing'&&__fp.perf.playing&&__fp.perf.piece.id===spec.song,{timeout:90000},spec);
    const setup=await page.evaluate(async({spec,offset})=>{
      const f=__fp,p=spec.sid==='conductor'?f.orchestra.conductor:f.orchestra.playerAt(spec.sid,spec.ci||0);
      if(!p)throw Error(`Missing performer: ${spec.sid}`);
      const THREE=await import('three');
      const notes=f.perf.piece.tracks.filter(t=>t.section===spec.sid&&(!t.chairs||t.chairs.includes(spec.ci||0))).flatMap(t=>Array.from({length:t.notes.length/4},(_,i)=>t.notes[i*4])).sort((a,b)=>a-b);
      if(spec.sid!=='conductor'&&!notes.length)throw Error(`No ${spec.sid} notes in ${spec.song}`);
      let best=notes[0]||0,count=0,end=0;
      for(let i=0;i<notes.length;i++){
        while(end<notes.length&&notes[end]<notes[i]+8)end++;
        if(end-i>count){count=end-i;best=notes[i];}
      }
      const start=spec.start??Math.max(0,best-.7);f.perf.seek(start);
      const target=p.char.root.localToWorld(new THREE.Vector3(0,.96,-.22));
      const eye=p.char.root.localToWorld(new THREE.Vector3(...offset));
      if(spec.mode){f.perf.pause();f.stage.snapOnstage();f.stage.snapConductor(true);eye.set(...(spec.venue==='outdoor'?[0,6,12]:[6.5,5.2,4]));target.set(0,2,-5);}
      const d=f.director;d.setMode('cinema');d.placeAt({x:eye.x,y:eye.y-1.62,z:eye.z},target);
      d.targetFov=d.fov=spec.mode?60:42;d.cine.shot={kind:'qa',hold:Infinity};d.cine.until=Infinity;d.cine.drift=null;
      return {start,offset,notes:count,root:p.char.root.position.toArray(),visible:p.char.root.visible};
    },{spec,offset:MOTION_CAMERAS[spec.sid]||[1.4,1.75,-2.1]});
    await new Promise(resolve=>setTimeout(resolve,1200));
    const data=await page.evaluate(async spec=>{
      const f=__fp,p=spec.sid==='conductor'?f.orchestra.conductor:f.orchestra.playerAt(spec.sid,spec.ci||0);
      const stream=f.renderer.domElement.captureStream(30),tap=f.engine.ctx.createMediaStreamDestination();
      f.engine.limiter.connect(tap);stream.addTrack(tap.stream.getAudioTracks()[0]);
      const mime='video/webm;codecs=vp9,opus';
      if(!MediaRecorder.isTypeSupported(mime))throw Error(`Unsupported recorder: ${mime}`);
      const chunks=[],frames=[],timers=[];
      const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000});
      let sampling=true,raf;
      recorder.ondataavailable=event=>chunks.push(event.data);
      const stopped=new Promise(resolve=>recorder.onstop=resolve);
      try {
        if(spec.mode==='bow'){
          f.stage.orchestraRise(true);
          timers.push(setTimeout(()=>{f.stage.orchestraBow(true);f.stage.conductorBow(true);},2000));
          timers.push(setTimeout(()=>{f.stage.orchestraBow(false);f.stage.conductorBow(false);},5000));
          timers.push(setTimeout(()=>f.stage.orchestraRise(false),7000));
        }else if(spec.mode==='exit'){f.stage.exitAll();f.stage.conductorExit();}
        else if(spec.mode==='entry'){f.stage.clearStage();f.stage.enterAll();f.stage.conductorEnter();}
        const sample=()=>{
          if(!sampling)return;
          const state=f.perf.chairs[p.sid]?.[p.ci];
          const joints=Object.fromEntries(Object.entries(p.char.arms).map(([side,a])=>[side,{wrist:a.wrist.toArray(),elbow:a.elbow.toArray(),targetError:a.targetError,flex:a.flex}]));
          frames.push({t:f.perf.time,playing:state?.playing,strokes:state?.strokes,joints,bowVisible:p.bow?.group?.visible,slide:p.inst?.slide?.position.z,
            gripError:p.mallets?.map((m,k)=>m?p.char.arms[k?'R':'L'].wrist.distanceTo(m.group.position):null),calls:f.stats.calls,
            stage:spec.mode?Object.fromEntries(['walking','seated','standing','off'].map(s=>[s,f.stage.walkers.filter(w=>w.state===s).length])):undefined});
          raf=requestAnimationFrame(sample);
        };
        recorder.start();sample();await new Promise(resolve=>setTimeout(resolve,(spec.seconds||8)*1000));
        sampling=false;recorder.stop();await stopped;
        const blob=new Blob(chunks,{type:mime});
        const b64=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(';base64,')[1]);reader.readAsDataURL(blob);});
        const lifecycleEnd=spec.mode?{allOffstage:f.stage.allOffstage,conductorOffstage:f.stage.conductorOffstage,arrived:f.stage.arrived(f.stage.walkers),conductorReady:f.stage.conductorReady,routes:[...f.stage.walkers,f.stage.conductor].every(w=>w.routeFound)}:null;
        return {b64,frames,phase:f.phase,canvas:[f.renderer.domElement.width,f.renderer.domElement.height],mime,lifecycleEnd};
      }finally{
        sampling=false;cancelAnimationFrame(raf);timers.forEach(clearTimeout);
        if(recorder.state!=='inactive')recorder.stop();
        f.engine.limiter.disconnect(tap);stream.getTracks().forEach(track=>track.stop());f.perf.pause();
      }
    },spec);
    const activeFrames=data.frames.filter(frame=>frame.playing).length;
    if(spec.mode&&data.lifecycleEnd?.routes!==true)errors.push('Missing stage route');
    if(spec.mode==='exit'&&(!data.lifecycleEnd.allOffstage||!data.lifecycleEnd.conductorOffstage))errors.push('Incomplete rendered exit');
    if(spec.mode==='entry'&&(!data.lifecycleEnd.arrived||!data.lifecycleEnd.conductorReady))errors.push('Incomplete rendered entry');
    if(spec.sid!=='conductor'&&!activeFrames)errors.push('Selected performer did not play during the captured window');
    data.activeFrames=activeFrames;
    fs.writeFileSync(`${outputDir}/${label}-${spec.id}.webm`,Buffer.from(data.b64,'base64'));delete data.b64;
    fs.writeFileSync(`${outputDir}/${label}-${spec.id}.json`,JSON.stringify({spec,setup,source,...data,mobile,errors}));
    await page.screenshot({path:`${outputDir}/${label}-${spec.id}.png`});
    console.log(JSON.stringify({id:spec.id,label,...setup,frames:data.frames.length,activeFrames,errors}));
    if(errors.length)throw Error(`Browser errors in ${spec.id}`);
  }
}finally{
  // Unload audio/video even if a case failed; leave one paused result for review.
  if(page&&!page.isClosed())await page.evaluate(()=>window.__fp?.perf.pause()).catch(()=>{});
  await browser.disconnect();
}
