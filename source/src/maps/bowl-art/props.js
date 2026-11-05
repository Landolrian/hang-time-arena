import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mat, rng } from "./kit.js";
import * as P from "./paint2.js";
import { bowlHeight } from "./table.js";

// Hero props. Every shape mirrors its collider in bowl.js to within ~0.3 m:
//   Box        x[-9,9]   y[0,30]  z[-45,-36]; flaps y[30,31.2] z[-36.8,-36.2]; packet x[-2,2] y[30,32.5] z[-43.75,-42.25]
//   Toaster    x[29,45]  y[0,12]  z[-35,-25]; slices x[32.75,36.25],[37.75,41.25] y[12,18] z[-34.5,-25.5]; lever x[42.5,44.5] y[12,13.5] z[-31.5,-28.5]
//   Carton     x[46,56]  y[0,24]  z[7,17];    cap x[49.5,52.5] y[24,26] z[13,15]
//   Butter     x[63,73]  y[0,6]   z[-14,10]
//   Spoon      ramp x[-3,3] from z=46 (y=0) to z=22 (y=6)
//   Sugar      (±18, 0.65, 37) 2.5 x 1.3 x 2.5;  rim cover (±27, ~3.42, ±9) 2 x 1.7 x 4;  bowl rings (x,-0.5,z) 6.8 x 3 x 1.8

let chrome, gold;
export function chromeMat() {
  chrome ??= new THREE.MeshMatcapMaterial({ matcap: P.matcap("chrome") });
  return chrome;
}
export function goldMat() {
  gold ??= new THREE.MeshMatcapMaterial({ matcap: P.matcap("gold") });
  return gold;
}

function shadowed(o, cast = true, receive = true) {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
  return o;
}

// ------------------------------------------------------------------ cereal box
export function buildBox(root) {
  const g = new THREE.Group();
  const side = mat({ map: P.boxSide(false) });
  const side2 = mat({ map: P.boxSide(true) });
  const topTex = P.boxTop();
  topTex.center.set(0.5, 0.5);
  topTex.rotation = Math.PI; // reads the right way up for someone on top looking at the bowl
  const top = mat({ map: topTex });
  const front = mat({ map: P.boxFront() });
  const back = mat({ map: P.boxBack() });
  const blue = mat({ color: 0x2b2a7e });
  // BoxGeometry face order: +x, -x, +y, -y, +z (front, toward the bowl), -z
  const box = new THREE.Mesh(new THREE.BoxGeometry(18, 30, 9), [side, side2, top, blue, front, back]);
  box.position.set(0, 15, -40.5);
  box.userData.outline = 1.8;
  g.add(box);
  // a glossy cellophane-ish strip catching the key on the front corners: thin rounded edges
  const edgeMat = mat({ color: 0x232268 });
  for (const x of [-9, 9]) for (const z of [-36, -45]) {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 30, 6), edgeMat);
    e.position.set(x * 0.995, 15, z === -36 ? -36.01 : -44.99);
    g.add(e);
  }
  // standing top flaps along the front edge (cover); printed outside, raw inside
  const card = mat({ map: P.cardboard() });
  const flapPrint = mat({ map: P.flapPrint() });
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1.2, 0.6), [card, card, card, card, flapPrint, card]);
    f.position.set(sx * 4.75, 30.6, -36.5);
    f.rotation.x = 0.06; // leaning out a touch, like a flap that won't stay shut
    f.userData.outline = 1.4;
    g.add(f);
  }
  // the free-prize packet on the top (back cover block)
  const pk = mat({ map: P.prizePacket() });
  const pkSide = mat({ color: 0xff3da8 });
  const packet = new THREE.Mesh(new RoundedBoxGeometry(4, 2.5, 1.5, 2, 0.2), pkSide);
  packet.position.set(0, 31.25, -43);
  packet.userData.outline = 1.4;
  g.add(packet);
  for (const sz of [1, -1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.2), pk);
    face.position.set(0, 31.25, -43 + sz * 0.76);
    if (sz < 0) face.rotation.y = Math.PI;
    g.add(face);
  }
  shadowed(g);
  root.add(g);
  return g;
}

