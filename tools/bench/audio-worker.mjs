// Run serially with GPU measurements. This page imports only the audio modules:
// no scene, render loop, sample downloads or audible playback are started.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config, launchBrowser, sha256 } from './browser.mjs';
import { loopbackURL } from './loading-proxy.mjs';

if (process.argv.includes('--help')) {
  console.log('node tools/bench/audio-worker.mjs [label]\nAUDIO_PREPARATION=house-worker|legacy (default house-worker), AUDIO_CASES=all|worker|fallback (default all). BASE_URL, REVISION, PLAYWRIGHT_MODULE, CHROME_EXECUTABLE and OUTPUT_DIR use the shared browser configuration. Use fresh output labels/directories; compare legacy/candidate in serial ABBA order for repeated prepare-call and ready-time observations. No GPU or audible-output result is measured.');
  process.exit(0);
}
const [label = 'current'] = process.argv.slice(2);
const preparationMode = process.env.AUDIO_PREPARATION || 'house-worker';
const caseMode = process.env.AUDIO_CASES || 'all';
assert.ok(['house-worker', 'legacy'].includes(preparationMode));
assert.ok(['all', 'worker', 'fallback'].includes(caseMode));
const cfg = config(label);
const origin = loopbackURL(cfg.baseURL).origin;
await fs.mkdir(cfg.outputDir, { recursive: true });
const output = path.join(cfg.outputDir, 'audio-worker-' + label + '.json');
await assert.rejects(fs.access(output), error => error.code === 'ENOENT', 'Use a new output file; prior evidence must not be replaced.');
const browser = await launchBrowser(cfg);
// Keep one explicit context alive for both pages. The packaged Chromium uses
// a single process and can exit when an implicit browser.newPage context closes.
const context = await browser.newContext({ viewport: { width: 320, height: 240 } });
const audioSources = ['engine.js', 'crowd-loader.js', 'crowd-worker.js', 'crowd.js'];
async function servedAudioHashes() {
  return Object.fromEntries(await Promise.all(audioSources.map(async name => {
    const response = await context.request.get(`${origin}/js/audio/${name}`, { headers: { 'Cache-Control': 'no-cache' } });
    try {
      assert.ok(response.ok(), `Audio source unavailable: ${name}`);
      return [name, sha256(await response.body())];
    } finally { await response.dispose(); }
  })));
}
const result = {
  measuredAt: new Date().toISOString(), origin, label, revision: cfg.revision, browserVersion: browser.version(), preparationMode, caseMode,
  collectorSha256: sha256(await fs.readFile(new URL(import.meta.url))),
  browserHarnessSha256: sha256(await fs.readFile(new URL('./browser.mjs', import.meta.url))),
  environment: { platform: process.platform, architecture: process.arch, chromeArgs: cfg.chromeArgs, headless: cfg.headless },
  method: 'Real Chromium dedicated module Worker and real OfflineAudioContext AudioBuffers. The production engine/loader/worker/synthesizer are imported unchanged from the local server; their HTTP source hashes are recorded before and after the run outside timed windows. All 17 prepared AudioBuffers (26 PCM channels) are hashed and compared with the original synchronous synthesizers in the same browser. Native timer gaps and Long Tasks describe main-thread responsiveness only; prepareCallMs ends when prepareApplause returns, readyMs also includes the worker and owning-thread graph wiring. Worker-enabled and/or CSP-blocked pages run according to caseMode. No GPU workload, app boot, actual speaker output or device audio timing is measured. Durations are single-run diagnostic observations, not performance claims.',
  cases: [], passed: false,
};

