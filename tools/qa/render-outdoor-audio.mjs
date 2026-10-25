// Compact signal check for the actual outdoor audio graph and its new scores.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {p, outputDir} from './quality-optimization-common.mjs';
import {motionSource} from './motion-source.mjs';
const catalog=JSON.parse(fs.readFileSync('tools/repertoire.json','utf8')).filter(x=>x.venue==='outdoor');
const source=motionSource();
const browser=await p.connect({browserURL:`http://127.0.0.1:${process.env.CDP_PORT||9224}`,defaultViewport:null});
const page=await browser.newPage(),errors=[];
const report={source,secondsPerPiece:12,venue:'outdoor',errors,results:[],status:'fail'};
try{
  const base=`http://127.0.0.1:${process.env.APP_PORT||8096}`;
  for(const old of await browser.pages())if(old!==page&&old.url().startsWith(base))await old.evaluate(()=>window.__fp?.perf.pause()).catch(()=>{});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${base}/favicon.svg`);
  report.bank=await page.evaluate(fs.readFileSync('tools/qa/render-repertoire.js','utf8'));
  assert.equal(report.bank.failures.length,0,'sample decode failures');
  for(const entry of catalog){
    const start=entry.id==='mozart-symphony-40'?55:entry.id==='dvorak-humoresque-7'?20:8;
    const result=await page.evaluate(({id,start})=>renderRepertoireExcerpt(id,start,12,'outdoor'),{id:entry.id,start});
    report.results.push(result);
    assert.ok(result.peak>0.001,`${entry.id}: silence`);
    assert.equal(result.clipped,0,`${entry.id}: clipping`);
    assert.equal(result.nonfinite,0,`${entry.id}: nonfinite`);
    assert.equal(result.error,null,`${entry.id}: rendering error`);
    if(['mozart-symphony-40','elgar-salut-damour'].includes(entry.id)){
      const wav=await page.evaluate(id=>repertoireWav(id),entry.id);
      fs.writeFileSync(`${outputDir}/${entry.id}.wav`,Buffer.from(wav,'base64'));
    }
    await page.evaluate(id=>delete repertoireQA.buffers[id],entry.id);
  }
  assert.equal(errors.length,0);
  assert.equal(motionSource().sourceSHA256,source.sourceSHA256,'Source changed during rendering');
  report.status='pass';
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{
  fs.writeFileSync(`${outputDir}/audio.json`,JSON.stringify(report,null,2));
  await page.close();await browser.disconnect();console.log(JSON.stringify(report));
}
