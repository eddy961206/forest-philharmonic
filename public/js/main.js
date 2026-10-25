// Forest Philharmonic - boot, render loop and the running of the concert.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// the venue first: the Sphere takes over the walking plan before anything reads it
import { IS_SPHERE, IS_OUTDOOR, IS_HALL, VENUE, VENUES, goVenue } from './scene/venue.js';
import { SPHERE_ACOUSTICS, SP } from './scene/sphereplan.js';
import { buildSphere } from './scene/sphere.js';
import { OUTDOOR_ACOUSTICS } from './scene/outdoorplan.js';
import { buildOutdoor } from './scene/outdoor.js';
import { visualsFor } from './scene/domeshow.js';
import { SETLISTS } from './programs.js';
import { identity, setName, heldTicket, updateTicket, dropTicket, ticketElement, ticketQuery, EMOJI } from './tickets.js';

import { AudioEngine } from './audio/engine.js';
import { Performance, fetchPiece } from './audio/performance.js';
import { PieceChooser, ScoreLibrary, transportState } from './pieces.js';
import { Follower } from './follow.js';
import { SoundRecovery, wantsSound } from './audio/resume.js';
import { buildHall } from './scene/hall.js';
import { buildOrchestra } from './scene/orchestra.js';
import { buildAudience, planHouse, animateAudience } from './scene/audience.js';
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
import { ensembleOf, GRAMMAR, Spotlight, rosterCentre, Leaf, josa } from './evening.js';
import { installBremen } from './bremen.js';
import { Practice, SeatThief, noticeLines, buildNoticeBoard } from './scene/lobby.js';
import { buildRecital } from './scene/recital.js';
import { Avatars, AVATARS } from './scene/avatars.js';
import { normalizeDomeProjection } from './scene/dome-projection.js';
import { AdaptiveQuality, FramePacer } from './quality.js';
import { watchRenderContext, showRenderStatus } from './render-status.js';

// ------------------------------------------------------------- settings
const DEFAULTS = {
  volume: 0.8, reverb: 0.45, quality: 'auto', shuffle: false, repeatOne: false,
  fixedEar: true, applauseVol: 0.7, gap: 7, notes: true, glow: true, fireflies: true,
  fx: true, lasers: true, screen: true, interval: 3, domeProjection: 'immersive',
  // how full the house is, in per cent, for each venue: the Sphere seats
  // nearly fourteen thousand - a quarter of that is already a big crowd
  crowdHall: 45, crowdSphere: 25, crowdOutdoor: 55,
};
const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('fp-settings') || '{}')); } catch { /* private mode */ }
// (the old on/off switch for the audience: off is an empty house)
if (settings.audience === false) { settings.crowdHall = 0; settings.crowdSphere = 0; settings.crowdOutdoor = 0; }
delete settings.audience;
// (the old on/off switch for the applause: off is none at all)
if (settings.applause === false) settings.applauseVol = 0;
delete settings.applause;
settings.domeProjection = normalizeDomeProjection(settings.domeProjection);
const CROWD = IS_SPHERE ? 'crowdSphere' : IS_OUTDOOR ? 'crowdOutdoor' : 'crowdHall'; // this venue's audience setting
const save = () => { try { localStorage.setItem('fp-settings', JSON.stringify(settings)); } catch { /* ignore */ } };

const isTouch = navigator.maxTouchPoints > 1 && !window.matchMedia('(pointer: fine)').matches;
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (isTouch && window.innerWidth < 900);
// (the hall is paid for per pixel - a dozen lights on every one: beyond 1.5
// pixels per point a sharper picture is hard to see and costs half again)
const QUALITY = {
  high: { pr: Math.min(window.devicePixelRatio || 1, 1.5), shadows: true, shadowSize: 2048, bloom: true, msaa: 4, screenHz: 30, post: true },
  medium: { pr: Math.min(window.devicePixelRatio || 1, 1.25) * 0.85, shadows: true, shadowSize: 1024, bloom: true, msaa: 2, screenHz: 20, post: true },
  // phones: no post-processing pass, no shadows, the big screen redrawn
  // only every ~1.5 s at a small size
  low: { pr: Math.min(window.devicePixelRatio || 1, 1.25), shadows: false, shadowSize: 512, bloom: false, msaa: 0, screenHz: 8, post: false },
};
if (settings.quality !== 'auto' && settings.quality !== 'efficient' && !Object.hasOwn(QUALITY, settings.quality)) settings.quality = 'auto';
// A computer's built-in graphics (most laptops, and desktops without a card
// in use): automatic quality starts one step down and climbs if it can
const weakGPU = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return /Intel|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics|SwiftShader|llvmpipe/i.test(name) && !/Arc\(TM\) A|Arc A\d/i.test(name);
  } catch { return false; }
})();
const autoStart = () => (isMobile ? 'low' : weakGPU ? 'medium' : 'high');
const efficient = () => settings.quality === 'efficient';
let quality = settings.quality === 'auto' ? autoStart() : efficient() ? 'low' : settings.quality;
// Lite build (phones, or 'low' chosen): simpler seats, a smaller crowd, far
// fewer lights, plain materials, lighter audio. Decided once at load.
const LITE = isMobile || quality === 'low';
// A graphics preference must not lower the existing desktop audio fidelity.
const AUDIO_LITE = isMobile || settings.quality === 'low';
let renderScale = 1; // phones: lowered further while the frame rate is poor
const adaptiveQuality = new AdaptiveQuality({
  quality,
  // The safe lightweight build can recover resolution and post effects.
  // It does not rebuild thousands of models during an ongoing performance.
  maxQuality: LITE ? 'medium' : 'high',
  // A full build keeps its materials: an automatic medium-to-low rebuild
  // can stall the same device that needs help. Low/Lite remains an entry path.
  minQuality: LITE ? 'low' : 'medium',
  pixelRatios: Object.fromEntries(Object.entries(QUALITY).map(([k, q]) => [k, q.pr])),
  nowMs: performance.now(),
});
const efficientQuality = new AdaptiveQuality({ quality: 'low', minQuality: 'low', maxQuality: 'low', targetFps: 30, nowMs: performance.now() });
const framePacer = new FramePacer(30);
const worldPacer = new FramePacer(10);
const pixelRatio = () => (efficient() ? Math.min(window.devicePixelRatio || 1, 1) : QUALITY[quality].pr) * renderScale;
let qualityHold = 0; // real-time deadline, also respected by the FPS debug hook
let interiorShown = true; // the house, seen from the foyer (see interiorCull)

// --------------------------------------------------------------- render
const container = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(pixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = QUALITY[quality].shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
// The broadcast and the viewer share the same lights and animated scene.
// Refresh their shadow maps once per animation frame, not once per camera.
renderer.shadowMap.autoUpdate = false;
// Count the whole frame, including the dome, broadcast, shadows and post FX.
renderer.info.autoReset = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
setAnisotropy(Math.min(LITE ? 2 : 8, renderer.capabilities.getMaxAnisotropy()));
setLite(LITE);

const scene = new THREE.Scene();
scene.background = new THREE.Color(IS_SPHERE ? '#000000' : IS_OUTDOOR ? '#526b70' : '#0b0806');
// the Sphere is a black bowl lit by its screen: only a trace of haze
scene.fog = IS_SPHERE ? new THREE.FogExp2('#06070b', 0.0028) : IS_OUTDOOR ? new THREE.FogExp2('#52665e', 0.0035) : new THREE.FogExp2('#140d08', 0.006);
const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 260); // near 0.1: better depth precision, no flicker

let environmentTarget;
function buildEnvironment() {
  environmentTarget?.dispose();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentRoom = new RoomEnvironment();
  try {
    environmentTarget = pmrem.fromScene(environmentRoom, 0.04);
    scene.environment = environmentTarget.texture;
  } finally {
    environmentRoom.dispose();
    pmrem.dispose();
  }
}
buildEnvironment();
// (the Sphere is a black room: the bright studio reflections would glow)
scene.environmentIntensity = IS_SPHERE ? 0.05 : IS_OUTDOOR ? 0.28 : 0.2;

let composer;
let bloomPass;
function buildComposer() {
  const q = QUALITY[quality];
  if (composer) { composer.passes.forEach((p) => p.dispose?.()); composer.dispose(); }
  if (!q.post) { composer = null; return; } // render straight to the screen
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // only true light sources bloom: bulbs, chandeliers, lasers - never fur
  bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.3, 1.35);
  // what feeds the bloom is kept finite and in range: a single bad pixel
  // (NaN or Inf - some GPUs make them where others don't) would otherwise be
  // blurred across the whole frame and turn it black
  bloomPass.materialHighPassFilter.fragmentShader = bloomPass.materialHighPassFilter.fragmentShader.replace(
    'vec4 texel = texture2D( tDiffuse, vUv );',
    'vec4 texel = texture2D( tDiffuse, vUv ); texel = clamp( texel, vec4( 0.0 ), vec4( 64.0 ) );',
  );
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

const hall = IS_SPHERE ? buildSphere({ quality, lite: LITE, renderer }) : IS_OUTDOOR ? buildOutdoor({ quality, lite: LITE }) : buildHall({ quality, lite: LITE });
scene.add(hall.group);
// Both the broadcast and visitor cameras select batches after their world
// matrices are current, before Three.js builds the render list.
scene.onBeforeRender = (_renderer, _scene, view) => hall.prepareRender?.(view);
const orchestra = buildOrchestra(scene);
// Fixed geometry is consulted only when the camera plans a new shot.
const cameraInstruments = orchestra.players.filter(p => p.fixedInstrument).map(p => p.inst.group);
const stage = new StageManager(orchestra);
const spot = new Spotlight(hall.lights, scene); // a recital: the key light gathers on the soloist
hall.dome?.setProjection(settings.domeProjection);
hall.setBeams?.(settings.lasers !== false && !efficient()); // (the Sphere's moving heads follow '조명 연출')
const thief = new SeatThief(stage, 'va:0'); // the interval: someone may take the seat you leave
// a recital: chairs on the stage and a page turner's seat (added to the seat list, put away)
const recital = buildRecital(scene, orchestra, hall.seats);
const PIANIST = orchestra.playerAt('piano', 0);
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

// Tonight's crowd: who comes and in what order they arrive (see planHouse),
// drawn once per visit - the audience slider only lets more or fewer of
// them in, so the people already seated stay put while it moves.
// Watching together, the evening comes from the room's seed and the seats
// that count as taken are the venue's usual house (the default share), the
// same on every screen whatever anyone's slider says: a smaller share
// here only draws fewer of those guests (their seats stay taken, as on a
// phone), and a larger one is not drawn beyond them - a guest drawn in a
// seat someone else may sit in would end up in their lap.
let housePlan = null;
let housePlanFor = null;
function seatAudience() {
  if (audience) { audience.dispose(); audience = null; }
  const share = Math.max(0, Math.min(100, Number(settings[CROWD]) || 0)) / 100;
  const reserve = room ? DEFAULTS[CROWD] / 100 : null;
  if (share > 0 || reserve) {
    // (a room's evening stays on after the room is left: the same guests)
    if (!housePlan || (room && housePlanFor !== room.seed)) {
      housePlan = planHouse(hall.seats.filter((s) => !s.stage), room ? seeded(room.seed) : Math.random);
      housePlanFor = room ? room.seed : null;
    }
    const exclude = new Set();
    if (director?.seat && director.seat.index >= 0) exclude.add(director.seat.index);
    // the Sphere: thousands of guests, drawn in full only near you
    const big = IS_SPHERE ? { detail: LITE ? 80 : 220, mid: LITE ? 0 : 900, cap: LITE ? 2500 : Infinity } : {};
    audience = buildAudience(housePlan, { share, reserve, exclude, lite: LITE, casual: IS_OUTDOOR, ...big });
    audience.setBudget?.(efficient() ? 0.35 : 1);
    audience.updateLOD?.(camera.position, true);
    audience.group.visible = interiorShown;
    scene.add(audience.group);
    holdQuality();
  }
  ui.setCrowdCount(audience ? audience.count : 0, reserve !== null && share > reserve ? Math.round(reserve * 100) : 0, audience ? audience.drawn : 0);
  refreshOccupied();
}
// (no fireflies indoors at the Sphere - only dust in the light)
const effects = buildEffects(scene, { fireflies: IS_SPHERE ? 0 : IS_OUTDOOR ? (LITE ? 12 : 30) : LITE ? 40 : 170, dust: IS_OUTDOOR ? (LITE ? 30 : 80) : LITE ? 140 : 520 });
effects.setBudget(efficient() ? 0.2 : 1);
effects.setCounts(settings.fireflies);
// in the Sphere the broadcast goes up on the dome (IMAG) instead of a screen
// of its own; the dome stops sampling the picture while it is being drawn
const screen = buildScreen(scene, renderer, IS_SPHERE ? {
  lite: LITE,
  headless: true,
  before: () => hall.dome.setLive(null, null),
  after: () => hall.dome.setLive(screen.texture, screen.capTex),
} : { lite: LITE, headless: IS_OUTDOOR });
if (IS_SPHERE) {
  hall.dome.setLive(screen.texture, screen.capTex);
  // The dome's shader is big: compiled in the background (where the browser
  // can) while the rest loads, and the dome is drawn once it is ready -
  // never a frozen page waiting for it.
  {
    const dm = hall.dome.mesh;
    try {
      const ready = renderer.compileAsync(dm, camera, scene);
      dm.visible = false;
      ready.catch(() => {}).finally(() => { dm.visible = true; });
    } catch { /* compiled on first use instead */ }
  }
  // the 3D worlds are drawn only where these cameras can see the dome
  // (the broadcast cuts between shots of the stage: its faces are fixed -
  // everything but behind the house and under the floor)
  hall.dome.setViewers([{ cam: camera }, { faces: 1 | 2 | 4 | 32, when: () => settings.screen && concertStarted && hall.dome.liveActive }]);
}
director = new Director(camera, renderer.domElement, hall);
director.uiTop = () => ui.bottomUiTop();
director.hoverLook = false; // look by dragging, or click to capture the mouse
seatAudience();
applyQuality();

