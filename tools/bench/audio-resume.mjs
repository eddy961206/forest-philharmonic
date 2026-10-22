// Real product audio transport diagnostic. Never imported by the application.
// Use the identical collector against separate reference/candidate servers.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { appURL, choice, config, diagnosticsFailed, openPage, save, sha256, sourceHashes, viewport } from './browser.mjs';
import { fixedAudienceMain } from './loading-proxy.mjs';
import { installAudioNoteAuditFactory, summarizeAudioNoteAudit } from './audio-note-audit.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`node tools/bench/audio-resume.mjs [label] [hall|sphere] [desktop|mobile]
실제 앱·악기 샘플·오디오 그래프·UI를 사용한 재개 진단이야.
기본값: resume / hall / desktop, FRAME_MODE=controlled, QUALITY=high(desktop)/low(mobile).
FRAME_MODE=controlled|native: controlled는 앱의 main rAF만 잡고 명시적 프레임을 그려.
native는 실제 main rAF를 계속 실행해. 이 경우 대기 구간을 무렌더 대기라고 부르지 않아.
READBACK=1|0: 기본 1은 각 요청 프레임 뒤 readPixels 전후 시계를 기록해.
0은 같은 프레임을 실행하지만 readPixels를 생략하는 별도 원인 분리 조건이야.
LIVE_WINDOW_MS=0..60000: 기본 0(비활성). 예: 30000은 재개 진단 뒤 실제 음악과
원래 main rAF가 함께 도는 30초 관찰을 추가해. FRAME_MODE=native, READBACK=0이 필수야.
이 구간에는 추가 렌더·시계 치환·음악 선택·재예약이 없어. 프레임 시작 시각만 매
프레임 기록하고 pose/품질/음악/오디오/heap은 시작·끝과 1초 간격으로 남겨.
관측 cadence FPS와 원래 2초 재개 판정은 별개야. 곡·숨김·수면·품질 변화가 생기면
동일 조건 비교 제외 사유를 남겨. 실제 표시 FPS·GPU 시간·물리 출력 음질은 아니야.
PRELUDE_FRAMES=4: 입장·좌석 이동·착석 3프레임 외 착석 상태 준비 프레임 수(0..20).
PRE_PAUSE_MS=400: 공연 프레임 뒤 pause 전 관찰(300..500ms).
SEEK_SECONDS=22, PIECE_ID=선택적_기대곡_ID. 곡을 임의로 교체하지 않고 실제 기본곡을 기록해.
FIXED_AUDIENCE_SEED=417: 선택 옵션. solo 관객 rand 한 곳만 별도 seeded(417)로 고정해.
미지정하면 기존 전역 Math.random=417과 z+0.5 좌석 접근을 그대로 사용해.
지정하면 원본/변환 main 해시와 관객 수·점유 좌석 hash를 남기고 z+0.2에서 E/touch로
앉은 실제 seat.index가 선택한 좌석과 같은지 검사해. 다르면 FAIL로 보존해.
값은 0..4294967295 정수야. 이 QA main 응답과 라우팅 조건은 실제 로딩 성능 측정이 아니야.
재개 판정은 기존과 동일한 2초: running && playing && time > seekTime + 0.05.
신규 예약음과 유지음 재개는 원래 메서드의 호출 출처로 구분해. 유지음은 원래 악보,
skip·남은 길이·시작시각·velocity와 요청 누락/추가까지 별도로 검사해.
유지음 API가 없는 구형은 미지원으로 명시하고 신규 예약음 검사를 그대로 적용해.
실패해도 다음 실제 WebGL 프레임과 400ms 관찰까지 진단하고 원래 FAIL을 유지해.
자동 resume/오디오 재시작/시계 치환/수동 스케줄링은 하지 않아.
공통 환경: BASE_URL, REVISION, OUTPUT_DIR, PLAYWRIGHT_MODULE, CHROME_EXECUTABLE,
CHROME_ARGS, SOFTWARE_RENDERER=1, HEADLESS, FONT_MODE, FONT_ROOT, WIDTH, HEIGHT, DPR, TIMEOUT_MS.
동일 환경에서 기준선과 후보를 각각 실행하고 fixture/source/곡 해시를 함께 비교해.
음표 hash는 관측된 순서 식별용이며 wall time 길이가 다르면 서로 달라도 돼.
이 검사는 실제 스피커 음질·오디오 글리치·물리 스마트폰을 검증하지 않아.
--help는 브라우저를 실행하지 않아. 브라우저 작업은 하나씩 직렬 실행해.`);
  process.exit(0);
}
assert.ok(args.length <= 3, 'Expected [label] [hall|sphere] [desktop|mobile]');
const [label = 'resume', venue = 'hall', device = 'desktop'] = args;
choice(venue, ['hall', 'sphere'], 'venue');
choice(device, ['desktop', 'mobile'], 'device');
const frameMode = choice(process.env.FRAME_MODE || 'controlled', ['controlled', 'native'], 'FRAME_MODE');
const quality = choice(process.env.QUALITY || (device === 'mobile' ? 'low' : 'high'), ['high', 'medium', 'low'], 'QUALITY');
const fixedAudienceSeed = process.env.FIXED_AUDIENCE_SEED === undefined ? null : Number(process.env.FIXED_AUDIENCE_SEED);
assert.ok(fixedAudienceSeed === null || (process.env.FIXED_AUDIENCE_SEED.trim() !== '' && Number.isInteger(fixedAudienceSeed) && fixedAudienceSeed >= 0 && fixedAudienceSeed <= 0xffffffff), 'FIXED_AUDIENCE_SEED must be a uint32 integer');
const readback = choice(process.env.READBACK || '1', ['1', '0'], 'READBACK') === '1';
const liveWindowMs = Number(process.env.LIVE_WINDOW_MS ?? 0);
assert.ok(Number.isInteger(liveWindowMs) && liveWindowMs >= 0 && liveWindowMs <= 60000, 'LIVE_WINDOW_MS must be 0..60000');
assert.ok(liveWindowMs === 0 || frameMode === 'native', 'LIVE_WINDOW_MS requires FRAME_MODE=native');
assert.ok(liveWindowMs === 0 || !readback, 'LIVE_WINDOW_MS requires READBACK=0');
const preludeFrames = Number(process.env.PRELUDE_FRAMES ?? 4);
assert.ok(Number.isInteger(preludeFrames) && preludeFrames >= 0 && preludeFrames <= 20, 'PRELUDE_FRAMES must be 0..20');
const prePauseMs = Number(process.env.PRE_PAUSE_MS || 400);
assert.ok(Number.isInteger(prePauseMs) && prePauseMs >= 300 && prePauseMs <= 500, 'PRE_PAUSE_MS must be 300..500');
const seekSeconds = Number(process.env.SEEK_SECONDS || 22);
assert.ok(Number.isFinite(seekSeconds) && seekSeconds > 0, 'SEEK_SECONDS must be positive');
const cfg = config(label);
const size = viewport(device, device === 'mobile' ? { width: 390, height: 844 } : { width: 960, height: 540 });
const filename = `audio-resume-${label}-${venue}-${device}-${frameMode}.json`;
const report = {
  schema: 1, suite: 'product-audio-resume-boundaries', status: 'RUNNING', label, venue, device,
  revision: cfg.revision, measuredAt: new Date().toISOString(), url: appURL(cfg.baseURL, venue),
  fixtureSourceSha256: sha256(await fs.readFile(new URL(import.meta.url))),
  helperSourceSha256: sha256(await fs.readFile(new URL('./browser.mjs', import.meta.url))),
  noteAuditSourceSha256: sha256(await fs.readFile(new URL('./audio-note-audit.mjs', import.meta.url))),
  options: { frameMode, quality, readback, liveWindowMs, preludeFrames, prePauseMs, seekSeconds, fixedAudienceSeed, expectedPiece: process.env.PIECE_ID || null },
  audienceFixture: {
    enabled: fixedAudienceSeed !== null, seed: fixedAudienceSeed, servedRequests: 0,
    policy: fixedAudienceSeed === null
      ? 'Legacy global Math.random=417; original solo-audience source and z+0.5 seat approach remain unchanged.'
      : 'Reuse fixedAudienceMain: replace exactly one solo-audience rand expression with an independent seeded generator. Global Math.random=417 and room seeding remain unchanged. Approach the chosen free seat at z+0.2 and require the real E/touch sit result to match its index.',
  },
  viewport: [size.width, size.height], devicePixelRatio: size.dpr, timeoutMs: cfg.timeoutMs,
  method: 'Native product AudioContext, default graph and original samples. Real solo/start/pause/seek/resume UI. Passive 100ms samples, native worker onTick observer and transparent playNote observation. Boundaries separate app frame, readPixels, pre-pause wait, transport and the following app frame. No audio/context recovery or clock substitution.',
  fixtures: [
    'Seeded Math.random=417, fresh context, manual quality and audience enabled; all other audio/visual settings retain product defaults.',
    'Place beside a real free non-stage seat, sit using E/touch, then finish only the existing camera tween. Snap the score roster and conductor before the real start-show click.',
    ...(fixedAudienceSeed === null ? [] : [`Solo-audience seed ${fixedAudienceSeed} is isolated from global RNG/UUID calls by one exact main.js anchor. The QA response and occupied-seat fingerprint are recorded separately from original product source hashes.`]),
    'Prelude frames reproduce a heavy rendering prelude but are not the previous full movement/drag/sit/stand scenario. Their count, camera pose and native clock age are recorded.',
    frameMode === 'controlled' ? 'Only the app callback named frame is captured. Explicit frames execute its original function. Other rAF, timers and audio remain native. Observation waits contain no main frames.' : 'Original main rAF cadence remains native. Requested boundaries wait for the next completed app frame; other frames continue throughout observation windows.',
  ],
  limitations: [
    'A stalled running AudioContext can be observed here, but its underlying browser/audio-device/GPU/graph cause is not established by timing correlation alone.',
    'No physical output capture, underrun counter or audible fidelity measurement. Note requests and native clock progress do not prove glitch-free audio.',
    'voices and voiceCreated count the engine\'s logical voice records, not all AudioNodes, live source nodes, render quanta, graph CPU cost or the output device\'s underruns.',
    'Mobile is Chromium viewport/touch emulation, not a physical smartphone or Safari.',
    'readPixels deliberately synchronizes WebGL and can perturb execution; READBACK=0 is a separately labelled diagnostic condition.',
    'Runtime note hashes exclude humanization and absolute timestamps; different observation durations or seek positions may produce different hashes. Per-event score matching is checked separately.',
    'Optional live-window cadence measures starts of the original main rAF callback while actual music runs. It is not compositor-presented FPS, pure GPU time or physical audio-output validation. The collection wrappers add observation overhead.',
    'Live-window condition checks run at frame starts, state/visibility events and 1s metadata samples. A transient state change entirely between those observations may be missed. Eligibility within one run does not prove that two runs match.',
    'The optional fixed-audience route controls a main.js response and may affect HTTP cache behavior; it is not a loading benchmark. Matching crowd/seat fingerprints does not prove identical audio impulse-response samples, every procedural random value or physical output quality.',
  ],
  checks: {}, frames: [], windows: [],
};
let browser, page;

// Pure statistics over actual starts of the original main frame callback. Keep
// the raw timestamps; invalid/coarsened intervals must never be silently dropped.
function summarizeFrameStarts(frameStartsMs) {
  const intervals = frameStartsMs.slice(1).map((time, i) => time - frameStartsMs[i]);
  const valid = frameStartsMs.every(Number.isFinite) && intervals.every(ms => Number.isFinite(ms) && ms > 0);
  const base = { frameStarts: frameStartsMs.length, intervalCount: intervals.length, valid,
    metric: 'original-main-rAF-start-interval', quantile: 'nearest-rank',
    observedRafFps: null, onePercentLowRafFps: null, slowestSampleCount: null,
    meanMs: null, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null, measuredSpanMs: null };
  if (!valid || !intervals.length) return { ...base, unavailableReason: valid ? 'fewer-than-two-frame-starts' : 'nonfinite-or-nonpositive-frame-interval' };
  const sorted = [...intervals].sort((a, b) => a - b);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const quantile = p => sorted[Math.ceil(p * sorted.length) - 1];
  const meanMs = mean(intervals);
  const slowestSampleCount = intervals.length >= 100 ? Math.ceil(intervals.length * 0.01) : null;
  return { ...base, meanMs, observedRafFps: 1000 / meanMs,
    p50Ms: quantile(0.5), p95Ms: quantile(0.95), p99Ms: quantile(0.99), maxMs: sorted.at(-1),
    measuredSpanMs: frameStartsMs.at(-1) - frameStartsMs[0], slowestSampleCount,
    onePercentLowRafFps: slowestSampleCount === null ? null : 1000 / mean(sorted.slice(-slowestSampleCount)),
    onePercentLowUnavailableReason: slowestSampleCount === null ? 'fewer-than-100-intervals' : null };
}

async function bounded(promise, label, timeoutMs = cfg.timeoutMs) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: ${timeoutMs}ms timeout`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

