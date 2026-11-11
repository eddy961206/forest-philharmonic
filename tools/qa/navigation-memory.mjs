// Dedicated QA tabs only: fresh tab then two same-tab venue navigations.
import fs from 'node:fs';
import { p, resolveOutputDir, cdpBrowserUrl, DEFAULT_APP_PORT } from './quality-optimization-common.mjs';

const outputDir = resolveOutputDir('repertoire-performance');
const base = `http://127.0.0.1:${process.env.APP_PORT || DEFAULT_APP_PORT}`;
const b = await p.connect({ browserURL: cdpBrowserUrl(), defaultViewport: null });
const old = (await b.pages()).filter((tab) => tab.url().startsWith(base));
const page = await b.newPage();
for (const tab of old) await tab.close();
await page.bringToFront();
const c = await page.createCDPSession();
await c.send('Performance.enable');
const rows = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [i, venue] of ['sphere', 'hall', 'sphere'].entries()) {
  await page.goto(`${base}/?venue=${venue}&lobby`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__fp && !document.querySelector('#enterBtn').disabled, { timeout: 120000 });
  await page.click('#enterBtn');
  const id = venue === 'sphere' ? 'debussy-clair-de-lune' : 'beethoven-fur-elise';
  await page.evaluate(
    async ({ venue, id }) => {
      const { SETLISTS } = await import('/js/programs.js');
      __fp.ui.emit('select', SETLISTS[venue].indexOf(id));
    },
    { venue, id }
  );
  await page.waitForFunction(
    (songId) => __fp.perf.piece?.id === songId && __fp.phase === 'playing' && __fp.perf.playing,
    { timeout: 60000 },
    id
  );
  await page.evaluate(() => {
    __fp.perf.seek(15);
    const d = __fp.director;
    d.setMode('cinema');
    d.placeAt({ x: 0, y: 14.8, z: 5.9 }, { x: 0, y: 2, z: -9 });
    d.targetFov = d.fov = 52;
    d.cine.shot = { kind: 'qa-fixed-stage', hold: Infinity };
    d.cine.until = Infinity;
    d.cine.clock = 0;
    d.cine.drift = null;
  });
  await wait(2000);
  await page.evaluate(() => __fp.perf.pause());
  for (let j = 0; j < 2; j++) {
    await wait(5000);
    await c.send('HeapProfiler.collectGarbage');
    await wait(200);
    const state = await page.evaluate(() => {
      const f = __fp;
      const unique = new Set();
      for (const s of Object.values(f.engine.samples)) for (const v of s.buf.values()) unique.add(v);
      return {
        at: new Date().toISOString(),
        url: location.href,
        piece: f.perf.piece.id,
        pos: f.perf.time,
        playing: f.perf.playing,
        performanceMemoryUsedJSHeapSize: performance.memory.usedJSHeapSize,
        performanceMemoryTotalJSHeapSize: performance.memory.totalJSHeapSize,
        voices: f.engine.voices.size,
        resources: { ...f.renderer.info.memory },
        audioState: f.engine.ctx.state,
        sampleBuffers: unique.size,
        samplePCMBytes: [...unique].reduce((n, a) => n + a.length * a.numberOfChannels * 4, 0),
      };
    });
    rows.push({ index: i, venue, settleSec: (j + 1) * 5, ...state, cdpMetrics: await c.send('Performance.getMetrics') });
    console.log(JSON.stringify(rows.at(-1)));
  }
  fs.writeFileSync(`${outputDir}/navigation-memory.json`, JSON.stringify(rows, null, 2));
}
await page.screenshot({ path: `${outputDir}/navigation-memory-final.png` });
await b.disconnect();
