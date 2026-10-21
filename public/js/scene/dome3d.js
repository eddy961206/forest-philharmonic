// The Sphere's 3D worlds: places with real depth that the audience flies
// through - an old forest, the sea floor, a sea of clouds at sunset, snowy
// peaks under the aurora. Each is ray-traced per direction from the bowl's
// sweet spot into a cube map (so its cost does not grow with the screen's
// resolution, and the broadcast camera gets it for free); the dome samples
// the cube. Flying forward means flying toward the stage (-z).
//
// Techniques: trunks and kelp are found exactly by walking a 2D cell grid
// along the ray (one candidate per cell); the sea floor, cloud tops and
// mountains are height fields marched with adaptive steps and refined;
// distance fog / water absorption / night haze give the depth.
import * as THREE from 'three';

export const WORLDS3D = ['FOREST3D', 'OCEAN3D', 'CLOUDS3D', 'PEAKS3D'];

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform float uT;      // seconds since this world began (the flight)
uniform float uTime;   // global clock (water, wind)
uniform float uLevel;
uniform int uWorld;
#define PI 3.14159265
// 1 where open sky shows (the dome adds stars there at full resolution:
// points drawn into the cube map would turn into blocks when magnified)
float gSky = 0.0;

float h2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p) { float n = h2(p); return vec2(n, h2(p + n + 17.17)); }
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), u.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p, int oct) {
  float a = 0.5; float s = 0.0;
  for (int i = 0; i < 7; i++) { if (i >= oct) break; s += a * vn(p); p = ROT * p; a *= 0.5; }
  return s;
}
float ridged(vec2 p, int oct) {
  float a = 0.5; float s = 0.0;
  for (int i = 0; i < 7; i++) { if (i >= oct) break; float n = 1.0 - abs(vn(p) * 2.0 - 1.0); s += a * n * n; p = ROT * p; a *= 0.5; }
  return s;
}

// --- exact ray vs one upright cylinder per grid cell (trunks, kelp) -------
// cell: size; returns t (3D) of the first hit or 1e9; nrm = xz normal; info = (cx, cz, r)
float pathX(float z) { return 3.0 * sin(z * 0.035) + 1.6 * sin(z * 0.011 + 1.0); }
// the line each flight follows (x at z): the trunks and kelp keep clear of it
float seaX(float z) { return 2.5 * sin(z * 0.03); }
float laneX(float z) { return uWorld == 1 ? seaX(z) : pathX(z); }
vec3 trunkIn(vec2 c, float cell, float keep, float clear, float rmin, float rmax) {
  if (h2(c) < keep) return vec3(0.0, 0.0, -1.0);
  vec2 j = h22(c + 3.1) - 0.5;
  vec2 p = (c + 0.5) * cell + j * cell * 0.5;
  if (abs(p.x - laneX(p.y)) < clear) return vec3(0.0, 0.0, -1.0);
  return vec3(p, rmin + (rmax - rmin) * h2(c + 9.7));
}
float gridCyl(vec3 ro, vec3 rd, float tmax, float cell, float keep, float clear, float rmin, float rmax, out vec2 nrm, out vec3 info) {
  vec2 o = ro.xz;
  vec2 d = rd.xz;
  float len = length(d);
  nrm = vec2(0.0); info = vec3(0.0);
  if (len < 1e-4) return 1e9;
  vec2 dn = d / len;
  dn += vec2(dn.x == 0.0 ? 1e-5 : 0.0, dn.y == 0.0 ? 1e-5 : 0.0);
  vec2 c = floor(o / cell);
  vec2 st = sign(dn);
  vec2 tD = abs(cell / dn);
  vec2 nx = ((c + max(st, 0.0)) * cell - o) / dn;
  float smax = tmax * len;
  for (int i = 0; i < 32; i++) {
    vec3 tr = trunkIn(c, cell, keep, clear, rmin, rmax);
    if (tr.z > 0.0) {
      vec2 oc = o - tr.xy;
      float b = dot(oc, dn);
      float cc = dot(oc, oc) - tr.z * tr.z;
      float disc = b * b - cc;
      if (disc > 0.0) {
        float s = -b - sqrt(disc);
        if (s > 0.0 && s < smax) { nrm = normalize(oc + dn * s); info = tr; return s / len; }
      }
    }
    if (nx.x < nx.y) { c.x += st.x; nx.x += tD.x; } else { c.y += st.y; nx.y += tD.y; }
    if (min(nx.x, nx.y) > smax) break;
  }
  return 1e9;
}

