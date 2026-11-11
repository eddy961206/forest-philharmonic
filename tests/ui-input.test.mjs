import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { tapButton, thumbStick } from '../public/js/joystick.js';
import { createViewer } from '../public/js/app/viewer.js';
import { Director } from '../public/js/scene/director.js';
import { UI } from '../public/js/ui.js';

// Small event surfaces keep these input regressions independent of WebGL and
// browser rendering. The actual layouts and browser focus are checked separately.
class Element extends EventTarget {
  constructor(id, document, tagName = 'DIV') {
    super();
    Object.assign(this, {
      id,
      document,
      tagName,
      hidden: false,
      inert: false,
      disabled: false,
      isConnected: true,
      textContent: '',
      value: '',
      dataset: {},
      children: [],
      style: { setProperty() {} },
      attributes: new Map(),
    });
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name); else classes.delete(name);
        return on;
      },
      contains: (name) => classes.has(name),
    };
  }
  set innerHTML(v) {
    if (v === '') this.children = [];
  }
  get innerHTML() { return ''; }
  appendChild(child) {
    if (child && typeof child === 'object') child.parent = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) {
    for (const n of nodes) this.appendChild(n);
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: 112, bottom: 44, width: 112, height: 44 }; }
  getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
  setPointerCapture(id) { this.captured = id; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  contains(node) { return this === node || this.children.some((child) => child?.contains?.(node)); }
  matches(selector = '') {
    return String(selector).split(',').map((s) => s.trim()).some((part) => {
      if (!part) return false;
      if (part === '[hidden]') return Boolean(this.hidden);
      if (part === '[inert]') return Boolean(this.inert);
      if (part.startsWith('#')) return this.id === part.slice(1);
      if (part === '[role=button]' || part === '[role="button"]') return this.getAttribute('role') === 'button';
      return String(this.tagName || '').toLowerCase() === part.toLowerCase();
    });
  }
  closest(selector = '[hidden], [inert]') {
    if (this.matches(selector)) return this;
    return this.parent ? this.parent.closest(selector) : null;
  }
  querySelectorAll() { return this.children; }
  focus() { this.document.activeElement = this; }
  blur() { if (this.document.activeElement === this) this.document.activeElement = this.document.body; }
}

function fixture(t) {
  const document = new EventTarget();
  document.hidden = false;
  const window = new EventTarget();
  Object.assign(window, { innerWidth: 390, innerHeight: 844 });
  const elements = new Map();
  const make = (id, tagName = 'DIV') => { const el = new Element(id, document, tagName); elements.set(id, el); return el; };
  document.body = make('body', 'BODY');
  document.documentElement = make('html', 'HTML');
  document.activeElement = document.body;
  document.getElementById = (id) => elements.get(id);
  document.querySelector = () => null;
  document.querySelectorAll = () => [];
  document.createElement = (tag) => new Element('', document, String(tag).toUpperCase());
  document.createTextNode = (txt) => ({ textContent: txt });
  for (const [key, value] of Object.entries({ document, window })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (old) Object.defineProperty(globalThis, key, old); else delete globalThis[key]; });
  }
  const events = [];
  const ui = Object.assign(Object.create(UI.prototype), { joy: {}, duration: 200, handlers: {}, emit: (...args) => events.push(args) });
  t.after(() => {
    clearTimeout(ui._toastT);
    clearTimeout(ui._toastHideT);
    clearTimeout(ui._confirmPlazaT);
    clearTimeout(ui._confirmRoomT);
  });
  return { document, window, make, ui, events };
}

function send(target, type, props = {}) {
  const event = new Event(type, { cancelable: true, bubbles: true });
  for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event;
}
const finger = (pointerId = 1, clientX = 56) => ({ pointerId, pointerType: 'touch', clientX, clientY: 22 });

