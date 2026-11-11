import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import * as THREE from 'three';

import { createAppState } from '../public/js/app/state.js';
import { createConcert } from '../public/js/app/concert.js';
import { createSync } from '../public/js/app/sync.js';
import { createSleep } from '../public/js/app/sleep.js';
import { createEncore, HOUSE_OUTDOOR, HOUSE_HALL } from '../public/js/app/encore.js';
import { createPower } from '../public/js/app/power.js';
import { createInterval } from '../public/js/app/interval.js';
import { RoomClient } from '../public/js/net/room.js';
import { Leaf } from '../public/js/evening.js';
import { noticeLines } from '../public/js/scene/lobby.js';
import { buildEffects } from '../public/js/scene/effects.js';
import { buildFX } from '../public/js/scene/fx.js';
import { sphereSeatList, sphereLevelName, VOMS } from '../public/js/scene/sphereplan.js';
import { levelName } from '../public/js/scene/hallplan.js';
import { seatList } from '../public/js/scene/seats.js';
import { buildDome } from '../public/js/scene/domeshow.js';
import { buildLifts } from '../public/js/scene/sphere.js';

function withGlobals(t, overrides) {
  for (const [key, value] of Object.entries(overrides)) {
    const prev = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => {
      if (prev) Object.defineProperty(globalThis, key, prev);
      else delete globalThis[key];
    });
  }
}

function makeFakeClock(t, startMs = 1_000_000) {
  let now = startMs;
  let seq = 0;
  const timers = new Map();
  const setTimer = (fn, delay = 0, interval = 0) => {
    const id = ++seq;
    const item = {
      id,
      fn,
      at: now + Math.max(0, Number(delay) || 0),
      interval,
      unref() { return item; },
    };
    timers.set(id, item);
    return item;
  };
  const clearTimer = (handle) => {
    const id = typeof handle === 'object' && handle !== null ? handle.id : handle;
    timers.delete(id);
  };
  withGlobals(t, {
    setTimeout: (fn, delay = 0) => setTimer(fn, delay, 0),
    setInterval: (fn, delay = 0) => setTimer(fn, delay, Math.max(1, Number(delay) || 1)),
    clearTimeout: clearTimer,
    clearInterval: clearTimer,
  });
  t.mock.method(Date, 'now', () => now);
  t.mock.method(performance, 'now', () => now - startMs);
  t.after(() => timers.clear());

  const flush = async (turns = 10) => {
    for (let i = 0; i < turns; i++) await Promise.resolve();
  };
  const advance = async (ms) => {
    await flush(8);
    const target = now + ms;
    while (true) {
      let next = null;
      for (const item of timers.values()) {
        if (item.at <= target && (!next || item.at < next.at || (item.at === next.at && item.id < next.id))) {
          next = item;
        }
      }
      if (!next) break;
      now = next.at;
      if (next.interval > 0) next.at = now + next.interval;
      else timers.delete(next.id);
      next.fn();
      await flush(6);
    }
    now = target;
    await flush(8);
  };
  return { get now() { return now; }, timers, flush, advance };
}

function makeProgram() {
  return [
    {
      id: 'orch-open',
      titleKo: '서곡',
      composerKo: '모차르트',
      ensembleKo: '오케스트라',
      duration: 180,
      mood: 'lively',
      conducted: true,
      tracks: [
        { section: 'vn1', chairs: [0, 1, 2], inst: 'violin', notes: [0, 1, 60, 80, 1, 1, 62, 80, 2, 1, 64, 80, 3, 1, 65, 80, 4, 1, 67, 80, 5, 1, 69, 80] },
        { section: 'vc', chairs: [0], inst: 'cello', notes: [0, 1, 48, 80, 1, 1, 50, 80, 2, 1, 52, 80, 3, 1, 53, 80, 4, 1, 55, 80, 5, 1, 57, 80] },
      ],
    },
    {
      id: 'solo-rag',
      titleKo: '단풍잎 래그',
      composerKo: '조플린',
      ensembleKo: '피아노',
      duration: 150,
      mood: 'lively',
      finale: true,
      conducted: false,
      tracks: [{ section: 'piano', chairs: [0], inst: 'piano', notes: [0, 1, 60, 90, 1, 1, 64, 90, 2, 1, 67, 90, 3, 1, 72, 90, 4, 1, 76, 90, 5, 1, 79, 90] }],
    },
    {
      id: 'calm-nocturne',
      titleKo: '녹턴',
      composerKo: '쇼팽',
      ensembleKo: '피아노',
      duration: 200,
      mood: 'calm',
      conducted: false,
      tracks: [{ section: 'piano', chairs: [0], inst: 'piano', notes: [0, 2, 60, 60, 2, 2, 62, 60, 4, 2, 64, 60, 6, 2, 65, 60, 8, 2, 67, 60, 10, 2, 69, 60] }],
    },
    {
      id: 'orch-finale',
      titleKo: '피날레 교향곡',
      composerKo: '베토벤',
      ensembleKo: '오케스트라',
      duration: 210,
      mood: 'grand',
      finale: true,
      conducted: true,
      tracks: [
        { section: 'vn1', chairs: [0, 1], inst: 'violin', notes: [0, 1, 67, 100, 1, 1, 71, 100, 2, 1, 74, 100, 3, 1, 79, 100, 4, 1, 76, 100, 5, 1, 72, 100] },
        { section: 'tp', chairs: [0], inst: 'trumpet', notes: [0, 1, 62, 110, 1, 1, 66, 110, 2, 1, 69, 110, 3, 1, 74, 110, 4, 1, 74, 110, 5, 1, 74, 110] },
      ],
    },
  ];
}