// ============================================================== FOREST
// each tree's crown over its trunk (in the lower canopy layer): the trunk
// rises into it, and it shades the floor under the tree
float crownAt(vec2 p) {
  vec2 c0 = floor(p / 5.0);
  float best = 0.0;
  float wob = (vn(p * 0.8) - 0.5) * 1.4;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec3 tr = trunkIn(c0 + vec2(float(i), float(j)), 5.0, 0.28, 2.6, 0.22, 0.75);
      if (tr.z <= 0.0) continue;
      float r = 2.6 + tr.z * 3.0;
      best = max(best, smoothstep(r, r * 0.55, length(p - tr.xy) + wob));
    }
  }
  return best;
}
// walking-pace flight down a winding lane through an old beech forest
vec3 forest(vec3 rd) {
  float z0 = -uT * 1.5;
  vec3 ro = vec3(pathX(z0), 1.9 + 0.15 * sin(uT * 0.5), z0);
  // look along the lane: turn the world with the path's heading
  float dz = -2.0;
  float hx = pathX(z0 + dz) - pathX(z0);
  float yaw = atan(hx, -dz) * 0.8;
  float cy = cos(yaw); float sy = sin(yaw);
  rd = vec3(cy * rd.x + sy * rd.z, rd.y, -sy * rd.x + cy * rd.z);
  vec3 sun = normalize(vec3(0.25, 0.55, -0.8));
  vec3 sky = mix(vec3(0.72, 0.85, 0.98), vec3(1.0, 0.97, 0.88), pow(max(dot(rd, sun), 0.0), 6.0));
  const float C1 = 15.0; const float C2 = 22.0;
  float tmax = 140.0;
  vec2 tn; vec3 ti;
  float tt = gridCyl(ro, rd, tmax, 5.0, 0.28, 2.6, 0.22, 0.75, tn, ti);
  if (ro.y + rd.y * tt > C1 + 1.5) tt = 1e9; // above that it is inside its crown
  float tg = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  float t = min(tt, tg);
  vec3 col;
  // canopy coverage at a point of a layer (and the light through it)
  #define COVER(P, S) smoothstep(0.42, 0.62, fbm((P) * (S), 4))
  if (t >= 1e8 && rd.y > 0.0) {
    // up through the two canopy layers to the sky
    float t1 = (C1 - ro.y) / rd.y;
    float t2 = (C2 - ro.y) / rd.y;
    vec2 p1 = (ro + rd * t1).xz;
    vec2 p2 = (ro + rd * t2).xz;
    float c1 = max(COVER(p1, 0.11) * 0.85, crownAt(p1) * 0.95);
    float c2 = COVER(p2 + 40.0, 0.07);
    vec3 leafLit = vec3(0.42, 0.62, 0.16);
    vec3 leafDark = vec3(0.05, 0.12, 0.04);
    float tr = pow(max(dot(rd, sun), 0.0), 3.0);
    vec3 l2 = mix(leafDark, leafLit + vec3(0.4, 0.4, 0.1) * tr, 0.35 + 0.5 * (1.0 - c2));
    vec3 l1 = mix(leafDark * 0.8, leafLit * 0.9 + vec3(0.3, 0.3, 0.08) * tr, 0.25 + 0.5 * (1.0 - c1));
    col = mix(sky, l2, c2);
    col = mix(col, l1, c1);
    col = mix(col, vec3(0.6, 0.72, 0.62), 1.0 - exp(-t1 * 0.006));
  } else if (t >= 1e8) {
    col = sky;
  } else {
    vec3 p = ro + rd * t;
    // sunlight reaching p through the canopy (dappled, moving with the wind)
    vec2 q1 = p.xz + sun.xz / sun.y * (C1 - p.y) + vec2(sin(uTime * 0.3), 0.0) * 0.3;
    vec2 q2 = p.xz + sun.xz / sun.y * (C2 - p.y) + 40.0;
    float light = (1.0 - max(COVER(q1, 0.11) * 0.85, crownAt(q1) * 0.9)) * (1.0 - COVER(q2, 0.07) * 0.9);
    if (tt < tg) {
      vec3 n = vec3(tn.x, 0.0, tn.y);
      float ang = atan(tn.y, tn.x);
      float bark = vn(vec2(ang * 5.0 + ti.x, p.y * 1.4)) * 0.6 + vn(vec2(ang * 22.0, p.y * 9.0)) * 0.4;
      vec3 base = mix(vec3(0.03, 0.024, 0.02), vec3(0.17, 0.14, 0.1), bark * bark); // old bark, deep furrows
      base = mix(base, vec3(0.12, 0.2, 0.06), smoothstep(1.2, 0.0, p.y) * 0.6 + smoothstep(0.55, 0.8, vn(vec2(ang * 3.0, p.y * 0.5))) * 0.4); // moss
      float lam = max(dot(n, sun), 0.0);
      col = base * (0.08 + 1.15 * lam * light);
      col += vec3(0.04, 0.08, 0.03) * max(-n.y + 0.5, 0.0); // green bounce from the floor
      col *= 0.85 + 0.15 * smoothstep(0.0, 1.5, p.y);
      // high up, the trunk disappears into the leaves
      if (p.y > C1 - 3.0 && rd.y > 0.0) {
        vec2 pc = (ro + rd * ((C1 - ro.y) / rd.y)).xz;
        float cv = max(COVER(pc, 0.11), crownAt(pc));
        vec3 leaf = mix(vec3(0.04, 0.1, 0.035), vec3(0.36, 0.55, 0.14), 0.25 + 0.4 * (1.0 - cv));
        float m = max(cv * smoothstep(C1 - 3.0, C1 + 0.5, p.y), smoothstep(C1, C2 - 2.0, p.y));
        col = mix(col, leaf, clamp(m, 0.0, 1.0));
      }
    } else {
      float m = fbm(p.xz * 0.6, 4);
      vec3 litter = mix(vec3(0.16, 0.11, 0.05), vec3(0.32, 0.22, 0.1), m);
      vec3 moss = vec3(0.12, 0.2, 0.05) * (0.7 + 0.6 * vn(p.xz * 3.0));
      vec3 base = mix(litter, moss, smoothstep(0.45, 0.7, fbm(p.xz * 0.15 + 7.0, 3)));
      // the lane is a faint path
      base = mix(base, vec3(0.3, 0.25, 0.17), smoothstep(1.4, 0.6, abs(p.x - pathX(p.z))) * 0.5);
      col = base * (0.22 + 1.4 * light);
      // trunk shadow cast toward us (approx: dark where a trunk stands near)
    }
    // the forest air: deep green in the shade, golden toward the sun
    vec3 fogc = mix(vec3(0.12, 0.17, 0.12), vec3(0.5, 0.47, 0.33), pow(max(dot(rd, sun), 0.0), 4.0));
    col = mix(col, fogc, 1.0 - exp(-t * 0.011));
  }
  // shafts of light hanging in the air toward the sun: as bright as the
  // air they cross (a near trunk stays a dark silhouette against them)
  float air = t < 1e8 ? 1.0 - exp(-t * 0.035) : 1.0;
  float shaft = pow(max(dot(rd, sun), 0.0), 10.0) * (0.4 + 0.6 * vn(vec2(atan(rd.x, rd.z) * 40.0, uT * 0.05)));
  col += vec3(1.0, 0.92, 0.7) * shaft * 0.5 * air;
  return col * (0.9 + 0.2 * uLevel);
}


