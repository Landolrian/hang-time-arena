import * as THREE from "three";
import { bowlHeight, bowlNormal } from "./maps/bowl-profile.js";
export function createWorld(scene) {
  const boxes = [],
    meshes = [];
  const grey = new THREE.MeshStandardMaterial({
    color: 0x777d80,
    roughness: 1,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x555c60,
    roughness: 1,
  });
  function box(x, y, z, w, h, d, material = grey, hookable = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.userData.hookable = hookable;
    scene.add(mesh);
    meshes.push(mesh);
    boxes.push({
      min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
      mesh,
    });
    return mesh;
  }
  // Leave a sunken area beside the ledge. Floors are solid down to the pit
  // floor so the pit has walls and nobody can walk under the map.
  box(0, -5, -65, 200, 10, 70);
  box(0, -5, 45, 200, 10, 110);
  box(-89, -5, -20, 22, 10, 20);
  box(32, -5, -20, 136, 10, 20);
  box(-57, -9, -20, 42, 2, 20);
  box(0, 30, -100, 200, 60, 2, dark, false);
  box(0, 30, 100, 200, 60, 2, dark, false);
  box(-100, 30, 0, 2, 60, 200, dark, false);
  box(100, 30, 0, 2, 60, 200, dark, false);
  // The eastern half deliberately has no overhead anchors.
  for (const x of [-45, -15, 15])
    for (const z of [-38, 0, 38]) box(x, 10, z, 3, 20, 3, dark);
  for (const z of [-38, 0, 38]) box(-15, 21, z, 63, 2, 3);
  box(-45, 21, 0, 3, 2, 79);
  box(15, 21, 0, 3, 2, 79);
  box(-26, 5, -19, 20, 10, 15);
  box(2, 3, 25, 16, 6, 14);
  box(-50, 7, 26, 17, 14, 16);
  box(35, 1, -20, 12, 2, 1.5);
  box(46, 1, -5, 1.5, 2, 12);
  box(-5, 1, 12, 10, 2, 1.5);
  box(-65, 14, 35, 18, 2, 3);
  box(-30, 31, 60, 22, 2, 3);
  // Long clear runways between high anchors make consecutive pulls readable.
  box(-65, 27, -65, 28, 2, 3);
  box(-65, 27, 65, 28, 2, 3);
  box(-82, 12, 0, 12, 24, 14);
  box(65, 15, 65, 14, 30, 14);
  const grid = new THREE.GridHelper(200, 200, 0x686e70, 0x50585b);
  grid.position.y = 0.012;
  scene.add(grid);
  for (const [x, z, rotation] of [
    [0, -98.98, 0],
    [0, 98.98, 0],
    [-98.98, 0, Math.PI / 2],
    [98.98, 0, Math.PI / 2],
  ]) {
    const wallGrid = new THREE.GridHelper(200, 100, 0x686e70, 0x50585b);
    wallGrid.rotation.x = Math.PI / 2;
    wallGrid.rotation.z = rotation;
    wallGrid.position.set(x, 0, z);
    scene.add(wallGrid);
  }
  scene.background = new THREE.Color(0x9ba3a6);
  scene.fog = new THREE.Fog(0x9ba3a6, 100, 220);
  scene.add(new THREE.HemisphereLight(0xe7f0f2, 0x50575a, 2));
  const light = new THREE.DirectionalLight(0xffffff, 1.5);
  light.position.set(20, 50, 15);
  scene.add(light);
  return { boxes, meshes };
}
// Most arena colliders never move. Index them by horizontal cell so every
// physics step only visits nearby boxes; moving barriers are always checked.
const collisionGrids = new WeakMap();
const COLLISION_CELL = 16, COLLISION_MARGIN = 2;
function nearbyBoxes(boxes, x, z, radius) {
  if (radius > COLLISION_MARGIN) return boxes;
  let grid = collisionGrids.get(boxes);
  if (!grid || grid.length !== boxes.length) {
    grid = {length:boxes.length, cells:new Map(), dynamic:[]};
    for (const box of boxes) {
      if (box.dynamic) { grid.dynamic.push(box); continue; }
      const x0=Math.floor((box.min.x-COLLISION_MARGIN)/COLLISION_CELL), x1=Math.floor((box.max.x+COLLISION_MARGIN)/COLLISION_CELL);
      const z0=Math.floor((box.min.z-COLLISION_MARGIN)/COLLISION_CELL), z1=Math.floor((box.max.z+COLLISION_MARGIN)/COLLISION_CELL);
      for(let cx=x0;cx<=x1;cx++) for(let cz=z0;cz<=z1;cz++) {
        const key=`${cx},${cz}`; let cell=grid.cells.get(key); if(!cell) grid.cells.set(key,cell=[]); cell.push(box);
      }
    }
    collisionGrids.set(boxes,grid);
  }
  const local=grid.cells.get(`${Math.floor(x/COLLISION_CELL)},${Math.floor(z/COLLISION_CELL)}`) || [];
  return grid.dynamic.length ? [...local,...grid.dynamic] : local;
}

