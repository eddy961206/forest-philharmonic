// Isolated real-WebGL cube-world smoke. Not full-app performance evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out=process.env.OUTPUT_DIR || '/tmp/sphere-evidence/cubes';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'],env:{...process.env}});
try {
 const page=await browser.newPage({viewport:{width:320,height:180}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const base=process.env.BASE_URL || 'http://127.0.0.1:8080';
 await page.route('**/__projection_fixture*',r=>r.fulfill({contentType:'text/html',body:`<script type="importmap">{"imports":{"three":"/vendor/three/three.module.js"}}</script><body style="margin:0"></body>`}));
 await page.goto(base+'/__projection_fixture?venue=sphere');
 await page.evaluate(async()=>{
  const THREE=await import('/vendor/three/three.module.js');const {buildDome}=await import('/js/scene/domeshow.js');
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(320,180);document.body.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(64,320/180,.1,260);
  camera.position.set(25,35,52);camera.lookAt(0,45,-20);camera.updateMatrixWorld();
  const dome=buildDome({renderer,quality:'low',projection:'immersive'});scene.add(dome.mesh);dome.setViewers([{cam:camera}]);
  window.fixture={renderer,scene,camera,dome};
 });
 const rows=[];
 for(const world of ['FOREST3D','OCEAN3D','CLOUDS3D','PEAKS3D']){
  console.log('begin',world);
  const r=await page.evaluate(world=>{
   const {renderer,scene,camera,dome}=fixture;dome.go(world,{dur:.01});dome.update(1);dome.drawWorlds();renderer.render(scene,camera);
   const gl=renderer.getContext();gl.finish();const pixel=new Uint8Array(320*180*4);gl.readPixels(0,0,320,180,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
   let lit=0;for(let i=0;i<pixel.length;i+=4)if(pixel[i]+pixel[i+1]+pixel[i+2]>10)lit++;
   const ext=gl.getExtension('WEBGL_debug_renderer_info');
   return {world,litPixels:lit,error:gl.getError(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,png:renderer.domElement.toDataURL().split(',')[1]};
  },world);
  await fs.writeFile(path.join(out,world+'.png'),Buffer.from(r.png,'base64'));delete r.png;rows.push(r);console.log(JSON.stringify(r));
 }
 // Crossfade two live cube slots, switch projection on the same static camera.
 const transition=await page.evaluate(()=>{
  const f=fixture;f.dome.go('FOREST3D',{dur:4});f.dome.update(2);f.dome.drawWorlds();f.renderer.render(f.scene,f.camera);
  const before=f.dome.uniforms.uTime.value;f.dome.setProjection('venue');f.dome.drawWorlds();f.renderer.render(f.scene,f.camera);
  return {glError:f.renderer.getContext().getError(),timePreserved:before===f.dome.uniforms.uTime.value,overlayVisible:f.dome.mesh.children[0].visible};
 });
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({rows,transition,errors,scope:'isolated dome, low cube resolution 384, actual WebGL shaders; no full venue/audio/real device test'},null,2));
 if(errors.length||rows.some(r=>r.error!==0||r.litPixels<100)||transition.glError!==0||!transition.timePreserved)throw new Error('cube smoke failed');
}finally{await browser.close();}
