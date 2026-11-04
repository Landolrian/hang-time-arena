import * as THREE from "three";
import { moveBody } from "./world.js";
import { createContestant } from "./contestant.js";
import { tuning as t } from "./tuning.js";
import { bowlHeight } from "./maps/bowl-profile.js";

// ---------------------------------------------------------------------------
// Map knowledge. Coordinates are written for the Rockets (x < 0) and mirrored
// for the Comets. A node is [x, z] on the ground (height is derived from the
// bowl profile) or [x, y, z] for a perch or roof. Every walk edge is a straight
// line that bots can follow; a hook edge fires at an explicit ledge anchor.
// ---------------------------------------------------------------------------
const nodeData = {
  room: [-91, -6], doorN: [-91, -18], doorS: [-91, 18],
  tableN: [-62, -21], tableS: [-62, 21], frontN: [-47, -20], toastB: [-37, -17], toastW: [-48, -38.5],
  boxW: [-22, -39], boxSW: [-14, -33.5], boxLand: [0, -33.5], northMid: [0, -22], bowlN: [0, -13], bowlNW: [-8, -11],
  gateW: [-37, -2], rimN: [-27, -17], northRim: [-30, -9], rimC: [-31, 0], southRim: [-30, 9], rimS: [-27, 17],
  gateN: [-19, -19], gateS: [-19, 19], gapN: [-10, -10], gapS: [-10, 10], tugA: [-13, -5], tugC: [-10, 0], tugB: [-12, 5], bowlS: [-5, 13],
  frontS: [-44, 17], southW: [-50, 22], cartonB: [-40, 12], spoon: [0, 9.9, 9], spoonEnd: [-19, 9.9, 9], spoonFar: [19, 9.9, 9],
  toastTop: [-37, 13, -26], toaster: [-37, 13, -30], boxTop: [-6, 31, -40], box: [0, 31, -38.3],
  cartonTop: [-47, 25, 12], carton: [-51, 25, 12],
};
const walks = [
  ["room", "doorN"], ["room", "doorS"], ["doorN", "tableN"], ["doorS", "tableS"], ["tableN", "frontN"], ["frontN", "toastB"],
  ["frontN", "toastW"], ["toastW", "boxW"], ["boxW", "boxSW"], ["boxSW", "boxLand"], ["boxLand", "northMid"],
  ["frontN", "gateW"], ["cartonB", "gateW"], ["gateW", "rimC"],
  ["bowlN", "bowlNW"], ["bowlNW", "tugA"], ["tugA", "tugC"], ["tugC", "tugB"], ["tugB", "bowlS"],
  ["spoonEnd", "spoon"], ["spoon", "spoonFar"], ["tableS", "southW"], ["southW", "frontS"], ["frontS", "cartonB"],
  ["rimN", "northRim"], ["northRim", "rimC"], ["rimC", "southRim"], ["southRim", "rimS"], ["rimN", "gateN"],
  ["rimS", "gateS"], ["gateN", "gapN"], ["gapN", "bowlNW"], ["gateS", "gapS"], ["gapS", "bowlS"], ["toastTop", "toaster"], ["boxTop", "box"], ["cartonTop", "carton"],
];
// The table has gaps just outside the bowl's edge (r 34) except where |z| < 5 or |z| >= 32,
// so the only walk onto the rim from the table is through the west gate at z = -2.
// Directed: walking off an edge and falling safely to the ground below.
const drops = [["toastTop", "toastB"], ["boxTop", "boxW"], ["box", "boxLand"], ["cartonTop", "cartonB"], ["spoonEnd", "gateS"]];
// Directed ledge hooks: from a ground node to the roof it lands on.
const hooks = [
  { from: "toastB", to: "toastTop", anchor: [-37, 12, -25.2] },
  { from: "boxW", to: "boxTop", anchor: [-8.9, 30, -40] },
  { from: "cartonB", to: "cartonTop", anchor: [-46.1, 24, 12] },
  { from: "gateS", to: "spoonEnd", anchor: [-19, 9, 9] },
];
// A perch is a node a bot can stand on to watch something.
const perchNodes = { northGate: "gateN", southGate: "gateS", box: "box", toaster: "toaster", carton: "carton", northRim: "northRim", southRim: "southRim", spoon: "spoon", floor: "tugC" };
const tugNodes = ["tugA", "tugB", "tugC"];
const groundY = (x, z) => {
  return bowlHeight(x, z) + 0.9;
};
const rotation = ["box", "toaster", "carton", "northRim", "southRim", "spoon", "northGate", "southGate"];

// Exposed so tests can walk every edge of the graph.
export const navigation = { nodeData, walks, drops, hooks };

