import { p, resolveOutputDir, cdpBrowserUrl, DEFAULT_APP_PORT } from './quality-optimization-common.mjs';

const outputDir = resolveOutputDir('repertoire-performance');
const appPort = String(process.env.APP_PORT || DEFAULT_APP_PORT);
const b = await p.connect({ browserURL: cdpBrowserUrl(), defaultViewport: null });
const page = (await b.pages()).find((tab) => tab.url().includes(appPort));
if (!page) throw Error('No dedicated QA page');
await page.bringToFront();
await page.waitForFunction(() => window.__fp && !document.querySelector('#enterBtn').disabled, { timeout: 120000 });
await page.click('#enterBtn');
await page.click('[data-mode="cinema"]');
await page.evaluate(async () => {
  const { HALL_SETLIST } = await import('/js/programs.js');
  __fp.ui.emit('select', HALL_SETLIST.indexOf('elgar-pomp-and-circumstance'));
});
await page.waitForFunction(
  () => __fp.perf.piece?.id === 'elgar-pomp-and-circumstance' && __fp.phase === 'playing' && __fp.perf.playing,
  { timeout: 60000 }
);
await page.evaluate(() => {
  __fp.perf.pause();
  __fp.perf.seek(0);
  const d = __fp.director;
  d.setMode('cinema');
  d.placeAt({ x: 0, y: 14.8, z: 5.9 }, { x: 0, y: 2, z: -9 });
  d.targetFov = d.fov = 52;
  d.cine.shot = { kind: 'qa-fixed-stage', hold: Infinity };
  d.cine.until = Infinity;
  d.cine.clock = 0;
  d.cine.drift = null;
});
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${outputDir}/${process.argv[2] || 'hall-fixed-stage-ready'}.png` });
console.log(
  await page.evaluate(() => ({
    quality: __fp.quality,
    qualityState: __fp.qualityState,
    camera: {
      pos: __fp.camera.position.toArray(),
      fov: __fp.camera.fov,
      mode: __fp.director.mode,
      shot: __fp.director.cine.shot.kind,
    },
    phase: __fp.phase,
  }))
);
await b.disconnect();
