import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const { p } = await import(pathToFileURL(`${process.cwd()}/tools/qa/quality-optimization-common.mjs`));
const label = process.argv[2];
const b = await p.connect({ browserURL: 'http://127.0.0.1:9224', defaultViewport: null });
try {
  const page = (await b.pages()).find(p => p.url().includes('8096'));
  await page.waitForFunction(() => window.__fp?.perf?.playing && __fp.director.mode === 'cinema', {timeout:90000});
  const samples = await page.evaluate(async () => {
    const THREE = await import('three'), f = __fp, rows = [];
    for (let i = 0; i < 200; i++) {
      const s = f.director.cine.shot;
      if (s?.lookEnd) {
        const subjects = f.orchestra.players.filter(p => p.char.root.visible && f.perf.piece.tracks.some(t =>
          t.section === p.sid && (!t.chairs || t.chairs.includes(p.ci)) && t.notes.length && (t.gain ?? 1) > 0));
        const projected = subjects.map(p => {
          const base = p.char.root.getWorldPosition(new THREE.Vector3());
          const points = [1.25,.65].map(y => base.clone().add(new THREE.Vector3(0,y*p.char.scale,0)).project(f.camera).toArray());
          return {sid:p.sid,ci:p.ci,points,foreground:points.every(([x,y,z])=>Math.abs(x)<.9&&y>-.92&&y<.12&&z>-1&&z<1)};
        });
        rows.push({time:f.perf.time,pos:f.camera.position.toArray(),pitch:f.director.pitch,view:s.view,
          foreground:projected.filter(p=>p.foreground).length,required:Math.min(3,subjects.length),projected});
      }
      await new Promise(r => setTimeout(r,250));
    }
    return rows;
  });
  const result = {samples, minForeground:samples.length?Math.min(...samples.map(s=>s.foreground)):0,
    pass:samples.length>0&&samples.every(s=>s.foreground>=s.required)};
  fs.writeFileSync(`../outdoor-exclusive-qa/grand-reveal/${label}-motion.json`, JSON.stringify(result,null,2));
  console.log({label,samples:samples.length,minForeground:result.minForeground,pass:result.pass,first:samples[0]?.pos,last:samples.at(-1)?.pos});
} finally { await b.disconnect(); }