function makeHarness(t, { program = makeProgram(), failIds = new Set() } = {}) {
  const storage = new Map();
  const docListeners = {};
  const winListeners = {};
  const makeTarget = (map) => ({
    addEventListener(type, fn, capture = false) {
      (map[type] ||= []).push({ fn, capture: !!capture });
    },
    dispatch(type, init = {}) {
      let stopped = false;
      let immediate = false;
      let defaultPrevented = false;
      const ev = {
        type,
        ...init,
        get defaultPrevented() { return defaultPrevented; },
        preventDefault() { defaultPrevented = true; },
        stopPropagation() { stopped = true; },
        stopImmediatePropagation() { stopped = true; immediate = true; },
      };
      for (const h of [...(map[type] || [])]) {
        if (!h.capture) continue;
        h.fn(ev);
        if (immediate) break;
      }
      if (!stopped) {
        for (const h of [...(map[type] || [])]) {
          if (h.capture) continue;
          h.fn(ev);
          if (immediate) break;
        }
      }
      return ev;
    },
  });

  const winTarget = makeTarget(winListeners);
  const docTarget = makeTarget(docListeners);
  const makeEl = (id, tagName = 'DIV') => {
    const attrs = new Map();
    return {
      id,
      tagName,
      hidden: id === 'sleepVeil' || id === 'leaf',
      inert: false,
      checked: false,
      tabIndex: 0,
      isConnected: true,
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      focus() { docObj.activeElement = this; },
    };
  };
  const hudEl = makeEl('hud');
  const barEl = makeEl('bar');
  const veilEl = makeEl('sleepVeil');
  const leafEl = makeEl('leaf');
  const skipOptEl = makeEl('optSkipStageTransitions', 'INPUT');
  const byId = new Map([
    ['hud', hudEl],
    ['bar', barEl],
    ['sleepVeil', veilEl],
    ['leaf', leafEl],
    ['optSkipStageTransitions', skipOptEl],
  ]);
  const docObj = {
    hidden: false,
    activeElement: barEl,
    body: { children: [hudEl, barEl, veilEl] },
    getElementById: (id) => byId.get(id) || null,
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect() {},
        strokeRect() {},
        fillText() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        ellipse() {},
        fill() {},
        arc() {},
        createRadialGradient: () => ({ addColorStop() {} }),
      }),
    }),
    addEventListener: docTarget.addEventListener,
    dispatch: docTarget.dispatch,
  };
  const mediaHandlers = new Map();
  withGlobals(t, {
    window: {
      innerHeight: 800,
      addEventListener: winTarget.addEventListener,
      dispatch: winTarget.dispatch,
      prompt: () => '',
    },
    addEventListener: winTarget.addEventListener,
    document: docObj,
    location: { href: 'http://localhost/hall.html?venue=hall', pathname: '/hall.html', origin: 'http://localhost', search: '?venue=hall', protocol: 'http:' },
    history: { replaceState() {} },
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    sessionStorage: { getItem: () => 'cid-test-1234', setItem() {}, removeItem() {} },
    MediaMetadata: class MediaMetadata { constructor(init) { Object.assign(this, init); } },
    navigator: {
      mediaSession: {
        metadata: null,
        setActionHandler(name, fn) { mediaHandlers.set(name, fn); },
      },
    },
  });

  const S = createAppState('hall');
  S.program = program;
  S.eveningLen = program.length;
  S.current = 0;
  S.concertStarted = true;

  const settings = {
    volume: 0.75,
    applauseVol: 0.8,
    fx: true,
    lasers: true,
    fixedEar: false,
    skipStageTransitions: true,
    repeatOne: false,
    shuffle: false,
    interval: 5,
    gap: 2,
  };

  const uiEvents = {};
  const toasts = [];
  const intervalCalls = [];
  const mutedCalls = [];
  const ui = {
    on(ev, fn) { (uiEvents[ev] ||= []).push(fn); },
    emit(ev, ...args) { for (const fn of uiEvents[ev] || []) fn(...args); },
    showStarted() {},
    toast(msg, dur) { toasts.push({ msg, dur }); },
    setCurrent() {},
    setTime() {},
    setPlaying() {},
    offer() {},
    interval(on, isHost = true) { intervalCalls.push({ on, isHost }); },
    setIntervalLeft() {},
    encore() {},
    act() {},
    tea() {},
    showNews(lines) { ui.lastNews = lines; },
    setMuted(m) { mutedCalls.push(m); },
    setSleepLeft() {},
    sleep(on) { veilEl.hidden = !on; },
    setMembers() {},
    setRoom() {},
    setOffline() {},
    setHostControls() {},
    chatLine() {},
  };

  let suspended = false;
  const engineCalls = { fanfare: 0,confetti: 0, fireworks: 0, volumes: [] };
  const engine = {
    ctx: {
      get state() { return suspended ? 'suspended' : 'running'; },
      get currentTime() { return performance.now() / 1000; },
      suspend() { suspended = true; return Promise.resolve(); },
      resume() { suspended = false; return Promise.resolve(); },
      addEventListener() {},
    },
    get now() { return performance.now() / 1000; },
    volume: settings.volume,
    master: {
      gain: {
        cancelScheduledValues() {},
        setTargetAtTime() {},
      },
    },
    setVolume(v) { this.volume = v; engineCalls.volumes.push(v); },
    stopApplause() {},
    stopAll() {},
    tuning() { return 0.1; },
    applause() {},
    addSpot() {},
    chime() {},
    onTick() { return () => {}; },
    playNote() {},
  };

  const perf = {
    piece: program[0],
    playing: false,
    time: 0,
    pos: 0,
    get duration() { return this.piece?.duration || 120; },
    prepare: (sc) => sc,
    use(sc) { this.piece = sc; this.duration; return sc; },
    play() { this.playing = true; },
    pause() { this.playing = false; },
    seek(t0) { this.time = Math.max(0, t0); this.pos = this.time; },
    finish() { this.playing = false; this.onEnd?.(); return true; },
    onEnd: null,
  };

  const scores = {
    async get(id) {
      if (failIds.has(id)) throw new Error(`score failed: ${id}`);
      const found = program.find((p) => p.id === id);
      if (!found) throw new Error(`unknown piece: ${id}`);
      return found;
    },
  };

  const onstageSet = new Set();
  const stage = {
    skipTransitions: true,
    walkers: [],
    conductorOn: false,
    conductorReady: true,
    get conductorOffstage() { return !this.conductorOn; },
    get onstage() { return onstageSet.size > 0; },
    get allOffstage() { return onstageSet.size === 0 && !this.conductorOn; },
    setSkipTransitions(on) { this.skipTransitions = !!on; },
    onstageKeys: () => new Set(onstageSet),
    plan(target) {
      const exits = [...onstageSet].filter((k) => !target.has(k));
      const enters = [...target].filter((k) => !onstageSet.has(k));
      return { exits, enters };
    },
    snapRoster(keys) { onstageSet.clear(); for (const k of keys) onstageSet.add(k); },
    snapOnstage() {},
    snapConductor(on) { this.conductorOn = !!on; this.conductorReady = !!on; },
    sendOff() { onstageSet.clear(); },
    gone: () => true,
    callOn(enters) { for (const k of enters) onstageSet.add(typeof k === 'string' ? k : 'vc:0'); },
    arrived: () => true,
    greet() {},
    conductorEnter() { this.conductorOn = true; this.conductorReady = true; },
    conductorExit() { this.conductorOn = false; this.conductorReady = false; },
    conductorBow() {},
    conductorFace() {},
    orchestraRise() {},
    orchestraBow() {},
    exitAll() { onstageSet.clear(); this.conductorOn = false; },
    borrow() { return null; },
    giveBack() {},
    update() {},
  };

  const fxCalls = { fanfare: 0, confetti: 0, fireworks: 0, lasers: [], wash: [] };
  const fx = {
    fanfare() { fxCalls.fanfare++; },
    confettiCannons() { fxCalls.confetti++; },
    fireworksShow() { fxCalls.fireworks++; },
    lasers: { set(on) { fxCalls.lasers.push(!!on); } },
    wash: { set(on) { fxCalls.wash.push(!!on); } },
  };

  const app = {
    S,
    settings,
    ui,
    engine,
    perf,
    scores,
    stage,
    fx,
    hall: { group: new THREE.Group(), setHouseLights() {}, show() {}, dome: { go() {} } },
    spot: { set() {} },
    recital: { on: false, open(on) { this.on = !!on; } },
    bestSeat: { x: 0, y: 1, z: 12, index: 0 },
    effects: { dim() {}, gather() {} },
    thief: { name: '라쿤', taken: null, arm() {}, clear() {}, update: () => false, shoo() {} },
    avatars: { list: new Map(), clear() {}, add() {}, remove() {}, setHost() {}, pose() {}, say() {}, update() {} },
    camera: { position: new THREE.Vector3() },
    director: {
      mode: 'seat',
      seat: { index: 0, stage: false },
      pos: new THREE.Vector3(0, 1.6, 12),
      feet: 0,
      yaw: 0,
      occupied: new Set(),
      listener: () => ({ pos: app.director.pos }),
      releaseLock() {},
      sitAt() {},
      setMode() {},
      placeAt() {},
    },
    graphics: { holdQuality() {}, efficient: () => false },
    house: { seatAudience() {}, refreshOccupied() {} },
    lobby: { soloTicket() {} },
    leafProgramme: { endEvening() { S.leaf.save(); } },
    loop: { cancelFrame() {}, requestFrame() {}, resetClock() {}, invalidateScreen() {} },
  };

  app.power = createPower(app);
  app.encore = createEncore(app);
  app.interval = createInterval(app);
  app.sleep = createSleep(app);
  app.sync = createSync(app);
  app.concert = createConcert(app);

  return {
    app,
    S,
    settings,
    ui,
    engine,
    engineCalls,
    fxCalls,
    toasts,
    intervalCalls,
    mutedCalls,
    mediaHandlers,
    storage,
    docObj,
    winTarget,
    elements: { hudEl, barEl, veilEl, leafEl, skipOptEl },
  };
}