// Giant kelp: a stalk that leans and sways more toward the top, hung with
// long fronds that widen and narrow along it. Found by walking the cell
// grid (one plant per cell), then sampling across the plant's reach.
// info: x = how far along a frond (0..1), y = height on the plant (0..1),
// z = which side the fronds face us (for the light through them)
float kelpGrid(vec3 ro, vec3 rd, float tmax, out vec3 info) {
  const float cell = 5.0;
  const float RB = 1.1; // the reach of the fronds plus the sway
  info = vec3(0.0);
  vec2 o = ro.xz;
  vec2 d = rd.xz;
  float len = length(d);
  if (len < 1e-4) return 1e9;
  vec2 dn = d / len;
  dn += vec2(dn.x == 0.0 ? 1e-5 : 0.0, dn.y == 0.0 ? 1e-5 : 0.0);
  vec2 c = floor(o / cell);
  vec2 st = sign(dn);
  vec2 tD = abs(cell / dn);
  vec2 nx = ((c + max(st, 0.0)) * cell - o) / dn;
  float smax = tmax * len;
  for (int i = 0; i < 24; i++) {
    vec3 tr = trunkIn(c, cell, 0.45, 3.0, 0.1, 0.2);
    if (tr.z > 0.0) {
      vec2 oc = o - tr.xy;
      float b = dot(oc, dn);
      float disc = b * b - (dot(oc, oc) - RB * RB);
      if (disc > 0.0) {
        float sq = sqrt(disc);
        float s0 = max(-b - sq, 0.0);
        float s1 = min(-b + sq, smax);
        float top = 6.0 + 9.0 * h2(tr.xy * 0.37);
        float ph = h2(tr.xy + 5.3) * 6.28;
        for (int k = 0; k < 10; k++) {
          float s = mix(s0, s1, (float(k) + 0.5) / 10.0);
          if (s > s1) break;
          vec3 p = ro + rd * (s / len);
          if (p.y < 0.0 || p.y > top) continue;
          float h = p.y / top;
          vec2 axis = tr.xy + vec2(sin(uTime * 0.45 + ph + p.y * 0.22), 0.6 * cos(uTime * 0.37 + ph * 1.7 + p.y * 0.18)) * 0.75 * h * h;
          vec2 rel = p.xz - axis;
          float r = length(rel);
          // a frond every ~0.9 m, alternating sides, widest in its middle
          float f = fract(p.y * 1.1 + ph);
          float lobe = sin(f * PI);
          float side = sin(atan(rel.y, rel.x) * 2.0 + floor(p.y * 1.1 + ph) * 2.4);
          float reach = 0.09 + 0.55 * lobe * smoothstep(0.05, 0.25, h) * (0.55 + 0.45 * side);
          if (r < reach) {
            info = vec3(f, h, 0.5 + 0.5 * side);
            return s / len;
          }
        }
      }
    }
    if (nx.x < nx.y) { c.x += st.x; nx.x += tD.x; } else { c.y += st.y; nx.y += tD.y; }
    if (min(nx.x, nx.y) > smax) break;
  }
  return 1e9;
}

