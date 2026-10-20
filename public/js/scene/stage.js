// Stage manager: musicians walk on from the wings and sit down, the
// conductor comes and goes between pieces, everyone bows. Drives the root
// transforms of the characters; the rigs keep animating on top.
import * as THREE from 'three';
import { PODIUM, STAGE_Y } from '../layout.js';
import { floorAt } from './hall.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WALK_SPEED = 1.45;
export const DOORS = { L: V(-13.2, STAGE_Y, -5.6), R: V(13.2, STAGE_Y, -5.6) };
const WING = { L: V(-10.6, STAGE_Y, -4.4), R: V(10.6, STAGE_Y, -4.4) };
const smooth = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

class Walker {
  constructor(char, home, homeYaw, side, podium = false) {
    this.char = char;
    this.home = home.clone();
    this.homeYaw = homeYaw;
    this.side = side;
    this.podium = podium;
    this.state = 'seated'; // seated | walking | off | sitting | standing
    this.path = [];
    this.phase = Math.random() * 6;
    this.pos = home.clone();
    this.yaw = homeYaw;
    this.sit = 1; // 1 seated .. 0 standing
    this.faceYaw = null; // override while idle (conductor)
    this.bow = 0;
    this.bowTarget = 0;
    this.delay = 0;
  }

  teleportOff() {
    this.state = 'off';
    this.pos.copy(DOORS[this.side]);
    this.char.root.visible = false;
    this.sit = 0;
    this.char.setStanding(1);
  }

  walkTo(points, onArrive) {
    this.path = points.map((p) => p.clone());
    this.onArrive = onArrive;
    this.state = 'walking';
    this.char.root.visible = true;
    this.bowTarget = 0;
  }

  enter(delay = 0) {
    this.delay = delay;
    this.pendingEnter = true;
  }

  exit(delay = 0) {
    this.delay = delay;
    this.pendingExit = true;
  }

  update(dt) {
    const ch = this.char;
    if (this.delay > 0) {
      this.delay -= dt;
      return;
    }
    if (this.pendingEnter) {
      this.pendingEnter = false;
      const d = DOORS[this.side];
      const w = WING[this.side];
      const pts = [w, this.podium ? V(this.home.x - 0.9 * Math.sign(this.home.x - w.x || 1), STAGE_Y, this.home.z + 0.9) : this.home];
      if (this.podium) pts.push(this.home);
      this.pos.copy(d);
      this.walkTo(pts, () => {
        this.state = this.podium ? 'standing' : 'sitting';
        this.sitting = !this.podium;
      });
      return;
    }
    if (this.pendingExit) {
      this.pendingExit = false;
      const w = WING[this.side];
      const d = DOORS[this.side];
      const pts = this.podium ? [V(this.home.x, STAGE_Y, this.home.z + 0.9), w, d] : [w, d];
      this.walkTo(pts, () => this.teleportOff());
      return;
    }
    if (this.state === 'walking') {
      const target = this.path[0];
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      const wantYaw = Math.atan2(-dx, -dz);
      this.yaw = lerpAngle(this.yaw, wantYaw, 1 - Math.exp(-dt * 8));
      if (dist <= step) {
        this.pos.x = target.x;
        this.pos.z = target.z;
        this.path.shift();
        if (!this.path.length) {
          this.state = 'arrived';
          if (this.onArrive) this.onArrive();
        }
      } else {
        this.pos.x += (dx / dist) * step;
        this.pos.z += (dz / dist) * step;
      }
      this.phase += dt * 7.5;
      ch.walk(this.phase, 0.55);
      ch.setStanding(1);
      this.sit = 0;
      const y = this.podium && this.path.length <= 1 && dist < 1.2 ? STAGE_Y + 0.22 : floorAt(this.pos.x, this.pos.z);
      this.pos.y = smooth(this.pos.y, y, 10, dt);
      ch.root.position.copy(this.pos).add(V(0, Math.abs(Math.sin(this.phase)) * 0.02, 0));
      ch.root.rotation.y = this.yaw;
      return;
    }
    if (this.state === 'off') return;
    // at home: settle into the seat / onto the podium
    ch.walk(0, 0);
    if (this.sitting) {
      this.sit = smooth(this.sit, 1, 4, dt);
      if (this.sit > 0.98) { this.sit = 1; this.sitting = false; this.state = 'seated'; }
    }
    ch.setStanding(1 - this.sit);
    this.pos.lerp(this.home, 1 - Math.exp(-dt * 6));
    ch.root.position.copy(this.pos);
    const want = this.faceYaw ?? this.homeYaw;
    this.yaw = lerpAngle(this.yaw, want, 1 - Math.exp(-dt * 5));
    ch.root.rotation.y = this.yaw;
    this.bow = smooth(this.bow, this.bowTarget, 3, dt);
    ch.body.rotation.x += -0.55 * this.bow; // on top of the rig's sway
  }

