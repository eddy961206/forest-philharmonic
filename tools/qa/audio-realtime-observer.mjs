import fs from 'node:fs';
import { p, resolveOutputDir, cdpBrowserUrl, DEFAULT_APP_PORT } from './quality-optimization-common.mjs';

const outputDir = resolveOutputDir('repertoire-performance');
const appPort = String(process.env.APP_PORT || DEFAULT_APP_PORT);
const b = await p.connect({ browserURL: cdpBrowserUrl(), defaultViewport: null });
const page = (await b.pages()).find((tab) => tab.url().includes(appPort));
if (!page) throw Error('No dedicated QA page');
const c = await page.createCDPSession();
const contexts = [];
c.on('WebAudio.contextCreated', (v) => contexts.push(v.context));
await c.send('WebAudio.enable');
await new Promise((r) => setTimeout(r, 500));
const out = process.argv[2] || 'audio-realtime';
const seconds = Number(process.argv[3] || 350);
const rows = [];
for (let i = 0; i < seconds; i += 2) {
  for (const ctx of contexts) {
    try {
      rows.push({
        wall: new Date().toISOString(),
        context: ctx,
        ...(await c.send('WebAudio.getRealtimeData', { contextId: ctx.contextId })),
        transport: await page.evaluate(() => ({
          id: __fp.perf.piece?.id,
          pos: __fp.perf.time,
          voices: __fp.engine.voices.size,
        })),
      });
    } catch (e) {
      rows.push({ error: String(e) });
    }
  }
  await new Promise((r) => setTimeout(r, 2000));
  if (i % 30 === 0) fs.writeFileSync(`${outputDir}/${out}-progress.json`, JSON.stringify(rows.at(-1), null, 2));
}
fs.writeFileSync(`${outputDir}/${out}.json`, JSON.stringify(rows));
console.log(rows.length);
await b.disconnect();
