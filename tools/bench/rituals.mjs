// Evening-ritual integration QA, recovered from the 3f checkpoint. Development tooling only; run serially.
// This file deliberately does not edit or import the measured a41 collectors.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`node tools/bench/rituals.mjs [hall|sphere] [desktop|mobile]
광장 통합 뒤 기준선과 후보의 저녁 의식 UI를 직렬로 확인해. 성능/FPS 검사는 아니야.
기본: 두 공연장 × desktop/mobile, 새 문맥에서 수동 low, 관객·효과 기본값 유지.
SCENARIO=all|foyer|recital|interval|sleep 으로 한 묶음만 다시 확인할 수 있어.
foyer는 Hall 전용이야. Sphere에서 그 항목은 NOT_APPLICABLE로 남겨.

필수 환경: BASE_URL, REVISION (연산자가 적는 commit/작업 트리 식별자)
공통 환경: OUTPUT_DIR, LABEL, PLAYWRIGHT_MODULE, CHROME_EXECUTABLE,
  CHROME_ARGS, SOFTWARE_RENDERER=1, FONT_MODE, FONT_ROOT, HEADLESS=0,
  WIDTH, HEIGHT, DPR, TIMEOUT_MS, BENCH_HELPER_ROOT
선택: EXPECTED_MAIN_SHA256 (실제로 응답한 main.js 바이트와 일치해야 해)
기본 화면: desktop 960×540 DPR1, mobile 390×844 DPR2.
TIMEOUT_MS 기본 180000. 오디오 suspend/resume clock 검사는 별도 2초 제한이야.
출력 폴더가 이미 있으면 덮어쓰지 않고 실패해. 다른 LABEL/OUTPUT_DIR을 써 줘.

실제 입력: 혼자 보기, 시작, 프로그램 선택, 좌석/일어나기, 차·소식·2부,
  예약·취소, 마우스/터치 회전과 깨우기. phase나 오디오 시계는 쓰지 않아.
명시적 fixture: 가까운 위치 배치/좌석 tween 완료, 단원 입퇴장 snap,
  intervalNow(120), 예약 취소 뒤 goToSleep(). 15분 실제 만료·자연적인
  프로그램 절반 도달·열/배터리·오디오 품질을 검증했다고 해석하면 안 돼.
메인 rAF는 기본 보류 후 예약된 콜백만 소진해. 일반 수면과 ‘수면 직전
  예약이 아직 전달되지 않은 빠른 깨우기’ 순서를 각각 검사하고, 깨우기 후
  4개 콜백은 실제 native rAF로 관찰해. 경쟁 순서의 자연 발생 빈도나 FPS로
  해석하면 안 돼.
알려진 상류 예약 선택 표시 실패도 원본 그대로 FAIL로 남겨. 이후 별도
  예약/취소/수면/깨우기 검사는 계속해도 전체 결과는 FAIL을 유지해.