  get idle() {
    return this.state === 'seated' || this.state === 'standing' || this.state === 'arrived' || this.state === 'off';
  }
}

export class StageManager {
  constructor(orchestra) {
    this.orch = orchestra;
    this.walkers = orchestra.players.map((p) => {
      const side = p.sid === 'piano' || p.chair.x < 0 ? 'L' : 'R';
      const w = new Walker(p.char, p.home, p.yaw, side);
      p.walker = w;
      return w;
    });
    const c = orchestra.conductor;
    this.conductor = new Walker(c.char, c.home, 0, 'L', true);
    c.walker = this.conductor;
    this.conductor.state = 'standing';
    this.onstage = true;
    this.conductorOn = true;
  }

  // everyone starts in the wings
  clearStage() {
    for (const w of this.walkers) w.teleportOff();
    this.conductor.teleportOff();
    this.onstage = false;
    this.conductorOn = false;
  }

  enterAll() {
    if (this.onstage) return;
    this.onstage = true;
    // strings first, then winds, brass, choir last - staggered by seat
    const order = ['vn1', 'vn2', 'va', 'vc', 'cb', 'harp', 'piano', 'fl', 'ob', 'cl', 'bn', 'hn', 'tp', 'timp', 'choir'];
    this.walkers.forEach((w) => {
      const p = this.orch.players.find((q) => q.walker === w);
      const k = order.indexOf(p.sid);
      w.enter(0.3 + k * 0.9 + p.ci * 0.7 + Math.random() * 0.4);
    });
  }

  exitAll() {
    if (!this.onstage) return;
    this.onstage = false;
    this.walkers.forEach((w, i) => w.exit(0.5 + Math.random() * 6 + (i % 5) * 0.4));
  }

  conductorEnter() {
    if (this.conductorOn) return;
    this.conductorOn = true;
    this.conductor.faceYaw = Math.PI; // greet the audience first
    this.conductor.enter(0.2);
  }

  conductorExit() {
    if (!this.conductorOn) return;
    this.conductorOn = false;
    this.conductor.bowTarget = 0;
    this.conductor.exit(0.1);
  }

  // yaw: Math.PI faces the audience, 0 faces the orchestra
  conductorFace(toAudience) {
    this.conductor.faceYaw = toAudience ? Math.PI : 0;
  }

  conductorBow(on) {
    this.conductor.bowTarget = on ? 1 : 0;
  }

  // musicians rise for a bow (strings stand, everyone bends)
  orchestraBow(on) {
    for (const w of this.walkers) {
      if (w.state !== 'seated' && w.state !== 'standing' && w.state !== 'arrived') continue;
      w.bowTarget = on ? 0.6 : 0;
    }
  }

  get allSeated() {
    return this.walkers.every((w) => w.state === 'seated' || w.state === 'standing' || w.state === 'arrived');
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
  }
}
