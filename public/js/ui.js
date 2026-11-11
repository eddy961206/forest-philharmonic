// DOM interface: now-playing card, the vibrating "string" seek bar,
// transport, side panel (programme, settings), touch controls, prompts.
import { tapButton, thumbStick } from './joystick.js';
import { IS_SPHERE, IS_OUTDOOR } from './scene/venue.js';

const $ = (id) => document.getElementById(id);
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const tagOf = (t) => String(t?.tagName || '').toUpperCase();
const isFormTarget = (t) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagOf(t)) || t?.getAttribute?.('role') === 'slider';

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
    if (V?.title) { $('splashTitle').textContent = V.title; document.title = V.title; }
    if (V?.ko) $('stage').setAttribute('aria-label', `3D ${V.ko}`);
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
    // (a pasted "K7Q-H2M" or " k7qh2m ": the letters and digits are the code)
    $('lbCode').addEventListener('input', () => { $('lbCode').value = $('lbCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
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
    this._resetConfirm?.();
    $('roomChip').hidden = !info;
    $('chat').hidden = !info;
    if ($('btnFull')) $('btnFull').title = info ? '전체 화면' : '전체 화면 (Enter)';
    this.unread = 0;
    this._chatButton();
    if (!info) { this.setHostControls(true); return; }
    $('roomChipTitle').textContent = info.title;
    $('roomTitle').textContent = info.title;
    $('roomCode').textContent = info.code;
    this._syncStartHint();
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
    const lockButton = (el) => {
      if (!el) return;
      el.classList.toggle('host-locked', !isHost);
      el.setAttribute('aria-disabled', String(!isHost));
      if (!isHost) el.title = '방장만 할 수 있어요'; else el.removeAttribute('title');
    };
    const lockInput = (el) => {
      if (!el) return;
      el.classList.toggle('host-locked', !isHost);
      if ('disabled' in el) el.disabled = !isHost;
      el.setAttribute('aria-disabled', String(!isHost));
      const row = el.closest?.('label') || el.parentElement;
      row?.classList?.toggle?.('host-locked-row', !isHost);
      if (!isHost) el.title = '방장만 할 수 있어요'; else el.removeAttribute('title');
    };
    for (const id of ['btnPlay', 'btnPrev', 'btnNext', 'startBtn', 'intervalGo']) lockButton($(id));
    for (const id of ['optShuffle', 'optRepeatOne', 'gap', 'optSkipStageTransitions']) lockInput($(id));
    document.querySelectorAll('#intervalSeg button').forEach(lockButton);
    lockButton($('seek'));
    $('seek').setAttribute('aria-disabled', String(!isHost));
    document.querySelectorAll('#programList button').forEach(lockButton);
    $('startBtn').textContent = isHost ? '공연 시작' : '방장이 공연을 시작하면 연주자들이 들어와요';
    this._syncStartHint();
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
    // Closed, the chat shows nothing over the show: what came meanwhile is
    // counted on its button (a phone's, or on a desktop one that appears
    // for it); open, the log scrolls to the newest line.
    if ($('chat').classList.contains('open')) ol.scrollTop = ol.scrollHeight;
    else if (!sys) { this.unread = (this.unread || 0) + 1; this._chatButton(); }
  }

  // the chat button: shown whenever watching together so mouse, touch and
  // keyboard visitors all see a clear way to open chat and unread counts
  _chatButton() {
    const btn = $('chatBtn');
    if (!btn) return;
    const n = this.room ? this.unread || 0 : 0;
    btn.hidden = !this.room;
    if (n > 0) btn.dataset.unread = n > 9 ? '9+' : String(n);
    else delete btn.dataset.unread;
    btn.setAttribute('aria-label', n > 0 ? `채팅 (새 메시지 ${n}개)` : '채팅');
  }

  openChat() {
    if (!this.room) return;
    $('chat').classList.add('open');
    $('chatForm').hidden = false;
    const ol = $('chatLog');
    ol.scrollTop = ol.scrollHeight;
    this.unread = 0;
    this._chatButton();
    $('chatInput').focus();
    this.emit('chatOpen');
  }

  closeChat() {
    $('chat').classList.remove('open');
    $('chatForm').hidden = true;
    $('chatInput').blur();
    this._chatButton();
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
      $('tcEnter').scrollIntoView?.({ block: 'nearest' }); // (a short screen: the button comes into view, not below the fold)
      return;
    }
    (this.invite ? $('lbInviteGo') : $('lbOnline').hidden ? $('enterBtn') : $('lbCreate')).focus({ preventScroll: true });
  }

  setTouch(on) {
    const next = Boolean(on);
    const prev = this.touch;
    this.touch = next;
    document.documentElement?.classList?.toggle?.('touch', next);
    document.body?.classList?.toggle?.('touch', next);
    if (this.entered) {
      if ($('joystick')) $('joystick').hidden = !next;
      if ($('joyZone')) $('joyZone').hidden = !next;
      if ($('jumpBtn')) $('jumpBtn').hidden = !next;
      if (!next) {
        this.stickTouch?.release?.();
        this.joy?.reset?.();
      }
    }
    if ($('liftPanel') && !$('liftPanel').hidden) {
      const sm = $('liftPanel').querySelector?.('small');
      if (sm) sm.style.display = next ? 'none' : '';
    }
    this._syncStartHint();
    this._chatButton();
    if (prev !== undefined && prev !== next) this.emit('touchChange', next);
    this._syncLayout?.();
  }

  setFoyerHint(inFoyer) {
    const next = Boolean(inFoyer);
    if (this._inFoyer === next) return;
    this._inFoyer = next;
    this._syncStartHint();
  }

  _syncStartHint() {
    const hint = $('startHint');
    if (!hint) return;
    const guest = Boolean(this.room && this.isHost === false);
    if (this.touch) {
      if (guest) {
        hint.textContent = this._inFoyer
          ? '앞쪽 문을 지나 객석에 앉아 보세요 · 방장이 곧 시작해요'
          : '방장이 시작하면 다 함께 들어요 · 자리는 두 번 탭해 앉아요';
      } else {
        hint.textContent = this._inFoyer
          ? '앞쪽 문을 지나 자리에 앉거나 여기서 바로 공연을 시작해요'
          : '왼쪽 조이스틱으로 걷고, 화면을 끌어 둘러봐요 · 자리는 두 번 탭';
      }
      return;
    }
    const base = this._inFoyer
      ? '앞쪽 문을 지나 객석에 앉거나(더블클릭 · <kbd>E</kbd>) 여기서 바로 시작해요 · <kbd>K</kbd> 공연 시작'
      : '<kbd>W A S D</kbd> 걷기 · 끌어서 둘러보기 · 좌석 더블클릭 · <kbd>E</kbd> 앉기 · <kbd>K</kbd> 공연 시작';
    hint.innerHTML = guest
      ? base.replace(/ · <kbd>K<\/kbd> 공연 시작$/, ' · <kbd>Enter</kbd> 채팅').replace('여기서 바로 시작해요', '방장이 곧 시작해요')
      : base;
  }

  enter(touch) {
    if (this.entered) return;
    this.entered = true;
    $('splash').classList.add('leaving');
    setTimeout(() => $('splash')?.remove(), 1300);
    // (the piece's title waits for the show itself: see showStarted)
    $('transport').hidden = false;
    $('startWrap').hidden = false;
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
    this._syncLayout = sync;
    this.setTouch(touch);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(sync);
      ro.observe($('transport'));
      ro.observe($('startWrap'));
    }
    window.addEventListener('resize', sync);
    sync();
    this._initDim();
  }

  // Watching UI that fades back while nobody touches anything: after 4 s
  // without input it settles to about 40% (never invisible), and any move,
  // touch, key, wheel or focus brings it back at once. Only opacity changes
  // (one animated property on <body>): nothing moves, nothing is hidden,
  // and the first tap still does what it lands on. It stays bright while
  // something is being used - a panel, the chat, help, a drag, the stick -
  // and before the show begins (the start button is the call to action).
  _initDim() {
    let last = performance.now();
    let held = 0; // pointers pressed down right now (drags, long presses)
    const body = document.body;
    const wake = () => { last = performance.now(); if (body.classList.contains('ui-dim')) body.classList.remove('ui-dim'); };
    for (const ev of ['pointermove', 'wheel', 'keydown', 'focusin', 'input', 'touchmove']) window.addEventListener(ev, wake, { capture: true, passive: true });
    window.addEventListener('pointerdown', () => { held++; wake(); }, { capture: true, passive: true });
    const up = () => { held = Math.max(0, held - 1); last = performance.now(); };
    for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, up, { capture: true, passive: true });
    window.addEventListener('blur', () => { held = 0; });
    const busy = () => held > 0 || this.joy?.active
      || !$('startWrap').hidden || !$('panel').hidden || !$('help').hidden || !$('leaf').hidden || !$('news').hidden
      || !$('encorePanel').hidden || !$('chatForm').hidden
      || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    setInterval(() => {
      if (body.classList.contains('ui-dim')) return;
      if (busy()) { last = performance.now(); return; }
      if (performance.now() - last > 4000) body.classList.add('ui-dim');
    }, 500);
  }

  // the musicians have been called on stage
  showStarted() {
    // the programme's title appears with the show - not on walking in
    // (every way the show begins comes through here: the button, K, ▶,
    // choosing a piece, a host's command, joining a room mid-evening)
    const np = $('nowPlaying');
    if (np.hidden) { np.hidden = false; np.classList.add('arriving'); setTimeout(() => np.classList.remove('arriving'), 900); }
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
      meta[1].textContent = p.editionKo || p.ensembleKo;
      b.addEventListener('click', (e) => {
        if (this.isHost === false) { this.toast('공연 진행은 방장만 할 수 있어요.', 2000); return; }
        this.emit('select', i);
        if (e.detail > 0) b.blur();
      });
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
    $('npEnsemble').textContent = piece.editionKo || piece.ensembleKo;
    const reference = $('npReference');
    if (reference) {
      reference.hidden = !piece.referenceUrl;
      reference.textContent = piece.referenceUrl === piece.provenance?.url ? '악보 출처 ↗' : '실황 참고 ↗';
      if (piece.referenceUrl) reference.href = piece.referenceUrl;
      else reference.removeAttribute('href');
    }
    this.duration = piece.duration;
    document.title = `${piece.titleKo} · ${this.venues?.[this.venue]?.title || '숲속 필하모닉'}`;
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
      $('seek').setAttribute('aria-valuetext', `${fmt(t)} / ${fmt(d)}`);
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
    el.hidden = Boolean(this.touch);
    sit.textContent = touchLabel || text;
    sit.hidden = !this.touch;
  }

  // the Sphere's lift panel: the level you are on, or null to hide it
  liftPanel(level) {
    const el = $('liftPanel');
    const wasHidden = el.hidden;
    el.hidden = !level;
    el.querySelector('small').style.display = this.touch ? 'none' : ''; // no number keys on a phone
    if (level) {
      el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.level) === level)));
      if (wasHidden) this._announce('엘리베이터에 들어왔어요. 이동할 층을 선택하세요.');
    }
  }

  _announce(text) {
    const el = $('uiStatus');
    if (!el || !text) return;
    el.textContent = '';
    setTimeout(() => { if ($('uiStatus')) $('uiStatus').textContent = text; }, 20);
  }

  setMuted(m) {
    document.querySelector('.vol')?.classList.toggle('muted', m);
    $('btnMute').setAttribute('aria-pressed', String(m));
    $('btnMute').setAttribute('aria-label', m ? '소리 켜기' : '음소거');
  }

  toast(text, ms = 2200) {
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.style.opacity = '1';
    clearTimeout(this._toastT);
    clearTimeout(this._toastHideT);
    this._toastT = setTimeout(() => {
      el.style.opacity = '0';
      this._toastHideT = setTimeout(() => { el.hidden = true; }, 400);
    }, ms);
  }

  // Something that one press puts right (a piece to try again, the sound to
  // turn back on): a line and a button that stay until it is put right.
  // kind says what it is for (the 'offer' event); no text: away again - only
  // if it is still that kind's
  offer(kind, text = null, label = '') {
    const el = $('offer');
    if (!el) return;
    if (!text) {
      if (this._offer !== kind) return;
      this._offer = null;
      el.hidden = true;
      return;
    }
    this._offer = kind;
    $('offerText').textContent = text;
    $('offerBtn').textContent = label;
    el.hidden = false;
  }

  // The three venue dialogs share focus and background isolation. Automatic
  // end-of-evening cards can replace help without leaving two modals open.
  _showDialog(id, on, { restoreFocus = true } = {}) {
    const el = $(id);
    if (on) {
      if (this._dialog?.id === id) return;
      let from = document.activeElement;
      if (this._dialog) {
        from = this._dialog.from;
        this._showDialog(this._dialog.id, false, { restoreFocus: false });
      }
      el.hidden = false;
      const background = [...document.body.children].filter((child) => child !== el && !child.contains(el) && !['renderStatus', 'sleepVeil'].includes(child.id));
      this._dialog = { id, from, background: background.map((child) => [child, child.inert]) };
      background.forEach((child) => { child.inert = true; });
      this.stickTouch?.release?.();
      this.joy.reset?.();
      this.emit('dialogOpen');
      if (document.pointerLockElement) document.exitPointerLock();
      $(`${id}Close`).focus({ preventScroll: true });
    } else {
      el.hidden = true;
      if (this._dialog?.id !== id) return;
      const { from, background } = this._dialog;
      this._dialog = null;
      background.forEach(([child, inert]) => { child.inert = inert; });
      if (restoreFocus && from && from !== document.body && from.isConnected && !from.closest('[hidden], [inert]')) from.focus({ preventScroll: true });
    }
  }

  showHelp(on) { this._showDialog('help', on); }

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

  focus(info, { canSolo = true } = {}) {
    const chip = $('focusChip');
    const solo = $('focusSolo');
    if (!info) {
      if (chip) chip.hidden = true;
      if (solo) {
        solo.hidden = false;
        solo.setAttribute('aria-pressed', 'false');
        solo.textContent = '이 파트 크게 듣기';
      }
      return;
    }
    $('focusName').textContent = info;
    if (solo) {
      solo.hidden = !canSolo;
      solo.setAttribute('aria-pressed', 'false');
      solo.textContent = '이 파트 크게 듣기';
    }
    chip.hidden = false;
  }

  setStageTargets(items = [], activeId = null) {
    const wrap = $('stageFocusWrap');
    const box = $('stageFocusList');
    if (!wrap || !box) return;
    const key = JSON.stringify({ items, activeId });
    if (key === this._stageTargetsKey) return;
    this._stageTargetsKey = key;
    if (!items.length) {
      wrap.hidden = true;
      box.innerHTML = '';
      return;
    }
    const focusedSid = box.contains?.(document.activeElement) ? document.activeElement?.dataset?.sid : null;
    box.innerHTML = '';
    for (const item of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.sid = item.id;
      b.textContent = item.label;
      b.setAttribute('aria-pressed', String(item.id === activeId));
      b.addEventListener('click', () => this.emit('focusSection', item.id));
      box.appendChild(b);
    }
    wrap.hidden = false;
    if (focusedSid) box.querySelector?.(`button[data-sid="${focusedSid}"]`)?.focus?.({ preventScroll: true });
  }

  setFps(fps, q) {
    const el = $('fpsText');
    if (el && !$('panel').hidden) el.textContent = `지금 ${Math.round(fps)} fps, 화질 ${({ high: '높음', medium: '보통', low: '낮음', efficient: '저사양 · 30 fps 목표' })[q]}`;
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
  showLeaf(card, history = [], { closingEvening = false } = {}) {
    const list = card ? [card, ...history.filter((h) => h.at !== card.at)] : history;
    if (!list.length) { this.toast('한 곡을 끝까지 들으면 오늘 밤의 잎사귀가 생겨요.', 2600); return; }
    const show = (c) => {
      $('leafDate').textContent = `${c.date} ${c.night}`;
      $('leafVenue').textContent = `${this.venues?.[c.venue]?.ko || '숲속 필하모닉 홀'}에서`;
      $('leafLine').textContent = c.line || '';
      $('leafLine').hidden = !c.line;
      if ($('leafClose')) $('leafClose').textContent = closingEvening && c === card ? '간직하기' : '닫기';
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
    this._showDialog('leaf', true);
    this.emit('leafOpen');
  }

  // ------------------------------------------------------------ the interval
  // on: shown or not; host: the "second half now" button is theirs
  interval(on, host = true) {
    const wasHidden = $('intervalChip').hidden;
    $('intervalChip').hidden = !on;
    $('intervalGo').hidden = !host;
    if (on && wasHidden) this._announce('인터미션이 시작되었어요.');
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
    this._showDialog('news', true);
    this.emit('leafOpen');
  }

  // ------------------------------------------------------------- a recital
  // null: hidden; otherwise which places are free
  recital(state) {
    const wasHidden = $('recitalChip').hidden;
    $('recitalChip').hidden = !state;
    if (!state) return;
    $('recitalStage').disabled = !state.stage;
    $('recitalTurner').disabled = !state.turner;
    if (wasHidden) this._announce('독주회 무대 위 자리와 악보 넘김이 자리가 열렸어요.');
  }

  // ------------------------------------------------------------- the encore
  // state: { cands: [{ titleKo, composerKo }], counts: [n], mine: k, left: s, people } or null
  encore(state) {
    const el = $('encorePanel');
    const wasHidden = el.hidden;
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
    if (wasHidden) this._announce('앙코르 투표가 열렸어요. 듣고 싶은 곡에 랜턴을 들어 주세요.');
  }

  // ---------------------------------------------------------- asleep
  sleep(on) {
    $('sleepVeil').hidden = !on;
    this.asleep = on;
    if (on) {
      if (this._stringFrame !== null) cancelAnimationFrame(this._stringFrame);
      this._stringFrame = null;
    } else this._requestStringFrame?.();
  }

  // ---------------------------------------------------------------- binding
  _bindDialogs() {
    const handleDialogKey = (id, e) => {
      if (e._dialogHandled) return;
      e._dialogHandled = true;
      // Reading a card must not move the walker, seek or change the song.
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') { e.preventDefault(); this._showDialog(id, false); return; }
      if (e.key !== 'Tab') return;
      const root = $(id);
      if (!root) return;
      const buttons = [...root.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')]
        .filter((node) => node.getClientRects().length && !node.closest('[hidden], [inert]'));
      const first = buttons[0], last = buttons.at(-1);
      if (!first) return;
      if (!root.contains?.(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    for (const id of ['help', 'leaf', 'news']) {
      $(id)?.addEventListener('keydown', (e) => handleDialogKey(id, e));
    }
    document.addEventListener?.('keydown', (e) => {
      if (this._dialog) handleDialogKey(this._dialog.id, e);
    });
  }

  _resetConfirm() {
    clearTimeout(this._confirmPlazaT);
    clearTimeout(this._confirmRoomT);
    this._confirmPlaza = false;
    this._confirmRoom = false;
    const p = $('plazaBtn');
    if (p) {
      p.textContent = '🎟 광장으로 나가기';
      p.classList?.remove?.('confirming');
    }
    const r = $('roomLeave');
    if (r) {
      r.textContent = '방 나가기';
      r.classList?.remove?.('confirming');
    }
  }

  _bindExitConfirm(tap = (el, fn, opt) => tapButton(el, fn, opt)) {
    const click = (id, fn, opt) => { const el = $(id); if (el) tap(el, fn, opt); };
    click('plazaBtn', () => {
      const activeShow = Boolean(this.room || ($('startWrap') && $('startWrap').hidden));
      if (activeShow && !this._confirmPlaza) {
        this._confirmPlaza = true;
        const btn = $('plazaBtn');
        btn.textContent = '정말 광장으로 나갈까요?';
        btn.classList?.add?.('confirming');
        clearTimeout(this._confirmPlazaT);
        this._confirmPlazaT = setTimeout(() => this._resetConfirm(), 3500);
        return;
      }
      this._resetConfirm();
      this.emit('toPlaza');
    });
    click('roomLeave', () => {
      if (this.room && !this._confirmRoom) {
        this._confirmRoom = true;
        const btn = $('roomLeave');
        btn.textContent = '정말 방을 나갈까요?';
        btn.classList?.add?.('confirming');
        clearTimeout(this._confirmRoomT);
        this._confirmRoomT = setTimeout(() => this._resetConfirm(), 3500);
        return;
      }
      this._resetConfirm();
      this.emit('leaveRoom');
    });
  }

  _bindChat(tap = (el, fn, opt) => tapButton(el, fn, opt)) {
    if ($('chatBtn')) tap($('chatBtn'), () => ($('chatForm').hidden ? this.openChat() : this.closeChat()));
    $('chatForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = $('chatInput').value.trim();
      if (text) this.emit('chat', text);
      $('chatInput').value = '';
      this.closeChat();
    });
    $('chatInput')?.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        e.stopPropagation();
        $('chatInput').value = '';
        this.closeChat();
      } // (Esc: the line is not sent - not now, not glued to the next one)
    });
    if (window.visualViewport) {
      const syncChatViewport = () => {
        const vv = window.visualViewport;
        const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        document.documentElement?.style?.setProperty?.('--kb-offset', `${kb}px`);
      };
      window.visualViewport.addEventListener('resize', syncChatViewport);
      window.visualViewport.addEventListener('scroll', syncChatViewport);
    }
  }

  _bind() {
    this._bindDialogs();
    // A finger's tap counts when it lifts on the button: the browser makes no
    // click of a tap while another finger is down (the left thumb on the
    // stick), so a jump, a pause or a sit would be lost while walking. The
    // mouse and the keyboard keep the plain click (and the click that
    // follows a lone finger's tap is not counted twice).
    const tap = (el, fn, opt) => tapButton(el, (e) => {
      if (e.type.startsWith('pointer')) this._tapAt = performance.now();
      fn(e);
      if (e.type.startsWith('pointer') || e.detail > 0) el.blur();
    }, opt);
    const click = (id, fn, opt) => tap($(id), fn, opt);
    const hostOnly = (fn) => () => {
      if (this.isHost === false) { this.toast('공연 진행은 방장만 할 수 있어요.', 2000); return; }
      fn();
    };
    click('startBtn', hostOnly(() => this.emit('start')));
    click('btnPlay', hostOnly(() => this.emit('toggle')));
    click('btnNext', hostOnly(() => this.emit('next')));
    click('btnPrev', hostOnly(() => this.emit('prev')));
    click('btnHelp', () => this.showHelp(true));
    click('helpClose', () => this.showHelp(false));
    click('leafBtn', () => this.emit('leaf'));
    this._bindExitConfirm(tap);
    click('intervalTea', () => this.emit('tea'));
    click('recitalStage', () => this.emit('stageSeat', false));
    click('recitalTurner', () => this.emit('stageSeat', true));
    click('intervalNews', () => this.emit('news'));
    click('intervalGo', hostOnly(() => this.emit('secondHalf')));
    click('actBtn', () => this.emit('act'));
    click('offerBtn', () => this.emit('offer', this._offer));
    click('newsClose', () => this._showDialog('news', false));
    // (the click a finger's tap leaves behind lands on the backdrop of the dialog
    // it just opened: not a click outside the card, so it does not close it)
    const outside = (e, id) => e.target.id === id && performance.now() - (this._tapAt || 0) > 700;
    $('news').addEventListener('click', (e) => { if (outside(e, 'news')) this._showDialog('news', false); });
    document.querySelectorAll('#intervalSeg button').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.min) === this.settings.interval));
      b.addEventListener('click', () => {
        if (this.isHost === false) { this.toast('공연 진행은 방장만 할 수 있어요.', 2000); return; }
        document.querySelectorAll('#intervalSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.onSetting('interval', Number(b.dataset.min));
      });
    });
    click('leafClose', () => this._showDialog('leaf', false));
    $('leaf').addEventListener('click', (e) => { if (outside(e, 'leaf')) this._showDialog('leaf', false); });
    $('help').addEventListener('click', (e) => { if (outside(e, 'help')) this.showHelp(false); });
    click('btnFull', () => this.emit('fullscreen'));
    click('focusClose', () => this.emit('unfocus'));
    click('sitBtn', () => this.emit('sit'));
    click('roomChip', () => { const open = $('panel').hidden || this.openPanel !== 'room'; this.showPanel(open ? 'room' : null, $('roomChip')); });
    click('roomCopy', () => this.emit('copyInvite'));
    this._bindChat(tap);
    click('jumpBtn', () => this.emit('jump'), { onDown: true }); // (at once, as a game's jump)
    $('focusSolo').addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.textContent = on ? '전체 악단 듣기' : '이 파트 크게 듣기';
      this.emit('solo', on);
    });
    document.querySelectorAll('.mode').forEach((b) => tap(b, () => this.emit('mode', b.dataset.mode)));

    document.querySelectorAll('.tab-btn').forEach((b) => tap(b, () => {
      const name = b.dataset.panel;
      const open = $('panel').hidden || this.openPanel !== name;
      this.showPanel(open ? name : null, b);
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
    for (const [id, key] of [['optSkipStageTransitions', 'skipStageTransitions'], ['optShuffle', 'shuffle'], ['optRepeatOne', 'repeatOne'], ['optFixedEar', 'fixedEar'], ['optNotes', 'notes'], ['optGlow', 'glow'], ['optFireflies', 'fireflies'], ['optFx', 'fx'], ['optLasers', 'lasers'], ['optScreen', 'screen']]) bindCheck(id, key);
    for (const id of ['optShuffle', 'optRepeatOne', 'gap', 'optSkipStageTransitions']) {
      const row = $(id)?.closest?.('label') || $(id)?.parentElement;
      row?.addEventListener?.('pointerdown', () => {
        if (this.isHost === false) this.toast('공연 진행은 방장만 할 수 있어요.', 2000);
      });
    }
    // the audience: how full this venue's house is (each venue keeps its own)
    const crowd = $('crowd');
    const crowdKey = IS_SPHERE ? 'crowdSphere' : IS_OUTDOOR ? 'crowdOutdoor' : 'crowdHall';
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
    // (the applause: how loud; at 0 there is none)
    const app = $('applauseVol');
    const appText = (v) => (v > 0 ? `${Math.round(v * 100)}%` : '끔');
    app.value = String(this.settings.applauseVol);
    $('applauseOut').textContent = appText(this.settings.applauseVol);
    app.addEventListener('input', () => {
      $('applauseOut').textContent = appText(Number(app.value));
      this.onSetting('applauseVol', Number(app.value));
    });
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

    if (IS_SPHERE) {
      if ($('reverbText')) $('reverbText').textContent = '돔 잔향 ';
      if ($('fixedEarText')) $('fixedEarText').textContent = ' 편하게 보기 중에는 204구역 중앙 자리에서 듣기';
      if ($('intervalHint')) $('intervalHint').textContent = '프로그램 한가운데에서 한 번 쉬어 가요. 객석을 거닐며 쉬고, 무대 위에서 연습하는 단원도 만나 봐요.';
      if ($('optScreenText')) $('optScreenText').textContent = ' 돔 상단 중계 화면';
      if ($('newsKicker')) $('newsKicker').textContent = '돔 안내판';
    }
    if (IS_OUTDOOR) {
      for (const id of ['optFx', 'optLasers', 'optScreen', 'optNotes', 'optGlow']) $(id).closest('label').hidden = true;
      $('fixedEarText').textContent = ' 편하게 보기 중에는 마당 중앙 자리에서 듣기';
      $('reverbText').textContent = '야외 잔향 ';
      $('intervalHint').textContent = '프로그램 한가운데에서 한 번 쉬어 가요. 공원 길을 걷거나 자리에서 쉬어도 좋아요.';
      if ($('newsKicker')) $('newsKicker').textContent = '숲속 안내판';
    }
    const domeField = $('domeProjectionField');
    if (domeField) domeField.hidden = !IS_SPHERE;
    document.querySelectorAll('#domeProjectionSeg button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.projection === this.settings.domeProjection));
      b.addEventListener('click', () => {
        document.querySelectorAll('#domeProjectionSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        this.onSetting('domeProjection', b.dataset.projection);
      });
    });

    // keyboard (by physical key, so it works with a Korean IME too)
    this._bindGlobalKeys();

    this._bindSeek();
  }

  _bindGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing || e.keyCode === 229) return;
      if (this._dialog) return;
      if ($('sleepVeil') && !$('sleepVeil').hidden) return;
      if ($('bremen')?.open) return;
      const t = e.target;
      const tag = tagOf(t);
      // typing (a nickname, a chat line): no shortcuts
      if ((tag === 'INPUT' && !['checkbox', 'range', 'radio'].includes(t.type)) || tag === 'TEXTAREA' || t?.isContentEditable) return;
      // still in the lobby
      if ($('splash') && !$('splash').classList?.contains?.('leaving')) return;
      if (isFormTarget(t) && ['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.code)) return;
      if (tag === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
      const c = e.code;
      if (c === 'Space') e.preventDefault(); // jump (handled by the walker)
      else if (c === 'KeyK') { if (this.isHost === false) this.toast('공연 진행은 방장만 할 수 있어요.', 2000); else this.emit('toggle'); }
      else if (c === 'KeyN') { if (this.isHost === false) this.toast('공연 진행은 방장만 할 수 있어요.', 2000); else this.emit('next'); }
      else if (c === 'KeyP') { if (this.isHost === false) this.toast('공연 진행은 방장만 할 수 있어요.', 2000); else this.emit('prev'); }
      else if (c === 'KeyH') {
        const hidden = document.body.classList?.toggle?.('ui-hidden');
        if (hidden) this.toast('화면 표시를 숨겼어요 · 다시 보려면 H 또는 Esc', 1800);
      } else if (c === 'KeyM') this.emit('mute');
      else if (c === 'Enter') { if (this.room) { e.preventDefault(); this.openChat(); } else this.emit('fullscreen'); }
      else if (c === 'BracketLeft' || c === 'BracketRight') { e.preventDefault(); this.emit('cycleFocus', c === 'BracketLeft' ? -1 : 1); }
      else if (e.key === '?' || (c === 'Slash' && e.shiftKey)) {
        this.showHelp($('help').hidden);
        // (the help has buttons to press: the mouse comes back for them)
        if (!$('help').hidden && document.pointerLockElement) document.exitPointerLock();
      }
      // Esc while the mouse is captured only lets the mouse go (the walker
      // does that); the next Esc unhides UI or closes what is open
      else if (c === 'Escape') {
        if (!e.defaultPrevented && !document.pointerLockElement) {
          if (document.body.classList?.contains?.('ui-hidden')) document.body.classList.remove('ui-hidden');
          else if (this._dialog) this._showDialog(this._dialog.id, false);
          else if ($('chat')?.classList?.contains?.('open')) this.closeChat();
          else if ($('panel') && !$('panel').hidden) this.showPanel(null);
          else if ($('focusChip') && !$('focusChip').hidden) this.emit('unfocus');
          else this.showPanel(null);
        }
      } else if (c === 'KeyF') { if ($('actBtn') && !$('actBtn').hidden) this.emit('act'); }
      else if ((c === 'ArrowLeft' || c === 'ArrowRight') && !t?.closest?.('#panel')) {
        if (this.isHost === false) this.toast('공연 진행은 방장만 할 수 있어요.', 2000);
        else this.emit('seekKey', c === 'ArrowLeft' ? -10 : 10, e);
      }
    });
  }

  // Seek on the string: one finger previews the position; only its release
  // commits it. Cancelling or losing focus never changes playback.
  _bindSeek() {
    const seek = $('seek');
    const frac = (e) => {
      const r = seek.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - r.left - 6) / (r.width - 12)));
    };
    let pointer = null;
    const canSeek = () => seek.getAttribute('aria-disabled') !== 'true' && this.duration > 0;
    const cancelSeek = () => { pointer = null; this.scrub = null; };
    seek.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (seek.getAttribute('aria-disabled') === 'true') { this.toast('공연 진행은 방장만 할 수 있어요.', 2000); return; }
      if (pointer !== null || !canSeek()) return;
      pointer = e.pointerId;
      seek.setPointerCapture(pointer);
      this.scrub = frac(e);
      e.preventDefault();
    });
    seek.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) this.scrub = frac(e); });
    const release = (e) => {
      if (e.pointerId !== pointer) return;
      cancelSeek();
      if (canSeek()) this.emit('seek', frac(e) * this.duration);
    };
    seek.addEventListener('pointerup', release);
    for (const type of ['pointercancel', 'lostpointercapture']) seek.addEventListener(type, (e) => { if (e.pointerId === pointer) cancelSeek(); });
    window.addEventListener('blur', cancelSeek);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelSeek(); });
    seek.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.code)) {
        e.stopPropagation();
        e.preventDefault();
        if (seek.getAttribute('aria-disabled') === 'true') { this.toast('공연 진행은 방장만 할 수 있어요.', 2000); return; }
        if (!canSeek()) return;
        if (e.code === 'Home' || e.code === 'End') this.emit('seek', e.code === 'Home' ? 0 : this.duration);
        else this.emit('seekKey', ['ArrowLeft', 'ArrowDown'].includes(e.code) ? -5 : 5, e);
      }
    });
  }

  showPanel(name, opener = document.activeElement) {
    const wasOpen = !$('panel').hidden;
    if (name) this._panelFrom = opener;
    else this._resetConfirm();
    this.openPanel = name;
    $('panel').hidden = !name;
    document.querySelectorAll('.tab-btn').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.panel === name)));
    $('roomChip').setAttribute('aria-expanded', String(name === 'room'));
    document.querySelectorAll('.panel-body').forEach((b) => { b.hidden = b.dataset.body !== name; });
    const titles = { program: '오늘의 프로그램', settings: '설정', room: '같이 보는 사람들' };
    if (name) $('panelTitle').textContent = titles[name];
    if (name === 'program') {
      const cur = $('programList').querySelector('.current');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
    if (name) {
      this.emit('panelOpen', name);
      $('panelClose').focus({ preventScroll: true });
    } else if (wasOpen && this._panelFrom?.isConnected && !this._panelFrom.closest('[hidden], [inert]')) {
      this._panelFrom.focus({ preventScroll: true });
    }
  }

  // ------------------------------------------------------------ joystick
  _initJoystick() {
    // (a thumb stick that comes to your left thumb: see joystick.js)
    this.joy = thumbStick({ base: $('joystick'), knob: $('joyKnob'), zone: $('joyZone') });
    // The finger on the stick, for the walker: a pinch whose first finger
    // happened to land in the stick's corner takes that finger back from the
    // stick (release) and zooms, instead of walking and turning
    const s = (this.stickTouch = { id: null, x: 0, y: 0, t: 0, moved: 0, el: null });
    s.release = () => {
      const id = s.id;
      try { s.el?.releasePointerCapture(id); } catch { /* already gone */ }
      // (the stick lets go of that finger as if it had been lifted)
      try { s.el?.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, pointerType: 'touch', bubbles: true })); } catch { /* old browser */ }
      s.id = null;
    };
    for (const el of [$('joyZone'), $('joystick')]) {
      if (!el) continue;
      el.addEventListener('pointerdown', (e) => {
        if (s.id !== null) return;
        Object.assign(s, { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, el });
      });
      el.addEventListener('pointermove', (e) => {
        if (e.pointerId !== s.id) return;
        s.moved += Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y);
        s.x = e.clientX;
        s.y = e.clientY;
      });
      for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, (e) => { if (e.pointerId === s.id) s.id = null; });
    }
  }

  // --------------------------------------------- the string progress bar
  _initString() {
    const cv = $('stringCanvas');
    const ctx = cv.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._stringFrame = null;
    let phase = 0;
    const requestDraw = () => {
      if (this._stringFrame === null && !this.asleep) this._stringFrame = requestAnimationFrame(draw);
    };
    const draw = () => {
      this._stringFrame = null;
      if (this.asleep) return;
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
      requestDraw(); // asleep: no drawing at all until woken
    };
    this._drawString = draw;
    this._requestStringFrame = requestDraw;
    requestDraw();
  }
}
