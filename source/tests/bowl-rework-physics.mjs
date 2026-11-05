import assert from 'node:assert/strict';
import * as THREE from 'three';
import { moveBody } from '../src/world.js';
import { bowlHeight, bowlNormal } from '../src/maps/bowl-profile.js';

const slopes = [{ radial: true, bottom: -6 }];
function slide(speed) {
  const pos = new THREE.Vector3(-18, bowlHeight(-18, 0) + 0.9001, 0);
  const vel = new THREE.Vector3(speed, 0, 0);
  let farSpeed = 0, exitHeight = -Infinity;
  for (let i = 0; i < 330; i++) {
    vel.y -= 24 / 120;
    moveBody(pos, vel, 1 / 120, [], 0.55, 0.9, slopes);
    if (pos.x > 18) farSpeed = Math.max(farSpeed, vel.length());
    if (pos.x > 22) exitHeight = Math.max(exitHeight, pos.y);
  }
  return { farSpeed, exitHeight };
}
assert.ok(slide(18).farSpeed > 14, 'a slide carries speed to the far wall');
assert.ok(slide(30).exitHeight > 7, 'a fast slide launches above the lip');
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  for (let r = 7; r < 34; r += 0.1) {
    const x = sx * r / Math.SQRT2, z = sz * r / Math.SQRT2;
    assert.ok(bowlNormal(x, z).y > 0.82, 'gap remains walkable in both directions');
  }
  for (const outward of [false, true]) {
    const start = outward ? 9 : 30, direction = outward ? 1 : -1;
    const x = sx * start / Math.SQRT2, z = sz * start / Math.SQRT2;
    const pos = new THREE.Vector3(x, bowlHeight(x, z) + 0.9001, z), vel = new THREE.Vector3();
    for (let i = 0; i < 500; i++) {
      vel.x = direction * sx * 7 / Math.SQRT2; vel.z = direction * sz * 7 / Math.SQRT2;
      vel.y -= 24 / 120;
      moveBody(pos, vel, 1 / 120, [], 0.55, 0.9, slopes);
    }
    const radius = Math.hypot(pos.x, pos.z);
    assert.ok(outward ? radius > 30 : radius < 9, `gap travel ${sx},${sz}, outward=${outward}: ${radius}`);
  }
}
for (const r of [6, 21, 22, 23.5, 34]) {
  assert.ok(bowlNormal(r - 0.001, 0).distanceTo(bowlNormal(r + 0.001, 0)) < 0.02, `smooth transition at ${r}`);
}
console.log('Bowl profile and sliding physics passed');
