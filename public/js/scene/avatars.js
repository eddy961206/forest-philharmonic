// The other people in the room: each one is a forest animal in evening
// dress with a name tag, walking where they walk and sitting where they sit.
// Poses arrive ~10 times a second and are smoothed in between.
import * as THREE from 'three';
import { buildCharacter, setArm, releaseCharacter } from './characters.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ZERO = new THREE.Vector3();

// what you can be (species from characters.js)
export const AVATARS = [
  { id: 'fox', ko: '여우', fur: '#e8823a' },
  { id: 'rabbit', ko: '토끼', fur: '#fbf6ef' },
  { id: 'bear', ko: '곰', fur: '#8a5a3b' },
  { id: 'cat', ko: '고양이', fur: '#f2a65a' },
  { id: 'panda', ko: '판다', fur: '#f4f1ea' },
  { id: 'raccoon', ko: '너구리', fur: '#8d8580' },
  { id: 'deer', ko: '사슴', fur: '#b77b4f' },
  { id: 'sheep', ko: '양', fur: '#f6f1e7' },
  { id: 'owl', ko: '부엉이', fur: '#9b7653' },
  { id: 'koala', ko: '코알라', fur: '#9fa3a8' },
  { id: 'dog', ko: '강아지', fur: '#d9a066' },
  { id: 'squirrel', ko: '다람쥐', fur: '#b8693a' },
  { id: 'hedgehog', ko: '고슴도치', fur: '#c9a27a' },
  { id: 'lion', ko: '사자', fur: '#e0b066' },
  { id: 'mouse', ko: '생쥐', fur: '#b9b0a8' },
];
const byId = new Map(AVATARS.map((a) => [a.id, a]));
export const avatarInfo = (id) => byId.get(id) || AVATARS[2];

const ADJ = ['춤추는', '졸린', '노래하는', '수줍은', '반짝이는', '느긋한', '용감한', '배고픈', '설레는', '콧노래 부르는', '꿈꾸는', '박수 치는', '산책하는', '눈 감은', '귀 기울이는'];
export function randomIdentity() {
  const a = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  return { avatar: a.id, name: `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${a.ko}` };
}

const smooth = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// ------------------------------------------------------------ name tags
const FONT = '600 30px "IBM Plex Sans KR", system-ui, sans-serif';
function wrap(ctx, text, max) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > max && line) { lines.push(line); line = ''; if (lines.length === 3) break; }
    line += ch;
  }
  if (lines.length < 3 && line) lines.push(line);
  else if (line) lines[2] = `${lines[2].slice(0, -1)}…`;
  return lines;
}