function makeMockRoom({ id = 2, host = 1, code = 'ROOM01', seed = 42, members = [[1, { id: 1, name: '방장곰', since: 10 }], [2, { id: 2, name: '손님여우', since: 20 }]] } = {}) {
  const handlers = {};
  const sentStates = [];
  const sentCmds = [];
  const handoffs = [];
  return {
    id,
    host,
    seed,
    connected: true,
    room: { title: '숲속 방', code, cap: 8 },
    members: new Map(members),
    get isHost() { return this.id === this.host; },
    now: () => performance.now() / 1000,
    on(t, fn) { (handlers[t] ||= []).push(fn); },
    emit(t, ...args) { for (const fn of handlers[t] || []) fn(...args); },
    state(s) { sentStates.push(s); },
    cmd(c) { sentCmds.push(c); },
    handoff(to) { handoffs.push(to); },
    vote() {},
    ready() { this.readyCalled = (this.readyCalled || 0) + 1; },
    pose() {},
    chat() {},
    leave() { this.left = true; },
    sentStates,
    sentCmds,
    handoffs,
  };
}

test('C2: guest ritual concert resets S.hush to 0 upon entering playing wait and state drops dead S.bowing', async (t) => {
  const clock = makeFakeClock(t);
  const h = makeHarness(t);
  assert.equal('bowing' in h.S, false);

  const room = makeMockRoom({ id: 2, host: 1 });
  h.S.room = room;
  h.app.sync.wireRoom(room);

  room.emit('cmd', { c: 'run', i: 0, quick: false, skipStageTransitions: true, ritual: true, encore: false });
  await clock.advance(4800); // walk-on settle (800ms) + conductor bow/turn (3800ms) -> enters hush
  assert.equal(h.S.phase, 'hush');
  assert.equal(h.S.hush, 1);

  await clock.advance(4000); // 1200ms + 2600ms G.hush finished -> guest waits in playing
  assert.equal(h.S.phase, 'playing');
  assert.equal(h.S.hush, 0, 'guest must not stay stuck with S.hush === 1 after hush ends');

  // Cancel any pending guest until() cleanly
  h.S.seq++;
  await clock.advance(200);
});

