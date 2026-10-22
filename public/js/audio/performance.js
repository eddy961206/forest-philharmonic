// Transport: schedules a piece's notes into the audio engine ahead of time
// and exposes, per musician chair, what is sounding right now so the scene
// can animate in sync with what you hear.

import { SECTIONS } from '../layout.js';

// Small, consistent timing personalities per section (seconds): basses speak
// a touch late, the concertmaster leads. Real ensembles are never quantised.
// the score level (see _level) a piece is levelled to
const LEVEL_REF = 3;

const SECTION_LAG = { vn1: -0.004, vn2: 0.002, va: 0.004, vc: 0.006, cb: 0.012, fl: 0, ob: 0, cl: 0.002, bn: 0.006, hn: 0.01, tp: 0.004, timp: 0.003, harp: 0, piano: 0 };

// A piece's score from the server. A failed answer (offline, a 503, a page
// that is not a score) is an error, never half a piece.
export async function fetchPiece(id) {
  const r = await fetch(`music/${id}.json`);
  if (!r.ok) throw new Error(`music/${id}.json: HTTP ${r.status}`);
  const p = await r.json();
  if (!p || !Array.isArray(p.tracks) || !(p.duration > 0)) throw new Error(`music/${id}.json: not a score`);
  return p;
}

export class Performance {
  constructor(engine) {
    this.engine = engine;
    this._req = 0;
    this.piece = null;
    this.playing = false;
    this.pos = 0; // seconds into the piece while paused
    this.onEnd = null;
    this._ended = false;
    this.speed = 1;
    engine.onTick(() => this._schedule());
    document.addEventListener('visibilitychange', () => this._schedule());
  }

  async load(id) {
    const req = ++this._req;
    const prep = this.prepare(await fetchPiece(id));
    if (req !== (this._req || 0)) return null; // a newer load superseded this one
    return this.use(prep);
  }

