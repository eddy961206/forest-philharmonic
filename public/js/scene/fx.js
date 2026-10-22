// Stage effects: confetti cannons, fireworks over the stage, a laser rig on
// the lighting truss, and the sound of a brass fanfare.
import * as THREE from 'three';
import { STAGE_Y } from '../layout.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowTexture } from './materials.js';
import { HALL } from './hallplan.js';

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
  const unitScale = V(1, 1, 1);
  const scatter = V();
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
        it.v.copy(dir).add(scatter.set(rnd(-0.5, 0.5), rnd(-0.2, 0.5), rnd(-0.5, 0.5))).normalize().multiplyScalar(speed * rnd(0.5, 1.1));
      }
      mesh.visible = true;
    },
    update(dt) {
      if (!mesh.visible) return;
      aliveCount = 0;
      const drag = Math.exp(-dt * 2.6);
      for (let i = 0; i < N; i++) {
        const it = P[i];
        if (!it.alive) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); continue; }
        it.life -= dt;
        if (it.life <= 0 || it.p.y < -0.5) {
          it.alive = false;
          m4.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, m4);
          continue;
        }
        aliveCount++;
        // drag + flutter: confetti falls slowly and sways
        it.v.y -= 9.8 * dt;
        it.v.multiplyScalar(drag);
        it.v.y = Math.max(it.v.y, -1.3);
        it.p.addScaledVector(it.v, dt);
        it.p.x += Math.sin(it.r.x * 5 + it.life * 3) * dt * 0.4;
        it.r.addScaledVector(it.w, dt);
        e.set(it.r.x, it.r.y, it.r.z);
        q.setFromEuler(e);
        m4.compose(it.p, q, unitScale);
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
  flash.visible = false;
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
      // (low and to the front, as stage pyrotechnics are: up under the
      // ceiling they burst above the picture of anyone in the stalls)
      for (let i = 0; i < n; i++) launches.push({ at: i * (seconds / n) + Math.random() * 0.5, x: rnd(-8, 8), z: rnd(-6, 1), y: rnd(5, 7.5), color: palette[i % palette.length] });
      pts.visible = true;
      this.clock = 0;
    },
    burst(at, color) {
      // A delayed shell may arrive after its rising trail has died away.
      pts.visible = true;
      const n = 140 + Math.floor(Math.random() * 60);
      const hue2 = palette[Math.floor(Math.random() * palette.length)];
      for (let k = 0; k < n; k++) {
        const u = Math.random() * Math.PI * 2;
        const v = Math.acos(2 * Math.random() - 1);
        const sp = rnd(3, 5.5);
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
      flash.visible = flashT > 0;
      let alive = 0;
      const drag = Math.exp(-dt * 1.4);
      for (let i = 0; i < N; i++) {
        const it = P[i];
        if (!it.alive) { size[i] = 0; continue; }
        it.life += dt;
        if (it.life >= it.max) { it.alive = false; size[i] = 0; continue; }
        alive++;
        it.v.y -= 4.5 * dt;
        it.v.multiplyScalar(drag);
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

// ------------------------------------------------------- moving lights
// Not lasers: a few moving heads on the truss whose soft beams of warm
// white, champagne and rose sweep slowly through the haze above the stage.
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uLen: { value: 16 } },
    vertexShader: /* glsl */`
      varying float vT; varying vec3 vN; varying vec3 vView;
      uniform float uLen;
      void main(){
        vT = -position.y / uLen;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vT; varying vec3 vN; varying vec3 vView;
      uniform float uOpacity; uniform vec3 uColor;
      void main(){
        float edge = pow(abs(dot(vN, vView)), 2.0);        // soft edges
        float fall = smoothstep(0.0, 0.06, vT) * (1.0 - smoothstep(0.25, 1.0, vT)); // fades into the haze
        gl_FragColor = vec4(uColor, uOpacity * edge * fall);
      }`,
  });
}

