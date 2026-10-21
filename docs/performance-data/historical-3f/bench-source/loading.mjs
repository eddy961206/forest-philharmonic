// Run serially with all other browser/GPU measurements.
// BASE_URL=http://127.0.0.1:8082 node tools/bench/loading.mjs baseline hall desktop
// BASE_URL=http://127.0.0.1:8080 node tools/bench/loading.mjs current hall desktop
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config, launchBrowser, sha256 } from './browser.mjs';
import { browserOptions, localAppProxy, installRuntimeProbe, waitReady, networkCollector, networkSummary, category, browserState } from './loading-proxy.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`node tools/bench/loading.mjs [label] [hall|sphere] [desktop|mobile]
같은 새 BrowserContext에서 실제 cold/warm HTTP 캐시와 준비 완료를 관찰해.
관객 전용 seed는 417로 고정해. local proxy가 main.js 한 줄만 바꾸며
전역 Math.random/UUID와 나머지 자원은 그대로야. main 응답은 identity와
별도 QA ETag/no-cache를 쓰므로 controlledMainFixture 바이트를 원본 전송량으로 쓰지 마.
관객 수와 정렬 점유 좌석 hash가 cold/warm에서 같아야 통과해.
전후 pair는 compare-loading.mjs로 따로 확인해. 시간은 조건당 한 번의 관측이야.
BASE_URL, REVISION, OUTPUT_DIR와 공통 브라우저/폰트 환경변수를 사용해.
--help는 브라우저나 로컬 프록시를 시작하지 않아.`);
  process.exit(0);
}
assert.ok(args.length <= 3, 'Expected [label] [hall|sphere] [desktop|mobile]');
const [label = 'current', venue = 'hall', device = 'desktop'] = args;
assert.ok(/^[a-zA-Z0-9_-]+$/.test(label));
assert.ok(['hall', 'sphere'].includes(venue));
assert.ok(['desktop', 'mobile'].includes(device));
const quality = device === 'mobile' ? 'low' : 'high';
const audienceSeed = 417;
const cfg = config(label);
await fs.mkdir(cfg.outputDir, { recursive: true });
const output = path.join(cfg.outputDir, 'loading-' + label + '-' + venue + '-' + device + '.json');
const errors = [], warnings = [];
const result = {
  measuredAt: new Date().toISOString(), label, baseURL: cfg.baseURL, revision: cfg.revision, venue, device, quality, fontMode: cfg.fontMode,
  method: 'One fresh Chromium launch and one explicit browser context per configuration. Cold is the first navigation; warm is a second navigation to the identical URL after about:blank in the same context, without clearing HTTP cache. No Playwright route interception or network throttling. A local proxy rewrites the document font links and exactly one solo-audience generator in main.js to seeded(417); the main fixture is fetched as identity, served as identity with its own QA ETag and no-cache, and recorded separately from original application-JS bytes. Global Math.random and Three UUID generation are unchanged. All other app JavaScript, MP3, vendor and music responses retain original gzip, ETag and cache headers. Main scene rAF is captured from the first frame, so repeated software rasterization is excluded while actual scene construction, PMREM, AudioContext/IR, full preset sample decode, applause preparation and score load run. Ready means the real solo-entry button becomes enabled, measured by MutationObserver. Crowd count and a sorted occupied-seat fingerprint must agree between cold/warm and in a separately checked baseline/candidate pair. This is controlled startup, not normal full-frame interactive readiness. Each cold/warm result is one observation, not a statistically stable benchmark.',
  fixture: {
    audienceSeed,
    scope: 'One isolated solo-audience seed in /js/main.js; ordinary room seeding and global RNG/UUID behavior are unchanged.',
    controlledResponseCategory: 'controlledMainFixture',
    collectorSha256: sha256(await fs.readFile(new URL(import.meta.url))),
    proxySha256: sha256(await fs.readFile(new URL('./loading-proxy.mjs', import.meta.url))),
    browserHelperSha256: sha256(await fs.readFile(new URL('./browser.mjs', import.meta.url))),
  },
  limitations: [
    'Renderer identity is recorded in each run. Mobile is viewport/touch/UA emulation on this machine, not a real phone. A software-rendered result does not predict a physical GPU.',
    'Cold refers to browser HTTP cache only. The upstream Node server, OS filesystem cache, local fonts and process-level startup state may already be warm.',
    'CDP loadingFinished.encodedDataLength is the browser-reported received encoded response size; it is not exact request-upload bytes or network packet bytes. Worker subrequests may be absent from the page CDP stream; the proxy transaction log covers actual upstream requests independently.',
    'Local controlled-font bytes are reported separately. Font timing/network behavior does not represent the external Google Fonts service.',
    'The /js/main.js fixture response has different source bytes, identity encoding and a QA ETag. Its responseEncodedBytes and Resource Timing sizes are fixture transfer observations, not original main.js transfer bytes. Original and served identity SHA-256/byte counts are recorded per navigation.',
    'Only the solo audience RNG is fixed. Generated room-impulse samples and other procedural random values remain native; their sample lengths and construction loops are unchanged. Occupancy equality does not prove every scene or IR byte is identical, and one observation does not establish a causal population-level timing improvement.',
    'Heap snapshots are coarse usedJSHeapSize observations, not peak memory, audio-native memory or GPU memory measurements.',
  ],
  runs: {}, errors, warnings, passed: false,
};
let browser, proxy;
try {
  proxy = await localAppProxy(cfg, { audienceSeed });
  result.proxy = { origin: proxy.origin, upstream: proxy.upstream, fontCssSha256: proxy.fontCssSha256, fontMode: cfg.fontMode, audienceSeed };
  browser = await launchBrowser(cfg);
  result.environment = { browserVersion: browser.version(), platform: process.platform, architecture: process.arch, chromeArgs: cfg.chromeArgs, softwareRequested: cfg.softwareRequested, headless: cfg.headless };
  const context = await browser.newContext(browserOptions(device, browser.version()));
  const page = await context.newPage();
  page.setDefaultTimeout(cfg.timeoutMs);
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ type: 'console', message: message.text() });
    else if (message.type() === 'warning') warnings.push(message.text());
  });
  await installRuntimeProbe(page, quality);
  const network = await networkCollector(page, device === 'mobile');
  const url = proxy.origin + '/?venue=' + venue;
  for (const name of ['cold', 'warm']) {
    if (name === 'warm') await page.goto('about:blank', { waitUntil: 'load' });
    network.reset();
    const proxyStart = proxy.transactions.length;
    const started = performance.now();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitReady(page, cfg.timeoutMs);
    const observedReadyWallMs = performance.now() - started;
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => setTimeout(resolve, 100)); });
    const metrics = await page.evaluate(() => {
      const probe = window.__runtimeQA;
      for (const entry of probe.longObserver?.takeRecords() || []) probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
      const bootTasks = probe.longTasks.filter(entry => entry.start <= probe.readyAt);
      return {
        readyMs: probe.readyAt, collectedAtMs: performance.now(),
        readyText: document.getElementById('loadText').textContent,
        longTaskSupported: probe.longTaskSupported,
        bootLongTasks: { count: bootTasks.length, totalMs: bootTasks.reduce((sum, entry) => sum + entry.duration, 0), maxMs: Math.max(0, ...bootTasks.map(entry => entry.duration)), entries: bootTasks },
        allLongTasks: probe.longTasks,
        navigation: performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
        paints: performance.getEntriesByType('paint').map(entry => entry.toJSON()),
        resources: performance.getEntriesByType('resource').map(entry => entry.toJSON()),
        fontStatus: document.fonts.status,
      };
    });
    const state = await browserState(page, { audienceFingerprint: true });
    const mainFixture = proxy.mainFixture;
    assert.ok(mainFixture, 'Fixed audience main.js response was not served');
    assert.equal(mainFixture.audienceSeed, audienceSeed);
    assert.equal(mainFixture.replacements, 1);
    const requests = network.entries();
    const resourceSummary = {};
    for (const entry of metrics.resources) {
      if (!entry.name.startsWith('http')) continue;
      const key = category(entry.name, { controlledMain: true });
      const row = resourceSummary[key] ||= { resources: 0, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0, zeroTransferEntries: 0 };
      row.resources++;
      row.transferSize += entry.transferSize;
      row.encodedBodySize += entry.encodedBodySize;
      row.decodedBodySize += entry.decodedBodySize;
      row.zeroTransferEntries += +(entry.transferSize === 0);
    }
    const summary = networkSummary(requests, { controlledMain: true });
    const externalRequests = requests.filter(entry => entry.url?.startsWith('http') && !entry.url.startsWith(proxy.origin + '/'));
    const failedRequests = requests.filter(entry => entry.failed && !entry.canceled);
    result.runs[name] = { ...metrics, observedReadyWallMs, state, mainFixture, summary, resourceSummary, requests, externalRequests, failedRequests, proxyTransactions: proxy.transactions.slice(proxyStart) };
    assert.equal(state.capturedMainFrame, true);
    assert.equal(state.sampleCount, device === 'mobile' ? 207 : 389);
    assert.equal(state.applausePcmBytes, 14288400);
    assert.ok(state.audienceFingerprint.count > 0 && state.audienceFingerprint.occupiedCount > 0, 'The fixed crowd remains enabled');
    assert.equal(metrics.fontStatus, 'loaded');
    assert.ok(metrics.readyMs > 0);
    if (cfg.fontMode !== 'network') assert.deepEqual(externalRequests, []);
    assert.deepEqual(failedRequests, []);
    await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ label, venue, device, stage: name + '-ready', readyMs: metrics.readyMs, longTasks: { count: metrics.bootLongTasks.count, totalMs: metrics.bootLongTasks.totalMs, maxMs: metrics.bootLongTasks.maxMs }, samples: summary.samples, state }));
  }
  const cold = result.runs.cold, warm = result.runs.warm;
  // If the browser/server invalidated or bypassed all cache entries, preserve
  // the observations but refuse to label this a verified warm-cache run.
  assert.ok(warm.summary.samples.cacheHits > 0 || warm.resourceSummary.samples.zeroTransferEntries > 0, 'No cached MP3 observed in the warm navigation');
  result.comparison = {
    warmMinusColdReadyMs: warm.readyMs - cold.readyMs,
    warmMinusColdLongTaskMs: warm.bootLongTasks.totalMs - cold.bootLongTasks.totalMs,
    sampleResponseBytes: { cold: cold.summary.samples.responseEncodedBytes, warm: warm.summary.samples.responseEncodedBytes },
    sampleCountsEqual: cold.state.sampleCount === warm.state.sampleCount,
    samplePcmBytesEqual: cold.state.samplePcmBytes === warm.state.samplePcmBytes,
    scoreEqual: cold.state.piece === warm.state.piece && cold.state.notes === warm.state.notes,
    audienceCountEqual: cold.state.audience === warm.state.audience,
    occupiedCountEqual: cold.state.audienceFingerprint.occupiedCount === warm.state.audienceFingerprint.occupiedCount,
    occupiedSortedFingerprintEqual: cold.state.audienceFingerprint.occupiedSortedSha256 === warm.state.audienceFingerprint.occupiedSortedSha256,
    mainFixtureStable: cold.mainFixture.originalSha256 === warm.mainFixture.originalSha256 && cold.mainFixture.servedSha256 === warm.mainFixture.servedSha256,
  };
  assert.equal(result.comparison.samplePcmBytesEqual, true);
  assert.equal(result.comparison.scoreEqual, true);
  assert.equal(result.comparison.audienceCountEqual, true, 'Cold/warm audience counts differ');
  assert.equal(result.comparison.occupiedCountEqual, true, 'Cold/warm occupied-seat counts differ');
  assert.equal(result.comparison.occupiedSortedFingerprintEqual, true, 'Cold/warm occupied-seat fingerprints differ');
  assert.equal(result.comparison.mainFixtureStable, true, 'Cold/warm main fixture changed');
  assert.deepEqual(errors, []);
  assert.deepEqual(proxy.errors, []);
  result.passed = true;
} catch (error) {
  result.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (proxy) { result.proxyErrors = proxy.errors; await proxy.close(); }
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output, passed: result.passed, comparison: result.comparison, error: result.error, errors }));
}