test('touch activation deduplicates only its compatibility click, never a keyboard click', (t) => {
  const { make } = fixture(t);
  t.mock.method(performance, 'now', () => 50);
  const button = make('button');
  let calls = 0;
  tapButton(button, () => calls++);
  send(button, 'click', { detail: 1 });
  assert.equal(calls, 1, 'an initial mouse click has no artificial 800 ms waiting period');
  assert.equal(send(button, 'pointerdown', finger()).defaultPrevented, true, 'compatibility mousedown cannot steal dialog focus');
  send(button, 'pointerup', finger());
  send(button, 'click', { detail: 1 });
  assert.equal(calls, 2, 'a touch followed by its compatibility click activates once');
  send(button, 'click', { detail: 0 });
  assert.equal(calls, 3, 'keyboard activation works immediately after touch');
});

test('a second finger cannot steal a tap and disabling a held button cancels activation', (t) => {
  const { make } = fixture(t);
  const button = make('button');
  let calls = 0;
  tapButton(button, () => calls++);
  send(button, 'pointerdown', finger(1));
  send(button, 'pointerdown', finger(2));
  send(button, 'pointercancel', finger(2));
  send(button, 'pointerup', finger(2));
  assert.equal(calls, 0);
  send(button, 'pointerup', finger(1));
  assert.equal(calls, 1);
  send(button, 'pointerdown', finger());
  button.disabled = true;
  send(button, 'pointerup', finger());
  send(button, 'click', { detail: 0 });
  assert.equal(calls, 1);
});

test('jump activates on touch down once and remains keyboard accessible', (t) => {
  const { make } = fixture(t);
  const button = make('jump');
  let calls = 0;
  tapButton(button, () => calls++, { onDown: true });
  send(button, 'pointerdown', finger());
  assert.equal(calls, 1);
  send(button, 'pointerup', finger());
  send(button, 'click', { detail: 1 });
  assert.equal(calls, 1);
  send(button, 'click', { detail: 0 });
  assert.equal(calls, 2);
});

test('the joystick resets on app switching and remeasures after the dock moves', (t) => {
  const { make, document, window } = fixture(t);
  const base = make('stick'), knob = make('knob'), zone = make('zone');
  Object.assign(base, { offsetLeft: 20, offsetTop: 500, offsetWidth: 124, offsetHeight: 124 });
  const joy = thumbStick({ base, knob, zone });
  send(zone, 'pointerdown', { ...finger(), clientX: 82, clientY: 562 });
  send(zone, 'pointermove', { ...finger(), clientX: 120, clientY: 562 });
  assert.ok(joy.x > 0);
  send(window, 'blur');
  assert.equal(joy.active, false);
  assert.equal(joy.x, 0);
  assert.equal(knob.style.transform, '');
  base.offsetTop = 400;
  send(zone, 'pointerdown', { ...finger(2), clientX: 82, clientY: 462 });
  assert.equal(base.style.transform, 'translate(0px, 0px)', 'the stick uses its new resting position without a resize');
  send(zone, 'pointermove', { ...finger(2), clientX: 120, clientY: 462 });
  document.hidden = true;
  send(document, 'visibilitychange');
  assert.equal(joy.x, 0);
  assert.equal(joy.y, 0);
  assert.equal(joy.active, false);
});

function seekFixture(t) {
  const f = fixture(t);
  f.seek = f.make('seek');
  f.ui._bindSeek();
  return f;
}

test('scrubbing belongs to one finger and commits only that finger release', (t) => {
  const { seek, ui, events } = seekFixture(t);
  send(seek, 'pointerdown', finger(1, 31));
  assert.equal(ui.scrub, 0.25);
  send(seek, 'pointerdown', finger(2, 106));
  send(seek, 'pointermove', finger(2, 106));
  send(seek, 'pointerup', finger(2, 106));
  assert.equal(ui.scrub, 0.25);
  assert.deepEqual(events, []);
  send(seek, 'pointermove', finger(1, 81));
  send(seek, 'pointerup', finger(1, 81));
  assert.deepEqual(events, [['seek', 150]]);
  assert.equal(ui.scrub, null);
});