// ------------------------------------------------------------------ toasters
function breadShape(w, h) {
  // slice outline in its own plane: flat bottom, muffin-top crown
  const s = new THREE.Shape();
  const hw = w / 2;
  s.moveTo(-hw + 0.4, 0);
  s.lineTo(hw - 0.4, 0);
  s.quadraticCurveTo(hw, 0, hw, 0.4);
  s.lineTo(hw, h - 1.6);
  s.bezierCurveTo(hw + 0.35, h - 0.9, hw - 0.4, h + 0.1, hw - 1.6, h);
  s.bezierCurveTo(hw - 2.6, h + 0.3, -hw + 2.6, h + 0.3, -hw + 1.6, h);
  s.bezierCurveTo(-hw + 0.4, h + 0.1, -hw - 0.35, h - 0.9, -hw, h - 1.6);
  s.lineTo(-hw, 0.4);
  s.quadraticCurveTo(-hw, 0, -hw + 0.4, 0);
  return s;
}

export function buildToasters(root) {
  const face = mat({ map: P.toastFace() });
  const crustM = mat({ map: P.crust() });
  const black = mat({ color: 0x2a2730, gloss: 0.35, glossSize: 0.92 });
  const slotDark = mat({ color: 0x120e18 });
  const out = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    const cx = side * 37, cz = -30;
    const pastel = side < 0 ? "#f3b9a2" : "#aebfee";
    const accent = side < 0 ? "#e0705a" : "#5b74c4";
    const panel = mat({ map: P.toasterPanel(pastel, accent, true), gloss: 0.25, glossSize: 0.93 });
    const panelPlain = mat({ map: P.toasterPanel(pastel, accent, false), gloss: 0.25, glossSize: 0.93 });
    const pastelM = mat({ color: pastel, gloss: 0.25, glossSize: 0.93 });
    // body: pastel shell with rounded corners (r 1.0 keeps corners within 0.3 m)
    const body = new THREE.Mesh(new RoundedBoxGeometry(16, 10.4, 10, 4, 1.0), pastelM);
    body.position.set(cx, 1.0 + 5.2, cz);
    body.userData.outline = 1.8;
    g.add(body);
    // printed side panels (brand on the faces toward the bowl and the table front)
    const pz = new THREE.Mesh(new THREE.PlaneGeometry(14, 8.6), panel);
    pz.position.set(cx, 6.1, cz + 5.02);
    g.add(pz);
    const nz = new THREE.Mesh(new THREE.PlaneGeometry(14, 8.6), panelPlain);
    nz.position.set(cx, 6.1, cz - 5.02);
    nz.rotation.y = Math.PI;
    g.add(nz);
    for (const sx of [-1, 1]) {
      const px = new THREE.Mesh(new THREE.PlaneGeometry(8, 8.6), sx === -side ? panel : panelPlain);
      px.position.set(cx + sx * 8.02, 6.1, cz);
      px.rotation.y = sx * Math.PI / 2;
      g.add(px);
    }
    // chrome top deck and base plinth
    const topDeck = new THREE.Mesh(new RoundedBoxGeometry(16, 1.6, 10, 3, 0.6), chromeMat());
    topDeck.position.set(cx, 11.2, cz);
    topDeck.userData.outline = 1.6;
    g.add(topDeck);
    const base = new THREE.Mesh(new RoundedBoxGeometry(16.1, 1.2, 10.1, 3, 0.4), black);
    base.position.set(cx, 0.6, cz);
    base.userData.outline = 1.6;
    g.add(base);
    // chrome feet bumpers
    for (const fx of [-6.5, 6.5]) for (const fz of [-3.8, 3.8]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.25, 16), chromeMat());
      foot.position.set(cx + fx, 0.12, cz + fz);
      g.add(foot);
    }
    // slots (dark recesses) the toast rises out of
    for (const dx of [-2.5, 2.5]) {
      const slot = new THREE.Mesh(new RoundedBoxGeometry(4.1, 0.2, 9.6, 2, 0.08), slotDark);
      slot.position.set(cx + dx, 12.02, cz);
      g.add(slot);
    }
    // the lever knob housing on top, outer side
    const lever = new THREE.Mesh(new RoundedBoxGeometry(2, 1.4, 3, 3, 0.5), black);
    lever.position.set(side * 43.5, 12.7, cz);
    lever.userData.outline = 1.4;
    g.add(lever);
    const leverPlate = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.3, 4.2, 2, 0.12), chromeMat());
    leverPlate.position.set(side * 43.5, 12.1, cz);
    g.add(leverPlate);
    // browning dial on the outer face
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.5, 24), black);
    dial.rotation.z = Math.PI / 2;
    dial.position.set(cx + side * 8.2, 4, cz + 2.8);
    g.add(dial);
    const dialCap = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.55, 24), chromeMat());
    dialCap.rotation.z = Math.PI / 2;
    dialCap.position.set(cx + side * 8.25, 4, cz + 2.8);
    g.add(dialCap);
    // toast slices: x thickness 3.5, z width 9, rising from inside the slot to y=18
    for (const dx of [-2.5, 2.5]) {
      const geo = new THREE.ExtrudeGeometry(breadShape(9, 7.9), { depth: 3.0, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3, curveSegments: 10 });
      geo.translate(0, 0, -1.5);
      // ExtrudeGeometry UVs are in shape units: normalise the caps to the 0..1 face texture
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 9 + 0.5, uv.getY(i) / 7.9);
      const slice = new THREE.Mesh(geo, [face, crustM]);
      slice.rotation.y = Math.PI / 2;
      slice.position.set(cx + dx, 10.0, cz);
      slice.rotation.z = 0;
      slice.userData.outline = 1.5;
      g.add(slice);
    }
    shadowed(g);
    root.add(g);
    out.push(g);
  }
  return out;
}

