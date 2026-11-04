import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { toon, addRim, recolor, shadows, RAMPS, addOutlines } from "./toon.js";
import * as T from "./textures.js";

const loader = new GLTFLoader();
export const DECK_Y = 0; // top of the set floor
export const STUDIO_Y = -1.4; // studio concrete floor

const mats = {};
function M() {
  if (mats.metal) return mats;
  mats.metal = toon({ color: 0x2b2933, rim: 0x8a8794, rimStrength: 0.35 });
  mats.truss = toon({ color: 0x8f8d99, emissive: 0x2c2a36 });
  addRim(mats.truss, 0xd8d6e4, 0.3, 1.5);
  mats.metalLit = toon({ color: 0x55525e, rim: 0xb0aebc, rimStrength: 0.3 });
  mats.black = toon({ color: 0x1a1820 });
  mats.ply = toon({ map: T.plyTexture() });
  mats.wood2x4 = toon({ color: 0xb08850 });
  mats.brace = toon({ color: 0x8b6a43 });
  mats.sandbag = toon({ color: 0x4d4a3c });
  mats.concrete = toon({ color: 0x24212b });
  mats.chrome = toon({ color: 0xc7cdd3, rim: 0xffffff, rimStrength: 0.5 });
  mats.rubber = toon({ color: 0x141218 });
  return mats;
}

// ---------- helpers ----------
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _s = new THREE.Vector3(),
  _p = new THREE.Vector3();
/** matrix that turns a unit cylinder (h=1, r=1, along Y) into a rod a->b */
function rodMatrix(a, b, r) {
  const d = _p.subVectors(b, a);
  const len = d.length();
  _q.setFromUnitVectors(UP, d.clone().normalize());
  _s.set(r, len, r);
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), _q, _s);
}
class Rods {
  constructor(material, radialSegs = 8) {
    this.geo = new THREE.CylinderGeometry(1, 1, 1, radialSegs, 1, false);
    this.mat = material;
    this.list = [];
  }
  add(a, b, r) {
    this.list.push(rodMatrix(a, b, r));
  }
  build(parent, cast = true) {
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.list.length);
    this.list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = cast;
    im.receiveShadow = false;
    parent.add(im);
    return im;
  }
}
class Boxes {
  constructor(material) {
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mat = material;
    this.list = [];
  }
  add(x, y, z, w, h, d, ry = 0, rx = 0, rz = 0) {
    this.list.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")),
        new THREE.Vector3(w, h, d),
      ),
    );
  }
  build(parent, cast = true) {
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.list.length);
    this.list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = cast;
    im.receiveShadow = true;
    parent.add(im);
    return im;
  }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Box truss between a and b (horizontal), section `w`, triangulated lacing. */
function truss(rods, a, b, w = 1.9, chordR = 0.21, laceR = 0.11) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  dir.normalize();
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  const h = w / 2;
  const corners = [
    side.clone().multiplyScalar(h).add(V(0, h, 0)),
    side.clone().multiplyScalar(-h).add(V(0, h, 0)),
    side.clone().multiplyScalar(-h).add(V(0, -h, 0)),
    side.clone().multiplyScalar(h).add(V(0, -h, 0)),
  ];
  for (const c of corners) rods.add(a.clone().add(c), b.clone().add(c), chordR);
  const n = Math.max(2, Math.round(len / (w * 1.6)));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const p0 = a.clone().addScaledVector(dir, i * step);
    const p1 = a.clone().addScaledVector(dir, (i + 1) * step);
    for (let k = 0; k < 4; k++) {
      const c0 = corners[k],
        c1 = corners[(k + 1) % 4];
      // zig-zag lacing alternates direction each bay
      if (i % 2) rods.add(p0.clone().add(c0), p1.clone().add(c1), laceR);
      else rods.add(p0.clone().add(c1), p1.clone().add(c0), laceR);
    }
    // ladder rungs every other bay
    if (i % 2 === 0) for (let k = 0; k < 4; k++) rods.add(p0.clone().add(corners[k]), p0.clone().add(corners[(k + 1) % 4]), laceR);
  }
  for (let k = 0; k < 4; k++) rods.add(b.clone().add(corners[k]), b.clone().add(corners[(k + 1) % 4]), laceR);
}