function tagSprite(text, { host = false, bubble = false } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = FONT;
  const label = host ? `👑 ${text}` : text;
  const lines = bubble ? wrap(ctx, text, 420) : [label];
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 40;
  const lh = 40;
  const h = lines.length * lh + 20 + (bubble ? 14 : 0);
  c.width = w;
  c.height = h;
  ctx.font = FONT;
  const bh = h - (bubble ? 14 : 0);
  ctx.fillStyle = bubble ? 'rgba(250, 244, 230, 0.94)' : 'rgba(14, 11, 9, 0.62)';
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, bh - 2, bubble ? 18 : bh / 2);
  ctx.fill();
  if (bubble) {
    ctx.beginPath();
    ctx.moveTo(w / 2 - 10, bh - 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(w / 2 + 10, bh - 2);
    ctx.fill();
  } else if (host) {
    ctx.strokeStyle = 'rgba(230, 192, 123, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = bubble ? '#2a1d14' : '#f2ede1';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, 10 + lh * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  const H = bubble ? 0.16 * (h / 60) : 0.15;
  sp.scale.set((H * w) / h, H, 1);
  sp.renderOrder = 10;
  sp.center.set(0.5, 0);
  return sp;
}
const disposeSprite = (s) => { if (!s) return; s.removeFromParent(); s.material.map.dispose(); s.material.dispose(); };

// ------------------------------------------------------------- one person
class Avatar {
  constructor(member, scene, seats) {
    this.id = member.id;
    this.name = member.name;
    this.seats = seats;
    const a = avatarInfo(member.avatar);
    const hue = (member.id * 67) % 360;
    this.char = buildCharacter({ species: a.id, fur: a.fur, outfit: member.id % 2 ? 'dress' : 'tail' }, `hsl(${hue}, 60%, 68%)`);
    this.char.root.name = `avatar:${member.id}`;
    scene.add(this.char.root);
    this.pos = V();
    this.target = V();
    this.yaw = 0;
    this.targetYaw = 0;
    this.seat = -1;
    this.stand = 1;
    this.phase = Math.random() * 6;
    this.placed = false;
    this.host = false;
    this.tag = null;
    this.bubble = null;
    this.bubbleUntil = 0;
    this._makeTag();
    this.char.root.visible = false;
    if (member.p) this.setPose(member.p);
  }

  _makeTag() {
    disposeSprite(this.tag);
    this.tag = tagSprite(this.name, { host: this.host });
    this.char.root.add(this.tag);
  }

  setHost(on) {
    if (on === this.host) return;
    this.host = on;
    this._makeTag();
  }

  say(text) {
    disposeSprite(this.bubble);
    this.bubble = tagSprite(text, { bubble: true });
    this.char.root.add(this.bubble);
    this.bubbleUntil = performance.now() + 6500;
  }

  setPose(p) {
    const s = p.s >= 0 ? this.seats[p.s] : null;
    this.seat = s ? p.s : -1;
    if (s) {
      // in the seat, a touch back from its front edge, facing the stage
      this.target.set(s.x + Math.sin(s.yaw) * 0.04, s.y, s.z + Math.cos(s.yaw) * 0.04);
      this.targetYaw = s.yaw;
    } else {
      this.target.set(p.x, p.y, p.z);
      this.targetYaw = p.r;
    }
    if (!this.placed) {
      this.placed = true;
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
      this.stand = s ? 0 : 1;
      this.char.root.visible = true;
    }
  }

  update(dt, cam, now) {
    if (!this.placed) return;
    const ch = this.char;
    const before = this.pos.clone();
    // far jumps (sitting down across the hall, a fall) are taken at once
    if (this.pos.distanceTo(this.target) > 4) this.pos.copy(this.target);
    else this.pos.lerp(this.target, 1 - Math.exp(-dt * 9));
    const speed = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-3);
    const walking = this.seat < 0 && speed > 0.25;
    this.yaw = lerpAngle(this.yaw, this.targetYaw, 1 - Math.exp(-dt * 8));
    this.stand = smooth(this.stand, this.seat >= 0 ? 0 : 1, 5, dt);
    ch.setStanding(this.stand);
    if (walking) this.phase += dt * 7.2 * Math.min(1.6, speed / 1.25);
    const amp = walking ? 0.5 : 0;
    ch.walk(this.phase, amp);
    // (two people on one spot - everyone arrives at the same door - stand a
    // step apart: a small sideways nudge, see Avatars.update)
    this.shown ||= new THREE.Vector3();
    this.shown.lerp(this.nudge || ZERO, 1 - Math.exp(-dt * 4));
    ch.root.position.copy(this.pos).add(this.shown);
    // (standing right where our camera is: not drawn - no fur and faces inside the lens)
    const near = this.seat < 0 && Math.hypot(cam.x - ch.root.position.x, cam.z - ch.root.position.z) < 0.55 && Math.abs(cam.y - ch.root.position.y - 1.5) < 1.2;
    ch.root.visible = !near;
    if (walking) ch.root.position.y += Math.abs(Math.sin(this.phase)) * 0.025;
    ch.root.rotation.y = this.yaw;

    // arms: on the lap in a seat, hanging (and swinging) when on foot
    if (this.stand > 0.5) {
      const sw = Math.sin(this.phase) * 0.13 * (amp * 2);
      setArm(ch, 'L', V(-0.26, 0.5, 0.02 + sw), V(-0.2, 0, 0.6));
      setArm(ch, 'R', V(0.26, 0.5, 0.02 - sw), V(0.2, 0, 0.6));
    } else {
      setArm(ch, 'L', V(-0.12, 0.65, -0.22), V(-0.4, -0.5, 0.3));
      setArm(ch, 'R', V(0.12, 0.65, -0.22), V(0.4, -0.5, 0.3));
    }

    // tags stay readable but quiet at a distance
    const d = cam.distanceTo(this.pos);
    const top = 1.72 + 0.16 * this.stand; // above the tallest ears
    this.tag.position.set(0, top, 0);
    this.tag.visible = d < 32;
    if (this.bubble) {
      const left = this.bubbleUntil - now;
      if (left <= 0) { disposeSprite(this.bubble); this.bubble = null; } else {
        this.bubble.position.set(0, top + 0.2, 0);
        this.bubble.material.opacity = Math.min(1, left / 600);
        this.bubble.visible = d < 40;
      }
    }
  }

  dispose() {
    disposeSprite(this.tag);
    disposeSprite(this.bubble);
    releaseCharacter(this.char);
    this.char.root.removeFromParent();
    this.char.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
}

// -------------------------------------------------------------- everyone
export class Avatars {
  constructor(scene, seats) {
    this.scene = scene;
    this.seats = seats;
    this.list = new Map();
  }

  add(member) {
    if (this.list.has(member.id)) return this.list.get(member.id);
    const a = new Avatar(member, this.scene, this.seats);
    this.list.set(member.id, a);
    return a;
  }

  remove(id) {
    const a = this.list.get(id);
    if (!a) return;
    a.dispose();
    this.list.delete(id);
  }

  clear() { for (const id of [...this.list.keys()]) this.remove(id); }
  pose(id, p) { this.list.get(id)?.setPose(p); }
  say(id, text) { this.list.get(id)?.say(text); }
  setHost(id) { for (const a of this.list.values()) a.setHost(a.id === id); }

  // seats taken by people in the room
  occupied() {
    const s = new Set();
    for (const a of this.list.values()) if (a.seat >= 0) s.add(a.seat);
    return s;
  }

  update(dt, cam) {
    const now = performance.now();
    // people standing on (almost) the same spot are drawn a little apart
    const standing = [...this.list.values()].filter((a) => a.placed && a.seat < 0);
    for (const a of this.list.values()) (a.nudge ||= new THREE.Vector3()).set(0, 0, 0);
    for (let i = 0; i < standing.length; i++) {
      for (let j = i + 1; j < standing.length; j++) {
        const a = standing[i];
        const b = standing[j];
        const dx = b.target.x - a.target.x;
        const dz = b.target.z - a.target.z;
        const d = Math.hypot(dx, dz);
        if (d >= 0.6 || Math.abs(b.target.y - a.target.y) > 1) continue;
        // (exactly on top of each other: side by side, in a row across the doorway)
        const ang = d > 0.01 ? Math.atan2(dz, dx) : 0;
        const push = Math.min(0.3, (0.6 - d) / 2);
        a.nudge.x -= Math.cos(ang) * push; a.nudge.z -= Math.sin(ang) * push;
        b.nudge.x += Math.cos(ang) * push; b.nudge.z += Math.sin(ang) * push;
      }
    }
    for (const a of this.list.values()) a.update(dt, cam, now);
  }
}
