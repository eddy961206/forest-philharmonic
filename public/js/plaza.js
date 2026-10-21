// The square in the forest: the first page. You arrive as your animal (a
// random one on your first visit, yours from then on), walk to the booth,
// choose a building and how you will watch, pay in whatever your kind trades
// in, and carry the ticket to that building's gate - which takes you there.
// The buildings are only loaded once you go through a gate: the square
// itself is small and quick, also on a phone.
import * as THREE from 'three';
import { buildPlaza, PLAZA, walkable, gateYaw } from './scene/plazaWorld.js';
import { buildCharacter, setArm, liteArmMeshes, syncLiteArms, updateFace } from './scene/characters.js';
import { setLite, setAnisotropy } from './scene/materials.js';
import { avatarInfo } from './scene/avatars.js';
import { identity, setName, issueTicket, heldTicket, lastTicket, ticketElement, modeLine, PAY, EMOJI, VENUE_NAMES } from './tickets.js';
import { SETLISTS } from './programs.js';
import { listRooms } from './net/room.js';

const $ = (id) => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const lerpAngle = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

const isTouch = navigator.maxTouchPoints > 1 && !window.matchMedia('(pointer: fine)').matches;
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (isTouch && window.innerWidth < 900);
const LITE = isMobile;

$('splash')?.remove();
$('plaza').hidden = false;
document.body.classList.toggle('touch', isTouch);
document.title = '숲속 공연 광장 · 숲속 필하모닉';

// ------------------------------------------------------------- the stage
const container = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: !LITE, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE ? 1.25 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
setAnisotropy(Math.min(LITE ? 2 : 8, renderer.capabilities.getMaxAnisotropy()));
setLite(LITE);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05080d');
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 400);
const world = buildPlaza(scene, { lite: LITE });

// ------------------------------------------------------------- who you are
let me = identity();
const kind = avatarInfo(me.avatar);
$('pzAni').textContent = EMOJI[me.avatar] || '🐾';
$('pzName').textContent = me.name;
$('pzKind').textContent = `오늘 밤 나는 ${kind.ko}`;

function nameTag(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '600 30px "IBM Plex Sans KR", system-ui, sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 40;
  c.width = w;
  c.height = 56;
  g.font = font;
  g.fillStyle = 'rgba(14, 11, 9, 0.6)';
  g.beginPath();
  g.roundRect(1, 1, w - 2, 54, 27);
  g.fill();
  g.fillStyle = '#f6efe0';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, w / 2, 29);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(w / 330, 56 / 330, 1);
  return s;
}

const player = {
  char: buildCharacter({ species: me.avatar, fur: kind.fur, outfit: Math.random() < 0.5 ? 'dress' : 'tail', standing: true }, '#e6c07b'),
  pos: V(PLAZA.spawn.x, 0, PLAZA.spawn.z),
  vel: V(),
  yaw: 0, // facing the booth (-z)
  phase: 0,
  tag: null,
};
player.char.setStanding(1);
player.tag = nameTag(me.name);
player.tag.position.set(0, 1.95, 0);
player.char.root.add(player.tag);
scene.add(player.char.root);

// the squirrel at the window
const clerk = buildCharacter({ species: 'squirrel', fur: '#b8693a', outfit: 'tail', standing: true }, '#c9a14e');
clerk.setStanding(1);
clerk.root.position.set(PLAZA.booth.x, 0.32, PLAZA.booth.z + 0.25);
clerk.root.rotation.y = Math.PI; // looking out of the window
scene.add(clerk.root);

