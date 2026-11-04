import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mat, glow, V, rod, compose, instances, canvas, tex, rng, star, glowSprite, beam } from "./kit.js";
import { plyTexture, wallpaperTexture, windowSkyTexture, logoTexture } from "../../looktest/textures.js";
import { studioCamera } from "../../looktest/studio.js";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RAMPS } from "../../looktest/toon.js";

// The dark soundstage around the table: lighting rig, the hookable North
// Truss dressed as real truss, painted flats and the star valance behind the
// Box, the audience in the dark to the south, camera cranes, and the two
// backstage spawn rooms.
//   North Truss collider: bar x[-61,61] y 36 z -45 (0.5 thick) + 1.2 m blocks every 24 m.
//   Spawn rooms: floor y[-2,0] x side*[77,105] z[-14,14]; walls 8 tall; doors x side*[87,95] at z ±14 (6 m tall); roof y[8,9].

const FLOOR_Y = -6;

let M;
function mats() {
  if (M) return M;
  M = {
    truss: mat({ color: 0x8f8d99, emissive: 0x2c2a36, rim: 0.3, rimColor: 0xd8d6e4 }),
    trussDark: mat({ color: 0x4a4854, emissive: 0x15131c }),
    metal: mat({ color: 0x2b2933, rim: 0.3, rimColor: 0x8a8794 }),
    black: mat({ color: 0x1a1820 }),
    ply: mat({ map: plyTexture() }),
    plyEdge: mat({ color: 0xd9bb86 }),
    wood2x4: mat({ color: 0xb08850 }),
    brace: mat({ color: 0x8b6a43 }),
    sandbag: mat({ color: 0x4d4a3c }),
    wall: mat({ color: 0x15121c }),
    rib: mat({ color: 0x1d1926 }),
    velour: mat({ map: velourTexture(), color: 0x7a6f86 }),
    steel: mat({ color: 0x3a3842, rim: 0.3, rimColor: 0xb9b6c6 }),
    yellow: mat({ color: 0xe8b23a, rim: 0.3, rimColor: 0xffe0a0, emissive: 0x3a2a08 }),
    craneMat: mat({ color: 0x3b3a44, rim: 0.35, rimColor: 0xa9a6b5 }),
  };
  return M;
}

function velourTexture() {
  const [c, g] = canvas(512, 64);
  for (let x = 0; x < 512; x++) {
    const v = 0.5 + 0.5 * Math.sin((x / 512) * Math.PI * 2 * 9) * 0.8 + 0.1 * Math.sin(x * 0.31);
    const k = Math.round(26 + v * 30);
    g.fillStyle = `rgb(${k},${k - 6},${k + 8})`;
    g.fillRect(x, 0, 1, 64);
  }
  return tex(c);
}

/** Box truss between a and b with zig-zag lacing (rod matrices pushed to `list`). */
function truss(list, a, b, w = 1.0, chordR = 0.11, laceR = 0.055) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const up = Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(dir, up).normalize();
  const up2 = new THREE.Vector3().crossVectors(side, dir).normalize();
  const h = w / 2;
  const corners = [
    side.clone().multiplyScalar(h).addScaledVector(up2, h),
    side.clone().multiplyScalar(-h).addScaledVector(up2, h),
    side.clone().multiplyScalar(-h).addScaledVector(up2, -h),
    side.clone().multiplyScalar(h).addScaledVector(up2, -h),
  ];
  for (const c of corners) list.push(rod(a.clone().add(c), b.clone().add(c), chordR));
  const n = Math.max(2, Math.round(len / (w * 1.4)));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const p0 = a.clone().addScaledVector(dir, i * step);
    const p1 = a.clone().addScaledVector(dir, (i + 1) * step);
    for (let k = 0; k < 4; k++) {
      const c0 = corners[k], c1 = corners[(k + 1) % 4];
      if (i % 2) list.push(rod(p0.clone().add(c0), p1.clone().add(c1), laceR));
      else list.push(rod(p0.clone().add(c1), p1.clone().add(c0), laceR));
    }
  }
}

const loader = new GLTFLoader();
let fixtureModels;
async function fixtures() {
  fixtureModels ??= Promise.all(["par-can", "fresnel"].map((n) => loader.loadAsync(`/assets/looktest/studio/${n}.glb`)));
  const [par, fres] = await fixtureModels;
  return { par: par.scene, fresnel: fres.scene };
}

/** Collapses a fixture model into [geometry, material] pairs with world-ready transforms. */
async function fixtureParts(kind, gel) {
  const f = await fixtures();
  const src = f[kind].clone(true);
  src.scale.setScalar(2.4);
  const box = new THREE.Box3().setFromObject(src);
  src.position.sub(box.getCenter(new THREE.Vector3()));
  const holder = new THREE.Group();
  holder.add(src);
  holder.updateMatrixWorld(true);
  const lens = glow(gel, 2.4);
  const parts = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const isLens = list.some((m) => m.name === "Glow" || (kind === "par" && m.name === "LightGrey"));
    parts.push([o.geometry, isLens ? lens : mats().metal, o.matrixWorld.clone()]);
  });
  return parts;
}

