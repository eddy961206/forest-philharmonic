// Spatial, sample-based orchestra engine on the Web Audio API.
//
// Signal flow per stage section:
//
//   voices ─► section in ─┬─► air absorption (LPF by distance) ─► HRTF panner ─► dry bus ─┐
//                         └─► reverb send (pre-panner, diffuse field) ─► hall convolver ──┤
//                                                                                          ▼
//                                     glue compressor ─► volume ─► brick-wall limiter ─► out
//
// The listener follows the camera every frame, so where you sit or walk
// changes direction, distance, direct-to-reverb ratio and high-frequency
// roll-off - the same cues that make seats sound different in a real hall.

import { SECTIONS, sectionCenter, sectionFacing } from '../layout.js';
import { renderApplause } from './crowd.js';

const FAMILY = {
  violin: 'strings', viola: 'strings', cello: 'strings', contrabass: 'strings', strings: 'strings',
  flute: 'winds', oboe: 'winds', clarinet: 'winds', bassoon: 'winds',
  horn: 'horn', trumpet: 'trumpet', piano: 'piano', harp: 'harp', timpani: 'timpani',
  choir: 'choir', voice: 'choir', bells: 'bells',
};

// Per-family envelope and timbre. atk = [pianissimo, fortissimo] seconds.
const ENV = {
  strings: { atk: [0.16, 0.045], rel: 0.32, sustain: true, bright: [900, 9000], level: 0.95 },
  winds: { atk: [0.07, 0.025], rel: 0.16, sustain: true, bright: [1400, 11000], level: 0.85 },
  horn: { atk: [0.11, 0.04], rel: 0.3, sustain: true, bright: [700, 6000], level: 0.9 },
  trumpet: { atk: [0.04, 0.015], rel: 0.16, sustain: true, bright: [1300, 12000], level: 0.8 },
  piano: { atk: [0.002, 0.002], rel: 0.45, sustain: false, bright: [1800, 16000], level: 1.0 },
  harp: { atk: [0.002, 0.002], rel: 1.6, sustain: false, bright: [2200, 15000], level: 1.0 },
  timpani: { atk: [0.002, 0.002], rel: 1.0, sustain: false, bright: [700, 7000], level: 1.0 },
  choir: { atk: [0.18, 0.07], rel: 0.35, sustain: true, bright: [1200, 7000], level: 0.9 },
  bells: { atk: [0.002, 0.002], rel: 2.5, sustain: false, bright: [3000, 14000], level: 0.8 },
};