// ================================================================ OCEAN
float sdEll(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-4); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
// a humpback swimming toward +x: body, tapering tail stock, beating
// flukes, long pectoral fins; the body undulates a little as it swims
float whale(vec3 p) {
  float sw = sin(uTime * 1.1 - p.x * 0.3);
  p.y -= sw * 0.28 * smoothstep(1.0, -10.0, p.x);
  float d = sdEll(p - vec3(1.5, 0.0, 0.0), vec3(8.2, 2.0, 2.3));
  d = smin(d, sdEll(p - vec3(-6.8, 0.1, 0.0), vec3(4.2, 0.85, 0.75)), 1.3);
  vec3 f = p - vec3(-10.8, 0.1, 0.0);
  f.x -= 0.25 * abs(f.z); // swept back
  d = smin(d, sdEll(f, vec3(0.9, 0.16, 3.1)), 0.5);
  vec3 q = p - vec3(3.6, -1.2, 0.0);
  q.z = abs(q.z) - 1.9;
  q.x += q.z * 0.55; // fins angled back
  d = smin(d, sdEll(q, vec3(1.0, 0.14, 2.6)), 0.45);
  return d;
}
vec3 whaleNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.06;
  return normalize(k.xyy * whale(p + k.xyy * e) + k.yyx * whale(p + k.yyx * e) + k.yxy * whale(p + k.yxy * e) + k.xxx * whale(p + k.xxx * e));
}
float seabed(vec2 p) {
  float rocks = smoothstep(0.62, 0.72, fbm(p * 0.12 + 11.0, 3)) * 1.2 * (0.6 + 0.4 * vn(p * 0.9));
  return 1.6 * fbm(p * 0.05, 4) + 0.35 * sin(p.x * 0.35 + p.y * 0.12) * vn(p * 0.08) + rocks;
}
vec3 waterCol(vec3 rd) {
  return mix(vec3(0.0, 0.035, 0.07), vec3(0.06, 0.42, 0.58), smoothstep(-0.5, 0.9, rd.y));
}
vec3 ocean(vec3 rd) {
  float z0 = -uT * 1.1;
  vec3 ro = vec3(seaX(z0), 6.0 + 0.8 * sin(uT * 0.07), z0);
  const float SURF = 26.0;
  float t = 1e9;
  vec3 col;
  // the sea floor
  if (rd.y < 0.0) {
    float tt = 0.0;
    for (int i = 0; i < 56; i++) {
      vec3 p = ro + rd * tt;
      float h = p.y - seabed(p.xz);
      if (h < 0.02) { t = tt; break; }
      tt += max(0.08, h * 0.55);
      if (tt > 80.0) break;
    }
  }
  // kelp forest
  vec3 ki;
  float tk = kelpGrid(ro, rd, min(t, 80.0), ki);
  if (tk < t) {
    // olive-brown fronds, golden where the light from the surface comes
    // through them (looking up), darker toward the root
    vec3 deep = vec3(0.02, 0.035, 0.015);
    vec3 lit = vec3(0.16, 0.2, 0.06);
    vec3 kc = mix(deep, lit, (0.35 + 0.65 * ki.z) * (0.4 + 0.6 * ki.y));
    kc *= 0.75 + 0.35 * sin(ki.x * PI); // the vein down each frond's middle
    kc += vec3(0.22, 0.3, 0.08) * pow(max(rd.y, 0.0), 1.5) * (0.3 + 0.7 * ki.y) * sin(ki.x * PI);
    col = kc;
    t = tk;
  } else if (t < 1e8) {
    vec3 p = ro + rd * t;
    vec2 e = vec2(0.15, 0.0);
    vec3 n = normalize(vec3(seabed(p.xz - e.xy) - seabed(p.xz + e.xy), 2.0 * e.x, seabed(p.xz - e.yx) - seabed(p.xz + e.yx)));
    vec3 sand = mix(vec3(0.36, 0.33, 0.24), vec3(0.55, 0.5, 0.36), vn(p.xz * 2.0));
    sand = mix(sand, vec3(0.16, 0.2, 0.14), smoothstep(0.55, 0.75, fbm(p.xz * 0.3 + 5.0, 3))); // weed patches
    sand = mix(sand, vec3(0.12, 0.12, 0.13) * (0.6 + 0.6 * vn(p.xz * 4.0)), smoothstep(0.62, 0.7, fbm(p.xz * 0.12 + 11.0, 3))); // rocks
    // caustics dancing on the floor
    vec2 q = p.xz * 0.45;
    float ca = 0.0;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      vec2 w = q * (1.0 + fk * 0.6) + vec2(uTime * (0.35 + fk * 0.2), -uTime * 0.25);
      ca += pow(abs(sin(w.x + sin(w.y * 1.3 + uTime * 0.7)) * sin(w.y + sin(w.x * 1.1 - uTime * 0.6))), 5.0);
    }
    float lam = max(n.y, 0.0);
    col = sand * (0.25 + 0.55 * lam) + vec3(0.6, 0.9, 1.0) * ca * 0.45 * lam;
    col *= vec3(0.55, 0.85, 0.95); // the water has eaten the reds
  } else if (rd.y > 0.0) {
    // the surface overhead: the bright window of the sky, rippling
    float ts = (SURF - ro.y) / rd.y;
    vec2 p = (ro + rd * ts).xz;
    float wv = fbm(p * 0.12 + vec2(uTime * 0.12, uTime * 0.07), 4);
    float window = smoothstep(0.62, 0.72, rd.y + (wv - 0.5) * 0.08);
    col = mix(vec3(0.02, 0.18, 0.26), vec3(0.6, 0.9, 1.0) * (0.8 + 0.6 * wv), window);
    col += vec3(1.0, 0.95, 0.8) * pow(max(rd.y, 0.0), 30.0) * 1.5; // the sun right overhead
    t = ts;
  } else col = waterCol(rd);
  // a whale gliding past high above: a bounding ellipsoid first, then the
  // shape is marched only where the ray passes through it
  {
    float wx = -70.0 + mod(uTime * 2.2, 160.0);
    vec3 c = vec3(wx, 17.0, ro.z - 26.0);
    vec3 bc = c + vec3(-1.2, 0.0, 0.0);
    vec3 R = vec3(11.8, 3.0, 4.6);
    vec3 oc = (ro - bc) / R;
    vec3 dd = rd / R;
    float a = dot(dd, dd); float b = dot(oc, dd); float cc = dot(oc, oc) - 1.0;
    float disc = b * b - a * cc;
    if (disc > 0.0) {
      float sq = sqrt(disc);
      float tw = max((-b - sq) / a, 0.0);
      float t1 = (-b + sq) / a;
      if (t1 > 0.0 && tw < t) {
        bool hit = false;
        for (int i = 0; i < 32; i++) {
          float ds = whale(ro + rd * tw - c);
          if (ds < 0.03) { hit = true; break; }
          tw += ds * 0.9;
          if (tw > t1) break;
        }
        if (hit && tw < t) {
          vec3 n = whaleNormal(ro + rd * tw - c);
          // dark slate back, pale belly, lit from the surface above
          vec3 back = vec3(0.025, 0.045, 0.06);
          vec3 belly = vec3(0.16, 0.22, 0.24);
          vec3 wc = mix(belly, back, smoothstep(-0.35, 0.25, n.y));
          col = wc * (0.45 + 0.75 * max(n.y, 0.0)) + vec3(0.05, 0.12, 0.15) * pow(1.0 - abs(dot(n, rd)), 3.0);
          t = tw;
        }
      }
    }
  }
  col = mix(col, waterCol(rd), 1.0 - exp(-t * 0.042));
  // god rays from the surface
  float gr = pow(vn(vec2(atan(rd.x, rd.z) * 9.0 + uTime * 0.05, 2.0)), 3.0) * smoothstep(0.0, 0.9, rd.y);
  col += vec3(0.35, 0.7, 0.8) * gr * 0.28;
  return col * (0.9 + 0.2 * uLevel);
}

