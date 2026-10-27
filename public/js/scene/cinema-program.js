// Score-driven shot selection, evaluated at edits rather than every frame.
// Fairness belongs to sections first, then individual chairs within them.
import { SECTIONS } from '../layout.js';
export class CinemaProgram {
  constructor() { this.reset(null); }
  reset(piece) {
    this.piece = piece; this.time = -Infinity; this.sections = new Map(); this.chairs = new Map();
    this.tracks = (piece?.tracks || []).filter(t => SECTIONS[t.section] && (t.gain ?? 1) > 0).map(t => {
      const events = [];
      for (let i = 0; i < t.notes.length; i += 4) if (t.notes[i + 3] > 0) events.push({ start: t.notes[i], end: t.notes[i] + t.notes[i + 1], velocity: t.notes[i + 3] });
      events.sort((a, b) => a.start - b.start);
      let end = -Infinity;
      return { sid: t.section, gain: t.gain ?? 1, chairs: t.chairs || SECTIONS[t.section].chairs.map((_, i) => i), events,
        ends: events.map(e => end = Math.max(end, e.end)) };
    });
  }
  active(piece, time) {
    if (this.piece !== piece || time < this.time - .5) this.reset(piece);
    this.time = time;
    const candidates = new Map();
    for (const track of this.tracks) {
      let lo = 0, hi = track.ends.length;
      while (lo < hi) { const m = (lo + hi) >>> 1; if (track.ends[m] < time - .35) lo = m + 1; else hi = m; }
      let energy = 0, activity = 0;
      for (let i = lo; i < track.events.length && track.events[i].start <= time + 1.5; i++) {
        const e = track.events[i];
        if (e.end < time - .35) continue;
        // A dense accompaniment chord must not beat a melodic line merely
        // because it contains more notes. Respect the audible track balance.
        const rank = e.start <= time && e.end > time ? 3 : e.start > time ? 2 : 1;
        activity = Math.max(activity, rank);
        energy = Math.max(energy, e.velocity * track.gain * (rank === 3 ? 1 : rank === 2 ? .45 : .2));
      }
      if (!energy) continue;
      for (const ci of track.chairs) if (SECTIONS[track.sid].chairs[ci]) {
        const key = `${track.sid}:${ci}`, prior = candidates.get(key);
        candidates.set(key, { sid: track.sid, ci, energy: Math.max(energy, prior?.energy || 0), activity: Math.max(activity, prior?.activity || 0) });
      }
    }
    return [...candidates.values()];
  }
  choose(piece, time) {
    const list = this.active(piece, time);
    list.sort((a, b) => b.activity - a.activity
      || (this.sections.get(a.sid) || 0) - (this.sections.get(b.sid) || 0)
      || (this.chairs.get(`${a.sid}:${a.ci}`) || 0) - (this.chairs.get(`${b.sid}:${b.ci}`) || 0)
      || b.energy - a.energy || a.sid.localeCompare(b.sid) || a.ci - b.ci);
    const selected = list[0];
    if (!selected) return null;
    this.sections.set(selected.sid, (this.sections.get(selected.sid) || 0) + 1);
    const key = `${selected.sid}:${selected.ci}`;
    this.chairs.set(key, (this.chairs.get(key) || 0) + 1);
    return selected;
  }
}
