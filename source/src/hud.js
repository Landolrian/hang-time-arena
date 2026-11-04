import { tuning, defaults, saveTuning, resetTuning } from "./tuning.js";
import { settings, saveSettings } from "./settings.js";

// The broadcast HUD (STYLE.md section 7): Barlow Condensed italic, a chrome-bevelled plum
// scoreboard with bulb-matrix digits, a Shrikhand station bug, striped lower-thirds and big
// team-colour show cards for the jackpot, the round result and the match winner.
//
// update(data, dt) reads main.js's per-frame data. The optional `data.show` object carries the
// show beats (round result, killer, bleed-out, revive, spectating, prize marker, first-round
// start card); without it the HUD falls back to what it can work out from the rest. Every DOM
// write goes through a cache, so nothing is rewritten unless it changed.

const TEAM = {
  rockets: { name: "ROCKETS", plate: "#E8242C", text: "#FF5A5F", dark: "#7A0E16" },
  comets: { name: "COMETS", plate: "#1F5BFF", text: "#6E9BFF", dark: "#0B2380" },
};
const other = (team) => (team === "rockets" ? "comets" : "rockets");
const REASON = {
  bank: (team) => `BANKED THE JACKPOT`,
  wipe: (team) => `WIPED OUT THE ${TEAM[other(team)].name}`,
  sudden: () => "SUDDEN DEATH CLAIM",
  time: () => "HELD THE PRIZE AT THE BUZZER",
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clockText = (s) => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const DEBUG = new URLSearchParams(location.search).has("debug");

// ---- bulb-matrix digits (5x7) ----
const GLYPHS = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["0", "0", "1", "0", "1", "0", "0"],
  "-": ["000", "000", "000", "111", "000", "000", "000"],
  " ": ["00", "00", "00", "00", "00", "00", "00"],
};
function drawBulbs(canvas, text, pitch, lit) {
  const glyphs = [...text].map((c) => GLYPHS[c] ?? GLYPHS[" "]);
  const cols = glyphs.reduce((n, g) => n + g[0].length + 1, -1);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = cols * pitch + pitch, h = 7 * pitch + pitch;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const g = canvas.getContext("2d");
  g.scale(dpr, dpr);
  const r = pitch * 0.36;
  let x0 = pitch / 2;
  for (const glyph of glyphs) {
    for (let row = 0; row < 7; row++) for (let col = 0; col < glyph[0].length; col++) {
      const on = glyph[row][col] === "1", cx = x0 + col * pitch + pitch / 2, cy = pitch + row * pitch;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
      if (on) {
        g.shadowColor = lit; g.shadowBlur = pitch * 0.9;
        const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
        grad.addColorStop(0, "#fffbe8"); grad.addColorStop(0.45, lit); grad.addColorStop(1, lit);
        g.fillStyle = grad;
      } else { g.shadowBlur = 0; g.fillStyle = "rgba(255,240,220,0.07)"; }
      g.fill();
    }
    x0 += (glyph[0].length + 1) * pitch;
  }
}

