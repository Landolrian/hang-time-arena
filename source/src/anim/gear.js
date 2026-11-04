// Contestant gear built on top of the look-test character (src/looktest/contestant.js):
// bolder printed numbers, the helmet's visor gasket and team decal, the stunt blaster, the
// grapple launcher on the left forearm, the whip cable and slide dust. Everything follows
// docs/STYLE.md: big simple shapes, detail in printed graphics, toon shading with ink outlines.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RAMPS, addRim, outlineMaterial } from "../looktest/toon.js";

const INK = "#1b1220";
const CREAM = "#fff4e0";
export const TEAM_COLORS = {
  red: { suit: "#e8242c", dark: "#7a0e16" },
  blue: { suit: "#1f5bff", dark: "#0b2380" },
};

// The look test loads Barlow Condensed itself; the game never did, so the numbers fell back to a
// thin system italic where a 7 read as a 1. Load the face before painting anything.
let fonts = null;
export function fontsReady() {
  fonts ??= new FontFace("BarlowC", "url(/assets/looktest/fonts/BarlowCondensed-BoldItalic.ttf)", { style: "italic", weight: "700" })
    .load().then((face) => document.fonts.add(face)).catch(() => {});
  return fonts;
}

function canvasTexture(w, h, paint) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  paint(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Draw a number as a fat block: team-dark drop shadow, heavy ink keyline, cream face. The
// condensed face is widened so a lone 7 keeps its bar at a glancing angle.
function drawNumber(g, num, x, y, size, { face = CREAM, shadow = null, widen = 1.25, line = 0.15 } = {}) {
  const text = String(num);
  g.save();
  g.translate(x, y);
  g.scale(text.length > 1 ? widen * 0.82 : widen, 1);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `italic 700 ${size}px BarlowC, "Arial Narrow", sans-serif`;
  g.lineJoin = "round";
  if (shadow) {
    g.lineWidth = size * line;
    g.strokeStyle = shadow; g.fillStyle = shadow;
    g.strokeText(text, size * 0.035, size * 0.045);
    g.fillText(text, size * 0.035, size * 0.045);
  }
  g.lineWidth = size * line;
  g.strokeStyle = INK;
  g.strokeText(text, 0, 0);
  g.fillStyle = face;
  g.fillText(text, 0, 0);
  g.restore();
}

const numberCache = new Map();
/** Jersey number for the suit shader's back and chest panels (transparent background). */
export function numberTexture(num, team) {
  const key = `${team}:${num}`;
  if (!numberCache.has(key)) {
    const t = canvasTexture(512, 512, (g) => drawNumber(g, num, 256, 268, 400, { shadow: TEAM_COLORS[team].dark, line: 0.17 }));
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    numberCache.set(key, t);
  }
  return numberCache.get(key);
}

// Team emblems for the helmet sides: Rockets carry a lightning bolt, Comets a star with a tail.
function emblem(g, team, x, y, s) {
  g.save();
  g.translate(x, y);
  g.scale(0.5 * s, s); // sphere UVs stretch u 2:1
  g.lineJoin = "round";
  g.beginPath();
  if (team === "red") {
    const pts = [[-10, -46], [26, -46], [8, -8], [30, -8], [-18, 50], [-4, 6], [-26, 6]];
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  } else {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 17 : 40, a = -Math.PI / 2 + i * Math.PI / 5;
      g[i ? "lineTo" : "moveTo"](Math.cos(a) * r + 8, Math.sin(a) * r);
    }
  }
  g.closePath();
  g.lineWidth = 12; g.strokeStyle = INK; g.stroke();
  g.fillStyle = CREAM; g.fill();
  if (team === "blue") {
    // comet tail: three cream streaks trailing back
    for (const [dy, len] of [[-14, 46], [0, 62], [14, 46]]) {
      g.beginPath(); g.moveTo(-26, dy); g.lineTo(-26 - len, dy * 1.3);
      g.lineWidth = 14; g.strokeStyle = INK; g.lineCap = "round"; g.stroke();
      g.lineWidth = 6; g.strokeStyle = CREAM; g.stroke();
    }
  }
  g.restore();
}

