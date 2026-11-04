import * as THREE from "three";

export async function loadFonts() {
  const faces = [
    new FontFace("Shrikhand", "url(/assets/looktest/fonts/Shrikhand-Regular.ttf)"),
    new FontFace("BarlowC", "url(/assets/looktest/fonts/BarlowCondensed-BoldItalic.ttf)", {
      style: "italic",
      weight: "700",
    }),
    new FontFace("BarlowCS", "url(/assets/looktest/fonts/BarlowCondensed-SemiBold.ttf)", {
      weight: "600",
    }),
  ];
  await Promise.all(faces.map((f) => f.load().then((ff) => document.fonts.add(ff))));
}

// Small deterministic RNG so every reload paints the same textures.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function tex(c, { repeat = [1, 1], aniso = 8, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  return t;
}

/** Almond + sage linoleum checker, 8x8 tiles per texture, with worn seams. */
export function floorTexture() {
  const [c, g] = canvas(1024, 1024);
  const r = rng(7);
  const n = 8,
    s = 1024 / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dark = (x + y) % 2 === 1;
      const j = (r() - 0.5) * 10;
      g.fillStyle = dark
        ? `rgb(${95 + j},${168 + j},${156 + j})`
        : `rgb(${239 + j * 0.6},${227 + j * 0.6},${200 + j * 0.6})`;
      g.fillRect(x * s, y * s, s, s);
      // faint marbling flecks, typical of vinyl tile
      g.globalAlpha = 0.07;
      for (let k = 0; k < 14; k++) {
        g.fillStyle = dark ? "#2f5f57" : "#b9a682";
        const px = x * s + r() * s,
          py = y * s + r() * s;
        g.beginPath();
        g.ellipse(px, py, 4 + r() * 16, 1.5 + r() * 3, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  g.strokeStyle = "rgba(60,48,40,0.35)";
  g.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    g.beginPath();
    g.moveTo(i * s, 0);
    g.lineTo(i * s, 1024);
    g.moveTo(0, i * s);
    g.lineTo(1024, i * s);
    g.stroke();
  }
  // scuffs from stunt traffic
  g.globalAlpha = 0.08;
  g.strokeStyle = "#3a2c28";
  for (let k = 0; k < 40; k++) {
    g.lineWidth = 1 + r() * 3;
    const x = r() * 1024,
      y = r() * 1024,
      a = r() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * (20 + r() * 80), y + Math.sin(a) * (20 + r() * 80));
    g.stroke();
  }
  g.globalAlpha = 1;
  return tex(c);
}

/** Butter-and-cream striped kitchen wallpaper with small painted motifs. */
export function wallpaperTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = "#f3d88a";
  g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 128) {
    g.fillStyle = "#f7e6b4";
    g.fillRect(x + 64, 0, 64, 512);
    g.fillStyle = "#e9c46f";
    g.fillRect(x + 62, 0, 3, 512);
    g.fillRect(x + 127, 0, 3, 512);
  }
  // little sage diamonds and peach four-petal flowers, staggered
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 4; col++) {
      const cx = col * 128 + 32 + (row % 2 ? 64 : 0);
      const cy = row * 64 + 32;
      if (row % 2) {
        g.fillStyle = "#e89a7a";
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          const a = (k * Math.PI) / 2;
          g.ellipse(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, 7, 4.5, a, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#f7e6b4";
        g.beginPath();
        g.arc(cx, cy, 3, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = "#7fb7a8";
        g.beginPath();
        g.moveTo(cx, cy - 9);
        g.lineTo(cx + 7, cy);
        g.lineTo(cx, cy + 9);
        g.lineTo(cx - 7, cy);
        g.closePath();
        g.fill();
      }
    }
  return tex(c);
}

/** White square backsplash tiles with a sage accent row. */
export function tileTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = "#cfc6b4";
  g.fillRect(0, 0, 512, 512);
  const n = 8,
    s = 64;
  const r = rng(3);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const accent = y === 5 && x % 2 === 0;
      const j = (r() - 0.5) * 8;
      g.fillStyle = accent ? `rgb(${120 + j},${180 + j},${166 + j})` : `rgb(${246 + j},${242 + j},${232 + j})`;
      g.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.fillRect(x * s + 8, y * s + 8, s * 0.35, 4);
    }
  return tex(c);
}

