// -------------------------------------------------------- the Sphere
// The dome hears the music (level) and knows the time; the live picture
// (IMAG) is up while the orchestra walks on, bows and between pieces, and
// for the title at the start of each piece - then the dome is all show.
// The lifts behind the vomitories take you between the levels.
import { IS_SPHERE } from '../scene/venue.js';
import { SP } from '../scene/sphereplan.js';

export function createSphereLifts(app) {
  const { S, settings, ui, engine, perf, hall, director } = app;

  let liftShown = 0;
  function sphereTick(dt, t, level) {
    hall.feed({ time: t, level: perf.playing ? level : 0, playing: perf.playing });
    const live = settings.screen && S.concertStarted && S.showStarted && (S.phase !== 'playing' || !perf.playing || t < 11);
    hall.dome.showLive(live);
    if (!S.concertStarted) return;
    const d = director;
    hall.lifts.near(d.pos.x, d.pos.z, d.feet);
    const car = d.mode === 'walk' ? hall.lifts.carAt(d.pos.x, d.pos.z, d.feet) : null;
    const lvl = car ? car.V.tier.n : 0;
    if (lvl !== liftShown) { liftShown = lvl; ui.liftPanel(lvl || null); }
  }
  function rideLift(n) {
    if (!IS_SPHERE || !S.concertStarted) return;
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
    if (!ctx || S.muted) return;
    const notes = arrive ? [880, 1108.7] : [1108.7, 880];
    engine.chime(notes.map((f, i) => [f, i * 0.32]), 0.06, 1.1);
  }
  ui.on('lift', rideLift);
  window.addEventListener('keydown', (e) => {
    if (!IS_SPHERE || e.repeat || e.target?.closest?.('input, textarea, select')) return;
    const m = /^Digit([1-4])$/.exec(e.code) || /^Numpad([1-4])$/.exec(e.code);
    if (m && liftShown) { e.preventDefault(); rideLift(Number(m[1])); }
  });

  return { sphereTick };
}
