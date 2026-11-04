import { logoCanvas } from "./textures.js";

// Bulb-matrix digits (5x7) drawn as little lamps: a classic game-show scoreboard.
const FONT = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};
function bulbDigits(str, color) {
  const cols = str.length * 6 - 1;
  const svg = [];
  const r = 3.1,
    p = 8;
  [...str].forEach((ch, ci) => {
    const rows = FONT[ch];
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 5; x++) {
        const on = rows[y][x] === "1";
        const cx = (ci * 6 + x) * p + p / 2,
          cy = y * p + p / 2;
        svg.push(
          `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${on ? color : "rgba(255,255,255,0.06)"}" ${on ? 'filter="url(#glow)"' : ""}/>`,
        );
      }
  });
  return `<svg class="bulbs" viewBox="0 0 ${cols * p} ${7 * p}" width="${cols * p}" height="${7 * p}">
    <defs><filter id="glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${svg.join("")}</svg>`;
}

function ratingsMeter(value) {
  // VU-style arc: FLOP .. SMASH, needle at `value` (0..1)
  const cx = 110,
    cy = 112,
    R = 86;
  const a0 = Math.PI * 1.17,
    a1 = Math.PI * 1.83;
  const ticks = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20,
      a = a0 + (a1 - a0) * t;
    const r0 = i % 5 === 0 ? R - 14 : R - 8;
    const hot = t > 0.72;
    ticks.push(
      `<line x1="${cx + Math.cos(a) * r0}" y1="${cy + Math.sin(a) * r0}" x2="${cx + Math.cos(a) * R}" y2="${cy + Math.sin(a) * R}" stroke="${hot ? "#ff3d6e" : "#2b2238"}" stroke-width="${i % 5 === 0 ? 3 : 1.6}"/>`,
    );
  }
  const arc = (r, t0, t1, col, w) => {
    const b0 = a0 + (a1 - a0) * t0,
      b1 = a0 + (a1 - a0) * t1;
    return `<path d="M ${cx + Math.cos(b0) * r} ${cy + Math.sin(b0) * r} A ${r} ${r} 0 0 1 ${cx + Math.cos(b1) * r} ${cy + Math.sin(b1) * r}" stroke="${col}" stroke-width="${w}" fill="none"/>`;
  };
  const na = a0 + (a1 - a0) * value;
  return `<svg viewBox="0 0 220 132" width="220" height="132">
    <defs>
      <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8"/><stop offset="1" stop-color="#f1d98e"/></linearGradient>
      <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.48" stop-color="#b7c0cf"/><stop offset="0.52" stop-color="#5d6b86"/><stop offset="1" stop-color="#dfe5ee"/></linearGradient>
    </defs>
    <rect x="3" y="3" width="214" height="126" rx="16" fill="url(#bezel)" stroke="#1b1220" stroke-width="3"/>
    <rect x="12" y="12" width="196" height="108" rx="9" fill="url(#face)" stroke="#1b1220" stroke-width="2"/>
    ${arc(R - 4, 0.72, 1, "#ff3d6e", 8)}
    ${arc(R - 4, 0, 0.72, "#2b2238", 1.5)}
    ${ticks.join("")}
    <text x="${cx + Math.cos(a0) * (R - 28)}" y="${cy + Math.sin(a0) * (R - 28) + 4}" class="vu-l">FLOP</text>
    <text x="${cx + Math.cos(a1) * (R - 30)}" y="${cy + Math.sin(a1) * (R - 30) + 4}" class="vu-l vu-hot" text-anchor="end">SMASH</text>
    <line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(na) * (R - 2)}" y2="${cy + Math.sin(na) * (R - 2)}" stroke="#1b1220" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="9" fill="#1b1220"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="#ff3da8"/>
  </svg>`;
}

export function buildHud(el) {
  const logo = logoCanvas(700, 280).toDataURL();
  el.innerHTML = `
  <div class="hud-tl">
    <img class="hud-logo" src="${logo}" alt="">
    <div class="live"><span class="dot"></span>LIVE</div>
  </div>
  <div class="hud-score">
    <div class="team red"><div class="tname">ROCKETS</div><div class="board">${bulbDigits("07", "#ffd04a")}</div></div>
    <div class="clock"><div class="clock-n">${bulbDigits("41", "#ff6a5a")}</div><div class="round">ROUND 2</div></div>
    <div class="team blue"><div class="tname">COMETS</div><div class="board">${bulbDigits("05", "#ffd04a")}</div></div>
  </div>
  <div class="hud-ratings">
    ${ratingsMeter(0.78)}
    <div class="ratings-cap"><span>RATINGS</span><b>38</b><i>SHARE</i></div>
  </div>
  <div class="hud-lower">
    <div class="lt-stripes"><i></i><i></i><i></i></div>
    <div class="lt-body">
      <div class="lt-name">CHUCK DEVANE</div>
      <div class="lt-role">"He's going for the toaster, Dottie!"</div>
    </div>
  </div>
  <div class="hud-bug">
    <div class="bug-ch">9</div>
    <div class="bug-txt">STEREO</div>
  </div>
  <div class="hud-help">1-4 cameras · drag to orbit · B toggles look</div>`;
}
