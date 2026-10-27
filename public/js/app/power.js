// -------------------------------------------------------- media & power
// The lock screen's media keys, the sound a phone may take away, the screen
// kept awake, and a page in the background.
import { SoundRecovery, wantsSound } from '../audio/resume.js';
import { isGuest } from './state.js';

export function createPower(app) {
  const { S, ui, engine, perf, stage } = app;
  const togglePlay = () => app.concert.togglePlay();
  const runConcert = (i, o) => app.concert.runConcert(i, o);
  const hostOnly = () => app.sync.hostOnly();

  function updateMediaSession(piece) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: piece.titleKo, artist: `${piece.composerKo} · 숲속 필하모닉`, album: piece.ensembleKo });
      // (playing, but the sound taken away: ▶ on the lock screen gives it back)
      navigator.mediaSession.setActionHandler('play', () => { if (!perf.playing) togglePlay(); else sound.check({ gesture: true }); });
      navigator.mediaSession.setActionHandler('pause', () => { if (perf.playing) togglePlay(); });
      navigator.mediaSession.setActionHandler('nexttrack', () => { if (!hostOnly()) runConcert(S.current + 1, { quick: true }); });
      navigator.mediaSession.setActionHandler('previoustrack', () => { if (!hostOnly()) runConcert(S.current - 1, { quick: true }); });
    } catch { /* unsupported handler */ }
  }

  // A phone takes the sound away from a page in the background and may not
  // give it back: wanted (the music on, not paused, not asleep) is asked for
  // again by one way when we are back, at the context's own change, a touch,
  // the media keys - or a button, when the browser waits for a touch
  const sound = new SoundRecovery({
    ctx: () => engine.ctx,
    wanted: (gesture) => wantsSound({ inside: S.concertStarted, asleep: S.asleep, playing: perf.playing, between: S.showStarted && S.phase !== 'playing' }, gesture),
    asleep: () => S.asleep,
    blocked: (on) => ui.offer('sound', on ? '다른 곳에 다녀온 사이 소리가 멈췄어요.' : null, '🔊 소리 다시 켜기'),
    recovered() {
      // (in step again: a guest on the host's clock; a host tells the room where it is)
      if (isGuest(S)) { if (S.hostState) app.sync.followHost(S.hostState); } else app.sync.publish();
    },
  });
  perf.wake = () => { sound.check(); };

  let wakeLock = null;
  let wakeLockPending = false;
  async function requestWakeLock() {
    if (S.asleep || document.hidden || !S.concertStarted || wakeLockPending) return;
    try {
      if ('wakeLock' in navigator && (!wakeLock || wakeLock.released)) {
        wakeLockPending = true;
        const lock = await navigator.wakeLock.request('screen');
        // The request can settle after a sleep/visibility transition.
        if (S.asleep || document.hidden) await lock.release();
        else wakeLock = lock;
      }
    } catch { /* denied or unsupported */ }
    finally { wakeLockPending = false; }
  }
  function releaseWakeLock() {
    try { wakeLock?.release(); } catch { /* fine */ }
    wakeLock = null;
  }
  document.addEventListener('visibilitychange', () => {
    // Background-tab time is not a slow rendered frame. Audio keeps its own clock.
    app.loop.resetClock();
    app.graphics.holdQuality(6000);
    app.loop.invalidateScreen();
    if (document.hidden) app.loop.cancelFrame();
    else if (!S.asleep) {
      app.loop.requestFrame();
      requestWakeLock();
      sound.check({ fresh: true }); // (the sound back, if the browser took it while we were away)
    }
  });

  // A background tab gets no frames, but the evening goes on (the music keeps
  // its own clock): the musicians keep walking on and off on a slow timer
  // meanwhile, so the next piece is not kept waiting for a procession nobody
  // can see - and coming back, the stage is where the evening is
  let hiddenAt = 0;
  setInterval(() => {
    if (!document.hidden || S.asleep || !S.concertStarted) { hiddenAt = 0; return; }
    const now = performance.now();
    if (hiddenAt) {
      // (in frame-sized steps: a step is made for a frame, not for a second)
      for (let left = Math.min(120, (now - hiddenAt) / 1000); left > 0; left -= 0.05) stage.update(Math.min(0.05, left));
    }
    hiddenAt = now;
  }, 1000);

  return { sound, updateMediaSession, requestWakeLock, releaseWakeLock };
}
