import * as THREE from "three";
import { canvas, tex, rng, star, wordmark } from "./kit.js";

// Canvas painters for every printed surface on the Breakfast Bowl set.
// All brands are fictional; text is limited to sponsor wordmarks.

const RR_RED = "#e8342c", RR_INK = "#5a1020", CREAM = "#fff4e0", BOX_BLUE = "#2d58c8";

/** Big calm gingham: cream with sage-teal bands, faint weave. One tile = 2x2 checks. */
export function gingham() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = "#f4ead3";
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = "rgba(95,168,156,0.42)";
  g.fillRect(256, 0, 256, 512);
  g.fillRect(0, 256, 512, 256);
  // weave: fine thread lines in both directions, very faint
  const r = rng(4);
  for (let i = 0; i < 512; i += 4) {
    g.fillStyle = `rgba(70,60,40,${0.025 + r() * 0.02})`;
    g.fillRect(0, i, 512, 1);
    g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.03})`;
    g.fillRect(i + 2, 0, 1, 512);
  }
  // soft check edges so the bands do not alias at grazing angles
  g.fillStyle = "rgba(60,120,110,0.10)";
  for (const x of [254, 510]) g.fillRect(x, 0, 4, 512);
  for (const y of [254, 510]) g.fillRect(0, y, 512, 4);
  return tex(c);
}

/** Woven placemat: pastel team tint, chunky weave, contrasting border. */
export function placemat(base, band, edge) {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = base;
  g.fillRect(0, 0, 1024, 1024);
  const r = rng(base.length * 7);
  // basket weave: alternating 32 px over/under blocks
  for (let y = 0; y < 1024; y += 32)
    for (let x = 0; x < 1024; x += 32) {
      const h = ((x + y) / 32) % 2 === 0;
      g.fillStyle = h ? "rgba(255,255,255,0.10)" : "rgba(60,30,30,0.07)";
      g.fillRect(x, y, 32, 32);
      g.fillStyle = "rgba(60,30,30,0.10)";
      if (h) for (let k = 6; k < 32; k += 9) g.fillRect(x, y + k, 32, 2);
      else for (let k = 6; k < 32; k += 9) g.fillRect(x + k, y, 2, 32);
    }
  // border bands
  g.fillStyle = band;
  g.fillRect(0, 0, 1024, 70);
  g.fillRect(0, 954, 1024, 70);
  g.fillRect(0, 0, 70, 1024);
  g.fillRect(954, 0, 70, 1024);
  // braided edge: diagonal ticks across the band
  g.strokeStyle = edge;
  g.lineWidth = 6;
  g.globalAlpha = 0.5;
  for (let k = 0; k < 1024; k += 22) {
    for (const [x0, y0, dx, dy] of [[k, 8, 14, 54], [k, 962, 14, 54], [8, k, 54, 14], [962, k, 54, 14]]) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + dx, y0 + dy);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
    g.fillRect(r() * 1024, r() * 1024, 2, 6);
  }
  const t = tex(c, { wrap: false });
  return t;
}

/** Oak table top / apron: long grain streaks. */
export function oak(seed = 3, w = 1024, h = 256) {
  const [c, g] = canvas(w, h);
  g.fillStyle = "#c98a55";
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < 70; i++) {
    const y = r() * h;
    g.strokeStyle = `rgba(${110 + r() * 40},${62 + r() * 20},${30},${0.12 + r() * 0.18})`;
    g.lineWidth = 1 + r() * 4;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.006 + i) * (3 + r() * 6));
    g.stroke();
  }
  // (no knots: at this scale they read as ripples)
  for (let k = 0; k < 0; k++) {
    const x = r() * w, y = r() * h;
    g.strokeStyle = "rgba(100,55,25,0.35)";
    for (let i = 1; i < 6; i++) {
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(x, y, i * 9, i * 3, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // varnish sheen band
  const sh = g.createLinearGradient(0, 0, 0, h);
  sh.addColorStop(0, "rgba(255,230,190,0.10)");
  sh.addColorStop(0.5, "rgba(255,230,190,0)");
  sh.addColorStop(1, "rgba(60,30,10,0.12)");
  g.fillStyle = sh;
  g.fillRect(0, 0, w, h);
  return tex(c);
}

/**
 * Outside of the bowl: sunflower glaze, logo tile (repeated 4x round the
 * bowl), printed rim stripe near v=1. v=0 at the foot, v=1 at the rim lip.
 */
export function bowlOuter() {
  const [c, g] = canvas(2048, 512);
  const W = 2048, H = 512;
  const grd = g.createLinearGradient(0, H, 0, 0);
  grd.addColorStop(0, "#e9a531");
  grd.addColorStop(0.55, "#f2b53a");
  grd.addColorStop(1, "#f6c24c");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // glaze mottling
  const r = rng(12);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,240,200,${r() * 0.06})`;
    g.beginPath();
    g.ellipse(r() * W, r() * H, 20 + r() * 60, 6 + r() * 14, 0, 0, Math.PI * 2);
    g.fill();
  }
  // foot band (darker, unglazed-looking) at the bottom
  g.fillStyle = "#c98a3a";
  g.fillRect(0, H - 26, W, 26);
  g.fillStyle = "#fff4e0";
  g.fillRect(0, H - 34, W, 6);
  // rim stripe: teal band with cream dots, magenta pinstripes (top of texture = rim)
  g.fillStyle = "#3f9e94";
  g.fillRect(0, 26, W, 62);
  g.fillStyle = "#fff4e0";
  for (let x = 16; x < W; x += 44) {
    g.beginPath();
    g.arc(x, 57, 11, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#ff3da8";
  g.fillRect(0, 16, W, 6);
  g.fillRect(0, 92, W, 6);
  g.fillStyle = "#fff4e0";
  g.fillRect(0, 0, W, 12);
  // the logo: a cream lozenge with the Rocket Rings wordmark, sunburst behind
  const cx = W / 2, cy = 300;
  g.save();
  g.translate(cx, cy);
  g.fillStyle = "#fff4e0";
  g.beginPath();
  g.ellipse(0, 0, 610, 128, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = RR_INK;
  g.stroke();
  g.lineWidth = 6;
  g.strokeStyle = "#ff3da8";
  g.beginPath();
  g.ellipse(0, 0, 585, 106, 0, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, 580, 102, 0, 0, Math.PI * 2);
  g.clip();
  g.translate(cx, cy + 90);
  for (let i = 0; i < 36; i++) {
    g.rotate((Math.PI * 2) / 36);
    g.fillStyle = i % 2 ? "rgba(255,180,61,0.32)" : "rgba(255,211,74,0.18)";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-60, -700);
    g.lineTo(60, -700);
    g.fill();
  }
  g.restore();
  wordmark(g, "Rocket Rings", cx + 40, cy + 54, 150, { fill: RR_RED, inner: CREAM, outer: RR_INK, rot: -0.04 });
  // little rocket ring flying off the "s"
  drawRingToy(g, cx - 500, cy - 10, 44, "#f2a03d");
  drawRingToy(g, cx + 520, cy - 40, 34, "#c97bd8");
  return tex(c, { repeat: [4, 1] });
}

function drawRingToy(g, x, y, s, col) {
  g.save();
  g.translate(x, y);
  g.lineWidth = s * 0.55;
  g.strokeStyle = RR_INK;
  g.beginPath();
  g.ellipse(0, 0, s, s * 0.78, 0.3, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = s * 0.38;
  g.strokeStyle = col;
  g.stroke();
  g.lineWidth = s * 0.1;
  g.strokeStyle = "rgba(255,255,255,0.8)";
  g.beginPath();
  g.ellipse(0, 0, s, s * 0.78, 0.3, 3.6, 4.6);
  g.stroke();
  g.restore();
}

/** Inside of the bowl: warm cream glaze, rim band at the top (v=1). */
export function bowlInner() {
  const [c, g] = canvas(1024, 512);
  const W = 1024, H = 512;
  const grd = g.createLinearGradient(0, H, 0, 0);
  grd.addColorStop(0, "#f6dc98");
  grd.addColorStop(1, "#fae7b4");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const r = rng(31);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(230,200,150,${r() * 0.07})`;
    g.beginPath();
    g.ellipse(r() * W, r() * H, 20 + r() * 50, 5 + r() * 12, 0, 0, Math.PI * 2);
    g.fill();
  }
  // milk line: a soft wet band at the bottom where the wall leaves the milk
  const ml = g.createLinearGradient(0, H, 0, H - 40);
  ml.addColorStop(0, "rgba(255,255,255,0.8)");
  ml.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = ml;
  g.fillRect(0, H - 40, W, 40);
  // rim band
  g.fillStyle = "#f2b53a";
  g.fillRect(0, 0, W, 30);
  g.fillStyle = "#3f9e94";
  g.fillRect(0, 30, W, 14);
  g.fillStyle = "#ff3da8";
  g.fillRect(0, 50, W, 4);
  return tex(c, { repeat: [8, 1] });
}

/** Milk surface: bright, faint concentric ripples, a few floating crumbs. */
export function milk() {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = "#ece9e1";
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = `rgba(190,200,215,${0.16 - i * 0.012})`;
    g.lineWidth = 10 - i * 0.6;
    g.beginPath();
    g.arc(512, 512, 150 + i * 42, 0, Math.PI * 2);
    g.stroke();
  }
  const sh = g.createRadialGradient(380, 380, 30, 512, 512, 520);
  sh.addColorStop(0, "rgba(255,255,255,0.35)");
  sh.addColorStop(1, "rgba(220,226,236,0.25)");
  g.fillStyle = sh;
  g.fillRect(0, 0, 1024, 1024);
  return tex(c, { wrap: false });
}

export const COLORS = { RR_RED, RR_INK, CREAM, BOX_BLUE };