// =============================================================== CLOUDS
// flying over a sea of clouds toward a low sun; towers of cumulus pass by
// cloud tops: a rolling floor, and cumulus towers rising out of it with
// cauliflower detail; the flight lane (x near 0) is kept clear of towers
float towerAt(vec2 p) {
  float tw = vn(p * 0.0022 + 3.0);
  float lane = smoothstep(120.0, 420.0, abs(p.x - 30.0 * sin(p.y * 0.0008)));
  // a rounded cumulus profile: steep sides, a domed head
  return sqrt(smoothstep(0.52, 1.0, tw)) * lane;
}
float cloudTop(vec2 p) {
  float base = 120.0 * fbm(p * 0.0035, 5);
  float tw = towerAt(p);
  // cauliflower: big lumps on the towers, small billows everywhere
  return base + tw * (480.0 + 170.0 * fbm(p * 0.009, 4)) + 22.0 * fbm(p * 0.03, 3);
}
float cloudTopLo(vec2 p) {
  float base = 120.0 * fbm(p * 0.0035, 3);
  float tw = towerAt(p);
  return base + tw * (480.0 + 170.0 * fbm(p * 0.009, 2)) + 11.0;
}
vec3 duskSky(vec3 rd, vec3 sun) {
  float h = rd.y;
  vec3 c = mix(vec3(1.0, 0.45, 0.16), vec3(0.98, 0.55, 0.45), smoothstep(-0.05, 0.1, h));
  c = mix(c, vec3(0.42, 0.32, 0.6), smoothstep(0.08, 0.35, h));
  c = mix(c, vec3(0.05, 0.08, 0.22), smoothstep(0.35, 0.95, h));
  float a = max(dot(rd, sun), 0.0);
  c += vec3(1.0, 0.7, 0.4) * (pow(a, 600.0) * 6.0 + pow(a, 12.0) * 0.6 + pow(a, 3.0) * 0.18);
  return c;
}
vec3 clouds(vec3 rd) {
  vec3 ro = vec3(30.0 * sin(-uT * 22.0 * 0.0008), 210.0 + 20.0 * sin(uT * 0.05), -uT * 22.0);
  vec3 sun = normalize(vec3(0.05, 0.06, -1.0));
  vec3 col = duskSky(rd, sun);
  gSky = smoothstep(0.5, 0.9, rd.y); // the first stars come out at the top
  if (rd.y < 0.12) {
    float tt = 1.0;
    float t = 1e9;
    for (int i = 0; i < 90; i++) {
      vec3 p = ro + rd * tt;
      float h = p.y - cloudTopLo(p.xz);
      if (h < 1.0) { t = tt; break; }
      tt += max(3.0, h * 0.35);
      if (tt > 9000.0 || p.y > 900.0) break;
    }
    if (t < 1e8) {
      // refine on the full-detail surface
      for (int i = 0; i < 5; i++) { vec3 p = ro + rd * t; t += (p.y - cloudTop(p.xz)) * 0.5; }
      vec3 p = ro + rd * t;
      vec2 e = vec2(4.0, 0.0);
      vec3 n = normalize(vec3(cloudTop(p.xz - e.xy) - cloudTop(p.xz + e.xy), 2.0 * e.x, cloudTop(p.xz - e.yx) - cloudTop(p.xz + e.yx)));
      // soft, scattering light: wrap the sun round the puffs, glow at the edges
      float lit = clamp(dot(n, sun) * 0.5 + 0.55, 0.0, 1.0);
      float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * pow(max(dot(rd, sun), 0.0), 2.0);
      float ao = smoothstep(-40.0, 160.0, p.y);
      vec3 cc = mix(vec3(0.28, 0.24, 0.4), vec3(1.0, 0.74, 0.52), lit) * (0.55 + 0.45 * ao);
      cc = mix(cc, vec3(0.55, 0.5, 0.62), smoothstep(0.7, 1.0, n.y) * 0.4);
      // billows: the sunlit faces are lumpy, the creases darker
      cc *= 0.78 + 0.4 * fbm(p.xz * 0.022 + vec2(p.y * 0.018, -p.y * 0.012), 3);
      cc += vec3(1.0, 0.7, 0.45) * rim * 1.6;
      cc = mix(cc, duskSky(rd, sun) * 0.9, pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * 0.5); // soft edges
      col = mix(cc, duskSky(normalize(vec3(rd.x, 0.02, rd.z)), sun), 1.0 - exp(-t * 0.00032));
    }
  } else {
    // high cirrus above
    float tc = (1600.0 - ro.y) / rd.y;
    vec2 p = (ro + rd * tc).xz;
    float ci = fbm(vec2(p.x * 0.0008, p.y * 0.0025) + 4.0, 5);
    col = mix(col, vec3(1.0, 0.72, 0.62), smoothstep(0.55, 0.8, ci) * 0.45 * smoothstep(0.12, 0.3, rd.y));
  }
  return col;
}

