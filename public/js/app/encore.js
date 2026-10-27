// --------------------------------------------------------------- the encore
// At the end of the programme the house asks for one more: three short
// pieces (one the players on stage can play right away, one of another
// kind, one lively), one firefly lantern each. Alone your lantern decides;
// in a room the host counts (lanterns go to the host only, a tie goes the
// host's way). The hall's fireflies gather as lanterns go up; at the Sphere
// the dome turns into a starry sky.
import * as THREE from 'three';
import { IS_SPHERE } from '../scene/venue.js';
import { ensembleOf } from '../evening.js';
import { clockOf, untilFor, seeded } from './state.js';

const HOUSE = new THREE.Vector3(0, 10.5, 13);

export function createEncore(app) {
  const { S, ui, stage, hall, spot, effects } = app;
  const clockNow = () => clockOf(S);
  const until = (cond, tok, timeout) => untilFor(S, cond, tok, timeout);
  const setPhase = (p, s) => app.concert.setPhase(p, s);
  const closeRecital = () => app.concert.closeRecital();
  const runConcert = (i, o) => app.concert.runConcert(i, o);
  const rosterFor = (i) => app.concert.rosterFor(i);
  const sendCmd = (c) => app.sync.sendCmd(c);
  const publish = () => app.sync.publish();

  function encoreCounts() {
    const n = [0, 0, 0];
    if (S.encore?.votes) for (const k of S.encore.votes.values()) n[k]++;
    return n;
  }

  async function encoreCandidates() {
    const on = stage.onstageKeys();
    const rand = S.room ? seeded((S.room.seed ^ 0xe7c0) + S.playedTonight.size) : Math.random;
    const pool = [];
    for (let i = 0; i < S.program.length; i++) if (S.program[i].duration <= 240 && !S.playedTonight.has(S.program[i].id)) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const info = [];
    for (const i of pool.slice(0, 16)) {
      const r = await rosterFor(i);
      info.push({ i, fit: r.size > 0 && [...r].every((k) => on.has(k)), kind: ensembleOf(S.program[i], r), mood: S.program[i].mood });
    }
    const out = [];
    const take = (f) => { const c = info.find((x) => !out.includes(x) && f(x)); if (c) out.push(c); };
    take((x) => x.fit); // the players already there
    take((x) => !out.length || x.kind !== out[0].kind); // something of another kind
    take((x) => x.mood === 'lively' || x.mood === 'grand');
    while (out.length < 3 && out.length < info.length) take(() => true);
    return out.map((x) => x.i);
  }

  function encoreShow() {
    const E = S.encore;
    if (!E) return;
    const counts = E.votes ? encoreCounts() : E.counts || [0, 0, 0];
    ui.encore({ cands: E.candMeta, counts, mine: E.mine, left: E.until - clockNow() });
    // the more lanterns, the more fireflies come
    const people = S.room ? S.room.members.size : 1;
    const raised = counts.reduce((a, b) => a + b, 0);
    if (!IS_SPHERE) effects.gather(0.3 + 0.7 * Math.min(1, raised / Math.max(1, people)), HOUSE);
  }

  function encoreUi(state) {
    if (state !== null) return;
    // the fireflies fly off again (also after a count, which has already put
    // the lanterns down)
    effects.gather(0);
    if (!S.encore) return;
    S.encore = null;
    ui.encore(null);
  }

  // the host (or alone): ask, wait, count. The winner's index, -1 for none, or
  // null when the evening moved on meanwhile
  async function encoreVote(tok) {
    const cands = await encoreCandidates();
    if (tok !== S.seq) return null;
    if (!cands.length) return -1;
    const endsAt = clockNow() + 14;
    S.encore = { cands, candMeta: cands.map((i) => S.program[i]), until: endsAt, votes: new Map(), mine: -1 };
    closeRecital();
    app.director.releaseLock(); // (the lanterns are clicked: the mouse is let go)
    setPhase('encore');
    hall.setHouseLights(0.2);
    spot.set(null);
    if (IS_SPHERE) hall.dome?.go('STARS', { dur: 3 });
    sendCmd({ c: 'encore', cands, until: endsAt });
    encoreShow();
    return countEncore(tok);
  }

  // wait for the lanterns, count them: the winner's index, or null
  async function countEncore(tok) {
    // alone, your lantern decides (a moment after you raise it)
    let chosenAt = 0;
    const ok = await until(() => {
      if (!S.encore) return true;
      if (!S.room && S.encore.mine >= 0) { chosenAt ||= clockNow(); if (clockNow() - chosenAt > 1.6) return true; }
      return clockNow() >= S.encore.until;
    }, tok, 30000);
    if (!ok || !S.encore) return null;
    const counts = encoreCounts();
    let best = -1;
    let bestN = 0;
    counts.forEach((n, k) => { if (n > bestN || (n === bestN && n > 0 && k === S.encore.mine)) { best = k; bestN = n; } });
    if (best < 0) best = 0; // no lantern at all: the conductor's choice
    const win = S.encore.cands[best];
    S.encore = null;
    ui.encore(null);
    ui.toast(`앙코르: 「${S.program[win].titleKo}」`, 3200);
    return win;
  }

  // a guest who became the host while the lanterns were up: count and go on
  async function finishEncore(tok) {
    const win = await countEncore(tok);
    if (win === null) return;
    S.encoreActive = true;
    S.ritualNext = true;
    runConcert(win);
  }

  // a guest: the host's vote, as the host counts it (from the snapshots)
  function guestEncore(ev, fresh = false) {
    if (!S.encore || fresh || S.encore.cands.join() !== ev.c.join()) {
      app.sync.follower.cancel();
      closeRecital();
      S.encore = { cands: ev.c, candMeta: ev.c.map((i) => S.program[i]), until: ev.u, votes: null, mine: -1, counts: ev.n };
      app.director.releaseLock();
      setPhase('encore');
      hall.setHouseLights(0.2);
      spot.set(null);
      if (IS_SPHERE) hall.dome?.go('STARS', { dur: 3 });
    }
    S.encore.counts = ev.n;
    S.encore.until = ev.u;
    encoreShow();
  }

  ui.on('vote', (k) => {
    const E = S.encore;
    if (!E) return;
    E.mine = E.mine === k ? -1 : k;
    if (E.votes) {
      // the host (or alone) counts their own lantern
      const me = S.room ? S.room.id : 0;
      if (E.mine >= 0) E.votes.set(me, E.mine); else E.votes.delete(me);
      publish();
    } else S.room?.vote(E.mine);
    encoreShow();
  });
  setInterval(() => { if (S.encore) encoreShow(); }, 500);

  return { encoreCounts, encoreShow, encoreUi, encoreVote, countEncore, finishEncore, guestEncore };
}
