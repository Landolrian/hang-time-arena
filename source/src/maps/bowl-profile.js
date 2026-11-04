import * as THREE from "three";

const smooth = (v) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };

// The inner wall is a parabola with a short eased coping at its crest.
export function bowlHeight(x, z) {
  const r = Math.hypot(x, z);
  let wall;
  if (r <= 6) wall = -2;
  else if (r < 21) wall = -2 + 8 * ((r - 6) / 16) ** 5;
  else if (r < 22) {
    const u = r - 21, y = -2 + 8 * (15 / 16) ** 5, m = 2.5 * (15 / 16) ** 4;
    wall = (2*u**3 - 3*u*u + 1)*y + (u**3 - 2*u*u + u)*m + (-2*u**3 + 3*u*u)*6;
  } else if (r < 23.5) wall = 6;
  else if (r < 34) wall = 6 * (1 - smooth((r - 23.5) / 10.5));
  else wall = 0;
  // Perpendicular distance to the nearest diagonal centre line gives 6 m openings.
  const across = Math.abs(Math.abs(x) - Math.abs(z)) / Math.SQRT2;
  const gap = 1 - smooth((across - 3) / 2);
  const ramp = -2 + 2 * smooth((r - 6) / 23);
  return wall + (Math.min(wall, ramp) - wall) * gap;
}

export function bowlNormal(x, z) {
  const e = 0.01;
  return new THREE.Vector3(bowlHeight(x-e,z)-bowlHeight(x+e,z), 2*e, bowlHeight(x,z-e)-bowlHeight(x,z+e)).normalize();
}