export async function buildStudio(root, live) {
  const m = mats();
  const rods = [];
  const darkRods = [];
  const fx = []; // decorative fixtures: [kind, pos, target, gel]

  // ---------- studio shell: walls with acoustic ribs ----------
  for (const [x, z, ry, w] of [[0, -90, 0, 240], [0, 90, Math.PI, 240], [-120, 0, Math.PI / 2, 180], [120, 0, -Math.PI / 2, 180]]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, 100), m.wall);
    wall.position.set(x, 44, z);
    wall.rotation.y = ry;
    root.add(wall);
  }
  const ribs = [];
  for (let x = -116; x <= 116; x += 8) ribs.push(compose(x, 40, -89.4, 0.8, 92, 1));
  for (let z = -84; z <= 84; z += 8) { ribs.push(compose(-119.4, 40, z, 1, 92, 0.8)); ribs.push(compose(119.4, 40, z, 1, 92, 0.8)); }
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), m.rib, ribs));

  // ---------- north backdrop: painted kitchen flats with a sunrise window ----------
  const flatZ = -66, flatH = 34, flatY0 = FLOOR_Y;
  const wp = wallpaperTexture();
  wp.repeat.set(200 / 12, flatH / 12);
  // the amber wash is painted in (emissive) rather than a real spot light
  const front = mat({ map: wp, color: 0xd8c8a8, emissive: 0xff9a40, emissiveMap: wp, emissiveIntensity: 0.32 });
  const flat = new THREE.Mesh(new THREE.BoxGeometry(200, flatH, 0.6), [m.plyEdge, m.plyEdge, m.plyEdge, m.plyEdge, front, m.ply]);
  flat.position.set(0, flatY0 + flatH / 2, flatZ);
  flat.receiveShadow = true;
  root.add(flat);
  // painted windows (morning sky) with chunky cream trim
  const sky = mat({ map: windowSkyTexture(), emissive: 0xffffff, emissiveMap: windowSkyTexture(), emissiveIntensity: 0.35 });
  const trim = mat({ color: 0xf6efe2 });
  for (const wx of [-52, 52]) {
    const ww = 22, wh = 18, wy = 12;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), sky);
    s.position.set(wx, wy, flatZ + 0.32);
    root.add(s);
    for (const [dx, dy, w, h] of [[0, wh / 2 + 0.6, ww + 2.4, 1.2], [0, -wh / 2 - 0.6, ww + 2.4, 1.2], [-ww / 2 - 0.6, 0, 1.2, wh], [ww / 2 + 0.6, 0, 1.2, wh], [0, 0, 0.6, wh], [0, 1.5, ww, 0.6]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.8), trim);
      b.position.set(wx + dx, wy + dy, flatZ + 0.6);
      b.userData.outline = 1.2;
      root.add(b);
    }
    // cafe curtains
    const curtain = mat({ color: 0xe89a7a });
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(ww / 2 - 1, wh * 0.46, 0.5), curtain);
      c.position.set(wx + sx * (ww / 4 + 0.2), wy - wh * 0.24, flatZ + 1.1);
      root.add(c);
    }
  }
  // seams with dutchman strips + C-clamps along the top edge
  const seamMat = mat({ color: 0xc9b888 });
  const clamps = [];
  for (let x = -90; x <= 90; x += 20) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.6, flatH, 0.1), seamMat);
    seam.position.set(x, flatY0 + flatH / 2, flatZ + 0.36);
    root.add(seam);
    clamps.push(x);
  }
  const clampG = new THREE.TorusGeometry(0.75, 0.16, 6, 12, Math.PI);
  root.add(instances(clampG, m.steel, clamps.map((x) => compose(x, flatY0 + flatH + 0.1, flatZ, 1, 1, 1, 0, Math.PI / 2, 0))));
  // crown moulding
  const crown = new THREE.Mesh(new THREE.BoxGeometry(200.4, 1.0, 1.2), mat({ color: 0xc98a55 }));
  crown.position.set(0, flatY0 + flatH - 0.5, flatZ + 0.5);
  root.add(crown);
  // stage jacks behind the flats (seen from the north edge)
  const braces = [], bags = [];
  for (let x = -84; x <= 84; x += 14) {
    braces.push(compose(x, flatY0 + 13, flatZ - 0.7, 0.35, 26, 0.6));
    const len = Math.hypot(26, 12);
    braces.push(compose(x, flatY0 + 13, flatZ - 6.6, 0.35, 0.6, len, Math.atan2(26, 12), 0, 0));
    bags.push(compose(x, flatY0 + 0.5, flatZ - 12, 1.6, 0.9, 1.0, 0, 0.2, 0));
  }
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), m.brace, braces));
  root.add(instances(new RoundedBoxGeometry(1, 1, 1, 2, 0.3), m.sandbag, bags));

  // ---------- star valance: painted show drop on a pipe batten ----------
  const dropTex = valanceTexture();
  const dropMat = mat({ map: dropTex, emissive: 0xffffff, emissiveMap: dropTex, emissiveIntensity: 0.5, side: THREE.DoubleSide });
  const dropGeo = new THREE.PlaneGeometry(220, 26, 96, 1);
  const dp = dropGeo.attributes.position;
  for (let i = 0; i < dp.count; i++) dp.setZ(i, Math.sin(dp.getX(i) * 0.4) * 0.55);
  dropGeo.computeVertexNormals();
  const drop = new THREE.Mesh(dropGeo, dropMat);
  drop.position.set(0, flatY0 + flatH + 12.5, flatZ - 8);
  root.add(drop);
  rods.push(rod(V(-112, flatY0 + flatH + 25.6, flatZ - 8), V(112, flatY0 + flatH + 25.6, flatZ - 8), 0.2));
  rods.push(rod(V(-111, flatY0 + flatH - 0.6, flatZ - 8), V(111, flatY0 + flatH - 0.6, flatZ - 8), 0.2));
  // side valances (scalloped) over the wings
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.PlaneGeometry(40, 60), m.velour);
    leg.position.set(sx * 113, 24, 0);
    leg.rotation.y = -sx * Math.PI / 2;
    root.add(leg);
    for (const z of [-60, 60]) {
      const l2 = new THREE.Mesh(new THREE.PlaneGeometry(24, 64), m.velour);
      l2.position.set(sx * 112, 26, z);
      l2.rotation.y = -sx * Math.PI / 2;
      root.add(l2);
    }
  }

  // ---------- show logo marquee hanging above the backdrop ----------
  {
    const g = new THREE.Group();
    const w = 44, h = 17;
    const board = new THREE.Mesh(new RoundedBoxGeometry(w, h, 1.2, 4, 2), mat({ color: 0x2a1f3a }));
    g.add(board);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.92), new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true, fog: false }));
    face.position.z = 0.62;
    face.userData.static = true;
    g.add(face);
    const bulbs = [];
    const n = 52;
    const per = 2 * (w + h - 4);
    for (let i = 0; i < n; i++) {
      let d = (i / n) * per;
      const hw = w / 2 - 1.2, hh = h / 2 - 1.2;
      let p;
      if (d < 2 * hw) p = [-hw + d, hh];
      else if ((d -= 2 * hw) < 2 * hh) p = [hw, hh - d];
      else if ((d -= 2 * hh) < 2 * hw) p = [hw - d, -hh];
      else p = [-hw, -hh + (d - 2 * hw)];
      bulbs.push(compose(p[0], p[1], 0.75, 0.42, 0.42, 0.42));
    }
    const bulbIm = instances(new THREE.SphereGeometry(1, 8, 6), glow(0xffd890, 2.2), bulbs);
    g.add(bulbIm);
    // Hung at 57 so the North Truss (y 36, z -45) clears it from the spoon and the bowl floor.
    const logoY = 57;
    for (const sx of [-1, 1]) rods.push(rod(V(sx * (w / 2 - 4), logoY + h / 2, -70), V(sx * (w / 2 - 4), 74, -70), 0.07));
    g.position.set(0, logoY, -70);
    g.userData.static = true;
    live.add(g);
  }

  // ---------- the North Truss (hookable bar at y 36, z -45) ----------
  truss(rods, V(-61, 36, -45), V(61, 36, -45), 1.0, 0.12, 0.06);
  // chain motors on the 1.2 m anchor blocks, chains up into the dark
  const motors = [];
  for (let x = -60; x <= 60; x += 24) {
    motors.push(compose(x, 36, -45, 1.2, 1.2, 1.2));
    rods.push(rod(V(x, 36.6, -45), V(x, 80, -45), 0.08));
  }
  root.add(instances(new RoundedBoxGeometry(1, 1, 1, 2, 0.15), m.yellow, motors, { cast: true }));
  // fixtures hung along the North Truss, aimed at the set
  for (const [i, x] of [-48, -24, 0, 24, 48].entries()) fx.push(["par", V(x, 34.9, -44.4), V(x * 0.6, 0, -10 + (i % 2) * 14), [0xff3da8, 0xffb23d, 0x3dd8ff][i % 3], 0.05]);

  // ---------- high lighting grid (decorative, well above hook reach of the set) ----------
  const GY = 78;
  for (const z of [-60, 60]) truss(darkRods, V(-110, GY, z), V(110, GY, z), 1.6, 0.18, 0.09);
  for (const x of [-95, -55, 55, 95]) truss(darkRods, V(x, GY + 1.6, -62), V(x, GY + 1.6, 62), 1.6, 0.18, 0.09);
  // the Spotlight Well: an open square in the grid over the bowl, framed by short trusses
  for (const z of [-34, 34]) truss(darkRods, V(-55, GY + 3.2, z), V(55, GY + 3.2, z), 1.6, 0.18, 0.09);
  // front-of-house truss over the audience (the key light comes from here)
  truss(darkRods, V(-90, 46, 62), V(90, 46, 62), 1.6, 0.18, 0.09);
  for (const x of [-60, 0, 60]) darkRods.push(rod(V(x, 46.8, 62), V(x, 100, 62), 0.09));
  for (const [i, x] of [-75, -45, -15, 15, 45, 75].entries()) fx.push(["fresnel", V(x, 44.4, 61.4), V(x * 0.5, 0, 0), 0xffe6c2, 0.035]);
  for (const [i, x] of [-80, -40, 0, 40, 80].entries()) fx.push(["par", V(x, GY - 1.4, -60), V(x * 0.7, 0, -30), [0x3dd8ff, 0xffb23d, 0xff3da8][i % 3], 0.04]);
  for (const [i, x] of [-80, -40, 40, 80].entries()) fx.push(["par", V(x, GY - 1.4, 60), V(x * 0.7, 0, 20), [0xff3da8, 0x3dd8ff][i % 2], 0.035]);
  // the hero spot over the well
  fx.push(["fresnel", V(0, GY + 1, 6), V(0, -2, 0), 0xfff2dc, 0]);

  // fixtures: one merged geometry per part, as instances
  const byKey = new Map();
  for (const [kind, pos, target, gel, beamStrength] of fx) {
    const parts = await fixtureParts(kind, gel);
    const holder = new THREE.Object3D();
    holder.position.copy(pos);
    holder.lookAt(target);
    holder.updateMatrixWorld(true);
    parts.forEach(([geo, material, local], pi) => {
      const key = `${kind}|${pi}|${material === mats().metal ? "metal" : gel}`;
      if (!byKey.has(key)) byKey.set(key, { geo, material, list: [] });
      byKey.get(key).list.push(holder.matrixWorld.clone().multiply(local));
    });
    const dir = target.clone().sub(pos).normalize();
    const s = glowSprite(gel, kind === "fresnel" ? 4.2 : 3.2, 0.7);
    s.position.copy(pos).addScaledVector(dir, 1.4);
    live.add(s);
    if (beamStrength > 0) live.add(beam(pos.clone().addScaledVector(dir, 1.2), target, 6, gel, beamStrength));
    darkRods.push(rod(pos.clone().add(V(0, 0.8, 0)), pos.clone().add(V(0, 1.6, 0)), 0.06));
  }
  for (const { geo, material, list } of byKey.values()) root.add(instances(geo, material, list));

  root.add(instances(new THREE.CylinderGeometry(1, 1, 1, 7, 1), m.truss, rods, { cast: false }));
  root.add(instances(new THREE.CylinderGeometry(1, 1, 1, 6, 1), m.trussDark, darkRods));

  // ---------- audience risers to the south, in the dark ----------
  const rows = 10, z0 = 60, dz = 2.6, dy = 1.35, y0 = FLOOR_Y + 0.8;
  const risers = [];
  for (let i = 0; i < rows; i++) {
    const z = z0 + i * dz, y = y0 + i * dy;
    risers.push(compose(-34, (y + FLOOR_Y) / 2, z, 52, y - FLOOR_Y, dz));
    risers.push(compose(34, (y + FLOOR_Y) / 2, z, 52, y - FLOOR_Y, dz));
  }
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), mat({ color: 0x1c1924 }), risers));
  const aisle = [];
  for (let i = 0; i < rows; i++) for (const x of [-7.6, 7.6]) aisle.push(compose(x, y0 + i * dy - 0.15, z0 + i * dz - 1.25, 0.35, 0.12, 0.05));
  root.add(instances(new THREE.BoxGeometry(1, 1, 1), glow(0xffb24a, 1.4), aisle));
  const audience = await buildCrowd({ rows, z0, dz, dy, y0 });
  audience.userData.keep = true;
  live.add(audience);

  // ---------- cameras: a crane jib and two pedestals at the table front ----------
  live.add(crane(V(78, FLOOR_Y, 64), 220, 14));
  live.add(crane(V(-82, FLOOR_Y, -76), 35, 10));
  for (const [x, z, ry] of [[-30, 56, Math.PI - 0.2], [26, 55, Math.PI + 0.25]]) live.add(pedestal(V(x, FLOOR_Y, z), ry));

  // ---------- floor cables and spike tape on the studio floor ----------
  const cableMat = mat({ color: 0x0e0d12 });
  for (const pts of [
    [V(-30, -5.9, 56), V(-10, -5.9, 54), V(10, -5.9, 56), V(26, -5.9, 55), V(50, -5.9, 58), V(78, -5.9, 64)],
    [V(78, -5.9, 64), V(96, -5.9, 52), V(110, -5.9, 20), V(112, -5.9, -30)],
  ]) root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.14, 6), cableMat));
  return { rods };
}

