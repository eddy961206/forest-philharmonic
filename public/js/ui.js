// DOM interface: now-playing card, the vibrating "string" seek bar,
// transport, side panel (programme, seats, settings), help and toasts.
import { SEAT_PRESETS, STAGE_SPOTS } from './scene/director.js';
import { SECTIONS } from './layout.js';
import { HALL } from './scene/hall.js';

const $ = (id) => document.getElementById(id);
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class UI {
  constructor({ settings, onSetting }) {
    this.settings = settings;
    this.onSetting = onSetting;
    this.handlers = {};
    this.level = 0;
    this.progress = 0;
    this.duration = 0;
    this._bind();
    this._initString();
  }

  on(name, fn) { this.handlers[name] = fn; }
  emit(name, ...a) { if (this.handlers[name]) this.handlers[name](...a); }

  // ---------------------------------------------------------------- loading
  setLoading(text, frac) {
    $('loadText').textContent = text;
    $('loadBar').style.width = `${Math.round(frac * 100)}%`;
  }

  ready() {
    $('loadText').textContent = '준비가 끝났어요';
    $('loadBar').style.width = '100%';
    const b = $('enterBtn');
    b.disabled = false;
    b.focus();
  }

  enter() {
    $('splash').classList.add('leaving');
    setTimeout(() => $('splash').remove(), 1300);
    $('nowPlaying').hidden = false;
    $('transport').hidden = false;
  }

  // ------------------------------------------------------------- programme
  setProgram(list) {
    this.program = list;
    const ol = $('programList');
    ol.innerHTML = '';
    list.forEach((p, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.innerHTML = `<span class="p-title"></span><span class="p-dur"></span><span class="p-meta"><span></span><span></span></span>`;
      b.querySelector('.p-title').textContent = p.titleKo;
      b.querySelector('.p-dur').textContent = fmt(p.duration);
      const meta = b.querySelectorAll('.p-meta span');
      meta[0].textContent = p.composerKo;
      meta[1].textContent = p.ensembleKo;
      b.addEventListener('click', () => this.emit('select', i));
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  setCurrent(i, piece) {
    const items = $('programList').children;
    for (let k = 0; k < items.length; k++) items[k].classList.toggle('current', k === i);
    if (!piece) return;
    $('npComposer').textContent = `${piece.composerKo} (${piece.composer}), ${piece.year}`;
    $('npTitle').textContent = piece.titleKo;
    $('npEnsemble').textContent = piece.ensembleKo;
    this.duration = piece.duration;
    document.title = `${piece.titleKo} · 숲속 필하모닉`;
  }

  setSeatLabel(label) {
    $('npSeat').textContent = label ? `지금 자리: ${label}` : '';
    this._markSeat(label);
  }

  setPlaying(on) {
    // SVG elements have no .hidden property; toggle the attribute instead
    $('icoPlay').toggleAttribute('hidden', on);
    $('icoPause').toggleAttribute('hidden', !on);
    $('btnPlay').setAttribute('aria-label', on ? '일시정지' : '재생');
  }

  setTime(t, d) {
    this.progress = d ? Math.min(1, t / d) : 0;
    this.duration = d;
    const txt = `${fmt(t)} / ${fmt(d)}`;
    if (this._timeTxt !== txt) {
      $('time').textContent = txt;
      this._timeTxt = txt;
      $('seek').setAttribute('aria-valuenow', String(Math.round(this.progress * 100)));
    }
  }

  setMode(mode) {
    document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }

  toast(text, ms = 2200) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    el.style.opacity = '1';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.hidden = true; }, 400);
    }, ms);
  }

  tooltip(info, x, y) {
    const el = $('tooltip');
    if (!info) { el.hidden = true; return; }
    el.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = info.name;
    const s = document.createElement('small');
    s.textContent = info.role;
    el.append(b, s);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.hidden = false;
  }

  focus(info) {
    const chip = $('focusChip');
    if (!info) { chip.hidden = true; $('focusSolo').setAttribute('aria-pressed', 'false'); return; }
    $('focusName').textContent = info;
    chip.hidden = false;
  }

  setSleepLeft(ms) {
    const el = $('sleepText');
    if (!el) return;
    if (ms > 0) {
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      el.textContent = `${m}분 ${String(s).padStart(2, '0')}초 뒤에 멈춰요.`;
    } else {
      el.textContent = '정한 시간이 지나면 30초에 걸쳐 소리를 줄이고 멈춰요.';
      document.querySelectorAll('#sleepSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.min === '0')));
    }
  }

  setFps(fps, q) {
    const el = $('fpsText');
    if (el && !$('panel').hidden) el.textContent = `지금 ${Math.round(fps)} fps, 화질 ${({ high: '높음', medium: '보통', low: '낮음' })[q]}`;
  }

  // ---------------------------------------------------------------- binding
  _bind() {
    $('enterBtn').addEventListener('click', () => this.emit('enter'));
    $('btnPlay').addEventListener('click', () => this.emit('toggle'));
    $('btnNext').addEventListener('click', () => this.emit('next'));
    $('btnPrev').addEventListener('click', () => this.emit('prev'));
    $('btnHelp').addEventListener('click', () => { $('help').hidden = false; $('helpClose').focus(); });
    $('helpClose').addEventListener('click', () => { $('help').hidden = true; });
    $('help').addEventListener('click', (e) => { if (e.target.id === 'help') $('help').hidden = true; });
    $('btnFull').addEventListener('click', () => this.emit('fullscreen'));
    $('focusClose').addEventListener('click', () => this.emit('unfocus'));
    $('focusSolo').addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(on));
      this.emit('solo', on);
    });
    document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => this.emit('mode', b.dataset.mode)));

    // panel tabs
    document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => {
      const name = b.dataset.panel;
      const open = $('panel').hidden || this.openPanel !== name;
      this.showPanel(open ? name : null);
    }));
    $('panelClose').addEventListener('click', () => this.showPanel(null));

    // volume
    const vol = $('volume');
    vol.value = String(this.settings.volume);
    vol.addEventListener('input', () => this.onSetting('volume', Number(vol.value)));

    // settings
    const bindCheck = (id, key) => {
      const el = $(id);
      el.checked = !!this.settings[key];
      el.addEventListener('change', () => this.onSetting(key, el.checked));
    };
    bindCheck('optShuffle', 'shuffle');
    bindCheck('optRepeatOne', 'repeatOne');
    bindCheck('optFixedEar', 'fixedEar');
    bindCheck('optApplause', 'applause');
    bindCheck('optNotes', 'notes');
    bindCheck('optGlow', 'glow');
    bindCheck('optFireflies', 'fireflies');
    const rev = $('reverb');
    rev.value = String(this.settings.reverb);
    rev.addEventListener('input', () => this.onSetting('reverb', Number(rev.value)));
    const gap = $('gap');
    gap.value = String(this.settings.gap);
    $('gapOut').textContent = `${this.settings.gap}초`;
    gap.addEventListener('input', () => {
      $('gapOut').textContent = `${gap.value}초`;
      this.onSetting('gap', Number(gap.value));
    });
    document.querySelectorAll('#sleepSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#sleepSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.emit('sleep', Number(b.dataset.min));
      });
    });
    document.querySelectorAll('#qualitySeg button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.q === this.settings.quality));
      b.addEventListener('click', () => {
        document.querySelectorAll('#qualitySeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.onSetting('quality', b.dataset.q);
      });
    });

    // seat presets
    const sp = $('seatPresets');
    for (const p of SEAT_PRESETS) {
      const b = document.createElement('button');
      b.textContent = p.ko;
      b.addEventListener('click', () => this.emit('seatPreset', p.id));
      sp.appendChild(b);
    }
    const st = $('stagePresets');
    for (const p of STAGE_SPOTS) {
      const b = document.createElement('button');
      b.textContent = p.ko;
      b.addEventListener('click', () => this.emit('stageSpot', p.id));
      st.appendChild(b);
    }

    // keyboard
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (k === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); this.emit('toggle'); }
      else if (k === 'n' || k === 'N') this.emit('next');
      else if (k === 'p' || k === 'P') this.emit('prev');
      else if (k === 'h' || k === 'H') document.body.classList.toggle('ui-hidden');
      else if (k === 'm' || k === 'M') this.emit('mute');
      else if (k === 'Enter' && !(e.target instanceof HTMLButtonElement)) this.emit('fullscreen');
      else if (k === '?') $('help').hidden = !$('help').hidden;
      else if (k === 'Escape') { $('help').hidden = true; this.showPanel(null); }
      else if (['1', '2', '3', '4'].includes(k)) this.emit('mode', ['seat', 'walk', 'orbit', 'cinema'][Number(k) - 1]);
      else if (k === 'ArrowLeft' || k === 'ArrowRight') this.emit('seekKey', k === 'ArrowLeft' ? -10 : 10, e);
    });

    // seek on the string
    const seek = $('seek');
    const seekTo = (e) => {
      const r = seek.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left - 6) / (r.width - 12)));
      this.emit('seek', x * this.duration);
    };
    let down = false;
    seek.addEventListener('pointerdown', (e) => { down = true; seek.setPointerCapture(e.pointerId); seekTo(e); });
    seek.addEventListener('pointermove', (e) => { if (down) seekTo(e); });
    seek.addEventListener('pointerup', () => { down = false; });
    seek.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation();
        this.emit('seekKey', e.key === 'ArrowLeft' ? -5 : 5, e);
      }
    });
  }

  showPanel(name) {
    this.openPanel = name;
    $('panel').hidden = !name;
    document.querySelectorAll('.tab-btn').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.panel === name)));
    document.querySelectorAll('.panel-body').forEach((b) => { b.hidden = b.dataset.body !== name; });
    const titles = { program: '오늘의 프로그램', seats: '좌석 고르기', settings: '설정' };
    if (name) $('panelTitle').textContent = titles[name];
    if (name === 'program') {
      const cur = $('programList').querySelector('.current');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
  }

  // ----------------------------------------------------------- seat map
  buildSeatMap(seats) {
    const svg = $('seatMap');
    svg.setAttribute('viewBox', '0 0 320 470');
    const ns = 'http://www.w3.org/2000/svg';
    // stalls: hall x [-15,15] -> [20,300], z [front, 28] -> [10, 340]
    const X = (x) => 160 + (x / HALL.halfW) * 140;
    const zMax = 27.6;
    const Z = (z) => 10 + ((z - HALL.front) / (zMax - HALL.front)) * 330;
    // balcony band: its own strip below the stalls
    const BY = (z) => 392 + ((z - HALL.balconyZ) / (HALL.back - HALL.balconyZ)) * 60;
    const el = (tag, attrs, parent = svg) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      parent.appendChild(e);
      return e;
    };
    el('rect', { x: X(-HALL.halfW), y: Z(HALL.front), width: X(HALL.halfW) - X(-HALL.halfW), height: Z(zMax) - Z(HALL.front), fill: 'none', stroke: 'rgba(230,192,123,0.25)', rx: 6 });
    el('path', { d: `M${X(-12.4)} ${Z(-13.4)} H${X(12.4)} V${Z(-0.3)} Q${X(0)} ${Z(1.6) + 3} ${X(-12.4)} ${Z(-0.3)} Z`, fill: 'rgba(230,192,123,0.12)', stroke: 'rgba(230,192,123,0.4)' });
    el('text', { x: 160, y: Z(-12.2), 'text-anchor': 'middle', class: 'label' }).textContent = '무대';
    for (const s of Object.values(SECTIONS)) {
      for (const c of s.chairs) el('circle', { cx: X(c.x), cy: Z(c.z), r: 2.6, fill: s.color, class: 'player-dot' });
    }
    el('text', { x: 160, y: Z(zMax) + 14, 'text-anchor': 'middle', class: 'label' }).textContent = '1층 (뒤쪽은 2층 아래)';
    el('rect', { x: X(-HALL.halfW), y: 380, width: X(HALL.halfW) - X(-HALL.halfW), height: 84, fill: 'rgba(201,212,240,0.05)', stroke: 'rgba(201,212,240,0.25)', rx: 6 });
    el('text', { x: 160, y: 460, 'text-anchor': 'middle', class: 'label' }).textContent = '2층 발코니';
    this._seatDots = [];
    const g = el('g', {});
    seats.forEach((s, i) => {
      let cx;
      let cy;
      let r = 2.1;
      if (s.level === '1층') {
        if (i % 2) return;
        cx = X(s.x); cy = Z(s.z); r = 1.9;
      } else if (s.level === '2층') {
        cx = X(s.x); cy = BY(s.z);
      } else {
        // side boxes sit along the walls of the stalls
        cx = X(s.x * 1.02); cy = Z(s.z);
        if (i % 2) return;
      }
      const c = el('circle', { cx, cy, r, class: 'seat-dot' }, g);
      c.addEventListener('click', () => this.emit('seat', s));
      const t = document.createElementNS(ns, 'title');
      t.textContent = s.label;
      c.appendChild(t);
      this._seatDots.push({ c, s });
    });
  }

  _markSeat(label) {
    if (!this._seatDots) return;
    for (const d of this._seatDots) d.c.classList.toggle('on', d.s.label === label);
  }

  // --------------------------------------------- the string progress bar
  _initString() {
    const cv = $('stringCanvas');
    const ctx = cv.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let phase = 0;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const y = h / 2;
      const x0 = 6;
      const x1 = w - 6;
      const px = x0 + (x1 - x0) * this.progress;
      phase += 0.42;
      const amp = reduce ? 0 : Math.min(7, this.level * 26);
      // played part: brass, vibrating as a string fixed at both ends
      const path = (from, to) => {
        ctx.beginPath();
        for (let x = from; x <= to; x += 2) {
          const u = (x - x0) / (x1 - x0);
          const env = Math.sin(Math.PI * u);
          const v = amp * env * (Math.sin(u * 18 + phase) * 0.6 + Math.sin(u * 41 - phase * 1.3) * 0.4);
          if (x === from) ctx.moveTo(x, y + v); else ctx.lineTo(x, y + v);
        }
      };
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(242,237,225,0.28)';
      path(px, x1);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#e6c07b';
      ctx.shadowColor = 'rgba(230,192,123,0.6)';
      ctx.shadowBlur = 8 + amp * 2;
      path(x0, px);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // bridge marker at the play position
      ctx.fillStyle = '#f2ede1';
      ctx.beginPath();
      ctx.arc(px, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      // end pegs
      ctx.fillStyle = 'rgba(242,237,225,0.5)';
      ctx.fillRect(x0 - 1, y - 5, 2, 10);
      ctx.fillRect(x1 - 1, y - 5, 2, 10);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }
}
