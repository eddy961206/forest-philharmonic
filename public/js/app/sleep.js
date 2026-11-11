// The sleep timer: the house nods off in the last minute, the sound fades,
// and then everything rests - nothing drawn, the sound suspended - until a
// touch or a key wakes it all.
import { isGuest } from './state.js';

export function createSleep(app) {
  const { S, settings, ui, engine, perf, stage, hall, effects } = app;
  const guest = () => isGuest(S);
  const setPhase = (p, s) => app.concert.setPhase(p, s);
  const closeRecital = () => app.concert.closeRecital();
  const endInterval = () => app.interval.endInterval();
  const encoreUi = (state) => app.encore.encoreUi(state);

  let mutedBySleep = false;
  let prevFocus = null;
  let inertSaved = null;
  let swallowClickUntil = 0;

  function muteForSleep() {
    if (!S.muted) {
      mutedBySleep = true;
      S.muted = true;
      ui.setMuted(true);
    }
    engine.setVolume(0);
  }

  function restoreSleepVolume() {
    if (mutedBySleep) {
      mutedBySleep = false;
      S.muted = false;
      ui.setMuted(false);
    }
    try { engine.master?.gain?.cancelScheduledValues?.(engine.ctx.currentTime); } catch { /* fine */ }
    engine.setVolume(S.muted ? 0 : settings.volume);
  }

  function setSleepModal(on) {
    const veil = typeof document !== 'undefined' ? document.getElementById?.('sleepVeil') : null;
    if (on) {
      prevFocus = typeof document !== 'undefined' ? document.activeElement : null;
      inertSaved = new Map();
      const children = typeof document !== 'undefined' ? (document.body?.children || []) : [];
      for (const el of children) {
        if (el === veil || el.tagName === 'SCRIPT') continue;
        inertSaved.set(el, !!el.inert);
        el.inert = true;
      }
      ui.sleep(true);
      if (veil) {
        veil.setAttribute('role', 'dialog');
        veil.setAttribute('aria-modal', 'true');
        if (!veil.getAttribute('aria-label')) veil.setAttribute('aria-label', '편안한 밤 되세요');
        veil.tabIndex = -1;
        veil.focus?.({ preventScroll: true });
      }
    } else {
      if (inertSaved) {
        for (const [el, was] of inertSaved) el.inert = was;
        inertSaved = null;
      }
      ui.sleep(false);
      const back = prevFocus;
      prevFocus = null;
      if (back && back !== veil && back.isConnected !== false) {
        try { back.focus?.({ preventScroll: true }); } catch { /* fine */ }
      }
    }
  }

  ui.on('sleep', (minutes) => {
    S.sleepGen++;
    S.sleepAt = minutes ? performance.now() + minutes * 60000 : 0;
    S.sleepFading = false;
    if (!minutes && S.sleepy) { S.sleepy = false; effects.dim(1); }
    restoreSleepVolume();
    ui.setSleepLeft(0);
    ui.toast(minutes ? `${minutes}분 뒤에 천천히 소리를 줄이고 멈출게요.` : '끄기 예약을 취소했어요.', 2400);
  });
  const timer = setInterval(() => {
    if (!S.sleepAt) return;
    const left = S.sleepAt - performance.now();
    ui.setSleepLeft(Math.max(0, left));
    if (left <= 75000 && !S.sleepy) {
      // the last minute: the lights go down, the house nods off
      S.sleepy = true;
      // (a soloist's spotlight stays: letting it go would bring the fills back up)
      hall.setHouseLights(0.04);
      effects.dim(0.3);
    }
    if (left <= 30000 && !S.sleepFading && perf.playing) {
      S.sleepFading = true;
      engine.master.gain.setTargetAtTime(0, engine.now, 8);
    }
    if (left <= 0 && guest()) {
      // the show is the host's: a guest's timer just turns the sound off
      S.sleepAt = 0;
      S.sleepFading = false;
      muteForSleep();
      ui.setSleepLeft(0);
      ui.toast('편안한 밤 되세요. 소리를 껐어요.', 4000);
      const gen = S.sleepGen;
      setTimeout(() => goToSleep(gen), 4000);
      return;
    }
    const room = S.room;
    if (left <= 0 && room?.isHost && room.members.size > 1) {
      // 5. the host falls asleep: the show goes on for the others - the
      // longest-present guest takes it over, and only this screen sleeps
      const next = [...room.members.values()].filter((m) => m.id !== room.id).sort((a, b) => (a.since ?? 0) - (b.since ?? 0) || a.id - b.id)[0];
      if (next) {
        room.handoff(next.id);
        ui.chatLine({ sys: true, text: `잠들기 전에 ${next.name}님에게 방장을 넘겼어요.` });
      }
      S.sleepAt = 0;
      S.sleepFading = false;
      muteForSleep();
      ui.setSleepLeft(0);
      ui.toast('편안한 밤 되세요. 방장을 넘기고 소리를 껐어요.', 4000);
      const gen = S.sleepGen;
      setTimeout(() => goToSleep(gen), 4000);
      return;
    }
    if (left <= 0) {
      S.sleepAt = 0;
      S.sleepFading = false;
      S.seq++;
      if (perf.playing) perf.pause();
      ui.setPlaying(false);
      hall.setHouseLights(0.04);
      engine.setVolume(0);
      ui.setSleepLeft(0);
      ui.toast('편안한 밤 되세요. 공연을 멈췄어요.', 4000);
      // the musicians tiptoe off; then everything rests. (Not 'playing' any
      // more: ▶ after waking calls them back on for the piece from its start -
      // between pieces, for the next one.)
      const between = ['applause', 'afterglow', 'intermission', 'interval', 'encore'].includes(S.phase);
      endInterval();
      setPhase(between ? 'intermission' : 'changing');
      closeRecital();
      encoreUi(null);
      if (stage.conductorOn) stage.conductorExit();
      stage.exitAll();
      const gen = S.sleepGen;
      setTimeout(() => goToSleep(gen), 9000);
    }
  }, 1000);
  timer.unref?.();

  // Asleep: nothing is drawn and the sound is suspended (and the screen lock
  // let go, so a phone can rest too). A touch or a key wakes it all.
  function goToSleep(gen = S.sleepGen) {
    if (S.asleep || S.sleepAt || gen !== S.sleepGen) return;
    S.asleep = true;
    app.loop.cancelFrame();
    app.graphics.holdQuality(6000);
    app.loop.invalidateScreen();
    setSleepModal(true);
    try { engine.ctx.suspend(); } catch { /* fine */ }
    app.power.releaseWakeLock();
  }
  function wake() {
    if (!S.asleep) return;
    S.asleep = false;
    S.sleepy = false;
    setSleepModal(false);
    try { engine.ctx.resume(); } catch { /* fine */ }
    restoreSleepVolume();
    app.power.sound?.check?.({ gesture: true });
    effects.dim(1);
    hall.setHouseLights(0.6);
    app.power.requestWakeLock();
    app.graphics.holdQuality(6000);
    app.loop.resetClock();
    app.loop.invalidateScreen();
    app.loop.requestFrame();
  }
  // (a touch or a key is also what a browser waits for to give the sound back)
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pointerdown', (e) => {
      if (S.asleep) {
        swallowClickUntil = performance.now() + 500;
        e.preventDefault?.();
        e.stopPropagation?.();
        e.stopImmediatePropagation?.();
        wake();
        return;
      }
      app.power.sound.check({ gesture: true });
    }, true);
    window.addEventListener('keydown', (e) => {
      if (S.asleep) {
        e.preventDefault?.();
        e.stopPropagation?.();
        e.stopImmediatePropagation?.();
        wake();
        return;
      }
      app.power.sound.check({ gesture: true });
    }, true);
    for (const ev of ['pointerup', 'click', 'dblclick']) {
      window.addEventListener(ev, (e) => {
        if (!S.asleep && performance.now() >= swallowClickUntil) return;
        if (ev === 'click') swallowClickUntil = 0;
        e.preventDefault?.();
        e.stopPropagation?.();
        e.stopImmediatePropagation?.();
      }, true);
    }
  }

  // the quiet piece to fall asleep to (alone, in the sleep timer's last minutes)
  function lullaby(next) {
    const left = (S.sleepAt - performance.now()) / 1000;
    const quiet = (m) => m && m.ensembleKo === '피아노' && m.mood === 'calm';
    if (quiet(S.program[next])) return next;
    const calm = S.program.map((m, i) => ({ m, i })).filter(({ m }) => quiet(m) && !S.playedTonight.has(m.id));
    if (!calm.length) return next;
    const fits = calm.filter(({ m }) => m.duration <= left + 20);
    const pool = fits.length ? fits : calm;
    return pool[Math.floor(Math.random() * pool.length)].i;
  }

  return { goToSleep, wake, lullaby };
}
