// First-person presence: you walk into the hall, find a seat and sit down,
// or wander anywhere (including onto the stage). Zoom works like opera
// glasses. An optional auto-director films the concert for you.
import * as THREE from 'three';
import { HALL, floorAt } from './hall.js';
import { SECTIONS, PODIUM, STAGE_Y, sectionCenter } from '../layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const STAGE_FOCUS = V(0, STAGE_Y + 1.1, -4.6);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const ENTRANCE = { pos: V(7.1, 0, 30.4), look: V(0, STAGE_Y + 1.2, -4) };
const EYE = 1.62;

export class Director {
  constructor(camera, dom, hall) {
    this.camera = camera;
    this.dom = dom;
    this.hall = hall;
    this.mode = 'walk'; // walk | seat | cinema
    this.yaw = 0;
    this.pitch = 0;
    this.fov = 60;
    this.targetFov = 60;
    this.pos = ENTRANCE.pos.clone().add(V(0, EYE, 0));
    this.vel = V();
    this.keys = new Set();
    this.joy = { x: 0, y: 0 }; // virtual joystick (-1..1)
    this.anim = null;
    this.seat = null;
    this.nearSeat = null;
    this.fly = false;
    this.listeners = new Set();
    this.cine = { shot: null, until: 0 };
    this.occupied = new Set();
    this._bindInput();
    const la = this.lookAt(ENTRANCE.look, this.pos);
    this.yaw = la.yaw;
    this.pitch = la.pitch;
  }

  on(fn) { this.listeners.add(fn); }
  _emit(type, data) { for (const f of this.listeners) f(type, data); }

