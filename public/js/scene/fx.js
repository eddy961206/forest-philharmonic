// Stage effects: confetti cannons, fireworks over the stage, a laser rig on
// the lighting truss, and the sound of a brass fanfare.
import * as THREE from 'three';
import { STAGE_Y } from '../layout.js';
import { glowTexture } from './materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------- confetti
function buildConfetti(scene, N = 700) {
  const geo = new THREE.PlaneGeometry(0.07, 0.1);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const colors = ['#ff5f7a', '#ffd166', '#6ee7b7', '#60a5fa', '#f0abfc', '#fff3c4', '#e6c07b'];
  const c = new THREE.Color();
  const P = [];
  for (let i = 0; i < N; i++) {
    mesh.setColorAt(i, c.set(colors[i % colors.length]));
    P.push({ p: V(0, -10, 0), v: V(), r: V(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: V(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4)), life: 0, alive: false });
  }
  mesh.instanceColor.needsUpdate = true;
  mesh.visible = false;
  scene.add(mesh);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let next = 0;
  let aliveCount = 0;
  return {
    burst(origin, dir, count = 180, speed = 9) {
      for (let k = 0; k < count; k++) {
        const it = P[next];
        next = (next + 1) % N;
        it.alive = true;
        it.life = rnd(4, 7);
        it.p.copy(origin);
        it.v.copy(dir).add(V(rnd(-0.5, 0.5), rnd(-0.2, 0.5), rnd(-0.5, 0.5))).normalize().multiplyScalar(speed * rnd(0.5, 1.1));
      }
      mesh.visible = true;
    },
    update(dt) {
      if (!mesh.visible) return;
      aliveCount = 0;
      for (let i = 0; i < N; i++) {
        const it = P[i];
        if (!it.alive) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); continue; }
        it.life -= dt;
        if (it.life <= 0 || it.p.y < -0.5) { it.alive = false; continue; }
        aliveCount++;
        // drag + flutter: confetti falls slowly and sways
        it.v.y -= 9.8 * dt;
        it.v.multiplyScalar(Math.exp(-dt * 2.6));
        it.v.y = Math.max(it.v.y, -1.3);
        it.p.addScaledVector(it.v, dt);
        it.p.x += Math.sin(it.r.x * 5 + it.life * 3) * dt * 0.4;
        it.r.addScaledVector(it.w, dt);
        e.set(it.r.x, it.r.y, it.r.z);
        q.setFromEuler(e);
        m4.compose(it.p, q, V(1, 1, 1));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (!aliveCount) mesh.visible = false;
    },
  };
}

