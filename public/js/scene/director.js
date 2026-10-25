// First-person presence: you arrive in the foyer, walk into the hall or up
// the spiral stairs to the balconies, find a seat and sit down - or wander
// onto the stage. The mouse looks around like a first-person game (pointer
// lock); dragging still works when the cursor is free. Zoom works like opera
// glasses. An optional auto-director films the concert for you.
import * as THREE from 'three';
import { stepTo, surfacesAt, floorAt, LEVELS, groundBelow, headroomAt, barrierTop, ENTRY, HALL, insideShell } from './hallplan.js';
import { SECTIONS, PODIUM, STAGE_Y } from '../layout.js';
import { CinemaProgram } from './cinema-program.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const STAGE_FOCUS = V(0, STAGE_Y + 1.1, -4.6);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const ENTRANCE = { pos: V(ENTRY.pos.x, ENTRY.pos.y, ENTRY.pos.z), look: V(ENTRY.look.x, ENTRY.look.y, ENTRY.look.z) };
const EYE = 1.62;
const BODY = 0.24; // keep this far from walls and railings
// and never closer than this to a wall on any side: the camera's near plane
// would cut into it and show what is behind
const WALL_R = 0.2;
const RING = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
const GRAVITY = 9.8;
const JUMP_SPEED = 4.7; // about 1.1 m: enough to swing over a railing

export class Director {
  constructor(camera, dom, hall) {
    this.camera = camera;
    this.dom = dom;
    this.hall = hall;
    this.mode = 'walk'; // walk | seat | cinema
    this.yaw = 0;
    this.pitch = 0;
    this.fov = 64;
    this.targetFov = 64;
    this.feet = ENTRANCE.pos.y;
    this.pos = ENTRANCE.pos.clone().add(V(0, EYE, 0));
    this.vel = V();
    this.keys = new Set();
    this.joy = { x: 0, y: 0 }; // virtual joystick (-1..1)
    this.stick = null; // the finger on the thumb stick, if any (see ui.js stickTouch)
    this.anim = null;
    this.seat = null;
    this.nearSeat = null;
    this.listeners = new Set();
    this.cine = { shot: null, until: 0 };
    this.occupied = new Set();
    this.locked = false;
    this.lookEnabled = true;
    this.hoverLook = true; // first-person mouse look (setting)
    this.lockFailed = false; // the browser refused to capture the mouse
    this.userReleased = false; // Esc was pressed: leave the cursor free
    this.active = false; // set once we are inside the hall
    this.mouse = { x: 0, y: 0, inside: false, inUi: false };
    // top edge (px) of the controls at the bottom of the screen; below it the
    // cursor shows and the view holds still so the buttons can be clicked
    this.uiTop = () => Infinity;
    this.stepPhase = 0;
    this.vy = 0;
    this.grounded = true;
    this.landDip = 0;
    this._bindInput();
    const la = this.lookAt(ENTRANCE.look, this.pos);
    this.yaw = la.yaw;
    this.pitch = la.pitch;
  }

  on(fn) { this.listeners.add(fn); }
  _emit(type, data) { for (const f of this.listeners) f(type, data); }

  placeAt(feet, look) {
    this.feet = feet.y;
    this.vy = 0;
    this.grounded = true;
    this.pos.set(feet.x, feet.y + EYE, feet.z);
    const la = this.lookAt(look, this.pos);
    this.yaw = la.yaw;
    this.pitch = la.pitch;
    this.anim = null;
    this.vel.set(0, 0, 0);
  }

  // ------------------------------------------------------------ modes
  setMode(mode) {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    if (mode === 'walk') {
      if (prev === 'seat' && this.seat) this._standUp();
      this.seat = null;
      this.targetFov = 64;
    }
    if (mode === 'cinema') {
      this.cine.until = 0;
      this.cine.shot = null;
      this.returnTo = { pos: this.pos.clone(), yaw: this.yaw, pitch: this.pitch, seat: prev === 'seat' ? this.seat : null, feet: this.feet };
    }
    if (prev === 'cinema' && mode !== 'cinema' && this.returnTo) {
      // come back to where you were watching from (walking off from a seat:
      // to the legroom in front of it, not into the seat itself)
      const r = this.returnTo;
      let to = r.pos;
      let feet = r.feet;
      if (mode === 'walk' && r.seat && r.seat.index >= 0) {
        const s = this._freeSpotNear(r.seat);
        to = V(s.x, s.y + EYE, s.z);
        feet = s.y;
      }
      // (from far away - the stage, the dome - a cut: a straight flight
      // there would pass through walls and floors)
      const far = this.pos.distanceTo(to) > 8;
      this.flyTo(to, to.clone().add(V(-Math.sin(r.yaw) * Math.cos(r.pitch), Math.sin(r.pitch), -Math.cos(r.yaw) * Math.cos(r.pitch))), far ? 0.001 : 1.6, mode === 'seat' ? 50 : 64);
      this.anim.home = true;
      this.feet = feet;
      this.vy = 0;
      this.grounded = true;
      if (r.seat && mode === 'seat') this.seat = r.seat;
    }
    this._emit('mode', mode);
  }

