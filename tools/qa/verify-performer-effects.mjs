// Actual three-venue effects capture. QA_OUT and PUPPETEER_PATH are handled by the common helper.
import fs from 'node:fs';
import { p, outputDir as output } from './quality-optimization-common.mjs';
import { motionSource } from './motion-source.mjs';
const browser = await p.connect({ browserURL: `http://127.0.0.1:${process.env.CDP_PORT || 9224}`, defaultViewport: null });
const source = motionSource(), reports = [], pages = [];
try {
 for (const venue of ['outdoor', 'hall', 'sphere']) {
  const page = await browser.newPage();
  pages.push(page);
  await page.bringToFront();
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
   sessionStorage.removeItem('fp-ticket');
   localStorage.setItem('fp-settings', JSON.stringify({ quality: 'high', skipStageTransitions: true, notes: true, glow: true }));
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${process.env.APP_PORT || 8096}/?venue=${venue}&lobby=1`);
  await page.waitForFunction(() => window.__fp && !document.querySelector('#enterBtn').disabled, { timeout: 120000 });
  await page.click('#enterBtn');
  const song = await page.evaluate(async venue => {
   const { SETLISTS } = await import('/js/programs.js');
   const ids = SETLISTS[venue];
   const song = ['mozart-symphony-40', 'beethoven-symphony-5', 'strauss-radetzky-march', 'offenbach-can-can'].find(id => ids.includes(id));
   if (!song) throw Error('No ensemble QA score');
   __fp.ui.emit('select', ids.indexOf(song)); return song;
  }, venue);
  await page.waitForFunction(song => __fp.phase === 'playing' && __fp.perf.piece.id === song, { timeout: 90000 }, song);
  await page.evaluate(async () => {
   const f = __fp, THREE = await import('three'), player = f.orchestra.playerAt('vc', 0);
   f.director.update = () => {};
   f.camera.position.copy(player.char.root.localToWorld(new THREE.Vector3(1.8, 2.0, -3.4)));
   f.camera.lookAt(player.char.root.localToWorld(new THREE.Vector3(-.5, .4, .1)));
   f.camera.fov = 52; f.camera.updateProjectionMatrix(); f.perf.seek(15);
  });
  const modes = [];
  for (const mode of ['active', 'off', 'efficient']) {
   await page.evaluate(mode => {
    __fp.ui.onSetting('notes', mode !== 'off'); __fp.ui.onSetting('glow', mode !== 'off');
    __fp.ui.onSetting('quality', mode === 'efficient' ? 'efficient' : 'high');
   }, mode);
   await new Promise(r => setTimeout(r, 2000));
   if (mode !== 'off') await page.waitForFunction(() => __fp.orchestra.particles.stats.visible > 0 && __fp.orchestra.players.some(p => p.glow.visible), { timeout: 15000 });
   const state = await page.evaluate(() => ({
    notes: __fp.orchestra.particles.stats,
    glow: __fp.orchestra.players.filter(p => p.glow.visible).map(p => ({ sid: p.sid, ci: p.ci, opacity: p.glow.material.opacity, active: p.effectsActive, ready: p.ready })),
    quality: __fp.qualityState, time: __fp.perf.time, settings: { notes: __fp.settings.notes, glow: __fp.settings.glow },
   }));
   await page.screenshot({ path: `${output}/${venue}-${mode}.png` });
   modes.push({ mode, ...state });
  }
  const video = await page.evaluate(async () => {
   const stream = __fp.renderer.domElement.captureStream(24), chunks = [];
   const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 3500000 });
   recorder.ondataavailable = e => chunks.push(e.data);
   const stopped = new Promise(r => recorder.onstop = r);
   recorder.start(); await new Promise(r => setTimeout(r, 4000)); recorder.stop(); await stopped;
   stream.getTracks().forEach(t => t.stop());
   return await new Promise(r => { const reader = new FileReader(); reader.onload = () => r(reader.result.split(',')[1]); reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); });
  });
  fs.writeFileSync(`${output}/${venue}-efficient.webm`, Buffer.from(video, 'base64'));
  const failures = [];
  for (const state of modes) {
   if (state.mode === 'off' && (state.notes.visible || state.glow.length)) failures.push('off did not clear');
   if (state.mode !== 'off' && (!state.notes.visible || !state.glow.length)) failures.push(`${state.mode} missing effects`);
   if (state.mode === 'efficient' && state.notes.visible > 24) failures.push('efficient note budget exceeded');
   if (state.glow.some(g => !g.active)) failures.push('inactive performer glows');
  }
  reports.push({ venue, song, modes, errors, failures });
  await page.evaluate(() => __fp.perf.pause()); await page.close();
 }
 const unchanged = source.sourceSHA256 === motionSource().sourceSHA256;
 fs.writeFileSync(`${output}/report.json`, JSON.stringify({ source, unchanged, reports }, null, 2));
 console.log(JSON.stringify({ unchanged, results: reports.map(r => ({ venue: r.venue, failures: r.failures, errors: r.errors, modes: r.modes.map(m => ({ mode: m.mode, notes: m.notes, glow: m.glow.length })) })) }, null, 2));
 if (!unchanged || reports.some(r => r.errors.length || r.failures.length)) process.exitCode = 1;
} finally {
 await Promise.allSettled(pages.filter(page => !page.isClosed()).map(page => page.close()));
 await browser.disconnect();
}