const helmetCache = new Map();
/**
 * Helmet shell paint on sphere UVs (u 0.25 front, 0.75 back, 0 right side, 0.5 left side;
 * v from the crown down): team base, bold cream double racing stripe with keylines, a cream
 * gasket round the visor, the team emblem on both sides and the number on the back and sides.
 */
export function helmetTexture(team, num) {
  const key = `${team}:${num}`;
  if (helmetCache.has(key)) return helmetCache.get(key);
  const t = canvasTexture(1024, 512, (g, W, H) => {
    const base = TEAM_COLORS[team].suit, dark = TEAM_COLORS[team].dark;
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // lower rim band in team dark, like a padded helmet edge
    g.fillStyle = dark;
    g.fillRect(0, H * 0.8, W, H * 0.2);
    g.fillStyle = INK;
    g.fillRect(0, H * 0.79, W, H * 0.018);
    // visor gasket: a cream frame round the visor opening (u 0.05-0.45, v 0.34-0.59)
    const gx0 = 0.028 * W, gx1 = 0.472 * W, gy0 = 0.305 * H, gy1 = 0.63 * H;
    g.fillStyle = INK;
    g.fillRect(gx0 - 8, gy0 - 8, gx1 - gx0 + 16, gy1 - gy0 + 16);
    g.fillStyle = CREAM;
    g.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    // racing stripes, front to back over the crown, stopping at the gasket
    for (const u of [0.25, 0.75]) {
      const x = u * W, bottom = u === 0.25 ? gy0 - 8 : H * 0.6;
      g.fillStyle = INK;
      g.fillRect(x - 66, 0, 132, bottom);
      g.fillStyle = CREAM;
      g.fillRect(x - 56, 0, 112, bottom - (u === 0.25 ? 0 : 10));
      g.fillStyle = INK;
      g.fillRect(x - 7, 0, 14, bottom);
    }
    // emblems on both sides, numbers behind them and big on the back
    emblem(g, team, 0.5 * W, 0.47 * H, 1.25);
    emblem(g, team, 0.0 * W, 0.47 * H, 1.25);
    emblem(g, team, 1.0 * W, 0.47 * H, 1.25);
    const n = (x, y, s) => {
      g.save(); g.translate(x, y); g.scale(0.5, 1);
      drawNumber(g, num, 0, 0, s, { widen: 1.3, line: 0.17 });
      g.restore();
    };
    n(0.75 * W, 0.71 * H, 150);
    n(0.61 * W, 0.5 * H, 104);
    n(0.89 * W, 0.5 * H, 104);
  });
  t.wrapS = THREE.RepeatWrapping;
  helmetCache.set(key, t);
  return t;
}

const toonCache = new Map();
function toonMat(color, rim = 0.35) {
  const key = `${color}:${rim}`;
  if (!toonCache.has(key)) toonCache.set(key, addRim(new THREE.MeshToonMaterial({ color, gradientMap: RAMPS.char }), 0xffffff, rim));
  return toonCache.get(key);
}
let gearOutline = null;
function outlined(meshes) {
  gearOutline ??= outlineMaterial(3.0, new THREE.Color(0x120e18), 6);
  for (const o of meshes) {
    const hull = new THREE.Mesh(o.geometry, gearOutline);
    hull.userData.isOutline = true;
    hull.renderOrder = -1;
    o.add(hull);
    o.castShadow = true;
  }
}

