// Record the real, unmodified automatic director, including its edit decisions.
import fs from 'node:fs';
import { p, outputDir } from './quality-optimization-common.mjs';
import { motionSource } from './motion-source.mjs';
const venue = process.argv[2] || 'outdoor', seconds = Number(process.argv[3] || 90);
if (!['hall','sphere','outdoor'].includes(venue) || !(seconds >= 20 && seconds <= 180)) throw Error('Invalid venue/duration');
const mobile = process.env.MOBILE === '1', label = process.env.QA_LABEL || `${venue}${mobile ? '-mobile' : ''}`;
const song = process.env.SONG_ID || ({ hall: 'strauss-blue-danube', sphere: 'wagner-valkyries', outdoor: 'mozart-symphony-40' })[venue];
const start = Number(process.env.START_SECONDS || 200);
if (!/^[\w-]+$/.test(label) || !/^[\w-]+$/.test(song) || !Number.isFinite(start) || start < 0) throw Error('Invalid label/song/start');
const browser = await p.connect({browserURL:`http://127.0.0.1:${process.env.CDP_PORT || 9224}`,defaultViewport:null,protocolTimeout:240000});
const page = await browser.newPage(), errors = [];
const source = motionSource();
try {
  const base = `http://127.0.0.1:${process.env.APP_PORT || 8096}`;
  for (const old of await browser.pages()) if(old!==page && old.url().startsWith(base)) await old.close();
  await page.bringToFront();
  await page.setViewport(mobile?{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true}:{width:1200,height:800,deviceScaleFactor:1});
  if(mobile)await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
  await page.evaluateOnNewDocument(mobile=>{sessionStorage.removeItem('fp-ticket');localStorage.setItem('fp-settings',JSON.stringify({quality:mobile?'low':'high'}));let seed=645;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);},mobile);
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}/?venue=${venue}&lobby=1`);
  await page.waitForFunction(()=>window.__fp&&!document.querySelector('#enterBtn').disabled,{timeout:120000});
  await page.click('#enterBtn');
  await page.evaluate(async ({venue,song})=>{const {SETLISTS}=await import('/js/programs.js');__fp.ui.emit('select',SETLISTS[venue].indexOf(song));},{venue,song});
  await page.waitForFunction(song=>__fp.phase==='playing'&&__fp.perf.playing&&__fp.perf.piece.id===song,{timeout:90000},song);
  await page.evaluate(start=>{if(start>=__fp.perf.duration)throw Error('Start exceeds score');__fp.perf.seek(start);},start);
  await page.click('[data-mode="cinema"]');
  const result=await page.evaluate(async seconds=>{
    const f=__fp, stream=f.renderer.domElement.captureStream(30), tap=f.engine.ctx.createMediaStreamDestination();
    f.engine.limiter.connect(tap);stream.addTrack(tap.stream.getAudioTracks()[0]);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:5000000});
    const chunks=[],shots=[];recorder.ondataavailable=e=>chunks.push(e.data);
    const stopped=new Promise(resolve=>recorder.onstop=resolve);let running=true,previous,raf;
    const tick=()=>{
      const s=f.director.cine.shot;
      if(s&&s!==previous){
        const tr=f.perf.piece.tracks.filter(t=>t.section===s.sid&&(!t.chairs||t.chairs.includes(s.ci)));
        const eligible=tr.some(t=>t.notes.some((v,i)=>i%4===0&&v<=f.perf.time+1.5&&v+t.notes[i+1]>=f.perf.time-.35&&t.notes[i+3]>0));
        shots.push({time:f.perf.time,kind:s.kind,sid:s.sid,ci:s.ci,angle:s.angle,view:s.view,hold:s.hold,cut:s.cut,pos:s.pos.toArray(),look:s.look.toArray(),eligible:s.sid?eligible:null,visible:document.visibilityState});previous=s;
      }
      if(running)raf=requestAnimationFrame(tick);
    };
    try{
      recorder.start();tick();await new Promise(r=>setTimeout(r,seconds*1000));running=false;cancelAnimationFrame(raf);recorder.stop();await stopped;
      const b64=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(';base64,')[1]);r.readAsDataURL(new Blob(chunks,{type:recorder.mimeType}));});
      return {b64,shots,phase:f.phase,song:f.perf.piece.id};
    }finally{running=false;cancelAnimationFrame(raf);if(recorder.state!=='inactive')recorder.stop();f.engine.limiter.disconnect(tap);stream.getTracks().forEach(t=>t.stop());}
  },seconds);
  fs.writeFileSync(`${outputDir}/${label}.webm`,Buffer.from(result.b64,'base64'));delete result.b64;
  const failures=[];
  if(errors.length)failures.push('Browser console/runtime errors');
  if(result.shots.some(s=>s.sid&&!s.eligible))failures.push('Silent or absent performer selected');
  if(result.shots.some(s=>s.hold<8||s.hold>12||s.visible!=='visible'))failures.push('Invalid shot timing or hidden page');
  if(result.shots.length<Math.floor(seconds/12))failures.push('Too few automatic edits');
  if(motionSource().sourceSHA256!==source.sourceSHA256)failures.push('Source changed during recording');
  await page.screenshot({path:`${outputDir}/${label}.png`});
  const report={source,venue,mobile,seconds,start,url:page.url(),title:await page.title(),...result,errors,failures,status:failures.length?'fail':'pass'};
  fs.writeFileSync(`${outputDir}/${label}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({venue,mobile,shots:result.shots,errors,failures}));
  if(failures.length)process.exitCode=1;
}finally{await page.evaluate(()=>window.__fp?.perf.pause()).catch(()=>{});await browser.disconnect();}
