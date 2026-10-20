// Forest Philharmonic - boot, render loop and the running of the concert.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { AudioEngine } from './audio/engine.js';
import { Performance } from './audio/performance.js';
import { buildHall } from './scene/hall.js';
import { buildOrchestra } from './scene/orchestra.js';
import { buildAudience, animateAudience } from './scene/audience.js';
import { buildEffects } from './scene/effects.js';
import { buildScreen } from './scene/screen.js';
import { buildFX } from './scene/fx.js';
import { StageManager } from './scene/stage.js';
import { Director, ENTRANCE } from './scene/director.js';
import { setAnisotropy } from './scene/materials.js';
import { hallOpenness } from './scene/hallplan.js';
import { SECTIONS, CHOIR_VOICES } from './layout.js';
import { UI } from './ui.js';

// ------------------------------------------------------------- settings
const DEFAULTS = {
  volume: 0.8, reverb: 0.45, quality: 'auto', shuffle: false, repeatOne: false,
  fixedEar: true, applause: true, gap: 7, notes: true, glow: true, fireflies: true,
  fx: true, lasers: true, screen: true, audience: true,
};
const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('fp-settings') || '{}')); } catch { /* private mode */ }
const save = () => { try { localStorage.setItem('fp-settings', JSON.stringify(settings)); } catch { /* ignore */ } };

const isTouch = navigator.maxTouchPoints > 1 && !window.matchMedia('(pointer: fine)').matches;
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (isTouch && window.innerWidth < 900);
const QUALITY = {
  high: { pr: Math.min(window.devicePixelRatio || 1, 2), shadows: true, shadowSize: 2048, bloom: true, msaa: 4, screenEvery: 2 },
  medium: { pr: Math.min(window.devicePixelRatio || 1, 1.25), shadows: true, shadowSize: 1024, bloom: true, msaa: 2, screenEvery: 3 },
  low: { pr: 1, shadows: false, shadowSize: 512, bloom: false, msaa: 0, screenEvery: 4 },
};
let quality = settings.quality === 'auto' ? (isMobile ? 'medium' : 'high') : settings.quality;

// --------------------------------------------------------------- render
const container = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(QUALITY[quality].pr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = QUALITY[quality].shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0806');
scene.fog = new THREE.FogExp2('#140d08', 0.006);
const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 260); // near 0.1: better depth precision, no flicker

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.2;

let composer;
let bloomPass;
function buildComposer() {
  const q = QUALITY[quality];
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (composer) composer.passes.forEach((p) => p.dispose?.());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // only true light sources bloom: bulbs, chandeliers, lasers - never fur
  bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.3, 1.35);
  bloomPass.enabled = q.bloom;
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
}

// ------------------------------------------------------------------ world
const ui = new UI({ settings, onSetting });
ui.touch = isTouch;
ui.setLoading('공연장을 짓는 중', 0.03);

const hall = buildHall({ quality });
scene.add(hall.group);
const orchestra = buildOrchestra(scene);
const stage = new StageManager(orchestra);
let audience = null;
let director = null;
function seatAudience(on) {
  if (audience) { audience.dispose(); audience = null; }
  if (on) {
    // a new crowd every time: who comes, how many, and where they sit
    const exclude = new Set();
    if (director?.seat && director.seat.index >= 0) exclude.add(director.seat.index);
    audience = buildAudience(hall.seats, { exclude });
    scene.add(audience.group);
  }
  if (director) director.occupied = audience ? audience.occupied : new Set();
}
const effects = buildEffects(scene, { fireflies: isMobile ? 90 : 170, dust: isMobile ? 260 : 520 });
const screen = buildScreen(scene, renderer);
director = new Director(camera, renderer.domElement, hall);
director.uiTop = () => ui.bottomUiTop();
director.hoverLook = false; // look by dragging, or click to capture the mouse
seatAudience(settings.audience);
buildComposer();
applyQuality();

const bestSeat = hall.seats.filter((s) => s.level === '1층' && s.row === 'H').sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
const headPositions = orchestra.players.map((p) => p.home.clone().add(new THREE.Vector3(0, 1.25 * p.char.scale, 0)));
headPositions.push(orchestra.conductor.home.clone().add(new THREE.Vector3(0, 1.35, 0)));

