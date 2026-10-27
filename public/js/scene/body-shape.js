// The shapes every animal is built on, in one place: the meshes are made from
// these, and whatever is laid on them (a shirt front, a raccoon's mask, a
// panda's patches, an owl's facial disc) follows the same surfaces. Markings
// placed by hand-copied numbers ended up buried inside the head.

// The skull: a sphere of radius r drawn scale[0] wide, scale[1] tall and
// scale[2] deep, centred on the head group. The face looks along -Z.
export const HEAD = { r: 0.27, scale: [1.05, 0.95, 0.97] };

// The skull's front surface at (x, y) on the head.
export function skullFrontZ(x, y) {
  const [sx, sy, sz] = HEAD.scale;
  return -HEAD.r * sz * Math.sqrt(Math.max(0, 1 - (x / (HEAD.r * sx)) ** 2 - (y / (HEAD.r * sy)) ** 2));
}

// The torso: a capsule of radius r, straight for `straight` on either side of
// its centre, drawn scale[0] wide and scale[2] deep.
export const TORSO = { r: 0.19, straight: 0.1, scale: [1.08, 1, 0.92] };

// The torso's front surface (-Z), dy above its centre, x across.
export function torsoFrontZ(dy, x = 0) {
  const { r: R, straight, scale: [sx, , sz] } = TORSO;
  const cap = Math.max(0, Math.abs(dy) - straight);
  const r = Math.sqrt(Math.max(0, R * R - cap * cap));
  const u = r > 0 ? Math.min(0.98, Math.abs(x) / (sx * r)) : 0.98;
  return -sz * r * Math.sqrt(1 - u * u);
}