for (const reason of ['pointercancel', 'lostpointercapture', 'blur', 'visibilitychange']) {
  test(`scrubbing cancelled by ${reason} never seeks`, (t) => {
    const { seek, ui, events, window, document } = seekFixture(t);
    send(seek, 'pointerdown', finger());
    if (reason === 'blur') send(window, reason);
    else if (reason === 'visibilitychange') { document.hidden = true; send(document, reason); }
    else send(seek, reason, finger());
    send(seek, 'pointerup', finger());
    assert.equal(ui.scrub, null);
    assert.deepEqual(events, []);
  });
}

test('seek supports Home/End and vertical arrows while guest and empty states cannot seek', (t) => {
  const { seek, ui, events } = seekFixture(t);
  send(seek, 'keydown', { code: 'Home' });
  send(seek, 'keydown', { code: 'End' });
  send(seek, 'keydown', { code: 'ArrowUp' });
  send(seek, 'keydown', { code: 'ArrowDown' });
  assert.deepEqual(events.map((event) => event.slice(0, 2)), [['seek', 0], ['seek', 200], ['seekKey', 5], ['seekKey', -5]]);
  seek.setAttribute('aria-disabled', 'true');
  send(seek, 'pointerdown', finger());
  send(seek, 'pointerup', finger());
  send(seek, 'keydown', { code: 'Home' });
  seek.setAttribute('aria-disabled', 'false');
  ui.duration = 0;
  send(seek, 'keydown', { code: 'End' });
  assert.equal(events.length, 4);
});

function dialogFixture(t) {
  const f = fixture(t);
  f.opener = f.make('opener');
  f.recovery = f.make('renderStatus');
  f.alreadyInert = f.make('alreadyInert');
  f.alreadyInert.inert = true;
  f.document.body.children.push(f.opener, f.recovery, f.alreadyInert);
  for (const id of ['help', 'leaf', 'news']) {
    const dialog = f.make(id), close = f.make(`${id}Close`);
    dialog.hidden = true;
    dialog.children.push(close);
    close.parent = dialog;
    f.document.body.children.push(dialog);
    f[id] = dialog;
  }
  f.opener.focus();
  f.ui._bindDialogs();
  return f;
}

test('dialogs isolate the background, preserve recovery, and restore prior inert/focus state', (t) => {
  const { ui, help, opener, recovery, alreadyInert, document, events } = dialogFixture(t);
  ui.showHelp(true);
  assert.deepEqual(events, [['dialogOpen']], 'opening a dialog tells the scene to stop held movement');
  ui.showHelp(true);
  assert.equal(events.length, 1, 'an already-open dialog does not restart scene cleanup');
  assert.equal(help.hidden, false);
  assert.equal(opener.inert, true);
  assert.equal(recovery.inert, false, 'the graphics recovery button remains usable');
  assert.equal(document.activeElement.id, 'helpClose');
  const key = send(help, 'keydown', { key: 'Escape' });
  assert.equal(key.defaultPrevented, true);
  assert.equal(help.hidden, true);
  assert.equal(opener.inert, false);
  assert.equal(alreadyInert.inert, true);
  assert.equal(document.activeElement, opener);
  assert.equal(events.length, 1, 'closing a dialog does not signal a new opening');
});

