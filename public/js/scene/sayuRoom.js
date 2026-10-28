// The room of quiet contemplation: two pensive figures and nothing else.
// After the National Museum of Korea's room (2021): a long dark corridor
// with a slow black-and-white film of the cosmos at its start, charcoal
// walls that give the eyes time to get used to the dark; then a room 24 m
// long, its red clay walls curving and leaning outward, the old wooden
// floor rising one degree toward the figures, some 21,000 rods hung from the
// ceiling with only their tips catching the light - lower and blue-bodied
// over the figures, black elsewhere - and the two figures side by side on a
// low lacquered oval, no glass, to be walked round. A second corridor leads
// out. Only the figures give back light; everything else takes it in.
// Built when you go in (the square stays light); its own scene and lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { woodTexture, phys } from './materials.js';
import { castPensiveStatue, STATUES, headFrame } from './pensive.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// metres; the room's long axis on z, the way in at +z, the figures toward -z
export const SAYU = {
  room: { a: 8.5, b: 12, n: 4 }, // a superellipse: straight sides, rounded ends
  wallH: 5.6,
  lean: 0.5, // how far the wall's top stands out past its foot
  ceiling: 6.2,
  slope: Math.tan(Math.PI / 180), // the floor's one degree
  rise: { from: 12, to: -3.4 }, // rising over this stretch, level behind it
  platform: { x: 0, z: -5.2, rx: 3.0, rz: 1.45, h: 0.32 },
  rail: 0.55, // the low rail stands this far out from the platform
  keepOut: 0.8, // and you keep this far from it
  // the smaller, older figure on the left as you come in, a little forward
  // of the other (so the eye does not settle on one of them only)
  places: [{ x: -0.95, dz: 0.04 }, { x: 0.95, dz: 0 }],
  hall: 1.2, // half a corridor's width
  hallH: 3.0,
  inWay: [[4.4, 33.6], [4.4, 22], [3.9, 17.2], [3.1, 13.9], [2.6, 12]],
  outWay: [[-2.6, 12], [-3.1, 13.9], [-3.9, 17.2], [-4.4, 22], [-4.4, 30.4]],
  arrive: { x: 4.4, z: 32.3 },
  media: { z0: 23.8, z1: 32.4, y0: 0.35, y1: 2.75 }, // on the way in, its left wall
  rods: 21000,
  rodTip: { low: 3.75, high: 4.9, perMetre: 0.075 },
};

const { a: A, b: B, n: N } = SAYU.room;
const P = SAYU.platform;

// inside the room's outline, `m` in from its foot
export const inRoom = (x, z, m = 0) => (Math.abs(x) / (A - m)) ** N + (Math.abs(z) / (B - m)) ** N < 1;
// the floor: rising one degree from the door toward the figures
export function floorY(x, z) {
  if (!inRoom(x, z)) return 0;
  const { from, to } = SAYU.rise;
  return SAYU.slope * (from - Math.max(to, Math.min(from, z)));
}
// how low the rods come down over (x, z)
export function rodTipY(x, z) {
  const { low, high, perMetre } = SAYU.rodTip;
  return Math.min(high, low + perMetre * Math.hypot(x - P.x, z - P.z));
}
const outline = (t) => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [A * Math.sign(c) * Math.abs(c) ** (2 / N), B * Math.sign(s) * Math.abs(s) ** (2 / N)];
};

// the corridors, as the walls are built: points along the middle
const curve = (way) => new THREE.CatmullRomCurve3(way.map(([x, z]) => V(x, 0, z)), false, 'centripetal').getSpacedPoints(64);
export const WAYS = { in: curve(SAYU.inWay), out: curve(SAYU.outWay) };
function wayDistance(pts, x, z) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x;
    const az = pts[i - 1].z;
    const dx = pts[i].x - ax;
    const dz = pts[i].z - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
const inWay = (x, z, m) => wayDistance(WAYS.in, x, z) < SAYU.hall - m || wayDistance(WAYS.out, x, z) < SAYU.hall - m;
const nearPlatform = (x, z, m) => ((x - P.x) / (P.rx + m)) ** 2 + ((z - P.z) / (P.rz + m)) ** 2 < 1;

