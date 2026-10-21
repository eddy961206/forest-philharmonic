// Applause synthesised once at load, made of individual clappers (each with
// their own hands, tempo, seat in the house, and a moment they start and
// stop). No recordings; everything is generated here.
//
// Two layers, mixed at play time by how many guests are in:
//   close - the neighbours you can pick out (a dozen around you, crisp, from
//           every side) and the rows nearby;
//   wash  - the rest of the house: hundreds of pairs of hands further away,
//           darker and diffuse, each reaching the two ears at a slightly
//           different time - the wide, dense roar of a full hall.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gauss(r) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
}

// RBJ band-pass (0 dB peak), direct form I
function bandpass(x, fs, f, q) {
  const w = (2 * Math.PI * Math.min(f, fs * 0.45)) / fs;
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  const b0 = al / a0;
  const b2 = -al / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - al) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

function onePoleLP(x, fs, f) {
  const k = 1 - Math.exp((-2 * Math.PI * f) / fs);
  let z = 0;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) { z += k * (x[i] - z); y[i] = z; }
  return y;
}

// One pair of hands: a sharp noise burst exciting the air pocket between
// the palms (a resonance between ~0.7 and 2.4 kHz) plus the skin slap.
function clapTemplate(fs, r, ms = 50) {
  const n = Math.floor((fs * ms) / 1000);
  const ex = new Float32Array(n);
  const tauE = 0.0012 + r() * 0.0025;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const env = Math.min(1, t / 0.0004) * Math.exp(-t / tauE);
    ex[i] = (r() * 2 - 1) * env;
  }
  const cupped = r();
  const f1 = 700 + Math.pow(r(), 0.8) * 1500 - cupped * 250;
  const body = bandpass(ex, fs, f1, 3 + r() * 5);
  const air = bandpass(ex, fs, 2200 + r() * 1800, 1.2 + r());
  const out = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    // the last few ms fade so a short template never ends on a step
    const tail = Math.min(1, (n - i) / (fs * 0.004));
    out[i] = (body[i] * (2.2 + cupped) + air[i] * 0.9 + ex[i] * 0.12) * tail;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < n; i++) out[i] /= peak;
  return out;
}

// One person clapping into L/R: from t0 until they stop, with their own
// tempo; joins the shared beat in a rhythmic finale.
function clapper(L, R, fs, seconds, r, o) {
  const len = L.length;
  const { tA, tB, gl, gr, itd, rhythmic } = o;
  const period = 1 / (3.2 + r() * 2.1);
  // most hands come in within the first second (a few eager ones first, a
  // few late ones after), and drop out over the last few seconds
  let t = 0.05 + Math.pow(r(), 1.6) * 0.9 + Math.abs(gauss(r)) * 0.12 + (r() < 0.1 ? r() * 1.5 : 0);
  const stop = seconds - 3.2 + gauss(r) * 1.0 - (r() < 0.25 ? r() * 2.2 : 0) + (r() < 0.06 ? 1.6 : 0);
  const joins = rhythmic && r() < 0.65;
  const syncFrom = seconds * 0.45 + r() * 1.5;
  const beat = 0.43;
  const amp = 0.75 + r() * 0.5;
  let k = 0;
  const iL = itd > 0 ? itd : 0;
  const iR = itd < 0 ? -itd : 0;
  while (t < Math.min(stop, seconds - 0.1)) {
    // a crescendo as they get going, softer as they tire
    const rise = Math.min(1, (t + 0.25) / 1.1);
    const tire = Math.max(0.3, 1 - Math.max(0, t - (stop - 1.4)) / 1.8);
    const a = amp * (0.8 + r() * 0.4) * rise * tire;
    const tpl = k % 3 === 0 ? tB : tA;
    const i0 = Math.floor(t * fs);
    const al = a * gl;
    const ar = a * gr;
    const nL = Math.min(tpl.length, len - i0 - iL);
    for (let i = 0; i < nL; i++) L[i0 + iL + i] += tpl[i] * al;
    const nR = Math.min(tpl.length, len - i0 - iR);
    for (let i = 0; i < nR; i++) R[i0 + iR + i] += tpl[i] * ar;
    k++;
    if (joins && t > syncFrom) {
      // lock onto the shared beat (with human timing)
      const next = Math.ceil((t + 0.05) / beat) * beat;
      t = next + gauss(r) * 0.014;
    } else {
      t += period * (1 + gauss(r) * 0.07);
    }
  }
}