function buildLasers(scene, n = 6) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const beams = [];
  const colors = ['#ffe9c8', '#ffd59a', '#f6c7b8', '#fff1dc', '#ffd59a', '#ffe9c8'];
  // A lighting truss over the stage front. It lives up in the ceiling and
  // is flown in on two wires only for the lively pieces, then flown out.
  const Y_SHOW = 13.2;
  const Y_HIDDEN = HALL.ceiling + 0.6;
  const rig = new THREE.Group();
  group.add(rig);
  const metal = new THREE.MeshStandardMaterial({ color: '#3a3b40', metalness: 0.8, roughness: 0.45 });
  const parts = [];
  const L = 16;
  const corners = [[0, 0.17], [-0.15, -0.09], [0.15, -0.09]]; // triangular section (y, z offsets)
  for (const [cy, cz] of corners) {
    parts.push(new THREE.CylinderGeometry(0.025, 0.025, L, 8).rotateZ(Math.PI / 2).translate(0, cy, cz));
  }
  for (let x = -L / 2; x <= L / 2 + 1e-3; x += 0.5) {
    // lacing between the chords
    for (let k = 0; k < 3; k++) {
      const [ay, az] = corners[k];
      const [by, bz] = corners[(k + 1) % 3];
      const a = new THREE.Vector3(x, ay, az);
      const b = new THREE.Vector3(Math.min(L / 2, x + 0.25), by, bz);
      const d = b.clone().sub(a);
      const c = new THREE.CylinderGeometry(0.009, 0.009, d.length(), 5);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()));
      c.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      parts.push(c);
    }
  }
  const fixtureX = [];
  for (let i = 0; i < n; i++) fixtureX.push(-6.5 + (i / (n - 1)) * 13);
  for (const x of fixtureX) {
    parts.push(new THREE.BoxGeometry(0.05, 0.16, 0.05).translate(x, -0.17, 0));
    parts.push(new THREE.CylinderGeometry(0.11, 0.13, 0.26, 12).translate(x, -0.36, 0));
  }
  const truss = new THREE.Mesh(mergeGeometries(parts), metal);
  rig.add(truss);
  // the two wires up to the ceiling grid (their length follows the rig)
  const wires = [-6.5, 6.5].map((x) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 4).translate(0, 0.5, 0), metal);
    w.position.set(x, 0.17, 0);
    rig.add(w);
    return w;
  });
  const lens = new THREE.MeshStandardMaterial({ color: '#1a1712', emissive: '#ffdcae', emissiveIntensity: 0 });
  for (let i = 0; i < n; i++) {
    const len = 16;
    const geo = new THREE.CylinderGeometry(0.07, 1.25, len, 40, 1, true);
    geo.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(geo, beamMaterial(colors[i % colors.length]));
    m.position.set(fixtureX[i], -0.5, 0);
    m.frustumCulled = false;
    m.renderOrder = 10;
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20).rotateX(Math.PI / 2), lens);
    head.position.y = -0.005;
    m.add(head);
    rig.add(m);
    beams.push({ m, phase: i * 1.3, speed: 0.22 + (i % 3) * 0.06, side: i < n / 2 ? -1 : 1 });
  }
  rig.position.set(0, Y_HIDDEN, -1.5);
  let level = 0; // beams
  let drop = 0; // 0 = up in the ceiling, 1 = in position over the stage
  let target = 0;
  return {
    set(on) { target = on ? 1 : 0; },
    update(dt, t, audio = 0.3) {
      // fly in first, then light up; go dark first, then fly out
      const inPlace = drop > 0.985;
      const dropTarget = target ? 1 : level < 0.03 ? 0 : 1;
      drop += (dropTarget - drop) * Math.min(1, dt * 0.9);
      level += ((target && inPlace ? 1 : 0) - level) * Math.min(1, dt * 1.5);
      group.visible = drop > 0.002;
      if (!group.visible) return;
      const e = drop * drop * (3 - 2 * drop);
      rig.position.y = Y_HIDDEN + (Y_SHOW - Y_HIDDEN) * e;
      for (const w of wires) w.scale.y = Math.max(0.01, HALL.ceiling - rig.position.y - 0.17);
      lens.emissiveIntensity = 1.6 * level;
      for (const b of beams) {
        b.m.visible = level > 0.01;
        const a = t * b.speed + b.phase;
        // slow, graceful sweeps over the orchestra, mirrored left and right
        const rx = 0.32 + Math.sin(a) * 0.18;
        const rz = b.side * (0.18 + Math.sin(a * 0.7 + 1) * 0.16);
        b.m.rotation.set(rx, 0, rz);
        b.m.material.uniforms.uOpacity.value = (0.07 + audio * 0.1) * level;
      }
    },
  };
}

// --------------------------------------------------------------- spots
// Moving-head colour wash on the stage floor for lively pieces
function buildWash(scene) {
  const lights = [];
  for (const [x, c] of [[-6, '#ffc58a'], [6, '#f3b9a8']]) {
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
        l.visible = level > 0.01; // an unlit light still costs every pixel
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