// ------------------------------------------------------------------ audio
const engine = new AudioEngine();
const perf = new Performance(engine);
let fx = null;
let program = [];
let current = -1;
let concertStarted = false; // we are inside
let showStarted = false; // the musicians have been called
let muted = false;
let focused = null;
let wakeLock = null;
let phase = 'lobby'; // lobby | entering | tuning | announce | playing | applause | intermission | leaving
let phaseUntil = 0;
let nextPiece = null;
let clapUntil = 0;
let bowing = false;
let seq = 0; // generation token for the concert sequence

async function boot() {
  try {
    await engine.init();
  } catch (e) {
    ui.setLoading('이 브라우저에서는 소리를 낼 수 없어요. 최신 Chrome, Edge, Firefox, Safari에서 열어 주세요.', 0);
    throw e;
  }
  engine.setVolume(settings.volume);
  engine.setReverb(settings.reverb);
  fx = buildFX(scene, engine);
  program = await (await fetch('music/index.json')).json();
  ui.setProgram(program);
  await engine.loadSamples('samples', (done, total) => {
    ui.setLoading(`악기를 조율하는 중  ${done} / ${total}`, 0.08 + 0.85 * (done / total));
  });
  ui.setLoading('객석을 채우는 중', 0.95);
  await new Promise((r) => setTimeout(r, 30));
  engine.prepareApplause();
  current = 0;
  const piece = await perf.load(program[0].id);
  ui.setCurrent(0, piece);
  stage.clearStage();
  ui.ready();
}

ui.on('enter', async () => {
  // fullscreen must be requested inside the click itself
  director.active = true;
  goFullscreen();
  // never wait on the audio context: some browsers settle it late
  try { engine.ctx.resume().catch(() => {}); } catch { /* ignored */ }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
  ui.enter(isTouch);
  // you arrive in the foyer, in front of the doors to the stalls
  director.placeAt(ENTRANCE.pos, ENTRANCE.look);
  director.targetFov = director.fov = 64;
  concertStarted = true;
  hall.setHouseLights(1);
  requestWakeLock();
});

function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      try { navigator.keyboard?.lock?.(['Escape']); } catch { /* unsupported */ }
    })
    .catch(() => {});
}

function startShow() {
  if (!concertStarted || showStarted) return;
  showStarted = true;
  ui.showStarted();
  runConcert(current);
}
ui.on('start', startShow);

// --------------------------------------------------------- concert flow
const wait = (ms, tok) => new Promise((r) => setTimeout(() => r(tok === seq), ms));
const until = (cond, tok, timeout = 60000) => new Promise((r) => {
  const t0 = performance.now();
  const tick = () => {
    if (tok !== seq) return r(false);
    if (cond() || performance.now() - t0 > timeout) return r(true);
    setTimeout(tick, 120);
  };
  tick();
});

function setPhase(p, seconds = 0) {
  phase = p;
  phaseUntil = performance.now() + seconds * 1000;
}

// Start piece i: musicians on stage, conductor in, then play.
async function runConcert(i, { quick = false } = {}) {
  const tok = ++seq;
  if (perf.playing) perf.pause();
  if (quick) { engine.stopApplause(); clapUntil = 0; }
  ui.setPlaying(false);
  bowing = false;
  current = (i + program.length) % program.length;
  const meta = program[current];
  nextPiece = meta;
  const piece = perf.piece?.id === meta.id ? perf.piece : await perf.load(meta.id);
  if (tok !== seq || !piece) return;
  perf.seek(0);
  ui.setCurrent(current, piece);
  ui.setTime(0, piece.duration);
  updateMediaSession(piece);

  if (!stage.onstage) {
    // the orchestra walks on while the audience settles
    setPhase('entering');
    hall.setHouseLights(0.75);
    stage.enterAll();
    if (!(await until(() => stage.allSeated, tok, 90000))) return;
    if (!(await wait(800, tok))) return;
    setPhase('tuning');
    const dur = engine.tuning();
    if (!(await wait(dur * 1000, tok))) return;
  }
  if (piece.conducted) {
    if (!stage.conductorOn) {
      setPhase('announce');
      stage.conductorEnter();
      if (!(await until(() => stage.conductorReady, tok, 30000))) return;
      // greets the audience, a short welcome applause, turns to the orchestra
      if (settings.applause) { engine.applause(engine.now + 0.05, 0.6); clapUntil = performance.now() + 3200; }
      stage.conductorBow(true);
      if (!(await wait(1400, tok))) return;
      stage.conductorBow(false);
      if (!(await wait(900, tok))) return;
      stage.conductorFace(false);
      if (!(await wait(1500, tok))) return;
    } else {
      stage.conductorFace(false);
      if (!(await wait(quick ? 600 : 1200, tok))) return;
    }
  } else if (stage.conductorOn) {
    // a solo or chamber piece: the conductor leaves the stage to the players
    stage.conductorExit();
    if (!(await wait(quick ? 500 : 2500, tok))) return;
  } else if (!(await wait(quick ? 300 : 1200, tok))) return;

  hall.setHouseLights(0.12);
  setPhase('playing');
  if (!(await wait(900, tok))) return;
  perf.play();
  ui.setPlaying(true);
  if (fx) {
    const lively = piece.mood === 'lively' && settings.lasers;
    fx.lasers.set(lively);
    fx.wash.set(lively);
  }
}

