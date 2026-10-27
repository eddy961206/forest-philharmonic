// ------------------------------------------------------------ main loop
// One frame: the music's picture, the stage, the house, the visitor's eye
// and ear, the broadcast, then the render - and the frame rate it took.
import * as THREE from 'three';
import { IS_SPHERE, IS_OUTDOOR, IS_HALL } from '../scene/venue.js';
import { hallOpenness } from '../scene/hallplan.js';
import { animateAudience } from '../scene/audience.js';
import { watchRenderContext } from '../render-status.js';
import { BEAR } from './interval.js';

// how much the audience talks in each phase (0 while the music plays; the
// conductor's walk-on hushes it; it comes back between pieces and in the interval)
const MURMUR = { lobby: 1, changing: 0.75, entering: 0.6, tuning: 0.3, announce: 0.12, hush: 0, playing: 0, afterglow: 0, applause: 0.45, intermission: 0.9, interval: 1, encore: 0.35, leaving: 0.8 };

export function createLoop(app) {
  const {
    S, settings, ui, engine, perf, graphics, camera, orchestra, stage, hall, effects, spot, recital, screen,
    director, bestSeat, headPositions, cameraInstruments, PIANIST,
  } = app;
  const { renderer, QUALITY, framePacer, worldPacer, efficient } = graphics;
  const { practice } = app.interval;

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
  const frameStats = { sequence: 0, frameMs: 0, submitMs: 0, fps: 0, calls: 0, triangles: 0, quality: graphics.quality, renderScale: graphics.renderScale };

  function requestFrame() {
    if (pendingFrame === null && !S.asleep && !document.hidden && !graphicsUnavailable) pendingFrame = requestAnimationFrame(frame);
  }
  function cancelFrame() {
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
    framePacer.reset();
    worldPacer.reset();
  }
  // background time (or asleep, or a lost context) is not a slow frame
  function resetClock() {
    lastNow = performance.now();
    fpsAcc = 0;
    fpsFrames = 0;
  }
  // the broadcast picture is out of date: drawn afresh when next seen
  function invalidateScreen() { screenActive = false; }

  function frame(rafMs) {
    pendingFrame = null;
    if (S.asleep || document.hidden || graphicsUnavailable) return; // wake/visibility resumes a single chain
    const nowMs = performance.now();
    if (efficient() && !framePacer.ready(rafMs)) { requestFrame(); return; }
    const elapsed = Math.max(0, (nowMs - lastNow) / 1000);
    const dt = Math.min(window.__fpMaxDt || 0.05, elapsed);
    lastNow = nowMs;
    renderer.info.reset();
    wallT += dt;
    const wall = wallT;
    const t = perf.time;
    const fx = app.fx;

    let events = null;
    if (perf.piece) events = perf.updateVisual(t);
    const running = perf.playing;
    stage.update(dt); // root/standing pose before body-local instrument contacts
    orchestra.update(t, dt, perf, { running, particles: settings.notes, glow: settings.glow, effectBudget: efficient() ? .2 : 1, events, bowing: S.bowing, practice: practice.on ? practice.frame(BEAR) : null });
    if (S.interval) app.interval.intervalTick(dt);
    app.sync.roomTick(dt);
    if (IS_SPHERE) app.sphereLifts.sphereTick(dt, t, levelSmoothed);
    hall.update(dt, wall);
    effects.update(wall, dt);
    director.joy.x = ui.joy.x;
    director.joy.y = ui.joy.y;
    director.stick = ui.stickTouch; // (a pinch begun in the stick's corner, see director)
    animateAudience(wall, dt, performance.now() < S.clapUntil, { hush: S.hush, sleep: S.sleepy ? 1 : 0, talk: S.phase === 'interval' ? 1 : 0 });
    spot.update(dt);
    const nod = recital.update(dt, t, perf.playing);
    if (nod && director.seat?.turner) PIANIST.char.body.rotation.x += 0.1 * nod; // a thank-you nod to the page turner
    if (recital.on && S.concertStarted) {
      const free = (s) => !director.occupied.has(s.index);
      const here = director.seat?.stage;
      ui.recital(here ? null : { stage: recital.seats.some((s) => !s.turner && free(s)), turner: !!recital.turner && free(recital.turner) });
    } else ui.recital(null);

    if (!S.concertStarted) {
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
      director.update(dt, { time: t, perf, obstacles: headPositions, cameraInstruments, cameraPerformers: orchestra.players, phase: S.phase }); // (phase: the auto-director cuts to the bows)
    }

    if (engine.ctx) {
      const L = director.listener(settings.fixedEar ? bestSeat : null);
      engine.setListener(L.pos, L.fwd, L.up);
      engine.setRoom(S.concertStarted ? hallOpenness(L.pos.x, L.pos.y, L.pos.z) : 1);
      engine.setMurmur(!S.concertStarted || perf.playing ? 0 : (MURMUR[S.phase] ?? 0.5) * (1 - S.hush) * (S.sleepy ? 0.3 : 1), S.audience ? S.audience.count : 0);
      engine.analyser.getByteTimeDomainData(levelBuf);
      let sum = 0;
      for (let i = 0; i < levelBuf.length; i += 4) { const v = (levelBuf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / (levelBuf.length / 4));
      levelSmoothed += (rms - levelSmoothed) * 0.2;
      ui.level = perf.playing ? levelSmoothed : levelSmoothed * 0.5;
    }
    if (perf.piece) ui.setTime(Math.min(perf.duration, t), perf.duration);
    if (fx) fx.update(dt, wall, levelSmoothed);
    if (IS_HALL) graphics.interiorCull();
    S.audience?.updateLOD?.(camera.position);
    hall.updateLOD?.(camera.position);
    if (!efficient() || worldPacer.ready(rafMs)) hall.dome?.drawWorlds(); // after the camera moved: only what it sees
    // Both cameras must see this frame's musician instance matrices.
    orchestra.syncLite();
    const quality = graphics.quality;
    renderer.shadowMap.needsUpdate = QUALITY[quality].shadows;
    // Keep IMAG current through its fade-out, then stop rendering the unseen feed.
    const wantsScreen = !IS_OUTDOOR && settings.screen && S.concertStarted && (IS_SPHERE ? hall.dome.liveActive : graphics.screenInView());
    if (!IS_OUTDOOR && settings.screen && S.concertStarted) {
      if (wantsScreen && !screenActive) screen.invalidate();
      // Keep the broadcast shot clock in step while its picture is hidden.
      // A zero cadence advances time without a scene render or camera update.
      // (a broadcast picture costs about as much as a frame of the hall: fewer
      // of them while the automatic quality is already easing the load)
      screen.update(dt, { perf, time: t, phase: S.phase, nextPiece: S.nextPiece }, wantsScreen ? (efficient() ? 2 : QUALITY[quality].screenHz) * (graphics.renderScale < 0.95 ? 0.6 : 1) : 0);
    }
    screenActive = wantsScreen;

    graphics.render(dt);

    frameStats.sequence++;
    frameStats.frameMs = elapsed * 1000;
    // Wall time includes synchronous driver stalls; this is not CPU/GPU time.
    frameStats.submitMs = performance.now() - nowMs;
    frameStats.calls = renderer.info.render.calls;
    frameStats.triangles = renderer.info.render.triangles;
    frameStats.quality = graphics.quality;
    frameStats.renderScale = graphics.renderScale;
    if ((settings.quality === 'auto' || efficient()) && S.concertStarted) {
      graphics.sampleQuality(elapsed * 1000);
    }
    // Animation dt is clamped for stability; FPS must use real wall-clock time.
    fpsAcc += elapsed;
    fpsFrames++;
    if (fpsAcc > 3) {
      const fps = fpsFrames / fpsAcc;
      frameStats.fps = fps;
      ui.setFps(fps, efficient() ? 'efficient' : graphics.quality);
      fpsAcc = 0;
      fpsFrames = 0;
    }
    requestFrame();
  }

  watchRenderContext(renderer.domElement, {
    lost() {
      graphicsUnavailable = true;
      cancelFrame();
      director.keys.clear();
      director.vel.set(0, 0, 0);
      director.releaseLock();
      graphics.contextLost();
    },
    restored() {
      graphics.contextRestored();
      hall.dome?.invalidate();
      screen.invalidate();
      screenActive = false;
      resetClock();
      graphics.holdQuality(6000);
      graphicsUnavailable = false;
      requestFrame();
    },
  });

  return { stats: frameStats, requestFrame, cancelFrame, resetClock, invalidateScreen };
}