/**
 * The studio audience in the dark: the look test's four baked seated poses
 * (audience.glb), simplified to about a quarter of their triangles (they sit
 * 60+ m away in near darkness) and instanced per pose.
 */
async function buildCrowd(b) {
  const g = await loader.loadAsync("/assets/looktest/chars/audience.glb");
  const geos = [];
  const simplify = new SimplifyModifier();
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (name !== "position") geo.deleteAttribute(name);
    geo = mergeVertices(geo, 1e-4);
    geo = simplify.modify(geo, Math.floor(geo.attributes.position.count * 0.72));
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geo.computeVertexNormals();
    geos.push({ name: o.name, geo });
  });
  geos.sort((a, c) => a.name.localeCompare(c.name));
  const material = mat({ color: 0xffffff, rim: 0.1, rimColor: 0xb9a8ff });
  const shirts = [0x6b5a7a, 0x4a5a78, 0x7a4a4a, 0x56664a, 0x8a7a5a, 0x3c3a4c, 0x9a8a7a, 0x7a6a52, 0x5a4a6a, 0xa0705a].map((c) => new THREE.Color(c));
  const rand = rng(42);
  const lists = geos.map(() => []);
  for (let i = 0; i < b.rows; i++) {
    const top = b.y0 + i * b.dy, zc = b.z0 + i * b.dz;
    for (const side of [-1, 1]) for (let x = 9; x < 59; x += 1.35 + rand() * 0.3) {
      if (rand() < 0.1) continue; // empty seats
      const k = 0.92 + rand() * 0.16;
      const m = compose(side * x, top, zc - 0.2 + rand() * 0.15, k, k, k, 0, Math.PI + (rand() - 0.5) * 0.5, 0);
      lists[Math.floor(rand() * geos.length)].push([m, shirts[Math.floor(rand() * shirts.length)]]);
    }
  }
  const group = new THREE.Group();
  geos.forEach(({ geo }, i) => {
    if (!lists[i].length) return;
    group.add(instances(geo, material, lists[i].map((l) => l[0]), { colors: lists[i].map((l) => l[1]) }));
  });
  return group;
}