// Serialized into the page. All observations preserve original method arguments,
// return values, errors, timers and native audio time. No analyser is inserted.
function installProbe() {
  const { engine, perf, renderer, scene, camera } = window.__fp, ctx = engine.ctx;
  const samples = [], events = [], notes = [], limits = { samples: 10000, events: 1000, notes: 20000 };
  const dropped = { samples: 0, events: 0, notes: 0 };
  let phase = 'entry', ticks = 0, lastTickMs = null, maxTickGapMs = 0, lastTick = null, stopped = false;
  let noteCount = 0, lateCount = 0, noteErrors = 0, scoreMismatches = 0, renderCalls = 0, mainSceneRenders = 0;
  let live = null, liveTimer = null, lastLiveTickMs = null;
  const append = (array, value, kind) => { if (array.length < limits[kind]) array.push(value); else dropped[kind]++; };
  const originalRender = renderer.render;
  renderer.render = function (renderScene, renderCamera) {
    renderCalls++;
    if (renderScene === scene && renderCamera === camera) mainSceneRenders++;
    return originalRender.apply(this, arguments);
  };
  const noteAudit = window.__createAudioNoteAudit(engine, perf, note => {
    note.phase = phase;
    noteCount++;
    if (note.leadMs < 0) lateCount++;
    if (note.playing && note.scoreMatch !== true) scoreMismatches++;
    if (note.error) noteErrors++;
    append(notes, note, 'notes');
  });
  const offTick = engine.onTick(() => {
    const now = performance.now();
    if (lastTick !== null) maxTickGapMs = Math.max(maxTickGapMs, now - lastTick);
    lastTick = lastTickMs = now; ticks++;
    if (live?.active) {
      live.tickCount++;
      live.maxTickGapMs = Math.max(live.maxTickGapMs, now - (lastLiveTickMs ?? live.start.performanceNowMs));
      lastLiveTickMs = now;
    }
  });
  const snapshot = cause => {
    let outputTimestamp = null;
    try { const stamp = ctx.getOutputTimestamp?.(); if (stamp) outputTimestamp = { contextTime: stamp.contextTime, performanceTime: stamp.performanceTime }; }
    catch (error) { outputTimestamp = { error: error.message }; }
    return {
      cause, phase, wallTimeMs: Date.now(), performanceNowMs: performance.now(),
      audioNow: ctx.currentTime, audioState: ctx.state, sampleRate: ctx.sampleRate, outputTimestamp,
      baseLatency: ctx.baseLatency ?? null, deviceOutputLatency: ctx.outputLatency ?? null, outputLatency: engine.outputLatency,
      playing: perf.playing, time: perf.time, startPos: perf.startPos, startCtx: perf.startCtx, pausedPosition: perf.pos,
      appPhase: window.__fp.phase, scheduledEventIndex: perf.schedIdx, eventCount: perf.evCount, voices: engine.voices.size,
      scheduledNotes: noteCount, lateNotes: lateCount, noteErrors, scoreMismatches,
      ticks, lastTickMs, maxTickGapMs, visibility: document.visibilityState,
      framesStarted: window.__audioResumeFrames.started, framesCompleted: window.__audioResumeFrames.completed,
      renderCalls, mainSceneRenders,
      jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
    };
  };
  const mark = cause => { phase = cause; const value = snapshot(cause); append(samples, value, 'samples'); return value; };
  const liveConditions = () => {
    const f = window.__fp;
    return { piece: perf.piece?.id ?? null, visibility: document.visibilityState, asleep: !!f.asleep,
      qualitySetting: f.settings.quality, appliedQuality: f.stats?.quality ?? f.quality ?? null,
      renderScale: f.stats?.renderScale ?? f.qualityState?.renderScale ?? null, pixelRatio: renderer.getPixelRatio(),
      startPos: perf.startPos, startCtx: perf.startCtx,
      playing: perf.playing, audioState: ctx.state, appPhase: f.phase };
  };
  const exclude = (reason, now, details = {}) => {
    if (!live.exclusions.some(entry => entry.reason === reason)) live.exclusions.push({ reason, performanceNowMs: now, ...details });
  };
  const checkChangedCondition = (key, observed, now) => {
    const initial = live.initialConditions[key];
    if (observed === initial) return;
    const reason = `changed-${key}`;
    if (!live.exclusions.some(entry => entry.reason === reason)) exclude(reason, now, { initial, observed });
  };
  const checkLiveConditions = now => {
    if (!live?.active) return;
    // Read scalar state without creating a per-frame pose/metadata object.
    const f = window.__fp, piece = perf.piece?.id ?? null;
    if (piece !== live.initialConditions.piece) exclude('piece-changed', now, { initial: live.initialConditions.piece, observed: piece });
    if (document.visibilityState !== 'visible') exclude('document-not-visible', now);
    if (f.asleep) exclude('app-asleep', now);
    if (!perf.playing) exclude('music-not-playing', now);
    if (ctx.state !== 'running') exclude('audio-context-not-running', now);
    if (f.phase !== 'playing') exclude('app-phase-not-playing', now);
    checkChangedCondition('qualitySetting', f.settings.quality, now);
    checkChangedCondition('appliedQuality', f.stats?.quality ?? f.quality ?? null, now);
    // Old baseline qualityState creates an object. Read it only in metadata
    // snapshots; actual pixelRatio below still detects its per-frame changes.
    if (f.stats?.renderScale !== undefined) checkChangedCondition('renderScale', f.stats.renderScale, now);
    checkChangedCondition('pixelRatio', renderer.getPixelRatio(), now);
    checkChangedCondition('startPos', perf.startPos, now);
    checkChangedCondition('startCtx', perf.startCtx, now);
  };
  const liveSnapshot = cause => {
    const value = { ...snapshot(cause), ...liveConditions(),
      pose: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov,
        mode: window.__fp.director.mode, seat: window.__fp.director.seat?.index ?? null },
    };
    if (live?.active) checkChangedCondition('renderScale', value.renderScale, value.performanceNowMs);
    return value;
  };
  const finishLiveWindow = (outcome = 'completed') => {
    if (!live) return null;
    if (live.active) {
      checkLiveConditions(performance.now());
      live.end = liveSnapshot('live-window:end');
      live.states.push(live.end);
      live.maxTickGapMs = Math.max(live.maxTickGapMs, live.end.performanceNowMs - (lastLiveTickMs ?? live.start.performanceNowMs));
      live.active = false;
      window.__audioResumeFrames.onLiveFrame = null;
      clearInterval(liveTimer); liveTimer = null;
      live.outcome = outcome;
      live.observedDurationMs = live.end.performanceNowMs - live.start.performanceNowMs;
      if (outcome !== 'completed') exclude('observation-not-completed', live.end.performanceNowMs, { outcome });
      if (live.droppedFrameStarts || live.droppedStates) exclude('live-recording-truncated', live.end.performanceNowMs);
      if (live.tickCount === 0) exclude('no-audio-worker-ticks-observed', live.end.performanceNowMs);
      if (live.end.audioNow <= live.start.audioNow) exclude('native-audio-clock-did-not-advance', live.end.performanceNowMs);
      if (live.end.mainSceneRenders <= live.start.mainSceneRenders) exclude('main-scene-did-not-render', live.end.performanceNowMs);
      if (live.end.piece === live.start.piece && live.end.time <= live.start.time) exclude('music-position-did-not-advance', live.end.performanceNowMs);
      phase = 'after-live-window';
    }
    return live;
  };
  const observeEvent = event => {
    append(events, snapshot(event.type), 'events');
    checkLiveConditions(performance.now());
  };
  ctx.addEventListener('statechange', observeEvent);
  document.addEventListener('visibilitychange', observeEvent);
  const timer = setInterval(() => append(samples, snapshot('interval'), 'samples'), 100);
  window.__audioResumeProbe = {
    mark, snapshot,
    startLiveWindow(requestedDurationMs) {
      if (live) throw new Error('Live window already started');
      phase = 'live-window';
      const start = liveSnapshot('live-window:start');
      live = { active: true, requestedDurationMs, metadataPeriodMs: 1000,
        start, initialConditions: liveConditions(), states: [start], end: null,
        frameStartTimesMs: [], frameStartLimit: 120000, stateLimit: 240,
        droppedFrameStarts: 0, droppedStates: 0, tickCount: 0, maxTickGapMs: 0, exclusions: [],
        method: 'Actual original main rAF and actual music continue unmodified; no readPixels, extra frames, music selection, scheduling or context recovery in this window. Each frame adds one start timestamp; pose/clock/quality/heap metadata is sampled at start/end and every 1s. Conditions are also checked at frame starts and events.',
        tickGapDefinition: 'Largest native engine.onTick gap within the live window, including partial start/end gaps; not an output-device underrun counter.',
      };
      lastLiveTickMs = null;
      checkLiveConditions(start.performanceNowMs);
      window.__audioResumeFrames.onLiveFrame = now => {
        if (live.frameStartTimesMs.length < live.frameStartLimit) live.frameStartTimesMs.push(now);
        else live.droppedFrameStarts++;
        checkLiveConditions(now);
      };
      liveTimer = setInterval(() => {
        checkLiveConditions(performance.now());
        if (live.states.length < live.stateLimit - 1) live.states.push(liveSnapshot('live-window:interval'));
        else live.droppedStates++;
      }, 1000);
      return start;
    },
    finishLiveWindow,
    finish() {
      if (!stopped) {
        finishLiveWindow('collector-finish-before-live-end');
        mark('final'); stopped = true; clearInterval(timer); offTick();
        ctx.removeEventListener('statechange', observeEvent);
        document.removeEventListener('visibilitychange', observeEvent);
        noteAudit.stop();
        renderer.render = originalRender;
      }
      return { samples, events, notes, dropped, limits, noteAudit: noteAudit.snapshot(), liveWindow: live, samplePeriodMs: 100, lateDefinition: 'playNote requested when < native currentTime (leadMs < 0)' };
    },
  };
  mark('observer-installed');
}

