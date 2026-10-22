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
import { identity, setName, issueTicket, heldTicket, lastTicket, ticketElement, modeLine, ticketQuery, canKeep, PAY, EMOJI, VENUE_NAMES } from './tickets.js';
import { SETLISTS } from './programs.js';
import { listRooms } from './net/room.js';
import { thumbStick, tapButton } from './joystick.js';
import { watchRenderContext } from './render-status.js';

const $ = (id) => document.getElementById(id);
const GATE_IDS = Object.keys(PLAZA.gates);
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
$('stage').setAttribute('aria-label', '3D 숲속 공연 광장');

// ------------------------------------------------------------- the stage
const container = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: !LITE, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE ? 1.25 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
renderer.domElement.tabIndex = -1; // (where the keys go back to when the booth closes)
setAnisotropy(Math.min(LITE ? 2 : 8, renderer.capabilities.getMaxAnisotropy()));
setLite(LITE);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05080d');
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 400);
const world = buildPlaza(scene, { lite: LITE, pixelRatio: () => renderer.getPixelRatio() });

// ------------------------------------------------------------- who you are
let me = identity();
const kind = avatarInfo(me.avatar);
$('pzAni').textContent = EMOJI[me.avatar] || '🐾';
$('pzName').textContent = me.name;
$('pzKind').textContent = `오늘 밤 나는 ${kind.ko}`;

const player = {
  char: buildCharacter({ species: me.avatar, fur: kind.fur, outfit: me.outfit || 'tail', standing: true }, '#e6c07b'),
  pos: V(PLAZA.spawn.x, 0, PLAZA.spawn.z),
  vel: V(),
  yaw: 0, // facing the booth (-z)
  phase: 0,
};
player.char.setStanding(1);
// Back from a building (the page you came from was one): you come out of
// its gate, facing the square - not at the far edge like the first time.
const cameFrom = (() => {
  try {
    const u = new URL(document.referrer);
    if (u.origin !== location.origin) return null;
    const v = u.searchParams.get('venue') || (u.searchParams.get('room') ? 'hall' : null);
    return PLAZA.gates[v] ? v : null;
  } catch { return null; }
})();
if (cameFrom) {
  const g = PLAZA.gates[cameFrom];
  player.pos.set(g.x * 0.7, 0, g.z * 0.7);
  player.yaw = Math.atan2(g.x, g.z);
}
// (no name over your own head: seen from behind it sat in the middle of
// everything you were looking at - the corner of the screen says who you are)
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
// (tapButton: a tap counts while the other thumb is on the stick, see joystick.js)
tapButton($('pzStub'), () => { if (ticket) toast(`${VENUE_NAMES[ticket.venue]} · ${modeLine(ticket)} · ${ticket.no}`, 2600); });

