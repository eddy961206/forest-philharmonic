// What plays on the Sphere's dome: procedural worlds drawn per pixel (no
// video files), a live camera feed ("IMAG") above the stage, and the house
// look - the screen pretending to be the building's own steel and concrete -
// that the roof "lifts off" from when a piece begins. Everything is mapped
// from the sweet spot in the middle of the bowl, the way Sphere content is.
// The dome also lights the room: its average colour drives the bowl's light.
import * as THREE from 'three';
import { SP } from './sphereplan.js';
import { WORLDS3D, makeWorldRenderer } from './dome3d.js';

export const SCENES = ['ARCH', 'STARS', 'AURORA', 'MOON', 'FOREST', 'OCEAN', 'SUNSET', 'CATHEDRAL', 'GOLD', 'FIREWORKS', 'RAIN', 'SNOW', 'SPRING', 'DECO', 'NEBULA', 'VOYAGE', ...WORLDS3D];
// on phones the ray-traced worlds give way to their painted versions
const LITE_FALLBACK = { FOREST3D: 'FOREST', OCEAN3D: 'OCEAN', CLOUDS3D: 'SUNSET', PEAKS3D: 'AURORA' };
const S = Object.fromEntries(SCENES.map((n, i) => [n, i]));
// rough average light each world throws into the room (linear rgb, x brightness)
const GLOW = {
  ARCH: [0.6, 0.45, 0.32, 0.1], STARS: [0.25, 0.3, 0.55, 0.12], AURORA: [0.2, 0.75, 0.55, 0.28], MOON: [0.45, 0.55, 0.85, 0.3],
  FOREST: [0.45, 0.75, 0.4, 0.45], OCEAN: [0.15, 0.55, 0.85, 0.45], SUNSET: [1.0, 0.55, 0.35, 0.65], CATHEDRAL: [0.6, 0.4, 0.75, 0.35],
  GOLD: [1.0, 0.75, 0.35, 0.5], FIREWORKS: [0.7, 0.5, 0.6, 0.25], RAIN: [0.35, 0.42, 0.55, 0.22], SNOW: [0.6, 0.7, 0.9, 0.35],
  SPRING: [0.75, 0.75, 0.95, 0.6], DECO: [0.9, 0.7, 0.4, 0.4], NEBULA: [0.55, 0.3, 0.75, 0.25],
  VOYAGE: [0.35, 0.35, 0.65, 0.14], FOREST3D: [0.5, 0.68, 0.42, 0.5], OCEAN3D: [0.12, 0.48, 0.66, 0.38], CLOUDS3D: [1.0, 0.66, 0.45, 0.6], PEAKS3D: [0.3, 0.6, 0.62, 0.22],
};

// The show: which worlds go with which piece (in order; long pieces travel
// through them). Anything not listed is chosen by its mood.
export const VISUALS = {
  'beethoven-ode-to-joy': ['CLOUDS3D', 'CATHEDRAL', 'FIREWORKS'],
  'debussy-clair-de-lune': ['MOON', 'STARS'],
  'bach-prelude-c': ['FOREST3D'],
  'chopin-raindrop': ['RAIN', 'FOREST3D', 'RAIN'],
  'mozart-turkish-march': ['GOLD', 'DECO'],
  'beethoven-moonlight': ['MOON', 'VOYAGE'],
  greensleeves: ['SPRING', 'FOREST3D'],
  'tchaikovsky-june': ['OCEAN3D', 'CLOUDS3D'],
  'joplin-entertainer': ['DECO', 'GOLD'],
  'joplin-maple-leaf': ['DECO', 'GOLD'],
  'schubert-lindenbaum': ['SNOW', 'FOREST3D'],
  'handel-lascia': ['CATHEDRAL'],
  'grieg-march-of-trolls': ['PEAKS3D', 'FOREST3D'],
  'grieg-wedding-day': ['SPRING', 'CLOUDS3D'],
  'tchaikovsky-troika': ['SNOW', 'PEAKS3D'],
  'liliuokalani-aloha-oe': ['SUNSET', 'OCEAN3D'],
  'bach-wachet-auf': ['CATHEDRAL', 'CLOUDS3D'],
  'beethoven-fur-elise': ['STARS', 'VOYAGE'],
  'bach-nun-seid-ihr': ['CATHEDRAL', 'FIREWORKS'],
  'bach-o-haupt': ['CATHEDRAL'],
  'bach-brich-an': ['SUNSET', 'CATHEDRAL'],
  'bach-wir-singen': ['STARS', 'CATHEDRAL'],
  'chopin-prelude-4': ['RAIN'],
  'chopin-prelude-20': ['CATHEDRAL'],
  'tchaikovsky-october': ['FOREST3D', 'RAIN'],
  'grieg-to-spring': ['SPRING', 'FOREST3D'],
  'grieg-butterfly': ['SPRING'],
  'grieg-notturno': ['PEAKS3D', 'STARS'],
  'schumann-traumerei': ['VOYAGE', 'NEBULA'],
  'beethoven-pathetique-adagio': ['MOON', 'CATHEDRAL'],
  'debussy-prelude': ['OCEAN3D', 'SPRING'],
  'debussy-passepied': ['SPRING', 'GOLD'],
  'mozart-k545': ['GOLD', 'SPRING'],
  'verdi-la-donna': ['DECO', 'SUNSET'],
  'weber-clarinet-concertino': ['GOLD', 'SPRING', 'FIREWORKS'],
  'amazing-grace': ['SUNSET', 'CATHEDRAL', 'CLOUDS3D'],
  'elgar-pomp-and-circumstance': ['GOLD', 'CATHEDRAL', 'FIREWORKS'],
};
const BY_MOOD = { calm: ['STARS', 'MOON', 'NEBULA', 'AURORA', 'FOREST3D', 'OCEAN3D', 'VOYAGE', 'PEAKS3D'], lively: ['GOLD', 'DECO', 'SPRING', 'CLOUDS3D'], grand: ['CATHEDRAL', 'CLOUDS3D', 'FIREWORKS'] };

