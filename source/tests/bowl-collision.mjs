import assert from 'node:assert/strict';
import * as THREE from 'three';
import { moveBody, nearbyWall } from '../src/world.js';
import { bowlHeight } from '../src/maps/bowl-profile.js';

const slopes = [{radial:true,bottom:-6}];
// Sweep fast movement in many directions across the steep sides of each gap.
for (let angle=0; angle<2*Math.PI; angle+=0.08) {
  for (let radius=7; radius<33; radius+=0.3) {
    const x=Math.cos(angle)*radius, z=Math.sin(angle)*radius;
    for (let direction=0; direction<2*Math.PI; direction+=0.4) for (const speed of [30,90,200]) {
      const p=new THREE.Vector3(x,bowlHeight(x,z)+0.9001,z);
      const v=new THREE.Vector3(Math.cos(direction)*speed,-2,Math.sin(direction)*speed);
      moveBody(p,v,1/120,[],0.55,0.9,slopes);
      if (Math.hypot(p.x,p.z)<34) assert.ok(p.y-0.9 >= bowlHeight(p.x,p.z)-0.1, `fell through at ${angle}, ${radius}, ${direction}, ${speed}`);
    }
  }
}
// Moving barriers must remain collision candidates even after crossing cells.
const barrier={min:new THREE.Vector3(0,-2,-1),max:new THREE.Vector3(1,3,1),dynamic:true};
const boxes=[barrier], p=new THREE.Vector3(0,0.9,0), v=new THREE.Vector3();
moveBody(p,v,1/120,boxes);
barrier.min.set(64,-2,-1); barrier.max.set(65,3,1);
p.set(63.4,0.9,0); v.set(8,0,0); moveBody(p,v,1/120,boxes);
assert.ok(p.x <= 63.451, `moving barrier was missed: ${p.x}`);
assert.ok(nearbyWall(new THREE.Vector3(63.4,0.9,0),boxes), 'moving barrier is visible to wall checks');
console.log('Bowl crossing and moving barrier collision passed');
