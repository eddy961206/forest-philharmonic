// Spatial, sample-based orchestra engine on the Web Audio API.
//
// Signal flow per stage section:
//
//   voices ─► section in ─┬─► air absorption ─┬─► HRTF panner (the section) ──────┐
//                         │                   └─► desks: drifting delays ─► pans ───┤ music trim ─► dry bus ─┐
//                         └─► reverb send (pre-panner, diffuse field) ─► music trim ─► room convolver ────────┤
//                                                                                                             ▼
//                       warmth / de-harsh EQ ─► glue compressor ─► volume ─► brick-wall limiter ─► out
//
// The listener follows the camera every frame, so where you sit or walk
// changes direction, distance, direct-to-reverb ratio and high-frequency
// roll-off - the same cues that make seats sound different in a real hall.
// A section is more than one player: its "desks" are copies of the section
// sound through slowly drifting short delays (each its own small timing and
// pitch scatter) sounding from either side of it, so a string section or the
// choir has a width and the shimmer of many players.

import { SECTIONS, sectionCenter, sectionFacing, PODIUM } from '../layout.js';
import { renderApplause, renderMurmur, renderNoise } from './crowd.js';

const FAMILY = {
  violin: 'strings', viola: 'strings', cello: 'strings', contrabass: 'strings', strings: 'strings',
  flute: 'winds', oboe: 'winds', clarinet: 'winds', bassoon: 'winds',
  horn: 'horn', trumpet: 'trumpet', piano: 'piano', harp: 'harp', timpani: 'timpani',
  choir: 'choir', voice: 'choir', bells: 'bells',
};

// Per-family envelope and timbre. atk = [pianissimo, fortissimo] seconds.
const ENV = {
  strings: { atk: [0.18, 0.045], rel: 0.34, sustain: true, bright: [1500, 10000], level: 0.95 },
  winds: { atk: [0.07, 0.025], rel: 0.16, sustain: true, bright: [1700, 11000], level: 0.85 },
  horn: { atk: [0.12, 0.04], rel: 0.3, sustain: true, bright: [800, 6500], level: 0.9 },
  trumpet: { atk: [0.04, 0.015], rel: 0.16, sustain: true, bright: [1300, 11000], level: 0.8 },
  piano: { atk: [0.002, 0.002], rel: 0.45, sustain: false, bright: [1800, 16000], level: 1.0 },
  harp: { atk: [0.002, 0.002], rel: 1.6, sustain: false, bright: [2200, 15000], level: 1.0 },
  timpani: { atk: [0.002, 0.002], rel: 1.0, sustain: false, bright: [700, 7000], level: 1.0 },
  choir: { atk: [0.2, 0.07], rel: 0.38, sustain: true, bright: [1500, 8000], level: 0.9 },
  bells: { atk: [0.002, 0.002], rel: 2.5, sustain: false, bright: [3000, 14000], level: 0.8 },
};

// Desks per section (beside the section's own sound): [desktop, phone]
const DESKS = { vn1: [2, 1], vn2: [2, 0], va: [2, 0], vc: [2, 1], cb: [1, 0], choir: [2, 1], hn: [1, 0] };
const DESK_GAIN = 0.62;

// Rooms a venue can ask for by name (merged over its acoustics)
const ROOMS = {
  // the Sphere: a huge, well-damped modern arena with an immersive sound
  // system - a wide, enveloping field from everywhere around you, a shorter
  // and darker tail than the hall, late and soft first reflections
  arena: { rt60: 1.95, preDelay: 0.034, length: 3.4, reverb: 2.4, er: 'arena', dark: 0.72, erLevel: 0.3, spread: 4.2, level: 0.29 },
};

