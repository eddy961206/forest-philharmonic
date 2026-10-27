// The renderer, the picture's quality and what is drawn each frame: the
// presets, the automatic quality, post-processing, resize, and the house
// culled from the foyer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { IS_SPHERE, IS_OUTDOOR, IS_HALL } from '../scene/venue.js';
import { setAnisotropy, setLite } from '../scene/materials.js';
import { HALL, LEVELS, HALL_DOORS, HALL_DOOR_W, HALL_DOOR_H } from '../scene/hallplan.js';
import { AdaptiveQuality, FramePacer } from '../quality.js';
import { disposeComposer } from '../render-resources.js';

// (the hall is paid for per pixel - a dozen lights on every one: beyond 1.5
// pixels per point a sharper picture is hard to see and costs half again)
export const QUALITY = {
  high: { pr: Math.min(window.devicePixelRatio || 1, 1.5), shadows: true, shadowSize: 2048, bloom: true, msaa: 4, screenHz: 30, post: true },
  medium: { pr: Math.min(window.devicePixelRatio || 1, 1.25) * 0.85, shadows: true, shadowSize: 1024, bloom: true, msaa: 2, screenHz: 20, post: true },
  // phones: no post-processing pass, no shadows, the big screen redrawn
  // only every ~1.5 s at a small size
  low: { pr: Math.min(window.devicePixelRatio || 1, 1.25), shadows: false, shadowSize: 512, bloom: false, msaa: 0, screenHz: 8, post: false },
};

// A computer's built-in graphics (most laptops, and desktops without a card
// in use): automatic quality starts one step down and climbs if it can
function detectWeakGPU() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return /Intel|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics|SwiftShader|llvmpipe/i.test(name) && !/Arc\(TM\) A|Arc A\d/i.test(name);
  } catch { return false; }
}

export function createGraphics({ settings, isMobile, container, S }) {
  const weakGPU = detectWeakGPU();
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

  // ------------------------------------------------------------- render
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
    disposeComposer(composer);
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

  // the world drawn with this renderer (set once it is built: see attach)
  let world = null;

  function applyQuality() {
    const { hall, effects, house } = world;
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
    S.audience?.setBudget?.(efficient() ? 0.35 : 1);
    S.audience?.updateLOD?.(camera.position, true);
    house.showCount();
    hall.setBeams?.(settings.lasers && !efficient());
  }

  // the quality setting changed by hand
  function chooseQuality(value) {
    quality = value === 'auto' ? (LITE ? 'low' : autoStart()) : value === 'efficient' ? 'low' : value;
    renderScale = 1;
    adaptiveQuality.reset(quality, renderScale, performance.now());
    efficientQuality.reset('low', 1, performance.now());
    framePacer.reset();
    worldPacer.reset();
    applyQuality();
  }

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
    const { stage, ui } = world;
    if ((settings.quality !== 'auto' && !efficient()) || !S.concertStarted) return null;
    // A long procession must not outlast a fixed 3.5 s grace period. Include
    // interval departures and the conductor, even when the phase has settled.
    if (S.hush > 0 || walkingForQuality(stage.conductor) || stage.walkers.some(walkingForQuality)) {
      holdQuality();
      return null;
    }
    const betweenPieces = S.phase !== 'playing' && !S.sleepy;
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

  const _frustum = new THREE.Frustum();
  const _pv = new THREE.Matrix4();
  const _box = new THREE.Box3();
  let _screenBox = null;
  // A feed hidden behind the visitor or the foyer wall needs no second scene
  // render. screenActive/invalidate refreshes it immediately on re-entry, even
  // at the low preset's 90-frame cadence. Never capture a foyer-culled house.
  function screenInView() {
    if (!IS_HALL || !interiorShown) return false;
    camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return _frustum.intersectsBox(_screenBox);
  }

  // The hall from the foyer: the house (thousands of seats and guests, drawn
  // without culling) can only be seen through the doors in the back wall. When
  // none of them is in view, it is not drawn at all.
  function interiorCull() {
    let show = true;
    if (S.concertStarted && camera.position.z > HALL.back + 0.05) {
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
    if (S.audience) S.audience.group.visible = show;
    if (world.hall.seatGroup) world.hall.seatGroup.visible = show;
  }

  // the graphics context lost: dispose while the old context is lost.
  // Disposing its GPU handles after Three has restored the context would try
  // to delete foreign objects.
  function contextLost() {
    environmentTarget?.dispose();
    environmentTarget = null;
    scene.environment = null;
    if (composer) {
      disposeComposer(composer);
      composer = null;
    }
  }
  function contextRestored() {
    buildEnvironment();
    buildComposer();
  }

  function render(dt) {
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
  }

  // (tests) the automatic quality's inner state
  function qualityState() {
    const aq = efficient() ? efficientQuality : adaptiveQuality;
    return {
      mode: settings.quality, effectiveDpr: renderer.getPixelRatio(), targetFps: efficient() ? 30 : null,
      lowStreak: aq.slow, goodStreak: aq.fast,
      raiseBlocked: aq.raiseBlocked, renderScale,
      hold: Math.max(0, Math.max(aq.holdUntil, qualityHold) - performance.now()),
    };
  }

  return {
    QUALITY, LITE, AUDIO_LITE, renderer, scene, camera, framePacer, worldPacer,
    get quality() { return quality; },
    get renderScale() { return renderScale; },
    get interiorShown() { return interiorShown; },
    efficient, pixelRatio,
    // the world to draw, once it is built: { hall, effects, stage, ui, house, screen }
    attach(w) {
      world = w;
      _screenBox = !IS_HALL ? null : new THREE.Box3().setFromObject(w.screen.group);
    },
    applyQuality, chooseQuality, onResize, holdQuality, sampleQuality, autoQuality,
    screenInView, interiorCull, contextLost, contextRestored, render, qualityState,
  };
}