// ------------------------------------------------------------ fireworks
function buildFireworks(scene, N = 2400) {
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: window.innerHeight / 2 }, uTex: { value: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)') } },
    vertexShader: /* glsl */`
      attribute float psize; attribute vec3 color; varying vec3 vC; uniform float uScale;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; uniform sampler2D uTex;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * t.a, t.a); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.visible = false;
  scene.add(pts);
  const P = Array.from({ length: N }, () => ({ alive: false, p: V(), v: V(), c: new THREE.Color(), life: 0, max: 1, s: 1 }));
  let next = 0;
  const flash = new THREE.PointLight('#ffffff', 0, 40, 1.5);
  flash.position.set(0, 12, -4);
  scene.add(flash);
  let flashT = 0;
  const palette = ['#ffd166', '#ff6b6b', '#4ecdc4', '#c084fc', '#f8fafc', '#fb923c', '#86efac'];
  const launches = [];
  function spawn(p, v, c, life, s) {
    const it = P[next];
    next = (next + 1) % N;
    it.alive = true;
    it.p.copy(p);
    it.v.copy(v);
    it.c.set(c);
    it.life = 0;
    it.max = life;
    it.s = s;
  }
  return {
    // schedule a show: n shells over `seconds`
    show(n = 8, seconds = 7) {
      for (let i = 0; i < n; i++) launches.push({ at: i * (seconds / n) + Math.random() * 0.5, x: rnd(-9, 9), z: rnd(-9, 2), y: rnd(10, 15), color: palette[i % palette.length] });
      pts.visible = true;
      this.clock = 0;
    },
    burst(at, color) {
      const n = 140 + Math.floor(Math.random() * 60);
      const hue2 = palette[Math.floor(Math.random() * palette.length)];
      for (let k = 0; k < n; k++) {
        const u = Math.random() * Math.PI * 2;
        const v = Math.acos(2 * Math.random() - 1);
        const sp = rnd(4, 7.5);
        spawn(at, V(Math.sin(v) * Math.cos(u) * sp, Math.cos(v) * sp, Math.sin(v) * Math.sin(u) * sp), k % 5 ? color : hue2, rnd(1.6, 2.6), rnd(0.28, 0.45));
      }
      flash.position.copy(at);
      flash.color.set(color);
      flashT = 0.25;
    },
    update(dt) {
      if (!pts.visible) return;
      this.clock = (this.clock || 0) + dt;
      for (let i = launches.length - 1; i >= 0; i--) {
        const L = launches[i];
        if (this.clock >= L.at) {
          launches.splice(i, 1);
          // rising trail then burst
          const base = V(L.x, STAGE_Y + 0.3, L.z);
          const top = V(L.x + rnd(-1, 1), L.y, L.z);
          const T = 0.9;
          for (let k = 0; k < 26; k++) {
            const f = k / 26;
            spawn(base.clone().lerp(top, f), V(0, 1.5, 0), '#ffe9b3', T * (1 - f) + 0.2, 0.14);
          }
          setTimeout(() => this.burst(top, L.color), T * 1000);
        }
      }
      flashT = Math.max(0, flashT - dt);
      flash.intensity = flashT > 0 ? 120 * (flashT / 0.25) : 0;
      let alive = 0;
      for (let i = 0; i < N; i++) {
        const it = P[i];
        if (!it.alive) { size[i] = 0; continue; }
        it.life += dt;
        if (it.life >= it.max) { it.alive = false; size[i] = 0; continue; }
        alive++;
        it.v.y -= 4.5 * dt;
        it.v.multiplyScalar(Math.exp(-dt * 1.4));
        it.p.addScaledVector(it.v, dt);
        pos[i * 3] = it.p.x; pos[i * 3 + 1] = it.p.y; pos[i * 3 + 2] = it.p.z;
        const k = 1 - it.life / it.max;
        const tw = 0.6 + 0.4 * Math.sin(it.life * 25 + i);
        col[i * 3] = it.c.r * k * tw; col[i * 3 + 1] = it.c.g * k * tw; col[i * 3 + 2] = it.c.b * k * tw;
        size[i] = it.s * (0.6 + k);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.psize.needsUpdate = true;
      mat.uniforms.uScale.value = window.innerHeight / 2;
      if (!alive && !launches.length) pts.visible = false;
    },
  };
}

// --------------------------------------------------------------- lasers
function buildLasers(scene, n = 8) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const beams = [];
  const colors = ['#ff3b6b', '#2ee6ff', '#b45cff', '#4dff88', '#ffd23b', '#ff7a2e', '#5b8bff', '#ff4ad5'];
  // truss above the stage front
  const truss = new THREE.Mesh(new THREE.BoxGeometry(16, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: '#2a2a2e', metalness: 0.7, roughness: 0.5 }));
  truss.position.set(0, 13.2, -1.5);
  scene.add(truss);
  for (let i = 0; i < n; i++) {
    const len = 22;
    const geo = new THREE.CylinderGeometry(0.035, 0.16, len, 8, 1, true);
    geo.translate(0, -len / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(-7 + (i / (n - 1)) * 14, 13.1, -1.5);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: colors[i % colors.length], toneMapped: false }));
    m.add(head);
    group.add(m);
    beams.push({ m, phase: i * 0.8, speed: 0.7 + (i % 3) * 0.25 });
  }
  let level = 0;
  let target = 0;
  return {
    set(on) { target = on ? 1 : 0; },
    update(dt, t, audio = 0.3) {
      level += (target - level) * Math.min(1, dt * 1.5);
      group.visible = level > 0.02;
      if (!group.visible) return;
      for (const b of beams) {
        const a = t * b.speed + b.phase;
        // sweep in slow figure-eights, snap a little on strong beats
        const rx = 0.35 + Math.sin(a * 1.3) * 0.35 + Math.sin(a * 0.37) * 0.15;
        const rz = Math.sin(a) * 0.55;
        b.m.rotation.set(rx, 0, rz);
        b.m.material.opacity = (0.45 + audio * 0.6) * level;
      }
    },
  };
}

// --------------------------------------------------------------- spots
// Moving-head colour wash on the stage floor for lively pieces
function buildWash(scene) {
  const lights = [];
  for (const [x, c] of [[-6, '#ff7ab6'], [6, '#7ad7ff']]) {
    const l = new THREE.SpotLight(c, 0, 30, 0.5, 0.7, 1);
    l.position.set(x, 12.5, 2);
    l.target.position.set(0, STAGE_Y, -5);
    scene.add(l, l.target);
    lights.push(l);
  }
  let level = 0;
  let target = 0;
  return {
    set(on) { target = on ? 1 : 0; },
    update(dt, t) {
      level += (target - level) * Math.min(1, dt * 1.2);
      lights.forEach((l, i) => {
        l.intensity = 2.2 * level;
        l.target.position.set(Math.sin(t * 0.6 + i * 2) * 5, STAGE_Y, -5 + Math.cos(t * 0.45 + i) * 3);
      });
    },
  };
}

export function buildFX(scene, engine) {
  const confetti = buildConfetti(scene);
  const fireworks = buildFireworks(scene);
  const lasers = buildLasers(scene);
  const wash = buildWash(scene);
  return {
    confetti, fireworks, lasers, wash,
    confettiCannons() {
      confetti.burst(V(-11, STAGE_Y + 0.4, 0.5), V(0.55, 1, 0.5), 260, 11);
      confetti.burst(V(11, STAGE_Y + 0.4, 0.5), V(-0.55, 1, 0.5), 260, 11);
      setTimeout(() => confetti.burst(V(0, STAGE_Y + 0.4, 1.2), V(0, 1, 0.3), 180, 10), 700);
    },
    fireworksShow() { fireworks.show(9, 8); },
    // a short brass fanfare: D major, trumpets + horns + timpani
    fanfare(when = engine.now + 0.05) {
      const T = [[0, 74, 0.22], [0.25, 74, 0.22], [0.5, 74, 0.22], [0.75, 78, 0.5], [1.3, 81, 0.5], [1.85, 86, 1.6]];
      for (const [t, m, d] of T) {
        engine.playNote({ section: 'tp', inst: 'trumpet', midi: m, vel: 118, when: when + t, dur: d, gain: 0.9 });
        engine.playNote({ section: 'hn', inst: 'horn', midi: m - 12, vel: 110, when: when + t + 0.01, dur: d, gain: 0.7 });
      }
      for (const [t, m] of [[0, 50], [0.25, 50], [0.5, 50], [0.75, 45], [1.3, 50], [1.85, 50], [2.1, 50], [2.35, 45], [2.6, 50]]) {
        engine.playNote({ section: 'timp', inst: 'timpani', midi: m, vel: 120, when: when + t, dur: 0.8, gain: 0.9 });
      }
      engine.playNote({ section: 'timp', inst: 'bells', midi: 74, vel: 110, when: when + 1.85, dur: 3, gain: 0.5 });
    },
    update(dt, t, audio) {
      confetti.update(dt);
      fireworks.update(dt);
      lasers.update(dt, t, audio);
      wash.update(dt, t);
    },
  };
}
