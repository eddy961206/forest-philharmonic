// Real browser flow + optional continuous WebGL/Web Audio capture.
// Start the app and a dedicated cdp-direct browser first. Keep performance
// measurements separate from this recorder and from numerical motion tests.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { p, outputDir } from './quality-optimization-common.mjs';
import { motionSource } from './motion-source.mjs';

const mobile = process.env.MOBILE === '1';
const record = process.argv.includes('--record');
const label = mobile ? 'mobile' : 'desktop';
const base = `http://127.0.0.1:${process.env.APP_PORT || 8096}`;
const browser = await p.connect({ browserURL: `http://127.0.0.1:${process.env.CDP_PORT || 9224}`, defaultViewport: null });
const page = await browser.newPage();
const result = { source: motionSource(), createdAt: new Date().toISOString(), mobile, record, checks: [], errors: [], warnings: [] };
const check = (name, detail) => { result.checks.push({ name, detail }); console.log(JSON.stringify({ name, detail })); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
page.on('pageerror', error => result.errors.push(String(error)));
page.on('console', msg => { if (msg.type() === 'error') result.errors.push(msg.text()); else if (msg.type() === 'warn') result.warnings.push(msg.text()); });
try {
  for (const old of await browser.pages()) if (old !== page && old.url().startsWith(base)) await old.close();
  await page.bringToFront();
  await page.setUserAgent(mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' : await browser.userAgent());
  await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(mobile => {
    if (!location.search) { sessionStorage.removeItem('fp-ticket'); localStorage.removeItem('fp-last-ticket'); }
    localStorage.setItem('fp-settings', JSON.stringify({ quality: mobile ? 'low' : 'high', crowdOutdoor: 55 }));
    let seed = 2326; Math.random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  }, mobile);
  // Reach the booth at its real interaction point, then use visible controls.
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__plaza, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#pzLoading').classList.contains('done'));
  await page.evaluate(() => { __plaza.player.pos.set(0, 0, .25); });
  await page.waitForFunction(() => !document.querySelector('#pzAct').hidden, { timeout: 15000 });
  await page.click('#pzAct');
  await page.waitForSelector('.venue-card.outdoor button', { visible: true });
  await page.screenshot({ path: `${outputDir}/${label}-venue-choice.png` });
  await page.click('.venue-card.outdoor button');
  await page.click('.mode-card[data-mode="solo"]');
  await page.click('#toPay');
  await page.click('#payBtn');
  await page.waitForFunction(() => __plaza.ticket?.venue === 'outdoor', { timeout: 15000 });
  check('ticket', await page.evaluate(() => ({ venue: __plaza.ticket.venue, text: document.querySelector('#boothTicket').innerText })));
  await page.click('#boothDone');
  await page.evaluate(() => { const g = __plaza.PLAZA.gates.outdoor; __plaza.player.pos.set(g.x * .92, 0, g.z * .92); });
  // A held matching ticket enters automatically when the visitor reaches
  // the gate; there is no second confirmation button in this flow.
  await page.waitForFunction(() => window.__fp && location.search.includes('outdoor'), { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('#tcEnter').disabled, { timeout: 120000 });
  await page.click('#tcEnter');
  await page.waitForFunction(() => !document.querySelector('#splash') || getComputedStyle(document.querySelector('#splash')).opacity === '0', { timeout: 15000 });
  await page.waitForFunction(() => __fp.stats.calls > 0, { timeout: 20000 });
  check('gate-entry', { url: page.url(), title: await page.title() });
  await page.screenshot({ path: `${outputDir}/${label}-arrival.png` });
  await page.evaluate(async () => {
    const { SETLISTS } = await import('/js/programs.js');
    __fp.ui.emit('select', SETLISTS.outdoor.indexOf('mozart-symphony-40'));
  });
  await page.waitForFunction(() => __fp.phase === 'playing' && __fp.perf.playing && __fp.perf.piece.id === 'mozart-symphony-40', { timeout: 90000 });
  await page.evaluate(() => __fp.perf.seek(199));
  const seat = await page.evaluate(() => {
    const f = __fp, seat = f.hall.seats.filter(s => !s.stage && !f.director.occupied.has(s.index))
      .sort((a, b) => Math.abs(a.z - 10) + Math.abs(a.x) - Math.abs(b.z - 10) - Math.abs(b.x))[0];
    if (!seat) throw Error('No free outdoor seat');
    f.director.sitAt(seat); return seat.label;
  });
  await sleep(1800);
  assert.equal(await page.evaluate(() => __fp.director.mode), 'seat');
  await page.screenshot({ path: `${outputDir}/${label}-seated.png` });
  check('sit', seat);
  await page.click('[data-mode="walk"]');
  assert.equal(await page.evaluate(() => __fp.director.mode), 'walk');
  check('stand', 'Walk button returns to grass');
  await page.click('[data-mode="cinema"]');
  await page.evaluate(() => {
    const d = __fp.director; d.placeAt({ x: 13, y: 5.8, z: 22 }, { x: 0, y: 2.5, z: -5 });
    d.targetFov = d.fov = 55; d.cine.shot = { kind: 'qa-outdoor', hold: Infinity }; d.cine.until = Infinity; d.cine.drift = null;
  });
  await sleep(1000);
  await page.screenshot({ path: `${outputDir}/${label}-concert.png` });
  check('actual-playing', await page.evaluate(() => ({ song: __fp.perf.piece.id, time: __fp.perf.time, phase: __fp.phase, visible: document.visibilityState, seats: __fp.hall.seats.filter(s => !s.stage).length, quality: __fp.quality, calls: __fp.stats.calls })));
  if (record) {
    const movie = await page.evaluate(async () => {
      const f = __fp, stream = f.renderer.domElement.captureStream(30), tap = f.engine.ctx.createMediaStreamDestination();
      f.engine.limiter.connect(tap); stream.addTrack(tap.stream.getAudioTracks()[0]);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 5000000 });
      const chunks = []; recorder.ondataavailable = e => chunks.push(e.data);
      const stopped = new Promise(resolve => recorder.onstop = resolve);
      const views = [
        { feet: { x: 13, y: 5.8, z: 22 }, look: { x: 0, y: 2.5, z: -5 }, fov: 55 },
        { feet: { x: 0, y: 1.1, z: 13 }, look: { x: 0, y: 2.8, z: -6 }, fov: 62 },
        { feet: { x: -4, y: 2.8, z: 2 }, look: { x: 0, y: 2.5, z: -6 }, fov: 56 },
      ];
      const samples = [];
      try {
        recorder.start();
        for (const view of views) {
          f.director.placeAt(view.feet, view.look); f.director.targetFov = f.director.fov = view.fov;
          for (let i = 0; i < 8; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            samples.push({ time: f.perf.time, phase: f.phase, playing: f.perf.playing, calls: f.stats.calls, visible: document.visibilityState });
          }
        }
        recorder.stop(); await stopped;
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const b64 = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(';base64,')[1]); reader.readAsDataURL(blob); });
        return { b64, samples };
      } finally { if (recorder.state !== 'inactive') recorder.stop(); f.engine.limiter.disconnect(tap); stream.getTracks().forEach(track => track.stop()); }
    });
    assert(movie.samples.every(s => s.playing && s.phase === 'playing' && s.visible === 'visible' && s.calls > 0));
    fs.writeFileSync(`${outputDir}/${label}-concert.webm`, Buffer.from(movie.b64, 'base64'));
    result.recording = movie.samples;
  }
  // Hidden indoor effects must not keep a second render or lobby semantics alive.
  check('outdoor-contract', await page.evaluate(async () => {
    const { VENUE } = await import('/js/scene/venue.js');
    return { venue: VENUE, stage: __fp.hall.group.name, crowd: __fp.settings.crowdOutdoor, audioState: __fp.engine.ctx.state, drawingBuffer: [__fp.renderer.domElement.width, __fp.renderer.domElement.height], horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
  }));
  assert.equal(result.errors.length, 0, result.errors.join('\n'));
  result.status = 'pass';
} catch (error) { result.status = 'fail'; result.failure = String(error); process.exitCode = 1; console.error(error); }
finally {
  await page.evaluate(() => window.__fp?.perf.pause()).catch(() => {});
  fs.writeFileSync(`${outputDir}/${label}-flow.json`, JSON.stringify(result, null, 2));
  await browser.disconnect();
}