perf.onEnd = () => endOfPiece();

async function endOfPiece() {
  const tok = ++seq;
  const piece = perf.piece;
  ui.setPlaying(false);
  setPhase('applause');
  fx?.lasers.set(false);
  fx?.wash.set(false);
  hall.setHouseLights(0.5);
  const big = !!piece?.finale;
  if (settings.applause) {
    engine.applause(engine.now + 0.35, big ? 1.3 : 1);
    clapUntil = performance.now() + (big ? 12500 : 7600);
  }
  if (settings.fx && big && fx) {
    fx.fanfare(engine.now + 0.3);
    fx.confettiCannons();
    setTimeout(() => fx.fireworksShow(), 1500);
  } else if (settings.fx && fx && piece?.mood === 'lively') {
    fx.confettiCannons();
  }
  // bows
  if (!(await wait(600, tok))) return;
  if (stage.conductorOn) {
    stage.conductorFace(true);
    if (!(await wait(900, tok))) return;
    stage.conductorBow(true);
    if (!(await wait(1600, tok))) return;
    stage.conductorBow(false);
    if (!(await wait(700, tok))) return;
    // the conductor turns to the orchestra and they rise together
    stage.conductorFace(false);
    stage.orchestraRise(true);
    if (!(await wait(1300, tok))) return;
    stage.conductorFace(true);
    stage.orchestraBow(true);
    if (!(await wait(1500, tok))) return;
    stage.orchestraBow(false);
    if (!(await wait(800, tok))) return;
    stage.orchestraRise(false);
    stage.conductorBow(true);
    if (!(await wait(1300, tok))) return;
    stage.conductorBow(false);
    if (!(await wait(600, tok))) return;
    stage.conductorExit();
  } else {
    stage.orchestraRise(true);
    if (!(await wait(1300, tok))) return;
    stage.orchestraBow(true);
    if (!(await wait(1500, tok))) return;
    stage.orchestraBow(false);
    if (!(await wait(700, tok))) return;
    stage.orchestraRise(false);
  }
  const lastOfProgram = !settings.repeatOne && !settings.shuffle && current === program.length - 1;
  const next = nextIndex();
  nextPiece = program[next];
  setPhase('intermission', Math.max(2, settings.gap));
  if (lastOfProgram) {
    // end of the programme: everyone leaves, the house comes up, then a new evening begins
    hall.setHouseLights(1);
    stage.exitAll();
    if (!(await until(() => stage.allOffstage, tok, 60000))) return;
    if (!(await wait(4000, tok))) return;
  } else if (!(await wait(Math.max(2, settings.gap) * 1000, tok))) return;
  runConcert(next);
}

function nextIndex() {
  if (settings.repeatOne) return current;
  if (settings.shuffle) {
    let n = current;
    while (program.length > 1 && n === current) n = Math.floor(Math.random() * program.length);
    return n;
  }
  return current + 1;
}

function togglePlay() {
  if (!concertStarted) return;
  if (!showStarted) { startShow(); return; }
  if (phase !== 'playing') {
    // during a break: skip the ceremony and start the coming piece
    runConcert(phase === 'intermission' ? nextIndex() : current, { quick: true });
    return;
  }
  if (perf.playing) {
    perf.pause();
    ui.setPlaying(false);
    hall.setHouseLights(0.4);
  } else {
    if (perf.pos >= perf.duration - 0.1) perf.seek(0);
    perf.play();
    ui.setPlaying(true);
    hall.setHouseLights(0.12);
  }
}

