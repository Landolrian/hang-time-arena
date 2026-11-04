import * as THREE from "three";
import { mat, lathe, V, tex, canvas } from "./kit.js";
import * as P from "./paint.js";

// The giant breakfast table and the cereal bowl set into it.
// Collision reference (bowl.js): table top y=0 over x[-105,105] z[-50,50];
// bowl radial profile r<8: -2, 8..22: rises to 6 (rim), 22..34: falls to 0.

export const bowlHeight = (r) => (r < 8 ? -2 : r < 22 ? -2 + ((r - 8) * 8) / 14 : 6 - (r - 22) * 0.5);

function rectWithHole(x0, z0, x1, z1, holeR, holeRect = null) {
  // Shape lives in XY; we rotate -90 deg about X so shape y maps to -z.
  const s = new THREE.Shape();
  s.moveTo(x0, -z1);
  s.lineTo(x1, -z1);
  s.lineTo(x1, -z0);
  s.lineTo(x0, -z0);
  s.lineTo(x0, -z1);
  if (holeRect) {
    const [a, b, c, d] = holeRect;
    const h = new THREE.Path();
    h.moveTo(a, -b);
    h.lineTo(a, -d);
    h.lineTo(c, -d);
    h.lineTo(c, -b);
    h.lineTo(a, -b);
    s.holes.push(h);
  }
  if (holeR) {
    const h = new THREE.Path();
    h.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  const g = new THREE.ShapeGeometry(s, 96);
  g.rotateX(-Math.PI / 2);
  return g;
}

function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function buildTable(root) {
  const out = {};
  // ---- oak table top (whole slab) with a hole for the bowl ----
  const oakTex = P.oak(5, 1024, 256);
  oakTex.repeat.set(1 / 24, 1 / 6);
  const oakTop = mat({ map: oakTex });
  // the oak shows as a frame round the tablecloth (no hidden layer under the cloth to z-fight)
  const top = new THREE.Mesh(rectWithHole(-104.5, -49.5, 104.5, 49.5, 0, [-75.6, -44.6, 75.6, 44.6]), oakTop);
  top.receiveShadow = true;
  root.add(top);
  // bullnose edge all round, kept inside the collider so nothing overhangs the drop
  const nose = mat({ color: 0xd79a62, gloss: 0.18, glossSize: 0.93 });
  for (const [x, z, len, ry] of [[0, 49.5, 209, Math.PI / 2], [0, -49.5, 209, Math.PI / 2], [104.5, 0, 99, 0], [-104.5, 0, 99, 0]]) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, len, 16, 1, true), nose);
    n.position.set(x, -0.5, z);
    if (ry) n.rotation.set(0, 0, Math.PI / 2);
    else n.rotation.set(Math.PI / 2, 0, 0);
    n.castShadow = false;
    n.receiveShadow = true;
    root.add(n);
  }
  // corner caps
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), nose);
    cap.position.set(sx * 104.5, -0.5, sz * 49.5);
    root.add(cap);
  }
  // apron: oak band under the edge, then the raw black stage skirt with a nosing stripe
  const apronTex = P.oak(8, 1024, 128);
  apronTex.repeat.set(1 / 30, 1);
  const apron = mat({ map: apronTex, color: 0xb88050 });
  const skirtTex = skirt();
  skirtTex.repeat.set(1 / 12, 1);
  const skirtMat = mat({ map: skirtTex });
  for (const [x, z, len, ry] of [[0, 50, 210, 0], [0, -50, 210, Math.PI], [105, 0, 100, Math.PI / 2], [-105, 0, 100, -Math.PI / 2]]) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.6), apron);
    a.position.set(x, -1.8, z);
    a.rotation.y = ry;
    a.receiveShadow = true;
    root.add(a);
    const sk = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.4), skirtMat);
    sk.position.set(x, -4.3, z);
    sk.rotation.y = ry;
    root.add(sk);
  }
  // shadow lip right under the oak band (the apron sets back a touch)
  const lip = mat({ color: 0x120e18 });
  for (const [x, z, w, d] of [[0, 49.92, 210, 0.16], [0, -49.92, 210, 0.16], [104.92, 0, 0.16, 100], [-104.92, 0, 0.16, 100]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), lip);
    l.position.set(x, -2.7, z);
    root.add(l);
  }

  // ---- gingham tablecloth over the middle of the table ----
  const ging = P.gingham();
  ging.repeat.set(1 / 8, 1 / 8);
  const cloth = new THREE.Mesh(rectWithHole(-76, -45, 76, 45, 33.95), mat({ map: ging }));
  cloth.position.y = 0.04;
  cloth.receiveShadow = true;
  root.add(cloth);
  // hem: a cream piped border so the cloth reads as fabric lying on wood
  const hem = mat({ color: 0xf4ead3 });
  const hemMag = mat({ color: 0xe0629a });
  for (const [x, z, w, d] of [[0, 45, 152.6, 0.6], [0, -45, 152.6, 0.6], [76, 0, 0.6, 90.6], [-76, 0, 0.6, 90.6]]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), hem);
    h.position.set(x, 0.06, z);
    h.receiveShadow = true;
    root.add(h);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w > 1 ? w - 1.6 : 0.18, 0.11, d > 1 ? d - 1.6 : 0.18), hemMag);
    m.position.set(x - Math.sign(x) * 0.9, 0.065, z - Math.sign(z) * 0.9);
    m.receiveShadow = true;
    root.add(m);
  }

  // ---- team placemats: pale butter woven for Rockets (west), pale sage for Comets (east) ----
  // Only contestants wear saturated team colour (STYLE 1): the mats stay pale so a red or blue
  // contestant pops off them, and the team shows in a dusty border band only.
  const mats = [
    [-1, P.placemat("#f3e2c6", "#dd9a84", "#faeedd")],
    [1, P.placemat("#dce7e0", "#93a6d4", "#eef4f0")],
  ];
  for (const [side, t] of mats) {
    const w = 38, d = 72;
    const g = new THREE.ShapeGeometry(roundedRect(w, d, 3), 8);
    g.rotateX(-Math.PI / 2);
    // remap UVs to 0..1 over the mat
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, -pos.getZ(i) / d + 0.5);
    const pm = mat({ map: t });
    pm.polygonOffset = true;
    pm.polygonOffsetFactor = -2;
    pm.polygonOffsetUnits = -4;
    const m = new THREE.Mesh(g, pm);
    m.position.set(side * 57, 0.1, -9);
    m.receiveShadow = true;
    root.add(m);
  }

  // ---- studio floor at the bottom of the drop ----
  const conc = concrete();
  conc.repeat.set(1 / 16, 1 / 16);
  const floorG = new THREE.PlaneGeometry(240, 180);
  floorG.rotateX(-Math.PI / 2);
  // planar UVs in metres
  const fp = floorG.attributes.position, fu = floorG.attributes.uv;
  for (let i = 0; i < fp.count; i++) fu.setXY(i, fp.getX(i), fp.getZ(i));
  const floor = new THREE.Mesh(floorG, mat({ map: conc }));
  floor.position.y = -6;
  floor.receiveShadow = true;
  root.add(floor);
  out.floor = floor;
  return out;
}