// "the same as last time": straight through
const last = lastTicket();
if (last && VENUE_NAMES[last.venue]) {
  quickOk = true;
  $('pzQuick').hidden = !!ticket;
  $('pzQuickWhat').textContent = `${VENUE_NAMES[last.venue]} · ${modeLine({ ...last, code: '' })}`;
  tapButton($('pzQuick'), () => {
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
    const t = ctx.currentTime;
    // wind: soft filtered noise, rising in (no click) and slowly breathing
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650;
    const lfo = ctx.createOscillator();
    const lfoAmt = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoAmt.gain.value = 220;
    lfo.connect(lfoAmt).connect(lp.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(0.085, t, 1.5);
    src.connect(lp).connect(g).connect(this.out);
    src.start(t);
    lfo.start(t);
    // crickets: four of them, each in its own place in the grass with its
    // own voice - they call, rest, and call again
    const crickets = [-0.75, -0.3, 0.35, 0.8].map((x, i) => ({ pan: x, f: 4050 + i * 170 + Math.random() * 80, v: 0.016 + Math.random() * 0.014 }));
    const chirp = (c) => {
      if (!this.ctx) return;
      if (document.hidden) { setTimeout(() => chirp(c), 1500); return; }
      const t0 = ctx.currentTime + 0.02;
      const o = ctx.createOscillator();
      const a = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(c.f, t0);
      const n = 3 + Math.floor(Math.random() * 3);
      // (each pulse a hair lower: the wing slowing)
      o.frequency.linearRampToValueAtTime(c.f * 0.985, t0 + n * 0.07);
      a.gain.value = 0;
      for (let k = 0; k < n; k++) {
        a.gain.setValueAtTime(0, t0 + k * 0.07);
        a.gain.linearRampToValueAtTime(c.v, t0 + k * 0.07 + 0.012);
        a.gain.linearRampToValueAtTime(0, t0 + k * 0.07 + 0.045);
      }
      o.connect(a);
      if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); pan.pan.value = c.pan; a.connect(pan).connect(this.out); } else a.connect(this.out);
      o.start(t0);
      o.stop(t0 + n * 0.07 + 0.05);
      setTimeout(() => chirp(c), 900 + Math.random() * 2600);
    };
    crickets.forEach((c, i) => setTimeout(() => chirp(c), 500 + i * 650 + Math.random() * 900));
    // a background tab is silent
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx || this.leaving) return;
      if (document.hidden) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {});
    });
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
    // little things dropping on the wooden counter: a knock and a ring
    // (a pure tone with one inharmonic partial - not the buzz of a triangle)
    [0, 0.11, 0.24].forEach((dt, i) => {
      const f = 1500 + i * 210 + Math.random() * 90;
      this.tone(f, t + dt, 0.22, 0.05);
      this.tone(f * 2.76, t + dt, 0.09, 0.016);
      this.tone(180 + i * 20, t + dt, 0.06, 0.05, 'triangle');
    });
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
    // (all quiet by the time the page changes, 1.6 s from now)
    this.leaving = true;
    this.out.gain.setTargetAtTime(0, t + 0.8, 0.22);
  },
};
// (a touch only counts as permission for sound when it ends: pointerup, click)
for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown']) window.addEventListener(ev, () => sfx.init(), { capture: true });

// ----------------------------------------------------------------- toast
let toastT = 0;
let toastOff = 0;
function toast(text, ms = 2400) {
  const el = $('pzToast');
  el.textContent = text;
  el.hidden = false;
  el.style.opacity = '1';
  clearTimeout(toastT);
  clearTimeout(toastOff);
  toastT = setTimeout(() => { el.style.opacity = '0'; toastOff = setTimeout(() => { el.hidden = true; }, 400); }, ms);
}

// ------------------------------------------------------------- the booth
const booth = { step: 1, venue: null, mode: null, room: null, pieces: null, online: null };
let index = null;
// (the cards are there at once; the setlists fill in when they arrive)
// (a failed fetch is tried again when the booth opens)
let indexAsk = null;
function fetchIndex() {
  if (index || indexAsk) return;
  indexAsk = fetch('music/index.json').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((list) => { index = new Map(list.map((p) => [p.id, p])); buildVenueCards(); }).catch(() => {}).finally(() => { indexAsk = null; });
}
fetchIndex();

const INTRO = {
  hall: '달빛 숲 가장자리의 4층 그랜드 콘서트홀. 독주회와 현악 4중주, 합창 코랄이 진짜 공연장 울림으로 들려요. 환희의 송가로 열고 위풍당당 행진곡으로 닫아요.',
  sphere: '머리 위를 통째로 감싸는 16K 돔 스크린의 원형 공연장. 음악에 맞춰 돔이 숲이 되고, 바닷속이 되고, 별밤이 돼요. 바흐 크리스마스 오라토리오의 불꽃놀이로 끝나요.',
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
// Korean particles follow the last syllable: 홀로 / 숲으로, 개면 / 알이면
const lastJong = (w) => { const t = String(w).trim(); const c = t.charCodeAt(t.length - 1) - 0xac00; return c >= 0 && c < 11172 ? c % 28 : 0; };
const ro = (w) => { const j = lastJong(w); return `${w}${j && j !== 8 ? '으로' : '로'}`; };
const imyeon = (w) => `${w}${lastJong(w) ? '이면' : '면'}`;

function buildVenueCards() {
  const box = $('venueCards');
  // (rebuilt while you are on them: the focus stays on the same card)
  const had = [...box.querySelectorAll('button')].indexOf(document.activeElement);
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
    if (!list.length) card.querySelector('details').hidden = true;
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
    b.addEventListener('click', () => {
      // (another building: what was chosen for the first one does not carry over)
      if (booth.venue !== v) { booth.mode = 'solo'; booth.room = null; $('bkCode').value = ''; }
      booth.venue = v;
      goStep(2);
    });
    box.appendChild(card);
  }
  if (had >= 0) box.querySelectorAll('button')[had]?.focus({ preventScroll: true });
}

