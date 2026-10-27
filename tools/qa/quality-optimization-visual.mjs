import { p, outputDir } from './quality-optimization-common.mjs';
import fs from'node:fs';
const b=await p.connect({browserURL:'http://127.0.0.1:9224',defaultViewport:null});const page=(await b.pages()).find(x=>x.url().includes(':8096'));
await page.evaluate(()=>{__fp.perf.pause();window._qaRAF=requestAnimationFrame;window._qaQueued=[];window.requestAnimationFrame=cb=>(_qaQueued.push(cb),-1);});await new Promise(r=>setTimeout(r,100));
try{
const results=await page.evaluate(async()=>{
const T=await import('/vendor/three/three.module.js'),f=__fp,r=f.renderer;
const sources=f.orchestra.players.concat({char:f.orchestra.conductor.char}).flatMap(p=>Object.values(p.char.arms).flatMap(a=>Object.values(a).filter(m=>m?.isMesh)));
const batches=f.scene.children.filter(m=>m.name==='musician-arms');if(!batches.length)throw Error('No full-quality batches');
const target=new T.WebGLRenderTarget(600,400),prev=r.getRenderTarget(),camera=f.camera.clone();camera.aspect=1.5;camera.updateProjectionMatrix();
const render=mode=>{for(const s of sources)s.visible=mode==='original';for(const m of batches)m.visible=mode==='batched'&&m.count>0;r.shadowMap.needsUpdate=true;r.setRenderTarget(target);r.render(f.scene,camera);const a=new Uint8Array(600*400*4);r.readRenderTargetPixels(target,0,0,600,400,a);return a;};
const png=a=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d'),d=x.createImageData(600,400);for(let y=0;y<400;y++)d.data.set(a.subarray(y*2400,(y+1)*2400),(399-y)*2400);x.putImageData(d,0,0);return c.toDataURL();};
const output=[];try{for(const view of ['stage','close','reverse']){
 if(view==='close'){const p=f.orchestra.players[0].char.root.position;camera.position.copy(p).add(new T.Vector3(.3,1.5,2));camera.lookAt(p.x,p.y+1,p.z);}
 if(view==='reverse'){camera.position.set(0,3,-17);camera.lookAt(0,4,15);}
 camera.updateMatrixWorld(true);render('original');render('batched');const a=render('original'),z=render('batched');let sum=0,max=0,changed=0;for(let i=0;i<a.length;i+=4){let pm=0;for(let k=0;k<3;k++){const d=Math.abs(a[i+k]-z[i+k]);sum+=d;max=Math.max(max,d);pm=Math.max(pm,d);}if(pm>8)changed++;}
 output.push({view,mae:sum/(600*400*3),max,pixelsOver8:changed,pixelCount:600*400,original:png(a),batched:png(z)});
 }}finally{for(const s of sources)s.visible=false;for(const m of batches)m.visible=m.count>0;r.setRenderTarget(prev);target.dispose();r.shadowMap.needsUpdate=true;}return output;
});for(const row of results){for(const k of ['original','batched']){fs.writeFileSync(`${outputDir}/equivalence-${process.argv[2]}-${row.view}-${k}.png`,Buffer.from(row[k].split(',')[1],'base64'));delete row[k];}}fs.writeFileSync(`${outputDir}/equivalence-${process.argv[2]}.json`,JSON.stringify(results,null,2));console.log(results);
}finally{await page.evaluate(()=>{window.requestAnimationFrame=_qaRAF;for(const cb of _qaQueued)_qaRAF(cb);delete window._qaQueued;delete window._qaRAF;});await b.disconnect();}
