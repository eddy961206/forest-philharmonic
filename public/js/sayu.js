// A visit to the room of quiet contemplation (scene/sayuRoom.js), on the
// square's own page: the same you, the same keys and camera, a different
// scene. Free to go in, like the room it follows. What the visit adds:
// - your eyes getting used to the dark down the long corridor (the picture
//   starts dim and brightens over some seconds, as the corridor intends);
// - the film's low sound at the start, then near silence: a faint room
//   tone, your own steps on the old floor, a long soft tail to every sound;
// - standing still before the two figures ("가만히 바라보기"): your animal
//   rests its cheek on its paw, the camera settles behind your shoulder and
//   drifts slowly, everything on the screen fades away until you move;
// - a few other quiet visitors (not on phones).
// The square hands in what it owns (renderer, camera, you, the input, its
// sound) and takes the scene back with leave().
import * as THREE from 'three';
import { buildSayuRoom, SAYU, walkable, floorY, headroom, inRoom } from './scene/sayuRoom.js';
import { buildCharacter, setArm } from './scene/characters.js';
import { avatarInfo } from './scene/avatars.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const P = SAYU.platform;

// the eyes in the dark: the exposure from this, toward 1, over tau seconds
export const ADAPT = { from: 0.28, tau: 3.4 };
export const adaptation = (t) => 1 - (1 - ADAPT.from) * Math.exp(-Math.max(0, t) / ADAPT.tau);
// how near the figures you can stop and look (from the platform's middle)
export const LOOK_RANGE = 7.5;

let room = null; // built on the first visit, kept for the next

// ------------------------------------------------------------- the sound
function roomSound(ctx, out) {
  const t = ctx.currentTime;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, t);
  bus.gain.setTargetAtTime(1, t, 1.2);
  bus.connect(out);
  // a long, soft tail for a large hushed room
  const len = Math.floor(ctx.sampleRate * 2.8);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const verb = ctx.createConvolver();
  verb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  verb.connect(wet).connect(bus);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const loop = (filter, f, q, v) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = filter;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = v;
    s.connect(fl).connect(g);
    s.start(t, Math.random() * 2);
    return { s, g };
  };
  // the room's own faint tone
  const tone = loop('lowpass', 180, 0.5, 0.018);
  tone.g.connect(bus);
  // the film: a low pair of tones beating slowly, a breath of noise, and
  // now and then a high glassy note far off; loudest by the screen
  const film = ctx.createGain();
  film.gain.value = 0;
  film.connect(bus);
  film.connect(verb);
  const oscs = [55, 82.6, 110.3].map((f, i) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = [0.05, 0.035, 0.012][i];
    o.connect(g).connect(film);
    o.start(t);
    return o;
  });
  const breath = loop('bandpass', 320, 0.9, 0.05);
  breath.g.connect(film);
  const lfo = ctx.createOscillator();
  const lfoAmt = ctx.createGain();
  lfo.frequency.value = 0.05;
  lfoAmt.gain.value = 0.04;
  lfo.connect(lfoAmt).connect(breath.g.gain);
  lfo.start(t);
  let pingT = 0;
  const ping = () => {
    const at = ctx.currentTime + 0.02;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = [1318.5, 1567.98, 1760, 2093][Math.floor(Math.random() * 4)];
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.03, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 4.5);
    o.connect(g).connect(film);
    o.start(at);
    o.stop(at + 4.6);
  };
  // (what is heard, for the checks)
  const tap = ctx.createAnalyser();
  tap.fftSize = 2048;
  bus.connect(tap);
  let stopped = false;
  return {
    tap,
    // where you are: the film louder near it
    update(dt, x, z) {
      if (stopped) return;
      const d = Math.hypot(x - (SAYU.inWay[0][0] - SAYU.hall), z - (SAYU.media.z0 + SAYU.media.z1) / 2);
      film.gain.setTargetAtTime(0.9 * Math.max(0, 1 - d / 16) ** 2, ctx.currentTime, 0.4);
      if ((pingT -= dt) < 0) { pingT = 5 + Math.random() * 7; if (d < 14) ping(); }
    },
    // a soft step on the old wooden floor
    step() {
      if (stopped) return;
      const at = ctx.currentTime + 0.01;
      const s = ctx.createBufferSource();
      s.buffer = noise;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380 + Math.random() * 120;
      const g = ctx.createGain();
      const v = 0.05 + Math.random() * 0.02;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(v, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
      s.connect(lp).connect(g);
      g.connect(bus);
      g.connect(verb);
      s.start(at, Math.random() * 2);
      s.stop(at + 0.13);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const at = ctx.currentTime;
      bus.gain.setTargetAtTime(0, at, 0.35);
      setTimeout(() => {
        for (const o of [...oscs, lfo, tone.s, breath.s]) { try { o.stop(); } catch { /* already */ } }
        bus.disconnect();
      }, 2500);
    },
  };
}

