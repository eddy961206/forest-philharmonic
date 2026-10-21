// Ambient particles: fireflies drifting under the canopy and dust motes
// hanging in the stage light. GPU-animated point sprites.
import * as THREE from 'three';
import { HALL } from './hall.js';
import { STAGE_Y } from '../layout.js';

function pointsMaterial({ color, size, flicker, opacity }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uFlicker: { value: flicker },
      uOpacity: { value: opacity },
      uScale: { value: window.innerHeight / 2 },
      // the encore: the fireflies gather into a slow swirl of lanterns over the house
      uGather: { value: 0 },
      uCenter: { value: new THREE.Vector3(0, 9, 12) },
      uRadius: { value: 6 },
    },
    vertexShader: /* glsl */`
      attribute vec3 seed;
      uniform float uTime; uniform float uSize; uniform float uScale;
      uniform float uGather; uniform vec3 uCenter; uniform float uRadius;
      varying float vA;
      uniform float uFlicker;
      void main(){
        vec3 p = position;
        float t = uTime * (0.15 + seed.x * 0.2);
        p.x += sin(t + seed.y * 6.28) * 0.9 + sin(t * 2.3 + seed.z * 4.0) * 0.25;
        p.y += sin(t * 0.8 + seed.z * 6.28) * 0.6;
        p.z += cos(t * 0.9 + seed.x * 6.28) * 0.9;
        float a = seed.x * 6.2832 + uTime * (0.12 + seed.z * 0.1);
        float r = uRadius * (0.3 + 0.7 * sqrt(seed.y));
        vec3 g = uCenter + vec3(cos(a) * r, (seed.z - 0.5) * 2.4 + sin(uTime * 0.7 + seed.x * 9.0) * 0.3, sin(a) * r * 0.7);
        float k = smoothstep(seed.z * 0.4, seed.z * 0.4 + 0.6, uGather);
        p = mix(p, g, k);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uScale / -mv.z * (0.6 + seed.y * 0.8) * (1.0 + 2.2 * k);
        float pulse = 0.5 + 0.5 * sin(uTime * (1.2 + seed.z * 2.5) + seed.x * 20.0);
        vA = mix(1.0, pow(pulse, 3.0), uFlicker);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a;
        gl_FragColor = vec4(uColor, a * vA * uOpacity);
      }`,
  });
}

export function buildEffects(scene, { fireflies = 160, dust = 500 } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const mk = (n, region, matOpts) => {
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = region.x[0] + Math.random() * (region.x[1] - region.x[0]);
      pos[i * 3 + 1] = region.y[0] + Math.random() * (region.y[1] - region.y[0]);
      pos[i * 3 + 2] = region.z[0] + Math.random() * (region.z[1] - region.z[0]);
      seed[i * 3] = Math.random();
      seed[i * 3 + 1] = Math.random();
      seed[i * 3 + 2] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    const pts = new THREE.Points(g, pointsMaterial(matOpts));
    pts.frustumCulled = false;
    group.add(pts);
    return pts;
  };
  // a few fireflies that slipped in from the forest, drifting up near the
  // window; dust motes hanging in the stage light. (The whole swarm is there
  // from the start; only a fifth is drawn until the encore calls them in.)
  const nff = Math.max(1, fireflies);
  const few = Math.max(1, Math.round(fireflies * 0.2));
  const ff = mk(nff, { x: [-9, 9], y: [9, 20], z: [HALL.front + 1, -2] }, { color: '#ffe48a', size: 0.11, flicker: 1, opacity: 0.8 });
  ff.geometry.setDrawRange(0, few);
  const motes = mk(dust, { x: [-7, 7], y: [STAGE_Y + 0.5, 12], z: [-9, 6] }, { color: '#ffe9c8', size: 0.03, flicker: 0.4, opacity: 0.45 });
  let enabled = true;
  let gather = 0;
  let gatherTo = 0;
  let glow = 1;
  let glowTo = 1;
  ff.visible = fireflies > 0;
  return {
    group,
    setCounts(on) { enabled = on; ff.visible = on && fireflies > 0; motes.visible = on; },
    // k: 0..1 how many have come to the lanterns; center: over the house
    gather(k, center = null) {
      gatherTo = Math.max(0, Math.min(1, k));
      if (center) ff.material.uniforms.uCenter.value.copy(center);
    },
    // 0..1: everything dims (the house falling asleep)
    dim(v) { glowTo = v; },
    update(t, dt = 1 / 60) {
      gather += (gatherTo - gather) * Math.min(1, dt * 0.9);
      glow += (glowTo - glow) * Math.min(1, dt * 0.3);
      const u = ff.material.uniforms;
      u.uGather.value = gather;
      u.uOpacity.value = 0.8 * glow * (1 + gather * 0.6);
      motes.material.uniforms.uOpacity.value = 0.45 * glow;
      ff.geometry.setDrawRange(0, gather > 0.01 ? nff : few);
      if (enabled) ff.visible = fireflies > 0 && glow > 0.02;
      ff.material.uniforms.uTime.value = t;
      motes.material.uniforms.uTime.value = t * 0.4;
      const s = window.innerHeight / 2;
      ff.material.uniforms.uScale.value = s;
      motes.material.uniforms.uScale.value = s;
    },
  };
}