// a few others crossing the square (not on phones: each animal is ~40 draws)
const SPECIES = ['fox', 'rabbit', 'bear', 'cat', 'panda', 'deer', 'sheep', 'koala', 'dog', 'hedgehog', 'mouse', 'owl', 'lion', 'raccoon'];
const strollers = [];
if (!LITE) {
  for (let i = 0; i < 2; i++) {
    const sp = SPECIES[(Math.floor(Math.random() * SPECIES.length) + i * 5) % SPECIES.length];
    const ch = buildCharacter({ species: sp, fur: avatarInfo(sp).fur, outfit: i % 2 ? 'dress' : 'tail', standing: true }, i ? '#9fd3ff' : '#ffcf8f');
    ch.setStanding(1);
    ch.root.visible = false;
    scene.add(ch.root);
    strollers.push({ char: ch, path: [], wait: 3 + i * 7, pos: V(), yaw: 0, phase: Math.random() * 6, fade: 0 });
  }
}
for (const m of liteArmMeshes()) scene.add(m);

// ------------------------------------------------------------ the ticket
let ticket = heldTicket();
let quickOk = false; // a last ticket to repeat (see below)
function showStub() {
  const stub = $('pzStub');
  stub.innerHTML = '';
  stub.hidden = !ticket;
  // (the shortcut is for coming without one)
  $('pzQuick').hidden = !!ticket || !quickOk;
  if (!ticket) { world.callGate(null); return; }
  stub.appendChild(ticketElement(ticket));
  world.callGate(ticket.venue);
  const side = ticket.venue === 'hall' ? '왼쪽' : '오른쪽';
  $('pzHint').textContent = `표를 들고 ${side} 숲길의 ${VENUE_NAMES[ticket.venue]} 입구로 걸어가요.`;
}
showStub();
$('pzStub').addEventListener('click', () => { if (ticket) toast(`${VENUE_NAMES[ticket.venue]} · ${modeLine(ticket)} · ${ticket.no}`, 2600); });

// "the same as last time": straight through
const last = lastTicket();
if (last && VENUE_NAMES[last.venue]) {
  quickOk = true;
  $('pzQuick').hidden = !!ticket;
  $('pzQuickWhat').textContent = `${VENUE_NAMES[last.venue]} · ${modeLine({ ...last, code: '' })}`;
  $('pzQuick').addEventListener('click', () => {
    if (busy) return;
    sfx.init();
    ticket = issueTicket({ venue: last.venue, mode: last.mode === 'create' ? 'create' : 'solo', title: last.title, cap: last.cap, pub: last.pub });
    showStub();
    enterGate(ticket.venue);
  });
}

// --------------------------------------------------------------- sounds
// Crickets and a breath of wind once you touch anything (browsers keep
// sound off until then), a clink for paying, a stamp, the gate's hush.
const sfx = {
  ctx: null,
  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.7;
    this.out.connect(ctx.destination);
    // wind: soft filtered noise
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    src.connect(lp).connect(g).connect(this.out);
    src.start();
    // crickets: short chirps from here and there
    const chirp = () => {
      if (!this.ctx) return;
      const t0 = ctx.currentTime + 0.02;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const o = ctx.createOscillator();
      const a = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 4100 + Math.random() * 600;
      a.gain.value = 0;
      const n = 3 + Math.floor(Math.random() * 3);
      const v = 0.006 + Math.random() * 0.01;
      for (let k = 0; k < n; k++) {
        a.gain.setValueAtTime(0, t0 + k * 0.07);
        a.gain.linearRampToValueAtTime(v, t0 + k * 0.07 + 0.012);
        a.gain.linearRampToValueAtTime(0, t0 + k * 0.07 + 0.045);
      }
      o.connect(a);
      if (pan) { pan.pan.value = Math.random() * 2 - 1; a.connect(pan).connect(this.out); } else a.connect(this.out);
      o.start(t0);
      o.stop(t0 + n * 0.07 + 0.05);
      setTimeout(chirp, 300 + Math.random() * 1400);
    };
    setTimeout(chirp, 400);
  },
  tone(f, at, dur, v = 0.08, type = 'sine') {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(v, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.out);
    o.start(at);
    o.stop(at + dur + 0.05);
  },
  clink() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    [0, 0.12, 0.26].forEach((dt, i) => this.tone(1900 + i * 260 + Math.random() * 80, t + dt, 0.25, 0.06, 'triangle'));
  },
  stamp() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(lp).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + 0.15);
    this.tone(523, t + 0.18, 0.5, 0.05);
    this.tone(784, t + 0.3, 0.7, 0.05);
  },
  hush() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    s.connect(bp).connect(g).connect(this.out);
    s.start(t);
    s.stop(t + 2.4);
    this.out.gain.setTargetAtTime(0, t + 1.2, 0.4);
  },
};
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => sfx.init(), { capture: true });

