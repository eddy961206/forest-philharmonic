// Functional regression only. Dedicated CDP browser; no FPS/performance claims.
// APP_PORT=8096 CDP_PORT=9225 QA_OUT=... node tools/qa/verify-accessibility-modes.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { p, outputDir } from './quality-optimization-common.mjs';
import { motionSource } from './motion-source.mjs';
const base = `http://127.0.0.1:${process.env.APP_PORT || 8096}`;
const browser = await p.connect({ browserURL: `http://127.0.0.1:${process.env.CDP_PORT || 9225}`, defaultViewport: null });
const page = await browser.newPage();
const result = { createdAt: new Date().toISOString(), source: motionSource(), environment: 'Desktop Chrome, iPad Chrome UA + MacIntel platform + touch emulation; not actual iPadOS', checks: [], errors: [], warnings: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const check = (name, data) => { result.checks.push({ name, data }); console.log(name, JSON.stringify(data)); };
const shot = name => page.screenshot({ path: `${outputDir}/${name}.png` });
page.on('pageerror', e => result.errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') result.errors.push(m.text()); if (m.type() === 'warn') result.warnings.push(m.text()); });
let releaseModule;
try {
  await page.bringToFront();
  await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1');
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
    window.__fullscreenCalls = 0;
    Element.prototype.requestFullscreen = function () { window.__fullscreenCalls++; return Promise.resolve(); };
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.setItem('fp-settings', JSON.stringify({ quality: 'medium', volume: 0.63, fireflies: true, screen: true, notes: true })); sessionStorage.removeItem('fp-ticket'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__plaza && document.querySelector('#pzLoading').classList.contains('done'), { timeout: 90000 });
  await page.evaluate(() => __plaza.player.pos.set(0, 0, .25));
  await page.waitForSelector('#pzAct:not([hidden])', { timeout: 15000 });
  await page.click('#pzAct');
  await page.waitForSelector('#pzEfficient', { visible: true });
  await page.click('#pzEfficient');
  const plaza = await page.evaluate(() => ({ url: location.href, title: document.title, checked: document.querySelector('#pzEfficient').checked, settings: JSON.parse(localStorage.getItem('fp-settings')), dpr: __plaza.renderer.getPixelRatio(), text: document.querySelector('#booth').innerText }));
  assert.equal(plaza.settings.quality, 'efficient'); assert.equal(plaza.settings.volume, 0.63); assert.ok(plaza.dpr <= 1);
  check('plaza-visible-toggle-persisted', plaza); await shot('01-plaza-efficient');
  await page.click('.venue-card.outdoor button');
  await page.click('.mode-card[data-mode="create"]');
  await page.type('#bkTitle', 'QA 비공개 모드 검증');
  await page.click('#bkVis [data-pub="0"]');
  await page.click('#toPay'); await page.click('#payBtn');
  await page.waitForFunction(() => __plaza.ticket?.venue === 'outdoor', { timeout: 20000 });
  check('private-ticket-issued', await page.evaluate(() => ({ venue: __plaza.ticket.venue, mode: __plaza.ticket.mode, pub: __plaza.ticket.pub })));

  // Delay the actual main module response: inspect the real initial HTML,
  // not a post-initialization assertion that could miss a visible flash.
  let intercepted = false;
  const gate = new Promise(resolve => { releaseModule = resolve; });
  await page.setRequestInterception(true);
  const intercept = async request => {
    if (new URL(request.url()).pathname === '/js/main.js') { intercepted = true; await gate; }
    if (!request.isInterceptResolutionHandled()) await request.continue();
  };
  page.on('request', intercept);
  const navigation = page.goto(`${base}/?venue=outdoor`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  while (!intercepted) await sleep(50);
  await page.waitForSelector('#lobby');
  const initial = await page.evaluate(() => ({ mainReady: !!window.__fp, hidden: document.querySelector('#lobby').hidden, display: getComputedStyle(document.querySelector('#lobby')).display, text: document.querySelector('#splash').innerText }));
  assert.equal(initial.mainReady, false); assert.equal(initial.hidden, true); assert.equal(initial.display, 'none');
  check('ticket-route-delayed-module-lobby-hidden', initial); await shot('02-delayed-ticket-loading');
  releaseModule(); await navigation; await page.setRequestInterception(false); page.off('request', intercept);
  await page.waitForFunction(() => window.__fp && !document.querySelector('#tcEnter').disabled, { timeout: 150000 });
  assert.equal(await page.evaluate(() => __fp.settings.quality), 'efficient');
  await shot('03-ticket-ready'); await page.click('#tcEnter');
  await page.waitForFunction(() => __fp.room?.connected && (!document.querySelector('#splash') || getComputedStyle(document.querySelector('#splash')).opacity === '0'), { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__fullscreenCalls), 0);
  check('ipad-chrome-entry-no-auto-fullscreen', await page.evaluate(() => ({ ua: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints, fullscreenCalls: window.__fullscreenCalls, quality: __fp.qualityState, room: __fp.room?.room })));
  await page.evaluate(() => { __fp.ui.emit('select', 0); });
  await page.waitForFunction(() => __fp.perf.playing && __fp.phase === 'playing' && __fp.perf.time > 2, { timeout: 90000 });
  await page.evaluate(() => {
    window.__modeRefs = { room: __fp.room, ctx: __fp.engine.ctx, piece: __fp.perf.piece };
    const seat = __fp.hall.seats.find(s => !s.stage && !__fp.director.occupied.has(s.index));
    __fp.director.sitAt(seat);
  });
  const state = () => page.evaluate(() => ({ song: __fp.perf.piece.id, time: __fp.perf.time, roomCode: __fp.room?.room, roomSame: __fp.room === __modeRefs.room, connected: __fp.room.connected, ctxSame: __fp.engine.ctx === __modeRefs.ctx, pieceSame: __fp.perf.piece === __modeRefs.piece, playing: __fp.perf.playing, audioState: __fp.engine.ctx.state, occupied: [...__fp.audience.occupied].sort((a,b)=>a-b), seat: __fp.director.seat?.index, quality: __fp.settings.quality, dpr: __fp.renderer.getPixelRatio(), drawn: __fp.audience.drawn }));
  const before = await state();
  await page.click('[data-panel="settings"]');
  await page.waitForSelector('#qualitySeg [data-q="high"]', { visible: true });
  await page.click('#qualitySeg [data-q="high"]'); await sleep(400);
  const high = await state();
  await page.click('#qualitySeg [data-q="efficient"]'); await sleep(400);
  const after = await state();
  for (const next of [high, after]) { assert.equal(next.song, before.song); assert.ok(next.time >= before.time); assert.ok(next.roomSame && next.connected && next.ctxSame && next.pieceSame && next.playing); assert.equal(next.audioState, 'running'); assert.deepEqual(next.occupied, before.occupied); assert.equal(next.seat, before.seat); }
  assert.equal(after.quality, 'efficient'); assert.ok(after.dpr <= 1); assert.ok(after.drawn < high.drawn);
  check('live-quality-switch-preserves-performance-room-seat-audio', { before, high, after }); await shot('04-live-efficient');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(200);
  const narrow = await page.evaluate(() => ({ width: innerWidth, labels: [...document.querySelectorAll('#qualitySeg button')].map(b => ({ text: b.innerText, left: b.getBoundingClientRect().left, right: b.getBoundingClientRect().right })), label: document.querySelector('#fpsText').innerText }));
  assert.equal(narrow.labels.length, 5); assert.ok(narrow.labels.every(b => b.left >= 0 && b.right <= narrow.width));
  assert.ok(narrow.label.includes('저사양'));
  check('390px-five-quality-buttons-fit', narrow); await shot('07-phone390-efficient');
  await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.click('#panelClose');
  await page.click('[data-mode="walk"]');
  await sleep(300);
  const pitchBefore = await page.evaluate(() => __fp.director.pitch);
  const cdp = await page.createCDPSession();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 760, y: 280, id: 1 }] });
  for (let y = 295; y <= 430; y += 15) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 760, y, id: 1 }] }); await sleep(35); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);
  const touch = await page.evaluate(() => ({ pitch: __fp.director.pitch, mode: __fp.director.mode, fullscreenCalls: window.__fullscreenCalls }));
  assert.ok(Math.abs(touch.pitch - pitchBefore) > 0.05); assert.equal(touch.fullscreenCalls, 0);
  check('trusted-touch-drag-changes-camera-pitch', { pitchBefore, ...touch }); await shot('05-ipad-touch-drag'); await cdp.detach();
  // Explicit direct-lobby route still exposes its controls without a ticket.
  await page.evaluate(() => sessionStorage.removeItem('fp-ticket'));
  await page.goto(`${base}/?venue=outdoor&lobby=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__fp && !document.querySelector('#lobby').hidden, { timeout: 120000 });
  const lobby = await page.evaluate(() => ({ hidden: document.querySelector('#lobby').hidden, text: document.querySelector('#lobby').innerText, url: location.href }));
  assert.ok(lobby.text.length > 20); check('direct-lobby-visible', lobby); await shot('06-direct-lobby');
  assert.equal(result.errors.length, 0, result.errors.join('\n'));
  result.status = 'pass';
} catch (error) { result.status = 'fail'; result.failure = String(error.stack || error); await shot('failure').catch(() => {}); throw error; }
finally { releaseModule?.(); fs.writeFileSync(`${outputDir}/accessibility-modes.json`, JSON.stringify(result, null, 2)); await page.close(); await browser.disconnect(); }
