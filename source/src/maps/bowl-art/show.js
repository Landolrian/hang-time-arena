import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mat, glow, compose, canvas, tex, star, glowSprite, beam, V, wordmark, bake } from "./kit.js";
import { goldMat, chromeMat } from "./props.js";
import { emblem } from "./studio.js";
import { logoCanvas } from "../../looktest/textures.js";

// Show elements that follow the live game: the Prize Podium turntable, the
// golden Prize Case, the center-hung bulb clock, the Snatch Ring painted on
// the bowl wall with its bulbs, and the holder barriers as light-up studio walls.
// Team set colours are lighter than the contestants' suits on purpose.
const TEAM = { rockets: new THREE.Color(0xff6a5c), comets: new THREE.Color(0x6f9bff) };
const WARM = new THREE.Color(0xffd890);
const POOL = new THREE.Color(0xffe6b0);

function teamOf(color) {
  // the podium is gold (0xc7a43d) until main.js tints it 0xd75e59 / 0x608ddd
  if (!color) return null;
  if (color.b > color.r * 1.2) return "comets";
  if (color.r > color.g * 1.6) return "rockets";
  return null;
}

export function buildShow(scene, root, live, world, parts) {
  const updaters = [];

  // ---------------- Prize Podium: a lit turntable on the milk ----------------
  const podium = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.75, 0.28, 48), mat({ map: podiumTop(), gloss: 0.3, glossSize: 0.93 }));
  deck.position.y = -1.86;
  podium.add(deck);
  const rimBand = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.18, 48, 1, true), chromeMat());
  rimBand.position.y = -1.86;
  podium.add(rimBand);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.3, 32), chromeMat());
  plinth.position.y = -1.6;
  podium.add(plinth);
  for (const m of [deck, plinth]) { m.castShadow = true; m.receiveShadow = true; }
  // bulbs round the deck edge: chase in warm white, flood the holder's colour once claimed
  const nb = 28;
  const bulbGeo = new THREE.SphereGeometry(1, 8, 6);
  const bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), nb);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2;
    bulbs.setMatrixAt(i, compose(Math.cos(a) * 3.5, -1.68, Math.sin(a) * 3.5, 0.19, 0.19, 0.19));
    bulbs.setColorAt(i, WARM);
  }
  podium.add(bulbs);
  podium.userData.keep = true;
  bake(podium, { local: true });
  live.add(podium);
  const pool = glowSprite(0xffe6b0, 13, 0.22);
  pool.position.set(0, -1.4, 0);
  pool.userData.keep = true; // tinted live by the holder
  live.add(pool);

  // ---------------- the golden Prize Case ----------------
  const prize = new THREE.Group();
  const caseMat = new THREE.MeshMatcapMaterial({ matcap: goldMat().matcap, map: caseEmboss() });
  caseMat.map.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.05, 1.9, 2.05, 4, 0.22), caseMat);
  body.position.y = -0.1;
  prize.add(body);
  // chrome-edged lid seam and corner guards
  const seam = new THREE.Mesh(new RoundedBoxGeometry(2.12, 0.16, 2.12, 2, 0.06), chromeMat());
  seam.position.y = 0.35;
  prize.add(seam);
  const guards = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) guards.push([sx, sy, sz]);
  for (const [sx, sy, sz] of guards) {
    const gd = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), goldMat());
    gd.position.set(sx * 0.98, -0.1 + sy * 0.9, sz * 0.98);
    prize.add(gd);
  }
  // carry handle on top
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.11, 10, 24, Math.PI), chromeMat());
  handle.position.y = 0.88;
  prize.add(handle);
  for (const sx of [-1, 1]) {
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.4), goldMat());
    lug.position.set(sx * 0.5, 0.86, 0);
    prize.add(lug);
  }
  prize.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const halo = glowSprite(0xffd66a, 7.5, 0.32);
  prize.add(halo);
  // sparkle stars twinkling round the case
  const sparkTex = sparkleTexture();
  const sparkles = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: 0xfff2c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.userData.phase = i * 1.7;
    s.userData.at = V(Math.cos(i * 2.1) * 1.35, -0.2 + ((i * 0.37) % 1) * 1.6, Math.sin(i * 2.1) * 1.35);
    s.renderOrder = 7;
    prize.add(s);
    sparkles.push(s);
  }
  prize.userData.keep = true;
  bake(prize, { local: true });
  live.add(prize);
  // hero beam from the well spot onto the prize
  live.add(beam(V(0, 76, 6), V(0, -2, 0), 4.5, 0xfff2dc, 0.07));

  let holder = null;
  const bulbCol = new THREE.Color();
  updaters.push((dt, t) => {
    // follow the gameplay prize (main.js moves / hides it)
    prize.visible = world.prize.visible;
    prize.position.copy(world.prize.position);
    body.rotation.y = 0;
    prize.rotation.y = t * 0.45;
    podium.rotation.y = t * 0.45;
    for (const s of sparkles) {
      const k = Math.max(0, Math.sin(t * 2.2 + s.userData.phase));
      s.position.copy(s.userData.at);
      s.scale.setScalar(0.15 + k * k * 0.75);
      s.material.opacity = k;
    }
    holder = teamOf(world.podium.material.color);
    for (let i = 0; i < nb; i++) {
      if (holder) bulbCol.copy(TEAM[holder]).multiplyScalar(1.6 + 0.6 * ((i + Math.floor(t * 8)) % 2));
      else bulbCol.copy(WARM).multiplyScalar((i + Math.floor(t * 6)) % 4 === 0 ? 2.4 : 1.0);
      bulbs.setColorAt(i, bulbCol);
    }
    bulbs.instanceColor.needsUpdate = true;
    pool.material.color.copy(holder ? TEAM[holder] : POOL);
  });

  // ---------------- Snatch Ring: painted band on the inner wall + bulbs ----------------
  {
    const rIn = 19.3, rOut = 20.3, seg = 160;
    const h = (r) => -2 + ((r - 8) * 8) / 14 + 0.05;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      for (const [r, v] of [[rIn, 0], [rOut, 1]]) {
        pos.push(Math.sin(a) * r, h(r), Math.cos(a) * r);
        uv.push((i / seg) * 40, v);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const band = new THREE.Mesh(geo, mat({ map: ringPaint(), side: THREE.DoubleSide }));
    band.material.polygonOffset = true;
    band.material.polygonOffsetFactor = -2;
    band.material.polygonOffsetUnits = -4;
    band.receiveShadow = true;
    root.add(band);
    const n = 48;
    const rb = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      rb.setMatrixAt(i, compose(Math.sin(a) * 19.8, h(19.8) + 0.08, Math.cos(a) * 19.8, 0.22, 0.14, 0.22));
      rb.setColorAt(i, WARM);
    }
    live.add(rb);
    updaters.push((dt, t) => {
      for (let i = 0; i < n; i++) {
        if (holder) bulbCol.copy(TEAM[holder]).multiplyScalar(1.5 + 0.7 * (((i + Math.floor(t * 6)) % 3) === 0));
        else bulbCol.copy(WARM).multiplyScalar(((i + Math.floor(t * 4)) % 6) === 0 ? 2.2 : 0.9);
        rb.setColorAt(i, bulbCol);
      }
      rb.instanceColor.needsUpdate = true;
    });
  }

  // ---------------- holder barriers: light-up studio walls ----------------
  {
    const panels = parts.barriers.map((b) => {
      const g = new THREE.Group();
      const long = Math.max(b.w, b.d);
      const frame = new THREE.Mesh(new RoundedBoxGeometry(long, 2.5, 1, 3, 0.2), mat({ color: 0x241c30, rim: 0.3, rimColor: 0xb9b6c6 }));
      g.add(frame);
      const faceMat = { rockets: panelMat("rockets", long), comets: panelMat("comets", long) };
      const faces = [];
      for (const s of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(long - 0.5, 1.9), faceMat.rockets);
        f.position.z = s * 0.51;
        if (s < 0) f.rotation.y = Math.PI;
        g.add(f);
        faces.push(f);
      }
      const top = [];
      for (let i = 0; i < Math.round(long / 0.8); i++) top.push(compose(-long / 2 + 0.4 + i * 0.8, 1.32, 0, 0.17, 0.17, 0.17));
      const tb = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), top.length);
      top.forEach((m, i) => { tb.setMatrixAt(i, m); tb.setColorAt(i, WARM); });
      g.add(tb);
      if (b.w > b.d) g.rotation.y = 0;
      else g.rotation.y = Math.PI / 2;
      g.position.set(b.x, 0, b.z);
      g.visible = false;
      g.userData.keep = true;
      frame.castShadow = true;
      live.add(g);
      return { g, b, faces, faceMat, tb };
    });
    updaters.push((dt, t) => {
      const team = parts.barrierMaterial.color.b > parts.barrierMaterial.color.r ? "comets" : "rockets";
      for (const p of panels) {
        p.g.visible = p.b.mesh.visible;
        if (!p.g.visible) continue;
        p.g.position.y = p.b.mesh.position.y;
        for (const f of p.faces) f.material = p.faceMat[team];
        for (let i = 0; i < p.tb.count; i++) {
          bulbCol.copy(TEAM[team]).lerp(WARM, ((i + Math.floor(t * 8)) % 2) * 0.6).multiplyScalar(2);
          p.tb.setColorAt(i, bulbCol);
        }
        p.tb.instanceColor.needsUpdate = true;
      }
    });
  }

  // ---------------- center-hung bulb clock ----------------
  {
    const g = new THREE.Group();
    const W = 7.2, H = 3.6;
    const shell = new THREE.Mesh(new RoundedBoxGeometry(W + 0.6, H + 0.6, W + 0.6, 3, 0.3), mat({ color: 0x241c30, rim: 0.35, rimColor: 0xd8d6e4 }));
    g.add(shell);
    const [cv, cx] = canvas(512, 256);
    const ct = tex(cv, { wrap: false, aniso: 4 });
    const face = new THREE.MeshBasicMaterial({ map: ct, fog: false });
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(W, H), face);
      const a = (k * Math.PI) / 2;
      f.position.set(Math.sin(a) * (W / 2 + 0.31), 0, Math.cos(a) * (W / 2 + 0.31));
      f.rotation.y = a;
      g.add(f);
    }
    // chrome trims top and bottom + logo band
    for (const y of [H / 2 + 0.38, -H / 2 - 0.38]) {
      const trim = new THREE.Mesh(new RoundedBoxGeometry(W + 0.9, 0.3, W + 0.9, 2, 0.1), chromeMat());
      trim.position.y = y;
      g.add(trim);
    }
    const lt = tex(logoCanvas(1024, 256), { wrap: false });
    const logoMat = new THREE.MeshBasicMaterial({ map: lt, transparent: true, fog: false });
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, 1.6), logoMat);
      const a = (k * Math.PI) / 2;
      f.position.set(Math.sin(a) * (W / 2 + 0.36), -H / 2 - 1.3, Math.cos(a) * (W / 2 + 0.36));
      f.rotation.y = a;
      g.add(f);
    }
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 1.8, W + 0.6), mat({ color: 0x2a1f3a }));
    skirt.position.y = -H / 2 - 1.3;
    g.add(skirt);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 50, 4), mat({ color: 0x15131a }));
      c.position.set(sx * W * 0.4, H / 2 + 25, sz * W * 0.4);
      g.add(c);
    }
    // Hung high in the rigging, above the play space: it reads as the show's scoreboard
    // display, not a hook point (it has no collider; the Spotlight Well has no anchors).
    g.position.set(0, 50, 0);
    g.scale.setScalar(1.15);
    live.add(g);
    let lastLabel = null;
    const draw = (label) => {
      cx.fillStyle = "#120e18";
      cx.fillRect(0, 0, 512, 256);
      drawBulbDigits(cx, String(label).padStart(2, " ").slice(-2), 512, 256);
      ct.needsUpdate = true;
    };
    draw("--");
    const original = world.updateClock;
    world.updateClock = (label) => {
      original(label);
      if (label !== lastLabel) {
        lastLabel = label;
        draw(label);
      }
    };
  }
  return updaters;
}

