// Deterministic visual/projection fixture, not a real-phone FPS/audio test.
// Run while server.js serves the target tree. See docs/SPHERE_IMMERSION.md.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out=process.env.OUTPUT_DIR || '/tmp/sphere-evidence/projection';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'],env:{...process.env,HOME:process.env.HOME}});
const page=await browser.newPage({viewport:{width:640,height:360},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error' && /shader|WebGL|program/i.test(m.text()))errors.push(m.text());});
await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
await page.addInitScript(()=>{
 let seed=417; Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 localStorage.setItem('fp-settings',JSON.stringify({quality:'low',crowdSphere:0,fireflies:false}));
 window.requestAnimationFrame=()=>0;
});
try {
 await page.goto((process.env.BASE_URL || 'http://127.0.0.1:8080/')+'?venue=sphere&lobby=',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__fp && !document.getElementById('enterBtn').disabled,null,{polling:100,timeout:180000});
 await page.addStyleTag({content:'body > :not(#stage) { visibility: hidden !important; }'});
 const meta=await page.evaluate(()=>{
  const f=__fp,gl=f.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  f.hall.dome.mesh.visible=true;
  return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),seats:f.hall.seats.length};
 });
 console.log('fixture ready',JSON.stringify(meta));
 const results=[];
 const cases = ['MOON','FOREST','ARCH'].flatMap(scene=>['center','side','upper'].map(pose=>({scene,pose})));
 cases.push(...['OCEAN','AURORA','SPRING','DECO','NEBULA','VOYAGE','FIREWORKS'].map(scene=>({scene,pose:'side'})));
 for(const {scene,pose} of cases)for(const mode of ['venue','immersive']){
  console.log('begin',scene,pose,mode);
  const result=await page.evaluate(({scene,pose,mode})=>{
   const f=__fp,d=f.hall.dome;
   d.setProjection?.(mode);d.go(scene,{dur:.01});d.update(1);d.uniforms.uTime.value=25;
   let p={x:0,y:19,z:34};
   if(pose!=='center'){
    const target=pose==='side'?{x:32,y:28,z:42}:{x:0,y:44,z:62};
    const s=f.hall.seats.reduce((a,b)=> Math.hypot(b.x-target.x,b.y-target.y,b.z-target.z)<Math.hypot(a.x-target.x,a.y-target.y,a.z-target.z)?b:a);
    p={x:s.x,y:s.y+1.25,z:s.z};
   }
   f.camera.position.set(p.x,p.y,p.z);f.camera.lookAt(p.x+0.18*80,p.y+0.52*80,p.z-0.83*80);f.camera.updateMatrixWorld();
   f.renderer.render(f.scene,f.camera);const gl=f.renderer.getContext();gl.finish();
   const ms=[];for(let i=0;i<2;i++){const start=performance.now();f.renderer.render(f.scene,f.camera);gl.finish();ms.push(performance.now()-start);}
   return {scene,pose,mode,position:p,ms,png:f.renderer.domElement.toDataURL('image/png').split(',')[1],calls:f.renderer.info.render.calls,triangles:f.renderer.info.render.triangles};
  },{scene,pose,mode});
  const file=`${scene}-${pose}-${mode}.png`;await fs.writeFile(path.join(out,file),Buffer.from(result.png,'base64'));delete result.png;
  results.push({...result,file});console.log(file,JSON.stringify(result.ms));
 }
 // Calibration is a production-shader branch, not a replacement shader.
 const calibration=await page.evaluate(()=>{const f=__fp;f.hall.dome.go('MOON',{dur:.01});f.hall.dome.update(1);f.hall.dome.setCalibration(true);f.renderer.render(f.scene,f.camera);return f.renderer.domElement.toDataURL('image/png').split(',')[1];});
 await fs.writeFile(path.join(out,'calibration-upper.png'),Buffer.from(calibration,'base64'));
 await page.evaluate(()=>__fp.hall.dome.setCalibration(false));
 // Setting event + persistence, without restarting music or creating a room.
 const setting=await page.evaluate(()=>{
  const b=document.querySelector('[data-projection="venue"]');b.click();
  return {mode:__fp.hall.dome.projection,saved:JSON.parse(localStorage.getItem('fp-settings')).domeProjection,pressed:b.getAttribute('aria-pressed'),fieldHidden:document.getElementById('domeProjectionField').hidden};
 });
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({meta,errors,setting,results,limitations:'Software-rendered frozen low-quality app, no audience, system fonts, no audio or real-device performance claim.'},null,2));
 if(errors.length || setting.mode!=='venue' || setting.saved!=='venue')throw new Error('shader or setting regression');
} finally {await browser.close();}