ui.on('toggle', togglePlay);
const showOn = () => { if (!showStarted) { showStarted = true; ui.showStarted(); } };
ui.on('next', () => { if (!concertStarted) return; showOn(); runConcert(settings.shuffle ? nextIndex() : current + 1, { quick: true }); });
ui.on('prev', () => {
  if (!concertStarted) return;
  if (phase === 'playing' && perf.time > 5) { perf.seek(0); return; }
  showOn();
  runConcert(current - 1, { quick: true });
});
ui.on('select', (i) => { if (!concertStarted) return; showOn(); runConcert(i, { quick: true }); });
ui.on('seek', (t) => { if (concertStarted && phase === 'playing') perf.seek(t); });
ui.on('seekKey', (d, e) => {
  if (!concertStarted || phase !== 'playing' || director.mode === 'walk') return;
  e.preventDefault();
  perf.seek(perf.time + d);
});
ui.on('mode', (m) => {
  director.setMode(m);
  if (m === 'cinema') ui.toast('편하게 보기: 지금 선율을 이끄는 악기를 따라가요. 드래그하면 다시 직접 봐요.', 2800);
});
ui.on('sit', () => director.toggleSit());
ui.on('mute', () => {
  muted = !muted;
  engine.setVolume(muted ? 0 : settings.volume);
  ui.toast(muted ? '음소거' : '소리 켬', 1200);
});
ui.on('fullscreen', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
ui.on('unfocus', () => {
  focused = null;
  engine.setFocus(null);
  ui.focus(null);
  director.setMode('walk');
});
ui.on('solo', (on) => engine.setFocus(on && focused ? focused.sid : null));

// sleep timer
let sleepAt = 0;
let sleepFading = false;
ui.on('sleep', (minutes) => {
  sleepAt = minutes ? performance.now() + minutes * 60000 : 0;
  sleepFading = false;
  engine.setVolume(muted ? 0 : settings.volume);
  ui.setSleepLeft(0);
  ui.toast(minutes ? `${minutes}분 뒤에 천천히 소리를 줄이고 멈출게요.` : '끄기 예약을 취소했어요.', 2400);
});
setInterval(() => {
  if (!sleepAt) return;
  const left = sleepAt - performance.now();
  ui.setSleepLeft(Math.max(0, left));
  if (left <= 30000 && !sleepFading && perf.playing) {
    sleepFading = true;
    engine.master.gain.setTargetAtTime(0, engine.now, 8);
  }
  if (left <= 0) {
    sleepAt = 0;
    sleepFading = false;
    seq++;
    if (perf.playing) perf.pause();
    ui.setPlaying(false);
    hall.setHouseLights(0.25);
    setTimeout(() => engine.setVolume(muted ? 0 : settings.volume), 800);
    ui.setSleepLeft(0);
    ui.toast('편안한 밤 되세요. 공연을 멈췄어요.', 4000);
  }
}, 1000);

director.on((type, data) => {
  if (type === 'mode') ui.setMode(data);
  // no seat labels on screen; E (or a double-click) still sits you down.
  // Touch screens keep the plain "앉기" button - it is their only way to sit.
  if (type === 'nearSeat' && isTouch) ui.prompt(data ? '앉기' : null, '앉기');
  if (type === 'pick') onPick(data);
  if (type === 'aim') ui.setAim(data);
  if (type === 'lock') ui.setLocked(data);
  if (type === 'looked') ui.hideLookHint();
  // a click (not a drag) on the hall captures the mouse for free looking
  if (type === 'clickView' && concertStarted && !isTouch) director.requestLock();
});

function onSetting(key, value) {
  settings[key] = value;
  save();
  if (key === 'volume') { muted = false; engine.setVolume(value); }
  if (key === 'reverb') engine.setReverb(value);
  if (key === 'quality') {
    quality = value === 'auto' ? (isMobile ? 'medium' : 'high') : value;
    applyQuality();
  }
  if (key === 'fireflies') effects.setCounts(value);
  if (key === 'screen') screen.setEnabled(value);
  if (key === 'lasers' && !value && fx) { fx.lasers.set(false); fx.wash.set(false); }
  if (key === 'audience') {
    seatAudience(value);
    if (value) ui.toast(`오늘 밤 관객 ${audience.count.toLocaleString()}명이 자리를 잡았어요.`, 2600);
  }
}

function applyQuality() {
  const q = QUALITY[quality];
  renderer.setPixelRatio(q.pr);
  renderer.shadowMap.enabled = q.shadows;
  hall.lights.key.castShadow = q.shadows;
  if (hall.lights.key.shadow.map && hall.lights.key.shadow.mapSize.x !== q.shadowSize) {
    hall.lights.key.shadow.map.dispose();
    hall.lights.key.shadow.map = null;
  }
  hall.lights.key.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.needsUpdate = true; }); } });
  onResize();
  buildComposer();
  effects.setCounts(settings.fireflies);
}

