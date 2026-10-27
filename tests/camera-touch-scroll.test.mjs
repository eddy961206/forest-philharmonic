import assert from 'node:assert/strict';
import test from 'node:test';
import { Director } from '../public/js/scene/director.js';

function send(target, type, props = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event;
}

test('camera touch drag consumes page scrolling while preserving downward look', t => {
  for (const key of ['document', 'window']) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value: new EventTarget() });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  const dom = new EventTarget();
  dom.setPointerCapture = () => {};
  const looks = [];
  const emitted = [];
  const director = { dom, active: true, locked: false, lookEnabled: true, fov: 64,
    _look: (...args) => looks.push(args), _emit: (...args) => emitted.push(args) };
  Director.prototype._bindInput.call(director);
  const touch = { pointerId: 1, pointerType: 'touch', clientX: 220, clientY: 120 };
  assert.equal(send(dom, 'pointerdown', touch).defaultPrevented, true);
  assert.equal(send(dom, 'touchmove').defaultPrevented, true);
  send(dom, 'pointermove', { ...touch, clientY: 180 });
  send(dom, 'pointerup', { ...touch, clientY: 180 });
  assert.deepEqual(looks, [[0, 60, 0.0042]]);
  assert.deepEqual(emitted, [], 'drag does not become a tap or fullscreen action');
  assert.equal(send(document, 'touchmove').defaultPrevented, false, 'panel/document scrolling is not intercepted');
  director.active = false;
  assert.equal(send(dom, 'touchmove').defaultPrevented, false);
});