function goStep(n) {
  booth.step = n;
  document.querySelectorAll('.booth-step').forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
  // (a new step starts at the top of the card, not where the last one was scrolled)
  const card = document.querySelector('.booth-card'); if (card) card.scrollTop = 0;
  document.querySelectorAll('#boothSteps li').forEach((li) => {
    const s = Number(li.dataset.s);
    li.toggleAttribute('data-done', s < n);
    if (s === Math.min(n, 3)) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  const say = {
    1: '어서 와요! 어디로 가는 표를 드릴까요?',
    2: `${VENUE_NAMES[booth.venue] || ''}, 좋은 선택이에요. 어떻게 볼 거예요?`,
    3: `${imyeon(PAY[me.avatar]?.what || '도토리 세 개')} 돼요.`,
    4: '여기 있어요. 즐거운 밤 되세요!',
  }[n];
  $('boothSay').textContent = say;
  if (n === 2) refreshModes();
  if (n === 3) fillPay();
  // (the keys go on with you: to the first thing on the new step)
  if (boothOpen && n < 4) {
    const first = n === 1 ? $('venueCards').querySelector('button') : n === 2 ? document.querySelector(`.mode-card[data-mode=${booth.mode || 'solo'}]`) : isTouch ? $('payBtn') : $('bkName'); // (no keyboard popping up on a phone)
    first?.focus({ preventScroll: true });
  }
}

async function refreshModes() {
  // is the server there for rooms? and which rooms are open in this building
  // (until it answers, only "alone" can be chosen)
  if (booth.online !== true) document.querySelectorAll('.mode-card').forEach((b) => { b.disabled = b.dataset.mode !== 'solo'; });
  // (and alone is chosen already: "next" works while the server is asked)
  pickMode(booth.online === true ? booth.mode || 'solo' : 'solo');
  let rooms = [];
  try {
    rooms = await Promise.race([listRooms(), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 5000))]);
    booth.online = true;
  } catch { booth.online = false; }
  if (booth.step !== 2) return;
  $('boothOffline').hidden = booth.online;
  document.querySelectorAll('.mode-card').forEach((b) => { b.disabled = !booth.online && b.dataset.mode !== 'solo'; });
  if (!booth.online) booth.mode = 'solo';
  const mine = rooms.filter((r) => (r.venue || 'hall') === booth.venue && r.count < r.cap);
  $('openRooms').hidden = !mine.length;
  const ul = $('openList');
  ul.innerHTML = '';
  for (const r of mine) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.code = r.code;
    b.innerHTML = '<span></span><small></small>';
    b.querySelector('span').textContent = r.title;
    b.querySelector('small').textContent = `${r.count}/${r.cap} · ${r.piece ? (r.playing ? '연주 중' : '쉬는 중') : '시작 전'}`;
    b.addEventListener('click', () => {
      booth.mode = 'join';
      booth.room = r.code;
      $('bkCode').value = r.code;
      pickMode('join');
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
  markRoom();
  validate();
}
// (an open show is marked chosen only while it is the code you will join)
function markRoom() {
  const code = booth.mode === 'join' ? $('bkCode').value : '';
  $('openList').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(!!code && x.dataset.code === code)));
}
document.querySelectorAll('.mode-card').forEach((b) => b.addEventListener('click', () => pickMode(b.dataset.mode)));
let pub = true;
document.querySelectorAll('#bkVis button').forEach((b) => b.addEventListener('click', () => {
  pub = b.dataset.pub === '1';
  document.querySelectorAll('#bkVis button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));
$('bkCode').addEventListener('input', () => { $('bkCode').value = $('bkCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); $('bkCodeNote').hidden = true; markRoom(); validate(); });
function validate() {
  const ok = booth.mode === 'solo' || booth.mode === 'create' || (booth.mode === 'join' && $('bkCode').value.length === 6);
  $('toPay').disabled = !ok;
}
$('toPay').addEventListener('click', async () => {
  if (booth.mode !== 'join') { goStep(3); return; }
  // a friend's code: is there such a room, in which building, with a seat?
  // (asked here, not at the door after the walk; no answer: the door checks)
  const code = $('bkCode').value;
  const note = (text) => { $('bkCodeNote').textContent = text; $('bkCodeNote').hidden = false; };
  $('toPay').disabled = true;
  let r = null;
  try {
    const res = await Promise.race([fetch(`api/rooms/${code}`, { cache: 'no-store' }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
    if (res.status === 404) r = { gone: true }; else if (res.ok) r = await res.json();
  } catch { /* no answer */ }
  validate();
  if (booth.mode !== 'join' || code !== $('bkCode').value) return; // (changed meanwhile)
  if (r?.gone) { note('그 방을 찾지 못했어요. 코드를 다시 확인해 주세요.'); return; }
  if (r?.full) { note('그 방은 지금 가득 찼어요.'); return; }
  if (r?.venue && VENUE_NAMES[r.venue] && r.venue !== booth.venue) {
    // the room is in the other building: the ticket is for that one
    booth.venue = r.venue;
    toast(`그 방은 ${VENUE_NAMES[r.venue]}에 있어요. 그곳 표로 드릴게요.`, 3600);
  }
  goStep(3);
});
// (not while the payment is on the counter: the ticket is already coming)
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { if (!paying) goStep(Number(b.dataset.back)); }));

function fillPay() {
  const pay = PAY[me.avatar] || PAY.squirrel;
  const box = $('paySummary');
  box.innerHTML = '<span class="ps-icon"></span><span><b></b><small></small></span>';
  box.querySelector('.ps-icon').textContent = pay.icon;
  box.querySelector('b').textContent = `${VENUE_NAMES[booth.venue]} 입장권 한 장`;
  const how = booth.mode === 'create' ? `단체석 「${$('bkTitle').value.trim() || `${me.name}의 공연`}」` : booth.mode === 'join' ? `친구와 함께 · 방 ${$('bkCode').value}` : '혼자 보기 · 자유석';
  box.querySelector('small').textContent = `${how} · 값: ${pay.what}`;
  // (what you wrote stays written, also after a step back)
  if (!nameDraft) $('bkName').value = me.name;
  $('payBtn').textContent = `${pay.icon} ${pay.what} 내고 표 받기`;
}

let paying = false;
let nameDraft = false;
$('bkName').addEventListener('input', () => { nameDraft = true; });
$('payBtn').addEventListener('click', () => {
  if (paying) return;
  paying = true;
  me = setName($('bkName').value);
  $('pzName').textContent = me.name;
  // the payment drops on the counter
  const pay = PAY[me.avatar] || PAY.squirrel;
  // (from your paw over the counter: where the price is shown, so it is seen falling)
  const r = ($('paySummary').querySelector('.ps-icon') || $('payBtn')).getBoundingClientRect();
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
      // (no name for the seats: the room is called after you, and so is the ticket)
      title: booth.mode === 'create' ? $('bkTitle').value.trim() || `${me.name}의 공연` : undefined,
      cap: booth.mode === 'create' ? Math.max(1, Math.min(50, Math.round(Number($('bkCap').value) || 50))) : undefined,
      pub: booth.mode === 'create' ? pub : undefined,
    });
    sfx.stamp();
    $('boothTicket').innerHTML = '';
    $('boothTicket').appendChild(ticketElement(ticket));
    const side = ticket.venue === 'hall' ? '왼쪽' : '오른쪽';
    $('boothGo').textContent = `표를 들고 ${side} 숲길의 ${VENUE_NAMES[ticket.venue]} 입구로 가요. 빛나는 문이에요.`;
    $('payBtn').disabled = false;
    paying = false;
    goStep(4);
    $('boothDone').focus({ preventScroll: true }); // (the ticket stays in view from its top)
  }, 650);
});

const BEHIND = ['pzTop', 'pzQuick', 'pzStub', 'pzAct', 'pzMe', 'stage'];
function openBooth() {
  if (busy || boothOpen) return;
  boothOpen = true;
  $('booth').hidden = false;
  setAct(null, null);
  autoTo = null;
  keys.clear();
  if (!$('venueCards').children.length) buildVenueCards();
  fetchIndex();
  goStep(1);
  // (what is behind the dialog cannot be reached while it is open)
  for (const id of BEHIND) $(id)?.setAttribute('inert', '');
  requestAnimationFrame(() => $('venueCards').querySelector('button')?.focus({ preventScroll: true }));
}
function closeBooth() {
  if (paying || !boothOpen) return;
  boothOpen = false;
  $('booth').hidden = true;
  for (const id of BEHIND) $(id)?.removeAttribute('inert');
  showStub();
  renderer.domElement.focus?.({ preventScroll: true });
}
$('boothClose').addEventListener('click', closeBooth);
$('boothDone').addEventListener('click', closeBooth);
// (a click on the veil round the card closes it - one that started there too,
// and not the second half of a double click whose first half changed the step)
let veilDown = false;
$('booth').addEventListener('pointerdown', (e) => { veilDown = e.target.id === 'booth'; });
$('booth').addEventListener('click', (e) => { if (e.target.id === 'booth' && veilDown && e.detail < 2) closeBooth(); });

// ------------------------------------------------------------- the gates
let busy = false;
function enterGate(venue) {
  if (busy) return;
  busy = true;
  keys.clear();
  // (whatever was being said - "welcome", "buy a ticket" - is over now)
  clearTimeout(toastT);
  clearTimeout(toastOff);
  $('pzToast').hidden = true;
  const gate = $('pzGate');
  const t = ticketElement(ticket);
  $('pzGateTicket').innerHTML = '';
  $('pzGateTicket').appendChild(t);
  $('pzGateLine').textContent = `숲길을 따라 ${ro(VENUE_NAMES[venue])} 가는 중…`;
  gate.hidden = false;
  $('pzStub').hidden = true;
  requestAnimationFrame(() => t.classList.add('torn'));
  sfx.stamp();
  setTimeout(() => { gate.classList.add('dark'); sfx.hush(); }, 700);
  try { localStorage.setItem('fp-venue', venue); } catch { /* ignore */ }
  // (where nothing can be kept, the ticket goes along in the address)
  setTimeout(() => { location.href = `./?venue=${venue}${ticketQuery(ticket)}`; }, 2300);
}
// (a gate opens for someone walking into it. Back on the square by the
// browser's Back button you are still standing in its mouth: it waits until
// you have stepped away from it)
let gateArmed = true;

// Back from a building with the browser's back button: the page can come
// back exactly as it was left - dark, mid-way through the gate. Start over.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  busy = false;
  $('pzGate').hidden = true;
  $('pzGate').classList.remove('dark');
  // (nowhere to keep it: the ticket is still the one in your paw)
  ticket = heldTicket() || (canKeep() ? null : ticket);
  showStub();
  gateArmed = false;
  autoTo = null;
  keys.clear();
  player.vel.set(0, 0, 0);
  // (turned round, facing the square again)
  for (const id of GATE_IDS) {
    const g = PLAZA.gates[id];
    if (Math.hypot(player.pos.x - g.x, player.pos.z - g.z) < 3) player.yaw = cam.yaw = Math.atan2(g.x, g.z);
  }
  if (sfx.ctx) {
    sfx.leaving = false;
    sfx.ctx.resume().catch(() => {});
    sfx.out.gain.cancelScheduledValues(sfx.ctx.currentTime);
    sfx.out.gain.setTargetAtTime(0.7, sfx.ctx.currentTime, 0.3);
  }
  lastT = performance.now();
});

// ------------------------------------------------------------ the input
const keys = new Set();
let boothOpen = false;
window.addEventListener('keydown', (e) => {
  // (Esc in the middle of a Korean syllable only ends the syllable)
  if (e.code === 'Escape' && boothOpen) { if (!e.isComposing && e.keyCode !== 229) closeBooth(); return; }
  if (e.target instanceof HTMLInputElement) return;
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
const cam = { yaw: player.yaw, pitch: 0.32, dist: 4.2 };
// (a tall, narrow screen sees less to the sides: stand the camera farther back)
let camFit = 0;
const fitCam = () => {
  // (follows the screen when it turns; a zoom of your own is kept)
  const want = window.innerWidth / window.innerHeight < 0.8 ? 6.4 : 4.2;
  if (!camFit || Math.abs(cam.dist - camFit) < 0.01) cam.dist = want;
  camFit = want;
};
fitCam();
let drag = null;
const canvas = renderer.domElement;
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', (e) => {
  if (boothOpen || busy || drag || e.button !== 0) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* a pointer already gone */ }
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
canvas.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) drag = null; });
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
  if (best.k === 'booth') autoTo = { x: PLAZA.window.x, z: PLAZA.window.z + 0.3, then: 'booth', best: Infinity, stuck: 0 };
  else {
    const id = best.k.split(':')[1];
    const g = PLAZA.gates[id];
    autoTo = { x: g.x * 0.93, z: g.z * 0.93, then: `gate:${id}`, best: Infinity, stuck: 0 };
  }
}