// ================================================================ PEAKS
// low over snowy ridges at night, the aurora overhead
float terrain(vec2 p, int oct) { return 520.0 * ridged(p * 0.0011, oct) - 60.0; }
vec3 auroraSky(vec3 rd) {
  vec3 c = mix(vec3(0.03, 0.05, 0.1), vec3(0.0, 0.01, 0.03), smoothstep(-0.1, 0.8, rd.y));
  // curtains: ray to a high sheet, folded by noise
  if (rd.y > 0.02) {
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float H = 900.0 + fk * 260.0;
      vec2 p = rd.xz / rd.y * H * 0.001;
      float fold = sin(p.x * 1.6 + fbm(p * 0.8 + uTime * 0.02 + fk, 3) * 6.0 + uTime * 0.05 * (1.0 + fk));
      float band = smoothstep(0.65, 1.0, fold) * (0.6 + 0.4 * vn(vec2(p.x * 40.0, uTime * 0.5 + fk)));
      float fade = smoothstep(0.02, 0.15, rd.y) * smoothstep(1.0, 0.45, rd.y);
      vec3 ac = mix(vec3(0.1, 1.0, 0.55), vec3(0.6, 0.3, 1.0), smoothstep(0.2, 0.7, rd.y + fk * 0.08));
      c += ac * band * fade * (0.55 - fk * 0.12) * (0.8 + 0.6 * uLevel);
    }
  }
  return c;
}
vec3 peaks(vec3 rd) {
  vec3 ro = vec3(60.0 * sin(uT * 0.015), 0.0, -uT * 16.0);
  ro.y = 470.0; // steady altitude; the ridges come up to meet it
  vec3 col = auroraSky(rd);
  gSky = 1.0;
  if (rd.y < 0.18) {
    float tt = 2.0;
    float t = 1e9;
    for (int i = 0; i < 72; i++) {
      vec3 p = ro + rd * tt;
      float h = p.y - terrain(p.xz, 4);
      if (h < 0.5) { t = tt; break; }
      tt += max(2.0, h * 0.42);
      if (tt > 9000.0) break;
    }
    if (t < 1e8) {
      gSky = 0.0;
      for (int i = 0; i < 4; i++) { vec3 p = ro + rd * t; t += (p.y - terrain(p.xz, 6)) * 0.5; }
      vec3 p = ro + rd * t;
      vec2 e = vec2(3.0, 0.0);
      vec3 n = normalize(vec3(terrain(p.xz - e.xy, 6) - terrain(p.xz + e.xy, 6), 2.0 * e.x, terrain(p.xz - e.yx, 6) - terrain(p.xz + e.yx, 6)));
      vec3 moon = normalize(vec3(-0.5, 0.45, 0.6));
      float snow = smoothstep(0.55, 0.75, n.y + 0.1 * vn(p.xz * 0.05));
      vec3 base = mix(vec3(0.05, 0.05, 0.06), vec3(0.72, 0.78, 0.9), snow);
      float lam = max(dot(n, moon), 0.0);
      vec3 aur = vec3(0.15, 0.6, 0.4) * (0.6 + 0.6 * uLevel);
      col = base * (lam * vec3(0.45, 0.52, 0.75) + aur * max(n.y, 0.0) * 0.35 + 0.03);
      col = mix(col, vec3(0.04, 0.07, 0.12), 1.0 - exp(-t * 0.00028));
    }
  }
  return col;
}