try {
  result.sourceHashesBefore = await servedAudioHashes();
  const blockModes = caseMode === 'worker' ? [false] : caseMode === 'fallback' ? [true] : [false, true];
  for (const { blocked, lite } of blockModes.flatMap(blocked => [false, true].map(lite => ({ blocked, lite })))) {
    const page = await context.newPage();
    page.setDefaultTimeout(cfg.timeoutMs);
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.route(`${origin}/favicon.ico`, route => route.fulfill({ status: 204, body: '' }));
    await page.route(`${origin}/__runtime-audio-qa`, route => route.fulfill({
      status: 200, contentType: 'text/html',
      headers: blocked ? { 'Content-Security-Policy': "worker-src 'none'" } : {},
      body: '<!doctype html><meta charset="utf-8"><title>Local audio worker QA</title><p>Local audio module QA</p>',
    }));
    await page.goto(`${origin}/__runtime-audio-qa`, { waitUntil: 'load' });
    const data = await page.evaluate(async ({ blocked, lite }) => {
      const { AudioEngine } = await import('/js/audio/engine.js');
      const { renderApplause, renderMurmur, renderNoise } = await import('/js/audio/crowd.js');
      const NativeWorker = window.Worker;
      const workers = [];
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          super(url, options);
          this.qa = { url: String(url), options, messages: 0, errors: 0, terminated: false };
          workers.push(this.qa);
          this.addEventListener('message', () => { this.qa.messages++; });
          this.addEventListener('error', () => { this.qa.errors++; });
        }
        terminate() { this.qa.terminated = true; super.terminate(); }
      };
      const ctx = new OfflineAudioContext(2, 1, 48000);
      const nativeCreateBuffer = ctx.createBuffer.bind(ctx);
      let bufferCount = 0;
      ctx.createBuffer = (...args) => { bufferCount++; return nativeCreateBuffer(...args); };
      const nativeCreateSource = ctx.createBufferSource.bind(ctx);
      const sources = [];
      ctx.createBufferSource = () => { const source = nativeCreateSource(); sources.push(source); return source; };
      const engine = new AudioEngine();
      engine.ctx = ctx;
      engine.lite = lite;
      engine.ac = { level: 1, reverb: 1 };
      engine.makeup = ctx.createGain();
      engine.reverbIn = ctx.createGain();
      let houseGraphAllocations = 0;
      let houseCallMs = 0;
      const nativePrepareMurmur = engine._prepareMurmur.bind(engine);
      engine._prepareMurmur = (...args) => {
        const before = bufferCount;
        const began = performance.now();
        nativePrepareMurmur(...args);
        houseCallMs += performance.now() - began;
        houseGraphAllocations += bufferCount - before;
      };
      const longTasks = [];
      const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration }))));
      observer.observe({ type: 'longtask', buffered: false });
      await new Promise(resolve => setTimeout(resolve, 20));
      let lastHeartbeat = performance.now();
      const timerGaps = [];
      const timer = setInterval(() => {
        const now = performance.now();
        timerGaps.push({ startTime: lastHeartbeat, duration: now - lastHeartbeat });
        lastHeartbeat = now;
      }, 0);
      const began = performance.now();
      const ready = engine.prepareApplause();
      const prepareCallMs = performance.now() - began;
      const immediateBufferCount = bufferCount;
      const samePromise = ready === engine.prepareApplause();
      const crowd = await ready;
      const readyMs = performance.now() - began;
      const preparedBufferCount = bufferCount;
      const ended = performance.now();
      await new Promise(resolve => setTimeout(resolve, 20));
      clearInterval(timer);
      observer.disconnect();
      const preparationLongTasks = longTasks.filter(entry => entry.startTime < ended && entry.startTime + entry.duration > began);
      const preparationTimerGaps = timerGaps.filter(entry => entry.startTime < ended && entry.startTime + entry.duration > began);
      const maximumTimerGapMs = Math.max(0, ...preparationTimerGaps.map(entry => entry.duration));
      const heartbeatCount = preparationTimerGaps.filter(entry => entry.startTime + entry.duration <= ended).length;
      const actualHouse = { bed: sources.find(source => source.loop)?.buffer, shots: engine._house.shots };
      if (!actualHouse.bed) throw new Error('The prepared looping house buffer is missing.');
      window.Worker = NativeWorker;
      const toHex = buffer => [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
      const hashBuffer = async buffer => {
        const hashes = [];
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          hashes.push(toHex(await crypto.subtle.digest('SHA-256', buffer.getChannelData(channel))));
        }
        return hashes;
      };
      const people = lite ? 200 : 320;
      const sr = lite ? 16000 : 24000;
      const profiles = [
        ['welcome', crowd.welcome, { seconds: 5.5, people, seed: 11, sr }],
        ['normal0', crowd.normal[0], { seconds: 10, people, seed: 21, sr }],
        ['normal1', crowd.normal[1], { seconds: 10, people, seed: 22, sr }],
        ['finale', crowd.finale, { seconds: 15, people, seed: 31, rhythmic: true, sr }],
      ];
      let originalSyncMs = 0;
      const comparisons = [];
      for (const [profile, actual, options] of profiles) {
        const start = performance.now();
        const expected = renderApplause(ctx, options);
        originalSyncMs += performance.now() - start;
        for (const layer of ['close', 'wash']) {
          const buffer = actual[layer], original = expected[layer];
          const actualHashes = await hashBuffer(buffer);
          const expectedHashes = await hashBuffer(original);
          comparisons.push({ profile, layer, length: buffer.length, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, bytes: buffer.length * buffer.numberOfChannels * 4, actualHashes, expectedHashes, equal: buffer.length === original.length && actualHashes.every((hash, i) => hash === expectedHashes[i]) });
        }
      }
      const expectedHouse = [
        ['murmur', actualHouse.bed, renderMurmur(ctx, { seconds: 9, talkers: lite ? 18 : 30, seed: 5, sr: 16000 })],
        ...['cough', 'cough', 'cough', 'creak', 'creak', 'rustle', 'rustle', 'rustle'].map((kind, i) => {
          if (actualHouse.shots[i]?.kind !== kind) throw new Error('House noise order/kind changed.');
          return [kind + i, actualHouse.shots[i].buf, renderNoise(ctx, kind, { seed: 40 + i, sr: 16000 })];
        }),
      ];
      const houseComparisons = [];
      for (const [profile, buffer, original] of expectedHouse) {
        const actualHashes = await hashBuffer(buffer), expectedHashes = await hashBuffer(original);
        houseComparisons.push({ profile, length: buffer.length, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, bytes: buffer.length * buffer.numberOfChannels * 4, actualHashes, expectedHashes, equal: buffer.length === original.length && buffer.numberOfChannels === original.numberOfChannels && buffer.sampleRate === original.sampleRate && actualHashes.every((hash, i) => hash === expectedHashes[i]) });
      }
      // Connect only to silent, unrendered OfflineAudioContext nodes. This checks
      // the public playback method without touching a speaker or the real app.
      engine.dryBus = ctx.createGain();
      const source = engine.applause(0.25, 1);
      const synchronousPlayback = source.buffer === crowd.normal[1].close;
      engine.stopApplause();
      return { blocked, lite, userAgent: navigator.userAgent, samePromise, housePrepared: !!engine._house, houseGraphAllocations, houseCallMs, immediateBufferCount, preparedBufferCount, prepareCallMs, readyMs, heartbeatCount, maximumTimerGapMs, preparationTimerGaps, preparationLongTasks, originalSyncMs, workers, comparisons, houseComparisons, houseOutputBytes: houseComparisons.reduce((bytes, item) => bytes + item.bytes, 0), outputBytes: comparisons.reduce((bytes, item) => bytes + item.bytes, 0), synchronousPlayback };
    }, { blocked, lite });
    data.pageErrors = pageErrors;
    data.consoleErrors = consoleErrors;
    result.cases.push(data);
    assert.equal(data.samePromise, true);
    assert.equal(data.housePrepared, true);
    assert.equal(data.houseGraphAllocations, preparationMode === 'legacy' ? 9 : 0);
    assert.equal(data.preparedBufferCount, 17);
    assert.equal(data.houseComparisons.length, 9);
    assert.ok(data.houseComparisons.every(item => item.equal && item.sampleRate === 16000));
    assert.equal(data.outputBytes, 40.5 * (lite ? 16000 : 24000) * 16);
    assert.ok(data.comparisons.length === 8 && data.comparisons.every(profile => profile.equal && profile.sampleRate === (lite ? 16000 : 24000) && profile.channels === 2));
    assert.equal(data.synchronousPlayback, true);
    assert.deepEqual(pageErrors, []);
    if (!blocked) {
      assert.equal(data.immediateBufferCount, preparationMode === 'legacy' ? 9 : 0);
      assert.equal(data.workers.length, 1);
      assert.equal(data.workers[0].messages, preparationMode === 'legacy' ? 4 : 5);
      assert.equal(data.workers[0].errors, 0);
      assert.equal(data.workers[0].terminated, true);
      assert.ok(data.heartbeatCount > 0);
      assert.deepEqual(consoleErrors, []);
    } else {
      assert.ok(data.workers.every(worker => worker.messages === 0 && worker.terminated));
      assert.ok(consoleErrors.some(message => /worker-src|Content Security Policy/i.test(message)));
    }
  }
  result.sourceHashesAfter = await servedAudioHashes();
  assert.deepEqual(result.sourceHashesAfter, result.sourceHashesBefore, 'Audio sources changed during measurement.');
  result.passed = true;
} catch (error) {
  result.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, passed: result.passed, cases: result.cases.map(item => ({ blocked: item.blocked, lite: item.lite, samePromise: item.samePromise, pcmEqual: [...item.comparisons, ...item.houseComparisons].every(profile => profile.equal), prepareCallMs: item.prepareCallMs, readyMs: item.readyMs, maximumTimerGapMs: item.maximumTimerGapMs, workers: item.workers, outputBytes: item.outputBytes, pageErrors: item.pageErrors, consoleErrors: item.consoleErrors })), error: result.error }, null, 2));
}