const LOOP_FROM = 0.55; // seconds into a sustained sample where the steady tone begins
const XFADE = 0.38;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.samples = {}; // inst -> { notes: [midi...], buf: Map(midi -> AudioBuffer), meta }
    this.sections = {};
    this.voices = new Set();
    this.tickHandlers = new Set();
    this.listenerMode = 'camera';
    this.volume = 0.8;
    this.failed = [];
  }

  // lite: phones - a lower sample rate, shorter samples, cheaper panning
  // acoustics: the room (a venue other than the hall passes its own)
  async init({ lite = false, acoustics = null } = {}) {
    this.lite = lite;
    this.ac = { rt60: 2.35, preDelay: 0.022, length: 3.8, refDistance: 3.2, rolloff: 1.15, airMin: 3800, airK: 0.055, reverb: 1, level: 1, model: 'inverse', er: 'hall', dark: 1, erLevel: 0.5, spread: 1, ...(acoustics || {}) };
    if (this.ac.room && ROOMS[this.ac.room]) Object.assign(this.ac, ROOMS[this.ac.room]);
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'playback', sampleRate: lite ? 24000 : 48000 });
    const ctx = this.ctx;

    // make-up gain in front of the dynamics so the glue/limiter see real levels
    this.makeup = ctx.createGain();
    this.makeup.gain.value = 12 * this.ac.level;
    // warmth (the weight of the basses and the hall's bass ratio) and a
    // gentle dip where massed strings and brass turn hard
    this.warm = new BiquadFilterNode(ctx, { type: 'lowshelf', frequency: 150, gain: 2.5 });
    this.soften = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 3400, Q: 1.2, gain: -1 });
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -16;
    this.glue.knee.value = 12;
    this.glue.ratio.value = 2.0;
    this.glue.attack.value = 0.03;
    this.glue.release.value = 0.35;

    this.master = ctx.createGain();
    this.master.gain.value = this._volGain(this.volume);

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;

    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1.0;

    // Room reverb: generated impulse response (no external files)
    this.reverb = ctx.createConvolver();
    this.reverb.normalize = true;
    this.reverb.buffer = await generateHallIR(ctx, this.ac);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 1;
    const revHP = ctx.createBiquadFilter();
    revHP.type = 'highpass';
    revHP.frequency.value = 110;
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.42 * this.ac.reverb;
    this.reverbIn.connect(revHP).connect(this.reverb).connect(this.reverbReturn);

    // the music's own level (each piece is levelled, see setTrim); applause
    // and the foyer bypass it
    this.musicDry = ctx.createGain();
    this.musicWet = ctx.createGain();
    this.musicDry.connect(this.dryBus);
    this.musicWet.connect(this.reverbIn);

    // Room transmission: inside the hall both paths pass untouched; out in
    // the foyer the music comes through the walls and open doors, so the
    // direct sound is muffled and quieter while the reverberant field
    // carries a little more of it (see setRoom).
    const occ = (src) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = this._hz(20000);
      lp.Q.value = 0.5;
      const g = ctx.createGain();
      src.connect(lp).connect(g).connect(this.makeup);
      return { lp, g };
    };
    this.occDry = occ(this.dryBus);
    this.occWet = occ(this.reverbReturn);
    this._open = 1;
    this.makeup.connect(this.warm).connect(this.soften).connect(this.glue).connect(this.master).connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.limiter.connect(ctx.destination);

    this._initListener();
    this._initSections();
    this._initTimer();
  }

  // ------------------------------------------------------------ samples
  async loadSamples(base, onProgress = () => {}) {
    const get = async (url) => {
      // a stalled request must never hang the loading screen
      const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
      const res = await fetch(url, signal ? { signal } : undefined);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return res;
    };
    const manifest = await (await get(`${base}/manifest.json`)).json();
    const jobs = [];
    for (const [inst, notes] of Object.entries(manifest)) {
      let midis = Object.keys(notes).map(Number).sort((a, b) => a - b);
      // phones: every other sample (neighbours are pitch-shifted a little
      // further), half the memory and half the loading
      if (this.lite && midis.length > 8) midis = midis.filter((_, i) => i % 2 === 0 || i === midis.length - 1);
      this.samples[inst] = { notes: midis, buf: new Map(), meta: notes };
      for (const m of midis) jobs.push([inst, m]);
    }
    const total = jobs.length;
    let done = 0;
    const worker = async () => {
      while (jobs.length) {
        const [inst, m] = jobs.shift();
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          try {
            const arr = await (await get(`${base}/${inst}/${m}.mp3`)).arrayBuffer();
            const buf = await this.ctx.decodeAudioData(arr);
            this.samples[inst].buf.set(m, this._compact(buf, this.samples[inst].meta[m]));
            ok = true;
          } catch (e) {
            if (attempt === 2) console.warn('sample failed', inst, m, e);
          }
        }
        if (!ok) this.failed.push(`${inst}/${m}`);
        done++;
        onProgress(done, total);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    // a sample that never came: its neighbours stand in for it
    for (const s of Object.values(this.samples)) s.notes = s.notes.filter((m) => s.buf.has(m));
    return { total, failed: this.failed.length };
  }

  // Keep samples small: every section is summed to mono before its panner
  // anyway, so store mono (half the memory, same sound). On phones also cut
  // the long decays after 4.5 s with a short fade.
  _compact(buf, meta) {
    const sr = buf.sampleRate;
    const keep = this.lite ? Math.min(buf.length, Math.floor(((meta?.s || 0) + 4.5) * sr)) : buf.length;
    const out = this.ctx.createBuffer(1, keep, sr);
    const o = out.getChannelData(0);
    const n = buf.numberOfChannels;
    for (let c = 0; c < n; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < keep; i++) o[i] += d[i] / n;
    }
    if (keep < buf.length) {
      const f = Math.floor(0.25 * sr);
      for (let i = 0; i < f; i++) o[keep - f + i] *= 1 - i / f;
    }
    return out;
  }

  // filter cutoffs stay under Nyquist (phones run at 24 kHz; above it
  // every update logs a warning)
  _hz(f) { return Math.min(f, this.ctx.sampleRate * 0.49); }

  _nearest(inst, midi) {
    const s = this.samples[inst];
    if (!s || !s.notes.length) return null;
    const arr = s.notes;
    let lo = 0;
    let hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < midi) lo = mid + 1; else hi = mid;
    }
    let best = arr[lo];
    if (lo > 0 && Math.abs(arr[lo - 1] - midi) <= Math.abs(best - midi)) best = arr[lo - 1];
    const buf = s.buf.get(best);
    if (!buf) return null;
    return { buf, root: best, meta: s.meta[best] };
  }

  // ------------------------------------------------------------ spatial
  _initListener() {
    const L = this.ctx.listener;
    this._lp = L.positionX
      ? { px: L.positionX, py: L.positionY, pz: L.positionZ, fx: L.forwardX, fy: L.forwardY, fz: L.forwardZ, ux: L.upX, uy: L.upY, uz: L.upZ }
      : null;
  }

  // pos/forward/up are plain {x,y,z}
  setListener(pos, fwd, up) {
    const t = this.ctx.currentTime;
    const k = 0.04;
    if (this._lp) {
      const p = this._lp;
      p.px.setTargetAtTime(pos.x, t, k); p.py.setTargetAtTime(pos.y, t, k); p.pz.setTargetAtTime(pos.z, t, k);
      p.fx.setTargetAtTime(fwd.x, t, k); p.fy.setTargetAtTime(fwd.y, t, k); p.fz.setTargetAtTime(fwd.z, t, k);
      p.ux.setTargetAtTime(up.x, t, k); p.uy.setTargetAtTime(up.y, t, k); p.uz.setTargetAtTime(up.z, t, k);
    } else {
      this.ctx.listener.setPosition(pos.x, pos.y, pos.z);
      this.ctx.listener.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
    // Air absorption: high frequencies fall off with distance (~ ISO 9613 trend)
    for (const s of Object.values(this.sections)) {
      const dx = s.pos.x - pos.x;
      const dy = s.pos.y - pos.y;
      const dz = s.pos.z - pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      s.distance = d;
      const cutoff = Math.max(this.ac.airMin, 21000 / (1 + d * this.ac.airK));
      s.air.frequency.setTargetAtTime(this._hz(cutoff), t, 0.08);
      if (s.desks?.length) {
        // the listener's right: forward x up
        const rx = fwd.y * up.z - fwd.z * up.y;
        const ry = fwd.z * up.x - fwd.x * up.z;
        const rz = fwd.x * up.y - fwd.y * up.x;
        const rl = Math.hypot(rx, ry, rz) || 1;
        for (const dk of s.desks) {
          const vx = dk.pos.x - pos.x;
          const vy = dk.pos.y - pos.y;
          const vz = dk.pos.z - pos.z;
          const dd = Math.hypot(vx, vy, vz) || 1;
          const side = (vx * rx + vy * ry + vz * rz) / (rl * dd);
          dk.pan.pan.setTargetAtTime(clamp(side * 1.1, -1, 1), t, 0.06);
          dk.g.gain.setTargetAtTime(dk.level * this._distGain(dd), t, 0.06);
        }
      }
    }
  }

  // the panners' distance law, for the desks (see _panner)
  _distGain(d) {
    const a = this.ac;
    const ref = a.refDistance;
    if (a.model === 'linear') return 1 - a.rolloff * (clamp(d, ref, 120) - ref) / (120 - ref);
    if (a.model === 'exponential') return Math.pow(Math.max(d, ref) / ref, -a.rolloff);
    return ref / (ref + a.rolloff * (Math.max(d, ref) - ref));
  }

  _panner(pos, face) {
    return new PannerNode(this.ctx, {
      panningModel: this.lite ? 'equalpower' : 'HRTF',
      distanceModel: this.ac.model,
      refDistance: this.ac.refDistance,
      maxDistance: 120,
      rolloffFactor: this.ac.rolloff,
      coneInnerAngle: 210,
      coneOuterAngle: 340,
      coneOuterGain: 0.45,
      positionX: pos.x, positionY: pos.y, positionZ: pos.z,
      orientationX: face.x, orientationY: 0, orientationZ: face.z,
    });
  }

  _initSections() {
    const ctx = this.ctx;
    const spread = this.ac.spread || 1;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const id of Object.keys(SECTIONS)) {
      const c = sectionCenter(id);
      // (a venue with a sound system of its own spreads the stage wider)
      const pos = { x: c.x * spread, y: c.y, z: c.z };
      const face = sectionFacing(id);
      const input = ctx.createGain();
      // Soundfont samples carry General MIDI panning baked into stereo; a
      // section is a point source in the hall, so sum to mono before the HRTF.
      const focus = new GainNode(ctx, { channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
      const air = ctx.createBiquadFilter();
      air.type = 'lowpass';
      air.frequency.value = this._hz(16000);
      air.Q.value = 0.5;
      const panner = this._panner(pos, face);
      const send = ctx.createGain();
      send.gain.value = 0.55;
      input.connect(focus);
      focus.connect(air).connect(panner).connect(this.musicDry);
      focus.connect(send).connect(this.musicWet);
      // the desks: the rest of the section either side of (and behind) it
      const desks = [];
      const nDesk = (DESKS[id] || [0, 0])[this.lite ? 1 : 0];
      if (nDesk) {
        let dx = c.x - PODIUM.x;
        let dz = c.z - PODIUM.z;
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        const w = id === 'choir' ? 3.6 : id === 'cb' || id === 'hn' ? 1.1 : 1.5;
        for (let k = 0; k < nDesk; k++) {
          const side = nDesk === 1 ? (id === 'hn' ? 1 : -Math.sign(c.x || 1)) : k === 0 ? -1 : 1;
          const back = 0.5 + 0.5 * k;
          const p = { x: (c.x + -dz * side * w + dx * back) * spread, y: c.y + 0.1 * k, z: c.z + dx * side * w + dz * back };
          // each desk a little late and drifting in pitch (a few cents)
          const delay = new DelayNode(ctx, { maxDelayTime: 0.08, delayTime: 0.012 + 0.009 * k + rnd() * 0.005 });
          const lfo = new OscillatorNode(ctx, { frequency: 0.19 + 0.16 * k + rnd() * 0.1 });
          const depth = new GainNode(ctx, { gain: 0.0011 + rnd() * 0.0006 });
          // (k-rate: one drift step per render quantum is plenty, and cheaper)
          try { delay.delayTime.automationRate = 'k-rate'; } catch { /* a-rate then */ }
          lfo.connect(depth).connect(delay.delayTime);
          lfo.start();
          const level = id === 'choir' ? 0.7 : DESK_GAIN;
          const g = new GainNode(ctx, { gain: level * this._distGain(10) });
          // (a plain stereo pan and a distance gain, set from the listener each
          // frame: a 3D panner whose listener moves computes its angles for
          // every sample - a desk does not need that)
          const pn = new StereoPannerNode(ctx, { pan: 0 });
          air.connect(delay).connect(g).connect(pn).connect(this.musicDry);
          delay.connect(new GainNode(ctx, { gain: level })).connect(send);
          desks.push({ delay, lfo, g, pan: pn, pos: p, level });
        }
      }
      this.sections[id] = { id, input, focus, air, panner, send, pos, distance: 10, desks };
    }
  }

  // A player out in the foyer (practising in the interval): a source of its
  // own outside the hall's walls - muffled while you are in the hall, clear
  // when you are out there with them (the opposite of the stage, see setRoom).
  addSpot(id, pos) {
    if (this.sections[id]) { this.moveSpot(id, pos); return; }
    const ctx = this.ctx;
    const input = ctx.createGain();
    const focus = new GainNode(ctx, { channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = this._hz(16000);
    const panner = new PannerNode(ctx, {
      panningModel: this.lite ? 'equalpower' : 'HRTF', distanceModel: 'inverse', refDistance: 1.6, maxDistance: 60, rolloffFactor: 1.3,
      positionX: pos.x, positionY: pos.y, positionZ: pos.z,
    });
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this._hz(20000);
    const g = ctx.createGain();
    const send = ctx.createGain();
    send.gain.value = 0.12; // a smaller, drier room than the hall
    input.connect(focus);
    focus.connect(air).connect(panner).connect(lp).connect(g).connect(this.makeup);
    focus.connect(send).connect(this.reverbIn);
    this.sections[id] = { id, input, focus, air, panner, send, pos: { ...pos }, distance: 10, spot: { lp, g } };
    this._spotRoom(this.sections[id], this._open, 0);
  }

  moveSpot(id, pos) {
    const s = this.sections[id];
    if (!s) return;
    s.pos = { ...pos };
    const t = this.ctx.currentTime;
    s.panner.positionX.setValueAtTime(pos.x, t);
    s.panner.positionY.setValueAtTime(pos.y, t);
    s.panner.positionZ.setValueAtTime(pos.z, t);
  }

  _spotRoom(s, open, k = 0.3) {
    const t = this.ctx.currentTime;
    const out = 1 - open; // 1 out in the foyer with them
    const cutoff = 650 * Math.pow(20000 / 650, Math.pow(out, 0.8));
    s.spot.lp.frequency.setTargetAtTime(this._hz(cutoff), t, k || 0.001);
    s.spot.g.gain.setTargetAtTime(0.2 + 0.8 * out, t, k || 0.001);
  }

  // Bring one section forward (others ducked) - for "listen to this part"
  setFocus(id) {
    const t = this.ctx.currentTime;
    for (const s of Object.values(this.sections)) {
      const g = !id || s.id === id ? 1 : 0.22;
      s.focus.gain.setTargetAtTime(g, t, 0.25);
    }
    this.focusId = id || null;
  }

  // open: 1 inside the hall, falling toward 0 out in the foyer away from
  // the doors. Glides so walking through a door never clicks.
  setRoom(open) {
    if (!this.occDry) return; // still starting up
    open = Math.min(1, Math.max(0, open));
    if (Math.abs(open - this._open) < 0.003) return;
    this._open = open;
    const t = this.ctx.currentTime;
    const cutoff = 650 * Math.pow(20000 / 650, Math.pow(open, 0.8));
    this.occDry.lp.frequency.setTargetAtTime(this._hz(cutoff), t, 0.3);
    this.occWet.lp.frequency.setTargetAtTime(this._hz(cutoff * 1.6), t, 0.3);
    this.occDry.g.gain.setTargetAtTime(0.17 + 0.83 * Math.pow(open, 1.3), t, 0.3);
    this.occWet.g.gain.setTargetAtTime(0.48 + 0.52 * open, t, 0.3);
    for (const sec of Object.values(this.sections)) if (sec.spot) this._spotRoom(sec, open);
  }

  // the slider is perceptual: gain = v² (scaled so the default 0.8 is unchanged)
  _volGain(v) {
    v = clamp(+v || 0, 0, 1);
    return v * v * 1.25;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(this._volGain(v), this.ctx.currentTime, 0.05);
  }

  setReverb(amount) {
    // amount 0..1 -> return gain
    this.reverbReturn.gain.setTargetAtTime((0.1 + amount * 0.75) * this.ac.reverb, this.ctx.currentTime, 0.1);
  }

  // The music's level in dB (each piece is levelled when it loads, so a
  // piano rag is not louder than the orchestra); glides between pieces.
  setTrim(db, glide = 0.6) {
    if (!this.musicDry) return;
    const g = Math.pow(10, clamp(db, -12, 9) / 20);
    const t = this.ctx.currentTime;
    for (const n of [this.musicDry, this.musicWet]) {
      n.gain.cancelScheduledValues(t);
      n.gain.setTargetAtTime(g, t, glide / 3);
    }
    this.trimDb = db;
  }

  // Roughly how much energy a note puts out (relative), for levelling a
  // piece from its score before it plays: amplitude² x how long it sounds.
  noteEnergy(section, inst, midi, vel, dur, gain = 1, layer = null) {
    const main = this._nearest(inst, midi);
    if (!main) return 0;
    const fam = ENV[FAMILY[inst]] || ENV.winds;
    const v = clamp(vel / 127, 0.05, 1);
    const amp = fam.level * gain * (0.12 + 0.88 * Math.pow(v, 1.7)) * Math.min(4, main.meta.g);
    let e = amp * amp;
    if (layer && fam.sustain) e *= 1.3;
    const nDesk = (DESKS[section] || [0, 0])[this.lite ? 1 : 0];
    e *= 1 + nDesk * DESK_GAIN * DESK_GAIN;
    // (the brightness filter: soft notes lose part of their energy)
    e *= 0.55 + 0.45 * v;
    // a held tone carries less energy than its peak level suggests (fitted to
    // the measured loudness of the programme: strings vs piano, -10 dB)
    if (fam.sustain) e *= 0.093;
    const t = fam.sustain ? dur + fam.rel * 0.5 : Math.min(dur + 0.3, 1.4) * 0.5;
    return e * t;
  }

  // ------------------------------------------------------------ timer
  _initTimer() {
    // A worker clock keeps scheduling alive when the tab is in the background
    // (main-thread timers get throttled to once a second or worse).
    const src = 'let id=null;onmessage=e=>{clearInterval(id);id=setInterval(()=>postMessage(0),e.data)}';
    try {
      this.timer = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.timer.onmessage = () => this._tick();
      this.timer.postMessage(25);
    } catch {
      setInterval(() => this._tick(), 25);
    }
  }

  _tick() {
    for (const fn of this.tickHandlers) fn();
  }

  onTick(fn) {
    this.tickHandlers.add(fn);
    return () => this.tickHandlers.delete(fn);
  }

  get now() {
    return this.ctx.currentTime;
  }

  get outputLatency() {
    const c = this.ctx;
    return (c.outputLatency || 0) + (c.baseLatency || 0);
  }

  // ------------------------------------------------------------ voices
  // skip: seconds of the note already gone (a note held through a pause or
  // a seek comes back in where it was, with a short swell instead of a new
  // attack)
  playNote({ section, inst, midi, vel, when, dur, gain = 1, layer = null, skip = 0 }) {
    const ctx = this.ctx;
    const sec = this.sections[section];
    const main = this._nearest(inst, midi);
    if (!sec || !main) return;
    const fam = ENV[FAMILY[inst]] || ENV.winds;
    if (skip > 0 && !fam.sustain) return; // a struck note is not struck again
    const v = Math.min(1, Math.max(0.05, vel / 127));
    const amp = fam.level * gain * 0.2 * (0.12 + 0.88 * Math.pow(v, 1.7)) * Math.min(4, main.meta.g);
    const atk = skip > 0 ? 0.08 : fam.atk[0] + (fam.atk[1] - fam.atk[0]) * v;
    when = Math.max(when, ctx.currentTime + 0.005);

    // Timbre: louder = brighter (the main thing that makes dynamics sound real)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const pitchLift = Math.pow(2, (midi - 60) / 36);
    filter.frequency.value = this._hz((fam.bright[0] + (fam.bright[1] - fam.bright[0]) * v * v) * pitchLift);
    filter.Q.value = 0.4;
    const env = ctx.createGain();
    env.gain.value = 0;
    filter.connect(env).connect(sec.input);

    const voice = { env, srcs: [], end: 0 };
    const rate = Math.pow(2, (midi - main.root) / 12);

    if (fam.sustain) {
      const off = when + Math.max(dur, atk + 0.02);
      // the sources run until the release has died away (no hard stop)
      const total = off - when + fam.rel * 2.4 + 0.05;
      this._sustained(voice, main, rate, when, total, filter, 1, skip);
      if (layer) {
        const lay = this._nearest(layer, midi);
        if (lay) {
          const lg = ctx.createGain();
          lg.gain.value = 0.55 * Math.min(4, lay.meta.g) / Math.min(4, main.meta.g);
          lg.connect(filter);
          this._sustained(voice, lay, Math.pow(2, (midi - lay.root) / 12), when + 0.012, total - 0.012, lg, 1, skip);
        }
      }
      // Envelope with a little messa di voce on long notes
      const g = env.gain;
      g.setValueAtTime(0, when);
      g.linearRampToValueAtTime(amp, when + atk);
      if (dur > 1.2 && !skip) {
        g.linearRampToValueAtTime(amp * 1.1, when + dur * 0.45);
        g.linearRampToValueAtTime(amp * 0.92, when + dur);
      } else {
        g.setValueAtTime(amp, Math.max(when + atk, when + dur - 0.01));
      }
      g.setTargetAtTime(0, off, fam.rel / 3);
      voice.end = when + total;
    } else {
      // Plucked / struck: play the natural decay; dampers cut at note end
      const src = ctx.createBufferSource();
      src.buffer = main.buf;
      src.playbackRate.value = rate;
      src.connect(filter);
      const avail = (main.buf.duration - main.meta.s) / rate;
      const g = env.gain;
      g.setValueAtTime(0, when);
      g.linearRampToValueAtTime(amp, when + atk);
      let rel = fam.rel;
      if (inst === 'piano') rel = 0.25 + Math.max(0, (60 - midi) / 60) * 0.5;
      const ring = inst === 'harp' || inst === 'timpani' ? Math.max(dur, 0.6) : dur;
      const off = when + Math.min(ring, avail);
      g.setTargetAtTime(0, off, rel / 3);
      src.start(when, main.meta.s);
      voice.end = Math.min(when + avail, off + rel * 2.5);
      src.stop(voice.end + 0.05);
      voice.srcs.push(src);
    }
    this.voices.add(voice);
    const last = voice.srcs[voice.srcs.length - 1];
    if (last) last.onended = () => {
      this.voices.delete(voice);
      try { env.disconnect(); } catch { /* already gone */ }
    };
  }

  // Plays a sustained sample for `total` seconds (release included); when the
  // note is longer than the recording, chains further segments from the
  // steady part of the sample with equal-power crossfades (no loop clicks).
  _sustained(voice, smp, rate, when, total, dest, level, skip = 0) {
    const ctx = this.ctx;
    const dur = smp.buf.duration;
    let startOff = smp.meta.s + skip * rate;
    if (skip > 0 && startOff > dur - 1.2) startOff = LOOP_FROM + Math.random() * 0.25;
    const firstLen = (dur - startOff) / rate - 0.05;
    const mk = (offset, t0, len, fadeIn, fadeOut) => {
      const src = ctx.createBufferSource();
      src.buffer = smp.buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      src.connect(g).connect(dest);
      const p = g.gain;
      if (fadeIn) {
        p.value = 0;
        p.setValueCurveAtTime(EQ_IN, t0, XFADE);
      } else {
        p.setValueAtTime(level, t0);
      }
      if (fadeOut) {
        p.setValueCurveAtTime(EQ_OUT, t0 + len - XFADE, XFADE);
      }
      src.start(t0, offset);
      src.stop(t0 + len + 0.02);
      voice.srcs.push(src);
    };
    if (total <= firstLen || firstLen < XFADE * 2.2) {
      mk(startOff, when, Math.min(total, Math.max(0.05, firstLen)), false, false);
      if (total <= firstLen) return;
    }
    let t = when;
    let len = firstLen;
    let covered = len;
    if (firstLen >= XFADE * 2.2) mk(startOff, t, len, false, true);
    let guard = 0;
    while (covered < total && guard++ < 64) {
      t = when + covered - XFADE;
      const remain = total - covered + XFADE;
      // pick the segment start first, then measure how much sample is left
      const off = LOOP_FROM + Math.random() * 0.25;
      const segLen = (dur - off) / rate - 0.06;
      len = Math.min(segLen, remain);
      const more = len < remain - 1e-3;
      // a fade-out curve may not overlap the fade-in on a very short segment
      mk(off, t, len, true, more && len > XFADE * 2.2);
      covered += len - XFADE;
    }
  }

  stopAll(fade = 0.12) {
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      try {
        if (v.env.gain.cancelAndHoldAtTime) v.env.gain.cancelAndHoldAtTime(t); else v.env.gain.cancelScheduledValues(t);
        v.env.gain.setTargetAtTime(0, t, fade / 3);
        for (const s of v.srcs) s.stop(t + fade * 2);
      } catch { /* source may not have started yet */ }
    }
    this.voices.clear();
  }

  // The oboe gives the A, the strings tune to it
  tuning(when = this.now + 0.1) {
    this.playNote({ section: 'ob', inst: 'oboe', midi: 69, vel: 80, when, dur: 2.6, gain: 0.9 });
    const strings = [['vn1', 'violin', 69], ['vn2', 'violin', 69], ['va', 'viola', 57], ['vc', 'cello', 45], ['cb', 'contrabass', 33], ['vn1', 'violin', 81], ['vc', 'cello', 57]];
    strings.forEach(([sec, inst, m], i) => {
      const t0 = when + 1.4 + i * 0.35 + Math.random() * 0.3;
      this.playNote({ section: sec, inst, midi: m, vel: 60 + Math.random() * 20, when: t0, dur: 1.6 + Math.random() * 1.4, gain: 0.5 });
      if (i % 2 === 0) this.playNote({ section: sec, inst, midi: m + 7, vel: 55, when: t0 + 0.9, dur: 1.2, gain: 0.4 });
    });
    this.playNote({ section: 'hn', inst: 'horn', midi: 57, vel: 60, when: when + 3.2, dur: 1.5, gain: 0.45 });
    this.playNote({ section: 'fl', inst: 'flute', midi: 81, vel: 60, when: when + 3.6, dur: 1.2, gain: 0.45 });
    return 6.5;
  }

  // A soft chime (the foyer bells, the lifts): through the volume, mute and
  // limiter like everything else, with a little of the room around it.
  // notes: [[hz, at (s from now)], ...]
  chime(notes, level = 0.05, ring = 1.4) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + 0.03;
    const out = ctx.createGain();
    out.gain.value = level;
    out.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.25 / (12 * this.ac.level);
    out.connect(send).connect(this.reverbIn);
    let end = t0;
    for (const [f, at] of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const s = t0 + at;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(1, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + ring);
      o.connect(g).connect(out);
      o.start(s);
      o.stop(s + ring + 0.1);
      end = Math.max(end, s + ring + 0.1);
    }
    setTimeout(() => { try { out.disconnect(); send.disconnect(); } catch { /* gone */ } }, (end - ctx.currentTime + 4) * 1000);
  }

  // ------------------------------------------------------------ applause
  _prepareCrowd() {
    if (this._crowd) return;
    const ctx = this.ctx;
    const sr = this.lite ? 16000 : 24000;
    const wash = this.lite ? 200 : 320;
    this._crowd = {
      welcome: renderApplause(ctx, { seconds: 5.5, people: wash, seed: 11, sr }),
      normal: [renderApplause(ctx, { seconds: 10, people: wash, seed: 21, sr }), renderApplause(ctx, { seconds: 10, people: wash, seed: 22, sr })],
      finale: renderApplause(ctx, { seconds: 15, people: wash, seed: 31, rhythmic: true, sr }),
    };
  }

  // Pre-render the crowd once (a few hundred milliseconds at load)
  prepareApplause() {
    this._prepareCrowd();
    this._prepareMurmur();
  }

  // intensity < 0.8: a short welcome; >= 1.2: the finale with rhythmic
  // clapping; otherwise the ordinary applause after a piece.
  // people: how many are in the house (the wash grows with the crowd, the
  // neighbours you can pick out depend on how full it is around you)
  applause(when, intensity = 1, people = null) {
    this._prepareCrowd();
    const ctx = this.ctx;
    const C = this._crowd;
    const pair = intensity < 0.8 ? C.welcome : intensity >= 1.2 ? C.finale : C.normal[(this._appN = (this._appN || 0) + 1) % 2];
    const n = people == null ? 700 : Math.max(0, people);
    const washG = clamp(Math.pow(n / 900, 0.35), n > 0 ? 0.12 : 0, 1.2);
    const closeG = clamp(0.3 + 0.7 * Math.min(1, n / 350), 0.3, 1);
    const rate = 0.98 + Math.random() * 0.04;
    // the whole crowd: one gain (stopApplause fades it)
    const g = ctx.createGain();
    g.gain.value = 0.085 * Math.min(1.2, intensity) / this.ac.level;
    const dry = ctx.createGain();
    dry.gain.value = 0.62;
    g.connect(dry).connect(this.dryBus);
    // (the crowd's share of the room is the same in every venue: a venue
    // with a stronger reverb return gets a smaller send)
    const wet = ctx.createGain();
    wet.gain.value = 0.9 / Math.max(0.5, this.ac.reverb);
    g.connect(wet).connect(this.reverbIn);
    const srcs = [];
    const layer = (buf, gain, hp, lp) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const h = new BiquadFilterNode(ctx, { type: 'highpass', frequency: hp });
      const l = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: this._hz(lp), Q: 0.5 });
      const lg = new GainNode(ctx, { gain });
      src.connect(h).connect(l).connect(lg).connect(g);
      src.start(when);
      srcs.push(src);
    };
    layer(pair.close, closeG, 170, 8500);
    if (washG > 0) layer(pair.wash, washG, 140, 5200);
    const src = { stop: (t) => { for (const s of srcs) try { s.stop(t); } catch { /* not started */ } } };
    this._lastApplause = { src, g };
    return srcs[0];
  }

  // ------------------------------------------------------------ the house
  // The audience talking before the show, in the walk-on and tuning gaps and
  // in the interval: a looping murmur and the odd cough, creak or rustle.
  // level 0..1 (main.js sets it from the phase: hushed when the conductor
  // comes on, silent while the music plays); people: how many are in.
  // Through the master (volume, mute) and the room's reverb; it bypasses the
  // hall's walls (the foyer talks too).
  _prepareMurmur() {
    if (this._house) return;
    const ctx = this.ctx;
    const sr = 16000;
    const bed = renderMurmur(ctx, { seconds: 9, talkers: this.lite ? 18 : 30, seed: 5, sr });
    const shots = [];
    ['cough', 'cough', 'cough', 'creak', 'creak', 'rustle', 'rustle', 'rustle'].forEach((k, i) => shots.push({ kind: k, buf: renderNoise(ctx, k, { seed: 40 + i, sr }) }));
    const out = ctx.createGain();
    out.gain.value = 0;
    const dry = new GainNode(ctx, { gain: 0.55 });
    const wet = new GainNode(ctx, { gain: 0.9 / Math.max(0.5, this.ac.reverb) });
    const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 140 });
    out.connect(hp);
    hp.connect(dry).connect(this.makeup);
    hp.connect(wet).connect(this.reverbIn);
    const src = ctx.createBufferSource();
    src.buffer = bed;
    src.loop = true;
    const bedG = new GainNode(ctx, { gain: 1 });
    src.connect(bedG).connect(out);
    src.start(ctx.currentTime + 0.05, Math.random() * 8);
    this._house = { out, shots, level: 0, people: 0, target: -1 };
    this.onTick(() => this._houseTick());
    // a background tab draws no frames (nobody calls setMurmur): fade it here
    document.addEventListener('visibilitychange', () => {
      const H = this._house;
      if (document.hidden) H.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      H.target = -1; // re-applied on the next frame
    });
  }

  setMurmur(level, people = 0) {
    if (!this.ctx) return;
    if (typeof document !== 'undefined' && document.hidden) level = 0;
    const n = Math.max(0, people || 0);
    const k = n > 0 ? clamp(Math.pow(n / 900, 0.4), 0.12, 1) : 0;
    const target = clamp(level, 0, 1) * k;
    if (!this._house) {
      if (target <= 0) return;
      this._prepareMurmur();
    }
    const H = this._house;
    H.level = clamp(level, 0, 1);
    H.people = n;
    if (Math.abs(target - H.target) < 0.01) return;
    const t = this.ctx.currentTime;
    const g = target * 0.005 / this.ac.level;
    // hushes quickly (the lights go down), comes back slowly
    H.out.gain.setTargetAtTime(g, t, target < H.target ? 0.45 : 1.6);
    H.target = target;
  }

  _houseTick() {
    const H = this._house;
    if (!H || H.target <= 0.02 || (typeof document !== 'undefined' && document.hidden)) return;
    // about one small noise a second in a full house, fewer in a small one
    const rate = 1.1 * H.level * Math.min(1, H.people / 700);
    if (Math.random() > rate * 0.025) return;
    const ctx = this.ctx;
    const sh = H.shots[Math.floor(Math.random() * H.shots.length)];
    const src = ctx.createBufferSource();
    src.buffer = sh.buf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const near = Math.random() < 0.25;
    const g = new GainNode(ctx, { gain: (sh.kind === 'cough' ? 1.6 : sh.kind === 'creak' ? 0.7 : 0.9) * (near ? 1 : 0.25 + Math.random() * 0.35) });
    const pan = new StereoPannerNode(ctx, { pan: Math.random() * 2 - 1 });
    src.connect(g).connect(pan).connect(H.out);
    src.onended = () => { try { pan.disconnect(); } catch { /* gone */ } };
    src.start(ctx.currentTime + 0.02 + Math.random() * 0.02);
  }

  stopApplause(fade = 0.6) {
    const a = this._lastApplause;
    if (!a) return;
    const t = this.ctx.currentTime;
    a.g.gain.setTargetAtTime(0, t, fade / 3);
    try { a.src.stop(t + fade * 2); } catch { /* not started */ }
    this._lastApplause = null;
  }
}

