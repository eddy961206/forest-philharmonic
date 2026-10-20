// Stage manager: musicians come in through the doors in the shell, walk
// around the furniture and up the riser steps to their chairs, sit down;
// the conductor comes and goes between pieces; everyone rises to bow.
// Routes come from an A* over the real stage floor, so every height change
// happens on a visible step. Drives the root transforms of the characters;
// the rigs keep animating on top.
import * as THREE from 'three';
import { NavGrid } from './navgrid.js';
import { DOORS, floorAt } from './hallplan.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WALK_SPEED = 1.25;
const SPACING = 1.05; // seconds between musicians through the same door
const smooth = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function pathLength(p) {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
  return L;
}

class Walker {
  constructor(char, home, homeYaw, door, { podium = false, standing = false } = {}) {
    this.char = char;
    this.home = home.clone();
    this.homeYaw = homeYaw;
    this.door = door;
    this.podium = podium;
    this.standingRole = standing; // choir / conductor never sit
    this.state = 'seated'; // seated | walking | off | sitting | standing
    this.path = [];
    this.phase = Math.random() * 6;
    this.pos = home.clone();
    this.yaw = homeYaw;
    this.sit = standing ? 0 : 1; // 1 seated .. 0 standing
    this.sitTarget = this.sit;
    this.faceYaw = null; // override while idle (conductor)
    this.bow = 0;
    this.bowTarget = 0;
    this.delay = 0;
    this.speed = WALK_SPEED * (0.92 + Math.random() * 0.16);
  }

  teleportOff() {
    this.state = 'off';
    const b = DOORS.find((d) => d.side === this.door).behind;
    this.pos.set(b.x, floorAt(b.x, b.z), b.z);
    this.char.root.visible = false;
    this.sit = 0;
    this.sitTarget = 0;
    this.char.setStanding(1);
  }

  walk(points, onArrive, delay = 0) {
    this.path = points.map((p) => V(p.x, 0, p.z));
    this.onArrive = onArrive;
    this.delay = delay;
    this.state = 'queued';
    this.bowTarget = 0;
  }

  update(dt) {
    const ch = this.char;
    if (this.state === 'queued') {
      this.delay -= dt;
      if (this.delay > 0) {
        if (this.wasSeated) this._idle(dt);
        return;
      }
      this.state = 'walking';
      this.char.root.visible = true;
      this.sitTarget = 0;
    }
    if (this.state === 'walking') {
      // stand up first if we were sitting
      if (this.sit > 0.05) {
        this.sit = smooth(this.sit, 0, 6, dt);
        ch.setStanding(1 - this.sit);
        ch.root.position.copy(this.pos);
        return;
      }
      this.sit = 0;
      const target = this.path[0];
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const fy = floorAt(this.pos.x, this.pos.z);
      const onSteps = Math.abs(fy - this.pos.y) > 0.03;
      const step = this.speed * (onSteps ? 0.75 : 1) * dt;
      const wantYaw = Math.atan2(-dx, -dz);
      this.yaw = lerpAngle(this.yaw, wantYaw, 1 - Math.exp(-dt * 7));
      // turn on the spot at sharp corners instead of moonwalking
      let facing = Math.cos(this.yaw - wantYaw);
      facing = Math.max(0, facing);
      if (dist <= step) {
        this.pos.x = target.x;
        this.pos.z = target.z;
        this.path.shift();
        if (!this.path.length) {
          this.state = 'arrived';
          if (this.onArrive) this.onArrive();
        }
      } else {
        const s = step * (0.25 + 0.75 * facing);
        this.pos.x += (dx / dist) * s;
        this.pos.z += (dz / dist) * s;
      }
      this.phase += dt * 7.2 * (0.4 + 0.6 * facing);
      ch.walk(this.phase, 0.5 * (0.4 + 0.6 * facing));
      ch.setStanding(1);
      // feet follow the floor; steps are short and quick
      this.pos.y = smooth(this.pos.y, floorAt(this.pos.x, this.pos.z), 14, dt);
      ch.root.position.copy(this.pos).add(V(0, Math.abs(Math.sin(this.phase)) * 0.025, 0));
      ch.root.rotation.y = this.yaw;
      this._swingArms(true);
      return;
    }
    if (this.state === 'off') return;
    this._idle(dt);
  }

  _idle(dt) {
    const ch = this.char;
    ch.walk(0, 0);
    this.sit = smooth(this.sit, this.sitTarget, 4.5, dt);
    if (Math.abs(this.sit - this.sitTarget) < 0.01) this.sit = this.sitTarget;
    if (this.state === 'sitting' && this.sit === this.sitTarget) this.state = this.sitTarget ? 'seated' : 'standing';
    ch.setStanding(1 - this.sit);
    this.pos.lerp(this.home, 1 - Math.exp(-dt * 6));
    ch.root.position.copy(this.pos);
    const want = this.faceYaw ?? this.homeYaw;
    this.yaw = lerpAngle(this.yaw, want, 1 - Math.exp(-dt * 5));
    ch.root.rotation.y = this.yaw;
    this.bow = smooth(this.bow, this.bowTarget, 3, dt);
    ch.body.rotation.x += -0.55 * this.bow; // on top of the rig's sway
    this._swingArms(false);
  }

  _swingArms(on) {
    this.char.walking = on;
    this.char.walkPhase = this.phase;
  }