export function createBots(scene, world, callbacks) {
  const all = [], up = new THREE.Vector3(0, 1, 0);
  let paused = false, frozen = false, random = Math.random, holder = null, holderTime = 0, snatches = 0;
  const teamFocus = { rockets: null, comets: null };
  const tugDelay = { rockets: 0, comets: 0 };
  let snatchDelay = 6, flankSnatch = false;
  const setups = { rockets: null, comets: null }, plans = { rockets: 0, comets: 0 }, boxSeen = { rockets: 0, comets: 0 };
  const shots = [], d_now = { t: 0 };
  function seed(value) {
    let state = value >>> 0;
    random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }
  const falloff = (distance) => 1 - 0.4 * THREE.MathUtils.clamp((distance - 30) / 30, 0, 1);
  const ray = new THREE.Ray(), box = new THREE.Box3(), impact = new THREE.Vector3(), eyeA = new THREE.Vector3(), eyeB = new THREE.Vector3();
  function visible(from, to) {
    const delta = to.clone().sub(from), distance = delta.length();
    ray.set(from, delta.normalize());
    for (const b of world.boxes) {
      box.min.copy(b.min); box.max.copy(b.max);
      // The target's own box (e.g. the prize case) never blocks the view of it.
      if (box.containsPoint(to)) continue;
      const hit = ray.intersectBox(box, impact);
      if (hit && hit.distanceTo(from) > 0.15 && hit.distanceTo(from) < distance - 0.5) return false;
    }
    return !world.blockedBySlope?.(from, to);
  }
  const sees = (a, b) => visible(eyeA.copy(a).setY(a.y + 0.6), eyeB.copy(b).setY(b.y + 0.6));

  // --- Navigation graph, built once per side -------------------------------
  const graphs = {};
  for (const team of ["rockets", "comets"]) {
    const sign = team === "rockets" ? 1 : -1, pos = {}, links = {};
    for (const [id, [x, ...rest]] of Object.entries(nodeData)) {
      const z = rest[rest.length - 1], y = rest.length === 2 ? rest[0] : groundY(x, z);
      pos[id] = new THREE.Vector3(x * sign, y, z); links[id] = [];
    }
    const link = (a, b, kind, extra = {}) => links[a].push({ to: b, kind, cost: pos[a].distanceTo(pos[b]) + (kind === "hook" ? 20 : 0), ...extra });
    for (const [a, b] of walks) { link(a, b, "walk"); link(b, a, "walk"); }
    for (const [a, b] of drops) link(a, b, "walk");
    graphs[team] = { pos, links, hooks: hooks.map((h) => ({ ...h, anchor: new THREE.Vector3(h.anchor[0] * sign, h.anchor[1], h.anchor[2]) })) };
    for (const h of graphs[team].hooks) {
      const ledge = world.boxes.find((b) => Math.abs(b.max.y - h.anchor.y) < 0.2 && h.anchor.x >= b.min.x - 0.3 && h.anchor.x <= b.max.x + 0.3 && h.anchor.z >= b.min.z && h.anchor.z <= b.max.z);
      link(h.from, h.to, "hook", { ledge, anchor: h.anchor });
    }
  }
  function nearestNode(team, p) {
    let best = null, bestCost = Infinity;
    for (const [id, n] of Object.entries(graphs[team].pos)) {
      const cost = Math.hypot(n.x - p.x, n.z - p.z) + Math.abs(n.y - p.y) * 3;
      if (cost < bestCost) { best = id; bestCost = cost; }
    }
    return best;
  }
  // Dijkstra over a few dozen nodes; blocked edges (recent failures) are skipped.
  function findPath(d, from, goal, now) {
    const { links } = graphs[d.team], dist = { [from]: 0 }, prev = {}, open = new Set([from]), done = new Set();
    while (open.size) {
      let current = null;
      for (const id of open) if (current === null || dist[id] < dist[current]) current = id;
      open.delete(current); done.add(current);
      if (current === goal) break;
      for (const e of links[current]) {
        if (done.has(e.to) || d.blocked[`${current}>${e.to}`] > now) continue;
        const cost = dist[current] + e.cost;
        if (dist[e.to] === undefined || cost < dist[e.to]) { dist[e.to] = cost; prev[e.to] = current; open.add(e.to); }
      }
    }
    if (dist[goal] === undefined || !from) return null;
    const path = [goal];
    while (path[0] !== from && path.length < 80) path.unshift(prev[path[0]]);
    return path;
  }

  function add(team, number, role, index) {
    const group = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ visible: false });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.9, 4, 8), mat);
    body.position.y = 0.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), mat); head.position.y = 1.15;
    group.add(body, head); scene.add(group);
    const spawn = world.spawnPoints[team].clone().add(new THREE.Vector3(0, 0, (index - 1.5) * 2));
    // Personalities persist: the flanker is the diver, the rest are steadier shooters.
    const d = { name: `#${number}`, number, team, role, personality: role === "flanker" ? "diver" : "shooter", index, group, mat, pos: spawn.clone(), spawn, vel: new THREE.Vector3(), hp: t.playerHealth, status: "alive", knockedHp: 50, damageDelay: 0, dead: 0, flash: 0, displaced: 0, returning: false, state: "running", tug: 0, cooldown: 0, whipCooldown: 0, meleeCooldown: 0, meleeActive: 0, scan: index * 0.06, target: null, reaction: 0, grounded: true, hookTime: 0, facing: new THREE.Vector3(team === "rockets" ? 1 : -1, 0, 0), alert: 0, burst: 0, ammo: t.botMagazine, reload: 0, charges: t.hookCharges, recharge: 0, perch: null, hook: null, perches: new Set(), climbs: 0, localEnemies: 0 };
    resetNav(d);
    group.userData.dummy = body.userData.dummy = head.userData.dummy = d;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), new THREE.MeshBasicMaterial({ color: 0xffffdd }));
    scene.add(rope); d.rope = rope; rope.visible = false;
    createContestant(team === "rockets" ? "red" : "blue", number).then((visual) => {
      d.visual = visual; group.add(visual.model);
      visual.model.traverse((mesh) => {
        if (!mesh.isMesh) return;
        mesh.raycast = () => {};
        if (mesh.material.emissive) mesh.onBeforeRender = () => mesh.material.emissive.setHex(d.flash ? 0xff695f : 0);
      });
      if (team === "rockets") {
        // X-ray: a flat pink copy of the body (no gear), bound to the ally's own skeleton and
        // drawn only where something hides them (GreaterDepth). It draws after the world but
        // before the ally (renderOrder 1 vs 2), so the ally's own limbs and gear paint over it
        // and an ally in plain view looks normal. It stays in the opaque pass (no
        // `transparent`) so that order holds; CustomBlending still mixes it in.
        const src = visual.model.userData.bodyMesh;
        const xray = new THREE.MeshBasicMaterial({
          color: 0xff5555, opacity: 0.38, fog: false, depthTest: true, depthWrite: false, depthFunc: THREE.GreaterDepth,
          blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        });
        const ghost = new THREE.SkinnedMesh(src.geometry, xray);
        ghost.bind(src.skeleton, src.bindMatrix);
        Object.assign(ghost, { frustumCulled: false, renderOrder: 1, castShadow: false, receiveShadow: false, raycast: () => {} });
        ghost.userData.isOutline = true;
        visual.model.traverse((mesh) => { if (mesh.isMesh && mesh.renderOrder >= 0) mesh.renderOrder = 2; });
        src.parent.add(ghost);
      }
    });
    all.push(d); group.position.copy(d.pos);
  }
  ["tugger", "holder", "flanker"].forEach((role, i) => add("rockets", i + 1, role, i));
  ["tugger", "holder", "flanker", "tugger"].forEach((role, i) => add("comets", i + 12, role, i));
  const pool = all.slice();
  const humans = (player) => [player, ...(callbacks.players?.() || [])];
  function resetNav(d) {
    Object.assign(d, { order: { kind: "perch", name: "floor" }, goal: null, path: null, step: 0, blocked: {}, stuck: 0, stuckClock: 0.5, lastPos: d.pos.clone(), jumpClock: 0, sidestep: 0, sideDir: 1, orderTime: 0, quiet: 0, huntUntil: 0, huntCool: 0, huntGoal: null, retreatUntil: 0, retreatGoal: null, lastSeen: null, patience: 10 + d.index * 2.5, override: null, teleports: 0, manual: false, reviveTarget: null, reviveProgress: 0 });
    d.dbg = { goal: null, order: null, stuck: 0, teleports: 0 };
  }
  function reset(d) {
    d.meleeCooldown = 0; d.meleeActive = 0;
    d.fallCredit = 0; d.facing.set(0, 0, -1);
    d.hp = t.playerHealth; d.status = "alive"; d.knockedHp = 50; d.damageDelay = 0; d.dead = 0; d.deadTime = 0; d.pos.copy(d.spawn); d.vel.set(0, 0, 0); d.group.position.copy(d.pos);
    d.group.visible = true; d.rope.visible = false; d.tug = 0; d.target = null; d.hookTime = 0; d.state = "running"; d.alert = 0; d.burst = 0; d.ammo = t.botMagazine; d.reload = 0; d.charges = t.hookCharges; d.recharge = 0; d.hook = null; d.perch = null; d.displaced = 0;
    resetNav(d); setups.rockets = setups.comets = null; holder = null; holderTime = 0; snatches = 0;
  }
  function damage(d, amount, source = "gun", attacker = "#7") {
    if (d.dead || (source !== "ringout" && source !== "test" && world.inSpawn(d.pos, d.team))) return;
    if (source === "gun" && (d.state === "grappling" || d.vel.length() > 25)) amount *= t.gunVsDiver;
    d.flash = 0.15; d.alert = 2; d.damageDelay = t.healthRegenDelay;
    if (source === "whip" || source === "melee" || source === "zip" || source === "yank") { d.tug = 0; if (attacker === "#7" && source !== "yank") d.fallCredit = d_now.t + 3; }
    if (attacker === "#7") callbacks.hit(amount, d.pos, source === "gun" && (d.state === "grappling" || d.vel.length() > 25) ? "stunt" : source);
    if (source === "ringout") d.knockedHp = 0;
    else if (d.status === "knocked") d.knockedHp = Math.max(0, d.knockedHp - amount);
    else d.hp = Math.max(0, d.hp - amount);
    if (source === "ringout" || (d.status === "knocked" && d.knockedHp <= 0)) {
      d.status = "eliminated"; d.dead = 1; d.deadTime = 0; d.group.visible = source !== "ringout"; d.rope.visible = false; d.tug = 0; d.state = "dead";
      if (attacker === "#7") callbacks.kill(d.name, source);
      callbacks.feed(attacker === "TEAM WIPE" ? `${d.name} out (team wipe)` : source === "bleed" ? `${d.name} bled out` : source === "ringout" ? `${d.name} fell off the set` : `${attacker} eliminated ${d.name}`);
    } else if (d.status === "alive" && d.hp <= 0) {
      d.status = "knocked"; d.knockedHp = 50; d.tug = 0; d.reviveTarget = null; d.hook = null;
      callbacks.feed(`${attacker} ${source === "melee" ? "kicked" : "knocked"} ${d.name}`);
    }
  }
  function revive(d, reviver) {
    if (d.status !== "knocked") return;
    d.status = "alive"; d.hp = 40; d.knockedHp = 50; d.damageDelay = t.healthRegenDelay;
    callbacks.feed(`${reviver} revived ${d.name}`);
  }

  function ropeTo(d, target, color) {
    const start = d.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), segment = target.clone().sub(start);
    d.rope.visible = true; d.rope.material.color.setHex(color); d.rope.position.copy(start).addScaledVector(segment, 0.5);
    d.rope.scale.set(1, segment.length(), 1); if (segment.lengthSq()) d.rope.quaternion.setFromUnitVectors(up, segment.normalize());
  }

  // --- Team director: picks a setup each round and a job for each bot -----
  function rollSetup() {
    const pick = (list) => list[Math.floor(random() * list.length)];
    return { high: random() < 0.7 ? "box" : "toaster", diver: pick(["carton", "toaster", "spoon", "southRim"]), support: pick(["northRim", "southRim", "carton", "toaster"]), rim: random() < 0.5 ? "northRim" : "southRim", tug: random() < 0.5 ? "tugA" : "tugB" };
  }
  function direct(team, match, player, now) {
    const mates = all.filter((a) => a.team === team && a.status === "alive");
    const foes = [...all, ...humans(player)].filter((a) => a.team !== team && a.status === "alive").length;
    const ours = mates.length + humans(player).filter(a => a.team === team && a.status === "alive").length;
    const setup = setups[team] ||= { ...rollSetup(), delay: random() * 5 };
    if (!tugDelay[team]) tugDelay[team] = now + setup.delay;
    const sudden = match.suddenDeath, held = match.holder, clock = match.clock;
    let mode;
    if (held === team) mode = "defend";
    else if (!held) mode = ours >= foes || sudden || match.roundTimer < 100 ? "push" : "hold";
    // Wait a while after each claim before trying a snatch, so the prize doesn't ping-pong.
    else mode = holderTime > snatchDelay && (ours >= foes || clock < 12) ? "push" : "hold";
    // The Box is contested when the enemy was seen on it and nobody of ours is.
    const ownBox = mates.some((a) => a.pos.y > 25 && Math.abs(a.pos.x) < 12 && a.pos.z < -34) || (team === "rockets" && player.pos.y > 25 && Math.abs(player.pos.x) < 12 && player.pos.z < -34);
    const boxContested = boxSeen[team] > 0 && !ownBox;
    const helpers = mates.filter((a) => a.index !== 0 && a.role !== "tugger");
    for (const d of mates) {
      if (d.manual) continue;
      let order;
      const entry = d.role === "tugger";
      if (mode === "defend" && d === mates[0]) order = { kind: "perch", name: "floor" };
      else if (mode === "push" && held && flankSnatch && d.role === "flanker" && now >= tugDelay[team]) order = { kind: "tug", node: "tugB" };
      else if (mode === "push" && entry && !(held && flankSnatch) && now >= tugDelay[team]) order = { kind: "tug", node: d.index === 0 ? setup.tug : "tugB" };
      else if (mode === "push" && d.personality === "diver") order = { kind: "perch", name: "floor" };
      else if (entry) order = { kind: "perch", name: (d.index === 0) === (setup.rim === "northRim") ? "northGate" : "southGate" };
      else if (d.personality === "diver") order = { kind: "perch", name: setup.diver };
      else order = { kind: "perch", name: setup.high };
      if (boxContested && order.kind === "perch" && d === helpers[helpers.length - 1] && order.name !== "box" && !d.override) d.override = { name: "box", until: now + 25 };
      // Quiet bots rotate to a new perch so nobody sits idle all round.
      if (d.override && d.override.until > now && order.kind === "perch") order = { kind: "perch", name: d.override.name };
      else if (order.kind === "perch" && order.name !== "floor" && d.quiet > d.patience) {
        const options = rotation.filter((name) => name !== order.name && name !== d.override?.name && !mates.some((m) => m !== d && m.perch === name));
        d.override = { name: options[Math.floor(random() * options.length)] || "floor", until: now + 24 };
        d.quiet = 0; d.patience = (d.personality === "diver" ? 7 : 11) + random() * 6;
        order = { kind: "perch", name: d.override.name };
      }
      // Keep a fresh post for a few seconds so a bot doesn't dither between two goals.
      const key = (o) => `${o.kind}:${o.name || o.node}`;
      if (key(order) !== key(d.order)) {
        if (d.order.kind === "perch" && order.kind === "perch" && now - d.orderTime < 3) order = d.order; else d.orderTime = now;
      }
      if (mode === "defend" && d === mates[0]) order = { kind: "perch", name: "floor" };
      if (order.kind === "perch" && order.name !== "floor" && mates.some((m) => m !== d && m.order?.kind === "perch" && m.order.name === order.name && m.index < d.index)) order = { kind: "perch", name: rotation.find((name) => !mates.some((m) => m !== d && m.order?.name === name)) || "floor" };
      d.order = order; d.mode = mode;
    }
    // Revives come first: the closest healthy ally with no threat in view goes to help.
    const downed = [...all, ...humans(player)].filter((a) => a.team === team && a.status === "knocked");
    for (const ally of downed) {
      const helper = mates.filter((m) => !m.localEnemies && m.order.kind !== "tug" && m.pos.distanceTo(ally.pos) < 70).sort((a, b) => a.pos.distanceToSquared(ally.pos) - b.pos.distanceToSquared(ally.pos))[0];
      if (helper && !all.some((b) => b.team !== team && b.status === "alive" && b.pos.distanceTo(ally.pos) < 20 && sees(b.pos, ally.pos))) helper.order = { kind: "node", node: nearestNode(team, ally.pos) };
    }
  }

  // --- Movement helpers ------------------------------------------------------
  function finishHook(d, success, edge) {
    d.hook = null;
    if (success && edge) { d.climbs++; d.step++; }
    if (!success) d.blocked[`${d.path?.[d.step - 1]}>${d.path?.[d.step]}`] = d.now + 8, d.path = null;
  }
  function startHook(d, ledge, anchor, edge) {
    const distance = d.pos.distanceTo(anchor);
    if (d.charges <= 0 || distance > t.hookRange || !visible(d.pos, anchor)) return false;
    d.charges--; d.hook = { ledge, anchor, travel: distance / t.hookSpeed, time: 0, edge };
    return true;
  }
  function runHook(d, dt) {
    const h = d.hook; h.time += dt; h.travel -= dt; d.state = "grappling"; ropeTo(d, h.anchor, 0xffffdd);
    if (h.travel <= 0) {
      const b = h.ledge, dx = d.pos.x - THREE.MathUtils.clamp(d.pos.x, b.min.x, b.max.x), dz = d.pos.z - THREE.MathUtils.clamp(d.pos.z, b.min.z, b.max.z);
      if (Math.hypot(dx, dz) < 0.7 && d.pos.y - 0.9 < b.max.y) {
        d.state = "climbing";
        const rise = b.max.y + 1 - d.pos.y;
        d.vel.y = Math.min(t.ledgeClimbSpeed, Math.sqrt(200 * Math.max(0, rise)), 20 * Math.max(0, rise));
      } else d.vel.addScaledVector(h.anchor.clone().add(new THREE.Vector3(0, 1, 0)).sub(d.pos).normalize(), t.pullAccel * dt);
      if (d.vel.length() > 28) d.vel.setLength(28);
      if (d.pos.y - 0.9 >= b.max.y) {
        const inward = new THREE.Vector3((b.min.x + b.max.x) / 2 - d.pos.x, 0, (b.min.z + b.max.z) / 2 - d.pos.z).normalize();
        d.vel.x = inward.x * 6; d.vel.z = inward.z * 6;
        finishHook(d, true, h.edge);
      }
    }
    if (d.hook && h.time > 4) finishHook(d, false, h.edge);
  }
  function steer(d, dest, dt, speed = 10) {
    const diff = dest.clone().sub(d.pos), horizontal = Math.hypot(diff.x, diff.z), blend = Math.min(1, dt * 8);
    let wx = horizontal ? diff.x / horizontal * speed : 0, wz = horizontal ? diff.z / horizontal * speed : 0;
    // A recovering bot slides sideways around whatever it is pushing against.
    if (d.sidestep > 0) { const px = -wz * 0.8 * d.sideDir; wz = wx * 0.8 * d.sideDir; wx = px; }
    d.vel.x += (wx - d.vel.x) * blend; d.vel.z += (wz - d.vel.z) * blend;
    if (d.grounded && diff.y > 1 && horizontal < 5) d.vel.y = t.jumpSpeed;
  }
  // Escape hook: the nearest roof edge in front of a bot that can't get anywhere.
  function escapeHook(d) {
    let best = null, bestScore = Infinity;
    for (const b of world.boxes) {
      if (b.mesh.userData.hookable === false || b.max.y < d.pos.y + 1.5 || b.max.y > d.pos.y + 25) continue;
      const anchor = new THREE.Vector3(THREE.MathUtils.clamp(d.pos.x, b.min.x + 0.1, b.max.x - 0.1), b.max.y, THREE.MathUtils.clamp(d.pos.z, b.min.z + 0.1, b.max.z - 0.1));
      const score = anchor.distanceTo(d.pos);
      if (score < bestScore && score < 35) { best = { ledge: b, anchor }; bestScore = score; }
    }
    return best && startHook(d, best.ledge, best.anchor, false);
  }
  function unstick(d, dt) {
    // Sample progress twice a second while the bot is trying to travel.
    d.stuckClock -= dt;
    if (d.stuckClock > 0) return;
    d.stuckClock = 0.5;
    // Falling or climbing counts as progress; hopping on the spot does not.
    const moved = Math.hypot(d.pos.x - d.lastPos.x, d.pos.z - d.lastPos.z) + (Math.abs(d.pos.y - d.lastPos.y) > 3 ? 9 : 0);
    d.lastPos.copy(d.pos);
    if (d.state !== "running" || d.hook || moved > 1.2) { d.stuck = Math.max(0, d.stuck - 0.5); return; }
    d.stuck += 0.5;
    if (d.stuck >= 1) { if (d.grounded) d.vel.y = t.jumpSpeed; d.sidestep = 0.7; d.sideDir = random() < 0.5 ? -1 : 1; }
    if (d.stuck >= 2.5 && d.path) { d.blocked[`${d.path[d.step - 1]}>${d.path[d.step]}`] = d.now + 12; d.path = null; }
    if (d.stuck >= 4 && d.charges > 0 && escapeHook(d)) { d.path = null; d.stuck = 2; }
    if (d.stuck >= 7) { d.pos.copy(graphs[d.team].pos[nearestNode(d.team, d.pos)]); d.vel.set(0, 0, 0); d.teleports++; d.stuck = 0; d.path = null; }
  }
  // Follow the node path towards a goal. Returns the point to walk to, "busy" while a
  // hook is being prepared, or null once the bot has arrived.
  function navigate(d, goal, dt) {
    const g = graphs[d.team];
    if (d.goal !== goal || !d.path) {
      const start = nearestNode(d.team, d.pos), from = g.pos[start];
      d.goal = goal; d.path = findPath(d, start, goal, d.now) || [goal]; d.dbg.replans = (d.dbg.replans || 0) + 1;
      // Reach the first node before heading for the next one, unless already beside it.
      d.step = Math.hypot(from.x - d.pos.x, from.z - d.pos.z) < 2.5 && d.path.length > 1 ? 1 : 0;
      d.dbg.path = d.path.join(">");
    }
    while (d.step < d.path.length) {
      const node = g.pos[d.path[d.step]];
      const edge = d.step > 0 ? g.links[d.path[d.step - 1]].find((e) => e.to === d.path[d.step]) : null;
      const close = Math.hypot(node.x - d.pos.x, node.z - d.pos.z) < (d.step === d.path.length - 1 ? 1.2 : 2) && Math.abs(node.y - d.pos.y) < 3.5;
      if (close) { d.step++; continue; }
      // A node high above can't be walked to (we dropped off a roof): plan again from here.
      if (edge?.kind !== "hook" && d.grounded && node.y - d.pos.y > 4 + 0.7 * Math.hypot(node.x - d.pos.x, node.z - d.pos.z)) { d.path = null; return "busy"; }
      if (edge?.kind === "hook") {
        const from = g.pos[d.path[d.step - 1]];
        // Climb from the launch point, once a charge is ready.
        if (Math.hypot(from.x - d.pos.x, from.z - d.pos.z) > 3 || Math.abs(from.y - d.pos.y) > 3.5) { d.step = 0; d.path = null; return "busy"; }
        d.vel.x *= 0.8; d.vel.z *= 0.8;
        if (d.charges > 0 && edge.ledge && startHook(d, edge.ledge, edge.anchor, true)) return "busy";
        d.state = "holding"; return "busy";
      }
      d.state = "running";
      return node;
    }
    const end = g.pos[d.path[d.path.length - 1]];
    // Knocked off the spot (or a hook fell short): head back.
    if (Math.hypot(end.x - d.pos.x, end.z - d.pos.z) > 2.2 || Math.abs(end.y - d.pos.y) > 4) { d.path = null; return "busy"; }
    return null;
  }

  function update(dt, match, player) {
    if (paused) return;
    const now = (d_now.t += dt);
    for (const shot of shots) shot.age -= dt;
    while (shots.length && shots[0].age <= 0) shots.shift();
    for (const team of ["rockets", "comets"]) {
      if (teamFocus[team]) teamFocus[team].time -= dt;
      if (teamFocus[team]?.time <= 0) teamFocus[team] = null;
      boxSeen[team] = Math.max(0, boxSeen[team] - dt);
      plans[team] -= dt;
      if (plans[team] <= 0) { plans[team] = 0.5; direct(team, match, player, now); }
    }
    if (holder !== match.holder) { if (holder && match.holder) snatches++; holder = match.holder; holderTime = 0; snatchDelay = 6 + random() * 10; flankSnatch = random() < 0.4; } else holderTime += dt;
    for (const actor of [...all, ...humans(player)]) {
      if (!actor.stationaryOrigin || actor.stationaryOrigin.distanceTo(actor.pos) > 1) { actor.stationaryOrigin = actor.pos.clone(); actor.stationaryTime = 0; }
      else actor.stationaryTime = (actor.stationaryTime || 0) + dt;
    }
    for (const d of all) {
      if (d.dead) {
        // Let the collapse play for a moment before the body disappears.
        d.deadTime += dt;
        if (d.deadTime >= 1.6) d.group.visible = false;
        continue;
      }
      if (frozen && !d.manual) continue;
      d.now = now;
      if (d.status === "knocked") {
        d.knockedHp -= 50 / 20 * dt;
        if (d.knockedHp <= 0) { damage(d, 1, "bleed", d.name); continue; }
        const ally = all.filter((a) => a.team === d.team && a.status === "alive").sort((a, b) => a.pos.distanceToSquared(d.pos) - b.pos.distanceToSquared(d.pos))[0];
        const dir = (ally ? ally.pos : d.spawn).clone().sub(d.pos).setY(0).normalize();
        d.vel.x = dir.x * 2; d.vel.z = dir.z * 2; d.vel.y -= t.gravity * dt;
        d.grounded = moveBody(d.pos, d.vel, dt, world.boxes, 0.48, 0.9, world.slopes);
        if ((d.pos.y - 0.9 < world.killHeight || (d.pos.y - 0.9 < world.ringOutHeight && Math.hypot(d.pos.x, d.pos.z) > 23))) damage(d, 0, "ringout", d.fallCredit > d_now.t ? "#7" : "FALL");
        d.group.position.copy(d.pos); d.rope.visible = false;
        const reviver = all.find((a) => a.reviveTarget === d)?.pos ?? (player.reviveTarget === d ? player.pos : null);
        continue;
      }
      d.damageDelay = Math.max(0, d.damageDelay - dt);
      if (!d.damageDelay) d.hp = Math.min(t.playerHealth, d.hp + t.healthRegenRate * dt);
      d.displaced = Math.max(0, d.displaced - dt);
      d.flash = Math.max(0, d.flash - dt); d.alert = Math.max(0, d.alert - dt); d.cooldown -= dt; d.whipCooldown -= dt; d.meleeCooldown -= dt; d.meleeActive = Math.max(0, d.meleeActive - dt); d.scan -= dt; d.sidestep = Math.max(0, d.sidestep - dt);
      d.rope.visible = false;
      if (d.charges < t.hookCharges) {
        d.recharge += dt;
        if (d.recharge >= t.chargeTime) { d.recharge -= t.chargeTime; d.charges++; }
      } else d.recharge = 0;
      if (d.reload > 0) { d.reload -= dt; if (d.reload <= 0) d.ammo = t.botMagazine; }
      if (d.scan <= 0) scan(d, match, player);
      if (d.target) d.quiet = 0; else d.quiet += dt;
      // Only one bot takes each revive, and only when no nearby threat is visible.
      if (d.reviveTarget?.status !== "knocked") { d.reviveTarget = null; d.reviveProgress = 0; }
      if (!d.reviveTarget && (!d.target || d.pos.distanceTo(d.target.pos) > 20)) {
        const allies = [...all, ...humans(player)];
        d.reviveTarget = allies.find((a) => a !== d && a.team === d.team && a.status === "knocked" && d.pos.distanceTo(a.pos) < 30 && sees(d.pos, a.pos) && !all.some((b) => b !== d && b.reviveTarget === a));
      }
      if (d.reviveTarget) {
        const ally = d.reviveTarget;
        if (d.pos.distanceTo(ally.pos) > 35 || (d.target && d.pos.distanceTo(d.target.pos) < 20)) { d.reviveTarget = null; d.reviveProgress = 0; }
        else {
          d.state = "reviving"; d.reviveProgress += dt; d.tug = 0; d.hook = null;
          ropeTo(d, ally.pos, 0x85ffad);
          const pull = d.pos.clone().sub(ally.pos).setY(0);
          const gap = pull.length() - 2;
          if (gap > 0) ally.pos.addScaledVector(pull.normalize(), Math.min(2 * dt, gap));
          d.vel.multiplyScalar(0.9); d.vel.y -= t.gravity * dt;
          d.grounded = moveBody(d.pos, d.vel, dt, world.boxes, 0.48, 0.9, world.slopes);
          d.group.position.copy(d.pos);
          if (d.reviveProgress >= t.reviveTime) { if (ally === player) callbacks.revivePlayer(d.name); else if (ally.id) callbacks.remoteRevive?.(ally, d.name); else revive(ally, d.name); d.reviveTarget = null; d.reviveProgress = 0; }
          continue;
        }
      }
      fire(d, dt, match, player);
      move(d, dt, match, player);
      // Face the current target, otherwise the way we're moving (or the prize when holding).
      const look = d.target ? d.target.pos.clone().sub(d.pos) : d.state === "holding" ? new THREE.Vector3(-d.pos.x, 0, -d.pos.z) : d.vel.clone();
      look.y = 0;
      if (look.lengthSq() > 1) d.facing.lerp(look.normalize(), Math.min(1, dt * 6)).normalize();
      for (const mate of [...all, ...humans(player)]) {
        if (mate === d || mate.team !== d.team || mate.status !== "alive") continue;
        const away = d.pos.clone().sub(mate.pos).setY(0), gap = away.length();
        if (gap < 1.2) { if (gap < 0.001) away.set(d.index < (mate.index ?? 99) ? -1 : 1, 0, 0); else away.divideScalar(gap); d.vel.addScaledVector(away, (1.2 - gap) * 12 * dt); }
      }
      d.vel.y -= t.gravity * dt;
      d.grounded = moveBody(d.pos, d.vel, dt, world.boxes, 0.48, 0.9, world.slopes);
      if ((d.pos.y - 0.9 < world.killHeight || (d.pos.y - 0.9 < world.ringOutHeight && Math.hypot(d.pos.x, d.pos.z) > 23))) damage(d, d.hp, "ringout", d.fallCredit > d_now.t ? "#7" : "FALL");
      d.group.position.copy(d.pos);
      d.dbg.goal = d.goal; d.dbg.order = d.order.kind === "perch" ? d.order.name : d.order.kind; d.dbg.stuck = d.stuck; d.dbg.teleports = d.teleports; d.dbg.speed = d.vel.length(); d.dbg.step = d.step;
    }
  }
  function scan(d, match, player) {
    d.scan = 0.22 + (d.number % 3) * 0.035;
    const enemies = all.filter((other) => other.team !== d.team && !other.dead);
    enemies.push(...humans(player).filter(p => p.team !== d.team && p.status !== "eliminated"));
    let target = null, best = t.botRange;
    const heard = shots.findLast((shot) => shot.team !== d.team && shot.pos.distanceTo(d.pos) < 30);
    if (heard && !d.target) d.facing.copy(heard.pos).sub(d.pos).setY(0).normalize();
    const focus = teamFocus[d.team];
    d.localEnemies = enemies.filter((enemy) => enemy.status === "alive" && d.pos.distanceTo(enemy.pos) < 20 && sees(d.pos, enemy.pos)).length;
    for (const enemy of enemies) {
      const distance = d.pos.distanceTo(enemy.pos);
      // Bots only notice what's in front of them, close by, or what just hit them.
      const toEnemy = enemy.pos.clone().sub(d.pos).setY(0).normalize();
      const noticed = enemy === d.target || d.alert > 0 || distance < 12 || toEnemy.dot(d.facing) > Math.cos(THREE.MathUtils.degToRad(t.botViewAngle / 2));
      const shared = focus?.target === enemy && focus.pos.distanceTo(d.pos) < 30;
      const tugger = enemy.state === "tugging" || (enemy === player && match.tug.team === enemy.team);
      const score = distance - (shared ? 20 : 0) - (tugger ? 100 : 0) + (enemy.status === "knocked" ? 15 : 0);
      if (enemy.status === "knocked" && d.localEnemies) continue;
      if ((noticed || shared) && distance < t.botRange && score < best && sees(d.pos, enemy.pos)) { target = enemy; best = score; }
    }
    if (target !== d.target) { d.target = target; d.reaction = t.botReaction * (1.6 - t.botSkill * 1.2) + (target && target.vel.length() > 20 ? 0.3 : 0); }
    if (target && target.pos.y > 25 && Math.abs(target.pos.x) < 12 && target.pos.z < -34) boxSeen[d.team] = 10;
    for (const [name, id] of Object.entries(perchNodes)) {
      const n = graphs[d.team].pos[id];
      if (Math.hypot(n.x - d.pos.x, n.z - d.pos.z) < 4 && Math.abs(n.y - d.pos.y) < 3) d.perches.add(name);
    }
  }

  function fire(d, dt, match, player) {
    d.reaction -= dt;
    const target = d.target;
    if (target && (target.dead || (target === player && match.dead))) d.target = null;
    if (!(d.target && d.reaction <= 0 && d.tug === 0 && sees(d.pos, d.target.pos))) return;
    const enemy = d.target, distance = d.pos.distanceTo(enemy.pos);
    if (enemy.status === "alive") teamFocus[d.team] = { target: enemy, pos: d.pos.clone(), time: 2 };
    const direction = enemy.pos.clone().sub(d.pos); direction.y = 0; direction.normalize();
    if (distance < 2.4 && !world.inSpawn(enemy.pos, enemy.team) && d.meleeCooldown <= 0 && direction.dot(d.facing) >= Math.cos(THREE.MathUtils.degToRad(t.meleeAngle / 2))) {
      d.meleeCooldown = 1.5; d.meleeActive = 0.25;
      if (enemy === player) callbacks.damagePlayer(t.meleeDamage, d, "melee"); else if (enemy.id) callbacks.remoteDamage?.(enemy, t.meleeDamage, "melee", d); else damage(enemy, t.meleeDamage, "melee", d.name);
      enemy.vel.addScaledVector(direction, t.meleeKnockback); enemy.vel.y += 3; enemy.displaced = 3;
    } else if (distance < t.whipReach && d.whipCooldown <= 0) {
      d.whipCooldown = t.whipCooldown; d.charges = Math.min(t.hookCharges, d.charges + 1);
      if (enemy === player) callbacks.damagePlayer(t.whipBase, d, "whip"); else if (enemy.id) callbacks.remoteDamage?.(enemy, t.whipBase, "whip", d); else damage(enemy, t.whipBase, "whip", d.name);
    } else if (distance < t.botRange && d.cooldown <= 0 && d.reload <= 0) {
      d.ammo--;
      if (!d.ammo) d.reload = t.reloadTime;
      shots.push({ team: d.team, pos: d.pos.clone(), age: 0.5 });
      // Fire in short bursts with a pause between them, like a person re-aiming.
      if (d.burst <= 0) d.burst = 3 + Math.floor(random() * 3);
      d.burst--;
      d.cooldown = d.burst > 0 ? 1 / t.botGunRate : t.botBurstPause * (0.7 + random() * 0.6);
      // A probabilistic hit is equivalent to scattering a shot around the tracked target;
      // range and target speed both make it much harder.
      const speed = enemy.vel.length();
      const chance = THREE.MathUtils.lerp(0.25, 0.8, t.botSkill) / (1 + distance / 30) / (1 + speed / 10) * (enemy.stationaryTime >= 3 ? 1.4 : 1);
      if (random() < chance) {
        if (enemy === player) callbacks.damagePlayer(t.botGunDamage * falloff(distance), d, "gun"); else if (enemy.id) callbacks.remoteDamage?.(enemy, t.botGunDamage * falloff(distance), "gun", d); else damage(enemy, t.botGunDamage * falloff(distance), "gun", d.name);
      }
    }
  }

  function move(d, dt, match, player) {
    if (d.displaced) { d.tug = 0; d.state = "displaced"; d.hook = null; return; }
    if (d.hook) { runHook(d, dt); return; }
    const g = graphs[d.team], order = d.order;
    const roster = [...all, ...humans(player)];
    const localFriends = roster.filter((a) => a.team === d.team && a.status === "alive" && a.pos.distanceTo(d.pos) < 20).length;
    const teammate = all.filter((a) => a !== d && a.team === d.team && a.status === "alive").sort((a, b) => a.pos.distanceToSquared(d.pos) - b.pos.distanceToSquared(d.pos))[0];
    const retreat = d.localEnemies >= 2 && d.localEnemies > localFriends && teammate;
    const inRing = Math.hypot(d.pos.x, d.pos.z) <= 19;
    const tugging = order.kind === "tug" && match.phase === "active" && match.holder !== d.team && !retreat && inRing && sees(d.pos, world.prize.position);
    if (tugging) {
      // Keep a rope on the prize while the others cover.
      d.tug += dt; d.state = "tugging"; d.vel.x *= 0.9; d.vel.z *= 0.9; d.stuck = 0;
      ropeTo(d, world.prize.position, 0xffcf33);
      if (d.tug >= (match.holder ? t.snatchTime : t.tugTime)) { callbacks.claim(d.team); d.tug = 0; }
      return;
    }
    d.tug = 0;
    let goal = order.kind === "tug" ? order.node : order.kind === "node" ? order.node : perchNodes[order.name];
    d.perch = order.kind === "perch" ? order.name : order.kind === "tug" ? "floor" : d.perch;
    // Shooters on the low posts close in on a distant enemy (or chase a fresh trail), divers drop
    // onto targets below, and everyone finishes a knocked enemy once it's safe. Each chase is
    // committed to for a few seconds so bots don't dither between goals.
    const high = order.kind === "perch" && ["box", "toaster", "carton", "spoon"].includes(order.name);
    if (d.target) { d.lastSeen ||= { pos: new THREE.Vector3(), time: 0 }; d.lastSeen.pos.copy(d.target.pos); d.lastSeen.time = d.now; }
    const trail = d.lastSeen && d.now - d.lastSeen.time < 3 ? d.lastSeen.pos : null;
    if (d.huntUntil <= d.now && d.huntCool <= d.now && order.kind !== "tug" && !retreat) {
      const dive = d.target && d.personality === "diver" && d.pos.y > d.target.pos.y + 5 && d.pos.distanceTo(d.target.pos) < 32;
      const finish = d.target && d.target.status === "knocked" && !d.localEnemies && d.pos.distanceTo(d.target.pos) > 10;
      const chase = !high && trail && d.hp >= 60 && localFriends >= d.localEnemies && (!d.target || d.pos.distanceTo(trail) > 24);
      if (dive || finish || chase) { d.huntGoal = nearestNode(d.team, d.target ? d.target.pos : trail); d.huntUntil = d.now + 3; d.huntCool = d.now + 8; }
    }
    if (retreat) { d.retreatUntil = d.now + 3; d.retreatGoal = nearestNode(d.team, teammate.pos); }
    if (d.retreatUntil > d.now && d.retreatGoal) goal = d.retreatGoal;
    else if (d.huntUntil > d.now && order.kind !== "tug" && order.kind !== "node") goal = d.huntGoal;
    const next = navigate(d, goal, dt);
    if (next === "busy") return unstick(d, dt);
    if (!next) {
      // Stand on the spot; gravity would otherwise slide a bot down the rim's slope.
      const spot = g.pos[goal], gap = Math.hypot(spot.x - d.pos.x, spot.z - d.pos.z);
      d.state = "holding"; d.stuck = 0;
      if ((d.hp < 60 || d.reload > 0) && d.target && d.pos.y < 10 && gap < 5) {
        // Duck back from the fight while hurt or reloading, then return to the post.
        steer(d, d.pos.clone().sub(d.target.pos).setY(0).normalize().multiplyScalar(4).add(d.pos), dt, 6);
      } else if (gap > 0.4) steer(d, spot, dt, Math.min(4, gap * 3)); else { d.vel.x *= 0.5; d.vel.z *= 0.5; }
    } else steer(d, next, dt);
    unstick(d, dt);
  }
  let poseFrame = 0;
  function pose(dt, camera, idle = false) {
    poseFrame++;
    for (const d of all) {
      if (!d.visual) continue;
      const far = camera.position.distanceToSquared(d.pos) > 1600;
      d.poseDt = (d.poseDt || 0) + dt;
      if (far && poseFrame % 2) continue;
      d.visual.update(d.poseDt, { velocity: idle ? new THREE.Vector3() : d.vel, position: d.pos, target: d.target?.pos || d.pos, grounded: idle || d.grounded, hook: idle ? "ready" : d.state === "grappling" ? "swing" : d.state === "reviving" ? "revive" : "ready", aim: d.facing, gun: d.cooldown, melee: d.meleeActive, status: idle ? "alive" : d.status });
      d.poseDt = 0;
    }
  }
  // Test hooks: send one bot along an explicit node path, optionally freezing everyone else.
  function goto(number, nodes) {
    const d = all.find((b) => b.number === number);
    if (d.dead) reset(d);
    d.manual = true; d.order = { kind: "node", node: nodes[nodes.length - 1] }; d.path = nodes; d.goal = nodes[nodes.length - 1]; d.step = 1; d.target = null;
  }
  function configure(humanSlots, fill) {
    const counts = { rockets: 0, comets: 0 };
    for (const slot of humanSlots) counts[slot % 2 ? "rockets" : "comets"]++;
    const selected = [];
    for (const team of ["rockets", "comets"]) selected.push(...pool.filter(b => b.team === team).slice(0, fill ? Math.max(0, 4 - counts[team]) : 0));
    if (selected.length === all.length && selected.every((b,i)=>all[i]===b)) return;
    for (const b of pool) { const active = selected.includes(b); if (!active) { b.group.visible=false; b.rope.visible=false; } else if (!all.includes(b)) reset(b); }
    all.splice(0, all.length, ...selected);
  }
  return { pool, configure, pose, hideRopes: () => all.forEach((d) => { d.rope.visible = false; }), goto, freeze: (value) => { frozen = !!value; }, all, damage, revive, update, resetAll: () => { tugDelay.rockets = tugDelay.comets = 0; all.forEach(reset); }, respawn: () => all.filter((d) => d.dead).forEach(reset), pause: (value) => { paused = !!value; }, seed, hear: (team, pos) => shots.push({ team, pos: pos.clone(), age: 0.5 }), skill: (value) => { t.botSkill = THREE.MathUtils.clamp(value, 0, 1); } };
}
