// DOM interface: now-playing card, the vibrating "string" seek bar,
// transport, side panel (programme, settings), touch controls, prompts.
import { thumbStick } from './joystick.js';
import { IS_SPHERE } from './scene/venue.js';

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

  // ------------------------------------------------------------------ lobby
  // avatars: [{ id, ko }], identity: { name, avatar }, invite: room code or null
  initLobby({ avatars, identity, invite, venue = 'hall', venues = {} }) {
    this.avatars = avatars;
    this.venue = venue;
    this.venues = venues;
    document.body.dataset.venue = venue; // (the help speaks of this building: stairs or lifts)
    // which building: the splash speaks of it, the other one is a click away
    const V = venues[venue];
    if (V?.title) $('splashTitle').textContent = V.title;
    if (V?.intro) $('splashSub').textContent = V.intro;
    document.querySelectorAll('#lbVenue button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.venue === venue));
      b.addEventListener('click', () => { if (b.dataset.venue !== this.venue) this.emit('venue', b.dataset.venue); });
    });
    document.querySelectorAll('#liftPanel button').forEach((b) => b.addEventListener('click', () => this.emit('lift', Number(b.dataset.level))));
    // your animal is drawn once and kept (no changing it); only the name is yours
    const mine = avatars.find((a) => a.id === identity.avatar);
    $('lbAnimal').textContent = mine ? `${identity.emoji || ''} ${mine.ko}`.trim() : '';
    $('lbName').value = identity.name;
    this.pub = true;
    document.querySelectorAll('#lbVis button').forEach((b) => b.addEventListener('click', () => {
      this.pub = b.dataset.pub === '1';
      document.querySelectorAll('#lbVis button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    if (invite) {
      $('lbInvite').hidden = false;
      $('lbInviteCode').textContent = invite;
    }
    this.invite = invite;
    const go = (detail) => {
      const name = $('lbName').value.trim();
      if (!name) { this.lobbyError('닉네임을 적어 주세요.'); $('lbName').focus(); return; }
      this.lobbyError(null);
      this.emit('enter', { ...detail, name, avatar: identity.avatar });
    };
    this._go = go;
    $('enterBtn').addEventListener('click', () => go({ mode: 'solo' }));
    $('lbInviteGo').addEventListener('click', () => go({ mode: 'join', code: invite }));
    $('lbCreate').addEventListener('click', () => {
      const cap = Math.max(1, Math.min(50, Math.round(Number($('lbCap').value) || 50)));
      $('lbCap').value = String(cap);
      go({ mode: 'create', title: $('lbTitle').value.trim(), cap, pub: this.pub });
    });
    const joinCode = () => {
      const code = $('lbCode').value.trim().toUpperCase();
      if (code.length < 6) { this.lobbyError('방 코드 6자리를 적어 주세요.'); return; }
      go({ mode: 'join', code });
    };
    $('lbJoinCode').addEventListener('click', joinCode);
    $('lbCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCode(); });
    $('lbRefresh').addEventListener('click', () => this.emit('refreshRooms'));
  }

  // the server answers: rooms are possible (otherwise only "혼자 보기")
  setOnline(on) {
    $('lbOnline').hidden = !on;
    $('lobby').classList.toggle('offline', !on);
    if (!on) $('lbInvite').hidden = true;
  }

  setRooms(list) {
    const ul = $('lbRooms');
    // (the same list again: left alone - no lost focus or click, nothing read out twice)
    const key = JSON.stringify(list) + !!this.lobbyReady;
    if (key === this._roomsKey) return;
    this._roomsKey = key;
    const had = ul.contains(document.activeElement) ? document.activeElement.dataset.code : null;
    ul.innerHTML = '';
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'lb-empty';
      li.textContent = '지금 열린 공개 방이 없어요. 첫 방을 만들어 보세요.';
      ul.appendChild(li);
      return;
    }
    for (const r of list) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="r-title"></span><span class="r-count"></span><span class="r-now"></span>';
      b.querySelector('.r-title').textContent = r.title;
      b.querySelector('.r-count').textContent = `${r.count} / ${r.cap}`;
      b.querySelector('.r-now').textContent = r.piece ? `${r.playing ? '연주 중' : '쉬는 중'} · ${r.piece}` : '공연 시작 전';
      if (r.venue && r.venue !== this.venue) {
        const tag = document.createElement('span');
        tag.className = 'r-venue';
        tag.textContent = ` · ${this.venues[r.venue]?.short || r.venue}`;
        b.querySelector('.r-now').appendChild(tag);
      }
      const full = r.count >= r.cap;
      b.disabled = full || !this.lobbyReady;
      b.dataset.full = full ? '1' : '';
      if (full) b.title = '방이 가득 찼어요';
      b.dataset.code = r.code;
      b.addEventListener('click', () => this._go({ mode: 'join', code: r.code }));
      li.appendChild(b);
      ul.appendChild(li);
    }
    if (had) ul.querySelector(`button[data-code="${had}"]`)?.focus({ preventScroll: true });
  }

  // ------------------------------------------------ the usher at the door
  // You came from the square with a ticket: it is checked here instead of
  // the lobby, and "입장하기" (a click: sound may start) takes you in.
  ticketMode(ticket, card) {
    this.ticket = ticket;
    $('lobby').hidden = true;
    $('ticketCheck').hidden = false;
    $('tcTicket').innerHTML = '';
    $('tcTicket').appendChild(card);
    $('splashSub').textContent = '입구에서 표를 확인하고 있어요. 공연장 불이 켜지면 들어가요.';
    $('tcEnter').addEventListener('click', () => {
      if ($('tcEnter').disabled) return;
      $('tcEnter').disabled = true; // (a second press - or Enter held down - is not a second entrance)
      $('tcError').hidden = true;
      $('tcFallback').hidden = true;
      this.emit('enter', { mode: ticket.mode, code: ticket.code, title: ticket.title, cap: ticket.cap, pub: ticket.pub, name: ticket.name, avatar: ticket.avatar });
    });
    $('tcSolo').addEventListener('click', () => {
      $('tcError').hidden = true;
      $('tcFallback').hidden = true;
      this.emit('enter', { mode: 'solo', name: ticket.name, avatar: ticket.avatar });
    });
    // back to the square: a ticket for a room that is gone stays here
    $('tcPlaza')?.addEventListener('click', () => { if (this.ticketDead) this.emit('dropTicket'); });
  }

  // msg: what went wrong (null: nothing). note: news, not a fault (on the
  // way to the other building). dead: that room is gone, so the ticket's
  // own button would only fail again - the ways in that still work come first
  lobbyError(msg, { note = false, dead = false } = {}) {
    if (this.ticket) {
      $('tcError').hidden = !msg || note;
      $('tcError').textContent = note ? '' : msg || '';
      $('tcFallback').hidden = !msg || note;
      if (note) { $('tcLine').textContent = msg; return; }
      if (!msg) return;
      this.ticketDead = dead;
      $('tcLine').textContent = dead ? '표에 적힌 방에는 들어갈 수 없어요.' : '아직 들어가지 못했어요. 다시 해 보거나 혼자 보기로 들어가요.';
      $('tcEnter').disabled = dead;
      $('tcEnter').hidden = dead;
      $('tcEnter').textContent = dead ? '입장하기' : '다시 해 보기';
      if (dead) $('tcSolo').focus();
      return;
    }
    const el = $('lbError');
    el.hidden = !msg;
    el.textContent = msg || '';
    if (dead && this.invite) $('lbInvite').hidden = true; // (that invite is no more)
    if (msg) el.scrollIntoView?.({ block: 'nearest' });
  }

  lobbyBusy(on) {
    $('lobby').classList.toggle('busy', on);
    if (this.ticket && !this.ticketDead) { $('tcEnter').disabled = on; $('tcLine').textContent = on ? '방을 찾아 자리로 안내하는 중이에요…' : '입장 준비가 끝났어요. 표를 내밀어 주세요.'; }
  }

  // ------------------------------------------------------- watching together
  // info: { title, code, cap } or null (watching alone)
  setRoom(info) {
    this.room = info;
    $('roomChip').hidden = !info;
    $('chat').hidden = !info;
    $('chatBtn').hidden = !info || !this.touch;
    if (!info) { this.setHostControls(true); return; }
    $('roomChipTitle').textContent = info.title;
    $('roomTitle').textContent = info.title;
    $('roomCode').textContent = info.code;
  }

  setOffline(off) { $('roomChip').classList.toggle('offline', off); }

  // members: [{ id, name, avatar }], host id, my id
  setMembers(members, host, me) {
    $('roomChipCount').textContent = `${members.length}/${this.room?.cap ?? ''}`;
    const ul = $('roomMembers');
    ul.innerHTML = '';
    const sorted = [...members].sort((a, b) => (b.id === host) - (a.id === host) || (b.id === me) - (a.id === me) || a.id - b.id);
    for (const m of sorted) {
      const li = document.createElement('li');
      if (m.id === me) li.className = 'me';
      const name = document.createElement('span');
      name.className = 'm-name';
      name.textContent = m.id === me ? `${m.name} (나)` : m.name;
      const animal = document.createElement('span');
      animal.className = 'm-animal';
      animal.textContent = this.avatars?.find((a) => a.id === m.avatar)?.ko || '';
      li.append(name, animal);
      if (m.id === host) {
        const h = document.createElement('span');
        h.className = 'm-host';
        h.textContent = '👑 방장';
        li.appendChild(h);
      } else if (host === me) {
        const b = document.createElement('button');
        b.className = 'lb-mini';
        b.type = 'button';
        b.textContent = '방장 넘기기';
        b.addEventListener('click', () => this.emit('handoff', m.id, m.name));
        li.appendChild(b);
      }
      ul.appendChild(li);
    }
    $('roomHostHint').textContent = host === me
      ? '내가 방장이에요. 공연 시작, 재생과 멈춤, 곡 넘기기는 방장만 할 수 있어요.'
      : '공연 시작, 재생과 멈춤, 곡 넘기기는 방장이 해요. 화질과 소리 설정은 각자 바꿀 수 있어요.';
  }

  // guests see every control, but the show's controls are the host's
  setHostControls(isHost) {
    this.isHost = isHost;
    const lock = (el) => {
      if (!el) return;
      el.classList.toggle('host-locked', !isHost);
      if ('disabled' in el) el.disabled = !isHost;
      if (!isHost) el.title = '방장만 할 수 있어요'; else el.removeAttribute('title');
    };
    for (const id of ['btnPlay', 'btnPrev', 'btnNext', 'startBtn', 'optShuffle', 'optRepeatOne', 'gap', 'intervalGo']) lock($(id));
    document.querySelectorAll('#intervalSeg button').forEach(lock);
    lock($('seek'));
    $('seek').setAttribute('aria-disabled', String(!isHost));
    document.querySelectorAll('#programList button').forEach(lock);
    $('startBtn').textContent = isHost ? '공연 시작' : '방장이 공연을 시작하면 연주자들이 들어와요';
    // (a guest's K would only say the show is the host's: the hint leaves it out)
    const hint = $('startHint');
    if (hint && !document.body.classList.contains('touch')) {
      hint._full ??= hint.innerHTML;
      hint.innerHTML = isHost ? hint._full : hint._full.replace(/ · <kbd>K<\/kbd> 공연 시작/, ' · <kbd>Enter</kbd> 채팅');
    }
  }

  // ------------------------------------------------------------------ chat
  chatLine({ name = null, text, sys = false }) {
    const ol = $('chatLog');
    const li = document.createElement('li');
    if (sys) li.className = 'sys';
    if (name) {
      const b = document.createElement('b');
      b.textContent = name;
      li.appendChild(b);
    }
    li.appendChild(document.createTextNode(text));
    ol.appendChild(li);
    while (ol.children.length > 40) ol.firstChild.remove();
    // the latest few stay visible; older ones fade until the chat is opened
    const visible = this.touch ? 4 : 7;
    [...ol.children].forEach((x, i) => x.classList.toggle('old', i < ol.children.length - visible));
    clearTimeout(li._t);
    setTimeout(() => li.classList.add('old'), 14000);
  }

  openChat() {
    if (!this.room) return;
    $('chat').classList.add('open');
    $('chatForm').hidden = false;
    $('chatInput').focus();
    this.emit('chatOpen');
  }

  closeChat() {
    $('chat').classList.remove('open');
    $('chatForm').hidden = true;
    $('chatInput').blur();
  }

  // ---------------------------------------------------------------- loading
  setLoading(text, frac) {
    $('loadText').textContent = text;
    $('loadBar').style.width = `${Math.round(frac * 100)}%`;
  }

  ready() {
    $('loadText').textContent = '준비가 끝났어요';
    $('loadBar').style.width = '100%';
    this.lobbyReady = true;
    for (const id of ['enterBtn', 'lbInviteGo', 'lbCreate', 'lbJoinCode']) $(id).disabled = false;
    document.querySelectorAll('#lbRooms li > button').forEach((b) => { b.disabled = !!b.dataset.full; });
    if (this.ticket) {
      $('tcEnter').disabled = false;
      $('tcLine').textContent = '입장 준비가 끝났어요. 표를 내밀어 주세요.';
      $('tcEnter').focus({ preventScroll: true });
      return;
    }
    (this.invite ? $('lbInviteGo') : $('lbOnline').hidden ? $('enterBtn') : $('lbCreate')).focus({ preventScroll: true });
  }

  enter(touch) {
    if (this.entered) return;
    this.entered = true;
    document.body.classList.toggle('touch', !!touch);
    $('splash').classList.add('leaving');
    setTimeout(() => $('splash')?.remove(), 1300);
    $('nowPlaying').hidden = false;
    $('transport').hidden = false;
    $('startWrap').hidden = false;
    if (touch) {
      $('joystick').hidden = false;
      $('joyZone').hidden = false;
      $('jumpBtn').hidden = false;
      $('startHint').textContent = '왼쪽 조이스틱으로 걷고, 화면을 끌어 둘러봐요';
    }
    // (layout) what sits above the dock - the start button, toasts, the stick,
    // a phone's panel - reads its real top edge: --dock and --start-top, in px
    // from the bottom of the screen (the dock wraps to more rows on a phone)
    const sync = () => {
      const root = document.documentElement.style;
      const t = $('transport').getBoundingClientRect();
      if (t.height) root.setProperty('--dock', `${Math.round(window.innerHeight - t.top)}px`);
      const s = $('startWrap');
      const r = s.hidden ? null : s.getBoundingClientRect();
      root.setProperty('--start-top', r && r.height ? `${Math.round(window.innerHeight - r.top)}px` : '0px');
    };
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(sync);
      ro.observe($('transport'));
      ro.observe($('startWrap'));
    }
    window.addEventListener('resize', sync);
    sync();
  }

  // the musicians have been called on stage
  showStarted() {
    const w = $('startWrap');
    w.classList.add('leaving');
    setTimeout(() => { w.hidden = true; }, 600);
    // one short reminder of how to look around, unless you already have
    if (!this.touch && !this.looked) {
      $('lookHint').hidden = false;
      clearTimeout(this._lookT);
      this._lookT = setTimeout(() => this.hideLookHint(), 7000);
    }
  }

  hideLookHint() {
    this.looked = true;
    $('lookHint').hidden = true;
  }

  // first-person mouse look: crosshair on, cursor hidden
  setLocked(on) {
    document.body.classList.toggle('locked', on);
    if (on) this.hideLookHint();
    if (!on) this.target(null);
    this.tooltip(null);
  }

  // top edge of the controls at the bottom (the dock, the start button)
  bottomUiTop() {
    let top = Infinity;
    for (const id of ['transport', 'startWrap', 'focusChip']) {
      const el = $(id);
      if (!el || el.hidden || el.classList.contains('leaving')) continue;
      const r = el.getBoundingClientRect();
      if (r.height && r.top > window.innerHeight * 0.5) top = Math.min(top, r.top);
    }
    return top;
  }

  // mouse over the hall, not captured: crosshair on, cursor hidden there
  setAim(on) {
    document.body.classList.toggle('aim', on);
    if (!on && !document.body.classList.contains('locked')) this.target(null);
    if (on) this.tooltip(null);
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
    if (this.isHost === false) this.setHostControls(false);
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
    // (seated, neither is on: '걷기' is the way up again)
    document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
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

  // the Sphere's lift panel: the level you are on, or null to hide it
  liftPanel(level) {
    const el = $('liftPanel');
    el.hidden = !level;
    el.querySelector('small').style.display = this.touch ? 'none' : ''; // no number keys on a phone
    if (level) el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.level) === level)));
  }

  setMuted(m) {
    document.querySelector('.vol')?.classList.toggle('muted', m);
    $('btnMute').setAttribute('aria-pressed', String(m));
    $('btnMute').setAttribute('aria-label', m ? '소리 켜기' : '음소거');
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
    // near the right or bottom edge it opens to the other side of the cursor
    const w = el.offsetWidth, h = el.offsetHeight;
    const dx = x + 14 + w > window.innerWidth - 8 ? -14 - w : 14;
    const dy = y + 14 + h > window.innerHeight - 8 ? -14 - h : 14;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
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

  // how many guests are in the house now; roomCap: watching together, the
  // house is shared and does not grow past the room's (that per cent)
  // (drawn: a phone draws only so many of them)
  setCrowdCount(n, roomCap = 0, drawn = n) {
    const el = $('crowdText');
    if (!el) return;
    const few = drawn < n ? ` 이 기기에서는 ${drawn.toLocaleString()}명까지만 보여요.` : '';
    el.textContent = roomCap
      ? `같이 볼 때는 모두 같은 객석이라 ${roomCap}%까지만 앉아요. 지금 ${n.toLocaleString()}명.${few}`
      : n > 0 ? `지금 ${n.toLocaleString()}명이 앉아 있어요.${few}` : '오늘은 빈 객석이에요.';
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

  // ------------------------------------------------------ the leaf programme
  // card: tonight so far (or null); history: kept evenings, newest first
  showLeaf(card, history = []) {
    const list = card ? [card, ...history.filter((h) => h.at !== card.at)] : history;
    if (!list.length) { this.toast('한 곡을 끝까지 들으면 오늘 밤의 잎사귀가 생겨요.', 2600); return; }
    const show = (c) => {
      $('leafDate').textContent = `${c.date} ${c.night}`;
      $('leafVenue').textContent = `${this.venues?.[c.venue]?.ko || '숲속 필하모닉 홀'}에서`;
      $('leafLine').textContent = c.line || '';
      $('leafLine').hidden = !c.line;
      const ol = $('leafPieces');
      ol.innerHTML = '';
      for (const p of c.pieces.slice(0, 9)) {
        const li = document.createElement('li');
        li.textContent = p.title;
        const sm = document.createElement('small');
        sm.textContent = p.composer;
        li.appendChild(sm);
        ol.appendChild(li);
      }
      if (c.pieces.length > 9) {
        const li = document.createElement('li');
        li.textContent = `그리고 ${c.pieces.length - 9}곡 더`;
        ol.appendChild(li);
      }
      const dl = $('leafFacts');
      dl.innerHTML = '';
      const fact = (k, v) => { if (!v) return; const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); };
      fact('앉았던 자리', c.seat);
      fact('함께 들은', c.people?.length ? c.people.join(', ') : '');
      fact('돔 위의 풍경', c.worlds?.length ? c.worlds.join(' · ') : '');
      fact('들은 시간', c.minutes ? `${c.minutes}분` : '');
      document.querySelectorAll('#leafPastList button').forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.at) === c.at)));
    };
    const past = $('leafPastList');
    past.innerHTML = '';
    $('leafPast').hidden = list.length < 2;
    for (const c of list.slice(0, 12)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.at = String(c.at);
      b.textContent = c === card ? '오늘 밤' : c.date.replace(/^\d+년 /, '');
      b.addEventListener('click', () => show(c));
      past.appendChild(b);
    }
    show(list[0]);
    $('leaf').hidden = false;
    $('leafClose').focus({ preventScroll: true });
    this.emit('leafOpen');
  }

  // ------------------------------------------------------------ the interval
  // on: shown or not; host: the "second half now" button is theirs
  interval(on, host = true) {
    $('intervalChip').hidden = !on;
    $('intervalGo').hidden = !host;
    if (!on) { $('intervalTea').setAttribute('aria-pressed', 'false'); $('intervalTea').textContent = '🍵 도토리차'; }
  }

  setIntervalLeft(sec) {
    const s = Math.max(0, Math.ceil(sec));
    $('intervalLeft').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  tea() {
    $('intervalTea').setAttribute('aria-pressed', 'true');
    $('intervalTea').textContent = '🍵 마시는 중';
  }

  // the thing to do nearby (a label), or null
  act(text) {
    if (this._act === text) return;
    this._act = text;
    $('actBtn').hidden = !text;
    if (text) $('actText').textContent = text;
  }

  showNews(lines) {
    const ul = $('newsList');
    ul.innerHTML = '';
    for (const l of lines) {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = l.title;
      li.append(b, document.createTextNode(l.text));
      ul.appendChild(li);
    }
    $('news').hidden = false;
    $('newsClose').focus({ preventScroll: true });
    this.emit('leafOpen');
  }

  // ------------------------------------------------------------- a recital
  // null: hidden; otherwise which places are free
  recital(state) {
    $('recitalChip').hidden = !state;
    if (!state) return;
    $('recitalStage').disabled = !state.stage;
    $('recitalTurner').disabled = !state.turner;
  }

  // ------------------------------------------------------------- the encore
  // state: { cands: [{ titleKo, composerKo }], counts: [n], mine: k, left: s, people } or null
  encore(state) {
    const el = $('encorePanel');
    if (!state) { el.hidden = true; this._enc = null; return; }
    const box = $('encoreCands');
    if (this._enc !== state.cands) {
      this._enc = state.cands;
      box.innerHTML = '';
      state.cands.forEach((c, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<b></b><small></small><span class="lanterns"></span>';
        b.querySelector('b').textContent = c.titleKo;
        b.querySelector('small').textContent = `${c.composerKo} · ${c.ensembleKo}`;
        b.addEventListener('click', () => this.emit('vote', k));
        box.appendChild(b);
      });
    }
    [...box.children].forEach((b, k) => {
      b.setAttribute('aria-pressed', String(state.mine === k));
      const n = state.counts?.[k] || 0;
      b.querySelector('.lanterns').textContent = n ? '🏮'.repeat(Math.min(n, 12)) + (n > 12 ? ` ${n}` : '') : '';
    });
    $('encoreLeft').textContent = state.left > 0 ? `${Math.ceil(state.left)}초` : '';
    el.hidden = false;
  }

  // ---------------------------------------------------------- asleep
  sleep(on) {
    $('sleepVeil').hidden = !on;
    this.asleep = on;
    if (!on && this._drawString) requestAnimationFrame(this._drawString);
  }

  // ---------------------------------------------------------------- binding
  _bind() {
    // A finger's tap counts when it lifts on the button: the browser makes no
    // click of a tap while another finger is down (the left thumb on the
    // stick), so a jump, a pause or a sit would be lost while walking. The
    // mouse and the keyboard keep the plain click (and the click that
    // follows a lone finger's tap is not counted twice).
    const tap = (el, fn, { onDown = false } = {}) => {
      let finger = null;
      let tapped = 0;
      const fire = (e) => { tapped = this._tapAt = performance.now(); fn(e); el.blur(); };
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' || el.disabled) return;
        if (onDown) fire(e); else finger = e.pointerId;
      });
      el.addEventListener('pointerup', (e) => {
        if (e.pointerId !== finger) return;
        finger = null;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) fire(e);
      });
      el.addEventListener('pointercancel', () => { finger = null; });
      el.addEventListener('click', (e) => {
        if (performance.now() - tapped < 800) return;
        fn(e);
        if (e.detail > 0) el.blur();
      });
    };
    const click = (id, fn, opt) => tap($(id), fn, opt);
    click('startBtn', () => this.emit('start'));
    click('btnPlay', () => this.emit('toggle'));
    click('btnNext', () => this.emit('next'));
    click('btnPrev', () => this.emit('prev'));
    click('btnHelp', () => { $('help').hidden = false; $('helpClose').focus(); });
    click('helpClose', () => { $('help').hidden = true; });
    click('leafBtn', () => this.emit('leaf'));
    click('plazaBtn', () => this.emit('toPlaza'));
    click('intervalTea', () => this.emit('tea'));
    click('recitalStage', () => this.emit('stageSeat', false));
    click('recitalTurner', () => this.emit('stageSeat', true));
    click('intervalNews', () => this.emit('news'));
    click('intervalGo', () => this.emit('secondHalf'));
    click('actBtn', () => this.emit('act'));
    click('newsClose', () => { $('news').hidden = true; });
    // (the click a finger's tap leaves behind lands on the backdrop of the dialog
    // it just opened: not a click outside the card, so it does not close it)
    const outside = (e, id) => e.target.id === id && performance.now() - (this._tapAt || 0) > 700;
    $('news').addEventListener('click', (e) => { if (outside(e, 'news')) $('news').hidden = true; });
    document.querySelectorAll('#intervalSeg button').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.min) === this.settings.interval));
      b.addEventListener('click', () => {
        document.querySelectorAll('#intervalSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.onSetting('interval', Number(b.dataset.min));
      });
    });
    click('leafClose', () => { $('leaf').hidden = true; });
    $('leaf').addEventListener('click', (e) => { if (outside(e, 'leaf')) $('leaf').hidden = true; });
    $('help').addEventListener('click', (e) => { if (outside(e, 'help')) $('help').hidden = true; });
    click('btnFull', () => this.emit('fullscreen'));
    click('focusClose', () => this.emit('unfocus'));
    click('sitBtn', () => this.emit('sit'));
    click('roomChip', () => { const open = $('panel').hidden || this.openPanel !== 'room'; this.showPanel(open ? 'room' : null); });
    click('roomLeave', () => this.emit('leaveRoom'));
    click('roomCopy', () => this.emit('copyInvite'));
    click('chatBtn', () => ($('chatForm').hidden ? this.openChat() : this.closeChat()));
    $('chatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = $('chatInput').value.trim();
      if (text) this.emit('chat', text);
      $('chatInput').value = '';
      this.closeChat();
    });
    $('chatInput').addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); $('chatInput').value = ''; this.closeChat(); } // (Esc: the line is not sent - not now, not glued to the next one)
    });
    click('jumpBtn', () => this.emit('jump'), { onDown: true }); // (at once, as a game's jump)
    $('focusSolo').addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(on));
      this.emit('solo', on);
    });
    document.querySelectorAll('.mode').forEach((b) => tap(b, () => this.emit('mode', b.dataset.mode)));

    document.querySelectorAll('.tab-btn').forEach((b) => tap(b, () => {
      const name = b.dataset.panel;
      const open = $('panel').hidden || this.openPanel !== name;
      this.showPanel(open ? name : null);
    }));
    click('panelClose', () => this.showPanel(null));

    const vol = $('volume');
    vol.value = String(this.settings.volume);
    vol.addEventListener('input', () => this.onSetting('volume', Number(vol.value)));
    click('btnMute', () => this.emit('mute'));

    const bindCheck = (id, key) => {
      const el = $(id);
      el.checked = !!this.settings[key];
      el.addEventListener('change', () => this.onSetting(key, el.checked));
    };
    for (const [id, key] of [['optShuffle', 'shuffle'], ['optRepeatOne', 'repeatOne'], ['optFixedEar', 'fixedEar'], ['optApplause', 'applause'], ['optNotes', 'notes'], ['optGlow', 'glow'], ['optFireflies', 'fireflies'], ['optFx', 'fx'], ['optLasers', 'lasers'], ['optScreen', 'screen']]) bindCheck(id, key);
    // the audience: how full this venue's house is (each venue keeps its own)
    const crowd = $('crowd');
    const crowdKey = IS_SPHERE ? 'crowdSphere' : 'crowdHall';
    const showCrowd = () => {
      $('crowdOut').textContent = `${crowd.value}%`;
      crowd.style.setProperty('--fill', `${crowd.value}%`);
    };
    crowd.value = String(this.settings[crowdKey] ?? 0);
    showCrowd();
    crowd.addEventListener('input', () => {
      showCrowd();
      this.onSetting(crowdKey, Number(crowd.value));
    });
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
      // typing (a nickname, a chat line): no shortcuts
      if ((t instanceof HTMLInputElement && !['checkbox', 'range', 'radio'].includes(t.type)) || t instanceof HTMLTextAreaElement) return;
      // still in the lobby
      if ($('splash') && !$('splash').classList.contains('leaving')) return;
      if (isFormTarget(t) && ['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.code)) return;
      if (t instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return;
      const c = e.code;
      if (c === 'Space') e.preventDefault(); // jump (handled by the walker)
      else if (c === 'KeyK') this.emit('toggle');
      else if (c === 'KeyN') this.emit('next');
      else if (c === 'KeyP') this.emit('prev');
      else if (c === 'KeyH') document.body.classList.toggle('ui-hidden');
      else if (c === 'KeyM') this.emit('mute');
      else if (c === 'Enter') { if (this.room) { e.preventDefault(); this.openChat(); } else this.emit('fullscreen'); }
      else if (e.key === '?') {
        $('help').hidden = !$('help').hidden;
        // (the help has buttons to press: the mouse comes back for them)
        if (!$('help').hidden && document.pointerLockElement) document.exitPointerLock();
      }
      // Esc while the mouse is captured only lets the mouse go (the walker
      // does that); the next Esc closes what is open
      else if (c === 'Escape') { if (!e.defaultPrevented && !document.pointerLockElement) { $('help').hidden = true; $('leaf').hidden = true; $('news').hidden = true; this.showPanel(null); } }
      else if (c === 'KeyF') { if (!$('actBtn').hidden) this.emit('act'); }
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
    const titles = { program: '오늘의 프로그램', settings: '설정', room: '같이 보는 사람들' };
    if (name) $('panelTitle').textContent = titles[name];
    if (name === 'program') {
      const cur = $('programList').querySelector('.current');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
  }

  // ------------------------------------------------------------ joystick
  _initJoystick() {
    // (a thumb stick that comes to your left thumb: see joystick.js)
    this.joy = thumbStick({ base: $('joystick'), knob: $('joyKnob'), zone: $('joyZone') });
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
      if (!this.asleep) requestAnimationFrame(draw); // (asleep: no drawing at all until woken)
    };
    this._drawString = draw;
    requestAnimationFrame(draw);
  }
}
