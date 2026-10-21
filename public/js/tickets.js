// Who you are and the ticket in your paw. You arrive as one forest animal,
// drawn at random on your first visit and yours from then on (there is no
// changing it); only the name on your ticket is yours to write. A ticket is
// bought at the booth in the square with whatever your kind trades in, and
// carried to the door of its building (this browser tab only).
import { AVATARS, randomIdentity } from './scene/avatars.js';

const ID_KEY = 'fp-identity';
const TICKET_KEY = 'fp-ticket'; // sessionStorage: the ticket you are holding
const LAST_KEY = 'fp-last-ticket'; // localStorage: what you bought last time

export const EMOJI = {
  fox: '🦊', rabbit: '🐰', bear: '🐻', cat: '🐱', panda: '🐼', raccoon: '🦝', deer: '🦌', sheep: '🐑',
  owl: '🦉', koala: '🐨', dog: '🐶', squirrel: '🐿️', hedgehog: '🦔', lion: '🦁', mouse: '🐭',
};

// what each kind pays with (nobody counts: it is the gesture that matters)
export const PAY = {
  fox: { icon: '🍓', what: '산딸기 다섯 알' },
  rabbit: { icon: '🥕', what: '당근 두 개' },
  bear: { icon: '🍯', what: '꿀 한 숟가락' },
  cat: { icon: '🐟', what: '말린 멸치 세 마리' },
  panda: { icon: '🎋', what: '대나무 잎 네 장' },
  raccoon: { icon: '🪨', what: '반짝이는 조약돌 두 개' },
  deer: { icon: '☘️', what: '네잎클로버 한 장' },
  sheep: { icon: '🌼', what: '민들레 세 송이' },
  owl: { icon: '🪶', what: '깃털 하나' },
  koala: { icon: '🌿', what: '유칼립투스 잎 세 장' },
  dog: { icon: '🦴', what: '뼈다귀 과자 하나' },
  squirrel: { icon: '🌰', what: '도토리 세 개' },
  hedgehog: { icon: '🍎', what: '작은 사과 한 알' },
  lion: { icon: '🍬', what: '별사탕 세 알' },
  mouse: { icon: '🧀', what: '치즈 한 조각' },
};

