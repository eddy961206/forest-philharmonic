// Optional driver timer-query QA. No production module imports this collector.
// Uses the existing full-frame fixture verbatim and wraps only its frame call.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { performance as nodeClock } from 'node:perf_hooks';
import { appURL, choice, config, diagnosticsFailed, integer, openPage, save, sha256, sourceHashes, summarize, viewport } from './browser.mjs';

if (process.argv.includes('--help')) {
  console.log(`node tools/bench/gpu-timer.mjs [label] [hall|sphere] [high|medium|low] [desktop|mobile] [scene]
기본값: gpu-candidate / hall / high / desktop / front (sphere 기본 scene은 forest).
기존 full-frame-fixture.js의 관객·카메라·음악 시각·장면 설정을 재사용해.
기본 WARMUP=4, SAMPLES=8. 단일 장면만 실행하고 auto는 지원하지 않아.
환경: BASE_URL, REVISION, OUTPUT_DIR, PLAYWRIGHT_MODULE, CHROME_EXECUTABLE,
CHROME_ARGS, SOFTWARE_RENDERER=1, FONT_ROOT, FONT_MODE, HEADLESS=0, WIDTH, HEIGHT,
DPR, SCREENSHOTS=1, TIMEOUT_MS, FRAME_TIMEOUT_MS=30000, QUERY_TIMEOUT_MS=3000,
QUERY_POLL_MS=25. 브라우저 측 busy-wait 없이 Node deadline 아래 직렬 poll해.
full frame의 GL 명령 범위를 TIME_ELAPSED_EXT로 감싸고, query 종료 후 기존
step(true)의 readPixels 완료 시간을 별도 기록해. 두 값은 앱 FPS가 아니야.
SwiftShader/소프트웨어 renderer 결과는 물리 GPU 성능으로 해석하면 안 돼.
미지원·disjoint·유효하지 않은 query는 SKIP, 앱/fixture/source 오류는 FAIL이야.
PASS/SKIP는 exit 0, FAIL은 exit 1이므로 JSON status도 반드시 확인해.
같은 label/조건의 기존 JSON은 덮어쓰지 않아. --help는 브라우저를 실행하지 않아.`);
  process.exit(0);
}
assert.ok(process.argv.length <= 7, '인자는 label, venue, quality, device, 단일 scene까지야.');
const [label = 'gpu-candidate', venue = 'hall', quality = 'high', device = 'desktop', namedScene] = process.argv.slice(2);
choice(venue, ['hall', 'sphere'], 'venue');
choice(quality, ['high', 'medium', 'low'], 'quality');
choice(device, ['desktop', 'mobile'], 'device');
const sceneName = namedScene || (venue === 'sphere' ? 'forest' : 'front');
const domeScenes = ['dome', 'forest', 'peaks', 'ocean', 'clouds', 'crossfade', 'reveal'];
choice(sceneName, ['front', 'mid', 'wide', 'foyer', 'rotate', 'broadcast', 'broadcast-hidden', 'broadcast-return', 'effects-peak', 'effects-show', ...domeScenes], 'scene');
assert.ok(venue === 'sphere' || !domeScenes.includes(sceneName), '돔 장면은 sphere에서 실행해 줘.');
const cfg = config(label);
const size = viewport(device, device === 'mobile' ? { width: 390, height: 844 } : { width: 640, height: 360 });
const sampleCount = integer(process.env.SAMPLES, 'SAMPLES', 8);
const warmupFrames = integer(process.env.WARMUP, 'WARMUP', 4);
const frameTimeoutMs = integer(process.env.FRAME_TIMEOUT_MS, 'FRAME_TIMEOUT_MS', 30000);
const queryTimeoutMs = integer(process.env.QUERY_TIMEOUT_MS, 'QUERY_TIMEOUT_MS', 3000);
const pollIntervalMs = integer(process.env.QUERY_POLL_MS, 'QUERY_POLL_MS', 25);
assert.ok(pollIntervalMs <= queryTimeoutMs, 'QUERY_POLL_MS는 QUERY_TIMEOUT_MS보다 길 수 없어.');
const fixture = await fs.readFile(new URL('./full-frame-fixture.js', import.meta.url), 'utf8');

