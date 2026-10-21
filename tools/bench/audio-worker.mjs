// Run serially with GPU measurements. This page imports only the audio modules:
// no scene, render loop, sample downloads or audible playback are started.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config, launchBrowser } from './browser.mjs';
import { loopbackURL } from './loading-proxy.mjs';

const [label = 'current'] = process.argv.slice(2);
const cfg = config(label);
const origin = loopbackURL(cfg.baseURL).origin;
await fs.mkdir(cfg.outputDir, { recursive: true });
const output = path.join(cfg.outputDir, 'audio-worker-' + label + '.json');
const browser = await launchBrowser(cfg);
// Keep one explicit context alive for both pages. The packaged Chromium uses
// a single process and can exit when an implicit browser.newPage context closes.
const context = await browser.newContext({ viewport: { width: 320, height: 240 } });
const result = {
  measuredAt: new Date().toISOString(), origin, label, revision: cfg.revision, browserVersion: browser.version(),
  method: 'Real Chromium dedicated module Worker and real OfflineAudioContext AudioBuffers. The production engine/loader/worker/synthesizer are imported unchanged from the local server. Each PCM channel is hashed and compared with the original synchronous synthesizer in the same browser. A second page blocks workers through Content-Security-Policy to exercise real fallback. No GPU workload, app boot, actual speaker output or device audio timing is measured. Durations are single-run diagnostic observations, not performance claims.',
  cases: [], passed: false,
};

try {
  for (const blocked of [false, true]) {
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
    const data = await page.evaluate(async ({ blocked }) => {
      const { AudioEngine } = await import('/js/audio/engine.js');
      const { renderApplause } = await import('/js/audio/crowd.js');
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
      const engine = new AudioEngine();
      engine.ctx = ctx;
      let heartbeatCount = 0;
      const timer = setInterval(() => { heartbeatCount++; }, 0);
      const began = performance.now();
      const ready = engine.prepareApplause();
      const prepareCallMs = performance.now() - began;
      const immediateBufferCount = bufferCount;
      const samePromise = ready === engine.prepareApplause();
      const crowd = await ready;
      const readyMs = performance.now() - began;
      clearInterval(timer);
      window.Worker = NativeWorker;
      const toHex = buffer => [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
      const hashBuffer = async buffer => {
        const hashes = [];
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          hashes.push(toHex(await crypto.subtle.digest('SHA-256', buffer.getChannelData(channel))));
        }
        return hashes;
      };
      const profiles = [
        ['welcome', crowd.welcome, { seconds: 5.5, people: 120, seed: 11 }],
        ['normal0', crowd.normal[0], { seconds: 10, people: 170, seed: 21 }],
        ['normal1', crowd.normal[1], { seconds: 10, people: 170, seed: 22 }],
        ['finale', crowd.finale, { seconds: 15, people: 240, seed: 31, rhythmic: true }],
      ];
      let originalSyncMs = 0;
      const comparisons = [];
      for (const [profile, actual, options] of profiles) {
        const start = performance.now();
        const expected = renderApplause(ctx, options);
        originalSyncMs += performance.now() - start;
        const actualHashes = await hashBuffer(actual);
        const expectedHashes = await hashBuffer(expected);
        comparisons.push({ profile, length: actual.length, sampleRate: actual.sampleRate, channels: actual.numberOfChannels, bytes: actual.length * actual.numberOfChannels * 4, actualHashes, expectedHashes, equal: actual.length === expected.length && actualHashes.every((hash, i) => hash === expectedHashes[i]) });
      }
      // Connect only to silent, unrendered OfflineAudioContext nodes. This checks
      // the public playback method without touching a speaker or the real app.
      engine.dryBus = ctx.createGain();
      engine.reverbIn = ctx.createGain();
      const source = engine.applause(0.25, 1);
      const synchronousPlayback = source.buffer === crowd.normal[1];
      engine.stopApplause();
      return { blocked, userAgent: navigator.userAgent, samePromise, immediateBufferCount, preparedBufferCount: bufferCount - 4, prepareCallMs, readyMs, heartbeatCount, originalSyncMs, workers, comparisons, outputBytes: comparisons.reduce((bytes, item) => bytes + item.bytes, 0), synchronousPlayback };
    }, { blocked });
    data.pageErrors = pageErrors;
    data.consoleErrors = consoleErrors;
    result.cases.push(data);
    assert.equal(data.samePromise, true);
    assert.equal(data.preparedBufferCount, 4);
    assert.equal(data.outputBytes, 14288400);
    assert.ok(data.comparisons.every(profile => profile.equal && profile.sampleRate === 44100 && profile.channels === 2));
    assert.equal(data.synchronousPlayback, true);
    assert.deepEqual(pageErrors, []);
    if (!blocked) {
      assert.equal(data.immediateBufferCount, 0);
      assert.equal(data.workers.length, 1);
      assert.equal(data.workers[0].messages, 4);
      assert.equal(data.workers[0].errors, 0);
      assert.equal(data.workers[0].terminated, true);
      assert.ok(data.heartbeatCount > 0);
      assert.deepEqual(consoleErrors, []);
    } else {
      assert.ok(data.workers.every(worker => worker.messages === 0 && worker.terminated));
      assert.ok(consoleErrors.some(message => /worker-src|Content Security Policy/i.test(message)));
    }
  }
  result.passed = true;
} catch (error) {
  result.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output, passed: result.passed, cases: result.cases.map(item => ({ blocked: item.blocked, samePromise: item.samePromise, pcmEqual: item.comparisons.every(profile => profile.equal), workers: item.workers, outputBytes: item.outputBytes, pageErrors: item.pageErrors, consoleErrors: item.consoleErrors })), error: result.error }, null, 2));
}