// ------------------------------------------------------------------ milk cartons
export function buildCartons(root) {
  const out = [];
  const brand = mat({ map: P.cartonPanel("brand") });
  const missing = mat({ map: P.cartonPanel("missing") });
  const cow = mat({ map: P.cartonPanel("cow") });
  const info = mat({ map: P.cartonPanel("info") });
  const top = mat({ map: P.cartonTop() });
  const teal = mat({ color: 0x3f9e94 });
  const capM = mat({ color: 0xffd34a, gloss: 0.4, glossSize: 0.9 });
  const paper = mat({ color: 0xfbf6ea });
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    const cx = side * 51, cz = 12;
    // faces: +x, -x, +y, -y, +z (south: the missing-contestant gag), -z
    const toward = side < 0 ? 0 : 1; // the face looking at the bowl gets the brand
    const faces = [info, info, top, paper, missing, cow];
    faces[toward] = brand;
    faces[1 - toward] = info;
    const body = new THREE.Mesh(new THREE.BoxGeometry(10, 23.6, 10), faces);
    body.position.set(cx, 11.8, cz);
    body.userData.outline = 1.8;
    g.add(body);
    // top seal rim: the folded paper lip all round the flat top, plus the side ears
    const lip = new THREE.Mesh(new RoundedBoxGeometry(10.2, 0.5, 10.2, 2, 0.15), teal);
    lip.position.set(cx, 23.75, cz);
    lip.userData.outline = 1.4;
    g.add(lip);
    const topPrint = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 9.8), top);
    topPrint.rotation.x = -Math.PI / 2;
    topPrint.position.set(cx, 24.01, cz);
    g.add(topPrint);
    for (const sz of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 1.4), teal);
      ear.position.set(cx, 23.0, cz + sz * 5.05);
      ear.rotation.x = sz * 0.0;
      g.add(ear);
    }
    // screw cap (the spout block): ridged yellow cap on a collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.5, 24), paper);
    collar.position.set(cx, 24.25, 14);
    g.add(collar);
    const capGeo = new THREE.CylinderGeometry(1.0, 1.05, 1.5, 28);
    const cp = capGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const a = Math.atan2(cp.getZ(i), cp.getX(i));
      const k = 1 + 0.05 * Math.max(0, Math.cos(a * 14));
      if (Math.abs(cp.getY(i)) < 0.74) cp.setXYZ(i, cp.getX(i) * k, cp.getY(i), cp.getZ(i) * k);
    }
    capGeo.computeVertexNormals();
    const cap = new THREE.Mesh(capGeo, capM);
    cap.position.set(cx, 25.2, 14);
    cap.userData.outline = 1.4;
    g.add(cap);
    shadowed(g);
    root.add(g);
    out.push(g);
  }
  return out;
}

