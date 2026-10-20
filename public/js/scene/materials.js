// Procedural textures and the shared PBR material library.
import * as THREE from 'three';

let maxAniso = 8;
export function setAnisotropy(n) { maxAniso = n; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// deterministic noise so textures look the same every load
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Long-grain wood: stripes with flowing figure and pores
export function woodTexture({ base = '#8a5a32', dark = '#5b3519', light = '#b07a46', seed = 1, w = 512, h = 1024, planks = 0 } = {}) {
  const [c, g] = canvas(w, h);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const plankW = planks ? w / planks : w;
  for (let p = 0; p < (planks || 1); p++) {
    const x0 = p * plankW;
    const tint = (r() - 0.5) * 30;
    g.fillStyle = `rgba(${tint > 0 ? 255 : 0},${tint > 0 ? 220 : 0},${tint > 0 ? 170 : 0},${Math.abs(tint) / 255})`;
    g.fillRect(x0, 0, plankW, h);
    const lines = 70;
    for (let i = 0; i < lines; i++) {
      const xi = x0 + r() * plankW;
      const amp = 2 + r() * 10;
      const freq = 0.004 + r() * 0.01;
      const ph = r() * 10;
      g.strokeStyle = r() < 0.5 ? dark : light;
      g.globalAlpha = 0.05 + r() * 0.16;
      g.lineWidth = 0.6 + r() * 2.6;
      g.beginPath();
      for (let y = 0; y <= h; y += 8) {
        const x = xi + Math.sin(y * freq + ph) * amp + Math.sin(y * freq * 3.1 + ph) * amp * 0.25;
        if (y === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 0.18;
    for (let i = 0; i < 900; i++) {
      g.fillStyle = dark;
      g.fillRect(x0 + r() * plankW, r() * h, 1, 2 + r() * 5);
    }
    if (planks) {
      g.globalAlpha = 0.5;
      g.fillStyle = '#2a170a';
      g.fillRect(x0, 0, 1.5, h);
      // staggered plank ends
      let y = r() * h * 0.5;
      while (y < h) {
        g.fillRect(x0, y, plankW, 1.5);
        y += h * (0.35 + r() * 0.4);
      }
    }
    g.globalAlpha = 1;
  }
  return c;
}

// Fine velvet / mohair seat fabric
export function velvetTexture(color = '#7c1d2a', seed = 3) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,200,200,0.05)';
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  return c;
}

export function carpetTexture(color = '#5c1620', seed = 9) {
  const [c, g] = canvas(512, 512);
  const r = rng(seed);
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 512);
  g.globalAlpha = 0.16;
  for (let i = 0; i < 20000; i++) {
    g.fillStyle = r() < 0.5 ? '#000' : '#c97a5a';
    g.fillRect(r() * 512, r() * 512, 1, 1);
  }
  // subtle diamond motif
  g.globalAlpha = 0.07;
  g.strokeStyle = '#e6b36a';
  g.lineWidth = 2;
  for (let y = -64; y < 576; y += 64) {
    for (let x = -64; x < 576; x += 64) {
      g.beginPath();
      g.moveTo(x, y + 32); g.lineTo(x + 32, y); g.lineTo(x + 64, y + 32); g.lineTo(x + 32, y + 64); g.closePath();
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  return c;
}

// a page of printed music: staves, bar lines and note heads
export function sheetMusicTexture() {
  const [c, g] = canvas(512, 340);
  const r = rng(77);
  g.fillStyle = '#f3ecd9';
  g.fillRect(0, 0, 512, 340);
  g.strokeStyle = 'rgba(40,30,25,0.75)';
  g.fillStyle = 'rgba(30,22,18,0.85)';
  for (let s = 0; s < 6; s++) {
    const y0 = 34 + s * 50;
    g.lineWidth = 1;
    for (let l = 0; l < 5; l++) {
      g.beginPath(); g.moveTo(24, y0 + l * 5); g.lineTo(490, y0 + l * 5); g.stroke();
    }
    for (const bx of [24, 140, 256, 372, 490]) { g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx, y0 + 20); g.stroke(); }
    for (let x = 40; x < 480; x += 14 + r() * 14) {
      if (r() < 0.12) continue;
      const y = y0 + Math.floor(r() * 9) * 2.5 - 2;
      g.beginPath(); g.ellipse(x, y, 3.6, 2.6, -0.4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(x + 3.3, y); g.lineTo(x + 3.3, y - 15); g.stroke();
    }
  }
  return c;
}

// soft round glow for sprites
export function glowTexture(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,200,120,0)') {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.6)'));
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function noteGlyphTexture(glyph) {
  const [c, g] = canvas(128, 128);
  g.shadowColor = 'rgba(255,255,255,0.9)';
  g.shadowBlur = 18;
  g.fillStyle = '#fff';
  g.font = '92px "Segoe UI Symbol","Noto Music","Apple Symbols",serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


// Veined marble (cream or dark); `tiles` > 0 draws a checkerboard of both
export function marbleTexture({ base = '#efe6d6', vein = '#b9a98f', seed = 5, tiles = 0, dark = '#2b2422', darkVein = '#7d6a55', size = 1024 } = {}) {
  const [c, g] = canvas(size, size);
  const r = rng(seed);
  const paintVeins = (x0, y0, w, h, col, n) => {
    g.save();
    g.beginPath();
    g.rect(x0, y0, w, h);
    g.clip();
    for (let i = 0; i < n; i++) {
      let x = x0 + r() * w;
      let y = y0 + r() * h;
      const ang = r() * Math.PI * 2;
      g.strokeStyle = col;
      g.globalAlpha = 0.08 + r() * 0.25;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 40; k++) {
        x += Math.cos(ang + Math.sin(k * 0.4 + i) * 0.9) * (w / 40);
        y += Math.sin(ang + Math.sin(k * 0.4 + i) * 0.9) * (h / 40);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
  };
  if (!tiles) {
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    paintVeins(0, 0, size, size, vein, 34);
  } else {
    const t = size / tiles;
    for (let j = 0; j < tiles; j++) {
      for (let i = 0; i < tiles; i++) {
        const d = (i + j) % 2 === 1;
        g.fillStyle = d ? dark : base;
        g.fillRect(i * t, j * t, t, t);
        paintVeins(i * t, j * t, t, t, d ? darkVein : vein, 9);
        g.strokeStyle = 'rgba(40,30,20,0.35)';
        g.lineWidth = 1.5;
        g.strokeRect(i * t + 0.5, j * t + 0.5, t - 1, t - 1);
      }
    }
  }
  // fine mottling
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.04)';
    g.fillRect(r() * size, r() * size, 2, 2);
  }
  return c;
}

// Fluted wood panel: vertical reeds catching light
export function flutedTexture({ base = '#7b4524', seed = 13, flutes = 16 } = {}) {
  const c = woodTexture({ base, dark: '#3e1f0e', light: '#b07444', seed, w: 512, h: 512 });
  const g = c.getContext('2d');
  const fw = 512 / flutes;
  for (let i = 0; i < flutes; i++) {
    const x = i * fw;
    const grd = g.createLinearGradient(x, 0, x + fw, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.38)');
    grd.addColorStop(0.18, 'rgba(0,0,0,0.05)');
    grd.addColorStop(0.5, 'rgba(255,225,180,0.16)');
    grd.addColorStop(0.82, 'rgba(0,0,0,0.04)');
    grd.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = grd;
    g.fillRect(x, 0, fw, 512);
  }
  return c;
}

// Ivory relief with gilded scrolls and rosettes, for balcony fronts
export function ornamentTexture({ base = '#efe2c4', gold = '#c49a45', w = 1024, h = 256 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const sh = g.createLinearGradient(0, 0, 0, h);
  sh.addColorStop(0, 'rgba(255,255,255,0.12)');
  sh.addColorStop(1, 'rgba(60,40,20,0.22)');
  g.fillStyle = sh;
  g.fillRect(0, 0, w, h);
  g.fillStyle = gold;
  g.fillRect(0, 10, w, 10);
  g.fillRect(0, h - 22, w, 12);
  g.fillStyle = 'rgba(90,60,20,0.5)';
  g.fillRect(0, 20, w, 2);
  g.fillRect(0, h - 24, w, 2);
  const n = 4;
  const cw = w / n;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const cx = i * cw + cw / 2;
    const cy = h / 2;
    g.strokeStyle = gold;
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(cx, cy, 34, 46, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(196,154,69,0.22)';
    g.fill();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.fillStyle = gold;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, 9, 5, a, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(cx, cy, 7, 0, Math.PI * 2);
    g.fillStyle = '#e8c878';
    g.fill();
    for (const sd of [-1, 1]) {
      g.strokeStyle = gold;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(cx + sd * 40, cy);
      g.bezierCurveTo(cx + sd * 70, cy - 50, cx + sd * 110, cy + 40, cx + sd * 92, cy + 6);
      g.stroke();
      g.beginPath();
      g.arc(cx + sd * 92, cy + 2, 9, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx + sd * 44, cy + 18);
      g.quadraticCurveTo(cx + sd * 80, cy + 60, cx + sd * 118, cy + 30);
      g.stroke();
    }
  }
  return c;
}

// Coffer: recessed cream panel with a gilt frame and a rosette
export function cofferTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#d8c6a2';
  g.fillRect(0, 0, 512, 512);
  const steps = [['#b48c48', 0], ['#e9dbbb', 26], ['#cdb68a', 44], ['#efe3c8', 56]];
  for (const [col, inset] of steps) {
    g.fillStyle = col;
    g.fillRect(inset, inset, 512 - inset * 2, 512 - inset * 2);
  }
  const grd = g.createRadialGradient(256, 256, 20, 256, 256, 190);
  grd.addColorStop(0, '#f3e9d2');
  grd.addColorStop(1, '#dcc9a3');
  g.fillStyle = grd;
  g.fillRect(70, 70, 372, 372);
  g.fillStyle = '#c49a45';
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.beginPath();
    g.ellipse(256 + Math.cos(a) * 40, 256 + Math.sin(a) * 40, 30, 12, a, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.arc(256, 256, 26, 0, Math.PI * 2);
  g.fillStyle = '#e2bf6e';
  g.fill();
  g.strokeStyle = '#a57b32';
  g.lineWidth = 4;
  g.strokeRect(70, 70, 372, 372);
  return c;
}

export function carpetRoyalTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(19);
  g.fillStyle = '#5a1119';
  g.fillRect(0, 0, 512, 512);
  g.globalAlpha = 0.12;
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = r() < 0.5 ? '#000' : '#c25a4a';
    g.fillRect(r() * 512, r() * 512, 1, 1);
  }
  g.globalAlpha = 1;
  g.fillStyle = '#b8893c';
  g.fillRect(20, 0, 10, 512);
  g.fillRect(482, 0, 10, 512);
  g.fillStyle = 'rgba(184,137,60,0.55)';
  g.fillRect(40, 0, 3, 512);
  g.fillRect(469, 0, 3, 512);
  g.fillStyle = 'rgba(200,150,70,0.28)';
  for (let y = 32; y < 512; y += 128) {
    for (const x of [140, 372]) {
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x + 26, y + 32); g.lineTo(x, y + 64); g.lineTo(x - 26, y + 32); g.closePath();
      g.fill();
    }
    g.beginPath();
    g.arc(256, y + 96, 14, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

// ------------------------------------------------------------------ library
const cache = new Map();
function once(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export const M = {
  stageWood: () => once('stageWood', () => new THREE.MeshPhysicalMaterial({
    map: tex(woodTexture({ base: '#a8743f', dark: '#6b4220', light: '#d2a36a', seed: 11, planks: 6 }), { repeat: [7, 7] }),
    roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35,
  })),
  panelWood: () => once('panelWood', () => new THREE.MeshStandardMaterial({
    map: tex(woodTexture({ base: '#7a4a26', dark: '#4a2a12', light: '#a06a3a', seed: 21 }), { repeat: [2, 1] }),
    roughness: 0.55,
  })),
  darkWood: () => once('darkWood', () => new THREE.MeshStandardMaterial({
    map: tex(woodTexture({ base: '#4b2a17', dark: '#26130a', light: '#6b3f22', seed: 31 }), { repeat: [1, 1] }),
    roughness: 0.5,
  })),
  floorWood: () => once('floorWood', () => new THREE.MeshStandardMaterial({
    map: tex(woodTexture({ base: '#6d4527', dark: '#3d2412', light: '#8d5e36', seed: 41, planks: 8 }), { repeat: [10, 10] }),
    roughness: 0.6,
  })),
  carpet: () => once('carpet', () => new THREE.MeshStandardMaterial({
    map: tex(carpetTexture(), { repeat: [3, 18] }), roughness: 0.95,
  })),
  velvet: () => once('velvet', () => new THREE.MeshPhysicalMaterial({
    map: tex(velvetTexture()), color: '#ffffff', roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#ff8a8a'), sheenRoughness: 0.45,
  })),
  gold: () => once('gold', () => new THREE.MeshStandardMaterial({ color: '#b98b45', metalness: 1, roughness: 0.4 })),
  brass: () => once('brass', () => new THREE.MeshStandardMaterial({ color: '#e2b851', metalness: 1, roughness: 0.18 })),
  silver: () => once('silver', () => new THREE.MeshStandardMaterial({ color: '#e7e9ee', metalness: 1, roughness: 0.15 })),
  copper: () => once('copper', () => new THREE.MeshStandardMaterial({ color: '#c47a4a', metalness: 1, roughness: 0.3 })),
  blackLacquer: () => once('blackLacquer', () => new THREE.MeshPhysicalMaterial({ color: '#08080a', roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 })),
  blackMatte: () => once('blackMatte', () => new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.7 })),
  ebony: () => once('ebony', () => new THREE.MeshStandardMaterial({ color: '#0d0b0a', roughness: 0.35 })),
  ivory: () => once('ivory', () => new THREE.MeshStandardMaterial({ color: '#ddd5c2', roughness: 0.5 })),
  paper: () => once('paper', () => new THREE.MeshStandardMaterial({ map: tex(sheetMusicTexture(), { repeat: [1, 1] }), roughness: 0.9, side: THREE.DoubleSide })),
  wall: () => once('wall', () => new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: 0.85 })),
  plaster: () => once('plaster', () => new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.9 })),
  leaf: () => once('leaf', () => new THREE.MeshStandardMaterial({ color: '#3d6b3a', roughness: 0.8, flatShading: true })),
  leafLight: () => once('leafLight', () => new THREE.MeshStandardMaterial({ color: '#5f8f4a', roughness: 0.8, flatShading: true })),
  bark: () => once('bark', () => new THREE.MeshStandardMaterial({
    map: tex(woodTexture({ base: '#5a3a24', dark: '#2e1b0e', light: '#7a5536', seed: 51, w: 256, h: 512 }), { repeat: [3, 2] }),
    roughness: 0.9,
  })),
  // ---- the luxury hall
  gilt: () => once('gilt', () => new THREE.MeshStandardMaterial({ color: '#c9a14e', metalness: 1, roughness: 0.32 })),
  giltDark: () => once('giltDark', () => new THREE.MeshStandardMaterial({ color: '#8f6c2c', metalness: 1, roughness: 0.45 })),
  walnut: () => once('walnut', () => new THREE.MeshStandardMaterial({
    map: tex(woodTexture({ base: '#3c2014', dark: '#1c0d06', light: '#5c3420', seed: 71 }), { repeat: [1, 1] }),
    roughness: 0.42,
  })),
  fluted: () => once('fluted', () => new THREE.MeshStandardMaterial({ map: tex(flutedTexture(), { repeat: [1, 1] }), roughness: 0.5 })),
  shell: () => once('shell', () => new THREE.MeshPhysicalMaterial({
    map: tex(flutedTexture({ base: '#9a5a2c', seed: 17, flutes: 12 }), { repeat: [1, 1] }),
    roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.4,
  })),
  ivoryPlaster: () => once('ivoryPlaster', () => new THREE.MeshStandardMaterial({ color: '#d9caa9', roughness: 0.85 })),
  creamWall: () => once('creamWall', () => new THREE.MeshStandardMaterial({ color: '#b39b78', roughness: 0.9 })),
  ornament: () => once('ornament', () => new THREE.MeshStandardMaterial({ map: tex(ornamentTexture(), { repeat: [1, 1] }), roughness: 0.55, metalness: 0.15 })),
  coffer: () => once('coffer', () => new THREE.MeshStandardMaterial({ map: tex(cofferTexture(), { repeat: [1, 1] }), roughness: 0.75 })),
  marbleFloor: () => once('marbleFloor', () => new THREE.MeshPhysicalMaterial({
    map: tex(marbleTexture({ tiles: 4, seed: 23 }), { repeat: [1, 1] }), roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.12,
  })),
  marble: () => once('marble', () => new THREE.MeshStandardMaterial({ map: tex(marbleTexture({ seed: 29 }), { repeat: [1, 2] }), roughness: 0.22 })),
  marbleDark: () => once('marbleDark', () => new THREE.MeshStandardMaterial({ map: tex(marbleTexture({ base: '#3a2320', vein: '#a0715a', seed: 31 }), { repeat: [1, 2] }), roughness: 0.25 })),
  carpetRoyal: () => once('carpetRoyal', () => new THREE.MeshStandardMaterial({ map: tex(carpetRoyalTexture(), { repeat: [1, 8] }), roughness: 0.95 })),
  velvetTint: () => once('velvetTint', () => new THREE.MeshPhysicalMaterial({
    map: tex(velvetTexture('#d8d8d8', 4)), color: '#ffffff', roughness: 0.82, sheen: 1, sheenColor: new THREE.Color('#ffd6d0'), sheenRoughness: 0.5,
  })),
  bulb: () => once('bulb', () => new THREE.MeshStandardMaterial({ color: '#fff2d6', emissive: '#ffcf8a', emissiveIntensity: 5, roughness: 0.3 })),
  crystal: () => once('crystal', () => new THREE.MeshStandardMaterial({ color: '#fffaf0', emissive: '#ffe2b0', emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.08, flatShading: true })),
  // string instrument varnish: deep amber with clearcoat
  varnish: (hue = '#8c3a12') => once(`varnish${hue}`, () => new THREE.MeshPhysicalMaterial({
    color: hue,
    map: tex(woodTexture({ base: '#c98a52', dark: '#7a4320', light: '#e8b27a', seed: 61, w: 256, h: 512 })),
    roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.2,
  })),
  string: () => once('string', () => new THREE.MeshStandardMaterial({ color: '#d9d4c7', metalness: 0.8, roughness: 0.3 })),
  bowHair: () => once('bowHair', () => new THREE.MeshStandardMaterial({ color: '#f4efe2', roughness: 0.8 })),
};

// Fur never reaches pure white: under stage light a white rabbit should read
// as soft white fur, not glow.
const tame = (color, max = 0.78) => {
  const c = new THREE.Color(color);
  const hsl = {};
  c.getHSL(hsl);
  if (hsl.l > max) c.setHSL(hsl.h, hsl.s, max + (hsl.l - max) * 0.35);
  return c;
};

export function furMaterial(color) {
  return once(`fur${color}`, () => {
    const c = tame(color);
    return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.9, sheen: 0.22, sheenRoughness: 0.75, sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.1) });
  });
}

export function clothMaterial(color, sheen = 0.6) {
  return once(`cloth${color}${sheen}`, () => {
    const c = tame(color, 0.8);
    return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.78, sheen: sheen * 0.6, sheenRoughness: 0.55, sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.2) });
  });
}

export function plainMaterial(color, opts = {}) {
  return once(`plain${color}${JSON.stringify(opts)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts }));
}
