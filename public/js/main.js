// Forest Philharmonic - boot: the building, the orchestra and the sound, put
// together with the controllers in app/ that run the evening.
import * as THREE from 'three';

// the venue first: the Sphere takes over the walking plan before anything reads it
import { IS_SPHERE, IS_OUTDOOR, VENUE } from './scene/venue.js';
import { SPHERE_ACOUSTICS } from './scene/sphereplan.js';
import { buildSphere } from './scene/sphere.js';
import { OUTDOOR_ACOUSTICS } from './scene/outdoorplan.js';
import { buildOutdoor } from './scene/outdoor.js';
import { SETLISTS } from './programs.js';

import { AudioEngine } from './audio/engine.js';
import { Performance, fetchPiece } from './audio/performance.js';
import { ScoreLibrary } from './pieces.js';
import { buildHall } from './scene/hall.js';
import { buildOrchestra } from './scene/orchestra.js';
import { buildEffects } from './scene/effects.js';
import { buildScreen } from './scene/screen.js';
import { buildFX } from './scene/fx.js';
import { StageManager } from './scene/stage.js';
import { Director } from './scene/director.js';
import { UI } from './ui.js';
import { Spotlight } from './evening.js';
import { installBremen } from './bremen.js';
import { SeatThief } from './scene/lobby.js';
import { buildRecital } from './scene/recital.js';
import { Avatars } from './scene/avatars.js';
import { showRenderStatus } from './render-status.js';

import { createAppState, clockOf, untilFor } from './app/state.js';
import { loadSettings, crowdKey } from './app/settings.js';
import { QUALITY, createGraphics } from './app/graphics.js';
import { createHouse } from './app/house.js';
import { createConcert } from './app/concert.js';
import { createInterval } from './app/interval.js';
import { createEncore } from './app/encore.js';
import { createLeafProgramme } from './app/leaf-programme.js';
import { createSleep } from './app/sleep.js';
import { createViewer } from './app/viewer.js';
import { createPreferences } from './app/preferences.js';
import { createSync } from './app/sync.js';
import { createLobby } from './app/lobby.js';
import { createPower } from './app/power.js';
import { createSphereLifts } from './app/sphere-lifts.js';
import { createLoop } from './app/loop.js';

// ------------------------------------------------------------- settings
const storage = () => { try { return window.localStorage; } catch { return null; } };
const settings = loadSettings(storage(), Object.keys(QUALITY));
const CROWD = crowdKey({ sphere: IS_SPHERE, outdoor: IS_OUTDOOR });

const isTouch = navigator.maxTouchPoints > 1 && !window.matchMedia('(pointer: fine)').matches;
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (isTouch && window.innerWidth < 900);

// the running evening (see app/state.js) and the controllers that share it
const S = createAppState(VENUE);
const app = { S, settings, storage, CROWD, isTouch, fx: null };

// --------------------------------------------------------------- render
const graphics = createGraphics({ settings, isMobile, container: document.getElementById('stage'), S });
const { renderer, scene, camera, LITE, AUDIO_LITE } = graphics;
const { quality } = graphics;

// ------------------------------------------------------------------ world
const ui = new UI({ settings, onSetting: (key, value) => app.preferences.onSetting(key, value) });
ui.touch = isTouch;
ui.setLoading('공연장을 짓는 중', 0.03);

const hall = IS_SPHERE ? buildSphere({ quality, lite: LITE, renderer }) : IS_OUTDOOR ? buildOutdoor({ quality, lite: LITE }) : buildHall({ quality, lite: LITE });
scene.add(hall.group);
// Both the broadcast and visitor cameras select batches after their world
// matrices are current, before Three.js builds the render list.
scene.onBeforeRender = (_renderer, _scene, view) => hall.prepareRender?.(view);
const orchestra = buildOrchestra(scene, { brightFloor: !IS_SPHERE });
// Fixed geometry is consulted only when the camera plans a new shot.
const cameraInstruments = orchestra.players.filter(p => p.fixedInstrument).map(p => p.inst.group);
const stage = new StageManager(orchestra);
stage.setSkipTransitions(settings.skipStageTransitions);
const spot = new Spotlight(hall.lights, scene); // a recital: the key light gathers on the soloist
hall.dome?.setProjection(settings.domeProjection);
hall.setBeams?.(settings.lasers !== false && !graphics.efficient()); // (the Sphere's moving heads follow '조명 연출')
const thief = new SeatThief(stage, 'va:0'); // the interval: someone may take the seat you leave
// a recital: chairs on the stage and a page turner's seat (added to the seat list, put away)
const recital = buildRecital(scene, orchestra, hall.seats);
const PIANIST = orchestra.playerAt('piano', 0);
const avatars = new Avatars(scene, hall.seats); // the other people in the room

// (no fireflies indoors at the Sphere - only dust in the light)
const effects = buildEffects(scene, { fireflies: IS_SPHERE ? 0 : IS_OUTDOOR ? (LITE ? 12 : 30) : LITE ? 40 : 170, dust: IS_OUTDOOR ? (LITE ? 30 : 80) : LITE ? 140 : 520 });
effects.setBudget(graphics.efficient() ? 0.2 : 1);
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
  hall.dome.setViewers([{ cam: camera }, { faces: 1 | 2 | 4 | 32, when: () => settings.screen && S.concertStarted && hall.dome.liveActive }]);
}
const director = new Director(camera, renderer.domElement, hall);
director.uiTop = () => ui.bottomUiTop();
director.hoverLook = false; // look by dragging, or click to capture the mouse