// ----------------------------------------------------------------- toast
let toastT = 0;
function toast(text, ms = 2400) {
  const el = $('pzToast');
  el.textContent = text;
  el.hidden = false;
  el.style.opacity = '1';
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.style.opacity = '0'; setTimeout(() => { el.hidden = true; }, 400); }, ms);
}

// ------------------------------------------------------------- the booth
const booth = { step: 1, venue: null, mode: null, room: null, pieces: null, online: null };
let index = null;
fetch('music/index.json').then((r) => r.json()).then((list) => { index = new Map(list.map((p) => [p.id, p])); buildVenueCards(); }).catch(() => {});

const INTRO = {
  hall: '달빛 숲 가장자리의 4층 그랜드 콘서트홀. 독주회와 현악 4중주, 합창 코랄이 진짜 공연장 울림으로 들려요. 환희의 송가로 열고 위풍당당 행진곡으로 닫아요.',
  sphere: '머리 위를 통째로 감싸는 16K 돔 스크린의 원형 공연장. 음악에 맞춰 돔이 숲이 되고, 바닷속이 되고, 별밤이 돼요. 바흐 크리스마스 오라토리오의 불꽃놀이로 끝나요.',
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function buildVenueCards() {
  const box = $('venueCards');
  box.innerHTML = '';
  for (const v of ['hall', 'sphere']) {
    const list = (SETLISTS[v] || []).map((id) => index?.get(id)).filter(Boolean);
    const total = list.reduce((a, p) => a + p.duration, 0);
    const solos = list.filter((p) => p.ensembleKo === '피아노').length;
    const choir = list.filter((p) => /합창/.test(p.ensembleKo)).length;
    const card = document.createElement('div');
    card.className = `venue-card ${v}`;
    card.innerHTML = '<div class="vc-art"><span></span></div><div class="vc-body"><p class="vc-intro"></p><p class="vc-facts"></p><details><summary>오늘의 편성표 보기</summary><ol></ol></details><button type="button" class="btn-enter"></button></div>';
    card.querySelector('.vc-art span').textContent = VENUE_NAMES[v];
    card.querySelector('.vc-intro').textContent = INTRO[v];
    card.querySelector('.vc-facts').textContent = list.length ? `${list.length}곡 · 약 ${Math.round(total / 60)}분 · 피아노 독주 ${solos}곡 · 합창 ${choir}곡 · 인터미션 한 번` : '';
    const ol = card.querySelector('ol');
    for (const p of list) {
      const li = document.createElement('li');
      li.textContent = `${p.titleKo} `;
      const sm = document.createElement('small');
      sm.textContent = `${p.composerKo} · ${p.ensembleKo} · ${fmt(p.duration)}`;
      li.appendChild(sm);
      ol.appendChild(li);
    }
    const b = card.querySelector('button');
    b.textContent = `${VENUE_NAMES[v]} 표로 할게요`;
    b.addEventListener('click', () => { booth.venue = v; goStep(2); });
    box.appendChild(card);
  }
}

function goStep(n) {
  booth.step = n;
  document.querySelectorAll('.booth-step').forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
  document.querySelectorAll('#boothSteps li').forEach((li) => {
    const s = Number(li.dataset.s);
    li.toggleAttribute('data-done', s < n);
    if (s === Math.min(n, 3)) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  const say = {
    1: '어서 와요! 어디로 가는 표를 드릴까요?',
    2: `${VENUE_NAMES[booth.venue] || ''}, 좋은 선택이에요. 어떻게 볼 거예요?`,
    3: `${PAY[me.avatar]?.what || '도토리 세 개'}면 돼요.`,
    4: '여기 있어요. 즐거운 밤 되세요!',
  }[n];
  $('boothSay').textContent = say;
  if (n === 2) refreshModes();
  if (n === 3) fillPay();
}

async function refreshModes() {
  // is the server there for rooms? and which rooms are open in this building
  let rooms = [];
  try { rooms = await listRooms(); booth.online = true; } catch { booth.online = false; }
  $('boothOffline').hidden = booth.online;
  document.querySelectorAll('.mode-card').forEach((b) => { b.disabled = !booth.online && b.dataset.mode !== 'solo'; });
  const mine = rooms.filter((r) => (r.venue || 'hall') === booth.venue && r.count < r.cap);
  $('openRooms').hidden = !mine.length;
  const ul = $('openList');
  ul.innerHTML = '';
  for (const r of mine) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<span></span><small></small>';
    b.querySelector('span').textContent = r.title;
    b.querySelector('small').textContent = `${r.count}/${r.cap} · ${r.piece ? (r.playing ? '연주 중' : '쉬는 중') : '시작 전'}`;
    b.addEventListener('click', () => {
      booth.mode = 'join';
      booth.room = r.code;
      $('bkCode').value = r.code;
      pickMode('join');
      ul.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    li.appendChild(b);
    ul.appendChild(li);
  }
  pickMode(booth.mode || 'solo');
}

function pickMode(m) {
  booth.mode = m;
  document.querySelectorAll('.mode-card').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  $('formCreate').hidden = m !== 'create';
  $('formJoin').hidden = m !== 'join';
  validate();
}
document.querySelectorAll('.mode-card').forEach((b) => b.addEventListener('click', () => pickMode(b.dataset.mode)));
let pub = true;
document.querySelectorAll('#bkVis button').forEach((b) => b.addEventListener('click', () => {
  pub = b.dataset.pub === '1';
  document.querySelectorAll('#bkVis button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));
$('bkCode').addEventListener('input', () => { $('bkCode').value = $('bkCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); validate(); });
function validate() {
  const ok = booth.mode === 'solo' || booth.mode === 'create' || (booth.mode === 'join' && $('bkCode').value.length === 6);
  $('toPay').disabled = !ok;
}
$('toPay').addEventListener('click', () => goStep(3));
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => goStep(Number(b.dataset.back))));

function fillPay() {
  const pay = PAY[me.avatar] || PAY.squirrel;
  const box = $('paySummary');
  box.innerHTML = '<span class="ps-icon"></span><span><b></b><small></small></span>';
  box.querySelector('.ps-icon').textContent = pay.icon;
  box.querySelector('b').textContent = `${VENUE_NAMES[booth.venue]} 입장권 한 장`;
  const how = booth.mode === 'create' ? `단체석 「${$('bkTitle').value.trim() || '우리들의 공연'}」` : booth.mode === 'join' ? `친구와 함께 · 방 ${$('bkCode').value}` : '혼자 보기 · 자유석';
  box.querySelector('small').textContent = `${how} · 값: ${pay.what}`;
  $('bkName').value = me.name;
  $('payBtn').textContent = `${pay.icon} ${pay.what} 내고 표 받기`;
}

$('payBtn').addEventListener('click', () => {
  me = setName($('bkName').value);
  $('pzName').textContent = me.name;
  // the payment drops on the counter
  const pay = PAY[me.avatar] || PAY.squirrel;
  const r = $('payBtn').getBoundingClientRect();
  const coins = document.createElement('div');
  coins.className = 'coins';
  for (let i = 0; i < 4; i++) {
    const s = document.createElement('span');
    s.textContent = pay.icon;
    s.style.left = `${r.left + r.width / 2 - 40 + i * 24}px`;
    s.style.top = `${r.top - 30}px`;
    s.style.animationDelay = `${i * 0.08}s`;
    coins.appendChild(s);
  }
  document.body.appendChild(coins);
  setTimeout(() => coins.remove(), 1400);
  sfx.clink();
  $('payBtn').disabled = true;
  setTimeout(() => {
    ticket = issueTicket({
      venue: booth.venue, mode: booth.mode,
      code: booth.mode === 'join' ? $('bkCode').value : undefined,
      title: booth.mode === 'create' ? $('bkTitle').value.trim() : undefined,
      cap: booth.mode === 'create' ? Math.max(1, Math.min(50, Math.round(Number($('bkCap').value) || 50))) : undefined,
      pub: booth.mode === 'create' ? pub : undefined,
    });
    // (a fresh name tag, if the name changed)
    player.char.root.remove(player.tag);
    player.tag = nameTag(me.name);
    player.tag.position.set(0, 1.95, 0);
    player.char.root.add(player.tag);
    sfx.stamp();
    $('boothTicket').innerHTML = '';
    $('boothTicket').appendChild(ticketElement(ticket));
    const side = ticket.venue === 'hall' ? '왼쪽' : '오른쪽';
    $('boothGo').textContent = `표를 들고 ${side} 숲길의 ${VENUE_NAMES[ticket.venue]} 입구로 가요. 빛나는 문이에요.`;
    $('payBtn').disabled = false;
    goStep(4);
  }, 650);
});

function openBooth() {
  if (busy) return;
  boothOpen = true;
  $('booth').hidden = false;
  setAct(null, null);
  autoTo = null;
  keys.clear();
  goStep(ticket ? 1 : 1);
  if (index) buildVenueCards();
}
function closeBooth() {
  boothOpen = false;
  $('booth').hidden = true;
  showStub();
}
$('boothClose').addEventListener('click', closeBooth);
$('boothDone').addEventListener('click', closeBooth);
$('booth').addEventListener('click', (e) => { if (e.target.id === 'booth') closeBooth(); });

// ------------------------------------------------------------- the gates
let busy = false;
function enterGate(venue) {
  if (busy) return;
  busy = true;
  keys.clear();
  const gate = $('pzGate');
  const t = ticketElement(ticket);
  $('pzGateTicket').innerHTML = '';
  $('pzGateTicket').appendChild(t);
  $('pzGateLine').textContent = `숲길을 따라 ${VENUE_NAMES[venue]}(으)로 가는 중…`;
  gate.hidden = false;
  $('pzStub').hidden = true;
  requestAnimationFrame(() => t.classList.add('torn'));
  sfx.stamp();
  setTimeout(() => { gate.classList.add('dark'); sfx.hush(); }, 700);
  try { localStorage.setItem('fp-venue', venue); } catch { /* ignore */ }
  setTimeout(() => { location.href = `./?venue=${venue}`; }, 2300);
}

// ------------------------------------------------------------ the input
const keys = new Set();
let boothOpen = false;
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Escape' && boothOpen) { closeBooth(); return; }
  if (boothOpen || busy) return;
  if (e.code === 'KeyF' || e.code === 'KeyE') { if (act) act(); return; }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
    keys.add(e.code);
    autoTo = null;
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// the camera: behind you, turned by dragging, nearer or farther with the wheel
const cam = { yaw: 0, pitch: 0.32, dist: 4.2 };
// (a tall, narrow screen sees less to the sides: stand the camera farther back)
const fitCam = () => { cam.dist = Math.max(cam.dist, window.innerWidth / window.innerHeight < 0.8 ? 6.4 : 4.2); };
fitCam();
let drag = null;
const canvas = renderer.domElement;
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', (e) => {
  if (boothOpen || busy) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  cam.yaw -= dx * 0.006;
  cam.pitch = Math.min(1.05, Math.max(0.05, cam.pitch + dy * 0.004));
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const tap = drag.moved < 8;
  drag = null;
  if (tap) onTap(e.clientX, e.clientY);
});
canvas.addEventListener('wheel', (e) => { cam.dist = Math.min(8, Math.max(2.4, cam.dist * Math.exp(e.deltaY * 0.001))); e.preventDefault(); }, { passive: false });

// a tap on the booth or a gate walks you there
const ray = new THREE.Raycaster();
let autoTo = null; // { x, z, then }
function onTap(x, y) {
  ray.setFromCamera(new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1), camera);
  let best = null;
  for (const [k, list] of Object.entries(world.pickables)) {
    const hit = ray.intersectObjects(list, false)[0];
    if (hit && (!best || hit.distance < best.d)) best = { k, d: hit.distance };
  }
  if (!best) return;
  if (best.k === 'booth') autoTo = { x: PLAZA.window.x, z: PLAZA.window.z + 0.3, then: 'booth' };
  else {
    const id = best.k.split(':')[1];
    const g = PLAZA.gates[id];
    autoTo = { x: g.x * 0.93, z: g.z * 0.93, then: `gate:${id}` };
  }
}

// the joystick (touch screens)
const joy = { x: 0, y: 0 };
if (isTouch) {
  const base = $('pzJoy');
  base.hidden = false;
  const knob = $('pzKnob');
  let id = null;
  let cx = 0;
  let cy = 0;
  base.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    const r = base.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    base.setPointerCapture(id);
    autoTo = null;
    e.preventDefault();
  });
  base.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > 46) { dx *= 46 / d; dy *= 46 / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.x = dx / 46;
    joy.y = dy / 46;
  });
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; joy.x = 0; joy.y = 0; };
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
}

// what F (or the button) does here
let act = null;
let actText = '';
$('pzAct').addEventListener('click', () => { if (act) act(); });
function setAct(text, fn) {
  act = fn;
  if (text === actText) return;
  actText = text;
  $('pzAct').hidden = !text;
  $('pzActText').textContent = text || '';
}

// ------------------------------------------------------------- moving
const WALK = 2.3;
const RUN = 4.4;
const _f = V();
const _r = V();
let warned = 0;
function movePlayer(dt) {
  const p = player;
  let mx = 0;
  let mz = 0;
  if (!boothOpen && !busy) {
    _f.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    _r.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    const k = (c) => keys.has(c);
    const f = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) - joy.y;
    const s = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + joy.x;
    mx = _f.x * f + _r.x * s;
    mz = _f.z * f + _r.z * s;
    if (autoTo && !mx && !mz) {
      const dx = autoTo.x - p.pos.x;
      const dz = autoTo.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        const then = autoTo.then;
        autoTo = null;
        if (then === 'booth') { p.yaw = 0; openBooth(); }
      } else { mx = dx / d; mz = dz / d; }
    }
  }
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK;
  p.vel.x = smooth(p.vel.x, mx * speed, 10, dt);
  p.vel.z = smooth(p.vel.z, mz * speed, 10, dt);
  const nx = p.pos.x + p.vel.x * dt;
  const nz = p.pos.z + p.vel.z * dt;
  // slide along whatever is in the way
  if (walkable(nx, nz)) { p.pos.x = nx; p.pos.z = nz; } else if (walkable(nx, p.pos.z)) { p.pos.x = nx; p.vel.z *= 0.5; } else if (walkable(p.pos.x, nz)) { p.pos.z = nz; p.vel.x *= 0.5; } else { p.vel.multiplyScalar(0.2); if (autoTo) autoTo = null; }
  const sp = Math.hypot(p.vel.x, p.vel.z);
  if (sp > 0.15) p.yaw = lerpAngle(p.yaw, Math.atan2(-p.vel.x, -p.vel.z), 1 - Math.exp(-dt * 10));
  return sp;
}