// ---------- fake light beams ----------
const beamGeo = (() => {
  const g = new THREE.CylinderGeometry(0.0, 1, 1, 40, 12, true);
  g.translate(0, -0.5, 0); // apex at origin, opens down -Y
  return g;
})();
export function beamMaterial(color, strength = 0.3) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength } },
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ vT = -position.y; vec4 mv = modelViewMatrix * vec4(position,1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float strength; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
      float along = smoothstep(0.0, 0.08, vT) * pow(clamp(1.0 - vT, 0.0, 1.0), 1.6);
      gl_FragColor = vec4(color * strength * edge * along, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}
export function makeBeam(from, to, angleDeg, color, strength) {
  const len = from.distanceTo(to);
  const r = Math.tan(THREE.MathUtils.degToRad(angleDeg)) * len;
  const m = new THREE.Mesh(beamGeo, beamMaterial(color, strength));
  m.scale.set(r, len, r);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(V(0, -1, 0), to.clone().sub(from).normalize());
  m.renderOrder = 5;
  m.userData.noOutline = true;
  return m;
}

// glowing lens / bulb sprite
let glowTex;
export function glowSprite(color, size, opacity = 1) {
  glowTex ??= T.glowTexture();
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  s.scale.set(size, size, 1);
  s.renderOrder = 6;
  return s;
}

// ---------- fixtures ----------
let fixtureModels;
async function loadFixtures() {
  fixtureModels ??= Promise.all(
    ["par-can", "fresnel", "blinder"].map((n) => loader.loadAsync(`/assets/looktest/studio/${n}.glb`)),
  );
  return fixtureModels;
}

/**
 * Hangs a fixture at `pos` aimed at `target`. Returns {group, lensWorld}.
 * The models' lenses face +Z; the yoke clamps straight up to the pipe.
 */
async function fixture(kind, pos, target, gel, scale = 3.0) {
  const [par, fres, blind] = await loadFixtures();
  const src = { par, fresnel: fres, blinder: blind }[kind].scene;
  const m = src.clone(true);
  const lens = new THREE.MeshBasicMaterial({ color: new THREE.Color(gel).multiplyScalar(3.2), fog: false });
  recolor(m, {
    Black: M().metal,
    "Material.008": M().metal,
    "Material.010": M().metal,
    "Material.007": M().metal,
    LightGrey: M().metalLit,
    Glow: lens,
  });
  // PAR can: grey part is the lens ring; treat the second grey material as lens
  if (kind === "par")
    m.traverse((o) => {
      if (!o.isMesh) return;
      const arr = Array.isArray(o.material) ? o.material : [o.material];
      o.material = arr.map((x) => (x === M().metalLit ? lens : x));
      if (o.material.length === 1) o.material = o.material[0];
    });
  m.scale.setScalar(scale);
  const box = new THREE.Box3().setFromObject(m);
  const c = box.getCenter(new THREE.Vector3());
  m.position.sub(c);
  const g = new THREE.Group();
  g.add(m);
  g.position.copy(pos);
  g.lookAt(target);
  shadows(g, false, false);
  return g;
}

// ---------- build ----------
export async function buildStudio(scene, opts = {}) {
  const mm = M();
  const root = new THREE.Group();
  scene.add(root);
  const anchors = {};

  // Studio shell: concrete floor, dark walls, ceiling grid.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mm.concrete);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = STUDIO_Y;
  floor.receiveShadow = true;
  root.add(floor);
  const wallMat = toon({ color: 0x15121c });
  for (const [x, z, ry, w] of [
    [0, -95, 0, 260],
    [0, 120, Math.PI, 260],
    [-120, 10, Math.PI / 2, 230],
    [120, 10, -Math.PI / 2, 230],
  ]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, 110), wallMat);
    wall.position.set(x, 53, z);
    wall.rotation.y = ry;
    root.add(wall);
  }
  // acoustic panel ribs on the back wall, barely visible
  const ribs = new Boxes(toon({ color: 0x1d1926 }));
  for (let x = -120; x <= 120; x += 8) ribs.add(x, 40, -94.5, 0.8, 90, 1);
  ribs.build(root, false);

  // ----- stage deck (set floor) -----
  const deckW = 112,
    deckZ0 = -44,
    deckZ1 = 32;
  const deckH = DECK_Y - STUDIO_Y;
  const floorTex = T.floorTexture();
  floorTex.repeat.set(deckW / 32, (deckZ1 - deckZ0) / 32);
  const deckTop = new THREE.Mesh(
    new THREE.PlaneGeometry(deckW, deckZ1 - deckZ0),
    toon({ map: floorTex }),
  );
  deckTop.rotation.x = -Math.PI / 2;
  deckTop.position.set(0, DECK_Y, (deckZ0 + deckZ1) / 2);
  deckTop.receiveShadow = true;
  root.add(deckTop);
  anchors.deckTop = deckTop;
  const skirtTex = T.deckSkirtTexture();
  skirtTex.repeat.set(deckW / 12, 1);
  const skirtMat = toon({ map: skirtTex });
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(deckW, deckH, 0.3), [
    mm.black,
    mm.black,
    mm.black,
    mm.black,
    skirtMat,
    mm.black,
  ]);
  skirt.position.set(0, STUDIO_Y + deckH / 2, deckZ1 - 0.15);
  root.add(skirt);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, deckH, deckZ1 - deckZ0), mm.black);
    side.position.set((sx * deckW) / 2, STUDIO_Y + deckH / 2, (deckZ0 + deckZ1) / 2);
    root.add(side);
  }
  // nosing strip along the deck lip
  const nose = new THREE.Mesh(new THREE.BoxGeometry(deckW + 0.2, 0.14, 0.5), toon({ color: 0xe8c35a }));
  nose.position.set(0, DECK_Y - 0.03, deckZ1 - 0.1);
  root.add(nose);
  // steps at front centre
  const stepMat = toon({ color: 0x2a2633 });
  for (let i = 0; i < 2; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(10, deckH * (1 - i / 2), 1.2), stepMat);
    st.position.set(-30, STUDIO_Y + (deckH * (1 - i / 2)) / 2, deckZ1 + 0.6 + i * 1.2);
    st.receiveShadow = true;
    root.add(st);
  }

  // spike marks (gaffer tape crosses) on the set floor
  const tapeY = toon({ color: 0xf7e14a }),
    tapeO = toon({ color: 0xff6a3d });
  const tapes = [
    [-24, 18, tapeY],
    [8, 22, tapeO],
    [30, 8, tapeY],
    [-40, -6, tapeO],
    [2, 4, tapeY],
  ];
  for (const [x, z, mat] of tapes)
    for (const r of [Math.PI / 4, -Math.PI / 4]) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.28), mat);
      t.rotation.set(-Math.PI / 2, 0, r);
      t.position.set(x, DECK_Y + 0.02, z);
      t.receiveShadow = true;
      root.add(t);
    }

  // ----- flats: the kitchen back wall seen from behind is raw plywood -----
  // (front faces are dressed by kitchen.js; here: framing, braces, sandbags)
  const frame = new Boxes(mm.wood2x4);
  const braces = new Boxes(mm.brace);
  const bags = new Boxes(mm.sandbag);
  const flatBackZ = -41.2;
  for (let x = -54; x <= 54; x += 6) frame.add(x, 17, flatBackZ - 0.25, 0.25, 34, 0.5);
  for (const y of [0.4, 11, 22, 33.6]) frame.add(0, y, flatBackZ - 0.25, 108.5, 0.5, 0.5);
  // stage jacks: right-triangle braces every 12m
  for (let x = -48; x <= 48; x += 12) {
    const top = V(x, 26, flatBackZ - 0.5),
      foot = V(x, DECK_Y, flatBackZ - 13);
    const mid = top.clone().add(foot).multiplyScalar(0.5);
    const len = top.distanceTo(foot);
    const ang = Math.atan2(top.y - foot.y, top.z - foot.z);
    braces.add(mid.x, mid.y, mid.z, 0.35, 0.6, len, 0, -ang + Math.PI, 0);
    braces.add(x, 13, flatBackZ - 0.6, 0.35, 26, 0.6);
    braces.add(x, 0.3, flatBackZ - 6.75, 0.35, 0.6, 13);
    braces.add(x, 6.5, flatBackZ - 3.3, 0.3, 0.45, 8.6, 0, -0.95, 0);
    bags.add(x, 0.55, flatBackZ - 12, 1.6, 0.9, 1.0, 0.2);
    bags.add(x + 0.3, 1.3, flatBackZ - 12.1, 1.5, 0.75, 0.95, -0.25);
  }
  frame.build(root);
  braces.build(root);
  bags.build(root);

  // ----- lighting grid: box trusses -----
  const rods = new Rods(mm.truss, 7);
  const gridY = 50;
  const zLines = [-30, -4, 22];
  for (const z of zLines) truss(rods, V(-70, gridY, z), V(70, gridY, z));
  for (const x of [-60, 60]) truss(rods, V(x, gridY + 1.3, -44), V(x, gridY + 1.3, 40));
  // front-of-house truss over the audience
  truss(rods, V(-70, gridY + 4, 52), V(70, gridY + 4, 52));
  // chain hoists up into the dark
  for (const z of [...zLines, 52])
    for (const x of [-44, 44]) rods.add(V(x, gridY + 0.9 + (z === 52 ? 4 : 0), z), V(x, 110, z), 0.09);
  // ----- catwalk along stage left -----
  const cwX = -64,
    cwY = 34,
    cwZ0 = -44,
    cwZ1 = 36;
  const grate = T.gratingTexture();
  grate.repeat.set(2, (cwZ1 - cwZ0) / 2);
  const cwFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, cwZ1 - cwZ0),
    new THREE.MeshToonMaterial({ color: 0x3a3742, alphaMap: grate, alphaTest: 0.5, side: THREE.DoubleSide, gradientMap: RAMPS.set }),
  );
  cwFloor.rotation.x = -Math.PI / 2;
  cwFloor.position.set(cwX, cwY, (cwZ0 + cwZ1) / 2);
  cwFloor.castShadow = true;
  root.add(cwFloor);
  for (const sx of [-1.6, 1.6]) {
    rods.add(V(cwX + sx, cwY + 1.1, cwZ0), V(cwX + sx, cwY + 1.1, cwZ1), 0.06);
    rods.add(V(cwX + sx, cwY + 0.55, cwZ0), V(cwX + sx, cwY + 0.55, cwZ1), 0.04);
    rods.add(V(cwX + sx, cwY + 0.05, cwZ0), V(cwX + sx, cwY + 0.05, cwZ1), 0.08);
    for (let z = cwZ0; z <= cwZ1; z += 4) rods.add(V(cwX + sx, cwY, z), V(cwX + sx, cwY + 1.1, z), 0.05);
  }
  for (let z = cwZ0; z <= cwZ1; z += 8) {
    rods.add(V(cwX - 1.6, cwY, z), V(cwX - 1.6, 110, z), 0.05);
    rods.add(V(cwX + 1.6, cwY, z), V(cwX + 1.6, 110, z), 0.05);
  }
  // catwalk work lights (practicals)
  for (let z = cwZ0 + 6; z <= cwZ1; z += 16) {
    const s = glowSprite(0xffc27a, 2.2, 0.8);
    s.position.set(cwX + 1.7, cwY + 1.4, z);
    root.add(s);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    bulb.position.copy(s.position);
    root.add(bulb);
  }
  anchors.catwalk = { x: cwX, y: cwY };

  // ----- camera crane (jib) at front stage-right -----
  const crane = new THREE.Group();
  const craneMat = toon({ color: 0x3b3a44, rim: 0xa9a6b5, rimStrength: 0.35 });
  const yellow = toon({ color: 0xe8b23a, rim: 0xffe0a0, rimStrength: 0.3, emissive: 0x3a2a08 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 5), craneMat);
  base.position.y = STUDIO_Y + 1.2;
  crane.add(base);
  for (const [x, z] of [
    [-2.4, -2.4],
    [2.4, -2.4],
    [-2.4, 2.4],
    [2.4, 2.4],
  ]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 18), mm.rubber);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, STUDIO_Y + 0.55, z);
    crane.add(w);
  }
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 8, 16), craneMat);
  col.position.y = STUDIO_Y + 5.6;
  crane.add(col);
  const pivot = new THREE.Group();
  pivot.position.y = STUDIO_Y + 9.8;
  crane.add(pivot);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 2.0), craneMat);
  pivot.add(head);
  // boom: tapered box truss
  const boom = new THREE.Group();
  pivot.add(boom);
  const boomLen = 40,
    tail = 9;
  const bRods = new Rods(yellow, 6);
  const bw0 = 1.6,
    bw1 = 0.6;
  const sections = 14;
  const corner = (t, i) => {
    const w = THREE.MathUtils.lerp(bw0, bw1, Math.max(0, t) / boomLen) / 2;
    const s = [
      [w, w],
      [-w, w],
      [-w, -w],
      [w, -w],
    ][i];
    return V(s[0], s[1], -t);
  };
  // solid tapered square tube (reads at distance), with chunky side lacing
  {
    const tube = new THREE.CylinderGeometry((bw1 / 2) * Math.SQRT2, (bw0 / 2) * Math.SQRT2, boomLen + tail, 4, 1);
    tube.rotateY(Math.PI / 4);
    tube.rotateX(-Math.PI / 2);
    const tm = new THREE.Mesh(tube, yellow);
    tm.position.z = -(boomLen - tail) / 2;
    boom.add(tm);
  }
  for (let k = 0; k < sections; k++) {
    const t0 = -tail + ((boomLen + tail) * k) / sections,
      t1 = -tail + ((boomLen + tail) * (k + 1)) / sections;
    for (const [a, b] of [
      [0, 3],
      [1, 2],
    ]) {
      const o = (i) => corner(t0, i).multiplyScalar(1).setZ(-t0);
      const p0 = corner(t0, a),
        p1 = corner(t1, b);
      const s = 1.12;
      if (k % 2 === 0) bRods.add(V(p0.x * s, p0.y * s, p0.z), V(p1.x * s, p1.y * s, p1.z), 0.11);
    }
  }
  bRods.build(boom);
  // counterweights at the tail
  for (let i = 0; i < 4; i++) {
    const wgt = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.35, 20), mm.metal);
    wgt.rotation.x = Math.PI / 2;
    wgt.position.set(0, -0.6, tail - 0.6 - i * 0.42);
    boom.add(wgt);
  }
  // camera head at the tip
  const camHead = studioCamera(1.25);
  camHead.position.set(0, -1.4, -boomLen - 0.4);
  boom.add(camHead);
  boom.rotation.x = THREE.MathUtils.degToRad(opts.craneTilt ?? 16);
  pivot.rotation.y = THREE.MathUtils.degToRad(opts.craneYaw ?? 48);
  crane.position.set(56, 0, 44);
  root.add(crane);
  shadows(crane, true, true);
  anchors.crane = crane;
  anchors.craneTip = camHead;

  // ----- pedestal camera on the studio floor -----
  const ped = new THREE.Group();
  const pedBase = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 3), craneMat);
  pedBase.position.y = STUDIO_Y + 0.6;
  ped.add(pedBase);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 12), mm.rubber);
    w.rotation.z = Math.PI / 2;
    w.position.set(Math.cos(a) * 1.35, STUDIO_Y + 0.28, Math.sin(a) * 1.35);
    ped.add(w);
  }
  const pcol = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 3.2, 14), mm.chrome);
  pcol.position.y = STUDIO_Y + 2.4;
  ped.add(pcol);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 32), mm.chrome);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = STUDIO_Y + 1.7;
  ped.add(ring);
  const pcam = studioCamera(1.0);
  pcam.position.y = STUDIO_Y + 4.6;
  ped.add(pcam);
  ped.position.set(-44, -STUDIO_Y * 0.3, 40);
  ped.rotation.y = -0.5;
  ped.scale.setScalar(1.3);
  shadows(ped, true, true);
  root.add(ped);
  anchors.pedestal = ped;

  // ----- floor cables snaking from cameras -----
  const cableMat = toon({ color: 0x0e0d12 });
  const cables = [
    [V(-44, STUDIO_Y + 0.1, 40), V(-30, STUDIO_Y + 0.1, 38.5), V(-8, STUDIO_Y + 0.1, 40), V(10, STUDIO_Y + 0.1, 38.5), V(36, STUDIO_Y + 0.1, 41), V(56, STUDIO_Y + 0.1, 44)],
    [V(56, STUDIO_Y + 0.1, 44), V(62, STUDIO_Y + 0.1, 36), V(60, STUDIO_Y + 0.1, 20), V(66, STUDIO_Y + 0.1, 0), V(64, STUDIO_Y + 0.1, -30)],
    [V(-44, STUDIO_Y + 0.1, 40), V(-52, STUDIO_Y + 0.1, 37), V(-58, STUDIO_Y + 0.1, 41), V(-66, STUDIO_Y + 0.1, 30)],
  ];
  for (const pts of cables) {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.09, 6), cableMat);
    tube.receiveShadow = true;
    root.add(tube);
  }

  // ----- fixtures on the grid -----
  const fixtures = [];
  const addFix = async (kind, pos, target, gel, scale) => {
    const f = await fixture(kind, pos, target, gel, scale);
    root.add(f);
    fixtures.push({ f, pos, target, gel, kind });
    return f;
  };
  const rig = opts.rig ?? [];
  await Promise.all(rig.map((r) => addFix(r.kind, r.pos, r.target, r.gel, r.scale)));
  // clamp pipes (short drop pipes from truss to each fixture)
  for (const r of rig) rods.add(r.pos.clone().add(V(0, 0.9, 0)), V(r.pos.x, r.trussY ?? gridY - 0.65, r.pos.z), 0.06);

  rods.build(root);

  // ----- bleachers + audience risers (audience added by audience.js) -----
  const riser = new Boxes(toon({ color: 0x1c1924 }));
  const rows = 11;
  for (let i = 0; i < rows; i++) {
    const z = 50 + i * 2.6,
      y = STUDIO_Y + 0.8 + i * 1.35;
    riser.add(-34, y / 2 + STUDIO_Y / 2, z, 52, y - STUDIO_Y, 2.6);
    riser.add(34, y / 2 + STUDIO_Y / 2, z, 52, y - STUDIO_Y, 2.6);
  }
  riser.build(root);
  // aisle step lights: little amber practicals along the centre aisle
  const aisleDots = new Boxes(new THREE.MeshBasicMaterial({ color: 0xffb24a }));
  for (let i = 0; i < rows; i++) {
    const z = 50 + i * 2.6 - 1.25,
      y = STUDIO_Y + 0.8 + i * 1.35 - 0.15;
    aisleDots.add(-7.6, y, z, 0.35, 0.12, 0.05);
    aisleDots.add(7.6, y, z, 0.35, 0.12, 0.05);
  }
  aisleDots.build(root, false);
  anchors.bleachers = { rows, z0: 50, dz: 2.6, dy: 1.35, y0: STUDIO_Y + 0.8 };
  anchors.fixtures = fixtures;
  anchors.root = root;
  return anchors;
}