// RMS over the steady part (20-50 % of the length)
function steadyRms(L, R) {
  let e = 0;
  const a = Math.floor(L.length * 0.2);
  const b = Math.floor(L.length * 0.5);
  for (let i = a; i < b; i++) e += L[i] * L[i] + R[i] * R[i];
  return Math.sqrt(e / (2 * Math.max(1, b - a)));
}

// scale to the wanted level; the odd clap right at your ear is rounded off
// (soft, 12-15 dB over the layer's RMS: big, never spiky; a neighbour's
// clap keeps a little more of its snap)
function toBuffer(ctx, L, R, fs, scale, rms, over = 4) {
  const buf = ctx.createBuffer(2, L.length, fs);
  const bl = buf.getChannelData(0);
  const br = buf.getChannelData(1);
  const len = L.length;
  const T = over * rms;
  for (let i = 0; i < len; i++) {
    const x = i / len;
    const f = Math.min(1, x * 60) * Math.min(1, (1 - x) * 14);
    bl[i] = T * Math.tanh((L[i] * scale * f) / T);
    br[i] = T * Math.tanh((R[i] * scale * f) / T);
  }
  return buf;
}

// seconds: length; people: how many make the wash; rhythmic: the finale's
// synchronised clapping joins in the second half; sr: the crowd is
// band-limited anyway (it is played through a 5-8 kHz low-pass), so it is
// rendered at a low rate - a quarter of the work.
// Returns { close, wash } (stereo AudioBuffers, each at a fixed RMS so the
// two mix predictably: the house 4 dB over the neighbours).
export function renderApplause(ctx, { seconds = 8, people = 320, seed = 1, rhythmic = false, sr = 24000 } = {}) {
  const r = rng(seed);
  const fs = sr;
  const len = Math.floor(fs * seconds);
  const near = Array.from({ length: 24 }, () => clapTemplate(fs, r, 50));
  const far = Array.from({ length: 24 }, () => onePoleLP(clapTemplate(fs, r, 30), fs, 2300));
  const pick = (set) => set[Math.floor(r() * set.length)];
  const side = (pan) => [Math.cos(((pan + 1) * Math.PI) / 4), Math.sin(((pan + 1) * Math.PI) / 4)];

  // close: your neighbours (all around, incl. behind) and the rows nearby
  const cL = new Float32Array(len);
  const cR = new Float32Array(len);
  const nClose = 60;
  for (let p = 0; p < nClose; p++) {
    const neighbour = p < 12;
    const d = neighbour ? 1.0 + r() * 2.5 : 3.5 + Math.pow(r(), 0.8) * 9;
    const g = (0.6 + r() * 0.4) / (1 + d / 2.5);
    const pan = neighbour ? r() * 1.9 - 0.95 : Math.max(-1, Math.min(1, gauss(r) * 0.6));
    const [sl, sr2] = side(pan);
    const itd = Math.round(pan * 0.0005 * fs);
    clapper(cL, cR, fs, seconds, r, { tA: pick(near), tB: pick(near), gl: g * sl, gr: g * sr2, itd, rhythmic });
  }
  const close = toBuffer(ctx, cL, cR, fs, 0.06 / (steadyRms(cL, cR) || 1), 0.06, 5.5);

  // wash: the house
  const wL = new Float32Array(len);
  const wR = new Float32Array(len);
  for (let p = 0; p < people; p++) {
    const d = 10 + Math.pow(r(), 0.9) * 35;
    const g = (0.6 + r() * 0.4) / (1 + d / 8);
    const pan = r() * 2 - 1;
    const [sl, sr2] = side(pan * 0.95);
    const itd = Math.round(pan * 0.0006 * fs) + Math.round(gauss(r) * 0.0002 * fs);
    clapper(wL, wR, fs, seconds, r, { tA: pick(far), tB: pick(far), gl: g * sl, gr: g * sr2, itd, rhythmic });
  }
  const wash = toBuffer(ctx, wL, wR, fs, 0.1 / (steadyRms(wL, wR) || 1), 0.1);
  return { close, wash };
}