function animateWalker(ch, pos, yaw, sp, phaseObj, dt) {
  const walking = sp > 0.2;
  if (walking) phaseObj.phase += dt * 7.2 * Math.min(1.8, sp / 1.25);
  const amp = walking ? Math.min(0.6, 0.3 + sp * 0.1) : 0;
  ch.walk(phaseObj.phase, amp);
  ch.root.position.set(pos.x, pos.y + (walking ? Math.abs(Math.sin(phaseObj.phase)) * 0.03 : 0), pos.z);
  ch.root.rotation.y = yaw;
  const sw = Math.sin(phaseObj.phase) * 0.13 * (amp * 2);
  setArm(ch, 'L', V(-0.26, 0.5, 0.02 + sw), V(-0.2, 0, 0.6));
  setArm(ch, 'R', V(0.26, 0.5, 0.02 - sw), V(0.2, 0, 0.6));
  ch.torso.scale.y = 1 + Math.sin(performance.now() / 600 + phaseObj.phase) * 0.012;
  updateFace(ch, dt, 0);
}

// strollers: from the edge of the square to the window, a moment there,
// then off through one of the gates
function strollerPath() {
  // (they come from the open side of the square, never from behind the booth)
  const a = (Math.random() * 1.1 - 0.55) * Math.PI;
  const start = { x: Math.sin(a) * (PLAZA.R - 0.6), z: Math.cos(a) * (PLAZA.R - 0.6) };
  const id = Math.random() < 0.5 ? 'hall' : 'sphere';
  const gate = PLAZA.gates[id];
  const side = id === 'hall' ? -1 : 1;
  return [
    start,
    { x: PLAZA.window.x + side * 0.8, z: PLAZA.window.z + 0.55, pause: 2.5 + Math.random() * 2 },
    { x: side * 2.8, z: 0.4 }, // round the corner of the booth
    { x: gate.x * 0.85, z: gate.z * 0.85 },
    { x: gate.x * 1.08, z: gate.z * 1.08, out: true },
  ];
}
function updateStrollers(dt) {
  for (const s of strollers) {
    const ch = s.char;
    if (!s.path.length) {
      s.wait -= dt;
      ch.root.visible = false;
      if (s.wait <= 0) { s.path = strollerPath(); s.pos.set(s.path[0].x, 0, s.path[0].z); s.path.shift(); s.fade = 0; ch.root.visible = true; }
      continue;
    }
    const t = s.path[0];
    if (t.pause > 0 && Math.hypot(t.x - s.pos.x, t.z - s.pos.z) < 0.2) {
      t.pause -= dt;
      s.yaw = lerpAngle(s.yaw, 0, 1 - Math.exp(-dt * 6));
      animateWalker(ch, s.pos, s.yaw, 0, s, dt);
      continue;
    }
    const dx = t.x - s.pos.x;
    const dz = t.z - s.pos.z;
    const d = Math.hypot(dx, dz);
    const step = 1.15 * dt;
    if (d <= step) {
      s.pos.x = t.x;
      s.pos.z = t.z;
      if (!(t.pause > 0)) s.path.shift();
      if (t.out) { s.path = []; s.wait = 6 + Math.random() * 10; }
    } else {
      s.pos.x += (dx / d) * step;
      s.pos.z += (dz / d) * step;
      s.yaw = lerpAngle(s.yaw, Math.atan2(-dx, -dz), 1 - Math.exp(-dt * 6));
    }
    animateWalker(ch, s.pos, s.yaw, d > step ? 1.15 : 0, s, dt);
  }
}