// Blaster parts, in the gun frame: +z down the barrel, +y up, +x to the gun's left. The origin
// is the centre of the shooting hand's grip.
const parts = [
  // [geometry, material key, position, rotation x]
  ["receiver", "body", [0, 0.078, 0.07], 0],
  ["stripe", "cream", [0, 0.088, 0.07], 0],
  ["band", "team", [0, 0.078, 0.2], 0],
  ["stock", "body", [0, 0.05, -0.23], 0],
  ["pad", "grip", [0, 0.05, -0.345], 0],
  ["shroud", "body", [0, 0.09, 0.37], Math.PI / 2],
  ["muzzle", "chrome", [0, 0.09, 0.49], Math.PI / 2],
  ["sight", "chrome", [0, 0.15, 0.05], 0],
  ["mag", "grip", [0, -0.035, 0.13], 0.22],
  ["handle", "grip", [0, -0.005, -0.005], -0.32],
];
let gunGeometry = null;
function blasterGeometry() {
  gunGeometry ??= {
    receiver: new RoundedBoxGeometry(0.08, 0.12, 0.4, 2, 0.025),
    stripe: new THREE.BoxGeometry(0.084, 0.026, 0.3),
    band: new THREE.BoxGeometry(0.086, 0.126, 0.05),
    stock: new RoundedBoxGeometry(0.062, 0.1, 0.2, 2, 0.02),
    pad: new RoundedBoxGeometry(0.066, 0.11, 0.03, 2, 0.012),
    shroud: new THREE.CylinderGeometry(0.034, 0.034, 0.2, 14),
    muzzle: new THREE.CylinderGeometry(0.03, 0.042, 0.05, 14),
    sight: new RoundedBoxGeometry(0.024, 0.04, 0.16, 2, 0.008),
    mag: new RoundedBoxGeometry(0.046, 0.15, 0.07, 2, 0.015),
    handle: new RoundedBoxGeometry(0.044, 0.12, 0.055, 2, 0.015),
  };
  return gunGeometry;
}
/** The stunt blaster: charcoal body, a team band and cream stripe, chrome muzzle and sight. */
export function makeBlaster(team) {
  const geo = blasterGeometry();
  const mats = { body: toonMat(0x34323c), grip: toonMat(0x221e29, 0.25), cream: toonMat(0xfff4e0, 0.2), chrome: toonMat(0xd2d8de, 0.5), team: toonMat(TEAM_COLORS[team].suit, 0.3) };
  const gun = new THREE.Group();
  for (const [name, mat, pos, rx] of parts) {
    const mesh = new THREE.Mesh(geo[name], mats[mat]);
    mesh.position.set(...pos);
    mesh.rotation.x = rx;
    if (name === "stripe" || name === "band") mesh.userData.noOutline = true;
    gun.add(mesh);
  }
  outlined(gun.children.filter((m) => !m.userData.noOutline));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.09, 0.52);
  gun.add(muzzle);
  gun.userData.muzzle = muzzle;
  gun.userData.foregrip = new THREE.Vector3(0, 0.035, 0.27);
  return gun;
}

/**
 * Forearm grapple launcher for the left arm (the right hand carries the blaster), built in the
 * forearm's rest frame where the left forearm runs from the elbow towards +x.
 */
export function makeLauncher(team) {
  const g = new THREE.Group();
  const geo = launcherGeometry();
  const tube = new THREE.Mesh(geo.tube, toonMat(0x34323c));
  tube.rotation.z = Math.PI / 2;
  tube.position.set(0.15, 0.055, 0);
  const band = new THREE.Mesh(geo.band, toonMat(TEAM_COLORS[team].suit, 0.3));
  band.rotation.z = Math.PI / 2;
  band.position.set(0.11, 0.055, 0);
  const tip = new THREE.Mesh(geo.tip, toonMat(0xd2d8de, 0.5));
  tip.rotation.z = -Math.PI / 2;
  tip.position.set(0.27, 0.055, 0);
  const drum = new THREE.Mesh(geo.drum, toonMat(0xd2d8de, 0.5));
  drum.position.set(0.17, 0.11, 0);
  g.add(tube, band, tip, drum);
  outlined([tube, tip, drum]);
  const exit = new THREE.Object3D();
  exit.position.set(0.29, 0.055, 0);
  g.add(exit);
  g.userData.exit = exit;
  return g;
}
let launcherGeo = null;
function launcherGeometry() {
  launcherGeo ??= {
    tube: new THREE.CylinderGeometry(0.05, 0.058, 0.2, 14),
    band: new THREE.CylinderGeometry(0.06, 0.06, 0.035, 14),
    tip: new THREE.CylinderGeometry(0.03, 0.045, 0.05, 12),
    drum: new THREE.CylinderGeometry(0.045, 0.045, 0.07, 14),
  };
  return launcherGeo;
}

