import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { detectSoftwareGPU, isSoftwareGPU, isWeakGPU } from '../public/js/app/graphics.js';
import { createLobby } from '../public/js/app/lobby.js';
import { fetchPiece } from '../public/js/audio/performance.js';
import { buildFX } from '../public/js/scene/fx.js';

const ROOT = new URL('../', import.meta.url);

test('V1 graphics: software rasterisers separate from integrated and discrete GPUs', () => {
  for (const sw of [
    'Google Inc. (Google SwiftShader)',
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)))',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'ANGLE (Microsoft, D3D11 on D3D12, Microsoft Basic Render Driver)',
    'Microsoft WARP',
    'Mesa Software Rasterizer',
  ]) {
    assert.equal(isSoftwareGPU(sw), true, `expected software GPU for ${sw}`);
  }

  for (const igpu of [
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
    'AMD Radeon(TM) Graphics',
    'AMD Radeon(TM) Vega 8 Graphics',
  ]) {
    assert.equal(isSoftwareGPU(igpu), false, `integrated GPU must not force software tier: ${igpu}`);
    assert.equal(isWeakGPU(igpu), true, `integrated GPU stays in medium weakGPU tier: ${igpu}`);
  }

  for (const dgpu of [
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)',
    'Intel(R) Arc(TM) A770 Graphics',
    'Apple M3 Max',
  ]) {
    assert.equal(isSoftwareGPU(dgpu), false, `discrete GPU is not software: ${dgpu}`);
    assert.equal(isWeakGPU(dgpu), false, `discrete GPU is not weak: ${dgpu}`);
  }

  let lost = 0;
  const mockDoc = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        getContext(kind) {
          assert.equal(kind, 'webgl2');
          return {
            getExtension(ext) {
              if (ext === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 0x9246 };
              if (ext === 'WEBGL_lose_context') return { loseContext() { lost += 1; } };
              return null;
            },
            getParameter(param) {
              return param === 0x9246 ? 'Google SwiftShader' : '';
            },
          };
        },
      };
    },
  };
  assert.equal(detectSoftwareGPU(mockDoc), true);
  assert.equal(lost, 1, 'probe releases temporary WebGL2 context immediately');
});

test('V1 fx: wash SpotLights start invisible so boot compile matches initial frame light key', (t) => {
  const prevWin = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const prevDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement() {
        return {
          width: 0,
          height: 0,
          getContext() {
            return {
              createRadialGradient: () => ({ addColorStop() {} }),
              fillRect() {},
            };
          },
        };
      },
    },
  });
  t.after(() => {
    if (prevWin) Object.defineProperty(globalThis, 'window', prevWin); else delete globalThis.window;
    if (prevDoc) Object.defineProperty(globalThis, 'document', prevDoc); else delete globalThis.document;
  });

  const scene = new THREE.Scene();
  const fx = buildFX(scene, { fanfare() {} }, { sphere: false });
  const spots = [];
  scene.traverse((obj) => {
    if (obj.isSpotLight) spots.push(obj);
  });
  assert.equal(spots.length, 2);
  assert.equal(spots.every((l) => l.visible === false), true, 'wash lights must start invisible before renderer.compile');

  fx.wash.update(0.016, 0);
  assert.equal(spots.every((l) => l.visible === false), true);

  fx.wash.set(true);
  fx.wash.update(0.5, 1.0);
  assert.equal(spots.every((l) => l.visible === true), true);
});

test('V1 fetchPiece: 30s timeout, single retry on AbortError, and optional network TypeError retry', async () => {
  const validScore = { id: 'test-piece', duration: 12, tracks: [] };

  // 1) Timeout / AbortError retries once and succeeds on second attempt
  let abortCalls = 0;
  const recovered = await fetchPiece('test-piece', {
    timeoutMs: 20,
    retries: 1,
    retryDelayMs: 5,
    fetchImpl: (_url, { signal }) => {
      abortCalls += 1;
      if (abortCalls === 1) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => validScore });
    },
  });
  assert.equal(abortCalls, 2);
  assert.equal(recovered.id, 'test-piece');

  // 2) Default retryNetwork=false rejects immediately on TypeError without hanging a second request
  let netCallsDefault = 0;
  await assert.rejects(
    fetchPiece('test-piece', {
      retryDelayMs: 1,
      fetchImpl: async () => {
        netCallsDefault += 1;
        throw new TypeError('Failed to fetch');
      },
    }),
    /Failed to fetch/,
  );
  assert.equal(netCallsDefault, 1);

  // 3) retryNetwork=true retries once on transient socket TypeError
  let netCallsRetry = 0;
  const netRecovered = await fetchPiece('test-piece', {
    retryNetwork: true,
    retryDelayMs: 5,
    fetchImpl: async () => {
      netCallsRetry += 1;
      if (netCallsRetry === 1) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => validScore };
    },
  });
  assert.equal(netCallsRetry, 2);
  assert.equal(netRecovered.id, 'test-piece');
});

