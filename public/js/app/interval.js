// ------------------------------------------------------------- the interval
// Once an evening, at the programme's middle (by music, see intervalDue):
// the house lights come up, everyone leaves the stage, the doors stand open.
// The first cellist practises the coming half in the foyer (on stage at the
// Sphere, which has no foyer), the violist may take the seat you left, the
// notice board has the musicians' news. Bells call everyone back.
import * as THREE from 'three';
import { IS_SPHERE, IS_OUTDOOR, IS_HALL } from '../scene/venue.js';
import { HALL, LEVELS } from '../scene/hallplan.js';
import { StageManager } from '../scene/stage.js';
import { Practice, noticeLines, buildNoticeBoard } from '../scene/lobby.js';
import { ensembleOf, josa } from '../evening.js';
import { rosterOf } from './concert.js';
import { clockOf, isGuest, seeded } from './state.js';

export const BEAR = 'vc:0';

export function createInterval(app) {
  const { S, settings, ui, engine, perf, stage, hall, spot, thief } = app;
  const clockNow = () => clockOf(S);
  const guest = () => isGuest(S);
  const hostOnly = () => app.sync.hostOnly();
  const setPhase = (p, s) => app.concert.setPhase(p, s);
  const closeRecital = () => app.concert.closeRecital();
  const runConcert = (i, o) => app.concert.runConcert(i, o);
  const scoreFor = (i) => app.concert.scoreFor(i);
  const nextIndex = () => app.concert.nextIndex();
  const refreshOccupied = () => app.house.refreshOccupied();

  const practice = new Practice(engine);
  // the foyer: where the cellist sits (an ottoman, facing the middle), the notice board
  const FOYER_BEAR = IS_HALL ? { x: 4.4 - 0.78, y: LEVELS[0] - 0.05, z: 37.6, yaw: Math.PI / 2 } : null;
  const BOARD = IS_HALL ? { x: 10, y: LEVELS[0] + 1.65, z: HALL.back + HALL.wallT + 0.02 } : null;
  if (BOARD) buildNoticeBoard(hall.group, new THREE.Vector3(BOARD.x, BOARD.y, BOARD.z), 0);

  function intervalDue(i) {
    if (!settings.interval || settings.shuffle || settings.repeatOne || S.intervalDone) return false;
    if (i >= S.eveningLen - 1) return false;
    let total = 0;
    let upto = 0;
    for (let k = 0; k < S.eveningLen; k++) { total += S.program[k].duration; if (k <= i) upto += S.program[k].duration; }
    return upto >= total / 2;
  }

  function beginInterval(endsAt, next) {
    const { director } = app;
    endInterval();
    app.sync.follower.cancel(); // (a playback sync still on its way is out of date now)
    if (perf.playing) { perf.pause(); ui.setPlaying(false); }
    closeRecital();
    S.interval = { until: endsAt, next, bear: 'wait', bells: 0 };
    S.intervalDone = true;
    setPhase('interval');
    hall.setHouseLights(1);
    hall.show?.('house');
    spot.set(null);
    app.fx?.lasers.set(false);
    app.fx?.wash.set(false);
    if (stage.conductorOn) stage.conductorExit();
    // everyone leaves (at the Sphere the cellist stays on to practise)
    const off = stage.walkers.filter((w) => w.state !== 'off' && !w.leaving && (!IS_SPHERE || StageManager.key(w) !== BEAR));
    if (off.length) stage.sendOff(off);
    ui.interval(true, !guest());
    ui.setIntervalLeft(endsAt - clockNow());
    // the seat you leave behind (seven times in ten, someone wants it)
    const r = S.room ? seeded(S.room.seed ^ 0x5ea7)() : Math.random();
    if (!IS_OUTDOOR) thief.arm(director.mode === 'seat' ? director.seat : S.lastSeat, r < 0.7);
    ui.toast(`인터미션이에요. ${Math.max(1, Math.round((endsAt - clockNow()) / 60))}분 뒤에 2부가 시작돼요.${IS_HALL ? ' 로비로 나가 봐요.' : IS_OUTDOOR ? ' 공원 길을 잠깐 거닐어 봐요.' : ''}`, 3600);
  }

  function endInterval() {
    if (!S.interval) return;
    S.interval = null;
    practice.stop();
    const bear = stage.walkers.find((w) => StageManager.key(w) === BEAR);
    if (bear?.state === 'away') stage.giveBack(bear); // (at the Sphere he is already in his chair)
    thief.clear();
    refreshOccupied();
    ui.interval(false);
    ui.act(null);
    S.tea = false;
  }

  // the host (or alone): start the second half now
  function secondHalf() {
    if (!S.interval || hostOnly()) return;
    const next = S.interval.next;
    S.ritualNext = true;
    runConcert(next);
  }

  async function startPractice() {
    if (IS_OUTDOOR) return;
    // a phrase from the coming half (the next piece with a cello part)
    let score = null;
    for (let k = 0; k < 8 && !score && S.interval; k++) {
      const sc = await scoreFor((S.interval.next + k) % S.program.length);
      if (sc?.tracks.some((tr) => tr.section === 'vc')) score = sc;
    }
    if (!score || !S.interval) return;
    if (IS_HALL) engine.addSpot('lobby', { x: FOYER_BEAR.x, y: FOYER_BEAR.y + 0.9, z: FOYER_BEAR.z });
    practice.start(score, { section: IS_SPHERE ? 'vc' : 'lobby', seed: S.room ? S.room.seed : (Math.random() * 1e9) | 0 });
  }

  let thiefWas = null;
  function intervalTick(dt) {
    const I = S.interval;
    const bear = stage.walkers.find((w) => StageManager.key(w) === BEAR);
    if (I.bear === 'wait' && bear) {
      if (IS_HALL && bear.state === 'off') {
        stage.borrow(BEAR, FOYER_BEAR, FOYER_BEAR.yaw);
        I.bear = 'on';
        startPractice();
      } else if (IS_SPHERE && bear.state === 'off') {
        // (at the Sphere he practises in his own chair: walk on if he is not there)
        stage.callOn([bear]);
        I.bear = 'walking';
      } else if (IS_SPHERE && bear.state === 'seated') {
        I.bear = 'on';
        startPractice();
      }
    } else if (I.bear === 'walking' && bear?.state === 'seated') {
      I.bear = 'on';
      startPractice();
    }
    // the seat thief (away: out in the foyer, or anywhere far from the seat)
    const d = app.director;
    const inFoyer = IS_HALL && d.pos.z > HALL.back + 0.5;
    const nearThief = !IS_OUTDOOR && thief.update(dt, d.pos, d.mode === 'walk' && (inFoyer || IS_SPHERE));
    if (thief.taken !== thiefWas) { thiefWas = thief.taken; refreshOccupied(); }
    ui.act(nearThief ? `${thief.name}에게 도토리 쿠키 건네기` : nearBoard() ? '숲속 소식 읽기' : null);
  }
  function nearBoard() {
    const d = app.director;
    return !!BOARD && d.mode === 'walk' && Math.abs(d.feet - LEVELS[0]) < 0.6 && Math.hypot(d.pos.x - BOARD.x, d.pos.z - BOARD.z) < 2.6;
  }
  // (outside the interval the board can still be read)
  setInterval(() => {
    if (!S.concertStarted || S.interval || !BOARD || S.asleep) return;
    ui.act(nearBoard() ? '숲속 소식 읽기' : null);
  }, 300);

  // the countdown, and the bells that call everyone back
  setInterval(() => {
    const I = S.interval;
    if (!I) return;
    const left = I.until - clockNow();
    ui.setIntervalLeft(left);
    if (left < 60 && I.bells < 1) { I.bells = 1; bells(2); ui.toast('곧 2부가 시작돼요. 자리로 돌아와 주세요.', 3200); }
    if (left < 15 && I.bells < 2) { I.bells = 2; bells(3); }
  }, 500);

  // the foyer bell: a soft three-note chime, rung `times` times
  function bells(times) {
    const ctx = engine.ctx;
    if (!ctx || S.muted) return;
    // (through the engine's master: volume, mute and the limiter apply)
    const notes = [];
    for (let k = 0; k < times; k++) [1046.5, 880, 698.5].forEach((f, i) => notes.push([f, 0.02 + k * 1.6 + i * 0.36]));
    engine.chime(notes, 0.05, 1.4);
  }

  async function showNews() {
    // the coming pieces (the next half first), with who plays them
    const coming = [];
    const from = S.interval ? S.interval.next : nextIndex();
    for (let k = 0; k < 6; k++) {
      const i = (from + k) % S.program.length;
      if (k > 0 && i === 0) break;
      const sc = await scoreFor(i);
      if (!sc) continue;
      const roster = rosterOf(sc);
      coming.push({ meta: S.program[i], roster, kind: ensembleOf(sc, roster) });
    }
    ui.showNews(noticeLines({ coming, practiser: S.interval && practice.on ? BEAR : null, week: Math.floor((Date.now() / 86400000 + 3) / 7) }));
  }

  ui.on('tea', () => {
    if (S.tea) return;
    S.tea = true;
    ui.tea();
    ui.toast('따뜻한 도토리차를 받았어요. 고소한 냄새가 나요.', 2600);
  });
  ui.on('news', showNews);
  ui.on('secondHalf', secondHalf);
  ui.on('act', () => {
    const s = thief.taken;
    const { director } = app;
    if (s && Math.hypot(director.pos.x - s.x, director.pos.z - s.z) < 1.8) {
      thief.shoo();
      ui.act(null);
      ui.toast(`${josa(thief.name, '이', '가')} 쿠키를 받아 들고 무대 뒤로 쪼르르 돌아갔어요. 자리가 다시 비었어요.`, 3200);
      return;
    }
    showNews();
  });

  return { practice, intervalDue, beginInterval, endInterval, secondHalf, intervalTick };
}