--help는 Playwright를 로드하거나 브라우저를 시작하지 않아.`);
  process.exit(0);
}

assert.ok(args.length <= 2, 'Expected [hall|sphere] [desktop|mobile]');
if (args[0]) assert.ok(['hall', 'sphere'].includes(args[0]), 'Unknown venue');
if (args[1]) assert.ok(['desktop', 'mobile'].includes(args[1]), 'Unknown device');
assert.ok(process.env.BASE_URL, 'BASE_URL is required: select the pinned reference or candidate server explicitly');
assert.ok(process.env.REVISION, 'REVISION is required; the served main.js SHA256 is recorded separately');
const scenario = process.env.SCENARIO || 'all';
assert.ok(['all', 'foyer', 'recital', 'interval', 'sleep'].includes(scenario), 'Unknown SCENARIO');
const here = path.dirname(fileURLToPath(import.meta.url));
let helperRoot = process.env.BENCH_HELPER_ROOT && path.resolve(process.env.BENCH_HELPER_ROOT);
if (!helperRoot) {
  // Works in qa-3f today and beside browser.mjs if curated into tools/bench.
  try { await fs.access(path.join(here, 'browser.mjs')); helperRoot = here; }
  catch { helperRoot = path.resolve(here, '../forest-philharmonic/tools/bench'); }
}
const { appURL, config, openPage, save, sha256, sourceHashes, viewport } =
  await import(pathToFileURL(path.join(helperRoot, 'browser.mjs')).href);
const cfg = config(process.env.LABEL || 'rituals');
const fixtureSourceSha256 = sha256(await fs.readFile(fileURLToPath(import.meta.url)));
const helperSourceSha256 = sha256(await fs.readFile(path.join(helperRoot, 'browser.mjs')));
const cases = (args[0] ? [args[0]] : ['hall', 'sphere']).flatMap(venue =>
  (args[1] ? [args[1]] : ['desktop', 'mobile']).map(device => ({ venue, device })));

async function bounded(promise, label, timeoutMs = cfg.timeoutMs, code = 'QA_TIMEOUT') {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`${label}: timeout ${timeoutMs} ms exceeded`);
        error.code = code;
        reject(error);
      }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

// Only changes delivery of the app's named `frame` rAF callback. It retains
// each request/cancellation, never invokes cancelled IDs, and consumes a
// queued request before calling it. UI `draw` stays on real native rAF.
// A short, bounded native window observes actual browser delivery after wake.
function installProbe() {
  localStorage.setItem('fp-settings', JSON.stringify({ quality: 'low', audience: true }));
  let random = 417;
  Math.random = () => { random = (1664525 * random + 1013904223) >>> 0; return random / 4294967296; };
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const pending = new Map(), drawPending = new Set(), mainFunctions = new Set(), drawFunctions = new Set();
  let token = -1, mode = 'hold', runningWindow = null, sequence = 0;
  const totals = { mainRequested: 0, mainCancelled: 0, mainDelivered: 0, mainNative: 0,
    drawRequested: 0, drawCancelled: 0, drawDelivered: 0, maxMainPending: 0, maxDrawPending: 0 };
  const events = [], phases = [], contextLosses = [];
  let lastPhaseKey = null;
  const stamp = () => ({ wallTimeMs: Date.now(), performanceNowMs: performance.now(),
    visibility: document.visibilityState, asleep: !!window.__fp?.asleep });
  const event = (kind, data = {}) => {
    const row = { sequence: ++sequence, kind, ...stamp(), ...data };
    if (events.length < 3000) events.push(row);
    return row;
  };
  const counts = () => ({ ...totals, mainPending: pending.size, drawPending: drawPending.size,
    mainFunctions: mainFunctions.size, drawFunctions: drawFunctions.size, mode });
  const hold = () => {
    mode = 'hold';
    for (const request of pending.values()) {
      if (request.nativeId !== null) nativeCancel(request.nativeId);
      request.nativeId = null;
    }
  };
  const finishNative = error => {
    const run = runningWindow;
    if (!run) return;
    runningWindow = null;
    hold();
    clearTimeout(run.timer);
    const result = { started: run.started, finished: stamp(), main: run.main, draw: run.draw,
      maxMainPending: run.maxMainPending, maxDrawPending: run.maxDrawPending,
      before: run.before, after: counts(), error: error?.message || null };
    event('native-window-end', { count: run.main.length, error: result.error });
    if (error) { error.diagnostic = result; run.reject(error); }
    else run.resolve(result);
  };
  const deliver = (request, timestamp, native) => {
    if (!pending.has(request.id)) return; // a cancelled callback never executes
    pending.delete(request.id);
    request.nativeId = null;
    totals.mainDelivered++;
    if (native) totals.mainNative++;
    const row = event('main-delivery', { id: request.id, timestamp, delivery: native ? 'native' : 'controlled' });
    if (runningWindow && native) runningWindow.main.push(row);
    try { request.callback.call(window, timestamp); }
    catch (error) { event('main-error', { message: error.message }); finishNative(error); throw error; }
    if (runningWindow && native && runningWindow.main.length >= runningWindow.target) finishNative();
  };
  const scheduleNative = request => {
    if (request.nativeId === null && pending.has(request.id))
      request.nativeId = nativeRAF(timestamp => deliver(request, timestamp, true));
  };
  window.requestAnimationFrame = callback => {
    if (callback?.name === 'frame') {
      mainFunctions.add(callback);
      const request = { id: token--, callback, nativeId: null };
      pending.set(request.id, request);
      totals.mainRequested++;
      totals.maxMainPending = Math.max(totals.maxMainPending, pending.size);
      if (runningWindow) runningWindow.maxMainPending = Math.max(runningWindow.maxMainPending, pending.size);
      event('main-request', { id: request.id, pending: pending.size });
      if (mode === 'native') scheduleNative(request);
      return request.id;
    }
    if (callback?.name === 'draw') {
      drawFunctions.add(callback);
      let id;
      id = nativeRAF(timestamp => {
        drawPending.delete(id);
        totals.drawDelivered++;
        if (runningWindow) runningWindow.draw.push({ timestamp, ...stamp() });
        callback.call(window, timestamp);
      });
      drawPending.add(id);
      totals.drawRequested++;
      totals.maxDrawPending = Math.max(totals.maxDrawPending, drawPending.size);
      if (runningWindow) runningWindow.maxDrawPending = Math.max(runningWindow.maxDrawPending, drawPending.size);
      return id;
    }
    return nativeRAF(callback);
  };
  window.cancelAnimationFrame = id => {
    const request = pending.get(id);
    if (request) {
      if (request.nativeId !== null) nativeCancel(request.nativeId);
      pending.delete(id);
      totals.mainCancelled++;
      event('main-cancel', { id });
      return;
    }
    if (drawPending.delete(id)) totals.drawCancelled++;
    nativeCancel(id);
  };
  const phaseSample = () => {
    const fp = window.__fp;
    if (!fp) return;
    const state = { ...stamp(), phase: fp.phase, piece: fp.perf.piece?.id ?? null,
      playing: fp.perf.playing, recital: fp.recital?.on ?? null, interval: !!fp.interval,
      audioState: fp.engine.ctx?.state ?? null, audioNow: fp.engine.ctx?.currentTime ?? null };
    const key = JSON.stringify([state.phase, state.piece, state.playing, state.recital, state.interval, state.asleep, state.audioState]);
    if (key !== lastPhaseKey) { lastPhaseKey = key; if (phases.length < 1000) phases.push(state); }
  };
  setInterval(phaseSample, 40);
  document.addEventListener('visibilitychange', () => event('visibility-change'));
  document.addEventListener('webglcontextlost', e => contextLosses.push({ ...stamp(), message: e.statusMessage || 'context lost' }), true);
  window.__ritualProbe = {
    get pending() { return pending.size; },
    counts,
    phases,
    mark: label => { phaseSample(); return event('mark', { label }); },
    dump: () => ({ counts: counts(), events, phases, contextLosses,
      limits: { events: 3000, phases: 1000, eventsTruncated: sequence > events.length } }),
    step() {
      if (mode !== 'hold') throw new Error('Controlled frame requested inside native window');
      if (document.hidden) throw new Error('Hidden page is not a valid functional rendering sample');
      const batch = [...pending.values()];
      return new Promise((resolve, reject) => nativeRAF(timestamp => {
        try {
          const before = counts();
          for (const request of batch) deliver(request, timestamp, false);
          phaseSample();
          resolve({ before, after: counts(), callbackCount: totals.mainDelivered - before.mainDelivered, timestamp });
        } catch (error) { reject(error); }
      }));
    },
    nativeFrames(target, timeoutMs) {
      if (runningWindow || mode !== 'hold') throw new Error('Native window already active');
      if (document.hidden || window.__fp?.asleep) throw new Error('Native wake observation requires an awake visible page');
      if (!pending.size) throw new Error('Wake did not schedule a main frame');
      return new Promise((resolve, reject) => {
        runningWindow = { target, resolve, reject, main: [], draw: [], started: stamp(), before: counts(),
          maxMainPending: pending.size, maxDrawPending: drawPending.size,
          timer: setTimeout(() => finishNative(new Error(`Native wake window timed out after ${timeoutMs} ms`)), timeoutMs) };
        event('native-window-start', { target });
        mode = 'native';
        for (const request of pending.values()) scheduleNative(request);
      });
    },
  };
}

function readState() {
  const fp = window.__fp;
  if (!fp) return { ready: false, visibility: document.visibilityState };
  const { director: d, camera: c, engine: e, perf: p, stage, hall, audience, recital, settings } = fp;
  const seat = s => s ? { index: s.index, label: s.label, stage: !!s.stage, turner: !!s.turner,
    off: !!s.off, identityMatchesList: hall.seats[s.index] === s } : null;
  const pose = window.__ritualListener;
  const forward = c.position.clone().set(0, 0, -1).applyQuaternion(c.quaternion);
  const up = c.position.clone().set(0, 1, 0).applyQuaternion(c.quaternion);
  const original = window.__ritualOriginalSeats || [];
  return {
    ready: true, at: { wallTimeMs: Date.now(), performanceNowMs: performance.now(), visibility: document.visibilityState },
    phase: fp.phase, piece: p.piece?.id ?? null, title: p.piece?.titleKo ?? null,
    playing: p.playing, time: p.time, duration: p.duration,
    audio: { state: e.ctx?.state, now: e.ctx?.currentTime, outputLatency: e.ctx ? e.outputLatency : null },
    mode: d.mode, active: d.active, seat: seat(d.seat), nearSeat: seat(d.nearSeat),
    position: d.pos.toArray(), camera: c.position.toArray(), forward: forward.toArray(), up: up.toArray(),
    yaw: d.yaw, pitch: d.pitch, fov: d.fov, listener: pose || null,
    totalSeats: hall.seats.length, regularSeats: hall.seats.filter(s => !s.stage).length,
    stageSeats: hall.seats.filter(s => s.stage).length,
    originalRegularSeatIdentity: original.every(s => hall.seats[s.index] === s),
    seatPickCount: hall.seatMesh?.count ?? null,
    seatGroupVisible: hall.seatGroup?.visible ?? null,
    audience: audience ? { count: audience.count, visible: audience.group.visible } : null,
    recital: recital ? { on: recital.on, seats: recital.seats.map(seat) } : null,
    interval: fp.interval ? { ...fp.interval } : null,
    practice: { on: !!fp.practice?.on }, asleep: fp.asleep,
    bear: (() => { const w = stage.walkers.find(w => w.player.sid === 'vc' && w.player.ci === 0);
      return w ? { state: w.state, leaving: w.leaving, position: w.pos.toArray(), visible: w.char.root.visible } : null; })(),
    conductor: { on: stage.conductorOn, state: stage.conductor.state },
    travelling: stage.walkers.filter(w => w.state === 'queued' || w.state === 'walking' || w.leaving)
      .map(w => ({ key: `${w.player.sid}:${w.player.ci}`, state: w.state, leaving: w.leaving })),
    settings: { quality: settings.quality, audience: settings.audience, interval: settings.interval,
      screen: settings.screen, fx: settings.fx, lasers: settings.lasers, fixedEar: settings.fixedEar },
    render: { preset: fp.quality ?? fp.stats?.quality ?? null, scale: fp.stats?.renderScale ?? null,
      pixelRatio: fp.renderer.getPixelRatio(), mainPasses: window.__ritualRender?.main ?? null },
    scheduler: window.__ritualProbe.counts(),
  };
}

// The real orchestration still owns phase and perf.play(). Only physical
// travel completion is accelerated; no timer, music clock or hush is replaced.
async function settleStage() {
  const { SECTIONS } = await import(new URL('./js/layout.js', location.href).href);
  const { stage, perf } = window.__fp;
  const required = new Set();
  for (const track of perf.piece?.tracks || [])
    for (const chair of track.chairs || SECTIONS[track.section]?.chairs.map((_, i) => i) || [])
      required.add(`${track.section}:${chair}`);
  const before = stage.walkers.map(w => ({ key: `${w.player.sid}:${w.player.ci}`, state: w.state, leaving: w.leaving }));
  const retained = new Set(before.filter(w => w.state !== 'off' && w.state !== 'away' && !w.leaving).map(w => w.key));
  for (const key of required) retained.add(key);
  stage.snapRoster(retained);
  stage.snapConductor(!!perf.piece.conducted);
  return { piece: perf.piece.id, required: [...required], retained: [...retained], before,
    method: 'Complete only existing musician/conductor travel with snapRoster/snapConductor; do not assign phase or playback state.' };
}

function sameVector(a, b, tolerance = 1e-7) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && Math.hypot(...a.map((x, i) => x - b[i])) < tolerance;
}

async function runCase({ venue, device }) {
  const mobile = device === 'mobile';
  const size = viewport(device, mobile ? { width: 390, height: 844 } : { width: 960, height: 540 });
  const stem = `${cfg.label}-${venue}-${device}`;
  const caseDir = path.join(cfg.outputDir, stem);
  await fs.mkdir(cfg.outputDir, { recursive: true });
  await fs.mkdir(caseDir); // never overwrite an earlier result
  const requested = ['foyer', 'recital', 'interval', 'sleep'].filter(x => scenario === 'all' || scenario === x);
  const report = {
    schema: 1, suite: 'evening-rituals-functional', venue, device, scenario,
    label: cfg.label, revision: cfg.revision, status: 'RUNNING', startedAt: new Date().toISOString(),
    url: appURL(cfg.baseURL, venue), fixtureSourceSha256, helperSourceSha256,
    viewport: [size.width, size.height], devicePixelRatio: size.dpr, initialQuality: 'low',
    timeoutMs: cfg.timeoutMs, audioStateTimeoutMs: 2000,
    method: 'Real UI/input and native audio/phase; held main rAF consumes queued requests; four real native main callbacks after each wake. Functional observations only; no FPS, thermal or sound-quality claim.',
    fixtures: [
      'Fresh context, Math.random seed 417, manual low and audience enabled. Other app feature defaults remain active.',
      'Main rAF delivery is held. Each requested callback gets a unique ID; cancellation removes it, and controlled delivery consumes it before invocation. UI draw stays native.',
      'director.placeAt skips a long walk to the foyer/one free original seat; actual drag, sit and stand controls are retained.',
      'director.update(2.5) completes only an already initiated seat-camera tween.',
      'stage.snapRoster/snapConductor complete travel around real start/second-half UI. Actual phase transitions, hush timers and audio clock are unchanged.',
      'intervalNow(120) starts the existing interval boundary; goToSleep() starts the sleep boundary only after actual timer cancellation.',
    ],
    unchecked: ['Natural programme-half arrival', 'Actual 15-minute timer expiry/fade/exit sequence',
      'Long-run/native app FPS or thermal/battery behaviour', 'Audible fidelity or instrument/listener audio accuracy',
      'All rAF lifecycle races outside the recorded short windows', 'Multiplayer host/guest sleep handoff',
      'Probabilistic seat-thief encounter', 'Full natural musician entrance/exit walking trajectories'],
    groups: Object.fromEntries(requested.map(name => [name, { status: 'NOT_RUN' }])),
    checks: [], fixturesApplied: [], states: [], frames: [], nativeWindows: [], screenshots: [], failures: [],
  };
  let session, page, browser, cdp, currentStage = 'initialization', frameTimedOut = false;
  const persist = () => fs.writeFile(path.join(caseDir, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  const log = async (stage, detail = {}) => {
    currentStage = stage;
    const row = { at: new Date().toISOString(), venue, device, stage, ...detail };
    console.log(JSON.stringify(row));
    await fs.appendFile(path.join(caseDir, 'events.jsonl'), JSON.stringify(row) + '\n');
  };
  const check = (name, pass, evidence, { fatal = true, classification = null } = {}) => {
    const row = { name, pass: !!pass, evidence, classification };
    report.checks.push(row);
    if (!pass) {
      const failure = { stage: currentStage, message: name, classification, evidence };
      report.failures.push(failure);
      if (fatal) { const e = new Error(name); e.alreadyRecorded = true; throw e; }
    }
  };
  const state = async label => {
    const value = await bounded(page.evaluate(readState), label);
    report.states.push({ label, ...value });
    return value;
  };
  const screenshot = async label => {
    const filename = `${String(report.screenshots.length + 1).padStart(2, '0')}-${label}.png`;
    const bytes = await bounded(page.screenshot({ path: path.join(caseDir, filename), timeout: 15000 }), `screenshot:${label}`, 16000);
    const item = { label, file: filename, sha256: sha256(bytes) };
    report.screenshots.push(item);
    return item;
  };
  const fixture = async (name, fn, argument) => {
    const result = await bounded(page.evaluate(fn, argument), `fixture:${name}`);
    report.fixturesApplied.push({ name, at: new Date().toISOString(), result });
    return result;
  };
  try {
    await persist();
    await log('launch');
    session = await openPage(cfg, device, size);
    ({ page, browser, cdp } = session);
    report.environment = session.environment;
    report.diagnostics = session.diagnostics;
    report.sourceHashes = await sourceHashes(page, cfg.baseURL);
    for (const name of ['js/ui.js', 'js/evening.js', 'js/scene/recital.js', 'js/scene/stage.js']) {
      const response = await page.request.get(new URL(name, cfg.baseURL).href);
      report.sourceHashes[name] = response.ok() ? { sha256: sha256(await response.body()) } : { httpStatus: response.status() };
    }
    report.mainSha256 = report.sourceHashes['js/main.js']?.sha256;
    check('Original served main.js has a recorded SHA256', /^[0-9a-f]{64}$/.test(report.mainSha256 || ''), report.sourceHashes['js/main.js']);
    if (process.env.EXPECTED_MAIN_SHA256)
      check('Expected served main.js SHA256 matches', report.mainSha256 === process.env.EXPECTED_MAIN_SHA256, { expected: process.env.EXPECTED_MAIN_SHA256, actual: report.mainSha256 });
    await page.addInitScript(installProbe);
    const activate = locator => mobile ? locator.tap() : locator.click();
    const settingsPanel = async () => {
      if (await page.locator('#panel').isHidden() || await page.locator('[data-body="settings"]').isHidden())
        await activate(page.getByRole('button', { name: '설정', exact: true }));
    };
    const closePanel = async () => { if (await page.locator('#panel').isVisible()) await activate(page.locator('#panelClose')); };
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type,
      touchPoints: points.map(p => ({ id: 1, radiusX: 1, radiusY: 1, force: 1, ...p })) });
    const render = async (label, { asleep = false } = {}) => {
      await log(`frame:${label}`);
      let result;
      try {
        result = await bounded(page.evaluate(async () => {
          const probe = window.__ritualProbe, fp = window.__fp;
          const beforePass = window.__ritualRender.main;
          const scheduling = await probe.step();
          const gl = fp.renderer.getContext();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
          const errors = [];
          for (let n = 0; n < 16; n++) { const e = gl.getError(); if (e === gl.NO_ERROR) break; errors.push(e); }
          return { scheduling, mainPasses: window.__ritualRender.main - beforePass,
            glErrors: errors, contextLost: gl.isContextLost() };
        }), `render:${label}`, cfg.timeoutMs, 'QA_FRAME_TIMEOUT');
      } catch (error) { if (error.code === 'QA_FRAME_TIMEOUT') frameTimedOut = true; throw error; }
      const observed = await state(label);
      report.frames.push({ label, ...result, stateIndex: report.states.length - 1 });
      check(`${label}: no WebGL error/context loss`, !result.contextLost && result.glErrors.length === 0, result);
      check(`${label}: single named main callback`, result.scheduling.after.mainFunctions === 1, result.scheduling);
      check(`${label}: main delivery matches awake/asleep state`, asleep ? result.mainPasses === 0 : result.scheduling.callbackCount === 1 && result.mainPasses > 0, result);
      check(`${label}: regular seat identity remains intact`, observed.originalRegularSeatIdentity, { seatCount: observed.regularSeats, pickCount: observed.seatPickCount });
      return observed;
    };
    const listenerCheck = (value, label) => check(`${label}: listener target follows current camera`,
      sameVector(value.listener?.position, value.camera) && sameVector(value.listener?.forward, value.forward) && sameVector(value.listener?.up, value.up),
      { listener: value.listener, camera: value.camera, forward: value.forward, up: value.up });
    const finishSeatTween = () => fixture('finish-current-seat-camera-tween', () => {
      const { director, perf } = window.__fp;
      const before = !!director.anim;
      director.update(2.5, { time: perf.time, perf, obstacles: [] });
      return { before, after: !!director.anim, mode: director.mode, seat: director.seat?.index };
    });
    const pause = async label => {
      if (await page.evaluate(() => window.__fp.perf.playing)) await activate(page.locator('#btnPlay'));
      const value = await state(label);
      check(`${label}: actual pause control leaves playback paused`, value.playing === false, { playing: value.playing, time: value.time });
      return value;
    };
    const awaitPlaying = async (label, { hush, afterMark }) => {
      const deadline = performance.now() + cfg.timeoutMs;
      let renderedHush = false, last;
      while (performance.now() < deadline) {
        last = await page.evaluate(readState);
        if (last.phase === 'hush') {
          check(`${label}: hush precedes playback`, last.playing === false, last);
          if (!renderedHush) { await render(`${label}-hush`); renderedHush = true; }
        }
        if (last.phase === 'playing' && last.playing) break;
        if (last.travelling.length || ['queued', 'walking'].includes(last.conductor.state))
          await fixture(`${label}-finish-stage-travel`, settleStage);
        await page.waitForTimeout(80);
      }
      check(`${label}: original runConcert reaches playing`, last?.phase === 'playing' && last?.playing, last);
      const trace = await page.evaluate(mark => window.__ritualProbe.phases.filter(x => x.performanceNowMs >= mark.performanceNowMs), afterMark);
      if (hush) check(`${label}: hush observed without forcing phase`, trace.some(x => x.phase === 'hush' && !x.playing), trace);
      await pause(`${label}-paused-through-ui`);
      await render(`${label}-settled`);
      return trace;
    };
    const selectPiece = async (id, label) => {
      const response = await page.request.get(new URL(`music/${id}.json`, cfg.baseURL).href);
      check(`${label}: score metadata is available`, response.ok(), { id, status: response.status() });
      const score = await response.json();
      await fixture(`${label}-conductor-travel-preparation`, conducted => {
        window.__fp.stage.snapConductor(conducted);
        return { conducted, method: 'Conductor entrance/exit only, before a real programme selection.' };
      }, !!score.conducted);
      const mark = await page.evaluate(label => window.__ritualProbe.mark(label), label);
      await activate(page.getByRole('button', { name: '프로그램', exact: true }));
      const button = page.locator('#programList button').filter({ has: page.locator('.p-title', { hasText: score.titleKo }) });
      check(`${label}: exactly one actual programme button`, await button.count() === 1, { id, title: score.titleKo, matches: await button.count() });
      await activate(button);
      await closePanel();
      await page.waitForFunction(id => window.__fp.perf.piece?.id === id, id, { polling: 80, timeout: cfg.timeoutMs });
      const trace = await awaitPlaying(label, { hush: false, afterMark: mark });
      check(`${label}: selected score is active`, (await page.evaluate(readState)).piece === id, { id, trace });
      return { id, title: score.titleKo, trace };
    };
    const runGroup = async (name, operation) => {
      if (!requested.includes(name)) return;
      const group = report.groups[name];
      if (name === 'foyer' && venue === 'sphere') {
        Object.assign(group, { status: 'NOT_APPLICABLE', reason: 'The upstream interiorCull/foyer path is Hall only.' });
        await persist(); return;
      }
      const beforeFailures = report.failures.length;
      group.status = 'RUNNING'; group.startedAt = new Date().toISOString();
      await log(`group:${name}`);
      try {
        group.evidence = await operation();
        group.status = report.failures.length === beforeFailures ? 'PASS' : 'FAIL';
        group.screenshot = await screenshot(`${name}-completed`);
      } catch (error) { group.status = 'FAIL'; group.error = { message: error.message, stack: error.stack, code: error.code }; throw error; }
      finally { group.finishedAt = new Date().toISOString(); await persist(); }
    };

    await page.goto(report.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fp && !document.getElementById('enterBtn').disabled && window.__ritualProbe.pending > 0,
      null, { timeout: cfg.timeoutMs, polling: 100 });
    await page.evaluate(() => {
      const fp = window.__fp;
      if (!fp.recital || !fp.intervalNow || !fp.goToSleep || !fp.stage.snapRoster)
        throw new Error('This tool requires the evening-ritual APIs on both reference and candidate');
      window.__ritualOriginalSeats = fp.hall.seats.filter(s => !s.stage);
      const originalRender = fp.renderer.render;
      window.__ritualRender = { main: 0, total: 0 };
      fp.renderer.render = function(scene, camera) {
        window.__ritualRender.total++;
        if (scene === fp.scene && camera === fp.camera) window.__ritualRender.main++;
        return originalRender.apply(this, arguments);
      };
      const originalListener = fp.engine.setListener;
      fp.engine.setListener = function(position, forward, up) {
        const result = originalListener.apply(this, arguments);
        window.__ritualListener = { position: position.toArray(), forward: forward.toArray(), up: up.toArray() };
        return result;
      };
    });
    report.device = await page.evaluate(() => ({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints,
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio, visibility: document.visibilityState }));
    check('Requested touch/desktop surface is available', !mobile || report.device.maxTouchPoints > 0, report.device);
    if (await page.locator('#lbAnimal').count()) {
      const identity = await page.evaluate(() => ({
        stored: JSON.parse(localStorage.getItem('fp-identity') || 'null'),
        label: document.getElementById('lbAnimal').textContent,
        selectorCount: document.querySelectorAll('select#lbAvatar').length,
      }));
      check('The fixed plaza animal is preserved in the lobby', !!identity.stored?.avatar && !!identity.label.trim() && identity.selectorCount === 0, identity);
    }
    await activate(page.getByRole('button', { name: '혼자 보기', exact: true }));
    await page.waitForFunction(() => !document.getElementById('splash') && window.__fp.director.active,
      null, { polling: 80, timeout: cfg.timeoutMs });
    await page.waitForFunction(() => window.__fp.engine.ctx.state === 'running', null, { polling: 50, timeout: cfg.timeoutMs });
    const entry = await render('entered');
    check('Manual low is the actual boot setting', entry.settings.quality === 'low' && entry.render.preset === 'low', entry.render);
    check('Audience and stage features are retained', entry.audience?.count > 0 && entry.settings.audience && entry.stageSeats > 0,
      { audience: entry.audience, stageSeats: entry.stageSeats, settings: entry.settings });
    check('Recital chairs start disabled', entry.recital.seats.every(s => s.off) && !entry.recital.on, entry.recital);
    listenerCheck(entry, 'entry');

    await runGroup('foyer', async () => {
      const placement = await fixture('foyer-outward-placement', async () => {
        const { HALL, LEVELS } = await import(new URL('./js/scene/hallplan.js', location.href).href);
        const { director: d, camera: c } = window.__fp;
        d.setMode('walk');
        const z = HALL.back + 8.9;
        d.placeAt(c.position.clone().set(0, LEVELS[0], z), c.position.clone().set(0, LEVELS[0] + 1.6, z + 10));
        return { x: 0, feet: LEVELS[0], z, look: 'away from hall doors', method: 'Skip the long entry walk only.' };
      });
      const outward = await render('foyer-away');
      check('Foyer outward view hides both ancestor groups', outward.seatGroupVisible === false && outward.audience?.visible === false, outward);
      await screenshot('foyer-away');
      const drags = [];
      for (let attempt = 0; attempt < 12; attempt++) {
        const angle = await page.evaluate(() => {
          const d = window.__fp.director;
          const delta = Math.atan2(Math.sin(-d.yaw), Math.cos(-d.yaw));
          return { delta, fov: d.fov, yaw: d.yaw };
        });
        if (Math.abs(angle.delta) < 0.025) break;
        const drag = await page.evaluate(({ delta, fov }) => {
          const canvas = window.__fp.renderer.domElement;
          const max = innerWidth * 0.42;
          const dx = Math.max(-max, Math.min(max, -delta / ((fov / 64) * 0.0042)));
          for (const fy of [0.40, 0.48, 0.32]) {
            const x = dx < 0 ? innerWidth * 0.74 : innerWidth * 0.26, y = innerHeight * fy;
            if (document.elementFromPoint(x, y) === canvas && document.elementFromPoint(x + dx, y) === canvas) return { x, y, dx };
          }
          throw new Error('No unobstructed real drag path in the foyer');
        }, angle);
        if (mobile) {
          await touch('touchStart', [{ x: drag.x, y: drag.y }]);
          for (let i = 1; i <= 4; i++) await touch('touchMove', [{ x: drag.x + drag.dx * i / 4, y: drag.y }]);
          await touch('touchEnd', []);
        } else {
          await page.mouse.move(drag.x, drag.y); await page.mouse.down();
          await page.mouse.move(drag.x + drag.dx, drag.y, { steps: 4 }); await page.mouse.up();
        }
        drags.push({ input: mobile ? 'CDP real touch drag' : 'real mouse drag', before: angle, ...drag });
      }
      const inward = await render('foyer-doors-restored');
      check('Real drag faces the doors again', Math.abs(Math.atan2(Math.sin(inward.yaw), Math.cos(inward.yaw))) < 0.05, { outward: outward.yaw, inward: inward.yaw, drags });
      check('Foyer inward view restores both ancestor groups', inward.seatGroupVisible === true && inward.audience?.visible === true, inward);
      listenerCheck(inward, 'foyer return');
      return { placement, outward, inward, drags };
    });

    // An actual regular-seat input establishes the return destination used by
    // closeRecital. This also checks E/touch seating after Hall culling restores.
    await log('regular-seat');
    await fixture('regular-seat-reachability', () => {
      const { hall, director: d, camera: c } = window.__fp;
      d.setMode('walk');
      const free = hall.seats.filter(s => !s.stage && !s.off && !d.occupied.has(s.index));
      const seat = free.filter(s => Math.abs(s.x) < 3).sort((a, b) => a.y - b.y || a.z - b.z)[0] || free[0];
      if (!seat) throw new Error('No unoccupied original seat');
      d.placeAt(c.position.clone().set(seat.x, seat.y, seat.z + 0.5), c.position.clone().set(seat.x, seat.y + 1, seat.z - 1));
      return { index: seat.index, label: seat.label };
    });
    const near = await render('near-original-seat');
    check('Original seat is reachable', Number.isInteger(near.nearSeat?.index) && !near.nearSeat.stage && !near.nearSeat.off, near.nearSeat);
    if (mobile) await activate(page.getByRole('button', { name: '앉기', exact: true }));
    else await page.keyboard.press('e');
    const seated = await state('original-seat-selected');
    check('Actual E/touch selects the advertised original seat', seated.mode === 'seat' && seated.seat?.index === near.nearSeat.index && !seated.seat.stage, seated.seat);
    const originalSeatIndex = seated.seat.index;
    await finishSeatTween();
    listenerCheck(await render('original-seat-settled'), 'original seat');

    if (requested.some(name => name !== 'foyer')) {
      await fixture('initial-current-roster-travel', settleStage);
      const startMark = await page.evaluate(() => window.__ritualProbe.mark('actual-show-start'));
      await activate(page.getByRole('button', { name: '공연 시작', exact: true }));
      report.initialCeremony = await awaitPlaying('initial-show', { hush: true, afterMark: startMark });
    }

    await runGroup('recital', async () => {
      const selection = await selectPiece('beethoven-fur-elise', 'piano-recital');
      const open = await state('recital-open');
      check('Piano selection opens actual recital chairs', open.recital.on && open.recital.seats.every(s => !s.off), open.recital);
      check('Both stage and page-turner seats exist', open.recital.seats.some(s => !s.turner) && open.recital.seats.some(s => s.turner), open.recital.seats);
      await activate(page.locator('#recitalStage'));
      const stageSeat = await state('stage-seat-selected');
      check('Stage-seat button selects a non-turner recital seat', stageSeat.mode === 'seat' && stageSeat.seat?.stage && !stageSeat.seat.turner && stageSeat.seat.identityMatchesList, stageSeat.seat);
      await finishSeatTween();
      listenerCheck(await render('stage-seat-view'), 'stage seat');
      await screenshot('recital-stage-seat');
      if (mobile) await activate(page.getByRole('button', { name: '걷기', exact: true }));
      else await page.keyboard.press('e');
      const standing = await render('stage-seat-stood-up');
      check('Actual E/walk leaves the stage chair', standing.mode === 'walk' && standing.seat === null, standing);
      await activate(page.locator('#recitalTurner'));
      const turner = await state('turner-seat-selected');
      check('Page-turner button selects its own appended seat', turner.mode === 'seat' && turner.seat?.stage && turner.seat.turner && turner.seat.identityMatchesList, turner.seat);
      await finishSeatTween();
      listenerCheck(await render('turner-seat-view'), 'page turner');
      await screenshot('recital-turner-seat');
      const exitSelection = await selectPiece('beethoven-ode-to-joy', 'exit-recital');
      await finishSeatTween();
      const returned = await render('recital-original-seat-returned');
      check('Non-recital selection disables all appended seats', !returned.recital.on && returned.recital.seats.every(s => s.off), returned.recital);
      check('Recital exit restores the remembered original seat', returned.mode === 'seat' && returned.seat?.index === originalSeatIndex && !returned.seat.stage, { expected: originalSeatIndex, actual: returned.seat });
      listenerCheck(returned, 'recital return');
      return { selection, stageSeat, standing, turner, exitSelection, returned };
    });

    await runGroup('interval', async () => {
      if (await page.evaluate(() => window.__fp.perf.piece.id !== 'beethoven-ode-to-joy'))
        await selectPiece('beethoven-ode-to-joy', 'interval-starting-piece');
      await settingsPanel();
      await activate(page.locator('#intervalSeg button[data-min="2"]'));
      check('Real interval setting selects two minutes', await page.evaluate(() => window.__fp.settings.interval) === 2,
        { setting: await page.evaluate(() => window.__fp.settings.interval) });
      await closePanel();
      const boundary = await fixture('debug-interval-boundary-120s', () => {
        window.__fp.intervalNow(120);
        return { phase: window.__fp.phase, interval: { ...window.__fp.interval }, method: 'Boundary fixture, not natural programme-half arrival.' };
      });
      check('Existing interval boundary pauses and shows interval UI',
        await page.evaluate(() => window.__fp.phase === 'interval' && !window.__fp.perf.playing && !!window.__fp.interval && !document.getElementById('intervalChip').hidden), boundary);
      await fixture('interval-exit-travel-completion', sphere => {
        const { stage } = window.__fp;
        const before = stage.walkers.filter(w => w.state !== 'off').map(w => ({ key: `${w.player.sid}:${w.player.ci}`, state: w.state, leaving: w.leaving }));
        stage.snapRoster(new Set(sphere ? ['vc:0'] : []));
        stage.snapConductor(false);
        return { before, remaining: sphere ? ['vc:0'] : [], method: 'Complete departures; Sphere cellist remains at its own chair.' };
      }, venue === 'sphere');
      await render('interval-musicians-away');
      await page.waitForFunction(() => window.__fp.practice.on, null, { timeout: cfg.timeoutMs, polling: 80 });
      const practicing = await render('interval-practice');
      check('Practice uses the venue-specific cellist location', practicing.practice.on && practicing.bear?.state === (venue === 'hall' ? 'away' : 'seated'), practicing.bear);
      await activate(page.locator('#intervalTea'));
      check('Tea button acknowledges the real input', await page.locator('#intervalTea').getAttribute('aria-pressed') === 'true', { text: await page.locator('#intervalTea').textContent() });
      await activate(page.locator('#intervalNews'));
      await page.locator('#news').waitFor({ state: 'visible' });
      check('News dialog contains actual programme entries', await page.locator('#newsList li').count() > 0, { entries: await page.locator('#newsList li').allTextContents() });
      await screenshot('interval-news');
      await activate(page.locator('#newsClose'));
      check('News close is a real UI dismissal', await page.locator('#news').isHidden(), null);
      const mark = await page.evaluate(() => window.__ritualProbe.mark('actual-second-half-click'));
      await activate(page.locator('#intervalGo'));
      const closed = await state('interval-closed-by-button');
      check('Second-half input stops practice and returns borrowed cellist', closed.interval === null && !closed.practice.on && closed.bear?.state !== 'away', closed);
      const trace = await awaitPlaying('second-half', { hush: true, afterMark: mark });
      const resumed = await state('second-half-settled');
      check('Second half retains normal seat identity and closes interval', !resumed.interval && !resumed.practice.on && resumed.originalRegularSeatIdentity && resumed.bear?.state !== 'away', resumed);
      return { boundary, practicing, closed, trace, resumed };
    });

    await runGroup('sleep', async () => {
      await pause('before-sleep-reservation');
      await settingsPanel();
      await activate(page.locator('#sleepSeg button[data-min="15"]'));
      const pressed = await page.locator('#sleepSeg button[data-min="15"]').getAttribute('aria-pressed');
      // Keep the existing upstream display defect visible. It is independent
      // of countdown/cancel/wake and must not erase the remaining evidence.
      check('15-minute reservation remains selected in the UI', pressed === 'true',
        { expected: 'true', actual: pressed, source: 'main sleep handler calls ui.setSleepLeft(0), which resets the selection' },
        { fatal: false, classification: 'known-upstream-sleep-selection-display' });
      await page.waitForFunction(() => /\d+분 \d+초 뒤에 멈춰요/.test(document.getElementById('sleepText').textContent), null, { timeout: 3000, polling: 50 });
      const countdown = await page.locator('#sleepText').textContent();
      check('Actual timer starts a countdown', /(?:14|15)분 \d+초 뒤에 멈춰요/.test(countdown), { countdown });
      await screenshot('sleep-reservation-display');
      await activate(page.locator('#sleepSeg button[data-min="0"]'));
      const cancelledText = await page.locator('#sleepText').textContent();
      check('Cancel restores the actual reservation UI', await page.locator('#sleepSeg button[data-min="0"]').getAttribute('aria-pressed') === 'true' && !/\d+분 \d+초 뒤에 멈춰요/.test(cancelledText), { cancelledText });
      await page.waitForTimeout(1150); // one real timer tick proves the old countdown does not return
      check('Cancelled timer stays cancelled on the next real tick', await page.locator('#sleepText').textContent() === cancelledText, { text: await page.locator('#sleepText').textContent() });
      await closePanel();
      const cycles = [];
      for (let cycle = 0; cycle < 2; cycle++) {
        const rapid = cycle === 1;
        const before = await state(`sleep-${cycle}-before`);
        if (rapid) report.fixturesApplied.push({ name: 'rapid-wake-request-order', at: new Date().toISOString(),
          result: { method: 'Keep the already queued main callback undelivered across sleep and the real wake input. This explicitly chooses a possible scheduling order; it does not measure its natural occurrence rate.', pendingBeforeSleep: before.scheduler.mainPending } });
        const boundary = await fixture(`debug-sleep-boundary-${cycle}`, () => {
          window.__fp.goToSleep();
          return { asleep: window.__fp.asleep, scheduler: window.__ritualProbe.counts(), method: 'Immediate sleep boundary, after real reservation cancellation.' };
        });
        check(`Sleep ${cycle}: cancellation permits the real sleep boundary`, boundary.asleep === true, boundary);
        await page.waitForFunction(() => window.__fp.engine.ctx.state === 'suspended', null, { polling: 20, timeout: 2000 });
        check(`Sleep ${cycle}: veil is visible`, await page.locator('#sleepVeil').isVisible(), null);
        // Ordinary cycle: a legacy pending callback can deliver once and
        // return at the asleep guard. Rapid cycle: deliberately preserve that
        // request order until the actual wake input, then observe native
        // delivery. Never call a cancelled callback to manufacture a chain.
        const parked = rapid ? await state(`sleep-${cycle}-undelivered-request`) : await render(`sleep-${cycle}-parked`, { asleep: true });
        await page.waitForTimeout(120); // native UI draw can drain its final scheduled callback
        const settled = await state(`sleep-${cycle}-settled`);
        check(`Sleep ${cycle}: no main callback remains scheduled`, settled.scheduler.mainPending === 0, settled.scheduler,
          { fatal: !rapid, classification: rapid ? 'controlled-rapid-wake-scheduling-order' : null });
        check(`Sleep ${cycle}: UI draw chain is parked`, settled.scheduler.drawPending === 0, settled.scheduler);
        const clocks = await page.evaluate(async () => {
          const fp = window.__fp;
          const before = { audio: fp.engine.ctx.currentTime, main: window.__ritualRender.main, scheduler: window.__ritualProbe.counts() };
          await new Promise(resolve => setTimeout(resolve, 120));
          return { before, after: { audio: fp.engine.ctx.currentTime, main: window.__ritualRender.main, scheduler: window.__ritualProbe.counts() } };
        });
        check(`Sleep ${cycle}: suspended audio and both draw chains stay still`,
          clocks.after.audio === clocks.before.audio && clocks.after.main === clocks.before.main && clocks.after.scheduler.drawDelivered === clocks.before.scheduler.drawDelivered, clocks);
        await screenshot(`sleep-${cycle}-veil`);
        if (mobile || cycle === 1) await activate(page.locator('#sleepVeil'));
        else await page.keyboard.press('Shift');
        await page.waitForFunction(() => !window.__fp.asleep && window.__fp.engine.ctx.state === 'running', null, { polling: 20, timeout: 2000 });
        check(`Wake ${cycle}: real input dismisses the veil`, await page.locator('#sleepVeil').isHidden(), { input: mobile || cycle === 1 ? (mobile ? 'touch' : 'mouse click') : 'Shift key' });
        const startAudio = await page.evaluate(() => window.__fp.engine.ctx.currentTime);
        await page.waitForFunction(t => window.__fp.engine.ctx.state === 'running' && window.__fp.engine.ctx.currentTime > t + 0.02,
          startAudio, { polling: 20, timeout: 2000 });
        const waking = await state(`wake-${cycle}-scheduled`);
        check(`Wake ${cycle}: exactly one main callback is pending`, waking.scheduler.mainPending === 1, waking.scheduler,
          { fatal: !rapid, classification: rapid ? 'controlled-rapid-wake-scheduling-order' : null });
        const native = await bounded(page.evaluate(timeout => window.__ritualProbe.nativeFrames(4, timeout), cfg.timeoutMs),
          `wake-${cycle}-native-window`, cfg.timeoutMs + 1000, 'QA_FRAME_TIMEOUT');
        report.nativeWindows.push({ cycle, interleaving: rapid ? 'explicit-undelivered-request-across-sleep-wake' : 'ordinary-drained-sleep-wake', ...native });
        const duplicates = rows => rows.length !== new Set(rows.map(x => x.timestamp)).size;
        check(`Wake ${cycle}: four native main frames use a single request chain`, native.main.length === 4 && native.maxMainPending === 1 && !duplicates(native.main), native,
          { fatal: false, classification: rapid ? 'controlled-rapid-wake-scheduling-order' : 'native-wake-scheduling-observation' });
        check(`Wake ${cycle}: progress draw remains one native request chain`, native.draw.length > 0 && native.maxDrawPending === 1 && !duplicates(native.draw), native);
        const glResult = await bounded(page.evaluate(() => {
          const gl = window.__fp.renderer.getContext(), errors = [];
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
          for (let n = 0; n < 16; n++) { const e = gl.getError(); if (e === gl.NO_ERROR) break; errors.push(e); }
          return { errors, contextLost: gl.isContextLost() };
        }), `wake-${cycle}-WebGL-completion`, cfg.timeoutMs, 'QA_FRAME_TIMEOUT');
        check(`Wake ${cycle}: native frames complete without WebGL error`, !glResult.contextLost && glResult.errors.length === 0, glResult);
        const awake = await state(`wake-${cycle}-confirmed`);
        check(`Wake ${cycle}: all four observed callbacks rendered`, awake.render.mainPasses - waking.render.mainPasses === 4,
          { before: waking.render.mainPasses, after: awake.render.mainPasses });
        check(`Wake ${cycle}: low manual quality is preserved`, awake.settings.quality === 'low' && awake.render.preset === 'low' && awake.render.pixelRatio === before.render.pixelRatio,
          { before: before.render, after: awake.render, settings: awake.settings });
        listenerCheck(awake, `wake ${cycle}`);
        cycles.push({ interleaving: rapid ? 'explicit-undelivered-request-across-sleep-wake' : 'ordinary-drained-sleep-wake', before, boundary, parked, settled, clocks, waking, native, glResult, awake });
      }
      return { countdown, selected15: pressed, cancelledText, cycles,
        scope: 'Two boundary sleep/wake cycles; actual timer expiry and all lifecycle races remain untested.' };
    });

    report.raw = await page.evaluate(() => window.__ritualProbe.dump());
    check('No page errors', session.diagnostics.pageErrors.length === 0, session.diagnostics.pageErrors);
    check('No console errors', session.diagnostics.consoleErrors.length === 0, session.diagnostics.consoleErrors);
    check('No WebGL context-loss event', report.raw.contextLosses.length === 0, report.raw.contextLosses);
    const finalMain = await page.request.get(new URL('js/main.js', cfg.baseURL).href);
    report.finalMainSha256 = finalMain.ok() ? sha256(await finalMain.body()) : null;
    check('Served main.js stays unchanged throughout the case', report.finalMainSha256 === report.mainSha256, { before: report.mainSha256, after: report.finalMainSha256 });
    report.status = report.failures.length ? 'FAIL' : Object.values(report.groups).every(g => g.status === 'NOT_APPLICABLE') ? 'NOT_APPLICABLE' : 'PASS';
  } catch (error) {
    report.status = 'FAIL';
    if (error.code === 'QA_FRAME_TIMEOUT') frameTimedOut = true;
    if (!error.alreadyRecorded) report.failures.push({ stage: currentStage, message: error.message, stack: error.stack, code: error.code, diagnostic: error.diagnostic });
    if (page && !page.isClosed() && !frameTimedOut) {
      try {
        report.failureState = await bounded(page.evaluate(readState), 'failure state', 5000);
        report.raw = await bounded(page.evaluate(() => window.__ritualProbe?.dump()), 'failure scheduler', 5000);
        await screenshot('failure');
      } catch (secondary) { report.failureObservationError = { message: secondary.message, code: secondary.code }; }
    } else if (frameTimedOut) report.failureObservationError = { message: 'Blocked frame: no further page work queued. Screenshot/state not observed.' };
  } finally {
    report.finishedAt = new Date().toISOString();
    if (session) report.diagnostics = session.diagnostics;
    if (browser) {
      try { await bounded(browser.close(), 'browser cleanup', 15000); }
      catch (error) { report.status = 'FAIL'; report.failures.push({ stage: 'cleanup', message: error.message }); }
    }
    await fs.writeFile(path.join(caseDir, 'raw.json'), JSON.stringify(report.raw ?? { status: 'NOT_OBSERVED', reason: report.failureObservationError || report.failures.at(-1) }, null, 2) + '\n');
    await fs.writeFile(path.join(caseDir, 'errors.json'), JSON.stringify({ failures: report.failures, diagnostics: report.diagnostics ?? null }, null, 2) + '\n');
    await persist();
    await log(`finished:${report.status}`, { result: path.join(caseDir, 'result.json') });
  }
  return { venue, device, scenario, status: report.status, file: path.join(stem, 'result.json'),
    mainSha256: report.mainSha256 ?? null, failures: report.failures.map(x => ({ stage: x.stage, message: x.message, classification: x.classification })) };
}

const summaryFilename = `${cfg.label}-${scenario}-summary.json`;
await fs.mkdir(cfg.outputDir, { recursive: true });
await fs.writeFile(path.join(cfg.outputDir, summaryFilename), JSON.stringify({ status: 'RUNNING', label: cfg.label, scenario, fixtureSourceSha256 }, null, 2) + '\n', { flag: 'wx' });
const results = [];
for (const entry of cases) {
  try { results.push(await runCase(entry)); }
  catch (error) { results.push({ ...entry, status: 'FAIL', initializationError: error.message }); }
}
const summary = { schema: 1, suite: 'evening-rituals-functional', scenario, label: cfg.label,
  revision: cfg.revision, fixtureSourceSha256, helperSourceSha256, finishedAt: new Date().toISOString(),
  method: 'Functional UI/scheduler observations only. No FPS or natural timer-expiry claim.', results };
await save(cfg, summaryFilename, summary);
console.log(JSON.stringify(summary));
if (results.some(x => x.status === 'FAIL')) process.exitCode = 1;
