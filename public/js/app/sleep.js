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

  ui.on('sleep', (minutes) => {
    S.sleepGen++;
    S.sleepAt = minutes ? performance.now() + minutes * 60000 : 0;
    S.sleepFading = false;
    if (!minutes && S.sleepy) { S.sleepy = false; effects.dim(1); }
    engine.setVolume(S.muted ? 0 : settings.volume);
    ui.setSleepLeft(0);
    ui.toast(minutes ? `${minutes}분 뒤에 천천히 소리를 줄이고 멈출게요.` : '끄기 예약을 취소했어요.', 2400);
  });
  setInterval(() => {
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
      S.muted = true;
      engine.setVolume(0);
      ui.setMuted(true);
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
      S.muted = true;
      engine.setVolume(0);
      ui.setMuted(true);
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
      setTimeout(() => engine.setVolume(S.muted ? 0 : settings.volume), 800);
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

  // Asleep: nothing is drawn and the sound is suspended (and the screen lock
  // let go, so a phone can rest too). A touch or a key wakes it all.
  function goToSleep(gen = S.sleepGen) {
    if (S.asleep || S.sleepAt || gen !== S.sleepGen) return;
    S.asleep = true;
    app.loop.cancelFrame();
    app.graphics.holdQuality(6000);
    app.loop.invalidateScreen();
    ui.sleep(true);
    try { engine.ctx.suspend(); } catch { /* fine */ }
    app.power.releaseWakeLock();
  }
  function wake() {
    if (!S.asleep) return;
    S.asleep = false;
    S.sleepy = false;
    ui.sleep(false);
    try { engine.ctx.resume(); } catch { /* fine */ }
    effects.dim(1);
    hall.setHouseLights(0.6);
    app.power.requestWakeLock();
    app.graphics.holdQuality(6000);
    app.loop.resetClock();
    app.loop.invalidateScreen();
    app.loop.requestFrame();
  }
  // (a touch or a key is also what a browser waits for to give the sound back)
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { if (S.asleep) wake(); else app.power.sound.check({ gesture: true }); }, true);

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