  get idle() {
    return this.state === 'seated' || this.state === 'standing' || this.state === 'arrived' || this.state === 'off';
  }

  get atHome() {
    return this.state === 'seated' || this.state === 'standing' || this.state === 'arrived' || this.state === 'sitting';
  }
}

export class StageManager {
  constructor(orchestra) {
    this.orch = orchestra;
    this.walkers = orchestra.players.map((p) => {
      const door = p.home.x < 0 || p.sid === 'piano' ? 'L' : 'R';
      const w = new Walker(p.char, p.home, p.yaw, door, { standing: p.sid === 'choir' });
      w.player = p;
      p.walker = w;
      return w;
    });
    const c = orchestra.conductor;
    this.conductor = new Walker(c.char, c.home, 0, 'L', { podium: true, standing: true });
    c.walker = this.conductor;
    this.conductor.state = 'standing';
    this.onstage = true;
    this.conductorOn = true;

    // plan every route once over the furnished stage
    this.nav = new NavGrid();
    for (const ob of orchestra.obstacles) {
      if (ob.box) this.nav.addBox(ob.box);
      else this.nav.addCircle(ob.x, ob.z, ob.r);
    }
    for (const w of [...this.walkers, this.conductor]) {
      const d = DOORS.find((q) => q.side === w.door);
      // the conductor walks round to the front of the podium, then steps up
      const goal = w.podium ? { x: w.home.x, z: w.home.z } : { x: w.home.x, z: w.home.z };
      let p = this.nav.find(d.inside.x, d.inside.z, goal.x, goal.z);
      if (!p) {
        console.warn('no stage route for', w.player?.sid ?? 'conductor', w.player?.ci);
        p = [d.inside, goal];
      }
      w.route = [d.behind, d.pos, ...p];
      w.routeLen = pathLength(w.route);
    }
  }

  // everyone starts in the wings
  clearStage() {
    for (const w of this.walkers) w.teleportOff();
    this.conductor.teleportOff();
    this.onstage = false;
    this.conductorOn = false;
  }

  _arrive(w) {
    return () => {
      if (w.standingRole) { w.state = 'standing'; w.sitTarget = 0; } else { w.state = 'sitting'; w.sitTarget = 1; }
    };
  }

  enterAll() {
    if (this.onstage) return;
    this.onstage = true;
    // per door: the musician going farthest goes first, so nobody has to
    // squeeze past a colleague who already sat down
    for (const side of ['L', 'R']) {
      const list = this.walkers.filter((w) => w.door === side).sort((a, b) => b.routeLen - a.routeLen);
      let t = 0.4;
      for (const w of list) {
        w.wasSeated = false;
        w.teleportOff();
        w.walk(w.route, this._arrive(w), t);
        t += SPACING + Math.random() * 0.35;
      }
    }
  }

  exitAll() {
    if (!this.onstage) return;
    this.onstage = false;
    for (const side of ['L', 'R']) {
      const list = this.walkers.filter((w) => w.door === side).sort((a, b) => a.routeLen - b.routeLen);
      let t = 0.6;
      for (const w of list) {
        w.wasSeated = true;
        w.walk([...w.route].reverse().slice(1), () => w.teleportOff(), t);
        t += SPACING * 0.9 + Math.random() * 0.3;
      }
    }
  }

  conductorEnter() {
    if (this.conductorOn) return;
    this.conductorOn = true;
    const c = this.conductor;
    c.faceYaw = Math.PI; // greet the audience first
    c.teleportOff();
    c.walk(c.route, () => { c.state = 'standing'; }, 0.2);
  }

  conductorExit() {
    if (!this.conductorOn) return;
    this.conductorOn = false;
    const c = this.conductor;
    c.bowTarget = 0;
    c.wasSeated = true;
    c.walk([...c.route].reverse().slice(1), () => c.teleportOff(), 0.1);
  }

  // yaw: Math.PI faces the audience, 0 faces the orchestra
  conductorFace(toAudience) {
    this.conductor.faceYaw = toAudience ? Math.PI : 0;
  }

  conductorBow(on) {
    this.conductor.bowTarget = on ? 1 : 0;
  }

  // the orchestra rises for a bow, then sits again
  orchestraRise(on) {
    for (const w of this.walkers) {
      if (!w.atHome) continue;
      if (!w.standingRole) { w.sitTarget = on ? 0 : 1; w.state = 'sitting'; }
    }
  }

  orchestraBow(on) {
    for (const w of this.walkers) {
      if (!w.atHome) continue;
      w.bowTarget = on ? 0.45 : 0;
    }
  }

  get allSeated() {
    return this.walkers.every((w) => w.state === 'seated' || w.state === 'standing');
  }

  get conductorReady() {
    return this.conductor.state === 'standing' || this.conductor.state === 'arrived';
  }

  get conductorOffstage() {
    return this.conductor.state === 'off';
  }

  get allOffstage() {
    return this.walkers.every((w) => w.state === 'off');
  }

  update(dt) {
    for (const w of this.walkers) w.update(dt);
    this.conductor.update(dt);
    // doors swing open for whoever is passing
    for (const d of DOORS) {
      d.want = false;
      for (const w of [...this.walkers, this.conductor]) {
        if (w.state !== 'walking' || w.door !== d.side) continue;
        if (Math.hypot(w.pos.x - d.pos.x, w.pos.z - d.pos.z) < 2.0) { d.want = true; break; }
      }
    }
  }
}