// Resolve the capsule against rounded horizontal corners and the shallowest face.
export function moveBody(pos, vel, dt, boxes, r = 0.55, half = 0.9, slopes = [], contact = null) {
  let grounded = false;
  if (contact) contact.normal = null;
  const skin = 1e-4;
  const steps = Math.max(1, Math.ceil(vel.length() * dt / 0.2));
  for (let step = 0; step < steps; step++) {
    const previous = pos.clone();
    pos.addScaledVector(vel, dt / steps);
    for (const slope of slopes) {
      if (slope.radial) {
        const radius = Math.hypot(pos.x, pos.z);
        if (radius > 34) continue;
        const height = bowlHeight(pos.x, pos.z);
        const normal = bowlNormal(pos.x, pos.z);
        const feet = pos.y - half;
        if (feet < height && pos.y + half > slope.bottom) {
          const previousRadius = Math.hypot(previous.x, previous.z);
          const previousHeight = previousRadius <= 34 ? bowlHeight(previous.x, previous.z) : 0;
          // A steep gap edge can rise more than the old 0.6m tolerance in one
          // substep. Detect that crossing from the previous surface instead.
          const crossed = previous.y - half >= previousHeight - 0.01;
          const into = vel.dot(normal);
          if ((feet >= height - 0.6 && into <= 0) || crossed) {
            pos.y = height + half + skin;
            if (into < 0) vel.addScaledVector(normal, -into);
            grounded = true;
            if (contact) contact.normal = normal;
          }
        }
        continue;
      }
      const dx = pos.x - slope.x, dz = pos.z - slope.z;
      const along = dx * slope.dx + dz * slope.dz;
      const across = -dx * slope.dz + dz * slope.dx;
      if (along < 0 || along > slope.length || Math.abs(across) > slope.width / 2 + r) continue;
      const height = slope.low + slope.rise * along / slope.length;
      const normal = new THREE.Vector3(-slope.dx * slope.rise / slope.length, 1, -slope.dz * slope.rise / slope.length).normalize();
      const feet = pos.y - half;
      if (feet < height - 0.6 && pos.y + half > slope.bottom) {
        // A ramp is solid below its surface: resolve against the entered side.
        const oldAlong = (previous.x - slope.x) * slope.dx + (previous.z - slope.z) * slope.dz;
        const oldAcross = -(previous.x - slope.x) * slope.dz + (previous.z - slope.z) * slope.dx;
        let nx, nz, correction;
        if (Math.abs(oldAcross) >= slope.width / 2 || (oldAlong >= 0 && oldAlong <= slope.length)) {
          const side = Math.sign(oldAcross || across || 1);
          nx = -slope.dz * side; nz = slope.dx * side;
          correction = slope.width / 2 + r - Math.abs(across);
        } else {
          const side = oldAlong < 0 ? -1 : 1;
          nx = slope.dx * side; nz = slope.dz * side;
          correction = side < 0 ? along + r : slope.length + r - along;
        }
        pos.x += nx * (correction + skin); pos.z += nz * (correction + skin);
        const into = vel.x * nx + vel.z * nz;
        if (into < 0) { vel.x -= into * nx; vel.z -= into * nz; }
      } else if (feet < height && pos.y + half > slope.bottom && vel.dot(normal) <= 0) {
        pos.y = height + half + skin;
        const into = vel.dot(normal);
        vel.addScaledVector(normal, -into);
        grounded = true;
        if (contact) contact.normal = normal;
      }
    }
    for (let pass = 0; pass < 4; pass++) {
      let resolved = false;
      for (const b of nearbyBoxes(boxes, pos.x, pos.z, r)) {
        const vertical = Math.min(pos.y + half - b.min.y, b.max.y - (pos.y - half));
        if (vertical <= 1e-6) continue;
        const x = THREE.MathUtils.clamp(pos.x, b.min.x, b.max.x);
        const z = THREE.MathUtils.clamp(pos.z, b.min.z, b.max.z);
        let nx = pos.x - x, nz = pos.z - z;
        const distance = Math.hypot(nx, nz);
        let horizontal;
        if (distance > 1e-8) {
          horizontal = r - distance;
          if (horizontal <= 1e-6) continue;
          nx /= distance; nz /= distance;
        } else {
          const faces = [
            [pos.x - b.min.x + r, -1, 0], [b.max.x - pos.x + r, 1, 0],
            [pos.z - b.min.z + r, 0, -1], [b.max.z - pos.z + r, 0, 1],
          ].sort ( (a, b) => a[0] - b[0]);
          [horizontal, nx, nz] = faces[0];
        }
        if (vertical < horizontal) {
          const ny = pos.y >= (b.min.y + b.max.y) / 2 ? 1 : -1;
          pos.y += ny * (vertical + skin);
          if (vel.y * ny < 0) vel.y = 0;
          if (ny > 0) grounded = true;
        } else {
          pos.x += nx * (horizontal + skin);
          pos.z += nz * (horizontal + skin);
          const into = vel.x * nx + vel.z * nz;
          if (into < 0) { vel.x -= into * nx; vel.z -= into * nz; }
        }
        resolved = true;
      }
      if (!resolved) break;
    }
  }
  return grounded;
}

// Find the nearest side face within reach of the body, including boundary walls.
export function nearbyWall(pos, boxes, reach = 0.35, r = 0.55, half = 0.9) {
  let best = null;
  for (const box of nearbyBoxes(boxes, pos.x, pos.z, r + reach)) {
    if (pos.y + half <= box.min.y || pos.y - half >= box.max.y) continue;
    for (const [axis, other, side] of [["x", "z", -1], ["x", "z", 1], ["z", "x", -1], ["z", "x", 1]]) {
      const face = side < 0 ? box.min[axis] : box.max[axis];
      const gap = (pos[axis] - face) * side - r;
      if (gap < -0.01 || gap > reach || pos[other] < box.min[other] || pos[other] > box.max[other]) continue;
      if (best && gap >= best.gap) continue;
      const normal = new THREE.Vector3();
      normal[axis] = side;
      const point = pos.clone();
      point[axis] = face;
      point.y = THREE.MathUtils.clamp(point.y, box.min.y, box.max.y);
      best = { box, normal, point, gap };
    }
  }
  return best;
}