/**
 * A rope drawn as a 4-sided tube through a list of points, rewritten in place each frame.
 * Used for the whip lash (the grapple cable cracked like a bullwhip).
 */
export function makeCable(count = 18, radius = 0.022, color = 0xffffdd) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 4 * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const index = [];
  for (let i = 0; i < count - 1; i++)
    for (let k = 0; k < 4; k++) {
      const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
      index.push(a, c, b, b, c, d);
    }
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  mesh.visible = false;
  const side = new THREE.Vector3(), up = new THREE.Vector3(), along = new THREE.Vector3(), helper = new THREE.Vector3(0, 1, 0);
  mesh.userData.setPoints = (points) => {
    for (let i = 0; i < count; i++) {
      along.subVectors(points[Math.min(i + 1, count - 1)], points[Math.max(i - 1, 0)]).normalize();
      side.crossVectors(along, Math.abs(along.y) > 0.9 ? helper.set(1, 0, 0) : helper.set(0, 1, 0)).normalize();
      up.crossVectors(side, along);
      const r = radius * (1 - 0.55 * i / (count - 1));
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        const p = points[i];
        positions.set([p.x + (side.x * Math.cos(a) + up.x * Math.sin(a)) * r, p.y + (side.y * Math.cos(a) + up.y * Math.sin(a)) * r, p.z + (side.z * Math.cos(a) + up.z * Math.sin(a)) * r], (i * 4 + k) * 3);
      }
    }
    geometry.attributes.position.needsUpdate = true;
  };
  return mesh;
}

let puffTexture = null;
/** Slide dust: a small pool of soft cream puffs kicked up at the heels. */
export function makeDust(count = 14) {
  puffTexture ??= canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, "rgba(255,244,224,0.9)");
    grad.addColorStop(0.6, "rgba(239,227,200,0.45)");
    grad.addColorStop(1, "rgba(239,227,200,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
  const material = new THREE.SpriteMaterial({ map: puffTexture, transparent: true, depthWrite: false, opacity: 0.8 });
  const group = new THREE.Group();
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(material.clone());
    s.visible = false;
    group.add(s);
    puffs.push({ sprite: s, age: 1, life: 0.4, velocity: new THREE.Vector3() });
  }
  let next = 0, spawnClock = 0;
  return {
    group,
    // `at` and `velocity` are world space; the group lives in the scene root.
    update(dt, active, at, velocity, rate) {
      spawnClock += dt * (active ? rate : 0);
      while (spawnClock > 1) {
        spawnClock -= 1;
        const p = puffs[next++ % count];
        p.age = 0;
        p.life = 0.35 + Math.random() * 0.2;
        p.sprite.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.05, (Math.random() - 0.5) * 0.25));
        p.velocity.copy(velocity).multiplyScalar(0.12).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2));
      }
      for (const p of puffs) {
        p.age += dt;
        const k = p.age / p.life;
        p.sprite.visible = k < 1;
        if (k >= 1) continue;
        p.sprite.position.addScaledVector(p.velocity, dt);
        p.velocity.multiplyScalar(Math.exp(-dt * 4));
        const size = 0.12 + k * 0.38;
        p.sprite.scale.set(size, size, size);
        p.sprite.material.opacity = 0.55 * (1 - k) * (1 - k);
      }
    },
  };
}
