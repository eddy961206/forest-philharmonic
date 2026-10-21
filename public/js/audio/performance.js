// Transport: schedules a piece's notes into the audio engine ahead of time
// and exposes, per musician chair, what is sounding right now so the scene
// can animate in sync with what you hear.

import { SECTIONS } from '../layout.js';

// Small, consistent timing personalities per section (seconds): basses speak
// a touch late, the concertmaster leads. Real ensembles are never quantised.
const SECTION_LAG = { vn1: -0.004, vn2: 0.002, va: 0.004, vc: 0.006, cb: 0.012, fl: 0, ob: 0, cl: 0.002, bn: 0.006, hn: 0.01, tp: 0.004, timp: 0.003, harp: 0, piano: 0 };

export class Performance {
  constructor(engine) {
    this.engine = engine;
    this._req = 0;
    this.piece = null;
    this.playing = false;
    this.pos = 0; // seconds into the piece while paused
    this.onEnd = null;
    this.speed = 1;
    engine.onTick(() => this._schedule());
    document.addEventListener('visibilitychange', () => this._schedule());
  }

  async load(id) {
    const req = ++this._req;
    const p = await (await fetch(`music/${id}.json`)).json();
    if (req !== (this._req || 0)) return null; // a newer load superseded this one
    if (this.playing) this.stop();
    this.piece = p;
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
    this.ev = new Float32Array(count * 5);
    order.forEach((src, dst) => {
      for (let k = 0; k < 5; k++) this.ev[dst * 5 + k] = events[src * 5 + k];
    });
    this.evCount = count;
    this.playingSections = new Set(p.tracks.map((t) => t.section));
    this._buildActivity();
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
    this._schedule();
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
    this._resetVisual(this.pos);
    if (was) this.play();
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
  _buildActivity() {
    const p = this.piece;
    const bins = Math.ceil(p.duration) + 1;
    this.activity = {};
    for (const tr of p.tracks) {
      const arr = this.activity[tr.section] || (this.activity[tr.section] = new Float32Array(bins));
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
