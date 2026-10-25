// Dedicated CDP browser; never closes other QA tabs. No timing acceleration.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { p, outputDir } from './quality-optimization-common.mjs';
import { motionSource } from './motion-source.mjs';
const browser = await p.connect({ browserURL: `http://127.0.0.1:${process.env.CDP_PORT || 9225}`, defaultViewport: null });
const result = { source: motionSource(), at: new Date().toISOString(), checks: [], errors: [], limitations: ['Seeking near a piece end exercises the real end ceremony without a complete score playback.', 'Desktop Chrome only; no physical iOS check.'] };
const pages = [];
const check = (name, data) => { result.checks.push({ name, data }); console.log(name, JSON.stringify(data)); };
async function page() {
  const q = await browser.newPage(); pages.push(q);
  q.on('pageerror', e => result.errors.push(String(e)));
  await q.goto(`http://127.0.0.1:${process.env.APP_PORT || 8096}/?venue=outdoor&lobby`, { waitUntil: 'domcontentloaded' });
  await q.waitForFunction(() => window.__fp && !document.querySelector('#enterBtn').disabled, { timeout: 120000 });
  return q;
}
try {
  const host = await page(); await host.bringToFront();
  // Fresh preference fixture, then verify persisted enabled state by reloading.
  await host.evaluate(() => { const s = JSON.parse(localStorage.getItem('fp-settings') || '{}'); delete s.skipStageTransitions; localStorage.setItem('fp-settings', JSON.stringify(s)); });
  await host.reload({ waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__fp && !document.querySelector('#enterBtn').disabled, { timeout: 120000 });
  check('default-off', await host.evaluate(() => ({ value: __fp.settings.skipStageTransitions, checked: document.querySelector('#optSkipStageTransitions').checked })));
  assert.equal(result.checks.at(-1).data.value, false);
  await host.evaluate(() => {
    __fp.ui.onSetting('quality', 'efficient');
    __fp.ui.onSetting('gap', 4); __fp.ui.onSetting('interval', 0);
    __fp.ui.onSetting('skipStageTransitions', true);
  });
  await host.reload({ waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => window.__fp && !document.querySelector('#enterBtn').disabled, { timeout: 120000 });
  assert.equal(await host.evaluate(() => __fp.settings.skipStageTransitions && document.querySelector('#optSkipStageTransitions').checked), true);
  check('reload-preserved', true);
  await host.evaluate(() => {
    __fp.ui.onSetting('skipStageTransitions', false);
    __fp.ui.emit('enter', { name: '이동 QA 방장', avatar: 'bear', mode: 'create', title: '이동 QA', cap: 4, pub: false });
  });
  await host.waitForFunction(() => __fp.room?.isHost, { timeout: 15000 });
  const code = await host.evaluate(() => __fp.room.room.code);
  const guest = await page();
  await guest.evaluate(code => __fp.ui.emit('enter', { name: '이동 QA 손님', avatar: 'fox', mode: 'join', code }), code);
  await guest.waitForFunction(() => __fp.room?.connected && !__fp.room.isHost, { timeout: 15000 });
  await host.bringToFront();
  await host.evaluate(() => {
    window.__skipQA = { phases: [], applause: [], travels: [], bows: [] };
    const f = __fp;
    const applause = f.engine.applause.bind(f.engine);
    f.engine.applause = (...args) => { __skipQA.applause.push({ at: performance.now(), phase: f.phase }); return applause(...args); };
    for (const method of ['callOn', 'sendOff', 'conductorEnter', 'conductorExit', 'exitAll']) {
      const original = f.stage[method].bind(f.stage);
      f.stage[method] = (...args) => { const ret = original(...args); __skipQA.travels.push({ at: performance.now(), method, skip: f.stage.skipTransitions, moving: [...f.stage.walkers, f.stage.conductor].filter(w => ['queued','walking'].includes(w.state)).length }); return ret; };
    }
    for (const method of ['conductorBow', 'orchestraBow', 'greet']) {
      const original = f.stage[method].bind(f.stage);
      f.stage[method] = (...args) => { __skipQA.bows.push({ at: performance.now(), method, on: args.at(-1) }); return original(...args); };
    }
    setInterval(() => { if (__skipQA.phases.at(-1)?.phase !== f.phase) __skipQA.phases.push({ phase: f.phase, at: performance.now(), song: f.perf.piece?.id }); }, 40);
    f.startShow();
  });
  await host.waitForFunction(() => __fp.stage.walkers.some(w => ['queued','walking'].includes(w.state)), { timeout: 15000 });
  await host.evaluate(() => {
    const el = document.querySelector('#optSkipStageTransitions'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await guest.waitForFunction(() => __fp.stage.skipTransitions && document.querySelector('#optSkipStageTransitions').checked, { timeout: 10000 });
  check('mid-entry-toggle-and-guest-sync', await host.evaluate(() => ({ moving: __fp.stage.walkers.filter(w => ['queued','walking'].includes(w.state)).length, stored: JSON.parse(localStorage.getItem('fp-settings')).skipStageTransitions })));
  assert.equal(result.checks.at(-1).data.moving, 0);
  assert.equal(await guest.evaluate(() => document.querySelector('#optSkipStageTransitions').disabled), true);
  await host.waitForFunction(() => __fp.perf.playing, { timeout: 90000 });
  await guest.waitForFunction(() => __fp.perf.playing, { timeout: 15000 });
  check('host-guest-playing', await guest.evaluate(() => ({ phase: __fp.phase, skip: __fp.stage.skipTransitions })));
  await host.evaluate(() => { __fp.ui.showPanel('settings'); __fp.director.setMode('cinema'); });
  await host.screenshot({ path: `${outputDir}/settings.png` });
  await host.evaluate(() => { __fp.ui.showPanel(null); __fp.perf.seek(__fp.perf.duration - 0.1); });
  await host.waitForFunction(() => __fp.phase === 'applause', { timeout: 20000 });
  await host.screenshot({ path: `${outputDir}/applause.png` });
  await host.waitForFunction(() => __fp.phase === 'intermission', { timeout: 30000 });
  await host.waitForFunction(() => __fp.perf.playing, { timeout: 90000 });
  const data = await host.evaluate(() => __skipQA);
  result.trace = data;
  const applause = data.phases.find(x => x.phase === 'applause');
  const gap = data.phases.find(x => x.phase === 'intermission');
  const afterGap = data.phases[data.phases.indexOf(gap) + 1];
  assert.ok(gap.at - applause.at >= 3450, 'duo applause and greeting: 600 + 2000 + 900 ms');
  assert.ok(afterGap.at - gap.at >= 3950, 'configured four-second gap');
  assert.ok(data.applause.length >= 2, 'welcome and ending applause');
  assert.ok(data.bows.some(x => x.method === 'greet' && x.on) && data.bows.some(x => x.method === 'greet' && !x.on));
  assert.ok(data.travels.filter(x => x.skip).every(x => x.moving === 0));
  check('applause-bows-gap-preserved', { applauseMs: gap.at - applause.at, gapMs: afterGap.at - gap.at, trace: data });
  await host.evaluate(() => __fp.ui.onSetting('skipStageTransitions', false));
  await guest.waitForFunction(() => !__fp.stage.skipTransitions, { timeout: 10000 });
  check('disable-propagates', true);
  assert.equal(motionSource().sourceSHA256, result.source.sourceSHA256, 'product source unchanged during browser QA');
  assert.deepEqual(result.errors, []);
  result.status = 'pass';
} catch (error) { result.status = 'fail'; result.failure = String(error.stack || error); throw error; }
finally {
  fs.writeFileSync(`${outputDir}/result.json`, JSON.stringify(result, null, 2));
  for (const q of pages) await q.close();
  await browser.disconnect();
}