const LOOP_FROM = 0.55; // seconds into a sustained sample where the steady tone begins
const XFADE = 0.38;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.samples = {}; // inst -> { notes: [midi...], buf: Map(midi -> AudioBuffer), meta }
    this.sections = {};
    this.voices = new Set();
    this.tickHandlers = new Set();
    this.listenerMode = 'camera';
    this.volume = 0.8;
  }

  async init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'playback', sampleRate: 48000 });
    const ctx = this.ctx;

    // make-up gain in front of the dynamics so the glue/limiter see real levels
    this.makeup = ctx.createGain();
    this.makeup.gain.value = 12;
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -16;
    this.glue.knee.value = 12;
    this.glue.ratio.value = 2.0;
    this.glue.attack.value = 0.03;
    this.glue.release.value = 0.35;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;

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

    // Hall reverb: generated impulse response (no external files)
    this.reverb = ctx.createConvolver();
    this.reverb.normalize = true;
    this.reverb.buffer = await generateHallIR(ctx, { rt60: 2.35, preDelay: 0.022, length: 3.8 });
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 1;
    const revHP = ctx.createBiquadFilter();
    revHP.type = 'highpass';
    revHP.frequency.value = 110;
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.42;
    this.reverbIn.connect(revHP).connect(this.reverb).connect(this.reverbReturn);

    // Room transmission: inside the hall both paths pass untouched; out in
    // the foyer the music comes through the walls and open doors, so the
    // direct sound is muffled and quieter while the reverberant field
    // carries a little more of it (see setRoom).
    const occ = (src) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 20000;
      lp.Q.value = 0.5;
      const g = ctx.createGain();
      src.connect(lp).connect(g).connect(this.makeup);
      return { lp, g };
    };
    this.occDry = occ(this.dryBus);
    this.occWet = occ(this.reverbReturn);
    this._open = 1;
    this.makeup.connect(this.glue).connect(this.master).connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.limiter.connect(ctx.destination);

    this._initListener();
    this._initSections();
    this._initTimer();
  }

  // ------------------------------------------------------------ samples
  async loadSamples(base, onProgress = () => {}) {
    const manifest = await (await fetch(`${base}/manifest.json`)).json();
    const jobs = [];
    for (const [inst, notes] of Object.entries(manifest)) {
      const midis = Object.keys(notes).map(Number).sort((a, b) => a - b);
      this.samples[inst] = { notes: midis, buf: new Map(), meta: notes };
      for (const m of midis) jobs.push([inst, m]);
    }
    let done = 0;
    const worker = async () => {
      while (jobs.length) {
        const [inst, m] = jobs.shift();
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(`${base}/${inst}/${m}.mp3`);
            const arr = await res.arrayBuffer();
            const buf = await this.ctx.decodeAudioData(arr);
            this.samples[inst].buf.set(m, buf);
            break;
          } catch (e) {
            if (attempt === 2) console.warn('sample failed', inst, m, e);
          }
        }
        done++;
        onProgress(done, done + jobs.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  _nearest(inst, midi) {
    const s = this.samples[inst];
    if (!s) return null;
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
      const cutoff = Math.max(3800, 21000 / (1 + d * 0.055));
      s.air.frequency.setTargetAtTime(cutoff, t, 0.08);
    }
  }

  _initSections() {
    const ctx = this.ctx;
    for (const id of Object.keys(SECTIONS)) {
      const pos = sectionCenter(id);
      const face = sectionFacing(id);
      const input = ctx.createGain();
      // Soundfont samples carry General MIDI panning baked into stereo; a
      // section is a point source in the hall, so sum to mono before the HRTF.
      const focus = new GainNode(ctx, { channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
      const air = ctx.createBiquadFilter();
      air.type = 'lowpass';
      air.frequency.value = 16000;
      air.Q.value = 0.5;
      const panner = new PannerNode(ctx, {
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        refDistance: 3.2,
        maxDistance: 120,
        rolloffFactor: 1.15,
        coneInnerAngle: 210,
        coneOuterAngle: 340,
        coneOuterGain: 0.45,
        positionX: pos.x, positionY: pos.y, positionZ: pos.z,
        orientationX: face.x, orientationY: 0, orientationZ: face.z,
      });
      const send = ctx.createGain();
      send.gain.value = 0.55;
      input.connect(focus);
      focus.connect(air).connect(panner).connect(this.dryBus);
      focus.connect(send).connect(this.reverbIn);
      this.sections[id] = { id, input, focus, air, panner, send, pos, distance: 10 };
    }
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
    this.occDry.lp.frequency.setTargetAtTime(cutoff, t, 0.3);
    this.occWet.lp.frequency.setTargetAtTime(Math.min(20000, cutoff * 1.6), t, 0.3);
    this.occDry.g.gain.setTargetAtTime(0.17 + 0.83 * Math.pow(open, 1.3), t, 0.3);
    this.occWet.g.gain.setTargetAtTime(0.48 + 0.52 * open, t, 0.3);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setReverb(amount) {
    // amount 0..1 -> return gain
    this.reverbReturn.gain.setTargetAtTime(0.1 + amount * 0.75, this.ctx.currentTime, 0.1);
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
  playNote({ section, inst, midi, vel, when, dur, gain = 1, layer = null }) {
    const ctx = this.ctx;
    const sec = this.sections[section];
    const main = this._nearest(inst, midi);
    if (!sec || !main) return;
    const fam = ENV[FAMILY[inst]] || ENV.winds;
    const v = Math.min(1, Math.max(0.05, vel / 127));
    const amp = fam.level * gain * 0.2 * (0.12 + 0.88 * Math.pow(v, 1.7)) * Math.min(4, main.meta.g);
    const atk = fam.atk[0] + (fam.atk[1] - fam.atk[0]) * v;
    when = Math.max(when, ctx.currentTime + 0.005);

    // Timbre: louder = brighter (the main thing that makes dynamics sound real)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const pitchLift = Math.pow(2, (midi - 60) / 36);
    filter.frequency.value = Math.min(20000, (fam.bright[0] + (fam.bright[1] - fam.bright[0]) * v * v) * pitchLift);
    filter.Q.value = 0.4;
    const env = ctx.createGain();
    env.gain.value = 0;
    filter.connect(env).connect(sec.input);

    const voice = { env, srcs: [], end: 0 };
    const rate = Math.pow(2, (midi - main.root) / 12);

    if (fam.sustain) {
      this._sustained(voice, main, rate, when, dur, filter, 1);
      if (layer) {
        const lay = this._nearest(layer, midi);
        if (lay) {
          const lg = ctx.createGain();
          lg.gain.value = 0.55 * Math.min(4, lay.meta.g) / Math.min(4, main.meta.g);
          lg.connect(filter);
          this._sustained(voice, lay, Math.pow(2, (midi - lay.root) / 12), when + 0.012, dur, lg, 1);
        }
      }
      // Envelope with a little messa di voce on long notes
      const g = env.gain;
      g.setValueAtTime(0, when);
      g.linearRampToValueAtTime(amp, when + atk);
      if (dur > 1.2) {
        g.linearRampToValueAtTime(amp * 1.1, when + dur * 0.45);
        g.linearRampToValueAtTime(amp * 0.92, when + dur);
      } else {
        g.setValueAtTime(amp, Math.max(when + atk, when + dur - 0.01));
      }
      const off = when + Math.max(dur, atk + 0.02);
      g.setTargetAtTime(0, off, fam.rel / 3);
      voice.end = off + fam.rel * 2;
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

  // Plays a sustained sample for `dur` seconds; when the note is longer than
  // the recording, chains further segments from the steady part of the sample
  // with equal-power crossfades (no loop clicks).
  _sustained(voice, smp, rate, when, dur, dest, level) {
    const ctx = this.ctx;
    const startOff = smp.meta.s;
    const total = dur + 0.6; // include release
    const firstLen = (smp.buf.duration - startOff) / rate - 0.05;
    const mk = (offset, t0, len, fadeIn, fadeOut) => {
      const src = ctx.createBufferSource();
      src.buffer = smp.buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      src.connect(g).connect(dest);
      const p = g.gain;
      if (fadeIn) {
        p.setValueAtTime(0, t0);
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
    if (total <= firstLen) {
      mk(startOff, when, total, false, false);
      return;
    }
    let t = when;
    let len = firstLen;
    mk(startOff, t, len, false, true);
    let covered = len;
    let guard = 0;
    while (covered < total && guard++ < 64) {
      t = when + covered - XFADE;
      const remain = total - covered + XFADE;
      // pick the segment start first, then measure how much sample is left
      const off = LOOP_FROM + Math.random() * 0.25;
      const segLen = (smp.buf.duration - off) / rate - 0.06;
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

  // ------------------------------------------------------------ applause
  _prepareCrowd() {
    if (this._crowd) return;
    const ctx = this.ctx;
    this._crowd = {
      welcome: renderApplause(ctx, { seconds: 5.5, people: 120, seed: 11 }),
      normal: [renderApplause(ctx, { seconds: 10, people: 170, seed: 21 }), renderApplause(ctx, { seconds: 10, people: 170, seed: 22 })],
      finale: renderApplause(ctx, { seconds: 15, people: 240, seed: 31, rhythmic: true }),
    };
  }

  // Pre-render the crowd once (a few hundred milliseconds at load)
  prepareApplause() {
    this._prepareCrowd();
  }

  // intensity < 0.8: a short welcome; >= 1.2: the finale with rhythmic
  // clapping; otherwise the ordinary applause after a piece
  applause(when, intensity = 1) {
    this._prepareCrowd();
    const ctx = this.ctx;
    const C = this._crowd;
    const buf = intensity < 0.8 ? C.welcome : intensity >= 1.2 ? C.finale : C.normal[(this._appN = (this._appN || 0) + 1) % 2];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.98 + Math.random() * 0.04;
    // the hall takes the edge off: a soft high cut and a little low cut
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.034 * Math.min(1.25, intensity);
    src.connect(hp).connect(lp).connect(g);
    const dry = ctx.createGain();
    dry.gain.value = 0.55;
    g.connect(dry).connect(this.dryBus);
    g.connect(this.reverbIn);
    src.start(when);
    this._lastApplause = { src, g };
    return src;
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

// --------------------------------------------------------------- hall IR
// A concert-hall impulse response built from: a sparse set of early
// reflections (side walls, ceiling, stage shell) followed by a diffuse,
// exponentially decaying tail whose high end dies faster than the low end.
export async function generateHallIR(ctx, { rt60 = 2.3, preDelay = 0.02, length = 3.5 } = {}) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * length);
  const off = new OfflineAudioContext(2, n, sr);
  const raw = off.createBuffer(2, n, sr);
  const pd = Math.floor(preDelay * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = raw.getChannelData(ch);
    // early reflections
    const taps = 22;
    for (let i = 0; i < taps; i++) {
      const t = preDelay + 0.004 + Math.pow(i / taps, 1.4) * 0.085 + (Math.random() - 0.5) * 0.004;
      const idx = Math.floor(t * sr);
      const a = (0.55 + Math.random() * 0.4) * Math.exp(-i / 9) * (Math.random() < 0.5 ? -1 : 1);
      if (idx < n) d[idx] += a;
    }
    // diffuse tail with a soft build-up
    const k = 6.907755 / rt60;
    for (let i = pd; i < n; i++) {
      const t = (i - pd) / sr;
      const build = Math.min(1, t / 0.07);
      d[i] += (Math.random() * 2 - 1) * Math.exp(-k * t) * build * 0.42;
    }
  }
  const src = off.createBufferSource();
  src.buffer = raw;
  const lp = off.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.3;
  lp.frequency.setValueAtTime(14000, 0);
  lp.frequency.exponentialRampToValueAtTime(5200, 0.25);
  lp.frequency.exponentialRampToValueAtTime(1400, length * 0.75);
  lp.frequency.exponentialRampToValueAtTime(700, length);
  const ls = off.createBiquadFilter();
  ls.type = 'lowshelf';
  ls.frequency.value = 220;
  ls.gain.value = 2.5; // warm bass ratio, typical of good halls
  src.connect(lp).connect(ls).connect(off.destination);
  src.start();
  return off.startRendering();
}