test('a new card replaces the modal and Tab cycles through all card controls', (t) => {
  const { ui, help, leaf, make, document, opener } = dialogFixture(t);
  const history = make('history');
  history.parent = leaf;
  leaf.children.unshift(history);
  ui.showHelp(true);
  ui._showDialog('leaf', true);
  assert.equal(help.hidden, true);
  assert.equal(leaf.inert, false);
  send(leaf, 'keydown', { key: 'Tab' });
  assert.equal(document.activeElement, history);
  send(leaf, 'keydown', { key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement.id, 'leafClose');
  let stopped = false;
  send(leaf, 'keydown', { key: 'k', code: 'KeyK', stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true, 'dialog keys never reach playback or walking shortcuts');
  ui._showDialog('leaf', false);
  assert.equal(document.activeElement, opener);
});

test('document-level modal listener recovers Tab from body and blocks global shortcuts', (t) => {
  const { ui, help, make, document, window, opener, events } = dialogFixture(t);
  const splash = make('splash');
  splash.classList.add('leaving');
  ui._bindGlobalKeys();

  ui.showHelp(true);
  events.length = 0;
  // Simulate focus dropping to document.body while modal is open
  document.activeElement = document.body;

  const tabEvent = send(document, 'keydown', { key: 'Tab', code: 'Tab' });
  assert.equal(tabEvent.defaultPrevented, true);
  assert.equal(document.activeElement.id, 'helpClose', 'Tab from body snaps focus back into open modal');

  // Global shortcut on window is blocked while modal is open
  send(window, 'keydown', { key: 'k', code: 'KeyK', target: document.body });
  assert.deepEqual(events, []);

  // Escape on document closes modal and restores opener focus
  const esc = send(document, 'keydown', { key: 'Escape', code: 'Escape' });
  assert.equal(esc.defaultPrevented, true);
  assert.equal(help.hidden, true);
  assert.equal(document.activeElement, opener);
});

test('global shortcuts isolate sleepVeil and panel arrows, toast guests, cycle focus, and unhide UI on Escape', (t) => {
  const { ui, make, document, window, events } = fixture(t);
  t.after(() => clearTimeout(ui._toastT));

  const splash = make('splash');
  splash.classList.add('leaving');
  const sleepVeil = make('sleepVeil');
  sleepVeil.hidden = false;
  const panel = make('panel');
  panel.hidden = false;
  const panelClose = make('panelClose', 'BUTTON');
  panel.appendChild(panelClose);
  const panelRow = make('panelRow', 'DIV');
  panel.appendChild(panelRow);
  const toast = make('toast');
  toast.hidden = true;
  const roomChip = make('roomChip', 'BUTTON');
  const seek = make('seek');

  ui._bindGlobalKeys();
  ui._bindSeek();

  // While sleepVeil is open, global shortcuts do nothing
  send(window, 'keydown', { code: 'KeyK', key: 'k', target: document.body });
  send(window, 'keydown', { code: 'BracketRight', key: ']', target: document.body });
  assert.deepEqual(events, []);

  // Wake up: [ and ] cycle onstage targets
  sleepVeil.hidden = true;
  send(window, 'keydown', { code: 'BracketRight', key: ']', target: document.body });
  send(window, 'keydown', { code: 'BracketLeft', key: '[', target: document.body });
  assert.deepEqual(events, [['cycleFocus', 1], ['cycleFocus', -1]]);
  events.length = 0;

  // ArrowLeft/Right inside #panel must not seek playback
  send(window, 'keydown', { code: 'ArrowRight', key: 'ArrowRight', target: panelRow });
  assert.deepEqual(events, []);
  send(window, 'keydown', { code: 'ArrowRight', key: 'ArrowRight', target: document.body });
  assert.deepEqual(events.map((e) => e.slice(0, 2)), [['seekKey', 10]]);
  events.length = 0;

  // Guest (isHost === false) shortcuts & seek show host-only toast instead of emitting
  ui.isHost = false;
  seek.setAttribute('aria-disabled', 'true');
  send(window, 'keydown', { code: 'KeyK', key: 'k', target: document.body });
  assert.deepEqual(events, []);
  assert.equal(toast.textContent, '공연 진행은 방장만 할 수 있어요.');
  toast.textContent = '';
  send(seek, 'pointerdown', finger());
  assert.equal(toast.textContent, '공연 진행은 방장만 할 수 있어요.');

  // KeyH hides UI with recovery toast, and Escape restores UI before closing panel
  const focusChip = make('focusChip');
  focusChip.hidden = false;
  send(window, 'keydown', { code: 'KeyH', key: 'h', target: document.body });
  assert.equal(document.body.classList.contains('ui-hidden'), true);
  assert.equal(toast.textContent, '화면 표시를 숨겼어요 · 다시 보려면 H 또는 Esc');
  send(window, 'keydown', { code: 'Escape', key: 'Escape', target: document.body });
  assert.equal(document.body.classList.contains('ui-hidden'), false);
  assert.equal(panel.hidden, false, 'first Escape restores hidden UI without closing open panel');

  // Next Escape closes open panel; subsequent Escape with focusChip visible emits unfocus
  events.length = 0;
  send(window, 'keydown', { code: 'Escape', key: 'Escape', target: document.body });
  assert.equal(panel.hidden, true);
  assert.deepEqual(events, []);
  send(window, 'keydown', { code: 'Escape', key: 'Escape', target: document.body });
  assert.deepEqual(events, [['unfocus']]);
  void roomChip;
});

test('Director keyboard handler blocks inactive/modal/panel keys and delegates KeyE unfocus vs keyInteract', (t) => {
  const { make, document, window } = fixture(t);
  const dom = make('stage');
  const sleepVeil = make('sleepVeil');
  sleepVeil.hidden = true;
  const modal = make('help');
  modal.hidden = true;
  modal.setAttribute('aria-modal', 'true');
  const panel = make('panel');
  const panelBtn = make('panelItem', 'BUTTON');
  panel.appendChild(panelBtn);
  document.querySelector = (sel) => {
    if (sel.includes('[aria-modal="true"]:not([hidden])') && !modal.hidden) return modal;
    return null;
  };

  const emitted = [];
  let jumped = 0;
  let toggledSit = 0;
  const director = {
    dom,
    active: false,
    locked: false,
    aiming: false,
    mode: 'walk',
    seat: null,
    targetFov: 64,
    keys: new Set(),
    setMode(m) { this.mode = m; },
    toggleSit() { toggledSit++; return false; },
    jump() { jumped++; return true; },
    releaseLock() { this.locked = false; },
    _look() {},
    _emit: (...args) => emitted.push(args),
  };
  Director.prototype._bindInput.call(director);

  // Inactive director ignores movement keys
  send(window, 'keydown', { code: 'KeyW', key: 'w', target: document.body });
  assert.equal(director.keys.has('KeyW'), false);

  // Active director still ignores keys while modal or sleepVeil is open, or inside #panel
  director.active = true;
  modal.hidden = false;
  send(window, 'keydown', { code: 'KeyW', key: 'w', target: document.body });
  assert.equal(director.keys.has('KeyW'), false);
  modal.hidden = true;
  sleepVeil.hidden = false;
  send(window, 'keydown', { code: 'Space', key: ' ', target: document.body });
  assert.equal(jumped, 0);
  sleepVeil.hidden = true;
  send(window, 'keydown', { code: 'ArrowUp', key: 'ArrowUp', target: panelBtn });
  assert.equal(director.keys.has('ArrowUp'), false);

  // Open stage: walking keys register and emit keyMove; aimed KeyE emits keyInteract
  send(window, 'keydown', { code: 'KeyW', key: 'w', target: document.body });
  assert.equal(director.keys.has('KeyW'), true);
  assert.deepEqual(emitted, [['keyMove', 'KeyW']]);
  emitted.length = 0;

  director.locked = true;
  const keyE = send(window, 'keydown', { code: 'KeyE', key: 'e', target: document.body });
  assert.equal(keyE.defaultPrevented, true);
  assert.equal(toggledSit, 1);
  assert.deepEqual(emitted, [['keyInteract']]);
  emitted.length = 0;

  // When focused beside a musician/conductor (mode === 'seat', seat.index === -1), KeyE emits unfocusKey instead of toggleSit
  director.mode = 'seat';
  director.seat = { label: '지휘대 · 부엉 선생 곁', index: -1 };
  const unfocusE = send(window, 'keydown', { code: 'KeyE', key: 'e', target: document.body });
  assert.equal(unfocusE.defaultPrevented, true);
  assert.equal(toggledSit, 1, 'toggleSit must not run and wipe prevFocus during stage focus');
  assert.deepEqual(emitted, [['unfocusKey']]);
});

test('UI._bindChat ignores Escape during Korean IME composition and closes cleanly afterwards', (t) => {
  const { ui, make } = fixture(t);
  ui.room = { title: '숲속방', code: 'ABC123', cap: 8 };
  make('chat');
  const chatForm = make('chatForm', 'FORM');
  make('chatLog', 'OL');
  const chatInput = make('chatInput', 'INPUT');
  make('chatBtn', 'BUTTON');

  ui._bindChat();
  ui.openChat();
  chatInput.value = '안녕하';
  const imeEsc = send(chatInput, 'keydown', { code: 'Escape', key: 'Escape', isComposing: true, keyCode: 229 });
  assert.equal(imeEsc.defaultPrevented, false);
  assert.equal(chatInput.value, '안녕하', 'Korean IME Escape cancels composition without wiping chat input');
  assert.equal(chatForm.hidden, false);

  const plainEsc = send(chatInput, 'keydown', { code: 'Escape', key: 'Escape', isComposing: false, keyCode: 27 });
  assert.equal(plainEsc.defaultPrevented, true);
  assert.equal(chatInput.value, '');
  assert.equal(chatForm.hidden, true);
});

test('focus conductor mode, showLeaf button copy, and UI._bindExitConfirm match UX contracts', (t) => {
  const { ui, leaf, make, events } = dialogFixture(t);

  // Focus chip: conductor hides solo button, player shows solo button
  const focusChip = make('focusChip');
  make('focusName');
  const focusSolo = make('focusSolo', 'BUTTON');
  ui.focus('부엉 선생, 지휘자 · 전체 균형 청취', { canSolo: false });
  assert.equal(focusChip.hidden, false);
  assert.equal(focusSolo.hidden, true);
  ui.focus('다람쥐, 제1바이올린', { canSolo: true });
  assert.equal(focusSolo.hidden, false);
  assert.equal(focusSolo.textContent, '이 파트 크게 듣기');

  // showLeaf: closingEvening shows '간직하기' only on tonight's card, otherwise '닫기'
  for (const id of ['leafDate', 'leafVenue', 'leafLine', 'leafPieces', 'leafFacts', 'leafPast', 'leafPastList']) {
    make(id);
  }
  const tonight = { at: 2, date: '2026년 11월 11일', night: '수요일 밤', venue: 'hall', pieces: [{ title: '교향곡', composer: '베토벤' }] };
  const past = { at: 1, date: '2026년 11월 10일', night: '화요일 밤', venue: 'hall', pieces: [{ title: '전주곡', composer: '쇼팽' }] };
  ui.showLeaf(tonight, [past], { closingEvening: true });
  const leafClose = leaf.children.find((c) => c.id === 'leafClose');
  assert.equal(leafClose.textContent, '간직하기');
  const pastButtons = ui._dialog ? document.getElementById('leafPastList').children : [];
  send(pastButtons[1], 'click');
  assert.equal(leafClose.textContent, '닫기');
  ui._showDialog('leaf', false);

  ui.showLeaf(tonight, [past], { closingEvening: false });
  assert.equal(leafClose.textContent, '닫기');
  ui._showDialog('leaf', false);
  events.length = 0;

  // Real UI._bindExitConfirm on #plazaBtn and #roomLeave
  const startWrap = make('startWrap');
  startWrap.hidden = true;
  const plazaBtn = make('plazaBtn', 'BUTTON');
  plazaBtn.textContent = '🎟 광장으로 나가기';
  const roomLeave = make('roomLeave', 'BUTTON');
  roomLeave.textContent = '방 나가기';
  ui.room = { title: '숲속방', code: 'ABC123', cap: 8 };
  ui._bindExitConfirm();

  send(plazaBtn, 'click', { detail: 1 });
  assert.equal(plazaBtn.textContent, '정말 광장으로 나갈까요?');
  assert.deepEqual(events, []);
  send(plazaBtn, 'click', { detail: 1 });
  assert.deepEqual(events, [['toPlaza']]);
  assert.equal(plazaBtn.textContent, '🎟 광장으로 나가기');
  events.length = 0;

  send(roomLeave, 'click', { detail: 1 });
  assert.equal(roomLeave.textContent, '정말 방을 나갈까요?');
  assert.deepEqual(events, []);
  send(roomLeave, 'click', { detail: 1 });
  assert.deepEqual(events, [['leaveRoom']]);
  assert.equal(roomLeave.textContent, '방 나가기');
});

test('createViewer restores prior seat on KeyE unfocusKey and hides desktop prompt once mouse is used after sitting', (t) => {
  const { ui, make } = fixture(t);
  ui.emit = function emit(name, ...args) { if (this.handlers[name]) this.handlers[name](...args); };
  make('prompt');
  make('promptText');
  make('sitBtn', 'BUTTON');
  make('focusChip');
  make('focusName');
  make('focusSolo', 'BUTTON');
  make('lookHint');
  make('toast');
  make('tooltip');
  const domElement = make('canvas', 'CANVAS');

  let dHandler = null;
  const director = {
    mode: 'walk',
    seat: null,
    nearSeat: null,
    occupied: new Set(),
    returnTo: {},
    pos: { z: 0 },
    keys: new Set(),
    vel: { set() {} },
    on(fn) { dHandler = fn; },
    setMode(m) { this.mode = m; this.seat = null; dHandler?.('mode', m); },
    sitAt(s) { this.seat = s; this.mode = 'seat'; dHandler?.('mode', 'seat'); dHandler?.('seat', s); },
    focusConductor() { this.seat = { label: '지휘대', index: -1 }; this.mode = 'seat'; dHandler?.('mode', 'seat'); dHandler?.('seat', this.seat); },
    focusPlayer() {},
    toggleSit() {},
    releaseLock() {},
  };
  const S = { focused: null, concertStarted: true, muted: false };
  const viewer = createViewer({
    S,
    isTouch: false,
    settings: { volume: 0.8 },
    ui,
    engine: { setFocus() {}, setVolume() {} },
    camera: new THREE.PerspectiveCamera(),
    renderer: { domElement },
    orchestra: { conductor: { char: { root: { visible: true }, spec: { name: '부엉 선생' } } }, players: [], pickables: [] },
    hall: { seats: [], seatMesh: new THREE.Group() },
    recital: { on: false, seats: [] },
    director,
    PIANIST: { char: { spec: { name: '피아니스트' } } },
  });
  t.after(() => viewer.dispose());

  const seat42 = { index: 42, label: '1층 A열 1번' };
  // 1) Before sitting once, nearSeat shows desktop prompt even with mouse activity
  director.nearSeat = seat42;
  dHandler('nearSeat', seat42);
  assert.equal(document.getElementById('prompt').hidden, false);

  // 2) Sit in seat 42 -> focus conductor -> KeyE emits unfocusKey -> restores seat 42 (not walk!)
  director.sitAt(seat42);
  ui.emit('focusSection', 'conductor');
  assert.equal(S.focused, 'conductor');
  assert.equal(director.seat.index, -1);
  dHandler('unfocusKey');
  assert.equal(S.focused, null);
  assert.equal(director.mode, 'seat');
  assert.equal(director.seat, seat42);

  // 3) Stand up and walk with WASD before any mouse look: keyboard-only user still gets prompt
  director.setMode('walk');
  director.nearSeat = seat42;
  dHandler('keyMove', 'KeyW');
  assert.equal(document.getElementById('prompt').hidden, false, 'keyboard-only explorer sees seat prompt');

  // 4) Once mouse look / pointermove occurs after first sit, aisle WASD walking no longer blinks #prompt
  send(domElement, 'pointermove', { pointerType: 'mouse', clientX: 100, clientY: 100, buttons: 0 });
  assert.equal(document.getElementById('prompt').hidden, true, 'mouse+WASD desktop user hides seat prompt after first sit');
  dHandler('keyMove', 'KeyW');
  dHandler('nearSeat', seat42);
  assert.equal(document.getElementById('prompt').hidden, true);
});
