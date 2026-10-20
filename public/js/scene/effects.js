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
    },
    vertexShader: /* glsl */`
      attribute vec3 seed;
      uniform float uTime; uniform float uSize; uniform float uScale;
      varying float vA;
      uniform float uFlicker;
      void main(){
        vec3 p = position;
        float t = uTime * (0.15 + seed.x * 0.2);
        p.x += sin(t + seed.y * 6.28) * 0.9 + sin(t * 2.3 + seed.z * 4.0) * 0.25;
        p.y += sin(t * 0.8 + seed.z * 6.28) * 0.6;
        p.z += cos(t * 0.9 + seed.x * 6.28) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uScale / -mv.z * (0.6 + seed.y * 0.8);
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
  // window; dust motes hanging in the stage light
  const ff = mk(Math.round(fireflies * 0.2), { x: [-9, 9], y: [9, 20], z: [HALL.front + 1, -2] }, { color: '#ffe48a', size: 0.11, flicker: 1, opacity: 0.8 });
  const motes = mk(dust, { x: [-7, 7], y: [STAGE_Y + 0.5, 12], z: [-9, 6] }, { color: '#ffe9c8', size: 0.03, flicker: 0.4, opacity: 0.45 });
  return {
    group,
    setCounts(on) { ff.visible = on; motes.visible = on; },
    update(t) {
      ff.material.uniforms.uTime.value = t;
      motes.material.uniforms.uTime.value = t * 0.4;
      const s = window.innerHeight / 2;
      ff.material.uniforms.uScale.value = s;
      motes.material.uniforms.uScale.value = s;
    },
  };
}
