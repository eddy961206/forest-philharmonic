import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {disposeComposer, sameQualitySetting} from '../public/js/render-resources.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {Avatars} from '../public/js/scene/avatars.js';
import {releaseCharacter} from '../public/js/scene/characters.js';
import {setLite} from '../public/js/scene/materials.js';

for(const lite of [false,true]) test(`avatar reconnect releases only owned materials (lite=${lite})`,t=>{
 const previous=globalThis.document;
 const ctx=new Proxy({measureText:s=>({width:s.length*15})},{get:(o,k)=>o[k]||(k.startsWith('create')?()=>({addColorStop(){}}):()=>{})});
 globalThis.document={createElement:()=>({getContext:()=>ctx})};setLite(lite);
 t.after(()=>{globalThis.document=previous;setLite(false)});
 const scene=new THREE.Scene(),avatars=new Avatars(scene,[]);
 for(let n=0;n<4;n++){
  const a=avatars.add({id:1,name:'visitor',avatar:'rabbit'}),c=a.char;
  const owned=[...c.ownedMaterials];assert.equal(owned.length,5,'skirt, two highlights and two blush materials');
  const disposed=new Map();for(const m of owned)m.addEventListener('dispose',()=>disposed.set(m,(disposed.get(m)||0)+1));
  let sharedDisposals=0,textureDisposals=0;const shared=new Set();
  const nonOwnedDisposed=[];
  c.root.traverse(o=>{
   if(!o.material||c.ownedMaterials.has(o.material))return;
   o.material.addEventListener('dispose',()=>nonOwnedDisposed.push(o.material));
   // Avatar-owned name-tag sprites are disposed separately. Only character
   // mesh materials here belong to the shared material library.
   if(o.isMesh)shared.add(o.material);
  });
  let tagTextureDisposals=0;
  a.tag.material.map.addEventListener('dispose',()=>tagTextureDisposals++);
  for(const m of shared)m.addEventListener('dispose',()=>sharedDisposals++);
  for(const tex of new Set(owned.map(m=>m.map).filter(Boolean)))tex.addEventListener('dispose',()=>textureDisposals++);
  avatars.clear();releaseCharacter(c);
  assert.equal(c.root.parent,null);assert.equal(avatars.list.size,0);assert.equal(c.ownedMaterials.size,0);
  for(const m of owned)assert.equal(disposed.get(m),1);
  assert.deepEqual(nonOwnedDisposed,[a.tag.material],'the formerly misclassified disposal is exactly the name-tag material');
  assert.equal(tagTextureDisposals,1);
  assert.equal(sharedDisposals,0);assert.equal(textureDisposals,0);
 }
});

test('composer cleanup supplements the real vendored bloom high-pass disposal once',()=>{
 const bloom=new UnrealBloomPass(new THREE.Vector2(8,8));let highPass=0,composite=0,composerCount=0;
 bloom.materialHighPassFilter.addEventListener('dispose',()=>highPass++);
 bloom.compositeMaterial.addEventListener('dispose',()=>composite++);
 const composer={passes:[bloom],dispose(){composerCount++}};
 disposeComposer(composer);disposeComposer(composer);disposeComposer(null);
 assert.equal(highPass,1);assert.equal(composite,1);assert.equal(composerCount,1);
});

test('same quality is a no-op before saving or resetting adaptive state',()=>{
 for(const quality of ['auto','low','medium','high','efficient']){
  assert.equal(sameQualitySetting({quality},'quality',quality),true);
  assert.equal(sameQualitySetting({quality},'volume',quality),false);
  assert.equal(sameQualitySetting({quality},'quality',quality==='high'?'low':'high'),false);
 }
 const preferences=readFileSync(new URL('../public/js/app/preferences.js',import.meta.url),'utf8');
 const onSetting=preferences.slice(preferences.indexOf('function onSetting(key, value) {'),preferences.indexOf('return { onSetting }'));
 assert.ok(onSetting.indexOf('if (sameQualitySetting(settings, key, value)) return;')>=0);
 assert.ok(onSetting.indexOf('if (sameQualitySetting(settings, key, value)) return;')<onSetting.indexOf('settings[key] = value;'));
 const graphics=readFileSync(new URL('../public/js/app/graphics.js',import.meta.url),'utf8');
 assert.equal((graphics.match(/disposeComposer\(composer\)/g)||[]).length,2,'preset rebuild and context-loss cleanup');
});