// where the ear sits while the camera roams (cinema): 1층 H열, or the
// Sphere's sweet spot in section 204
const bestSeat = (IS_SPHERE
  ? hall.seats.filter((s) => s.section === '204' && s.row === '8')
  : IS_OUTDOOR ? hall.seats.filter((s) => s.level === '잔디마당' && s.row === 'D')
  : hall.seats.filter((s) => s.level === '1층' && s.row === 'H')).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
const headPositions = orchestra.players.map((p) => p.home.clone().add(new THREE.Vector3(0, 1.25 * p.char.scale, 0)));
headPositions.push(orchestra.conductor.home.clone().add(new THREE.Vector3(0, 1.35, 0)));

// ------------------------------------------------------------------ audio
const engine = new AudioEngine();
const perf = new Performance(engine);
// the piece to play: a choice made while another is on its way wins, and
// only what is loaded is what the page shows (see pieces.js)
const scores = new ScoreLibrary(fetchPiece);
const pieces = new PieceChooser({
  fetch: (id) => scores.get(id),
  prepare: (score) => perf.prepare(score),
  apply(prep) {
    const piece = perf.use(prep);
    if (program[current]?.id !== piece.id) current = Math.max(0, program.findIndex((p) => p.id === piece.id));
    nextPiece = program[current];
    ui.setCurrent(current, piece);
    ui.setTime(0, piece.duration);
    ui.offer('retry', null); // (a piece has come: whatever failed before is out of date)
    return piece;
  },
  loaded: () => perf.piece,
});
// the piece chosen is still on its way: what is loaded is the one before it
const loadingPiece = () => !!program[current] && perf.piece?.id !== program[current].id;
let fx = null;
let program = [];
let eveningLen = 0; // the evening's programme (this building's half of the pieces)
let current = -1;
let concertStarted = false; // we are inside
let showStarted = false; // the musicians have been called
let muted = false;
let focused = null;
let wakeLock = null;
let wakeLockPending = false;
let phase = 'lobby'; // lobby | entering | tuning | announce | playing | applause | intermission | leaving
let phaseUntil = 0;
let nextPiece = null;
let clapUntil = 0;
let bowing = false;
let seq = 0; // generation token for the concert sequence
let ritualNext = false; // the next piece opens one of the evening's big moments (a held hush)
let hush = 0; // the house holds its breath (0..1)
// how much the audience talks in each phase (0 while the music plays; the
// conductor's walk-on hushes it; it comes back between pieces and in the interval)
const MURMUR = { lobby: 1, changing: 0.75, entering: 0.6, tuning: 0.3, announce: 0.12, hush: 0, playing: 0, afterglow: 0, applause: 0.45, intermission: 0.9, interval: 1, encore: 0.35, leaving: 0.8 };
let leaf = new Leaf(VENUE); // tonight, for the leaf programme

async function boot() {
  try {
    await engine.init({ lite: AUDIO_LITE, acoustics: IS_SPHERE ? { ...SPHERE_ACOUSTICS, room: 'arena' } : IS_OUTDOOR ? OUTDOOR_ACOUSTICS : null });
  } catch (e) {
    ui.setLoading('이 브라우저에서는 소리를 낼 수 없어요. 최신 Chrome, Edge, Firefox, Safari에서 열어 주세요.', 0);
    throw e;
  }
  engine.setVolume(settings.volume);
  engine.setReverb(settings.reverb);
  engine.setApplause(settings.applauseVol);
  // (the browser taking the sound away, or giving it back: see sound)
  engine.ctx.addEventListener?.('statechange', () => sound.changed());
  if (!IS_OUTDOOR) fx = buildFX(scene, engine);
  // each building plays its own half of the pieces (see programs.js)
  const all = await (await fetch('music/index.json')).json();
  const byId = new Map(all.map((p) => [p.id, p]));
  program = (SETLISTS[VENUE] || SETLISTS.hall).map((id) => byId.get(id)).filter(Boolean);
  if (!program.length) program = all;
  eveningLen = program.length;
  ui.setProgram(program);
  const applauseReady = engine.prepareApplause();
  await engine.loadSamples('samples', (done, total) => {
    ui.setLoading(`악기를 조율하는 중  ${done} / ${total}`, 0.08 + 0.85 * (done / total));
  }).then((r) => {
    if (r?.failed) setTimeout(() => ui.toast(`악기 소리 ${r.failed}개를 불러오지 못했어요. 비슷한 음으로 대신 연주해요.`, 4200), 4000);
  });
  ui.setLoading('객석을 채우는 중', 0.95);
  await new Promise((r) => setTimeout(r, 30));
  await applauseReady;
  current = 0;
  await pieces.choose(program[0].id);
  // every material the evening will need, compiled now (the players, the
  // recital's chairs, ...) rather than with a hitch the first time they appear
  recital.show(true);
  try { hall.dome?.warm(); } catch { /* fine: compiled on first use */ }
  try { renderer.compile(scene, camera); } catch { /* fine: compiled on first use */ }
  warmTextures();
  recital.show(false);
  stage.clearStage();
  ui.ready();
}

// Every picture in the building sent to the GPU now, behind the loading
// screen - not the first time it comes into view (a turn of the head that
// stalls for a second on a laptop's graphics)
function warmTextures() {
  const seen = new Set();
  scene.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.isRenderTargetTexture) seen.add(v); }
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture && !u.value.isRenderTargetTexture) seen.add(u.value);
    }
  });
  for (const t of seen) { try { renderer.initTexture(t); } catch { /* uploaded on first use instead */ } }
}

let joining = false;
ui.on('enter', async (opt) => {
  if (concertStarted || joining) return; // (one entrance, however many presses)
  setName(opt.name); // (the animal stays the one you were given)
  // fullscreen and sound must be started inside the click itself. (Only on
  // a phone or tablet, where the browser's bars take a good part of the
  // screen; at a computer it is a choice: ⛶ or Enter.)
  // iPadOS reserves a downward swipe to exit native fullscreen, which
  // conflicts with looking down. Keep it an explicit choice on Apple touch devices.
  if (isTouch && !appleTouchFullscreen()) goFullscreen();
  // never wait on the audio context: some browsers settle it late
  try { engine.ctx.resume().catch(() => {}); } catch { /* ignored */ }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
  if (opt.mode !== 'solo') {
    joining = true;
    ui.lobbyBusy(true);
    room = new RoomClient();
    wireRoom(room);
    try {
      await room.enter({ name: opt.name, avatar: opt.avatar, venue: VENUE, code: opt.code, create: opt.mode === 'create' ? { title: opt.title, cap: opt.cap, pub: opt.pub } : null });
    } catch (e) {
      if (e.code === 'venue' && VENUES[e.venue]) {
        // the room is in the other building: go there (the invite - or the
        // ticket, now for that building - comes along)
        room.leave();
        ui.lobbyBusy(true); // (on the way: nothing to press meanwhile)
        ui.lobbyError(e.message, { note: true });
        try { localStorage.setItem('fp-venue', e.venue); } catch { /* private mode */ }
        if (ticket) {
          updateTicket({ venue: e.venue });
          // (with storage blocked the ticket lives in the address: it comes along)
          setTimeout(() => { location.href = `${location.pathname}?venue=${e.venue}${ticketQuery({ ...ticket, venue: e.venue })}`; }, 900);
        } else setTimeout(() => goVenue(e.venue, { room: opt.code }), 700);
        return;
      }
      room.leave();
      room = null;
      joining = false;
      ui.lobbyBusy(false);
      // a room that is gone stays gone: the ticket becomes a seat of your own
      // (a reload is then the usher with that, not the same failure again)
      const gone = e.code === 'notfound';
      if (gone) soloTicket();
      ui.lobbyError(e.message || '방에 들어가지 못했어요.', { dead: gone });
      refreshRooms();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      return;
    }
    joining = false;
    ui.lobbyBusy(false);
    // a reload keeps you in the room you made (not a second one)
    if (ticket && room?.room) updateTicket({ mode: 'join', code: room.room.code });
  } else soloTicket(); // (혼자 보기 after a room would not have you: a reload is the same)
  director.active = true;
  ui.enter(isTouch);
  // you arrive in the foyer, in front of the doors to the stalls
  director.placeAt(ENTRANCE.pos, ENTRANCE.look);
  director.targetFov = director.fov = 64;
  concertStarted = true;
  holdQuality(6000);
  hall.setHouseLights(1);
  requestWakeLock();
  if (room && !room.isHost && pendingJoin !== undefined) catchUp(pendingJoin);
  pendingJoin = undefined;
});

// watching alone from now on: the ticket (if any) says so, and the address
// is this building's - a reload is not the room that is gone
function soloTicket() {
  if (ticket && ticket.mode !== 'solo') updateTicket({ mode: 'solo', code: undefined });
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('room')) return;
    u.searchParams.delete('room');
    u.searchParams.set('venue', VENUE);
    if (!ticket) u.searchParams.set('lobby', '1'); // (no ticket: this building's lobby, not the square)
    history.replaceState(null, '', u.pathname + u.search);
  } catch { /* file: */ }
}

function appleTouchFullscreen() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  // (no keyboard lock: Esc keeps its usual meaning, out of fullscreen)
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

function startShow() {
  if (!concertStarted || showStarted || hostOnly()) return;
  showStarted = true;
  ui.showStarted();
  // still out in the foyer: the music comes through the wall (as it would) -
  // say how to hear it properly, never move them
  if (IS_HALL && engine.ctx) {
    // (after the walk-on, which has its own toast - and only if they are still out there)
    const hint = (ms, tries = 0) => setTimeout(() => {
      if ((phase === 'changing' || phase === 'entering') && tries < 40) return hint(1000, tries + 1);
      const L = director.listener(settings.fixedEar ? bestSeat : null);
      if (hallOpenness(L.pos.x, L.pos.y, L.pos.z) < 0.6) ui.toast('로비에서는 벽 너머로 들려요 · 홀 안으로 들어가 자리에 앉거나(좌석 클릭) 편하게 보기로 들으면 또렷해요', 6500);
    }, ms);
    hint(1500);
  }
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
async function scoreFor(i) {
  const meta = program[i];
  if (!meta) return null;
  if (perf.piece?.id === meta.id) return perf.piece;
  try { return await scores.get(meta.id); } catch { return null; }
}
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
  const piece = await scoreFor(i);
  // A failed look-ahead must not send everyone off or become a cached empty
  // roster. The next request retries once the connection is back.
  if (!piece) return new Set(stage.onstageKeys());
  const r = rosterOf(piece);
  rosterCache.set(meta.id, r);
  return r;
}
// the piece that normally follows i (the evening's order)
const seqNext = (i) => (i === eveningLen - 1 ? 0 : (i + 1) % program.length);
const STRINGS = /^(vn1|vn2|va|vc|cb):/;