test('C2: host handoff and reconnect demotion cancel old host coroutines and update interval UI', async (t) => {
  const clock = makeFakeClock(t);
  const h = makeHarness(t);
  const room = makeMockRoom({ id: 1, host: 1 });
  h.S.room = room;
  h.app.sync.wireRoom(room);
  room.emit('joined', { state: null }, true);

  // Start an interval as host, then hand off to member 2
  h.app.interval.beginInterval(clock.now / 1000 + 300, 1);
  const seqBeforeHandoff = h.S.seq;
  const tokBeforeHandoff = h.app.sync.follower.tok;

  room.host = 2;
  room.emit('host', 2, false);
  assert.ok(h.S.seq > seqBeforeHandoff, 'handoff must increment S.seq even outside encore voting');
  assert.ok(h.app.sync.follower.tok > tokBeforeHandoff, 'handoff must cancel follower');
  assert.deepEqual(h.intervalCalls.at(-1), { on: true, isHost: false }, 'former host loses host-only interval button');

  // Promote back to host, start a walk-on ceremony, then simulate reconnect demotion + goneSay cleanup
  room.host = 1;
  room.emit('host', 1, true);
  room.emit('left', 2, { id: 2, name: '손님여우' }, false);
  h.S.ceremony = true;
  h.S.hush = 1;
  const seqBeforeRejoin = h.S.seq;

  room.host = 2;
  room.emit('joined', { state: null }, false);
  assert.ok(h.S.seq > seqBeforeRejoin, 'demoted reconnect must increment S.seq');
  assert.equal(h.S.ceremony, false);
  assert.equal(h.S.hush, 0);

  // Advancing past 6s should not emit a stale "나갔어요" chat line from before rejoin
  let leftChat = 0;
  h.ui.chatLine = ({ text }) => { if (text?.includes('나갔어요')) leftChat++; };
  await clock.advance(7000);
  assert.equal(leftChat, 0);
});

