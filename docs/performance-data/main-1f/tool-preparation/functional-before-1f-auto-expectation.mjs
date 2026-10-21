// Functional browser checks. Run serially, after GPU benchmarks have finished.
//   node tools/bench/functional.mjs                 # both venues x desktop/mobile
//   node tools/bench/functional.mjs sphere mobile   # one case
// This deliberately captures the app's main rAF and renders explicit frames.
// Its frame cadence, render counts and elapsed time are NOT performance results.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { appURL, config, diagnosticsFailed, openPage, save, sha256, sourceHashes, viewport } from './browser.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`node tools/bench/functional.mjs [hall|sphere] [desktop|mobile]
두 공연장과 desktop/mobile 조합을 순서대로 확인해. 성능/FPS 측정은 아니야.
환경: BASE_URL, REVISION, OUTPUT_DIR, LABEL, PLAYWRIGHT_MODULE,
      CHROME_EXECUTABLE, CHROME_ARGS, SOFTWARE_RENDERER=1, FONT_MODE,
      FONT_ROOT, WIDTH, HEIGHT, DPR, TIMEOUT_MS, SCOPE=full|transport,
      CONTINUE_ON_TRANSPORT_FAIL=1
기본 화면: desktop 960x540 DPR 1, mobile 390x844 DPR 2.
TIMEOUT_MS 기본값은 180000이야. 명시적 렌더 프레임 대기도 같은 제한을 써.
예전 1280x720 desktop 조건은 WIDTH=1280 HEIGHT=720으로 지정해.
FONT_MODE=local과 FONT_ROOT로 원래 로컬 폰트 fixture를 재현할 수 있어.
SCOPE=transport는 같은 입장·이동·좌석·시작·일시정지·seek·재개까지만 검사해.
프로그램·quality·중계 토글 등 이후 항목은 unchecked에 남겨. 전체 PASS가 아니야.
CONTINUE_ON_TRANSPORT_FAIL=1은 full 진단 전용이야. 재개 2초 검사를 실패해도
실제 일시정지 후 후속 조작을 검사해. 원래 실패·trace를 보존하고 최종 FAIL/exit 1을 유지해.
입장 버튼 준비 뒤 Sphere의 dome.mesh.visible===true를 별도로 기다리고
대기 전/후 상태·시점을 기록해. 최초 조작/명시적 렌더 전에만 적용하며 Hall은 해당 없어.
이 플래그는 compile 성공이나 첫 실제 GPU 프레임 완료의 증거가 아니야.
TIMEOUT_MS 안에 보이지 않으면 원래 timeout과 상태를 FAIL 결과에 보존해.
수동 DPR 기대값은 main 1f 기준 high cap 1.5, medium cap 1.25×0.85, low cap 1.25야.
--help는 Playwright를 로드하거나 브라우저를 시작하지 않아.`);
  process.exit(0);
}
assert.ok(args.length <= 2, 'Expected [hall|sphere] [desktop|mobile]');
if (args[0]) assert.ok(['hall', 'sphere'].includes(args[0]), 'Unknown venue');
if (args[1]) assert.ok(['desktop', 'mobile'].includes(args[1]), 'Unknown device');
const scope = process.env.SCOPE || 'full';
assert.ok(['full', 'transport'].includes(scope), 'SCOPE must be full or transport');
const continueOnTransportFail = process.env.CONTINUE_ON_TRANSPORT_FAIL === '1';
assert.ok(!continueOnTransportFail || scope === 'full', 'CONTINUE_ON_TRANSPORT_FAIL requires SCOPE=full');
const cfg = config(process.env.LABEL || 'functional');
const out = cfg.outputDir;
const cases = (args[0] ? [args[0]] : ['hall', 'sphere']).flatMap(venue =>
  (args[1] ? [args[1]] : ['desktop', 'mobile']).map(device => ({ venue, device })));
const fixtureSourceSha256 = sha256(await fs.readFile(new URL(import.meta.url)));

async function withTimeout(promise, label, timeoutMs = cfg.timeoutMs, code = 'QA_FRAME_TIMEOUT') {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`${label}: timeout ${timeoutMs}ms exceeded`);
        error.code = code;
        reject(error);
      }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
function closeVector(actual, expected, label, tolerance = 1e-8) {
  assert.equal(actual?.length, expected.length, `${label}: missing vector`);
  assert.ok(distance(actual, expected) < tolerance, `${label}: ${actual} != ${expected}`);
}

// The compileAsync finally path may show the mesh even after a rejected
// compilation. Observing visible is not a shader-success or first-pixel test.
function readDomeVisibility(requireVisible = false) {
  const fp = window.__fp, mesh = fp?.hall?.dome?.mesh;
  if (requireVisible && (!fp || mesh?.visible !== true)) return false;
  const enter = document.getElementById('enterBtn');
  return {
    performanceNowMs: performance.now(), wallTimeMs: Date.now(), timeOriginMs: performance.timeOrigin,
    fpAvailable: !!fp, domeAvailable: !!fp?.hall?.dome, meshAvailable: !!mesh,
    meshVisible: typeof mesh?.visible === 'boolean' ? mesh.visible : null,
    entryButtonPresent: !!enter, entryButtonEnabled: !!enter && !enter.disabled,
    capturedMainFrame: typeof window.__qaMainFrame === 'function', visibility: document.visibilityState,
  };
}

async function observeDomeVisibility(page, venue, record) {
  const started = performance.now();
  let waitStarted = null, waitSettled = null, handle;
  record.status = 'RUNNING';
  record.startedAt = new Date().toISOString();
  try {
    record.before = await page.evaluate(readDomeVisibility);
    if (venue !== 'sphere') { record.status = 'NOT_APPLICABLE'; return; }
    record.alreadyVisibleAtStart = record.before.meshVisible === true;
    waitStarted = performance.now();
    handle = await page.waitForFunction(readDomeVisibility, true, { timeout: cfg.timeoutMs, polling: 100 });
    waitSettled = performance.now();
    record.after = await handle.jsonValue();
    record.status = 'OBSERVED_VISIBLE';
    record.observedVisibleAtMs = record.after.performanceNowMs;
  } catch (error) {
    waitSettled ??= performance.now();
    if (error.name === 'TimeoutError' && !error.code) error.code = 'QA_DOME_VISIBILITY_TIMEOUT';
    record.status = 'FAIL';
    record.failure = { message: error.message, code: error.code };
    try {
      record.after = await withTimeout(page.evaluate(readDomeVisibility), 'post-failure dome visibility', 1000, 'QA_DIAGNOSTIC_TIMEOUT');
    } catch (secondary) { record.afterObservationError = { message: secondary.message, code: secondary.code }; }
    throw error;
  } finally {
    record.elapsedWallMs = performance.now() - started;
    record.additionalWaitWallMs = waitStarted === null ? null : (waitSettled ?? performance.now()) - waitStarted;
    record.finishedAt = new Date().toISOString();
    if (handle) await handle.dispose().catch(() => {});
  }
}

// Serialized into the page. Observes real state without substituting controls.
function readState() {
  const { director: d, camera: c, engine: e, perf: p, settings, hall, renderer, audience, phase } = window.__fp;
  const f = c.position.clone().set(0, 0, -1).applyQuaternion(c.quaternion);
  const u = c.position.clone().set(0, 1, 0).applyQuaternion(c.quaternion);
  const pose = e._listenerPose || window.__qaListenerTarget;
  const stats = window.__fp.stats;
  const uniforms = hall.dome?.uniforms;
  const cube = (texture, id) => ({
    id,
    sizes: Array.isArray(texture?.image) ? texture.image.map(i => [i?.width, i?.height]) : [],
  });
  return {
    mode: d.mode, active: d.active, seat: d.seat?.index ?? null, nearSeat: d.nearSeat?.index ?? null,
    position: d.pos.toArray(), camera: c.position.toArray(), forward: f.toArray(), up: u.toArray(),
    yaw: d.yaw, pitch: d.pitch, joy: { ...d.joy }, keys: [...d.keys],
    listener: pose ? { position: [pose.px, pose.py, pose.pz], forward: [pose.fx, pose.fy, pose.fz], up: [pose.ux, pose.uy, pose.uz] } : null,
    listenerObservation: e._listenerPose ? 'engine-target-cache' : pose ? 'original-setListener-input' : null,
    audio: e.ctx?.state, playing: p.playing, time: p.time, duration: p.duration, piece: p.piece?.id,
    audioClock: {
      wallTimeMs: Date.now(), performanceNowMs: performance.now(), audioNow: e.ctx?.currentTime,
      startCtx: p.startCtx, startPos: p.startPos, pausedPosition: p.pos,
      outputLatency: e.ctx ? e.outputLatency : null, sampleRate: e.ctx?.sampleRate,
      voices: e.voices?.size, scheduledEventIndex: p.schedIdx, eventCount: p.evCount,
      visibility: document.visibilityState,
    },
    phase, audience: audience?.count ?? null, occupied: d.occupied.size,
    settings: { quality: settings.quality, audience: settings.audience, screen: settings.screen, fixedEar: settings.fixedEar },
    render: { quality: stats?.quality ?? null, scale: stats?.renderScale ?? null, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, statisticsAvailable: !!stats },
    dome: uniforms ? {
      current: hall.dome.current, live: hall.dome.liveActive, liveMix: uniforms.uLive.value,
      mix: uniforms.uMix.value, reveal: uniforms.uReveal.value, currentId: uniforms.uA.value,
      cubeA: cube(uniforms.uCubeA.value, uniforms.uCubeAId.value),
      cubeB: cube(uniforms.uCubeB.value, uniforms.uCubeBId.value),
    } : null,
  };
}

// Passive, bounded diagnostics for a real UI resume. This does not call resume,
// play, seek, updateVisual or _schedule, and never substitutes an audio clock.
function startResumeTrace({ samplePeriodMs, maxSamples, thresholdTime }) {
  const { engine, perf } = window.__fp;
  const ctx = engine.ctx;
  const samples = [], events = [];
  let ticks = 0, lastTickMs = null, interval, active = true, final = null;
  const startedAtMs = performance.now();
  const snapshot = cause => {
    let outputTimestamp = null;
    try {
      if (typeof ctx.getOutputTimestamp === 'function') {
        const stamp = ctx.getOutputTimestamp();
        outputTimestamp = { contextTime: stamp.contextTime, performanceTime: stamp.performanceTime };
      }
    } catch (error) { outputTimestamp = { error: error.message }; }
    const now = performance.now();
    return {
      cause, wallTimeMs: Date.now(), elapsedMs: now - startedAtMs, performanceNowMs: now,
      audioState: ctx.state, audioNow: ctx.currentTime, outputTimestamp,
      outputLatency: engine.outputLatency, baseLatency: ctx.baseLatency ?? null,
      deviceOutputLatency: ctx.outputLatency ?? null, sampleRate: ctx.sampleRate,
      playing: perf.playing, time: perf.time, startPos: perf.startPos, startCtx: perf.startCtx,
      pausedPosition: perf.pos, phase: window.__fp.phase,
      voices: engine.voices.size, scheduledEventIndex: perf.schedIdx, eventCount: perf.evCount,
      ticks, lastTickMs, msSinceLastTick: lastTickMs === null ? null : now - lastTickMs,
      visibility: document.visibilityState,
    };
  };
  const sample = cause => {
    const value = snapshot(cause);
    if (samples.length < maxSamples || cause === 'final') samples.push(value);
    if (samples.length >= maxSamples) clearInterval(interval);
    return value;
  };
  const recordEvent = event => { if (events.length < maxSamples) events.push(snapshot(event.type)); };
  const offTick = engine.onTick(() => { ticks++; lastTickMs = performance.now(); });
  ctx.addEventListener('statechange', recordEvent);
  document.addEventListener('visibilitychange', recordEvent);
  interval = setInterval(() => sample('interval'), samplePeriodMs);
  sample('before-resume-click');
  window.__qaResumeTrace = {
    sample,
    finish(outcome) {
      if (active) {
        active = false;
        clearInterval(interval);
        offTick();
        ctx.removeEventListener('statechange', recordEvent);
        document.removeEventListener('visibilitychange', recordEvent);
        sample('final');
        final = {
          method: 'Passive 100ms wall-clock samples; audio state/visibility listeners; one read-only engine.onTick observer. No manual frames or clock/audio mutations during the resume wait.',
          samplePeriodMs, maxSamples, thresholdTime, outcome, samples, events,
        };
      }
      return final;
    },
  };
}

// Match the production score's named chairs, without assuming every musician
// plays every piece. This only reads state; programme changes remain real UI.
async function readRoster() {
  const { stage, perf } = window.__fp;
  const { SECTIONS } = await import(new URL('./js/layout.js', location.href).href);
  const required = new Set();
  for (const track of perf.piece?.tracks || []) {
    const chairs = track.chairs || SECTIONS[track.section]?.chairs.map((_, i) => i) || [];
    for (const chair of chairs) required.add(`${track.section}:${chair}`);
  }
  const active = stage.walkers.filter(w => w.state !== 'off' && !w.leaving);
  return {
    piece: perf.piece?.id, supported: typeof stage.snapRoster === 'function',
    required: [...required].sort(), active: active.map(w => `${w.player.sid}:${w.player.ci}`).sort(),
    settled: active.every(w => w.state === 'seated' || w.state === 'standing'),
    conductorOn: stage.conductorOn,
  };
}

async function runCase({ venue, device }) {
  const mobile = device === 'mobile';
  const initialQuality = mobile ? 'low' : 'high';
  const size = viewport(device, mobile ? { width: 390, height: 844 } : { width: 960, height: 540 });
  const filename = `${cfg.label}-${venue}-${device}.json`;
  const report = {
    schema: 2, suite: 'functional-controlled', scope, venue, device, status: 'RUNNING', url: appURL(cfg.baseURL, venue),
    label: cfg.label, revision: cfg.revision, fixtureSourceSha256,
    diagnosticOptions: { continueOnTransportFail },
    viewport: [size.width, size.height], devicePixelRatio: size.dpr, timeoutMs: cfg.timeoutMs,
    method: 'Real UI, keyboard and CDP touch input; captured main rAF with explicit complete WebGL frames. Functional assertions only; no FPS or performance claim.',
    fixtures: [
      'Fresh browser context, deterministic Math.random seed 417, initial manual quality and audience enabled in localStorage.',
      cfg.fontMode === 'local'
        ? 'Google Fonts requests use explicit local font files from FONT_ROOT; external font connectivity is outside this check.'
        : cfg.fontMode === 'system'
          ? 'Google Fonts CSS is replaced with an empty response and browser system fallback fonts are used; font fidelity is outside this check.'
          : 'Google Fonts requests use the network; connectivity errors remain visible in diagnostics.',
      'The app main rAF is captured; other rAF callbacks, the UI and audio clock remain native. Each requested main frame really renders and readPixels completes its WebGL work.',
      'Listener assertions compare the intended target pose. A baseline without the target cache records the original setListener inputs after calling it unchanged; interpolated AudioParam values are not treated as immediate targets.',
    ],
    unchecked: scope === 'transport' ? ['programme-switch', 'quality-presets-and-world-target-resize', 'audience-toggle', 'broadcast-toggle', 'automatic-preset-reset', 'final-mobile-layout'] : [],
    checks: { domeVisibility: {
      status: 'NOT_RUN', applicable: venue === 'sphere', before: null, after: null,
      observedVisibleAtMs: null, additionalWaitWallMs: null, timeoutMs: cfg.timeoutMs, pollingMs: 100,
      method: 'Read-only mesh.visible===true observation after the existing entry-button-ready wait and before first UI entry or requested main render. The UI-ready condition remains separate. No visibility assignment, compile call, render frame or audio mutation. This does not prove compile success or first-pixel readiness.',
    } }, frames: [], failures: [], errors: [], warnings: [], failedRequests: [],
  };
  let browser, page, cdp, session;
  const log = stage => console.log(JSON.stringify({ venue, device, stage }));
  try {
    session = await openPage(cfg, device, size);
    ({ browser, page, cdp } = session);
    report.environment = session.environment;
    report.diagnostics = session.diagnostics;
    report.warnings = session.diagnostics.warnings;
    report.failedRequests = session.diagnostics.failedRequests;
    report.sourceHashes = await sourceHashes(page, cfg.baseURL);
    await page.addInitScript(({ quality }) => {
      let seed = 417;
      Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
      localStorage.setItem('fp-settings', JSON.stringify({ quality, audience: true }));
      const native = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => callback.name === 'frame'
        ? (window.__qaMainFrame = callback, 0) : native(callback);
      window.__qaContextLosses = [];
      document.addEventListener('webglcontextlost', event => window.__qaContextLosses.push(event.statusMessage || 'context lost'), true);
    }, { quality: initialQuality });

    const activate = async locator => mobile ? locator.tap() : locator.click();
    const setCheckbox = async (id, checked) => {
      const locator = page.locator(`#${id}`);
      if ((await locator.isChecked()) !== checked) await activate(locator);
      assert.equal(await locator.isChecked(), checked, `${id} native input`);
    };
    const settingsPanel = async () => {
      if (await page.locator('#panel').isHidden() || await page.locator('[data-body="settings"]').isHidden())
        await activate(page.getByRole('button', { name: '설정', exact: true }));
    };
    const closePanel = async () => { if (await page.locator('#panel').isVisible()) await activate(page.locator('#panelClose')); };
    const state = () => page.evaluate(readState);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: points.map(p => ({ id: 1, radiusX: 1, radiusY: 1, force: 1, ...p })),
    });
    const renderFrame = async label => {
      log(`frame:${label}`);
      const result = await withTimeout(page.evaluate(() => {
        if (typeof window.__qaMainFrame !== 'function') throw new Error('Main rAF was not captured');
        window.__qaRenderPasses = [];
        window.__qaMainFrame();
        const gl = window.__fp.renderer.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        const errors = [];
        for (let i = 0; i < 16; i++) { const error = gl.getError(); if (error === gl.NO_ERROR) break; errors.push(error); }
        return { passes: window.__qaRenderPasses, glErrors: errors, contextLost: gl.isContextLost() };
      }), `frame:${label}`);
      result.state = await state();
      result.label = label;
      report.frames.push(result);
      assert.deepEqual(result.glErrors, [], `${label}: WebGL errors`);
      assert.equal(result.contextLost, false, `${label}: WebGL context lost`);
      assert.ok(result.passes.some(p => p.kind === 'main'), `${label}: no main scene render`);
      return result;
    };
    const assertListener = (s, label) => {
      assert.ok(s.listener, `${label}: listener target missing`);
      closeVector(s.listener.position, s.camera, `${label} listener position`);
      closeVector(s.listener.forward, s.forward, `${label} listener orientation`);
      closeVector(s.listener.up, s.up, `${label} listener up`);
    };
    const seekTo = async desired => {
      const duration = await page.evaluate(() => window.__fp.perf.duration);
      const target = Math.min(duration - 1, Math.max(1, desired));
      const box = await page.locator('#seek').boundingBox();
      assert.ok(box && box.width > 12, 'Visible seek slider');
      const x = box.x + 6 + (box.width - 12) * target / duration;
      const y = box.y + box.height / 2;
      if (mobile) {
        // Observe the original touch sequence; never invoke seek or alter its clock.
        // Preserve the old immediate assertion separately from the bounded result.
        const tolerance = Math.max(0.8, duration * 2 / (box.width - 12));
        const diagnostic = {
          input: 'CDP touch', target, duration, tolerance, point: { x, y }, box,
          conditionTimeoutMs: 2000, firstReadPassed: null, waitPassed: false,
          method: 'Capture-only input listeners and a transparent perf.seek wrapper. Original touchStart/touchEnd, then the original immediate time read and a separate paused-position wait. No seek/clock substitution.',
        };
        const diagnostics = report.mobileSeekDiagnostics ||= [];
        const diagnosticIndex = diagnostics.push(diagnostic) - 1;
        diagnostic.beforeInput = await page.evaluate(({ x, y }) => {
          const { perf, engine } = window.__fp;
          const seek = document.getElementById('seek');
          const events = [], calls = [], dropped = { events: 0, calls: 0 };
          const limits = { events: 128, calls: 16 };
          const describe = node => node instanceof Element
            ? { tag: node.tagName.toLowerCase(), id: node.id || null, class: node.getAttribute('class'), role: node.getAttribute('role') }
            : node === document ? { node: 'document' } : node === window ? { node: 'window' } : { node: node?.nodeName || null };
          const snapshot = () => ({
            performanceNowMs: performance.now(), wallTimeMs: Date.now(),
            time: perf.time, pausedPosition: perf.pos, playing: perf.playing,
            duration: perf.duration, phase: window.__fp.phase, mode: window.__fp.director.mode,
            audioState: engine.ctx?.state, audioNow: engine.ctx?.currentTime,
            visibility: document.visibilityState,
          });
          const append = (list, row, kind) => {
            if (list.length < limits[kind]) list.push(row); else dropped[kind]++;
          };
          const point = t => ({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY, pageX: t.pageX, pageY: t.pageY, radiusX: t.radiusX, radiusY: t.radiusY, force: t.force });
          const observe = event => append(events, {
            type: event.type, eventTimeStamp: event.timeStamp, performanceNowMs: performance.now(), wallTimeMs: Date.now(),
            isTrusted: event.isTrusted, eventPhase: event.eventPhase, defaultPreventedAtCapture: event.defaultPrevented,
            target: describe(event.target), path: event.composedPath().slice(0, 16).map(describe),
            pointerId: event.pointerId ?? null, pointerType: event.pointerType ?? null,
            clientX: event.clientX ?? null, clientY: event.clientY ?? null,
            button: event.button ?? null, buttons: event.buttons ?? null,
            seekHasPointerCapture: event.pointerId === undefined ? null : seek.hasPointerCapture(event.pointerId),
            touches: event.touches ? [...event.touches].map(point) : null,
            changedTouches: event.changedTouches ? [...event.changedTouches].map(point) : null,
          }, 'events');
          const eventTypes = ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'gotpointercapture', 'lostpointercapture'];
          for (const type of eventTypes) document.addEventListener(type, observe, { capture: true, passive: true });
          const originalSeek = perf.seek;
          const ownSeekDescriptor = Object.getOwnPropertyDescriptor(perf, 'seek');
          const observedSeek = function (t) {
            const call = { requestedTime: t, before: snapshot() };
            try { return originalSeek.apply(this, arguments); }
            catch (error) { call.error = error.message; throw error; }
            finally { call.after = snapshot(); append(calls, call, 'calls'); }
          };
          perf.seek = observedSeek;
          const bounds = id => {
            const el = document.getElementById(id);
            if (!el) return null;
            const r = el.getBoundingClientRect(), css = getComputedStyle(el);
            return { element: describe(el), rect: { x: r.x, y: r.y, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
              hidden: el.hidden, ariaDisabled: el.getAttribute('aria-disabled'),
              style: { display: css.display, visibility: css.visibility, opacity: css.opacity, pointerEvents: css.pointerEvents, touchAction: css.touchAction, zIndex: css.zIndex } };
          };
          const hit = document.elementFromPoint(x, y);
          const hitPath = [];
          for (let node = hit; node && hitPath.length < 16; node = node.parentElement) hitPath.push(describe(node));
          window.__qaMobileSeekProbe = {
            snapshot,
            finish() {
              const finalState = snapshot();
              for (const type of eventTypes) document.removeEventListener(type, observe, true);
              const wrapperStillInstalled = perf.seek === observedSeek;
              if (wrapperStillInstalled) {
                if (ownSeekDescriptor) Object.defineProperty(perf, 'seek', ownSeekDescriptor);
                else delete perf.seek;
              }
              delete window.__qaMobileSeekProbe;
              return { events, calls, dropped, limits, finalState, wrapperRestored: wrapperStillInstalled,
                note: 'Capture-phase defaultPrevented is read before target handlers. Observation adds overhead; event/seek evidence does not prove physical-device behaviour.' };
            },
          };
          return {
            state: snapshot(), hitTarget: describe(hit), hitPath,
            hitIsSeekOrDescendant: !!hit && (hit === seek || seek.contains(hit)),
            elementsFromPoint: document.elementsFromPoint(x, y).slice(0, 16).map(describe),
            elements: Object.fromEntries(['seek', 'transport', 'joyZone', 'joystick', 'stage'].map(id => [id, bounds(id)])),
            viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollX, scrollY,
              visual: visualViewport ? { width: visualViewport.width, height: visualViewport.height, offsetLeft: visualViewport.offsetLeft, offsetTop: visualViewport.offsetTop, scale: visualViewport.scale } : null },
            timeLabel: document.getElementById('time')?.textContent,
          };
        }, { x, y });
        try {
          await touch('touchStart', [{ x, y }]);
          await touch('touchEnd', []);
          const actual = await page.evaluate(() => window.__fp.perf.time);
          diagnostic.firstReadActual = actual;
          diagnostic.firstReadPassed = Math.abs(actual - target) < tolerance;
          diagnostic.firstReadFailure = diagnostic.firstReadPassed ? null : `Native seek ${actual} != ${target}`;
          const waitStartedAt = performance.now();
          try {
            const handle = await page.waitForFunction(({ target, tolerance }) => {
              const perf = window.__fp.perf;
              return !perf.playing && Math.abs(perf.time - target) < tolerance;
            }, { target, tolerance }, { polling: 20, timeout: 2000 });
            diagnostic.waitPassed = true;
            await handle.dispose();
          } catch (error) { diagnostic.waitError = error.message; }
          diagnostic.waitNodeElapsedMs = performance.now() - waitStartedAt;
          diagnostic.afterWait = await page.evaluate(() => window.__qaMobileSeekProbe.snapshot());
        } catch (error) {
          diagnostic.inputOrObservationError = error.message;
          throw error;
        } finally {
          try {
            diagnostic.observation = await withTimeout(page.evaluate(() => window.__qaMobileSeekProbe?.finish() || null), 'mobile seek observation', 5000, 'QA_DIAGNOSTIC_TIMEOUT');
          } catch (error) { diagnostic.observationError = { message: error.message, code: error.code }; }
        }
        diagnostic.classification = diagnostic.waitPassed
          ? diagnostic.firstReadPassed ? 'immediate-and-wait-passed' : 'immediate-failed; paused-position-observed-within-two-seconds'
          : 'paused-position-not-observed-within-two-seconds';
        assert.ok(diagnostic.waitPassed, `Native mobile seek ${diagnostic.afterWait?.time} != ${target} within 2000ms (first read ${diagnostic.firstReadActual})`);
        assert.ok(diagnostic.observation && !diagnostic.observationError, 'Mobile seek input observations collected');
        return { input: 'CDP touch', target, actual: diagnostic.afterWait.time, firstReadActual: diagnostic.firstReadActual,
          firstReadPassed: diagnostic.firstReadPassed, waitPassed: diagnostic.waitPassed, conditionTimeoutMs: 2000, diagnosticIndex };
      }
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up();
      const actual = await page.evaluate(() => window.__fp.perf.time);
      assert.ok(Math.abs(actual - target) < Math.max(0.8, duration * 2 / (box.width - 12)), `Native seek ${actual} != ${target}`);
      return { input: mobile ? 'CDP touch' : 'mouse pointer', target, actual };
    };

    await page.goto(report.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const enter = document.getElementById('enterBtn');
      return !!window.__fp && !!enter && !enter.disabled && !!window.__qaMainFrame;
    }, null, { timeout: cfg.timeoutMs, polling: 100 });
    await observeDomeVisibility(page, venue, report.checks.domeVisibility);
    log(`dome-visibility:${report.checks.domeVisibility.status}`);
    await page.evaluate(() => {
      // Observation wrapper only: the original renderer and scene hooks execute.
      const { renderer, scene, camera, engine } = window.__fp;
      const original = renderer.render;
      window.__qaRenderPasses = [];
      renderer.render = function(renderScene, renderCamera) {
        const target = this.getRenderTarget();
        window.__qaRenderPasses.push({
          kind: renderScene === scene ? (renderCamera === camera ? 'main' : 'broadcast') : target?.isWebGLCubeRenderTarget ? 'world' : 'post',
          target: target ? [target.width, target.height] : null,
        });
        return original.apply(this, arguments);
      };
      if (!Object.prototype.hasOwnProperty.call(engine, '_listenerPose')) {
        const setListener = engine.setListener;
        engine.setListener = function(pos, forward, up) {
          const result = setListener.apply(this, arguments);
          window.__qaListenerTarget = {
            px: pos.x, py: pos.y, pz: pos.z,
            fx: forward.x, fy: forward.y, fz: forward.z,
            ux: up.x, uy: up.y, uz: up.z,
          };
          return result;
        };
      }
    });
    report.checks.device = await page.evaluate(() => ({
      maxTouchPoints: navigator.maxTouchPoints, finePointer: matchMedia('(pointer: fine)').matches,
      viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, userAgent: navigator.userAgent,
    }));
    if (mobile) assert.ok(report.checks.device.maxTouchPoints > 0);
    log('ready');
    // The plaza fixes the animal on first visit. Only the name can change;
    // never recreate the removed avatar selector in a functional fixture.
    if (await page.locator('#lbAnimal').count()) {
      report.checks.identity = await page.evaluate(() => ({
        stored: JSON.parse(localStorage.getItem('fp-identity') || 'null'),
        animalLabel: document.getElementById('lbAnimal').textContent,
        avatarSelectors: document.querySelectorAll('select#lbAvatar').length,
      }));
      assert.ok(report.checks.identity.stored?.avatar, 'A persistent animal identity was created');
      assert.ok(report.checks.identity.animalLabel.trim(), 'The fixed animal is shown in the lobby');
      assert.equal(report.checks.identity.avatarSelectors, 0, 'The animal is not presented as an editable selector');
    } else report.checks.identity = { status: 'NOT_APPLICABLE', reason: 'Reference predates fixed plaza identity' };
    await activate(page.getByRole('button', { name: '혼자 보기', exact: true }));
    await page.waitForFunction(() => !document.getElementById('splash') && window.__fp.director.active, null, { polling: 100 });
    await page.waitForFunction(() => window.__fp.engine.ctx.state === 'running', null, { polling: 100 });
    report.checks.entry = (await renderFrame('entered')).state;
    assert.equal(report.checks.entry.mode, 'walk');
    assertListener(report.checks.entry, 'entry');

    // Walk from the real entrance, before any placement fixture is used.
    const beforeMove = await state();
    if (mobile) {
      assert.equal(await page.locator('#joystick').isVisible(), true);
      const box = await page.locator('#joystick').boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await touch('touchStart', [{ x, y }]);
      await touch('touchMove', [{ x, y: y - 36 }]);
    } else await page.keyboard.down('w');
    await page.waitForTimeout(60); // lets the app's real dt reach one normal movement step
    await renderFrame('movement-1');
    const moved = (await renderFrame('movement-2')).state;
    if (mobile) { assert.ok(moved.joy.y < -0.5, 'Touch reached the joystick'); await touch('touchEnd', []); }
    else await page.keyboard.up('w');
    assert.ok(Math.hypot(moved.position[0] - beforeMove.position[0], moved.position[2] - beforeMove.position[2]) > 0.01, 'Movement changed the walking position');
    assertListener(moved, 'walking');
    assert.ok(distance(moved.listener.position, beforeMove.listener.position) > 0.01, 'Listener follows movement');
    report.checks.movement = { input: mobile ? 'CDP joystick drag' : 'W key', before: beforeMove, after: moved };

    // Choose a real exposed canvas point, avoiding overlays and mobile controls.
    const drag = await page.evaluate(() => {
      const canvas = window.__fp.renderer.domElement;
      for (const [fx, fy] of [[0.64, 0.4], [0.68, 0.5], [0.56, 0.32]]) {
        const x = innerWidth * fx, y = innerHeight * fy;
        const dx = Math.min(75, innerWidth * 0.18), dy = 28;
        if (document.elementFromPoint(x, y) === canvas && document.elementFromPoint(x + dx, y + dy) === canvas) return { x, y, dx, dy };
      }
      throw new Error('No unobstructed canvas drag path');
    });
    const beforeLook = await state();
    if (mobile) {
      await touch('touchStart', [{ x: drag.x, y: drag.y }]);
      for (let i = 1; i <= 4; i++) await touch('touchMove', [{ x: drag.x + drag.dx * i / 4, y: drag.y + drag.dy * i / 4 }]);
      await touch('touchEnd', []);
    } else {
      await page.mouse.move(drag.x, drag.y); await page.mouse.down();
      await page.mouse.move(drag.x + drag.dx, drag.y + drag.dy, { steps: 4 }); await page.mouse.up();
    }
    const looked = (await renderFrame('look-drag')).state;
    assert.ok(Math.abs(looked.yaw - beforeLook.yaw) > 0.05, 'Drag changed yaw');
    assert.ok(Math.abs(looked.pitch - beforeLook.pitch) > 0.02, 'Drag changed pitch');
    assertListener(looked, 'looking');
    assert.ok(distance(looked.listener.forward, beforeLook.listener.forward) > 0.05, 'Listener follows orientation');
    if (mobile) assert.deepEqual(looked.joy, { x: 0, y: 0 }, 'Joystick releases after touch end');
    report.checks.look = { input: mobile ? 'CDP canvas drag' : 'mouse drag', before: beforeLook, after: looked };
    await page.waitForTimeout(250); // allow the real 40 ms AudioParam smoothing to settle
    const listenerValues = await page.evaluate(() => {
      const l = window.__fp.engine.ctx.listener;
      return l.positionX ? { position: [l.positionX.value, l.positionY.value, l.positionZ.value], forward: [l.forwardX.value, l.forwardY.value, l.forwardZ.value] } : null;
    });
    if (listenerValues) {
      closeVector(listenerValues.position, looked.camera, 'Web Audio listener position', 0.03);
      closeVector(listenerValues.forward, looked.forward, 'Web Audio listener orientation', 0.02);
    }
    report.checks.listenerAudioParams = listenerValues;

    report.fixtures.push('Seat reachability: director.placeAt places the walker beside a real unoccupied seat, avoiding a long venue walk. Seat selection itself uses E or the touch sit button; standing uses E or the real walk button.');
    report.checks.seatFixture = await page.evaluate(() => {
      const { hall, director, camera } = window.__fp;
      const candidates = hall.seats.filter(s => !director.occupied.has(s.index));
      const seat = candidates.filter(s => Math.abs(s.x) < 3).sort((a, b) => a.y - b.y || a.z - b.z)[0] || candidates[0];
      if (!seat) throw new Error('No unoccupied seat');
      director.placeAt(camera.position.clone().set(seat.x, seat.y, seat.z + 0.5), camera.position.clone().set(seat.x, seat.y + 1, seat.z - 1));
      return { candidate: seat.index, label: seat.label };
    });
    const reachable = (await renderFrame('near-seat')).state;
    assert.ok(Number.isInteger(reachable.nearSeat), 'A real free seat is within reach');
    if (mobile) await activate(page.getByRole('button', { name: '앉기', exact: true }));
    else await page.keyboard.press('e');
    const sitting = await state();
    assert.equal(sitting.mode, 'seat');
    assert.equal(sitting.seat, reachable.nearSeat, 'The sit input selects the advertised seat');
    assert.equal(await page.evaluate(() => window.__fp.director.occupied.has(window.__fp.director.seat.index)), false);
    report.fixtures.push('After the real sit input, director.update(2.5) finishes only the existing camera tween; the seated frame still renders normally.');
    await page.evaluate(() => { const { director, perf } = window.__fp; director.update(2.5, { time: perf.time, perf, obstacles: [] }); });
    await renderFrame('seated');
    if (mobile) await activate(page.getByRole('button', { name: '걷기', exact: true }));
    else await page.keyboard.press('e');
    const standing = (await renderFrame('stood-up')).state;
    assert.equal(standing.mode, 'walk'); assert.equal(standing.seat, null);
    report.checks.sitStand = { input: mobile ? 'touch sit -> walk buttons' : 'E -> E', seated: sitting, standing };

    const initialRoster = await page.evaluate(readRoster);
    assert.ok(initialRoster.required.length, 'Loaded score names at least one musician');
    report.fixtures.push(initialRoster.supported
      ? 'Before the real 공연 시작 click, snapRoster places only the current score track/chair roster and snapConductor completes its conductor entrance. This avoids pending exits of unrelated players while main rAF is captured; the real runConcert waits, audio start and controls remain active.'
      : 'Legacy baseline without snapRoster: snapOnstage/snapConductor finish the entrance before the real 공연 시작 click. Per-piece roster assertions are unavailable on that baseline.');
    await page.evaluate(required => {
      const { stage, perf } = window.__fp;
      if (typeof stage.snapRoster === 'function') stage.snapRoster(new Set(required));
      else stage.snapOnstage();
      stage.snapConductor(!!perf.piece.conducted);
    }, initialRoster.required);
    await activate(page.getByRole('button', { name: '공연 시작', exact: true }));
    await page.waitForFunction(() => window.__fp.perf.playing && window.__fp.phase === 'playing', null, { polling: 100, timeout: cfg.timeoutMs });
    const started = await renderFrame('show-started');
    assert.equal(started.state.audio, 'running');
    const startedRoster = await page.evaluate(readRoster);
    if (startedRoster.supported) {
      assert.deepEqual(startedRoster.active, initialRoster.required, 'Initial fixture contains exactly the score roster');
      assert.equal(startedRoster.settled, true, 'Initial score musicians are in place');
    }
    report.checks.roster = { initial: startedRoster };
    if (scope === 'transport') {
      // The reference intentionally refreshes low-quality IMAG only every 90
      // frames. Observe that cadence without making the transport-only control
      // depend on the candidate's new immediate-refresh behaviour.
      report.checks.broadcastStartObservation = {
        startedFrame: started.passes.some(p => p.kind === 'broadcast'),
        anyFrameSinceEntry: report.frames.some(f => f.passes.some(p => p.kind === 'broadcast')),
        assertion: 'NOT_RUN: outside transport scope',
      };
      report.unchecked.push('Immediate live broadcast refresh: outside transport scope');
    } else if (venue === 'sphere') {
      assert.ok(started.passes.some(p => p.kind === 'broadcast'), 'Newly visible live broadcast renders immediately');
      assert.equal(started.state.dome.live, true);
    } else {
      // Hall IMAG is already active on entry. Low quality intentionally keeps
      // its normal 90-frame cadence when the music starts; it need not redraw
      // on this exact explicit frame. Off/on refresh is asserted below.
      assert.ok(report.frames.some(f => f.passes.some(p => p.kind === 'broadcast')), 'Hall live broadcast rendered after entry');
    }
    await activate(page.locator('#btnPlay'));
    const paused = await state();
    assert.equal(paused.playing, false);
    assert.equal(await page.locator('#btnPlay').getAttribute('aria-label'), '재생');
    await page.waitForTimeout(150);
    assert.ok(Math.abs((await state()).time - paused.time) < 1e-6, 'Pause freezes playback position');
    report.checks.seek = await seekTo(22);
    await page.evaluate(startResumeTrace, { samplePeriodMs: 100, maxSamples: 64, thresholdTime: report.checks.seek.actual + 0.05 });
    const resumeStartedAt = performance.now();
    let resumeOutcome = 'failed';
    let resumeConditionAttempted = false, resumeFailure = null;
    try {
      await activate(page.locator('#btnPlay'));
      assert.equal((await state()).playing, true);
      assert.equal(await page.locator('#btnPlay').getAttribute('aria-label'), '일시정지');
      // play() schedules 120 ms ahead, and perf.time also subtracts the audio
      // device's output/base latency. Preserve the 2s condition; observe a
      // timeout rather than masking it by increasing the permitted delay.
      report.checks.resumeClock = await page.evaluate(() => {
        const { perf, engine } = window.__fp;
        window.__qaResumeTrace.sample('after-resume-click');
        return { startPos: perf.startPos, startCtx: perf.startCtx, audioNow: engine.now, outputLatency: engine.outputLatency, time: perf.time };
      });
      resumeConditionAttempted = true;
      await page.waitForFunction(seekTime => {
        const { perf, engine } = window.__fp;
        return engine.ctx.state === 'running' && perf.playing && perf.time > seekTime + 0.05;
      }, report.checks.seek.actual, { polling: 20, timeout: 2000 });
      assert.ok((await state()).time > report.checks.seek.actual + 0.05, 'Resume advances the audio clock');
      resumeOutcome = 'passed';
    } catch (error) {
      // Only the actual audio-advance condition is eligible for continuation.
      // A failed play click or unexpected UI state still stops the case.
      if (!continueOnTransportFail || !resumeConditionAttempted) throw error;
      resumeFailure = { stage: 'transport-resume', message: error.message, stack: error.stack, code: error.code, continued: true };
      report.failures.push(resumeFailure);
      report.failure ??= resumeFailure;
      try {
        report.failureState = await withTimeout(page.evaluate(readState), 'transport failure state', 5000, 'QA_DIAGNOSTIC_TIMEOUT');
      } catch (diagnosticError) {
        report.failureStateError = { message: diagnosticError.message, code: diagnosticError.code };
      }
      log(`FAIL:transport-resume:${error.message}`);
    } finally {
      const nodeElapsedMs = performance.now() - resumeStartedAt;
      try {
        report.checks.resumeTrace = await withTimeout(page.evaluate(outcome => window.__qaResumeTrace.finish(outcome), resumeOutcome), 'resume diagnostics', 5000, 'QA_DIAGNOSTIC_TIMEOUT');
        report.checks.resumeTrace.nodeElapsedMs = nodeElapsedMs;
        report.checks.resumeTrace.conditionTimeoutMs = 2000;
      } catch (error) {
        report.checks.resumeTrace = { outcome: resumeOutcome, nodeElapsedMs, conditionTimeoutMs: 2000, diagnosticError: error.message };
      }
    }
    // A diagnostic continuation must really pause before touching other
    // controls. Do not change the audio clock or call a product method here.
    if (!resumeFailure || (await state()).playing) await activate(page.locator('#btnPlay'));
    const pausedAgain = await state();
    assert.equal(pausedAgain.playing, false, 'Pause before checking other controls');
    report.checks.playback = { start: started.state, paused, resumed: resumeOutcome === 'passed', pausedAgain: !pausedAgain.playing };
    if (resumeFailure) report.transportContinuation = {
      failureIndex: report.failures.indexOf(resumeFailure), pausedBeforeContinuing: pausedAgain,
      subsequentChecksCompleted: false,
      note: 'Diagnostic continuation only. The original 2s audio-advance failure remains a failure even if later controls pass.',
    };

    if (scope === 'full') {
      if (venue === 'sphere') {
        // This piece selects FOREST3D through the normal programme/runConcert path.
        const expectedWorld = mobile ? 'FOREST' : 'FOREST3D';
        const expectedWorldId = await page.evaluate(async name => {
          const { SCENES } = await import(new URL('./js/scene/domeshow.js', location.href).href);
          return SCENES.indexOf(name);
        }, expectedWorld);
        assert.ok(expectedWorldId >= 0, 'Expected world exists in the served production scene list');
        await activate(page.getByRole('button', { name: '프로그램', exact: true }));
        await activate(page.locator('#programList button').filter({ hasText: '전주곡 C장조' }));
        await closePanel();
        await page.waitForFunction(() => window.__fp.perf.piece?.id === 'bach-prelude-c', null, { polling: 100 });
        await page.evaluate(() => window.__fp.stage.snapConductor(false));
        report.fixtures.push('For the selected Bach programme item, snapConductor(false) completes only the conductor exit animation; the programme selection and music start use real controls.');
        await page.waitForFunction(() => window.__fp.perf.playing && window.__fp.phase === 'playing', null, { polling: 100, timeout: cfg.timeoutMs });
        // The normal programme click uses quick:true and the production roster
        // planner. Do not snap the players here: observe that required chairs
        // arrived, while allowing colleagues retained for the following piece.
        const selectedRoster = await page.evaluate(readRoster);
        if (selectedRoster.supported) {
          assert.ok(selectedRoster.required.length, 'Selected score names at least one musician');
          assert.ok(selectedRoster.required.every(key => selectedRoster.active.includes(key)), 'Programme selection includes every score musician');
          assert.equal(selectedRoster.settled, true, 'Programme roster transition has completed');
        }
        assert.equal(selectedRoster.conductorOn, false, 'The Bach chamber piece has no conductor');
        report.checks.roster.selected = selectedRoster;
        await activate(page.locator('#btnPlay'));
        report.checks.worldSeek = await seekTo(24);
        await activate(page.locator('#btnPlay'));
        await renderFrame('world-transition'); // lets sphereTick request live fade-out
        // The longest startPiece reveal is 7 seconds. With main rAF captured,
        // advance the existing controller by 8 seconds to finish it explicitly.
        // update() also advances shader time and lighting state; audio time stays
        // native. Do not mistake the target-name getter for an active-scene check.
        report.fixtures.push('After the UI selects the world and seeks past the title, dome.update(8) advances the existing dome controller, including shader time and lighting, past the maximum 7-second startPiece reveal and live fade-out. It does not select a world, replace the shader, write transition uniforms directly or manually advance the audio clock.');
        await page.evaluate(() => { const { hall, perf } = window.__fp; hall.dome.update(8, { time: perf.time, playing: perf.playing }); });
        const world = await renderFrame('world-visible');
        assert.equal(world.state.piece, 'bach-prelude-c');
        assert.equal(world.state.dome.current, expectedWorld, 'Programme selects the expected world');
        assert.equal(world.state.dome.currentId, expectedWorldId, 'Expected world is the active uA scene after the transition');
        assert.equal(world.state.dome.mix, 0, 'World crossfade has completed');
        assert.equal(world.state.dome.reveal, 0, 'World roof reveal has completed');
        assert.equal(world.state.dome.live, false);
        assert.equal(world.passes.filter(p => p.kind === 'broadcast').length, 0, 'Hidden live feed is not rendered');
        if (!mobile) assert.ok(world.passes.some(p => p.kind === 'world'), 'Desktop 3D world renders');
        await activate(page.locator('#btnPlay'));
        const restored = await renderFrame('paused-live-restored');
        assert.equal(restored.state.playing, false);
        assert.equal(restored.state.dome.live, true);
        assert.ok(restored.passes.some(p => p.kind === 'broadcast'), 'Pause restores the feed on its first visible frame');
        report.checks.dome = { expected: { name: expectedWorld, id: expectedWorldId }, world: world.state.dome, restored: restored.state.dome, input: 'programme button -> seek pointer -> play/pause button' };
      }

      await settingsPanel();
      report.checks.quality = [];
      for (const quality of ['medium', 'low', 'high']) {
        await activate(page.locator(`#qualitySeg button[data-q="${quality}"]`));
        assert.equal(await page.locator(`#qualitySeg button[data-q="${quality}"]`).getAttribute('aria-pressed'), 'true');
        const rendered = await renderFrame(`quality-${quality}`);
        const s = rendered.state;
        assert.equal(s.settings.quality, quality, 'Manual quality request persists');
        assert.equal(s.render.quality, quality, 'Manual preset is not automatically lowered');
        assert.equal(s.render.scale, 1);
        assert.equal(s.render.shadows, quality !== 'low');
        // Latest main's explicit preset values, independent of the observed renderer.
        const expectedPR = quality === 'high' ? Math.min(report.checks.device.dpr, 1.5)
          : Math.min(report.checks.device.dpr, 1.25) * (quality === 'medium' ? 0.85 : 1);
        assert.equal(s.render.pixelRatio, expectedPR);
        let worldPasses;
        if (venue === 'sphere' && !mobile) {
          const size = { high: 640, medium: 512, low: 384 }[quality];
          const active = [s.dome.cubeA, s.dome.cubeB].find(c => c.id === s.dome.currentId);
          assert.equal(active?.sizes.length, 6, 'Current 3D world has six cube faces');
          // In this vendored Three version, setSize updates renderTarget.width /
          // height but leaves the six texture.image entries at their initial
          // dimensions. Those entries are metadata only; allocation uses the
          // render target dimensions. Require an actual post-resize world draw,
          // and check every target used by this completed, error-free frame.
          worldPasses = rendered.passes.filter(p => p.kind === 'world');
          assert.ok(worldPasses.length > 0, `Quality ${quality} refreshes a resized world target`);
          for (const pass of worldPasses)
            assert.deepEqual(pass.target, [size, size], `Rendered world target resized to ${size}`);
        }
        report.checks.quality.push({ requested: quality, actual: s.render, dome: s.dome, ...(worldPasses ? { worldPasses } : {}) });
      }
      await setCheckbox('optAudience', false);
      assert.equal((await state()).audience, null);
      assert.equal((await state()).settings.audience, false);
      await setCheckbox('optScreen', false);
      const screenOff = await renderFrame('audience-and-screen-off');
      assert.equal(screenOff.passes.filter(p => p.kind === 'broadcast').length, 0);
      assert.equal(screenOff.state.settings.screen, false);
      await setCheckbox('optAudience', true);
      const audienceOn = await state();
      assert.ok(audienceOn.audience > 0);
      assert.equal(audienceOn.settings.audience, true);
      await setCheckbox('optScreen', true);
      const screenOn = await renderFrame('audience-and-screen-restored');
      assert.ok(screenOn.passes.some(p => p.kind === 'broadcast'), 'Re-enabled feed refreshes immediately');
      report.checks.audience = { off: screenOff.state.audience, on: screenOn.state.audience, occupied: screenOn.state.occupied };
      report.checks.broadcastToggle = { off: screenOff.passes, on: screenOn.passes };

      await activate(page.locator('#qualitySeg button[data-q="auto"]'));
      const auto = await renderFrame('automatic-setting');
      assert.equal(auto.state.settings.quality, 'auto');
      assert.equal(auto.state.render.quality, initialQuality);
      report.checks.automatic = { requested: auto.state.settings.quality, initialPreset: auto.state.render.quality, note: 'Only the setting/reset path is checked here. Adaptation policy has separate Node regression tests; synthetic functional cadence is not evidence of automatic performance.' };
      await closePanel();
      report.checks.layout = await page.evaluate(() => ({
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        joystick: !document.getElementById('joystick').hidden, jump: !document.getElementById('jumpBtn').hidden,
      }));
      if (mobile) {
        assert.equal(report.checks.layout.joystick, true); assert.equal(report.checks.layout.jump, true);
        assert.ok(report.checks.layout.scrollWidth <= report.checks.layout.width, 'No mobile horizontal overflow');
      }
    }
    report.contextLosses = await page.evaluate(() => window.__qaContextLosses);
    assert.deepEqual(report.contextLosses, []);
    assert.equal(diagnosticsFailed(session.diagnostics), false, 'No page or console errors');
    if (report.transportContinuation) report.transportContinuation.subsequentChecksCompleted = true;
    report.status = report.failures.length ? 'FAIL' : 'PASS';
    log(`${report.status}:${scope}${report.transportContinuation ? ':continued-after-transport-failure' : ''}`);
  } catch (error) {
    report.status = 'FAIL';
    const failure = { stage: 'functional', message: error.message, stack: error.stack, code: error.code };
    report.failures.push(failure);
    if (report.failure) report.terminalFailure = failure;
    else report.failure = failure;
    // Keep the terminal state on a functional failure. A GPU timeout can
    // leave the page thread blocked, so do not queue more work in that case.
    if (page && !page.isClosed() && error.code !== 'QA_FRAME_TIMEOUT') {
      try {
        const key = report.failureState ? 'terminalFailureState' : 'failureState';
        report[key] = await withTimeout(page.evaluate(readState), 'failure state', 5000, 'QA_DIAGNOSTIC_TIMEOUT');
      } catch (diagnosticError) {
        report.failureStateError = { message: diagnosticError.message, code: diagnosticError.code };
      }
    }
    log(`FAIL:${error.message}`);
  } finally {
    // Earlier collector runs did not capture a failure PNG. This image records
    // the state at collection time; a continued transport failure may be older.
    if (report.status === 'FAIL' && page && !page.isClosed()
      && !report.failures.some(failure => failure.code === 'QA_FRAME_TIMEOUT')) {
      const screenshotPath = path.join(out, `${cfg.label}-${venue}-${device}-failure.png`);
      try {
        await fs.mkdir(out, { recursive: true });
        await withTimeout(page.screenshot({ path: screenshotPath, fullPage: false, timeout: 5000 }), 'failure screenshot', 5000, 'QA_DIAGNOSTIC_TIMEOUT');
        report.failureScreenshot = { path: screenshotPath, capturedAt: new Date().toISOString(),
          stage: report.transportContinuation?.subsequentChecksCompleted ? 'after-continuation-checks' : 'after-terminal-failure-state' };
      } catch (error) { report.failureScreenshotError = { message: error.message, code: error.code }; }
    }
    // A timed-out GPU frame may still hold the page thread. Closing the fresh
    // browser releases its input state without queuing more work on that page.
    if (!report.failures.some(failure => failure.code === 'QA_FRAME_TIMEOUT') && page && !page.isClosed()) {
      if (mobile && cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {});
      await page.keyboard.up('w').catch(() => {});
      await page.mouse.up().catch(() => {});
    }
    if (browser) await browser.close().catch(error => {
      report.status = 'FAIL';
      const failure = { stage: 'cleanup', message: `Browser cleanup: ${error.message}` };
      report.failures.push(failure);
      report.failure ??= failure;
    });
    if (session) report.errors = [
      ...session.diagnostics.pageErrors.map(message => ({ kind: 'pageerror', message })),
      ...session.diagnostics.consoleErrors.map(message => ({ kind: 'console', message })),
    ];
    await save(cfg, filename, report);
  }
  return { venue, device, scope, status: report.status, failure: report.failure?.message, failureCount: report.failures.length, continuedAfterTransportFailure: !!report.transportContinuation, file: filename };
}

const results = [];
for (const entry of cases) results.push(await runCase(entry)); // never run in parallel with another GPU workload
await save(cfg, `${cfg.label}-summary.json`, {
  schema: 2, label: cfg.label, revision: cfg.revision, scope, fixtureSourceSha256,
  diagnosticOptions: { continueOnTransportFail },
  method: 'Functional checks only; sequential explicit rendering, not an FPS benchmark.', results,
});
console.log(JSON.stringify({ status: results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL', results, output: out }));
if (results.some(r => r.status !== 'PASS')) process.exitCode = 1;
