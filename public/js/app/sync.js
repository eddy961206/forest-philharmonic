// ------------------------------------------------------ watching together
// In a room the host (방장) runs the concert. Its client sends what it does
// - run a piece, play or pause at a position on the server clock - and a
// snapshot every few seconds. Everyone else performs the same walk-ons and
// bows here and starts the music on the host's clock, so the whole room
// hears the same bar together. Graphics and sound settings stay personal.
import { VENUE } from '../scene/venue.js';
import { transportState } from '../pieces.js';
import { Follower } from '../follow.js';
import { ensembleOf, GRAMMAR, rosterCentre } from '../evening.js';
import { dropTicket } from '../tickets.js';
import { rosterOf } from './concert.js';
import { clockOf, isGuest, waitFor, untilFor } from './state.js';

const EYE_H = 1.62;
const AWAY_HANDOFF = 30; // seconds of a stuck show in a hidden host's page

export function createSync(app) {
  const { S, settings, ui, engine, perf, stage, hall, spot, recital, avatars, camera } = app;
  const wait = (ms, tok) => waitFor(S, ms, tok);
  const until = (cond, tok, timeout) => untilFor(S, cond, tok, timeout);
  const clockNow = () => clockOf(S);
  const guest = () => isGuest(S);
  const setPhase = (p, s) => app.concert.setPhase(p, s);
  const runConcert = (i, o) => app.concert.runConcert(i, o);
  const showOn = () => app.concert.showOn();
  const closeRecital = () => app.concert.closeRecital();
  const nextIndex = () => app.concert.nextIndex();
  const fxFor = (piece) => app.concert.fxFor(piece);
  const beginInterval = (endsAt, next) => app.interval.beginInterval(endsAt, next);
  const encoreCounts = () => app.encore.encoreCounts();
  const encoreShow = () => app.encore.encoreShow();
  const encoreVote = (tok) => app.encore.encoreVote(tok);
  const finishEncore = (tok) => app.encore.finishEncore(tok);
  const guestEncore = (ev, fresh) => app.encore.guestEncore(ev, fresh);
  const seatAudience = () => app.house.seatAudience();
  const refreshOccupied = () => app.house.refreshOccupied();

  function syncStageTransitions() {
    const on = guest() ? !!S.hostState?.skipStageTransitions : !!settings.skipStageTransitions;
    stage.setSkipTransitions(on);
    document.getElementById('optSkipStageTransitions').checked = on;
  }

  function hostOnly() {
    if (!guest()) return false;
    ui.toast('공연 진행은 방장만 할 수 있어요.', 1600);
    return true;
  }

  function snapshot() {
    // (a piece on its way: its number, at its start, not the time of the one before)
    const t = transportState({ chosen: S.program[S.current], loaded: perf.piece, phase: S.phase, playing: perf.playing, time: perf.time });
    return {
      started: S.showStarted, i: S.current, title: S.program[S.current]?.titleKo || '', phase: t.phase, loading: t.loading,
      // (the host's sound taken away by its browser: its music stands still,
      // and the room waits there with it - not pulled back to it every few seconds)
      playing: t.playing && !app.power.sound.lost, pos: t.pos, at: S.room.now(), onstage: stage.onstage, cond: stage.conductorOn,
      on: [...stage.onstageKeys()], skipStageTransitions: !!settings.skipStageTransitions,
      iu: S.interval?.until, inext: S.interval?.next,
      ev: S.encore ? { c: S.encore.cands, n: encoreCounts(), u: S.encore.until } : undefined,
    };
  }
  function publish() { if (S.room?.isHost && S.room.connected) S.room.state(snapshot()); }
  function sendCmd(c) { if (!S.room?.isHost) return; S.room.cmd(c); publish(); }
  const playMsg = () => ({ c: perf.playing ? 'play' : 'pause', i: S.current, pos: perf.time, at: S.room ? S.room.now() : 0 });

  // make piece i the current one (guests follow the host there). The host's
  // state every few seconds asks for the same piece again while it is on its
  // way: that is the one download, the latest ask applying it (pieces.js)
  async function ensurePiece(i) {
    if (!S.program[i]) return false;
    const fresh = perf.piece?.id !== S.program[i].id;
    S.current = i;
    S.nextPiece = S.program[i];
    let piece;
    try {
      piece = await app.concert.pieces.choose(S.program[i].id);
    } catch (e) {
      app.concert.pieceFailed(i, e, null); // (the host's next state tries again)
      return false;
    }
    if (!piece || S.current !== i) return false;
    if (fresh) app.power.updateMediaSession(piece);
    return true;
  }

  // The host's playback ({ i, playing, pos, at }) ours, and the end of its
  // piece too - from a play/pause command and from a snapshot alike (see
  // follow.js). The stage first, as the host has it:
  const follower = new Follower({
    perf, ensurePiece, now: () => S.room.now(),
    stage(piece, s) {
      const want = s.on ? new Set(s.on) : rosterOf(piece);
      const here = stage.onstageKeys();
      const rosterOff = [...rosterOf(piece)].some((k) => !here.has(k));
      if (S.ceremony || S.phase !== 'playing' || rosterOff || (!!piece.conducted !== stage.conductorOn)) {
        // late, or still walking on: skip to where the show is
        S.seq++;
        S.ceremony = false;
        stage.snapRoster(want);
        stage.snapConductor(!!piece.conducted);
        engine.stopApplause();
        S.clapUntil = 0;
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
  async function followHost(s, { joining = false } = {}) {
    if (s) { S.hostState = s; syncStageTransitions(); }
    if (!s || !S.room || S.room.isHost || !S.concertStarted || !s.started) return true;
    if (S.rejoin) { S.rejoin = false; joining = true; }
    showOn();
    if (s.phase === 'encore' && s.ev && !joining) { guestEncore(s.ev); return true; }
    if (!joining) {
      // in step with the show: the host's playback, and the end of its piece -
      // its position run out, or the host past it already (the bows, the gap)
      if (s.phase === 'playing') return (await follower.playback(s)) === true;
      follower.between(s, { index: S.current, ceremony: S.ceremony });
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
    S.seq++;
    S.ceremony = false;
    if (!(await ensurePiece(s.i))) return false;
    if (s.on) stage.snapRoster(new Set(s.on));
    else if (s.onstage) stage.snapOnstage();
    stage.snapConductor(!!s.cond && s.onstage && !over);
    if (s.phase === 'interval' && s.iu) { beginInterval(s.iu, s.inext ?? s.i); return true; }
    if (s.phase === 'encore' && s.ev) { guestEncore(s.ev, true); return true; }
    hall.setHouseLights(s.onstage ? 0.5 : 1);
    S.adrift = S.seq; // (nothing of ours waits to go on: see carryOn)
    setPhase('intermission');
    return true;
  }

  function onHostCmd(c) {
    if (!S.room || S.room.isHost || !S.concertStarted || !c) return;
    if (c.c === 'stageTransitions') {
      S.hostState = { ...S.hostState, skipStageTransitions: !!c.skip };
      syncStageTransitions();
    } else if (c.c === 'run') {
      S.hostState = { ...S.hostState, skipStageTransitions: !!c.skipStageTransitions };
      syncStageTransitions();
      showOn();
      if (S.phase === 'encore' && S.program[c.i]) ui.toast(`앙코르: 「${S.program[c.i].titleKo}」`, 3200); // (the lanterns' choice, for everyone)
      S.ritualNext = !!c.ritual;
      runConcert(c.i, { quick: !!c.quick, remote: true });
    } else if (c.c === 'play' || c.c === 'pause') {
      showOn();
      follower.playback({ i: c.i, playing: c.c === 'play', pos: c.pos, at: c.at });
    } else if (c.c === 'stay') {
      // the piece the host asked for did not come to the host: it stays where
      // it is, and so do we - the state that follows says where, and is taken
      // as on coming in (whatever we set up for that piece is let go)
      S.seq++;
      follower.cancel();
      S.ceremony = false;
      S.rejoin = true;
    } else if (c.c === 'encore') {
      S.seq++;
      S.ceremony = false;
      guestEncore({ c: c.cands, n: [0, 0, 0], u: c.until }, true);
    } else if (c.c === 'interval') {
      S.seq++;
      S.ceremony = false;
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
      S.seq++;
      follower.cancel();
      closeRecital();
      S.ceremony = false;
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
    syncStageTransitions();
    ui.toast(back ? '다시 방장이에요. 공연을 이어서 진행해요.' : '이제 내가 방장이에요. 공연 진행을 맡아요.', 2600);
    ui.chatLine({ sys: true, text: back ? '다시 방장이에요.' : '이제 내가 방장이에요.' });
    carryOn();
    publish();
  }

  // coming into a show under way: follow it, and say so once we are in step
  // (the host's own page, reloaded, gets the show back then: server/rooms.js)
  function catchUp(s) {
    const c = S.room;
    followHost(s, { joining: true }).then((ok) => { if (ok && S.room === c && !c.isHost) c.ready(); }, (e) => console.error(e));
  }

  // the show is ours now (the host's role came to us, or the room was lost):
  // whatever was under way goes on - the interval or the lantern vote to its
  // end, or, between pieces with nothing of ours waiting (we came in during
  // the bows), the next piece after the usual gap
  function carryOn() {
    if (S.interval) {
      ui.interval(true, true);
      const tok = ++S.seq;
      const next = S.interval.next;
      until(() => !S.interval || clockNow() >= S.interval.until, tok, 1e9).then((ok) => { if (ok) { S.ritualNext = true; runConcert(next); } });
    } else if (S.encore && !S.encore.votes) {
      S.encore.votes = new Map();
      if (S.encore.mine >= 0) S.encore.votes.set(S.room ? S.room.id : 0, S.encore.mine);
      // (a moment for the lanterns already up to reach us before they are counted)
      if (S.room) S.encore.until = Math.max(S.encore.until, clockNow() + 1.5);
      finishEncore(++S.seq);
    } else if (S.adrift === S.seq && S.showStarted && !S.ceremony && !perf.playing) {
      const tok = ++S.seq;
      const last = S.current === S.eveningLen - 1 || S.current === S.program.length - 1;
      wait(Math.max(2, settings.gap) * 1000, tok).then(async (ok) => {
        if (!ok) return;
        if (last && !S.encoreActive) {
          const win = await encoreVote(tok);
          if (win === null) return;
          if (win >= 0) { S.encoreActive = true; S.ritualNext = true; runConcert(win); return; }
        }
        S.encoreActive = false;
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
  document.addEventListener('visibilitychange', () => {
    clearInterval(awayCheck);
    stuckFor = 0;
    const room = S.room;
    if (unloading || !room?.isHost || !S.concertStarted) return;
    room.cmd({ c: 'away', on: document.hidden });
    if (!document.hidden) return;
    awayCheck = setInterval(() => {
      if (!document.hidden || !S.room?.isHost) { clearInterval(awayCheck); return; }
      const stuck = S.showStarted && (S.ceremony || (!perf.playing && !['interval', 'encore'].includes(S.phase)));
      stuckFor = stuck ? stuckFor + 5 : 0;
      if (stuckFor < AWAY_HANDOFF || S.room.members.size < 2) return;
      clearInterval(awayCheck);
      const next = [...S.room.members.values()].filter((m) => m.id !== S.room.id).sort((a, b) => (a.since ?? 0) - (b.since ?? 0) || a.id - b.id)[0];
      if (!next) return;
      S.room.handoff(next.id);
      ui.chatLine({ sys: true, text: `화면을 오래 비운 사이 ${next.name}님에게 방장을 넘겼어요.` });
    }, 5000);
  });

  function membersChanged() {
    if (!S.room) return;
    ui.setMembers([...S.room.members.values()], S.room.host, S.room.id);
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
        if (S.encore?.votes) { S.seq++; S.encore.votes = null; } // (the count is theirs now)
      }
      if (!first && !c.isHost && S.encore?.mine >= 0) c.vote(S.encore.mine); // (our lantern left with the line: up again)
      if (c.isHost) publish();
      else if (!S.concertStarted) S.pendingJoin = m.state;
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
      if (S.encore?.votes?.delete(id)) encoreShow(); // (a lantern leaves with its holder)
      membersChanged();
      refreshOccupied();
      // the host's line dropped (a reload, most often): the room waits for them -
      // said calmly, and no "left" for someone who is on the way back
      if (wait) { ui.toast('방장의 연결이 잠시 끊겼어요. 돌아오기를 기다려요.', 4000); ui.chatLine({ sys: true, text: '방장의 연결이 잠시 끊겼어요. 돌아오기를 기다려요.' }); return; }
      if (who) goneSay.set(id, setTimeout(() => { goneSay.delete(id); if (S.room === c) ui.chatLine({ sys: true, text: `${who.name}님이 나갔어요.` }); }, 6000));
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
      if (S.encore) {
        // the lanterns are counted by the new host now: ours goes to them
        if (handed && S.encore.votes) { S.seq++; S.encore.counts = encoreCounts(); S.encore.votes = null; }
        if (S.encore.mine >= 0) c.vote(S.encore.mine);
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
      if (!c.isHost || !S.encore?.votes || !c.members.has(id)) return;
      if (k >= 0 && k < S.encore.cands.length) S.encore.votes.set(id, k); else S.encore.votes.delete(id);
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
    const shift = S.room ? performance.now() / 1000 - S.room.now() : 0;
    S.room?.leave();
    S.room = null;
    avatars.clear();
    ui.setRoom(null);
    syncStageTransitions();
    refreshOccupied();
    if (S.interval) { S.interval.until += shift; ui.setIntervalLeft(S.interval.until - clockNow()); }
    if (S.encore) S.encore.until += shift;
    carryOn(); // (the interval, the lanterns: ours to finish now)
    app.lobby.soloTicket();
  }

  // out to the square: the music fades for a moment instead of stopping dead
  function outToSquare() {
    try { if (engine.master) engine.master.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.08); } catch { /* no sound yet */ }
    setTimeout(() => { location.href = location.pathname; }, 320);
  }
  ui.on('leaveRoom', () => {
    S.room?.leave();
    dropTicket();
    outToSquare();
  });
  ui.on('toPlaza', () => {
    S.room?.leave();
    S.leaf.save();
    dropTicket();
    outToSquare();
  });
  ui.on('copyInvite', async () => {
    if (!S.room?.room) return;
    const url = `${location.origin}${location.pathname}${roomAddress(S.room.room.code)}`;
    try {
      await navigator.clipboard.writeText(url);
      ui.toast('초대 링크를 복사했어요. 친구에게 보내 주세요.', 2400);
    } catch {
      window.prompt('이 링크를 복사해서 보내 주세요', url);
    }
  });
  ui.on('handoff', (id, name) => {
    if (!S.room?.isHost) return;
    S.room.handoff(id);
    ui.toast(`${name}님에게 방장을 넘겼어요.`, 2200);
  });
  ui.on('chat', (text) => S.room?.chat(text));
  ui.on('chatOpen', () => app.director.releaseLock());
  ui.on('leafOpen', () => app.director.releaseLock());

  // where I am, for everyone else (a seat, or a spot and a heading)
  let poseT = 0;
  let lastPoseKey = '';
  function myPose() {
    const d = app.director;
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
    const room = S.room;
    if (!room || !S.concertStarted) return;
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

  return {
    follower, syncStageTransitions, hostOnly, publish, sendCmd, playMsg, followHost, catchUp, wireRoom, roomTick,
  };
}