function valanceTexture() {
  const [c, g] = canvas(2048, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#2a1440");
  grd.addColorStop(1, "#7a2a6a");
  g.fillStyle = grd;
  g.fillRect(0, 0, 2048, 256);
  g.save();
  g.translate(1024, 300);
  for (let i = 0; i < 48; i++) {
    g.rotate((Math.PI * 2) / 48);
    g.fillStyle = i % 2 ? "rgba(255,180,61,0.28)" : "rgba(255,61,168,0.2)";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-60, -1400);
    g.lineTo(60, -1400);
    g.fill();
  }
  g.restore();
  const r = rng(9);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = r() > 0.5 ? "#ffe14d" : "#fff4e0";
    star(g, r() * 2048, 20 + r() * 190, 6 + r() * 14);
    g.fill();
  }
  // scalloped hem
  g.fillStyle = "#e8b23a";
  g.fillRect(0, 236, 2048, 8);
  g.strokeStyle = "rgba(0,0,0,0.2)";
  g.lineWidth = 3;
  for (let x = 128; x < 2048; x += 128) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 4, 256);
    g.stroke();
  }
  return tex(c, { wrap: false });
}

function crane(at, yawDeg, tiltDeg) {
  const m = mats();
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 5), m.craneMat);
  base.position.y = 1.2;
  g.add(base);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 8, 16), m.craneMat);
  col.position.y = 5.6;
  g.add(col);
  const pivot = new THREE.Group();
  pivot.position.y = 9.8;
  g.add(pivot);
  const boom = new THREE.Group();
  pivot.add(boom);
  const len = 34, tail = 8;
  const tube = new THREE.CylinderGeometry(0.42, 1.1, len + tail, 4, 1);
  tube.rotateY(Math.PI / 4);
  tube.rotateX(-Math.PI / 2);
  const tm = new THREE.Mesh(tube, m.yellow);
  tm.position.z = -(len - tail) / 2;
  boom.add(tm);
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.35, 20), m.metal);
    w.rotation.x = Math.PI / 2;
    w.position.set(0, -0.6, tail - 0.6 - i * 0.42);
    boom.add(w);
  }
  const cam = studioCamera(1.3);
  cam.position.set(0, -1.4, -len - 0.4);
  boom.add(cam);
  boom.rotation.x = THREE.MathUtils.degToRad(tiltDeg);
  pivot.rotation.y = THREE.MathUtils.degToRad(yawDeg);
  g.position.copy(at);
  g.userData.static = true;
  return g;
}

