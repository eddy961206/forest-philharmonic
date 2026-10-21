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
      // feet follow the floor; steps are short and quick (and never more
      // than a few centimetres off it, even crossing two treads at once)
      const under = floorAt(this.pos.x, this.pos.z);
      this.pos.y = smooth(this.pos.y, under, 22, dt);
      this.pos.y = Math.min(under + 0.06, Math.max(under - 0.04, this.pos.y));
      ch.root.position.copy(this.pos).add(V(0, Math.abs(Math.sin(this.phase)) * 0.025, 0));
      ch.root.rotation.y = this.yaw;
      this._swingArms(true);
      return;
    }
    if (this.state === 'off' || this.state === 'away') return;
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

  // (stand: a soloist stays on their feet to take the welcome, see greet)
  _arrive(w, stand = false) {
    return () => {
      if (w.standingRole || stand) { w.state = 'standing'; w.sitTarget = 0; } else { w.state = 'sitting'; w.sitTarget = 1; }
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
    // (only those on stage: with rosters some may already be off)
    const on = this.walkers.filter((w) => w.state !== 'off' && !w.leaving);
    if (on.length) this.sendOff(on);
    this.onstage = false;
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

  // ------------------------------------------------------------ the roster
  // Who plays a piece changes from piece to piece: players are named by
  // 'section:chair'. change() sends off whoever is not wanted (unless they
  // are kept for the next piece) and calls on whoever is missing; exits
  // first, then the entries - farthest seat first through each door, so
  // nobody squeezes past a colleague.
  static key(w) { return `${w.player.sid}:${w.player.ci}`; }

  // the players on stage (or walking on): not off, and not on their way out
  onstageKeys() {
    const out = new Set();
    for (const w of this.walkers) if (w.state !== 'off' && !w.leaving) out.add(StageManager.key(w));
    return out;
  }

  plan(target, keep = new Set()) {
    const exits = [];
    const enters = [];
    for (const w of this.walkers) {
      const k = StageManager.key(w);
      const on = w.state !== 'off' && !w.leaving;
      if (on && !target.has(k) && !keep.has(k)) exits.push(w);
      if (!on && target.has(k)) enters.push(w);
    }
    return { exits, enters };
  }

  // (leaving needs less room between them than arriving: nobody sits down
  // in the way)
  sendOff(list, spacing = SPACING * 0.55) {
    for (const side of ['L', 'R']) {
      const mine = list.filter((w) => w.door === side).sort((a, b) => a.routeLen - b.routeLen);
      let t = 0.5;
      for (const w of mine) {
        w.wasSeated = w.state === 'seated' || w.state === 'standing';
        w.leaving = true;
        w.walk([...w.route].reverse().slice(1), () => { w.leaving = false; w.teleportOff(); }, t);
        t += spacing + Math.random() * 0.3;
      }
    }
    this.onstage = this.walkers.some((w) => w.state !== 'off' && !w.leaving);
  }

  callOn(list, spacing = SPACING, { stand = false } = {}) {
    for (const side of ['L', 'R']) {
      const mine = list.filter((w) => w.door === side).sort((a, b) => b.routeLen - a.routeLen);
      let t = 0.4;
      for (const w of mine) {
        w.wasSeated = false;
        w.leaving = false;
        w.teleportOff();
        w.walk(w.route, this._arrive(w, stand), t);
        t += spacing + Math.random() * 0.35;
      }
    }
    if (list.length) this.onstage = true;
  }

  // ------------------------------------------------------- the interval
  // A player who is off stage can be somewhere else for a while (practising
  // in the foyer, sitting in a seat that was left empty): placed there,
  // seated, not walked by us until given back.
  borrow(key, pos, yaw, { sit = true } = {}) {
    const w = this.walkers.find((q) => StageManager.key(q) === key);
    if (!w || (w.state !== 'off' && w.state !== 'away')) return null;
    w.state = 'away';
    w.path = [];
    w.leaving = false;
    w.pos.set(pos.x, pos.y, pos.z);
    w.yaw = yaw;
    w.sit = w.sitTarget = sit ? 1 : 0;
    w.bow = w.bowTarget = 0;
    w.char.root.visible = true;
    w.char.setStanding(1 - w.sit);
    w.char.root.position.copy(w.pos);
    w.char.root.rotation.y = yaw;
    w.char.walk(0, 0);
    return w;
  }

  giveBack(w) {
    if (w && w.state === 'away') w.teleportOff();
  }

  // everyone in the list has sat down (or stands in place, the choir)
  arrived(list) { return list.every((w) => w.state === 'seated' || w.state === 'standing'); }
  gone(list) { return list.every((w) => w.state === 'off'); }

  // straight to a roster (arriving late, or skipping ahead)
  snapRoster(keys) {
    for (const w of this.walkers) {
      if (keys.has(StageManager.key(w))) this._snapHome(w);
      else { w.path = []; w.leaving = false; w.teleportOff(); }
    }
    this.onstage = keys.size > 0;
  }

  _snapHome(w) {
    w.path = [];
    w.leaving = false;
    w.state = w.standingRole ? 'standing' : 'seated';
    w.sit = w.sitTarget = w.standingRole ? 0 : 1;
    w.bow = w.bowTarget = 0;
    w.pos.copy(w.home);
    w.yaw = w.homeYaw;
    w.char.root.visible = true;
    w.char.setStanding(1 - w.sit);
    w.char.root.position.copy(w.pos);
    w.char.root.rotation.y = w.yaw;
  }

  // a soloist (or a small group) greets the audience: up, a bow, down again
  greet(list, on) {
    for (const w of list) {
      if (!w.atHome) continue;
      if (!w.standingRole) { w.sitTarget = on ? 0 : 1; w.state = 'sitting'; }
      w.bowTarget = on ? 0.5 : 0;
      // turned to the house for the bow, back to the instrument after
      w.faceYaw = on ? Math.atan2(w.home.x, w.home.z - 30) : null; // (forward is -z)
    }
  }

  // Watching together, arriving late: put everyone where the show already
  // is - the orchestra in place, the conductor on the podium or not
  snapOnstage() {
    this.onstage = true;
    for (const w of this.walkers) {
      w.leaving = false;
      w.path = [];
      w.state = w.standingRole ? 'standing' : 'seated';
      w.sit = w.sitTarget = w.standingRole ? 0 : 1;
      w.bow = w.bowTarget = 0;
      w.pos.copy(w.home);
      w.yaw = w.homeYaw;
      w.char.root.visible = true;
      w.char.setStanding(1 - w.sit);
      w.char.root.position.copy(w.pos);
      w.char.root.rotation.y = w.yaw;
    }
  }

  snapConductor(on) {
    const c = this.conductor;
    this.conductorOn = on;
    c.bow = c.bowTarget = 0;
    if (!on) { c.path = []; c.teleportOff(); return; }
    c.path = [];
    c.state = 'standing';
    c.faceYaw = 0;
    c.pos.copy(c.home);
    c.yaw = 0;
    c.char.root.visible = true;
    c.char.setStanding(1);
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