/** Chunky 1980s studio camera: body, lens hood, viewfinder, tally light. */
export function studioCamera(s = 1) {
  const g = new THREE.Group();
  const body = toon({ color: 0x8c8f98, rim: 0xffffff, rimStrength: 0.3 });
  const dark = toon({ color: 0x1b1a20 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 2.2), body);
  g.add(b);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 1.4), dark);
  top.position.set(0, 0.75, 0.3);
  g.add(top);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.3, 20), dark);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, -0.05, -1.7);
  g.add(lens);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), toon({ color: 0x2c3c60, rim: 0x9fdcff, rimStrength: 0.8 }));
  glass.position.set(0, -0.05, -2.36);
  glass.rotation.y = Math.PI;
  g.add(glass);
  const vf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.7), dark);
  vf.position.set(0, 0.45, 1.35);
  g.add(vf);
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), toon({ color: 0x2a2830 }));
    h.rotation.z = Math.PI / 2 + sx * 0.5;
    h.rotation.y = 0.0;
    h.position.set(sx * 0.9, -0.5, 1.4);
    g.add(h);
  }
  const tally = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.08), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  tally.position.set(0, 0.9, -0.42);
  g.add(tally);
  const tg = glowSprite(0xff3030, 1.1, 0.9);
  tg.position.copy(tally.position);
  g.add(tg);
  g.scale.setScalar(s);
  return g;
}