// --------------------------------------------------- the pose of thinking
// Standing, the right paw at the cheek, the left arm across the waist under
// the right elbow, the head a little bowed toward the hand. Arms are in the
// body's frame (characters.js); REST is the square's arms hanging still.
const REST = { L: [V(-0.26, 0.5, 0.02), V(-0.2, 0, 0.6)], R: [V(0.26, 0.5, 0.02), V(0.2, 0, 0.6)] };
const CHEEK = V(0.177, -0.073, -0.259); // (on the skull, the paw just out of it)
const _t = V();
const _p = V();
const _c = V();
function thinkingPose(ch, w) {
  if (w < 0.001) { ch.head.rotation.set(0, 0, 0); return; }
  ch.head.rotation.set(-0.1 * w, 0, -0.12 * w);
  ch.root.updateMatrixWorld(true);
  _c.copy(CHEEK);
  ch.body.worldToLocal(ch.head.localToWorld(_c));
  setArm(ch, 'R', _t.lerpVectors(REST.R[0], _c, w), _p.lerpVectors(REST.R[1], V(0.3, -1, 0.1), w));
  setArm(ch, 'L', _t.lerpVectors(REST.L[0], V(0.1, ch.arms.R.shoulder.y - 0.2, -0.27), w), _p.lerpVectors(REST.L[1], V(-1, -0.5, 0), w));
}