export function createHUD() {
  const query = new URLSearchParams(location.search);
  const bowl = query.get("map") === "bowl" || query.get("mode") === "team";
  const root = document.createElement("div");
  root.id = "hud";
  root.innerHTML = `<div id="low-hp"></div><div id="damage-vignette"><div id="damage-direction"></div></div>
<div id="brand"><b>Hang Time!</b><span>${bowl ? "BREAKFAST BOWL" : "PRACTICE ROOM"}</span></div>
<div id="jackpot-hud" hidden><div class="board"><div class="team-plate rockets"><span class="you">YOU</span>ROCKETS</div><div class="score rockets"></div><div class="clock"><small></small><canvas></canvas></div><div class="score comets"></div><div class="team-plate comets"><span class="you">YOU</span>COMETS</div></div><div class="board-sub"><div class="roster rockets"></div><div class="holder"></div><div class="roster comets"></div></div></div>
<div id="kill-feed"></div><div id="prize-marker" hidden><i></i></div>
<div id="crosshair"><i class="tick t"></i><i class="tick b"></i><i class="tick l"></i><i class="tick r"></i><i class="dot"></i><div id="hook-pips"></div><div id="hitmarker"></div></div>
<div id="callout"></div><div id="flash"></div><div id="tug-progress"></div><div id="tug-label"></div>
<div id="eliminated"></div><div id="killer"></div><div id="break-banner"></div>
<div id="stats"><div id="health"><div class="hp-row"><b>HP</b><span class="hp-num"></span></div><div class="hp-bar"><i></i></div></div><div id="speed"></div><div id="movement-state"></div><div id="hook"></div><div id="whip-window"></div><div id="ammo"></div></div>
<div id="controls" hidden></div><div id="inputs" aria-label="Held inputs"></div><div id="prompt"></div><div id="start-card" hidden></div><div id="winner-screen"></div>
<div id="panel"><header>FEEL TUNING <button id="reset">RESET DEFAULTS</button></header><div id="sliders"></div></div><div id="popups"></div>`;
  document.body.append(root);
  const $ = (s) => root.querySelector(s),
    sliders = $("#sliders");
  // ---- cached writes ----
  const cache = new Map();
  const html = (el, value) => { if (cache.get(el) !== value) { cache.set(el, value); el.innerHTML = value; } };
  const text = (el, value) => { const k = `t:${value}`; if (cache.get(el) !== k) { cache.set(el, k); el.textContent = value; } };
  const styleKeys = new WeakMap();
  const style = (el, prop, value) => {
    let m = styleKeys.get(el); if (!m) styleKeys.set(el, (m = {}));
    if (m[prop] !== value) { m[prop] = value; el.style[prop] = value; }
  };
  const show = (el, on) => { if (el.hidden === on) el.hidden = !on; };
  const cls = (el, name, on) => { if (el.classList.contains(name) !== on) el.classList.toggle(name, on); };
  const bulbCache = new WeakMap();
  const bulbs = (canvas, value, pitch, lit) => { const k = `${value}|${pitch}|${lit}`; if (bulbCache.get(canvas) !== k) { bulbCache.set(canvas, k); drawBulbs(canvas, value, pitch, lit); } };

  // ---- the developer tuning panel (T) ----
  const important = [
    "playerHealth", "healthRegenDelay", "healthRegenRate",
    "tugTime", "snatchTime", "jackpotTime", "snatchFloor", "bankTarget", "breakTime", "roundTime", "reviveTime", "botSkill",
    "gravity", "groundAccel", "airAccel", "groundSpeed", "friction", "jumpSpeed",
    "wallJumpOut", "wallJumpUp", "wallJumpCoyote", "wallJumpBonus", "mantleHeight", "mantleTime",
    "slideFriction", "slideBoost", "carveStrength", "carveSpeedCost",
    "hookSpeed", "hookRange", "pullAccel", "pullDuration", "attachKick", "pullReleaseDistance",
    "grappleJumpBoost", "grappleJumpPop", "aimForgiveness", "swingSteer", "releaseBoost", "zipAccel", "zipSpeed",
    "yankSpeed", "hookCharges", "chargeTime", "sensitivity", "heldSensitivity", "attachFov", "swingTilt",
    "whipReach", "whipAngle", "whipCooldown", "whipBase", "whipSpeedDamage", "cancelTime",
    "gunDamage", "gunSpreadSlow", "gunSpreadFast", "gunVsDiver", "gunRate", "speedFov", "baseFov",
  ];
  function populate() {
    sliders.innerHTML = "";
    const toggle = document.createElement("label");
    toggle.innerHTML = `<span>Unlimited hooks</span><input type="checkbox" ${tuning.unlimitedHooks ? "checked" : ""}>`;
    toggle.querySelector("input").onchange = (event) => {
      tuning.unlimitedHooks = event.target.checked;
      saveTuning();
    };
    sliders.append(toggle);
    for (const k of important) {
      let def = defaults[k],
        max = def === 0 ? 2 : def * 3,
        step = k === "sensitivity" ? 0.0001 : def < 3 ? 0.01 : 0.1;
      if (k === "hookCharges") { step = 1; max = 6; }
      if (k === "heldSensitivity") max = 2;
      if (k === "botSkill") max = 1;
      if (k === "whipAngle") max = 180;
      const row = document.createElement("label");
      row.innerHTML = `<span>${k.replace(/([A-Z])/g, " $1").toUpperCase()}</span><input type="range" min="${k === "hookCharges" ? 1 : 0}" max="${max}" step="${step}" value="${tuning[k]}"><output>${tuning[k]}</output>`;
      const input = row.querySelector("input");
      input.oninput = () => {
        tuning[k] = +input.value;
        row.querySelector("output").textContent = input.value;
        saveTuning();
      };
      sliders.append(row);
    }
  }
  populate();
  $("#reset").onclick = () => {
    resetTuning();
    populate();
  };

  // ---- held-keys display (off by default; Settings > Input display) ----
  const inputLabels = [["forward", "W"], ["left", "A"], ["back", "S"], ["right", "D"],
    ["jump", "SPACE"], ["slide", "SHIFT"], ["fire", "LMB"], ["hook", "RMB"], ["whip", "E"], ["yank", "Q"]];
  for (const [name, label] of inputLabels) {
    const key = document.createElement("span");
    key.dataset.input = name; key.textContent = label;
    $("#inputs").append(key);
  }

  // ---- controls list (H), from the live key bindings ----
  const keyName = (code) => ({ Mouse0: "LMB", Mouse1: "MMB", Mouse2: "RMB", Space: "SPACE", ShiftLeft: "SHIFT", ShiftRight: "SHIFT", ControlLeft: "CTRL", AltLeft: "ALT", Tab: "TAB" }[code] ?? code.replace(/^Key|^Digit/, "").toUpperCase());
  const bound = (action) => [...new Set((settings.bindings[action] ?? []).map(keyName))].join("/");
  const controlRows = () => [
    [["forward", "left", "back", "right"].map(bound).join(" "), "move"], [bound("jump"), "jump"], [bound("slide"), "slide"],
    [bound("hook"), "grapple"], [bound("fire"), "fire"], [bound("reload"), "reload"], [bound("whip"), "whip"], [bound("melee"), "kick"], [bound("yank"), "yank"],
    [bound("camera"), "camera"], [bound("shoulder"), "shoulder"], ["ESC", "settings"], ["H", "hide this"],
  ];
  const controlsHTML = () => `<b>CONTROLS</b>${controlRows().map(([k, v]) => `<div><kbd>${esc(k)}</kbd><span>${v}</span></div>`).join("")}`;

  // ---- transient state ----
  let flashTime = 0, flashPending = null, calloutTime = 0, hitTime = 0, damageTime = 0;
  let lastCharges = null, missWatch = 0, missLatched = false, missTime = 0, lastPhase = null;
  let names = new Map(), visitedBowl = false;
  const flash = $("#flash"), callout = $("#callout");
  function banner(kind, lines, team, seconds = 1.6) {
    flashPending = null;
    const color = team ? TEAM[team] : null;
    html(flash, `<div class="plate ${kind}" style="${color ? `--team:${color.plate};--team-dark:${color.dark}` : ""}">${lines.map((l, i) => `<div class="${i ? "sub" : "main"}">${esc(l)}</div>`).join("")}</div>`);
    flash.className = `show ${kind}`;
    flashTime = seconds;
  }
  function call(textValue, kind = "stunt", seconds = 1.1) {
    html(callout, `<span class="${kind}">${esc(textValue)}</span>`);
    callout.className = "show";
    calloutTime = seconds;
    // restart the pop-in animation
    void callout.offsetWidth;
  }
  function hitmark(kind, seconds = 0.15) {
    hitTime = seconds;
    $("#hitmarker").className = kind;
  }
  const colorNames = (line) => esc(line).replace(/#(\d+)|\bYOU\b|\b(ROCKETS|COMETS)\b/g, (m, n, team) => {
    const t = team ? team.toLowerCase() : n ? names.get(`#${n}`) : "rockets";
    return t ? `<b style="color:${TEAM[t].text}">${m}</b>` : m;
  });

  let lastData = null;
  return {
    update(s, dt) {
      lastData = s;
      // window.__hudShow (tests only) fakes show beats the test API cannot reach.
      const j = s.jackpot, sh = window.__hudShow ? { ...(s.show ?? {}), ...window.__hudShow } : s.show ?? {}, phase = j?.phase ?? "active";
      const myTeam = sh.team ?? "rockets";
      const status = s.status ?? "alive";
      names = new Map([["#7", myTeam], ...s.statuses.filter((p) => p.name).map((p) => [p.name, p.team])]);
      const live = !j || phase === "active";
      const waiting = !!sh.waiting;

      // ---- top: station bug + scoreboard ----
      const board = $("#jackpot-hud");
      show(board, !!j && phase !== "winner" && !waiting);
      if (j) {
        const target = tuning.bankTarget || 4;
        const pips = (team) => Array.from({ length: target }, (_, i) => `<i class="${i < j.score[team] ? "on" : ""}"></i>`).join("");
        html($(".score.rockets"), pips("rockets"));
        html($(".score.comets"), pips("comets"));
        cls($(".team-plate.rockets"), "mine", myTeam === "rockets");
        cls($(".team-plate.comets"), "mine", myTeam === "comets");
        text($(".clock small"), j.suddenDeath ? "SUDDEN DEATH" : `ROUND ${j.number}`);
        const clockLow = phase === "active" && j.roundTimer <= 10;
        bulbs($(".clock canvas"), clockText(phase === "active" || phase === "countdown" ? j.roundTimer : 0), 3.4, clockLow ? "#FF5A5F" : "#FFE14D");
        const roster = (team) => s.statuses.filter((p) => p.team === team)
          .map((p, i) => `<i class="${p.status}${p === s.statuses[0] && bowl ? " me" : ""}"></i>`).join("");
        html($(".roster.rockets"), roster("rockets"));
        html($(".roster.comets"), roster("comets"));
        const holder = $(".holder");
        if (phase !== "active") html(holder, "");
        else if (j.suddenDeath) html(holder, `<span class="sd">SUDDEN DEATH · NEXT CLAIM WINS</span>`);
        else if (j.holder) html(holder, `<span class="held" style="--team:${TEAM[j.holder].plate}">${j.guarded ? `${TEAM[j.holder].name} HOLD THE JACKPOT` : "UNGUARDED"}</span><b>${clockText(j.clock)}</b>`);
        else html(holder, `<span>JACKPOT UNCLAIMED</span>`);
      }

      // ---- first-round start card ----
      const card = $("#start-card");
      show(card, waiting);
      if (waiting) {
        const team = TEAM[myTeam], foe = TEAM[other(myTeam)];
        html(card, `<div class="card"><div class="kicker">TONIGHT ON</div><div class="logo">Hang Time!</div>
<div class="team-chip" style="--team:${team.plate}">YOU'RE ON THE ${team.name}</div>
<p>Hook the <em>golden prize</em> in the middle of the bowl and keep your rope on it to claim it. Hold it until your clock runs out, or knock out every ${esc(foe.name.charAt(0) + foe.name.slice(1, -1).toLowerCase())}. First to ${tuning.bankTarget || 4} rounds wins.</p>
<div class="keys">${controlRows().slice(0, 9).map(([k, v]) => `<div><kbd>${esc(k)}</kbd><span>${v}</span></div>`).join("")}</div>
<div class="go">${query.get("mode") === "team" ? "WAITING FOR HOST TO START" : "CLICK TO PLAY"}</div></div>`);
      }

      // ---- round break, countdown, winner ----
      const result = sh.result ?? ((phase === "break" || phase === "winner") && j?.winner ? { team: j.winner } : null);
      const breakBanner = $("#break-banner");
      if (j && phase === "break" && result) {
        const team = TEAM[result.team];
        const reason = REASON[result.reason]?.(result.team) ?? "";
        html(breakBanner, `<div class="card"><div class="kicker">COMMERCIAL BREAK</div>
<div class="result" style="--team:${team.plate};--team-dark:${team.dark}">${team.name} TAKE ROUND ${j.number}</div>${reason ? `<div class="reason">${esc(reason)}</div>` : ""}
<div class="tally"><span style="color:${TEAM.rockets.text}">ROCKETS</span><b>${j.score.rockets} — ${j.score.comets}</b><span style="color:${TEAM.comets.text}">COMETS</span></div>
<div class="back">BACK IN <span></span></div></div>`);
        text(breakBanner.querySelector(".back span"), String(Math.max(1, Math.ceil(j.timer))));
        cls(breakBanner, "countdown", false);
      } else if (j && phase === "countdown" && !waiting) {
        html(breakBanner, `<div class="live"><small>ROUND ${j.number}</small><span>LIVE IN</span><canvas></canvas></div>`);
        bulbs(breakBanner.querySelector("canvas"), String(Math.max(1, Math.ceil(j.timer))), 9, "#FFE14D");
        cls(breakBanner, "countdown", true);
      } else html(breakBanner, "");
      const winner = $("#winner-screen");
      if (j && phase === "winner") {
        const w = j.winner ?? result?.team ?? myTeam, team = TEAM[w];
        html(winner, `<div class="card"><div class="logo">Hang Time!</div><div class="kicker">AND THE WINNER IS</div>
<div class="result" style="--team:${team.plate};--team-dark:${team.dark}">${team.name} WIN HANG TIME!</div>
<div class="tally"><span style="color:${TEAM.rockets.text}">ROCKETS</span><b>${j.score.rockets} — ${j.score.comets}</b><span style="color:${TEAM.comets.text}">COMETS</span></div>
<div class="go">ENTER · PLAY AGAIN</div></div>`);
      } else html(winner, "");
      // Show banners belong to live play; the break and winner cards take over from them.
      if (phase !== "active" && j) { flashPending = null; if (flashTime > 0) flashTime = 0.0001; }
      lastPhase = phase;

      // ---- player block ----
      const playing = live && status !== "eliminated" && !waiting;
      show($("#stats"), playing);
      cls(root, "hide-aim", !playing || status === "knocked");
      const hpFrac = sh.hpFrac ?? (s.hp == null ? 1 : status === "alive" ? s.hp / (tuning.playerHealth || 150) : 0);
      const health = $("#health");
      show(health, s.hp != null && status === "alive");
      if (s.hp != null) {
        text(health.querySelector(".hp-num"), String(Math.ceil(s.hp)));
        const bar = health.querySelector(".hp-bar i");
        style(bar, "width", `${Math.round(Math.max(0, Math.min(1, hpFrac)) * 1000) / 10}%`);
        cls(health, "warn", hpFrac < 0.5);
        cls(health, "danger", hpFrac < 0.25);
      }
      cls($("#low-hp"), "on", !!j && playing && status === "alive" && hpFrac < 0.3);
      html($("#speed"), `${Math.round(s.speed)}<small>M/S</small>`);
      text($("#movement-state"), DEBUG ? s.state : "");
      const charges = Math.max(0, s.charges), max = s.maxCharges;
      html($("#hook"), `<b>HOOK</b>${Array.from({ length: max }, (_, i) => `<i class="${i < charges ? "on" : ""}"></i>`).join("")}`);
      text($("#whip-window"), sh.whipCancel ? `PRESS ${bound("melee")} TO CHAIN` : "");
      const reloading = /RELOAD/.test(s.ammo);
      const [inMag, magSize] = String(s.ammo).split("/").map((x) => esc(x.trim()));
      html($("#ammo"), reloading ? `<b>AMMO</b><span class="reload">RELOADING</span>` : `<b>AMMO</b><span>${inMag}${magSize ? `<small>/${magSize}</small>` : ""}</span>`);
      for (const key of $("#inputs").children) cls(key, "held", s.keys.has(key.dataset.input));

      // ---- crosshair and hook pips ----
      const cross = $("#crosshair");
      style(cross, "color", s.aim === "dummy" ? "#FF3D5A" : s.aim === "world" ? "#FFE14D" : "#FFF4E0");
      style(cross, "opacity", s.aim === "out" ? "0.35" : "1");
      const pips = $("#hook-pips");
      while (pips.children.length < max) pips.append(document.createElement("span"));
      while (pips.children.length > max) pips.lastChild.remove();
      [...pips.children].forEach((pip, i) => {
        cls(pip, "ready", i < charges);
        style(pip, "--progress", `${i === charges ? Math.round(s.rechargeProgress * 360) : 0}deg`);
      });
      // A throw that never catches: the charge is spent, so say so on the pips.
      if (lastCharges !== null && charges < lastCharges && !/HOOKED|ZIP|MANTLE/.test(s.state)) { missWatch = 0.45; missLatched = false; }
      if (missWatch > 0) {
        if (/HOOKED|ZIP|MANTLE/.test(s.state) || sh.revive || status !== "alive") missWatch = 0;
        else if ((missWatch -= dt) <= 0 && !missLatched) { missLatched = true; missTime = 0.6; call("NO ANCHOR", "miss", 0.7); }
      }
      lastCharges = charges;
      missTime = Math.max(0, missTime - dt);
      cls(pips, "miss", missTime > 0);
      hitTime = Math.max(0, hitTime - dt);
      style($("#hitmarker"), "opacity", hitTime > 0 ? "1" : "0");

      // ---- prize marker (until the player has been in the bowl) ----
      // The marker guides a newcomer to the bowl: it retires once the player has stood in it.
      const me = bowl ? s.statuses[0]?.pos : null;
      if (me && Math.hypot(me.x, me.z) < 20 && me.y < 3) visitedBowl = true;
      const prize = visitedBowl ? null : sh.prize, marker = $("#prize-marker");
      show(marker, !!prize && playing);
      if (prize && playing) {
        const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2;
        let x = prize.x, y = prize.y;
        if (prize.behind) { x = cx - (x - cx); y = cy + Math.abs(y - cy) + 1; }
        const inset = 56, edge = !prize.onScreen || prize.behind;
        if (edge) {
          const dx = x - cx, dy = y - cy, k = Math.min((W / 2 - inset) / Math.abs(dx || 1e-6), (H / 2 - inset) / Math.abs(dy || 1e-6));
          x = cx + dx * Math.min(k, 1e6); y = cy + dy * Math.min(k, 1e6);
        }
        cls(marker, "edge", edge);
        style(marker, "transform", `translate(${Math.round(x)}px, ${Math.round(y)}px)`);
        style(marker.firstChild, "transform", edge ? `rotate(${Math.atan2(y - cy, x - cx)}rad)` : "none");
      }

      // ---- knocked / eliminated / spectating ----
      const elim = $("#eliminated");
      const knocked = status === "knocked" && live;
      const out = status === "eliminated" && live;
      cls(document.body, "hud-knocked", knocked);
      if (knocked) {
        const bleed = sh.bleed ?? (s.hp ?? 0) / 2.5;
        const rev = sh.revive?.role === "revived" ? sh.revive : null;
        html(elim, `<div class="lower knocked"><div class="title">${rev ? `BEING REVIVED BY ${esc(rev.name)}` : "YOU'RE DOWN"}</div>
<div class="bleed"><span>BLEEDING OUT</span><b>${Math.max(0, Math.ceil(bleed))}</b></div><div class="bar"><i style="width:${Math.max(0, Math.min(1, bleed / 20)) * 100}%"></i></div>
<div class="hint">${rev ? "HANG ON…" : "CRAWL TO A TEAMMATE"}</div></div>`);
      } else if (out) {
        html(elim, `<div class="lower spectate"><div class="title">${sh.spectating ? `SPECTATING ${esc(sh.spectating)}` : "SPECTATING YOUR TEAM"}</div><div class="hint">CLICK FOR NEXT</div></div>`);
      } else html(elim, "");
      const killer = sh.killer, kill = $("#killer");
      if (killer && live && (knocked || out)) {
        const verb = killer.how === "fall" ? "WIPEOUT!" : killer.how === "bleed" ? "BLED OUT" : killer.how === "wipe" ? "TEAM WIPED OUT" : null;
        const team = TEAM[killer.team] ?? TEAM.comets;
        html(kill, verb ? `<span class="verb">${verb}</span>`
          : `<span>${out ? "ELIMINATED BY" : "KNOCKED BY"}</span><b style="--team:${team.plate}">${esc(killer.name)}</b>${killer.how === "whip" ? `<small>WHIP CRACK</small>` : killer.how === "zip" ? `<small>ZIP HIT</small>` : ""}`);
      } else html(kill, "");

      // ---- revive / tug ring ----
      const rev = sh.revive;
      const ring = $("#tug-progress"), ringLabel = $("#tug-label");
      if (live && rev && status === "alive") {
        style(ring, "background", `conic-gradient(#7CFFB0 ${Math.round(rev.progress * 360)}deg, rgba(255,255,255,0.14) 0)`);
        text(ringLabel, rev.role === "revived" ? "BEING REVIVED" : `REVIVING ${rev.name}`);
        style(ringLabel, "color", "#7CFFB0");
      } else if (live && j?.tug.team) {
        style(ring, "background", `conic-gradient(#FFE14D ${Math.round(j.tug.progress * 360)}deg, rgba(255,255,255,0.14) 0)`);
        text(ringLabel, j.holder ? "SNATCHING" : "CLAIMING");
        style(ringLabel, "color", "#FFE14D");
      } else { style(ring, "background", "none"); text(ringLabel, ""); }

      // ---- big messages and callouts ----
      if (flashPending && j) {
        const team = flashPending.team ?? j.holder ?? myTeam;
        if (flashPending.snatch) banner("jackpot", ["SNATCHED!", `${TEAM[team].name} STOLE THE JACKPOT`], team, 1.6);
        else banner("jackpot", ["JACKPOT!", `${TEAM[team].name} CLAIMED THE PRIZE`], team, 1.6);
      }
      flashPending = null;
      if (flashTime > 0) { flashTime -= dt; if (flashTime <= 0) { flash.className = ""; html(flash, ""); } }
      if (calloutTime > 0) { calloutTime -= dt; if (calloutTime <= 0) { callout.className = ""; html(callout, ""); } }
      damageTime = Math.max(0, damageTime - dt);
      style($("#damage-vignette"), "opacity", damageTime ? String(Math.min(1, damageTime * 2)) : "0");

      // ---- controls list and the click-to-play prompt ----
      const controls = $("#controls");
      show(controls, !!settings.showControls && !waiting);
      if (settings.showControls) html(controls, controlsHTML());
      const menuOpen = !document.getElementById("settings-menu")?.hidden;
      const prompt = $("#prompt");
      show(prompt, !document.pointerLockElement && !waiting && !menuOpen && phase !== "winner");
      text(prompt, "CLICK TO PLAY");
    },
    feed(message) {
      const line = document.createElement("div");
      line.innerHTML = colorNames(message.replace(/#7\b/g, "YOU"));
      const feed = $("#kill-feed");
      feed.append(line); while (feed.children.length > 5) feed.firstChild.remove();
      setTimeout(() => line.remove(), 6000);
      // Your own knock on an enemy: a bigger red hit marker.
      if (/(#7|\bYOU)\s+KNOCKED\b|KNOCKED\s+BY\s+(#7|YOU)\b/i.test(message)) hitmark("knock", 0.3);
    },
    damage(from, player, yaw) {
      damageTime = 0.7;
      const angle = Math.atan2(from.x - player.x, -(from.z - player.z)) + yaw;
      $("#damage-direction").style.transform = `rotate(${angle}rad)`;
    },
    hit(source) {
      hitmark(source === "stunt" ? "stunt" : source === "gun" ? "gun" : "melee");
    },
    message(t) {
      const msg = String(t), up = msg.toUpperCase();
      const team = /\bCOMETS\b/.test(up) ? "comets" : /\bROCKETS\b/.test(up) ? "rockets" : null;
      // The round result lives on the break card; your own knock and elimination on the lower third.
      if (/WIN(S)? THE ROUND|TAKE(S)? (THE )?ROUND/.test(up)) return;
      if (/^(YOU WERE )?KNOCKED!?$|^YOU('RE| ARE) DOWN/.test(up)) return;
      if (/^ELIMINATED #7$|^YOU WERE ELIMINATED|^WIPEOUT!?$/.test(up)) return;
      if (/SUDDEN DEATH/.test(up)) { banner("sudden", ["SUDDEN DEATH", "NEXT CLAIM WINS"], null, 2.2); return; }
      if (/SNATCH/.test(up)) { flashPending = { snatch: true, team }; if (!lastData?.jackpot) banner("jackpot", ["SNATCHED!"], team); return; }
      if (/JACKPOT|CLAIM/.test(up)) { flashPending = { snatch: false, team }; if (!lastData?.jackpot) banner("jackpot", ["JACKPOT!"], team); return; }
      // An enemy (or practice dummy) put out of the round: a gold confirm at the crosshair.
      if (/^ELIMINATED\b|\bELIMINATED$/.test(up)) {
        const who = /^ELIMINATED\s+(\S+)/.exec(up)?.[1];
        hitmark("elim", 0.35); call(who ? `${who} OUT` : up, "elim", 1.0); return;
      }
      // Small stunt callouts ("CLEAN RELEASE" and friends) pop under the crosshair.
      if (msg.length <= 24) { call(up, "stunt", 0.9); return; }
      banner("info", [up], team, 1.4);
    },
    popup(n, p, camera, source) {
      const v = p.clone().project(camera);
      if (v.z > 1) return;
      const el = document.createElement("div");
      el.className = source === "stunt" ? "popup stunt" : "popup";
      el.textContent = n;
      el.style.left = `${(v.x + 1) * 50}%`;
      el.style.top = `${(1 - v.y) * 50}%`;
      $("#popups").append(el);
      setTimeout(() => el.remove(), 800);
    },
    togglePanel() {
      const p = $("#panel");
      p.classList.toggle("open");
      if (p.classList.contains("open")) document.exitPointerLock();
    },
    toggleControls() {
      settings.showControls = !settings.showControls;
      saveSettings();
      const box = document.querySelector('#settings-options input[data-setting="showControls"]');
      if (box) box.checked = settings.showControls;
    },
  };
}
