import * as THREE from "three";
import { canvas, tex, rng, star, wordmark } from "./kit.js";

// Printed graphics for the hero props: cereal box, toast, toaster, carton,
// butter, napkin, sugar and the chrome / gold matcaps.

const RED = "#e8342c", INK = "#5a1020", CREAM = "#fff4e0", BLUE = "#2b2a7e", YEL = "#ffe14d";

function sunburst(g, x, y, n, len, a, b) {
  g.save();
  g.translate(x, y);
  for (let i = 0; i < n; i++) {
    g.rotate((Math.PI * 2) / n);
    g.fillStyle = i % 2 ? a : b;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-len * 0.1, -len);
    g.lineTo(len * 0.1, -len);
    g.fill();
  }
  g.restore();
}

function ring(g, x, y, s, col, rot = 0.3) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.lineWidth = s * 0.62;
  g.strokeStyle = INK;
  g.beginPath();
  g.ellipse(0, 0, s, s * 0.75, 0, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = s * 0.44;
  g.strokeStyle = col;
  g.stroke();
  g.lineWidth = s * 0.1;
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.beginPath();
  g.ellipse(0, 0, s, s * 0.75, 0, 3.5, 4.7);
  g.stroke();
  g.restore();
}

/** The mascot: a chubby cartoon rocket with eyes, flying up-right through a ring. */
function rocket(g, x, y, s, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.lineJoin = "round";
  // flame
  for (const [w, l, c] of [[0.5, 1.5, "#ff7a2a"], [0.34, 1.15, YEL], [0.18, 0.8, "#fffbe8"]]) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(-w * s, 0.95 * s);
    g.quadraticCurveTo(0, (0.95 + l * 1.3) * s, w * s, 0.95 * s);
    g.fill();
  }
  // fins
  g.fillStyle = RED;
  g.strokeStyle = INK;
  g.lineWidth = s * 0.07;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(sx * 0.42 * s, 0.1 * s);
    g.quadraticCurveTo(sx * 0.95 * s, 0.55 * s, sx * 0.85 * s, 1.1 * s);
    g.lineTo(sx * 0.38 * s, 0.82 * s);
    g.closePath();
    g.fill();
    g.stroke();
  }
  // body
  g.fillStyle = "#f6f1e6";
  g.beginPath();
  g.moveTo(0, -1.5 * s);
  g.bezierCurveTo(0.75 * s, -0.9 * s, 0.62 * s, 0.6 * s, 0.42 * s, 0.95 * s);
  g.lineTo(-0.42 * s, 0.95 * s);
  g.bezierCurveTo(-0.62 * s, 0.6 * s, -0.75 * s, -0.9 * s, 0, -1.5 * s);
  g.fill();
  g.stroke();
  // body shading stripe
  g.save();
  g.clip();
  g.fillStyle = "rgba(90,60,120,0.15)";
  g.fillRect(0.18 * s, -1.6 * s, 0.7 * s, 2.7 * s);
  g.restore();
  // nose cone
  g.fillStyle = RED;
  g.beginPath();
  g.moveTo(0, -1.5 * s);
  g.bezierCurveTo(0.42 * s, -1.2 * s, 0.56 * s, -0.9 * s, 0.6 * s, -0.75 * s);
  g.quadraticCurveTo(0, -0.62 * s, -0.6 * s, -0.75 * s);
  g.bezierCurveTo(-0.56 * s, -0.9 * s, -0.42 * s, -1.2 * s, 0, -1.5 * s);
  g.fill();
  g.stroke();
  // band
  g.fillStyle = YEL;
  g.fillRect(-0.58 * s, 0.55 * s, 1.16 * s, 0.14 * s);
  g.strokeRect(-0.58 * s, 0.55 * s, 1.16 * s, 0.14 * s);
  // eyes + grin (the mascot's face lives on the body)
  for (const sx of [-1, 1]) {
    g.fillStyle = "#fff";
    g.beginPath();
    g.ellipse(sx * 0.2 * s, -0.25 * s, 0.17 * s, 0.22 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#1b1220";
    g.beginPath();
    g.ellipse(sx * 0.2 * s + 0.05 * s, -0.22 * s, 0.08 * s, 0.11 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(sx * 0.2 * s + 0.08 * s, -0.27 * s, 0.03 * s, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = INK;
  g.lineWidth = s * 0.06;
  g.beginPath();
  g.arc(0, 0.02 * s, 0.24 * s, 0.25, Math.PI - 0.25);
  g.stroke();
  g.restore();
}

function bowlArt(g, cx, cy, w) {
  g.fillStyle = BLUE;
  g.beginPath();
  g.ellipse(cx, cy, w, w * 0.21, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(cx - w, cy);
  g.bezierCurveTo(cx - w * 0.95, cy + w * 0.85, cx + w * 0.95, cy + w * 0.85, cx + w, cy);
  g.fill();
  g.fillStyle = "#4b7be8";
  g.beginPath();
  g.moveTo(cx - w * 0.88, cy + w * 0.1);
  g.bezierCurveTo(cx - w * 0.8, cy + w * 0.6, cx, cy + w * 0.72, cx + w * 0.1, cy + w * 0.7);
  g.bezierCurveTo(cx - w * 0.4, cy + w * 0.6, cx - w * 0.7, cy + w * 0.4, cx - w * 0.88, cy + w * 0.1);
  g.fill();
  g.fillStyle = "#fff8ec";
  g.beginPath();
  g.ellipse(cx, cy - 2, w * 0.9, w * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  const r = rng(5);
  const cols = ["#f2a03d", "#ff6f8a", "#ffd34a", "#bcd86a", "#c97bd8"];
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI;
    const rr = Math.sqrt(r());
    const x = cx + Math.cos(a) * w * 0.82 * rr * (r() > 0.5 ? 1 : -1);
    const y = cy - Math.sin(a) * w * 0.32 * (1 - Math.abs(x - cx) / w) - r() * 18;
    ring(g, x, y, w * 0.075, cols[i % 5], r() * 3);
  }
}

/** Front of the giant box (18 x 30 m, canvas 1024 x 1706). */
export function boxFront() {
  const W = 1024, H = 1706;
  const [c, g] = canvas(W, H);
  const grd = g.createRadialGradient(W / 2, 980, 60, W / 2, 980, 1100);
  grd.addColorStop(0, "#ffd34a");
  grd.addColorStop(1, "#ff7a2a");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  sunburst(g, W / 2, 1000, 28, 1500, "rgba(255,255,255,0.13)", "rgba(255,80,40,0.10)");
  // top band
  g.fillStyle = BLUE;
  g.fillRect(0, 0, W, 150);
  g.fillStyle = YEL;
  g.fillRect(0, 150, W, 16);
  g.fillStyle = "#ff3da8";
  g.fillRect(0, 172, W, 6);
  // band graphics: little ring row
  for (let x = 60; x < W; x += 110) ring(g, x, 75, 22, ["#ffd34a", "#ff6f8a", "#bcd86a", "#f2a03d"][(x / 110) | 0 % 4]);
  // wordmark
  wordmark(g, "Rocket", W / 2 - 20, 400, 205, { rot: -0.08, fill: RED, inner: CREAM, outer: INK, outerW: 0.22, innerW: 0.09 });
  wordmark(g, "Rings", W / 2 + 20, 620, 250, { rot: -0.08, fill: RED, inner: CREAM, outer: INK, outerW: 0.22, innerW: 0.09 });
  // speed trail + ring the rocket flies through
  g.strokeStyle = "rgba(255,255,255,0.75)";
  g.lineCap = "round";
  for (let k = 0; k < 4; k++) {
    g.lineWidth = 16 - k * 3;
    g.beginPath();
    g.moveTo(130 + k * 30, 1180 - k * 10);
    g.quadraticCurveTo(300, 1000 - k * 20, 520 + k * 10, 860 - k * 25);
    g.stroke();
  }
  ring(g, 560, 860, 120, "#ff6f8a", 0.5);
  rocket(g, 650, 790, 150, 0.62);
  // front half of the ring over the rocket's body
  g.save();
  g.translate(560, 860);
  g.rotate(0.5);
  g.lineWidth = 120 * 0.62;
  g.strokeStyle = INK;
  g.beginPath();
  g.ellipse(0, 0, 120, 90, 0, 0.1, Math.PI - 0.1);
  g.stroke();
  g.lineWidth = 120 * 0.44;
  g.strokeStyle = "#ff6f8a";
  g.stroke();
  g.restore();
  // more flying rings
  ring(g, 170, 830, 46, "#ffd34a", -0.2);
  ring(g, 120, 1110, 40, "#bcd86a", 0.6);
  ring(g, 820, 610 + 120, 30, "#c97bd8", 0.1);
  // the bowl
  bowlArt(g, W / 2, 1390, 360);
  // starburst badge with a little toy-rocket pictogram (free prize inside)
  g.save();
  g.translate(860, 1150);
  g.rotate(0.18);
  g.fillStyle = YEL;
  star(g, 0, 0, 105, 0.8, 0, 16);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = INK;
  g.stroke();
  rocket(g, 0, 8, 46, 0.5);
  g.restore();
  // bottom band
  g.fillStyle = BLUE;
  g.fillRect(0, H - 60, W, 60);
  g.fillStyle = YEL;
  g.fillRect(0, H - 72, W, 12);
  return tex(c, { wrap: false });
}

/** Side panels: blue with a cream "nutrition" panel of fictional micro-print. */
export function boxSide(barcode = false) {
  const W = 512, H = 1706;
  const [c, g] = canvas(W, H);
  g.fillStyle = BLUE;
  g.fillRect(0, 0, W, H);
  g.fillStyle = YEL;
  g.fillRect(0, 150, W, 16);
  g.fillStyle = "#ff3da8";
  g.fillRect(0, 172, W, 6);
  wordmark(g, "RR", W / 2, 360, 170, { rot: -0.08, fill: YEL, inner: null, outer: INK, outerW: 0.16 });
  // nutrition panel
  g.fillStyle = CREAM;
  g.fillRect(48, 480, W - 96, 820);
  g.fillStyle = "#1b1220";
  g.fillRect(70, 504, W - 140, 46);
  g.fillRect(70, 560, W - 140, 6);
  const r = rng(barcode ? 3 : 9);
  for (let i = 0; i < 25; i++) {
    const y = 590 + i * 27;
    const thick = i % 6 === 0;
    g.fillRect(70, y, 150 + r() * 120, thick ? 12 : 8);
    g.fillRect(W - 70 - 46, y, 46, thick ? 12 : 8);
    if (i % 6 === 5) g.fillRect(70, y + 17, W - 140, 3);
  }
  // a row of vitamin pictograms
  for (let i = 0; i < 4; i++) {
    g.fillStyle = ["#ffd34a", "#ff6f8a", "#bcd86a", "#f2a03d"][i];
    g.beginPath();
    g.arc(110 + i * 98, 1250, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1b1220";
    g.beginPath();
    g.arc(110 + i * 98, 1250, 12, 0, Math.PI * 2);
    g.fill();
  }
  if (barcode) {
    g.fillStyle = "#fff";
    g.fillRect(110, 1380, 292, 170);
    g.fillStyle = "#111";
    let x = 126;
    while (x < 386) {
      const w = 2 + ((r() * 4) | 0) * 2;
      g.fillRect(x, 1396, w, 120);
      x += w + 3 + ((r() * 3) | 0) * 2;
    }
  } else {
    // a small cut-out game card: dotted outline with a ring pictogram
    g.strokeStyle = CREAM;
    g.setLineDash([16, 12]);
    g.lineWidth = 6;
    g.strokeRect(96, 1360, 320, 230);
    g.setLineDash([]);
    ring(g, 256, 1475, 60, "#ffd34a", 0.2);
  }
  g.fillStyle = YEL;
  g.fillRect(0, H - 72, W, 12);
  return tex(c, { wrap: false });
}

/** Back of the box: a maze game from the rocket to the bowl. */
export function boxBack() {
  const W = 1024, H = 1706;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#ffcf4a";
  g.fillRect(0, 0, W, H);
  sunburst(g, W / 2, H / 2, 32, 1400, "rgba(255,255,255,0.12)", "rgba(255,120,40,0.10)");
  g.fillStyle = BLUE;
  g.fillRect(0, 0, W, 150);
  g.fillStyle = YEL;
  g.fillRect(0, 150, W, 16);
  wordmark(g, "Rocket Rings", W / 2, 330, 120, { rot: -0.05, fill: RED, inner: CREAM, outer: INK });
  // maze panel
  const mx = 120, my = 470, n = 9, cell = 87;
  g.fillStyle = CREAM;
  g.fillRect(mx - 30, my - 30, n * cell + 60, n * cell + 60);
  g.strokeStyle = BLUE;
  g.lineWidth = 16;
  g.lineCap = "square";
  // a deterministic maze (recursive backtracker)
  const r = rng(17);
  const seen = new Set(), walls = new Set();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { walls.add(`h${x},${y}`); walls.add(`v${x},${y}`); }
  const stack = [[0, 0]];
  seen.add("0,0");
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, dx, dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !seen.has(`${a},${b}`));
    if (!opts.length) { stack.pop(); continue; }
    const [a, b, dx, dy] = opts[(r() * opts.length) | 0];
    if (dx === 1) walls.delete(`v${a},${b}`); if (dx === -1) walls.delete(`v${x},${y}`);
    if (dy === 1) walls.delete(`h${a},${b}`); if (dy === -1) walls.delete(`h${x},${y}`);
    seen.add(`${a},${b}`);
    stack.push([a, b]);
  }
  g.beginPath();
  for (const w of walls) {
    const [x, y] = w.slice(1).split(",").map(Number);
    if (w[0] === "v" && x > 0) { g.moveTo(mx + x * cell, my + y * cell); g.lineTo(mx + x * cell, my + (y + 1) * cell); }
    if (w[0] === "h" && y > 0) { g.moveTo(mx + x * cell, my + y * cell); g.lineTo(mx + (x + 1) * cell, my + y * cell); }
  }
  g.rect(mx, my, n * cell, n * cell);
  g.stroke();
  g.fillStyle = CREAM;
  g.fillRect(mx - 9, my + 8, 20, cell - 16);
  g.fillRect(mx + n * cell - 11, my + (n - 1) * cell + 8, 20, cell - 16);
  rocket(g, mx - 10, my + cell / 2 - 10, 36, Math.PI / 2);
  bowlArt(g, mx + n * cell + 20, my + (n - 0.4) * cell, 46);
  // footer: cut-out mask outline
  g.strokeStyle = INK;
  g.setLineDash([18, 12]);
  g.lineWidth = 6;
  g.strokeRect(120, 1400, 784, 220);
  g.setLineDash([]);
  for (let i = 0; i < 5; i++) ring(g, 220 + i * 145, 1510, 48, ["#ffd34a", "#ff6f8a", "#bcd86a", "#f2a03d", "#c97bd8"][i], i);
  return tex(c, { wrap: false });
}

/** Box top: the closed top panel seen from above (18 x 9). */
export function boxTop() {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#ffc94a";
  g.fillRect(0, 0, W, H);
  sunburst(g, W / 2, H / 2, 24, 900, "rgba(255,255,255,0.12)", "rgba(255,120,40,0.08)");
  // fold lines of the closed top flaps
  g.strokeStyle = "rgba(120,60,10,0.35)";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(0, 200); g.lineTo(W, 200);
  g.moveTo(90, 200); g.lineTo(90, H);
  g.moveTo(W - 90, 200); g.lineTo(W - 90, H);
  g.stroke();
  g.fillStyle = BLUE;
  g.fillRect(0, 0, W, 22);
  g.fillRect(0, H - 22, W, 22);
  wordmark(g, "Rocket Rings", W / 2, 370, 92, { rot: -0.04, fill: RED, inner: CREAM, outer: INK });
  return tex(c, { wrap: false });
}

/** Raw corrugated cardboard (flap insides and edges). */
export function cardboard() {
  const [c, g] = canvas(512, 512);
  g.scale(2, 2);
  g.fillStyle = "#c2ab86";
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = "rgba(90,66,36,0.07)";
    g.fillRect(x, 0, 6, 256);
  }
  const r = rng(2);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(255,240,210,${r() * 0.08})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
  }
  return tex(c);
}

/** Front of a box flap (printed side): blue with a yellow stripe and stars. */
export function flapPrint() {
  const [c, g] = canvas(1024, 192);
  g.scale(2, 2);
  g.fillStyle = BLUE;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = YEL;
  g.fillRect(0, 62, 512, 12);
  g.fillStyle = CREAM;
  for (let x = 30; x < 512; x += 64) {
    star(g, x, 32, 13);
    g.fill();
  }
  return tex(c, { wrap: false });
}

/** The free-prize packet on the box top. */
export function prizePacket() {
  const [c, g] = canvas(512, 320);
  g.fillStyle = "#ff3da8";
  g.fillRect(0, 0, 512, 320);
  sunburst(g, 256, 200, 20, 500, "rgba(255,255,255,0.18)", "rgba(255,225,77,0.2)");
  g.fillStyle = YEL;
  g.fillRect(0, 0, 512, 40);
  g.fillRect(0, 280, 512, 40);
  rocket(g, 256, 165, 62, 0.4);
  for (const [x, y] of [[90, 110], [420, 90], [400, 230], [110, 240]]) {
    g.fillStyle = CREAM;
    star(g, x, y, 22);
    g.fill();
  }
  return tex(c, { wrap: false });
}

/** Toasted bread face: golden, darker toward the edges, crumb pores. */
export function toastFace() {
  const W = 512, H = 384;
  const [c, g] = canvas(W, H);
  const grd = g.createRadialGradient(W / 2, H * 0.55, 40, W / 2, H * 0.55, 300);
  grd.addColorStop(0, "#efc272");
  grd.addColorStop(0.6, "#dca04e");
  grd.addColorStop(1, "#b9762f");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const r = rng(8);
  for (let i = 0; i < 900; i++) {
    const x = r() * W, y = r() * H;
    g.fillStyle = `rgba(${120 + r() * 40},${70 + r() * 20},${20},${0.18 + r() * 0.2})`;
    g.beginPath();
    g.ellipse(x, y, 1 + r() * 4, 1 + r() * 2.5, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(255,236,190,${0.15 + r() * 0.2})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
  return tex(c, { wrap: false });
}

export function crust() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = "#9a5a22";
  g.fillRect(0, 0, 128, 128);
  const r = rng(6);
  for (let i = 0; i < 200; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? "60,30,10" : "200,140,70"},${r() * 0.25})`;
    g.fillRect(r() * 128, r() * 128, 2 + r() * 6, 1 + r() * 2);
  }
  return tex(c);
}

/** Toaster side panel: pastel with an 80s boomerang print and a chrome-script brand. */
export function toasterPanel(base, accent, brand = true) {
  const W = 1024, H = 640;
  const [c, g] = canvas(W, H);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const r = rng(base.length * 13);
  // boomerangs + dots (formica print)
  for (let i = 0; i < 38; i++) {
    const x = r() * W, y = r() * H;
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI * 2);
    g.strokeStyle = accent;
    g.globalAlpha = 0.35;
    g.lineWidth = 9;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(-26, 10);
    g.quadraticCurveTo(0, -24, 26, 10);
    g.stroke();
    g.restore();
    g.globalAlpha = 0.28;
    g.fillStyle = "#fff4e0";
    g.beginPath();
    g.arc(r() * W, r() * H, 5, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  // chrome trim band printed near the bottom
  const band = g.createLinearGradient(0, H - 150, 0, H - 90);
  band.addColorStop(0, "#ffffff");
  band.addColorStop(0.45, "#c9d3e2");
  band.addColorStop(0.5, "#5d6b86");
  band.addColorStop(1, "#e4e9f2");
  g.fillStyle = band;
  g.fillRect(0, H - 150, W, 60);
  if (brand) {
    // brand plate: chrome script on a dark lozenge
    g.fillStyle = "#2a1f3a";
    g.beginPath();
    g.roundRect(W / 2 - 250, 190, 500, 170, 85);
    g.fill();
    g.strokeStyle = "#e8edf5";
    g.lineWidth = 10;
    g.stroke();
    const grd = g.createLinearGradient(0, 220, 0, 330);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(0.48, "#c9d3e2");
    grd.addColorStop(0.52, "#6a7894");
    grd.addColorStop(1, "#f4f6fa");
    wordmark(g, "Pop-Tron", W / 2, 310, 108, { fill: grd, inner: null, outer: "#ff3da8", outerW: 0.12 });
    // little toast pictograms: light -> dark (the browning scale)
    for (let i = 0; i < 5; i++) {
      const x = W / 2 - 160 + i * 80, y = 445;
      g.fillStyle = ["#f6dfa5", "#ecc073", "#d99a4b", "#b46f2c", "#7a4318"][i];
      g.beginPath();
      g.roundRect(x - 26, y - 22, 52, 46, [18, 18, 6, 6]);
      g.fill();
      g.strokeStyle = "#2a1f3a";
      g.lineWidth = 4;
      g.stroke();
    }
  }
  return tex(c, { wrap: false });
}

/** Carton panels. kind: "brand" | "missing" | "cow" | "info". 10 x 24 m faces (canvas 512 x 1228). */
export function cartonPanel(kind) {
  const W = 512, H = 1228;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#fbf6ea";
  g.fillRect(0, 0, W, H);
  // top band (teal with a milk wave), bottom band
  g.fillStyle = "#3f9e94";
  g.fillRect(0, 0, W, 210);
  g.fillStyle = "#fbf6ea";
  g.beginPath();
  g.moveTo(0, 190);
  for (let x = 0; x <= W; x += 16) g.lineTo(x, 196 + Math.sin(x / 40) * 14);
  g.lineTo(W, 240);
  g.lineTo(0, 240);
  g.fill();
  g.fillStyle = "#ff3da8";
  g.fillRect(0, 26, W, 8);
  g.fillStyle = "#3f9e94";
  g.fillRect(0, H - 90, W, 90);
  g.fillStyle = "#ffd34a";
  g.fillRect(0, H - 104, W, 14);
  const moon = (x, y, s) => {
    g.fillStyle = "#ffd34a";
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3f9e94";
    g.beginPath();
    g.arc(x + s * 0.45, y - s * 0.25, s * 0.85, 0, Math.PI * 2);
    g.fill();
  };
  if (kind === "brand") {
    moon(W / 2 - 150, 105, 52);
    for (const [x, y] of [[360, 70], [420, 130], [300, 140]]) {
      g.fillStyle = "#fff4e0";
      star(g, x, y, 16);
      g.fill();
    }
    wordmark(g, "Moonbeam", W / 2, 470, 112, { fill: "#2a1440", inner: "#fff4e0", outer: "#ffd34a", rot: -0.06, outerW: 0.18 });
    wordmark(g, "Dairy", W / 2, 590, 84, { fill: "#3f9e94", inner: null, outer: "#2a1440", rot: -0.06, outerW: 0.12, font: "BarlowC", weight: "italic 700" });
    // milk glass pictogram + cow spots band
    g.fillStyle = "#fff";
    g.strokeStyle = "#2a1440";
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(W / 2 - 80, 700);
    g.lineTo(W / 2 + 80, 700);
    g.lineTo(W / 2 + 62, 960);
    g.lineTo(W / 2 - 62, 960);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#e8f0f4";
    g.fillRect(W / 2 - 70, 720, 140, 30);
    for (const [x, y, rx, ry] of [[70, 780, 50, 34], [440, 840, 44, 56], [90, 1000, 36, 28], [420, 1040, 60, 34]]) {
      g.fillStyle = "#2a1440";
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === "missing") {
    // the "have you seen this contestant?" gag: a framed portrait, all pictograms
    g.fillStyle = "#2a1440";
    g.fillRect(56, 300, W - 112, 640);
    g.fillStyle = "#fbf6ea";
    g.fillRect(70, 314, W - 140, 612);
    // big question mark badge
    g.fillStyle = "#ff3da8";
    g.beginPath();
    g.arc(W / 2, 380, 46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "italic 700 76px BarlowC";
    g.textAlign = "center";
    g.fillText("?", W / 2, 406);
    // portrait frame
    g.fillStyle = "#cfe3df";
    g.fillRect(126, 450, W - 252, 300);
    g.strokeStyle = "#2a1440";
    g.lineWidth = 6;
    g.strokeRect(126, 450, W - 252, 300);
    // helmeted contestant silhouette: helmet with visor + racing stripe, shoulders
    g.fillStyle = "#2a1440";
    g.beginPath();
    g.ellipse(W / 2, 742, 120, 70, 0, Math.PI, 0);
    g.fill();
    g.beginPath();
    g.arc(W / 2, 580, 78, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fbf6ea";
    g.fillRect(W / 2 - 10, 502, 20, 70);
    g.fillStyle = "#7d8a9e";
    g.beginPath();
    g.roundRect(W / 2 - 58, 572, 116, 40, 18);
    g.fill();
    // fake caption lines (no words)
    g.fillStyle = "#2a1440";
    for (let i = 0; i < 5; i++) g.fillRect(100, 790 + i * 26, i === 0 ? 312 : 190 + ((i * 47) % 120), 12);
    // phone pictogram
    g.beginPath();
    g.roundRect(W / 2 - 40, 1000, 80, 46, 14);
    g.fill();
    moon(W / 2 + 150, 120, 40);
  } else if (kind === "cow") {
    moon(W / 2, 110, 60);
    // a friendly cow head pictogram
    g.fillStyle = "#fff";
    g.strokeStyle = "#2a1440";
    g.lineWidth = 10;
    g.beginPath();
    g.ellipse(W / 2, 600, 150, 175, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#2a1440";
    g.beginPath();
    g.ellipse(W / 2 - 70, 520, 55, 70, 0.4, 0, Math.PI * 2);
    g.fill();
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(W / 2 + sx * 190, 470, 60, 26, sx * 0.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffd34a";
      g.beginPath();
      g.moveTo(W / 2 + sx * 70, 440);
      g.quadraticCurveTo(W / 2 + sx * 110, 360, W / 2 + sx * 120, 330);
      g.lineTo(W / 2 + sx * 95, 445);
      g.fill();
      g.fillStyle = "#2a1440";
      g.beginPath();
      g.arc(W / 2 + sx * 55, 590, 16, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#f6b2b8";
    g.beginPath();
    g.ellipse(W / 2, 715, 110, 66, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#2a1440";
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(W / 2 + sx * 40, 715, 13, 20, 0, 0, Math.PI * 2);
      g.fill();
    }
    wordmark(g, "Moonbeam", W / 2, 960, 96, { fill: "#2a1440", inner: "#fff4e0", outer: "#ffd34a", rot: -0.06, outerW: 0.18 });
  } else {
    // info side: fictional micro-print bars + a recycle-ish arrows pictogram
    g.fillStyle = "#2a1440";
    for (let i = 0; i < 22; i++) g.fillRect(70, 320 + i * 26, 140 + ((i * 71) % 220), 10);
    g.strokeStyle = "#3f9e94";
    g.lineWidth = 14;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(W / 2, 1000, 70, k * 2.1, k * 2.1 + 1.6);
      g.stroke();
    }
  }
  return tex(c, { wrap: false });
}

/** Carton top (10 x 10): folded ears and the seal. */
export function cartonTop() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = "#3f9e94";
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(20,50,50,0.5)";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(256, 180); g.lineTo(512, 0);
  g.moveTo(0, 512); g.lineTo(256, 332); g.lineTo(512, 512);
  g.moveTo(256, 180); g.lineTo(256, 332);
  g.stroke();
  g.fillStyle = "#fbf6ea";
  g.fillRect(0, 240, 512, 32);
  return tex(c, { wrap: false });
}

/** Butter wrapper: gold paper, cow + sun pictogram, tablespoon tick marks. */
export function butterWrap() {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#f7dc84");
  grd.addColorStop(1, "#e9c25a");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // folded-paper creases
  g.strokeStyle = "rgba(150,110,30,0.25)";
  g.lineWidth = 3;
  for (const x of [120, 470, 860]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 30, H);
    g.stroke();
  }
  // tablespoon tick marks along the top edge
  g.fillStyle = "#7a2a1a";
  for (let i = 0; i <= 8; i++) {
    const x = 60 + i * ((W - 120) / 8);
    g.fillRect(x - 3, 0, 6, i % 4 === 0 ? 90 : 58);
  }
  // sun + brand
  g.save();
  g.translate(W / 2, 300);
  g.fillStyle = "#ff9a3d";
  for (let i = 0; i < 16; i++) {
    g.rotate(Math.PI / 8);
    g.fillRect(-8, -135, 16, 40);
  }
  g.beginPath();
  g.arc(0, 0, 90, 0, Math.PI * 2);
  g.fill();
  g.restore();
  wordmark(g, "Golden Meadow", W / 2, 330, 86, { fill: "#7a2a1a", inner: "#fff4e0", outer: "#3a1408", rot: -0.03, outerW: 0.16 });
  g.fillStyle = "#3f9e94";
  g.fillRect(0, H - 60, W, 24);
  return tex(c, { wrap: false });
}

export function napkinPrint() {
  // Flat cream paper napkin: a few soft fold creases (thin lines, not shading bands, which
  // streaked into dark smears at a distance) and a printed pink-and-teal hem.
  const [c, g] = canvas(512, 256);
  g.fillStyle = "#f4ead3";
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#e0629a";
  g.fillRect(0, 196, 512, 18);
  g.fillStyle = "#3f9e94";
  g.fillRect(0, 222, 512, 8);
  // embossed border dots along the hem
  g.fillStyle = "rgba(255,255,255,0.7)";
  for (let x = 8; x < 512; x += 16) g.fillRect(x, 186, 4, 4);
  // two fold creases per tile: a faint shadow line with a highlight beside it
  for (const x of [128, 384]) {
    g.fillStyle = "rgba(150,120,80,0.22)";
    g.fillRect(x, 0, 3, 186);
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.fillRect(x + 3, 0, 2, 186);
  }
  return tex(c);
}

export function sugar() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#f4f2ee";
  g.fillRect(0, 0, 256, 256);
  const r = rng(77);
  for (let i = 0; i < 1400; i++) {
    const v = r();
    g.fillStyle = v > 0.6 ? `rgba(255,255,255,${0.4 + r() * 0.6})` : `rgba(160,165,185,${r() * 0.35})`;
    g.fillRect(r() * 256, r() * 256, 2 + r() * 4, 2 + r() * 4);
  }
  return tex(c);
}

/** Painted matcap: studio softboxes over a dark horizon over a warm floor. */
export function matcap(kind = "chrome") {
  const S = 256;
  const [c, g] = canvas(S, S);
  const gold = kind === "gold";
  const sky = gold ? ["#fff8d8", "#ffd660", "#f0b030"] : ["#ffffff", "#e8edf6", "#b8c3d6"];
  const floor = gold ? ["#6a3c0c", "#c08020", "#ffd870"] : ["#34303e", "#7a6a68", "#d6b898"];
  g.fillStyle = "#000";
  g.fillRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  g.clip();
  // The centre of a matcap is what a camera-facing surface reflects, so it stays
  // bright; the dark horizon sits low (surfaces tipped toward the floor).
  const HZ = 0.7;
  const top = g.createLinearGradient(0, 0, 0, S * HZ);
  top.addColorStop(0, sky[0]);
  top.addColorStop(0.55, sky[1]);
  top.addColorStop(1, sky[2]);
  g.fillStyle = top;
  g.fillRect(0, 0, S, S * HZ);
  const bot = g.createLinearGradient(0, S * HZ, 0, S);
  bot.addColorStop(0, floor[0]);
  bot.addColorStop(0.5, floor[1]);
  bot.addColorStop(1, floor[2]);
  g.fillStyle = bot;
  g.fillRect(0, S * HZ, S, S * (1 - HZ));
  // horizon line
  g.fillStyle = gold ? "#4a2606" : "#1a1822";
  g.fillRect(0, S * HZ - 2, S, S * 0.03);
  // softbox highlights
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.beginPath();
  g.ellipse(S * 0.34, S * 0.22, S * 0.12, S * 0.07, -0.5, 0, Math.PI * 2);
  g.fill();
  g.fillRect(S * 0.66, S * 0.12, S * 0.05, S * 0.3);
  // rim darkening
  const rim = g.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S / 2);
  rim.addColorStop(0, "rgba(0,0,0,0)");
  rim.addColorStop(1, gold ? "rgba(90,40,0,0.55)" : "rgba(20,18,30,0.5)");
  g.fillStyle = rim;
  g.fillRect(0, 0, S, S);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Spoon handle engraving (multiplies the chrome matcap): border and a crest at the tip (v=1). */
export function spoonEngrave() {
  const [c, g] = canvas(128, 1024);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 1024);
  g.strokeStyle = "#8f98a8";
  g.lineWidth = 5;
  g.strokeRect(12, 12, 104, 1000);
  g.lineWidth = 2;
  g.strokeRect(20, 20, 88, 984);
  g.fillStyle = "#b9c1ce";
  g.beginPath();
  g.ellipse(64, 120, 34, 58, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#7a8496";
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = "#ffffff";
  star(g, 64, 120, 22, 0.45);
  g.fill();
  g.strokeStyle = "#a3abb9";
  g.lineWidth = 3;
  for (let y = 230; y < 980; y += 70) {
    g.beginPath();
    g.moveTo(64, y);
    g.quadraticCurveTo(30, y + 20, 44, y + 45);
    g.moveTo(64, y);
    g.quadraticCurveTo(98, y + 20, 84, y + 45);
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