// the thumb stick (touch screens): it comes to your left thumb
const joy = isTouch ? thumbStick({ base: $('pzJoy'), knob: $('pzKnob'), zone: $('pzJoyZone') }) : { x: 0, y: 0 };
if (isTouch) { $('pzJoy').hidden = false; $('pzJoyZone').hidden = false; }

// what F (or the button) does here
let act = null;
let actText = '';
tapButton($('pzAct'), () => { if (act) act(); });
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
    if (joy.active && (mx || mz)) autoTo = null;
    if (autoTo && !mx && !mz) {
      const dx = autoTo.x - p.pos.x;
      const dz = autoTo.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        const then = autoTo.then;
        autoTo = null;
        if (then === 'booth') { p.yaw = 0; openBooth(); }
      } else {
        mx = dx / d;
        mz = dz / d;
        // (no nearer for a while - a wall in the way: stop, and say so)
        if (d < autoTo.best - 0.05) { autoTo.best = d; autoTo.stuck = 0; } else if ((autoTo.stuck += dt) > 0.8) {
          autoTo = null;
          toast('여기서는 막혀 있어요. 돌아서 걸어가 봐요.', 2200);
        }
      }
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

const _aL = V();
const _aR = V();
const _eL = V(-0.2, 0, 0.6);
const _eR = V(0.2, 0, 0.6);
function animateWalker(ch, pos, yaw, sp, phaseObj, dt) {
  const walking = sp > 0.2;
  if (walking) phaseObj.phase += dt * 7.2 * Math.min(1.8, sp / 1.25);
  const amp = walking ? Math.min(0.6, 0.3 + sp * 0.1) : 0;
  ch.walk(phaseObj.phase, amp);
  ch.root.position.set(pos.x, pos.y + (walking ? Math.abs(Math.sin(phaseObj.phase)) * 0.03 : 0), pos.z);
  ch.root.rotation.y = yaw;
  const sw = Math.sin(phaseObj.phase) * 0.13 * (amp * 2);
  setArm(ch, 'L', _aL.set(-0.26, 0.5, 0.02 + sw), _eL);
  setArm(ch, 'R', _aR.set(0.26, 0.5, 0.02 - sw), _eR);
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
      const ux = dx / d;
      const uz = dz / d;
      let vx = ux;
      let vz = uz;
      // (you are in the way: bend round you, a good step to the side)
      const px = player.pos.x - s.pos.x;
      const pz = player.pos.z - s.pos.z;
      const pd = Math.hypot(px, pz);
      if (pd < 1.6 && pd > 0.01 && px * ux + pz * uz > -0.3) {
        let nx0 = uz;
        let nz0 = -ux;
        if (nx0 * px + nz0 * pz > 0) { nx0 = -nx0; nz0 = -nz0; } // the side away from you
        const k = (1.6 - pd) / 1.6;
        vx = ux + nx0 * k * 1.6 - (px / pd) * k * 0.8;
        vz = uz + nz0 * k * 1.6 - (pz / pd) * k * 0.8;
        const n = Math.hypot(vx, vz) || 1;
        vx /= n;
        vz /= n;
      }
      const nx = s.pos.x + vx * step;
      const nz = s.pos.z + vz * step;
      if (walkable(nx, nz)) { s.pos.x = nx; s.pos.z = nz; } else { s.pos.x += ux * step; s.pos.z += uz * step; }
      s.yaw = lerpAngle(s.yaw, Math.atan2(-vx, -vz), 1 - Math.exp(-dt * 6));
    }
    animateWalker(ch, s.pos, s.yaw, d > step ? 1.15 : 0, s, dt);
    // (walking right under the camera: not a giant head at the foot of the picture)
    ch.root.visible = Math.hypot(camera.position.x - s.pos.x, camera.position.z - s.pos.z) > 1.1;
  }
}

