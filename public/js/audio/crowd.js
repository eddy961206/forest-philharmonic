// Applause synthesised once at load, made of individual clappers (each with
// their own hands, tempo, position in the hall, and a moment they start and
// stop). No recordings; everything is generated here.

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

// RBJ band-pass (0 dB peak), direct form I, in place
function bandpass(x, fs, f, q) {
  const w = (2 * Math.PI * f) / fs;
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
function clapTemplate(fs, r) {
  const n = Math.floor(fs * 0.05);
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
    out[i] = body[i] * (2.2 + cupped) + air[i] * 0.9 + ex[i] * 0.12;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < n; i++) out[i] /= peak;
  return out;
}

// seconds: length; people: how many clap; rhythmic: the finale's
// synchronised clapping joins in the second half
export function renderApplause(ctx, { seconds = 8, people = 150, seed = 1, rhythmic = false, sr = 44100 } = {}) {
  const r = rng(seed);
  const fs = sr;
  const len = Math.floor(fs * seconds);
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  const near = Array.from({ length: 32 }, () => clapTemplate(fs, r));
  const far = near.map((t) => onePoleLP(t, fs, 2600));
  for (let p = 0; p < people; p++) {
    // where they sit: a few close by, most further away in the hall
    const d = 2.5 + Math.pow(r(), 0.7) * 30;
    const g = (0.55 + r() * 0.45) / (1 + d / 5);
    const pan = Math.max(-1, Math.min(1, gauss(r) * 0.55));
    const gl = g * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = g * Math.sin(((pan + 1) * Math.PI) / 4);
    const tset = d > 12 ? far : near;
    const tA = tset[Math.floor(r() * tset.length)];
    const tB = tset[Math.floor(r() * tset.length)];
    const period = 1 / (3.3 + r() * 1.9);
    let t = 0.04 + Math.abs(gauss(r)) * 0.35 + (r() < 0.12 ? r() * 1.4 : 0);
    const stop = seconds - 2.6 + gauss(r) * 0.9 - (r() < 0.2 ? r() * 2 : 0);
    const joins = rhythmic && r() < 0.65;
    const syncFrom = seconds * 0.45 + r() * 1.5;
    const beat = 0.43;
    let k = 0;
    while (t < Math.min(stop, seconds - 0.08)) {
      // crescendo in the first second, a softer tail as each person tires
      const rise = Math.min(1, (t + 0.15) / 0.9);
      const tire = Math.max(0.35, 1 - Math.max(0, t - (stop - 1.2)) / 1.6);
      const a = (0.75 + r() * 0.5) * rise * tire;
      const tpl = k % 3 === 0 ? tB : tA;
      const i0 = Math.floor(t * fs);
      for (let i = 0; i < tpl.length && i0 + i < len; i++) {
        L[i0 + i] += tpl[i] * a * gl;
        R[i0 + i] += tpl[i] * a * gr;
      }
      k++;
      if (joins && t > syncFrom) {
        // lock onto the shared beat (with human timing)
        const next = Math.ceil((t + 0.05) / beat) * beat;
        t = next + gauss(r) * 0.012;
      } else {
        t += period * (1 + gauss(r) * 0.06);
      }
    }
  }
  // gentle fade in/out at the very ends, then normalise
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const x = i / len;
    const f = Math.min(1, x * 40) * Math.min(1, (1 - x) * 12);
    L[i] *= f;
    R[i] *= f;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const buf = ctx.createBuffer(2, len, fs);
  const k = 0.8 / (peak || 1);
  const bl = buf.getChannelData(0);
  const br = buf.getChannelData(1);
  for (let i = 0; i < len; i++) { bl[i] = L[i] * k; br[i] = R[i] * k; }
  return buf;
}
