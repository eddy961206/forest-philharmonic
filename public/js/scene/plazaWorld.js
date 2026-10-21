// The square in the forest between the two buildings: a ring of cobbles
// under the moon, lamps, a ticket booth with a squirrel at the window, and
// two gates - the path to the concert hall on one side, to the Sphere on
// the other, both buildings glowing far off through the trees.
// Kept light: everything that repeats is instanced, everything that stands
// still is merged by material, three lights for the whole scene and no
// shadows. Roughly forty draws before the characters.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// where things are (metres; the booth's window looks toward +z, the spawn)
export const PLAZA = {
  R: 12.4, // the walkable cobbles
  spawn: { x: 0, z: 8.6 },
  booth: { x: 0, z: -2.4, w: 3.4, d: 2.3 },
  window: { x: 0, z: -1.05 }, // where you stand to buy a ticket
  gates: {
    hall: { x: -9.3, z: -5.2 },
    sphere: { x: 9.3, z: -5.2 },
  },
  far: {
    hall: { x: -58, z: -56 },
    sphere: { x: 58, z: -56 },
  },
};
// a gate's facing: toward the middle of the square
export const gateYaw = (g) => Math.atan2(-g.x, -g.z);

// (the lettering is in the page's own typefaces, which arrive a moment
// after the square is built: anything with writing is painted again then)
const FONTS = typeof document !== 'undefined' && document.fonts
  ? Promise.all(['700 48px "Gowun Batang"', '500 20px "IBM Plex Sans KR"'].map((f) => document.fonts.load(f))).catch(() => {})
  : Promise.resolve();
function canvasTex(w, h, draw, { repeat = null, text = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  if (text) FONTS.then(() => { g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; });
  return t;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// cobbles: rounded stones in a dozen greys and browns, dark joints
function cobbleTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3a3430';
    g.fillRect(0, 0, w, h);
    const r = rand(7);
    for (let y = 0; y < h; y += 32) {
      const off = (y / 32) % 2 ? 16 : 0;
      for (let x = -32; x < w + 32; x += 32) {
        const l = 38 + r() * 16;
        g.fillStyle = `hsl(${28 + r() * 14}, ${8 + r() * 10}%, ${l}%)`;
        g.beginPath();
        g.roundRect(x + off + 2 + r() * 2, y + 2 + r() * 2, 27 + r() * 2, 27 + r() * 2, 9);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.beginPath();
        g.ellipse(x + off + 12, y + 10, 8, 4, -0.3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, { repeat: [11, 11] });
}

function signTexture(lines, { w = 512, h = 160, bg = '#2e1d12', fg = '#f2dfb4', sub = '#d5b77c' } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = sub;
    g.lineWidth = 6;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => {
      g.fillStyle = i === 0 ? fg : sub;
      g.font = i === 0 ? `700 ${Math.round(h * 0.34)}px "Gowun Batang", serif` : `500 ${Math.round(h * 0.17)}px "IBM Plex Sans KR", sans-serif`;
      g.fillText(l, w / 2, lines.length === 1 ? h / 2 : h * (i === 0 ? 0.42 : 0.76));
    });
  }, { text: true });
}

function glowTexture() {
  return canvasTex(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,240,200,1)');
    grad.addColorStop(0.25, 'rgba(255,205,130,0.55)');
    grad.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });

