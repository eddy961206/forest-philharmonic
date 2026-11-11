// Sequential actual-scene excerpts and transport cleanup; no product code changes.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { p as puppeteer, resolveOutputDir, cdpBrowserUrl, DEFAULT_APP_PORT } from './quality-optimization-common.mjs';

const out = resolveOutputDir('repertoire-performance');
const appPort = process.env.APP_PORT || DEFAULT_APP_PORT;
const browser = await puppeteer.connect({ browserURL: cdpBrowserUrl(), defaultViewport: null });
const page = (await browser.pages()).find((tab) => tab.url().includes(String(appPort)));
if (!page) throw Error('No dedicated QA page');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function choose(venue, id, pos = 0) {
  await page.evaluate(
    async ({ venue, id }) => {
      const { SETLISTS } = await import('/js/programs.js');
      const i = SETLISTS[venue].indexOf(id);
      if (i < 0) throw Error('Piece not in venue ' + id);
      __fp.ui.emit('select', i);
    },
    { venue, id }
  );
  await page.waitForFunction((songId) => __fp.perf.piece?.id === songId && __fp.phase === 'playing' && __fp.perf.playing, { timeout: 60000 }, id);
  await page.evaluate((seekPos) => {
    __fp.perf.seek(seekPos);
    const d = __fp.director;
    d.setMode('cinema');
    d.placeAt({ x: 0, y: 14.8, z: 5.9 }, { x: 0, y: 2, z: -9 });
    d.targetFov = d.fov = 52;
    d.cine.shot = { kind: 'qa-fixed-stage', hold: Infinity };
    d.cine.until = Infinity;
    d.cine.clock = 0;
    d.cine.drift = null;
  }, pos);
}

function run(script, args, name) {
  return new Promise((resolve, reject) => {
    const log = fs.openSync(`${out}/${name}.log`, 'w');
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', log, log],
      env: { ...process.env, QA_OUT: out },
    });
    child.on('exit', (code) => {
      fs.closeSync(log);
      code === 0 ? resolve() : reject(Error(name + ' ' + code));
    });
  });
}

async function excerpt(venue, id, start, name) {
  await choose(venue, id, start);
  await wait(5000);
  console.log('EXCERPT ' + name);
  await run('tools/qa/realtime-performance.mjs', ['observe', name, '40'], name + '-run');
  await page.evaluate(() => __fp.perf.pause());
}

async function enter(venue) {
  await page.goto(`http://127.0.0.1:${appPort}/?venue=${venue}&lobby`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__fp?.engine.ctx && document.querySelector('#enterBtn') && !document.querySelector('#enterBtn').disabled, { timeout: 120000 });
  await page.click('#enterBtn');
  await wait(1000);
}

async function cleanup(venue, ids) {
  const client = await page.createCDPSession();
  const rows = [];
  const snapshot = async (label) => {
    await client.send('HeapProfiler.collectGarbage');
    rows.push(
      await page.evaluate(
        (lbl) => ({
          label: lbl,
          wall: new Date().toISOString(),
          piece: __fp.perf.piece.id,
          pos: __fp.perf.time,
          playing: __fp.perf.playing,
          voices: __fp.engine.voices.size,
          heap: performance.memory.usedJSHeapSize,
          resources: { ...__fp.renderer.info.memory },
          ctx: __fp.engine.ctx.state,
        }),
        label
      )
    );
  };
  // Warm both final states before a same-piece/same-position retained comparison.
  for (const id of ids) {
    await choose(venue, id, 15);
    await wait(2000);
    await page.evaluate(() => __fp.perf.pause());
  }
  await choose(venue, ids[0], 15);
  await wait(2000);
  await page.evaluate(() => __fp.perf.pause());
  await wait(5000);
  await snapshot('baseline-warm-paused');
  for (let i = 0; i < 12; i++) {
    await choose(venue, ids[i % ids.length], 15 + (i % 3) * 10);
    await wait(700);
    await page.evaluate(() => {
      __fp.perf.pause();
      __fp.perf.seek(25);
      __fp.perf.play();
    });
    await wait(700);
    await page.evaluate(() => __fp.perf.pause());
    await snapshot('cycle-' + i);
    if (i % 4 === 0) console.log('CLEANUP ' + venue + ' ' + i);
  }
  await choose(venue, ids[0], 15);
  await wait(2000);
  await page.evaluate(() => __fp.perf.pause());
  for (let i = 0; i < 6; i++) {
    await wait(5000);
    await snapshot('settle-' + (i + 1) * 5 + 's');
  }
  fs.writeFileSync(`${out}/${venue}-cleanup.json`, JSON.stringify(rows, null, 2));
}

if (process.argv[2] !== 'sphere') {
  await enter('hall');
  await excerpt('hall', 'beethoven-ode-to-joy', 20, 'hall-existing-ode');
  await excerpt('hall', 'dvorak-new-world-4', 648, 'hall-dvorak-peak');
  await excerpt('hall', 'tchaikovsky-piano-concerto-1', 717, 'hall-concerto-overlap');
  await cleanup('hall', ['beethoven-fur-elise', 'tchaikovsky-piano-concerto-1']);
}
if (process.argv[2] !== 'hall') {
  await enter('sphere');
  await excerpt('sphere', 'bach-wachet-auf', 15, 'sphere-existing-bach');
  await excerpt('sphere', 'tchaikovsky-1812', 682, 'sphere-1812-peak');
  await excerpt('sphere', 'wagner-valkyries', 277.5, 'sphere-valkyries-overlap');
  await excerpt('sphere', 'khachaturian-sabre-dance', 100, 'sphere-sabre-peak');
  await cleanup('sphere', ['debussy-clair-de-lune', 'wagner-valkyries']);
}
console.log('SUITE COMPLETE');
await browser.disconnect();