// ------------------------------------------------------------------ the house
// The audience before the music: many conversations at once, far and near
// (noise shaped by two moving formants into syllables, phrases and pauses -
// no words, just the sound of a full room talking). Rendered as a seamless
// loop. Plus a few one-shots: a cough, a seat creaking, a programme rustling.

// time-varying two-formant voice: coefficients change once per syllable
function talker(L, R, fs, len, r, { gl, gr, itd }) {
  let t = r() * 1.5;
  const iL = itd > 0 ? itd : 0;
  const iR = itd < 0 ? -itd : 0;
  const base = 0.85 + r() * 0.5; // voice size (formants lower for a larger voice)
  let lp = 0;
  while (t < len / fs) {
    // a phrase of syllables, then a pause (listening to the other one)
    const phraseEnd = t + 1.2 + r() * 3;
    while (t < phraseEnd && t < len / fs) {
      const syl = 0.13 + r() * 0.15;
      const amp = 0.35 + r() * 0.65;
      const f1 = (320 + r() * 480) / base;
      const f2 = (950 + r() * 1300) / base;
      const n = Math.floor(syl * fs);
      const i0 = Math.floor(t * fs);
      // two resonators (RBJ band-pass) for this syllable
      const co = (f, q) => {
        const w = (2 * Math.PI * Math.min(f, fs * 0.45)) / fs;
        const al = Math.sin(w) / (2 * q);
        const a0 = 1 + al;
        return [al / a0, -al / a0, (-2 * Math.cos(w)) / a0, (1 - al) / a0];
      };
      const A = co(f1, 4);
      const B = co(f2, 6);
      let ax1 = 0, ax2 = 0, ay1 = 0, ay2 = 0, by1 = 0, by2 = 0;
      for (let i = 0; i < n; i++) {
        const k = i0 + i;
        if (k + iL >= len || k + iR >= len) break;
        // pink-ish source
        lp += 0.25 * ((r() * 2 - 1) - lp);
        const x = lp;
        const ya = A[0] * x + A[1] * ax2 - A[2] * ay1 - A[3] * ay2;
        const yb = B[0] * x + B[1] * ax2 - B[2] * by1 - B[3] * by2;
        ax2 = ax1; ax1 = x; ay2 = ay1; ay1 = ya; by2 = by1; by1 = yb;
        const env = Math.sin((Math.PI * i) / n);
        const v = (ya * 1.0 + yb * 0.55) * env * env * amp;
        L[k + iL] += v * gl;
        R[k + iR] += v * gr;
      }
      t += syl * (0.9 + r() * 0.35);
    }
    t += 0.25 + r() * 1.6;
  }
}