// Serialized into the SAME module scope as main.js + full-frame-fixture.js.
// Wrapping frame, rather than step, keeps its readPixels outside the query.
// Primary API specification and async-result rules:
// https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
// https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query/
function installGpuTimer() {
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const webgl2 = typeof gl.createQuery === 'function' && typeof gl.getQueryParameter === 'function';
  const counterBits = ext && webgl2 ? gl.getQuery(ext.TIME_ELAPSED_EXT, ext.QUERY_COUNTER_BITS_EXT) : null;
  const probeError = gl.getError();
  const support = { extension: !!ext, webgl2, counterBits, probeError, contextLost: gl.isContextLost(),
    supported: !!ext && webgl2 && Number.isInteger(counterBits) && counterBits > 0 && probeError === 0 && !gl.isContextLost(),
    webglVersion: gl.getParameter(gl.VERSION), shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    contextAttributes: gl.getContextAttributes() };
  const state = { query: null, armed: false, active: false, captured: false, invalid: null,
    created: 0, deleted: 0, frameSubmitMs: null };
  const originalFrame = frame;
  const release = () => {
    if (state.active && ext) { gl.endQuery(ext.TIME_ELAPSED_EXT); state.active = false; }
    if (state.query) { gl.deleteQuery(state.query); state.query = null; state.deleted++; }
    state.armed = false;
  };
  const skip = (reason, extra = {}) => { release(); return { status: 'SKIP', reason, ...extra }; };
  frame = function frame() {
    if (!state.armed) return originalFrame();
    state.armed = false;
    state.captured = true;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, state.query);
    const beginError = gl.getError();
    state.active = beginError === 0;
    if (beginError) state.invalid = { reason: 'beginQuery-gl-error', glError: beginError };
    const started = performance.now();
    try { return originalFrame(); }
    finally {
      state.frameSubmitMs = performance.now() - started;
      if (state.active) { gl.endQuery(ext.TIME_ELAPSED_EXT); state.active = false; }
      const error = gl.getError();
      if (error) state.invalid = { reason: 'frame-or-endQuery-gl-error', glError: error };
    }
  };
  window.__gpuTimer = {
    support,
    arm() {
      if (!support.supported) return { status: 'SKIP', reason: 'timer-query-unsupported-or-probe-invalid', support };
      if (state.query || state.active) return skip('previous-query-still-pending');
      if (gl.isContextLost()) return skip('context-lost-before-query');
      if (gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return skip('another-elapsed-query-is-active');
      const beforeDisjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (beforeDisjoint) return skip('disjoint-before-query', { disjoint: true });
      const beforeError = gl.getError();
      if (beforeError) return skip('gl-error-before-query', { glError: beforeError });
      state.query = gl.createQuery();
      if (!state.query) return skip('createQuery-returned-null');
      state.created++; state.armed = true; state.captured = false; state.invalid = null; state.frameSubmitMs = null;
      return { status: 'ARMED', queryIndex: state.created };
    },
    poll() {
      if (!state.query) return { status: 'SKIP', reason: 'no-pending-query' };
      if (gl.isContextLost()) return skip('context-lost-during-query');
      if (!state.captured || state.active) return skip('frame-not-captured-or-query-still-active');
      if (state.invalid) return skip(state.invalid.reason, state.invalid);
      const available = gl.getQueryParameter(state.query, gl.QUERY_RESULT_AVAILABLE);
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (disjoint) return skip('disjoint-after-query', { available, disjoint: true });
      const availabilityError = gl.getError();
      if (availabilityError) return skip('availability-gl-error', { glError: availabilityError });
      if (!available) return { status: 'PENDING', available: false, disjoint: false };
      const elapsedNs = gl.getQueryParameter(state.query, gl.QUERY_RESULT);
      const afterDisjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      const resultError = gl.getError();
      if (afterDisjoint || resultError || !Number.isSafeInteger(elapsedNs) || elapsedNs <= 0)
        return skip('invalid-query-result', { available: true, disjoint: afterDisjoint, glError: resultError, rawElapsedNs: elapsedNs });
      const answer = { status: 'VALID', available: true, disjoint: false, elapsedNs,
        driverElapsedMs: elapsedNs / 1e6, frameSubmitMs: state.frameSubmitMs };
      release();
      return answer;
    },
    cancel(reason) { return skip(reason); },
    dispose() {
      release(); frame = originalFrame;
      return { created: state.created, deleted: state.deleted, outstanding: !!state.query,
        active: state.active, contextLost: gl.isContextLost(), glError: gl.getError() };
    },
  };
}