  // A score made ready to play - its events in time order, its dynamics,
  // its level - without touching what is playing now (see use(): a piece
  // asked for and no longer wanted by the time it arrives changes nothing)
  prepare(p) {
    const events = [];
    p.tracks.forEach((tr, ti) => {
      const n = tr.notes;
      tr.count = n.length / 4;
      tr.ti = ti;
      tr.chairList = tr.chairs || SECTIONS[tr.section].chairs.map((_, i) => i);
      for (let i = 0; i < n.length; i += 4) events.push(ti, n[i], n[i + 1], n[i + 2], n[i + 3]);
    });
    // sort flat event list by time
    const count = events.length / 5;
    const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => events[a * 5 + 1] - events[b * 5 + 1]);
    const ev = new Float32Array(count * 5);
    order.forEach((src, dst) => {
      for (let k = 0; k < 5; k++) ev[dst * 5 + k] = events[src * 5 + k];
    });
    let maxDur = 0;
    for (let i = 0; i < count; i++) maxDur = Math.max(maxDur, ev[i * 5 + 2]);
    this._shape(p, ev, count);
    return {
      piece: p, ev, evCount: count, maxDur, level: this._level(p, ev, count),
      playingSections: new Set(p.tracks.map((t) => t.section)), activity: this._activity(p),
    };
  }

  // the prepared piece is the one to play now (stopped, at its start)
  use(prep) {
    if (this.playing) this.stop();
    const p = prep.piece;
    this.piece = p;
    this.ev = prep.ev;
    this.evCount = prep.evCount;
    this.maxDur = prep.maxDur;
    if (prep.level) {
      this.levelDb = prep.level.db;
      this.engine.setTrim(prep.level.trim, 1.2);
    }
    this.playingSections = prep.playingSections;
    this.activity = prep.activity;
    this._ended = false;
    this.pos = 0;
    this._resetVisual(0);
    return p;
  }

  get duration() {
    return this.piece ? this.piece.duration : 0;
  }

  // performance time (what you are hearing right now)
  get time() {
    if (!this.playing) return this.pos;
    const e = this.engine;
    return this.startPos + (e.now - this.startCtx - e.outputLatency);
  }

  play() {
    if (!this.piece || this.playing) return;
    const e = this.engine;
    if (e.ctx.state !== 'running') e.ctx.resume();
    this.startCtx = e.now + 0.12;
    this.startPos = this.pos;
    this.schedIdx = this._indexAt(this.pos);
    this.playing = true;
    this._ended = false;
    this._resumeHeld(this.pos);
    this._schedule();
  }

  // Notes already sounding at `pos` (held through a pause, or under a seek)
  // come back in where they were, instead of a hole until the next onsets.
  _resumeHeld(pos) {
    if (pos <= 0.05 || !this.ev) return;
    const ev = this.ev;
    const tracks = this.piece.tracks;
    for (let i = this._indexAt(pos - this.maxDur - 0.01); i < this.schedIdx; i++) {
      const k = i * 5;
      const on = ev[k + 1];
      const dur = ev[k + 2];
      if (on >= pos - 0.001 || on + dur < pos + 0.25) continue;
      const tr = tracks[ev[k]];
      try {
        this.engine.playNote({ section: tr.section, inst: tr.inst, midi: ev[k + 3], vel: ev[k + 4], when: this.startCtx, dur: on + dur - pos, gain: tr.gain ?? 1, layer: tr.layer, skip: pos - on });
      } catch { /* a note less */ }
    }
  }

  // Dynamics. Most scores here carry one velocity per part, so an orchestra
  // would play everything mezzo-forte. Shape it the way players do: thin
  // textures softer and full tutti louder (and brighter), a crescendo leading
  // into a big entry, a swell over each phrase, a broadening last chord for
  // the grand pieces and a dying-away ending for the calm ones. Parts that
  // already have their own dynamics (the piano scores) are left alone.
  _shape(p, ev, count) {
    const B = 0.5;
    const nb = Math.ceil(p.duration / B) + 8;
    const tex = new Float32Array(nb);
    for (const tr of p.tracks) {
      const n = tr.notes;
      const on = new Uint8Array(nb);
      for (let i = 0; i < n.length; i += 4) {
        const a = Math.floor(n[i] / B);
        const b = Math.min(nb - 1, Math.floor((n[i] + n[i + 1]) / B));
        for (let k = a; k <= b; k++) on[k] = 1;
      }
      const w = (tr.gain ?? 1) * (n.length ? n[3] / 127 : 0);
      for (let k = 0; k < nb; k++) tex[k] += on[k] * w;
    }
    // smoothed over ~3 s
    const sm = new Float32Array(nb);
    for (let k = 0; k < nb; k++) {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, k - 3); j <= Math.min(nb - 1, k + 3); j++) { s += tex[j]; c++; }
      sm[k] = s / c;
    }
    let lo = Infinity;
    let hi = 0;
    for (let k = 0; k < Math.floor(p.duration / B); k++) { if (sm[k] > 0.05) lo = Math.min(lo, sm[k]); hi = Math.max(hi, sm[k]); }
    const span = hi - lo;
    const x = new Float32Array(nb);
    for (let k = 0; k < nb; k++) x[k] = span > 0.15 * hi ? Math.min(1, Math.max(0, (sm[k] - lo) / span)) : 0.6;
    // a crescendo over the 3 s before a bigger texture arrives
    const lead = new Float32Array(nb);
    for (let k = 0; k < nb; k++) {
      let v = x[k];
      for (let j = 1; j <= 6 && k + j < nb; j++) v = Math.max(v, x[k] + (x[k + j] - x[k]) * (1 - j / 7));
      lead[k] = v;
    }
    // phrases: groups of bars of about 6-12 s
    const bars = (p.beats || []).filter((b) => b[1] === 0).map((b) => b[0]);
    const barLen = bars.length > 1 ? (bars[bars.length - 1] - bars[0]) / (bars.length - 1) : 2;
    const group = Math.min(8, Math.max(2, Math.round(8 / Math.max(0.3, barLen))));
    const phrases = [];
    for (let i = 0; i < bars.length; i += group) phrases.push(bars[i]);
    if (!phrases.length || phrases[0] > 0.5) phrases.unshift(0);
    phrases.push(p.duration + 0.01);
    const D = p.duration;
    const grand = p.finale || p.mood === 'grand';
    const calm = p.mood === 'calm';
    let ph = 0;
    const at = (t) => {
      while (ph < phrases.length - 2 && t >= phrases[ph + 1]) ph++;
      while (ph > 0 && t < phrases[ph]) ph--;
      const a = phrases[ph];
      const b = phrases[ph + 1];
      const u = Math.min(1, Math.max(0, (t - a) / Math.max(0.5, b - a)));
      const arc = Math.sin(Math.PI * Math.pow(u, 0.85));
      const k = Math.min(nb - 1, Math.max(0, Math.floor(t / B)));
      let m = (0.76 + 0.4 * lead[k]) * (0.93 + 0.13 * arc);
      if (grand) m *= 1 + 0.1 * Math.min(1, Math.max(0, (t - (D - 6)) / 5));
      if (calm) m *= 1 - 0.16 * Math.min(1, Math.max(0, (t - D * 0.86) / (D * 0.14)));
      return m;
    };
    const flat = p.tracks.map((tr) => {
      const n = tr.notes;
      let mn = 127;
      let mx = 0;
      for (let i = 3; i < n.length; i += 4) { mn = Math.min(mn, n[i]); mx = Math.max(mx, n[i]); }
      return mx - mn < 3;
    });
    for (let i = 0; i < count; i++) {
      const k = i * 5;
      if (!flat[ev[k]]) continue;
      ev[k + 4] = Math.min(122, Math.max(24, ev[k + 4] * at(ev[k + 1])));
    }
  }

  // Each piece is levelled from its score (as the engine will play it), so
  // the programme keeps one loudness: a piano rag is not louder than the
  // orchestra's finale. A little of the difference stays, by character.
  // (what use() then sets: { db, trim }, or null)
  _level(p, ev, count) {
    const e = this.engine;
    if (!e.noteEnergy || !e.setTrim) return null;
    const nb = Math.ceil(p.duration) + 2;
    const bins = new Float64Array(nb);
    const tracks = p.tracks;
    for (let i = 0; i < count; i++) {
      const k = i * 5;
      const tr = tracks[ev[k]];
      const en = e.noteEnergy(tr.section, tr.inst, ev[k + 3], ev[k + 4], ev[k + 2], tr.gain ?? 1, tr.layer);
      if (!en) continue;
      const a = Math.floor(ev[k + 1]);
      const b = Math.min(nb - 1, Math.floor(ev[k + 1] + Math.max(0.3, ev[k + 2])));
      for (let j = a; j <= b; j++) bins[j] += en / (b - a + 1);
    }
    const act = Array.from(bins).filter((v) => v > 0).sort((a, b) => b - a);
    if (!act.length) return null;
    const top = act.slice(0, Math.max(1, Math.ceil(act.length * 0.6)));
    const L = 10 * Math.log10(top.reduce((s, v) => s + v, 0) / top.length);
    // (a piano alone sits a little under the orchestra; an orchestral finale
    // is never turned down - it is the loudest moment of the evening)
    const solo = p.tracks.every((t) => t.inst === 'piano');
    let mood = (p.mood === 'grand' ? 1 : p.mood === 'calm' ? -1 : 0) + (p.finale ? 1 : 0) - (solo ? 1.5 : 0);
    let trim = 0.9 * (LEVEL_REF - L) + mood;
    if (p.finale && !solo) trim = Math.max(trim, 1);
    return { db: L, trim: Math.min(6, Math.max(-9, trim)) };
  }

  pause() {
    if (!this.playing) return;
    this.pos = Math.max(0, this.time);
    this.playing = false;
    this.engine.stopAll();
  }

  seek(t) {
    const was = this.playing;
    if (was) {
      this.playing = false;
      this.engine.stopAll(0.06);
    }
    this.pos = Math.min(Math.max(0, t), Math.max(0, this.duration - 0.05));
    this._ended = false; // (somewhere in the piece again: it can end again)
    this._resetVisual(this.pos);
    if (was) this.play();
  }

  // The end, now - the host's piece has ended (see follow.js): as if it had
  // played out here, stopped at its end, and onEnd. Once for a run of the
  // piece (until it is played, sought or loaded again): an end told twice
  // changes nothing. False if it had ended already.
  finish() {
    if (!this.piece || this._ended) return false;
    // (past its last notes, what still rings rings out, as at a natural end)
    const sounding = this.playing && this.time < this.duration;
    this._ended = true;
    this.playing = false;
    if (sounding) this.engine.stopAll();
    this.pos = this.duration;
    if (this.onEnd) this.onEnd();
    return true;
  }

  stop() {
    this.playing = false;
    this.engine.stopAll();
    this.pos = 0;
    this._resetVisual(0);
  }

  _indexAt(t) {
    let lo = 0;
    let hi = this.evCount;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.ev[m * 5 + 1] < t - 0.001) lo = m + 1; else hi = m;
    }
    return lo;
  }

  _schedule() {
    if (!this.playing || !this.piece) return;
    const e = this.engine;
    const hidden = document.hidden;
    const look = hidden ? 3.0 : 0.4;
    const horizon = this.startPos + (e.now - this.startCtx) + look;
    const ev = this.ev;
    const tracks = this.piece.tracks;
    while (this.schedIdx < this.evCount && ev[this.schedIdx * 5 + 1] < horizon) {
      const i = this.schedIdx * 5;
      const tr = tracks[ev[i]];
      const t = ev[i + 1];
      const when = this.startCtx + (t - this.startPos) + (SECTION_LAG[tr.section] || 0) + (Math.random() - 0.5) * 0.01;
      const vel = ev[i + 4] * (1 + (Math.random() - 0.5) * 0.07);
      this.schedIdx++;
      try {
        e.playNote({ section: tr.section, inst: tr.inst, midi: ev[i + 3], vel, when, dur: ev[i + 2], gain: tr.gain ?? 1, layer: tr.layer });
      } catch (err) {
        console.warn('note skipped', err);
      }
    }
    if (!this._ended && this.time > this.duration + 0.4) {
      this._ended = true;
      this.playing = false;
      this.pos = this.duration;
      if (this.onEnd) this.onEnd();
    }
  }

  // ---------------------------------------------------------------- visuals
  _resetVisual(t) {
    if (!this.piece) return;
    this.chairs = {};
    for (const [id, s] of Object.entries(SECTIONS)) {
      this.chairs[id] = s.chairs.map(() => ({ active: [], strokes: 0, lastOn: -99, lastDur: 0, lastMidi: 60, lastVel: 64, nextOn: 99999, playing: false, energy: 0 }));
    }
    // Rebuild only on load/seek. Frame updates can visit every chair without
    // allocating another list of sections, including when no notes sound.
    this._visualChairs = Object.values(this.chairs).flat();
    for (const tr of this.piece.tracks) {
      let lo = 0;
      let hi = tr.count;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (tr.notes[m * 4] < t) lo = m + 1; else hi = m;
      }
      tr.vi = lo;
    }
    this.lastVisualT = t;
  }

  // Advance visual state to time t. Returns list of note-on events since the
  // previous call (for particles), each {section, chair, midi, vel, dur}.
  updateVisual(t) {
    const out = [];
    if (!this.piece) return out;
    if (t < this.lastVisualT - 0.25) this._resetVisual(t);
    this.lastVisualT = t;
    for (const tr of this.piece.tracks) {
      const n = tr.notes;
      while (tr.vi < tr.count && n[tr.vi * 4] <= t) {
        const on = n[tr.vi * 4];
        const dur = n[tr.vi * 4 + 1];
        const midi = n[tr.vi * 4 + 2];
        const vel = n[tr.vi * 4 + 3];
        const late = t - on > 0.5;
        for (const c of tr.chairList) {
          const st = this.chairs[tr.section][c];
          if (!st) continue;
          if (on + dur > t) st.active.push({ on, off: on + dur, midi, vel, ti: tr.ti });
          if (on - st.lastOn > 0.035) st.strokes++;
          st.lastOn = on;
          st.lastDur = dur;
          st.lastMidi = midi;
          st.lastVel = vel;
          if (!late) out.push({ section: tr.section, chair: c, midi, vel, dur });
        }
        tr.vi++;
      }
      const nextOn = tr.vi < tr.count ? n[tr.vi * 4] : 99999;
      for (const c of tr.chairList) {
        const st = this.chairs[tr.section][c];
        if (st) st._next = Math.min(st._next ?? 99999, nextOn);
      }
    }
    for (const st of this._visualChairs) {
      // Compact in the original order so overlapping keys/harp strings and
      // particle events keep their timing, without filter/map arrays each frame.
      const active = st.active;
      let count = 0;
      let peak = -Infinity;
      for (let i = 0; i < active.length; i++) {
        const note = active[i];
        if (note.off > t) {
          active[count++] = note;
          peak = Math.max(peak, note.vel);
        }
      }
      active.length = count;
      st.playing = count > 0;
      st.nextOn = st._next ?? 99999;
      st._next = undefined;
      const target = st.playing ? peak / 127 : 0;
      st.energy += (target - st.energy) * 0.12;
    }
    return out;
  }

  // Activity per section in 1-second bins (sum of velocity x duration), used
  // by the camera director to follow the musical foreground.
  _activity(p) {
    const bins = Math.ceil(p.duration) + 1;
    const activity = {};
    for (const tr of p.tracks) {
      const arr = activity[tr.section] || (activity[tr.section] = new Float32Array(bins));
      const n = tr.notes;
      const w = (tr.gain ?? 1) * (tr.section === 'cb' ? 0.5 : 1);
      for (let i = 0; i < n.length; i += 4) {
        const a = Math.floor(n[i]);
        const b = Math.min(bins - 1, Math.floor(n[i] + n[i + 1]));
        // onsets count more than held notes: the eye follows movement
        arr[a] += (n[i + 3] / 127) * w * 1.5;
        for (let k = a; k <= b; k++) arr[k] += (n[i + 3] / 127) * w * 0.25;
      }
    }
    return activity;
  }

  // Which section carries the music in [t, t+span]? Melody-ish = high & active.
  dominantSection(t, span = 6) {
    let best = null;
    let bestV = 0;
    for (const [id, arr] of Object.entries(this.activity || {})) {
      let v = 0;
      for (let k = Math.max(0, Math.floor(t)); k < Math.min(arr.length, Math.floor(t + span)); k++) v += arr[k];
      if (id === 'vn1' || id === 'fl' || id === 'ob' || id === 'hn' || id === 'piano' || id === 'harp') v *= 1.25;
      if (v > bestV) { bestV = v; best = id; }
    }
    return best;
  }
}