// Is (x, z) somewhere you can stand? In the room or a corridor, never at
// the platform (the rail keeps you back).
export function walkable(x, z) {
  if (nearPlatform(x, z, SAYU.keepOut)) return false;
  // (the corridors end at their doors: a step short of them)
  if (z > SAYU.inWay[0][1] - 0.35 || (x < 0 && z > SAYU.outWay.at(-1)[1] - 0.35)) return false;
  return inRoom(x, z, 0.35) || inWay(x, z, 0.32);
}
// How high the camera may go over (x, z), or -1 where it may not be at all.
export function headroom(x, z) {
  if (inRoom(x, z, 0.2)) return rodTipY(x, z) - 0.3;
  if (inWay(x, z, 0.18) && z < SAYU.inWay[0][1] - 0.15) return SAYU.hallH - 0.25;
  return -1;
}

// ------------------------------------------------------------ materials
function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  return t;
}
function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
// red clay laid on by hand: a warm ground, mottled, the trowel's sweeps
function clayTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#7b4330';
    g.fillRect(0, 0, w, h);
    const r = rand(17);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `hsla(${12 + r() * 14}, ${30 + r() * 25}%, ${18 + r() * 22}%, ${0.05 + r() * 0.12})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 4 + r() * 30, 2 + r() * 10, r() * 0.6 - 0.3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 220; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '255,210,180' : '40,15,8'},${0.03 + r() * 0.05})`;
      g.lineWidth = 2 + r() * 8;
      g.beginPath();
      const x = r() * w;
      const y = r() * h;
      g.arc(x, y + 80, 80 + r() * 60, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
      g.stroke();
    }
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '230,180,150' : '30,12,6'},${r() * 0.18})`;
      g.fillRect(r() * w, r() * h, 1, 1);
    }
  }, [6, 2]);
}
function charcoalTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#121112';
    g.fillRect(0, 0, w, h);
    const r = rand(29);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${r() < 0.6 ? '60,58,62' : '0,0,0'},${r() * 0.35})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 3);
    }
  }, [4, 1.5]);
}

// what the metal sees round it: a dark room, warm light from above
function roomEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: '#160a06', side: THREE.BackSide })));
  for (const [x, z, s] of [[-2.5, 3, 1.5], [2.5, 3, 1.5], [0, -4, 2.5]]) {
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: '#ffe0b0', side: THREE.DoubleSide }));
    lamp.position.set(x, 4.8, z);
    lamp.rotation.x = Math.PI / 2;
    env.add(lamp);
  }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(20, 3), new THREE.MeshBasicMaterial({ color: '#3a1a10' }));
  glow.position.set(0, -1, -9.9);
  env.add(glow);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return tex;
}

// the film at the start of the corridor: a slow, black-and-white cosmos,
// opening outward for ever
const MEDIA_FRAG = `uniform float uTime; uniform vec2 uSize; varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
  float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
  float layer(vec2 p){ return fbm(p + fbm(p * 0.7 + 3.1) * 1.6); }
  void main(){
    vec2 p = (vUv - 0.5) * uSize;
    float t = uTime * 0.045;
    float c = cos(t * 0.3); float s = sin(t * 0.3);
    p = mat2(c, -s, s, c) * p;
    // two layers, one twice the size of the other, both growing: the image
    // keeps opening out without ever jumping
    float f = fract(t);
    float k = 0.55 * exp2(-f);
    float v = mix(layer(p * k * 2.0 + 7.0), layer(p * k + 7.0), f);
    float r = length(p) / uSize.y;
    v = smoothstep(0.42, 0.95, v) * (0.35 + 0.65 * exp(-r * 1.4));
    float dust = smoothstep(0.9, 1.0, noise(p * 26.0 + vec2(t * 30.0, 0.0))) * 0.5;
    v += dust * smoothstep(0.3, 0.7, layer(p * 0.4 - t));
    vec2 e = smoothstep(vec2(0.0), vec2(0.06, 0.12), vUv) * smoothstep(vec2(1.0), vec2(0.94, 0.88), vUv);
    gl_FragColor = vec4(vec3(v * 0.9 * e.x * e.y), 1.0);
  }`;

function textPanel(lines, w, h) {
  return canvasTexture(1024, Math.round(1024 * h / w), (g, cw, ch) => {
    g.clearRect(0, 0, cw, ch);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach(([text, size, colour, y]) => {
      g.fillStyle = colour;
      g.font = `${size > 60 ? 700 : 400} ${size}px "Gowun Batang", serif`;
      g.fillText(text, cw / 2, ch * y);
    });
  });
}

export function buildSayuRoom(renderer, { lite = false, pixelRatio = () => 1 } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#020101');
  scene.name = 'sayu';
  const update = [];
  const lowPoly = lite ? 0.5 : 1;

  // (old boards, dark with age)
  const wood = new THREE.CanvasTexture(woodTexture({ base: '#33251b', dark: '#1a120c', light: '#4a3727', seed: 41, planks: 6 }));
  wood.colorSpace = THREE.SRGBColorSpace;
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.repeat.set(3, 6);
  const floorMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.82, color: '#a89080' });
  const clayMat = new THREE.MeshStandardMaterial({ map: clayTexture(), roughness: 1, side: THREE.DoubleSide });
  const charMat = new THREE.MeshStandardMaterial({ map: charcoalTexture(), roughness: 1, side: THREE.DoubleSide });
  const blackMat = new THREE.MeshBasicMaterial({ color: '#030303', side: THREE.DoubleSide });

  // ---------------------------------------------------------- the room
  {
    // the floor, rising
    const g = new THREE.PlaneGeometry(2 * A + 1, 2 * B + 1, Math.round(36 * lowPoly), Math.round(52 * lowPoly)).rotateX(-Math.PI / 2);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, floorY(p.getX(i), p.getZ(i)) + (inRoom(p.getX(i), p.getZ(i)) ? 0 : -0.01));
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, floorMat));
  }
  {
    // the walls: following the outline, leaning out; the lower band open
    // where the corridors come in, the upper band whole over them
    const n = Math.round(220 * lowPoly);
    const mouths = [WAYS.in.at(-1).x, WAYS.out[0].x];
    const H = SAYU.wallH;
    const lower = [];
    const upper = [];
    const at = (t, y) => {
      const [x, z] = outline(t);
      const k = (SAYU.lean * y) / H;
      return [x * (1 + k / A), y + (y === 0 ? floorY(x * 0.999, z * 0.999) : 0), z * (1 + k / B)];
    };
    const quad = (list, t0, t1, y0, y1, u0, u1) => {
      const a = at(t0, y0);
      const b = at(t1, y0);
      const c = at(t1, y1);
      const d = at(t0, y1);
      list.push({ p: [...a, ...b, ...c, ...a, ...c, ...d], uv: [u0, y0 / 2.8, u1, y0 / 2.8, u1, y1 / 2.8, u0, y0 / 2.8, u1, y1 / 2.8, u0, y1 / 2.8] });
    };
    let u = 0;
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI * 2;
      const t1 = ((i + 1) / n) * Math.PI * 2;
      const [x0, z0] = outline(t0);
      const [x1, z1] = outline(t1);
      const du = Math.hypot(x1 - x0, z1 - z0) / 4;
      const mid = (x0 + x1) / 2;
      const open = (z0 + z1) / 2 > B * 0.8 && mouths.some((m) => Math.abs(mid - m) < SAYU.hall);
      if (!open) quad(lower, t0, t1, 0, SAYU.hallH, u, u + du);
      quad(upper, t0, t1, SAYU.hallH, H, u, u + du);
      u += du;
    }
    const toGeo = (list) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap((q) => q.p), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(list.flatMap((q) => q.uv), 2));
      g.computeVertexNormals();
      return g;
    };
    scene.add(new THREE.Mesh(mergeGeometries([toGeo(lower), toGeo(upper)]), clayMat));
    // the dark ceiling the rods hang from
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2 * (A + SAYU.lean) + 1, 2 * (B + SAYU.lean) + 1).rotateX(Math.PI / 2).translate(0, SAYU.ceiling, 0), blackMat);
    scene.add(top);
    // (and between the wall's top and the ceiling, dark)
    const band = [];
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI * 2;
      const t1 = ((i + 1) / n) * Math.PI * 2;
      const [x0, z0] = outline(t0).map((v, j) => v * (1 + SAYU.lean / (j ? B : A)));
      const [x1, z1] = outline(t1).map((v, j) => v * (1 + SAYU.lean / (j ? B : A)));
      band.push(x0, H, z0, x1, H, z1, x1, SAYU.ceiling, z1, x0, H, z0, x1, SAYU.ceiling, z1, x0, SAYU.ceiling, z0);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(band, 3));
    scene.add(new THREE.Mesh(bg, blackMat));
  }

  // ------------------------------------------------------- the corridors
  const guide = [];
  for (const [id, pts] of Object.entries(WAYS)) {
    const [left, right, floor, roof] = [0, 1, 2, 3].map(() => ({ p: [], uv: [] }));
    let u = 0;
    const side = (p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const l = Math.hypot(tx, tz);
      return [-tz / l, tx / l];
    };
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const [n0x, n0z] = side(p0, i - 1);
      const [n1x, n1z] = side(p1, i);
      const h = SAYU.hall;
      const du = p0.distanceTo(p1) / 3;
      const wall = (list, s) => {
        const ax = p0.x + n0x * h * s;
        const az = p0.z + n0z * h * s;
        const bx = p1.x + n1x * h * s;
        const bz = p1.z + n1z * h * s;
        const H = SAYU.hallH;
        list.p.push(ax, 0, az, bx, 0, bz, bx, H, bz, ax, 0, az, bx, H, bz, ax, H, az);
        list.uv.push(u, 0, u + du, 0, u + du, 1, u, 0, u + du, 1, u, 1);
      };
      const strip = (list, y) => {
        const a0 = [p0.x - n0x * SAYU.hall, y, p0.z - n0z * SAYU.hall];
        const a1 = [p0.x + n0x * SAYU.hall, y, p0.z + n0z * SAYU.hall];
        const b0 = [p1.x - n1x * SAYU.hall, y, p1.z - n1z * SAYU.hall];
        const b1 = [p1.x + n1x * SAYU.hall, y, p1.z + n1z * SAYU.hall];
        list.p.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
        list.uv.push(0, u, 0, u + du, 0.5, u + du, 0, u, 0.5, u + du, 0.5, u);
      };
      wall(left, 1);
      wall(right, -1);
      strip(floor, 0);
      strip(roof, SAYU.hallH);
      u += du;
      // little warm lights low on the walls, every few metres, to walk by
      if (i % 6 === 3) for (const s of [-1, 1]) guide.push(V(p1.x + n1x * (SAYU.hall - 0.02) * s, 0.12, p1.z + n1z * (SAYU.hall - 0.02) * s));
    }
    const geo = (l) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(l.p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(l.uv, 2));
      g.computeVertexNormals();
      return g;
    };
    scene.add(new THREE.Mesh(mergeGeometries([geo(left), geo(right)]), charMat));
    scene.add(new THREE.Mesh(geo(floor), floorMat));
    scene.add(new THREE.Mesh(geo(roof), blackMat));
    // the door at the far end: back to the square
    const end = id === 'in' ? pts[0] : pts.at(-1);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(SAYU.hall * 2, SAYU.hallH), new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.9 }));
    door.position.set(end.x, SAYU.hallH / 2, end.z + 0.02);
    door.rotation.y = Math.PI;
    scene.add(door);
    // (its frame drawn by a thin line of light: the way out)
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), new THREE.MeshBasicMaterial({ color: '#ffd9a6', transparent: true, opacity: 0.16, depthWrite: false }));
    frame.position.set(end.x, 1.1, end.z - 0.01);
    frame.rotation.y = Math.PI;
    scene.add(frame);
  }
  {
    const g = mergeGeometries(guide.map((p) => new THREE.BoxGeometry(0.18, 0.03, 0.18).translate(p.x, p.y, p.z)));
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#3a2816' })));
  }

  // ---------------------------------------------------------- the film
  const M = SAYU.media;
  const mediaW = M.z1 - M.z0;
  const mediaH = M.y1 - M.y0;
  const media = new THREE.Mesh(new THREE.PlaneGeometry(mediaW, mediaH), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(mediaW, mediaH) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: MEDIA_FRAG,
  }));
  const wallX = SAYU.inWay[0][0] - SAYU.hall + 0.03;
  media.position.set(wallX, (M.y0 + M.y1) / 2, (M.z0 + M.z1) / 2);
  media.rotation.y = Math.PI / 2;
  scene.add(media);
  const filmLight = new THREE.PointLight('#c9ccd4', 2.2, 7, 1.6);
  filmLight.position.set(wallX + 0.8, 1.5, (M.z0 + M.z1) / 2);
  scene.add(filmLight);
  // its name across the way, in light letters
  const title = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({
    map: textPanel([['사유의 방', 120, '#e9e2d6', 0.38], ['천천히, 어둠에 눈이 익을 때까지', 44, '#9c958a', 0.8]], 2.4, 0.9), transparent: true, depthWrite: false,
  }));
  title.position.set(SAYU.inWay[0][0] + SAYU.hall - 0.03, 1.75, SAYU.arrive.z - 1.6);
  title.rotation.y = -Math.PI / 2;
  scene.add(title);
  // and on the way out, what the two are (the room itself has no labels)
  const note = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({
    map: textPanel([
      ['반가사유상 두 점', 76, '#e9e2d6', 0.16],
      ['왼쪽 · 6세기 후반 · 해와 달을 얹은 관', 36, '#a59d90', 0.4],
      ['오른쪽 · 7세기 전반 · 세 봉우리 관', 36, '#a59d90', 0.55],
      ['두 상의 키는 81.5cm와 93.5cm, 그 비례 그대로', 32, '#8a8378', 0.72],
      ['숲에서는 사슴과 곰의 모습으로 앉아 있어요', 32, '#8a8378', 0.86],
    ], 1.6, 1.0), transparent: true, depthWrite: false,
  }));
  const noteAt = WAYS.out[44];
  note.position.set(noteAt.x + SAYU.hall - 0.03, 1.55, noteAt.z);
  note.rotation.y = -Math.PI / 2;
  scene.add(note);

  // ---------------------------------------------------------- the rods
  const tips = [];
  const tipSeeds = [];
  const near = [];
  {
    const want = lite ? 7000 : SAYU.rods;
    const area = 4 * A * B * 0.927; // (a superellipse of n = 4)
    const step = Math.sqrt(area / want);
    const r = rand(53);
    for (let z = -B; z <= B; z += step) {
      for (let x = -A; x <= A; x += step) {
        const px = x + (r() - 0.5) * step * 0.7;
        const pz = z + (r() - 0.5) * step * 0.7;
        if (!inRoom(px, pz, 0.12)) continue;
        tips.push(px, rodTipY(px, pz), pz);
        tipSeeds.push(r());
        near.push(Math.hypot(px - P.x, pz - P.z) < 4.2);
      }
    }
    const count = tipSeeds.length;
    if (!lite) {
      const rod = new THREE.BoxGeometry(0.012, 1, 0.012).translate(0, 0.5, 0);
      // (the bodies take no light: in the dark they are only a depth over
      // the figures, the tips do the glinting)
      const rods = new THREE.InstancedMesh(rod, new THREE.MeshBasicMaterial({ color: '#ffffff' }), count);
      const m = new THREE.Matrix4();
      const blue = new THREE.Color('#0b1424');
      const black = new THREE.Color('#050506');
      for (let i = 0; i < count; i++) {
        const y = tips[i * 3 + 1];
        m.makeScale(1, SAYU.ceiling - y, 1).setPosition(tips[i * 3], y, tips[i * 3 + 2]);
        rods.setMatrixAt(i, m);
        rods.setColorAt(i, near[i] ? blue : black);
      }
      rods.frustumCulled = false;
      scene.add(rods);
    }
    // the tips: each catches the light now and then, as you move
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tips, 3));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(tipSeeds, 1));
    const glints = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uCentre: { value: V(P.x, 0, P.z) } },
      vertexShader: `attribute float seed; uniform float uTime; uniform float uScale; uniform vec3 uCentre; varying float vA; varying vec3 vC;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec4 mv = viewMatrix * wp;
          gl_Position = projectionMatrix * mv;
          // a tip glints when your eye and the light line up on it: which
          // ones changes as you walk, and a slow twinkle besides
          vec3 toEye = normalize(cameraPosition - wp.xyz);
          vec3 facet = normalize(vec3(sin(seed * 91.0), 1.6, cos(seed * 57.0)));
          float glint = pow(max(0.0, dot(toEye, facet)), 30.0 + seed * 90.0);
          float tw = pow(0.5 + 0.5 * sin(uTime * (0.4 + seed * 1.3) + seed * 80.0), 40.0);
          vA = 0.035 + 1.3 * glint + 0.6 * tw;
          float d = length(wp.xz - uCentre.xz);
          vC = mix(vec3(1.0, 0.86, 0.62), vec3(0.78, 0.84, 1.0), smoothstep(2.0, 8.0, d));
          gl_PointSize = clamp(0.03 * uScale / -mv.z, 1.0, 4.0);
        }`,
      fragmentShader: 'varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC, smoothstep(0.5, 0.1, d) * vA); }',
    }));
    glints.frustumCulled = false;
    scene.add(glints);
    update.push((dt, t) => {
      glints.material.uniforms.uTime.value = t;
      glints.material.uniforms.uScale.value = (window.innerHeight / 2) * pixelRatio();
    });
  }

  // ------------------------------------------------ the platform, the rail
  const baseY = floorY(P.x, P.z);
  {
    const lacquer = phys({ color: '#0a0706', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, P.h, 72).scale(P.rx, 1, P.rz).translate(P.x, baseY + P.h / 2, P.z), lacquer);
    scene.add(plat);
    const railR = [P.rx + SAYU.rail, P.rz + SAYU.rail];
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(V(P.x + Math.sin(a) * railR[0], baseY + 0.42, P.z + Math.cos(a) * railR[1]));
    }
    const parts = [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.012, 6, true)];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      parts.push(new THREE.CylinderGeometry(0.016, 0.022, 0.42, 8).translate(P.x + Math.sin(a) * railR[0], baseY + 0.21, P.z + Math.cos(a) * railR[1]));
    }
    const rail = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), new THREE.MeshStandardMaterial({ color: '#2a231c', metalness: 0.6, roughness: 0.5 }));
    scene.add(rail);
  }

  // -------------------------------------------------------- the figures
  const envMap = roomEnvironment(renderer);
  // (cast while you walk down the corridor: a little between every frame,
  // one after the other; they are on the platform before you reach the room)
  const bronze = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.82, roughness: 0.42, envMap, envMapIntensity: 0.85 });
  const statues = STATUES.map((spec, i) => {
    const place = new THREE.Object3D();
    place.position.set(P.x + SAYU.places[i].x, baseY + P.h, P.z + SAYU.places[i].dz);
    place.rotation.y = Math.PI; // (facing the way in)
    place.scale.setScalar(spec.scale);
    place.updateMatrixWorld(true);
    return { ...spec, place, mesh: null, face: place.localToWorld(V(...headFrame().c)) };
  });
  const ready = statues.reduce((before, s) => before.then(() => castPensiveStatue(s, bronze, { h: lite ? 0.0095 : 0.0065 })).then((mesh) => {
    mesh.position.copy(s.place.position);
    mesh.rotation.copy(s.place.rotation);
    s.mesh = mesh;
    scene.add(mesh);
  }), Promise.resolve());

  // ---------------------------------------------------------- the light
  // (only the figures give light back: one warm light on each from above
  // and in front, a dimmer one behind to lift them off the dark)
  scene.add(new THREE.HemisphereLight('#6a4232', '#120907', 0.55));
  // (low enough and far enough in front to reach the bowed faces)
  for (const s of statues) {
    const key = new THREE.SpotLight('#ffe4bf', 40, 14, 0.2, 0.75, 1.4);
    key.position.set(s.face.x * 1.3, s.face.y + 2.7, s.face.z + 3.9);
    key.target.position.copy(s.face).add(V(0, -0.3, 0));
    scene.add(key, key.target);
  }
  const fill = new THREE.SpotLight('#ffd2a0', 7, 12, 0.35, 1, 1.4);
  fill.position.set(0, 1.0, P.z + 5.5);
  fill.target.position.set(0, statues[0].face.y - 0.2, P.z);
  scene.add(fill, fill.target);
  const rim = new THREE.SpotLight('#ffcf9a', 22, 12, 0.5, 0.8, 1.4);
  rim.position.set(0, 4.8, P.z - 4.5);
  rim.target.position.set(0, baseY + 0.9, P.z);
  scene.add(rim, rim.target);
  // (a breath of light on the walls, low, so the room has edges)
  for (const s of [-1, 1]) {
    const wash = new THREE.SpotLight('#ff9a6a', 9, 16, 0.7, 1, 1.2);
    wash.position.set(s * 2, 5.4, 2);
    wash.target.position.set(s * A, 1.2, -1);
    scene.add(wash, wash.target);
  }

  update.push((dt, t) => { media.material.uniforms.uTime.value = t; });

  return {
    scene,
    statues,
    ready,
    media,
    update(dt, t) { for (const f of update) f(dt, t); },
    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) for (const m of [].concat(o.material)) { m.map?.dispose(); m.dispose(); }
      });
      envMap.dispose();
    },
  };
}