const FONT = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function drawBulbDigits(g, text, W, H) {
  const cols = 11, rows = 7; // two 5-wide digits with a 1-column gap
  const cell = Math.min((W - 40) / cols, (H - 30) / rows);
  const x0 = (W - cols * cell) / 2, y0 = (H - rows * cell) / 2;
  for (let d = 0; d < 2; d++) {
    const glyph = FONT[text[d]] ?? FONT[" "];
    for (let r = 0; r < rows; r++) for (let c = 0; c < 5; c++) {
      const on = glyph[r][c] === "1";
      const x = x0 + (d * 6 + c + 0.5) * cell, y = y0 + (r + 0.5) * cell;
      if (on) {
        const grd = g.createRadialGradient(x, y, 0, x, y, cell * 0.62);
        grd.addColorStop(0, "#fffbe0");
        grd.addColorStop(0.45, "#ffd84a");
        grd.addColorStop(1, "rgba(255,150,30,0)");
        g.fillStyle = grd;
        g.fillRect(x - cell, y - cell, cell * 2, cell * 2);
      } else {
        g.fillStyle = "#3a2a1c";
        g.beginPath();
        g.arc(x, y, cell * 0.3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

function podiumTop() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = "#2a1f3a";
  g.fillRect(0, 0, 512, 512);
  g.save();
  g.translate(256, 256);
  for (let i = 0; i < 24; i++) {
    g.rotate((Math.PI * 2) / 24);
    g.fillStyle = i % 2 ? "#ffd34a" : "#ff9a3d";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-34, -256);
    g.lineTo(34, -256);
    g.fill();
  }
  g.restore();
  g.fillStyle = "#fff4e0";
  g.beginPath();
  g.arc(256, 256, 70, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#2a1f3a";
  g.lineWidth = 14;
  g.beginPath();
  g.arc(256, 256, 240, 0, Math.PI * 2);
  g.stroke();
  return tex(c, { wrap: false });
}

function caseEmboss() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 256);
  // raised panel border and a star medallion (multiplies the gold matcap)
  g.strokeStyle = "#e0bc70";
  g.lineWidth = 10;
  g.strokeRect(22, 22, 212, 212);
  g.strokeStyle = "#fff6d8";
  g.lineWidth = 4;
  g.strokeRect(34, 34, 188, 188);
  g.fillStyle = "#c89a40";
  star(g, 128, 132, 72, 0.45);
  g.fill();
  g.fillStyle = "#fff0b8";
  star(g, 124, 126, 64, 0.45);
  g.fill();
  for (const [x, y] of [[40, 40], [216, 40], [40, 216], [216, 216]]) {
    g.fillStyle = "#8a5a18";
    g.beginPath();
    g.arc(x, y, 8, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function sparkleTexture() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.2, "rgba(255,255,255,0.4)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(32, 0); g.lineTo(35, 29); g.lineTo(64, 32); g.lineTo(35, 35); g.lineTo(32, 64); g.lineTo(29, 35); g.lineTo(0, 32); g.lineTo(29, 29);
  g.fill();
  return new THREE.CanvasTexture(c);
}

function ringPaint() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = "#fff4e0";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#2a1f3a";
  g.fillRect(0, 0, 256, 8);
  g.fillRect(0, 56, 256, 8);
  // chevrons pointing round the ring
  g.fillStyle = "#ffb23d";
  for (let x = -32; x < 256; x += 64) {
    g.beginPath();
    g.moveTo(x, 14); g.lineTo(x + 28, 14); g.lineTo(x + 48, 32); g.lineTo(x + 28, 50); g.lineTo(x, 50); g.lineTo(x + 20, 32);
    g.fill();
  }
  return tex(c);
}

const panelCache = {};
function panelMat(team, long) {
  const key = team + long;
  if (panelCache[key]) return panelCache[key];
  const [c, g] = canvas(1024, 256);
  const base = team === "rockets" ? "#ff6a5c" : "#6f9bff";
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#fff4e0");
  grd.addColorStop(0.25, base);
  grd.addColorStop(1, team === "rockets" ? "#a8302a" : "#2a4cb0");
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 256);
  for (let x = 0; x < 1024; x += 64) {
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.fillRect(x, 0, 30, 256);
  }
  for (const x of [200, 512, 824]) emblem(g, team, x, 128, 70);
  g.strokeStyle = "#1b1220";
  g.lineWidth = 10;
  g.strokeRect(5, 5, 1014, 246);
  const t = tex(c, { wrap: false });
  return (panelCache[key] = new THREE.MeshBasicMaterial({ map: t, fog: false }));
}