export function renderMurmur(ctx, { seconds = 9, talkers = 30, seed = 5, sr = 16000 } = {}) {
  const r = rng(seed);
  const fs = sr;
  const X = Math.floor(0.6 * fs); // crossfade for a seamless loop
  const len = Math.floor(seconds * fs) + X;
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  for (let p = 0; p < talkers; p++) {
    const d = 2 + Math.pow(r(), 0.7) * 25;
    const g = (0.6 + r() * 0.4) / (1 + d / 4);
    const pan = r() * 2 - 1;
    const a = ((pan * 0.95 + 1) * Math.PI) / 4;
    talker(L, R, fs, len, r, { gl: g * Math.cos(a), gr: g * Math.sin(a), itd: Math.round(pan * 0.0006 * fs) });
  }
  const n = len - X;
  const buf = ctx.createBuffer(2, n, fs);
  const rms = steadyRms(L, R) || 1;
  for (const [src, ch] of [[L, 0], [R, 1]]) {
    const o = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) o[i] = src[i] * (0.1 / rms);
    // the tail fades into the head (equal power)
    for (let i = 0; i < X; i++) {
      const u = i / X;
      o[i] = o[i] * Math.sin((u * Math.PI) / 2) + src[n + i] * (0.1 / rms) * Math.cos((u * Math.PI) / 2);
    }
  }
  return buf;
}

// one-shots: kind 'cough' | 'creak' | 'rustle' (mono, peak ~0.8)
export function renderNoise(ctx, kind, { seed = 1, sr = 16000 } = {}) {
  const r = rng(seed);
  const fs = sr;
  let out;
  if (kind === 'cough') {
    out = new Float32Array(Math.floor(0.6 * fs));
    const bursts = 1 + Math.floor(r() * 2.2);
    for (let b = 0; b < bursts; b++) {
      const t0 = Math.floor((b * (0.2 + r() * 0.08)) * fs);
      const n = Math.floor((0.14 + r() * 0.08) * fs);
      const ex = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / fs; ex[i] = (r() * 2 - 1) * Math.min(1, t / 0.006) * Math.exp(-t / (0.045 + r() * 0.03)); }
      const a = bandpass(ex, fs, 450 + r() * 400, 1.4);
      const c = bandpass(ex, fs, 1500 + r() * 900, 2);
      const g = b ? 0.55 + r() * 0.3 : 1;
      for (let i = 0; i < n && t0 + i < out.length; i++) out[t0 + i] += (a[i] * 1.6 + c[i] * 0.9) * g;
    }
  } else if (kind === 'creak') {
    out = new Float32Array(Math.floor((0.3 + r() * 0.35) * fs));
    let f = 45 + r() * 50;
    let ph = 0;
    const imp = new Float32Array(out.length);
    for (let i = 0; i < out.length; i++) {
      ph += f / fs;
      f *= 1 + (r() - 0.45) * 0.004;
      if (ph >= 1) { ph -= 1; imp[i] = 0.6 + r() * 0.4; }
    }
    const res = bandpass(imp, fs, 700 + r() * 900, 9);
    const res2 = bandpass(imp, fs, 2200 + r() * 800, 6);
    for (let i = 0; i < out.length; i++) {
      const u = i / out.length;
      out[i] = (res[i] + res2[i] * 0.5) * Math.sin(Math.PI * u);
    }
  } else {
    // a programme leafed through: crackling grains in a couple of swells
    out = new Float32Array(Math.floor((0.35 + r() * 0.5) * fs));
    const raw = new Float32Array(out.length);
    const sw = 1 + Math.floor(r() * 2.5);
    for (let i = 0; i < out.length; i++) {
      const u = i / out.length;
      const env = Math.pow(Math.abs(Math.sin(Math.PI * u * sw)), 1.5);
      if (r() < 0.06 * env) raw[i] = (r() * 2 - 1);
      raw[i] += (r() * 2 - 1) * 0.05 * env;
    }
    const hp = bandpass(raw, fs, 3200 + r() * 1500, 0.8);
    for (let i = 0; i < out.length; i++) out[i] = hp[i];
  }
  let pk = 0;
  for (let i = 0; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i]));
  const buf = ctx.createBuffer(1, out.length, fs);
  const o = buf.getChannelData(0);
  for (let i = 0; i < out.length; i++) o[i] = (out[i] / (pk || 1)) * 0.8;
  return buf;
}