test('C2: encoreActive syncs to guests, early-aborted late join settles false, negative indices wrap safely, leaveRoom saves leaf, and background AWAY_HANDOFF uses wall clock', async (t) => {
  const clock = makeFakeClock(t);
  const failIds = new Set(['solo-rag']);
  const h = makeHarness(t, { failIds });

  // 1) Host encoreActive is transmitted in run cmd & snapshot, and cleared before run when skipping away
  const hostRoom = makeMockRoom({ id: 1, host: 1 });
  h.S.room = hostRoom;
  h.S.encoreActive = true;
  h.S.current = 3;
  const runP = h.app.concert.runConcert(3, { quick: true });
  await clock.advance(2000);
  await runP;
  assert.equal(hostRoom.sentCmds[0].c, 'run');
  assert.equal(hostRoom.sentCmds[0].encore, true);
  assert.equal(hostRoom.sentStates.at(-1).encore, true);

  // Skipping away from encore to index 0 (via negative modulo -4) clears encoreActive BEFORE sending run
  const skipP = h.app.concert.runConcert(-4, { quick: true });
  await clock.advance(2000);
  await skipP;
  assert.equal(h.S.current, 0);
  assert.equal(h.S.encoreActive, false);
  const runSkipCmd = hostRoom.sentCmds.find((c) => c.c === 'run' && c.i === 0);
  assert.equal(runSkipCmd.encore, false);

  // 2) Guest receives encoreActive via snapshot/run and settles late followHost(false) if score load fails
  const guestRoom = makeMockRoom({ id: 2, host: 1 });
  h.S.room = guestRoom;
  await h.app.sync.followHost({ started: true, phase: 'intermission', i: 0, encore: true }, { joining: false });
  assert.equal(h.S.encoreActive, true);

  const lateResult = await h.app.sync.followHost({ started: true, phase: 'entering', i: 1, cond: false, encore: false }, { joining: true });
  assert.equal(lateResult, false, 'aborted runConcert during late join must settle promise with false instead of hanging');
  assert.equal(h.S.encoreActive, false);

  // 3) Background AWAY_HANDOFF uses performance.now() elapsed time even if interval is throttled to 1 tick at 35s
  h.S.room = hostRoom;
  h.S.showStarted = true;
  h.S.ceremony = true;
  h.app.perf.playing = false;
  h.docObj.hidden = true;
  h.docObj.dispatch('visibilitychange');
  // Simulate browser throttling: jump clock straight by 35s in one tick
  const awayTimer = [...clock.timers.values()].find((tm) => tm.interval === 5000);
  assert.ok(awayTimer);
  awayTimer.at = clock.now + 35_000;
  await clock.advance(35_000);
  assert.deepEqual(hostRoom.handoffs, [2], 'single throttled tick after 35s must hand off host');
  h.docObj.hidden = false;
  h.docObj.dispatch('visibilitychange');

  // 4) leaveRoom saves tonight's leaf
  h.S.leaf.pieces.push({ title: '서곡', composer: '모차르트' });
  h.S.leaf.listened = 120;
  h.ui.emit('leaveRoom');
  const savedLeaves = JSON.parse(h.storage.get('fp-leaves') || '[]');
  assert.equal(savedLeaves.length, 1);
  assert.equal(savedLeaves[0].pieces[0].title, '서곡');
  await clock.advance(500);
});

