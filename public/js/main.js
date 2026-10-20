// Forest Philharmonic - boot, render loop and concert flow.
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
import { buildAudience } from './scene/characters.js';
import { buildEffects } from './scene/effects.js';
import { Director } from './scene/director.js';
import { setAnisotropy } from './scene/materials.js';
import { SECTIONS } from './layout.js';
import { UI } from './ui.js';

// ------------------------------------------------------------- settings
const DEFAULTS = {
  volume: 0.8, reverb: 0.45, quality: 'auto', shuffle: false, repeatOne: false,
  fixedEar: true, applause: true, gap: 7, notes: true, glow: true, fireflies: true,
};
const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('fp-settings') || '{}')); } catch { /* private mode */ }
const save = () => { try { localStorage.setItem('fp-settings', JSON.stringify(settings)); } catch { /* ignore */ } };

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
const QUALITY = {
  high: { pr: Math.min(window.devicePixelRatio || 1, 2), shadows: true, shadowSize: 2048, bloom: true, msaa: 4 },
  medium: { pr: Math.min(window.devicePixelRatio || 1, 1.25), shadows: true, shadowSize: 1024, bloom: true, msaa: 2 },
  low: { pr: 1, shadows: false, shadowSize: 512, bloom: false, msaa: 0 },
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
scene.fog = new THREE.FogExp2('#140d08', 0.0105);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 220);
camera.position.set(0, 9, 30);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.2;

let composer;
let bloomPass;
function buildComposer() {
  const q = QUALITY[quality];
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
  composer?.dispose?.();
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.55, 0.95);
  bloomPass.enabled = q.bloom;
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

// ------------------------------------------------------------------ world
const ui = new UI({ settings, onSetting });
ui.setLoading('공연장을 짓는 중', 0.03);

const hall = buildHall({ quality });
scene.add(hall.group);
const orchestra = buildOrchestra(scene);
const audience = buildAudience(hall.seats, 0.42);
scene.add(audience.group);
const effects = buildEffects(scene, { fireflies: isMobile ? 90 : 170, dust: isMobile ? 260 : 520 });
const director = new Director(camera, renderer.domElement, hall);
buildComposer();
applyQuality();
ui.buildSeatMap(hall.seats);

const bestSeat = hall.seats.find((s) => s.level === '1층' && s.row === 'G' && Math.abs(s.x) < 0.35);

// ------------------------------------------------------------------ audio
const engine = new AudioEngine();
const perf = new Performance(engine);
let program = [];
let current = -1;
let concertStarted = false;
let intermission = null;
let bowing = false;
let clapUntil = 0;
let muted = false;
let focused = null;
let wakeLock = null;

async function boot() {
  try {
    await engine.init();
  } catch (e) {
    ui.setLoading('이 브라우저에서는 소리를 낼 수 없어요. 최신 Chrome, Edge, Firefox, Safari에서 열어 주세요.', 0);
    throw e;
  }
  engine.setVolume(settings.volume);
  engine.setReverb(settings.reverb);
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
  ui.ready();
}

ui.on('enter', async () => {
  try { await engine.ctx.resume(); } catch { /* ignored */ }
  ui.enter();
  director.sitAt(bestSeat, 4.5);
  concertStarted = true;
  requestWakeLock();
  startPiece(current, 3.5);
});

// --------------------------------------------------------- concert flow
async function startPiece(i, delay = 2.0) {
  clearTimeout(intermission);
  intermission = null;
  bowing = false;
  if (perf.playing) perf.stop();
  current = (i + program.length) % program.length;
  const piece = perf.piece?.id === program[current].id ? perf.piece : await perf.load(program[current].id);
  perf.seek(0);
  ui.setCurrent(current, piece);
  ui.setTime(0, piece.duration);
  updateMediaSession(piece);
  hall.setHouseLights(0.12);
  intermission = setTimeout(() => {
    intermission = null;
    perf.play();
    ui.setPlaying(true);
  }, delay * 1000);
}

perf.onEnd = () => {
  ui.setPlaying(false);
  hall.setHouseLights(0.55);
  if (settings.applause) {
    engine.applause(engine.now + 0.5);
    clapUntil = performance.now() + 7000;
  }
  bowing = !!perf.piece?.conducted;
  setTimeout(() => { bowing = false; }, 4500);
  intermission = setTimeout(() => {
    intermission = null;
    startPiece(nextIndex(), 2.6);
  }, Math.max(2, settings.gap) * 1000 + 2500);
};

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
  if (intermission) {
    clearTimeout(intermission);
    intermission = null;
    perf.play();
    ui.setPlaying(true);
    hall.setHouseLights(0.12);
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
ui.on('next', () => concertStarted && startPiece(settings.shuffle ? nextIndex() : current + 1, 1.2));
ui.on('prev', () => {
  if (!concertStarted) return;
  if (perf.time > 5) { perf.seek(0); return; }
  startPiece(current - 1, 1.2);
});
ui.on('select', (i) => concertStarted && startPiece(i, 1.2));
ui.on('seek', (t) => { if (concertStarted) perf.seek(t); });
ui.on('seekKey', (d, e) => {
  if (!concertStarted || director.mode === 'walk') return;
  e.preventDefault();
  perf.seek(perf.time + d);
});
ui.on('mode', (m) => {
  director.setMode(m);
  if (m === 'walk') ui.toast('WASD로 걷고, 드래그로 둘러봐요. G를 누르면 날 수 있어요.', 3200);
  if (m === 'cinema') ui.toast('자동 연출: 지금 선율을 이끄는 악기를 따라가요.', 2600);
});
ui.on('seatPreset', (id) => { director.sitPreset(id); });
ui.on('stageSpot', (id) => { director.stageSpot(id); });
ui.on('seat', (s) => director.sitAt(s));
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
  director.sitAt(director.lastSeat || bestSeat);
});
ui.on('solo', (on) => engine.setFocus(on && focused ? focused.sid : null));