export function visualsFor(piece) {
  if (!piece) return ['STARS'];
  if (VISUALS[piece.id]) return VISUALS[piece.id];
  const pool = BY_MOOD[piece.mood] || BY_MOOD.calm;
  let h = 0;
  for (const c of piece.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = pool[h % pool.length];
  const b = pool[(h >> 4) % pool.length];
  return a === b ? [a] : [a, b];
}

// (the Sphere's setlist lives in programs.js)

// --------------------------------------------------------------- shader
const VERT = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const S_CLOUDS = 16 + WORLDS3D.indexOf('CLOUDS3D');
const S_PEAKS = 16 + WORLDS3D.indexOf('PEAKS3D');
const FRAG = (lite) => /* glsl */`
precision highp float;
varying vec3 vWorld;
uniform float uTime, uLevel, uBeat, uDown, uMix, uReveal, uLive, uHouse, uBright;
uniform int uA, uB;
uniform float uOverlay;        // 0: the world on screen; 1: the next one, laid over it
uniform int uOne;              // always 1: loops run to n * uOne (kept loops, not unrolled - see dome3d.js)
uniform vec3 uView;
uniform vec2 uEdge;          // screen where y - k z > d
uniform sampler2D uLiveTex, uCapTex;
uniform samplerCube uCubeA, uCubeB; // the ray-traced worlds (dome3d.js)
uniform int uCubeAId, uCubeBId;
uniform vec4 uLiveRect;      // az0, az1, el0, el1

#define PI 3.14159265
#define OCT ${lite ? 3 : 5}

float hash1(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
// (no sine: on Apple GPUs sin() of a large argument is fast and loose and can
// come back NaN - and one NaN on the dome turned the whole picture black once
// the bloom had spread it)
float hash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash1(i), hash1(i + vec3(1,0,0)), f.x), mix(hash1(i + vec3(0,1,0)), hash1(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash1(i + vec3(0,0,1)), hash1(i + vec3(1,0,1)), f.x), mix(hash1(i + vec3(0,1,1)), hash1(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < OCT * uOne; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float noise2(vec2 p) { return noise(vec3(p, 0.0)); }

// stars: a few layers of hashed cells on the direction sphere
vec3 starfield(vec3 d, float dens, float tw) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 3 * uOne; l++) {
    float k = 90.0 + float(l) * 140.0;
    vec3 p = d * k;
    vec3 id = floor(p);
    float h = hash1(id + float(l) * 31.0);
    if (h > 1.0 - dens * (0.012 + float(l) * 0.008)) {
      vec3 q = fract(p) - 0.5;
      float s = exp(-dot(q, q) * 70.0);
      float twinkle = 0.65 + 0.35 * sin(uTime * (1.0 + h * 6.0) * tw + h * 40.0);
      vec3 col = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), fract(h * 13.0));
      c += col * s * twinkle * (1.4 - float(l) * 0.4) * 2.2;
    }
  }
  return c;
}

// the galaxy seen edge-on: a soft wide band with a brighter spine, warmer
// toward its centre, broken by dark dust lanes - quiet, no movement of its own
const vec3 GAL_N = vec3(0.3632, -0.6815, -0.6353); // across the sky above the stage, low left to high right
float galLat(vec3 d) { return dot(d, GAL_N); }
vec3 milkyway(vec3 d) {
  float lat = galLat(d);
  float band = exp(-lat * lat * 14.0);
  float spine = exp(-lat * lat * 70.0);
  vec3 cdir = normalize(cross(GAL_N, vec3(0.0, 1.0, 0.0)));
  float toward = 0.5 + 0.5 * dot(d, cdir); // brighter toward the galactic centre
  float f = fbm(d * 3.0 + 4.0);
  float dust = fbm(d * 7.0 - 2.0);
  vec3 col = mix(vec3(0.2, 0.16, 0.38), vec3(0.6, 0.64, 0.84), f);
  col = mix(col, vec3(0.95, 0.8, 0.6), spine * toward * 0.55);
  float lanes = smoothstep(0.42, 0.72, dust) * spine;
  float glow = band * (0.3 + 0.9 * f) * (0.5 + 0.7 * toward) * (1.0 - 0.75 * lanes);
  return col * glow * 0.6;
}
// two small open clusters, like the Pleiades: a knot of stars, not a flash
vec3 clusters(vec3 d) {
  float g1 = smoothstep(0.11, 0.0, acos(clamp(dot(d, normalize(vec3(-0.55, 0.62, -0.56))), -1.0, 1.0)));
  float g2 = smoothstep(0.08, 0.0, acos(clamp(dot(d, normalize(vec3(0.62, 0.48, -0.62))), -1.0, 1.0)));
  float g = max(g1, g2);
  if (g <= 0.0) return vec3(0.0);
  return starfield(d * 1.6, 6.0, 0.5) * g * 0.9 + vec3(0.35, 0.42, 0.7) * g * g * 0.05;
}
// the whole sky turning, very slowly - alive, never moving enough to notice
vec3 skyTurn(vec3 d) {
  float a = uTime * 0.0035;
  float c = cos(a), s = sin(a);
  return vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
}

vec3 sARCH(vec3 d, float az, float el) {
  // the building, as the screen shows it before a show: a dark concrete
  // shell on steel ribs, scalloped by uplights from the balcony rails,
  // an oculus at the crown - so the room looks closed until the roof lifts
  float lon = az * 24.0 / PI;           // 48 ribs round
  float lat = (el + 0.3) * 9.0;         // rings
  float rib = smoothstep(0.0, 0.06, abs(fract(lon) - 0.5) - 0.44) * smoothstep(-0.25, 0.05, el);
  float ring = smoothstep(0.0, 0.05, abs(fract(lat) - 0.5) - 0.455);
  vec2 cell = floor(vec2(lon, lat));
  float panel = 0.88 + 0.12 * hash2(cell);
  float grain = 0.8 + 0.2 * fbm(d * 30.0);
  vec3 col = vec3(0.034, 0.032, 0.03) * panel * grain;
  col *= 1.0 - 0.55 * max(rib, ring);  // dark seams
  // uplight scallops from below, warm, fading up the wall
  float sc = pow(max(cos(az * 18.0), 0.0), 6.0);
  float up = exp(-max(el + 0.12, 0.0) * 3.2);
  col += vec3(0.62, 0.38, 0.2) * sc * up * 0.32;
  col += vec3(0.5, 0.33, 0.2) * up * 0.05;
  // the ribs catch the light
  col += vec3(0.4, 0.3, 0.2) * rib * (0.05 + 0.25 * up * (0.4 + sc));
  // oculus
  float zen = acos(clamp(d.y, -1.0, 1.0));
  col += vec3(0.75, 0.7, 0.62) * smoothstep(0.2, 0.14, zen) * 0.35;
  col += vec3(0.35, 0.32, 0.3) * exp(-zen * 6.0) * 0.18;
  col = mix(col, vec3(0.02, 0.022, 0.03), smoothstep(0.14, 0.135, zen) * 0.0);
  return col;
}

vec3 sSTARS(vec3 d0, float az, float el) {
  vec3 d = skyTurn(d0);
  vec3 sky = mix(vec3(0.02, 0.035, 0.08), vec3(0.0, 0.005, 0.02), smoothstep(-0.2, 1.2, el));
  sky += vec3(0.05, 0.06, 0.12) * exp(-max(el + 0.25, 0.0) * 3.0);
  // (more, finer stars along the band, as the eye finds them there)
  float lat = galLat(d);
  vec3 c = sky + milkyway(d) + starfield(d, 1.0 + 2.2 * exp(-lat * lat * 20.0), 1.0) + clusters(d);
  // a shooting star, rarely (about one in 20 s) - a grace note, not a show
  float t = uTime * 0.05;
  float k = floor(t);
  float f = fract(t);
  vec2 h = hash22(vec2(k, 3.0));
  vec2 p0 = vec2(h.x * 2.4 - 1.2, 0.35 + h.y * 0.6);
  vec2 p = vec2(az, el);
  vec2 dir = normalize(vec2(0.8, -0.35));
  vec2 head = p0 + dir * f * 0.9;
  vec2 rel = p - head;
  float along = dot(rel, -dir);
  float across = abs(dot(rel, vec2(-dir.y, dir.x)));
  float trail = step(0.0, along) * exp(-along * 9.0) * exp(-across * across * 40000.0) * smoothstep(0.0, 0.1, f) * smoothstep(0.6, 0.3, f) * step(0.45, h.x);
  c += vec3(0.9, 0.95, 1.0) * trail * 3.0;
  return c;
}

vec3 sNEBULA(vec3 d, float az, float el) {
  vec3 q = d * 1.6 + vec3(0.0, 0.0, uTime * 0.01);
  float a = fbm(q + fbm(q * 1.7 + 3.0));
  float b = fbm(q * 2.3 - 5.0 + uTime * 0.008);
  vec3 col = vec3(0.01, 0.0, 0.03);
  col += vec3(0.55, 0.12, 0.45) * pow(a, 3.0) * 1.6;
  col += vec3(0.1, 0.35, 0.65) * pow(b, 3.0) * 1.4;
  col += vec3(1.0, 0.75, 0.45) * pow(a * b, 4.0) * 3.0;
  col *= 0.8 + 0.6 * uLevel;
  return col + starfield(d, 0.8, 1.6) * (1.0 - a * 0.6);
}

vec3 sAURORA(vec3 d, float az, float el) {
  vec3 c = sSTARS(d, az, el) * 0.6;
  float t = uTime * 0.05;
  for (int i = 0; i < 3 * uOne; i++) {
    float fi = float(i);
    float base = 0.18 + fi * 0.12 + 0.12 * sin(az * (1.3 + fi * 0.4) + t * (1.0 + fi * 0.3) + fi * 2.0) + 0.06 * (fbm(vec3(az * 2.0, t, fi)) - 0.5);
    float h = el - base;
    float curtain = smoothstep(-0.03, 0.02, h) * exp(-max(h, 0.0) * (5.0 - fi));
    float streak = 0.55 + 0.45 * noise(vec3(az * 70.0, t * 4.0, fi * 9.0));
    vec3 col = mix(vec3(0.1, 1.0, 0.55), vec3(0.65, 0.25, 1.0), smoothstep(0.0, 0.35, h));
    c += col * curtain * streak * (0.45 + 0.6 * uLevel) * (0.7 - fi * 0.15);
  }
  // snow horizon glow
  c += vec3(0.08, 0.12, 0.16) * exp(-max(el + 0.25, 0.0) * 6.0);
  return c;
}

vec3 clouds(vec3 d, float el, vec3 lit, vec3 shade, float cover, float speed) {
  vec2 p = d.xz / max(d.y + 0.35, 0.08);
  float n = fbm(vec3(p * 0.9 + vec2(uTime * speed, 0.0), uTime * 0.01));
  float m = smoothstep(1.0 - cover, 1.0 - cover + 0.25, n);
  return mix(shade, lit, smoothstep(0.35, 0.75, n)) * m;
}

vec3 sMOON(vec3 d, float az, float el) {
  vec3 sky = mix(vec3(0.03, 0.06, 0.14), vec3(0.005, 0.01, 0.035), smoothstep(-0.2, 1.0, el));
  vec3 md = normalize(vec3(0.18, 0.52, -0.83));
  float a = acos(clamp(dot(d, md), -1.0, 1.0));
  float R = 0.075;
  float disc = smoothstep(R, R - 0.004, a);
  float crat = fbm(d * 60.0);
  vec3 moon = vec3(0.98, 0.95, 0.85) * (0.75 + 0.35 * crat) * disc * 1.6;
  vec3 halo = vec3(0.55, 0.65, 0.95) * (exp(-a * 9.0) * 0.6 + exp(-a * 2.5) * 0.12);
  // the galaxy and the stars behind, washed out near the moon as they are
  vec3 sd = skyTurn(d);
  float wash = 1.0 - exp(-a * 2.2);
  vec3 c = sky + (milkyway(sd) * 0.55 + starfield(sd, 0.75, 1.0) + clusters(sd) * 0.8) * wash * (1.0 - disc) + halo + moon;
  vec3 cl = clouds(d, el, vec3(0.42, 0.45, 0.55) + halo * 0.8, vec3(0.03, 0.04, 0.07), 0.3, 0.008);
  float cm = max(max(cl.r, cl.g), cl.b) > 0.0 ? 1.0 : 0.0;
  c = mix(c, cl, clamp(length(cl) * 4.0, 0.0, 0.9) * step(-0.15, el));
  return c;
}

vec3 sFOREST(vec3 d, float az, float el) {
  // Standing among the trunks of an old beech wood in the morning: columns
  // of grey bark at every depth fading into the green haze, rising straight
  // up past you (a trunk keeps its width in azimuth all the way up, so it
  // narrows toward the top of the sky as a real one would) into a high
  // canopy with small bright gaps, leaves lit gold at their edges, and the
  // sun coming down through it in shafts. (The phones' version of FOREST3D.)
  vec3 sd = normalize(vec3(0.15, 0.75, -0.65));
  float sun = max(dot(d, sd), 0.0);
  vec3 haze = mix(vec3(0.17, 0.22, 0.13), vec3(0.3, 0.34, 0.22), smoothstep(-0.05, 0.4, el)) * (0.8 + 0.5 * sun);
  vec3 c = haze;
  // the floor: moss and old leaves, lighter in the distance
  float fl0 = fbm(vec3(az * 8.0, el * 30.0, 2.0));
  vec3 floorCol = mix(vec3(0.06, 0.055, 0.025), vec3(0.11, 0.13, 0.05), fl0);
  c = mix(c, mix(floorCol, haze, smoothstep(-0.12, 0.0, el) * 0.6), smoothstep(0.0, -0.01, el));
  // trunks in three depths, far ones thin and hazy
  for (int l = 0; l < 3 * uOne; l++) {
    float fl = float(l); // 0 far .. 2 near
    float N = 90.0 - fl * 32.0;
    float u = (az + PI) / (2.0 * PI) * N + fl * 0.37;
    float ui = floor(u);
    float h = hash2(vec2(ui, fl + 3.0));
    float w = (0.1 + 0.12 * h) * (0.8 + fl * 0.35) * (1.0 - 0.15 * smoothstep(0.0, 1.0, el)); // a slight taper
    float x = fract(u) - 0.5 - (hash2(vec2(ui, fl + 8.0)) - 0.5) * 0.4;
    float base = -0.02 - fl * 0.03 + 0.012 * h;
    float top = 0.45 + 0.25 * hash2(vec2(ui, fl + 5.0)) + fl * 0.1;
    float on = step(0.45 - fl * 0.12, hash2(vec2(ui, fl + 11.0)));
    float trunk = smoothstep(w, w - 0.02 - fl * 0.01, abs(x)) * step(base, el) * smoothstep(top + 0.08, top - 0.05, el) * on;
    float side = clamp(x / w, -1.0, 1.0);
    vec3 bark = vec3(0.16, 0.155, 0.14) * (0.7 + 0.45 * noise(vec3(u * 30.0, el * 25.0, ui)));
    bark *= 0.55 + 0.45 * smoothstep(-0.9, 0.7, side); // round: lit from the sun's side
    bark = mix(bark, vec3(0.06, 0.1, 0.035), smoothstep(0.3, 0.9, noise(vec3(u * 12.0, el * 8.0, ui + 4.0))) * smoothstep(0.15, 0.0, el) * 0.6); // moss low down
    bark = mix(bark, haze, (0.65 - fl * 0.3) * (1.0 - smoothstep(0.0, 0.6, el) * 0.5));
    c = mix(c, bark, trunk);
  }
  // the canopy
  vec2 pp = d.xz / max(d.y + 0.15, 0.05);
  float sway = sin(uTime * 0.3) * 0.03;
  float leaves = fbm(vec3(pp * 3.2 + sway, uTime * 0.012)) * 0.6 + 0.4 * fbm(vec3(pp * 14.0 + sway * 2.0, 3.0));
  float cover = smoothstep(0.32, 0.7, el);
  float gap = smoothstep(0.7, 0.76, leaves) * (1.0 - smoothstep(0.92, 1.0, d.y) * 0.3);
  float leafT = fbm(vec3(pp * 6.0, 1.0));
  vec3 leafCol = mix(vec3(0.025, 0.06, 0.02), vec3(0.13, 0.22, 0.05), leafT) * (0.6 + 0.6 * smoothstep(0.3, 0.6, leaves));
  leafCol = mix(leafCol, vec3(0.38, 0.5, 0.1), smoothstep(0.6, 0.7, leaves) * 0.7); // light through the thin leaves
  leafCol += vec3(0.7, 0.62, 0.2) * smoothstep(0.025, 0.0, abs(leaves - 0.69)) * 0.25 * (0.4 + sun); // gold edges at the gaps
  vec3 gapCol = vec3(0.75, 0.8, 0.65) * (0.8 + sun);
  vec3 can = mix(leafCol, gapCol, gap);
  c = mix(c, can, cover);
  // shafts of sun down through it
  float ray = pow(sun, 4.0) * (0.35 + 0.65 * noise(vec3(az * 30.0, uTime * 0.15, 0.0)));
  c += vec3(1.0, 0.92, 0.6) * ray * 0.22 * (1.0 - cover * 0.85);
  // motes drifting in the light
  vec2 g = vec2(az * 30.0, el * 30.0 + uTime * 0.12);
  vec2 gi = floor(g);
  vec2 off = hash22(gi) - 0.5;
  float ff = exp(-dot(fract(g) - 0.5 - off * 0.6, fract(g) - 0.5 - off * 0.6) * 300.0) * step(0.9, hash2(gi + 9.0)) * smoothstep(0.45, 0.05, el);
  c += vec3(1.0, 0.95, 0.7) * ff * (0.5 + 0.5 * sin(uTime * 2.0 + gi.x)) * 0.8;
  return c * (0.85 + 0.2 * uLevel);
}

vec3 sOCEAN(vec3 d, float az, float el) {
  // under the sea: the surface overhead, caustics, light shafts, bubbles
  float up = clamp(d.y, -0.3, 1.0);
  vec3 deep = vec3(0.0, 0.05, 0.12);
  vec3 shallow = vec3(0.05, 0.45, 0.62);
  vec3 c = mix(deep, shallow, smoothstep(-0.3, 1.0, up));
  vec2 p = d.xz / max(d.y + 0.2, 0.05) * 1.3;
  float t = uTime * 0.35;
  float ca = 0.0;
  for (int i = 0; i < 3 * uOne; i++) {
    float fi = float(i);
    vec2 q = p * (1.5 + fi * 0.7) + vec2(t * (0.6 + fi * 0.2), -t * 0.4);
    ca += pow(abs(sin(q.x + sin(q.y * 1.3 + t)) * sin(q.y + sin(q.x * 1.1 - t))), 6.0);
  }
  c += vec3(0.55, 0.9, 1.0) * ca * smoothstep(0.2, 0.9, up) * 0.45;
  float shaft = pow(noise(vec3(az * 14.0, uTime * 0.12, 0.0)), 3.0) * smoothstep(-0.1, 0.8, up);
  c += vec3(0.4, 0.8, 0.9) * shaft * 0.35;
  // bubbles
  vec2 g = vec2(az * 22.0, el * 22.0 - uTime * 0.6);
  vec2 gi = floor(g);
  vec2 f = fract(g) - 0.5 - (hash22(gi) - 0.5) * 0.5;
  float r = 0.08 + 0.1 * hash2(gi);
  float ring = smoothstep(r, r - 0.02, length(f)) - smoothstep(r - 0.03, r - 0.05, length(f));
  c += vec3(0.75, 0.95, 1.0) * ring * step(0.82, hash2(gi + 3.0)) * 0.8;
  // a whale gliding past
  float wx = fract(uTime * 0.012) * 4.0 - 2.0;
  vec2 rel = vec2(az - wx, el - 0.35);
  float body = smoothstep(1.0, 0.85, length(rel / vec2(0.32, 0.055)));
  float tail = smoothstep(1.0, 0.8, length((rel + vec2(0.36, 0.0)) / vec2(0.05, 0.08 * (0.7 + 0.3 * sin(uTime * 1.2)))));
  float fin = smoothstep(1.0, 0.8, length((rel + vec2(-0.05, 0.06)) / vec2(0.09, 0.025)));
  c = mix(c, vec3(0.0, 0.03, 0.06), clamp(body + tail + fin, 0.0, 1.0) * 0.85);
  return c * (0.85 + 0.25 * uLevel);
}

vec3 sSUNSET(vec3 d, float az, float el) {
  // The sun setting beyond the stage: a sky in layers from fire at the
  // horizon through rose and mauve to deep blue overhead, long cirrus
  // streaks lit pink and gold from below on the sun's side and violet
  // away from it, a dark bank of cloud on the horizon with a burning rim,
  // and the first stars at the top. (Linear values: the tone mapping
  // lifts them, so the sky is painted darker than it looks.)
  vec3 sd = normalize(vec3(0.0, 0.06, -1.0));
  float sa = acos(clamp(dot(d, sd), -1.0, 1.0));
  float facing = 0.5 - 0.5 * normalize(vec3(d.x, 0.0, d.z) + vec3(0.0, 0.0, 1e-4)).z; // 1 toward the sun
  float h = max(el, -0.2);
  vec3 c = mix(vec3(0.95, 0.32, 0.07), vec3(0.85, 0.36, 0.2), smoothstep(-0.05, 0.14, h));
  c = mix(c, vec3(0.42, 0.17, 0.3), smoothstep(0.1, 0.4, h));
  c = mix(c, vec3(0.12, 0.08, 0.26), smoothstep(0.34, 0.85, h));
  c = mix(c, vec3(0.012, 0.018, 0.07), smoothstep(0.8, 1.45, h));
  c *= mix(0.5, 1.0, facing); // the far side of the sky already dimmer
  // the sun half down, and its glow in the haze
  float disc = smoothstep(0.055, 0.05, sa) * smoothstep(-0.02, 0.01, el);
  c += vec3(1.0, 0.75, 0.4) * disc * 3.0;
  c += vec3(1.0, 0.45, 0.15) * (exp(-sa * 7.0) * 0.8 + exp(-sa * 1.8) * 0.25);
  // cirrus: long thin streaks across the sky, lit from below
  vec2 p = d.xz / max(d.y + 0.3, 0.06);
  float t = uTime * 0.006;
  float n = fbm(vec3(p.x * 0.45 + p.y * 0.12 + t, p.y * 2.6, 3.0));
  float streak = smoothstep(0.5, 0.72, n) * smoothstep(-0.02, 0.1, el) * smoothstep(1.35, 0.5, el);
  float under = smoothstep(0.72, 0.5, n); // the thin edges catch the most light
  vec3 lit = mix(vec3(0.3, 0.12, 0.3), vec3(1.0, 0.42, 0.22), facing) * mix(1.4, 0.55, smoothstep(0.08, 0.9, el));
  lit += vec3(1.0, 0.6, 0.3) * under * facing * 0.35 * smoothstep(0.7, 0.1, el);
  c = mix(c, lit, streak * 0.85);
  // the cloud bank on the horizon, its rim burning
  float bank = fbm(vec3(az * 5.0, 0.0, 7.0));
  float bh = -0.01 + 0.1 * bank + 0.025 * noise(vec3(az * 26.0, 1.0, 3.0));
  float inBank = smoothstep(bh + 0.004, bh - 0.008, el);
  float rim = smoothstep(0.018, 0.0, abs(el - bh)) * facing * (0.4 + 1.6 * exp(-sa * 3.0));
  vec3 bankCol = mix(vec3(0.16, 0.05, 0.07), vec3(0.04, 0.02, 0.04), smoothstep(bh, bh - 0.12, el));
  c = mix(c, bankCol, inBank);
  c += vec3(1.0, 0.5, 0.2) * rim * 0.6;
  // the first stars
  c += starfield(d, 0.45, 0.8) * smoothstep(0.9, 1.4, el);
  return c * (0.85 + 0.2 * uLevel);
}

vec3 sCATHEDRAL(vec3 d, float az, float el) {
  // A gothic choir seen from the nave: a dim stone vault on ribs, and over
  // the stage a rose window - stone tracery round a rosette, eight petals,
  // a ring of sixteen roundels - glazed in Chartres blue with ruby, amber
  // and a little green, glowing as if the sun stood behind it; tall lancets
  // round the walls; light falling through the dust. It breathes with the music.
  float lon = az * 8.0 / PI;
  float course = fract(el * 22.0);
  float stoneN = fbm(d * 14.0);
  vec3 c = vec3(0.06, 0.05, 0.047) * (0.65 + 0.5 * stoneN);
  c *= 0.85 + 0.15 * smoothstep(0.0, 0.08, course) * smoothstep(1.0, 0.92, course); // ashlar courses
  // vault ribs: meridians gathering overhead, catching a warm light
  float rib = smoothstep(0.0, 0.05, abs(fract(lon) - 0.5) - 0.445) * smoothstep(0.15, 0.5, el);
  c = mix(c, vec3(0.26, 0.21, 0.16) * (0.7 + 0.3 * stoneN), rib * 0.9);
  // the rose window
  vec3 rc = normalize(vec3(0.0, 0.42, -0.9));
  float a = acos(clamp(dot(d, rc), -1.0, 1.0));
  vec3 rx = normalize(cross(rc, vec3(0.0, 1.0, 0.0)));
  vec3 ry = cross(rx, rc);
  float ang = atan(dot(d, ry), dot(d, rx));
  float R = 0.34;
  float glow = 0.75 + 0.45 * uLevel + 0.2 * uBeat;
  if (a < R + 0.03) {
    float rr = a / R; // 0 centre .. 1 rim
    vec2 pp = vec2(cos(ang), sin(ang)) * rr;
    // glass: small panes, mostly blue, jewels by hash, each pane its own depth
    float sa = ang / (2.0 * PI) * (10.0 + floor(rr * 6.0) * 6.0);
    vec2 cellId = vec2(floor(sa), floor(rr * 6.0));
    float h = hash2(cellId + 3.0);
    vec3 glass = h < 0.52 ? vec3(0.08, 0.2, 0.72) : h < 0.72 ? vec3(0.62, 0.06, 0.1) : h < 0.88 ? vec3(0.86, 0.58, 0.12) : h < 0.95 ? vec3(0.1, 0.42, 0.28) : vec3(0.5, 0.16, 0.5);
    glass *= 0.55 + 0.55 * hash2(cellId + 17.0); // no two panes alike
    glass *= 0.75 + 0.5 * noise(vec3(pp * 40.0, 1.0)); // the grain of old glass
    glass *= mix(1.05, 0.6, rr); // brighter toward the centre, as with the sun behind
    float lead = max(smoothstep(0.0, 0.05, abs(fract(sa) - 0.5) - 0.45), smoothstep(0.0, 0.05, abs(fract(rr * 6.0) - 0.5) - 0.45));
    // stone tracery (in light cream stone, its edges lit)
    float tr = 0.0;
    tr = max(tr, smoothstep(0.035, 0.0, abs(rr - 0.2) - 0.012)); // round the rosette
    float pet = abs(rr - 0.42 - 0.13 * cos(ang * 8.0)); // eight petals
    tr = max(tr, smoothstep(0.03, 0.0, pet - 0.01));
    float seg = 2.0 * PI / 16.0;
    float la = mod(ang + seg * 0.5, seg) - seg * 0.5;
    vec2 lp = vec2(rr * cos(la) - 0.8, rr * sin(la));
    tr = max(tr, smoothstep(0.03, 0.0, abs(length(lp) - 0.13) - 0.012)); // sixteen roundels
    tr = max(tr, smoothstep(0.035, 0.0, abs(rr - 0.97) - 0.025)); // the rim
    vec3 win = glass * glow;
    win = mix(win, vec3(0.012), clamp(lead, 0.0, 1.0) * 0.85);
    vec3 stone = vec3(0.2, 0.17, 0.14) * (0.75 + 0.35 * stoneN) + vec3(0.06, 0.05, 0.04) * smoothstep(0.6, 0.2, rr);
    win = mix(win, stone, tr);
    win += vec3(1.0, 0.86, 0.6) * smoothstep(0.1, 0.0, rr) * 1.1 * glow; // the sun behind the rosette
    c = mix(c, win, smoothstep(R + 0.01, R - 0.005, a));
    // the deep moulded frame round it
    c = mix(c, vec3(0.2, 0.17, 0.14) * (0.7 + 0.4 * stoneN), smoothstep(R + 0.03, R + 0.015, a) * smoothstep(R - 0.005, R + 0.01, a));
  }
  // a halo of coloured light round the window, falling into the dusty air
  c += vec3(0.16, 0.2, 0.55) * exp(-max(a - R, 0.0) * 12.0) * 0.12 * glow;
  // lancets: tall pointed windows of small leaded panes, in the walls
  float n = 10.0;
  float u = (az + PI) / (2.0 * PI) * n;
  float cx = fract(u) - 0.5;
  float top = 0.48 - 1.6 * cx * cx;
  bool front = abs(az) < 0.7;
  if (!front && el > -0.12 && el < top && abs(cx) < 0.13) {
    float k = floor(u);
    float py = (el + 0.12) * 30.0;
    float px = cx * 24.0;
    vec2 pane = vec2(floor(px), floor(py));
    float h = hash2(pane + k * 13.0);
    vec3 glass = h < 0.55 ? vec3(0.08, 0.2, 0.66) : h < 0.75 ? vec3(0.6, 0.07, 0.11) : h < 0.9 ? vec3(0.8, 0.55, 0.14) : vec3(0.1, 0.4, 0.26);
    glass *= (0.5 + 0.5 * hash2(pane + k * 7.0 + 5.0)) * (0.8 + 0.4 * noise(vec3(px * 3.0, py * 3.0, k)));
    float lead = max(smoothstep(0.0, 0.07, abs(fract(py) - 0.5) - 0.43), smoothstep(0.0, 0.07, abs(fract(px) - 0.5) - 0.43));
    float frame = smoothstep(0.115, 0.13, abs(cx)) + smoothstep(top - 0.015, top, el);
    c = mix(glass * glow * 0.75, vec3(0.08, 0.07, 0.06), clamp(lead * 0.8 + frame, 0.0, 1.0));
  }
  // shafts of light from the rose window down toward the stage
  float shaft = pow(max(dot(d, normalize(vec3(0.0, 0.1, -1.0))), 0.0), 10.0) * smoothstep(0.32, 0.05, el);
  c += vec3(0.45, 0.42, 0.7) * shaft * 0.14 * glow;
  return c;
}

vec3 sGOLD(vec3 d, float az, float el) {
  // A gilded baroque ceiling: rows of sunken coffers, each framed in gold
  // with a rosette at its heart, on a deep lacquer ground; a slow band of
  // light glides across the gold, and the gilding glints on the beat.
  float rows = 9.0;
  float ring = el * rows / (0.5 * PI);
  float ri = floor(ring);
  float per = max(6.0, floor(cos(clamp(ri + 0.5, 0.0, rows) / rows * 0.5 * PI) * 30.0)); // fewer coffers toward the crown
  float col = (az + PI) / (2.0 * PI) * per;
  vec2 f = vec2(fract(col), fract(ring)) - 0.5; // within one coffer, -0.5..0.5
  vec2 id = vec2(floor(col), ri);
  float edge = max(abs(f.x), abs(f.y));
  vec3 lacquer = vec3(0.09, 0.025, 0.02);
  vec3 gold = vec3(1.0, 0.64, 0.18);
  // the frame: two gilt mouldings with a dark groove between
  float frame = smoothstep(0.38, 0.42, edge);
  float groove = smoothstep(0.435, 0.445, edge) * smoothstep(0.47, 0.455, edge);
  // the coffer's sunken floor, shaded by its depth (light from above)
  float depth = 1.0 - smoothstep(0.2, 0.4, edge);
  vec3 floorC = lacquer * (0.7 + 0.6 * (0.5 - f.y)) * (0.8 + 0.4 * hash2(id));
  // a rosette: eight petals round a boss
  float r = length(f);
  float a = atan(f.y, f.x);
  float petals = smoothstep(0.02, 0.0, r - (0.12 + 0.05 * cos(a * 8.0)));
  float boss = smoothstep(0.045, 0.035, r);
  // gold catching the light: the slow band, plus a glint from the music
  float sweep = exp(-pow(fract(az / (2.0 * PI) + el * 0.15 - uTime * 0.035) - 0.5, 2.0) * 60.0);
  float sheen = 0.55 + 0.45 * sweep + 0.35 * uLevel;
  // (a bevel: the mouldings lit from above, darker underneath)
  float bevel = 0.7 + 0.6 * smoothstep(-0.45, 0.45, -f.y) * smoothstep(0.38, 0.5, edge) + 0.15 * (1.0 - smoothstep(0.38, 0.5, edge));
  vec3 g = gold * sheen * bevel * (0.72 + 0.28 * noise(vec3(f * 12.0, ri + id.x)));
  vec3 c = floorC;
  c = mix(c, g * 0.85, petals);
  c = mix(c, g * 1.2, boss);
  c = mix(c, g, frame);
  c = mix(c, lacquer * 0.4, groove);
  c *= 0.85 + 0.15 * depth;
  // a sparkle here and there on the gilding, with the beat
  float spark = step(0.985, hash2(id * 3.1 + floor(uTime * 4.0))) * frame;
  c += vec3(1.0, 0.9, 0.7) * spark * (0.4 + 1.2 * uBeat);
  // the crown: a gilded sunburst
  float crown = smoothstep(1.32, 1.5, el);
  c = mix(c, gold * (0.6 + 0.5 * pow(abs(cos(az * 12.0)), 6.0)) * sheen, crown);
  // rings ripple out from the stage on strong beats
  float ra = acos(clamp(dot(d, vec3(0.0, 0.0, -1.0)), -1.0, 1.0));
  c += vec3(1.0, 0.8, 0.4) * exp(-abs(ra - (1.0 - uDown) * 2.0) * 30.0) * uDown * 0.8;
  return c * (0.85 + 0.3 * uLevel);
}

vec3 sDECO(vec3 d, float az, float el) {
  // art deco sunburst: gilt rays from the stage, stepped arcs, black lacquer
  vec3 cc = normalize(vec3(0.0, -0.15, -1.0));
  float a = acos(clamp(dot(d, cc), -1.0, 1.0));
  vec3 rx = normalize(cross(cc, vec3(0.0, 1.0, 0.0)));
  vec3 ry = cross(rx, cc);
  float ang = atan(dot(d, ry), dot(d, rx));
  float rays = step(0.5, fract(ang / (2.0 * PI) * 36.0 + uTime * 0.01));
  float arcs = smoothstep(0.0, 0.03, abs(fract(a * 6.0 - uTime * 0.08) - 0.5) - 0.46);
  vec3 c = mix(vec3(0.02, 0.02, 0.03), vec3(0.06, 0.05, 0.03), rays);
  vec3 gold = vec3(0.95, 0.72, 0.35);
  c += gold * arcs * (0.5 + 0.5 * uBeat);
  float edge = smoothstep(0.0, 0.012, abs(fract(ang / (2.0 * PI) * 36.0 + uTime * 0.01) - 0.5) - 0.488);
  c += gold * edge * 0.6 * smoothstep(0.1, 0.3, a);
  // chevrons around the horizon
  float ch = smoothstep(0.0, 0.02, abs(fract(az * 6.0 + abs(el + 0.05) * 8.0) - 0.5) - 0.46) * smoothstep(0.25, 0.05, abs(el + 0.05));
  c += gold * ch * 0.5;
  c += gold * smoothstep(0.14, 0.0, a) * (1.0 + uBeat);
  return c * (0.85 + 0.35 * uLevel);
}

vec3 burst(vec2 p, float seed, float tt, vec3 col) {
  // a peony: sparks flung out on 48 rays, each with a short tail, falling
  // and fading; only the ray nearest the pixel is evaluated
  float age = tt;
  vec2 rel = p;
  rel.y += 0.05 * age * age; // gravity
  float rad = 0.3 * (1.0 - exp(-age * 2.6));
  float N = 48.0;
  float a = atan(rel.y, rel.x);
  float k = floor(a / (2.0 * PI) * N + 0.5);
  float ak = k / N * 2.0 * PI + (hash2(vec2(k, seed)) - 0.5) * 0.06;
  float rk = rad * (0.82 + 0.3 * hash2(vec2(k + 7.0, seed)));
  vec2 dir = vec2(cos(ak), sin(ak));
  float t = dot(rel, dir);
  float perp = abs(dot(rel, vec2(-dir.y, dir.x)));
  float head = exp(-(perp * perp + (t - rk) * (t - rk)) * 30000.0);
  float tail = exp(-perp * perp * 90000.0) * smoothstep(rk * 0.45, rk, t) * step(t, rk) * 0.5;
  float fade = exp(-age * 1.15);
  float tw = 0.65 + 0.35 * sin(uTime * 37.0 + k * 3.1 + seed * 20.0);
  // the flash at the moment of the burst
  float flash = exp(-age * 9.0) * exp(-dot(rel, rel) * 400.0) * 1.5;
  return col * ((head * 2.6 + tail) * fade * tw * 2.0) + vec3(1.0, 0.95, 0.85) * flash;
}

vec3 sFIREWORKS(vec3 d, float az, float el) {
  vec3 c = sSTARS(d, az, el) * 0.4 + vec3(0.02, 0.01, 0.04);
  vec2 p = vec2(az, el);
  for (int i = 0; i < 7 * uOne; i++) {
    float fi = float(i);
    float period = 2.6 + fi * 0.37;
    float t = uTime + fi * 1.13;
    float k = floor(t / period);
    float tt = mod(t, period);
    vec2 h = hash22(vec2(k, fi));
    vec2 c0 = vec2(h.x * 2.6 - 1.3, 0.25 + h.y * 0.7);
    vec3 col = 0.5 + 0.5 * cos(6.2831 * (hash2(vec2(k, fi + 9.0)) + vec3(0.0, 0.33, 0.67)));
    c += burst(p - c0, hash2(vec2(fi, k)), tt, col);
  }
  c += vec3(1.0, 0.8, 0.6) * uDown * 0.06;
  return c;
}

vec3 sRAIN(vec3 d, float az, float el) {
  // Rain on a glass roof at dusk: a low ceiling of grey-blue cloud drifting
  // over, rain falling out of it straight at you (looking up, the streaks
  // spread out from the top of the sky), veils of rain on the horizon,
  // drops beading on the glass, the lights of a town low down; a rare
  // flash far off inside the clouds.
  float zen = acos(clamp(d.y, -1.0, 1.0));
  vec3 c = mix(vec3(0.075, 0.09, 0.115), vec3(0.03, 0.038, 0.055), smoothstep(-0.1, 1.1, el));
  // cloud: two decks moving at different speeds, lighter where thinner
  vec2 p = d.xz / max(d.y + 0.35, 0.08);
  float n1 = fbm(vec3(p * 0.7 + vec2(uTime * 0.012, uTime * 0.004), 1.0));
  float n2 = fbm(vec3(p * 1.6 + vec2(uTime * 0.03, -uTime * 0.006), 5.0));
  float thin = smoothstep(0.35, 0.75, n1 * 0.65 + n2 * 0.35);
  c = mix(c * 0.6, vec3(0.16, 0.18, 0.225), thin * 0.85 * smoothstep(-0.05, 0.25, el));
  c *= 0.8 + 0.4 * smoothstep(0.3, 0.7, n2); // the folds of the cloud base
  c += vec3(0.05, 0.055, 0.07) * smoothstep(0.55, 0.8, n2) * smoothstep(0.0, 0.4, el); // ragged scud below
  // a flash, far off, lighting a patch of the clouds from inside
  {
    float t = uTime * 0.07;
    float k = floor(t);
    float f = fract(t) * 14.3; // (a few seconds into each 14 s window)
    float on = step(0.6, hash2(vec2(k, 2.0)));
    float fl = on * (exp(-max(f - 0.5, 0.0) * 9.0) * step(0.5, f) + 0.5 * exp(-abs(f - 0.75) * 30.0));
    float fa = (hash2(vec2(k, 5.0)) - 0.5) * 4.0;
    vec3 fd = normalize(vec3(sin(fa), 0.25, -cos(fa)));
    float near = exp(-acos(clamp(dot(d, fd), -1.0, 1.0)) * 2.6);
    c += vec3(0.55, 0.6, 0.8) * fl * near * (0.3 + 0.7 * thin) * 0.7;
  }
  // veils of rain hanging below the clouds on the horizon
  float veil = noise(vec3(az * 9.0 + uTime * 0.04, el * 3.0, 4.0)) * (0.6 + 0.4 * noise(vec3(az * 30.0 + el * 20.0, uTime * 0.3, 6.0)));
  c = mix(c, vec3(0.1, 0.115, 0.14), smoothstep(0.32, 0.0, el) * (0.35 + 0.5 * veil));
  c += vec3(0.16, 0.09, 0.04) * exp(-max(el, 0.0) * 11.0) * (0.7 + 0.3 * veil); // the lights of a town, through the rain
  // the rain: streaks coming at you, spreading from the zenith
  float lz = log(max(zen, 0.02));
  for (int l = 0; l < 2 * uOne; l++) {
    float fl = float(l);
    float N = 260.0 + fl * 220.0;
    vec2 g = vec2((az + PI) / (2.0 * PI) * N, lz * (7.0 + fl * 4.0) - uTime * (3.2 + fl * 1.4));
    vec2 gi = floor(g);
    float h = hash2(gi + fl * 17.0);
    float x = abs(fract(g.x) - 0.5 - (h - 0.5) * 0.5);
    float y = fract(g.y + h * 3.0);
    float streak = smoothstep(0.12, 0.0, x) * smoothstep(0.0, 0.3, y) * smoothstep(0.55, 0.35, y) * step(0.86, h);
    c += vec3(0.42, 0.47, 0.56) * streak * (0.2 - fl * 0.06) * smoothstep(0.25, 0.8, zen);
  }
  // drops beaded on the glass, each a tiny lens showing the bright sky upside down
  vec2 g = vec2(az * 22.0, el * 22.0);
  vec2 gi = floor(g);
  vec2 o = hash22(gi) * 0.6 + 0.2;
  vec2 f = fract(g) - o;
  float r = 0.04 + 0.1 * hash2(gi + 2.0);
  float drop = smoothstep(r, r * 0.75, length(f * vec2(1.0, 0.85))) * step(0.45, hash2(gi + 5.0));
  vec3 lens = vec3(0.17, 0.19, 0.24) * (0.7 + 0.6 * smoothstep(r, -r, f.y));
  c = mix(c, lens, drop * 0.75);
  c += vec3(0.8, 0.85, 0.95) * drop * smoothstep(r * 0.4, 0.0, length(f + vec2(r * 0.35, -r * 0.35))) * 0.45;
  c *= 1.0 - smoothstep(r * 1.25, r, length(f * vec2(1.0, 0.85))) * (1.0 - drop) * step(0.45, hash2(gi + 5.0)) * 0.25; // its shadow ring
  return c * (0.9 + 0.2 * uLevel);
}

vec3 sSNOW(vec3 d, float az, float el) {
  // A winter night at the edge of a village: low snow cloud glowing faintly
  // with the lights below, a snowfield and rows of snow-laden firs round the
  // horizon with a few warm windows among them, and snow falling out of the
  // dark straight at you - small and far, then big and soft as it comes close.
  float zen = acos(clamp(d.y, -1.0, 1.0));
  vec3 c = mix(vec3(0.1, 0.095, 0.11), vec3(0.022, 0.03, 0.06), smoothstep(-0.02, 0.9, el));
  vec2 p = d.xz / max(d.y + 0.4, 0.1);
  c *= 0.8 + 0.45 * fbm(vec3(p * 0.8 + vec2(uTime * 0.004, 0.0), 2.0)); // the cloud's soft folds
  c += vec3(0.1, 0.06, 0.03) * exp(-max(el, 0.0) * 12.0); // the village's glow in the haze
  // the snowfield
  c = mix(c, vec3(0.085, 0.09, 0.11) + vec3(0.06, 0.035, 0.015) * smoothstep(-0.08, 0.0, el), smoothstep(0.002, -0.004, el));
  // firs, a far row in the haze and a near row, each in tiers of snowy boughs
  for (int l = 0; l < 2 * uOne; l++) {
    float fl = float(l);
    float k = 52.0 - fl * 20.0;
    float u = az * k / PI + fl * 3.7;
    float ui = floor(u);
    float hh = hash2(vec2(ui, fl + 1.0));
    float H = (0.04 + 0.05 * hh) * (0.8 + fl * 0.9) * step(0.08, hash2(vec2(ui, fl + 7.0)));
    float x = abs(fract(u) - 0.5 - (hh - 0.5) * 0.25) * 2.0;
    float y = (el + 0.012 + fl * 0.02) / max(H, 1e-3);
    float tier = fract(-y * 5.0 + hh);
    float w = (1.0 - y) * (0.45 + 0.5 * tier) * 1.1;
    float tree = step(0.0, y) * smoothstep(w + 0.06, w - 0.06, x) * step(y, 1.0);
    vec3 fir = mix(vec3(0.05, 0.055, 0.07), vec3(0.012, 0.018, 0.024), fl);
    fir += vec3(0.13, 0.14, 0.17) * smoothstep(w * 0.5, w * 0.95, x) * smoothstep(0.15, 0.6, tier) * (0.5 + 0.5 * fl); // snow along each tier's boughs
    c = mix(c, fir, tree);
  }
  // windows: a few warm lights low among the trees, and their glow
  vec2 wg = vec2(az * 80.0, el * 140.0 + 1.0);
  vec2 wi = floor(wg);
  float win = step(0.9, hash2(wi + 3.0)) * step(abs(wi.y - 0.0), 0.5);
  win *= smoothstep(0.42, 0.25, length((fract(wg) - 0.5) * vec2(1.0, 0.7)));
  c += vec3(1.0, 0.6, 0.25) * win * (0.85 + 0.15 * sin(uTime * 1.3 + wi.x)) * 1.4;
  // the snow, in three depths, streaming out from the top of the sky
  float lz = log(max(zen, 0.015));
  for (int l = 0; l < 3 * uOne; l++) {
    float fl = float(l);
    float N = 70.0 - fl * 22.0; // far (many, small) to near (few, big)
    vec2 g = vec2((az + PI) / (2.0 * PI) * N, lz * N / (2.0 * PI) - uTime * (0.18 + fl * 0.16));
    g.x += sin(uTime * 0.35 + g.y * 0.7 + fl * 2.0) * 0.25; // the drift
    vec2 gi = floor(g);
    vec2 o = hash22(gi + fl * 13.0) - 0.5;
    vec2 q = fract(g) - 0.5 - o * 0.6;
    float sz = mix(0.045, 0.15, fl * 0.5) * (0.6 + 0.6 * hash2(gi + 2.0));
    float flake = smoothstep(sz, sz * (0.35 - fl * 0.17), length(q)) * step(0.38 + fl * 0.18, hash2(gi + 5.0 + fl));
    c += vec3(0.85, 0.88, 0.95) * flake * (0.55 - fl * 0.12) * smoothstep(0.02, 0.15, zen);
  }
  return c * (0.9 + 0.2 * uLevel);
}

vec3 sSPRING(vec3 d, float az, float el) {
  // lying under cherry trees in April: a deep blue sky with a few high
  // clouds, blossom-laden boughs reaching in from all round the rim, and
  // petals drifting down across everything
  vec3 c = mix(vec3(0.62, 0.78, 0.95), vec3(0.16, 0.38, 0.82), smoothstep(-0.05, 1.2, el));
  vec3 cl = clouds(d, el, vec3(1.0), vec3(0.78, 0.82, 0.92), 0.3, 0.008);
  c = mix(c, cl, clamp(length(cl) * 0.8, 0.0, 0.8) * step(0.0, el));
  // boughs: a fringe of blossom clusters whose reach varies round the rim
  vec2 pp = d.xz / max(d.y + 0.2, 0.05);
  float reach = 0.42 + 0.22 * fbm(vec3(az * 1.6, 2.0, 0.0));
  float cluster = fbm(vec3(pp * 3.0, 5.0)) * 0.7 + 0.3 * noise(vec3(pp * 18.0, 1.0));
  float bough = smoothstep(reach + 0.06, reach - 0.08, el) * smoothstep(0.38, 0.55, cluster);
  vec3 bloom = mix(vec3(0.98, 0.6, 0.74), vec3(1.0, 0.86, 0.9), noise(vec3(pp * 30.0, 2.0)));
  bloom *= 0.8 + 0.25 * noise(vec3(pp * 9.0, 4.0));
  // shade deep inside the clusters, light on their edges
  float depth = smoothstep(0.55, 0.75, cluster);
  bloom = mix(bloom, bloom * vec3(0.72, 0.55, 0.62), depth * 0.6);
  c = mix(c, bloom, bough);
  // petals drifting across
  for (int l = 0; l < 2 * uOne; l++) {
    float fl = float(l);
    float k = 10.0 + fl * 9.0;
    vec2 g = vec2(az * k - uTime * (0.22 + fl * 0.1), el * k + uTime * 0.1 + sin(az * 4.0 + uTime) * 0.3);
    vec2 gi = floor(g);
    vec2 o = hash22(gi + fl * 3.0) - 0.5;
    vec2 f = fract(g) - 0.5 - o * 0.6;
    float rot = uTime * (1.0 + hash2(gi)) + hash2(gi + 1.0) * 6.0;
    f = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * f;
    float pet = smoothstep(1.0, 0.65, length(f / vec2(0.11, 0.06)));
    c = mix(c, vec3(1.0, 0.76, 0.84), pet * step(0.45, hash2(gi + 8.0 + fl)) * 0.95);
  }
  return c * (0.9 + 0.15 * uLevel);
}

vec3 sVOYAGE(vec3 d, float az, float el) {
  // drifting through deep space toward the stage: near stars stream past
  // (real parallax - each sits in its own 3D cell), a nebula far beyond
  vec3 c = vec3(0.004, 0.006, 0.018);
  vec3 q = d * 1.3 + vec3(0.0, 0.0, uTime * 0.004);
  float a = fbm(q + fbm(q * 1.6 + 2.0));
  c += vec3(0.32, 0.1, 0.42) * pow(a, 3.0) * 1.2 + vec3(0.06, 0.2, 0.42) * pow(fbm(q * 2.1 - 4.0), 3.0) * 1.1;
  c += milkyway(d) * 0.7 + starfield(d, 0.6, 1.0) * 0.6;
  vec3 ro = vec3(0.0, 0.0, -uTime * 5.0);
  const float CELL = 7.0;
  for (int i = 0; i < 12 * uOne; i++) {
    float dist = 3.0 + float(i) * CELL * 0.75;
    vec3 p = ro + d * dist;
    vec3 cell = floor(p / CELL);
    float h = hash1(cell);
    if (h < 0.55) continue;
    vec3 sp = (cell + 0.15 + 0.7 * vec3(hash1(cell + 7.0), hash1(cell + 13.0), hash1(cell + 29.0))) * CELL;
    vec3 rel = sp - ro;
    float along = dot(rel, d);
    if (along < 0.5) continue;
    float perp = length(rel - d * along);
    float size = 0.012 + 0.03 * hash1(cell + 3.0);
    float b = exp(-perp * perp / (size * size)) * (1.0 / (1.0 + along * 0.04));
    vec3 sc = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.82, 0.6), hash1(cell + 5.0));
    c += sc * b * 3.0;
  }
  return c * (0.9 + 0.3 * uLevel);
}

// stars over the 3D worlds, drawn here at screen resolution where the
// world's cube map marks open sky (alpha)
vec3 worldStars(int id, vec3 d) {
  if (id == ${S_CLOUDS}) return starfield(d, 0.45, 0.6) * 0.5;
  if (id == ${S_PEAKS}) return starfield(d, 1.0, 1.0) * 0.75;
  return vec3(0.0);
}

vec3 scene(int id, vec3 d, float az, float el) {
  if (id == 0) return sARCH(d, az, el);
  if (id == 1) return sSTARS(d, az, el);
  if (id == 2) return sAURORA(d, az, el);
  if (id == 3) return sMOON(d, az, el);
  if (id == 4) return sFOREST(d, az, el);
  if (id == 5) return sOCEAN(d, az, el);
  if (id == 6) return sSUNSET(d, az, el);
  if (id == 7) return sCATHEDRAL(d, az, el);
  if (id == 8) return sGOLD(d, az, el);
  if (id == 9) return sFIREWORKS(d, az, el);
  if (id == 10) return sRAIN(d, az, el);
  if (id == 11) return sSNOW(d, az, el);
  if (id == 12) return sSPRING(d, az, el);
  if (id == 13) return sDECO(d, az, el);
  if (id == 14) return sNEBULA(d, az, el);
  if (id == 15) return sVOYAGE(d, az, el);
  if (id == uCubeAId) { vec4 c = textureCube(uCubeA, d); return c.rgb + worldStars(id, d) * c.a; }
  if (id == uCubeBId) { vec4 c = textureCube(uCubeB, d); return c.rgb + worldStars(id, d) * c.a; }
  return vec3(0.0);
}

void main() {
  vec3 w = vWorld;
  float edgeV = w.y - uEdge.x * w.z - uEdge.y;
  if (edgeV < 0.0) {
    if (uOverlay > 0.5) discard; // (the wall is the same under both worlds)
    // below the screen: the black acoustic wall of the bowl
    float seam = smoothstep(0.0, 0.03, abs(fract(w.y * 0.5) - 0.5) - 0.47);
    vec3 col = vec3(0.012, 0.012, 0.016) + vec3(0.01) * seam;
    col += vec3(0.02, 0.018, 0.016) * smoothstep(-1.5, 0.0, edgeV);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  vec3 d = normalize(w - uView);
  float az = atan(d.x, -d.z);
  float el = asin(clamp(d.y, -1.0, 1.0));
  // One world per pass, through ONE call of scene(). (Two calls - this
  // world and the next, mixed - had every world compiled twice over: on
  // Windows that kept the page frozen for half a minute on a first visit.)
  // A crossfade draws the dome a second time, the next world laid over the
  // first with the mix as its alpha (see buildDome).
  vec3 col = scene(uOverlay > 0.5 ? uB : uA, d, az, el);
  float alpha = 1.0;
  vec3 seam = vec3(0.0);
  if (uOverlay > 0.5) {
    if (uReveal > 0.5) {
      // the roof lifts off: the new world opens from the crown outward,
      // with a bright seam running ahead of it
      float zen = acos(clamp(dot(d, normalize(vec3(0.0, 1.0, 0.35))), -1.0, 1.0));
      float front = uMix * 2.9 - 0.2;
      alpha = smoothstep(front + 0.06, front - 0.06, zen);
      seam = vec3(1.0, 0.9, 0.75) * exp(-abs(zen - front) * 40.0) * 1.2 * (1.0 - uMix);
    } else alpha = uMix;
  }
  col *= uBright;
  // IMAG: the live picture above the stage, with the captions over it
  if (uLive > 0.001) {
    vec2 uv = vec2((az - uLiveRect.x) / (uLiveRect.y - uLiveRect.x), (el - uLiveRect.z) / (uLiveRect.w - uLiveRect.z));
    vec2 q = abs(uv - 0.5) - 0.5 + 0.03;
    float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.03;
    float inside = smoothstep(0.004, -0.004, box);
    if (inside > 0.0) {
      vec3 live = texture2D(uLiveTex, uv).rgb;
      vec4 cap = texture2D(uCapTex, uv);
      live = mix(live, cap.rgb, cap.a);
      col = mix(col, live * 1.05, inside * uLive);
    }
    col += vec3(0.6, 0.65, 0.8) * exp(-max(box, 0.0) * 160.0) * 0.12 * uLive * step(0.0, box);
  }
  // the screen's edge fades into the wall
  col *= smoothstep(0.0, 1.4, edgeV);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // (premultiplied: over the first world it makes mix(first, next, alpha);
  // kept finite and in range whatever happened above - see hash2)
  gl_FragColor = vec4(clamp(gl_FragColor.rgb * alpha + seam * smoothstep(0.0, 1.4, edgeV), 0.0, 16.0), clamp(alpha, 0.0, 1.0));
}`;

// renderer + quality: the ray-traced worlds need the renderer (they are
// drawn into cube maps); phones (lite) show the painted versions instead
const WORLD_QUALITY = {
  high: { size: 640, every: 1 },
  medium: { size: 512, every: 2 },
  low: { size: 384, every: 2 },
};
export function buildDome({ lite = false, renderer = null, quality = 'high' } = {}) {
  const worlds = renderer && !lite ? makeWorldRenderer(renderer, WORLD_QUALITY[quality] || WORLD_QUALITY.high) : null;
  const pick = (name) => (!worlds && LITE_FALLBACK[name]) || name;
  const uniforms = {
    uTime: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 }, uDown: { value: 0 },
    uMix: { value: 0 }, uReveal: { value: 0 }, uLive: { value: 0 }, uHouse: { value: 1 }, uBright: { value: 1 },
    uA: { value: S.ARCH }, uB: { value: S.ARCH }, uOverlay: { value: 0 }, uOne: { value: 1 },
    uView: { value: new THREE.Vector3(SP.VIEW.x, SP.VIEW.y, SP.VIEW.z) },
    uEdge: { value: new THREE.Vector2(SP.EDGE.k, SP.EDGE.d) },
    uLiveTex: { value: null }, uCapTex: { value: null },
    uLiveRect: { value: new THREE.Vector4(-0.34, 0.34, -0.12, 0.26) }, // 16:9, over the shell
    uCubeA: { value: null }, uCubeB: { value: null }, uCubeAId: { value: -1 }, uCubeBId: { value: -1 },
  };
  // (NoBlending: the first world covers the dome; it also keeps this material's
  // program the same as the overlay's - an opaque NormalBlending material is
  // compiled with one extra line, and so twice)
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG(lite), side: THREE.BackSide, fog: false, depthWrite: true, blending: THREE.NoBlending });
  const geo = new THREE.SphereGeometry(SP.R, lite ? 96 : 192, lite ? 64 : 128, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(SP.C.x, SP.C.y, SP.C.z);
  // Opaque architecture writes depth first, rejecting covered dome pixels
  // before the expensive procedural shader. Transparent rails/beams stay last.
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;
  // the next world, during a crossfade: the same program (same shader, the
  // same uniforms but one), drawn over the first and blended by its alpha
  const overMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uOverlay: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG(lite),
    side: THREE.BackSide, fog: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const over = new THREE.Mesh(geo, overMat);
  over.renderOrder = -1;
  over.frustumCulled = false;
  over.visible = false;
  mesh.add(over);

  // ---------------------------------------------- which cube faces are seen
  // The 3D worlds live in a cube map round the sweet spot; only the faces
  // that a camera can actually see on the dome need drawing. A grid of rays
  // per camera finds where it looks on the screen (with a margin round each
  // face's border, where the filtering reaches into the next face).
  let viewers = []; // [{ cam, when? }]
  const _o = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const C = new THREE.Vector3(SP.C.x, SP.C.y, SP.C.z);
  const VIEW = new THREE.Vector3(SP.VIEW.x, SP.VIEW.y, SP.VIEW.z);
  const faceCache = new WeakMap();
  function facesSeen(cam) {
    cam.updateMatrixWorld();
    let cached = faceCache.get(cam);
    // A seated viewer often keeps the same view for an entire piece. Only
    // reuse its visibility mask when every ray input is exactly unchanged;
    // the worlds themselves still render at their normal animated cadence.
    if (cached && cached.world.equals(cam.matrixWorld) && cached.projection.equals(cam.projectionMatrixInverse)
        && cached.radius === SP.R && cached.edgeK === SP.EDGE.k && cached.edgeD === SP.EDGE.d) return cached.mask;
    let mask = 0;
    _o.setFromMatrixPosition(cam.matrixWorld);
    const ox = _o.x - C.x;
    const oy = _o.y - C.y;
    const oz = _o.z - C.z;
    const cc = ox * ox + oy * oy + oz * oz - SP.R * SP.R;
    for (let gy = 0; gy <= 8; gy++) {
      for (let gx = 0; gx <= 10; gx++) {
        _d.set(gx / 5 - 1, gy / 4 - 1, 0.5).unproject(cam).sub(_o).normalize();
        const b = ox * _d.x + oy * _d.y + oz * _d.z;
        const disc = b * b - cc;
        if (disc < 0) continue;
        const t = -b + Math.sqrt(disc);
        if (t <= 0) continue;
        _p.copy(_o).addScaledVector(_d, t);
        if (_p.y - SP.EDGE.k * _p.z - SP.EDGE.d < -0.5) continue; // the wall below the screen
        _p.sub(VIEW);
        const ax = Math.abs(_p.x);
        const ay = Math.abs(_p.y);
        const az = Math.abs(_p.z);
        const lim = Math.max(ax, ay, az) * 0.8;
        if (ax >= lim) mask |= _p.x > 0 ? 1 : 2;
        if (ay >= lim) mask |= _p.y > 0 ? 4 : 8;
        if (az >= lim) mask |= _p.z > 0 ? 16 : 32;
      }
    }
    if (!cached) {
      cached = { world: new THREE.Matrix4(), projection: new THREE.Matrix4() };
      faceCache.set(cam, cached);
    }
    cached.world.copy(cam.matrixWorld);
    cached.projection.copy(cam.projectionMatrixInverse);
    cached.radius = SP.R;
    cached.edgeK = SP.EDGE.k;
    cached.edgeD = SP.EDGE.d;
    cached.mask = mask;
    return mask;
  }
  function faceMask() {
    if (!viewers.length) return 0x3f;
    let m = 0;
    for (const v of viewers) {
      if (v.when && !v.when()) continue;
      m |= v.faces ?? facesSeen(v.cam);
    }
    return m;
  }

  // ------------------------------------------------------------ controller
  const st = {
    cur: 'ARCH', next: null, mix: 0, dur: 4, reveal: false,
    list: ['ARCH'], idx: 0, nextSwap: Infinity, live: 0, liveTarget: 0, bright: 1, brightTarget: 1,
    glow: new THREE.Color(), glowI: 0.2,
  };
  function go(name0, { dur = 4, reveal = false } = {}) {
    const name = pick(name0);
    if (name === st.cur && !st.next) return;
    if (st.next) { st.cur = st.next; }
    st.next = name;
    st.mix = 0;
    st.dur = dur;
    st.reveal = reveal;
    uniforms.uA.value = S[st.cur];
    uniforms.uB.value = S[name];
    uniforms.uReveal.value = reveal ? 1 : 0;
  }
  const api = {
    mesh, uniforms,
    get current() { return st.next || st.cur; },
    setLive(tex, cap) { uniforms.uLiveTex.value = tex; uniforms.uCapTex.value = cap; },
    warm() { worlds?.warm(); },
    // the cameras that look at the dome (the 3D worlds draw what they see)
    setViewers(list) { viewers = list; },
    // the ray-traced worlds on screen now (one, or two in a crossfade): call
    // after the cameras have moved, right before rendering
    drawWorlds() {
      if (!worlds) return;
      const want = [st.cur, st.next].filter((n) => n && WORLDS3D.includes(n));
      worlds.update(want, uniforms.uTime.value, uniforms.uLevel.value, want.length ? faceMask() : 0);
      const [a, b] = worlds.slots;
      uniforms.uCubeA.value = a.world ? a.rt.texture : null;
      uniforms.uCubeAId.value = a.world ? S[a.world] : -1;
      uniforms.uCubeB.value = b.world ? b.rt.texture : null;
      uniforms.uCubeBId.value = b.world ? S[b.world] : -1;
    },
    showLive(on) { st.liveTarget = on ? 1 : 0; },
    // Request the first picture before fade-in and keep it fresh until the
    // shader stops sampling it (uLive > 0.001).
    get liveActive() { return st.liveTarget > 0 || st.live > 0.001; },
    // the house look (walk-in, intermissions)
    house() { st.list = ['ARCH']; st.nextSwap = Infinity; go('ARCH', { dur: 5 }); st.brightTarget = 1; },
    // a piece begins: the roof lifts off into its first world
    startPiece(piece, t0 = 0) {
      st.list = visualsFor(piece);
      st.idx = 0;
      const len = Math.max(30, (piece?.duration || 120) / st.list.length);
      st.swapEvery = len;
      st.nextSwap = t0 + len;
      go(st.list[0], { dur: st.cur === 'ARCH' ? 7 : 3.5, reveal: st.cur === 'ARCH' });
      st.brightTarget = 1;
    },
    finale() { go('FIREWORKS', { dur: 2.5 }); st.nextSwap = Infinity; },
    // straight to a world (for trying them out: __fp.hall.dome.go('FOREST3D'))
    go(name, opt = { dur: 1.5 }) { st.nextSwap = Infinity; go(name, opt); },
    dim(v) { st.brightTarget = v; },
    // Keep face-mask/crossfade scheduling while resizing existing targets.
    setQuality(q) {
      if (!worlds) return;
      const profile = WORLD_QUALITY[q] || WORLD_QUALITY.high;
      worlds.every = profile.every;
      worlds.setSize(profile.size);
    },
    invalidate() { worlds?.invalidate(); },
    update(dt, { time = 0, level = 0, beat = 0, down = 0, playing = false } = {}) {
      uniforms.uTime.value += dt;
      uniforms.uLevel.value += (Math.min(1, level * 5) - uniforms.uLevel.value) * Math.min(1, dt * 4);
      uniforms.uBeat.value = beat;
      uniforms.uDown.value = down;
      if (playing && time > st.nextSwap && st.list.length > 1) {
        st.idx = (st.idx + 1) % st.list.length;
        st.nextSwap = time + st.swapEvery;
        go(st.list[st.idx], { dur: 6 });
      }
      if (st.next) {
        st.mix = Math.min(1, st.mix + dt / st.dur);
        const e = st.mix < 0.5 ? 2 * st.mix * st.mix : 1 - Math.pow(-2 * st.mix + 2, 2) / 2;
        uniforms.uMix.value = e;
        over.visible = e > 0.001;
        if (st.mix >= 1) {
          st.cur = st.next;
          st.next = null;
          uniforms.uA.value = S[st.cur];
          uniforms.uMix.value = 0;
          uniforms.uReveal.value = 0;
          over.visible = false;
        }
      }
      st.live += (st.liveTarget - st.live) * Math.min(1, dt * 1.2);
      uniforms.uLive.value = st.live;
      st.bright += (st.brightTarget - st.bright) * Math.min(1, dt * 0.8);
      uniforms.uBright.value = st.bright;
      // (the 3D worlds are drawn later, in drawWorlds, once the cameras
      // have moved for this frame)
      // the light the dome throws into the room
      const ga = GLOW[st.cur];
      const gb = st.next ? GLOW[st.next] : ga;
      const m = uniforms.uMix.value;
      st.glow.setRGB(ga[0] + (gb[0] - ga[0]) * m, ga[1] + (gb[1] - ga[1]) * m, ga[2] + (gb[2] - ga[2]) * m);
      st.glowI = (ga[3] + (gb[3] - ga[3]) * m) * st.bright * (0.85 + 0.4 * uniforms.uLevel.value);
      return { color: st.glow, intensity: st.glowI };
    },
  };
  return api;
}