// --------------------------------------------------------------- a visit
export function enterSayu(ctx) {
  const { renderer, camera, player, cam, keys, joy, sfx, toast, setAct, animateWalker, $ } = ctx;
  room ??= buildSayuRoom(renderer, { lite: ctx.lite, pixelRatio: () => renderer.getPixelRatio() });
  const { scene } = room;
  scene.add(player.char.root);
  for (const m of ctx.liteArms) scene.add(m);
  player.pos.set(SAYU.arrive.x, 0, SAYU.arrive.z);
  player.vel.set(0, 0, 0);
  player.yaw = 0; // (down the corridor)
  cam.yaw = 0;
  cam.pitch = 0.22;
  renderer.toneMappingExposure = ADAPT.from;
  // (the screen: the room's name, how to be in it)
  const h1 = $('pzTop').querySelector('h1');
  const before = { title: h1.textContent, hint: $('pzHint').textContent, quick: $('pzQuick').hidden };
  h1.textContent = '사유의 방';
  $('pzHint').textContent = '천천히 걸어 들어가요. 두 상 앞에서는 가만히 바라볼 수 있어요.';
  $('pzQuick').hidden = true;
  try { history.replaceState(null, '', `${location.pathname}?sayu`); } catch { /* file: */ }

  // the figures' faces, together: what you look at
  const faces = room.statues.reduce((v, s) => v.add(s.face), V()).multiplyScalar(1 / room.statues.length);
  const visit = { t: 0, inside: false, armed: false, still: 0, stillT: 0, lastStep: 0, sound: null, leaving: false };
  setTimeout(() => toast('불빛이 줄어들어요. 눈이 어둠에 익을 때까지 천천히 걸어요.', 4200), 900);

  // other visitors, quiet, going from one place to look from to another
  const visitors = [];
  if (!ctx.lite) {
    const kinds = ['rabbit', 'sheep', 'fox', 'cat', 'koala', 'mouse'].filter((s) => s !== player.char.spec.species);
    for (let i = 0; i < 2; i++) {
      const sp = kinds[(Math.floor(Math.random() * kinds.length) + i * 3) % kinds.length];
      const ch = buildCharacter({ species: sp, fur: avatarInfo(sp).fur, outfit: i ? 'dress' : 'tail', standing: true }, i ? '#c9a27e' : '#8fa7c9');
      ch.setStanding(1);
      scene.add(ch.root);
      // (to the sides and round the back: the front is left to you)
      const spot = (k) => {
        const a = [-1.4, 1.4, Math.PI - 0.6, Math.PI + 0.6, -2.3][k];
        return { x: P.x + Math.sin(a) * (P.rx + 1.9), z: P.z + Math.cos(a) * (P.rz + 2.1) };
      };
      const at = spot(i);
      visitors.push({ char: ch, pos: V(at.x, floorY(at.x, at.z), at.z), yaw: 0, phase: Math.random() * 6, wait: 6 + i * 9, to: null, spot, k: i, think: 0 });
    }
  }
  function updateVisitors(dt) {
    for (const v of visitors) {
      let sp = 0;
      if (v.to) {
        const dx = v.to.x - v.pos.x;
        const dz = v.to.z - v.pos.z;
        const d = Math.hypot(dx, dz);
        // (you in the way: wait for you to pass)
        const blocked = Math.hypot(player.pos.x - v.pos.x - dx / d * 0.6, player.pos.z - v.pos.z - dz / d * 0.6) < 0.9;
        if (d < 0.05) { v.to = null; v.wait = 12 + Math.random() * 16; } else if (!blocked) {
          const s = Math.min(d, 0.6 * dt);
          const nx = v.pos.x + (dx / d) * s;
          const nz = v.pos.z + (dz / d) * s;
          if (walkable(nx, nz)) { v.pos.x = nx; v.pos.z = nz; } else { v.to = null; v.wait = 2; }
          v.pos.y = floorY(v.pos.x, v.pos.z);
          v.yaw = smoothAngle(v.yaw, Math.atan2(-dx, -dz), 6, dt);
          sp = 0.6;
        }
      } else {
        v.yaw = smoothAngle(v.yaw, Math.atan2(-(faces.x - v.pos.x), -(faces.z - v.pos.z)), 3, dt);
        if ((v.wait -= dt) < 0) { v.k = (v.k + 1 + Math.floor(Math.random() * 3)) % 5; v.to = v.spot(v.k); }
      }
      animateWalker(v.char, v.pos, v.yaw, sp, v, dt);
      v.think = smooth(v.think, !v.to && v.wait > 3 && v === visitors[0] ? 1 : 0, 1.2, dt);
      thinkingPose(v.char, v.think);
    }
  }

  // stopping to look
  function lookStart() {
    visit.still = 1;
    visit.camYaw = cam.yaw;
    keys.clear();
    setAct(null, null);
    $('plaza').classList.add('still');
  }
  function lookEnd() {
    visit.still = 0;
    $('plaza').classList.remove('still');
    // (the camera goes on from where it is: no jump back behind you)
    cam.yaw = Math.atan2(camera.position.x - player.pos.x, camera.position.z - player.pos.z);
    cam.pitch = 0.22;
  }

  const _want = V();
  const _look = V();
  const place = {
    scene,
    walkable,
    floorY,
    // the camera stays in the air: pulled in along the line from your head
    // before a wall, kept under the rods and the corridor ceiling
    clampCamera(p, want) {
      const hx = p.x;
      const hz = p.z;
      let k = 1;
      for (let i = 1; i <= 20; i++) {
        const f = i / 20;
        if (headroom(hx + (want.x - hx) * f, hz + (want.z - hz) * f) < 0) { k = (i - 1) / 20; break; }
      }
      k = Math.max(0.1, k);
      want.x = hx + (want.x - hx) * k;
      want.z = hz + (want.z - hz) * k;
      const top = headroom(want.x, want.z);
      if (top > 0) want.y = Math.min(want.y, top);
    },
    // tapped: a figure walks you to the front, to look
    tap(ray) {
      if (!room.statues.some((s) => s.mesh && ray.intersectObject(s.mesh, false).length)) return null;
      return { x: P.x + (player.pos.x - P.x) * 0.2, z: P.z + P.rz + SAYU.keepOut + 1.6, then: 'look' };
    },
    arrived(then) { if (then === 'look') lookStart(); },
    // one moment of the visit (after you have moved)
    step(dt, elapsed, speed) {
      visit.t += dt;
      const p = player.pos;
      renderer.toneMappingExposure = adaptation(visit.t);
      room.update(dt, elapsed);
      if (!visit.sound && sfx.ctx) visit.sound = roomSound(sfx.ctx, sfx.out);
      visit.sound?.update(dt, p.x, p.z);
      // your steps
      const beat = Math.floor(player.phase / Math.PI);
      if (speed > 0.2 && beat !== visit.lastStep) visit.sound?.step();
      visit.lastStep = beat;
      if (!visit.inside && inRoom(p.x, p.z, 0.5)) {
        visit.inside = true;
        toast('흙벽에 계피 향이 은은한 방이에요. 유리가 없으니 천천히 한 바퀴 돌아봐요.', 4600);
      }
      updateVisitors(dt);
      // still before the figures: turned to them, the cheek on the paw
      if (visit.still && (keys.size || joy.active || cam.yaw !== visit.camYaw)) lookEnd(); // (a step, or a drag)
      if (visit.still) player.yaw = smoothAngle(player.yaw, Math.atan2(-(faces.x - p.x), -(faces.z - p.z)), 2.5, dt);
      visit.stillT = smooth(visit.stillT, visit.still, 1.4, dt);
      thinkingPose(player.char, visit.stillT);
      // the doors back to the square (a step away from where you came in first)
      const back = Math.max(p.z - SAYU.inWay[0][1], p.x < 0 ? p.z - SAYU.outWay.at(-1)[1] : -Infinity);
      if (back < -1.5) visit.armed = true;
      if (visit.armed && back > -0.75 && !visit.leaving) { visit.leaving = true; ctx.leave(); return; }
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      if (!visit.still && visit.inside && d < LOOK_RANGE && inRoom(p.x, p.z)) setAct('가만히 바라보기', lookStart);
      else if (!visit.still) setAct(null, null);
    },
    // the camera while you stand still: behind your shoulder, toward their
    // faces, drifting slowly (false: the square's own camera)
    camera(dt) {
      if (visit.inspect) {
        // (a fixed view for checking the figures: you and the others out of it)
        camera.position.set(...visit.inspect.from);
        camera.lookAt(...visit.inspect.at);
        return true;
      }
      if (visit.stillT < 0.02) return false;
      const p = player.pos;
      const dx = faces.x - p.x;
      const dz = faces.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      const drift = Math.sin(visit.t * 0.16);
      // (well to your side: your own head is not in front of them)
      const side = 1.2 + 0.2 * drift;
      _want.set(p.x - (dx / l) * 1.5 + (dz / l) * side, p.y + 1.45 + 0.05 * Math.sin(visit.t * 0.23), p.z - (dz / l) * 1.5 - (dx / l) * side);
      place.clampCamera(p, _want);
      camera.position.lerp(_want, 1 - Math.exp(-dt * 1.2 * visit.stillT));
      _look.set(faces.x, faces.y - 0.05, faces.z);
      camera.lookAt(_look);
      return visit.still > 0 || visit.stillT > 0.5;
    },
    leave() {
      visit.sound?.stop();
      if (visit.still) lookEnd();
      $('plaza').classList.remove('still');
      thinkingPose(player.char, 0);
      for (const v of visitors) { scene.remove(v.char.root); }
      renderer.toneMappingExposure = 1;
      h1.textContent = before.title;
      $('pzHint').textContent = before.hint;
      $('pzQuick').hidden = before.quick;
      try { history.replaceState(null, '', location.pathname); } catch { /* file: */ }
    },
    // QA: look from `from` at `at` (world points), with nobody in the way;
    // null gives the camera back
    inspect(view) {
      visit.inspect = view;
      player.char.root.visible = !view;
      for (const v of visitors) v.char.root.visible = !view;
    },
    get looking() { return visit.still > 0; },
    get heard() { return visit.sound?.tap || null; },
    get room() { return room; },
  };
  return place;
}

function smoothAngle(a, b, k, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}