function pedestal(at, ry) {
  const m = mats();
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 3), m.craneMat);
  base.position.y = 0.6;
  g.add(base);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 4.5, 14), m.steel);
  col.position.y = 3;
  g.add(col);
  const cam = studioCamera(1.1);
  cam.position.y = 5.8;
  g.add(cam);
  g.position.copy(at);
  g.rotation.y = ry;
  g.scale.setScalar(1.3);
  g.userData.static = true;
  return g;
}

// ------------------------------------------------------------------ backstage spawn rooms
export function buildBackstage(root, live) {
  const m = mats();
  const out = [];
  for (const side of [-1, 1]) {
    const team = side < 0 ? "rockets" : "comets";
    const tint = side < 0 ? 0xe0705a : 0x6a83cf;
    const tintLite = side < 0 ? 0xf3b9a2 : 0xb9c6ee;
    const g = new THREE.Group();
    const X = (x) => side * x;
    // ---- exterior: the room is a big flat-built box. Bowl side is the finished show face.
    const face = mat({ map: facadeTexture(team), emissive: 0x000000 });
    const showWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 28), [m.ply, m.ply, m.black, m.black, m.plyEdge, m.plyEdge]);
    showWall.position.set(X(77), 4, 0);
    g.add(showWall);
    const showFace = new THREE.Mesh(new THREE.PlaneGeometry(28, 8), face);
    showFace.position.set(X(77) - side * 0.52, 4, 0);
    showFace.rotation.y = -side * Math.PI / 2;
    g.add(showFace);
    // back wall and the door walls: raw flats seen from behind (ply + 2x4 framing)
    const back = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 28), m.ply);
    back.position.set(X(105), 4, 0);
    g.add(back);
    const doorWall = mat({ map: doorWallTexture(tintLite) });
    for (const z of [-14, 14]) {
      for (const cx of [82, 100]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 1), [m.plyEdge, m.plyEdge, m.black, m.black, z > 0 ? doorWall : m.velour, z > 0 ? m.velour : doorWall]);
        w.position.set(X(cx), 4, z);
        g.add(w);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 1), m.black);
      lintel.position.set(X(91), 7, z);
      g.add(lintel);
      // stage door frame: chunky painted casing, bulbs all round, team emblem over the top
      const casing = mat({ color: tintLite });
      for (const [dx, dy, w, h] of [[-4.35, 3, 0.7, 6.2], [4.35, 3, 0.7, 6.2], [0, 6.35, 9.4, 0.7]]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.3), casing);
        c.position.set(X(91) + dx, dy, z);
        c.userData.outline = 1.2;
        g.add(c);
      }
      const bulbs = [];
      for (let i = 0; i <= 8; i++) {
        const y = 0.7 + i * 0.68;
        for (const dx of [-4.35, 4.35]) for (const dz of [-0.7, 0.7]) bulbs.push(compose(X(91) + dx, y, z + dz, 0.2, 0.2, 0.2));
      }
      for (let i = 0; i <= 11; i++) for (const dz of [-0.7, 0.7]) bulbs.push(compose(X(91) - 3.9 + i * 0.71, 6.35, z + dz, 0.2, 0.2, 0.2));
      live.add(instances(new THREE.SphereGeometry(1, 8, 6), glow(0xffe0a0, 2.0), bulbs));
      // emblem sign over the door, both faces
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.6), new THREE.MeshBasicMaterial({ map: emblemTexture(team), transparent: true }));
      for (const dz of [-0.68, 0.68]) {
        const s = sign.clone();
        s.position.set(X(91), 7.35, z + dz);
        if (dz < 0) s.rotation.y = Math.PI;
        s.userData.static = true;
        live.add(s);
      }
      // a warm spill of light out of the doorway onto the table
      const pool = glowSprite(0xffd9a0, 12, 0.18);
      pool.position.set(X(91), 1.2, z + Math.sign(z) * 3);
      live.add(pool);
    }
    // roof: black-painted ply deck with a few road cases and cable coils
    const roof = new THREE.Mesh(new THREE.BoxGeometry(28, 1, 28), [m.plyEdge, m.plyEdge, m.black, m.black, m.plyEdge, m.plyEdge]);
    roof.position.set(X(91), 8.5, 0);
    // The roof casts no shadow: the team waits under it during the countdown, and in its
    // shadow they read as muddy shapes. The key light "is" the room's work lights.
    roof.userData.noShadow = true;
    g.add(roof);
    const caseMat = mat({ color: 0x24222c, rim: 0.2, rimColor: 0x9a98a8 });
    const caseEdge = mat({ color: 0xb8bcc6 });
    for (const [cx, cz, w, d, h] of [[84, -8, 4, 3, 2.2], [97, 6, 3, 5, 1.8], [100, -9, 2.5, 2.5, 1.2]]) {
      const c = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.15), caseMat);
      c.position.set(X(cx), 9 + h / 2, cz);
      g.add(c);
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.18, d + 0.06), caseEdge);
      band.position.set(X(cx), 9 + h * 0.8, cz);
      g.add(band);
    }
    // ---- interior: black velour walls, black stage floor with spike tape, a dressing mirror, a ghost light
    const inner = [];
    for (const [x, z, w, d, ry] of [[X(77.6), 0, 26.8, 0.1, side * Math.PI / 2], [X(104.4), 0, 26.8, 0.1, -side * Math.PI / 2]]) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(26.8, 7.6), m.velour);
      v.position.set(x, 3.9, z);
      v.rotation.y = ry;
      g.add(v);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(27, 27), mat({ color: 0x2e2734 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(X(91), 0.02, 0);
    g.add(floor);
    const tapeY = mat({ color: 0xf7e14a });
    for (const [x, z] of [[86, -5], [96, 4], [91, -1], [88, 7]]) for (const r of [Math.PI / 4, -Math.PI / 4]) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.24), tapeY);
      t.rotation.set(-Math.PI / 2, 0, r);
      t.position.set(X(x), 0.04, z);
      g.add(t);
    }
    // dressing-room mirror on the back wall with a bulb frame
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), new THREE.MeshBasicMaterial({ map: mirrorTexture(), fog: false }));
    mirror.position.set(X(104.3), 4.2, 0);
    mirror.rotation.y = -side * Math.PI / 2;
    g.add(mirror);
    const mb = [];
    for (let i = 0; i <= 10; i++) for (const y of [2.0, 6.4]) mb.push(compose(X(104.2), y, -4.5 + i * 0.9, 0.18, 0.18, 0.18));
    for (let i = 1; i < 5; i++) for (const z of [-4.9, 4.9]) mb.push(compose(X(104.2), 2.0 + i * 0.88, z, 0.18, 0.18, 0.18));
    live.add(instances(new THREE.SphereGeometry(1, 8, 6), glow(0xffe8b8, 1.8), mb));
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 12), mat({ color: 0x8b6a43 }));
    counter.position.set(X(103.2), 1.6, 0);
    g.add(counter);
    // ghost light: a bare bulb on a stand
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), m.steel);
    stand.position.set(X(86), 2.1, 6);
    g.add(stand);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.2, 12), m.metal);
    foot.position.set(X(86), 0.1, 6);
    g.add(foot);
    const ghost = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), glow(0xfff0c8, 2.6));
    ghost.position.set(X(86), 4.4, 6);
    ghost.userData.static = true;
    live.add(ghost);
    const gs = glowSprite(0xffe0a0, 4, 0.8);
    gs.position.copy(ghost.position);
    live.add(gs);
    // team-tinted wardrobe rack: a rail of spare jumpsuits on hangers (shoulders, sleeves and
    // legs, cream piping), and a shelf of spare helmets above it
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8, 6), m.steel);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(X(80), 5.2, -4);
    g.add(rail);
    const suits = [], hooks = [];
    const yaw = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const z = -7.1 + i * 1.25;
      const o = new THREE.Object3D();
      o.position.set(X(80), 2.43, z);
      o.scale.setScalar(0.8);
      o.rotation.set(0, yaw + (i % 2 ? 0.12 : -0.1), 0);
      o.updateMatrix();
      suits.push(o.matrix.clone());
      hooks.push(compose(X(80), 5.0, z, 1, 1, 1));
    }
    g.add(instances(jumpsuitGeometry(), mat({ map: jumpsuitTexture(tint) }), suits));
    g.add(instances(new THREE.TorusGeometry(0.14, 0.03, 4, 10, Math.PI * 1.4), m.steel, hooks));
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 8), mat({ color: 0x8b6a43 }));
    shelf.position.set(X(78.6), 6.4, -4);
    g.add(shelf);
    const helmets = [], visors = [];
    for (let i = 0; i < 4; i++) {
      helmets.push(compose(X(78.7), 6.85, -7 + i * 2, 0.42, 0.4, 0.42));
      visors.push(compose(X(78.7) + side * 0.33, 6.85, -7 + i * 2, 0.12, 0.17, 0.3));
    }
    g.add(instances(new THREE.SphereGeometry(1, 14, 10), mat({ color: tint, gloss: 0.5 }), helmets));
    g.add(instances(new THREE.SphereGeometry(1, 10, 8), mat({ color: 0x1b1220, gloss: 0.8 }), visors));
    // an overhead tungsten work light: a caged lamp on the ceiling and a warm pool on the floor
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 0.5, 12), m.metal);
    lamp.position.set(X(91), 7.7, -5);
    g.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), glow(0xffe6c2, 2.8));
    bulb.position.set(X(91), 7.35, -5);
    bulb.userData.static = true;
    live.add(bulb);
    const lampGlow = glowSprite(0xffe6c2, 5, 0.75);
    lampGlow.position.copy(bulb.position);
    live.add(lampGlow);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(X(91), 0.05, -5);
    pool.userData.static = true;
    live.add(pool);
    for (const z of [-8, 0]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.2, 6), m.steel);
      post.position.set(X(80), 2.6, z);
      g.add(post);
    }
    // Interior pieces ignore the roof's shadow, so the key light "fills" the room
    // without a real point light (keeps the per-pixel light count down).
    for (const o of g.children) {
      if (!o.isMesh) continue;
      const inside = Math.abs(o.position.z) < 13.4 && Math.abs(o.position.x) > 77.5 && Math.abs(o.position.x) < 104.6 && o.position.y < 8;
      o.castShadow = !inside && !o.userData.noShadow;
      o.receiveShadow = !inside;
    }
    root.add(g);
    out.push(g);
  }
  return out;
}