// the clerk: breathes, looks your way, waves when you come near
const clerkState = { phase: 0, wave: 0 };
function updateClerk(dt, t) {
  const d = Math.hypot(player.pos.x - PLAZA.window.x, player.pos.z - PLAZA.window.z);
  const near = d < 3.2 && !busy;
  clerkState.wave = smooth(clerkState.wave, near && !boothOpen ? 1 : 0, 4, dt);
  // (the head turns toward you, relative to the way the clerk faces)
  let look = Math.atan2(-(player.pos.x - clerk.root.position.x), -(player.pos.z - clerk.root.position.z)) - clerk.root.rotation.y;
  look = Math.atan2(Math.sin(look), Math.cos(look)) * (d < 9 ? 1 : 0);
  clerk.head.rotation.y = smooth(clerk.head.rotation.y, Math.max(-0.7, Math.min(0.7, look)), 4, dt);
  clerk.torso.scale.y = 1 + Math.sin(t * 1.6) * 0.015;
  const w = clerkState.wave;
  const wv = Math.sin(t * 9) * 0.08 * w;
  setArm(clerk, 'R', V(0.26 + 0.08 * w, 0.5 + 0.62 * w, 0.02 - 0.1 * w + wv), V(0.4, -0.2, 0.3));
  setArm(clerk, 'L', V(-0.2, 0.62, -0.18), V(-0.4, -0.5, 0.3));
  updateFace(clerk, dt, 0);
}

