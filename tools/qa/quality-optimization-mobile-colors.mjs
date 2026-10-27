import { p, outputDir } from './quality-optimization-common.mjs';
import fs from'node:fs';const b=await p.connect({browserURL:'http://127.0.0.1:9224',defaultViewport:null});const page=(await b.pages()).find(p=>p.url().includes(':8096'));
const result=await page.evaluate(async()=>{
 const {syncLiteArms}=await import('/js/scene/characters.js');
 const meshes=__fp.scene.children.filter(m=>m.isInstancedMesh&&[.055,.058].includes(m.geometry.parameters?.radius));
 if(meshes.length!==2)throw Error('Expected both mobile arm batches');
 const before=meshes.map(m=>m.instanceColor.version);for(let i=0;i<120;i++)syncLiteArms();const unchanged=meshes.map((m,i)=>m.instanceColor.version-before[i]);
 const char=__fp.orchestra.players.find(p=>p.char.root.visible).char,visible=char.root.visible;const states=[];
 try{for(const hidden of [true,false]){char.root.visible=!hidden;syncLiteArms();const expected=meshes.map(m=>m.instanceColor.array.slice(0,m.count*3));const counts=meshes.map(m=>m.count);for(const m of meshes)m.instanceColor.array.fill(NaN);syncLiteArms();states.push({hidden,counts,sameAsFullRewrite:meshes.every((m,j)=>expected[j].every((v,i)=>v===m.instanceColor.array[i]))});}}
 finally{char.root.visible=visible;syncLiteArms();}
 return {unchanged120SyncColorVersionDeltas:unchanged,states,viewport:[innerWidth,innerHeight],devicePixelRatio,quality:__fp.quality,errors:[]};
});fs.writeFileSync(outputDir+'/mobile-colors.json',JSON.stringify(result,null,2));console.log(result);await b.disconnect();
