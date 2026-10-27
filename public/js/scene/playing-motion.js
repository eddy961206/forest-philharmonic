// Small, deterministic pose helpers. Audio remains the performance clock.
import * as THREE from 'three';
import { skullFrontZ } from './body-shape.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const ease = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// Contact at the note onset, a smooth rebound, then preparation for the next
// strike. Using score time avoids frame-rate-dependent impulses and missed hits.
export function strikeLift(age, untilNext = Infinity, height = 0.12) {
  return height * Math.min(ease(age / 0.10), ease(untilNext / 0.10));
}

// Keep pitch classes when a full orchestral part exceeds a compact stage prop.
export function visualPitch(midi, low = 48, high = 84) {
  let pitch = Math.round(midi);
  while (pitch < low) pitch += 12;
  while (pitch > high) pitch -= 12;
  return clamp(pitch, low, high);
}

// Technique changes belong to the score, not to a note's sounding duration.
// Keep pizzicato through the rests until a bowed part actually enters.
export function stringTechniqueAt(tracks, time) {
  let latest = -Infinity, earliest = Infinity, pizzicato = false, upcoming = false;
  for (const track of tracks) {
    const notes = track.notes;
    if (!notes.length) continue;
    if (notes[0] < earliest) { earliest = notes[0]; upcoming = track.inst === 'pizzicato'; }
    let lo = 0, hi = notes.length / 4;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid * 4] <= time) lo = mid + 1; else hi = mid; }
    if (lo && notes[(lo - 1) * 4] >= latest) {
      latest = notes[(lo - 1) * 4]; pizzicato = track.inst === 'pizzicato';
    }
  }
  return latest === -Infinity ? upcoming : pizzicato;
}

// Fixed instruments do not sway with the player's body. Convert their anchors
// through world space before solving the arms, including scale and riser height.
export function instrumentToBody(player) {
  player.char.body.updateWorldMatrix(true, false);
  player.inst.group.updateWorldMatrix(true, false);
  const matrix = player.instrumentToBodyMatrix ??= new THREE.Matrix4();
  return matrix.copy(player.char.body.matrixWorld).invert().multiply(player.inst.group.matrixWorld);
}

// Two softly edged, rounded cheek patches. Project onto the same ellipsoid as
// the skull so neither desktop nor Lite facets cut through the markings.
export function raccoonPatchGeometry(side, fur, mask) {
  const positions = [], colors = [], uv = [], indices = [];
  const base = new THREE.Color(fur), dark = new THREE.Color(mask), color = new THREE.Color();
  const segments = 32, rings = 5;
  for (let ring = 0; ring <= rings; ring++) {
    const r = ring / rings;
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const dx = Math.cos(angle) * 0.103 * r;
      const x = side * (0.127 + dx);
      const y = 0.023 + Math.sin(angle) * 0.064 * r - dx * 0.23;
      const z = skullFrontZ(x, y) - 0.004;
      positions.push(x, y, z);
      color.copy(dark).lerp(base, ease((r - 0.75) / 0.25));
      colors.push(color.r, color.g, color.b); uv.push(i / segments, r);
      if (ring && i) {
        const a = ring * (segments + 1) + i, b = a - segments - 1;
        if (side < 0) indices.push(a, b, a - 1, b, b - 1, a - 1);
        else indices.push(a, a - 1, b, b, a - 1, b - 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