test('V1 main.js boot contract: index fetch before compile, fx before compile, single loop start at ready', async () => {
  const src = await fs.readFile(new URL('public/js/main.js', ROOT), 'utf8');

  // FX lights are built on the scene before boot() compiles materials
  const buildFxIdx = src.indexOf('buildFX(scene, engine)');
  const asyncBootIdx = src.indexOf('async function boot()');
  assert.ok(buildFxIdx > 0 && buildFxIdx < asyncBootIdx, 'buildFX must attach lights before boot()');

  // Top-level requestFrame() outside boot() must not run during loading
  const afterBootFn = src.slice(src.indexOf('function warmTextures()'));
  assert.equal(afterBootFn.includes('app.loop.requestFrame()'), false, 'requestFrame must not run at top level before boot finishes');

  const bootBody = src.slice(asyncBootIdx, src.indexOf('function warmTextures()'));
  const idxFetch = bootBody.indexOf("fetch('music/index.json'");
  const idxEngine = bootBody.indexOf('await engine.init(');
  const idxChoose = bootBody.indexOf('app.concert.pieces.choose(');
  const idxCompile = bootBody.indexOf('renderer.compile(scene, camera)');
  const idxDomeReady = bootBody.indexOf('await domeReady');
  const idxResetClock = bootBody.indexOf('app.loop.resetClock()');
  const idxRequestFrame = bootBody.indexOf('app.loop.requestFrame()');
  const idxReady = bootBody.indexOf('ui.ready()');

  assert.ok(idxFetch > 0, 'boot fetches music/index.json');
  assert.ok(idxFetch < idxEngine, 'music/index.json is fetched before engine.init');
  assert.ok(idxEngine < idxChoose, 'engine.init runs before choosing opening piece');
  assert.ok(idxChoose < idxCompile, 'opening piece is chosen before single scene compile');
  assert.ok(idxCompile < idxDomeReady, 'Sphere domeReady is awaited after scene compile');
  assert.ok(idxDomeReady < idxResetClock, 'domeReady completes before loop clock reset');
  assert.ok(idxResetClock < idxRequestFrame, 'clock resets immediately before starting loop');
  assert.ok(idxRequestFrame < idxReady, 'loop frame callback is armed before ui.ready enables entry');
  assert.ok(src.includes('fetchPiece(id, { retryNetwork: true })'), 'ScoreLibrary uses retryNetwork fetchPiece');
});

