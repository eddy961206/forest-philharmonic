// A virtual venue has one display per visitor, unlike a shared physical LED
// surface. Distant worlds may therefore use that render camera's rays. This
// is an infinite panorama, NOT positional 6DoF parallax or a physical screen
// calibration for an audience of many observers. Architecture stays attached.
export const SCREEN_LOCKED_SCENES = Object.freeze([0, 7, 8, 13]); // ARCH/CATHEDRAL/GOLD/DECO
export const normalizeDomeProjection = value => value === 'venue' ? 'venue' : 'immersive';
export function usesViewerDirection(sceneId, mode = 'immersive') {
  return normalizeDomeProjection(mode) === 'immersive' && !SCREEN_LOCKED_SCENES.includes(sceneId);
}
// Reference math for regression checks and authoring diagnostics. Runtime
// rendering uses the equivalent GLSL below, without CPU allocations per pixel.
export function domeDirection(sceneId, point, viewer, sweetSpot, mode) {
  const origin = usesViewerDirection(sceneId, mode) ? viewer : sweetSpot;
  const x = point.x - origin.x, y = point.y - origin.y, z = point.z - origin.z;
  const n = Math.hypot(x, y, z) || 1;
  return { x: x / n, y: y / n, z: z / n };
}
export const DOME_PROJECTION_GLSL = /* glsl */`
vec3 domeDirection(int id, vec3 point, vec3 viewer, vec3 sweetSpot, float immersive) {
  bool screenLocked = ${SCREEN_LOCKED_SCENES.map(id => `id == ${id}`).join(' || ')};
  return normalize(point - ((immersive > 0.5 && !screenLocked) ? viewer : sweetSpot));
}
`;