// ---------------------------------------------------------- the camera
const _look = V();
const _want = V();
function placeCamera(dt, first = false) {
  const p = player.pos;
  const cp = Math.cos(cam.pitch);
  _want.set(p.x + Math.sin(cam.yaw) * cp * cam.dist, 1.25 + Math.sin(cam.pitch) * cam.dist, p.z + Math.cos(cam.yaw) * cp * cam.dist);
  // (not inside the booth)
  const B = PLAZA.booth;
  if (Math.abs(_want.x - B.x) < B.w / 2 + 0.25 && Math.abs(_want.z - B.z) < B.d / 2 + 0.25 && _want.y < 3.2) _want.y = 3.4;
  // (and not out among the trees round the square)
  const rr = Math.hypot(_want.x, _want.z);
  if (rr > 14.5) { _want.x *= 14.5 / rr; _want.z *= 14.5 / rr; }
  if (first) camera.position.copy(_want); else camera.position.lerp(_want, 1 - Math.exp(-dt * 8));
  _look.set(p.x, 1.05, p.z);
  camera.lookAt(_look);
}

// --------------------------------------------------------------- the loop
let lastT = performance.now();
let elapsed = 0;
placeCamera(0, true);
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  step(dt, now);
  syncLiteArms();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// one moment of the square (without drawing it)