try {
  const session = await openPage(cfg, device, size);
  ({ browser, page } = session);
  report.environment = session.environment;
  report.diagnostics = session.diagnostics;
  report.sourceHashes = await sourceHashes(page, cfg.baseURL);
  if (fixedAudienceSeed !== null) {
    const mainURL = new URL('js/main.js', cfg.baseURL).href;
    const response = await page.request.get(mainURL);
    assert.ok(response.ok(), 'Original main.js available for isolated audience fixture');
    const transformed = fixedAudienceMain(await response.text(), fixedAudienceSeed);
    assert.equal(transformed.metadata.originalSha256, report.sourceHashes['js/main.js']?.sha256, 'Original main.js stayed unchanged before the audience fixture');
    report.audienceFixture.transformerSourceSha256 = sha256(await fs.readFile(new URL('./loading-proxy.mjs', import.meta.url)));
    report.audienceFixture.main = transformed.metadata;
    report.audienceFixture.responseMethod = 'Playwright route.fulfill of the one main.js URL; status 200, identity UTF-8, QA ETag and no-cache. This is not the loading proxy and does not measure original transfer/cache performance.';
    await page.route(mainURL, async route => {
      report.audienceFixture.servedRequests++;
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8',
        headers: { 'Cache-Control': 'no-cache', ETag: transformed.metadata.etag }, body: transformed.served });
    });
  }
  report.audioSourceHashes = Object.fromEntries(await Promise.all(['js/audio/engine.js', 'js/audio/performance.js', 'js/audio/crowd.js', 'js/audio/crowd-loader.js', 'js/audio/crowd-worker.js'].map(async name => {
    const response = await page.request.get(new URL(name, cfg.baseURL).href);
    return [name, response.ok() ? { sha256: sha256(await response.body()) } : { httpStatus: response.status() }];
  })));
  const browserCDP = await browser.newBrowserCDPSession();
  try { report.environment.actualCommandLine = (await browserCDP.send('Browser.getBrowserCommandLine')).arguments; }
  catch (error) { report.environment.commandLineError = error.message; }
  try { report.environment.processes = (await browserCDP.send('SystemInfo.getProcessInfo')).processInfo.map(({ type, id }) => ({ type, id })); }
  catch (error) { report.environment.processInfoError = error.message; }
  await page.addInitScript(({ frameMode, quality }) => {
    let seed = 417;
    Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    localStorage.setItem('fp-settings', JSON.stringify({ quality, audience: true }));
    const native = window.requestAnimationFrame.bind(window);
    const frames = window.__audioResumeFrames = { started: 0, completed: 0, waiters: [], onLiveFrame: null };
    const run = (callback, time) => {
      if (frames.onLiveFrame) frames.onLiveFrame(performance.now());
      frames.started++;
      callback(time);
      frames.completed++;
      if (frames.waiters.length) {
        const waiters = frames.waiters.splice(0);
        for (const resolve of waiters) resolve();
      }
    };
    window.__audioResumeRunFrame = () => run(window.__qaMainFrame, performance.now());
    window.requestAnimationFrame = callback => {
      if (callback.name !== 'frame') return native(callback);
      window.__qaMainFrame = callback;
      return frameMode === 'controlled' ? 0 : native(time => run(callback, time));
    };
    window.__audioResumeContextLosses = [];
    document.addEventListener('webglcontextlost', event => window.__audioResumeContextLosses.push({ at: performance.now(), message: event.statusMessage || 'context lost' }), true);
  }, { frameMode, quality });
  const activate = async locator => device === 'mobile' ? locator.tap() : locator.click();
  const mark = cause => bounded(page.evaluate(cause => window.__audioResumeProbe.mark(cause), cause), cause);
  const render = async label => {
    console.log(JSON.stringify({ label: cfg.label, venue, frameMode, stage: `frame:${label}` }));
    const frame = await bounded(page.evaluate(async ({ label, frameMode, readback }) => {
      const probe = window.__audioResumeProbe;
      const beforeFrame = probe.mark(`${label}:before-frame`);
      if (frameMode === 'controlled') window.__audioResumeRunFrame();
      else await new Promise(resolve => window.__audioResumeFrames.waiters.push(resolve));
      const afterFrame = probe.mark(`${label}:after-frame`);
      const gl = window.__fp.renderer.getContext();
      const beforeReadPixels = probe.mark(`${label}:before-readPixels`);
      if (readback) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      const afterReadPixels = probe.mark(`${label}:after-readPixels`);
      const glErrors = [];
      for (let i = 0; i < 16; i++) { const error = gl.getError(); if (error === gl.NO_ERROR) break; glErrors.push(error); }
      return { label, readback, beforeFrame, afterFrame, beforeReadPixels, afterReadPixels, glErrors, contextLost: gl.isContextLost() };
    }, { label, frameMode, readback }), `frame:${label}`);
    report.frames.push(frame);
    assert.deepEqual(frame.glErrors, [], `${label}: WebGL errors`);
    assert.equal(frame.contextLost, false, `${label}: WebGL context lost`);
    assert.ok(frame.afterFrame.mainSceneRenders > frame.beforeFrame.mainSceneRenders, `${label}: original main scene rendered`);
    return frame;
  };
  const observeWindow = async (label, ms) => {
    const before = await mark(`${label}:before`), nodeStartMs = performance.now();
    await page.waitForTimeout(ms);
    const after = await mark(`${label}:after`);
    const result = { label, requestedMs: ms, nodeElapsedMs: performance.now() - nodeStartMs, mainFramesHeld: frameMode === 'controlled', before, after };
    report.windows.push(result);
    return result;
  };

  await page.goto(report.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__fp && !document.getElementById('enterBtn')?.disabled && !!window.__qaMainFrame, null, { polling: 100 });
  if (fixedAudienceSeed !== null) assert.ok(report.audienceFixture.servedRequests > 0, 'Isolated solo-audience main.js fixture served');
  await activate(page.getByRole('button', { name: '혼자 보기', exact: true }));
  await page.waitForFunction(() => !document.getElementById('splash') && window.__fp.director.active && window.__fp.engine.ctx?.state === 'running', null, { polling: 100 });
  await page.evaluate(installAudioNoteAuditFactory);
  await page.evaluate(installProbe);
  report.piece = await page.evaluate(() => ({ id: window.__fp.perf.piece?.id, duration: window.__fp.perf.duration, serialized: JSON.stringify(window.__fp.perf.piece) }));
  report.piece.sha256 = sha256(report.piece.serialized);
  delete report.piece.serialized;
  if (process.env.PIECE_ID) assert.equal(report.piece.id, process.env.PIECE_ID, 'Expected default piece');
  await render('entered');
  report.seat = await page.evaluate(fixedAudience => {
    const { hall, director, camera, audience } = window.__fp;
    const candidates = hall.seats.filter(s => !s.stage && !director.occupied.has(s.index));
    const seat = candidates.filter(s => Math.abs(s.x) < 3).sort((a, b) => a.y - b.y || a.z - b.z)[0] || candidates[0];
    if (!seat) throw new Error('No real free non-stage seat');
    const placementOffsetZ = fixedAudience ? 0.2 : 0.5;
    const crowd = fixedAudience ? { count: audience?.count ?? null,
      occupiedIndices: [...director.occupied].sort((a, b) => a - b),
      audienceOccupiedIndices: [...(audience?.occupied || [])].sort((a, b) => a - b) } : null;
    director.placeAt(camera.position.clone().set(seat.x, seat.y, seat.z + placementOffsetZ), camera.position.clone().set(seat.x, seat.y + 1, seat.z - 1));
    return { index: seat.index, label: seat.label, position: [seat.x, seat.y, seat.z], placementOffsetZ, ...(crowd ? { crowd } : {}) };
  }, fixedAudienceSeed !== null);
  if (fixedAudienceSeed !== null) {
    const { crowd } = report.seat;
    const validIndices = indices => indices.every(index => Number.isInteger(index) && index >= 0);
    assert.ok(validIndices(crowd.occupiedIndices) && validIndices(crowd.audienceOccupiedIndices), 'Occupied seat indices are nonnegative integers');
    report.audienceFingerprint = { count: crowd.count,
      occupiedCount: crowd.occupiedIndices.length, occupiedSortedSha256: sha256(JSON.stringify(crowd.occupiedIndices)),
      audienceOccupiedCount: crowd.audienceOccupiedIndices.length, audienceOccupiedSortedSha256: sha256(JSON.stringify(crowd.audienceOccupiedIndices)),
      method: 'SHA-256 of UTF-8 JSON.stringify of numerically ascending occupied indices, once after entered frame and before local viewer seating. director.occupied and audience.occupied are recorded separately.',
    };
    delete report.seat.crowd;
  }
  await render('near-seat');
  if (device === 'mobile') await activate(page.getByRole('button', { name: '앉기', exact: true }));
  else await page.keyboard.press('e');
  await page.evaluate(() => { const { director, perf } = window.__fp; director.update(2.5, { time: perf.time, perf, obstacles: [] }); });
  await render('seated');
  report.camera = await page.evaluate(() => {
    const { camera, director, settings, renderer } = window.__fp;
    const actualSeat = director.seat;
    return { mode: director.mode, seat: actualSeat?.index,
      actualSeat: actualSeat ? { index: actualSeat.index, label: actualSeat.label, position: [actualSeat.x, actualSeat.y, actualSeat.z], stage: !!actualSeat.stage } : null,
      position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov, settings: { ...settings }, pixelRatio: renderer.getPixelRatio() };
  });
  if (fixedAudienceSeed !== null) {
    report.audienceFixture.selectedSeatIndex = report.seat.index;
    report.audienceFixture.actualSeatIndex = report.camera.seat ?? null;
    report.audienceFixture.seatMatched = report.camera.seat === report.seat.index;
    report.fixtureStatus = report.audienceFixture.seatMatched && report.camera.mode === 'seat' ? 'PASS' : 'FAIL';
    assert.equal(report.camera.seat, report.seat.index, 'Fixed-audience real sit must reach the selected seat index');
  }
  assert.equal(report.camera.mode, 'seat', 'Real sit input');
  for (let i = 0; i < preludeFrames; i++) await render(`prelude-${i + 1}`);
  report.roster = await page.evaluate(async () => {
    const { stage, perf } = window.__fp;
    const { SECTIONS } = await import(new URL('./js/layout.js', location.href).href);
    const required = new Set();
    for (const track of perf.piece.tracks) {
      const chairs = track.chairs || SECTIONS[track.section]?.chairs.map((_, i) => i) || [];
      for (const chair of chairs) required.add(`${track.section}:${chair}`);
    }
    if (stage.snapRoster) stage.snapRoster(required); else stage.snapOnstage();
    stage.snapConductor(!!perf.piece.conducted);
    return { required: [...required].sort(), method: stage.snapRoster ? 'snapRoster' : 'legacy-snapOnstage' };
  });
  await mark('before-start-show');
  await activate(page.getByRole('button', { name: '공연 시작', exact: true }));
  await page.waitForFunction(() => window.__fp.perf.playing && window.__fp.phase === 'playing', null, { polling: 100 });
  await mark('before-show-frame');
  await render('show-started');
  const prePause = await observeWindow('pre-pause', prePauseMs);
  await activate(page.locator('#btnPlay'));
  const paused = await mark('after-pause-click');
  assert.equal(paused.playing, false, 'Real pause');
  const pauseWindow = await observeWindow('paused', 150);
  assert.ok(Math.abs(pauseWindow.after.time - paused.time) < 1e-6, 'Pause freezes performance position');
  const box = await page.locator('#seek').boundingBox();
  assert.ok(box && box.width > 12, 'Seek slider visible');
  const target = Math.min(report.piece.duration - 1, Math.max(1, seekSeconds));
  const x = box.x + 6 + (box.width - 12) * target / report.piece.duration, y = box.y + box.height / 2;
  if (device === 'mobile') {
    await session.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y, radiusX: 1, radiusY: 1, force: 1 }] });
    await session.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); }
  const sought = await mark('after-seek');
  report.seek = { target, actual: sought.time, input: device === 'mobile' ? 'CDP touch' : 'mouse pointer' };
  assert.ok(Math.abs(sought.time - target) < Math.max(0.8, report.piece.duration * 2 / (box.width - 12)), 'Real seek reaches target');
  await mark('before-resume-click');
  await activate(page.locator('#btnPlay'));
  const afterResume = await mark('after-resume-click');
  assert.equal(afterResume.playing, true, 'Real resume');
  const resumeStart = performance.now();
  report.resume = { conditionTimeoutMs: 2000, thresholdTime: sought.time + 0.05, mainFramesHeld: frameMode === 'controlled', before: afterResume, conditionPassed: false };
  try {
    await page.waitForFunction(seekTime => {
      const { engine, perf } = window.__fp;
      return engine.ctx.state === 'running' && perf.playing && perf.time > seekTime + 0.05;
    }, sought.time, { polling: 20, timeout: 2000 });
    report.resume.conditionPassed = true;
    report.resume.conditionNodeElapsedMs = performance.now() - resumeStart;
  } catch (error) { report.resume.conditionError = error.message; }
  // Keep the same 2s pass/fail gate, then finish a full 2s passive trace even
  // when the condition passed early. No recovery is attempted after failure.
  const remaining = Math.max(0, 2000 - (performance.now() - resumeStart));
  if (remaining > 0) await page.waitForTimeout(remaining);
  report.resume.after = await mark('after-resume-observation');
  report.resume.nodeElapsedMs = performance.now() - resumeStart;
  await render('post-resume');
  const postFrame = await observeWindow('post-frame', 400);
  report.checks = {
    ...(fixedAudienceSeed === null ? {} : { fixedAudienceMainServed: report.audienceFixture.servedRequests > 0, actualSeatMatchesSelected: report.audienceFixture.seatMatched }),
    resumeWithinOriginalTwoSeconds: report.resume.conditionPassed,
    prePauseAudioClockAdvanced: prePause.after.audioNow > prePause.before.audioNow + 0.05,
    postFrameAudioClockAdvanced: postFrame.after.audioNow > postFrame.before.audioNow + 0.05,
    controlledWaitsContainNoMainFrames: frameMode !== 'controlled' || [...report.windows, report.resume].every(w => w.after.framesCompleted === w.before.framesCompleted),
    noPageOrConsoleErrors: !diagnosticsFailed(session.diagnostics),
  };
  report.classification = !report.checks.prePauseAudioClockAdvanced
    ? 'clock-stalled-before-pause; pause/seek cannot establish the initial cause'
    : !report.resume.conditionPassed
      ? 'resume-stall-reproduced; distinguish graph/output/browser/GPU with separate conditions'
      : 'resume-advance-condition-passed';
  if (!report.resume.conditionPassed && report.checks.postFrameAudioClockAdvanced)
    report.classification += '; clock later advanced after another frame, original FAIL retained; correlation does not establish causation';
  report.status = Object.values(report.checks).every(Boolean) ? 'PASS' : 'FAIL';
  report.transportStatus = report.status;
  if (liveWindowMs > 0) {
    console.log(JSON.stringify({ label: cfg.label, venue, frameMode, stage: 'live-window:start', requestedMs: liveWindowMs, transportStatus: report.transportStatus }));
    await bounded(page.evaluate(ms => window.__audioResumeProbe.startLiveWindow(ms), liveWindowMs), 'start native live window');
    const liveNodeStart = performance.now();
    // The browser runs its original rAF and real audio scheduler while Node
    // waits. There is no explicit frame/readback or transport mutation here.
    await page.waitForTimeout(liveWindowMs);
    report.liveWindow = await bounded(page.evaluate(() => window.__audioResumeProbe.finishLiveWindow()), 'finish native live window');
    report.liveWindow.nodeElapsedMs = performance.now() - liveNodeStart;
  }
} catch (error) {
  // A failure in the optional follow-up must not replace the already recorded
  // original two-second transport FAIL with a different overall outcome.
  report.status = report.transportStatus === 'FAIL' || report.fixtureStatus === 'FAIL' ? 'FAIL' : 'ERROR';
  report.failure = { message: error.message, stack: error.stack };
} finally {
  if (page && !page.isClosed()) {
    try {
      report.observation = await bounded(page.evaluate(() => window.__audioResumeProbe?.finish() || null), 'collect passive trace', 5000);
      report.contextLosses = await bounded(page.evaluate(() => window.__audioResumeContextLosses || []), 'collect context losses', 5000);
    } catch (error) { report.collectionError = error.message; if (report.status === 'PASS') report.status = 'ERROR'; }
  }
  if (report.observation) {
    const { notes, samples, dropped } = report.observation;
    if (report.observation.liveWindow) report.liveWindow ??= report.observation.liveWindow;
    delete report.observation.liveWindow;
    const noteResult = summarizeAudioNoteAudit(notes, report.observation.noteAudit, sha256);
    report.noteSummary = noteResult.summary;
    Object.assign(report.checks, noteResult.checks);
    let maxSampleGapMs = 0, longestPlateauMs = 0, lastAdvanceMs = samples[0]?.performanceNowMs;
    for (let i = 1; i < samples.length; i++) {
      const previous = samples[i - 1], current = samples[i];
      maxSampleGapMs = Math.max(maxSampleGapMs, current.performanceNowMs - previous.performanceNowMs);
      if (current.audioNow > previous.audioNow) lastAdvanceMs = current.performanceNowMs;
      else longestPlateauMs = Math.max(longestPlateauMs, current.performanceNowMs - lastAdvanceMs);
    }
    report.traceSummary = { samples: samples.length, maxSampleGapMs, longestObservedAudioClockPlateauMs: longestPlateauMs, dropped };
    report.checks.observationsNotTruncated = Object.values(dropped).every(count => count === 0);
    if (report.liveWindow) {
      const live = report.liveWindow;
      live.cadence = summarizeFrameStarts(live.frameStartTimesMs);
      live.cadence.firstFrameOffsetMs = live.frameStartTimesMs.length ? live.frameStartTimesMs[0] - live.start.performanceNowMs : null;
      live.cadence.trailingWindowMs = live.frameStartTimesMs.length ? live.end.performanceNowMs - live.frameStartTimesMs.at(-1) : null;
      live.cadence.frameStartRateOverWindow = live.observedDurationMs > 0 ? live.frameStartTimesMs.length * 1000 / live.observedDurationMs : null;
      live.cadence.boundaryInterpretation = 'Interval statistics exclude partial start/end gaps. Those gaps and frame starts / full observed wall duration are reported separately so a stall at the end is not hidden.';
      const liveNotes = notes.filter(note => note.phase === 'live-window');
      const musicNotes = liveNotes.filter(note => note.playing);
      live.noteSummary = {
        phase: 'live-window', recordedRequests: liveNotes.length, recordedMusicRequests: musicNotes.length,
        schedulerRequests: liveNotes.filter(note => note.origin === 'scheduler').length,
        heldRequests: liveNotes.filter(note => note.origin === 'held').length,
        unattributedMusicRequests: liveNotes.filter(note => note.origin === 'other' && note.playing).length,
        requestedNotesDelta: live.end.scheduledNotes - live.start.scheduledNotes,
        lateNotesDelta: live.end.lateNotes - live.start.lateNotes,
        lateRecordedMusicRequests: musicNotes.filter(note => note.leadMs < 0).length,
        scoreMismatchesDelta: live.end.scoreMismatches - live.start.scoreMismatches,
        noteErrorsDelta: live.end.noteErrors - live.start.noteErrors,
        requestedScoreOrderSha256: sha256(JSON.stringify(musicNotes.map(note => [note.pieceId, note.scoreIndex, ...note.actual]))),
        lateDefinition: 'Observed playNote request when < native currentTime (leadMs < 0). Not an audible-glitch count.',
      };
      live.clock = {
        audioElapsedSeconds: live.end.audioNow - live.start.audioNow,
        musicElapsedSeconds: live.end.time - live.start.time,
        audioToWallRatio: live.observedDurationMs > 0 ? (live.end.audioNow - live.start.audioNow) * 1000 / live.observedDurationMs : null,
        musicElapsedInterpretation: 'Valid only when the same piece and transport segment span the window; inspect exclusions and states.',
      };
      if (!live.cadence.valid || live.cadence.intervalCount === 0)
        live.exclusions.push({ reason: 'native-frame-cadence-unavailable', detail: live.cadence.unavailableReason });
      if (notes.length < live.end.scheduledNotes || Object.values(dropped).some(count => count > 0))
        live.exclusions.push({ reason: 'passive-observation-truncated' });
      if (report.contextLosses?.some(event => event.at >= live.start.performanceNowMs && event.at <= live.end.performanceNowMs))
        live.exclusions.push({ reason: 'webgl-context-lost-during-window' });
      live.sameConditionComparison = {
        eligibleWithinThisRun: live.exclusions.length === 0,
        exclusions: live.exclusions,
        note: 'No detected condition changes within this run only. Pair comparison must additionally match sources, collector, device, pose, preset/DPR, initial music time, piece hash and observation duration. Metadata samples cannot rule out every transient change.',
      };
      report.checks.liveWindowCompleted = live.outcome === 'completed';
      report.checks.liveWindowNativeFramesObserved = live.cadence.valid && live.cadence.intervalCount > 0;
      report.checks.liveWindowMainSceneRendered = live.end.mainSceneRenders > live.start.mainSceneRenders;
      report.checks.liveWindowNativeAudioClockAdvanced = live.clock.audioElapsedSeconds > 0;
      report.checks.liveWindowRecordingNotTruncated = live.droppedFrameStarts === 0 && live.droppedStates === 0;
    } else if (liveWindowMs > 0) report.checks.liveWindowCompleted = false;
    if (report.diagnostics) report.checks.noPageOrConsoleErrors = !diagnosticsFailed(report.diagnostics);
    report.checks.noContextLosses = Array.isArray(report.contextLosses) && report.contextLosses.length === 0;
    if (report.status === 'PASS' && !Object.values(report.checks).every(Boolean)) report.status = 'FAIL';
  }
  if (browser) await browser.close().catch(error => { report.cleanupError = error.message; });
  await save(cfg, filename, report);
}
console.log(JSON.stringify({ status: report.status, output: path.join(cfg.outputDir, filename), classification: report.classification, checks: report.checks, noteSummary: report.noteSummary, liveCadence: report.liveWindow?.cadence, liveNotes: report.liveWindow?.noteSummary, liveComparison: report.liveWindow?.sameConditionComparison, failure: report.failure?.message }));
if (report.status !== 'PASS') process.exitCode = 1;
