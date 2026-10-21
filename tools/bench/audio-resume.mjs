// Real product audio transport diagnostic. Never imported by the application.
// Use the identical collector against separate reference/candidate servers.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { appURL, choice, config, diagnosticsFailed, openPage, save, sha256, sourceHashes, viewport } from './browser.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`node tools/bench/audio-resume.mjs [label] [hall|sphere] [desktop|mobile]
실제 앱·악기 샘플·오디오 그래프·UI를 사용한 재개 진단이야. FPS 벤치마크가 아니야.
기본값: resume / hall / desktop, FRAME_MODE=controlled, QUALITY=high(desktop)/low(mobile).
FRAME_MODE=controlled|native: controlled는 앱의 main rAF만 잡고 명시적 프레임을 그려.
native는 실제 main rAF를 계속 실행해. 이 경우 대기 구간을 무렌더 대기라고 부르지 않아.
READBACK=1|0: 기본 1은 각 요청 프레임 뒤 readPixels 전후 시계를 기록해.
0은 같은 프레임을 실행하지만 readPixels를 생략하는 별도 원인 분리 조건이야.
PRELUDE_FRAMES=4: 입장·좌석 이동·착석 3프레임 외 착석 상태 준비 프레임 수(0..20).
PRE_PAUSE_MS=400: 공연 프레임 뒤 pause 전 관찰(300..500ms).
SEEK_SECONDS=22, PIECE_ID=선택적_기대곡_ID. 곡을 임의로 교체하지 않고 실제 기본곡을 기록해.
재개 판정은 기존과 동일한 2초: running && playing && time > seekTime + 0.05.
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
const readback = choice(process.env.READBACK || '1', ['1', '0'], 'READBACK') === '1';
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
  options: { frameMode, quality, readback, preludeFrames, prePauseMs, seekSeconds, expectedPiece: process.env.PIECE_ID || null },
  viewport: [size.width, size.height], devicePixelRatio: size.dpr, timeoutMs: cfg.timeoutMs,
  method: 'Native product AudioContext, default graph and original samples. Real solo/start/pause/seek/resume UI. Passive 100ms samples, native worker onTick observer and transparent playNote observation. Boundaries separate app frame, readPixels, pre-pause wait, transport and the following app frame. No audio/context recovery or clock substitution.',
  fixtures: [
    'Seeded Math.random=417, fresh context, manual quality and audience enabled; all other audio/visual settings retain product defaults.',
    'Place beside a real free non-stage seat, sit using E/touch, then finish only the existing camera tween. Snap the score roster and conductor before the real start-show click.',
    'Prelude frames reproduce a heavy rendering prelude but are not the previous full movement/drag/sit/stand scenario. Their count, camera pose and native clock age are recorded.',
    frameMode === 'controlled' ? 'Only the app callback named frame is captured. Explicit frames execute its original function. Other rAF, timers and audio remain native. Observation waits contain no main frames.' : 'Original main rAF cadence remains native. Requested boundaries wait for the next completed app frame; other frames continue throughout observation windows.',
  ],
  limitations: [
    'A stalled running AudioContext can be observed here, but its underlying browser/audio-device/GPU/graph cause is not established by timing correlation alone.',
    'No physical output capture, underrun counter or audible fidelity measurement. Note requests and native clock progress do not prove glitch-free audio.',
    'Mobile is Chromium viewport/touch emulation, not a physical smartphone or Safari.',
    'readPixels deliberately synchronizes WebGL and can perturb execution; READBACK=0 is a separately labelled diagnostic condition.',
    'Runtime note hashes exclude humanization and absolute timestamps; different observation durations or seek positions may produce different hashes. Per-event score matching is checked separately.',
  ],
  checks: {}, frames: [], windows: [],
};
let browser, page;

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
  const append = (array, value, kind) => { if (array.length < limits[kind]) array.push(value); else dropped[kind]++; };
  const originalRender = renderer.render;
  renderer.render = function (renderScene, renderCamera) {
    renderCalls++;
    if (renderScene === scene && renderCamera === camera) mainSceneRenders++;
    return originalRender.apply(this, arguments);
  };
  const originalNote = engine.playNote;
  engine.playNote = function (args) {
    const index = perf.schedIdx - 1, offset = index * 5;
    const track = perf.piece?.tracks[perf.ev?.[offset]];
    const actual = [args.section, args.inst, args.midi, args.dur, args.gain ?? 1, args.layer ?? null];
    const expected = track ? [track.section, track.inst, perf.ev[offset + 3], perf.ev[offset + 2], track.gain ?? 1, track.layer ?? null] : null;
    const note = {
      phase, performanceNowMs: performance.now(), audioNow: this.ctx.currentTime,
      when: args.when, leadMs: (args.when - this.ctx.currentTime) * 1000,
      scoreIndex: index, startPos: perf.startPos, startCtx: perf.startCtx, playing: perf.playing,
      actual, expected, scoreMatch: expected !== null && actual.every((value, i) => value === expected[i]),
    };
    noteCount++;
    if (note.leadMs < 0) lateCount++;
    if (perf.playing && !note.scoreMatch) scoreMismatches++;
    const before = this.voices.size;
    try { return originalNote.call(this, args); }
    catch (error) { note.error = error.message; noteErrors++; throw error; }
    finally { note.voiceCreated = this.voices.size > before; append(notes, note, 'notes'); }
  };
  const offTick = engine.onTick(() => {
    const now = performance.now();
    if (lastTick !== null) maxTickGapMs = Math.max(maxTickGapMs, now - lastTick);
    lastTick = lastTickMs = now; ticks++;
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
  const observeEvent = event => append(events, snapshot(event.type), 'events');
  ctx.addEventListener('statechange', observeEvent);
  document.addEventListener('visibilitychange', observeEvent);
  const timer = setInterval(() => append(samples, snapshot('interval'), 'samples'), 100);
  window.__audioResumeProbe = {
    mark, snapshot,
    finish() {
      if (!stopped) {
        mark('final'); stopped = true; clearInterval(timer); offTick();
        ctx.removeEventListener('statechange', observeEvent);
        document.removeEventListener('visibilitychange', observeEvent);
        engine.playNote = originalNote;
        renderer.render = originalRender;
      }
      return { samples, events, notes, dropped, limits, samplePeriodMs: 100, lateDefinition: 'playNote requested when < native currentTime (leadMs < 0)' };
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
    const frames = window.__audioResumeFrames = { started: 0, completed: 0, waiters: [] };
    const run = (callback, time) => {
      frames.started++;
      callback(time);
      frames.completed++;
      const waiters = frames.waiters.splice(0);
      for (const resolve of waiters) resolve();
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
  await activate(page.getByRole('button', { name: '혼자 보기', exact: true }));
  await page.waitForFunction(() => !document.getElementById('splash') && window.__fp.director.active && window.__fp.engine.ctx?.state === 'running', null, { polling: 100 });
  await page.evaluate(installProbe);
  report.piece = await page.evaluate(() => ({ id: window.__fp.perf.piece?.id, duration: window.__fp.perf.duration, serialized: JSON.stringify(window.__fp.perf.piece) }));
  report.piece.sha256 = sha256(report.piece.serialized);
  delete report.piece.serialized;
  if (process.env.PIECE_ID) assert.equal(report.piece.id, process.env.PIECE_ID, 'Expected default piece');
  await render('entered');
  report.seat = await page.evaluate(() => {
    const { hall, director, camera } = window.__fp;
    const candidates = hall.seats.filter(s => !s.stage && !director.occupied.has(s.index));
    const seat = candidates.filter(s => Math.abs(s.x) < 3).sort((a, b) => a.y - b.y || a.z - b.z)[0] || candidates[0];
    if (!seat) throw new Error('No real free non-stage seat');
    director.placeAt(camera.position.clone().set(seat.x, seat.y, seat.z + 0.5), camera.position.clone().set(seat.x, seat.y + 1, seat.z - 1));
    return { index: seat.index, label: seat.label, position: [seat.x, seat.y, seat.z] };
  });
  await render('near-seat');
  if (device === 'mobile') await activate(page.getByRole('button', { name: '앉기', exact: true }));
  else await page.keyboard.press('e');
  await page.evaluate(() => { const { director, perf } = window.__fp; director.update(2.5, { time: perf.time, perf, obstacles: [] }); });
  await render('seated');
  report.camera = await page.evaluate(() => {
    const { camera, director, settings, renderer } = window.__fp;
    return { mode: director.mode, seat: director.seat?.index, position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov, settings: { ...settings }, pixelRatio: renderer.getPixelRatio() };
  });
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
} catch (error) {
  report.status = 'ERROR';
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
    const scheduled = notes.filter(note => note.playing);
    const segments = {};
    for (const note of scheduled) {
      const key = `${note.startPos}@${note.startCtx}`;
      (segments[key] ||= []).push(note);
    }
    report.noteSummary = {
      recordedRequests: notes.length, scheduledRequests: scheduled.length,
      lateRequests: notes.filter(note => note.leadMs < 0).length,
      thrownErrors: notes.filter(note => note.error).length,
      requestedScoreOrderSha256: sha256(JSON.stringify(scheduled.map(note => [note.scoreIndex, ...note.actual]))),
      scoreMismatches: scheduled.filter(note => !note.scoreMatch).length,
      segments: Object.entries(segments).map(([key, rows]) => ({
        startPosAndContext: key, count: rows.length, firstScoreIndex: rows[0].scoreIndex, lastScoreIndex: rows.at(-1).scoreIndex,
        consecutiveScoreIndices: rows.every((row, i) => i === 0 || row.scoreIndex === rows[i - 1].scoreIndex + 1),
        sequenceSha256: sha256(JSON.stringify(rows.map(note => [note.scoreIndex, ...note.actual]))),
      })),
    };
    let maxSampleGapMs = 0, longestPlateauMs = 0, lastAdvanceMs = samples[0]?.performanceNowMs;
    for (let i = 1; i < samples.length; i++) {
      const previous = samples[i - 1], current = samples[i];
      maxSampleGapMs = Math.max(maxSampleGapMs, current.performanceNowMs - previous.performanceNowMs);
      if (current.audioNow > previous.audioNow) lastAdvanceMs = current.performanceNowMs;
      else longestPlateauMs = Math.max(longestPlateauMs, current.performanceNowMs - lastAdvanceMs);
    }
    report.traceSummary = { samples: samples.length, maxSampleGapMs, longestObservedAudioClockPlateauMs: longestPlateauMs, dropped };
    report.checks.observationsNotTruncated = Object.values(dropped).every(count => count === 0);
    report.checks.scheduledRequestsMatchScore = report.noteSummary.scoreMismatches === 0;
    report.checks.scheduledIndicesConsecutiveWithinTransportSegment = report.noteSummary.segments.every(segment => segment.consecutiveScoreIndices);
    report.checks.noObservedNoteErrors = report.noteSummary.thrownErrors === 0;
    if (report.status === 'PASS' && !Object.values(report.checks).every(Boolean)) report.status = 'FAIL';
  }
  if (browser) await browser.close().catch(error => { report.cleanupError = error.message; });
  await save(cfg, filename, report);
}
console.log(JSON.stringify({ status: report.status, output: path.join(cfg.outputDir, filename), classification: report.classification, checks: report.checks, noteSummary: report.noteSummary, failure: report.failure?.message }));
if (report.status !== 'PASS') process.exitCode = 1;