function step(dt, now = performance.now()) {
  elapsed += dt;
  const sp = movePlayer(dt);
  animateWalker(player.char, player.pos, player.yaw, sp, player, dt);
  updateClerk(dt, elapsed);
  updateStrollers(dt);
  world.update(dt, elapsed);
  placeCamera(dt);

  // what is near: the window, a gate
  if (!busy && !boothOpen) {
    const dWin = Math.hypot(player.pos.x - PLAZA.window.x, player.pos.z - PLAZA.window.z);
    let near = null;
    for (const [id, g] of Object.entries(PLAZA.gates)) if (Math.hypot(player.pos.x - g.x, player.pos.z - g.z) < 1.9) near = id;
    if (near) {
      if (ticket?.venue === near) { setAct(null, null); enterGate(near); } else {
        setAct(null, null);
        if (now - warned > 4000) {
          warned = now;
          toast(ticket ? `이 표는 ${VENUE_NAMES[ticket.venue]} 표예요. 반대편 숲길로 가요.` : '표가 있어야 들어갈 수 있어요. 매표소는 광장 가운데에 있어요.', 3000);
        }
      }
    } else if (dWin < 2.1) setAct(ticket ? '매표소에서 표 다시 사기' : '매표소 다람쥐에게 말 걸기', openBooth);
    else setAct(null, null);
  }
}

window.addEventListener('resize', () => {
  fitCam();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// first frame drawn: lift the curtain
renderer.compile(scene, camera);
requestAnimationFrame(() => {
  frame();
  setTimeout(() => $('pzLoading').classList.add('done'), 120);
  if (!ticket) setTimeout(() => toast(`어서 와요, ${me.name}! 오늘 밤은 ${kind.ko}의 모습으로 왔어요. 가운데 매표소에서 표를 사 봐요.`, 4600), 900);
});

window.__plaza = { scene, camera, renderer, world, player, cam, keys, step, walkable, joy, get autoTo() { return autoTo; }, get ticket() { return ticket; }, openBooth, enterGate, PLAZA, gateYaw };
