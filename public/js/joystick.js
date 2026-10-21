// A thumb stick for touch screens. It rests low on the left, where a left
// thumb falls; touch anywhere in that corner of the screen and it comes to
// your thumb, follows it, and glides home when you let go. Translucent, so
// the hall shows through it.
//   base, knob: the stick; zone: the corner that calls it
// Returns { x, y } (-1..1, y down), read every frame.
export function thumbStick({ base, knob, zone, radius = 46 }) {
  const out = { x: 0, y: 0, active: false };
  let id = null;
  let cx = 0;
  let cy = 0;
  let rest = null; // the stick's resting centre on screen

  const start = (e) => {
    if (id !== null) return;
    id = e.pointerId;
    if (!rest) {
      // (offsets ignore the transform: right even while it is gliding home)
      rest = { x: base.offsetLeft + base.offsetWidth / 2, y: base.offsetTop + base.offsetHeight / 2, half: base.offsetWidth / 2 };
    }
    // under the thumb (kept wholly on the screen)
    cx = Math.min(window.innerWidth - rest.half - 4, Math.max(rest.half + 4, e.clientX));
    cy = Math.min(window.innerHeight - rest.half - 4, Math.max(rest.half + 4, e.clientY));
    base.classList.add('active');
    base.style.transform = `translate(${cx - rest.x}px, ${cy - rest.y}px)`;
    e.currentTarget.setPointerCapture(id);
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
    out.x = dx / radius;
    out.y = dy / radius;
  };
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    out.active = false;
    out.x = 0;
    out.y = 0;
    knob.style.transform = '';
    base.classList.remove('active');
    base.style.transform = ''; // glides home (see .joystick's transition)
  };
  for (const el of [zone, base]) {
    if (!el) continue;
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  // the screen turned or resized: measure the resting place again
  window.addEventListener('resize', () => { rest = null; });
  return out;
}
