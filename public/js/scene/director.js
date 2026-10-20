// First-person presence: you arrive in the foyer, walk into the hall or up
// the spiral stairs to the balconies, find a seat and sit down - or wander
// onto the stage. The mouse looks around like a first-person game (pointer
// lock); dragging still works when the cursor is free. Zoom works like opera
// glasses. An optional auto-director films the concert for you.
import * as THREE from 'three';
import { stepTo, surfacesAt, LEVELS } from './hallplan.js';
import { SECTIONS, PODIUM, STAGE_Y, sectionCenter } from '../layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const STAGE_FOCUS = V(0, STAGE_Y + 1.1, -4.6);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const ENTRANCE = { pos: V(0, LEVELS[0], 40.4), look: V(0, LEVELS[0] + 1.7, 30) };
const EYE = 1.62;
const BODY = 0.24; // keep this far from walls and drops

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
    this._bindInput();
    const la = this.lookAt(ENTRANCE.look, this.pos);
    this.yaw = la.yaw;
    this.pitch = la.pitch;
  }

  on(fn) { this.listeners.add(fn); }
  _emit(type, data) { for (const f of this.listeners) f(type, data); }

  placeAt(feet, look) {
    this.feet = feet.y;
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
      // come back to where you were watching from
      const r = this.returnTo;
      this.flyTo(r.pos, r.pos.clone().add(V(-Math.sin(r.yaw) * Math.cos(r.pitch), Math.sin(r.pitch), -Math.cos(r.yaw) * Math.cos(r.pitch))), 1.6, mode === 'seat' ? 50 : 64);
      this.feet = r.feet;
      if (r.seat) this.seat = r.seat;
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
    this.flyTo(eye, near ? eye.clone().addScaledVector(fwd, 10).setY(STAGE_FOCUS.y + (eye.y - STAGE_FOCUS.y) * 0.5) : STAGE_FOCUS, near ? dur : 2.4, 50);
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
    // step out into the row in front of the seat
    const fwd = V(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    const x = s.x + fwd.x * 0.5;
    const z = s.z + fwd.z * 0.5;
    const h = stepTo(x, z, s.y, { up: 0.6, down: 0.6 });
    this.feet = h ?? s.y;
    this.pos.set(h === null ? s.x : x, this.feet + EYE, h === null ? s.z : z);
    this.anim = null;
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
    this.pos.y = best + EYE;
    this.anim = null;
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
    const pos = head.clone().addScaledVector(fwd, 1.55).addScaledVector(right, -0.55).add(V(0, 0.12, 0));
    this.seat = { label: `${SECTIONS[player.sid].ko} · ${player.char.spec.name} 곁`, index: -1 };
    this.mode = 'seat';
    this.flyTo(pos, head.clone().add(V(0, -0.15, 0)), 2.0, 45);
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
    if (this.mode === 'cinema') this.setMode(this.returnTo?.seat ? 'seat' : 'walk');
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k, -1.4, 1.4);
    if (this.anim && !this.anim.sitting) this.anim = null;
  }

  _bindInput() {
    const el = this.dom;
    const pointers = new Map();
    let pinch0 = 0;
    let moved = 0;
    let lookPointer = null;
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
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      }
      if (lookPointer === null) lookPointer = e.pointerId;
      moved = 0;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.locked) return;
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
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
    });
    const up = (e) => {
      const p = pointers.get(e.pointerId);
      if (p && p.type === 'touch' && moved < 10 && pointers.size === 1) {
        const now = performance.now();
        if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
          this._emit('pick', { x: e.clientX, y: e.clientY });
          lastTap.t = 0;
        } else lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      if (p && p.type === 'mouse' && moved < 5 && !this.locked) this._emit('clickView', { x: e.clientX, y: e.clientY });
      pointers.delete(e.pointerId);
      if (e.pointerId === lookPointer) lookPointer = null;
      if (pointers.size < 2) pinch0 = 0;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
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
      if (e.code === 'Escape' && this.locked) { this.releaseLock(); return; }
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
      if (a.lift) this.pos.y += Math.sin(x * Math.PI) * Math.min(2.5, a.p0.distanceTo(a.p1) * 0.12);
      this.yaw = a.y0 + (a.y1 - a.y0) * x;
      this.pitch = a.q0 + (a.q1 - a.q0) * x;
      this.targetFov = a.fov0 + (a.fov1 - a.fov0) * x;
      if (a.t >= a.dur) {
        this.anim = null;
        if (a.after) a.after();
      }
    }

    if (this.mode === 'walk' && !this.anim) {
      const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
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
      this._move(this.vel.x * dt, this.vel.z * dt);
      // eyes follow the feet; stairs feel like steps, not a ramp
      this.pos.y += (this.feet + EYE - this.pos.y) * (1 - Math.exp(-dt * 14));
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

  // try the move, then slide along whatever stopped us
  _move(dx, dz) {
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    const tryAt = (mx, mz) => {
      const l = Math.hypot(mx, mz);
      if (l < 1e-6) return false;
      const nx = this.pos.x + mx;
      const nz = this.pos.z + mz;
      // probe a body-width ahead so we stop short of walls and edges
      const h = stepTo(nx + (mx / l) * BODY, nz + (mz / l) * BODY, this.feet);
      if (h === null) return false;
      const h2 = stepTo(nx, nz, this.feet);
      if (h2 === null) return false;
      this.pos.x = nx;
      this.pos.z = nz;
      this.feet = h2;
      return true;
    };
    if (tryAt(dx, dz)) return;
    if (tryAt(dx, 0)) { this.vel.z *= 0.5; return; }
    if (tryAt(0, dz)) { this.vel.x *= 0.5; return; }
    this.vel.multiplyScalar(0.3);
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
      if (this.occupied.has(s.index)) continue;
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
    if (!c.shot || c.clock > c.until) {
      const shot = this._pickShot(ctx);
      c.shot = shot;
      c.clock = 0;
      c.until = shot.hold;
      this.flyTo(shot.pos, shot.look, shot.cut ? 0.001 : 3.2, shot.fov);
      this.anim.lift = false;
      this.anim.after = () => { c.drift = { t: 0 }; };
      c.drift = null;
    }
    if (c.drift && c.shot) {
      c.drift.t += dt;
      const s = c.shot;
      const x = c.drift.t / s.hold;
      const p = s.pos.clone().addScaledVector(s.drift, x);
      this.pos.lerp(p, 1 - Math.exp(-dt * 2));
      const { yaw, pitch } = this.lookAt(s.look, this.pos);
      this.yaw += (yaw - this.yaw) * (1 - Math.exp(-dt * 2));
      this.pitch += (pitch - this.pitch) * (1 - Math.exp(-dt * 2));
    }
  }

  _pickShot(ctx) {
    const perf = ctx.perf;
    const t = ctx.time;
    const piece = perf.piece;
    const r = Math.random();
    const last = this.cine.shot?.kind;
    const dom = piece && perf.playing ? perf.dominantSection(t + 2, 8) : null;
    const wide = () => {
      const options = [
        { kind: 'wide', pos: V(0, 4.4, 17), look: V(0, STAGE_Y + 1.4, -5), fov: 44, drift: V(0, -0.4, -3.5) },
        { kind: 'wide2', pos: V(-8, LEVELS[1] + 0.5, 22.5), look: V(0, STAGE_Y + 1, -5), fov: 38, drift: V(3, 0, 0) },
        { kind: 'wide3', pos: V(12.4, 7.6, 7), look: V(-1, STAGE_Y + 1, -5.5), fov: 46, drift: V(0, 0, 3) },
        { kind: 'wide4', pos: V(0, 16.5, 6), look: V(0, STAGE_Y, -5), fov: 50, drift: V(0, 0, -2.5) },
        { kind: 'hall', pos: V(0, 3.2, -1.5), look: V(0, 8, 24), fov: 62, drift: V(1.5, 0.6, 0) },
      ];
      return options[Math.floor(Math.random() * options.length)];
    };
    let shot;
    if (!piece || !perf.playing || r < 0.28 || (last === 'section' && r < 0.4)) shot = wide();
    else if (piece.conducted && r < 0.4 && last !== 'conductor') {
      shot = Math.random() < 0.5
        ? { kind: 'conductor', pos: V(1.4, STAGE_Y + 2.0, -6.0), look: V(PODIUM.x, STAGE_Y + 1.6, PODIUM.z), fov: 34, drift: V(-1.2, 0, 0) }
        : { kind: 'conductor', pos: V(0.6, STAGE_Y + 1.9, 2.8), look: V(0, STAGE_Y + 1.3, -5.5), fov: 48, drift: V(-1, 0, -1) };
    } else if (dom) {
      const sc = sectionCenter(dom);
      const look = V(sc.x, sc.y + 0.25, sc.z);
      const toAud = V(-sc.x * 0.25, 0, 1).normalize();
      const side = Math.random() < 0.5 ? -1 : 1;
      const lateral = V(toAud.z, 0, -toAud.x).multiplyScalar(side);
      let dist = 2.6 + Math.random() * 1.4;
      if (dom === 'piano') {
        const pPos = SECTIONS.piano.chairs[0];
        shot = Math.random() < 0.5
          ? { kind: 'section', pos: V(pPos.x + 0.9, pPos.y + 1.45, pPos.z + 0.7), look: V(pPos.x + 0.55, pPos.y + 0.72, pPos.z), fov: 40, drift: V(0, 0, -0.5) }
          : { kind: 'section', pos: V(pPos.x + 2.8, pPos.y + 1.5, pPos.z + 2.4), look: V(pPos.x + 0.3, pPos.y + 1.0, pPos.z - 0.2), fov: 38, drift: V(-0.6, 0, 0.4) };
      } else if (dom === 'choir') {
        shot = { kind: 'section', pos: V(side * 3.5, STAGE_Y + 2.8, -5.0), look: V(0, STAGE_Y + 2.7, -11.5), fov: 40, drift: V(-side * 1.5, 0, 0) };
      } else {
        if (sc.z < -6) dist += 1.5;
        const pos = look.clone().addScaledVector(toAud, dist).addScaledVector(lateral, 1.2).add(V(0, 0.55, 0));
        shot = { kind: 'section', pos, look, fov: 40, drift: lateral.clone().multiplyScalar(-0.9) };
      }
    } else shot = wide();
    if (ctx.obstacles) {
      for (let k = 0; k < 8; k++) {
        const hit = ctx.obstacles.find((o) => o.distanceTo(shot.pos) < 0.95);
        if (!hit) break;
        const away = new THREE.Vector3().subVectors(shot.pos, shot.look).setY(0).normalize();
        shot.pos.addScaledVector(away, 0.45).add(V(0, 0.3, 0));
      }
    }
    shot.hold = 14 + Math.random() * 6;
    shot.cut = Math.random() < 0.2;
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
