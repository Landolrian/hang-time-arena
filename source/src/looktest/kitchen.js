import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { toon, recolor, shadows, addOutlines } from "./toon.js";
import * as T from "./textures.js";
import { glowSprite } from "./studio.js";

const loader = new GLTFLoader();
const K = (n) => loader.loadAsync(`/assets/looktest/kitchen/${n}.glb`).then((g) => g.scene);

export const S = 21; // giant scale for the counter run (0.43 Kenney units -> 9 m modules)
export const WALL_Z = -40.6; // front face of the back flat
export const COUNTER_H = 0.45 * S;

function place(obj, { x = 0, y = 0, z = 0, ry = 0, s = S }) {
  obj.scale.setScalar(s);
  obj.rotation.y = ry;
  obj.position.set(x, y, z);
  return obj;
}

export async function buildKitchen(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const out = { root };

  const mat = {
    almond: toon({ color: 0xf1e2c2 }),
    oak: toon({ color: 0xc98a55 }),
    oakDark: toon({ color: 0x9a6438 }),
    chrome: toon({ color: 0xd2d8de, rim: 0xffffff, rimStrength: 0.55 }),
    chromeDark: toon({ color: 0x8d96a2, rim: 0xffffff, rimStrength: 0.4 }),
    enamel: toon({ color: 0xf6f1e6, rim: 0xfff6e0, rimStrength: 0.25 }),
    black: toon({ color: 0x2a2730 }),
    glass: toon({ color: 0x2e3a4a, rim: 0x9fdcff, rimStrength: 0.6 }),
    mint: toon({ color: 0x8fcdbf }),
    mintEdge: toon({ color: 0x6fb3a4 }),
    harvest: toon({ color: 0xe8a04a }),
  };

  // ---------- back flat (wallpaper front, plywood back, ply edge) ----------
  const wallTex = T.wallpaperTexture();
  wallTex.repeat.set(112 / 6, 34 / 6);
  const ply = toon({ map: T.plyTexture() });
  const plyEdge = toon({ color: 0xd9bb86 });
  const flatGeo = new THREE.BoxGeometry(112, 34, 0.6);
  const flat = new THREE.Mesh(flatGeo, [plyEdge, plyEdge, plyEdge, plyEdge, toon({ map: wallTex }), ply]);
  flat.position.set(0, 17, WALL_Z - 0.3);
  root.add(flat);
  // crown moulding, a strip of oak along the top
  const crown = new THREE.Mesh(new THREE.BoxGeometry(112.4, 0.9, 1.0), mat.oak);
  crown.position.set(0, 33.7, WALL_Z + 0.2);
  root.add(crown);
  // baseboard behind counters is hidden; skirting along visible floor edges
  // ---------- side flat, stage right, with a painted window ----------
  const sideLen = 30;
  const sideTex = T.wallpaperTexture();
  sideTex.repeat.set(sideLen / 6, 34 / 6);
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.6, 34, sideLen), [
    ply,
    toon({ map: sideTex }),
    plyEdge,
    plyEdge,
    plyEdge,
    plyEdge,
  ]);
  side.position.set(55.7, 17, WALL_Z - 0.6 + sideLen / 2);
  root.add(side);
  const crown2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, sideLen), mat.oak);
  crown2.position.set(55.2, 33.7, side.position.z);
  root.add(crown2);
  // starburst wall clock on the stage-right flat
  {
    const clock = new THREE.Group();
    const brass = toon({ color: 0xd9a441, rim: 0xfff0b0, rimStrength: 0.35 });
    const face = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.5, 40), toon({ color: 0xfff4e0 }));
    face.rotation.z = Math.PI / 2;
    clock.add(face);
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.28, 10, 40), brass);
    rimRing.rotation.y = Math.PI / 2;
    clock.add(rimRing);
    for (let i = 0; i < 24; i++) {
      const long = i % 2 === 0;
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.22, long ? 3.6 : 2.2, 0.32), brass);
      const a = (i / 24) * Math.PI * 2;
      const r = 2.95 + (long ? 1.8 : 1.1);
      ray.position.set(0, Math.cos(a) * r, Math.sin(a) * r);
      ray.rotation.x = -a;
      clock.add(ray);
      if (long) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), brass);
        ball.position.set(0, Math.cos(a) * (r + 1.9), Math.sin(a) * (r + 1.9));
        clock.add(ball);
      }
    }
    const handMat = toon({ color: 0x2a2730 });
    const hh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.28), handMat);
    hh.geometry.translate(0, 0.7, 0);
    hh.rotation.x = -2.1;
    hh.position.x = -0.35;
    const mh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.3, 0.2), handMat);
    mh.geometry.translate(0, 1.0, 0);
    mh.rotation.x = 0.35;
    mh.position.x = -0.4;
    clock.add(hh, mh);
    clock.position.set(55.1, 23, WALL_Z + 18);
    root.add(clock);
    out.clock = clock;
  }
  // brace jacks behind the side flat (visible from stage-right angles)
  const jack = toon({ color: 0x8b6a43 });
  for (let z = WALL_Z + 4; z < WALL_Z + sideLen; z += 9) {
    const len = Math.hypot(22, 12);
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 0.35), jack);
    b.position.set(56 + 6, 11, z);
    b.rotation.z = -Math.atan2(22, 12);
    root.add(b);
    const bag = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.9, 1.0, 2, 0.3), toon({ color: 0x4d4a3c }));
    bag.position.set(68, 0.45, z);
    root.add(bag);
  }

  // ---------- counter run along the back wall ----------
  const [cab, drawer, stove, sink, fridge, upper, upperD, toaster] = await Promise.all(
    [
      "kitchenCabinet",
      "kitchenCabinetDrawer",
      "kitchenStove",
      "kitchenSink",
      "kitchenFridgeLarge",
      "kitchenCabinetUpper",
      "kitchenCabinetUpperDouble",
      "toaster",
    ].map(K),
  );
  const cabTable = { wood: mat.almond, woodDark: mat.oak, metal: mat.chrome, metalDark: mat.black, metalLight: mat.enamel, metalMedium: mat.chromeDark, glass: mat.glass, carpetWhite: mat.enamel, _defaultMat: mat.chrome };
  const modW = 0.43 * S;
  const x0 = -54 + 0.5;
  const run = ["drawer", "cab", "sink", "cab", "drawer", "stove", "drawer", "cab", "drawer"];
  const pieces = { cab, drawer, stove, sink };
  run.forEach((k, i) => {
    const o = pieces[k].clone(true);
    recolor(o, cabTable);
    place(o, { x: x0 + i * modW, z: WALL_Z + 0.45 * S });
    root.add(o);
    if (k === "sink") out.sinkX = x0 + (i + 0.5) * modW;
    if (k === "stove") out.stoveX = x0 + (i + 0.5) * modW;
  });
  const runEnd = x0 + run.length * modW;
  // continuous mint laminate counter top with a chrome edge band (hides module seams)
  const topY = COUNTER_H;
  const counterTop = new THREE.Mesh(new RoundedBoxGeometry(runEnd - x0 + 0.6, 0.7, 0.45 * S + 0.9, 3, 0.25), mat.mint);
  counterTop.position.set((x0 + runEnd) / 2, topY + 0.2, WALL_Z + (0.45 * S + 0.9) / 2);
  root.add(counterTop);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(runEnd - x0 + 0.7, 0.18, 0.2), mat.chrome);
  edge.position.set(counterTop.position.x, topY + 0.28, WALL_Z + 0.45 * S + 0.95);
  root.add(edge);
  // cut-outs are faked: stove top + sink basin sit just above the laminate
  const hob = new THREE.Mesh(new RoundedBoxGeometry(modW - 0.6, 0.3, 0.45 * S - 1.0, 2, 0.12), mat.enamel);
  hob.position.set(out.stoveX, topY + 0.6, WALL_Z + (0.45 * S) / 2);
  root.add(hob);
  for (const [dx, dz, r] of [
    [-2.1, -1.9, 1.5],
    [2.1, -1.9, 1.2],
    [-2.1, 2.0, 1.2],
    [2.1, 2.0, 1.5],
  ]) {
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, 28), mat.black);
    burner.position.set(out.stoveX + dx, topY + 0.8, hob.position.z + dz);
    root.add(burner);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 0.11, 8, 28), mat.chromeDark);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(burner.position.x, topY + 0.93, burner.position.z);
    root.add(coil);
  }
  // one burner glowing hot (an orange practical on the set)
  {
    const hot = new THREE.Mesh(new THREE.TorusGeometry(1.5 * 0.62, 0.13, 8, 28), new THREE.MeshBasicMaterial({ color: 0xff5a1e }));
    hot.rotation.x = Math.PI / 2;
    hot.position.set(out.stoveX - 2.1, topY + 0.96, hob.position.z - 1.9);
    root.add(hot);
    const hg = glowSprite(0xff6a2a, 6, 0.55);
    hg.position.set(hot.position.x, topY + 1.4, hot.position.z);
    root.add(hg);
  }
  const basin = new THREE.Mesh(new RoundedBoxGeometry(modW - 1.6, 0.22, 0.45 * S - 2.4, 2, 0.4), mat.chromeDark);
  basin.position.set(out.sinkX, topY + 0.52, WALL_Z + (0.45 * S) / 2);
  root.add(basin);
  // backsplash tiles between counter and upper cabinets
  const tileTex = T.tileTexture();
  tileTex.repeat.set((runEnd - x0) / 6, 8.5 / 6);
  const splash = new THREE.Mesh(new THREE.PlaneGeometry(runEnd - x0, 8.5), toon({ map: tileTex }));
  splash.position.set((x0 + runEnd) / 2, topY + 0.55 + 4.25, WALL_Z + 0.02);
  root.add(splash);

  // upper cabinets, with a gap over the sink for the painted window
  const upY = topY + 0.55 + 8.5;
  run.forEach((k, i) => {
    const cx = x0 + (i + 0.5) * modW;
    if (k === "sink" || k === "stove") return;
    const o = (i % 2 ? upper : upperD).clone(true);
    recolor(o, cabTable);
    place(o, { x: x0 + i * modW, y: upY, z: WALL_Z + 0.21 * S });
    root.add(o);
  });
  // range hood over the stove
  {
    const hood = new THREE.Mesh(new RoundedBoxGeometry(modW + 0.4, 3.2, 6.5, 3, 0.4), mat.harvest);
    hood.position.set(out.stoveX, upY + 2.2, WALL_Z + 3.25);
    root.add(hood);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(modW + 0.6, 0.5, 0.6), mat.oak);
    lip.position.set(out.stoveX, upY + 0.85, WALL_Z + 6.5);
    root.add(lip);
  }
  // painted window over the sink: trim, painted sky, cafe curtains, sill
  {
    const wx = out.sinkX,
      wy = upY + 6.5,
      ww = 8.2,
      wh = 10;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), toon({ map: T.windowSkyTexture() }));
    sky.position.set(wx, wy, WALL_Z + 0.03);
    root.add(sky);
    const trim = mat.enamel;
    const bars = [
      [0, wh / 2 + 0.35, ww + 1.4, 0.7],
      [0, -wh / 2 - 0.35, ww + 1.4, 0.7],
      [-ww / 2 - 0.35, 0, 0.7, wh],
      [ww / 2 + 0.35, 0, 0.7, wh],
      [0, 0, 0.35, wh],
      [0, 0.8, ww, 0.35],
    ];
    for (const [dx, dy, w, h] of bars) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), trim);
      b.position.set(wx + dx, wy + dy, WALL_Z + 0.25);
      root.add(b);
    }
    const sill = new THREE.Mesh(new THREE.BoxGeometry(ww + 2.4, 0.45, 1.6), mat.oak);
    sill.position.set(wx, wy - wh / 2 - 0.85, WALL_Z + 0.8);
    root.add(sill);
    // cafe curtains: gathered gingham-coloured panels with wavy profile
    const shape = new THREE.Shape();
    const cw = ww / 2 - 0.3;
    shape.moveTo(0, 0);
    for (let i = 0; i <= 16; i++) shape.lineTo((cw * i) / 16, Math.sin(i * 1.6) * 0.18);
    shape.lineTo(cw, 0.36);
    for (let i = 16; i >= 0; i--) shape.lineTo((cw * i) / 16, 0.36 + Math.sin(i * 1.6) * 0.18);
    const cGeo = new THREE.ExtrudeGeometry(shape, { depth: wh * 0.48, bevelEnabled: false });
    cGeo.rotateX(Math.PI / 2);
    const curtainMat = toon({ color: 0xe89a7a });
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(cGeo, curtainMat);
      c.position.set(sx < 0 ? wx - ww / 2 : wx + 0.3, wy + 0.6, WALL_Z + 0.9);
      root.add(c);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, ww + 1, 8), mat.chrome);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(wx, wy + 0.7, WALL_Z + 1.1);
    root.add(rod);
  }

  // fridge in the corner, stage right
  {
    const f = fridge.clone(true);
    recolor(f, { metalLight: toon({ color: 0xa9d8c8, rim: 0xffffff, rimStrength: 0.2 }), metalMedium: mat.chrome });
    place(f, { x: runEnd + 1.2, z: WALL_Z + 0.342 * S, s: S });
    root.add(f);
    out.fridge = f;
  }

  // ---------- hero props ----------
  // giant toaster on the floor, centre-left
  {
    const t = toaster.clone(true);
    recolor(t, { metalMedium: mat.black, metal: mat.chrome });
    place(t, { x: -5, z: -11, ry: 0.3, s: 62 });
    root.add(t);
    out.toaster = t;
    // two slices of toast poking out of the slots
    const toastMat = [toon({ color: 0xd99a4e }), toon({ color: 0xd99a4e }), toon({ color: 0xb0702e }), toon({ color: 0xd99a4e }), toon({ color: 0xf2d39a }), toon({ color: 0xf2d39a })];
    for (const dz of [-0.9, 1.0]) {
      const sl = new THREE.Mesh(new RoundedBoxGeometry(6.8, 6.5, 0.9, 3, 0.35), toastMat);
      const slice = new THREE.Group();
      slice.add(sl);
      slice.position.set(0, 7.2, dz);
      slice.rotation.z = dz > 0 ? 0.05 : -0.04;
      const holder = new THREE.Group();
      holder.add(slice);
      holder.position.copy(t.position);
      holder.rotation.y = t.rotation.y;
      root.add(holder);
    }
  }
  // cereal box, centre-right, plus spilled rings
  {
    const { front, side } = T.cerealTextures();
    const w = 10,
      h = 14,
      d = 3.6;
    const sideMat = toon({ map: side });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
      sideMat,
      sideMat,
      toon({ color: 0x2d58c8 }),
      toon({ color: 0x2d58c8 }),
      toon({ map: front }),
      toon({ color: 0x2d58c8 }),
    ]);
    box.position.set(0, h / 2, 0);
    const g = new THREE.Group();
    g.add(box);
    // open top flap
    const flap = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.12, d * 0.9), toon({ color: 0xcfc2a8 }));
    flap.geometry.translate(0, 0, d * 0.45);
    flap.position.set(0, h + 0.05, -d / 2 + 0.05);
    flap.rotation.x = -1.05;
    g.add(flap);
    g.position.set(17, 0, -14);
    g.rotation.y = -0.3;
    root.add(g);
    out.cereal = g;
    // puffed cereal rings: small, flat-ish, lumpy, toasted fruity colours
    const ringCols = [0xf0a24a, 0xff8a7a, 0xffd25a, 0xbcd86a, 0xc97bd8];
    const ringMats = ringCols.map((c) => toon({ color: c }));
    const rr = T.rng(21);
    const ringGeo = (() => {
      const geo = new THREE.TorusGeometry(0.8, 0.34, 10, 22);
      const pos = geo.attributes.position, nrm = geo.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const k = (Math.sin(pos.getX(i) * 7.1) * Math.cos(pos.getY(i) * 6.3) + Math.sin(pos.getZ(i) * 9.7)) * 0.045;
        pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * k, pos.getY(i) + nrm.getY(i) * k, pos.getZ(i) * 0.72 + nrm.getZ(i) * k);
      }
      geo.computeVertexNormals();
      return geo;
    })();
    out.rings = new THREE.Group();
    // a spill fanning out from the box's open top toward the camera side
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const x = 20 + t * 13 + (rr() - 0.5) * 6;
      const z = -9 + t * 10 + (rr() - 0.5) * 6;
      const r = new THREE.Mesh(ringGeo, ringMats[i % ringMats.length]);
      const flat = rr() > 0.25;
      r.position.set(x, flat ? 0.25 : 0.75, z);
      r.rotation.set(flat ? Math.PI / 2 + (rr() - 0.5) * 0.2 : 0.4 + rr() * 0.8, rr() * Math.PI, (rr() - 0.5) * 0.3);
      out.rings.add(r);
    }
    root.add(out.rings);
  }
  // giant diner mug tipped near the front: lathe body, chunky handle, coffee ring
  {
    const pts = [];
    const R = 5.2, H = 10.5;
    pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(R - 0.4, 0), new THREE.Vector2(R, 0.4));
    pts.push(new THREE.Vector2(R + 0.15, H - 0.3), new THREE.Vector2(R - 0.1, H), new THREE.Vector2(R - 0.7, H), new THREE.Vector2(R - 0.75, 0.9), new THREE.Vector2(0, 0.9));
    const body = new THREE.LatheGeometry(pts, 64);
    const mugMat = toon({ color: 0xf6efe2, rim: 0xffffff, rimStrength: 0.2 });
    const mug = new THREE.Group();
    const bm = new THREE.Mesh(body, mugMat);
    mug.add(bm);
    // two cream bands, 70s-80s diner style
    for (const [y, h, c] of [[7.6, 1.3, 0xe8642c], [6.4, 0.45, 0xe8a04a]]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.13, R + 0.12, h, 64, 1, true), toon({ color: c }));
      band.position.y = y;
      mug.add(band);
    }
    const handle = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.85, 16, 32, Math.PI * 1.15), mugMat);
    handle.rotation.z = -Math.PI * 0.575 + Math.PI / 2;
    handle.position.set(R + 0.4, H * 0.5, 0);
    mug.add(handle);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(R - 0.75, 40), toon({ color: 0x4a2a1a }));
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = H * 0.82;
    mug.add(coffee);
    mug.position.set(-36, 0, 8);
    mug.rotation.y = -0.5;
    root.add(mug);
    out.mug = mug;
  }
  shadows(root, true, true);
  flat.castShadow = false;
  addOutlines(out.toaster, 1.6, 30);
  addOutlines(out.cereal, 1.6, 30);
  addOutlines(out.fridge, 1.4, 30);
  addOutlines(out.mug, 1.6, 30);
  addOutlines(out.clock, 1.2, 30);
  return out;
}