/** Dressing-room mirror: a plum-to-magenta show-drop reflection with two white glint strokes. */
function mirrorTexture() {
  const [c, g] = canvas(256, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#7a2a6a");
  grad.addColorStop(1, "#2a1440");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = "rgba(255,244,224,0.75)";
  g.lineCap = "round";
  for (const [x, w] of [[150, 18], [190, 7]]) {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, 118);
    g.lineTo(x + 55, 12);
    g.stroke();
  }
  g.strokeStyle = "#120e18";
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 120);
  return tex(c, { wrap: false });
}

/** Spare jumpsuit, flat on a hanger: shoulders, sleeves, legs (local +x across, +y up). */
let suitGeometry = null;
function jumpsuitGeometry() {
  if (suitGeometry) return suitGeometry;
  const sh = new THREE.Shape();
  const pts = [[0, 3.15], [0.55, 3.05], [0.95, 2.9], [1.15, 2.35], [1.05, 1.5], [0.82, 1.52], [0.85, 2.3], [0.7, 2.4], [0.68, 1.45],
    [0.62, 0.05], [0.18, 0.05], [0.05, 1.25], [-0.05, 1.25], [-0.18, 0.05], [-0.62, 0.05], [-0.68, 1.45], [-0.7, 2.4], [-0.85, 2.3],
    [-0.82, 1.52], [-1.05, 1.5], [-1.15, 2.35], [-0.95, 2.9], [-0.55, 3.05]];
  pts.forEach(([x, y], i) => sh[i ? "lineTo" : "moveTo"](x, y));
  suitGeometry = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
  suitGeometry.translate(0, 0, -0.11);
  // planar UVs across the front, 0..1 over the suit's bounds
  const p = suitGeometry.attributes.position, uv = suitGeometry.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 1.2) / 2.4, p.getY(i) / 3.2);
  return suitGeometry;
}
function jumpsuitTexture(tint) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = `#${new THREE.Color(tint).getHexString()}`;
  g.fillRect(0, 0, 128, 128);
  // cream piping down the sides and legs, a dark belt, a chest number patch
  g.fillStyle = "#fff4e0";
  for (const x of [22, 102]) g.fillRect(x, 0, 5, 128);
  g.fillRect(44, 0, 4, 76);
  g.fillRect(80, 0, 4, 76);
  g.fillStyle = "#2a1c26";
  g.fillRect(14, 74, 100, 7);
  g.fillStyle = "rgba(255,244,224,0.85)";
  g.beginPath();
  g.arc(64, 30, 9, 0, Math.PI * 2);
  g.fill();
  return tex(c, { wrap: false });
}
function poolTexture() {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,226,180,0.30)");
  grad.addColorStop(0.6, "rgba(255,210,150,0.12)");
  grad.addColorStop(1, "rgba(255,200,140,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return tex(c, { wrap: false });
}