// the clerk: breathes, looks your way, waves when you come near
const clerkState = { phase: 0, wave: 0 };
const _cR = V(0.4, -0.2, 0.3);
const _cL = V(-0.4, -0.5, 0.3);
const _cLh = V(-0.2, 0.62, -0.18);
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
  setArm(clerk, 'R', _aR.set(0.26 + 0.08 * w, 0.5 + 0.62 * w, 0.02 - 0.1 * w + wv), _cR);
  setArm(clerk, 'L', _cLh, _cL);
  updateFace(clerk, dt, 0);
}

// ---------------------------------------------------------- the camera
const _look = V();
const _want = V();
function placeCamera(dt, first = false) {
  const p = player.pos;
  const cp = Math.cos(cam.pitch);
  _want.set(p.x + Math.sin(cam.yaw) * cp * cam.dist, 1.25 + Math.sin(cam.pitch) * cam.dist, p.z + Math.cos(cam.yaw) * cp * cam.dist);
  // (not inside the booth, its roof or its awning: with the booth between
  // you and the camera, the camera comes in to this side of it)
  const t = boothHit(p.x, 1.25, p.z, _want.x, _want.y, _want.z);
  if (t > 0 && t < 1) {
    const k = Math.max(0.08, t - 0.2 / cam.dist);
    _want.set(p.x + (_want.x - p.x) * k, 1.25 + (_want.y - 1.25) * k, p.z + (_want.z - p.z) * k);
  } else if (t === 0) {
    // (standing under the awning at the window)
    const B = PLAZA.booth;
    if (Math.abs(_want.x - B.x) < B.w / 2 + 0.25 && Math.abs(_want.z - B.z) < B.d / 2 + 0.25 && _want.y < 3.2) _want.y = 3.4;
  }
  // (and not out among the trees round the square)
  const rr = Math.hypot(_want.x, _want.z);
  if (rr > 14.5) { _want.x *= 14.5 / rr; _want.z *= 14.5 / rr; }
  if (first) camera.position.copy(_want); else camera.position.lerp(_want, 1 - Math.exp(-dt * 8));
  // (looking a little ahead of you and above your shoulders: you stand in
  // the lower part of the picture and what you walk toward is not hidden
  // behind your own head)
  _look.set(p.x - Math.sin(cam.yaw) * 1.3, 1.4, p.z - Math.cos(cam.yaw) * 1.3);
  camera.lookAt(_look);
}