test('V2 & V3 lobby: reads dynamic app.isTouch on enter, clears poll interval, and ignores post-entry room responses', async (t) => {
  const saved = {};
  for (const k of ['window', 'document', 'location', 'navigator', 'localStorage', 'sessionStorage', 'history', 'fetch']) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  }
  const origSetInterval = globalThis.setInterval;
  const origClearInterval = globalThis.clearInterval;

  const intervals = new Set();
  globalThis.setInterval = (fn, ms) => {
    const id = origSetInterval(fn, ms);
    id.unref?.();
    intervals.add(id);
    return id;
  };
  globalThis.clearInterval = (id) => {
    intervals.delete(id);
    return origClearInterval(id);
  };

  t.after(() => {
    for (const id of intervals) origClearInterval(id);
    globalThis.setInterval = origSetInterval;
    globalThis.clearInterval = origClearInterval;
    for (const [k, desc] of Object.entries(saved)) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  });

  let fullscreenRequested = 0;
  const lobbyEl = { hidden: true };
  let resolveSlowRooms = null;
  let fetchCount = 0;

  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search: '?venue=hall&lobby=1', href: 'http://127.0.0.1:8096/?venue=hall&lobby=1', pathname: '/' },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 Chrome/130.0', platform: 'Win32', maxTouchPoints: 5 },
  });
  Object.defineProperty(globalThis, 'history', {
    configurable: true,
    value: { replaceState() {} },
  });
  const memLocal = new Map();
  const memSession = new Map();
  const makeStore = (m) => ({
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: makeStore(memLocal) });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: makeStore(memSession) });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      hidden: false,
      fullscreenElement: null,
      documentElement: {
        requestFullscreen() {
          fullscreenRequested += 1;
          return Promise.resolve();
        },
      },
      getElementById(id) {
        return id === 'lobby' ? lobbyEl : null;
      },
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage },
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => {
      fetchCount += 1;
      if (fetchCount === 1) return { ok: true, json: async () => [] };
      return new Promise((resolve) => { resolveSlowRooms = resolve; });
    },
  });

  const handlers = new Map();
  const touchCalls = [];
  const enterCalls = [];
  let onlineCallsAfterEnter = 0;
  let roomsCallsAfterEnter = 0;
  let foyerSynced = 0;

  const S = { concertStarted: false, joining: false, room: null };
  const ui = {
    initLobby() {},
    lobbyError() {},
    lobbyBusy() {},
    on(ev, fn) { handlers.set(ev, fn); },
    setTouch(on) { touchCalls.push(on); },
    enter(on) { enterCalls.push(on); },
    setRooms() { if (S.concertStarted) roomsCallsAfterEnter += 1; },
    setOnline() { if (S.concertStarted) onlineCallsAfterEnter += 1; },
  };
  const director = {
    active: false,
    isTouch: false,
    fov: 64,
    targetFov: 64,
    placeAt() {},
  };
  const app = {
    S,
    ui,
    isTouch: false, // starts false on hybrid laptop before first finger tap
    engine: { ctx: { resume: () => Promise.resolve() } },
    hall: { setHouseLights() {} },
    graphics: { holdQuality() {} },
    power: { requestWakeLock() {} },
    sync: { wireRoom() {}, catchUp() {} },
    viewer: { syncFoyerHint() { foyerSynced += 1; } },
    director,
  };

  const lobby = createLobby(app);
  await Promise.resolve();
  assert.equal(intervals.size, 1, 'lobby starts room poll interval');

  // Trigger an in-flight refreshRooms before entering
  const inflightRefresh = lobby.refresh();

  // Promote app.isTouch dynamically (as watchTouchUI does when user taps enter)
  app.isTouch = true;
  await handlers.get('enter')({ mode: 'solo', name: '다람쥐', avatar: 'squirrel' });

  assert.equal(S.concertStarted, true);
  assert.equal(fullscreenRequested, 1, 'dynamic app.isTouch triggers fullscreen on non-Apple touch');
  assert.equal(director.isTouch, true, 'director.isTouch synced to dynamic app.isTouch');
  assert.deepEqual(touchCalls, [true]);
  assert.deepEqual(enterCalls, [true]);
  assert.equal(foyerSynced, 1, 'Hall foyer hint syncs immediately on entry');
  assert.equal(intervals.size, 0, 'lobby poll interval is cleared upon entering the hall');

  // Resolve the slow in-flight room list AFTER entry & splash removal
  resolveSlowRooms({ ok: true, json: async () => [{ code: 'ABC123', title: '방', count: 1, cap: 8 }] });
  await inflightRefresh;
  assert.equal(roomsCallsAfterEnter, 0, 'post-entry room list response does not touch lobby DOM');
  assert.equal(onlineCallsAfterEnter, 0, 'post-entry online status does not touch lobby DOM');
});

test('V4 & V5 CSS/HTML contracts: plaza header stack, mobile stub clearance, renderStatus offset, and ui-hidden priority', async () => {
  const [html, css] = await Promise.all([
    fs.readFile(new URL('public/index.html', ROOT), 'utf8'),
    fs.readFile(new URL('public/css/style.css', ROOT), 'utf8'),
  ]);

  assert.match(
    html,
    /<div class="pz-head">\s*<header class="pz-top" id="pzTop">[\s\S]*?<\/header>\s*<nav id="pzNav" class="pz-nav"/,
    'pzTop and pzNav flow inside .pz-head so multi-line hints never collide with navigation pills',
  );

  const mobileStubMatch = css.match(/\.plaza\.has-ticket\s+\.pz-stub\s*\{\s*top:\s*(\d+)px/);
  assert.ok(mobileStubMatch, 'mobile .plaza.has-ticket .pz-stub rule exists');
  assert.ok(Number(mobileStubMatch[1]) >= 104, `expected mobile ticket stub top >= 104px, got ${mobileStubMatch[1]}px`);

  assert.match(
    css,
    /body:has\(#renderStatus:not\(\[hidden\]\)\)\s+\.splash\s*\{\s*padding-top:/,
    'visible #renderStatus offsets .splash downward so #lbName is never covered',
  );

  assert.equal(
    css.includes('body.ui-dim :is('),
    false,
    'all body.ui-dim rules must exclude .ui-hidden via body.ui-dim:not(.ui-hidden)',
  );
  assert.match(css, /body\.ui-dim:not\(\.ui-hidden\)\s+:is\(/);
  assert.equal(
    /prefers-contrast:\s*more[\s\S]{0,260}!important/.test(css),
    false,
    'high-contrast ui-dim rule must not use !important to override body.ui-hidden',
  );
});