const EQ_IN = new Float32Array(32).map((_, i) => Math.sin((i / 31) * Math.PI / 2));
const EQ_OUT = new Float32Array(32).map((_, i) => Math.cos((i / 31) * Math.PI / 2));

// --------------------------------------------------------------- room IR
// A room impulse response built from: early reflections (in the hall the
// strong lateral ones from the side walls, the ceiling and the stage shell;
// in the arena later, softer, scattered ones from far surfaces) followed by
// a diffuse, exponentially decaying tail - independent in each ear - whose
// high end dies faster than the low end (dark: < 1 for a darker room).
export async function generateHallIR(ctx, { rt60 = 2.3, preDelay = 0.02, length = 3.5, er = 'hall', dark = 1, erLevel = 0.5 } = {}) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * length);
  const off = new OfflineAudioContext(2, n, sr);
  const raw = off.createBuffer(2, n, sr);
  const pd = Math.floor(preDelay * sr);
  const L = raw.getChannelData(0);
  const R = raw.getChannelData(1);
  // diffuse tail with a soft build-up
  const k = 6.907755 / rt60;
  const build = er === 'arena' ? 0.11 : 0.06;
  let eTail = 0;
  for (const d of [L, R]) {
    for (let i = pd; i < n; i++) {
      const t = (i - pd) / sr;
      const v = (Math.random() * 2 - 1) * Math.exp(-k * t) * Math.min(1, t / build) * 0.42;
      d[i] = v;
      eTail += v * v;
    }
  }
  // early reflections: short bursts of scattered noise, each reaching the
  // two ears at slightly different times and levels
  const ers = [];
  if (er === 'arena') {
    for (let i = 0; i < 30; i++) {
      const t = preDelay + 0.014 + Math.pow(Math.random(), 0.85) * 0.14;
      const a = (0.4 + Math.random() * 0.6) * Math.exp(-(t - preDelay) / 0.1);
      ers.push([t, a, Math.random() * 2 - 1, 0.004]);
    }
  } else {
    ers.push([preDelay + 0.009, 0.8, 0, 0.0015]); // ceiling (both ears alike)
    const lat = [0.016, 0.022, 0.029, 0.035, 0.043, 0.051, 0.06, 0.07];
    lat.forEach((t, i) => ers.push([preDelay + t + (Math.random() - 0.5) * 0.003, 1.0 * Math.exp(-i / 6), i % 2 ? 0.8 : -0.8, 0.0015]));
    ers.push([preDelay + 0.026, 0.6, 0.1, 0.002]); // the stage shell
    for (let i = 0; i < 26; i++) {
      const t = preDelay + 0.02 + Math.pow(i / 26, 1.25) * 0.085 + (Math.random() - 0.5) * 0.004;
      ers.push([t, (0.35 + Math.random() * 0.35) * Math.exp(-i / 11), Math.random() * 1.6 - 0.8, 0.002]);
    }
  }
  const eL = new Float32Array(n);
  const eR = new Float32Array(n);
  let eEr = 0;
  for (const [t, a, pan, tau] of ers) {
    const i0 = Math.floor(t * sr);
    const itd = Math.round(Math.abs(pan) * 0.0006 * sr);
    const gl = a * Math.sqrt(0.5 * (1 - pan * 0.7));
    const gr = a * Math.sqrt(0.5 * (1 + pan * 0.7));
    const iL = i0 + (pan > 0 ? itd : 0);
    const iR = i0 + (pan < 0 ? itd : 0);
    const len = Math.floor(tau * 5 * sr);
    for (let j = 0; j < len; j++) {
      const env = Math.exp(-j / (tau * sr));
      const s = (Math.random() * 2 - 1) * env;
      const s2 = 0.6 * s + 0.4 * (Math.random() * 2 - 1) * env;
      if (iL + j < n) eL[iL + j] += s * gl;
      if (iR + j < n) eR[iR + j] += s2 * gr;
    }
  }
  for (let i = 0; i < n; i++) eEr += eL[i] * eL[i] + eR[i] * eR[i];
  const sc = Math.sqrt((erLevel * eTail) / Math.max(1e-9, eEr));
  for (let i = 0; i < n; i++) { L[i] += eL[i] * sc; R[i] += eR[i] * sc; }
  const src = off.createBufferSource();
  src.buffer = raw;
  const lp = off.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.3;
  lp.frequency.setValueAtTime(Math.min(14000 * dark, off.sampleRate * 0.49), 0);
  lp.frequency.exponentialRampToValueAtTime(Math.min(5200 * dark, off.sampleRate * 0.49), 0.25);
  lp.frequency.exponentialRampToValueAtTime(1400 * dark, length * 0.75);
  lp.frequency.exponentialRampToValueAtTime(700 * dark, length);
  const ls = off.createBiquadFilter();
  ls.type = 'lowshelf';
  ls.frequency.value = 220;
  ls.gain.value = 2.5; // warm bass ratio, typical of good halls
  src.connect(lp).connect(ls).connect(off.destination);
  src.start();
  return off.startRendering();
}
