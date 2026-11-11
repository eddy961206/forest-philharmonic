import assert from 'node:assert/strict';
import test from 'node:test';
import { isMobileTier, isTouchDevice, isTouchUI, watchTouchUI } from '../public/js/quality.js';

function makeClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n)),
    toggle: (name, force) => {
      const on = force === undefined ? !set.has(name) : Boolean(force);
      if (on) set.add(name); else set.delete(name);
      return on;
    },
    contains: (name) => set.has(name),
  };
}

function makeEnv({
  userAgent = '',
  platform = '',
  maxTouchPoints = 0,
  mobileData = false,
  deviceMemory = 0,
  coarse = false,
  anyCoarse = coarse,
  fine = !coarse,
  innerWidth = 1440,
  innerHeight = 900,
} = {}) {
  const queries = new Map();
  const state = { coarse, anyCoarse, fine };
  const getMql = (q) => {
    if (!queries.has(q)) {
      const mql = new EventTarget();
      Object.defineProperty(mql, 'matches', {
        get() {
          if (q === '(pointer: coarse)') return state.coarse;
          if (q === '(any-pointer: coarse)') return state.anyCoarse;
          if (q === '(pointer: fine)') return state.fine;
          return false;
        },
      });
      queries.set(q, mql);
    }
    return queries.get(q);
  };
  const window = new EventTarget();
  const document = {
    documentElement: { classList: makeClassList() },
    body: { classList: makeClassList() },
  };
  Object.assign(window, {
    innerWidth,
    innerHeight,
    document,
    matchMedia: (q) => getMql(q),
  });
  const navigator = {
    userAgent,
    platform,
    maxTouchPoints,
    deviceMemory,
    userAgentData: { mobile: mobileData },
  };
  return {
    window,
    document,
    navigator,
    matchMedia: window.matchMedia,
    state,
    queries,
  };
}

test('isTouchUI aliases isTouchDevice and separates performance tier from touch controls', () => {
  assert.equal(isTouchUI, isTouchDevice);

  // Standard macOS desktop with mouse/trackpad
  const macDesktop = makeEnv({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    coarse: false,
    anyCoarse: false,
    fine: true,
  });
  assert.equal(isMobileTier(macDesktop), false);
  assert.equal(isTouchUI(macDesktop), false);

  // iPadOS 13+ Safari requesting desktop website (reports Macintosh + MacIntel + 5 touch points)
  const ipadDesktopMode = makeEnv({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
    coarse: true,
    anyCoarse: true,
    fine: false,
    innerWidth: 1180,
    innerHeight: 820,
  });
  assert.equal(isMobileTier(ipadDesktopMode), true, 'iPadOS desktop Safari uses mobile memory/quality budget');
  assert.equal(isTouchUI(ipadDesktopMode), true);

  // iPadOS with Magic Keyboard attached (fine pointer true, still iPad GPU/RAM budget)
  const ipadWithTrackpad = makeEnv({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
    coarse: false,
    anyCoarse: true,
    fine: true,
    innerWidth: 1366,
    innerHeight: 1024,
  });
  assert.equal(isMobileTier(ipadWithTrackpad), true);
  assert.equal(isTouchUI(ipadWithTrackpad), true);

  // iPhone / Android phone
  const iphone = makeEnv({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    platform: 'iPhone',
    maxTouchPoints: 5,
    coarse: true,
    fine: false,
    innerWidth: 390,
    innerHeight: 844,
  });
  assert.equal(isMobileTier(iphone), true);
  assert.equal(isTouchUI(iphone), true);

  // Windows 11 2-in-1 hybrid laptop with trackpad + touchscreen
  const winHybrid = makeEnv({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    platform: 'Win32',
    maxTouchPoints: 10,
    deviceMemory: 16,
    coarse: false,
    anyCoarse: true,
    fine: true,
    innerWidth: 1920,
    innerHeight: 1200,
  });
  assert.equal(isMobileTier(winHybrid), false, 'touch-capable laptop is never forced onto mobile graphics tier');
  assert.equal(isTouchUI(winHybrid), false, 'hybrid laptop starts in mouse/keyboard UI until touched');

  // Large single-touch desktop display (maxTouchPoints === 1, coarse primary, plenty of RAM)
  const touchMonitor = makeEnv({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    platform: 'Linux x86_64',
    maxTouchPoints: 1,
    deviceMemory: 8,
    coarse: true,
    anyCoarse: true,
    fine: false,
    innerWidth: 1920,
    innerHeight: 1080,
  });
  assert.equal(isTouchUI(touchMonitor), true, 'single-touch coarse display receives touch UI');
  assert.equal(isMobileTier(touchMonitor), false);

  // Low-memory device (<= 2 GB) falls into mobile tier regardless of pointer
  const lowMem = makeEnv({
    userAgent: 'Mozilla/5.0 (X11; CrOS x86_64) AppleWebKit/537.36 Chrome/126.0.0.0',
    platform: 'Linux x86_64',
    maxTouchPoints: 0,
    deviceMemory: 2,
    coarse: false,
    fine: true,
  });
  assert.equal(isMobileTier(lowMem), true);
});

test('watchTouchUI switches hybrid devices between touch and mouse without synthetic-mouse bounce', (t) => {
  let now = 10_000;
  t.mock.method(Date, 'now', () => now);

  const env = makeEnv({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0',
    platform: 'Win32',
    maxTouchPoints: 10,
    deviceMemory: 16,
    coarse: false,
    anyCoarse: true,
    fine: true,
    innerWidth: 1920,
    innerHeight: 1200,
  });
  const changes = [];
  const watcher = watchTouchUI((on) => changes.push(on), env);

  assert.equal(watcher.value, false);
  assert.equal(env.document.documentElement.classList.contains('touch'), false);
  assert.equal(env.document.body.classList.contains('touch'), false);

  // Touching the screen activates touch UI immediately
  const touchDown = Object.assign(new Event('pointerdown'), { pointerType: 'touch' });
  env.window.dispatchEvent(touchDown);
  assert.equal(watcher.value, true);
  assert.equal(env.document.documentElement.classList.contains('touch'), true);
  assert.equal(env.document.body.classList.contains('touch'), true);
  assert.deepEqual(changes, [true]);

  // Compatibility mouse event within 600 ms of touch is ignored
  now += 250;
  const compatMouse = Object.assign(new Event('pointerdown'), { pointerType: 'mouse' });
  env.window.dispatchEvent(compatMouse);
  assert.equal(watcher.value, true);
  assert.deepEqual(changes, [true]);

  // Real mouse press after >600 ms restores desktop UI
  now += 500;
  const realMouse = Object.assign(new Event('pointerdown'), { pointerType: 'mouse' });
  env.window.dispatchEvent(realMouse);
  assert.equal(watcher.value, false);
  assert.equal(env.document.documentElement.classList.contains('touch'), false);
  assert.deepEqual(changes, [true, false]);

  // Folding into tablet mode flips (pointer: coarse) -> true
  env.state.coarse = true;
  env.state.fine = false;
  env.queries.get('(pointer: coarse)').dispatchEvent(new Event('change'));
  assert.equal(watcher.value, true);
  assert.deepEqual(changes, [true, false, true]);

  // Dispose stops further listener reactions
  watcher.dispose();
  now += 1000;
  env.window.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'mouse' }));
  assert.equal(watcher.value, true);
  assert.deepEqual(changes, [true, false, true]);
});