// -------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function hitTest(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  // only musicians who are actually on stage (not waiting behind the doors)
  const hits = raycaster.intersectObjects(orchestra.pickables.filter((o) => o.visible), true);
  const seatHit = raycaster.intersectObject(hall.seatMesh, false)[0];
  let player = null;
  let dist = Infinity;
  if (hits.length) {
    let o = hits[0].object;
    while (o && !orchestra.pickables.includes(o)) o = o.parent;
    player = orchestra.players.find((p) => p.char.root === o) || (o === orchestra.conductor.char.root ? 'conductor' : null);
    dist = hits[0].distance;
  }
  if (seatHit && seatHit.distance < dist) return { seat: hall.seats[seatHit.instanceId], dist: seatHit.distance };
  return { player, dist };
}

function describe(player) {
  if (player === 'conductor') return { name: '부엉 선생', role: '지휘자' };
  const spec = player.char.spec;
  const role = player.sid === 'choir' ? `합창단 ${CHOIR_VOICES[player.ci]}` : `${SECTIONS[player.sid].ko}${spec.title ? ` (${spec.title})` : ''}`;
  return { name: spec.name, role };
}

function onPick({ x, y }) {
  const h = hitTest(x, y);
  if (h.player && h.player !== 'conductor') {
    focused = h.player;
    director.focusPlayer(h.player);
    const d = describe(h.player);
    ui.focus(`${d.name}, ${d.role}`);
    engine.setFocus(null);
  } else if (h.seat) {
    if (director.occupied.has(h.seat.index)) {
      ui.toast(`${h.seat.label}에는 이미 관객이 앉아 있어요.`, 2200);
      return;
    }
    if (h.dist > 6) { ui.toast('좀 더 가까이 가서 앉아 보세요.', 1800); return; }
    focused = null;
    ui.focus(null);
    engine.setFocus(null);
    director.sitAt(h.seat);
  }
}

let hoverT = 0;
function hover(x, y) {
  const h = hitTest(x, y);
  if (director.locked || director.aiming) {
    // what the crosshair rests on
    ui.target(h.player ? describe(h.player) : null);
    return;
  }
  hoverAt(h, x, y);
}
setInterval(() => { if ((director.locked || director.aiming) && concertStarted) hover(window.innerWidth / 2, window.innerHeight / 2); }, 160);
renderer.domElement.addEventListener('pointermove', (e) => {
  if (isTouch || director.locked || director.aiming) return;
  const now = performance.now();
  if (now - hoverT < 90 || e.buttons) return;
  hoverT = now;
  hover(e.clientX, e.clientY);
});
function hoverAt(h, x, y) {
  const e = { clientX: x, clientY: y };
  if (h.player) {
    ui.tooltip(describe(h.player), e.clientX, e.clientY);
    renderer.domElement.style.cursor = 'pointer';
  } else {
    ui.tooltip(null);
    renderer.domElement.style.cursor = '';
  }
}
renderer.domElement.addEventListener('pointerleave', () => ui.tooltip(null));

// -------------------------------------------------------- media & power
function updateMediaSession(piece) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: piece.titleKo, artist: `${piece.composerKo} · 숲속 필하모닉`, album: piece.ensembleKo });
    navigator.mediaSession.setActionHandler('play', () => { if (!perf.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (perf.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => runConcert(current + 1, { quick: true }));
    navigator.mediaSession.setActionHandler('previoustrack', () => runConcert(current - 1, { quick: true }));
  } catch { /* unsupported handler */ }
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* denied or unsupported */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && concertStarted && (!wakeLock || wakeLock.released)) requestWakeLock();
});

