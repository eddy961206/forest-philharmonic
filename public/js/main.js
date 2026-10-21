// Forest Philharmonic - boot, render loop and the running of the concert.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// the venue first: the Sphere takes over the walking plan before anything reads it
import { IS_SPHERE, VENUE, VENUES, goVenue } from './scene/venue.js';
import { SPHERE_ACOUSTICS, SP } from './scene/sphereplan.js';
import { buildSphere } from './scene/sphere.js';
import { SPHERE_SETLIST, visualsFor } from './scene/domeshow.js';

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
import { setAnisotropy, setLite } from './scene/materials.js';
import { hallOpenness, levelName, HALL, LEVELS, HALL_DOORS, HALL_DOOR_W, HALL_DOOR_H } from './scene/hallplan.js';
import { SECTIONS, CHOIR_VOICES } from './layout.js';
import { UI } from './ui.js';
import { RoomClient, listRooms } from './net/room.js';
import { ensembleOf, GRAMMAR, Spotlight, rosterCentre, Leaf } from './evening.js';
import { Avatars, AVATARS, randomIdentity } from './scene/avatars.js';

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
  high: { pr: Math.min(window.devicePixelRatio || 1, 2), shadows: true, shadowSize: 2048, bloom: true, msaa: 4, screenEvery: 2, post: true },
  medium: { pr: Math.min(window.devicePixelRatio || 1, 1.25), shadows: true, shadowSize: 1024, bloom: true, msaa: 2, screenEvery: 3, post: true },
  // phones: no post-processing pass, no shadows, the big screen redrawn
  // only every ~1.5 s at a small size
  low: { pr: Math.min(window.devicePixelRatio || 1, 1.25), shadows: false, shadowSize: 512, bloom: false, msaa: 0, screenEvery: 90, post: false },
};
let quality = settings.quality === 'auto' ? (isMobile ? 'low' : 'high') : settings.quality;
// Lite build (phones, or 'low' chosen): simpler seats, a smaller crowd, far
// fewer lights, plain materials, lighter audio. Decided once at load.
const LITE = isMobile || quality === 'low';
let renderScale = 1; // phones: lowered further while the frame rate is poor
// automatic quality (see autoQuality)
const AUTO_TOP = isMobile ? 'low' : 'high';
let lowStreak = 0;
let goodStreak = 0;
let qualityHold = 0;
let raisedAt = -1e9;
let raiseBlocked = false;
let interiorShown = true; // the house, seen from the foyer (see interiorCull)

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
setAnisotropy(Math.min(LITE ? 2 : 8, renderer.capabilities.getMaxAnisotropy()));
setLite(LITE);

const scene = new THREE.Scene();
scene.background = new THREE.Color(IS_SPHERE ? '#000000' : '#0b0806');
// the Sphere is a black bowl lit by its screen: only a trace of haze
scene.fog = IS_SPHERE ? new THREE.FogExp2('#06070b', 0.0028) : new THREE.FogExp2('#140d08', 0.006);
const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 260); // near 0.1: better depth precision, no flicker

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
// (the Sphere is a black room: the bright studio reflections would glow)
scene.environmentIntensity = IS_SPHERE ? 0.05 : 0.2;