function facadeTexture(team) {
  const W = 1792, H = 512;
  const [c, g] = canvas(W, H);
  const rockets = team === "rockets";
  const base = rockets ? "#3a1420" : "#141c3a";
  const panel = rockets ? "#e0705a" : "#6a83cf";
  const lite = rockets ? "#f3b9a2" : "#b9c6ee";
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // marquee panel with a starburst behind the team emblem
  g.save();
  g.beginPath();
  g.roundRect(360, 60, W - 720, H - 120, 60);
  g.clip();
  g.fillStyle = panel;
  g.fillRect(0, 0, W, H);
  g.translate(W / 2, H / 2);
  for (let i = 0; i < 28; i++) {
    g.rotate((Math.PI * 2) / 28);
    g.fillStyle = i % 2 ? "rgba(255,244,224,0.22)" : "rgba(0,0,0,0.06)";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-90, -900);
    g.lineTo(90, -900);
    g.fill();
  }
  g.restore();
  g.lineWidth = 14;
  g.strokeStyle = lite;
  g.beginPath();
  g.roundRect(360, 60, W - 720, H - 120, 60);
  g.stroke();
  emblem(g, team, W / 2, H / 2, 150);
  // side stripes
  for (const x of [120, W - 120]) {
    for (let k = 0; k < 3; k++) {
      g.fillStyle = [lite, "#ffe14d", lite][k];
      g.fillRect(x - 70 + k * 50, 40, 26, H - 80);
    }
  }
  return tex(c, { wrap: false });
}