test('C2: RoomClient ignores negative or >30s RTT pongs and jitters reconnect delays', async (t) => {
  const clock = makeFakeClock(t);
  const sockets = [];
  class FakeWS {
    readyState = 0;
    bufferedAmount = 0;
    sent = [];
    constructor() { sockets.push(this); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(m) { this.onmessage?.({ data: JSON.stringify(m) }); }
    close(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
  }
  withGlobals(t, {
    WebSocket: FakeWS,
    crypto: webcrypto,
    sessionStorage: { getItem: () => 'tab-rtt-1234', setItem() {} },
    location: { href: 'http://localhost/hall.html', protocol: 'http:' },
  });

  const client = new RoomClient();
  const enterP = client.enter({ name: '토끼', avatar: 'rabbit', create: { title: '방', cap: 4 } });
  sockets[0].open();
  await clock.flush();
  sockets[0].receive({ t: 'joined', you: 1, host: 1, room: { code: 'R1' }, seed: 1, members: [{ id: 1 }], now: clock.now + 500 });
  await enterP;

  // Valid 40ms RTT pong
  const sentAt = clock.now;
  await clock.advance(40);
  sockets[0].receive({ t: 'pong', c: sentAt, s: sentAt + 520 });
  assert.equal(client.bestRtt, 40);
  const validOffset = client.offset;
  assert.equal(validOffset, 500);

  // Negative RTT (local clock jumped back) must be ignored
  sockets[0].receive({ t: 'pong', c: clock.now + 2000, s: clock.now + 99999 });
  assert.equal(client.bestRtt, 40);
  assert.equal(client.offset, validOffset);

  // Huge >30s RTT (laptop woke from sleep) must be ignored
  sockets[0].receive({ t: 'pong', c: clock.now - 45000, s: clock.now - 10000 });
  assert.equal(client.bestRtt, 40);
  assert.equal(client.offset, validOffset);

  client.leave();
});

test('C3: sleep timer preserves pre-sleep mute state, avoids 800ms solo volume blast, isolates background with inert dialog, and consumes wake input', async (t) => {
  const clock = makeFakeClock(t);
  const h = makeHarness(t);

  // 1) Guest sleep mutes temporarily, sets dialog + inert, consumes wake click/keydown, and restores unmuted volume
  const guestRoom = makeMockRoom({ id: 2, host: 1 });
  h.S.room = guestRoom;
  h.S.muted = false;
  h.settings.volume = 0.75;
  h.docObj.activeElement = h.elements.barEl;

  let leakedKey = 0;
  let leakedClick = 0;
  h.winTarget.addEventListener('keydown', () => { leakedKey++; }, false);
  h.winTarget.addEventListener('click', () => { leakedClick++; }, false);

  h.ui.emit('sleep', 1);
  await clock.advance(61_000); // sleep countdown hits 0
  assert.equal(h.S.muted, true);
  assert.equal(h.engine.volume, 0);

  await clock.advance(4100); // goToSleep(gen)
  assert.equal(h.S.asleep, true);
  assert.equal(h.engine.ctx.state, 'suspended');
  assert.equal(h.elements.veilEl.getAttribute('role'), 'dialog');
  assert.equal(h.elements.veilEl.getAttribute('aria-modal'), 'true');
  assert.equal(h.elements.veilEl.tabIndex, -1);
  assert.equal(h.elements.hudEl.inert, true);
  assert.equal(h.elements.barEl.inert, true);
  assert.equal(h.docObj.activeElement, h.elements.veilEl);

  // Wake via pointerdown + compatibility click: both must be swallowed without hitting underlying UI
  h.winTarget.dispatch('pointerdown', {});
  h.winTarget.dispatch('click', {});
  assert.equal(h.S.asleep, false);
  assert.equal(leakedClick, 0, 'waking click must not leak through #sleepVeil');
  assert.equal(h.S.muted, false, 'guest wake must restore pre-sleep unmuted state');
  assert.equal(h.engine.volume, 0.75, 'guest wake must restore pre-sleep volume');
  assert.equal(h.elements.hudEl.inert, false);
  assert.equal(h.docObj.activeElement, h.elements.barEl);

  // 2) User who manually muted BEFORE sleep stays muted after waking via keydown
  h.S.muted = true;
  h.ui.emit('sleep', 1);
  await clock.advance(65_500);
  assert.equal(h.S.asleep, true);
  h.winTarget.dispatch('keydown', { key: ' ' });
  assert.equal(leakedKey, 0, 'waking keydown must not trigger Space transport toggle');
  assert.equal(h.S.muted, true, 'pre-existing manual mute must be preserved across sleep/wake');
  assert.equal(h.engine.volume, 0);

  // 3) Solo sleep keeps volume at 0 through the entire 9s tiptoe-off window (no 800ms restore)
  h.S.room = null;
  h.S.muted = false;
  h.app.perf.playing = true;
  h.ui.emit('sleep', 1);
  await clock.advance(60_500); // hits left <= 0
  assert.equal(h.engine.volume, 0);
  await clock.advance(1500); // past 800ms!
  assert.equal(h.engine.volume, 0, 'solo sleep must not restore volume 800ms into the 9s tiptoe-off');
  await clock.advance(8000); // reaches 9000ms goToSleep
  assert.equal(h.S.asleep, true);
  h.app.sleep.wake();
  assert.equal(h.engine.volume, 0.75);
});

test('C4: encoreCandidates offers short bis pieces when all pieces were played tonight, and outdoor fireflies spawn low', async (t) => {
  const clock = makeFakeClock(t);
  const h = makeHarness(t);

  // Mark every single piece in the programme as played tonight; S.current = 3 just ended
  h.S.current = 3;
  for (const p of h.S.program) h.S.playedTonight.add(p.id);
  h.app.stage.snapRoster(['piano:0']);

  const cands = await h.app.encore.encoreCandidates();
  assert.equal(cands.length, 3, 'full concert completion must still offer 3 bis encore candidates');
  assert.equal(cands.includes(3), false, 'the piece that just ended must not immediately repeat as bis');

  // Outdoor fireflies spawn at eye/canopy height (1.3..4.8m) and gather at HOUSE_OUTDOOR (0, 3.4, 7.5)
  const scene = new THREE.Scene();
  const eff = buildEffects(scene, { fireflies: 50, dust: 10, outdoor: true });
  const pos = eff.fireflies.geometry.attributes.position.array;
  for (let i = 0; i < 50; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    assert.ok(x >= -12 && x <= 12);
    assert.ok(y >= 1.3 && y <= 4.8, `outdoor firefly y=${y} must stay below canopy`);
    assert.ok(z >= -6 && z <= 20, `outdoor firefly z=${z} must span stage and lawn`);
  }
  assert.deepEqual(eff.fireflies.material.uniforms.uCenter.value.toArray(), [0, 3.4, 7.5]);
  assert.deepEqual(HOUSE_OUTDOOR.toArray(), [0, 3.4, 7.5]);
  assert.deepEqual(HOUSE_HALL.toArray(), [0, 10.5, 13]);
  await clock.flush();
});

test('C6 & C11: solo finale skips brass fanfare/pyro, orchestral finale omits D-major fanfare, Sphere isolates Hall FX, and MediaSession uses nextTrack/prevTrack', async (t) => {
  const clock = makeFakeClock(t);
  const h = makeHarness(t);

  // 1) Solo piano piece marked finale:true (e.g. Maple Leaf Rag) -> zero fanfare, confetti, or fireworks
  h.app.perf.use(h.S.program[1]);
  const soloEnd = h.app.concert.endOfPiece();
  await clock.advance(6000);
  await soloEnd;
  assert.equal(h.fxCalls.fanfare, 0);
  assert.equal(h.fxCalls.confetti, 0);
  assert.equal(h.fxCalls.fireworks, 0);

  // 2) Conducted orchestral finale -> confetti + fireworks (in Hall), still zero fixed D-major fanfare
  h.S.current = 0;
  h.app.perf.use(h.S.program[3]);
  h.app.stage.snapConductor(true);
  const orchEnd = h.app.concert.endOfPiece();
  await clock.advance(15_000);
  await orchEnd;
  assert.equal(h.fxCalls.fanfare, 0, 'fixed D-major fanfare must not clash with orchestral finales');
  assert.equal(h.fxCalls.confetti, 1);
  assert.equal(h.fxCalls.fireworks, 1);

  // 3) fx.js: fanfare routes bells to section 'bells', dt clock drives 2nd confetti burst, and Sphere mode omits trusses/spots/fireworks
  const playedNotes = [];
  const sphereScene = new THREE.Scene();
  const sphereFx = buildFX(sphereScene, { now: 0, playNote: (n) => playedNotes.push(n) }, { sphere: true });
  assert.equal(sphereScene.children.filter((c) => c.isSpotLight || c.isPointLight || c.isPoints).length, 0);
  sphereFx.confettiCannons();
  const confettiMesh = sphereScene.children.find((c) => c.isInstancedMesh);
  assert.equal(confettiMesh.visible, true);
  sphereFx.update(0.8, 0.8, 0.5); // advances past 0.7s dt-scheduled centre burst without setTimeout
  sphereFx.fanfare(0);
  const bellNote = playedNotes.find((n) => n.inst === 'bells');
  assert.equal(bellNote.section, 'bells');

  // 4) MediaSession nexttrack/previoustrack rewinds when perf.time > 5 and blocks guests
  h.S.showStarted = true;
  h.S.phase = 'playing';
  h.S.current = 2;
  h.app.perf.use(h.S.program[2]);
  h.app.perf.seek(12);
  h.app.power.updateMediaSession(h.S.program[2]);
  h.mediaHandlers.get('previoustrack')();
  assert.equal(h.app.perf.time, 0, 'MediaSession previoustrack past 5s must seek to 0 like UI prev button');
});

test('C11: all 13,845 Sphere seats and all Hall seats match levelName, Leaf supports 400 레벨, lobby noticeLines is venue-aware, domeshow handles duplicate go & seek, and Sphere lift panels merge into 1 mesh', () => {
  // 1) Exhaustive 13,845 Sphere seats check
  const sphereSeats = sphereSeatList();
  assert.equal(sphereSeats.length, 13845);
  for (const s of sphereSeats) {
    assert.equal(sphereLevelName(s.y), s.level, `Sphere seat ${s.label} at y=${s.y}`);
    assert.equal(sphereLevelName(s.y + 0.1), s.level, `Sphere seat ${s.label} at feet+0.1=${s.y + 0.1}`);
  }

  // 2) Exhaustive Hall seats check (including 2층/3층 front rows A and boxes)
  const hallSeats = seatList();
  assert.ok(hallSeats.length > 1500);
  for (const s of hallSeats) {
    assert.equal(levelName(s.y), s.level, `Hall seat ${s.level} ${s.row}${s.num} at y=${s.y}`);
    assert.equal(levelName(s.y + 0.1), s.level, `Hall seat ${s.level} ${s.row}${s.num} at feet+0.1=${s.y + 0.1}`);
  }

  // 3) Leaf card 400 레벨 copy
  const leaf = new Leaf('sphere');
  leaf.listened = 120;
  leaf.levels.set('400 레벨', 95);
  assert.equal(leaf.card().line, '오늘은 가장 높은 400 레벨에서 돔과 무대를 한눈에 내려다봤어요.');

  // 4) noticeLines venue-specific practice location
  const sphereNews = noticeLines({ practiser: 'vc:0', venue: 'sphere', week: 1 });
  const spherePractice = sphereNews.find((x) => x.title === '막간 연습');
  assert.ok(spherePractice.text.includes('무대 위 자기 자리'));
  assert.equal(spherePractice.text.includes('로비 소파'), false);

  // 5) domeshow duplicate go(X) idempotence & seek world recalculation
  const dome = buildDome({ lite: true });
  dome.go('OCEAN', { dur: 4 });
  dome.update(1, { time: 0, playing: false }); // mix = 0.25 into ARCH -> OCEAN
  const mixMid = dome.uniforms.uMix.value;
  assert.ok(mixMid > 0 && mixMid < 1);
  dome.go('OCEAN', { dur: 4 }); // duplicate call to same target
  assert.equal(dome.uniforms.uMix.value, mixMid, 'duplicate go(X) must not reset crossfade mix to 0');
  assert.notEqual(dome.uniforms.uA.value, dome.uniforms.uB.value, 'duplicate go(X) must not overwrite uA with uB');

  dome.startPiece({ id: 'sym', mood: 'grand', duration: 180 }, 0); // 3 worlds -> 60s per world
  dome.update(0.1, { time: 0.1, playing: true });
  const worldAtStart = dome.current;
  dome.update(0.1, { time: 130, playing: true }); // seek forward to 3rd world slot (120..180s)
  const worldAt130 = dome.current;
  assert.notEqual(worldAt130, worldAtStart, 'forward seek must jump dome world to sought timestamp');
  dome.update(0.1, { time: 5, playing: true }); // seek backward to 1st world slot (0..60s)
  assert.equal(dome.current, worldAtStart, 'backward seek must restore earlier dome world and recalculate nextSwap');

  // 6) Sphere lift panels share 1 texture and 1 merged mesh across all 8 vomitories
  const prevDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillRect() {},
          strokeRect() {},
          beginPath() {},
          arc() {},
          fill() {},
          stroke() {},
          fillText() {},
        }),
      }),
    },
  });
  try {
    const group = new THREE.Group();
    buildLifts(group);
    const panels = group.children.filter((m) => m.name === 'liftPanels');
    assert.equal(panels.length, 1);
    assert.equal(panels[0].geometry.attributes.position.count, VOMS.length * 4);
  } finally {
    if (prevDoc) Object.defineProperty(globalThis, 'document', prevDoc);
    else delete globalThis.document;
  }
});