let composer;
let bloomPass;
function buildComposer() {
  const q = QUALITY[quality];
  if (composer) { composer.passes.forEach((p) => p.dispose?.()); composer.renderTarget1?.dispose(); composer.renderTarget2?.dispose(); }
  if (!q.post) { composer = null; return; } // render straight to the screen
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
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

const hall = IS_SPHERE ? buildSphere({ quality, lite: LITE, renderer }) : buildHall({ quality, lite: LITE });
scene.add(hall.group);
const orchestra = buildOrchestra(scene);
const stage = new StageManager(orchestra);
const spot = new Spotlight(hall.lights, scene); // a recital: the key light gathers on the soloist
let audience = null;
let director = null;
let room = null; // RoomClient while watching together
const avatars = new Avatars(scene, hall.seats); // the other people in the room

// a small seeded random generator: the same numbers on every screen
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seatAudience(on) {
  if (audience) { audience.dispose(); audience = null; }
  if (on) {
    // a new crowd every time: who comes, how many, and where they sit
    // (in a room: the same crowd for everyone)
    const exclude = new Set();
    if (director?.seat && director.seat.index >= 0) exclude.add(director.seat.index);
    const rand = room ? seeded(room.seed) : Math.random;
    // the Sphere sells out: thousands of guests, drawn in full only near you
    const big = IS_SPHERE ? { fill: 0.62 + rand() * 0.3, detail: LITE ? 80 : 220, mid: LITE ? 0 : 900, cap: LITE ? 2500 : Infinity } : {};
    audience = buildAudience(hall.seats, { exclude, lite: LITE, rand, reserveAll: !!room, ...big });
    audience.updateLOD?.(camera.position, true);
    audience.group.visible = interiorShown;
    scene.add(audience.group);
    holdQuality();
  }
  refreshOccupied();
}
// (no fireflies indoors at the Sphere - only dust in the light)
const effects = buildEffects(scene, { fireflies: IS_SPHERE ? 0 : LITE ? 40 : 170, dust: LITE ? 140 : 520 });
// in the Sphere the broadcast goes up on the dome (IMAG) instead of a screen
// of its own; the dome stops sampling the picture while it is being drawn
const screen = buildScreen(scene, renderer, IS_SPHERE ? {
  lite: LITE,
  headless: true,
  before: () => hall.dome.setLive(null, null),
  after: () => hall.dome.setLive(screen.texture, screen.capTex),
} : { lite: LITE });
if (IS_SPHERE) {
  hall.dome.setLive(screen.texture, screen.capTex);
  // the 3D worlds are drawn only where these cameras can see the dome
  // (the broadcast cuts between shots of the stage: its faces are fixed -
  // everything but behind the house and under the floor)
  hall.dome.setViewers([{ cam: camera }, { faces: 1 | 2 | 4 | 32, when: () => hall.dome.liveActive }]);
}
director = new Director(camera, renderer.domElement, hall);
director.uiTop = () => ui.bottomUiTop();
director.hoverLook = false; // look by dragging, or click to capture the mouse
seatAudience(settings.audience);
buildComposer();
applyQuality();

// where the ear sits while the camera roams (cinema): 1층 H열, or the
// Sphere's sweet spot in section 204
const bestSeat = (IS_SPHERE
  ? hall.seats.filter((s) => s.section === '204' && s.row === '8')
  : hall.seats.filter((s) => s.level === '1층' && s.row === 'H')).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
const headPositions = orchestra.players.map((p) => p.home.clone().add(new THREE.Vector3(0, 1.25 * p.char.scale, 0)));
headPositions.push(orchestra.conductor.home.clone().add(new THREE.Vector3(0, 1.35, 0)));

// ------------------------------------------------------------------ audio
const engine = new AudioEngine();
const perf = new Performance(engine);
let fx = null;
let program = [];
let eveningLen = 0; // the evening's programme (the rest can still be picked)
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
let ritualNext = false; // the next piece opens one of the evening's big moments (a held hush)
let hush = 0; // the house holds its breath (0..1)
let leaf = new Leaf(VENUE); // tonight, for the leaf programme

async function boot() {
  try {
    await engine.init({ lite: LITE, acoustics: IS_SPHERE ? SPHERE_ACOUSTICS : null });
  } catch (e) {
    ui.setLoading('이 브라우저에서는 소리를 낼 수 없어요. 최신 Chrome, Edge, Firefox, Safari에서 열어 주세요.', 0);
    throw e;
  }
  engine.setVolume(settings.volume);
  engine.setReverb(settings.reverb);
  fx = buildFX(scene, engine);
  program = await (await fetch('music/index.json')).json();
  if (IS_SPHERE) {
    // tonight's show at the Sphere first, then everything else on request
    const byId = new Map(program.map((p) => [p.id, p]));
    const set = SPHERE_SETLIST.map((id) => byId.get(id)).filter(Boolean);
    program = [...set, ...program.filter((p) => !SPHERE_SETLIST.includes(p.id))];
    eveningLen = set.length;
  } else eveningLen = program.length;
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

ui.on('enter', async (opt) => {
  try { localStorage.setItem('fp-identity', JSON.stringify({ name: opt.name, avatar: opt.avatar })); } catch { /* private mode */ }
  // fullscreen and sound must be started inside the click itself
  goFullscreen();
  // never wait on the audio context: some browsers settle it late
  try { engine.ctx.resume().catch(() => {}); } catch { /* ignored */ }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
  if (opt.mode !== 'solo') {
    ui.lobbyBusy(true);
    room = new RoomClient();
    wireRoom(room);
    try {
      await room.enter({ name: opt.name, avatar: opt.avatar, venue: VENUE, code: opt.code, create: opt.mode === 'create' ? { title: opt.title, cap: opt.cap, pub: opt.pub } : null });
    } catch (e) {
      if (e.code === 'venue' && VENUES[e.venue]) {
        // the room is in the other building: go there (the invite comes along)
        room.leave();
        ui.lobbyError(e.message);
        setTimeout(() => goVenue(e.venue, { room: opt.code }), 700);
        return;
      }
      room.leave();
      room = null;
      ui.lobbyBusy(false);
      ui.lobbyError(e.message || '방에 들어가지 못했어요.');
      refreshRooms();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      return;
    }
    ui.lobbyBusy(false);
  }
  director.active = true;
  ui.enter(isTouch);
  // you arrive in the foyer, in front of the doors to the stalls
  director.placeAt(ENTRANCE.pos, ENTRANCE.look);
  director.targetFov = director.fov = 64;
  concertStarted = true;
  holdQuality(6000);
  hall.setHouseLights(1);
  requestWakeLock();
  if (room && !room.isHost && pendingJoin !== undefined) followHost(pendingJoin, { joining: true });
  pendingJoin = undefined;
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
  if (!concertStarted || showStarted || hostOnly()) return;
  showStarted = true;
  ui.showStarted();
  ritualNext = true;
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
  if (p !== phase) holdQuality();
  phase = p;
  phaseUntil = performance.now() + seconds * 1000;
  // the Sphere's dome follows the evening
  if (p === 'playing') hall.show?.('playing', { piece: perf.piece, time: perf.time });
  publish();
}

// ---------------------------------------------------------------- rosters
// Who plays each piece, from its tracks ('section:chair'; a track may name
// its chairs). Between pieces those not wanted - and not wanted by the
// piece after either - leave, and those missing come on.
const rosterCache = new Map();
function rosterOf(piece) {
  const set = new Set();
  for (const tr of piece?.tracks || []) {
    const chairs = tr.chairs || SECTIONS[tr.section]?.chairs.map((_, k) => k) || [];
    for (const ci of chairs) set.add(`${tr.section}:${ci}`);
  }
  return set;
}
async function rosterFor(i) {
  const meta = program[i];
  if (!meta) return new Set();
  if (rosterCache.has(meta.id)) return rosterCache.get(meta.id);
  let r = new Set();
  try {
    const piece = perf.piece?.id === meta.id ? perf.piece : await (await fetch(`music/${meta.id}.json`)).json();
    r = rosterOf(piece);
  } catch { /* offline: keep everyone */ }
  rosterCache.set(meta.id, r);
  return r;
}
// the piece that normally follows i (the evening's order)
const seqNext = (i) => (i === eveningLen - 1 ? 0 : (i + 1) % program.length);
const STRINGS = /^(vn1|vn2|va|vc|cb):/;

// Start piece i: musicians on stage, conductor in, then play.
// remote: a guest following the host's 'run' (the host starts the music)
async function runConcert(i, { quick = false, remote = false } = {}) {
  const tok = ++seq;
  ceremony = true;
  if (perf.playing) perf.pause();
  if (quick) { engine.stopApplause(); clapUntil = 0; }
  ui.setPlaying(false);
  bowing = false;
  current = (i + program.length) % program.length;
  const meta = program[current];
  nextPiece = meta;
  if (!remote) sendCmd({ c: 'run', i: current, quick, ritual: ritualNext && !quick });
  const piece = perf.piece?.id === meta.id ? perf.piece : await perf.load(meta.id);
  if (tok !== seq || !piece) return;
  perf.seek(0);
  ui.setCurrent(current, piece);
  ui.setTime(0, piece.duration);
  updateMediaSession(piece);

  // the players for this piece: whoever is not needed (now or next) walks
  // off, then whoever is missing walks on - the orchestra filling up, a
  // pianist alone at the keyboard, the choir arriving for a chorale
  const target = rosterOf(piece);
  const keep = await rosterFor(seqNext(current));
  if (tok !== seq) return;
  const fresh = !stage.onstage;
  const kind = ensembleOf(piece, target);
  const G = GRAMMAR[kind];
  spot.set(null);
  const { exits, enters } = stage.plan(target, keep);
  if (quick && (exits.length || enters.length)) {
    // skipping ahead: no procession, the stage straight as it should be
    const keys = new Set([...stage.onstageKeys()].filter((k) => target.has(k) || keep.has(k)));
    for (const k of target) keys.add(k);
    stage.snapRoster(keys);
  } else {
    if (exits.length) {
      setPhase('changing');
      hall.setHouseLights(0.6);
      stage.sendOff(exits);
      if (!(await until(() => stage.gone(exits), tok, 90000))) return;
    }
    if (enters.length) {
      // they walk on while the audience settles
      setPhase('entering');
      hall.setHouseLights(0.75);
      // a soloist (or a duo) walks on to stand at their place for the welcome
      const soloists = !piece.conducted && enters.length <= 3;
      stage.callOn(enters, undefined, { stand: soloists });
      if (!(await until(() => stage.arrived(enters), tok, 90000))) return;
      if (!(await wait(800, tok))) return;
      if (enters.length >= 6 && enters.some((w) => STRINGS.test(StageManager.key(w)))) {
        // most of the orchestra has come on: the strings tune to the oboe
        setPhase('tuning');
        const dur = engine.tuning();
        if (!(await wait(dur * 1000, tok))) return;
      } else if (soloists) {
        // ... is welcomed with applause, bows, and sits down to play
        setPhase('announce');
        if (settings.applause) { engine.applause(engine.now + 0.05, 0.5); clapUntil = performance.now() + 2800; }
        stage.greet(enters, true);
        if (!(await wait(1400, tok))) return;
        stage.greet(enters, false);
        if (!(await wait(1300, tok))) return;
      }
    } else if (fresh) {
      if (!(await wait(400, tok))) return;
    }
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

  // a recital: the light gathers on the soloist
  if (kind === 'solo') spot.set(rosterCentre(target));
  if (ritualNext && !quick) {
    // one of the evening's big moments: the lights go down, the house holds
    // its breath, and only then the first note
    ritualNext = false;
    setPhase('hush');
    hall.setHouseLights(0.3);
    hush = 1;
    if (!(await wait(1200, tok))) { hush = 0; return; }
    hall.setHouseLights(G.house);
    if (!(await wait(G.hush * 1000, tok))) { hush = 0; return; }
  }
  ritualNext = false;
  hall.setHouseLights(G.house);
  setPhase('playing');
  if (remote || guest()) {
    // the host starts the music; we join on its clock (see applyPlayback).
    // If the host leaves first and we take over, we start it ourselves.
    ceremony = false;
    if (!(await until(() => perf.playing || !guest(), tok, 1e9))) return;
    if (perf.playing) return;
  }
  if (!(await wait(900, tok))) { hush = 0; return; }
  ceremony = false;
  hush = 0;
  perf.play();
  ui.setPlaying(true);
  sendCmd(playMsg());
  fxFor(piece);
}

perf.onEnd = () => endOfPiece();

async function endOfPiece() {
  const tok = ++seq;
  const piece = perf.piece;
  const kind = ensembleOf(piece, rosterOf(piece));
  const G = GRAMMAR[kind];
  ui.setPlaying(false);
  leaf.ended(piece, IS_SPHERE ? visualsFor(piece) : null);
  fx?.lasers.set(false);
  fx?.wash.set(false);
  const big = !!piece?.finale;
  // after a quiet ending the silence is held a moment before anyone claps
  if (!big && piece?.mood === 'calm') {
    setPhase('afterglow');
    if (!(await wait(G.after * 1000, tok))) return;
  }
  setPhase('applause');
  hall.setHouseLights(kind === 'solo' ? 0.3 : 0.5);
  if (big) hall.show?.('finale');
  if (settings.applause) {
    engine.applause(engine.now + 0.35, big ? 1.3 : 1);
    clapUntil = performance.now() + (big ? 12500 : 7600);
  }
  if (settings.fx && big && fx) {
    fx.fanfare(engine.now + 0.3);
    fx.confettiCannons();
    setTimeout(() => fx.fireworksShow(), 1500);
  } else if (settings.fx && fx && piece?.mood === 'lively' && G.confetti) {
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
    // (only those who played: a colleague resting there for the next piece stays seated)
    const played = rosterOf(piece);
    const few = stage.walkers.filter((w) => w.atHome && played.has(StageManager.key(w)));
    if (few.length <= 3) {
      // a soloist (or a duo) turns to the house for the curtain call
      stage.greet(few, true);
      if (!(await wait(2000, tok))) return;
      stage.greet(few, false);
      if (!(await wait(900, tok))) return;
    } else {
      stage.orchestraRise(true);
      if (!(await wait(1300, tok))) return;
      stage.orchestraBow(true);
      if (!(await wait(1500, tok))) return;
      stage.orchestraBow(false);
      if (!(await wait(700, tok))) return;
      stage.orchestraRise(false);
    }
  }
  if (guest()) {
    // the host decides what comes next (unless we become the host meanwhile)
    setPhase('intermission');
    if (!(await until(() => !guest(), tok, 1e9))) return;
  }
  const lastOfProgram = !settings.repeatOne && !settings.shuffle && (current === program.length - 1 || current === eveningLen - 1);
  const next = nextIndex();
  nextPiece = program[next];
  setPhase('intermission', Math.max(2, settings.gap));
  if (lastOfProgram) {
    // end of the programme: everyone leaves, the house comes up, then a new evening begins
    endEvening();
    hall.setHouseLights(1);
    hall.show?.('house');
    sendCmd({ c: 'exit' });
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
  // after the evening's last piece a new evening begins
  if (current === eveningLen - 1) return 0;
  return current + 1;
}

function togglePlay() {
  if (!concertStarted || hostOnly()) return;
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
  sendCmd(playMsg());
}

ui.on('toggle', togglePlay);
const showOn = () => { if (!showStarted) { showStarted = true; ui.showStarted(); } };
ui.on('next', () => { if (!concertStarted || hostOnly()) return; showOn(); runConcert(settings.shuffle ? nextIndex() : current + 1, { quick: true }); });
ui.on('prev', () => {
  if (!concertStarted || hostOnly()) return;
  if (phase === 'playing' && perf.time > 5) { perf.seek(0); sendCmd(playMsg()); return; }
  showOn();
  runConcert(current - 1, { quick: true });
});
ui.on('select', (i) => { if (!concertStarted || hostOnly()) return; showOn(); runConcert(i, { quick: true }); });
ui.on('seek', (t) => {
  if (!concertStarted || phase !== 'playing' || hostOnly()) return;
  perf.seek(t);
  sendCmd(playMsg());
});
ui.on('seekKey', (d, e) => {
  if (!concertStarted || phase !== 'playing' || director.mode === 'walk') return;
  e.preventDefault();
  if (hostOnly()) return;
  perf.seek(perf.time + d);
  sendCmd(playMsg());
});
ui.on('mode', (m) => {
  director.setMode(m);
  if (m === 'cinema') ui.toast('편하게 보기: 지금 선율을 이끄는 악기를 따라가요. 드래그하면 다시 직접 봐요.', 2800);
});
ui.on('sit', () => director.toggleSit());
ui.on('jump', () => director.jump());
ui.on('mute', () => {
  muted = !muted;
  engine.setVolume(muted ? 0 : settings.volume);
  ui.setMuted(muted);
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

// ------------------------------------------------------- the leaf programme
// Tonight as you lived it: counted once a second, kept on this device,
// handed to you when the evening ends (and on the programme panel anytime).
setInterval(() => {
  if (!concertStarted) return;
  const d = director;
  const seat = d.mode === 'seat' ? d.seat : d.mode === 'cinema' ? d.returnTo?.seat : null;
  const ear = d.mode === 'cinema' && settings.fixedEar && bestSeat ? { x: bestSeat.x, y: bestSeat.y + 1.2, z: bestSeat.z } : camera.position;
  leaf.tick({
    playing: perf.playing,
    piece: perf.piece,
    seat: seat && seat.index >= 0 ? seat.label : null,
    level: levelName(d.feet + 0.1),
    ear,
    cinema: d.mode === 'cinema',
    sections: perf.playingSections ? [...perf.playingSections] : [],
    people: room ? [...room.members.values()].filter((m) => m.id !== room.id).map((m) => m.name) : [],
  });
}, 1000);
function endEvening() {
  if (!leaf.worthKeeping) return;
  leaf.save();
  ui.showLeaf(leaf.card(), Leaf.history());
  leaf = new Leaf(VENUE);
}
ui.on('leaf', () => ui.showLeaf(leaf.worthKeeping ? leaf.card() : null, Leaf.history()));
window.addEventListener('pagehide', () => leaf.save());

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
  if (left <= 0 && guest()) {
    // the show is the host's: a guest's timer just turns the sound off
    sleepAt = 0;
    sleepFading = false;
    muted = true;
    engine.setVolume(0);
    ui.setMuted(true);
    ui.setSleepLeft(0);
    ui.toast('편안한 밤 되세요. 소리를 껐어요.', 4000);
    return;
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
  if (key === 'volume') { muted = false; ui.setMuted(false); engine.setVolume(value); }
  if (key === 'reverb') engine.setReverb(value);
  if (key === 'quality') {
    quality = value === 'auto' ? (isMobile ? 'low' : 'high') : value;
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
  holdQuality(4500); // every material is rebuilt: a hitch, not a slow machine
  const q = QUALITY[quality];
  renderer.setPixelRatio(q.pr * (quality === 'low' ? renderScale : 1));
  renderer.shadowMap.enabled = q.shadows;
  hall.lights.key.castShadow = q.shadows;
  if (hall.lights.key.shadow.map && hall.lights.key.shadow.mapSize.x !== q.shadowSize) {
    hall.lights.key.shadow.map.dispose();
    hall.lights.key.shadow.map = null;
  }
  hall.lights.key.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  hall.dome?.setQuality(quality);
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
  // (the Sphere's seats come in sections: map back to the seat list)
  const seatHit = raycaster.intersectObject(hall.seatMesh, true)[0];
  let player = null;
  let dist = Infinity;
  if (hits.length) {
    let o = hits[0].object;
    while (o && !orchestra.pickables.includes(o)) o = o.parent;
    player = orchestra.players.find((p) => p.char.root === o) || (o === orchestra.conductor.char.root ? 'conductor' : null);
    dist = hits[0].distance;
  }
  if (seatHit && seatHit.distance < dist) return { seat: hall.seats[seatHit.object.userData.seatIdx?.[seatHit.instanceId] ?? seatHit.instanceId], dist: seatHit.distance };
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

// ------------------------------------------------------ watching together
// In a room the host (방장) runs the concert. Its client sends what it does
// - run a piece, play or pause at a position on the server clock - and a
// snapshot every few seconds. Everyone else performs the same walk-ons and
// bows here and starts the music on the host's clock, so the whole room
// hears the same bar together. Graphics and sound settings stay personal.
let ceremony = false; // a piece's walk-on / greeting is running here
let playTok = 0;
let pendingJoin = undefined; // the room's state, applied once we are inside
const guest = () => !!room && !room.isHost;

function hostOnly() {
  if (!guest()) return false;
  ui.toast('공연 진행은 방장만 할 수 있어요.', 1600);
  return true;
}

function snapshot() {
  return {
    started: showStarted, i: current, title: program[current]?.titleKo || '', phase,
    playing: perf.playing, pos: perf.time, at: room.now(), onstage: stage.onstage, cond: stage.conductorOn,
    on: [...stage.onstageKeys()],
  };
}
function publish() { if (room?.isHost && room.connected) room.state(snapshot()); }
function sendCmd(c) { if (!room?.isHost) return; room.cmd(c); publish(); }
const playMsg = () => ({ c: perf.playing ? 'play' : 'pause', i: current, pos: perf.time, at: room ? room.now() : 0 });

function fxFor(piece) {
  if (!fx) return;
  const lively = piece?.mood === 'lively' && settings.lasers;
  // (a recital or a few players: the colour wash, but no laser show)
  fx.lasers.set(lively && GRAMMAR[ensembleOf(piece, rosterOf(piece))].lasers);
  fx.wash.set(lively);
}

// make piece i the current one (guests follow the host there)
async function ensurePiece(i) {
  if (current === i && perf.piece?.id === program[i]?.id) return true;
  if (!program[i]) return false;
  current = i;
  nextPiece = program[i];
  const piece = await perf.load(program[i].id);
  if (!piece || current !== i) return false;
  ui.setCurrent(i, piece);
  ui.setTime(0, piece.duration);
  updateMediaSession(piece);
  return true;
}

// the host's playback: { i, playing, pos, at }
async function applyPlayback(s) {
  const tok = ++playTok;
  if (!(await ensurePiece(s.i)) || tok !== playTok) return;
  const piece = perf.piece;
  const want = s.on ? new Set(s.on) : rosterOf(piece);
  const here = stage.onstageKeys();
  const rosterOff = [...rosterOf(piece)].some((k) => !here.has(k));
  if (ceremony || phase !== 'playing' || rosterOff || (!!piece.conducted !== stage.conductorOn)) {
    // late, or still walking on: skip to where the show is
    seq++;
    ceremony = false;
    stage.snapRoster(want);
    stage.snapConductor(!!piece.conducted);
    engine.stopApplause();
    clapUntil = 0;
    setPhase('playing');
  }
  const kind = ensembleOf(piece, rosterOf(piece));
  spot.set(kind === 'solo' ? rosterCentre(rosterOf(piece)) : null);
  hall.setHouseLights(s.playing ? GRAMMAR[kind].house : 0.4);
  if (s.playing) {
    // what the host hears right now; a little ahead, since starting takes a moment
    const want = s.pos + Math.max(0, room.now() - s.at);
    if (want >= perf.duration - 0.2) return;
    if (!perf.playing) {
      perf.seek(want + 0.12);
      perf.play();
      fxFor(piece);
    } else if (Math.abs(perf.time - want) > 0.35) {
      perf.seek(want + 0.12);
    }
    ui.setPlaying(true);
  } else {
    if (perf.playing) perf.pause();
    if (Math.abs(perf.pos - s.pos) > 0.05) perf.seek(s.pos);
    ui.setPlaying(false);
  }
}

// a snapshot from the host (on joining, then every few seconds)
async function followHost(s, { joining = false } = {}) {
  if (!s || !room || room.isHost || !concertStarted || !s.started) return;
  showOn();
  if (s.phase === 'playing') { applyPlayback(s); return; }
  if (!joining) return;
  if (['changing', 'entering', 'tuning', 'announce', 'hush'].includes(s.phase)) {
    // the orchestra is walking on right now: watch it (a little late)
    runConcert(s.i, { remote: true });
    return;
  }
  // between pieces: set the stage as it is and wait for the host
  seq++;
  ceremony = false;
  if (!(await ensurePiece(s.i))) return;
  if (s.on) stage.snapRoster(new Set(s.on));
  else if (s.onstage) stage.snapOnstage();
  stage.snapConductor(!!s.cond && s.onstage);
  hall.setHouseLights(s.onstage ? 0.5 : 1);
  setPhase('intermission');
}

function onHostCmd(c) {
  if (!room || room.isHost || !concertStarted || !c) return;
  if (c.c === 'run') {
    showOn();
    ritualNext = !!c.ritual;
    runConcert(c.i, { quick: !!c.quick, remote: true });
  } else if (c.c === 'play' || c.c === 'pause') {
    showOn();
    applyPlayback({ i: c.i, playing: c.c === 'play', pos: c.pos, at: c.at });
  } else if (c.c === 'exit') {
    seq++;
    ceremony = false;
    hall.setHouseLights(1);
    hall.show?.('house');
    if (stage.conductorOn) stage.conductorExit();
    stage.exitAll();
    setPhase('intermission');
  }
}

// a guest who becomes the host carries the show on from where it is
function takeOver() {
  ui.toast('이제 내가 방장이에요. 공연 진행을 맡아요.', 2600);
  ui.chatLine({ sys: true, text: '이제 내가 방장이에요.' });
  publish();
}

function membersChanged() {
  if (!room) return;
  ui.setMembers([...room.members.values()], room.host, room.id);
}

function refreshOccupied() {
  if (!director) return;
  const s = new Set(audience ? audience.occupied : []);
  for (const i of avatars.occupied()) s.add(i);
  director.occupied = s;
}

function wireRoom(c) {
  c.on('joined', (m, first) => {
    avatars.clear();
    for (const mm of c.members.values()) if (mm.id !== c.id) avatars.add(mm);
    avatars.setHost(c.host);
    ui.setRoom({ title: c.room.title, code: c.room.code, cap: c.room.cap });
    ui.setOffline(false);
    ui.setHostControls(c.isHost);
    membersChanged();
    if (first) {
      seatAudience(settings.audience); // the same house for everyone in the room
      try { history.replaceState(null, '', `?${VENUE !== 'hall' ? `venue=${VENUE}&` : ''}room=${c.room.code}`); } catch { /* file: */ }
      ui.chatLine({ sys: true, text: c.isHost ? `방을 만들었어요. 방 코드는 ${c.room.code} — 오른쪽 위 방 이름을 눌러 초대 링크를 복사할 수 있어요.` : `「${c.room.title}」에 들어왔어요.` });
    }
    refreshOccupied();
    lastPoseKey = '';
    if (c.isHost) publish();
    else if (!concertStarted) pendingJoin = m.state;
    else followHost(m.state, { joining: true });
  });
  c.on('member', (m) => {
    avatars.add(m);
    avatars.setHost(c.host);
    membersChanged();
    ui.chatLine({ sys: true, text: `${m.name}님이 들어왔어요.` });
  });
  c.on('left', (id, who) => {
    avatars.remove(id);
    membersChanged();
    refreshOccupied();
    if (who) ui.chatLine({ sys: true, text: `${who.name}님이 나갔어요.` });
  });
  c.on('host', (id) => {
    avatars.setHost(id);
    membersChanged();
    ui.setHostControls(c.isHost);
    if (c.isHost) takeOver();
    else ui.chatLine({ sys: true, text: `${c.members.get(id)?.name ?? '누군가'}님이 이제 방장이에요.` });
  });
  c.on('pose', (id, p) => {
    const before = avatars.list.get(id)?.seat;
    avatars.pose(id, p);
    if (avatars.list.get(id)?.seat !== before) refreshOccupied();
  });
  c.on('state', (s) => { if (!c.isHost) followHost(s); });
  c.on('cmd', onHostCmd);
  c.on('chat', (m) => {
    ui.chatLine({ name: m.name, text: m.text });
    if (m.id !== c.id) avatars.say(m.id, m.text);
  });
  c.on('disconnected', () => { ui.setOffline(true); ui.toast('연결이 끊겼어요. 다시 잇는 중…', 3000); });
  c.on('reconnected', () => ui.toast('다시 연결됐어요.', 1800));
  c.on('lost', () => {
    ui.chatLine({ sys: true, text: '방과 연결이 끊겼어요. 혼자 보기로 이어서 볼게요.' });
    goSolo();
  });
}

function goSolo() {
  room?.leave();
  room = null;
  avatars.clear();
  ui.setRoom(null);
  refreshOccupied();
  try { history.replaceState(null, '', location.pathname + (VENUE !== 'hall' ? `?venue=${VENUE}` : '')); } catch { /* file: */ }
}

ui.on('leaveRoom', () => {
  room?.leave();
  location.href = location.pathname + (VENUE !== 'hall' ? `?venue=${VENUE}` : ''); // back to the lobby
});
ui.on('copyInvite', async () => {
  if (!room?.room) return;
  const url = `${location.origin}${location.pathname}?${VENUE !== 'hall' ? `venue=${VENUE}&` : ''}room=${room.room.code}`;
  try {
    await navigator.clipboard.writeText(url);
    ui.toast('초대 링크를 복사했어요. 친구에게 보내 주세요.', 2400);
  } catch {
    window.prompt('이 링크를 복사해서 보내 주세요', url);
  }
});
ui.on('handoff', (id, name) => {
  if (!room?.isHost) return;
  room.handoff(id);
  ui.toast(`${name}님에게 방장을 넘겼어요.`, 2200);
});
ui.on('chat', (text) => room?.chat(text));
ui.on('chatOpen', () => director.releaseLock());
ui.on('leafOpen', () => director.releaseLock());

// where I am, for everyone else (a seat, or a spot and a heading)
const EYE_H = 1.62;
let poseT = 0;
let lastPoseKey = '';
function myPose() {
  const d = director;
  const seat = d.mode === 'seat' ? d.seat : d.mode === 'cinema' ? d.returnTo?.seat : null;
  if (seat && seat.index >= 0) return { s: seat.index };
  if (d.mode === 'cinema' && d.returnTo) {
    const r = d.returnTo;
    return { x: r.pos.x, y: r.feet, z: r.pos.z, r: r.yaw, s: -1 };
  }
  return { x: d.pos.x, y: d.pos.y - EYE_H, z: d.pos.z, r: d.yaw, s: -1 };
}
let pubT = 0;
function roomTick(dt) {
  if (!room || !concertStarted) return;
  avatars.update(dt, camera.position);
  if (room.isHost) {
    pubT += dt;
    if (pubT > 3) { pubT = 0; publish(); }
  }
  if (!room.connected) return;
  poseT += dt;
  if (poseT < 0.1) return;
  poseT = 0;
  const p = myPose();
  const key = p.s >= 0 ? `s${p.s}` : `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${p.r.toFixed(2)}`;
  if (key === lastPoseKey) return;
  lastPoseKey = key;
  room.pose(p);
}

// --------------------------------------------------------------- lobby
const IDENTITY_KEY = 'fp-identity';
function loadIdentity() {
  try {
    const v = JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null');
    if (v?.name && AVATARS.some((a) => a.id === v.avatar)) return v;
  } catch { /* private mode */ }
  return randomIdentity();
}
const invite = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || null;
ui.initLobby({ avatars: AVATARS, identity: loadIdentity(), invite, venue: VENUE, venues: VENUES });
ui.on('venue', (id) => goVenue(id, { room: invite }));
async function refreshRooms() {
  try {
    ui.setRooms(await listRooms());
    ui.setOnline(true);
  } catch {
    ui.setOnline(false); // a static host: watching alone only
  }
}
refreshRooms();
ui.on('refreshRooms', refreshRooms);
setInterval(() => { if (!concertStarted && !document.hidden) refreshRooms(); }, 10000);

// -------------------------------------------------------- media & power
function updateMediaSession(piece) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: piece.titleKo, artist: `${piece.composerKo} · 숲속 필하모닉`, album: piece.ensembleKo });
    navigator.mediaSession.setActionHandler('play', () => { if (!perf.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (perf.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => { if (!hostOnly()) runConcert(current + 1, { quick: true }); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { if (!hostOnly()) runConcert(current - 1, { quick: true }); });
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

// -------------------------------------------------------- the Sphere
// The dome hears the music (level) and knows the time; the live picture
// (IMAG) is up while the orchestra walks on, bows and between pieces, and
// for the title at the start of each piece - then the dome is all show.
// The lifts behind the vomitories take you between the levels.
let liftShown = 0;
function sphereTick(dt, t) {
  hall.feed({ time: t, level: perf.playing ? levelSmoothed : 0, playing: perf.playing });
  const live = settings.screen && concertStarted && showStarted && (phase !== 'playing' || !perf.playing || t < 11);
  hall.dome.showLive(live);
  if (!concertStarted) return;
  const d = director;
  hall.lifts.near(d.pos.x, d.pos.z, d.feet);
  const car = d.mode === 'walk' ? hall.lifts.carAt(d.pos.x, d.pos.z, d.feet) : null;
  const lvl = car ? car.V.tier.n : 0;
  if (lvl !== liftShown) { liftShown = lvl; ui.liftPanel(lvl || null); }
}
function rideLift(n) {
  if (!IS_SPHERE || !concertStarted) return;
  const d = director;
  const car = hall.lifts.carAt(d.pos.x, d.pos.z, d.feet);
  if (!car || hall.lifts.busy) return;
  if (car.V.tier.n === n) { ui.toast(`여기가 ${n}00 레벨이에요.`, 1400); return; }
  const ok = hall.lifts.go(car, n, (from, to) => {
    // still in the car? carry the rider over, same spot, same heading
    const now = hall.lifts.carAt(d.pos.x, d.pos.z, d.feet);
    if (now !== from) return;
    const sF = Math.sin(from.V.th);
    const cF = Math.cos(from.V.th);
    const dx = d.pos.x - SP.F.x; // relative to the fan's centre
    const dz = d.pos.z - SP.F.z;
    const u = dx * sF + dz * cF - from.V.r1 + to.V.r1;
    const v = dx * cF - dz * sF;
    const eye = d.pos.y - d.feet;
    const sT = Math.sin(to.V.th);
    const cT = Math.cos(to.V.th);
    d.feet = to.V.y;
    d.pos.set(SP.F.x + u * sT + v * cT, to.V.y + eye, SP.F.z + u * cT - v * sT);
    d.yaw += to.V.th - from.V.th;
    d.vel.set(0, 0, 0);
    d.vy = 0;
    d.grounded = true;
    ding(true);
  });
  if (ok) { ding(false); ui.toast(`${n}00 레벨로 ${n > car.V.tier.n ? '올라가요' : '내려가요'}`, 1800); }
}
// a soft two-note chime, as lifts make
function ding(arrive) {
  const ctx = engine.ctx;
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + 0.02;
  const notes = arrive ? [880, 1108.7] : [1108.7, 880];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + i * 0.32);
    g.gain.linearRampToValueAtTime(0.06 * settings.volume, t0 + i * 0.32 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.32 + 1.1);
    o.connect(g).connect(ctx.destination);
    o.start(t0 + i * 0.32);
    o.stop(t0 + i * 0.32 + 1.2);
  });
}
ui.on('lift', rideLift);
window.addEventListener('keydown', (e) => {
  if (!IS_SPHERE || e.repeat || e.target?.closest?.('input, textarea, select')) return;
  const m = /^Digit([1-4])$/.exec(e.code) || /^Numpad([1-4])$/.exec(e.code);
  if (m && liftShown) { e.preventDefault(); rideLift(Number(m[1])); }
});

// ------------------------------------------------------------ main loop
let lastNow = performance.now();
let wallT = 0;
let fpsAcc = 0;
let fpsFrames = 0;
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
  roomTick(dt);
  if (IS_SPHERE) sphereTick(dt, t);
  hall.update(dt, wall);
  effects.update(wall);
  director.joy.x = ui.joy.x;
  director.joy.y = ui.joy.y;
  animateAudience(wall, dt, performance.now() < clapUntil, { hush });
  spot.update(dt);

  if (!concertStarted) {
    // slow establishing shot behind the splash
    introT += dt;
    const a = introT * 0.05;
    if (IS_SPHERE) director.pos.set(Math.sin(a) * 22, 14 + Math.sin(a * 0.7) * 4, 26 + Math.cos(a) * 12);
    else director.pos.set(Math.sin(a) * 9, 9 + Math.sin(a * 0.7) * 2, 14 + Math.cos(a) * 7);
    const la = director.lookAt(IS_SPHERE ? new THREE.Vector3(0, 12, -8) : new THREE.Vector3(0, 3.2, -5));
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
  if (!IS_SPHERE) interiorCull();
  audience?.updateLOD?.(camera.position);
  hall.dome?.drawWorlds(); // (after the camera moved: only what it sees)
  hall.updateLOD?.(camera.position);
  if (settings.screen && concertStarted) {
    // (in the Sphere the picture is only filmed while it is on the dome)
    screen.update(dt, { perf, time: t, phase, nextPiece }, IS_SPHERE && !hall.dome.liveActive ? 0 : QUALITY[quality].screenEvery);
  }

  orchestra.syncLite();
  if (composer) composer.render(dt);
  else renderer.render(scene, camera);

  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc > 3) {
    const fps = fpsFrames / fpsAcc;
    ui.setFps(fps, quality);
    if (settings.quality === 'auto' && concertStarted) autoQuality(fps);
    fpsAcc = 0;
    fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}

// Automatic quality. A moment of change (the house lights, people walking
// on, the doors opening for the interval, new things to draw for the first
// time) can stutter for a second or two: that is not judged (holdQuality).
// A steady poor frame rate steps down; a long steady good one between pieces
// steps back up again, once - if that one drops again, it stays down.
function holdQuality(ms = 3500) { qualityHold = Math.max(qualityHold, performance.now() + ms); lowStreak = 0; goodStreak = 0; }
function autoQuality(fps) {
  const now = performance.now();
  if (now < qualityHold) { lowStreak = 0; goodStreak = 0; return; }
  if (fps < 36) lowStreak++; else lowStreak = 0;
  if (fps > 56) goodStreak++; else goodStreak = 0;
  if (quality === 'low' && fps < 30 && renderScale > 0.6) {
    // already at the lightest settings: render fewer pixels
    renderScale *= 0.85;
    renderer.setPixelRatio(QUALITY.low.pr * renderScale);
    onResize();
    return;
  }
  if (lowStreak >= 2 && quality !== 'low') {
    if (now - raisedAt < 60000) raiseBlocked = true; // it could not hold the higher setting
    quality = quality === 'high' ? 'medium' : 'low';
    applyQuality();
    ui.toast(`부드럽게 보이도록 화질을 '${quality === 'medium' ? '보통' : '낮음'}'으로 낮췄어요.`, 2600);
    return;
  }
  // (steps up only between pieces: rebuilding the materials can hitch)
  if (goodStreak < 5 || phase === 'playing' || raiseBlocked) return;
  if (quality === 'low' && renderScale < 1) {
    renderScale = Math.min(1, renderScale / 0.85);
    renderer.setPixelRatio(QUALITY.low.pr * renderScale);
    onResize();
    goodStreak = 0;
  } else if (quality !== AUTO_TOP) {
    quality = quality === 'low' ? 'medium' : 'high';
    raisedAt = now;
    applyQuality();
  }
}

// The hall from the foyer: the house (thousands of seats and guests, drawn
// without culling) can only be seen through the doors in the back wall. When
// none of them is in view, it is not drawn at all.
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _box = new THREE.Box3();
function interiorCull() {
  let show = true;
  if (concertStarted && camera.position.z > HALL.back + 0.05) {
    camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    show = false;
    for (const Y of LEVELS) {
      for (const dx of HALL_DOORS) {
        _box.min.set(dx - HALL_DOOR_W / 2, Y, HALL.back - 0.6);
        _box.max.set(dx + HALL_DOOR_W / 2, Y + HALL_DOOR_H, HALL.back + 0.6);
        if (_frustum.intersectsBox(_box)) { show = true; break; }
      }
      if (show) break;
    }
  }
  if (show === interiorShown) return;
  interiorShown = show;
  if (audience) audience.group.visible = show;
  if (hall.seatGroup) hall.seatGroup.visible = show;
}
requestAnimationFrame(frame);

boot().catch((e) => {
  console.error(e);
  ui.setLoading(`불러오지 못했어요: ${e.message}. 서버가 켜져 있는지 확인하고 새로고침해 주세요.`, 0);
});

window.__fp = {
  scene, camera, renderer, engine, perf, director, orchestra, hall, stage, settings, avatars, get room() { return room; }, get phase() { return phase; }, get audience() { return audience; }, startShow,
  triggerFinaleFx() { if (!fx) return; fx.fanfare(); fx.confettiCannons(); fx.fireworksShow(); clapUntil = performance.now() + 8000; },
  setLasers(on) { fx?.lasers.set(on); fx?.wash.set(on); },
  // (tests) the automatic quality, fed a frame rate by hand
  get leaf() { return leaf; }, endEvening, spot,
  get quality() { return quality; }, autoQuality, holdQuality, get qualityState() { return { lowStreak, goodStreak, raiseBlocked, renderScale, hold: Math.max(0, qualityHold - performance.now()) }; },
};