// (the stores themselves can be off limits - all cookies blocked: then
// nothing is kept, and nothing breaks)
const LOCAL = 'local';
const SESSION = 'session';
function store(kind) {
  try { return kind === LOCAL ? window.localStorage : window.sessionStorage; } catch { return null; }
}
function load(kind, key) {
  try { return JSON.parse(store(kind)?.getItem(key) || 'null'); } catch { return null; }
}
function keep(kind, key, v) {
  try { const st = store(kind); if (!st) return; if (v === null) st.removeItem(key); else st.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
}

// Where nothing can be kept, the ticket travels in the address instead
// (?t=...): the building's door still sees it, and coming back to the square
// the address you came from still says who you are.
const OUTFITS = ['dress', 'tail'];
const MODES = ['solo', 'create', 'join'];
function fromAddress(href) {
  try {
    const u = new URL(href, location.href);
    if (u.origin !== location.origin) return null;
    const t = JSON.parse(u.searchParams.get('t') || 'null');
    if (!t || !VENUE_NAMES[t.venue] || !MODES.includes(t.mode) || !AVATARS.some((a) => a.id === t.avatar)) return null;
    return { ...t, name: String(t.name || '').slice(0, 16), code: t.code ? String(t.code).replace(/[^A-Z0-9]/g, '').slice(0, 6) : t.code };
  } catch { return null; }
}
const addressTicket = () => fromAddress(location.href) || (document.referrer ? fromAddress(document.referrer) : null);

// is there anywhere to keep a ticket in this tab? (if not, see ticketQuery)
export function canKeep() {
  try { const st = store(SESSION); st.setItem('fp-probe', '1'); st.removeItem('fp-probe'); return true; } catch { return false; }
}
// what to add to a building's address so the ticket goes along ('' when it is kept)
export function ticketQuery(t) {
  if (!t || canKeep()) return '';
  const { venue, mode, code, title, cap, pub, name, avatar, outfit, no, date, issued } = t;
  return `&t=${encodeURIComponent(JSON.stringify({ venue, mode, code, title, cap, pub, name, avatar, outfit, no, date, issued }))}`;
}

// you: { name, avatar, outfit }. The animal (and what it wears) is drawn
// once and kept (and, where nothing can be kept, at least stays the same for
// the life of this page).
let me = null;
export function identity() {
  if (me) return { ...me };
  const v = load(LOCAL, ID_KEY) || addressTicket();
  if (v?.avatar && AVATARS.some((a) => a.id === v.avatar)) {
    me = { name: v.name || randomIdentity().name, avatar: v.avatar, outfit: OUTFITS.includes(v.outfit) ? v.outfit : OUTFITS[Math.floor(Math.random() * 2)] };
    if (v.outfit !== me.outfit) keep(LOCAL, ID_KEY, me);
  } else { me = { ...randomIdentity(), outfit: OUTFITS[Math.floor(Math.random() * 2)] }; keep(LOCAL, ID_KEY, me); }
  return { ...me };
}

export function setName(name) {
  const cur = identity();
  // (no invisible letters or text turned backwards; and sixteen letters,
  // not sixteen halves of an emoji)
  const clean = Array.from(String(name || '').replace(/[\u0000-\u001f​‌‎‏‪-‮⁦-⁩﻿]/g, '').trim()).slice(0, 16).join('').trim();
  if (!clean) return cur;
  me = { ...cur, name: clean };
  keep(LOCAL, ID_KEY, me);
  return { ...me };
}

// opt: { venue, mode: 'solo' | 'create' | 'join', code?, title?, cap?, pub? }
export function issueTicket(opt) {
  const me = identity();
  const d = new Date();
  const t = {
    ...opt,
    name: me.name,
    avatar: me.avatar,
    outfit: me.outfit,
    no: `${opt.venue === 'sphere' ? 'S' : 'H'}-${String(Math.floor(1000 + Math.random() * 9000))}`,
    date: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`,
    issued: Date.now(),
  };
  keep(SESSION, TICKET_KEY, t);
  // for "the same as last time" (a room you made is made afresh; one you
  // joined may be gone - that becomes watching alone)
  keep(LOCAL, LAST_KEY, { venue: t.venue, mode: t.mode === 'join' ? 'solo' : t.mode, title: t.title, cap: t.cap, pub: t.pub });
  return t;
}

// the ticket in your paw (for this building), or null
export function heldTicket(venue = null) {
  const t = load(SESSION, TICKET_KEY) || (canKeep() ? null : fromAddress(location.href));
  if (!t || (venue && t.venue !== venue)) return null;
  return t;
}

export function updateTicket(patch) {
  const t = load(SESSION, TICKET_KEY);
  if (t) keep(SESSION, TICKET_KEY, { ...t, ...patch });
}

export function dropTicket() { keep(SESSION, TICKET_KEY, null); }

export function lastTicket() { return load(LOCAL, LAST_KEY); }

// ------------------------------------------------------------ the card
export const VENUE_NAMES = { hall: '숲속 필하모닉 홀', sphere: '스피어' };

export function modeLine(t) {
  // (no line break before "· 공개": it stays with the name)
  if (t.mode === 'create') return `단체석 「${t.title || '우리들의 공연'}」\u00a0·\u00a0${t.pub === false ? '비공개' : '공개'}`;
  if (t.mode === 'join') return `친구와 함께 · 방 ${t.code || ''}`;
  return '혼자 보기 · 자유석';
}

// a barcode drawn from the ticket number (always the same for the same ticket)
function barcode(text, w = 120, h = 34) {
  let x = 0;
  let seed = 0;
  for (const c of text) seed = (seed * 131 + c.charCodeAt(0)) >>> 0;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const bars = [];
  // start guard, then bars and gaps of one to three units, end guard
  const unit = 1.4;
  const put = (k, ink) => { if (ink) bars.push(`<rect x="${x.toFixed(1)}" y="0" width="${(k * unit).toFixed(1)}" height="${h}"/>`); x += k * unit; };
  [2, 1, 1, 1].forEach((k, i) => put(k, i % 2 === 0));
  let ink = true;
  while (x < w - 10) { put(1 + Math.floor(r() * 3), ink); ink = !ink; }
  [1, 1, 2].forEach((k, i) => put(k, i % 2 === 0));
  return `<svg class="t-bar" viewBox="0 0 ${x.toFixed(1)} ${h}" preserveAspectRatio="none" aria-hidden="true">${bars.join('')}</svg>`;
}

const SUB = { hall: '오늘 밤 정기 공연 · 동물 오케스트라와 합창단', sphere: '오늘 밤 돔 스크린 공연 · 동물 오케스트라' };

// A concert ticket: a printed band, the building in big letters, a grid of
// what matters, the small print; then the perforation and the stub - ADMIT
// ONE, your animal, a barcode, the serial in red. (Torn at the door: the
// stub falls away along the perforation.)
export function ticketElement(t) {
  const el = document.createElement('div');
  el.className = `ticket ${t.venue}`;
  const pay = PAY[t.avatar] || PAY.squirrel;
  const issued = t.issued ? new Date(t.issued) : new Date();
  const hhmm = `${String(issued.getHours()).padStart(2, '0')}:${String(issued.getMinutes()).padStart(2, '0')}`;
  const cell = (k, v, wide = false) => `<div class="t-cell${wide ? ' wide' : ''}"><span>${k}</span><b></b></div>`;
  el.innerHTML = `
    <div class="t-main">
      <div class="t-band"><span>FOREST PHILHARMONIC</span><span class="t-band-r">숲속 필하모닉</span></div>
      <div class="t-head">
        <div class="t-title"></div>
        <div class="t-sub"></div>
      </div>
      <div class="t-grid">
        ${cell('날짜', '')}${cell('발권', '')}${cell('구역', '')}
        ${cell('관객', '', true)}${cell('값', '')}
      </div>
      <div class="t-mode"></div>
      <div class="t-fine">이 표는 오늘 밤 이 숲에서만 쓸 수 있어요 · 입구에서 표를 보여 주세요 · 1인 1매</div>
      ${t.venue === 'sphere' ? '<div class="t-foil" aria-hidden="true"></div>' : '<div class="t-seal" aria-hidden="true">♪</div>'}
    </div>
    <div class="t-stub">
      <div class="t-admit">ADMIT ONE</div>
      <div class="t-stub-body">
        <span class="t-ani"></span>
        ${barcode(t.no || 'X')}
        <span class="t-no"></span>
      </div>
    </div>`;
  el.querySelector('.t-title').textContent = VENUE_NAMES[t.venue] || t.venue;
  el.querySelector('.t-sub').textContent = SUB[t.venue] || '';
  const vals = [t.date, hhmm, t.mode === 'solo' ? '자유석' : '단체석', t.name, `${pay.icon} ${pay.what}`];
  el.querySelectorAll('.t-cell b').forEach((b, i) => { b.textContent = vals[i] || ''; });
  el.querySelector('.t-mode').textContent = modeLine(t);
  el.querySelector('.t-ani').textContent = EMOJI[t.avatar] || '🐾';
  el.querySelector('.t-no').textContent = `No. ${t.no}`;
  return el;
}
