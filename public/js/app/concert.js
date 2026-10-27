// The running of the concert: which piece, who is on stage for it, the
// walk-ons, the tuning-up, the music, the bows - and the transport buttons.
import { IS_SPHERE, IS_HALL } from '../scene/venue.js';
import { visualsFor } from '../scene/domeshow.js';
import { hallOpenness } from '../scene/hallplan.js';
import { StageManager } from '../scene/stage.js';
import { ENTRANCE } from '../scene/director.js';
import { PieceChooser } from '../pieces.js';
import { SECTIONS } from '../layout.js';
import { ensembleOf, GRAMMAR, rosterCentre } from '../evening.js';
import { clockOf, isGuest, waitFor, untilFor } from './state.js';

const STRINGS = /^(vn1|vn2|va|vc|cb):/;

// Who plays each piece, from its tracks ('section:chair'; a track may name
// its chairs).
export function rosterOf(piece) {
  const set = new Set();
  for (const tr of piece?.tracks || []) {
    const chairs = tr.chairs || SECTIONS[tr.section]?.chairs.map((_, k) => k) || [];
    for (const ci of chairs) set.add(`${tr.section}:${ci}`);
  }
  return set;
}

export function createConcert(app) {
  const { S, settings, ui, engine, perf, scores, stage, hall, spot, recital, bestSeat } = app;
  const wait = (ms, tok) => waitFor(S, ms, tok);
  const until = (cond, tok, timeout) => untilFor(S, cond, tok, timeout);
  const clockNow = () => clockOf(S);
  const guest = () => isGuest(S);
  // (the other controllers, called once everything is built)
  const hostOnly = () => app.sync.hostOnly();
  const sendCmd = (c) => app.sync.sendCmd(c);
  const playMsg = () => app.sync.playMsg();
  const publish = () => app.sync.publish();
  const followHost = (s, o) => app.sync.followHost(s, o);
  const syncStageTransitions = () => app.sync.syncStageTransitions();
  const endInterval = () => app.interval.endInterval();
  const beginInterval = (endsAt, next) => app.interval.beginInterval(endsAt, next);
  const intervalDue = (i) => app.interval.intervalDue(i);
  const secondHalf = () => app.interval.secondHalf();
  const encoreUi = (state) => app.encore.encoreUi(state);
  const encoreVote = (tok) => app.encore.encoreVote(tok);
  const endEvening = () => app.leafProgramme.endEvening();
  const lullaby = (next) => app.sleep.lullaby(next);
  const updateMediaSession = (piece) => app.power.updateMediaSession(piece);

  // the piece to play: a choice made while another is on its way wins, and
  // only what is loaded is what the page shows (see pieces.js)
  const pieces = new PieceChooser({
    fetch: (id) => scores.get(id),
    prepare: (score) => perf.prepare(score),
    apply(prep) {
      const piece = perf.use(prep);
      if (S.program[S.current]?.id !== piece.id) S.current = Math.max(0, S.program.findIndex((p) => p.id === piece.id));
      S.nextPiece = S.program[S.current];
      ui.setCurrent(S.current, piece);
      ui.setTime(0, piece.duration);
      ui.offer('retry', null); // (a piece has come: whatever failed before is out of date)
      return piece;
    },
    loaded: () => perf.piece,
  });
  // the piece chosen is still on its way: what is loaded is the one before it
  const loadingPiece = () => !!S.program[S.current] && perf.piece?.id !== S.program[S.current].id;

  function setPhase(p, seconds = 0) {
    if (p !== S.phase) app.graphics.holdQuality();
    S.phase = p;
    S.phaseUntil = performance.now() + seconds * 1000;
    // the Sphere's dome follows the evening
    if (p === 'playing') hall.show?.('playing', { piece: perf.piece, time: perf.time });
    publish();
  }

  function startShow() {
    if (!S.concertStarted || S.showStarted || hostOnly()) return;
    S.showStarted = true;
    ui.showStarted();
    // still out in the foyer: the music comes through the wall (as it would) -
    // say how to hear it properly, never move them
    if (IS_HALL && engine.ctx) {
      // (after the walk-on, which has its own toast - and only if they are still out there)
      const hint = (ms, tries = 0) => setTimeout(() => {
        if ((S.phase === 'changing' || S.phase === 'entering') && tries < 40) return hint(1000, tries + 1);
        const L = app.director.listener(settings.fixedEar ? bestSeat : null);
        if (hallOpenness(L.pos.x, L.pos.y, L.pos.z) < 0.6) ui.toast('로비에서는 벽 너머로 들려요 · 홀 안으로 들어가 자리에 앉거나(좌석 클릭) 편하게 보기로 들으면 또렷해요', 6500);
      }, ms);
      hint(1500);
    }
    S.ritualNext = true;
    runConcert(S.current);
  }

  // ---------------------------------------------------------------- rosters
  // Between pieces those not wanted - and not wanted by the piece after
  // either - leave, and those missing come on.
  const rosterCache = new Map();
  async function scoreFor(i) {
    const meta = S.program[i];
    if (!meta) return null;
    if (perf.piece?.id === meta.id) return perf.piece;
    try { return await scores.get(meta.id); } catch { return null; }
  }
  async function rosterFor(i) {
    const meta = S.program[i];
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
  const seqNext = (i) => (i === S.eveningLen - 1 ? 0 : (i + 1) % S.program.length);

  // Start piece i: musicians on stage, conductor in, then play.
  // remote: a guest following the host's 'run' (the host starts the music)
  // late: a guest coming in while the host's orchestra walks on - { cond: the
  // host's conductor is out already, set(): called once our stage is set }
  async function runConcert(i, { quick = false, remote = false, late = null } = {}) {
    syncStageTransitions();
    const tok = ++S.seq;
    endInterval();
    S.ceremony = true;
    if (perf.playing) perf.pause();
    if (quick) { engine.stopApplause(); S.clapUntil = 0; }
    if (quick && S.phase === 'tuning') engine.stopAll(); // (skipped: the tuning-up stops too)
    ui.setPlaying(false);
    S.bowing = false;
    // (a piece picked during the bows: nobody plays it bent over, still on
    // their feet or turned to the house)
    stage.conductorBow(false);
    stage.greet(stage.walkers.filter((w) => w.bowTarget || w.faceYaw !== null || (w.atHome && !w.standingRole && !w.sitTarget)), false);
    const idx = (i + S.program.length) % S.program.length;
    // (skipping away from the encore: the evening goes on from the piece picked)
    const away = quick && idx !== S.current;
    S.current = idx;
    const meta = S.program[S.current];
    S.nextPiece = meta;
    // (the guests start fetching it now; the snapshot that goes with it says
    // it is on its way, not playing: see snapshot)
    if (!remote) sendCmd({ c: 'run', i: S.current, quick, skipStageTransitions: !!settings.skipStageTransitions, ritual: S.ritualNext && !quick });
    let piece;
    try {
      piece = await pieces.choose(meta.id);
    } catch (e) {
      pieceFailed(idx, e, tok);
      return;
    }
    if (!piece) return; // (another piece was chosen meanwhile: that one goes on)
    if (away) S.encoreActive = false;
    if (tok !== S.seq) return;
    perf.seek(0);
    ui.setCurrent(S.current, piece);
    ui.setTime(0, piece.duration);
    updateMediaSession(piece);

    // the players for this piece: whoever is not needed (now or next) walks
    // off, then whoever is missing walks on - the orchestra filling up, a
    // pianist alone at the keyboard, the choir arriving for a chorale
    const target = rosterOf(piece);
    const keep = await rosterFor(seqNext(S.current));
    if (tok !== S.seq) return;
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
        if (enters.length >= 6 && !stage.skipTransitions && !remote && !guest()) ui.toast('단원들이 무대로 들어오고 있어요. 곧 시작해요 · ▶ 누르면 바로 들어요', 9000);
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
          if (settings.applauseVol > 0) { engine.applause(engine.now + 0.05, 0.5, S.audience ? S.audience.count : 0); S.clapUntil = performance.now() + 2800; }
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
      if (!late.cond && !(await until(() => !guest() || S.hostState?.cond || ['announce', 'hush', 'playing'].includes(S.hostState?.phase), tok, 1e9))) return;
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
        if (settings.applauseVol > 0) { engine.applause(engine.now + 0.05, 0.6, S.audience ? S.audience.count : 0); S.clapUntil = performance.now() + 3200; }
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
    if (S.ritualNext && !quick) {
      // one of the evening's big moments: the lights go down, the house holds
      // its breath, and only then the first note
      S.ritualNext = false;
      setPhase('hush');
      hall.setHouseLights(0.3);
      S.hush = 1;
      if (!(await wait(1200, tok))) { S.hush = 0; return; }
      hall.setHouseLights(G.house);
      if (!(await wait(G.hush * 1000, tok))) { S.hush = 0; return; }
    }
    S.ritualNext = false;
    hall.setHouseLights(G.house);
    setPhase('playing');
    if (remote || guest()) {
      // the host starts the music; we join on its clock (see follower).
      // If the host leaves first and we take over, we start it ourselves.
      S.ceremony = false;
      if (!(await until(() => perf.playing || !guest(), tok, 1e9))) return;
      if (perf.playing) return;
    }
    if (!(await wait(900, tok))) { S.hush = 0; return; }
    S.ceremony = false;
    S.hush = 0;
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
    console.warn('piece not loaded', S.program[i]?.id, e);
    const title = S.program[i]?.titleKo;
    S.current = Math.max(0, S.program.findIndex((p) => p.id === perf.piece?.id));
    S.nextPiece = S.program[S.current];
    ui.setCurrent(S.current, perf.piece);
    ui.setTime(perf.time, perf.duration);
    if (tok === S.seq) {
      S.ceremony = false;
      ui.setPlaying(perf.playing);
      // (between pieces it stays between pieces: ▶ goes on from there)
      if (S.phase !== 'playing') setPhase('intermission');
    }
    retryIndex = i;
    ui.offer('retry', `「${title || '다음 곡'}」 악보를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.`, '다시 시도');
    // the room: the host stays where it is - said at once, so nobody plays on
    // the piece that did not come (see 'stay')
    if (S.room?.isHost) sendCmd({ c: 'stay', i: S.current });
  }
  function retryPiece() {
    ui.offer('retry', null);
    if (!S.concertStarted) return;
    // (a guest: the host's piece, from the host's latest state)
    if (guest()) { if (S.hostState) followHost(S.hostState, { joining: true }); return; }
    if (retryIndex < 0) return;
    showOn();
    runConcert(retryIndex, { quick: true });
  }

  async function endOfPiece() {
    const tok = ++S.seq;
    const piece = perf.piece;
    const kind = ensembleOf(piece, rosterOf(piece));
    const G = GRAMMAR[kind];
    const fx = app.fx;
    ui.setPlaying(false);
    S.leaf.ended(piece, IS_SPHERE ? visualsFor(piece) : null);
    fx?.lasers.set(false);
    fx?.wash.set(false);
    const big = !!piece?.finale;
    // after a quiet ending the silence is held a moment before anyone claps
    if (!big && piece?.mood === 'calm') {
      setPhase('afterglow');
      if (!(await wait(G.after * 1000, tok))) return;
    }
    setPhase('applause');
    hall.setHouseLights(S.sleepy ? 0.04 : kind === 'solo' ? 0.3 : 0.5); // (nodding off: they stay down)
    if (big) hall.show?.('finale');
    if (settings.applauseVol > 0) {
      engine.applause(engine.now + 0.35, big ? 1.3 : 1, S.audience ? S.audience.count : 0);
      S.clapUntil = performance.now() + (big ? 12500 : 7600);
    }
    const efficient = app.graphics.efficient;
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
    const lastOfProgram = !settings.repeatOne && !settings.shuffle && (S.current === S.program.length - 1 || S.current === S.eveningLen - 1);
    if (piece) S.playedTonight.add(piece.id);
    if (lastOfProgram && !S.encoreActive && !guest()) {
      // the end of the programme: the house asks for one more
      const win = await encoreVote(tok);
      if (win === null) return;
      if (win >= 0) {
        S.encoreActive = true;
        S.ritualNext = true;
        runConcert(win);
        return;
      }
    }
    const finalOfEvening = lastOfProgram || S.encoreActive;
    let next = S.encoreActive ? 0 : nextIndex();
    // falling asleep (alone): the last minutes are a quiet piano piece
    if (S.sleepAt && !S.room && !finalOfEvening && S.sleepAt - performance.now() < 5 * 60000) next = lullaby(next);
    S.nextPiece = S.program[next];
    if (!finalOfEvening && intervalDue(S.current) && !(S.sleepAt && S.sleepAt - performance.now() < 10 * 60000)) {
      // the middle of the evening: the interval
      S.intervalDone = true;
      const endsAt = clockNow() + settings.interval * 60;
      beginInterval(endsAt, next); // (first: the snapshot that goes with the command says so)
      sendCmd({ c: 'interval', i: next, until: endsAt });
      if (!(await until(() => !S.interval || clockNow() >= S.interval.until, tok, 1e9))) return;
      S.ritualNext = true;
      runConcert(next);
      return;
    }
    setPhase('intermission', Math.max(2, settings.gap));
    if (finalOfEvening) {
      // end of the programme: everyone leaves, the house comes up, then a new evening begins
      S.encoreActive = false;
      S.ritualNext = true; // the next evening opens with its hush
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
      if (!(await until(() => !leafCard || leafCard.hidden, tok, S.room ? 60000 : 1e9))) return;
    } else if (!(await wait(Math.max(2, settings.gap) * 1000, tok))) return;
    runConcert(next);
  }
  perf.onEnd = () => endOfPiece();

  function nextIndex() {
    if (settings.repeatOne) return S.current;
    if (settings.shuffle) {
      let n = S.current;
      while (S.program.length > 1 && n === S.current) n = Math.floor(Math.random() * S.program.length);
      return n;
    }
    // after the evening's last piece a new evening begins
    if (S.current === S.eveningLen - 1) return 0;
    return S.current + 1;
  }

  function togglePlay() {
    if (!S.concertStarted || hostOnly()) return;
    if (!S.showStarted) { startShow(); return; }
    // (the piece chosen is on its way: nothing to play or pause yet - not the
    // one before it either)
    if (loadingPiece()) { ui.toast('곡을 불러오는 중이에요. 곧 시작해요.', 1600); return; }
    if (S.phase === 'interval' && S.interval) { secondHalf(); return; }
    if (S.phase === 'encore' && S.encore) { S.encore.until = clockNow(); return; }
    if (S.phase !== 'playing') {
      // during a break: skip the ceremony and start the coming piece
      runConcert(S.phase === 'intermission' ? nextIndex() : S.current, { quick: true });
      return;
    }
    if (perf.playing) {
      perf.pause();
      ui.setPlaying(false);
      hall.setHouseLights(0.4);
      app.power.sound.check(); // (paused: no "sound back" button that would bring no music)
    } else {
      if (perf.pos >= perf.duration - 0.1) perf.seek(0);
      perf.play();
      ui.setPlaying(true);
      hall.setHouseLights(0.12);
    }
    sendCmd(playMsg());
  }

  const showOn = () => { if (!S.showStarted) { S.showStarted = true; ui.showStarted(); } };

  function fxFor(piece) {
    const fx = app.fx;
    if (!fx) return;
    const lively = piece?.mood === 'lively' && settings.lasers && !app.graphics.efficient();
    // (a recital or a few players: the colour wash, but no laser show)
    fx.lasers.set(lively && GRAMMAR[ensembleOf(piece, rosterOf(piece))].lasers);
    fx.wash.set(lively);
  }

  // -------------------------------------------------------------- a recital
  // When the pianist plays alone, chairs come out on the stage behind them and
  // a page turner's chair at their side (see recital.js): the chip at the top
  // takes you there, and you are seen back to your seat when it ends.
  function closeRecital() {
    const { director } = app;
    if (!recital.on) return;
    recital.open(false);
    if (director.seat?.stage) {
      if (S.lastSeat && !director.occupied.has(S.lastSeat.index)) director.sitAt(S.lastSeat);
      else { director.setMode('walk'); director.placeAt(ENTRANCE.pos, ENTRANCE.look); }
    }
  }

  // ------------------------------------------------------------ transport
  ui.on('start', startShow);
  ui.on('toggle', togglePlay);
  // the button that fixes something with one press (see ui.offer)
  ui.on('offer', (kind) => {
    if (kind === 'retry') retryPiece();
    else if (kind === 'sound') app.power.sound.check({ gesture: true });
  });
  // (before the show ⏮ / ⏭ open the evening as ▶ does - from its first piece,
  // not from its last)
  ui.on('next', () => { if (!S.concertStarted || hostOnly()) return; if (!S.showStarted) { startShow(); return; } runConcert(settings.shuffle ? nextIndex() : S.current + 1, { quick: true }); });
  ui.on('prev', () => {
    if (!S.concertStarted || hostOnly()) return;
    if (!S.showStarted) { startShow(); return; }
    if (S.phase === 'playing' && perf.time > 5 && !loadingPiece()) { perf.seek(0); sendCmd(playMsg()); return; }
    showOn();
    runConcert(S.current - 1, { quick: true });
  });
  ui.on('select', (i) => { if (!S.concertStarted || hostOnly()) return; showOn(); runConcert(i, { quick: true }); });
  ui.on('seek', (t) => {
    if (!S.concertStarted || S.phase !== 'playing' || loadingPiece() || hostOnly()) return;
    perf.seek(t);
    sendCmd(playMsg());
  });
  ui.on('seekKey', (d, e) => {
    // (walking, ← → turn you - except on the focused position slider itself)
    if (!S.concertStarted || S.phase !== 'playing' || loadingPiece() || (app.director.mode === 'walk' && e.target?.id !== 'seek')) return;
    e.preventDefault();
    if (hostOnly()) return;
    perf.seek(perf.time + d);
    sendCmd(playMsg());
  });

  return {
    pieces, loadingPiece, setPhase, startShow, scoreFor, rosterFor, runConcert, pieceFailed, endOfPiece,
    nextIndex, togglePlay, showOn, fxFor, closeRecital,
  };
}