/** Raw plywood for the back of flats, with faint grain and stencil marks. */
export function plyTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(11);
  g.fillStyle = "#c9a774";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${120 + r() * 40},${86 + r() * 30},${50},${0.12 + r() * 0.12})`;
    g.lineWidth = 1 + r() * 2.5;
    const y = r() * 512;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * (2 + r() * 5));
    g.stroke();
  }
  // sheet seam
  g.fillStyle = "rgba(90,62,36,0.55)";
  g.fillRect(254, 0, 4, 512);
  // paint overspray from the front side bleeding round the edges
  g.globalAlpha = 0.35;
  g.fillStyle = "#e9c46f";
  for (let i = 0; i < 18; i++) g.fillRect(0, r() * 512, 6 + r() * 10, 10 + r() * 50);
  g.globalAlpha = 1;
  return tex(c);
}

/** Back-of-flat painted black with ply showing at edges: used on deck skirts. */
export function deckSkirtTexture() {
  const [c, g] = canvas(256, 64);
  g.fillStyle = "#16131c";
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#e8c35a";
  g.fillRect(0, 6, 256, 5);
  g.fillStyle = "#ff3da8";
  g.fillRect(0, 14, 256, 3);
  return tex(c);
}

/** Cereal box art: fictional sponsor brand. Returns materials-ready textures. */
export function cerealTextures() {
  const front = (() => {
    const [c, g] = canvas(1024, 1400);
    // sunburst
    const grd = g.createRadialGradient(512, 760, 50, 512, 760, 900);
    grd.addColorStop(0, "#ffd34a");
    grd.addColorStop(1, "#ff7a2a");
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 1400);
    g.save();
    g.translate(512, 820);
    for (let i = 0; i < 24; i++) {
      g.rotate((Math.PI * 2) / 24);
      g.fillStyle = i % 2 ? "rgba(255,255,255,0.13)" : "rgba(255,80,40,0.10)";
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-120, -1200);
      g.lineTo(120, -1200);
      g.fill();
    }
    g.restore();
    // top band
    g.fillStyle = "#2d58c8";
    g.fillRect(0, 0, 1024, 120);
    g.fillStyle = "#ffe14d";
    g.fillRect(0, 120, 1024, 14);
    // brand
    g.save();
    g.translate(512, 360);
    g.rotate(-0.08);
    g.textAlign = "center";
    g.font = "190px Shrikhand";
    g.lineJoin = "round";
    g.lineWidth = 38;
    g.strokeStyle = "#5a1020";
    g.strokeText("Rocket", 0, 0);
    g.lineWidth = 16;
    g.strokeStyle = "#fff4e0";
    g.strokeText("Rocket", 0, 0);
    g.fillStyle = "#e8342c";
    g.fillText("Rocket", 0, 0);
    g.font = "220px Shrikhand";
    g.lineWidth = 38;
    g.strokeStyle = "#5a1020";
    g.strokeText("Rings", 10, 210);
    g.lineWidth = 16;
    g.strokeStyle = "#fff4e0";
    g.strokeText("Rings", 10, 210);
    g.fillStyle = "#e8342c";
    g.fillText("Rings", 10, 210);
    g.restore();
    // bowl
    g.fillStyle = "#2d58c8";
    g.beginPath();
    g.ellipse(512, 1050, 330, 70, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(182, 1050);
    g.bezierCurveTo(200, 1330, 824, 1330, 842, 1050);
    g.fill();
    g.fillStyle = "#4b7be8";
    g.beginPath();
    g.moveTo(222, 1090);
    g.bezierCurveTo(250, 1260, 520, 1300, 560, 1290);
    g.bezierCurveTo(400, 1260, 300, 1200, 222, 1090);
    g.fill();
    // milk + rings heaped in bowl
    g.fillStyle = "#fff8ec";
    g.beginPath();
    g.ellipse(512, 1048, 300, 52, 0, 0, Math.PI * 2);
    g.fill();
    const r = rng(5);
    const ringCols = ["#f2a03d", "#ff5f7a", "#ffd34a", "#c9e267"];
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI,
        rr = r();
      const x = 512 + Math.cos(a) * 270 * rr * (r() > 0.5 ? 1 : -1);
      const y = 1040 - Math.sin(a) * 110 * (1 - Math.abs(x - 512) / 340) - r() * 20;
      g.lineWidth = 14;
      g.strokeStyle = ringCols[i % 4];
      g.beginPath();
      g.ellipse(x, y, 26, 18, r(), 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = "rgba(90,40,10,0.35)";
      g.lineWidth = 3;
      g.stroke();
    }
    // flying rings with speed lines
    for (const [x, y, s] of [
      [200, 720, 1.4],
      [830, 640, 1.2],
      [760, 880, 0.9],
    ]) {
      g.lineWidth = 22 * s;
      g.strokeStyle = "#ff5f7a";
      g.beginPath();
      g.ellipse(x, y, 46 * s, 34 * s, 0.3, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.7)";
      g.lineWidth = 6;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(x - 70 * s - k * 6, y + 20 + k * 18);
        g.lineTo(x - 140 * s - k * 20, y + 40 + k * 22);
        g.stroke();
      }
    }
    // starburst badge
    g.save();
    g.translate(905, 175);
    g.scale(0.72, 0.72);
    g.rotate(0.2);
    g.fillStyle = "#ffe14d";
    g.beginPath();
    for (let i = 0; i < 32; i++) {
      const rad = i % 2 ? 92 : 118;
      const a = (i / 32) * Math.PI * 2;
      g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.fill();
    g.fillStyle = "#e8342c";
    g.textAlign = "center";
    g.font = "italic 700 64px BarlowC";
    g.fillText("NEW!", 0, 22);
    g.restore();
    return tex(c, { repeat: [1, 1] });
  })();
  const side = (() => {
    const [c, g] = canvas(512, 1400);
    g.fillStyle = "#2d58c8";
    g.fillRect(0, 0, 512, 1400);
    g.fillStyle = "#fff4e0";
    g.fillRect(40, 260, 432, 760);
    g.fillStyle = "#1a1a1a";
    for (let i = 0; i < 26; i++) {
      g.fillRect(64, 300 + i * 27, 200 + ((i * 53) % 160), 9);
      g.fillRect(400, 300 + i * 27, 46, 9);
    }
    g.fillRect(64, 290, 384, 4);
    g.fillStyle = "#ffe14d";
    g.fillRect(0, 1180, 512, 18);
    g.font = "120px Shrikhand";
    g.fillStyle = "#ffe14d";
    g.textAlign = "center";
    g.save();
    g.translate(256, 170);
    g.rotate(-0.06);
    g.fillText("RR", 0, 0);
    g.restore();
    return tex(c);
  })();
  return { front, side };
}

/** Jersey numbers: cream digits with a dark keyline, on transparent. */
export function numberTexture(num, fill = "#fff4e0", line = "#1b1220") {
  const [c, g] = canvas(512, 512);
  g.clearRect(0, 0, 512, 512);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "italic 700 440px BarlowC";
  g.lineJoin = "round";
  g.lineWidth = 46;
  g.strokeStyle = line;
  g.strokeText(String(num), 262, 270);
  g.fillStyle = fill;
  g.fillText(String(num), 262, 270);
  const t = tex(c, { aniso: 4 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Show logo: chrome script with magenta keyline and a star. */
export function logoCanvas(w = 1400, h = 560) {
  const [c, g] = canvas(w, h);
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h * 0.62);
  g.rotate(-0.06);
  g.textAlign = "center";
  let fs = h * 0.5;
  g.font = `${fs}px Shrikhand`;
  const tw = g.measureText("Hang Time!").width;
  if (tw > w * 0.86) fs *= (w * 0.86) / tw;
  g.font = `${fs}px Shrikhand`;
  g.lineJoin = "round";
  // drop shadow
  g.fillStyle = "#1b0d2a";
  g.lineWidth = h * 0.11;
  g.strokeStyle = "#1b0d2a";
  g.strokeText("Hang Time!", h * 0.03, h * 0.04);
  g.lineWidth = h * 0.085;
  g.strokeStyle = "#ff3da8";
  g.strokeText("Hang Time!", 0, 0);
  g.lineWidth = h * 0.03;
  g.strokeStyle = "#fff4e0";
  g.strokeText("Hang Time!", 0, 0);
  const grd = g.createLinearGradient(0, -h * 0.4, 0, h * 0.1);
  grd.addColorStop(0, "#ffffff");
  grd.addColorStop(0.45, "#c9d3e2");
  grd.addColorStop(0.5, "#5d6b86");
  grd.addColorStop(0.62, "#f4f6fa");
  grd.addColorStop(1, "#9aa6ba");
  g.fillStyle = grd;
  g.fillText("Hang Time!", 0, 0);
  g.restore();
  return c;
}
export function logoTexture() {
  const t = tex(logoCanvas(), { aniso: 8 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Steel grating for catwalk floors (alpha-tested). */
export function gratingTexture() {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = "#fff";
  for (let i = 0; i < 128; i += 16) {
    g.fillRect(i, 0, 4, 128);
    g.fillRect(0, i, 128, 3);
  }
  const t = tex(c, { srgb: false });
  return t;
}

/** Painted sky for the fake kitchen window: a flat, obviously painted scene. */
export function windowSkyTexture() {
  const [c, g] = canvas(512, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, "#5fb6e6");
  grd.addColorStop(0.7, "#bfe6f2");
  grd.addColorStop(1, "#e9f3d0");
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = "rgba(255,255,255,0.92)";
  for (const [x, y, s] of [
    [120, 140, 1],
    [360, 90, 0.8],
    [300, 230, 0.6],
  ]) {
    for (const [dx, dy, r] of [
      [0, 0, 40],
      [40, -12, 46],
      [86, 2, 36],
      [44, 14, 38],
    ]) {
      g.beginPath();
      g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      g.fill();
    }
  }
  // painted hills and a picket fence
  g.fillStyle = "#86c46a";
  g.beginPath();
  g.moveTo(0, 400);
  g.bezierCurveTo(140, 330, 300, 360, 512, 380);
  g.lineTo(512, 512);
  g.lineTo(0, 512);
  g.fill();
  g.fillStyle = "#5fa354";
  g.beginPath();
  g.moveTo(0, 450);
  g.bezierCurveTo(200, 400, 360, 430, 512, 420);
  g.lineTo(512, 512);
  g.lineTo(0, 512);
  g.fill();
  g.fillStyle = "#fff8ec";
  for (let x = 6; x < 512; x += 30) {
    g.fillRect(x, 440, 16, 60);
    g.beginPath();
    g.moveTo(x, 440);
    g.lineTo(x + 8, 428);
    g.lineTo(x + 16, 440);
    g.fill();
  }
  g.fillRect(0, 456, 512, 8);
  g.fillRect(0, 482, 512, 8);
  return tex(c);
}

/** Soft radial sprite for glows and fake light pools. */
export function glowTexture() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** Helmet shell paint (sphere UVs): team base, bold double racing stripe
 * front-to-back over the crown, team number on the back and both sides. */
export function helmetTexture(base, stripe, num) {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // stripes: u=0.25 front, u=0.75 back, from the crown (top) down to theta ~0.62
  for (const u of [0.25, 0.75]) {
    const x = u * W;
    g.fillStyle = "#1b1220";
    g.fillRect(x - 62, 0, 124, H * 0.6);
    g.fillStyle = stripe;
    g.fillRect(x - 52, 0, 104, H * 0.59);
    g.fillStyle = "#1b1220";
    g.fillRect(x - 6, 0, 12, H * 0.59);
  }
  const drawNum = (x, y, size) => {
    g.save();
    g.translate(x, y);
    g.scale(0.5, 1); // sphere UVs stretch u 2:1, pre-squash so digits read upright
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `italic 700 ${size}px BarlowC`;
    g.lineJoin = "round";
    g.lineWidth = size * 0.16;
    g.strokeStyle = "#1b1220";
    g.strokeText(String(num), 0, 0);
    g.fillStyle = stripe;
    g.fillText(String(num), 0, 0);
    g.restore();
  };
  // back of the helmet, under the stripes; and each side behind the visor
  drawNum(0.75 * W, H * 0.72, 165);
  drawNum(0.55 * W, H * 0.5, 120);
  drawNum(0.95 * W, H * 0.5, 120);
  drawNum(-0.05 * W, H * 0.5, 120);
  const t = tex(c, { aniso: 8 });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