/** Team emblem pictogram: a rocket (Rockets) or a comet (Comets), cream with ink keyline. */
function emblem(g, team, x, y, s) {
  g.save();
  g.translate(x, y);
  g.lineJoin = "round";
  g.lineWidth = s * 0.09;
  g.strokeStyle = "#1b1220";
  g.fillStyle = "#fff4e0";
  if (team === "rockets") {
    g.rotate(0.6);
    g.beginPath();
    g.moveTo(0, -s);
    g.bezierCurveTo(s * 0.45, -s * 0.6, s * 0.4, s * 0.35, s * 0.28, s * 0.6);
    g.lineTo(-s * 0.28, s * 0.6);
    g.bezierCurveTo(-s * 0.4, s * 0.35, -s * 0.45, -s * 0.6, 0, -s);
    g.fill();
    g.stroke();
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * s * 0.3, s * 0.1);
      g.lineTo(sx * s * 0.62, s * 0.72);
      g.lineTo(sx * s * 0.26, s * 0.55);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.fillStyle = "#ffe14d";
    g.beginPath();
    g.moveTo(-s * 0.2, s * 0.66);
    g.quadraticCurveTo(0, s * 1.35, s * 0.2, s * 0.66);
    g.fill();
    g.stroke();
    g.fillStyle = "#1b1220";
    g.beginPath();
    g.arc(0, -s * 0.25, s * 0.14, 0, Math.PI * 2);
    g.fill();
  } else {
    g.rotate(-0.5);
    // tail: three tapered streaks
    for (const [w, off] of [[0.22, -0.32], [0.3, 0], [0.22, 0.32]]) {
      g.beginPath();
      g.moveTo(-s * 0.15, off * s - w * s * 0.5);
      g.quadraticCurveTo(s * 0.9, off * s * 1.6, s * 1.25, off * s * 2.0);
      g.quadraticCurveTo(s * 0.9, off * s * 1.6 + w * s * 0.2, -s * 0.15, off * s + w * s * 0.5);
      g.closePath();
      g.fill();
      g.stroke();
    }
    star(g, -s * 0.3, 0, s * 0.55, 0.5, -Math.PI / 2);
    g.fillStyle = "#ffe14d";
    g.fill();
    g.stroke();
  }
  g.restore();
}

export function emblemTexture(team, w = 512, h = 136) {
  const [c, g] = canvas(w, h);
  g.fillStyle = team === "rockets" ? "#3a1420" : "#141c3a";
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, 30);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = "#ffe14d";
  g.stroke();
  emblem(g, team, w / 2, h / 2, h * 0.36);
  for (const x of [70, w - 70]) {
    g.fillStyle = "#fff4e0";
    star(g, x, h / 2, 22);
    g.fill();
  }
  const t = tex(c, { wrap: false });
  return t;
}

export { emblem };

function doorWallTexture(tint) {
  const [c, g] = canvas(512, 384);
  g.fillStyle = "#2a2433";
  g.fillRect(0, 0, 512, 384);
  // painted flat: tinted panels with a moulding, the show's backstage paint
  g.fillStyle = tint;
  g.globalAlpha = 0.55;
  g.fillRect(30, 30, 452, 220);
  g.globalAlpha = 1;
  g.strokeStyle = "#fff4e0";
  g.lineWidth = 6;
  g.strokeRect(30, 30, 452, 220);
  g.fillStyle = "#16131c";
  g.fillRect(0, 300, 512, 84);
  g.fillStyle = "#e8c35a";
  g.fillRect(0, 300, 512, 8);
  return tex(c, { wrap: false });
}