export function buildBowl(root) {
  const out = {};
  // inner wall: rim apex down to the floor, with a soft fillet at the floor crease
  const inner = [];
  for (let r = 22; r >= 8; r -= 0.5) {
    let y = bowlHeight(r);
    const d = r - 8;
    if (d < 4) y += 0.14 * Math.pow(1 - d / 4, 2) * 1.0; // concave fillet, stays within 0.15 m
    inner.push(new THREE.Vector2(r, y + 0.03));
  }
  inner.push(new THREE.Vector2(7.2, -1.95));
  const innerTex = P.bowlInner();
  const innerGeo = lathe(inner, 192);
  {
    const uv = innerGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  }
  const innerMesh = new THREE.Mesh(innerGeo, mat({ map: innerTex, gloss: 0.16, glossSize: 0.975 }));
  innerMesh.receiveShadow = true;
  innerMesh.castShadow = false;
  root.add(innerMesh);

  // outer wall: foot at r=34 up to the rim apex
  const outerPts = [];
  for (let r = 34; r >= 22; r -= 0.5) {
    let y = bowlHeight(r);
    const d = 34 - r;
    if (d < 2) y += 0.1 * Math.pow(1 - d / 2, 2);
    outerPts.push(new THREE.Vector2(r, y + 0.03));
  }
  const outerTex = P.bowlOuter();
  // logos centred on the diagonals (u=0 is +z, the Spoon side)
  outerTex.offset.x = 0.5 - 0.125 * 4;
  const outerMesh = new THREE.Mesh(lathe(outerPts, 192), mat({ map: outerTex, gloss: 0.2, glossSize: 0.975 }));
  outerMesh.receiveShadow = true;
  outerMesh.castShadow = true;
  root.add(outerMesh);

  // rolled rim bead, glossy cream glaze
  const bead = new THREE.Mesh(new THREE.TorusGeometry(22, 0.42, 14, 192), mat({ color: 0xfff4e0, gloss: 0.5, glossSize: 0.9, rim: 0.15 }));
  bead.rotation.x = Math.PI / 2;
  bead.position.y = 5.95;
  bead.castShadow = true;
  bead.receiveShadow = true;
  bead.userData.outline = 1.4;
  root.add(bead);
  // foot ring where the bowl meets the cloth
  const foot = new THREE.Mesh(new THREE.TorusGeometry(33.9, 0.22, 8, 192), mat({ color: 0xc98a3a }));
  foot.rotation.x = Math.PI / 2;
  foot.position.y = 0.1;
  root.add(foot);

  // milk pool on the floor
  const milkGeo = new THREE.CircleGeometry(8.6, 96);
  milkGeo.rotateX(-Math.PI / 2);
  const milk = new THREE.Mesh(milkGeo, mat({ map: P.milk(), gloss: 0.3, glossSize: 0.96 }));
  milk.position.y = -1.92;
  milk.receiveShadow = true;
  root.add(milk);
  out.milk = milk;
  return out;
}

function skirt() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = "#16131c";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#e8c35a";
  g.fillRect(0, 3, 256, 4);
  g.fillStyle = "rgba(255,255,255,0.04)";
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 2, 64);
  return tex(c);
}

function concrete() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = "#211d28";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 600; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},${Math.random() * 0.04})`;
    g.beginPath();
    g.arc(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 18, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, 512, 512);
  return tex(c);
}
