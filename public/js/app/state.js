// The running evening, shared by the controllers in this folder. One plain
// object: every controller reads and writes the same fields, so a value is
// never copied into two places that could disagree.
import { Leaf } from '../evening.js';

export function createAppState(venue) {
  return {
    // the programme and where we are in it
    program: [],
    eveningLen: 0, // the evening's programme (this building's half of the pieces)
    current: -1,
    nextPiece: null,
    // the visit
    concertStarted: false, // we are inside
    showStarted: false, // the musicians have been called
    joining: false,
    pendingJoin: undefined, // the room's state, applied once we are inside
    muted: false,
    focused: null,
    lastSeat: null,
    // the concert sequence
    phase: 'lobby', // lobby | changing | entering | tuning | announce | hush | playing | afterglow | applause | intermission | interval | encore | leaving
    phaseUntil: 0,
    seq: 0, // generation token for the concert sequence
    ceremony: false, // a piece's walk-on / greeting is running here
    ritualNext: false, // the next piece opens one of the evening's big moments (a held hush)
    hush: 0, // the house holds its breath (0..1)
    clapUntil: 0,
    bowing: false,
    // watching together
    room: null, // RoomClient while watching together
    hostState: null, // the host's latest snapshot
    rejoin: false, // the next snapshot is taken as on coming in (see 'stay')
    adrift: -1, // the seq in which we set the stage as the host had it, with nothing to follow
    // the interval
    interval: null, // { until (clock s), next, bear, bells }
    intervalDone: false,
    tea: false,
    // the encore
    encore: null, // { cands, candMeta, until, votes: Map (the host) | null (a guest), mine, counts }
    encoreActive: false, // the encore is playing: after it, the evening ends
    playedTonight: new Set(),
    // the sleep timer
    sleepAt: 0,
    sleepFading: false,
    sleepy: false, // the house nods off (the last minute)
    asleep: false, // everything stopped: nothing drawn, the sound suspended
    sleepGen: 0, // a changed timer cancels what the old one scheduled
    // the house
    audience: null,
    leaf: new Leaf(venue), // tonight, for the leaf programme
  };
}

// guests (and the timers that call everyone back) count on the room's clock
export const clockOf = (S) => (S.room ? S.room.now() : performance.now() / 1000);
export const isGuest = (S) => !!S.room && !S.room.isHost;

// A step of the concert sequence: true once done, false when a newer
// sequence (tok !== S.seq) has taken over meanwhile.
export const waitFor = (S, ms, tok) => new Promise((r) => setTimeout(() => r(tok === S.seq), ms));
export const untilFor = (S, cond, tok, timeout = 60000) => new Promise((r) => {
  const t0 = performance.now();
  const tick = () => {
    if (tok !== S.seq) return r(false);
    if (cond() || performance.now() - t0 > timeout) return r(true);
    setTimeout(tick, 120);
  };
  tick();
});

// a small seeded random generator: the same numbers on every screen
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