// ------------------------------------------------------------------ butter stick riser
export function buildButter(root) {
  const wrap = mat({ map: P.butterWrap() });
  const wrapPlain = mat({ color: 0xf2d474 });
  const butter = mat({ color: 0xfbe7a0, gloss: 0.2, glossSize: 0.95 });
  const out = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    const cx = side * 68, cz = -2;
    // wrapped part (z from -14 to 4), butter exposed toward the bowl end? no: toward +z (south)
    const wrapped = new THREE.Mesh(new RoundedBoxGeometry(10, 6, 18, 3, 0.35), [wrapPlain]);
    wrapped.geometry.clearGroups();
    wrapped.position.set(cx, 3, cz - 3);
    wrapped.material = wrapPlain;
    wrapped.userData.outline = 1.6;
    g.add(wrapped);
    // printed long sides
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(17.2, 5.2), wrap);
      p.position.set(cx + sx * 5.01, 3, cz - 3);
      p.rotation.y = sx * Math.PI / 2;
      g.add(p);
    }
    const ptop = new THREE.Mesh(new THREE.PlaneGeometry(17.2, 9.2), wrap);
    ptop.rotation.set(-Math.PI / 2, 0, side * Math.PI / 2);
    ptop.position.set(cx, 6.01, cz - 3);
    g.add(ptop);
    // the unwrapped end: bare butter with a peeled-back paper flap
    const bare = new THREE.Mesh(new RoundedBoxGeometry(9.7, 5.8, 6.4, 3, 0.6), butter);
    bare.position.set(cx, 2.9, cz + 8.8);
    bare.userData.outline = 1.6;
    g.add(bare);
    const peel = new THREE.Mesh(new THREE.BoxGeometry(10.1, 0.12, 2.6), wrapPlain);
    peel.position.set(cx, 0.4, cz + 7.4);
    peel.rotation.x = -0.25;
    g.add(peel);
    shadowed(g);
    root.add(g);
    out.push(g);
  }
  return out;
}

// ------------------------------------------------------------------ spoon on a napkin
export function buildSpoon(root) {
  const g = new THREE.Group();
  const steel = chromeMat();
  // handle: a crowned paddle whose centre line lies on the ramp plane (rise 6 over 24, toward -z)
  const handle = new THREE.Mesh(spoonHandle(), new THREE.MeshMatcapMaterial({ matcap: steel.matcap, map: P.spoonEngrave(), side: THREE.DoubleSide }));
  handle.material.map.colorSpace = THREE.SRGBColorSpace;
  handle.userData.outline = 1.5;
  g.add(handle);
  // neck arching over the rim bead and the bowl of the spoon lying on the inner wall
  const head = spoonHead();
  head.userData.outline = 1.5;
  g.add(head);
  // napkin wedge under the handle: fills the solid ramp volume down to the table / bowl
  g.add(napkin());
  shadowed(g);
  root.add(g);
  return g;
}

