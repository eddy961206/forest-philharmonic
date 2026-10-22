// Analytic cylindrical scenery outside the auditorium. Unlike an infinite
// panorama, finite layers have binocular-independent motion parallax when
// the virtual observer translates. These are 2.5D silhouettes, not terrain.
export const NIGHT_LAYER_RADII = Object.freeze([1000, 400, 160]);
export const FOREST_LAYER_RADII = Object.freeze([500, 220, 100]);
export function layerDirection(direction, origin, radius) {
  const a = direction.x ** 2 + direction.z ** 2;
  if (a < 1e-6) return { ...direction };
  const b = origin.x * direction.x + origin.z * direction.z;
  const c = origin.x ** 2 + origin.z ** 2 - radius ** 2;
  const t = (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a;
  const p = { x: origin.x + t * direction.x, y: origin.y + t * direction.y, z: origin.z + t * direction.z };
  const n = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / n, y: p.y / n, z: p.z / n };
}
export const DOME_DEPTH_GLSL = /* glsl */`
vec3 layerDirection(vec3 d, float radius) {
  vec3 origin = uImmersive > 0.5 ? immersiveEye(cameraPosition) - uView : vec3(0.0);
  float a = dot(d.xz, d.xz);
  if (a < 0.000001) return d;
  float b = dot(origin.xz, d.xz);
  float c = dot(origin.xz, origin.xz) - radius * radius;
  float t = (-b + sqrt(max(0.0, b * b - a * c))) / a;
  return normalize(origin + t * d);
}
`;
// Exponential smoothing: frame-rate independent, bounded, no beat flashes.
export function smoothPhrase(current, level, dt) {
  const target = Number.isFinite(level) ? Math.max(0, Math.min(1, level * 5)) : 0;
  const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  return current + (target - current) * (1 - Math.exp(-seconds / 1.8));
}