// the booth as two blocks - the walls with the counter, and above them the
// roof, the awning and the sign, which reach out farther: how far along the
// line from a to b the first of them begins (0: a is in one already; 1: the
// line misses both)
const BOOTH_WALLS = { x0: PLAZA.booth.x - 1.85, x1: PLAZA.booth.x + 1.85, y0: 0, y1: 2.5, z0: PLAZA.booth.z - 1.25, z1: PLAZA.booth.z + 1.55 };
const BOOTH_ROOF = { x0: PLAZA.booth.x - 2.2, x1: PLAZA.booth.x + 2.2, y0: 2.0, y1: 4.55, z0: PLAZA.booth.z - 2.05, z1: PLAZA.booth.z + 2.0 };
let _t0 = 0;
let _t1 = 1;
function slab(a, d, lo, hi) {
  if (Math.abs(d) < 1e-6) { if (a < lo || a > hi) _t1 = -1; return; }
  let ta = (lo - a) / d;
  let tb = (hi - a) / d;
  if (ta > tb) { const s = ta; ta = tb; tb = s; }
  if (ta > _t0) _t0 = ta;
  if (tb < _t1) _t1 = tb;
}
function boxHit(B, ax, ay, az, bx, by, bz) {
  _t0 = 0;
  _t1 = 1;
  slab(ax, bx - ax, B.x0, B.x1);
  slab(ay, by - ay, B.y0, B.y1);
  slab(az, bz - az, B.z0, B.z1);
  return _t0 <= _t1 ? _t0 : 1;
}
function boothHit(ax, ay, az, bx, by, bz) {
  return Math.min(boxHit(BOOTH_WALLS, ax, ay, az, bx, by, bz), boxHit(BOOTH_ROOF, ax, ay, az, bx, by, bz));
}