  lookAt(target, from = this.pos) {
    const d = new THREE.Vector3().subVectors(target, from).normalize();
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(clamp(d.y, -1, 1)) };
  }

  flyTo(pos, look, dur = 2.2, fov = null) {
    const { yaw, pitch } = this.lookAt(look, pos);
    let y0 = this.yaw;
    while (yaw - y0 > Math.PI) y0 += Math.PI * 2;
    while (yaw - y0 < -Math.PI) y0 -= Math.PI * 2;
    this.anim = { p0: this.pos.clone(), p1: pos.clone(), y0, y1: yaw, q0: this.pitch, q1: pitch, t: 0, dur, fov0: this.targetFov, fov1: fov ?? this.targetFov, lift: dur > 1.5 };
  }

  // sit in a seat: lower yourself into it, facing the stage
  sitAt(seat, dur = 1.1) {
    if (!seat) return;
    this.seat = seat;
    this.mode = 'seat';
    const fwd = V(-Math.sin(seat.yaw), 0, -Math.cos(seat.yaw));
    const eye = V(seat.x, seat.y + 1.2, seat.z).addScaledVector(fwd, -0.02);
    this.feet = seat.y;
    const near = this.pos.distanceTo(eye) < 3.5;
    // (a seat may know what it is for: the keys, from a chair on the stage)
    const look = seat.look ? V(seat.look.x, seat.look.y, seat.look.z) : near ? eye.clone().addScaledVector(fwd, 10).setY(STAGE_FOCUS.y + (eye.y - STAGE_FOCUS.y) * 0.5) : STAGE_FOCUS;
    // (from far off - the foyer, another level - straight there: a flight
    // would pass through the walls and floors in between)
    const far = this.pos.distanceTo(eye) > 12;
    this.flyTo(eye, look, near ? dur : far ? 0.001 : 2.4, 50);
    this.anim.home = true; // (the way into the seat is not cut short by a look)
    if (near) this.anim.lift = false;
    this._emit('mode', 'seat');
    this._emit('seat', seat);
  }

  _standUp() {
    const s = this.seat;
    if (!s || s.index < 0) {
      // from beside a musician: find the floor under us
      this._settle();
      return;
    }
    // step out into the legroom in front of the seat (in a row, the middle
    // of the gap to the row ahead), or the nearest free spot around it
    const spot = this._freeSpotNear(s);
    this.feet = spot.y;
    this.vy = 0;
    this.grounded = true;
    this.pos.set(spot.x, this.feet + EYE, spot.z);
    this.anim = null;
  }

  _freeSpotNear(s) {
    const tries = [];
    if (s.rowSlope !== undefined) {
      const l = Math.hypot(s.rowSlope, 1);
      tries.push([s.rowSlope / l, -1 / l, 0.42]);
    }
    const f = [-Math.sin(s.yaw), -Math.cos(s.yaw)];
    const r = [Math.cos(s.yaw), -Math.sin(s.yaw)];
    for (const [d, k] of [[f, 0.5], [f, 0.7], [r, 0.6], [[-r[0], -r[1]], 0.6], [f, 0.95], [[-f[0], -f[1]], 0.75]]) tries.push([d[0], d[1], k]);
    const feet0 = this.feet;
    for (const [dx, dz, k] of tries) {
      const x = s.x + dx * k;
      const z = s.z + dz * k;
      const h = stepTo(x, z, s.y, { up: 0.6, down: 0.6 });
      if (h === null) continue;
      this.feet = h;
      const clear = !this._seatAt(x, z) && barrierTop(x, z, h) === null;
      this.feet = feet0;
      if (clear) return { x, y: h, z };
    }
    return { x: s.x, y: s.y, z: s.z };
  }

  // land on the nearest floor below the eye (after flying around)
  _settle() {
    const list = surfacesAt(this.pos.x, this.pos.z);
    let best = null;
    for (const h of list) if (h <= this.pos.y - 0.5 && (best === null || h > best)) best = h;
    if (best === null) {
      // nowhere to stand here: go back to the foyer
      this.placeAt(ENTRANCE.pos, ENTRANCE.look);
      return;
    }
    this.feet = best;
    this.vy = 0;
    this.grounded = true;
    this.pos.y = best + EYE;
    this.anim = null;
  }

  jump() {
    if (this.mode !== 'walk' || !this.grounded || this.anim) return false;
    this.vy = JUMP_SPEED;
    this.grounded = false;
    return true;
  }

  toggleSit() {
    if (this.mode === 'seat') { this.setMode('walk'); return true; }
    if (this.nearSeat) { this.sitAt(this.nearSeat); return true; }
    return false;
  }

  // stand next to a musician and listen
  focusPlayer(player) {
    if (!player) return;
    const root = player.char.root;
    const c = root.position.clone();
    const fwd = V(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = V(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const head = c.clone().add(V(0, 1.15 * player.char.scale, 0));
    // a little above and to the side of the music stand, looking down
    // between the face and the instrument (not straight into the stand)
    const pos = head.clone().addScaledVector(fwd, 1.8).addScaledVector(right, -0.7).add(V(0, 0.5, 0));
    const look = c.clone().add(V(0, 0.8 * player.char.scale, 0));
    this.seat = { label: `${SECTIONS[player.sid].ko} · ${player.char.spec.name} 곁`, index: -1 };
    this.mode = 'seat';
    this.flyTo(pos, look, 2.0, 45);
    this.anim.home = true; // (a nudge of the mouse on the way does not leave you mid-air)
    this._emit('mode', 'seat');
    this._emit('seat', this.seat);
  }

  zoom(delta) {
    this.targetFov = clamp(this.targetFov * Math.exp(delta * 0.0012), 8, 75);
  }

  // ------------------------------------------------------------ input
  requestLock() {
    if (this.locked || !this.dom.requestPointerLock) return;
    // raw mouse input where the platform offers it, plain pointer lock
    // otherwise; embedded views may refuse both (dragging still works)
    const plain = () => {
      try {
        const q = this.dom.requestPointerLock();
        if (q && q.catch) q.catch(() => { this.lockFailed = true; });
      } catch { this.lockFailed = true; }
    };
    try {
      const p = this.dom.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch((e) => {
          if (e?.name === 'NotSupportedError') plain();
          else this.lockFailed = true;
        });
      }
    } catch { plain(); }
  }

  releaseLock() {
    this.userReleased = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // hover look runs only when nothing else is steering the camera
  // Aim mode: the mouse is over the hall without being captured. The cursor
  // is hidden and a dot marks the centre - the view turns with the mouse
  // exactly like a captured first-person view, so the aim always sits at the
  // centre. Over the controls the normal cursor comes back.
  get aiming() {
    return this.hoverLook && this.active && this.lookEnabled && !this.locked && this.mouse.inside && !this.mouse.inUi && this.mode !== 'cinema';
  }

  _hoverActive() {
    return this.aiming && this.lookEnabled && !this.anim && document.visibilityState === 'visible';
  }

  _look(dx, dy, k) {
    if (!this._looked) { this._looked = true; this._emit('looked'); }
    // out of the auto-director: first back home (the flight there is not
    // cut short by the same drag), then the drag turns the view again
    if (this.mode === 'cinema') { this.setMode(this.returnTo?.seat ? 'seat' : 'walk'); return; }
    if (this.anim?.home) return;
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k, -1.4, 1.4);
    if (this.anim && !this.anim.sitting) this.anim = null;
  }

  _bindInput() {
    const el = this.dom;
    // Confine browser-scroll cancellation to the camera surface. Panels and
    // programme lists keep their own scrolling. Native OS exit gestures remain
    // under the browser's control, even when a touch event is cancelled here.
    el.addEventListener('touchmove', (e) => {
      if (this.active && e.cancelable) e.preventDefault();
    }, { passive: false });
    const pointers = new Map();
    let pinch0 = 0;
    let moved = 0;
    let lookPointer = null;
    let multi = false; // more than one finger down since the last time none was
    let lastTap = { t: 0, x: 0, y: 0 };
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === el;
      if (this.locked) { this.lockFailed = false; this.userReleased = false; }
      else if (was) this.userReleased = true; // Esc (or the browser) let it go
      this._emit('lock', this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.lookEnabled) return;
      const k = (this.fov / 64) * 0.0021;
      this._look(e.movementX, e.movementY, k);
    });
    // Hover look: without any click the view follows the mouse while the
    // cursor is over the hall (not over the controls). Keeps the cursor free
    // for the buttons; holding it at the left/right edge keeps turning.
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.locked) return;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
      this.mouse.inUi = e.clientY > this.uiTop() - 28;
      if (!this._hoverActive()) return;
      const mx = Math.max(-80, Math.min(80, e.movementX || 0));
      const my = Math.max(-80, Math.min(80, e.movementY || 0));
      this._look(mx, my, (this.fov / 64) * 0.0032);
    });
    el.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    window.addEventListener('blur', () => { this.mouse.inside = false; });
    el.addEventListener('pointerdown', (e) => {
      if (this.locked) return;
      if (e.pointerType === 'touch' && e.cancelable) e.preventDefault();
      // a pinch whose first finger landed in the thumb stick's corner: that
      // finger (just down, hardly moved) is taken back from the stick, and
      // the two zoom - rather than one walking and the other turning
      const s = this.stick;
      if (e.pointerType === 'touch' && !pointers.size && s && s.id !== null && performance.now() - s.t < 220 && s.moved < 12) {
        const id = s.id;
        s.release();
        pointers.set(id, { x: s.x, y: s.y, type: 'touch', moved: 0, adopted: true });
        lookPointer = id;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, moved: 0 });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      }
      // two fingers at once are a pinch (or a drag and a tap): none of them
      // is a tap, and no tap before it can make a double tap with what follows
      if (pointers.size > 1) { multi = true; lastTap.t = 0; }
      if (lookPointer === null) lookPointer = e.pointerId;
      moved = 0;
      // (a second click while the mouse is being captured cannot be held)
      try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    });
    const onMove = (e) => {
      if (this.locked) return;
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) this.targetFov = clamp(this.targetFov * (pinch0 / d), 8, 75);
        pinch0 = d;
        return;
      }
      if (e.pointerId !== lookPointer || !this.lookEnabled) return;
      // drag to look: pull right and you turn right, like holding the
      // camera (the same direction as the captured mouse)
      this._look(dx, dy, (this.fov / 64) * 0.0042);
    };
    el.addEventListener('pointermove', onMove);
    const up = (e) => {
      const p = pointers.get(e.pointerId);
      // (a tap: this finger stayed put, alone, and was lifted - not cancelled)
      if (p && p.type === 'touch' && e.type === 'pointerup' && p.moved < 10 && pointers.size === 1 && !multi) {
        const now = performance.now();
        if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
          this._emit('pick', { x: e.clientX, y: e.clientY });
          lastTap.t = 0;
        } else lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      if (p && p.type === 'mouse' && moved < 5 && !this.locked) this._emit('clickView', { x: e.clientX, y: e.clientY });
      pointers.delete(e.pointerId);
      // the finger that stays after a pinch keeps turning the view
      if (e.pointerId === lookPointer) lookPointer = pointers.size ? pointers.keys().next().value : null;
      if (pointers.size < 2) pinch0 = 0;
      if (!pointers.size) multi = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    // (the finger taken from the stick still moves over the stick's corner)
    window.addEventListener('pointermove', (e) => { if (pointers.get(e.pointerId)?.adopted) onMove(e); });
    for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, (e) => { if (pointers.get(e.pointerId)?.adopted) up(e); });
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY); }, { passive: false });
    el.addEventListener('dblclick', (e) => {
      if (e.sourceCapabilities?.firesTouchEvents) return;
      // with the crosshair showing, you pick what it rests on
      if (this.locked || this.aiming) this._emit('pick', { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      else this._emit('pick', { x: e.clientX, y: e.clientY });
    });
    // while the pointer is locked a click picks what is under the crosshair
    el.addEventListener('click', () => {
      if (!this.locked) return;
      const now = performance.now();
      if (now - (this._lastLockClick || 0) < 320) this._emit('pick', { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      this._lastLockClick = now;
    });
    const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.getAttribute?.('role') === 'slider') return;
      if (e.code === 'KeyR' && !e.repeat) { this.targetFov = this.mode === 'walk' ? 64 : 50; return; }
      if (e.code === 'KeyE' && !e.repeat) { if (this.toggleSit()) e.preventDefault(); return; }
      // (Space on a focused button presses the button, as everywhere else)
      if (e.code === 'Space' && !t.closest?.('button, [role=button], a, summary')) { e.preventDefault(); if (!e.repeat) this.jump(); return; }
      // (only the mouse comes back: an open panel stays open - see ui.js)
      if (e.code === 'Escape' && this.locked) { e.preventDefault(); this.releaseLock(); return; }
      if (MOVE.has(e.code)) {
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown'].includes(e.code) && this.mode !== 'walk') this.setMode('walk');
        this.keys.add(e.code);
        if (e.code.startsWith('Arrow')) e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.key === 'Meta') this.keys.clear(); });
    window.addEventListener('blur', () => this.keys.clear());
  }

  // ------------------------------------------------------------ update
  update(dt, ctx) {
    const cam = this.camera;
    if (this.mode === 'cinema') this._cinema(dt, ctx);
    // show / hide the crosshair and the cursor as aim mode comes and goes
    const aim = this.aiming;
    if (aim !== this._aimShown) {
      this._aimShown = aim;
      this.dom.style.cursor = aim ? 'none' : '';
      this._emit('aim', aim);
    }
    // cursor resting at the left / right edge: keep turning that way
    if (this._hoverActive()) {
      const w = window.innerWidth;
      const edge = Math.min(70, w * 0.05);
      const x = this.mouse.x;
      let turn = 0;
      if (x < edge) turn = 1 - x / edge;
      else if (x > w - edge) turn = -(1 - (w - x) / edge);
      this.yaw += turn * dt * 1.7;
    }

    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const x = ease(Math.min(1, a.t / a.dur));
      this.pos.lerpVectors(a.p0, a.p1, x);
      if (a.lift) {
        const base = this.pos.y;
        this.pos.y += Math.sin(x * Math.PI) * Math.min(2.5, a.p0.distanceTo(a.p1) * 0.12);
        // (the arc never rises into the slab above: a balcony's ceiling)
        const ceil = headroomAt(this.pos.x, this.pos.z, base - EYE) - 0.15;
        if (this.pos.y > ceil) this.pos.y = Math.max(base, ceil);
      }
      this.yaw = a.y0 + (a.y1 - a.y0) * x;
      this.pitch = a.q0 + (a.q1 - a.q0) * x;
      this.targetFov = a.fov0 + (a.fov1 - a.fov0) * x;
      if (a.t >= a.dur) {
        this.anim = null;
        if (a.after) a.after();
      }
    }

    // the thumb stick does what W does: up out of a seat, out of the
    // auto-director's view
    const push = Math.hypot(this.joy.x, this.joy.y);
    if (push > 0.6 && ((this.mode === 'seat' && !this.anim) || this.mode === 'cinema')) this.setMode('walk');

    if (this.mode === 'walk' && !this.anim) {
      // (touch: the stick held at its rim for a moment breaks into a run)
      this._rimT = push > 0.92 ? (this._rimT || 0) + dt : 0;
      const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this._rimT > 1.2;
      const speed = run ? 4.2 : 2.0;
      const fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const mv = V();
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mv.add(fwd);
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mv.sub(fwd);
      if (this.keys.has('KeyD')) mv.add(right);
      if (this.keys.has('KeyA')) mv.sub(right);
      if (this.keys.has('ArrowLeft')) this.yaw += dt * 1.8;
      if (this.keys.has('ArrowRight')) this.yaw -= dt * 1.8;
      mv.addScaledVector(fwd, -this.joy.y).addScaledVector(right, this.joy.x);
      if (mv.lengthSq() > 1) mv.normalize();
      mv.multiplyScalar(speed);
      this.vel.lerp(mv, 1 - Math.exp(-dt * 10));
      const px = this.pos.x;
      const pz = this.pos.z;
      this._move(this.vel.x * dt, this.vel.z * dt);
      // a safety net: trying to walk but not moving at all for a while means
      // a nook nobody can walk out of - step out to open floor
      if (mv.lengthSq() > 0.25 && this.grounded && Math.hypot(this.pos.x - px, this.pos.z - pz) < 1e-3) {
        this._stuckT = (this._stuckT || 0) + dt;
        // (pushing into a wall is not stuck: any other way still opens)
        if (this._stuckT > 0.4) { this._stuckT = 0; if (!this._canStep()) this._unstick(); }
      } else this._stuckT = 0;
      // ... and walking for a while without getting anywhere: a small closed
      // pocket (quick look round with big steps first)
      if (mv.lengthSq() > 0.25 && this.grounded) {
        const w = (this._wiggle ||= { x: this.pos.x, z: this.pos.z, t: 0 });
        if (Math.hypot(this.pos.x - w.x, this.pos.z - w.z) > 0.6) { w.x = this.pos.x; w.z = this.pos.z; w.t = 0; } else w.t += dt;
        if (w.t > 1.2) {
          w.t = 0;
          if (this._enclosed(this.pos.x, this.pos.z, this.feet, 80, 0.25, 1.0)) this._unstick();
        }
      } else if (this._wiggle) this._wiggle.t = 0;
      this._fall(dt);
      // eyes follow the feet; stairs feel like steps, not a ramp; in the
      // air they follow exactly, and a landing gives a little dip
      this.landDip *= Math.exp(-dt * 7);
      if (this.grounded) this.pos.y += (this.feet + EYE - this.landDip - this.pos.y) * (1 - Math.exp(-dt * 14));
      else this.pos.y = this.feet + EYE;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      this.stepPhase += dt * sp * 3.4;
      const bob = Math.sin(this.stepPhase * 2) * 0.016 * Math.min(1, sp / 2);
      cam.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
      this._findSeat();
    } else {
      cam.position.copy(this.pos);
      if (this.nearSeat) { this.nearSeat = null; this._emit('nearSeat', null); }
    }
    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this._applyFov(dt);
  }

  // how far the nearest wall is (up to WALL_R) in each of eight directions
  _wallDists(x, z, up) {
    const d = [];
    const blocked = (r, ox, oz) => {
      const px = x + ox * r;
      const pz = z + oz * r;
      const g = groundBelow(px, pz, this.feet, up);
      if (g === undefined || g === null) return true;
      // a barrier taller than us is a wall too (a rail is not)
      const b = barrierTop(px, pz, this.feet);
      return b !== null && b - this.feet > 2.0;
    };
    for (const [ox, oz] of RING) {
      // (most places have no wall within reach: one probe; else find how near)
      let w = Infinity;
      if (blocked(WALL_R, ox, oz)) {
        w = WALL_R;
        for (const r of [0.05, 0.1, 0.15]) if (blocked(r, ox, oz)) { w = r; break; }
      }
      d.push(w);
    }
    return d;
  }

  // try the move, then slide along whatever stopped us
  // Walk: step up stairs, stop at walls and railings, and walk off any
  // edge without one - then gravity takes over (see _fall).
  _move(dx, dz) {
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    const up = this.grounded ? 0.45 : 0.08;
    const ok = (x, z, ring = true) => {
      const g = groundBelow(x, z, this.feet, up);
      if (g === undefined || g === null) return false; // a wall, or the face of a higher floor
      if (barrierTop(x, z, this.feet) !== null) return false; // a railing
      if (this._seatAt(x, z)) return false; // a seat (squeeze along the row instead)
      if (!(headroomAt(x, z, this.feet) > this.feet + 1.75)) return false; // no slab at head height
      // never closer to a wall than WALL_R - or, if already closer (after a
      // fall), no closer than we are: stepping away is always allowed
      if (!ring) return true;
      const near = this._wallDists(x, z, up);
      for (let k = 0; k < 8; k++) if (near[k] < Math.min(WALL_R, here[k]) - 1e-3) return false;
      return true;
    };
    const here = this._wallDists(this.pos.x, this.pos.z, up);
    const tryAt = (mx, mz) => {
      const l = Math.hypot(mx, mz);
      if (l < 1e-6) return false;
      const nx = this.pos.x + mx;
      const nz = this.pos.z + mz;
      // probe a body-width ahead so we stop short of walls and railings
      if (!ok(nx + (mx / l) * BODY, nz + (mz / l) * BODY, false) || !ok(nx, nz)) return false;
      this.pos.x = nx;
      this.pos.z = nz;
      if (this.grounded) {
        const g = groundBelow(nx, nz, this.feet, up);
        if (g >= this.feet - 0.5) this.feet = g; // a step up or down
        else { this.grounded = false; this.vy = 0; } // over the edge
      }
      return true;
    };
    if (tryAt(dx, dz)) return;
    if (tryAt(dx, 0)) { this.vel.z *= 0.5; return; }
    if (tryAt(0, dz)) { this.vel.x *= 0.5; return; }
    this.vel.multiplyScalar(0.3);
  }

  // Is (x, z) inside a seat at our level? Seats are solid; the legroom
  // between rows stays open for a sideways squeeze, and a jump clears them.
  _seatAt(x, z) {
    if (!this._seatGrid) {
      const g = new Map();
      for (const s of this.hall.seats) {
        const k = `${Math.floor(s.x)},${Math.floor(s.z)}`;
        if (!g.has(k)) g.set(k, []);
        // seats in a row are boxed along the row (they turn a little toward
        // the stage, but the legroom between rows follows the row)
        const a = s.rowSlope !== undefined ? -Math.atan(s.rowSlope) : s.yaw;
        g.get(k).push({ s, c: Math.cos(a), n: Math.sin(a), hw: s.type === 'premium' ? 0.32 : s.type === 'armchair' ? 0.28 : 0.27, back: Math.max(0.3, s.backLen ?? 0.3) });
      }
      this._seatGrid = g;
    }
    const R = 0.04; // the body, squeezing sideways
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        const list = this._seatGrid.get(`${i},${j}`);
        if (!list) continue;
        for (const q of list) {
          const s = q.s;
          if (s.off) continue; // (a recital's chairs, put away)
          if (this.feet < s.y - 0.5 || this.feet > s.y + 0.85) continue; // another level, or above it
          const dx = x - s.x;
          const dz = z - s.z;
          const lx = dx * q.c - dz * q.n;
          const lz = dx * q.n + dz * q.c;
          if (Math.abs(lx) < q.hw + R && lz > -0.22 - R && lz < q.back + R) return s; // cushion front .. back shell (or the riser behind)
        }
      }
    }
    return false;
  }

  _fall(dt) {
    if (this.grounded) return;
    const prev = this.feet;
    this.vy -= GRAVITY * dt;
    this.feet += this.vy * dt;
    if (this.vy > 0) {
      const ceil = headroomAt(this.pos.x, this.pos.z, prev);
      if (this.feet + 1.75 > ceil) { this.feet = Math.max(prev, ceil - 1.75); this.vy = 0; }
    }
    // (the same reach up as a step in the air, see _move: a floor we were
    // let onto is a floor we land on)
    const g = groundBelow(this.pos.x, this.pos.z, prev, 0.08);
    if (g === undefined || g === null) {
      // a safety net: no floor anywhere under us, and falling for over a
      // second (some ten metres) - back to the foyer, not falling forever
      if (this.vy < -14) this.placeAt(ENTRANCE.pos, ENTRANCE.look);
      return;
    }
    if (this.feet <= g) {
      this.landDip = Math.min(0.32, -this.vy * 0.035);
      this.feet = g;
      this.vy = 0;
      this.grounded = true;
      this.pos.y = this.feet + EYE;
      // a fall from high up can end where nobody could walk out
      if (prev - g > 0.4 || this._seatAt(this.pos.x, this.pos.z)) this._unstick();
    }
  }

  // Can a walker get out of here? Explore a little with the real step; a
  // closed nook (inside a seat, a corner between a seat, a rail and the row
  // behind) runs out of places long before the limit.
  _enclosed(x0, z0, f0, limit = 240, step = 0.15, reach = Infinity) {
    const save = { x: this.pos.x, y: this.pos.y, z: this.pos.z, feet: this.feet, g: this.grounded, vy: this.vy, vel: this.vel.clone() };
    const key = (x, z, f) => `${Math.round(x / 0.1)},${Math.round(z / 0.1)},${Math.round(f * 20)}`;
    const seen = new Set([key(x0, z0, f0)]);
    const q = [[x0, z0, f0]];
    let open = false;
    for (let i = 0; i < q.length && !open; i++) {
      const [x, z, f] = q[i];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        this.pos.set(x, f + EYE, z);
        this.feet = f;
        this.grounded = true;
        this.vy = 0;
        this._move(Math.cos(a) * step, Math.sin(a) * step);
        if (!this.grounded) { open = true; break; } // it can step off an edge
        if (Math.hypot(this.pos.x - x0, this.pos.z - z0) > reach) { open = true; break; }
        const kk = key(this.pos.x, this.pos.z, this.feet);
        if (seen.has(kk)) continue;
        seen.add(kk);
        q.push([this.pos.x, this.pos.z, this.feet]);
        if (q.length > limit) { open = true; break; }
      }
    }
    this.pos.set(save.x, save.y, save.z);
    this.feet = save.feet;
    this.grounded = save.g;
    this.vy = save.vy;
    this.vel.copy(save.vel);
    return !open;
  }

  // can we take a step in any direction from here?
  _canStep() {
    const save = { x: this.pos.x, y: this.pos.y, z: this.pos.z, feet: this.feet, g: this.grounded, vy: this.vy, vel: this.vel.clone() };
    let ok = false;
    for (let k = 0; k < 12 && !ok; k++) {
      const a = (k / 12) * Math.PI * 2;
      this.pos.set(save.x, save.y, save.z);
      this.feet = save.feet;
      this.grounded = true;
      this._move(Math.cos(a) * 0.1, Math.sin(a) * 0.1);
      ok = Math.hypot(this.pos.x - save.x, this.pos.z - save.z) > 0.005;
    }
    this.pos.set(save.x, save.y, save.z);
    this.feet = save.feet;
    this.grounded = save.g;
    this.vy = save.vy;
    this.vel.copy(save.vel);
    return ok;
  }

  // closed in after a fall: step out to the legroom of the nearest seat, or
  // the nearest open floor around
  _unstick() {
    const x0 = this.pos.x;
    const z0 = this.pos.z;
    const f0 = this.feet;
    if (!this._seatAt(x0, z0) && !this._enclosed(x0, z0, f0)) return;
    const cands = [];
    let best = null;
    let bd = 2.5;
    for (const s of this.hall.seats) {
      if (Math.abs(s.x - x0) > 2.5 || Math.abs(s.z - z0) > 2.5 || Math.abs(s.y - f0) > 1.2) continue;
      const d = Math.hypot(s.x - x0, s.z - z0);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) cands.push(this._freeSpotNear(best));
    for (let rad = 0.3; rad <= 3.01; rad += 0.3) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = x0 + Math.cos(a) * rad;
        const z = z0 + Math.sin(a) * rad;
        const g = groundBelow(x, z, f0 + 1.0, 1.5);
        if (g === undefined || g === null || Math.abs(g - f0) > 1.0) continue;
        cands.push({ x, y: g, z });
      }
    }
    for (const c of cands) {
      this.feet = c.y;
      const clear = !this._seatAt(c.x, c.z) && barrierTop(c.x, c.z, c.y) === null && headroomAt(c.x, c.z, c.y) > c.y + 1.75;
      this.feet = f0;
      if (!clear || this._enclosed(c.x, c.z, c.y)) continue;
      this.feet = c.y;
      this.pos.set(c.x, c.y + EYE, c.z);
      this.vy = 0;
      this.grounded = true;
      return;
    }
  }

  // nearest free seat in front of you, within reach
  _findSeat() {
    const seats = this.hall.seats;
    const fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    let best = null;
    let bestD = 1.9;
    for (const s of seats) {
      const dx = s.x - this.pos.x;
      const dz = s.z - this.pos.z;
      if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;
      const d = Math.hypot(dx, dz);
      if (d > bestD || Math.abs(s.y - this.feet) > 0.75) continue;
      if (s.off || this.occupied.has(s.index)) continue;
      const dot = (dx * fwd.x + dz * fwd.z) / (d || 1);
      if (dot < 0.25 && d > 0.6) continue;
      best = s;
      bestD = d;
    }
    if (best !== this.nearSeat) {
      this.nearSeat = best;
      this._emit('nearSeat', best);
    }
  }

  _applyFov(dt) {
    this.fov += (this.targetFov - this.fov) * (1 - Math.exp(-dt * 6));
    const f = this._effectiveFov(this.fov);
    if (Math.abs(this.camera.fov - f) > 0.01) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
  }

  _effectiveFov(f) {
    const a = this.camera.aspect;
    const ref = 1.05;
    if (a >= ref) return f;
    const h = 2 * Math.atan(Math.tan((f * Math.PI) / 360) * ref);
    return Math.min(100, (2 * Math.atan(Math.tan(h / 2) / a) * 180) / Math.PI);
  }

  // ------------------------------------------------------------ auto director
  _cinema(dt, ctx) {
    const c = this.cine;
    c.clock = (c.clock || 0) + dt;
    // the curtain call: when the applause begins, a new shot at once - one
    // where the bows can be seen - not a close-up held through them
    if (ctx.phase !== c.phase) {
      if ((ctx.phase === 'applause' || ctx.phase === 'playing') && c.phase !== undefined) c.until = 0;
      c.phase = ctx.phase;
    }
    if (!c.shot || c.clock > c.until) {
      const shot = this._pickShot(ctx);
      c.shot = shot;
      c.clock = 0;
      c.until = shot.hold;
      // a short move glides (never faster than a few metres a second); a
      // long one - across the hall, up to the dome - is a cut, as on film,
      // rather than a rush through the players and the walls
      const d = this.pos.distanceTo(shot.pos);
      const angle = Math.acos(clamp(new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)).dot(shot.look.clone().sub(shot.pos).normalize()), -1, 1));
      if (d > 4 || angle > Math.PI / 5) shot.cut = true;
      this.flyTo(shot.pos, shot.look, shot.cut ? 0.001 : clamp(d / 1.8, 2.4, 3.6), shot.fov);
      this.anim.lift = false;
      this.anim.after = () => { c.drift = { t: 0 }; };
      c.drift = null;
    }
    if (c.drift && c.shot) {
      c.drift.t += dt;
      const s = c.shot;
      const x = clamp(c.drift.t / s.hold, 0, 1);
      const p = s.pos.clone().addScaledVector(s.drift, x);
      this.pos.lerp(p, 1 - Math.exp(-dt * 2));
      const { yaw, pitch } = this.lookAt(s.look, this.pos);
      let turn = yaw - this.yaw;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      this.yaw += turn * (1 - Math.exp(-dt * 2));
      this.pitch += (pitch - this.pitch) * (1 - Math.exp(-dt * 2));
    }
  }

  _pickShot(ctx) {
    const perf = ctx.perf;
    const t = ctx.time;
    const piece = perf.piece;

    const c = this.cine;
    this.cinemaProgram ||= new CinemaProgram();
    if (c.piece !== piece || t < (c.scoreTime ?? -Infinity) - .5) {
      c.edit = 0;
      c.smallEnsemble = new Set((piece?.tracks || [])
        .filter(tr => SECTIONS[tr.section] && tr.notes?.length && (tr.gain ?? 1) > 0)
        .map(tr => tr.section)).size <= 3;
      c.wideIndex = Math.floor(Math.random() * 3);
      c.playerEdits = 0;
      c.rearIndex = Math.floor(Math.random() * 3);
      c.angles = new Map(); c.piece = piece;
    }
    c.scoreTime = t;
    const edit = c.edit || 0;
    // Establish the space; shuffle performers, audience and conductor
    // within a balanced programme rather than independent random cuts.
    let role = 'wide';
    if (edit % 7) {
      if (edit % 7 === 1) {
        // A shuffled programme with bounded repetition, not independent
        // random cuts that can neglect the audience or one instrument.
        let attempts = 0;
        do {
          c.roles = ['player', 'player', 'player', 'player', 'audience', 'conductor'];
          for (let i = c.roles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c.roles[i], c.roles[j]] = [c.roles[j], c.roles[i]]; }
        } while (++attempts < 12 && c.roles.some((v, i, a) => v === 'player' && a[i + 1] === v && a[i + 2] === v));
        if (attempts === 12) c.roles = ['player', 'player', 'audience', 'player', 'conductor', 'player'];
      }
      role = c.roles[edit % 7 - 1];
    }
    c.edit = edit + 1;
    const selected = piece && perf.playing && (role === 'player' || (role === 'conductor' && !piece.conducted))
      ? this.cinemaProgram.choose(piece, t) : null;
    const dom = selected?.sid;
    const wide = () => {
      const options = [
        { kind: 'wide', pos: V(0, 4.4, 17), look: V(0, STAGE_Y + 1.4, -5), fov: 44, drift: V(0, -0.4, -3.5) },
        { kind: 'wide2', pos: V(-8, LEVELS[1] + 0.5, 22.5), look: V(0, STAGE_Y + 1, -5), fov: 38, drift: V(3, 0, 0) },
        { kind: 'wide3', pos: V(12.4, 7.6, 7), look: V(-1, STAGE_Y + 1, -5.5), fov: 46, drift: V(0, 0, 3) },
        { kind: 'wide4', pos: V(0, 16.5, 6), look: V(0, STAGE_Y, -5), fov: 50, drift: V(0, 0, -2.5) },
        { kind: 'hall', pos: V(0, 3.2, -1.5), look: V(0, 8, 24), fov: 62, drift: V(1.5, 0.6, 0) },
      ];
      let list = ENTRY.wide ? ENTRY.wide.map((o) => ({ ...o, pos: V(o.pos[0], o.pos[1], o.pos[2]), look: V(o.look[0], o.look[1], o.look[2]), drift: V(o.drift[0], o.drift[1], o.drift[2]) })) : options;
      if (role === 'audience') list = [
        { kind: 'audience', pos: V(0, floorAt(0, 12) + 2.1, 12), look: V(0, STAGE_Y + 1.3, -5.5), fov: 58, drift: V(.55, .12, -.35) },
        { kind: 'audience', pos: V(-10, floorAt(-10, 9) + 3.2, 9), look: V(-.8, STAGE_Y + 1.3, -5.5), fov: 58, drift: V(.6, 0, 0) },
        { kind: 'audience', pos: V(10, floorAt(10, 9) + 3.2, 9), look: V(.8, STAGE_Y + 1.3, -5.5), fov: 58, drift: V(-.6, 0, 0) },
      ];
      if (perf.playing) list = list.filter(o => o.kind !== 'hall');
      // (for the bows: the stage from the house, not the house from the stage)
      if (bows && list.some((o) => o.kind !== 'hall')) list = list.filter((o) => o.kind !== 'hall');
      return list[(c.wideIndex = (c.wideIndex ?? -1) + 1) % list.length];
    };
    const bows = ctx.phase === 'applause';
    let shot;
    // the bows: the conductor from the front, turned to the house - or, with
    // no conductor, the whole stage
    if (bows && piece?.conducted) shot = { kind: 'bows', pos: V(0.6, STAGE_Y + 1.9, 2.8), look: V(0, STAGE_Y + 1.3, -5.5), fov: 52, drift: V(-0.8, 0, 0.5) };
    else if (bows) shot = wide();
    else if (!piece || !perf.playing || role === 'wide' || role === 'audience') shot = wide();
    else if (piece.conducted && role === 'conductor') {
      shot = Math.random() < 0.5
        ? { kind: 'conductor', pos: V(1.4, STAGE_Y + 2.0, -6.0), look: V(PODIUM.x, STAGE_Y + 1.6, PODIUM.z), fov: 34, drift: V(-1.2, 0, 0) }
        : { kind: 'conductor', pos: V(0.6, STAGE_Y + 1.9, 2.8), look: V(0, STAGE_Y + 1.3, -5.5), fov: 48, drift: V(-1, 0, -1) };
    } else if (dom) {
      const key = `${dom}:${selected.ci}`;
      const angle = c.angles.get(key) ?? Math.floor(Math.random() * 3);
      c.angles.set(key, (angle + 1) % 3);
      // Keep score-based selection and the existing front portraits. One
      // in three performer edits reverses the view, cycling three distinct
      // rear compositions even when the score keeps selecting new players.
      const rear = c.playerEdits++ % 3 === 1;
      const chair = SECTIONS[dom].chairs[selected.ci];
      const sc = { ...chair };
      const look = V(sc.x, sc.y + .95, sc.z);
      const toAud = V(-sc.x * 0.25, 0, 1).normalize();
      // (on the section's outer side: from the middle the conductor's head
      // would fill the picture)
      const side = Math.abs(sc.x) > 1 ? Math.sign(sc.x) : Math.random() < 0.5 ? -1 : 1;
      const lateral = V(toAud.z, 0, -toAud.x).multiplyScalar(side);
      let dist = 2.8 + (edit % 3) * .4;
      if (dom === 'piano') {
        const pPos = SECTIONS.piano.chairs[0];
        shot = angle === 0
          ? { kind: 'section', pos: V(pPos.x + 1.25, pPos.y + 3.1, pPos.z + 1.5), look: V(pPos.x + .25, pPos.y + 1.1, pPos.z), fov: 40, drift: V(-.2, 0, -.25) }
          : angle === 1
          ? { kind: 'section', pos: V(pPos.x + 2.75, pPos.y + 2.2, pPos.z - 2.85), look: V(pPos.x + .25, pPos.y + 1.1, pPos.z), fov: 38, drift: V(.2, 0, .3) }
          : { kind: 'section', pos: V(pPos.x - 1.6, pPos.y + 2.2, pPos.z + 2.5), look: V(pPos.x + .45, pPos.y + .85, pPos.z - .1), fov: 42, drift: V(.4, -.1, -.25) };
      } else if (dom === 'choir' && angle === 0) {
        shot = { kind: 'section', pos: V(side * 3.5, STAGE_Y + 2.8, -5.0), look: V(0, STAGE_Y + 2.7, -11.5), fov: 40, drift: V(-side * 1.5, 0, 0) };
      } else {
        if (sc.z < -6) dist += 1.5;
        const bearing = toAud.clone().applyAxisAngle(V(0, 1, 0), [-.5, .15, .65][angle] * side);
        const pos = look.clone().addScaledVector(bearing, dist).addScaledVector(lateral, .6).add(V(0, [.55, .9, .65][angle]));
        shot = { kind: 'section', pos, look, fov: 40, drift: lateral.clone().multiplyScalar(-0.9) };
      }
      shot.angle = angle;
      if (rear) {
        const variant = c.rearIndex++ % 3;
        const offsets = [[side * 1.45, 2.15, -2.2], [-side * 2.7, 2.6, -2.8], [side * .9, 3.15, -3.5]];
        const [dx, dy, dz] = offsets[variant];
        // The audience is +Z in all three venues. Aim beyond the player:
        // their shoulder/section stays in the lower foreground, with the
        // house in the background rather than a close-up of a back of head.
        const pos = V(sc.x + dx, sc.y + dy, Math.max(HALL.front + 1.05, sc.z + dz));
        if (dom === 'piano') {
          // The pianist faces +X. Stay behind that shoulder and beside the
          // raised lid, while keeping the audience in the same composition.
          pos.set(sc.x - [1.5, 2.2, 1.9][variant], sc.y + [2.4, 2.8, 3.2][variant], sc.z - [1.8, 2.6, 3.4][variant]);
        }
        while (!insideShell(pos.x, pos.z, .8) && Math.abs(pos.x) > .1) pos.x *= .9;
        shot = { kind: 'section', view: ['rear-shoulder', 'rear-oblique', 'rear-ensemble'][variant],
          angle: 3 + variant, pos, look: V(sc.x - dx * .12, sc.y + 1.05, sc.z + [2.7, 3.3, 4][variant]),
          subject: look.clone(), fov: 60, drift: V(side * .35, -.08, .12), cut: true };
      }
    } else shot = wide();
    const portrait = (this.camera?.aspect ?? 1) < .8;
    if (portrait && shot.kind === 'section') shot.pos.y += .65;
    // Test the same geometry at the start and along the slow move. All of
    // this work happens at an edit, never in the frame loop.
    const ab = V(), ap = V();
    // Actual fixed instrument geometry is supplied by the host scene. Bounds
    // are sampled only at edits, so lids, harp frames and organ cases stay
    // solid without adding mesh traversal to the frame loop.
    const instrumentBounds = shot.view ? (ctx.cameraInstruments || []).map(group => {
      group.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(group).expandByScalar(.25);
    }) : [];
    const blocked = pos => (ctx.obstacles || []).some(o => {
      if (o.distanceTo(pos) < (portrait ? 1.5 : .95)) return true;
      if (shot.kind !== 'section' || o.distanceTo(shot.subject || shot.look) < 1.6) return false;
      ab.subVectors(shot.look, pos);
      const u = clamp(ap.subVectors(o, pos).dot(ab) / ab.lengthSq(), 0, 1);
      return ap.copy(pos).addScaledVector(ab, u).distanceTo(o) < .45;
    });
    const terrainClear = pos => {
      if (pos.y < floorAt(pos.x, pos.z) + .8) return false;
      if (shot.view && (pos.y > 6.8 || !insideShell(pos.x, pos.z, .45) || pos.z < HALL.front + .65
        || instrumentBounds.some(box => box.containsPoint(pos)))) return false;
      // Keep the view above the stage tiers as well as the camera itself.
      for (const u of [.25, .5, .75]) {
        ap.copy(pos).lerp(shot.look, u);
        if (ap.y < floorAt(ap.x, ap.z) + .2) return false;
      }
      return true;
    };
    for (let k = 0; k < 8; k++) {
      if (!blocked(shot.pos) && terrainClear(shot.pos)) break;
      const away = new THREE.Vector3().subVectors(shot.pos, shot.look).setY(0).normalize();
      // Rear views can already be close to the shell. Raise rather than
      // retreat through the rear wall when seeking a clear camera position.
      shot.pos.addScaledVector(away, shot.view ? 0 : .45).add(V(0, .3, 0));
    }
    // A blocked rear composition falls back to the established clear wide
    // view; never force a camera through scenery to preserve a shot quota.
    if (shot.view && (blocked(shot.pos) || !terrainClear(shot.pos))) shot = wide();
    if (shot.kind === 'section') {
      shot.sid = selected.sid; shot.ci = selected.ci;
      // Alternate a medium portrait and a looser section framing.
      shot.fov = shot.view ? (portrait ? 66 : 60) : edit % 2 ? 46 : 52;
      shot.drift.multiplyScalar(.65);
    }
    const probe = V();
    const safeMove = () => [.25, .5, .75, 1].every(u => {
      probe.copy(shot.pos).addScaledVector(shot.drift, u);
      return !blocked(probe) && terrainClear(probe);
    });
    for (let k = 0; k < 4 && !safeMove(); k++) shot.drift.multiplyScalar(.5);
    if (!safeMove()) shot.drift.set(0, 0, 0);
    const unhurried = c.smallEnsemble || (selected?.energy ?? 0) <= 45;
    shot.hold = bows ? 11 : !perf.playing ? 13 : (shot.kind === 'section' && !unhurried ? 8 : 10) + Math.random() * 2;
    if (perf.playing && !bows) {
      const downbeat = piece.beats?.find(b => b[1] === 0 && b[0] >= t + shot.hold && b[0] <= t + Math.min(12, shot.hold + 1.2));
      if (downbeat) shot.hold = downbeat[0] - t;
    }
    shot.cut = bows || !!shot.view;
    return shot;
  }

  // where we listen from
  listener(fixedSeat) {
    const cam = this.camera;
    const fwd = V(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = V(0, 1, 0).applyQuaternion(cam.quaternion);
    if (this.mode === 'cinema' && fixedSeat) {
      const s = fixedSeat;
      const pos = V(s.x, s.y + 1.2, s.z);
      const f = new THREE.Vector3().subVectors(STAGE_FOCUS, pos).normalize();
      return { pos, fwd: f, up: V(0, 1, 0) };
    }
    return { pos: cam.position.clone(), fwd, up };
  }
}
