// Isolated, real-asset Web Audio preparation experiments. No app/GPU FPS claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { config, launchBrowser, sha256 } from './browser.mjs';

// Experimental fixture only: the application does not import this function.
// The first channel still rounds through Float32 before adding the second.
// The explicit 0 + preserves the original zero-initialized output's -0 rule.
export function compactStereoFixture(ctx, buf, meta, lite) {
  const sr = buf.sampleRate;
  const keep = lite ? Math.min(buf.length, Math.floor(((meta?.s || 0) + 4.5) * sr)) : buf.length;
  const out = ctx.createBuffer(1, keep, sr);
  const o = out.getChannelData(0);
  const n = buf.numberOfChannels;
  if (n === 2) {
    const left = buf.getChannelData(0), right = buf.getChannelData(1);
    for (let i = 0; i < keep; i++) o[i] = Math.fround(0 + left[i] / 2) + right[i] / 2;
  } else {
    for (let c = 0; c < n; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < keep; i++) o[i] += d[i] / n;
    }
  }
  if (keep < buf.length) {
    const f = Math.floor(0.25 * sr);
    for (let i = 0; i < f; i++) o[keep - f + i] *= 1 - i / f;
  }
  return out;
}

async function bounded(promise, ms, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]); }
  finally { clearTimeout(timer); }
}