void main() {
  vec3 rd = normalize(vDir);
  vec3 c;
  if (uWorld == 0) c = forest(rd);
  else if (uWorld == 1) c = ocean(rd);
  else if (uWorld == 2) c = clouds(rd);
  else c = peaks(rd);
  gl_FragColor = vec4(c, gSky);
}`;

// A cube render target per slot (the current world and, during a
// crossfade, the next one); the -y face is never on the screen and skipped.
export function makeWorldRenderer(renderer, { size = 512, every = 1 } = {}) {
  const scene = new THREE.Scene();
  const uniforms = { uT: { value: 0 }, uTime: { value: 0 }, uLevel: { value: 0 }, uWorld: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthTest: false, depthWrite: false });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  ball.frustumCulled = false;
  scene.add(ball);
  const mk = () => new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const slots = [0, 1].map(() => ({ rt: mk(), world: null, start: 0, faceWorld: [] }));
  const cam = new THREE.CubeCamera(0.01, 10, slots[0].rt);
  cam.coordinateSystem = renderer.coordinateSystem;
  cam.updateCoordinateSystem();
  const faces = cam.children;
  let frame = 0;
  // mask: which faces are on someone's screen (bit i = face i); a face is
  // drawn when it is needed, and at once if it still shows an older world
  function draw(slot, time, level, mask, due) {
    uniforms.uWorld.value = WORLDS3D.indexOf(slot.world);
    uniforms.uT.value = time - slot.start;
    uniforms.uTime.value = time;
    uniforms.uLevel.value = level;
    const prev = renderer.getRenderTarget();
    const prevFace = renderer.getActiveCubeFace();
    const prevMip = renderer.getActiveMipmapLevel();
    const xr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    for (let i = 0; i < 6; i++) {
      if (i === 3) continue; // -y: under the floor
      const stale = slot.faceWorld[i] !== slot.world;
      if (!(mask & (1 << i)) || (!due && !stale)) continue;
      renderer.setRenderTarget(slot.rt, i);
      renderer.render(scene, faces[i]);
      slot.faceWorld[i] = slot.world;
    }
    renderer.setRenderTarget(prev, prevFace, prevMip);
    renderer.xr.enabled = xr;
  }
  const api = {
    slots,
    get every() { return every; },
    set every(v) { every = v; },
    // keep `want` (world names, up to two) rendered; returns the slot of each.
    // mask: the cube faces anyone can see right now (all by default)
    update(want, time, level, mask = 0x3f) {
      frame++;
      for (const s of slots) if (s.world && !want.includes(s.world)) s.world = null;
      for (const w of want) {
        if (slots.some((s) => s.world === w)) continue;
        const free = slots.find((s) => !s.world);
        if (!free) continue;
        free.world = w;
        free.start = time; // the flight starts as the world appears
        free.fresh = true;
      }
      // two worlds crossfading: each is refreshed every other turn, so the
      // fade costs no more than one world
      const live = slots.filter((s) => s.world);
      live.forEach((s, k) => {
        const turn = live.length > 1 ? Math.floor(frame / every) % 2 === k : true;
        const due = s.fresh || (frame % every === 0 && turn);
        if (s.fresh) s.faceWorld = [];
        draw(s, time, level, mask, due);
        s.fresh = false;
      });
      return want.map((w) => slots.find((s) => s.world === w) || null);
    },
  };
  return api;
}