director.on((type, data) => {
  if (type === 'mode') {
    ui.setMode(data);
    if (data !== 'seat') ui.setSeatLabel(data === 'walk' ? '자유롭게 걷는 중' : data === 'orbit' ? '무대 둘러보기' : '자동 연출');
  }
  if (type === 'seat') {
    ui.setSeatLabel(data.label);
    if (data.index >= 0) director.lastSeat = data;
  }
  if (type === 'fly') ui.toast(data ? '날기 모드: Q/E로 오르내려요' : '걷기 모드', 1600);
  if (type === 'pick') onPick(data, true);
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
  const hits = raycaster.intersectObjects(orchestra.pickables, true);
  const seatHit = raycaster.intersectObject(hall.seatMesh, false)[0];
  let player = null;
  let dist = Infinity;
  if (hits.length) {
    let o = hits[0].object;
    while (o && !orchestra.pickables.includes(o)) o = o.parent;
    player = orchestra.players.find((p) => p.char.root === o) || (o === orchestra.conductor.char.root ? 'conductor' : null);
    dist = hits[0].distance;
  }
  if (seatHit && seatHit.distance < dist) return { seat: hall.seats[seatHit.instanceId] };
  return { player };
}

function describe(player) {
  if (player === 'conductor') return { name: '부엉 선생', role: '지휘자' };
  const spec = player.char.spec;
  return { name: spec.name, role: `${SECTIONS[player.sid].ko}${spec.title ? ` (${spec.title})` : ''}` };
}

function onPick({ x, y }, dbl) {
  const h = hitTest(x, y);
  if (h.player && h.player !== 'conductor' && dbl) {
    focused = h.player;
    director.focusPlayer(h.player);
    const d = describe(h.player);
    ui.focus(`${d.name}, ${d.role}`);
    engine.setFocus(null);
  } else if (h.seat && dbl) {
    if (audience.occupied.has(h.seat.index)) {
      ui.toast(`${h.seat.label}에는 이미 관객이 앉아 있어요. 옆 빈자리를 골라 주세요.`, 2400);
      return;
    }
    focused = null;
    ui.focus(null);
    engine.setFocus(null);
    director.sitAt(h.seat);
  }
}

let hoverT = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  const now = performance.now();
  if (now - hoverT < 90 || e.buttons) return;
  hoverT = now;
  const h = hitTest(e.clientX, e.clientY);
  if (h.player) {
    ui.tooltip(describe(h.player), e.clientX, e.clientY);
    renderer.domElement.style.cursor = 'pointer';
  } else if (h.seat && !audience.occupied.has(h.seat.index)) {
    ui.tooltip({ name: h.seat.label, role: '두 번 눌러 앉기' }, e.clientX, e.clientY);
    renderer.domElement.style.cursor = 'pointer';
  } else {
    ui.tooltip(null);
    renderer.domElement.style.cursor = '';
  }
});
renderer.domElement.addEventListener('pointerleave', () => ui.tooltip(null));

// -------------------------------------------------------- media & power
function updateMediaSession(piece) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: piece.titleKo, artist: `${piece.composerKo} · 숲속 필하모닉`, album: piece.ensembleKo });
    navigator.mediaSession.setActionHandler('play', () => { if (!perf.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (perf.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => startPiece(current + 1, 1.2));
    navigator.mediaSession.setActionHandler('previoustrack', () => startPiece(current - 1, 1.2));
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
  orchestra.update(t, dt, perf, {
    running: perf.playing || (perf.piece && t > 0 && t < perf.duration && !intermission),
    particles: settings.notes,
    glow: settings.glow,
    events,
    bowing,
  });
  hall.update(dt, wall);
  effects.update(wall);
  const clapping = performance.now() < clapUntil;
  if (fpsFrames % 2 === 0 || clapping) audience.place(wall, clapping, director.seat?.index ?? -1);

  if (!concertStarted) {
    // slow establishing shot behind the splash
    introT += dt;
    const a = introT * 0.05;
    director.pos.set(Math.sin(a) * 12, 7 + Math.sin(a * 0.7), 18 + Math.cos(a) * 6);
    const la = director.lookAt(new THREE.Vector3(0, 2.4, -5));
    director.yaw = la.yaw;
    director.pitch = la.pitch;
  }
  director.update(dt, { time: t, perf });

  if (engine.ctx) {
    const L = director.listener(settings.fixedEar ? bestSeat : null);
    engine.setListener(L.pos, L.fwd, L.up);
    // audio level for the vibrating string
    engine.analyser.getByteTimeDomainData(levelBuf);
    let sum = 0;
    for (let i = 0; i < levelBuf.length; i += 4) { const v = (levelBuf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / (levelBuf.length / 4));
    levelSmoothed += (rms - levelSmoothed) * 0.2;
    ui.level = perf.playing ? levelSmoothed : levelSmoothed * 0.5;
  }
  if (perf.piece) ui.setTime(Math.min(perf.duration, t), perf.duration);

  composer.render(dt);

  // adaptive quality
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

// handy for debugging from the console
window.__fp = { scene, camera, renderer, engine, perf, director, orchestra, hall, settings };