function readMainSceneMemory() {
  const geometries = new Set(), buffers = new Set();
  let attributesWithoutArray = 0;
  const include = attribute => {
    if (!attribute) return;
    const array = attribute.isInterleavedBufferAttribute ? attribute.data?.array : attribute.array;
    if (array?.buffer && Number.isFinite(array.buffer.byteLength)) buffers.add(array.buffer);
    else attributesWithoutArray++;
  };
  window.__fp.scene.traverse(object => {
    const geometry = object.geometry;
    if (!geometry || geometries.has(geometry)) return;
    geometries.add(geometry);
    for (const attribute of Object.values(geometry.attributes || {})) include(attribute);
    include(geometry.index);
    for (const attributes of Object.values(geometry.morphAttributes || {})) for (const attribute of attributes) include(attribute);
  });
  const memory = performance.memory;
  return { mainSceneGeometryArrayBufferBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0),
    uniqueGeometries: geometries.size, uniqueArrayBuffers: buffers.size, attributesWithoutArray,
    performanceMemory: memory ? { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit } : null,
    browserNow: performance.now(),
    interpretation: 'Reachable main-scene geometry attribute/index/morph backing ArrayBuffers, including hidden objects; shared buffers counted once and full buffer.byteLength counted even for a view. JS storage structure estimate, not committed RAM, GPU memory, VRAM, or whole JS heap.',
    excluded: ['separate cubemap/world scenes', 'geometry caches not attached to the main scene',
      'object-owned instanceMatrix/instanceColor', 'textures and render targets', 'audio buffers', 'other JS objects and driver copies'] };
}