// --------------------------------------------------------------- the loop
let lastT = performance.now();
let elapsed = 0;
placeCamera(0, true);
let skip = 0;
// (on a phone the booth stands on a plain dark veil: the square behind it is
// drawn once and left - nothing there moves while you buy)
let still = false;
let pendingFrame = null;
let graphicsUnavailable = false;
function requestFrame() {
  if (pendingFrame === null && !document.hidden && !graphicsUnavailable) pendingFrame = requestAnimationFrame(frame);
}
function cancelFrame() {
  if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
  pendingFrame = null;
}
function frame() {
  pendingFrame = null;
  if (document.hidden || graphicsUnavailable) return;
  requestFrame();
  const now = performance.now();
  if (still && boothOpen) { lastT = now; return; }
  // (behind the booth's blurred glass, every other frame is plenty)
  if ((boothOpen || busy) && (++skip & 1)) return;
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  step(dt, now);
  syncLiteArms();
  renderer.render(scene, camera);
  still = boothOpen && isTouch;
}
document.addEventListener('visibilitychange', () => {
  lastT = performance.now();
  if (document.hidden) cancelFrame();
  else requestFrame();
});
watchRenderContext(renderer.domElement, {
  lost() { graphicsUnavailable = true; cancelFrame(); },
  restored() {
    still = false;
    lastT = performance.now();
    graphicsUnavailable = false;
    requestFrame();
  },
});

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
    let away = true;
    for (let i = 0; i < GATE_IDS.length; i++) {
      const g = PLAZA.gates[GATE_IDS[i]];
      const d = Math.hypot(player.pos.x - g.x, player.pos.z - g.z);
      if (d < 1.9) near = GATE_IDS[i];
      if (d < 2.6) away = false;
    }
    if (!gateArmed) { if (away) gateArmed = true; else near = null; }
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
  still = false; // (a turned phone: the picture behind the booth again)
  fitCam();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// first frame drawn: lift the curtain (and in any case after a moment)
