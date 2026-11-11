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

// The muzzle / snout: an ellipsoid protruding from the lower face for animals
// with `snout > 0` (including the fox's pointed snout).
export const SNOUT = { r: 0.11, center: [0, -0.07, -0.21] };

export function snoutScale(sp) {
  if (!(sp?.snout > 0)) return [0, 0, 0];
  return sp.pointy ? [0.95, 0.7, 1.5] : [1.15, 0.8, 0.7 + sp.snout * 0.9];
}

// Frontmost surface (-Z) of skull + snout at (x, y) in head coordinates.
export function snoutFrontZ(x, y, sp) {
  const skullZ = skullFrontZ(x, y);
  if (!(sp?.snout > 0)) return skullZ;
  const [cx, cy, cz] = SNOUT.center;
  const [sx, sy, sz] = snoutScale(sp);
  const rx = SNOUT.r * sx;
  const ry = SNOUT.r * sy;
  const rz = SNOUT.r * sz;
  const q = 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2;
  return q > 0 ? Math.min(skullZ, cz - rz * Math.sqrt(q)) : skullZ;
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
