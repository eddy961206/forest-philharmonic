// Camera & navigation: sit in any seat, walk/fly freely, orbit the stage,
// or let the auto-director film the concert. Zoom works like opera glasses
// (field of view) in first-person modes and as dolly in orbit mode.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HALL, floorAt } from './hall.js';
import { SECTIONS, PODIUM, STAGE_Y, sectionCenter } from '../layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const STAGE_FOCUS = V(0, STAGE_Y + 1.1, -4.6);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export const SEAT_PRESETS = [
  { id: 'best', ko: '1층 중앙 R석', find: (s) => s.level === '1층' && s.row === 'G' && Math.abs(s.x) < 0.35 },
  { id: 'front', ko: '1층 맨 앞줄', find: (s) => s.level === '1층' && s.row === 'A' && Math.abs(s.x) < 0.35 },
  { id: 'back', ko: '1층 뒷줄', find: (s) => s.level === '1층' && s.row === 'T' && Math.abs(s.x) < 0.35 },
  { id: 'side', ko: '1층 왼쪽 블록', find: (s) => s.level === '1층' && s.row === 'F' && s.x < -9.5 && s.x > -10.5 },
  { id: 'balcony', ko: '2층 발코니 정면', find: (s) => s.level === '2층' && s.row === 'B' && Math.abs(s.x) < 0.35 },
  { id: 'box', ko: '박스석 (오른쪽)', find: (s) => s.level === '박스석 R' && s.num === 6 },
];

export const STAGE_SPOTS = [
  { id: 'podium', ko: '지휘자 바로 뒤', pos: V(0.0, STAGE_Y + 1.85, PODIUM.z + 1.0), look: V(0, STAGE_Y + 1.0, -7) },
  { id: 'inside', ko: '오케스트라 한가운데', pos: V(0.4, STAGE_Y + 1.25, -6.3), look: V(0, STAGE_Y + 1.0, -2.5) },
  { id: 'cello', ko: '첼로 옆자리', pos: V(3.6, STAGE_Y + 1.2, -3.2), look: V(-1, STAGE_Y + 1.0, -5) },
  { id: 'piano', ko: '피아노 곁', pos: V(-4.2, STAGE_Y + 1.45, 0.4), look: V(-4.9, STAGE_Y + 0.75, -0.9) },
];

export class Director {
  constructor(camera, dom, hall) {
    this.camera = camera;
    this.dom = dom;
    this.hall = hall;
    this.mode = 'seat';
    this.yaw = 0;
    this.pitch = 0;
    this.fov = 50;
    this.targetFov = 50;
    this.baseFov = 50;
    this.pos = V(0, 3, 14);
    this.vel = V();
    this.keys = new Set();
    this.anim = null;
    this.seat = null;
    this.fly = false;
    this.listeners = new Set();
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enabled = false;
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance = 1.5;
    this.orbit.maxDistance = 48;
    this.orbit.maxPolarAngle = Math.PI * 0.53;
    this.orbit.target.copy(STAGE_FOCUS);
    this.cine = { shot: null, until: 0, t0: 0 };
    this._bindInput();
  }

  on(fn) { this.listeners.add(fn); }
  _emit(type, data) { for (const f of this.listeners) f(type, data); }

  // ------------------------------------------------------------ modes
  setMode(mode) {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    this.orbit.enabled = mode === 'orbit';
    if (mode === 'orbit') {
      this.orbit.target.copy(STAGE_FOCUS);
      // start from an overview: same bearing as now, but well clear of the stage
      const dir = new THREE.Vector3().subVectors(this.pos, STAGE_FOCUS);
      dir.y = 0;
      if (dir.lengthSq() < 1e-4 || dir.z < 2) dir.set(0, 0, 1);
      dir.normalize();
      const d = Math.max(12, this.pos.distanceTo(STAGE_FOCUS));
      this.camera.position.copy(STAGE_FOCUS).addScaledVector(dir, d).add(new THREE.Vector3(0, Math.max(3.5, this.pos.y - STAGE_FOCUS.y), 0));
      this.camera.lookAt(STAGE_FOCUS);
      this.orbit.update();
      this.targetFov = 50;
    }
    if (prev === 'orbit') {
      this.pos.copy(this.camera.position);
      const d = new THREE.Vector3();
      this.camera.getWorldDirection(d);
      this.yaw = Math.atan2(-d.x, -d.z);
      this.pitch = Math.asin(clamp(d.y, -1, 1));
    }
    if (mode === 'walk') {
      this.seat = null;
      this.targetFov = 60;
      this.anim = null;
    }
    if (mode === 'cinema') this.cine.until = 0;
    if (mode === 'seat' && !this.seat) this.sitPreset('best');
    this._emit('mode', mode);
  }