// ------------------------------------------------------------- resize
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
  }
}
window.addEventListener('resize', onResize);

// ------------------------------------------------------------ main loop
let lastNow = performance.now();
let wallT = 0;
let fpsAcc = 0;
let fpsFrames = 0;
let lowStreak = 0;
let levelSmoothed = 0;
const levelBuf = new Uint8Array(512);
let introT = 0;

function frame() {
  const nowMs = performance.now();
  const dt = Math.min(window.__fpMaxDt || 0.05, (nowMs - lastNow) / 1000);
  lastNow = nowMs;
  wallT += dt;
  const wall = wallT;
  const t = perf.time;

  let events = null;
  if (perf.piece) events = perf.updateVisual(t);
  const running = perf.playing;
  orchestra.update(t, dt, perf, { running, particles: settings.notes, glow: settings.glow, events, bowing });
  stage.update(dt);
  hall.update(dt, wall);
  effects.update(wall);
  director.joy.x = ui.joy.x;
  director.joy.y = ui.joy.y;
  animateAudience(wall, dt, performance.now() < clapUntil);

  if (!concertStarted) {
    // slow establishing shot behind the splash
    introT += dt;
    const a = introT * 0.05;
    director.pos.set(Math.sin(a) * 9, 9 + Math.sin(a * 0.7) * 2, 14 + Math.cos(a) * 7);
    const la = director.lookAt(new THREE.Vector3(0, 3.2, -5));
    director.yaw = la.yaw;
    director.pitch = la.pitch;
    director.anim = null;
    camera.position.copy(director.pos);
    camera.quaternion.setFromEuler(new THREE.Euler(director.pitch, director.yaw, 0, 'YXZ'));
  } else {
    director.update(dt, { time: t, perf, obstacles: headPositions });
  }

  if (engine.ctx) {
    const L = director.listener(settings.fixedEar ? bestSeat : null);
    engine.setListener(L.pos, L.fwd, L.up);
    engine.setRoom(concertStarted ? hallOpenness(L.pos.x, L.pos.y, L.pos.z) : 1);
    engine.analyser.getByteTimeDomainData(levelBuf);
    let sum = 0;
    for (let i = 0; i < levelBuf.length; i += 4) { const v = (levelBuf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / (levelBuf.length / 4));
    levelSmoothed += (rms - levelSmoothed) * 0.2;
    ui.level = perf.playing ? levelSmoothed : levelSmoothed * 0.5;
  }
  if (perf.piece) ui.setTime(Math.min(perf.duration, t), perf.duration);
  if (fx) fx.update(dt, wall, levelSmoothed);
  if (settings.screen && concertStarted) {
    screen.update(dt, { perf, time: t, phase, nextPiece }, QUALITY[quality].screenEvery);
  }

  composer.render(dt);

  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc > 3) {
    const fps = fpsFrames / fpsAcc;
    ui.setFps(fps, quality);
    if (settings.quality === 'auto' && concertStarted) {
      if (fps < 36) lowStreak++; else lowStreak = 0;
      if (lowStreak >= 2 && quality !== 'low') {
        quality = quality === 'high' ? 'medium' : 'low';
        applyQuality();
        ui.toast(`부드럽게 보이도록 화질을 '${quality === 'medium' ? '보통' : '낮음'}'으로 낮췄어요.`, 2600);
        lowStreak = 0;
      }
    }
    fpsAcc = 0;
    fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

boot().catch((e) => {
  console.error(e);
  ui.setLoading(`불러오지 못했어요: ${e.message}. 서버가 켜져 있는지 확인하고 새로고침해 주세요.`, 0);
});

window.__fp = {
  scene, camera, renderer, engine, perf, director, orchestra, hall, stage, settings, get phase() { return phase; }, get audience() { return audience; }, startShow,
  triggerFinaleFx() { if (!fx) return; fx.fanfare(); fx.confettiCannons(); fx.fireworksShow(); clapUntil = performance.now() + 8000; },
  setLasers(on) { fx?.lasers.set(on); fx?.wash.set(on); },
};
