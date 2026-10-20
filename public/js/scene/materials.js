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
  // string instrument varnish: deep amber with clearcoat
  varnish: (hue = '#8c3a12') => once(`varnish${hue}`, () => new THREE.MeshPhysicalMaterial({
    color: hue,
    map: tex(woodTexture({ base: '#c98a52', dark: '#7a4320', light: '#e8b27a', seed: 61, w: 256, h: 512 })),
    roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.2,
  })),
  string: () => once('string', () => new THREE.MeshStandardMaterial({ color: '#d9d4c7', metalness: 0.8, roughness: 0.3 })),
  bowHair: () => once('bowHair', () => new THREE.MeshStandardMaterial({ color: '#f4efe2', roughness: 0.8 })),
};

export function furMaterial(color) {
  return once(`fur${color}`, () => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.85, sheen: 0.45, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.2),
  }));
}

export function clothMaterial(color, sheen = 0.6) {
  return once(`cloth${color}${sheen}`, () => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.75, sheen, sheenRoughness: 0.5, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35),
  }));
}

export function plainMaterial(color, opts = {}) {
  return once(`plain${color}${JSON.stringify(opts)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts }));
}
