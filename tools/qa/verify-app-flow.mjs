// The evening as a visitor goes through it, in a real browser, in all three
// venues: walk-on, music, pause, the bows, the next piece, the interval, the
// encore vote, the end of the evening, quality changes and the sleep timer -
// and watching together: a guest in step with the host, the host's role
// handed over in the interval, a lost room carried on alone.
// Functional regression for public/js/main.js and public/js/app/. No timing
// acceleration and no performance claims; run apart from FPS measurements.
//   APP_PORT=8096 CDP_PORT=9225 QA_OUT=work/app-flow npm run verify:app
//   BASELINE=<revision> ...   the same flows against an older public/js
//   VENUES=hall FLOWS=together ...   a part of it (a fresh server: a room
//   address may hold 24 rooms, and earlier runs leave theirs waiting)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { p, outputDir } from './quality-optimization-common.mjs';
import { motionSource, useBrowserRevision } from './motion-source.mjs';

const base = `http://127.0.0.1:${process.env.APP_PORT || 8096}`;
const venues = (process.env.VENUES || 'hall,sphere,outdoor').split(',');
const baseline = process.env.BASELINE || null;
const flows = (process.env.FLOWS || 'solo,together').split(',');
const browser = await p.connect({ browserURL: `http://127.0.0.1:${process.env.CDP_PORT || 9225}`, defaultViewport: null });
const report = { source: motionSource(), baseline, at: new Date().toISOString(), venues, checks: [], errors: [], status: 'fail',
  limitations: ['Desktop Chrome only.', 'Pieces end by seeking near their end, not by full playback.', 'Visual quality is not judged here; look at the screenshots.'] };
const contexts = [];
const pages = [];
const check = (name, data) => { report.checks.push({ name, ...data }); console.log(name, JSON.stringify(data)); };

async function open(venue, label) {
  const context = await browser.createBrowserContext();
  contexts.push(context);
  const page = await context.newPage();
  pages.push(page);
  page.on('pageerror', (e) => report.errors.push(`${label}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${label}: ${m.text()}`); });
  await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
  if (baseline) Object.assign(report, await useBrowserRevision(page, baseline));
  await page.goto(`${base}/?venue=${venue}&lobby`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__fp && !document.querySelector('#enterBtn').disabled, { timeout: 120000 });
  await page.evaluate(() => { __fp.ui.onSetting('gap', 2); __fp.ui.onSetting('interval', 0); });
  return page;
}
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, { timeout, polling: 100 }, arg);
const state = (page) => page.evaluate(() => ({ phase: __fp.phase, piece: __fp.perf.piece?.id, playing: __fp.perf.playing, time: +__fp.perf.time.toFixed(2) }));
const skipToMusic = async (page) => {
  await page.evaluate(() => __fp.ui.emit('toggle'));
  await until(page, () => __fp.perf.playing, null, 20000);
};
const endPiece = async (page) => {
  const before = await state(page);
  await page.evaluate(() => __fp.ui.emit('seek', __fp.perf.duration - 1.5));
  await until(page, () => __fp.phase === 'applause', null, 10000);
  return before.piece;
};

async function solo(venue) {
  const page = await open(venue, venue);
  await page.bringToFront();
  await page.evaluate(() => __fp.ui.emit('enter', { name: 'QA', avatar: 'bear', mode: 'solo' }));
  await until(page, () => __fp.director.active);
  // the first piece the long way: the walk-on, tuning or greeting, the hush
  await page.evaluate(() => { window.__phases = []; setInterval(() => { if (window.__phases.at(-1) !== __fp.phase) window.__phases.push(__fp.phase); }, 50); __fp.startShow(); });
  await until(page, () => __fp.perf.playing, null, 120000);
  check(`${venue}-first-piece`, { phases: await page.evaluate(() => window.__phases.join('>')), ...(await state(page)) });
  await page.evaluate(() => __fp.ui.emit('mode', 'cinema'));
  await page.screenshot({ path: `${outputDir}/${venue}-playing.png` });
  await page.evaluate(() => __fp.ui.emit('toggle'));
  assert.equal((await state(page)).playing, false, 'paused');
  await page.evaluate(() => __fp.ui.emit('toggle'));
  assert.equal((await state(page)).playing, true, 'resumed');
  // the bows, the gap, the next piece
  const first = await endPiece(page);
  await until(page, (id) => __fp.perf.piece?.id !== id && ['changing', 'entering', 'tuning', 'announce', 'hush', 'playing'].includes(__fp.phase), first, 40000);
  await skipToMusic(page);
  check(`${venue}-next-piece`, await state(page));
  // the interval and the second half
  await page.evaluate(() => __fp.intervalNow(4));
  await until(page, () => __fp.phase === 'interval' && !!__fp.interval, null, 5000);
  await until(page, () => !__fp.interval, null, 15000);
  await skipToMusic(page);
  check(`${venue}-after-interval`, await state(page));
  // the end of the programme: the lanterns, the encore, everyone leaves
  await page.evaluate(() => __fp.ui.emit('select', document.querySelectorAll('#program li, .program li').length - 1));
  await until(page, () => __fp.perf.playing, null, 20000);
  await endPiece(page);
  await until(page, () => __fp.phase === 'encore' && !!__fp.encore, null, 40000);
  const cands = await page.evaluate(() => { __fp.ui.emit('vote', 1); return __fp.encore.cands.map((i) => __fp.encore.candMeta[__fp.encore.cands.indexOf(i)].id); });
  await until(page, (id) => __fp.perf.piece?.id === id && __fp.phase !== 'encore', cands[1], 20000);
  await skipToMusic(page);
  check(`${venue}-encore`, { voted: cands[1], ...(await state(page)) });
  await endPiece(page);
  await until(page, () => __fp.phase === 'intermission' && __fp.stage.allOffstage, null, 90000);
  check(`${venue}-evening-ends`, await state(page));
  // quality by hand, the sleep timer's rest and waking
  const quality = await page.evaluate(() => { const q = []; for (const v of ['low', 'efficient', 'auto']) { __fp.ui.onSetting('quality', v); q.push(__fp.quality); } return q; });
  assert.deepEqual(quality.slice(0, 2), ['low', 'low']);
  const sleep = await page.evaluate(async () => {
    __fp.goToSleep(); const asleep = __fp.asleep; const s0 = __fp.stats.sequence;
    await new Promise((r) => setTimeout(r, 500)); const drawnAsleep = __fp.stats.sequence - s0;
    __fp.wake(); await new Promise((r) => setTimeout(r, 2500)); const s1 = __fp.stats.sequence;
    await new Promise((r) => setTimeout(r, 1000));
    return { asleep, drawnAsleep, awake: !__fp.asleep, framesPerSecondAwake: __fp.stats.sequence - s1 };
  });
  assert.ok(sleep.asleep && sleep.drawnAsleep === 0 && sleep.awake && sleep.framesPerSecondAwake > 5, JSON.stringify(sleep));
  check(`${venue}-quality-sleep`, { quality, ...sleep });
  await page.evaluate(() => __fp.perf.pause());
}

