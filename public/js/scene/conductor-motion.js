// Score-derived conducting targets. Compile once per immutable loaded piece;
// sampling is seek-safe, allocation-free and independent of render history.
import { SECTIONS, PODIUM } from '../layout.js';

const cache = new WeakMap();
const PATTERNS = {
  1: [[0, -.16]],
  2: [[0, -.18], [.08, .09]],
  3: [[0, -.18], [.22, -.05], [.04, .13]],
  4: [[0, -.18], [-.18, -.06], [.23, -.06], [.04, .13]],
};
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => x * x * (3 - 2 * x);
const mix = (a, b, x) => a + (b - a) * x;
function indexAt(beats, time) {
  let lo = 0, hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (beats[mid][0] <= time) lo = mid; else hi = mid - 1;
  }
  return lo;
}
function point(beat) {
  const pattern = PATTERNS[beat[2]] || PATTERNS[4];
  return pattern[((beat[1] || 0) % pattern.length + pattern.length) % pattern.length];
}

export function conductorScore(piece) {
  if (!piece) return null;
  if (cache.has(piece)) return cache.get(piece);
  const beats = piece.beats || [];
  const n = beats.length;
  const dynamics = new Float32Array(n), articulation = new Float32Array(n);
  const weight = new Float32Array(n), cue = new Float32Array(n), direction = new Float32Array(n);
  const phrases = [];
  let bar = 0;
  for (let i = 0; i < n; i++) if (beats[i][1] === 0 && bar++ % 4 === 0) phrases.push(beats[i][0]);
  if (!phrases.length) phrases.push(0);
  phrases.push(Math.max(phrases[phrases.length - 1] + .5, piece.duration || beats[n - 1]?.[0] + .5 || .5));
  // Merge chairs/voices before finding a section's entrance after silence.
  const sections = new Map();
  for (const track of piece.tracks || []) {
    let notes = sections.get(track.section);
    if (!notes) sections.set(track.section, notes = []);
    for (let j = 0; j < track.notes.length; j += 4) {
      const start = track.notes[j], duration = track.notes[j + 1], velocity = track.notes[j + 3] / 127;
      notes.push([start, start + duration, velocity]);
      if (!n) continue;
      const first = indexAt(beats, start), last = indexAt(beats, start + duration);
      for (let k = first; k <= last; k++) {
        const span = Math.max(.1, (beats[k + 1]?.[0] ?? beats[k][0] + .5) - beats[k][0]);
        const overlap = Math.max(0, Math.min(start + duration, beats[k][0] + span) - Math.max(start, beats[k][0])) / span;
        weight[k] += overlap;
        dynamics[k] += velocity * overlap;
        articulation[k] += clamp(duration / span) * overlap;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    dynamics[i] = weight[i] ? dynamics[i] / weight[i] : .12;
    articulation[i] = weight[i] ? articulation[i] / weight[i] : 1;
  }
  for (const [sid, notes] of sections) {
    notes.sort((a, b) => a[0] - b[0]);
    const chairs = SECTIONS[sid]?.chairs || [];
    const x = chairs.reduce((sum, chair) => sum + chair.x, 0) / (chairs.length || 1);
    const z = chairs.reduce((sum, chair) => sum + Math.abs(chair.z - PODIUM.z), 0) / (chairs.length || 1);
    const yaw = Math.max(-.42, Math.min(.42, -Math.atan2(x, Math.max(1, z))));
    let end = -Infinity;
    for (const note of notes) {
      if (n) {
        const k = indexAt(beats, note[0]);
        const span = Math.max(.2, (beats[k + 1]?.[0] ?? beats[k][0] + .5) - beats[k][0]);
        if (note[0] - end >= span * 2) {
          // One preparatory beat, then a gentle release. Simultaneous entries
          // select the strongest section rather than pulling in two directions.
          for (let i = Math.max(0, k - 2); i <= Math.min(n - 1, k + 2); i++) {
            const distance = (beats[i][0] - note[0]) / span;
            const strength = Math.exp(-((distance + .35) ** 2) / .7) * note[2];
            if (strength > cue[i]) { cue[i] = strength; direction[i] = yaw * strength; }
          }
        }
      }
      end = Math.max(end, note[1]);
    }
  }
  const score = { beats, dynamics, articulation, cue, direction, phrases };
  cache.set(piece, score);
  return score;
}

export function createConductorPose() {
  return { rx: .12, ry: 1, rz: -.28, lx: -.24, ly: .94, lz: -.28, headX: 0, headY: 0, bodyX: 0, bodyZ: 0, dynamic: 0, cue: 0 };
}

export function sampleConductorPose(score, time, out) {
  const beats = score?.beats;
  if (!beats?.length) {
    out.rx = .12; out.ry = 1; out.rz = -.28;
    out.lx = -.24; out.ly = .94; out.lz = -.28;
    out.headX = out.headY = out.bodyX = out.bodyZ = out.dynamic = out.cue = 0;
    return out;
  }
  const k = indexAt(beats, time), next = Math.min(k + 1, beats.length - 1);
  const span = Math.max(.1, beats[next][0] - beats[k][0]);
  const u = clamp((time - beats[k][0]) / span), e = ease(u);
  const dynamic = mix(score.dynamics[k], score.dynamics[next], e);
  const legato = mix(score.articulation[k], score.articulation[next], e);
  const cue = mix(score.cue[k], score.cue[next], e);
  const gaze = mix(score.direction[k], score.direction[next], e);
  let lo = 0, hi = score.phrases.length - 2;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (score.phrases[m] <= time) lo = m; else hi = m - 1;
  }
  const phrase = clamp((time - score.phrases[lo]) / (score.phrases[lo + 1] - score.phrases[lo]));
  const breath = Math.sin(Math.PI * phrase) ** 2;
  const a = point(beats[k]), b = point(beats[next]);
  const size = .55 + dynamic * .65;
  // Smooth endpoints preserve the ictus while shorter notes rebound briskly.
  const rebound = Math.sin(Math.PI * u) ** 2 * (.045 + .045 * (1 - legato));
  out.rx = .1 + mix(a[0], b[0], e) * size;
  out.ry = 1.12 + mix(a[1], b[1], e) * size + rebound;
  out.rz = -.3 - .045 * breath - .025 * dynamic;
  out.lx = -.23 - .075 * breath - .05 * cue;
  out.ly = .88 + .16 * dynamic + .13 * breath + .085 * cue;
  out.lz = -.25 - .065 * breath - .035 * cue;
  out.headX = .025 + .045 * (1 - breath) - .025 * cue;
  out.headY = gaze;
  out.bodyX = -.018 * breath - .018 * cue;
  out.bodyZ = -.024 * gaze + .015 * Math.sin(2 * Math.PI * phrase) * dynamic;
  out.dynamic = dynamic; out.cue = cue;
  return out;
}