// Start piece i: musicians on stage, conductor in, then play.
// remote: a guest following the host's 'run' (the host starts the music)
// late: a guest coming in while the host's orchestra walks on - { cond: the
// host's conductor is out already, set(): called once our stage is set }
async function runConcert(i, { quick = false, remote = false, late = null } = {}) {
  const tok = ++seq;
  endInterval();
  ceremony = true;
  if (perf.playing) perf.pause();
  if (quick) { engine.stopApplause(); clapUntil = 0; }
  if (quick && phase === 'tuning') engine.stopAll(); // (skipped: the tuning-up stops too)
  ui.setPlaying(false);
  bowing = false;
  // (a piece picked during the bows: nobody plays it bent over, still on
  // their feet or turned to the house)
  stage.conductorBow(false);
  stage.greet(stage.walkers.filter((w) => w.bowTarget || w.faceYaw !== null || (w.atHome && !w.standingRole && !w.sitTarget)), false);
  const idx = (i + program.length) % program.length;
  // (skipping away from the encore: the evening goes on from the piece picked)
  const away = quick && idx !== current;
  current = idx;
  const meta = program[current];
  nextPiece = meta;
  // (the guests start fetching it now; the snapshot that goes with it says
  // it is on its way, not playing: see snapshot)
  if (!remote) sendCmd({ c: 'run', i: current, quick, ritual: ritualNext && !quick });
  let piece;
  try {
    piece = await pieces.choose(meta.id);
  } catch (e) {
    pieceFailed(idx, e, tok);
    return;
  }
  if (!piece) return; // (another piece was chosen meanwhile: that one goes on)
  if (away) encoreActive = false;
  if (tok !== seq) return;
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
  const isRecital = kind === 'solo' && target.has('piano:0');
  spot.set(null);
  if (!isRecital) closeRecital();
  encoreUi(null);
  const { exits, enters } = stage.plan(target, keep);
  // Skipping ahead - or in a background tab, where nothing is drawn and so
  // nobody would walk - there is no procession: the stage straight as it
  // should be (also when ▶ is pressed while they are still walking on, and
  // for a guest who comes in while the host's orchestra walks on: they see
  // the stage as it is now, not a procession of their own from an empty one)
  const snap = quick || !!late || document.hidden;
  const moving = stage.walkers.some((w) => w.state === 'walking' || w.state === 'queued' || w.leaving);
  if (snap && (exits.length || enters.length || moving)) {
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
      // (a whole orchestra comes on closer together: it is a long walk-on)
      stage.callOn(enters, enters.length >= 16 ? 0.7 : undefined, { stand: soloists });
      // the stage fills in silence: say so (and that it can be skipped)
      if (enters.length >= 6 && !remote && !guest()) ui.toast('단원들이 무대로 들어오고 있어요. 곧 시작해요 · ▶ 누르면 바로 들어요', 9000);
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
        if (settings.applauseVol > 0) { engine.applause(engine.now + 0.05, 0.5, audience ? audience.count : 0); clapUntil = performance.now() + 2800; }
        stage.greet(enters, true);
        if (!(await wait(1400, tok))) return;
        stage.greet(enters, false);
        if (!(await wait(1300, tok))) return;
      }
    } else if (fresh) {
      if (!(await wait(400, tok))) return;
    }
  }
  if (late) {
    // in late: our stage is set (the host's page, reloaded, may run the show
    // again from here). The conductor comes on when the host's does - unless
    // they are out there already
    late.set?.();
    setPhase('entering');
    hall.setHouseLights(0.75);
    if (!late.cond && !(await until(() => !guest() || hostState?.cond || ['announce', 'hush', 'playing'].includes(hostState?.phase), tok, 1e9))) return;
  }
  if (piece.conducted) {
    if (snap && (!late || late.cond) && !(stage.conductorOn && stage.conductorReady)) {
      // (skipping ahead: already on the podium, turned to the orchestra)
      stage.snapConductor(true);
      if (!(await wait(600, tok))) return;
    } else if (!stage.conductorOn) {
      setPhase('announce');
      stage.conductorEnter();
      if (!(await until(() => stage.conductorReady, tok, 30000))) return;
      // greets the audience, a short welcome applause, turns to the orchestra
      if (settings.applauseVol > 0) { engine.applause(engine.now + 0.05, 0.6, audience ? audience.count : 0); clapUntil = performance.now() + 3200; }
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
  } else if (snap && !stage.conductorOffstage) {
    // (skipping ahead: gone already, not still walking off during the music)
    stage.snapConductor(false);
    if (!(await wait(500, tok))) return;
  } else if (stage.conductorOn) {
    // a solo or chamber piece: the conductor leaves the stage to the players
    stage.conductorExit();
    if (!(await wait(quick ? 500 : 2500, tok))) return;
  } else if (!(await wait(quick ? 300 : 1200, tok))) return;

  // a recital: the light gathers on the soloist (and chairs come out on the stage)
  if (kind === 'solo') spot.set(rosterCentre(target));
  if (isRecital) recital.open(true, piece);
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
    // the host starts the music; we join on its clock (see follower).
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

// The piece chosen could not be loaded (offline, a failed answer): the one
// loaded stays the current one - its number, its title, where it was - and
// a press tries again, without a reload (a failed download is not kept).
// Only the latest choice gets here (pieces.js); tok: its run of the show
let retryIndex = -1;
function pieceFailed(i, e, tok) {
  console.warn('piece not loaded', program[i]?.id, e);
  const title = program[i]?.titleKo;
  current = Math.max(0, program.findIndex((p) => p.id === perf.piece?.id));
  nextPiece = program[current];
  ui.setCurrent(current, perf.piece);
  ui.setTime(perf.time, perf.duration);
  if (tok === seq) {
    ceremony = false;
    ui.setPlaying(perf.playing);
    // (between pieces it stays between pieces: ▶ goes on from there)
    if (phase !== 'playing') setPhase('intermission');
  }
  retryIndex = i;
  ui.offer('retry', `「${title || '다음 곡'}」 악보를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.`, '다시 시도');
  // the room: the host stays where it is - said at once, so nobody plays on
  // the piece that did not come (see 'stay')
  if (room?.isHost) sendCmd({ c: 'stay', i: current });
}
function retryPiece() {
  ui.offer('retry', null);
  if (!concertStarted) return;
  // (a guest: the host's piece, from the host's latest state)
  if (guest()) { if (hostState) followHost(hostState, { joining: true }); return; }
  if (retryIndex < 0) return;
  showOn();
  runConcert(retryIndex, { quick: true });
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
  hall.setHouseLights(sleepy ? 0.04 : kind === 'solo' ? 0.3 : 0.5); // (nodding off: they stay down)
  if (big) hall.show?.('finale');
  if (settings.applauseVol > 0) {
    engine.applause(engine.now + 0.35, big ? 1.3 : 1, audience ? audience.count : 0);
    clapUntil = performance.now() + (big ? 12500 : 7600);
  }
  if (settings.fx && !efficient() && big && fx) {
    fx.fanfare(engine.now + 0.3);
    fx.confettiCannons();
    setTimeout(() => { if (settings.fx && !efficient()) fx.fireworksShow(); }, 1500);
  } else if (settings.fx && !efficient() && fx && piece?.mood === 'lively' && G.confetti) {
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
  if (piece) playedTonight.add(piece.id);
  if (lastOfProgram && !encoreActive && !guest()) {
    // the end of the programme: the house asks for one more
    const win = await encoreVote(tok);
    if (win === null) return;
    if (win >= 0) {
      encoreActive = true;
      ritualNext = true;
      runConcert(win);
      return;
    }
  }
  const finalOfEvening = lastOfProgram || encoreActive;
  let next = encoreActive ? 0 : nextIndex();
  // falling asleep (alone): the last minutes are a quiet piano piece
  if (sleepAt && !room && !finalOfEvening && sleepAt - performance.now() < 5 * 60000) next = lullaby(next);
  nextPiece = program[next];
  if (!finalOfEvening && intervalDue(current) && !(sleepAt && sleepAt - performance.now() < 10 * 60000)) {
    // the middle of the evening: the interval
    intervalDone = true;
    const endsAt = clockNow() + settings.interval * 60;
    beginInterval(endsAt, next); // (first: the snapshot that goes with the command says so)
    sendCmd({ c: 'interval', i: next, until: endsAt });
    if (!(await until(() => !intervalState || clockNow() >= intervalState.until, tok, 1e9))) return;
    ritualNext = true;
    runConcert(next);
    return;
  }
  setPhase('intermission', Math.max(2, settings.gap));
  if (finalOfEvening) {
    // end of the programme: everyone leaves, the house comes up, then a new evening begins
    encoreActive = false;
    ritualNext = true; // the next evening opens with its hush
    closeRecital();
    endEvening();
    hall.setHouseLights(1);
    hall.show?.('house');
    sendCmd({ c: 'exit' });
    stage.exitAll();
    if (!(await until(() => stage.allOffstage, tok, 60000))) return;
    if (!(await wait(4000, tok))) return;
    // the next evening waits until tonight's leaf is put away (in a room,
    // not for longer than a minute: the others are waiting too)
    const leafCard = document.getElementById('leaf');
    if (!(await until(() => !leafCard || leafCard.hidden, tok, room ? 60000 : 1e9))) return;
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
  // (the piece chosen is on its way: nothing to play or pause yet - not the
  // one before it either)
  if (loadingPiece()) { ui.toast('곡을 불러오는 중이에요. 곧 시작해요.', 1600); return; }
  if (phase === 'interval' && intervalState) { secondHalf(); return; }
  if (phase === 'encore' && encore) { encore.until = clockNow(); return; }
  if (phase !== 'playing') {
    // during a break: skip the ceremony and start the coming piece
    runConcert(phase === 'intermission' ? nextIndex() : current, { quick: true });
    return;
  }
  if (perf.playing) {
    perf.pause();
    ui.setPlaying(false);
    hall.setHouseLights(0.4);
    sound.check(); // (paused: no "sound back" button that would bring no music)
  } else {
    if (perf.pos >= perf.duration - 0.1) perf.seek(0);
    perf.play();
    ui.setPlaying(true);
    hall.setHouseLights(0.12);
  }
  sendCmd(playMsg());
}

ui.on('toggle', togglePlay);
// the button that fixes something with one press (see ui.offer)
ui.on('offer', (kind) => {
  if (kind === 'retry') retryPiece();
  else if (kind === 'sound') sound.check({ gesture: true });
});
const showOn = () => { if (!showStarted) { showStarted = true; ui.showStarted(); } };
// (before the show ⏮ / ⏭ open the evening as ▶ does - from its first piece,
// not from its last)
ui.on('next', () => { if (!concertStarted || hostOnly()) return; if (!showStarted) { startShow(); return; } runConcert(settings.shuffle ? nextIndex() : current + 1, { quick: true }); });
ui.on('prev', () => {
  if (!concertStarted || hostOnly()) return;
  if (!showStarted) { startShow(); return; }
  if (phase === 'playing' && perf.time > 5 && !loadingPiece()) { perf.seek(0); sendCmd(playMsg()); return; }
  showOn();
  runConcert(current - 1, { quick: true });
});
ui.on('select', (i) => { if (!concertStarted || hostOnly()) return; showOn(); runConcert(i, { quick: true }); });
ui.on('seek', (t) => {
  if (!concertStarted || phase !== 'playing' || loadingPiece() || hostOnly()) return;
  perf.seek(t);
  sendCmd(playMsg());
});
ui.on('seekKey', (d, e) => {
  // (walking, ← → turn you - except on the focused position slider itself)
  if (!concertStarted || phase !== 'playing' || loadingPiece() || (director.mode === 'walk' && e.target?.id !== 'seek')) return;
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
ui.on('dialogOpen', () => {
  const miniature = document.getElementById('bremen');
  if (miniature?.open) miniature.close();
  director.keys.clear();
  director.vel.set(0, 0, 0);
  director.releaseLock();
});
ui.on('jump', () => director.jump());
ui.on('mute', () => {
  muted = !muted;
  engine.setVolume(muted ? 0 : settings.volume);
  ui.setMuted(muted);
  ui.toast(muted ? '음소거' : '소리 켬', 1200);
});
ui.on('fullscreen', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else {
    if (appleTouchFullscreen()) ui.toast('iPad에서는 아래로 쓸면 전체화면이 해제될 수 있어요. 일반 화면에서도 둘러볼 수 있어요.', 6500);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
});
ui.on('unfocus', () => {
  focused = null;
  engine.setFocus(null);
  ui.focus(null);
  director.setMode('walk');
});
ui.on('solo', (on) => engine.setFocus(on && focused ? focused.sid : null));

// ------------------------------------------------------------- the interval
// Once an evening, at the programme's middle (by music, see intervalDue):
// the house lights come up, everyone leaves the stage, the doors stand open.
// The first cellist practises the coming half in the foyer (on stage at the
// Sphere, which has no foyer), the violist may take the seat you left, the
// notice board has the musicians' news. Bells call everyone back.
const BEAR = 'vc:0';
const practice = new Practice(engine);
let intervalState = null; // { until (clock s), next, bear, bells }
let intervalDone = false;
let lastSeat = null;
let tea = false;
const clockNow = () => (room ? room.now() : performance.now() / 1000);
// the foyer: where the cellist sits (an ottoman, facing the middle), the notice board
const FOYER_BEAR = IS_HALL ? { x: 4.4 - 0.78, y: LEVELS[0] - 0.05, z: 37.6, yaw: Math.PI / 2 } : null;
const BOARD = IS_HALL ? { x: 10, y: LEVELS[0] + 1.65, z: HALL.back + HALL.wallT + 0.02 } : null;
if (BOARD) buildNoticeBoard(hall.group, new THREE.Vector3(BOARD.x, BOARD.y, BOARD.z), 0);

function intervalDue(i) {
  if (!settings.interval || settings.shuffle || settings.repeatOne || intervalDone) return false;
  if (i >= eveningLen - 1) return false;
  let total = 0;
  let upto = 0;
  for (let k = 0; k < eveningLen; k++) { total += program[k].duration; if (k <= i) upto += program[k].duration; }
  return upto >= total / 2;
}

function beginInterval(endsAt, next) {
  endInterval();
  follower.cancel(); // (a playback sync still on its way is out of date now)
  if (perf.playing) { perf.pause(); ui.setPlaying(false); }
  closeRecital();
  intervalState = { until: endsAt, next, bear: 'wait', bells: 0 };
  intervalDone = true;
  setPhase('interval');
  hall.setHouseLights(1);
  hall.show?.('house');
  spot.set(null);
  fx?.lasers.set(false);
  fx?.wash.set(false);
  if (stage.conductorOn) stage.conductorExit();
  // everyone leaves (at the Sphere the cellist stays on to practise)
  const off = stage.walkers.filter((w) => w.state !== 'off' && !w.leaving && (!IS_SPHERE || StageManager.key(w) !== BEAR));
  if (off.length) stage.sendOff(off);
  ui.interval(true, !guest());
  ui.setIntervalLeft(endsAt - clockNow());
  // the seat you leave behind (seven times in ten, someone wants it)
  const r = room ? seeded(room.seed ^ 0x5ea7)() : Math.random();
  if (!IS_OUTDOOR) thief.arm(director.mode === 'seat' ? director.seat : lastSeat, r < 0.7);
  ui.toast(`인터미션이에요. ${Math.max(1, Math.round((endsAt - clockNow()) / 60))}분 뒤에 2부가 시작돼요.${IS_HALL ? ' 로비로 나가 봐요.' : IS_OUTDOOR ? ' 공원 길을 잠깐 거닐어 봐요.' : ''}`, 3600);
}

function endInterval() {
  if (!intervalState) return;
  intervalState = null;
  practice.stop();
  const bear = stage.walkers.find((w) => StageManager.key(w) === BEAR);
  if (bear?.state === 'away') stage.giveBack(bear); // (at the Sphere he is already in his chair)
  thief.clear();
  refreshOccupied();
  ui.interval(false);
  ui.act(null);
  tea = false;
}

// the host (or alone): start the second half now
function secondHalf() {
  if (!intervalState || hostOnly()) return;
  const next = intervalState.next;
  ritualNext = true;
  runConcert(next);
}

async function startPractice() {
  if (IS_OUTDOOR) return;
  // a phrase from the coming half (the next piece with a cello part)
  let score = null;
  for (let k = 0; k < 8 && !score && intervalState; k++) {
    const sc = await scoreFor((intervalState.next + k) % program.length);
    if (sc?.tracks.some((tr) => tr.section === 'vc')) score = sc;
  }
  if (!score || !intervalState) return;
  if (IS_HALL) engine.addSpot('lobby', { x: FOYER_BEAR.x, y: FOYER_BEAR.y + 0.9, z: FOYER_BEAR.z });
  practice.start(score, { section: IS_SPHERE ? 'vc' : 'lobby', seed: room ? room.seed : (Math.random() * 1e9) | 0 });
}

let thiefWas = null;
function intervalTick(dt) {
  const S = intervalState;
  const bear = stage.walkers.find((w) => StageManager.key(w) === BEAR);
  if (S.bear === 'wait' && bear) {
    if (IS_HALL && bear.state === 'off') {
      stage.borrow(BEAR, FOYER_BEAR, FOYER_BEAR.yaw);
      S.bear = 'on';
      startPractice();
    } else if (IS_SPHERE && bear.state === 'off') {
      // (at the Sphere he practises in his own chair: walk on if he is not there)
      stage.callOn([bear]);
      S.bear = 'walking';
    } else if (IS_SPHERE && bear.state === 'seated') {
      S.bear = 'on';
      startPractice();
    }
  } else if (S.bear === 'walking' && bear?.state === 'seated') {
    S.bear = 'on';
    startPractice();
  }
  // the seat thief (away: out in the foyer, or anywhere far from the seat)
  const d = director;
  const inFoyer = IS_HALL && d.pos.z > HALL.back + 0.5;
  const nearThief = !IS_OUTDOOR && thief.update(dt, d.pos, d.mode === 'walk' && (inFoyer || IS_SPHERE));
  if (thief.taken !== thiefWas) { thiefWas = thief.taken; refreshOccupied(); }
  ui.act(nearThief ? `${thief.name}에게 도토리 쿠키 건네기` : nearBoard() ? '숲속 소식 읽기' : null);
}
function nearBoard() {
  const d = director;
  return !!BOARD && d.mode === 'walk' && Math.abs(d.feet - LEVELS[0]) < 0.6 && Math.hypot(d.pos.x - BOARD.x, d.pos.z - BOARD.z) < 2.6;
}
// (outside the interval the board can still be read)
setInterval(() => {
  if (!concertStarted || intervalState || !BOARD || asleep) return;
  ui.act(nearBoard() ? '숲속 소식 읽기' : null);
}, 300);

// the countdown, and the bells that call everyone back
setInterval(() => {
  const S = intervalState;
  if (!S) return;
  const left = S.until - clockNow();
  ui.setIntervalLeft(left);
  if (left < 60 && S.bells < 1) { S.bells = 1; bells(2); ui.toast('곧 2부가 시작돼요. 자리로 돌아와 주세요.', 3200); }
  if (left < 15 && S.bells < 2) { S.bells = 2; bells(3); }
}, 500);

// the foyer bell: a soft three-note chime, rung `times` times
function bells(times) {
  const ctx = engine.ctx;
  if (!ctx || muted) return;
  // (through the engine's master: volume, mute and the limiter apply)
  const notes = [];
  for (let k = 0; k < times; k++) [1046.5, 880, 698.5].forEach((f, i) => notes.push([f, 0.02 + k * 1.6 + i * 0.36]));
  engine.chime(notes, 0.05, 1.4);
}

async function showNews() {
  // the coming pieces (the next half first), with who plays them
  const coming = [];
  const from = intervalState ? intervalState.next : nextIndex();
  for (let k = 0; k < 6; k++) {
    const i = (from + k) % program.length;
    if (k > 0 && i === 0) break;
    const sc = await scoreFor(i);
    if (!sc) continue;
    const roster = rosterOf(sc);
    coming.push({ meta: program[i], roster, kind: ensembleOf(sc, roster) });
  }
  ui.showNews(noticeLines({ coming, practiser: intervalState && practice.on ? BEAR : null, week: Math.floor((Date.now() / 86400000 + 3) / 7) }));
}

ui.on('tea', () => {
  if (tea) return;
  tea = true;
  ui.tea();
  ui.toast('따뜻한 도토리차를 받았어요. 고소한 냄새가 나요.', 2600);
});
ui.on('news', showNews);
ui.on('secondHalf', secondHalf);
ui.on('act', () => {
  const s = thief.taken;
  if (s && Math.hypot(director.pos.x - s.x, director.pos.z - s.z) < 1.8) {
    thief.shoo();
    ui.act(null);
    ui.toast(`${josa(thief.name, '이', '가')} 쿠키를 받아 들고 무대 뒤로 쪼르르 돌아갔어요. 자리가 다시 비었어요.`, 3200);
    return;
  }
  showNews();
});

// -------------------------------------------------------------- a recital
// When the pianist plays alone, chairs come out on the stage behind them and
// a page turner's chair at their side (see recital.js): the chip at the top
// takes you there, and you are seen back to your seat when it ends.
function closeRecital() {
  if (!recital.on) return;
  recital.open(false);
  if (director.seat?.stage) {
    if (lastSeat && !director.occupied.has(lastSeat.index)) director.sitAt(lastSeat);
    else { director.setMode('walk'); director.placeAt(ENTRANCE.pos, ENTRANCE.look); }
  }
}
ui.on('stageSeat', (turner) => {
  if (!recital.on) return;
  const free = recital.seats.filter((s) => !!s.turner === turner && !director.occupied.has(s.index));
  if (!free.length) { ui.toast(turner ? '악보 넘김이 자리에 이미 누가 앉아 있어요.' : '무대 위 자리가 다 찼어요.', 2000); return; }
  focused = null;
  ui.focus(null);
  engine.setFocus(null);
  director.sitAt(free[0]);
  ui.toast(turner ? `${PIANIST.char.spec.name}의 악보 넘김이 자리예요. 연주에 맞춰 악보가 넘어가요.` : '무대 위 자리예요. 건반이 어깨 너머로 보여요.', 3000);
});

// the quiet piece to fall asleep to (alone, in the sleep timer's last minutes)
function lullaby(next) {
  const left = (sleepAt - performance.now()) / 1000;
  const quiet = (m) => m && m.ensembleKo === '피아노' && m.mood === 'calm';
  if (quiet(program[next])) return next;
  const calm = program.map((m, i) => ({ m, i })).filter(({ m }) => quiet(m) && !playedTonight.has(m.id));
  if (!calm.length) return next;
  const fits = calm.filter(({ m }) => m.duration <= left + 20);
  const pool = fits.length ? fits : calm;
  return pool[Math.floor(Math.random() * pool.length)].i;
}

// --------------------------------------------------------------- the encore
// At the end of the programme the house asks for one more: three short
// pieces (one the players on stage can play right away, one of another
// kind, one lively), one firefly lantern each. Alone your lantern decides;
// in a room the host counts (lanterns go to the host only, a tie goes the
// host's way). The hall's fireflies gather as lanterns go up; at the Sphere
// the dome turns into a starry sky.
let encore = null; // { cands, candMeta, until, votes: Map (the host) | null (a guest), mine, counts }
let encoreActive = false; // the encore is playing: after it, the evening ends
const playedTonight = new Set();
const HOUSE = new THREE.Vector3(0, 10.5, 13);

function encoreCounts() {
  const n = [0, 0, 0];
  if (encore?.votes) for (const k of encore.votes.values()) n[k]++;
  return n;
}

async function encoreCandidates() {
  const on = stage.onstageKeys();
  const rand = room ? seeded((room.seed ^ 0xe7c0) + playedTonight.size) : Math.random;
  const pool = [];
  for (let i = 0; i < program.length; i++) if (program[i].duration <= 240 && !playedTonight.has(program[i].id)) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const info = [];
  for (const i of pool.slice(0, 16)) {
    const r = await rosterFor(i);
    info.push({ i, fit: r.size > 0 && [...r].every((k) => on.has(k)), kind: ensembleOf(program[i], r), mood: program[i].mood });
  }
  const out = [];
  const take = (f) => { const c = info.find((x) => !out.includes(x) && f(x)); if (c) out.push(c); };
  take((x) => x.fit); // the players already there
  take((x) => !out.length || x.kind !== out[0].kind); // something of another kind
  take((x) => x.mood === 'lively' || x.mood === 'grand');
  while (out.length < 3 && out.length < info.length) take(() => true);
  return out.map((x) => x.i);
}

function encoreShow() {
  if (!encore) return;
  const counts = encore.votes ? encoreCounts() : encore.counts || [0, 0, 0];
  ui.encore({ cands: encore.candMeta, counts, mine: encore.mine, left: encore.until - clockNow() });
  // the more lanterns, the more fireflies come
  const people = room ? room.members.size : 1;
  const raised = counts.reduce((a, b) => a + b, 0);
  if (!IS_SPHERE) effects.gather(0.3 + 0.7 * Math.min(1, raised / Math.max(1, people)), HOUSE);
}

function encoreUi(state) {
  if (state !== null) return;
  // the fireflies fly off again (also after a count, which has already put
  // the lanterns down)
  effects.gather(0);
  if (!encore) return;
  encore = null;
  ui.encore(null);
}

// the host (or alone): ask, wait, count. The winner's index, -1 for none, or
// null when the evening moved on meanwhile
async function encoreVote(tok) {
  const cands = await encoreCandidates();
  if (tok !== seq) return null;
  if (!cands.length) return -1;
  const endsAt = clockNow() + 14;
  encore = { cands, candMeta: cands.map((i) => program[i]), until: endsAt, votes: new Map(), mine: -1 };
  closeRecital();
  director.releaseLock(); // (the lanterns are clicked: the mouse is let go)
  setPhase('encore');
  hall.setHouseLights(0.2);
  spot.set(null);
  if (IS_SPHERE) hall.dome?.go('STARS', { dur: 3 });
  sendCmd({ c: 'encore', cands, until: endsAt });
  encoreShow();
  return countEncore(tok);
}

// wait for the lanterns, count them: the winner's index, or null
async function countEncore(tok) {
  // alone, your lantern decides (a moment after you raise it)
  let chosenAt = 0;
  const ok = await until(() => {
    if (!encore) return true;
    if (!room && encore.mine >= 0) { chosenAt ||= clockNow(); if (clockNow() - chosenAt > 1.6) return true; }
    return clockNow() >= encore.until;
  }, tok, 30000);
  if (!ok || !encore) return null;
  const counts = encoreCounts();
  let best = -1;
  let bestN = 0;
  counts.forEach((n, k) => { if (n > bestN || (n === bestN && n > 0 && k === encore.mine)) { best = k; bestN = n; } });
  if (best < 0) best = 0; // no lantern at all: the conductor's choice
  const win = encore.cands[best];
  encore = null;
  ui.encore(null);
  ui.toast(`앙코르: 「${program[win].titleKo}」`, 3200);
  return win;
}

// a guest who became the host while the lanterns were up: count and go on
async function finishEncore(tok) {
  const win = await countEncore(tok);
  if (win === null) return;
  encoreActive = true;
  ritualNext = true;
  runConcert(win);
}

// a guest: the host's vote, as the host counts it (from the snapshots)
function guestEncore(ev, fresh = false) {
  if (!encore || fresh || encore.cands.join() !== ev.c.join()) {
    follower.cancel();
    closeRecital();
    encore = { cands: ev.c, candMeta: ev.c.map((i) => program[i]), until: ev.u, votes: null, mine: -1, counts: ev.n };
    director.releaseLock();
    setPhase('encore');
    hall.setHouseLights(0.2);
    spot.set(null);
    if (IS_SPHERE) hall.dome?.go('STARS', { dur: 3 });
  }
  encore.counts = ev.n;
  encore.until = ev.u;
  encoreShow();
}

ui.on('vote', (k) => {
  if (!encore) return;
  encore.mine = encore.mine === k ? -1 : k;
  if (encore.votes) {
    // the host (or alone) counts their own lantern
    const me = room ? room.id : 0;
    if (encore.mine >= 0) encore.votes.set(me, encore.mine); else encore.votes.delete(me);
    publish();
  } else room?.vote(encore.mine);
  encoreShow();
});
setInterval(() => { if (encore) encoreShow(); }, 500);

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
  intervalDone = false; // a new evening has its own interval
  playedTonight.clear();
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
let sleepy = false; // the house nods off (the last minute)
let asleep = false; // everything stopped: nothing drawn, the sound suspended
let sleepGen = 0; // a changed timer cancels what the old one scheduled
ui.on('sleep', (minutes) => {
  sleepGen++;
  sleepAt = minutes ? performance.now() + minutes * 60000 : 0;
  sleepFading = false;
  if (!minutes && sleepy) { sleepy = false; effects.dim(1); }
  engine.setVolume(muted ? 0 : settings.volume);
  ui.setSleepLeft(0);
  ui.toast(minutes ? `${minutes}분 뒤에 천천히 소리를 줄이고 멈출게요.` : '끄기 예약을 취소했어요.', 2400);
});
setInterval(() => {
  if (!sleepAt) return;
  const left = sleepAt - performance.now();
  ui.setSleepLeft(Math.max(0, left));
  if (left <= 75000 && !sleepy) {
    // the last minute: the lights go down, the house nods off
    sleepy = true;
    // (a soloist's spotlight stays: letting it go would bring the fills back up)
    hall.setHouseLights(0.04);
    effects.dim(0.3);
  }
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
    const gen = sleepGen;
    setTimeout(() => goToSleep(gen), 4000);
    return;
  }
  if (left <= 0 && room?.isHost && room.members.size > 1) {
    // 5. the host falls asleep: the show goes on for the others - the
    // longest-present guest takes it over, and only this screen sleeps
    const next = [...room.members.values()].filter((m) => m.id !== room.id).sort((a, b) => (a.since ?? 0) - (b.since ?? 0) || a.id - b.id)[0];
    if (next) {
      room.handoff(next.id);
      ui.chatLine({ sys: true, text: `잠들기 전에 ${next.name}님에게 방장을 넘겼어요.` });
    }
    sleepAt = 0;
    sleepFading = false;
    muted = true;
    engine.setVolume(0);
    ui.setMuted(true);
    ui.setSleepLeft(0);
    ui.toast('편안한 밤 되세요. 방장을 넘기고 소리를 껐어요.', 4000);
    const gen = sleepGen;
    setTimeout(() => goToSleep(gen), 4000);
    return;
  }
  if (left <= 0) {
    sleepAt = 0;
    sleepFading = false;
    seq++;
    if (perf.playing) perf.pause();
    ui.setPlaying(false);
    hall.setHouseLights(0.04);
    setTimeout(() => engine.setVolume(muted ? 0 : settings.volume), 800);
    ui.setSleepLeft(0);
    ui.toast('편안한 밤 되세요. 공연을 멈췄어요.', 4000);
    // the musicians tiptoe off; then everything rests. (Not 'playing' any
    // more: ▶ after waking calls them back on for the piece from its start -
    // between pieces, for the next one.)
    const between = ['applause', 'afterglow', 'intermission', 'interval', 'encore'].includes(phase);
    endInterval();
    setPhase(between ? 'intermission' : 'changing');
    closeRecital();
    encoreUi(null);
    if (stage.conductorOn) stage.conductorExit();
    stage.exitAll();
    const gen = sleepGen;
    setTimeout(() => goToSleep(gen), 9000);
  }
}, 1000);

// Asleep: nothing is drawn and the sound is suspended (and the screen lock
// let go, so a phone can rest too). A touch or a key wakes it all.
function goToSleep(gen = sleepGen) {
  if (asleep || sleepAt || gen !== sleepGen) return;
  asleep = true;
  cancelFrame();
  holdQuality(6000);
  screenActive = false;
  ui.sleep(true);
  try { engine.ctx.suspend(); } catch { /* fine */ }
  try { wakeLock?.release(); } catch { /* fine */ }
  wakeLock = null;
}
function wake() {
  if (!asleep) return;
  asleep = false;
  sleepy = false;
  ui.sleep(false);
  try { engine.ctx.resume(); } catch { /* fine */ }
  effects.dim(1);
  hall.setHouseLights(0.6);
  requestWakeLock();
  holdQuality(6000);
  lastNow = performance.now();
  fpsAcc = 0;
  fpsFrames = 0;
  screenActive = false;
  requestFrame();
}
// (a touch or a key is also what a browser waits for to give the sound back)
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { if (asleep) wake(); else sound.check({ gesture: true }); }, true);

director.on((type, data) => {
  if (type === 'mode') ui.setMode(data);
  if (type === 'seat' && data?.index >= 0 && !data.stage) lastSeat = data;
  // no seat labels on screen; E (or a double-click) still sits you down.
  // Touch screens keep the plain "앉기" button - it is their only way to sit -
  // and, seated, the same button stands you up again
  if (type === 'nearSeat' && isTouch && director.mode !== 'seat') ui.prompt(data ? '앉기' : null, '앉기');
  if (type === 'mode' && isTouch) {
    if (data === 'seat') ui.prompt('일어서기', '일어서기');
    else ui.prompt(data === 'walk' && director.nearSeat ? '앉기' : null, '앉기');
  }
  if (type === 'pick') onPick(data);
  if (type === 'aim') ui.setAim(data);
  if (type === 'lock') ui.setLocked(data);
  if (type === 'looked') ui.hideLookHint();
  // a click (not a drag) on the hall captures the mouse for free looking
  // (not the second click of a double-click on 입장하기, falling through
  // the fading splash)
  if (type === 'clickView' && concertStarted && !isTouch && !document.getElementById('splash')) director.requestLock();
});

function onSetting(key, value) {
  if (key === 'domeProjection') value = normalizeDomeProjection(value);
  settings[key] = value;
  save();
  if (key === 'volume') { muted = false; ui.setMuted(false); engine.setVolume(value); }
  if (key === 'reverb') engine.setReverb(value);
  if (key === 'applauseVol') engine.setApplause(value);
  if (key === 'quality') {
    quality = value === 'auto' ? (LITE ? 'low' : autoStart()) : value === 'efficient' ? 'low' : value;
    renderScale = 1;
    adaptiveQuality.reset(quality, renderScale, performance.now());
    efficientQuality.reset('low', 1, performance.now());
    framePacer.reset();
    worldPacer.reset();
    applyQuality();
    fxFor(perf.piece);
    ui.setFps(frameStats.fps, value === 'efficient' ? 'efficient' : quality);
  }
  if (key === 'domeProjection') hall.dome?.setProjection(value);
  if (key === 'fireflies') effects.setCounts(value);
  if (key === 'screen') screen.setEnabled(value && !IS_OUTDOOR);
  if (key === 'lasers' && !value && fx) { fx.lasers.set(false); fx.wash.set(false); }
  if (key === 'lasers') hall.setBeams?.(value && !efficient()); // (the Sphere's moving heads)
  // the audience slider: the crowd is rebuilt once the slider rests for a
  // moment, not on every step of a drag
  if (key === CROWD) {
    clearTimeout(crowdTimer);
    crowdTimer = setTimeout(seatAudience, 180);
  }
}
let crowdTimer = 0;

function applyQuality() {
  holdQuality(4500); // target/shadow reallocations are transient, not sustained load
  const q = QUALITY[quality];
  renderer.setPixelRatio(pixelRatio());
  renderer.shadowMap.enabled = q.shadows;
  hall.lights.key.castShadow = q.shadows;
  if (hall.lights.key.shadow.map && hall.lights.key.shadow.mapSize.x !== q.shadowSize) {
    hall.lights.key.shadow.map.dispose();
    hall.lights.key.shadow.map = null;
  }
  hall.lights.key.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  hall.dome?.setQuality(quality);
  buildComposer();
  onResize();
  effects.setCounts(settings.fireflies);
  effects.setBudget(efficient() ? 0.2 : 1);
  audience?.setBudget?.(efficient() ? 0.35 : 1);
  audience?.updateLOD?.(camera.position, true);
  const reserve = room ? DEFAULTS[CROWD] / 100 : null;
  const share = Math.max(0, Math.min(100, Number(settings[CROWD]) || 0)) / 100;
  ui.setCrowdCount(audience?.count || 0, reserve !== null && share > reserve ? Math.round(reserve * 100) : 0, audience?.drawn || 0);
  hall.setBeams?.(settings.lasers && !efficient());
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
// (asleep or in a background tab nothing is seen: no aiming either)
setInterval(() => { if ((director.locked || director.aiming) && concertStarted && !asleep && !document.hidden) hover(window.innerWidth / 2, window.innerHeight / 2); }, 160);
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
let pendingJoin = undefined; // the room's state, applied once we are inside
const guest = () => !!room && !room.isHost;

function hostOnly() {
  if (!guest()) return false;
  ui.toast('공연 진행은 방장만 할 수 있어요.', 1600);
  return true;
}

function snapshot() {
  // (a piece on its way: its number, at its start, not the time of the one before)
  const t = transportState({ chosen: program[current], loaded: perf.piece, phase, playing: perf.playing, time: perf.time });
  return {
    started: showStarted, i: current, title: program[current]?.titleKo || '', phase: t.phase, loading: t.loading,
    // (the host's sound taken away by its browser: its music stands still,
    // and the room waits there with it - not pulled back to it every few seconds)
    playing: t.playing && !sound.lost, pos: t.pos, at: room.now(), onstage: stage.onstage, cond: stage.conductorOn,
    on: [...stage.onstageKeys()],
    iu: intervalState?.until, inext: intervalState?.next,
    ev: encore ? { c: encore.cands, n: encoreCounts(), u: encore.until } : undefined,
  };
}
function publish() { if (room?.isHost && room.connected) room.state(snapshot()); }
function sendCmd(c) { if (!room?.isHost) return; room.cmd(c); publish(); }
const playMsg = () => ({ c: perf.playing ? 'play' : 'pause', i: current, pos: perf.time, at: room ? room.now() : 0 });

function fxFor(piece) {
  if (!fx) return;
  const lively = piece?.mood === 'lively' && settings.lasers && !efficient();
  // (a recital or a few players: the colour wash, but no laser show)
  fx.lasers.set(lively && GRAMMAR[ensembleOf(piece, rosterOf(piece))].lasers);
  fx.wash.set(lively);
}

// make piece i the current one (guests follow the host there). The host's
// state every few seconds asks for the same piece again while it is on its
// way: that is the one download, the latest ask applying it (pieces.js)
async function ensurePiece(i) {
  if (!program[i]) return false;
  const fresh = perf.piece?.id !== program[i].id;
  current = i;
  nextPiece = program[i];
  let piece;
  try {
    piece = await pieces.choose(program[i].id);
  } catch (e) {
    pieceFailed(i, e, null); // (the host's next state tries again)
    return false;
  }
  if (!piece || current !== i) return false;
  if (fresh) updateMediaSession(piece);
  return true;
}

// The host's playback ({ i, playing, pos, at }) ours, and the end of its
// piece too - from a play/pause command and from a snapshot alike (see
// follow.js). The stage first, as the host has it:
const follower = new Follower({
  perf, ensurePiece, now: () => room.now(),
  stage(piece, s) {
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
    if (kind === 'solo' && rosterOf(piece).has('piano:0')) { if (!recital.on) recital.open(true, piece); } else closeRecital();
    hall.setHouseLights(s.playing ? GRAMMAR[kind].house : 0.4);
  },
  started: (piece) => fxFor(piece),
  playing: (on) => ui.setPlaying(on),
});

// a snapshot from the host (on joining, then every few seconds). Joining,
// it comes true once we are in step with the show (see room.ready)
let hostState = null; // the host's latest snapshot
let rejoin = false; // the next snapshot is taken as on coming in (see 'stay')
async function followHost(s, { joining = false } = {}) {
  if (s) hostState = s;
  if (!s || !room || room.isHost || !concertStarted || !s.started) return true;
  if (rejoin) { rejoin = false; joining = true; }
  showOn();
  if (s.phase === 'encore' && s.ev && !joining) { guestEncore(s.ev); return true; }
  if (!joining) {
    // in step with the show: the host's playback, and the end of its piece -
    // its position run out, or the host past it already (the bows, the gap)
    if (s.phase === 'playing') return (await follower.playback(s)) === true;
    follower.between(s, { index: current, ceremony });
    return true;
  }
  let over = false;
  if (s.phase === 'playing') {
    const now = await follower.apply(s);
    // (in after the piece ended, with nobody running the show meanwhile - the
    // host's page reloading: it is between pieces, the conductor gone after the bows)
    if (now !== 'over') return now === true;
    over = true;
  }
  if (['changing', 'entering', 'tuning', 'announce', 'hush'].includes(s.phase)) {
    // the orchestra is walking on right now: in a little late, to the stage as
    // it is (the rest of the walk-on goes with the host's)
    return new Promise((set) => runConcert(s.i, { remote: true, late: { cond: !!s.cond, set: () => set(true) } }));
  }
  // between pieces: set the stage as it is and wait for the host
  seq++;
  ceremony = false;
  if (!(await ensurePiece(s.i))) return false;
  if (s.on) stage.snapRoster(new Set(s.on));
  else if (s.onstage) stage.snapOnstage();
  stage.snapConductor(!!s.cond && s.onstage && !over);
  if (s.phase === 'interval' && s.iu) { beginInterval(s.iu, s.inext ?? s.i); return true; }
  if (s.phase === 'encore' && s.ev) { guestEncore(s.ev, true); return true; }
  hall.setHouseLights(s.onstage ? 0.5 : 1);
  adrift = seq; // (nothing of ours waits to go on: see carryOn)
  setPhase('intermission');
  return true;
}

function onHostCmd(c) {
  if (!room || room.isHost || !concertStarted || !c) return;
  if (c.c === 'run') {
    showOn();
    if (phase === 'encore' && program[c.i]) ui.toast(`앙코르: 「${program[c.i].titleKo}」`, 3200); // (the lanterns' choice, for everyone)
    ritualNext = !!c.ritual;
    runConcert(c.i, { quick: !!c.quick, remote: true });
  } else if (c.c === 'play' || c.c === 'pause') {
    showOn();
    follower.playback({ i: c.i, playing: c.c === 'play', pos: c.pos, at: c.at });
  } else if (c.c === 'stay') {
    // the piece the host asked for did not come to the host: it stays where
    // it is, and so do we - the state that follows says where, and is taken
    // as on coming in (whatever we set up for that piece is let go)
    seq++;
    follower.cancel();
    ceremony = false;
    rejoin = true;
  } else if (c.c === 'encore') {
    seq++;
    ceremony = false;
    guestEncore({ c: c.cands, n: [0, 0, 0], u: c.until }, true);
  } else if (c.c === 'interval') {
    seq++;
    ceremony = false;
    beginInterval(c.until, c.i);
  } else if (c.c === 'away') {
    // the host's page went to the background (its walk-ons wait for it);
    // the music already playing is not affected, so only a waiting room is told
    if (c.on && !perf.playing) {
      awayTold = true;
      ui.toast('방장의 화면이 잠시 다른 곳에 가 있어요. 돌아오면 무대가 이어져요.', 4200);
      ui.chatLine({ sys: true, text: '방장의 화면이 가려져 무대가 기다리는 중이에요. 오래 비면 다른 사람이 방장을 맡아요.' });
    } else if (!c.on && awayTold) { awayTold = false; ui.toast('방장이 돌아왔어요.', 1600); }
  } else if (c.c === 'exit') {
    seq++;
    follower.cancel();
    closeRecital();
    ceremony = false;
    hall.setHouseLights(1);
    hall.show?.('house');
    if (stage.conductorOn) stage.conductorExit();
    stage.exitAll();
    setPhase('intermission');
  }
}

// a guest who becomes the host carries the show on from where it is
// (back: the host's own page, reloaded, has it again)
function takeOver(back = false) {
  ui.toast(back ? '다시 방장이에요. 공연을 이어서 진행해요.' : '이제 내가 방장이에요. 공연 진행을 맡아요.', 2600);
  ui.chatLine({ sys: true, text: back ? '다시 방장이에요.' : '이제 내가 방장이에요.' });
  carryOn();
  publish();
}

// coming into a show under way: follow it, and say so once we are in step
// (the host's own page, reloaded, gets the show back then: server/rooms.js)
function catchUp(s) {
  const c = room;
  followHost(s, { joining: true }).then((ok) => { if (ok && room === c && !c.isHost) c.ready(); }, (e) => console.error(e));
}

// the show is ours now (the host's role came to us, or the room was lost):
// whatever was under way goes on - the interval or the lantern vote to its
// end, or, between pieces with nothing of ours waiting (we came in during
// the bows), the next piece after the usual gap
let adrift = -1; // the seq in which we set the stage as the host had it, with nothing to follow
function carryOn() {
  if (intervalState) {
    ui.interval(true, true);
    const tok = ++seq;
    const next = intervalState.next;
    until(() => !intervalState || clockNow() >= intervalState.until, tok, 1e9).then((ok) => { if (ok) { ritualNext = true; runConcert(next); } });
  } else if (encore && !encore.votes) {
    encore.votes = new Map();
    if (encore.mine >= 0) encore.votes.set(room ? room.id : 0, encore.mine);
    // (a moment for the lanterns already up to reach us before they are counted)
    if (room) encore.until = Math.max(encore.until, clockNow() + 1.5);
    finishEncore(++seq);
  } else if (adrift === seq && showStarted && !ceremony && !perf.playing) {
    const tok = ++seq;
    const last = current === eveningLen - 1 || current === program.length - 1;
    wait(Math.max(2, settings.gap) * 1000, tok).then(async (ok) => {
      if (!ok) return;
      if (last && !encoreActive) {
        const win = await encoreVote(tok);
        if (win === null) return;
        if (win >= 0) { encoreActive = true; ritualNext = true; runConcert(win); return; }
      }
      encoreActive = false;
      runConcert(nextIndex());
    });
  }
}

// the host's page in the background: its show stops where it is drawn
// frame by frame (the walk-ons, the bows). The guests are told, and if it
// stays stuck for long the show passes to the longest-present guest
let awayTold = false;
let stuckFor = 0;
let awayCheck = 0;
// (a reload or a closed tab: its pagehide comes before the visibilitychange, and it is not "away")
let unloading = false;
addEventListener('pagehide', () => { unloading = true; });
addEventListener('pageshow', () => { unloading = false; }); // (back from the bfcache: alive again)
const AWAY_HANDOFF = 30; // seconds of a stuck show in a hidden host's page
document.addEventListener('visibilitychange', () => {
  clearInterval(awayCheck);
  stuckFor = 0;
  if (unloading || !room?.isHost || !concertStarted) return;
  room.cmd({ c: 'away', on: document.hidden });
  if (!document.hidden) return;
  awayCheck = setInterval(() => {
    if (!document.hidden || !room?.isHost) { clearInterval(awayCheck); return; }
    const stuck = showStarted && (ceremony || (!perf.playing && !['interval', 'encore'].includes(phase)));
    stuckFor = stuck ? stuckFor + 5 : 0;
    if (stuckFor < AWAY_HANDOFF || room.members.size < 2) return;
    clearInterval(awayCheck);
    const next = [...room.members.values()].filter((m) => m.id !== room.id).sort((a, b) => (a.since ?? 0) - (b.since ?? 0) || a.id - b.id)[0];
    if (!next) return;
    room.handoff(next.id);
    ui.chatLine({ sys: true, text: `화면을 오래 비운 사이 ${next.name}님에게 방장을 넘겼어요.` });
  }, 5000);
});

function membersChanged() {
  if (!room) return;
  ui.setMembers([...room.members.values()], room.host, room.id);
}

function refreshOccupied() {
  if (!director) return;
  const s = new Set(audience ? audience.occupied : []);
  for (const i of avatars.occupied()) s.add(i);
  if (thief?.taken) s.add(thief.taken.index);
  director.occupied = s;
}

// the invite: this building and the room (a friend whose last visit was the
// other building still comes here)
const roomAddress = (code) => `?venue=${VENUE}&room=${code}`;

function wireRoom(c) {
  let wasHost = false;
  c.on('joined', (m, first) => {
    avatars.clear();
    for (const mm of c.members.values()) if (mm.id !== c.id) avatars.add(mm);
    avatars.setHost(c.host);
    ui.setRoom({ title: c.room.title, code: c.room.code, cap: c.room.cap });
    ui.setOffline(false);
    ui.setHostControls(c.isHost);
    membersChanged();
    if (first) {
      seatAudience(); // the same house for everyone in the room
      // (a ticket carried in the address - storage blocked - stays there; never in the invite)
      try { const t = new URLSearchParams(location.search).get('t'); history.replaceState(null, '', roomAddress(c.room.code) + (t ? `&t=${encodeURIComponent(t)}` : '')); } catch { /* file: */ }
      ui.chatLine({ sys: true, text: c.isHost ? `방을 만들었어요. 방 코드는 ${c.room.code} — 오른쪽 위 방 이름을 눌러 초대 링크를 복사할 수 있어요.` : `「${c.room.title}」에 들어왔어요.` });
    }
    refreshOccupied();
    lastPoseKey = '';
    // back from a dropped line: the show may have come to us (the room was
    // empty) or gone on without us (someone else carries it now)
    const role = !first && c.isHost !== wasHost;
    wasHost = c.isHost;
    if (role && c.isHost) { takeOver(); return; }
    if (role) {
      ui.chatLine({ sys: true, text: '연결이 끊긴 사이 다른 사람이 방장이 됐어요. 그 무대를 따라가요.' });
      if (encore?.votes) { seq++; encore.votes = null; } // (the count is theirs now)
    }
    if (!first && !c.isHost && encore?.mine >= 0) c.vote(encore.mine); // (our lantern left with the line: up again)
    if (c.isHost) publish();
    else if (!concertStarted) pendingJoin = m.state;
    else catchUp(m.state);
  });
  // (a dropped line that comes straight back - the same id - is not news:
  // "left" is said only once they have stayed away a few seconds)
  const goneSay = new Map();
  c.on('member', (m, back) => {
    avatars.add(m);
    avatars.setHost(c.host);
    membersChanged();
    if (goneSay.has(m.id)) { clearTimeout(goneSay.get(m.id)); goneSay.delete(m.id); return; }
    // the host's own page back: not someone new. A dropped line is the host
    // again at once; a reloaded page is on the way back (the show is theirs
    // again once it has caught up)
    if (back) {
      const text = m.id === c.host ? '방장이 돌아왔어요.' : '방장이 다시 들어오는 중이에요.';
      ui.toast(text, 4000);
      ui.chatLine({ sys: true, text });
      return;
    }
    ui.chatLine({ sys: true, text: `${m.name}님이 들어왔어요.` });
  });
  c.on('left', (id, who, wait) => {
    if (id === c.host) awayTold = false; // (the host left: no "back again" for a hidden screen)
    avatars.remove(id);
    if (encore?.votes?.delete(id)) encoreShow(); // (a lantern leaves with its holder)
    membersChanged();
    refreshOccupied();
    // the host's line dropped (a reload, most often): the room waits for them -
    // said calmly, and no "left" for someone who is on the way back
    if (wait) { ui.toast('방장의 연결이 잠시 끊겼어요. 돌아오기를 기다려요.', 4000); ui.chatLine({ sys: true, text: '방장의 연결이 잠시 끊겼어요. 돌아오기를 기다려요.' }); return; }
    if (who) goneSay.set(id, setTimeout(() => { goneSay.delete(id); if (room === c) ui.chatLine({ sys: true, text: `${who.name}님이 나갔어요.` }); }, 6000));
  });
  c.on('host', (id, back) => {
    avatars.setHost(id);
    membersChanged();
    ui.setHostControls(c.isHost);
    const handed = wasHost && !c.isHost;
    wasHost = c.isHost;
    if (c.isHost) { takeOver(back); return; }
    if (back) { ui.toast('방장이 돌아왔어요.', 2000); ui.chatLine({ sys: true, text: '방장이 돌아왔어요.' }); }
    else ui.chatLine({ sys: true, text: `${c.members.get(id)?.name ?? '누군가'}님이 이제 방장이에요.` });
    if (encore) {
      // the lanterns are counted by the new host now: ours goes to them
      if (handed && encore.votes) { seq++; encore.counts = encoreCounts(); encore.votes = null; }
      if (encore.mine >= 0) c.vote(encore.mine);
    }
  });
  c.on('pose', (id, p) => {
    const before = avatars.list.get(id)?.seat;
    avatars.pose(id, p);
    if (avatars.list.get(id)?.seat !== before) refreshOccupied();
  });
  c.on('state', (s) => { if (!c.isHost) followHost(s); });
  c.on('cmd', onHostCmd);
  c.on('vote', (id, k) => {
    if (!c.isHost || !encore?.votes || !c.members.has(id)) return;
    if (k >= 0 && k < encore.cands.length) encore.votes.set(id, k); else encore.votes.delete(id);
    encoreShow();
    publish();
  });
  c.on('chat', (m) => {
    ui.chatLine({ name: m.name, text: m.text });
    if (m.id !== c.id) avatars.say(m.id, m.text);
  });
  c.on('error', (e) => { if (e?.msg) ui.toast(e.msg, 2000); }); // (the room's answer to something we sent)
  c.on('disconnected', () => { ui.setOffline(true); ui.toast('연결이 끊겼어요. 다시 잇는 중…', 3000); });
  c.on('reconnected', () => ui.toast('다시 연결됐어요.', 1800));
  c.on('lost', (error) => {
    const reason = error?.code === 'replaced' ? '다른 탭에서 이 방에 연결했어요.' : '방과 연결이 끊겼어요.';
    ui.chatLine({ sys: true, text: `${reason} 혼자 보기로 이어서 볼게요.` });
    goSolo();
  });
}

function goSolo() {
  // (what was under way was timed on the room's clock: from now on, this page's)
  const shift = room ? performance.now() / 1000 - room.now() : 0;
  room?.leave();
  room = null;
  avatars.clear();
  ui.setRoom(null);
  refreshOccupied();
  if (intervalState) { intervalState.until += shift; ui.setIntervalLeft(intervalState.until - clockNow()); }
  if (encore) encore.until += shift;
  carryOn(); // (the interval, the lanterns: ours to finish now)
  soloTicket();
}

// out to the square: the music fades for a moment instead of stopping dead
function outToSquare() {
  try { if (engine.master) engine.master.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.08); } catch { /* no sound yet */ }
  setTimeout(() => { location.href = location.pathname; }, 320);
}
ui.on('leaveRoom', () => {
  room?.leave();
  dropTicket();
  outToSquare();
});
ui.on('toPlaza', () => {
  room?.leave();
  leaf.save();
  dropTicket();
  outToSquare();
});
ui.on('copyInvite', async () => {
  if (!room?.room) return;
  const url = `${location.origin}${location.pathname}${roomAddress(room.room.code)}`;
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
// you: the animal drawn on your first visit (kept; see tickets.js)
const me = identity();
// (a code is six letters and digits: anything else is no invite at all)
const invite = ((c) => (/^[A-Z0-9]{6}$/.test(c) ? c : null))((new URLSearchParams(location.search).get('room') || '').trim().toUpperCase());
ui.initLobby({ avatars: AVATARS, identity: { ...me, emoji: EMOJI[me.avatar] }, invite, venue: VENUE, venues: VENUES });
// came from the square with a ticket for this building: the usher checks it
// (a room's address after a reload: your ticket for that very room still counts)
const held = heldTicket(VENUE);
const ticket = held && (!invite || held.code === invite) ? held : null;
if (ticket) ui.ticketMode(ticket, ticketElement(ticket));
else {
  // Hidden in the initial HTML: scene construction must not flash the old
  // name / venue controls before we know whether this visitor holds a ticket.
  document.getElementById('lobby').hidden = false;
  // Keep direct ?lobby=1 and invitation entry available without a ticket.
  if (!invite && new URLSearchParams(location.search).get('room')) ui.lobbyError('초대 링크의 방 코드가 올바르지 않아요. 아래에서 방 코드를 직접 적어 들어가 보세요.');
}
ui.on('venue', (id) => goVenue(id, { room: invite }));
ui.on('dropTicket', () => dropTicket()); // (back to the square from a room that is gone: buy afresh)
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
    // (playing, but the sound taken away: ▶ on the lock screen gives it back)
    navigator.mediaSession.setActionHandler('play', () => { if (!perf.playing) togglePlay(); else sound.check({ gesture: true }); });
    navigator.mediaSession.setActionHandler('pause', () => { if (perf.playing) togglePlay(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => { if (!hostOnly()) runConcert(current + 1, { quick: true }); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { if (!hostOnly()) runConcert(current - 1, { quick: true }); });
  } catch { /* unsupported handler */ }
}

// A phone takes the sound away from a page in the background and may not
// give it back: wanted (the music on, not paused, not asleep) is asked for
// again by one way when we are back, at the context's own change, a touch,
// the media keys - or a button, when the browser waits for a touch
const sound = new SoundRecovery({
  ctx: () => engine.ctx,
  wanted: (gesture) => wantsSound({ inside: concertStarted, asleep, playing: perf.playing, between: showStarted && phase !== 'playing' }, gesture),
  asleep: () => asleep,
  blocked: (on) => ui.offer('sound', on ? '다른 곳에 다녀온 사이 소리가 멈췄어요.' : null, '🔊 소리 다시 켜기'),
  recovered() {
    // (in step again: a guest on the host's clock; a host tells the room where it is)
    if (guest()) { if (hostState) followHost(hostState); } else publish();
  },
});
perf.wake = () => { sound.check(); };

async function requestWakeLock() {
  if (asleep || document.hidden || !concertStarted || wakeLockPending) return;
  try {
    if ('wakeLock' in navigator && (!wakeLock || wakeLock.released)) {
      wakeLockPending = true;
      const lock = await navigator.wakeLock.request('screen');
      // The request can settle after a sleep/visibility transition.
      if (asleep || document.hidden) await lock.release();
      else wakeLock = lock;
    }
  } catch { /* denied or unsupported */ }
  finally { wakeLockPending = false; }
}
document.addEventListener('visibilitychange', () => {
  // Background-tab time is not a slow rendered frame. Audio keeps its own clock.
  lastNow = performance.now();
  fpsAcc = 0;
  fpsFrames = 0;
  holdQuality(6000);
  screenActive = false;
  if (document.hidden) cancelFrame();
  else if (!asleep) {
    requestFrame();
    requestWakeLock();
    sound.check({ fresh: true }); // (the sound back, if the browser took it while we were away)
  }
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
  const notes = arrive ? [880, 1108.7] : [1108.7, 880];
  engine.chime(notes.map((f, i) => [f, i * 0.32]), 0.06, 1.1);
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
let screenActive = false;
let pendingFrame = null;
let graphicsUnavailable = false;
const frameStats = { sequence: 0, frameMs: 0, submitMs: 0, fps: 0, calls: 0, triangles: 0, quality, renderScale };

function requestFrame() {
  if (pendingFrame === null && !asleep && !document.hidden && !graphicsUnavailable) pendingFrame = requestAnimationFrame(frame);
}
function cancelFrame() {
  if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
  pendingFrame = null;
  framePacer.reset();
  worldPacer.reset();
}
function frame(rafMs) {
  pendingFrame = null;
  if (asleep || document.hidden || graphicsUnavailable) return; // wake/visibility resumes a single chain
  const nowMs = performance.now();
  if (efficient() && !framePacer.ready(rafMs)) { requestFrame(); return; }
  const elapsed = Math.max(0, (nowMs - lastNow) / 1000);
  const dt = Math.min(window.__fpMaxDt || 0.05, elapsed);
  lastNow = nowMs;
  renderer.info.reset();
  wallT += dt;
  const wall = wallT;
  const t = perf.time;

  let events = null;
  if (perf.piece) events = perf.updateVisual(t);
  const running = perf.playing;
  stage.update(dt); // root/standing pose before body-local instrument contacts
  orchestra.update(t, dt, perf, { running, particles: settings.notes && !IS_OUTDOOR && !efficient(), glow: settings.glow && !IS_OUTDOOR && !efficient(), events, bowing, practice: practice.on ? practice.frame(BEAR) : null });
  if (intervalState) intervalTick(dt);
  roomTick(dt);
  if (IS_SPHERE) sphereTick(dt, t);
  hall.update(dt, wall);
  effects.update(wall, dt);
  director.joy.x = ui.joy.x;
  director.joy.y = ui.joy.y;
  director.stick = ui.stickTouch; // (a pinch begun in the stick's corner, see director)
  animateAudience(wall, dt, performance.now() < clapUntil, { hush, sleep: sleepy ? 1 : 0, talk: phase === 'interval' ? 1 : 0 });
  spot.update(dt);
  const nod = recital.update(dt, t, perf.playing);
  if (nod && director.seat?.turner) PIANIST.char.body.rotation.x += 0.1 * nod; // a thank-you nod to the page turner
  if (recital.on && concertStarted) {
    const free = (s) => !director.occupied.has(s.index);
    const here = director.seat?.stage;
    ui.recital(here ? null : { stage: recital.seats.some((s) => !s.turner && free(s)), turner: !!recital.turner && free(recital.turner) });
  } else ui.recital(null);

  if (!concertStarted) {
    // slow establishing shot behind the splash
    introT += dt;
    const a = introT * 0.05;
    if (IS_SPHERE) director.pos.set(Math.sin(a) * 22, 14 + Math.sin(a * 0.7) * 4, 26 + Math.cos(a) * 12);
    else if (IS_OUTDOOR) director.pos.set(Math.sin(a) * 7, 5 + Math.sin(a * 0.7), 21 + Math.cos(a) * 5);
    else director.pos.set(Math.sin(a) * 9, 9 + Math.sin(a * 0.7) * 2, 14 + Math.cos(a) * 7);
    const la = director.lookAt(IS_SPHERE ? new THREE.Vector3(0, 12, -8) : new THREE.Vector3(0, 3.2, -5));
    director.yaw = la.yaw;
    director.pitch = la.pitch;
    director.anim = null;
    camera.position.copy(director.pos);
    camera.quaternion.setFromEuler(new THREE.Euler(director.pitch, director.yaw, 0, 'YXZ'));
  } else {
    director.update(dt, { time: t, perf, obstacles: headPositions, cameraInstruments, phase }); // (phase: the auto-director cuts to the bows)
  }

  if (engine.ctx) {
    const L = director.listener(settings.fixedEar ? bestSeat : null);
    engine.setListener(L.pos, L.fwd, L.up);
    engine.setRoom(concertStarted ? hallOpenness(L.pos.x, L.pos.y, L.pos.z) : 1);
    engine.setMurmur(!concertStarted || perf.playing ? 0 : (MURMUR[phase] ?? 0.5) * (1 - hush) * (sleepy ? 0.3 : 1), audience ? audience.count : 0);
    engine.analyser.getByteTimeDomainData(levelBuf);
    let sum = 0;
    for (let i = 0; i < levelBuf.length; i += 4) { const v = (levelBuf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / (levelBuf.length / 4));
    levelSmoothed += (rms - levelSmoothed) * 0.2;
    ui.level = perf.playing ? levelSmoothed : levelSmoothed * 0.5;
  }
  if (perf.piece) ui.setTime(Math.min(perf.duration, t), perf.duration);
  if (fx) fx.update(dt, wall, levelSmoothed);
  if (IS_HALL) interiorCull();
  audience?.updateLOD?.(camera.position);
  hall.updateLOD?.(camera.position);
  if (!efficient() || worldPacer.ready(rafMs)) hall.dome?.drawWorlds(); // after the camera moved: only what it sees
  // Both cameras must see this frame's musician instance matrices.
  orchestra.syncLite();
  renderer.shadowMap.needsUpdate = QUALITY[quality].shadows;
  // Keep IMAG current through its fade-out, then stop rendering the unseen feed.
  const wantsScreen = !IS_OUTDOOR && settings.screen && concertStarted && (IS_SPHERE ? hall.dome.liveActive : screenInView());
  if (!IS_OUTDOOR && settings.screen && concertStarted) {
    if (wantsScreen && !screenActive) screen.invalidate();
    // Keep the broadcast shot clock in step while its picture is hidden.
    // A zero cadence advances time without a scene render or camera update.
    // (a broadcast picture costs about as much as a frame of the hall: fewer
    // of them while the automatic quality is already easing the load)
    screen.update(dt, { perf, time: t, phase, nextPiece }, wantsScreen ? (efficient() ? 2 : QUALITY[quality].screenHz) * (renderScale < 0.95 ? 0.6 : 1) : 0);
  }
  screenActive = wantsScreen;

  if (composer) composer.render(dt);
  else renderer.render(scene, camera);

  frameStats.sequence++;
  frameStats.frameMs = elapsed * 1000;
  // Wall time includes synchronous driver stalls; this is not CPU/GPU time.
  frameStats.submitMs = performance.now() - nowMs;
  frameStats.calls = renderer.info.render.calls;
  frameStats.triangles = renderer.info.render.triangles;
  frameStats.quality = quality;
  frameStats.renderScale = renderScale;
  if ((settings.quality === 'auto' || efficient()) && concertStarted) {
    sampleQuality(elapsed * 1000);
  }
  // Animation dt is clamped for stability; FPS must use real wall-clock time.
  fpsAcc += elapsed;
  fpsFrames++;
  if (fpsAcc > 3) {
    const fps = fpsFrames / fpsAcc;
    frameStats.fps = fps;
    ui.setFps(fps, efficient() ? 'efficient' : quality);
    fpsAcc = 0;
    fpsFrames = 0;
  }
  requestFrame();
}

// A background tab gets no frames, but the evening goes on (the music keeps
// its own clock): the musicians keep walking on and off on a slow timer
// meanwhile, so the next piece is not kept waiting for a procession nobody
// can see - and coming back, the stage is where the evening is
let hiddenAt = 0;
setInterval(() => {
  if (!document.hidden || asleep || !concertStarted) { hiddenAt = 0; return; }
  const now = performance.now();
  if (hiddenAt) {
    // (in frame-sized steps: a step is made for a frame, not for a second)
    for (let left = Math.min(120, (now - hiddenAt) / 1000); left > 0; left -= 0.05) stage.update(Math.min(0.05, left));
  }
  hiddenAt = now;
}, 1000);

// Automatic quality. A moment of change (the house lights, people walking
// on, the doors opening for the interval, new things to draw for the first
// time) can stutter for a second or two: that is not judged (holdQuality).
// A steady poor frame rate steps down; a long steady good one between pieces
// steps back up - if a recovery fails, it stays down until a
// manual choice. Even resolution recovery waits: target reallocations can hitch.
function holdQuality(ms = 3500) {
  if (!Number.isFinite(ms) || ms < 0) return;
  const now = performance.now();
  qualityHold = Math.max(qualityHold, now + ms);
  adaptiveQuality.hold(ms, now);
  efficientQuality.hold(ms, now);
}
const walkingForQuality = (w) => w.state === 'queued' || w.state === 'walking';
function sampleQuality(frameMs) {
  if ((settings.quality !== 'auto' && !efficient()) || !concertStarted) return null;
  // A long procession must not outlast a fixed 3.5 s grace period. Include
  // interval departures and the conductor, even when the phase has settled.
  if (hush > 0 || walkingForQuality(stage.conductor) || stage.walkers.some(walkingForQuality)) {
    holdQuality();
    return null;
  }
  const betweenPieces = phase !== 'playing' && !sleepy;
  const change = (efficient() ? efficientQuality : adaptiveQuality).sample(frameMs, {
    allowPresetChange: betweenPieces,
    allowRecovery: betweenPieces,
    nowMs: performance.now(),
  });
  if (!change) return null;
  const presetChanged = quality !== change.quality;
  quality = change.quality;
  renderScale = change.scale;
  if (presetChanged) applyQuality();
  else {
    renderer.setPixelRatio(pixelRatio());
    onResize();
  }
  if (presetChanged) ui.toast(change.reason === 'recovery'
    ? '여유가 생겨 화질을 한 단계 복구했어요.'
    : '부드럽게 보이도록 화질을 조절했어요.', 2600);
  return change;
}
// Debug hook retained from the evening flow: one FPS value represents a
// three-second observation. Production feeds individual real frame intervals.
function autoQuality(fps) {
  if (!Number.isFinite(fps) || fps <= 0 || performance.now() < Math.max(qualityHold, adaptiveQuality.holdUntil)) return null;
  const frameMs = 1000 / fps;
  const frames = Math.ceil(3 * fps);
  if (!Number.isSafeInteger(frames) || frames > 10000) return null;
  let change = null;
  for (let n = 0; n < frames; n++) change = sampleQuality(frameMs) || change;
  return change;
}

// A feed hidden behind the visitor or the foyer wall needs no second scene
// render. screenActive/invalidate refreshes it immediately on re-entry, even
// at the low preset's 90-frame cadence. Never capture a foyer-culled house.
const _screenBox = !IS_HALL ? null : new THREE.Box3().setFromObject(screen.group);
function screenInView() {
  if (!IS_HALL || !interiorShown) return false;
  camera.updateMatrixWorld();
  _frustum.setFromProjectionMatrix(_pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  return _frustum.intersectsBox(_screenBox);
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
watchRenderContext(renderer.domElement, {
  lost() {
    graphicsUnavailable = true;
    cancelFrame();
    director.keys.clear();
    director.vel.set(0, 0, 0);
    director.releaseLock();
    // Dispose while the old context is lost. Disposing its GPU handles after
    // Three has restored the context would try to delete foreign objects.
    environmentTarget?.dispose();
    environmentTarget = null;
    scene.environment = null;
    if (composer) {
      composer.passes.forEach(pass => pass.dispose?.());
      composer.dispose();
      composer = null;
    }
  },
  restored() {
    buildEnvironment();
    buildComposer();
    hall.dome?.invalidate();
    screen.invalidate();
    screenActive = false;
    lastNow = performance.now();
    fpsAcc = 0;
    fpsFrames = 0;
    holdQuality(6000);
    graphicsUnavailable = false;
    requestFrame();
  },
});
requestFrame();

boot().catch((e) => {
  console.error(e);
  ui.setLoading(`불러오지 못했어요: ${e.message}. 서버가 켜져 있는지 확인하고 새로고침해 주세요.`, 0);
  showRenderStatus('공연 준비를 마치지 못했어요. 연결을 확인하고 다시 불러와 주세요.');
});

const bremen = installBremen({ engine, ui, onOpen() {
  director.keys.clear(); director.vel.set(0, 0, 0); director.releaseLock();
  const resume = !room && phase === 'playing' && perf.playing;
  const piece = perf.piece;
  if (resume) {
    const floor = perf.startPos;
    perf.pause();
    // Rapid reopen can occur before the resumed audio's output latency ends.
    if (perf.pos < floor) perf.seek(floor);
    ui.setPlaying(false);
  }
  // In a shared room the local miniature never changes the room transport.
  return () => {
    if (resume && !room && phase === 'playing' && perf.piece === piece) {
      perf.play(); ui.setPlaying(true);
    }
  };
} });

window.__fp = {
  bremen,
  scene, camera, renderer, engine, perf, director, orchestra, hall, stage, settings, avatars, ui, stats: frameStats, get room() { return room; }, get phase() { return phase; }, get audience() { return audience; }, startShow,
  triggerFinaleFx() { if (!fx) return; fx.fanfare(); fx.confettiCannons(); fx.fireworksShow(); clapUntil = performance.now() + 8000; },
  setLasers(on) { fx?.lasers.set(on); fx?.wash.set(on); },
  // (tests) the automatic quality, fed a frame rate by hand
  get leaf() { return leaf; }, endEvening, spot, thief, practice, get interval() { return intervalState; },
  recital, effects, get encore() { return encore; }, encoreVote, goToSleep, wake, get asleep() { return asleep; },
  // (tests) the interval right now, `sec` long, as the host would run it
  intervalNow(sec = 90) {
    if (perf.playing) perf.pause();
    const tok = ++seq;
    const next = nextIndex();
    const endsAt = clockNow() + sec;
    beginInterval(endsAt, next); // (first: the snapshot that goes with the command says so)
    sendCmd({ c: 'interval', i: next, until: endsAt });
    until(() => !intervalState || clockNow() >= intervalState.until, tok, 1e9).then((ok) => { if (ok) { ritualNext = true; runConcert(next); } });
  },
  get quality() { return quality; }, autoQuality, holdQuality,
  get qualityState() {
    return {
      mode: settings.quality, effectiveDpr: renderer.getPixelRatio(), targetFps: efficient() ? 30 : null,
      lowStreak: (efficient() ? efficientQuality : adaptiveQuality).slow, goodStreak: (efficient() ? efficientQuality : adaptiveQuality).fast,
      raiseBlocked: (efficient() ? efficientQuality : adaptiveQuality).raiseBlocked, renderScale,
      hold: Math.max(0, Math.max((efficient() ? efficientQuality : adaptiveQuality).holdUntil, qualityHold) - performance.now()),
    };
  },
};
