// DOM interface: now-playing card, the vibrating "string" seek bar,
// transport, side panel (programme, settings), touch controls, prompts.
const $ = (id) => document.getElementById(id);
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const isFormTarget = (t) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.getAttribute?.('role') === 'slider';

export class UI {
  constructor({ settings, onSetting }) {
    this.settings = settings;
    this.onSetting = onSetting;
    this.handlers = {};
    this.level = 0;
    this.progress = 0;
    this.duration = 0;
    this.joy = { x: 0, y: 0 };
    this._bind();
    this._initString();
    this._initJoystick();
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

  enter(touch) {
    $('splash').classList.add('leaving');
    setTimeout(() => $('splash').remove(), 1300);
    $('nowPlaying').hidden = false;
    $('transport').hidden = false;
    $('startWrap').hidden = false;
    if (touch) $('joystick').hidden = false;
  }

  // the musicians have been called on stage
  showStarted() {
    const w = $('startWrap');
    w.classList.add('leaving');
    setTimeout(() => { w.hidden = true; }, 600);
  }

  // first-person mouse look: crosshair on, cursor hidden
  setLocked(on) {
    document.body.classList.toggle('locked', on);
    if (!on) this.target(null);
    this.tooltip(null);
  }

  // what the crosshair rests on
  target(info) {
    const el = $('target');
    if (!info) { el.hidden = true; return; }
    el.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = info.name;
    const sm = document.createElement('small');
    sm.textContent = info.role;
    el.append(b, sm);
    el.hidden = false;
  }

  // ------------------------------------------------------------- programme
  setProgram(list) {
    this.program = list;
    const ol = $('programList');
    ol.innerHTML = '';
    list.forEach((p, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.innerHTML = '<span class="p-title"></span><span class="p-dur"></span><span class="p-meta"><span></span><span></span></span>';
      b.querySelector('.p-title').textContent = p.titleKo;
      b.querySelector('.p-dur').textContent = fmt(p.duration);
      const meta = b.querySelectorAll('.p-meta span');
      meta[0].textContent = p.composerKo;
      meta[1].textContent = p.ensembleKo;
      b.addEventListener('click', (e) => { this.emit('select', i); if (e.detail > 0) b.blur(); });
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

  setPlaying(on) {
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
    document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode || (mode === 'seat' && b.dataset.mode === 'walk'))));
  }

  // "E 앉기" style prompt near the centre of the screen
  prompt(text, touchLabel = null) {
    const el = $('prompt');
    const sit = $('sitBtn');
    if (!text) { el.hidden = true; sit.hidden = true; return; }
    $('promptText').textContent = text;
    el.hidden = this.touch;
    sit.textContent = touchLabel || text;
    sit.hidden = !this.touch;
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

  setFps(fps, q) {
    const el = $('fpsText');
    if (el && !$('panel').hidden) el.textContent = `지금 ${Math.round(fps)} fps, 화질 ${({ high: '높음', medium: '보통', low: '낮음' })[q]}`;
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

  // ---------------------------------------------------------------- binding
  _bind() {
    const click = (id, fn) => $(id).addEventListener('click', (e) => { fn(e); if (e.detail > 0) e.currentTarget.blur(); });
    click('enterBtn', () => this.emit('enter'));
    click('startBtn', () => this.emit('start'));
    click('btnPlay', () => this.emit('toggle'));
    click('btnNext', () => this.emit('next'));
    click('btnPrev', () => this.emit('prev'));
    click('btnHelp', () => { $('help').hidden = false; $('helpClose').focus(); });
    click('helpClose', () => { $('help').hidden = true; });
    $('help').addEventListener('click', (e) => { if (e.target.id === 'help') $('help').hidden = true; });
    click('btnFull', () => this.emit('fullscreen'));
    click('focusClose', () => this.emit('unfocus'));
    click('sitBtn', () => this.emit('sit'));
    $('focusSolo').addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(on));
      this.emit('solo', on);
    });
    document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', (e) => { this.emit('mode', b.dataset.mode); if (e.detail > 0) b.blur(); }));

    document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', (e) => {
      const name = b.dataset.panel;
      const open = $('panel').hidden || this.openPanel !== name;
      this.showPanel(open ? name : null);
      if (e.detail > 0) b.blur();
    }));
    click('panelClose', () => this.showPanel(null));

    const vol = $('volume');
    vol.value = String(this.settings.volume);
    vol.addEventListener('input', () => this.onSetting('volume', Number(vol.value)));

    const bindCheck = (id, key) => {
      const el = $(id);
      el.checked = !!this.settings[key];
      el.addEventListener('change', () => this.onSetting(key, el.checked));
    };
    for (const [id, key] of [['optShuffle', 'shuffle'], ['optRepeatOne', 'repeatOne'], ['optFixedEar', 'fixedEar'], ['optApplause', 'applause'], ['optNotes', 'notes'], ['optGlow', 'glow'], ['optFireflies', 'fireflies'], ['optFx', 'fx'], ['optLasers', 'lasers'], ['optScreen', 'screen'], ['optAudience', 'audience'], ['optMouseLook', 'mouseLook']]) bindCheck(id, key);
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

    // keyboard (by physical key, so it works with a Korean IME too)
    window.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (isFormTarget(t) && ['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.code)) return;
      if (t instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return;
      const c = e.code;
      if (c === 'Space') { e.preventDefault(); this.emit('toggle'); }
      else if (c === 'KeyN') this.emit('next');
      else if (c === 'KeyP') this.emit('prev');
      else if (c === 'KeyH') document.body.classList.toggle('ui-hidden');
      else if (c === 'KeyM') this.emit('mute');
      else if (c === 'Enter') this.emit('fullscreen');
      else if (e.key === '?') $('help').hidden = !$('help').hidden;
      else if (c === 'Escape') { $('help').hidden = true; this.showPanel(null); }
      else if (c === 'ArrowLeft' || c === 'ArrowRight') this.emit('seekKey', c === 'ArrowLeft' ? -10 : 10, e);
    });

    // seek on the string: scrub shows the position, release commits it
    const seek = $('seek');
    const frac = (e) => {
      const r = seek.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - r.left - 6) / (r.width - 12)));
    };
    let down = false;
    seek.addEventListener('pointerdown', (e) => { down = true; seek.setPointerCapture(e.pointerId); this.scrub = frac(e); });
    seek.addEventListener('pointermove', (e) => { if (down) this.scrub = frac(e); });
    const release = (e) => {
      if (!down) return;
      down = false;
      this.emit('seek', frac(e) * this.duration);
      this.scrub = null;
    };
    seek.addEventListener('pointerup', release);
    seek.addEventListener('pointercancel', () => { down = false; this.scrub = null; });
    seek.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.stopPropagation();
        e.preventDefault();
        this.emit('seekKey', e.code === 'ArrowLeft' ? -5 : 5, e);
      }
    });
  }

  showPanel(name) {
    this.openPanel = name;
    $('panel').hidden = !name;
    document.querySelectorAll('.tab-btn').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.panel === name)));
    document.querySelectorAll('.panel-body').forEach((b) => { b.hidden = b.dataset.body !== name; });
    const titles = { program: '오늘의 프로그램', settings: '설정' };
    if (name) $('panelTitle').textContent = titles[name];
    if (name === 'program') {
      const cur = $('programList').querySelector('.current');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
  }

  // ------------------------------------------------------------ joystick
  _initJoystick() {
    const base = $('joystick');
    const knob = $('joyKnob');
    let id = null;
    let cx = 0;
    let cy = 0;
    const R = 46;
    base.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      base.setPointerCapture(id);
      e.preventDefault();
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy.x = dx / R;
      this.joy.y = dy / R;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      this.joy.x = 0;
      this.joy.y = 0;
    };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
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
      if (w && cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const y = h / 2;
      const x0 = 6;
      const x1 = w - 6;
      const px = x0 + (x1 - x0) * (this.scrub ?? this.progress);
      phase += 0.42;
      const amp = reduce ? 0 : Math.min(7, this.level * 26);
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
      ctx.fillStyle = '#f2ede1';
      ctx.beginPath();
      ctx.arc(px, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(242,237,225,0.5)';
      ctx.fillRect(x0 - 1, y - 5, 2, 10);
      ctx.fillRect(x1 - 1, y - 5, 2, 10);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }
}