  // ------------------------------------------------------------ modes
  setMode(mode) {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    if (mode === 'walk') {
      if (prev === 'seat' && this.seat && this.seat.index >= 0) this._standUp();
      this.seat = null;
      this.targetFov = 60;
      this.anim = null;
    }
    if (mode === 'cinema') {
      this.cine.until = 0;
      this.cine.shot = null;
      this.returnTo = { pos: this.pos.clone(), yaw: this.yaw, pitch: this.pitch, seat: prev === 'seat' ? this.seat : null };
    }
    if (prev === 'cinema' && mode !== 'cinema' && this.returnTo) {
      // come back to where you were watching from
      const r = this.returnTo;
      this.flyTo(r.pos, r.pos.clone().add(V(-Math.sin(r.yaw) * Math.cos(r.pitch), Math.sin(r.pitch), -Math.cos(r.yaw) * Math.cos(r.pitch))), 1.6, mode === 'seat' ? 50 : 60);
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
    this.anim = { p0: this.pos.clone(), p1: pos.clone(), y0, y1: yaw, q0: this.pitch, q1: pitch, t: 0, dur, fov0: this.targetFov, fov1: fov ?? this.targetFov };
  }

  // sit in a seat: a short settle from standing beside it to seated
  sitAt(seat, dur = 1.2) {
    if (!seat) return;
    this.seat = seat;
    this.mode = 'seat';
    const eye = V(seat.x, seat.y + 1.18, seat.z + 0.06);
    const keepLook = this.pos.distanceTo(eye) < 3;
    if (keepLook) {
      const d = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.flyTo(eye, eye.clone().add(d), dur, 50);
    } else this.flyTo(eye, STAGE_FOCUS, Math.max(dur, 2.2), 50);
    this._emit('mode', 'seat');
    this._emit('seat', seat);
  }

  _standUp() {
    const s = this.seat;
    if (!s) return;
    // step out into the row in front of the seat
    this.pos.set(s.x, floorAt(s.x, s.z - 0.45) + EYE, s.z - 0.45);
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
  _bindInput() {
    const el = this.dom;
    const pointers = new Map();
    let pinch0 = 0;
    let moved = 0;
    let lookPointer = null;
    let lastTap = { t: 0, x: 0, y: 0 };
    el.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, type: e.pointerType });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      }
      if (lookPointer === null) lookPointer = e.pointerId;
      moved = 0;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
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
      if (e.pointerId !== lookPointer) return;
      if (this.mode === 'cinema') this.setMode(this.returnTo?.seat ? 'seat' : 'walk');
      const k = (this.fov / 50) * 0.0034;
      this.yaw += dx * k;
      this.pitch = clamp(this.pitch + dy * k, -1.35, 1.35);
      this.anim = null;
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
      pointers.delete(e.pointerId);
      if (e.pointerId === lookPointer) lookPointer = null;
      if (pointers.size < 2) pinch0 = 0;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY); }, { passive: false });
    el.addEventListener('dblclick', (e) => {
      if (e.sourceCapabilities?.firesTouchEvents) return;
      this._emit('pick', { x: e.clientX, y: e.clientY });
    });
    el.addEventListener('click', (e) => { if (moved < 6) this._emit('click', { x: e.clientX, y: e.clientY }); });
    const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.getAttribute?.('role') === 'slider') return;
      if (e.code === 'KeyG' && !e.repeat && this.mode === 'walk') { this.fly = !this.fly; this._emit('fly', this.fly); return; }
      if (e.code === 'KeyR' && !e.repeat) { this.targetFov = this.mode === 'walk' ? 60 : 50; return; }
      if (e.code === 'KeyE' && !e.repeat && !this.fly) { if (this.toggleSit()) e.preventDefault(); return; }
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

    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const x = ease(Math.min(1, a.t / a.dur));
      this.pos.lerpVectors(a.p0, a.p1, x);
      const lift = Math.sin(x * Math.PI) * Math.min(2.5, a.p0.distanceTo(a.p1) * 0.12);
      this.pos.y += lift;
      this.yaw = a.y0 + (a.y1 - a.y0) * x;
      this.pitch = a.q0 + (a.q1 - a.q0) * x;
      this.targetFov = a.fov0 + (a.fov1 - a.fov0) * x;
      if (a.t >= a.dur) {
        this.anim = null;
        if (a.after) a.after();
      }
    }

    if (this.mode === 'walk') {
      const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const speed = (run ? 4.8 : 2.2) * dt;
      const fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const mv = V();
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mv.add(fwd);
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mv.sub(fwd);
      if (this.keys.has('KeyD')) mv.add(right);
      if (this.keys.has('KeyA')) mv.sub(right);
      if (this.keys.has('ArrowLeft')) this.yaw += dt * 1.6;
      if (this.keys.has('ArrowRight')) this.yaw -= dt * 1.6;
      mv.addScaledVector(fwd, -this.joy.y).addScaledVector(right, this.joy.x);
      if (mv.lengthSq() > 1) mv.normalize();
      mv.multiplyScalar(speed);
      this.vel.lerp(mv, 1 - Math.exp(-dt * 10));
      this.pos.add(this.vel);
      this.pos.x = clamp(this.pos.x, -HALL.halfW + 0.6, HALL.halfW - 0.6);
      this.pos.z = clamp(this.pos.z, HALL.front + 0.8, HALL.back - 0.5);
      if (this.fly) {
        if (this.keys.has('KeyE')) this.pos.y += dt * 2.5;
        if (this.keys.has('KeyQ')) this.pos.y -= dt * 2.5;
        this.pos.y = clamp(this.pos.y, floorAt(this.pos.x, this.pos.z) + 0.4, HALL.ceiling - 1.2);
      } else {
        const ground = floorAt(this.pos.x, this.pos.z) + EYE;
        this.pos.y += (ground - this.pos.y) * (1 - Math.exp(-dt * 8));
      }
      const bob = this.vel.length() > 0.001 && !this.fly ? Math.sin(performance.now() / 160) * 0.012 : 0;
      cam.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
      this._findSeat();
    } else {
      cam.position.copy(this.pos);
      if (this.nearSeat) { this.nearSeat = null; this._emit('nearSeat', null); }
    }
    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this._applyFov(dt);
  }

  // nearest free seat in front of you, within reach
  _findSeat() {
    if (this.fly) return;
    const seats = this.hall.seats;
    const fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    let best = null;
    let bestD = 2.1;
    for (const s of seats) {
      const dx = s.x - this.pos.x;
      const dz = s.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD || Math.abs(s.y - (this.pos.y - EYE)) > 1.2) continue;
      if (this.occupied.has(s.index)) continue;
      const dot = (dx * fwd.x + dz * fwd.z) / (d || 1);
      if (dot < 0.2) continue;
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
        { kind: 'wide', pos: V(0, 4.2, 19), look: V(0, STAGE_Y + 1.4, -5), fov: 44, drift: V(0, -0.4, -3.5) },
        { kind: 'wide2', pos: V(-9, 9.6, 27), look: V(0, STAGE_Y + 1, -5), fov: 40, drift: V(3, 0, 0) },
        { kind: 'wide3', pos: V(11.5, 6.8, 6), look: V(-1, STAGE_Y + 1, -5.5), fov: 46, drift: V(0, 0, 3) },
        { kind: 'wide4', pos: V(0, 13.5, 6), look: V(0, STAGE_Y, -5), fov: 52, drift: V(0, 0, -2.5) },
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
      const pos = V(s.x, s.y + 1.18, s.z);
      const f = new THREE.Vector3().subVectors(STAGE_FOCUS, pos).normalize();
      return { pos, fwd: f, up: V(0, 1, 0) };
    }
    return { pos: cam.position.clone(), fwd, up };
  }
}
