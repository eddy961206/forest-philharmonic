// qa-v2/full-frame.mjs의 이동 가능한 전체 장면 측정기야.
import fs from 'node:fs/promises';
import path from 'node:path';
import { appURL, choice, config, diagnosticsFailed, integer, openPage, save, sha256, sourceHashes, summarize, viewport } from './browser.mjs';

if (process.argv.includes('--help')) {
  console.log('node tools/bench/full-frame.mjs [label] [hall|sphere] [high|medium|low|auto] [desktop|mobile] [front,wide,...]\n환경: BASE_URL, REVISION, PLAYWRIGHT_MODULE, CHROME_EXECUTABLE, OUTPUT_DIR, MODE=sync|cadence, SAMPLES, WARMUP, SOFTWARE_RENDERER=1, FONT_ROOT, WIDTH, HEIGHT, DPR, SCREENSHOTS=1, TIMEOUT_MS=180000\nTIMEOUT_MS는 브라우저 준비·조작 대기와 각 cadence 장면의 전체 표본 수집 제한이야. 준비 프레임과 sync 표본 수집 전체를 감싸는 제한은 아니야. cadence 시간 초과는 FAIL로 저장하고 브라우저를 닫아.\nSphere는 UI 준비와 dome.mesh.visible을 기다리고, 기존 WARMUP 프레임에서 실제 base/사용 중 overlay draw 및 프로그램 완료·링크를 확인해. 미확인 상태는 FAIL로 보존해. 카운터는 warmup 뒤 복원하고 프로그램 검사는 측정 구간 밖에서만 실행해. Hall의 돔 검사는 해당 없음으로 기록해.');
  process.exit(0);
}
const [label = 'candidate', venue = 'hall', quality = 'high', device = 'desktop', scenarioList = 'front,wide'] = process.argv.slice(2);
choice(venue, ['hall', 'sphere'], 'venue');
choice(quality, ['high', 'medium', 'low', 'auto'], 'quality');
choice(device, ['desktop', 'mobile'], 'device');
const mode = choice(process.env.MODE || 'sync', ['sync', 'cadence'], 'MODE');
if (quality === 'auto' && mode !== 'cadence') throw new Error('자동 품질은 MODE=cadence로만 관찰해. 고정 품질 비교에는 수동 프리셋을 써 줘.');
const names = scenarioList.split(',');
const available = ['front', 'mid', 'wide', 'foyer', 'rotate', 'broadcast', 'broadcast-hidden', 'broadcast-return', 'dome', 'forest', 'peaks', 'ocean', 'clouds', 'crossfade', 'reveal', 'effects-peak', 'effects-show'];
for (const name of names) choice(name, available, 'scenario');
if (new Set(names).size !== names.length) throw new Error('시나리오 이름이 중복됐어.');
if (names.some((name, i) => ['effects-peak', 'effects-show'].includes(name) && i !== names.length - 1)) throw new Error('effects-peak/effects-show는 시퀀스의 마지막에 놓아 줘. 남은 파티클이 다음 장면의 부하를 바꿀 수 있어.');
if (venue !== 'sphere' && names.some(n => ['dome', 'forest', 'peaks', 'ocean', 'clouds', 'crossfade', 'reveal'].includes(n))) throw new Error('돔 시나리오는 sphere에서 실행해 줘.');
const cfg = config(label);
const size = viewport(device, device === 'mobile' ? { width: 390, height: 844 } : { width: 640, height: 360 });
const samplesPerScenario = integer(process.env.SAMPLES, 'SAMPLES', 12);
const warmupFrames = integer(process.env.WARMUP, 'WARMUP', 4);
const fixture = await fs.readFile(new URL('./full-frame-fixture.js', import.meta.url), 'utf8');
const result = {
  schema: 2, suite: 'whole-frame-controlled', mode: mode === 'sync' ? 'synchronous-completion' : 'raf-cadence',
  label, revision: cfg.revision, baseURL: cfg.baseURL, venue, quality, device,
  viewport: [size.width, size.height], devicePixelRatio: size.dpr, samplesPerScenario, warmupFrames, scenarioOrder: names,
  fixtureSourceSha256: sha256(fixture),
  collectorSourceSha256: sha256(await fs.readFile(new URL(import.meta.url))),
  helperSourceSha256: sha256(await fs.readFile(new URL('./browser.mjs', import.meta.url))),
  screenshots: cfg.screenshots,
  fixturePolicy: {
    piece: 'beethoven-ode-to-joy', musicTime: '25 s; broadcast 5 s; advances 1/60 s per measured step',
    crowdFill: 0.8, crowdSeed: 417, randomSeed: 417, uuidSeed: 874,
    audio: 'real engine created, note scheduler disabled, synthetic performance clock',
    stage: 'snapOnstage + snapConductor', mainAnimation: 'real frame function with controlled camera/time',
    ...(quality === 'auto' ? { animationDtCapSeconds: 0.05, automaticClock: 'normal app dt cap; real elapsed interval; synthetic music clock remains controlled' } : {}),
    ui: 'hidden', included: 'musicians, audience, venue, selected effects/worlds, shadows, selected broadcast, post processing',
    effectsPeak: 'two immediate confetti bursts, three immediate fireworks bursts, ten 1/60 s settling updates; lighting rig still entering; no delayed finale timers',
    effectsShow: 'warm only lasers and wash for 480 x 1/60 s at t=12..20 before the same immediate bursts and ten settling updates; active beams',
    domeReadiness: 'wait for existing UI readiness and visible dome; observe actual main-camera dome draws only during the unchanged warmup; restore hooks and check program readiness/link outside measured samples; hidden dome invalidates a step',
  },
  measurement: mode === 'sync'
    ? '전체 frame() + readPixels 완료 시간. 앱 FPS나 순수 GPU 시간이 아니야.'
    : '네이티브 rAF callback 시작 사이 간격. GPU 완료를 강제하지 않고, 실제 음악·입력·기기 FPS를 증명하지 않아.',
  scenarios: {}, status: 'RUNNING',
};
const filename = `${label}-full-${venue}-${quality}-${device}-${mode}.json`;
let session;
try {
  session = await openPage(cfg, device, size);
  const { page, cdp } = session;
  result.environment = session.environment;
  result.diagnostics = session.diagnostics;
  result.sourceHashes = await sourceHashes(page, cfg.baseURL);
  await cdp.send('Performance.enable');
  await page.addInitScript(({ quality }) => {
    function rng(seed) { return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }; }
    Math.random = rng(417);
    window.__uuidRandom = rng(874);
    window.__resetRandom = () => { Math.random = rng(417); };
    localStorage.setItem('fp-settings', JSON.stringify({ quality, audience: true }));
    const native = window.requestAnimationFrame.bind(window);
    window.__nativeRAF = native;
    window.requestAnimationFrame = callback => callback.name === 'frame' ? (window.__benchFrame = callback, 0) : native(callback);
    // Manual comparison freezes animation progression. Automatic quality must
    // keep the normal app's cap: the old controller derives FPS from this dt.
    // A 1/60 cap here would incorrectly stop baseline auto from ever adapting.
    window.__fpMaxDt = quality === 'auto' ? 0.05 : 1 / 60;
    window.__longTasks = [];
    if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.__longTasks.push({ start: e.startTime, duration: e.duration }); }).observe({ entryTypes: ['longtask'] });
  }, { quality });
  await page.route('**/vendor/three/three.core.js', async route => {
    try {
      const response = await route.fetch();
      const body = await response.text();
      const match = body.match(/function generateUUID\(\) \{[\s\S]*?\n\}/);
      if (!match || !match[0].includes('Math.random()')) throw new Error('Three UUID fixture 위치를 찾지 못했어. vendored Three 변경을 검토해 줘.');
      await route.fulfill({ response, body: body.replace(match[0], match[0].replaceAll('Math.random()', 'window.__uuidRandom()')) });
    } catch (error) { session.diagnostics.pageErrors.push(`UUID fixture: ${error.message}`); await route.abort(); }
  });
  await page.route('**/js/main.js', async route => {
    try {
      const response = await route.fetch();
      const body = await response.text();
      if (!body.includes('function frame()') || !body.includes('window.__fp =')) throw new Error('예상한 main.js 구조가 아니야. fixture를 검토해 줘.');
      await route.fulfill({ response, body: `${body}\n${fixture}` });
    } catch (error) { session.diagnostics.pageErrors.push(`main fixture: ${error.message}`); await route.abort(); }
  });
  await page.goto(appURL(cfg.baseURL, venue), { waitUntil: 'domcontentloaded' });
  result.initialReadiness = { status: 'WAITING', policy: 'existing UI readiness plus visible Sphere dome; no forced visibility' };
  try {
    await page.waitForFunction(() => {
      const enter = document.getElementById('enterBtn'), fp = window.__fp;
      return !!window.__bench && !!enter && !enter.disabled && !!fp &&
        (!fp.hall.dome || fp.hall.dome.mesh.visible === true);
    }, null, { polling: 100 });
    Object.assign(result.initialReadiness, await page.evaluate(() => ({
      status: 'READY', uiReady: !document.getElementById('enterBtn').disabled,
      dome: window.__fp.hall.dome ? { visible: window.__fp.hall.dome.mesh.visible } : { status: 'NOT_APPLICABLE' },
      interpretation: 'UI and visibility gate only; actual draw and program evidence is checked after each scenario warmup.',
    })));
  } catch (error) {
    result.initialReadiness.status = 'WAIT_FAILED';
    result.initialReadiness.error = error.message;
    throw error;
  }
  result.fixture = await page.evaluate(() => window.__bench.setup());
  await page.addStyleTag({ content: 'body > :not(#stage) { visibility: hidden !important; }' });
  result.meta = await page.evaluate(() => window.__bench.meta());
  console.log(JSON.stringify({ label, suite: result.suite, venue, quality, device, stage: 'ready', fixture: result.fixture, meta: result.meta }));
  for (const name of names) {
    const scenario = await page.evaluate(name => window.__bench.scenario(name), name);
    console.log(JSON.stringify({ label, name, stage: 'warmup' }));
    await page.evaluate(() => window.__bench.beginDomeWarmup());
    let domeReadiness;
    try {
      for (let i = 0; i < warmupFrames; i++) await page.evaluate(() => window.__bench.step(true));
    } finally {
      domeReadiness = await page.evaluate(() => window.__bench.endDomeWarmup());
      result.scenarios[name] = { scenario, domeReadiness };
    }
    if (venue === 'sphere' && domeReadiness.status !== 'VERIFIED') {
      throw new Error(`${name}: dome warmup is ${domeReadiness.status}: ${(domeReadiness.failures || []).join(' ')}`);
    }
    const metricsBefore = (await cdp.send('Performance.getMetrics')).metrics;
    let samples;
    if (mode === 'cadence') {
      // Playwright's default timeout does not bound page.evaluate promises.
      // Keep the deadline in Node so a suspended rAF cannot leave this pending.
      let cadenceTimeout;
      try {
        samples = await Promise.race([
          page.evaluate(n => new Promise((resolve, reject) => {
            const rows = [];
            let previous = null;
            function next() {
              try {
                const now = performance.now();
                const row = window.__bench.step(false);
                if (previous !== null) rows.push({ ...row, cadenceMs: now - previous });
                previous = now;
                if (rows.length >= n) resolve(rows); else window.__nativeRAF(next);
              } catch (error) { reject(error); }
            }
            window.__nativeRAF(next);
          }), samplesPerScenario),
          new Promise((_, reject) => {
            cadenceTimeout = setTimeout(() => reject(new Error(`${name}: cadence 표본 수집이 TIMEOUT_MS=${cfg.timeoutMs} ms를 초과했어.`)), cfg.timeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(cadenceTimeout);
      }
    } else {
      samples = [];
      for (let i = 0; i < samplesPerScenario; i++) samples.push(await page.evaluate(() => window.__bench.step(true)));
    }
    const summary = summarize(samples, mode === 'sync' ? 'completeMs' : 'cadenceMs');
    const metricsAfter = (await cdp.send('Performance.getMetrics')).metrics;
    const beforeByName = Object.fromEntries(metricsBefore.map(m => [m.name, m.value]));
    const afterByName = Object.fromEntries(metricsAfter.map(m => [m.name, m.value]));
    const cdpDurationDeltaMs = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].map(key =>
      [key, Number.isFinite(beforeByName[key]) && Number.isFinite(afterByName[key]) ? (afterByName[key] - beforeByName[key]) * 1000 : null]));
    result.scenarios[name] = { scenario, domeReadiness, samples, ...summary, cdpMetricsBefore: metricsBefore, cdpMetricsSnapshot: metricsAfter, cdpDurationDeltaMs,
      cdpInterpretation: 'Main-thread task/script duration over the controlled collection window, including QA overhead and synchronous waits; not CPU utilization or pure GPU time.' };
    if (samples.some(s => s.glError || s.contextLost)) throw new Error(`${name}: WebGL 오류가 생겼어.`);
    await save(cfg, filename, result);
    if (cfg.screenshots) await page.locator('#stage canvas').screenshot({ path: path.join(cfg.outputDir, `${label}-full-${venue}-${quality}-${device}-${mode}-${name}.png`) });
    console.log(JSON.stringify({ label, name, ...summary.timing, calls: summary.meanCalls, triangles: summary.meanTriangles }));
  }
  result.longTasks = await page.evaluate(() => window.__longTasks);
  result.sourceHashesAfter = await sourceHashes(page, cfg.baseURL);
  if (JSON.stringify(result.sourceHashesAfter) !== JSON.stringify(result.sourceHashes)) throw new Error('Served source changed during this benchmark; exclude and rerun.');
  result.status = diagnosticsFailed(session.diagnostics) ? 'FAIL' : 'PASS';
} catch (error) {
  result.status = 'FAIL'; result.failure = { message: error.message, stack: error.stack };
  console.error(error.message);
  // Persist the failure before closing the browser with a pending evaluation.
  await save(cfg, filename, result);
} finally {
  if (session) await session.browser.close();
  await save(cfg, filename, result);
}
if (result.status !== 'PASS') process.exitCode = 1;
