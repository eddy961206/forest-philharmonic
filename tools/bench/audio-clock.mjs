// Isolate the browser's real audio clock. No product imports, server, WebGL,
// frame loop, clock substitution or manually advanced audio are used.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { choice, config, save, sha256 } from './browser.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`node tools/bench/audio-clock.mjs [label] [current|multiprocess] [seconds]
기본은 clock/current/65초야. 앱·서버·WebGL 없이 실제 AudioContext만 관찰해.
공통 환경: PLAYWRIGHT_MODULE, CHROME_EXECUTABLE, CHROME_ARGS, HEADLESS,
           OUTPUT_DIR, TIMEOUT_MS, SOFTWARE_RENDERER
AUDIO_OUTPUT=default|fake: fake는 Chromium --disable-audio-output을 추가해.
AUDIO_MUTE=playwright|unmuted: unmuted는 기본 --mute-audio를 제외해.
AUDIO_SIGNAL=continuous|delayed|silent: 기본 220Hz·gain 0.001 연속 출력이야.
delayed는 실제 audio clock의 55초 뒤 시작하고 silent는 gain 0이야.
SAMPLE_RATE=48000|24000. 기본은 앱 desktop과 같은 48000/playback이야.
multiprocess는 --single-process, --in-process-gpu와 disable-features의
AudioServiceOutOfProcess만 제거해. 그 밖의 제공 인자는 그대로 기록해.
실제 명령줄·프로세스 목록을 저장해. 어떤 설정도 실제 스피커 검증은 아니야.
한 번에 하나씩 실행해. --help는 브라우저를 시작하지 않아.`);
  process.exit(0);
}
assert.ok(args.length <= 3, 'Expected [label] [current|multiprocess] [seconds]');
const [label = 'clock', mode = 'current', secondsText = '65'] = args;
choice(mode, ['current', 'multiprocess'], 'process mode');
const durationSeconds = Number(secondsText);
assert.ok(Number.isFinite(durationSeconds) && durationSeconds >= 61 && durationSeconds <= 120, 'Duration must be 61..120 seconds');
const outputMode = choice(process.env.AUDIO_OUTPUT || 'default', ['default', 'fake'], 'AUDIO_OUTPUT');
const muteMode = choice(process.env.AUDIO_MUTE || 'playwright', ['playwright', 'unmuted'], 'AUDIO_MUTE');
const signal = choice(process.env.AUDIO_SIGNAL || 'continuous', ['continuous', 'delayed', 'silent'], 'AUDIO_SIGNAL');
const sampleRate = Number(process.env.SAMPLE_RATE || 48000);
assert.ok([24000, 48000].includes(sampleRate), 'SAMPLE_RATE must be 24000 or 48000');
const cfg = config(label);
const requestedChromeArgs = [...cfg.chromeArgs];
let chromeArgs = [...requestedChromeArgs];
if (mode === 'multiprocess') {
  chromeArgs = chromeArgs.filter(arg => !['--single-process', '--in-process-gpu'].includes(arg));
  chromeArgs = chromeArgs.flatMap(arg => {
    if (!arg.startsWith('--disable-features=')) return [arg];
    const features = arg.slice('--disable-features='.length).split(',').filter(name => name !== 'AudioServiceOutOfProcess');
    return features.length ? ['--disable-features=' + features.join(',')] : [];
  });
}
if (outputMode === 'fake' && !chromeArgs.includes('--disable-audio-output')) chromeArgs.push('--disable-audio-output');
if (muteMode === 'unmuted') chromeArgs = chromeArgs.filter(arg => arg !== '--mute-audio');
const ignoreDefaultArgs = muteMode === 'unmuted' ? ['--mute-audio'] : [];
const filename = `audio-clock-${label}-${mode}.json`;
const report = {
  schema: 1, suite: 'native-audio-clock-only', status: 'RUNNING', label,
  measuredAt: new Date().toISOString(), fixtureSourceSha256: sha256(await fs.readFile(new URL(import.meta.url))),
  mode, outputMode, muteMode, signal, durationSeconds, requestedSampleRate: sampleRate,
  method: 'A real UI click starts a native playback-latency AudioContext and 220Hz oscillator. 100ms passive clock/RMS snapshots, independent real 25ms JS and Worker timers. No app imports, network requests, WebGL, rAF, synthetic time, context restart, or suspend/resume recovery.',
  limitations: [
    'This diagnoses native clock progress only. It does not verify the product scheduler, note fidelity, physical output device or audible quality.',
    'Multiprocess removes only the recorded process overrides; it does not certify that all remaining packaged-browser flags match an ordinary desktop installation.',
    'Fake output requests Chromium native AUDIO_FAKE streams. It changes the output path, not JavaScript time; its result is separate from the default output result.',
  ],
  environment: { node: process.version, platform: process.platform, architecture: process.arch, headless: cfg.headless, requestedChromeArgs, chromeArgs, ignoreDefaultArgs },
  diagnostics: { pageErrors: [], consoleErrors: [], warnings: [] },
};
let browser, page;
const require = createRequire(import.meta.url);
try {
  const specifier = cfg.playwrightModule.startsWith('.') ? path.resolve(cfg.playwrightModule) : cfg.playwrightModule;
  const { chromium } = require(specifier);
  report.environment.playwrightVersion = JSON.parse(await fs.readFile(path.join(path.dirname(require.resolve(specifier)), 'package.json'), 'utf8')).version;
  // The normal helper leaves Playwright defaults intact. This isolated probe
  // additionally needs an explicit --mute-audio comparison, so launch here.
  browser = await chromium.launch({
    headless: cfg.headless, args: chromeArgs, ignoreDefaultArgs, timeout: cfg.timeoutMs,
    ...(cfg.chromeExecutable ? { executablePath: cfg.chromeExecutable } : {}),
  });
  report.environment.browserVersion = browser.version();
  const browserCDP = await browser.newBrowserCDPSession();
  const processes = async () => {
    try { return (await browserCDP.send('SystemInfo.getProcessInfo')).processInfo.map(({ type, id }) => ({ type, id })); }
    catch (error) { return { error: error.message }; }
  };
  try { report.environment.actualCommandLine = (await browserCDP.send('Browser.getBrowserCommandLine')).arguments; }
  catch (error) { report.environment.commandLineError = error.message; }
  const context = await browser.newContext({ viewport: { width: 320, height: 240 } });
  page = await context.newPage();
  page.setDefaultTimeout(cfg.timeoutMs);
  page.on('pageerror', error => report.diagnostics.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.diagnostics.consoleErrors.push(message.text());
    if (message.type() === 'warning') report.diagnostics.warnings.push(message.text());
  });
  await page.setContent('<!doctype html><meta charset="utf-8"><title>Native audio clock</title><button id="start">Start audio clock diagnostic</button><p>220Hz, gain 0.001. No product code or graphics.</p>');
  await page.evaluate(({ sampleRate, signal }) => {
    document.getElementById('start').addEventListener('click', async () => {
      try {
        const ctx = new AudioContext({ latencyHint: 'playback', sampleRate });
        const oscillator = ctx.createOscillator(), gain = ctx.createGain(), analyser = ctx.createAnalyser();
        oscillator.frequency.value = 220;
        gain.gain.value = signal === 'silent' ? 0 : 0.001;
        analyser.fftSize = 256;
        oscillator.connect(gain).connect(analyser).connect(ctx.destination);
        const data = new Float32Array(analyser.fftSize);
        const samples = [], events = [];
        let mainTicks = 0, workerTicks = 0, lastMainTickMs = null, lastWorkerTickMs = null;
        const workerURL = URL.createObjectURL(new Blob(['let id;onmessage=e=>{clearInterval(id);id=setInterval(()=>postMessage(0),e.data)}'], { type: 'text/javascript' }));
        const worker = new Worker(workerURL);
        worker.onmessage = () => { workerTicks++; lastWorkerTickMs = performance.now(); };
        worker.onerror = event => events.push({ type: 'workererror', message: event.message, performanceNowMs: performance.now() });
        worker.postMessage(25);
        const mainTimer = setInterval(() => { mainTicks++; lastMainTickMs = performance.now(); }, 25);
        const snapshot = cause => {
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (const value of data) sum += value * value;
          let outputTimestamp = null;
          try {
            const stamp = ctx.getOutputTimestamp?.();
            if (stamp) outputTimestamp = { contextTime: stamp.contextTime, performanceTime: stamp.performanceTime };
          } catch (error) { outputTimestamp = { error: error.message }; }
          return {
            cause, wallTimeMs: Date.now(), performanceNowMs: performance.now(),
            audioNow: ctx.currentTime, audioState: ctx.state, sampleRate: ctx.sampleRate,
            baseLatency: ctx.baseLatency ?? null, outputLatency: ctx.outputLatency ?? null,
            outputTimestamp, rms: Math.sqrt(sum / data.length),
            mainTicks, workerTicks, lastMainTickMs, lastWorkerTickMs, visibility: document.visibilityState,
          };
        };
        const observeEvent = event => events.push(snapshot(event.type));
        ctx.addEventListener('statechange', observeEvent);
        document.addEventListener('visibilitychange', observeEvent);
        await ctx.resume();
        const scheduledStart = ctx.currentTime + (signal === 'delayed' ? 55 : 0);
        oscillator.start(scheduledStart);
        samples.push(snapshot('start'));
        const sampleTimer = setInterval(() => samples.push(snapshot('interval')), 100);
        let stopped = false;
        window.__audioClockProbe = {
          scheduledStart, samples, events,
          finish() {
            if (!stopped) {
              stopped = true;
              clearInterval(sampleTimer); clearInterval(mainTimer);
              samples.push(snapshot('final'));
              worker.terminate(); URL.revokeObjectURL(workerURL);
              oscillator.stop(); oscillator.disconnect(); gain.disconnect(); analyser.disconnect();
              ctx.removeEventListener('statechange', observeEvent);
              document.removeEventListener('visibilitychange', observeEvent);
              // Preserve the observations even if a broken output device never
              // acknowledges close(). Browser cleanup owns final teardown.
              ctx.close().catch(error => events.push({ type: 'close-error', message: error.message }));
            }
            return { scheduledStart, samples, events };
          },
        };
      } catch (error) { window.__audioClockProbeError = { message: error.message, stack: error.stack }; }
    }, { once: true });
  }, { sampleRate, signal });
  await page.locator('#start').click();
  await page.waitForFunction(() => window.__audioClockProbe || window.__audioClockProbeError, null, { polling: 100, timeout: 10000 });
  const startupError = await page.evaluate(() => window.__audioClockProbeError);
  if (startupError) throw new Error(`Audio startup: ${startupError.message}`);
  report.processesAtStart = await processes();
  const startNodeMs = performance.now();
  // This waits for actual elapsed time; it never changes any browser clock.
  await page.waitForTimeout(durationSeconds * 1000);
  report.observedNodeElapsedMs = performance.now() - startNodeMs;
  report.observation = await page.evaluate(() => window.__audioClockProbe.finish());
  report.processesAtEnd = await processes();
  const samples = report.observation.samples, first = samples[0], last = samples.at(-1);
  let lastAdvanceMs = first.performanceNowMs, longestNoAudioProgressMs = 0;
  let maxSampleGapMs = 0, monotonic = true;
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1], sample = samples[i];
    maxSampleGapMs = Math.max(maxSampleGapMs, sample.performanceNowMs - previous.performanceNowMs);
    if (sample.audioNow < previous.audioNow) monotonic = false;
    if (sample.audioNow > previous.audioNow) lastAdvanceMs = sample.performanceNowMs;
    else longestNoAudioProgressMs = Math.max(longestNoAudioProgressMs, sample.performanceNowMs - lastAdvanceMs);
  }
  report.summary = {
    samples: samples.length, wallElapsedMs: last.performanceNowMs - first.performanceNowMs,
    audioElapsedSeconds: last.audioNow - first.audioNow, mainTicks: last.mainTicks, workerTicks: last.workerTicks,
    maxSampleGapMs, longestNoAudioProgressMs, monotonic,
    allRunning: samples.every(sample => sample.audioState === 'running'),
    allVisible: samples.every(sample => sample.visibility === 'visible'),
    nonzeroSignalObserved: samples.some(sample => sample.rms > 0),
  };
  report.checks = {
    advancedForRequestedWallDuration: report.summary.audioElapsedSeconds >= durationSeconds - 1,
    noOneSecondClockPlateau: longestNoAudioProgressMs < 1000,
    monotonic, allRunning: report.summary.allRunning,
    bothTimersActive: last.mainTicks > 0 && last.workerTicks > 0,
    expectedSignal: signal === 'silent' || report.summary.nonzeroSignalObserved,
    noPageErrors: report.diagnostics.pageErrors.length === 0,
  };
  report.status = Object.values(report.checks).every(Boolean) ? 'PASS' : 'FAIL';
} catch (error) {
  report.status = 'ERROR';
  report.failure = { message: error.message, stack: error.stack };
} finally {
  if (browser) await browser.close().catch(error => { report.cleanupError = error.message; });
  await save(cfg, filename, report);
}
console.log(JSON.stringify({ status: report.status, output: path.join(cfg.outputDir, filename), summary: report.summary, failure: report.failure?.message }));
if (report.status !== 'PASS') process.exitCode = 1;
