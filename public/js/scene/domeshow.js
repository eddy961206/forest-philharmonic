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
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash22(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
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

vec3 milkyway(vec3 d) {
  vec3 n = normalize(vec3(0.35, 0.55, -0.75));
  float band = 1.0 - abs(dot(d, n));
  float m = pow(band, 9.0);
  float f = fbm(d * 3.0 + 4.0);
  vec3 col = mix(vec3(0.25, 0.18, 0.45), vec3(0.55, 0.6, 0.8), f);
  return col * m * (0.4 + 0.8 * f) * 0.6;
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

vec3 sSTARS(vec3 d, float az, float el) {
  vec3 sky = mix(vec3(0.02, 0.035, 0.08), vec3(0.0, 0.005, 0.02), smoothstep(-0.2, 1.2, el));
  sky += vec3(0.05, 0.06, 0.12) * exp(-max(el + 0.25, 0.0) * 3.0);
  vec3 c = sky + milkyway(d) + starfield(d, 1.0, 1.0);
  // a shooting star now and then
  float t = uTime * 0.13;
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
  float trail = step(0.0, along) * exp(-along * 9.0) * exp(-across * across * 40000.0) * smoothstep(0.0, 0.1, f) * smoothstep(0.6, 0.3, f);
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
  vec3 c = sky + starfield(d, 0.5, 1.0) * (1.0 - disc) + halo + moon;
  vec3 cl = clouds(d, el, vec3(0.42, 0.45, 0.55) + halo * 0.8, vec3(0.03, 0.04, 0.07), 0.42, 0.012);
  float cm = max(max(cl.r, cl.g), cl.b) > 0.0 ? 1.0 : 0.0;
  c = mix(c, cl, clamp(length(cl) * 4.0, 0.0, 0.9) * step(-0.15, el));
  return c;
}

vec3 sFOREST(vec3 d, float az, float el) {
  // standing in a clearing in an old forest: a hazy tree line all round,
  // tall trunks rising past you and converging overhead into a canopy
  // that opens on a bright morning sky; sun shafts through the leaves
  float up = clamp(d.y, -0.2, 1.0);
  vec3 sky = mix(vec3(0.62, 0.8, 0.95), vec3(0.95, 0.96, 0.9), smoothstep(0.75, 1.0, up));
  vec3 c = sky;
  // distant tree lines, three layers of bumpy crowns fading into the haze
  for (int l = 0; l < 3 * uOne; l++) {
    float fl = float(l);
    float h = 0.035 + fl * 0.04 + 0.035 * fbm(vec3(az * (3.0 + fl * 2.0), fl * 4.0, 1.0)) + 0.02 * abs(sin(az * (90.0 - fl * 25.0) + fl)) ;
    float m = smoothstep(h + 0.003, h - 0.003, el);
    vec3 tree = mix(vec3(0.05, 0.12, 0.07), vec3(0.3, 0.42, 0.4), 1.0 - fl / 2.5);
    tree = mix(tree, sky, 0.5 - fl * 0.2);
    c = mix(c, tree * (0.8 + 0.25 * noise(vec3(az * 80.0, el * 80.0, fl))), m);
  }
  // the canopy overhead, with gaps of sky; sunlit edges
  vec2 pp = d.xz / max(d.y + 0.15, 0.05);
  float sway = sin(uTime * 0.3) * 0.04;
  float leaves = fbm(vec3(pp * 2.2 + sway, uTime * 0.015)) * 0.75 + 0.25 * noise(vec3(pp * 14.0, 3.0));
  float cover = smoothstep(0.25, 0.6, el) * (1.0 - smoothstep(0.92, 1.0, up) * 0.6);
  float canopy = smoothstep(0.62, 0.42, leaves + (1.0 - cover) * 0.5);
  vec3 leafCol = mix(vec3(0.04, 0.12, 0.04), vec3(0.28, 0.5, 0.14), fbm(vec3(pp * 5.0, 1.0)));
  leafCol += vec3(0.75, 0.7, 0.25) * smoothstep(0.05, 0.0, abs(leaves - 0.5)) * 0.45;
  c = mix(c, leafCol, canopy * cover);
  // trunks: dark columns rising from the tree line into the canopy
  float N = 34.0;
  float u = (az + PI) / (2.0 * PI) * N + 0.2 * noise(vec3(az * 3.0, 0.0, 2.0));
  float idx = floor(u);
  float on = step(0.35, hash2(vec2(idx, 7.0)));
  float w = mix(0.2, 0.05, smoothstep(0.0, 0.8, el)) * (0.55 + 0.6 * hash2(vec2(idx, 1.0)));
  float cxu = fract(u) - 0.5;
  float trunk = smoothstep(w, w - 0.015, abs(cxu)) * smoothstep(-0.02, 0.06, el) * (1.0 - smoothstep(0.5, 0.8, el)) * on;
  float barkLines = noise(vec3(u * 40.0, el * 6.0, idx));
  vec3 bark = vec3(0.1, 0.07, 0.05) * (0.6 + 0.7 * barkLines);
  bark += vec3(0.55, 0.45, 0.25) * smoothstep(0.0, w, cxu) * 0.35; // the sunlit side
  c = mix(c, bark, trunk);
  // light shafts from the sun high in front
  vec3 sd = normalize(vec3(0.15, 0.75, -0.65));
  float ray = pow(max(dot(d, sd), 0.0), 5.0) * (0.45 + 0.55 * noise(vec3(az * 26.0, uTime * 0.2, 0.0)));
  c += vec3(1.0, 0.92, 0.65) * ray * 0.4;
  // pollen and fireflies drifting low
  vec2 g = vec2(az * 30.0, el * 30.0 + uTime * 0.2);
  vec2 gi = floor(g);
  vec2 off = hash22(gi) - 0.5;
  float ff = exp(-dot(fract(g) - 0.5 - off * 0.6, fract(g) - 0.5 - off * 0.6) * 260.0) * step(0.88, hash2(gi + 9.0)) * smoothstep(0.4, 0.0, el);
  c += vec3(1.0, 0.92, 0.5) * ff * (0.6 + 0.4 * sin(uTime * 3.0 + gi.x)) * 1.2;
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
  float h = el;
  vec3 c = mix(vec3(1.0, 0.45, 0.2), vec3(0.95, 0.5, 0.55), smoothstep(-0.1, 0.25, h));
  c = mix(c, vec3(0.35, 0.25, 0.55), smoothstep(0.2, 0.7, h));
  c = mix(c, vec3(0.05, 0.08, 0.25), smoothstep(0.6, 1.4, h));
  vec3 sd = normalize(vec3(0.0, 0.03, -1.0));
  float a = acos(clamp(dot(d, sd), -1.0, 1.0));
  c += vec3(1.0, 0.75, 0.4) * (smoothstep(0.06, 0.05, a) * 2.5 + exp(-a * 5.0) * 0.6 + exp(-a * 1.5) * 0.15);
  vec3 cl = clouds(d, el, vec3(1.0, 0.55, 0.45), vec3(0.25, 0.12, 0.25), 0.5, 0.008);
  c = mix(c, cl, clamp(length(cl) * 1.3, 0.0, 0.85) * smoothstep(-0.05, 0.1, el));
  c += starfield(d, 0.6, 1.0) * smoothstep(0.9, 1.4, el);
  return c * (0.8 + 0.2 * uLevel);
}

vec3 sCATHEDRAL(vec3 d, float az, float el) {
  // a gothic rose window over the stage, lancet windows round the walls,
  // vault ribs meeting overhead; light pulses with the music
  vec3 stone = vec3(0.05, 0.045, 0.05) * (0.7 + 0.4 * fbm(d * 18.0));
  vec3 c = stone;
  // vault ribs: meridians and parallels
  float lon = az * 8.0 / PI;
  float rib = smoothstep(0.0, 0.06, abs(fract(lon) - 0.5) - 0.44) * smoothstep(0.2, 0.5, el);
  c += vec3(0.2, 0.17, 0.13) * rib;
  // rose window
  vec3 rc = normalize(vec3(0.0, 0.42, -0.9));
  float a = acos(clamp(dot(d, rc), -1.0, 1.0));
  vec3 rx = normalize(cross(rc, vec3(0.0, 1.0, 0.0)));
  vec3 ry = cross(rx, rc);
  float ang = atan(dot(d, ry), dot(d, rx));
  float R = 0.42;
  if (a < R) {
    float rr = a / R;
    float ring = floor(rr * 7.0);
    float seg = 12.0 + ring * 6.0;
    float sa = ang / (2.0 * PI) * seg;
    float cell = floor(sa + ring * 0.5);
    float h = hash2(vec2(cell, ring));
    vec3 glass = h < 0.33 ? vec3(0.1, 0.25, 0.85) : h < 0.6 ? vec3(0.85, 0.1, 0.15) : h < 0.82 ? vec3(0.95, 0.75, 0.2) : vec3(0.1, 0.6, 0.35);
    float lead = smoothstep(0.0, 0.08, abs(fract(sa + ring * 0.5) - 0.5) - 0.42) + smoothstep(0.0, 0.06, abs(fract(rr * 7.0) - 0.5) - 0.44);
    float petal = smoothstep(0.02, 0.0, abs(rr - 0.5 - 0.08 * cos(ang * 8.0)) - 0.012);
    vec3 win = glass * (0.55 + 0.8 * noise(vec3(sa * 4.0, rr * 30.0, 0.0))) * (0.9 + 0.8 * uLevel + 0.5 * uBeat);
    win = mix(win, vec3(0.02), clamp(lead + petal, 0.0, 1.0));
    win = mix(win, vec3(1.0, 0.9, 0.7) * 1.5, smoothstep(0.08, 0.0, rr));
    c = mix(c, win, smoothstep(R, R - 0.01, a));
    c += vec3(0.02) * smoothstep(R + 0.03, R, a);
  }
  // lancets: tall pointed windows of small leaded panes
  float n = 10.0;
  float u = (az + PI) / (2.0 * PI) * n;
  float cx = fract(u) - 0.5;
  float top = 0.5 - 1.6 * cx * cx;
  bool front = abs(az) < 0.7;
  if (!front && el > -0.12 && el < top && abs(cx) < 0.14) {
    float k = floor(u);
    float py = (el + 0.12) * 34.0;
    float px = cx * 26.0;
    vec2 pane = vec2(floor(px), floor(py));
    float h = hash2(pane + k * 13.0);
    vec3 glass = h < 0.38 ? vec3(0.12, 0.22, 0.75) : h < 0.62 ? vec3(0.78, 0.12, 0.16) : h < 0.8 ? vec3(0.92, 0.72, 0.22) : h < 0.92 ? vec3(0.12, 0.5, 0.3) : vec3(0.55, 0.2, 0.6);
    glass *= 0.55 + 0.6 * noise(vec3(px * 3.0, py * 3.0, k)) ;
    float lead = max(smoothstep(0.0, 0.07, abs(fract(py) - 0.5) - 0.42), smoothstep(0.0, 0.07, abs(fract(px) - 0.5) - 0.42));
    float frame = smoothstep(0.125, 0.14, abs(cx)) + smoothstep(top - 0.015, top, el);
    c = mix(glass * (0.75 + 0.6 * uLevel + 0.3 * uBeat), vec3(0.015), clamp(lead + frame, 0.0, 1.0));
  }
  // shafts of coloured light coming down
  c += vec3(0.5, 0.4, 0.7) * pow(max(dot(d, rc), 0.0), 18.0) * 0.4;
  return c;
}

vec3 sGOLD(vec3 d, float az, float el) {
  vec3 q = d * 2.2;
  float t = uTime * 0.07;
  vec3 w = vec3(fbm(q + t), fbm(q + 5.2 - t), fbm(q + 9.7 + t * 0.5));
  float f = fbm(q + 2.5 * w + uBeat * 0.3);
  vec3 c = mix(vec3(0.02, 0.01, 0.0), vec3(0.55, 0.32, 0.05), smoothstep(0.3, 0.6, f));
  c = mix(c, vec3(1.0, 0.82, 0.4), smoothstep(0.6, 0.8, f));
  c += vec3(1.0, 0.95, 0.8) * pow(smoothstep(0.75, 0.9, f), 3.0) * 1.5;
  // rings ripple out from the stage on strong beats
  float a = acos(clamp(dot(d, normalize(vec3(0.0, 0.0, -1.0))), -1.0, 1.0));
  c += vec3(1.0, 0.8, 0.4) * exp(-abs(a - (1.0 - uDown) * 2.0) * 30.0) * uDown * 1.2;
  return c * (0.75 + 0.45 * uLevel);
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
  // a night storm overhead: low clouds racing, rain falling past the
  // horizon, now and then lightning lighting the clouds from inside
  vec3 c = mix(vec3(0.07, 0.085, 0.11), vec3(0.015, 0.02, 0.03), smoothstep(-0.2, 1.0, el));
  float bolt = 0.0;
  {
    float t = uTime * 0.18;
    float k = floor(t);
    float f = fract(t);
    float on = step(0.55, hash2(vec2(k, 2.0)));
    bolt = on * (exp(-f * 40.0) + 0.6 * exp(-abs(f - 0.06) * 60.0));
  }
  vec3 cl = clouds(d, el, vec3(0.2, 0.22, 0.27) + bolt * vec3(0.6, 0.65, 0.8), vec3(0.035, 0.04, 0.055), 0.8, 0.025);
  c += cl * 0.9;
  // rain: fine streaks falling past the lower dome
  for (int l = 0; l < 2 * uOne; l++) {
    float fl = float(l);
    vec2 g = vec2(az * (90.0 + fl * 70.0), el * (6.0 + fl * 3.0) + uTime * (3.0 + fl * 1.3));
    vec2 gi = floor(g);
    float h = hash2(gi + fl * 7.0);
    float x = abs(fract(g.x) - 0.5 - (h - 0.5) * 0.6);
    float y = fract(g.y + h);
    float streak = smoothstep(0.08, 0.0, x) * smoothstep(0.0, 0.25, y) * smoothstep(1.0, 0.55, y) * step(0.5, h);
    c += vec3(0.5, 0.56, 0.66) * streak * 0.3 * smoothstep(0.75, 0.1, el);
  }
  // drops on the glass, catching the light
  vec2 g = vec2(az * 16.0, el * 16.0);
  vec2 gi = floor(g);
  vec2 o = hash22(gi) * 0.6 + 0.2;
  vec2 f = fract(g) - o;
  float r = 0.05 + 0.09 * hash2(gi + 2.0);
  float drop = smoothstep(r, r * 0.65, length(f * vec2(1.0, 0.8))) * step(0.35, hash2(gi + 5.0));
  c = c * (1.0 - drop * 0.3) + vec3(0.35, 0.4, 0.5) * drop * 0.25 + vec3(0.9) * drop * smoothstep(r * 0.45, 0.0, length(f + vec2(r * 0.3, -r * 0.3))) * 0.35;
  c += vec3(0.75, 0.8, 1.0) * bolt * 0.06;
  return c;
}

vec3 sSNOW(vec3 d, float az, float el) {
  vec3 c = mix(vec3(0.12, 0.16, 0.24), vec3(0.02, 0.03, 0.07), smoothstep(-0.25, 1.1, el));
  c += vec3(0.25, 0.3, 0.38) * exp(-max(el + 0.2, 0.0) * 5.0);
  for (int l = 0; l < 3 * uOne; l++) {
    float fl = float(l);
    float k = 16.0 + fl * 16.0;
    vec2 g = vec2(az * k + sin(uTime * 0.4 + el * 6.0 + fl) * 0.4, el * k + uTime * (0.35 + fl * 0.25));
    vec2 gi = floor(g);
    vec2 o = hash22(gi + fl * 13.0) - 0.5;
    float s = exp(-dot(fract(g) - 0.5 - o * 0.7, fract(g) - 0.5 - o * 0.7) * (220.0 + fl * 180.0));
    c += vec3(0.95, 0.97, 1.0) * s * step(0.4, hash2(gi + 5.0 + fl)) * (1.2 - fl * 0.3);
  }
  return c;
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
  // (premultiplied: over the first world it makes mix(first, next, alpha))
  gl_FragColor = vec4(gl_FragColor.rgb * alpha + seam * smoothstep(0.0, 1.4, edgeV), alpha);
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
  function facesSeen(cam) {
    let mask = 0;
    cam.updateMatrixWorld();
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