  lookAt(target, from = this.pos) {
    const d = new THREE.Vector3().subVectors(target, from).normalize();
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(clamp(d.y, -1, 1)) };
  }

  flyTo(pos, look, dur = 2.2, fov = null) {
    const { yaw, pitch } = this.lookAt(look, pos);
    // shortest yaw path
    let y0 = this.yaw;
    while (yaw - y0 > Math.PI) y0 += Math.PI * 2;
    while (yaw - y0 < -Math.PI) y0 -= Math.PI * 2;
    this.anim = { p0: this.pos.clone(), p1: pos.clone(), y0, y1: yaw, q0: this.pitch, q1: pitch, t: 0, dur, fov0: this.targetFov, fov1: fov ?? this.targetFov };
  }

  sitAt(seat, dur = 2.4) {
    if (!seat) return;
    this.seat = seat;
    if (this.mode !== 'seat') {
      this.mode = 'seat';
      this.orbit.enabled = false;
      this._emit('mode', 'seat');
    }
    const eye = V(seat.x, seat.y + 1.18, seat.z + 0.06);
    this.flyTo(eye, STAGE_FOCUS, dur, 50);
    this._emit('seat', seat);
  }

  sitPreset(id) {
    const pr = SEAT_PRESETS.find((p) => p.id === id);
    const seat = pr && this.hall.seats.find(pr.find);
    if (seat) this.sitAt(seat);
  }

  stageSpot(id) {
    const s = STAGE_SPOTS.find((x) => x.id === id);
    if (!s) return;
    this.seat = { label: `무대 위 · ${s.ko}`, index: -1 };
    if (this.mode !== 'seat') {
      this.mode = 'seat';
      this.orbit.enabled = false;
      this._emit('mode', 'seat');
    }
    this.flyTo(s.pos, s.look, 2.6, 58);
    this._emit('seat', this.seat);
  }

  focusPlayer(player) {
    if (!player) return;
    const root = player.char.root;
    const c = root.position.clone();
    const fwd = V(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = V(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const head = c.clone().add(V(0, 1.15 * player.char.scale, 0));
    const pos = head.clone().addScaledVector(fwd, 1.55).addScaledVector(right, -0.55).add(V(0, 0.12, 0));
    this.seat = { label: `${SECTIONS[player.sid].ko} · ${player.char.spec.name} 곁`, index: -1 };
    if (this.mode !== 'seat') {
      this.mode = 'seat';
      this.orbit.enabled = false;
      this._emit('mode', 'seat');
    }
    this.flyTo(pos, head.clone().add(V(0, -0.15, 0)), 2.0, 45);
    this._emit('seat', this.seat);
  }

  zoom(delta) {
    if (this.mode === 'orbit') return; // OrbitControls handles dolly
    this.targetFov = clamp(this.targetFov * Math.exp(delta * 0.0012), 8, 75);
  }

  // ------------------------------------------------------------ input
  _bindInput() {
    const el = this.dom;
    const pointers = new Map();
    let pinch0 = 0;
    let dragging = false;
    let moved = 0;
    el.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      }
      dragging = true;
      moved = 0;
      if (this.mode !== 'orbit') el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (this.mode === 'orbit') return;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) this.targetFov = clamp(this.targetFov * (pinch0 / d), 8, 75);
        pinch0 = d;
        return;
      }
      if (!dragging) return;
      if (this.mode === 'cinema') {
        this.setMode(this.seat ? 'seat' : 'walk');
      }
      const k = (this.fov / 50) * 0.0034;
      this.yaw += dx * k;
      this.pitch = clamp(this.pitch + dy * k, -1.35, 1.35);
      this.anim = null;
    });
    let lastTap = { t: 0, x: 0, y: 0 };
    const up = (e) => {
      // touch screens: two quick taps in place = double-click
      if (e.pointerType === 'touch' && moved < 10 && pointers.size === 1) {
        const now = performance.now();
        if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
          this._emit('pick', { x: e.clientX, y: e.clientY });
          lastTap.t = 0;
        } else {
          lastTap = { t: now, x: e.clientX, y: e.clientY };
        }
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch0 = 0;
      if (!pointers.size) dragging = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      if (this.mode === 'orbit') return;
      e.preventDefault();
      this.zoom(e.deltaY);
    }, { passive: false });
    el.addEventListener('dblclick', (e) => {
      if (e.sourceCapabilities?.firesTouchEvents) return; // handled as a double-tap
      this._emit('pick', { x: e.clientX, y: e.clientY });
    });
    el.addEventListener('click', (e) => {
      if (moved < 6) this._emit('click', { x: e.clientX, y: e.clientY });
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === 'g' && this.mode === 'walk' && !e.repeat) {
        this.fly = !this.fly;
        this._emit('fly', this.fly);
        return;
      }
      if (k === 'r' && !e.repeat) {
        this.targetFov = this.mode === 'walk' ? 60 : 50;
        return;
      }
      if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown'].includes(k) && this.mode !== 'walk' && this.mode !== 'orbit') {
          this.setMode('walk');
        }
        this.keys.add(k);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // ------------------------------------------------------------ update
  update(dt, ctx) {
    const cam = this.camera;
    if (this.mode === 'orbit') {
      this.orbit.update();
      this.pos.copy(cam.position);
      this._applyFov(dt);
      return;
    }
    if (this.mode === 'cinema') this._cinema(dt, ctx);

    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const x = ease(Math.min(1, a.t / a.dur));
      this.pos.lerpVectors(a.p0, a.p1, x);
      // arc a little upward on long moves so we glide over seats
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
      const speed = (this.keys.has('shift') ? 5.5 : 2.4) * dt;
      const fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const mv = V();
      if (this.keys.has('w') || this.keys.has('arrowup')) mv.add(fwd);
      if (this.keys.has('s') || this.keys.has('arrowdown')) mv.sub(fwd);
      if (this.keys.has('d')) mv.add(right);
      if (this.keys.has('a')) mv.sub(right);
      if (this.keys.has('arrowleft')) this.yaw += dt * 1.6;
      if (this.keys.has('arrowright')) this.yaw -= dt * 1.6;
      if (mv.lengthSq() > 0) mv.normalize().multiplyScalar(speed);
      this.vel.lerp(mv, 1 - Math.exp(-dt * 10));
      this.pos.add(this.vel);
      this.pos.x = clamp(this.pos.x, -HALL.halfW + 0.6, HALL.halfW - 0.6);
      this.pos.z = clamp(this.pos.z, HALL.front + 0.8, HALL.back - 0.6);
      if (this.fly) {
        if (this.keys.has('e')) this.pos.y += dt * 2.5;
        if (this.keys.has('q')) this.pos.y -= dt * 2.5;
        this.pos.y = clamp(this.pos.y, floorAt(this.pos.x, this.pos.z) + 0.4, HALL.ceiling - 1.2);
      } else {
        const ground = floorAt(this.pos.x, this.pos.z) + 1.62;
        this.pos.y += (ground - this.pos.y) * (1 - Math.exp(-dt * 8));
      }
      // gentle head bob while walking
      const bob = this.vel.length() > 0.001 && !this.fly ? Math.sin(performance.now() / 160) * 0.012 : 0;
      cam.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    } else {
      cam.position.copy(this.pos);
    }
    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this._applyFov(dt);
  }

  _applyFov(dt) {
    this.fov += (this.targetFov - this.fov) * (1 - Math.exp(-dt * 6));
    const f = this._effectiveFov(this.fov);
    if (Math.abs(this.camera.fov - f) > 0.01) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
  }

  // FOV values are authored for a landscape screen; on narrow/portrait
  // screens keep the same horizontal field of view instead.
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
    if (!c.shot || c.clock > c.until || (this.anim == null && c.drift == null)) {
      const shot = this._pickShot(ctx);
      c.shot = shot;
      c.clock = 0;
      c.until = shot.hold;
      const glide = shot.cut ? 0.001 : 3.2;
      this.flyTo(shot.pos, shot.look, glide, shot.fov);
      this.anim.after = () => { c.drift = { t: 0 }; };
      c.drift = null;
    }
    if (c.drift && c.shot) {
      // slow cinematic drift (truck + push) during the hold
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
    const slow = 14;
    const r = Math.random();
    const last = this.cine.shot?.kind;
    const dom = piece ? perf.dominantSection(t + 2, 8) : null;
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
    if (!piece || r < 0.28 || last === 'section' && r < 0.4) shot = wide();
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
      } else {
        if (sc.z < -6) dist += 1.5;
        const pos = look.clone().addScaledVector(toAud, dist).addScaledVector(lateral, 1.2).add(V(0, 0.55, 0));
        shot = { kind: 'section', pos, look, fov: 40, drift: lateral.clone().multiplyScalar(-0.9) };
      }
    } else shot = wide();
    // keep the lens out of the musicians' heads
    if (ctx.obstacles) {
      for (let k = 0; k < 8; k++) {
        const hit = ctx.obstacles.find((o) => o.distanceTo(shot.pos) < 0.95);
        if (!hit) break;
        const away = new THREE.Vector3().subVectors(shot.pos, shot.look).setY(0).normalize();
        shot.pos.addScaledVector(away, 0.45).add(V(0, 0.3, 0));
      }
    }
    shot.hold = slow + Math.random() * 6;
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
