import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { toon } from "./toon.js";
import { rng } from "./textures.js";

// Seated studio audience: four baked, decimated poses of the Quaternius
// mannequin (see tools/bake_audience.py), instanced along the bleacher rows.
export async function buildAudience(scene, b) {
  const g = await new GLTFLoader().loadAsync("/assets/looktest/chars/audience.glb");
  const geos = [];
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    // feet at y=0, centred in x/z
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geo.computeVertexNormals();
    geos.push({ name: o.name, geo });
  });
  geos.sort((a, b) => a.name.localeCompare(b.name));
  const weights = { aud_sit: 0.35, aud_talk: 0.25, aud_cheer: 0.25, aud_wave: 0.15 };
  const mat = toon({ color: 0xffffff, rim: 0xb9a8ff, rimStrength: 0.08 });
  const shirts = [0x6b5a7a, 0x4a5a78, 0x7a4a4a, 0x56664a, 0x8a7a5a, 0x3c3a4c, 0x9a8a7a, 0x7a6a52, 0x5a4a6a, 0xa0705a].map(
    (c) => new THREE.Color(c),
  );
  const rand = rng(42);
  const slots = [];
  const bench = [];
  for (let i = 0; i < b.rows; i++) {
    const top = b.y0 + i * b.dy;
    const zc = b.z0 + i * b.dz;
    for (const side of [-1, 1]) {
      bench.push([side * 34, top + 0.24, zc + 0.55, 52, 0.48, 1.2]);
      for (let x = 9; x < 59; x += 1.18 + rand() * 0.25) {
        if (rand() < 0.07) continue; // empty seats
        slots.push({ x: side * x, y: top, z: zc - 0.2 + rand() * 0.15, ry: Math.PI + (rand() - 0.5) * 0.5 });
      }
    }
  }
  // pick a pose per slot; cheering clusters near the centre aisle (front rows)
  const groups = new Map(geos.map((g) => [g.name, []]));
  for (const s of slots) {
    let r = rand();
    if (Math.abs(s.x) < 22 && s.z < 64) r *= 0.7;
    let acc = 0,
      pick = geos[0].name;
    for (const g of geos) {
      acc += weights[g.name] ?? 0.25;
      if (r <= acc) {
        pick = g.name;
        break;
      }
    }
    groups.get(pick).push(s);
  }
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    sc = new THREE.Vector3();
  for (const { name, geo } of geos) {
    const list = groups.get(name);
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((s, i) => {
      q.setFromEuler(new THREE.Euler(0, s.ry, 0));
      const k = 0.92 + rand() * 0.16;
      sc.set(k, k, k);
      m4.compose(new THREE.Vector3(s.x, s.y, s.z), q, sc);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, shirts[Math.floor(rand() * shirts.length)]);
    });
    im.receiveShadow = false;
    scene.add(im);
  }
  // bench planks
  const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon({ color: 0x2a2433 }), bench.length);
  bench.forEach(([x, y, z, w, h, d], i) => {
    m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    bm.setMatrixAt(i, m4);
  });
  scene.add(bm);
}
