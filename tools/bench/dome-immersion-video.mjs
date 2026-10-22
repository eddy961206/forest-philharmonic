// Identical diagnostic camera path on two independent product servers.
// PNG frame sequence is deliberately sampled at 12 fps; NOT an app-FPS test.
import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.OUTPUT_DIR||'/tmp/sphere-evidence/video';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'],env:{...process.env}});
const report={scope:'MOON and FOREST, 48 frames each per product; diagnostic translation path, low 640x360 DPR1, audience0; identical deterministic synthetic level envelope, no audio/listening verification',sides:[]};
try{for(const [side,base]of [['before',process.env.BASELINE_URL||'http://127.0.0.1:8081'],['after',process.env.BASE_URL||'http://127.0.0.1:8080']]){
 const page=await browser.newPage({viewport:{width:640,height:360},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|program/i.test(m.text()))errors.push(m.text());});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.addInitScript(()=>{let seed=417;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};localStorage.setItem('fp-settings',JSON.stringify({quality:'low',crowdSphere:0,fireflies:false}));window.requestAnimationFrame=()=>0;});
 await page.goto(base+'/?venue=sphere&lobby=',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__fp&&!document.getElementById('enterBtn').disabled,null,{polling:100,timeout:600000});
 console.log(side,'ready');await fs.mkdir(path.join(out,side),{recursive:true});
 for(const scene of ['MOON','FOREST']){
 await page.evaluate(scene=>{const f=__fp;f.hall.dome.go(scene,{dur:.01});f.hall.setHouseLights(0);f.hall.update(10,25);f.hall.dome.mesh.visible=true;},scene);
 for(let i=0;i<48;i++){
  const png=await page.evaluate(i=>{const f=__fp;const t=i/47;const x=-18+36*t;
   f.camera.position.set(x,19,34);f.camera.lookAt(x+Math.sin((t-.5)*.5)*70,24,-36);f.camera.fov=64;f.camera.updateProjectionMatrix();f.camera.updateMatrixWorld();
   f.hall.feed({time:25+i/12,level:0.08+0.08*Math.sin(i/47*Math.PI*2),playing:true});
   f.hall.update(1/12,25+i/12);f.hall.dome.uniforms.uTime.value=25+i/12;f.renderer.render(f.scene,f.camera);f.renderer.getContext().finish();return f.renderer.domElement.toDataURL().split(',')[1];
  },i);await fs.writeFile(path.join(out,side,String((scene==='MOON'?0:48)+i).padStart(3,'0')+'.png'),Buffer.from(png,'base64'));
 }
 }
 report.sides.push({side,errors});console.log(side,'96 frames');await page.close();
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(report.sides.some(s=>s.errors.length))throw new Error('browser errors');
}finally{await browser.close();}