async function collect(page, { lite, variant, decodeCap }) {
  return page.evaluate(async ({ lite, variant, decodeCap }) => {
    const { AudioEngine } = await import('/js/audio/engine.js');
    const engine = new AudioEngine();
    engine.lite = lite;
    const ctx = engine.ctx = new AudioContext({ sampleRate: lite ? 24000 : 48000 });
    const originalCompact = AudioEngine.prototype._compact;
    const originalDecode = ctx.decodeAudioData.bind(ctx);
    const originalFetch = window.fetch;
    const decodes = [], compacts = [], fetches = [], longTasks = [];
    let active = 0, peakActive = 0, permits = 0, peakQueue = 0;
    const waiters = [];
    const acquire = () => {
      if (permits < decodeCap) { permits++; return Promise.resolve(); }
      return new Promise(resolve => { waiters.push(resolve); peakQueue = Math.max(peakQueue, waiters.length); });
    };
    const release = () => {
      const next = waiters.shift();
      if (next) next(); else permits--;
    };
    const observer = PerformanceObserver.supportedEntryTypes.includes('longtask') ? new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration });
    }) : null;
    observer?.observe({ type: 'longtask' });
    window.fetch = async (...args) => {
      const start = performance.now();
      const response = await originalFetch(...args);
      const received = performance.now();
      const originalBody = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => {
        const buffer = await originalBody();
        fetches.push({ path: new URL(response.url).pathname, headersMs: received - start,
          bodyReadyMs: performance.now() - start, bytes: buffer.byteLength });
        return buffer;
      };
      return response;
    };
    ctx.decodeAudioData = async buffer => {
      const queued = performance.now();
      await acquire();
      const start = performance.now();
      active++; peakActive = Math.max(peakActive, active);
      try {
        const decoded = await originalDecode(buffer);
        decodes.push({ waitMs: start - queued, elapsedMs: performance.now() - start,
          channels: decoded.numberOfChannels, sampleRate: decoded.sampleRate, length: decoded.length });
        return decoded;
      } finally { active--; release(); }
    };
    engine._compact = function (buf, meta) {
      const start = performance.now();
      const out = variant === 'stereo-fused' ? window.__sampleCompact(ctx, buf, meta, lite) : originalCompact.call(this, buf, meta);
      compacts.push({ elapsedMs: performance.now() - start, inputChannels: buf.numberOfChannels,
        inputLength: buf.length, outputLength: out.length, sampleRate: out.sampleRate });
      return out;
    };
    performance.clearResourceTimings();
    performance.setResourceTimingBufferSize(2000);
    const started = performance.now();
    let loaded;
    try { loaded = await engine.loadSamples('/samples'); }
    finally { window.fetch = originalFetch; }
    const finished = performance.now();
    // Take observer delivery and hashes outside the timed preparation window.
    await new Promise(resolve => setTimeout(resolve, 0));
    for (const entry of observer?.takeRecords() || []) longTasks.push({ start: entry.startTime, duration: entry.duration });
    observer?.disconnect();
    const sampleResources = performance.getEntriesByType('resource')
      .filter(entry => new URL(entry.name).pathname.endsWith('.mp3'))
      .map(entry => ({ path: new URL(entry.name).pathname, durationMs: entry.duration,
        transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize }));
    const samples = [];
    for (const [instrument, entry] of Object.entries(engine.samples)) {
      for (const midi of entry.notes) {
        const buffer = entry.buf.get(midi), hashes = [];
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const floats = buffer.getChannelData(channel);
          const digest = await crypto.subtle.digest('SHA-256', floats);
          hashes.push([...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''));
        }
        samples.push({ instrument, midi, length: buffer.length, sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels, sha256: hashes });
      }
    }
    await ctx.close();
    const sum = (rows, key) => rows.reduce((n, row) => n + row[key], 0);
    const selectedTasks = longTasks.filter(entry => entry.start >= started && entry.start < finished);
    return {
      elapsedMs: finished - started, startedMs: started, finishedMs: finished,
      loaded, failed: engine.failed, requestedRate: lite ? 24000 : 48000, actualRate: ctx.sampleRate,
      compactImplementation: variant === 'stereo-fused' ? 'experimental-fixture' : 'served-AudioEngine.prototype._compact',
      experimentalFixturePresent: typeof window.__sampleCompact === 'function',
      originalCompactSource: originalCompact.toString(),
      decode: { calls: decodes.length, peakActive, peakQueue, summedElapsedMs: sum(decodes, 'elapsedMs'),
        summedQueueMs: sum(decodes, 'waitMs'), details: decodes },
      compact: { calls: compacts.length, totalMs: sum(compacts, 'elapsedMs'), maxMs: Math.max(0, ...compacts.map(x => x.elapsedMs)),
        trimmed: compacts.filter(x => x.outputLength < x.inputLength).length, details: compacts },
      fetch: { calls: fetches.length, bytes: sum(fetches, 'bytes'), details: fetches },
      longTasks: { supported: Boolean(observer), count: selectedTasks.length,
        totalMs: sum(selectedTasks, 'duration'), maxMs: Math.max(0, ...selectedTasks.map(x => x.duration)), entries: selectedTasks },
      resources: { count: sampleResources.length, cacheHits: sampleResources.filter(x => x.transferSize === 0 && x.decodedBodySize > 0).length,
        transferSize: sum(sampleResources, 'transferSize'), details: sampleResources },
      pcmBytes: samples.reduce((n, row) => n + row.length * row.channels * 4, 0), samples,
    };
  }, { lite, variant, decodeCap });
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('node tools/bench/sample-preparation.mjs LABEL [full|lite] [original|stereo-fused] [decode-cap 1..6]\n실제 AudioEngine.loadSamples와 MP3 전체 집합의 cold/warm 준비를 계측해. stereo-fused는 도구 안의 실험 fixture이며 제품 수정이 아니야. AudioContext/샘플만 사용하고 렌더·IR·박수·사용자 입장 시간은 포함하지 않아. 다른 브라우저/CPU 벤치와 직렬 실행해. 출력 LABEL 폴더는 새 이름을 써. BASE_URL, REVISION, OUTPUT_DIR, PLAYWRIGHT_MODULE, CHROME_EXECUTABLE, CHROME_ARGS, TIMEOUT_MS를 사용해.');
    return;
  }
  const [label, profile = 'full', variant = 'original', cap = '6'] = process.argv.slice(2);
  assert.ok(label && process.argv.length <= 6);
  assert.ok(['full', 'lite'].includes(profile));
  assert.ok(['original', 'stereo-fused'].includes(variant));
  const decodeCap = Number(cap);
  assert.ok(Number.isSafeInteger(decodeCap) && decodeCap >= 1 && decodeCap <= 6);
  const cfg = config(label), folder = path.join(cfg.outputDir, label);
  await fs.mkdir(cfg.outputDir, { recursive: true });
  await fs.mkdir(folder);
  const result = { schema: 1, kind: 'isolated-real-sample-preparation', status: 'RUNNING',
    label, profile, variant, decodeCap, revision: cfg.revision, baseURL: cfg.baseURL,
    measuredAt: new Date().toISOString(), toolSha256: sha256(await fs.readFile(new URL(import.meta.url))),
    fixtureSha256: sha256(compactStereoFixture.toString()),
    method: 'Actual AudioEngine.loadSamples, all manifest-selected MP3, real browser decodeAudioData and AudioBuffer. Fresh context cold pass then same-context navigation and warm pass. No route interception. Six unchanged load workers; optional decode semaphore and experimental compact fixture. Timing excludes PCM hashes and source checks.',
    limitations: ['Isolated sample preparation, not total app entry time, rendered FPS, music playback, or audible quality.',
      'Cold/warm describe observed browser MP3 response cache only. OS/server and browser process caches can be warm.',
      'Decode elapsed sums overlap. peakActive counts pending native decode promises; it is not an OS thread count or native memory peak.',
      'Long tasks and _compact timings are main-thread observations. Returned PCM byte totals are retained mono sample storage, not heap/RAM/VRAM.',
      'Experimental stereo-fused is not product code. Compare every PCM hash, buffer shape and compact source across independent repeat pairs before adopting.'],
    sourceHashes: {}, runs: {}, errors: [], warnings: [], consoleErrors: [], failedRequests: [] };
  await fs.writeFile(path.join(folder, 'setup.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  let browser, context;
  const readSources = async () => {
    const manifestResponse = await context.request.get(new URL('samples/manifest.json', cfg.baseURL).href);
    let manifest;
    try { assert.ok(manifestResponse.ok()); manifest = await manifestResponse.json(); }
    finally { await manifestResponse.dispose(); }
    const names = ['js/audio/engine.js', 'js/audio/crowd-loader.js', 'js/audio/crowd.js', 'js/layout.js', 'samples/manifest.json',
      ...Object.entries(manifest).flatMap(([instrument, notes]) => Object.keys(notes).map(note => `samples/${instrument}/${note}.mp3`))];
    const values = {};
    for (let i = 0; i < names.length; i += 8) await Promise.all(names.slice(i, i + 8).map(async name => {
      const response = await context.request.get(new URL(name, cfg.baseURL).href);
      try { assert.ok(response.ok(), name); values[name] = sha256(await response.body()); }
      finally { await response.dispose(); }
    }));
    return values;
  };
  try {
    browser = await launchBrowser(cfg);
    context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(cfg.timeoutMs);
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'warning') result.warnings.push(message.text());
      if (message.type() === 'error') result.consoleErrors.push(message.text());
    });
    page.on('requestfailed', request => result.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    result.environment = { browserVersion: browser.version(), platform: process.platform, arch: process.arch,
      chromeArgs: cfg.chromeArgs, headless: cfg.headless, logicalCpu: await page.evaluate(() => navigator.hardwareConcurrency) };
    result.sourceHashes = await readSources();
    // A JSON document provides this same origin without booting the WebGL app.
    const originDocument = new URL('samples/manifest.json', cfg.baseURL).href;
    for (const temperature of ['cold', 'warm']) {
      if (temperature === 'warm') await page.goto('about:blank');
      await page.goto(originDocument, { waitUntil: 'load' });
      if (variant === 'stereo-fused') await page.addScriptTag({ content: 'window.__sampleCompact = ' + compactStereoFixture.toString() + ';' });
      const run = await bounded(collect(page, { lite: profile === 'lite', variant, decodeCap }), cfg.timeoutMs, temperature + ': sample preparation exceeded time budget');
      run.originalCompactSha256 = sha256(run.originalCompactSource);
      delete run.originalCompactSource;
      assert.equal(run.loaded.total, profile === 'lite' ? 207 : 389);
      assert.equal(run.failed.length, 0);
      assert.equal(run.samples.length, run.loaded.total);
      assert.equal(run.actualRate, run.requestedRate);
      assert.equal(run.experimentalFixturePresent, variant === 'stereo-fused');
      assert.equal(run.resources.count, run.loaded.total);
      if (temperature === 'cold') assert.equal(run.resources.cacheHits, 0, 'Cold sample response was cached');
      else assert.equal(run.resources.cacheHits, run.loaded.total, 'Warm MP3 responses were not all cached');
      result.runs[temperature] = run;
      await fs.writeFile(path.join(folder, temperature + '.json'), JSON.stringify(run, null, 2) + '\n', { flag: 'wx' });
      console.log(JSON.stringify({ label, profile, variant, decodeCap, temperature, elapsedMs: run.elapsedMs,
        compactMs: run.compact.totalMs, compactMaxMs: run.compact.maxMs, peakDecode: run.decode.peakActive,
        longTaskMs: run.longTasks.totalMs, sampleCount: run.samples.length, cacheHits: run.resources.cacheHits }));
    }
    assert.deepEqual(result.runs.cold.samples, result.runs.warm.samples, 'Cold/warm PCM differs');
    result.sourceHashesAfter = await readSources();
    assert.deepEqual(result.sourceHashesAfter, result.sourceHashes, 'Served source changed');
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.consoleErrors, [], 'Browser console errors occurred');
    assert.deepEqual(result.failedRequests, [], 'Browser requests failed');
    result.status = 'PASS';
  } catch (error) {
    result.status = 'FAIL'; result.failure = { message: error.message, stack: error.stack };
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (browser) {
      try { await bounded(browser.close(), 10000, 'Browser close exceeded 10s'); }
      catch (error) { result.status = 'FAIL'; result.closeFailure = error.message; process.exitCode = 1; }
    }
    await fs.writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