export function buildPlaza(scene, { lite = false, pixelRatio = () => 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'plaza';
  scene.add(group);
  const update = [];
  const pickables = {}; // what a tap can mean: 'booth', 'gate:hall', 'gate:sphere'

  // ------------------------------------------------------------ the sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 zen = vec3(0.012, 0.02, 0.05);
        vec3 hor = vec3(0.09, 0.12, 0.2);
        vec3 c = mix(hor, zen, smoothstep(-0.02, 0.55, h));
        c += vec3(0.05, 0.06, 0.1) * exp(-abs(h) * 14.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -2;
  group.add(sky);
  {
    const n = lite ? 380 : 900;
    const pos = new Float32Array(n * 3);
    const r = rand(3);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2;
      const y = 0.08 + r() * 0.92;
      const k = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * k * 200, y * 200, Math.sin(th) * k * 200], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#dfe7ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
    stars.renderOrder = -1;
    group.add(stars);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (c) => {
      const grad = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,252,236,1)');
      grad.addColorStop(0.3, 'rgba(250,244,220,1)');
      grad.addColorStop(0.36, 'rgba(220,226,255,0.35)');
      grad.addColorStop(1, 'rgba(160,180,255,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, 128, 128);
    }), fog: false, depthWrite: false, transparent: true }));
    moon.position.set(-70, 95, -150);
    moon.scale.setScalar(40);
    group.add(moon);
  }

  // ----------------------------------------------------------- the ground
  const grass = new THREE.Mesh(new THREE.CircleGeometry(160, 48).rotateX(-Math.PI / 2), std({ color: '#1c2a1d', roughness: 1 }));
  group.add(grass);
  const cobbleMat = std({ map: cobbleTexture(), roughness: 0.9 });
  {
    const parts = [new THREE.CircleGeometry(PLAZA.R + 0.4, 64).rotateX(-Math.PI / 2).translate(0, 0.01, 0)];
    // the two paths out through the gates, on toward the buildings
    for (const id of ['hall', 'sphere']) {
      const g = PLAZA.gates[id];
      const f = PLAZA.far[id];
      const len = Math.hypot(f.x - g.x, f.z - g.z) - 6;
      const yaw = Math.atan2(f.x - g.x, f.z - g.z);
      const p = new THREE.PlaneGeometry(2.6, len).rotateX(-Math.PI / 2).translate(0, 0.012, len / 2).rotateY(yaw).translate(g.x, 0, g.z);
      parts.push(p);
    }
    const ground = new THREE.Mesh(mergeGeometries(parts), cobbleMat);
    group.add(ground);
    // a low stone kerb round the square
    const kerb = new THREE.Mesh(new THREE.TorusGeometry(PLAZA.R + 0.45, 0.12, 6, 72).rotateX(Math.PI / 2).translate(0, 0.06, 0), std({ color: '#6d665d' }));
    group.add(kerb);
  }

  // ------------------------------------------------------------ the trees
  {
    const r = rand(11);
    const spots = [];
    const clear = Object.values(PLAZA.far).map((f) => Math.atan2(f.x, f.z));
    const want = lite ? 70 : 170;
    let guard = 0;
    while (spots.length < want && guard++ < 5000) {
      const a = r() * Math.PI * 2;
      const d = 15.5 + Math.pow(r(), 0.7) * 50;
      // keep the views to the buildings (and the way you came) open
      if (clear.some((c) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))) < 0.13 + 3 / d)) continue;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.18 && d < 30) continue;
      spots.push({ x: Math.sin(a) * d, z: Math.cos(a) * d, s: 0.8 + r() * 0.7, k: r() });
    }
    const trunkG = new THREE.CylinderGeometry(0.16, 0.26, 2.4, 6).translate(0, 1.2, 0);
    const crownG = mergeGeometries([
      new THREE.ConeGeometry(1.9, 3.2, 7).translate(0, 3.4, 0),
      new THREE.ConeGeometry(1.5, 2.6, 7).translate(0, 4.7, 0),
      new THREE.ConeGeometry(1.0, 2.0, 7).translate(0, 5.9, 0),
    ]);
    const trunks = new THREE.InstancedMesh(trunkG, std({ color: '#3b2a1e' }), spots.length);
    const crowns = new THREE.InstancedMesh(crownG, std({ color: '#ffffff', roughness: 0.95 }), spots.length);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    spots.forEach((p, i) => {
      m.compose(V(p.x, 0, p.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), p.k * 6.28), V(p.s, p.s * (0.9 + p.k * 0.3), p.s));
      trunks.setMatrixAt(i, m);
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, c.setHSL(0.36 + p.k * 0.06, 0.32, 0.11 + p.k * 0.07));
    });
    group.add(trunks, crowns);
  }

  // ------------------------------------------------------------ the lamps
  const glow = glowTexture();
  const halos = [];
  {
    const n = 6;
    const posts = [];
    const tops = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      const x = Math.sin(a) * (PLAZA.R - 0.9);
      const z = Math.cos(a) * (PLAZA.R - 0.9);
      posts.push(new THREE.CylinderGeometry(0.06, 0.09, 3.1, 8).translate(x, 1.55, z));
      posts.push(new THREE.CylinderGeometry(0.2, 0.25, 0.18, 8).translate(x, 0.09, z));
      posts.push(new THREE.ConeGeometry(0.28, 0.22, 8).translate(x, 3.62, z));
      tops.push(new THREE.SphereGeometry(0.2, 12, 8).translate(x, 3.36, z));
      halos.push(V(x, 3.36, z));
    }
    group.add(new THREE.Mesh(mergeGeometries(posts), std({ color: '#1b1b1d', metalness: 0.6, roughness: 0.4 })));
    group.add(new THREE.Mesh(mergeGeometries(tops), new THREE.MeshBasicMaterial({ color: '#ffe0a8' })));
  }

  // ------------------------------------------------------------ the booth
  const B = PLAZA.booth;
  const wood = std({ color: '#6b4428', roughness: 0.8 });
  const trim = std({ color: '#d9b979', roughness: 0.5, metalness: 0.3 });
  const roofM = std({ color: '#27412f', roughness: 0.7 });
  {
    const W = B.w;
    const D = B.d;
    const H = 2.4;
    const z0 = B.z;
    const front = z0 + D / 2;
    const w = [];
    // walls: back, sides, and the front around the window
    w.push(new THREE.BoxGeometry(W, H, 0.12).translate(0, H / 2, z0 - D / 2));
    for (const s of [-1, 1]) w.push(new THREE.BoxGeometry(0.12, H, D).translate(s * W / 2, H / 2, z0));
    w.push(new THREE.BoxGeometry(W, 1.02, 0.14).translate(0, 0.51, front)); // under the counter
    w.push(new THREE.BoxGeometry(W, 0.42, 0.14).translate(0, H - 0.21, front)); // over the window
    for (const s of [-1, 1]) w.push(new THREE.BoxGeometry(0.55, H, 0.14).translate(s * (W / 2 - 0.275), H / 2, front));
    w.push(new THREE.BoxGeometry(W - 1.0, 0.06, 0.5).translate(0, 1.05, front + 0.12)); // the counter
    group.add(new THREE.Mesh(mergeGeometries(w), wood));
    const t = [];
    t.push(new THREE.BoxGeometry(W + 0.1, 0.08, 0.2).translate(0, 1.1, front + 0.18));
    t.push(new THREE.BoxGeometry(W + 0.2, 0.1, D + 0.2).translate(0, H + 0.05, z0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.push(new THREE.BoxGeometry(0.16, H, 0.16).translate(sx * W / 2, H / 2, z0 + sz * D / 2));
    group.add(new THREE.Mesh(mergeGeometries(t), trim));
    // a pointed roof
    const roof = new THREE.ConeGeometry(W * 0.86, 1.3, 4, 1).rotateY(Math.PI / 4).scale(1, 1, D / W + 0.25).translate(0, H + 0.75, z0);
    group.add(new THREE.Mesh(roof, roofM));
    // the warm room behind the window
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, H - 0.2).translate(0, H / 2, z0 - D / 2 + 0.08), new THREE.MeshBasicMaterial({ color: '#4a3220' }));
    group.add(inside);
    // the striped awning over the window
    const awnTex = canvasTex(256, 64, (g, cw, ch) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#f3e7cf' : '#9c2f2a';
        g.fillRect((i * cw) / 8, 0, cw / 8 + 1, ch);
      }
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, ch - 8, cw, 8);
    });
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.3, 0.9).rotateX(-Math.PI / 2 + 0.55).translate(0, H - 0.05, front + 0.38), std({ map: awnTex, side: THREE.DoubleSide, roughness: 0.9 }));
    group.add(awn);
    // the sign on top
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.82), std({ map: signTexture(['매표소', '숲속 필하모닉 홀 · 스피어']), roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0.08 }));
    sign.position.set(0, H + 1.65, front - 0.05);
    sign.material.emissiveMap = sign.material.map;
    group.add(sign);
    // a lantern by the window
    const lan = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffd59a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lan.position.set(W / 2 + 0.25, 1.95, front + 0.15);
    lan.scale.setScalar(1.1);
    group.add(lan);
    pickables.booth = [awn, sign, inside];
  }

  // ------------------------------------------------------------ the gates
  const gates = {};
  for (const [id, title, sub, col] of [['hall', '숲속 필하모닉 홀', '이쪽 숲길로', '#ffcf8f'], ['sphere', '스피어', '이쪽 숲길로', '#9fd3ff']]) {
    const g = PLAZA.gates[id];
    const yaw = gateYaw(g);
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push(new THREE.CylinderGeometry(0.22, 0.28, 3.4, 10).translate(s * 1.55, 1.7, 0));
      parts.push(new THREE.BoxGeometry(0.62, 0.3, 0.62).translate(s * 1.55, 0.15, 0));
    }
    parts.push(new THREE.TorusGeometry(1.55, 0.16, 8, 28, Math.PI).translate(0, 3.4, 0));
    const arch = new THREE.Mesh(mergeGeometries(parts), std({ color: '#5b4632', roughness: 0.75 }));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.62), std({ map: signTexture([title, sub], { w: 512, h: 144 }), roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0.06 }));
    board.material.emissiveMap = board.material.map;
    board.position.set(0, 4.15, 0.02);
    // the glow that calls you when your ticket is for this door
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.09, 6, 28, Math.PI).translate(0, 3.4, 0.2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
    // the doorway itself fills with a soft light when it is yours to go through
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 3.3).translate(0, 1.65, 0), new THREE.MeshBasicMaterial({
      // (a mist of light rising from the threshold, soft at every edge - not
      // a lit sheet hung in the arch)
      map: canvasTex(128, 160, (cg, w, h) => {
        cg.save();
        cg.translate(w / 2, h);
        cg.scale(1, (h * 1.15) / (w * 0.5));
        const grad = cg.createRadialGradient(0, 0, 0, 0, 0, w * 0.5);
        grad.addColorStop(0, 'rgba(255,255,255,0.85)');
        grad.addColorStop(0.45, 'rgba(255,255,255,0.32)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        cg.fillStyle = grad;
        cg.fillRect(-w / 2, -w * 0.5, w, w * 0.5);
        cg.restore();
      }),
      color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    const crown = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    crown.position.set(0, 3.6, 0.3);
    crown.scale.setScalar(3.4);
    const gg = new THREE.Group();
    gg.add(arch, board, ring, veil, crown);
    gg.position.set(g.x, 0, g.z);
    gg.rotation.y = yaw;
    group.add(gg);
    gates[id] = { group: gg, ring, veil, crown, call: 0, want: 0 };
    pickables[`gate:${id}`] = [arch, board];
    for (const s of [-1, 1]) halos.push(new THREE.Vector3(s * 1.55, 3.0, 0.3).applyAxisAngle(V(0, 1, 0), yaw).add(V(g.x, 0, g.z)));
  }

  // halos round every lamp and gate lantern: one draw
  {
    const n = halos.length;
    const pos = new Float32Array(n * 3);
    halos.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const haloMat = new THREE.PointsMaterial({ map: glow, size: 2.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffd9a0', opacity: 0.55 });
    // (walk right up to a lamp and its halo stays a halo, not a white screen)
    haloMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', 'gl_PointSize = min(gl_PointSize, 240.0);\n#include <fog_vertex>'); };
    const pts = new THREE.Points(geo, haloMat);
    group.add(pts);
  }

  // ---------------------------------------------- the buildings, far off
  {
    // the concert hall: a long stone house, a pitched roof, rows of warm arched windows
    const f = PLAZA.far.hall;
    const hg = new THREE.Group();
    const body = [new THREE.BoxGeometry(26, 13, 14).translate(0, 6.5, 0), new THREE.BoxGeometry(8, 20, 8).translate(9, 10, -2)];
    const roofS = new THREE.Shape([new THREE.Vector2(-13.6, 0), new THREE.Vector2(13.6, 0), new THREE.Vector2(0, 6)]);
    body.push(new THREE.ExtrudeGeometry(roofS, { depth: 14.4, bevelEnabled: false }).translate(0, 13, -7.2));
    body.push(new THREE.ConeGeometry(5.6, 6, 4).rotateY(Math.PI / 4).translate(9, 23, -2));
    hg.add(new THREE.Mesh(mergeGeometries(body.map((b) => b.index ? b.toNonIndexed() : b)), std({ color: '#3a3330', roughness: 0.95 })));
    const win = [];
    const wr = rand(23);
    // each window its own light: most warm, some dimmer, a few dark (an
    // evenly lit grid read as a pattern, not a building)
    const lit = (g, k) => {
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([k, k * 0.93, k * 0.86], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return g;
    };
    for (let row = 0; row < 3; row++) {
      for (let k = -5; k <= 5; k++) {
        if (row === 0 && Math.abs(k) < 1) continue;
        const r = wr();
        const k0 = r < 0.14 ? 0.12 : r < 0.4 ? 0.55 + wr() * 0.2 : 0.85 + wr() * 0.15;
        win.push(lit(new THREE.PlaneGeometry(1.1, 2.2).translate(k * 2.2, 2.6 + row * 3.6, 7.02), k0));
      }
    }
    win.push(lit(new THREE.PlaneGeometry(3.2, 4.6).translate(0, 2.3, 7.03), 1.25)); // the doors, open and lit
    // (lit windows, bright enough to glow through the night mist - softly,
    // as lights far off in the trees, not as paper cut-outs on the sky)
    hg.add(new THREE.Mesh(mergeGeometries(win), new THREE.MeshBasicMaterial({ color: '#a8692c', vertexColors: true, fog: false, toneMapped: false })));
    hg.position.set(f.x, 0, f.z);
    hg.rotation.y = Math.atan2(-f.x, -f.z);
    group.add(hg);
    const warm = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffb35c', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2, fog: false }));
    warm.position.set(f.x, 7, f.z);
    warm.scale.setScalar(46);
    group.add(warm);
  }
  let exo;
  {
    // the Sphere: a dome of light, its skin slowly drifting in colour
    const f = PLAZA.far.sphere;
    exo = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normal; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vP;
        void main(){
          float a = atan(vN.x, vN.z);
          float h = vN.y;
          vec3 c1 = vec3(0.15, 0.45, 0.95);
          vec3 c2 = vec3(0.65, 0.3, 0.95);
          vec3 c3 = vec3(0.1, 0.8, 0.75);
          float w = sin(a * 3.0 + uTime * 0.25 + h * 4.0) * 0.5 + 0.5;
          float v = sin(h * 9.0 - uTime * 0.4) * 0.5 + 0.5;
          vec3 c = mix(mix(c1, c2, w), c3, v * 0.35);
          // the LED grid
          vec2 g = fract(vec2(a * 24.0, h * 18.0)) - 0.5;
          float dotm = smoothstep(0.42, 0.2, length(g));
          c *= 0.3 + 0.7 * dotm;
          c *= (0.55 + 0.45 * smoothstep(0.0, 0.25, h)) * 0.7;
          gl_FragColor = vec4(c, 1.0);
        }`,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(15, lite ? 32 : 48, lite ? 16 : 24, 0, Math.PI * 2, 0, Math.PI * 0.62), exo);
    dome.position.set(f.x, -3.2, f.z);
    group.add(dome);
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#6aa8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4, fog: false }));
    light.position.set(f.x, 6, f.z);
    light.scale.setScalar(55);
    group.add(light);
  }

  // ---------------------------------------------------------- fireflies
  let flies;
  {
    const n = lite ? 50 : 130;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const r = rand(5);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = 4 + r() * 22;
      pos.set([Math.sin(a) * d, 0.4 + r() * 3.2, Math.cos(a) * d], i * 3);
      seed[i] = r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    flies = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
      vertexShader: `attribute float seed; uniform float uTime; uniform float uScale; varying float vA;
        void main(){
          vec3 p = position;
          float t = uTime * (0.2 + seed * 0.25);
          p += vec3(sin(t + seed * 30.0) * 1.2, sin(t * 1.3 + seed * 11.0) * 0.5, cos(t * 0.8 + seed * 17.0) * 1.2);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(0.13 * uScale / -mv.z, 40.0);
          vA = pow(0.5 + 0.5 * sin(uTime * (1.4 + seed * 2.0) + seed * 40.0), 3.0);
        }`,
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.0, 0.9, 0.5, smoothstep(0.5, 0.0, d) * vA); }',
    }));
    flies.frustumCulled = false;
    group.add(flies);
  }

  // ------------------------------------------------------------ the light
  scene.fog = new THREE.FogExp2('#0b1220', 0.022);
  const hemi = new THREE.HemisphereLight('#7c8fc0', '#2a2218', 1.25);
  const moon = new THREE.DirectionalLight('#b9c7ee', 0.9);
  moon.position.set(-30, 50, -40);
  // the lamps' warm spill across the square, from the side you arrive from
  const fill = new THREE.DirectionalLight('#ffd8a8', 0.55);
  fill.position.set(12, 14, 30);
  group.add(fill);
  const boothLight = new THREE.PointLight('#ffcd8a', 22, 11, 1.6);
  boothLight.position.set(0, 2.6, B.z + B.d / 2 + 0.9);
  group.add(hemi, moon, boothLight);

  update.push((dt, t) => {
    flies.material.uniforms.uTime.value = t;
    flies.material.uniforms.uScale.value = (window.innerHeight / 2) * pixelRatio(); // (in drawn pixels)
    exo.uniforms.uTime.value = t;
    for (const g of Object.values(gates)) {
      g.call += (g.want - g.call) * Math.min(1, dt * 2);
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.6);
      g.ring.material.opacity = 0.15 + g.call * 0.85 * pulse;
      g.veil.material.opacity = g.call * 0.5 * pulse;
      g.crown.material.opacity = g.call * 0.8 * pulse;
      g.veil.visible = g.crown.visible = g.call > 0.01;
    }
  });

  return {
    group,
    pickables,
    // your ticket's door calls you (id or null)
    callGate(id) { for (const [k, g] of Object.entries(gates)) g.want = k === id ? 1 : 0; },
    update(dt, t) { for (const f of update) f(dt, t); },
  };
}

// Is (x, z) somewhere you can stand? The cobbles, out through a gate a
// little way, never inside the booth, a lamp post or a pillar.
export function walkable(x, z) {
  const B = PLAZA.booth;
  if (Math.abs(x - B.x) < B.w / 2 + 0.3 && Math.abs(z - B.z) < B.d / 2 + 0.3) return false;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    if (Math.hypot(x - Math.sin(a) * (PLAZA.R - 0.9), z - Math.cos(a) * (PLAZA.R - 0.9)) < 0.45) return false;
  }
  for (const g of Object.values(PLAZA.gates)) {
    const yaw = gateYaw(g);
    for (const s of [-1, 1]) {
      const px = g.x + Math.cos(yaw) * s * 1.55;
      const pz = g.z - Math.sin(yaw) * s * 1.55;
      if (Math.hypot(x - px, z - pz) < 0.6) return false;
    }
  }
  return Math.hypot(x, z) < PLAZA.R - 0.3;
}
