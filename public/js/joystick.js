// A thumb stick for touch screens. It rests low on the left, where a left
// thumb falls; touch anywhere in that corner of the screen and it comes to
// your thumb, follows it, and glides home when you let go. Translucent, so
// the hall shows through it.
//   base, knob: the stick; zone: the corner that calls it
// Returns { x, y } (-1..1, y down), read every frame.
//
// tapButton: the buttons beside it. A finger's tap presses one on its lift:
// the browser makes no click of a tap while another finger is down (the
// left thumb on the stick). The mouse and the keyboard keep the plain click
// (and the click that follows a lone finger's tap is not counted twice).
export function tapButton(el, fn, { onDown = false } = {}) {
  if (!el) return;
  let finger = null;
  let tapped = -Infinity;
  const fire = (e) => { tapped = performance.now(); fn(e); };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || el.disabled || finger !== null) return;
    finger = e.pointerId;
    // Opening a card on pointerup changes what is under the finger. Suppress
    // compatibility mousedown so it cannot blur the card's newly focused control.
    e.preventDefault();
    if (onDown) fire(e);
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== finger) return;
    finger = null;
    if (onDown || el.disabled) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    fire(e);
  });
  const cancel = (e) => { if (e.pointerId === finger) finger = null; };
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('lostpointercapture', cancel);
  el.addEventListener('click', (e) => {
    // Only the compatibility click from a pointer is a duplicate. Keyboard
    // and assistive-technology clicks (detail=0) must still work immediately.
    if (!el.disabled && (e.detail === 0 || performance.now() - tapped >= 800)) fn(e);
  });
}

export function thumbStick({ base, knob, zone, radius = 46 }) {
  const out = { x: 0, y: 0, active: false };
  let id = null;
  let cx = 0;
  let cy = 0;
  let rest = null; // the stick's resting centre on screen

  const start = (e) => {
    if (id !== null) return;
    id = e.pointerId;
    // A wrapped dock can move the resting place without a window resize.
    // Offsets ignore the transform, including a still-running glide home.
    rest = { x: base.offsetLeft + base.offsetWidth / 2, y: base.offsetTop + base.offsetHeight / 2, half: base.offsetWidth / 2 };
    // under the thumb (kept wholly on the screen)
    cx = Math.min(window.innerWidth - rest.half - 4, Math.max(rest.half + 4, e.clientX));
    cy = Math.min(window.innerHeight - rest.half - 4, Math.max(rest.half + 4, e.clientY));
    base.classList.add('active');
    base.style.transform = `translate(${cx - rest.x}px, ${cy - rest.y}px)`;
    try { e.currentTarget.setPointerCapture(id); } catch { /* a pointer already gone */ }
    out.active = true;
    e.preventDefault();
    move(e);
  };
  const move = (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > radius) { dx *= radius / d; dy *= radius / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // (a resting thumb trembles: the first few pixels are no movement)
    const k = d < 6 ? 0 : 1;
    out.x = (dx / radius) * k;
    out.y = (dy / radius) * k;
  };
  const reset = () => {
    id = null;
    out.active = false;
    out.x = 0;
    out.y = 0;
    knob.style.transform = '';
    base.classList.remove('active');
    base.style.transform = ''; // glides home (see .joystick's transition)
  };
  const end = (e) => { if (e.pointerId === id) reset(); };
  out.reset = reset;
  for (const el of [zone, base]) {
    if (!el) continue;
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end); // (taken away without a pointerup)
  }
  // the screen turned or resized: measure the resting place again
  window.addEventListener('resize', () => {
    rest = null;
    if (id === null) return;
    // (turned while held: the stick stays wholly on the new screen)
    rest = { x: base.offsetLeft + base.offsetWidth / 2, y: base.offsetTop + base.offsetHeight / 2, half: base.offsetWidth / 2 };
    cx = Math.min(window.innerWidth - rest.half - 4, Math.max(rest.half + 4, cx));
    cy = Math.min(window.innerHeight - rest.half - 4, Math.max(rest.half + 4, cy));
    base.style.transform = `translate(${cx - rest.x}px, ${cy - rest.y}px)`;
  });
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  return out;
}