setTimeout(() => $('pzLoading').classList.add('done'), 2500);
renderer.compile(scene, camera);
requestAnimationFrame(() => {
  requestFrame();
  setTimeout(() => $('pzLoading').classList.add('done'), 120);
  // (back from a building: not the first-time welcome again)
  // (a building's address without a ticket sent you here: say why)
  const bounced = new URLSearchParams(location.search).get('from') === 'venue';
  if (bounced) try { history.replaceState(null, '', location.pathname); } catch { /* file: */ }
  if (bounced && !ticket) setTimeout(() => toast('공연장에 들어가려면 표가 있어야 해요. 가운데 매표소에서 표를 사요.', 4600), 900);
  else if (cameFrom) setTimeout(() => toast(`다시 광장이에요, ${me.name}. ${ticket ? '표는 그대로 들고 있어요.' : '또 보고 싶으면 가운데 매표소로 가요.'}`, 3200), 900);
  else if (!ticket) setTimeout(() => toast(`어서 와요, ${me.name}! 오늘 밤은 ${kind.ko}의 모습으로 왔어요. 가운데 매표소에서 표를 사 봐요.`, 4600), 900);
});

window.__plaza = { scene, camera, renderer, world, player, cam, keys, step, walkable, joy, get autoTo() { return autoTo; }, get ticket() { return ticket; }, openBooth, enterGate, PLAZA, gateYaw };