function spoonHandle() {
  const nu = 60, ns = 14, z0 = 22, z1 = 46.4, hw = 3.0;
  const ramp = (z) => (6 * (46 - z)) / 24;
  const pos = [], uv = [], idx = [];
  const row = (u) => {
    const z = z0 + (z1 - z0) * u;
    const tip = z1 - z; // rounded tip over the last 3 m
    const half = tip < hw ? Math.sqrt(Math.max(0, hw * hw - (hw - tip) ** 2)) : hw;
    return { z, half: Math.max(0.05, half), y: ramp(z) };
  };
  // top (crowned), then a short skirt down each long side
  for (let i = 0; i <= nu; i++) {
    const { z, half, y } = row(i / nu);
    for (let j = 0; j <= ns; j++) {
      const s = (j / ns) * 2 - 1;
      pos.push(s * half, y + 0.06 + 0.22 * (1 - s * s) - 0.12, z);
      uv.push(j / ns, i / nu);
    }
  }
  const W = ns + 1;
  for (let i = 0; i < nu; i++) for (let j = 0; j < ns; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const base = pos.length / 3;
  for (let i = 0; i <= nu; i++) {
    const { z, half, y } = row(i / nu);
    for (const sx of [-1, 1]) {
      pos.push(sx * half, y - 0.06, z, sx * (half + 0.04), y - 0.5, z);
      uv.push(0.5, 0.5, 0.5, 0.5);
    }
  }
  for (let i = 0; i < nu; i++) for (const k of [0, 1]) {
    const a = base + i * 4 + k * 2, c = a + 4;
    if (k) idx.push(a, a + 1, c, a + 1, c + 1, c);
    else idx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function spoonHead() {
  // grid over the head footprint, heights conform to the bowl cone + a shallow dish
  const nx = 28, nz = 40;
  const z0 = 22.6, z1 = 7.6, wMax = 5.2;
  const pos = [], idx = [], uv = [];
  for (let j = 0; j <= nz; j++) {
    const t = j / nz;
    const z = z0 + (z1 - z0) * t;
    // outline: narrow neck at the rim widening into an egg-shaped bowl
    const neck = 1.6;
    const egg = t < 0.18 ? neck + (t / 0.18) * 0.3 : neck + 0.3 + (wMax - neck - 0.3) * Math.sin(Math.min(1, (t - 0.18) / 0.82) * Math.PI) ** 0.6;
    const half = Math.max(0.05, egg);
    for (let i = 0; i <= nx; i++) {
      const s = i / nx * 2 - 1;
      const x = s * half;
      const r = Math.hypot(x, z);
      let y = bowlHeight(r) + 0.14;
      // dish: edges up, middle down (within 0.3 m)
      y += 0.22 * s * s;
      y = Math.max(y, 6.45 - (z0 - z) * 0.55 + 0.22 * s * s); // neck arches over the rim bead
      pos.push(x, y, z);
      uv.push(i / nx, t);
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, chromeMat());
}

function napkin() {
  // side walls at x = ±3.15 from the ground up to just under the handle, with soft vertical folds
  // a little self-light so the side facing away from the key stays paper, not a dark wall
  const nap = mat({ map: P.napkinPrint(), side: THREE.DoubleSide, emissive: 0x4a4236 });
  const g = new THREE.Group();
  const ground = (z) => (z >= 34 ? 0 : Math.max(0, 6 - (z - 22) * 0.5));
  const ramp = (z) => (6 * (46 - z)) / 24;
  for (const sx of [-1, 1]) {
    const pos = [], uv = [], idx = [];
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const z = 22.4 + (46 - 22.4) * (i / n);
      const fold = Math.sin(i * 1.9) * 0.12 + Math.sin(i * 0.7) * 0.06;
      const top = ramp(z) - 0.42, bot = ground(z) - 0.05;
      const flare = 0.18; // hem flares out a little at the bottom
      pos.push(sx * (3.1 + fold * 0.5), Math.max(top, bot), z, sx * (3.1 + fold + flare), bot, z);
      uv.push(i / n * 2, 1, i / n * 2, 0.1);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      if (sx > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, nap));
  }
  return g;
}

// ------------------------------------------------------------------ cover: sugar, spilled rings
const RING_COLS = { orange: 0xf2a03d, lime: 0xbcd86a, lavender: 0xc497e0, pink: 0xff9aa8, yellow: 0xffd25a };

export function frostedRingGeometry(R, tube, seed = 1) {
  const geo = new THREE.TorusGeometry(R, tube, 18, 40);
  const p = geo.attributes.position, n = geo.attributes.normal;
  const r = rng(seed);
  const a = r() * 6, b = r() * 6;
  for (let i = 0; i < p.count; i++) {
    const k = (Math.sin(p.getX(i) * 2.3 + a) * Math.cos(p.getY(i) * 2.1 + b) + Math.sin(p.getZ(i) * 3.7)) * tube * 0.06;
    p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

let frostTex;
function frostMat(color) {
  frostTex ??= (() => {
    const [c, g] = [document.createElement("canvas"), null];
    c.width = c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 256, 256);
    const r = rng(41);
    for (let i = 0; i < 700; i++) {
      x.fillStyle = r() > 0.5 ? `rgba(255,255,255,${0.5 + r() * 0.5})` : `rgba(140,90,40,${r() * 0.18})`;
      x.fillRect(r() * 256, r() * 256, 2 + r() * 3, 2 + r() * 3);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 2);
    return t;
  })();
  return mat({ color, map: frostTex, rim: 0.25, rimColor: 0xfff4e0, gloss: 0.18, glossSize: 0.93 });
}

export function buildCover(root) {
  const g = new THREE.Group();
  const coverMilk = mat({ color: 0xece9e1, gloss: 0.3, glossSize: 0.95 });
  const sugarM = mat({ map: P.sugar(), rim: 0.2, rimColor: 0xffffff });
  for (const side of [-1, 1]) {
    const cube = new THREE.Mesh(new RoundedBoxGeometry(2.5, 1.3, 2.5, 3, 0.18), sugarM);
    cube.position.set(side * 18, 0.65, 37);
    cube.rotation.y = side * 0.0;
    cube.userData.outline = 1.3;
    g.add(cube);
    // a few loose grains around it
    for (const [dx, dz, s] of [[1.9, 0.6, 0.35], [-1.6, 1.8, 0.28], [0.4, -1.9, 0.3]]) {
      const grain = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), sugarM);
      grain.position.set(side * 18 + dx, s / 2, 37 + dz);
      grain.rotation.y = dx;
      g.add(grain);
    }
    // spilled rings stuck on the outer bowl wall (rim cover), standing on edge
    for (const z of [-9, 9]) {
      const x = side * 27;
      const col = z < 0 ? RING_COLS.orange : RING_COLS.lavender;
      const ringMesh = new THREE.Mesh(frostedRingGeometry(1.32, 0.68, side * 3 + z), frostMat(side < 0 ? (z < 0 ? RING_COLS.yellow : RING_COLS.lime) : col));
      ringMesh.rotation.y = Math.PI / 2;
      ringMesh.scale.set(1, 0.9, 1.35);
      ringMesh.position.set(x, 2.55, z);
      ringMesh.userData.outline = 1.4;
      g.add(ringMesh);
      // their collider is a solid block, so the hole is sealed with a milk film (both faces)
      for (const turn of [Math.PI / 2, -Math.PI / 2]) {
        const film = new THREE.Mesh(new THREE.CircleGeometry(0.85, 28), coverMilk);
        film.rotation.y = turn;
        film.scale.set(1, 0.9, 1);
        film.position.set(x, 2.55, z);
        g.add(film);
      }
    }
  }
  shadowed(g);
  root.add(g);
  return g;
}

/** The three giant cereal rings in the bowl, half-sunk in the milk. */
export function buildBowlRings(root) {
  const g = new THREE.Group();
  const milkFill = mat({ color: 0xece9e1, gloss: 0.3, glossSize: 0.95 });
  const spots = [[-7, -5, RING_COLS.orange], [7, -5, RING_COLS.lime], [0, 8, RING_COLS.lavender]];
  spots.forEach(([x, z, col], i) => {
    const ringMesh = new THREE.Mesh(frostedRingGeometry(2.45, 0.95, 11 + i), frostMat(col));
    ringMesh.scale.set(1, 1, 0.95);
    ringMesh.position.set(x, -0.3, z);
    ringMesh.userData.outline = 1.6;
    g.add(ringMesh);
    // milk caught in the hole + a splash collar where the ring meets the milk
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1.55, 32), milkFill);
    fill.position.set(x, -0.3, z);
    g.add(fill);
    const back = fill.clone();
    back.rotation.y = Math.PI;
    g.add(back);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.3, 8, 24), milkFill);
    collar.rotation.x = Math.PI / 2;
    collar.scale.set(3.3, 1.05, 1);
    collar.position.set(x, -1.92, z);
    g.add(collar);
  });
  shadowed(g);
  root.add(g);
  return g;
}