const instrumentation = `\n(${installGpuTimer.toString()})();\n`;
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
async function bounded(promise, ms, stage) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${stage}: Node deadline ${ms} ms 초과`), { code: 'NODE_DEADLINE', stage })), ms);
  })]); } finally { clearTimeout(timer); }
}
const browserClock = page => page.evaluate(() => ({ timeOrigin: performance.timeOrigin, now: performance.now(),
  dateNow: Date.now(), visibility: document.visibilityState }));
const filename = `${label}-gpu-${venue}-${quality}-${device}-${sceneName}.json`;
const result = {
  schema: 1, suite: 'whole-frame-driver-timer', status: 'RUNNING', label, venue, quality, device, sceneName,
  revision: cfg.revision, baseURL: cfg.baseURL, viewport: [size.width, size.height], devicePixelRatio: size.dpr,
  samplesRequested: sampleCount, warmupFrames, frameTimeoutMs, queryTimeoutMs, pollIntervalMs,
  fixtureSourceSha256: sha256(fixture), instrumentationSourceSha256: sha256(instrumentation),
  memoryEstimatorSourceSha256: sha256(readMainSceneMemory.toString()),
  collectorSourceSha256: sha256(await fs.readFile(new URL(import.meta.url))),
  helperSourceSha256: sha256(await fs.readFile(new URL('./browser.mjs', import.meta.url))),
  referenceCollectorSha256: sha256(await fs.readFile(new URL('./full-frame.mjs', import.meta.url))),
  clocks: { startedAt: new Date().toISOString(), nodeTimeOrigin: nodeClock.timeOrigin, nodeStart: nodeClock.now() },
  fixturePolicy: { piece: 'beethoven-ode-to-joy', randomSeed: 417, uuidSeed: 874, crowdSeed: 417, crowdFill: .8,
    musicClock: 'existing fixture: 25 s (broadcast 5 s), advances 1/60 s per step',
    audio: 'real engine created; note scheduler disabled; synthetic performance clock',
    animationDtCapSeconds: 1 / 60, mainAnimation: 'existing fixture step(true), original frame wrapped by one elapsed query',
    queryRange: 'beginQuery immediately before original frame(); endQuery in finally immediately after it; readPixels is outside the query',
    completion: 'existing fixture completeMs includes frame, query instrumentation overhead and 1x1 readPixels completion wait',
    polling: 'one query at a time; Node timer yields between short page evaluations; no browser busy-wait or extra render steps',
    invalidation: 'no retry or selective sample removal; any unsupported, disjoint, invalid or timed-out query makes the entire GPU summary SKIP' },
  interpretation: { driver: 'Timer-query elapsed GL command interval; driver scheduling/idle gaps may contribute. Not frame cadence, FPS, or isolated shader time.',
    software: 'SwiftShader/software driver elapsed time is not a physical GPU measurement.',
    missing: 'Unsupported or invalid driver timing stays null. GPU memory, real audio stability and physical-mobile performance are unmeasured.',
    comparison: 'Compare only runs from this collector with identical conditionsFingerprintSha256 and audited source versions; do not mix with full-frame timing rows.' },
  specification: ['https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/', 'https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query/'],
  samples: [], rejected: [], summary: null,
};
await fs.mkdir(cfg.outputDir, { recursive: true });
await fs.writeFile(path.join(cfg.outputDir, filename), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
let session, closeTimedOut = false;
const loadedModules = new Set();
async function snapshotSources() {
  const hashes = await sourceHashes(session.page, cfg.baseURL);
  const base = new URL(cfg.baseURL);
  // Hash all locally requested JS modules as well as the helper's fixed list.
  // API requests read original served bytes, not the instrumented route body.
  for (const href of [...loadedModules].sort()) {
    const url = new URL(href), key = url.pathname.slice(base.pathname.length) + url.search;
    if (Object.hasOwn(hashes, key)) continue;
    const response = await session.page.request.get(href);
    hashes[key] = response.ok() ? { sha256: sha256(await response.body()) } : { httpStatus: response.status() };
  }
  return hashes;
}
try {
  session = await openPage(cfg, device, size);
  const { page } = session;
  result.environment = session.environment; result.diagnostics = session.diagnostics;
  await session.cdp.send('Performance.enable');
  const base = new URL(cfg.baseURL);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === base.origin && url.pathname.startsWith(base.pathname) && /\.m?js$/.test(url.pathname)) loadedModules.add(url.href);
  });
  await page.addInitScript(({ quality }) => {
    function rng(seed) { return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }; }
    Math.random = rng(417); window.__uuidRandom = rng(874); window.__resetRandom = () => { Math.random = rng(417); };
    localStorage.setItem('fp-settings', JSON.stringify({ quality, audience: true }));
    const native = window.requestAnimationFrame.bind(window);
    window.__nativeRAF = native;
    window.requestAnimationFrame = callback => callback.name === 'frame' ? (window.__benchFrame = callback, 0) : native(callback);
    window.__fpMaxDt = 1 / 60;
  }, { quality });
  await page.route('**/vendor/three/three.core.js', async route => {
    try {
      const response = await route.fetch(), body = await response.text();
      const match = body.match(/function generateUUID\(\) \{[\s\S]*?\n\}/);
      assert.ok(match && match[0].includes('Math.random()'), 'Three UUID fixture 위치를 찾지 못했어.');
      await route.fulfill({ response, body: body.replace(match[0], match[0].replaceAll('Math.random()', 'window.__uuidRandom()')) });
    } catch (error) { session.diagnostics.pageErrors.push(`UUID fixture: ${error.message}`); await route.abort(); }
  });
  await page.route('**/js/main.js', async route => {
    try {
      const response = await route.fetch(), body = await response.text();
      assert.ok(body.includes('function frame()') && body.includes('window.__fp ='), 'main.js fixture 구조가 달라졌어.');
      await route.fulfill({ response, body: `${body}\n${fixture}${instrumentation}` });
    } catch (error) { session.diagnostics.pageErrors.push(`main fixture: ${error.message}`); await route.abort(); }
  });
  await page.goto(appURL(cfg.baseURL, venue), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__bench && !!window.__gpuTimer && !document.getElementById('enterBtn').disabled
    && (!window.__fp.hall.dome || window.__fp.hall.dome.mesh.visible === true), null, { polling: 100 });
  result.domeVisibleBeforeSetup = await page.evaluate(() => window.__fp.hall.dome?.mesh.visible ?? null);
  result.meta = await page.evaluate(() => window.__bench.meta());
  result.support = await page.evaluate(() => window.__gpuTimer.support);
  result.clocks.browserReady = await browserClock(page);
  result.driverKind = cfg.softwareRequested || /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(result.meta.renderer || '')
    ? 'software-driver' : 'driver-hardware-not-independently-verified';
  if (!result.support.supported) {
    result.status = 'SKIP'; result.rejected.push({ reason: 'timer-query-unsupported-or-probe-invalid', support: result.support });
    result.conditions = { venue, quality, device, sceneName, viewport: result.viewport, devicePixelRatio: size.dpr,
      phase: 'capability-only', meta: result.meta, support: result.support, environment: result.environment,
      fixtureSourceSha256: result.fixtureSourceSha256, instrumentationSourceSha256: result.instrumentationSourceSha256,
      collectorSourceSha256: result.collectorSourceSha256, helperSourceSha256: result.helperSourceSha256 };
    result.conditionsFingerprintSha256 = sha256(canonical(result.conditions));
    result.sourceHashes = await bounded(snapshotSources(), cfg.timeoutMs, 'source-before');
  } else {
    result.fixture = await bounded(page.evaluate(() => window.__bench.setup()), cfg.timeoutMs, 'fixture-setup');
    await page.addStyleTag({ content: 'body > :not(#stage) { visibility: hidden !important; }' });
    result.scenario = await bounded(page.evaluate(name => window.__bench.scenario(name), sceneName), frameTimeoutMs, 'scenario-setup');
    for (let i = 0; i < warmupFrames; i++) {
      const warm = await bounded(page.evaluate(() => window.__bench.step(true)), frameTimeoutMs, `warmup-${i}`);
      assert.equal(warm.glError, 0, '예열 WebGL 오류'); assert.equal(warm.contextLost, false, '예열 context 유실');
    }
    result.meta = await page.evaluate(() => window.__bench.meta());
    result.sourceHashes = await bounded(snapshotSources(), cfg.timeoutMs, 'source-before');
    result.clocks.browserBefore = await browserClock(page);
    result.clocks.nodeMeasurementStart = nodeClock.now();
    result.conditions = { venue, quality, device, sceneName, viewport: result.viewport, devicePixelRatio: size.dpr,
      samplesRequested: sampleCount, warmupFrames, frameTimeoutMs, queryTimeoutMs, pollIntervalMs,
      fixture: result.fixture, scenario: result.scenario, meta: result.meta, support: result.support,
      fixturePolicy: result.fixturePolicy, environment: result.environment, fixtureSourceSha256: result.fixtureSourceSha256,
      instrumentationSourceSha256: result.instrumentationSourceSha256, collectorSourceSha256: result.collectorSourceSha256,
      helperSourceSha256: result.helperSourceSha256 };
    result.conditionsFingerprintSha256 = sha256(canonical(result.conditions));
    console.log(JSON.stringify({ stage: 'ready', label, venue, quality, device, sceneName, driverKind: result.driverKind, support: result.support }));
    for (let index = 0; index < sampleCount; index++) {
      const armed = await bounded(page.evaluate(() => window.__gpuTimer.arm()), queryTimeoutMs, 'query-arm');
      if (armed.status !== 'ARMED') { result.rejected.push({ index, ...armed }); break; }
      const row = await bounded(page.evaluate(() => window.__bench.step(true)), frameTimeoutMs, `frame-${index}`);
      assert.equal(row.glError, 0, '측정 WebGL 오류'); assert.equal(row.contextLost, false, '측정 context 유실');
      assert.equal(row.completed, true, 'readPixels 완료 표본이 아니야.');
      assert.ok(Number.isFinite(row.completeMs) && row.completeMs >= 0 && Number.isFinite(row.completionWaitMs) && row.completionWaitMs >= 0, '완료 시간 표본 오류');
      assert.equal(row.visibility, 'visible', '비활성 탭 표본'); assert.equal(row.asleep, false, '수면 표본');
      assert.equal(row.quality, quality, '실제 품질 변경'); assert.equal(row.renderScale, 1, '실제 scale 변경');
      const pollStart = nodeClock.now(), deadline = pollStart + queryTimeoutMs;
      let timer = { status: 'PENDING' }, polls = 0;
      do {
        // A later browser task is required before query results can be exposed.
        if (deadline - nodeClock.now() <= pollIntervalMs) break;
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        const remaining = Math.max(1, deadline - nodeClock.now());
        try { timer = await bounded(page.evaluate(() => window.__gpuTimer.poll()), remaining, 'query-poll'); }
        catch (error) {
          if (error.code !== 'NODE_DEADLINE') throw error;
          timer = { status: 'PENDING', deadlineError: error.message };
          break;
        }
        polls++;
      } while (timer.status === 'PENDING' && nodeClock.now() < deadline);
      if (timer.status === 'PENDING') timer = await bounded(page.evaluate(() => window.__gpuTimer.cancel('query-availability-timeout')), 2000, 'query-cancel');
      result.samples.push({ index, ...row, query: { ...timer, polls, pollWallMs: nodeClock.now() - pollStart },
        driverElapsedMs: timer.status === 'VALID' ? timer.driverElapsedMs : null });
      await save(cfg, filename, result);
      if (timer.status !== 'VALID') { result.rejected.push({ index, ...timer }); break; }
      console.log(JSON.stringify({ stage: 'sample', index, completeMs: row.completeMs, driverElapsedMs: timer.driverElapsedMs }));
    }
    result.clocks.browserAfter = await browserClock(page); result.clocks.nodeMeasurementEnd = nodeClock.now();
    result.status = result.rejected.length || result.samples.length !== sampleCount ? 'SKIP' : 'PASS';
    if (result.status === 'PASS') result.summary = {
      readPixelsCompletion: summarize(result.samples, 'completeMs'),
      driverTimer: summarize(result.samples, 'driverElapsedMs'),
      driverKind: result.driverKind, frames: sampleCount,
    };
    if (cfg.screenshots) await page.locator('#stage canvas').screenshot({ path: path.join(cfg.outputDir, filename.replace(/\.json$/, '.png')) });
  }
  result.sourceHashesAfter = await bounded(snapshotSources(), cfg.timeoutMs, 'source-after');
  assert.ok(isDeepStrictEqual(result.sourceHashes, result.sourceHashesAfter), '측정 전후 served source 또는 module 목록이 달라졌어.');
  result.sourceFingerprintSha256 = sha256(canonical(result.sourceHashes));
  // These bookkeeping walks/counters run only after all measured samples.
  result.memory = await bounded(page.evaluate(readMainSceneMemory), frameTimeoutMs, 'geometry-storage-estimate');
  result.cdpMetricsAfter = (await session.cdp.send('Performance.getMetrics')).metrics;
  const cdpMemory = Object.fromEntries(result.cdpMetricsAfter.map(metric => [metric.name, metric.value]));
  result.memory.cdpJSHeapUsedSize = cdpMemory.JSHeapUsedSize ?? null;
  result.memory.cdpJSHeapTotalSize = cdpMemory.JSHeapTotalSize ?? null;
  result.memory.heapInterpretation = 'performance.memory and CDP JSHeapUsedSize are separate API observations with different accounting behavior; do not add them together or infer the cause of their difference from these numbers alone. Geometry ArrayBuffer bytes are a partial structural estimate, not a replacement for either heap reading.';
  if (diagnosticsFailed(session.diagnostics) || session.diagnostics.failedRequests.length) throw new Error('브라우저/네트워크 오류가 있어. diagnostics를 확인해 줘.');
} catch (error) {
  result.status = 'FAIL'; result.summary = null;
  result.failure = { message: error.message, code: error.code || null, stage: error.stage || null, stack: error.stack };
} finally {
  if (session) {
    try {
      result.cleanup = await bounded(session.page.evaluate(() => window.__gpuTimer?.dispose() || null), 2000, 'query-cleanup');
      if (result.cleanup && (result.cleanup.outstanding || result.cleanup.active || result.cleanup.created !== result.cleanup.deleted)) {
        result.status = 'FAIL'; result.summary = null; result.cleanupError = 'query 생성/삭제 수가 맞지 않아.';
      }
    } catch (error) {
      result.cleanupError = error.message;
      if (result.status === 'PASS') { result.status = 'FAIL'; result.summary = null; }
    }
    try { await bounded(session.browser.close(), 5000, 'browser-close'); }
    catch (error) { closeTimedOut = true; result.status = 'FAIL'; result.summary = null; result.browserCloseError = error.message; }
  }
  result.clocks.finishedAt = new Date().toISOString(); result.clocks.nodeEnd = nodeClock.now();
  await save(cfg, filename, result);
}
console.log(JSON.stringify({ status: result.status, file: path.join(cfg.outputDir, filename), samples: result.samples.length,
  rejected: result.rejected, failure: result.failure?.message, driverKind: result.driverKind }));
if (result.status === 'FAIL') process.exitCode = 1;
// A stuck DevTools connection must not keep this optional CLI pending forever.
if (closeTimedOut) process.exit(1);
