import assert from 'node:assert/strict';
import test from 'node:test';
import { tapButton, thumbStick } from '../public/js/joystick.js';
import { UI } from '../public/js/ui.js';

// Small event surfaces keep these input regressions independent of WebGL and
// browser rendering. The actual layouts and browser focus are checked separately.
class Element extends EventTarget {
  constructor(id, document) {
    super();
    Object.assign(this, { id, document, hidden: false, inert: false, disabled: false, isConnected: true, children: [], style: {}, attributes: new Map() });
    this.classList = { add() {}, remove() {} };
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: 112, bottom: 44, width: 112, height: 44 }; }
  getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
  setPointerCapture(id) { this.captured = id; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
  closest() { return this.hidden || this.inert || this.parent?.closest() ? this : null; }
  querySelectorAll() { return this.children; }
  focus() { this.document.activeElement = this; }
}

function fixture(t) {
  const document = new EventTarget();
  document.hidden = false;
  const window = new EventTarget();
  Object.assign(window, { innerWidth: 390, innerHeight: 844 });
  const elements = new Map();
  const make = (id) => { const el = new Element(id, document); elements.set(id, el); return el; };
  document.body = make('body');
  document.activeElement = document.body;
  document.getElementById = (id) => elements.get(id);
  document.querySelectorAll = () => [];
  for (const [key, value] of Object.entries({ document, window })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (old) Object.defineProperty(globalThis, key, old); else delete globalThis[key]; });
  }
  const events = [];
  const ui = Object.assign(Object.create(UI.prototype), { joy: {}, duration: 200, handlers: {}, emit: (...args) => events.push(args) });
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