async function together(venue) {
  const host = await open(venue, `${venue}-host`);
  await host.evaluate(() => __fp.ui.emit('enter', { name: 'QA 방장', avatar: 'bear', mode: 'create', title: 'QA', cap: 4, pub: false }));
  await until(host, () => (__fp.room?.isHost && __fp.director.active) || !__fp.room, null, 15000);
  const refused = await host.evaluate(() => !__fp.room && (document.querySelector('#lbError, .lobby-error, [id*=Error]')?.textContent || 'no room'));
  assert.equal(refused, false, `the room was not made: ${refused}`);
  const code = await host.evaluate(() => __fp.room.room.code);
  const guest = await open(venue, `${venue}-guest`);
  await guest.evaluate((code) => __fp.ui.emit('enter', { name: 'QA 손님', avatar: 'fox', mode: 'join', code }), code);
  await until(guest, () => __fp.room?.connected && !__fp.room.isHost && __fp.director.active, null, 15000);
  await host.bringToFront();
  await host.evaluate(() => __fp.startShow());
  await until(host, () => ['changing', 'entering'].includes(__fp.phase), null, 15000);
  await skipToMusic(host);
  await until(guest, () => __fp.perf.playing, null, 20000);
  const offset = async () => {
    const [h, g] = await Promise.all([host, guest].map((q) => q.evaluate(() => ({ id: __fp.perf.piece?.id, t: __fp.perf.time - __fp.room.now() }))));
    return { same: h.id === g.id, offset: +Math.abs(h.t - g.t).toFixed(3) };
  };
  await new Promise((r) => setTimeout(r, 2000));
  const inStep = await offset();
  assert.ok(inStep.same && inStep.offset < 0.15, JSON.stringify(inStep));
  check(`${venue}-guest-in-step`, inStep);
  // the next piece, followed
  const first = await endPiece(host);
  await until(host, (id) => __fp.perf.piece?.id !== id && ['changing', 'entering', 'tuning', 'announce', 'hush'].includes(__fp.phase), first, 40000);
  await skipToMusic(host);
  await until(guest, (id) => __fp.perf.playing && __fp.perf.piece?.id !== id, first, 20000);
  await new Promise((r) => setTimeout(r, 1500));
  const next = await offset();
  assert.ok(next.same && next.offset < 0.15, JSON.stringify(next));
  check(`${venue}-guest-follows-next`, next);
  // the interval: the host hands over, the new host starts the second half
  await host.evaluate(() => __fp.intervalNow(60));
  await until(guest, () => __fp.phase === 'interval', null, 10000);
  await host.evaluate(() => { const g = [...__fp.room.members.values()].find((m) => m.id !== __fp.room.id); __fp.ui.emit('handoff', g.id, g.name); });
  await until(guest, () => __fp.room.isHost, null, 10000);
  await guest.bringToFront();
  await guest.evaluate(() => __fp.ui.emit('secondHalf'));
  await until(guest, () => !__fp.interval, null, 10000);
  await skipToMusic(guest);
  await until(host, () => __fp.perf.playing && !__fp.room.isHost, null, 20000);
  check(`${venue}-handoff-second-half`, { newHost: await state(guest), oldHost: await state(host) });
  // the room lost: the old host's page carries on alone
  await host.evaluate(() => __fp.room._emit('lost', { code: 'replaced' }));
  await until(host, () => !__fp.room && new URLSearchParams(location.search).get('room') === null, null, 5000);
  check(`${venue}-lost-room-solo`, await state(host));
}

try {
  if (flows.includes('solo')) for (const venue of venues) await solo(venue);
  if (flows.includes('together')) await together(venues[0]);
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  report.status = 'pass';
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
  await pages.at(-1)?.screenshot({ path: `${outputDir}/app-flow-failure.png` }).catch(() => {});
} finally {
  fs.writeFileSync(`${outputDir}/app-flow.json`, JSON.stringify(report, null, 2));
  for (const page of pages) await page.evaluate(() => { __fp.room?.leave(); __fp.perf.pause(); }).catch(() => {});
  for (const context of contexts) await context.close().catch(() => {});
  await browser.disconnect();
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, errors: report.errors.length, failure: report.failure?.split('\n')[0] }));
}