Object.assign(app, { graphics, renderer, scene, camera, ui, hall, orchestra, cameraInstruments, stage, spot, thief, recital, PIANIST, avatars, effects, screen, director });
app.house = createHouse(app);
graphics.attach({ hall, effects, stage, ui, screen, house: app.house });
app.house.seatAudience();
graphics.applyQuality();

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
const scores = new ScoreLibrary(fetchPiece);
Object.assign(app, { bestSeat, headPositions, engine, perf, scores });

// ------------------------------------------------------------ the evening
app.concert = createConcert(app);
app.interval = createInterval(app);
app.encore = createEncore(app);
app.leafProgramme = createLeafProgramme(app);
app.sleep = createSleep(app);
app.viewer = createViewer(app);
app.preferences = createPreferences(app);
app.sync = createSync(app);
app.lobby = createLobby(app);
app.power = createPower(app);
app.sphereLifts = createSphereLifts(app);
app.loop = createLoop(app);

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
  engine.ctx.addEventListener?.('statechange', () => app.power.sound.changed());
  if (!IS_OUTDOOR) app.fx = buildFX(scene, engine);
  // each building plays its own half of the pieces (see programs.js)
  const all = await (await fetch('music/index.json')).json();
  const byId = new Map(all.map((p) => [p.id, p]));
  S.program = (SETLISTS[VENUE] || SETLISTS.hall).map((id) => byId.get(id)).filter(Boolean);
  if (!S.program.length) S.program = all;
  S.eveningLen = S.program.length;
  ui.setProgram(S.program);
  const applauseReady = engine.prepareApplause();
  await engine.loadSamples('samples', (done, total) => {
    ui.setLoading(`악기를 조율하는 중  ${done} / ${total}`, 0.08 + 0.85 * (done / total));
  }).then((r) => {
    if (r?.failed) setTimeout(() => ui.toast(`악기 소리 ${r.failed}개를 불러오지 못했어요. 비슷한 음으로 대신 연주해요.`, 4200), 4000);
  });
  ui.setLoading('객석을 채우는 중', 0.95);
  await new Promise((r) => setTimeout(r, 30));
  await applauseReady;
  S.current = 0;
  await app.concert.pieces.choose(S.program[0].id);
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

app.loop.requestFrame();

boot().catch((e) => {
  console.error(e);
  ui.setLoading(`불러오지 못했어요: ${e.message}. 서버가 켜져 있는지 확인하고 새로고침해 주세요.`, 0);
  showRenderStatus('공연 준비를 마치지 못했어요. 연결을 확인하고 다시 불러와 주세요.');
});

const bremen = installBremen({ engine, ui, onOpen() {
  director.keys.clear(); director.vel.set(0, 0, 0); director.releaseLock();
  const resume = !S.room && S.phase === 'playing' && perf.playing;
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
    if (resume && !S.room && S.phase === 'playing' && perf.piece === piece) {
      perf.play(); ui.setPlaying(true);
    }
  };
} });

const { practice } = app.interval;
window.__fp = {
  bremen,
  scene, camera, renderer, engine, perf, director, orchestra, hall, stage, settings, avatars, ui, stats: app.loop.stats, get room() { return S.room; }, get phase() { return S.phase; }, get audience() { return S.audience; }, startShow: app.concert.startShow,
  triggerFinaleFx() { const fx = app.fx; if (!fx) return; fx.fanfare(); fx.confettiCannons(); fx.fireworksShow(); S.clapUntil = performance.now() + 8000; },
  setLasers(on) { app.fx?.lasers.set(on); app.fx?.wash.set(on); },
  // (tests) the automatic quality, fed a frame rate by hand
  get leaf() { return S.leaf; }, endEvening: app.leafProgramme.endEvening, spot, thief, practice, get interval() { return S.interval; },
  recital, effects, get encore() { return S.encore; }, encoreVote: app.encore.encoreVote, goToSleep: app.sleep.goToSleep, wake: app.sleep.wake, get asleep() { return S.asleep; },
  // (tests) the interval right now, `sec` long, as the host would run it
  intervalNow(sec = 90) {
    if (perf.playing) perf.pause();
    const tok = ++S.seq;
    const next = app.concert.nextIndex();
    const endsAt = clockOf(S) + sec;
    app.interval.beginInterval(endsAt, next); // (first: the snapshot that goes with the command says so)
    app.sync.sendCmd({ c: 'interval', i: next, until: endsAt });
    untilFor(S, () => !S.interval || clockOf(S) >= S.interval.until, tok, 1e9).then((ok) => { if (ok) { S.ritualNext = true; app.concert.runConcert(next); } });
  },
  get quality() { return graphics.quality; }, autoQuality: graphics.autoQuality, holdQuality: graphics.holdQuality,
  get qualityState() { return graphics.qualityState(); },
};
