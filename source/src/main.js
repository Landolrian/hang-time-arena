import * as THREE from "three";
import { createOnline } from "./online.js";
import { tuning as t, defaults as tuningDefaults } from "./tuning.js";
const tuningHeldDefault = tuningDefaults.heldSensitivity;
import { createWorld, moveBody, nearbyWall } from "./world.js";
import { createBowl } from "./maps/bowl.js";
import { bowlHeight } from "./maps/bowl-profile.js";
import { createDummies } from "./dummies.js";
import { createBots } from "./bots.js";
import { createContestant } from "./contestant.js";
import { createHUD } from "./hud.js";
import { createSettings, settings } from "./settings.js";
import "./style.css";
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(
    t.baseFov,
    innerWidth / innerHeight,
    0.05,
    300,
  );
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
document.querySelector("#app").append(renderer.domElement);
const params = new URLSearchParams(location.search);
const onlineTeam = params.get("mode") === "team";
const bowlMap = params.get("map") === "bowl" || onlineTeam, debug = params.get("debug") === "1";
let waiting = bowlMap, killer = null, killerTime = 0, spectateKillerTime = 0, spectating = null;
const world = bowlMap ? createBowl(scene) : createWorld(scene),
  hud = createHUD();
let hitstop = 0,
  kick = 0,
  fovKick = 0,
  roll = 0;
const notifyDummy = (type, value, pos, source) => {
  if (type === "kill") {
    hud.message("ELIMINATED");
    if (source !== "whip" && source !== "melee") refillHookCharges();
  } else {
    if (source === "zip") addHookCharge();
    if (pos.clone().project(camera).z > 1) return;
    hud.popup(source === "stunt" ? `STUNT HIT ${Math.round(value)}` : Math.round(value), pos, camera, source);
    hud.hit(source);
    if (source !== "gun") hitstop = Math.max(hitstop, 0.016);
    kick = 0.025;
  }
};
let bots;
let online, onlineKills = 0, respawnTimer = 0, onlineSpawned = false;
const dummies = bowlMap ? {
  get all() { return [...bots.all, ...(onlineTeam ? online?.all || [] : [])].filter((actor) => actor.team !== player.team); },
  damage: (target, amount, source) => {
    if (!onlineTeam) return bots.damage(target, amount, source);
    if (target.team === player.team) return;
    if (target.id) { online.damage(target, amount, source); notifyDummy("damage", amount, target.pos.clone().add(new THREE.Vector3(0,2,0)), source); }
    else if (online.isHost) bots.damage(target, amount, source);
    else { online.sendEvent({t:"bot-hit", number:target.number, amount, source, attackerTeam:player.team}); notifyDummy("damage", amount, target.pos.clone().add(new THREE.Vector3(0,2,0)), source); }
  },
  update: (dt) => {
    // Bots show "being revived" when the player is the one reeling them in.
    player.reviveTarget = hook.state === "revive" ? hook.target : null;
    if (!onlineTeam || online.isHost) bots.update(dt, jackpot, player);
  },
  resetAll: () => bots.resetAll(),
} : { get all() { return online?.all || []; }, damage: (target, amount, source) => { if (!target || target.dead) return; online?.damage(target, amount, source); notifyDummy("damage", amount, target.pos.clone().add(new THREE.Vector3(0,2,0)), source); }, update: () => {}, resetAll: () => {} };
const player = {
  hp: t.playerHealth, damageDelay: 0, status: "alive", knockedHp: 50, team: "rockets",
  pos: bowlMap ? world.spawnPoints.rockets.clone() : new THREE.Vector3(0, 0.9, 4),
  vel: new THREE.Vector3(),
  grounded: true,
  groundNormal: new THREE.Vector3(0, 1, 0),
  yaw: 0,
  pitch: 0,
  slide: false,
  jumpBuffer: 0,
  cancel: 0,
  whip: 0,
  melee: 0,
  gun: 0,
  ammo: t.magazine,
  reload: 0,
  landingSlide: 0,
  slideBoostCooldown: 0,
};
if (!bowlMap || onlineTeam) online = createOnline(scene, (amount, from, source, attackerYaw) => {
  if (onlineTeam) { const attacker = online.all.find(p => p.id === from); damagePlayer(amount, attacker || {name:"Opponent",pos:player.pos.clone(),team:player.team === "rockets" ? "comets" : "rockets"}, source); if (source === "melee" && Number.isFinite(attackerYaw)) { player.vel.x -= Math.sin(attackerYaw) * t.meleeKnockback; player.vel.z -= Math.cos(attackerYaw) * t.meleeKnockback; player.vel.y += 3; } return; }
  if (respawnTimer > 0) return;
  if (source === "melee" && Number.isFinite(attackerYaw)) { player.vel.x -= Math.sin(attackerYaw) * t.meleeKnockback; player.vel.z -= Math.cos(attackerYaw) * t.meleeKnockback; player.vel.y += 3; }
  player.hp = Math.max(0, player.hp - amount);
  player.damageDelay = t.healthRegenDelay;
  hud.hit(source);
  if (!player.hp) {
    respawnTimer = 2; player.status = "eliminated"; player.vel.set(0,0,0); releaseHook();
    online.reportKO(from); hud.message("ELIMINATED · RESPAWNING");
  }
}, () => { onlineKills++; hud.message("ELIMINATION!"); }, {team:onlineTeam, bots:params.get("bots") !== "0"});
const hook = {
  state: "ready",
  point: new THREE.Vector3(),
  pullPoint: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  distance: 0,
  length: 0,
  charges: t.hookCharges,
  recharge: 0,
  refireDelay: 0,
  target: null,
  age: 0,
  peakSpeed: 0,
  buffer: 0,
  zipDir: new THREE.Vector3(),
  pendingTarget: null,
  prize: false,
};
const keys = new Set(), held = new Set();
const continuous = ["forward", "back", "left", "right", "slide", "fire"];
function restoreHeld() {
  for (const name of continuous) {
    if (held.has(name) && (!bowlMap || (jackpot.phase === "active" && player.status !== "eliminated" && (player.status !== "knocked" || name !== "fire" && name !== "slide")))) keys.add(name);
    else keys.delete(name);
  }
}
let landingTime = 0;
const wallJump = { contact: null, last: null, coyote: 0, age: 0, buffer: 0, display: 0 };
const dust = new THREE.Mesh(
  new THREE.SphereGeometry(0.16, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xc6c1b4, transparent: true, opacity: 0 }),
);
scene.add(dust);
function sameWall(a, b) {
  return a && b && a.box === b.box && a.normal.equals(b.normal);
}
function updateWallJump(dt) {
  wallJump.display = Math.max(0, wallJump.display - dt);
  wallJump.buffer = Math.max(0, wallJump.buffer - dt);
  dust.material.opacity = Math.max(0, dust.material.opacity - dt * 3);
  dust.scale.addScalar(dt * 3);
  if (player.grounded) {
    wallJump.last = wallJump.contact = null;
    wallJump.coyote = 0;
    return;
  }
  const contact = nearbyWall(player.pos, world.boxes);
  if (contact) {
    if (!sameWall(contact, wallJump.contact)) wallJump.age = 0;
    else wallJump.age += dt;
    if (wallJump.last && !sameWall(contact, wallJump.last)) wallJump.last = null;
    wallJump.contact = contact;
    wallJump.coyote = t.wallJumpCoyote;
  } else {
    wallJump.coyote = Math.max(0, wallJump.coyote - dt);
    wallJump.age += dt;
  }
  if (!wallJump.buffer || !wallJump.contact || (!contact && !wallJump.coyote) ||
      sameWall(wallJump.contact, wallJump.last) || mantle || ledgeClimb ||
      hook.state === "swing" || hook.state === "zip") return;
  const wall = wallJump.contact;
  const speed = player.vel.length();
  const horizontal = Math.hypot(player.vel.x, player.vel.z);
  const into = player.vel.dot(wall.normal);
  if (into < 0) player.vel.addScaledVector(wall.normal, -into);
  player.vel.addScaledVector(wall.normal, t.wallJumpOut);
  const after = Math.hypot(player.vel.x, player.vel.z);
  if (after < horizontal && after > 0) {
    player.vel.x *= horizontal / after;
    player.vel.z *= horizontal / after;
  }
  player.vel.y = Math.max(player.vel.y, t.wallJumpUp);
  if (speed > 20 && wallJump.age <= 0.1) player.vel.multiplyScalar(1 + t.wallJumpBonus);
  wallJump.last = wall;
  wallJump.buffer = player.jumpBuffer = 0;
  wallJump.display = 0.3;
  kick = Math.max(kick, 0.035);
  dust.position.copy(wall.point);
  dust.scale.setScalar(1);
  dust.material.opacity = 0.7;
}

let spectatorIndex = 0;
let third = settings.perspective === "third",
  shoulder = settings.shoulder,
  manual = false,
  aim = "none",
  last = performance.now(),
  acc = 0,
  arcTime = 0,
  whipActive = 0,
  meleeActive = 0,
  whipBuffered = false,
  mantle = null,
  ledgeClimb = null,
  slideEase = 0,
  cameraPullback = 0,
  landingDip = 0;
let previousPerspective = settings.perspective, previousShoulder = settings.shoulder;
const settingsMenu = createSettings(renderer.domElement, () => {
  if (settings.perspective !== previousPerspective) third = settings.perspective === "third";
  if (settings.shoulder !== previousShoulder) shoulder = settings.shoulder;
  previousPerspective = settings.perspective; previousShoulder = settings.shoulder;
});
const lastSafe = player.pos.clone();
const whipPrevious = new THREE.Vector3();
const whipHits = new Set();
let whipChain = 0, whipAge = Infinity, whipCancelled = false, whipRefunded = false;
const whipCancelOpen = () => whipChain > 0 && whipChain < t.whipChainMax && !whipCancelled && whipAge >= t.whipCancelStart && whipAge <= t.whipCancelEnd;
const body = new THREE.Group();
let contestant = null;
createContestant("red", 7).then((visual) => {
  contestant = visual;
  body.add(visual.model);
});
scene.add(body);
// Shot tracers: a short-lived streak from the muzzle so misses are visible too, plus a spark where it lands.
const tracerGeometry = new THREE.CylinderGeometry(0.045, 0.045, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5);
const sparkGeometry = new THREE.SphereGeometry(0.22, 8, 6);
const tracers = Array.from({ length: 10 }, () => {
  const streak = new THREE.Mesh(tracerGeometry, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const spark = new THREE.Mesh(sparkGeometry, new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  streak.visible = spark.visible = false;
  scene.add(streak, spark);
  return { streak, spark, life: 0 };
});
let nextTracer = 0;
function showTracer(from, to, landed) {
  const tracer = tracers[nextTracer++ % tracers.length];
  tracer.life = 0.12;
  tracer.streak.position.copy(from);
  tracer.streak.lookAt(to);
  tracer.streak.scale.set(1, 1, from.distanceTo(to));
  tracer.streak.visible = true;
  tracer.spark.position.copy(to);
  tracer.spark.visible = landed;
}
function updateTracers(dt) {
  for (const tracer of tracers) {
    if (tracer.life <= 0) continue;
    tracer.life -= dt;
    const fade = Math.max(0, tracer.life / 0.12);
    tracer.streak.material.opacity = fade;
    tracer.spark.material.opacity = fade;
    tracer.spark.scale.setScalar(1.6 - fade * 0.6);
    if (tracer.life <= 0) tracer.streak.visible = tracer.spark.visible = false;
  }
}
const anchorPuffs = Array.from({ length: 8 }, () => {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.25, 24), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  mesh.visible = false; scene.add(mesh); return { mesh, life: 0 };
});
let nextPuff = 0;
function showAnchorPuff(point) { const puff = anchorPuffs[nextPuff++ % anchorPuffs.length]; puff.life = 0.25; puff.mesh.position.copy(point); puff.mesh.visible = true; }
const rope = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.035, 1, 8),
  new THREE.MeshBasicMaterial({ color: 0xffffdd }),
);
scene.add(rope);
const arc = new THREE.Mesh(
  new THREE.RingGeometry(1.2, 1.9, 32, 1, 0, 0.9),
  new THREE.MeshBasicMaterial({ color: 0xffe14d, blending: THREE.AdditiveBlending, transparent: true,
    opacity: 0.8, side: THREE.DoubleSide, depthTest: false }),
);
scene.add(arc);
const ray = new THREE.Raycaster();
const up = new THREE.Vector3(0, 1, 0);
function forward() {
  return new THREE.Vector3(
    -Math.sin(player.yaw) * Math.cos(player.pitch),
    Math.sin(player.pitch),
    -Math.cos(player.yaw) * Math.cos(player.pitch),
  ).normalize();
}
function lookAtPoint(p) {
  const v = new THREE.Vector3().subVectors(p, player.pos).normalize();
  player.yaw = Math.atan2(-v.x, -v.z);
  player.pitch = Math.asin(THREE.MathUtils.clamp(v.y, -1, 1));
}
function intersections(origin, dir, range, skipPlayer = false, hookOnly = false) {
  ray.set(origin, dir);
  ray.near = skipPlayer ? Math.max(0, player.pos.clone().sub(origin).dot(dir)) : 0;
  ray.far = range;
  const hits = ray.intersectObjects(
    [
      ...world.meshes,
      ...(bowlMap && hookOnly ? [...bots.all, ...(onlineTeam ? online.all : [])].filter((d) => d.team !== player.team || d.status === "knocked") : dummies.all).filter((d) => !d.dead).map((d) => d.group),
    ],
    true,
  );
  ray.near = 0;
  return hits.find(
    (h) =>
      h.object.visible &&
      (!hookOnly || h.object.userData.hookable !== false) &&
      (!h.object.userData.dummy || !h.object.userData.dummy.dead),
  );
}
function aimRay(range = t.hookRange) {
  const origin = third
    ? camera.position.clone()
    : player.pos.clone().add(new THREE.Vector3(0, 0.55, 0));
  return intersections(origin, forward(), range + (third ? 4 : 0), third, true);
}
function maxHookCharges() {
  return Math.max(1, Math.round(t.hookCharges));
}
function refillHookCharges() {
  hook.charges = maxHookCharges();
  hook.recharge = 0;
}
function addHookCharge() {
  hook.charges = Math.min(maxHookCharges(), hook.charges + 1);
  if (hook.charges === maxHookCharges()) hook.recharge = 0;
}
function fireHook() {
  if (hook.state !== "ready" || hook.refireDelay > 0 || (!t.unlimitedHooks && hook.charges < 1)) return false;
  // Every throw spends a charge, hit or miss.
  if (!t.unlimitedHooks) hook.charges--;
  hook.buffer = 0;
  hook.pendingTarget = null;
  let hit = aimRay();
  const origin = player.pos.clone().add(new THREE.Vector3(0, 0.4, 0));
  if (!hit && t.aimForgiveness > 0) {
    const cast = new THREE.Ray(origin, forward());
    let nearest = t.hookRange;
    for (const box of world.boxes) {
      if (box.mesh.userData.hookable === false) continue;
      const expanded = new THREE.Box3(
        box.min.clone(),
        box.max.clone(),
      ).expandByScalar(t.aimForgiveness);
      const point = cast.intersectBox(expanded, new THREE.Vector3());
      if (!point) continue;
      const distance = point.distanceTo(origin);
      if (distance < 4 || distance >= nearest) continue;
      nearest = distance;
      // Aim slightly inside the box so the flying hook can't graze past an edge.
      const center = box.min.clone().add(box.max).multiplyScalar(0.5);
      point.clamp(box.min, box.max);
      hit = { point: point.addScaledVector(center.sub(point).normalize(), 0.05) };
    }
  }
  // Forgive near misses on dummy capsules, but never aim through a wall.
  const cast = new THREE.Ray(origin, forward());
  let best = hit ? hit.point.distanceTo(origin) : t.hookRange;
  for (const d of (bowlMap ? [...bots.all, ...(onlineTeam ? online.all : [])].filter((b) => b.team !== player.team || b.status === "knocked") : dummies.all)) {
    if (d.dead > 0) continue;
    const center = d.pos.clone().add(new THREE.Vector3(0, 0.4, 0));
    const along = center.clone().sub(origin).dot(cast.direction);
    if (along <= 0 || along >= best + 2.5 || along > t.hookRange || cast.distanceToPoint(center) > 1.0) continue;
    const direction = center.clone().sub(origin).normalize();
    ray.set(origin, direction); ray.near = 0; ray.far = center.distanceTo(origin);
    const obstruction = ray.intersectObjects(world.meshes)[0];
    if (obstruction && obstruction.point.distanceTo(center) > 2.5) continue;
    hit = { point: center }; hook.pendingTarget = d; best = along;
  }
  hook.point.copy(origin);
  hook.dir.copy(hit ? hit.point.clone().sub(origin).normalize() : forward());
  hook.state = "flying";
  hook.distance = 0;
  hook.target = null;
  return true;
}
function releaseHook({ clean = false } = {}) {
  if (hook.state === "swing" || hook.state === "zip") {
    if (
      clean && !hook.ground &&
      hook.age >= 0.25 &&
      hook.peakSpeed > 12 &&
      player.vel.length() >= hook.peakSpeed * 0.9
    ) {
      player.vel.multiplyScalar(t.releaseBoost);
      hud.message("CLEAN RELEASE");
    }
  }
  hook.refireDelay = 0.15;
  hook.state = "ready";
  hook.target = null;
  hook.reviveProgress = 0;
  hook.prize = false;
  hook.ledge = null;
  ledgeClimb = null;
}
function grappleJump() {
  if (hook.ground) { releaseHook(); player.jumpBuffer = 0.12; return; }
  const speed = player.vel.length();
  const timing =
    hook.age >= 0.25 && hook.peakSpeed > 0 && speed >= hook.peakSpeed * 0.9
      ? 1
      : 0.4;
  if (speed > 0 && hook.age >= 0.15) player.vel.multiplyScalar(1 + t.grappleJumpBoost * timing);
  player.vel.y += t.grappleJumpPop;
  if (player.vel.length() < speed) player.vel.setLength(speed);
  player.grounded = false;
  player.jumpBuffer = 0;
  releaseHook();
  if (timing === 1 && speed > 12) hud.message("CLEAN RELEASE");
}
function whip() {
  if (player.whip > 0) {
    if (player.whip <= 0.1) whipBuffered = true;
    return;
  }
  whipBuffered = false;
  whipChain = whipCancelled ? whipChain : 1;
  whipCancelled = false; whipAge = 0; whipRefunded = false;
  if (whipChain > 1) hud.message(`WHIP x${whipChain}`);
  player.whip = t.whipCooldown;
  player.cancel = t.cancelTime;
  arcTime = 0.12;
  whipActive = 0.12;
  whipHits.clear();
  whipPrevious.copy(player.pos);
}
function melee() {
  if (player.status !== "alive" || hook.state === "revive" || (hook.state === "swing" && hook.prize)) return;
  const cancel = whipCancelOpen();
  if (!cancel && player.melee > 0) return;
  if (cancel) { whipCancelled = true; whipChain++; player.whip = 0; hud.message("KICK!"); }
  player.melee = t.meleeCooldown;
  meleeActive = 0.25;
  const origin = player.pos.clone().add(new THREE.Vector3(0, 0.3, 0));
  const facing = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  for (const d of dummies.all) {
    if (d.dead > 0 || (bowlMap && world.inSpawn(d.pos, d.team))) continue;
    const delta = d.pos.clone().add(new THREE.Vector3(0, 0.3, 0)).sub(origin);
    const horizontal = new THREE.Vector3(delta.x, 0, delta.z);
    if (delta.length() > t.meleeRange || (horizontal.lengthSq() && horizontal.normalize().dot(facing) < Math.cos(THREE.MathUtils.degToRad(t.meleeAngle / 2)))) continue;
    ray.set(origin, delta.clone().normalize()); ray.near = 0; ray.far = delta.length();
    if (ray.intersectObjects(world.meshes).length) continue;
    dummies.damage(d, t.meleeDamage, "melee");
    d.vel.addScaledVector(facing, t.meleeKnockback); d.vel.y += 3; d.displaced = 3;
  }
}
function updateWhip() {
  const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const travel = player.pos.clone().sub(whipPrevious);
  let magnet = null;
  let bestAlignment = Math.cos(THREE.MathUtils.degToRad(20));
  for (const d of dummies.all) {
    if (d.dead > 0 || whipHits.has(d)) continue;
    // Minimize distance from the swept player segment to the capsule's vertical axis.
    const axisMin = d.pos.y + 0.15 - 0.45;
    const axisMax = d.pos.y + 0.15 + 0.45;
    const distanceAt = (fraction) => {
      const p = whipPrevious.clone().addScaledVector(travel, fraction);
      const axis = new THREE.Vector3(d.pos.x, THREE.MathUtils.clamp(p.y, axisMin, axisMax), d.pos.z);
      return { p, axis, distance: p.distanceToSquared(axis) };
    };
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) {
      const a = (2 * lo + hi) / 3, b = (lo + 2 * hi) / 3;
      if (distanceAt(a).distance < distanceAt(b).distance) hi = b;
      else lo = a;
    }
    const nearest = distanceAt((lo + hi) / 2);
    const diff = nearest.axis.sub(nearest.p);
    const vertical = diff.y;
    if (vertical < -4.5 - 0.48 || vertical > 3 + 0.48) continue;
    if (Math.max(0, diff.length() - 0.48) > t.whipReach + 0.06 * player.vel.length()) continue;
    const horizontal = new THREE.Vector3(diff.x, 0, diff.z);
    const horizontalDistance = horizontal.length();
    const alignment = horizontalDistance ? horizontal.normalize().dot(f) : 1;
    if (alignment < Math.cos(THREE.MathUtils.degToRad(t.whipAngle)) && horizontalDistance > 2) continue;
    const sight = d.pos.clone().add(new THREE.Vector3(0, 0.3, 0)).sub(nearest.p);
    ray.set(nearest.p, sight.clone().normalize()); ray.near = 0; ray.far = sight.length();
    if (ray.intersectObjects(world.meshes).length) continue;
    whipHits.add(d);
    if (!whipRefunded) { addHookCharge(); whipRefunded = true; }
    dummies.damage(d, Math.min(t.whipMax, t.whipBase + t.whipSpeedDamage * player.vel.length()) * (t.whipChainFalloff[whipChain - 1] ?? 0.5), "whip");
    if (alignment > bestAlignment) {
      bestAlignment = alignment;
      magnet = horizontal;
    }
  }
  if (magnet) player.vel.addScaledVector(magnet, 1.5);
  whipPrevious.copy(player.pos);
}

// Keep the visible rope anchored at the impact; only the pull aims over the lip.
function setLedgePullPoint(box, point) {
  const edges = [
    { distance: Math.abs(point.x - box.min.x), axis: "x", value: box.min.x + 0.6 },
    { distance: Math.abs(point.x - box.max.x), axis: "x", value: box.max.x - 0.6 },
    { distance: Math.abs(point.z - box.min.z), axis: "z", value: box.min.z + 0.6 },
    { distance: Math.abs(point.z - box.max.z), axis: "z", value: box.max.z - 0.6 },
  ].sort((a, b) => a.distance - b.distance);
  if (box.max.y - point.y > 1.5 || edges[0].distance > 1.5) return;
  hook.ledge = { box, climbed: false };
  hook.pullPoint[edges[0].axis] = edges[0].value;
  hook.pullPoint.y = box.max.y + 1;
}

function bodyClear(pos, ignore = null) {
  return world.boxes.every((b) => b === ignore ||
    pos.x + 0.55 <= b.min.x || pos.x - 0.55 >= b.max.x ||
    pos.y + 0.9 <= b.min.y || pos.y - 0.9 >= b.max.y ||
    pos.z + 0.55 <= b.min.z || pos.z - 0.55 >= b.max.z);
}
function tryMantle(dt) {
  const feet = player.pos.y - 0.9;
  for (const box of world.boxes) {
    const rise = box.max.y - feet;
    if (rise <= 0.05 || rise > t.mantleHeight) continue;
    for (const [axis, other] of [["x", "z"], ["z", "x"]]) {
      const v = player.vel[axis];
      if (Math.abs(v) < 0.1 || player.pos[other] + 0.55 <= box.min[other] ||
          player.pos[other] - 0.55 >= box.max[other]) continue;
      const face = v > 0 ? box.min[axis] : box.max[axis];
      const gap = (face - player.pos[axis]) * Math.sign(v) - 0.55;
      if (gap < 0 || gap > Math.abs(v) * dt + 0.08) continue;
      const start = player.pos.clone();
      const raised = start.clone();
      raised.y = box.max.y + 0.91;
      const end = raised.clone();
      end[axis] = face + Math.sign(v) * 0.6;
      // Check the entire lift and crossing, including headroom and adjacent boxes.
      let clear = true;
      for (let i = 1; i <= 10; i++) {
        const lift = start.clone().lerp(raised, i / 10);
        const cross = raised.clone().lerp(end, i / 10);
        if (!bodyClear(lift) || !bodyClear(cross)) { clear = false; break; }
      }
      if (!clear) continue;
      mantle = { start, raised, end, elapsed: 0 };
      player.grounded = false;
      return;
    }
  }
}
function updateMantle(dt) {
  mantle.elapsed += dt;
  const progress = Math.min(1, mantle.elapsed / Math.max(0.01, t.mantleTime));
  // Lift before crossing the wall so the capsule never cuts through the lip.
  if (progress < 0.6) player.pos.lerpVectors(mantle.start, mantle.raised, progress / 0.6);
  else player.pos.lerpVectors(mantle.raised, mantle.end, (progress - 0.6) / 0.4);
  if (progress === 1) {
    mantle = null;
    player.vel.y = Math.max(0, player.vel.y);
    player.grounded = true;
  }
}

// Horizontal gap between the capsule and a side face of the hooked ledge box,
// or null while the body is above the lip, below the box or inside its footprint.
function ledgeContact(box) {
  if (player.pos.y - 0.9 >= box.max.y || player.pos.y + 0.9 <= box.min.y) return null;
  const dx = player.pos.x - THREE.MathUtils.clamp(player.pos.x, box.min.x, box.max.x);
  const dz = player.pos.z - THREE.MathUtils.clamp(player.pos.z, box.min.z, box.max.z);
  if (!dx && !dz) return null;
  const axis = Math.abs(dx) >= Math.abs(dz) ? "x" : "z";
  const side = Math.sign(axis === "x" ? dx : dz);
  return { axis, side, gap: Math.hypot(dx, dz) - 0.55 };
}
// Touching the wall under a hooked ledge turns the pull into a climb up the face.
function tryLedgeClimb(dt) {
  const { box } = hook.ledge;
  const contact = ledgeContact(box);
  if (!contact) return;
  const { axis, side, gap } = contact;
  const closing = Math.max(0, -player.vel[axis] * side);
  if (gap > closing * dt + 0.12) return;
  // Part of the speed that hits the wall is kept to carry the body over the lip.
  const carry = THREE.MathUtils.clamp(closing * 0.4, 4, 9);
  ledgeClimb = { box, axis, side, carry };
}
function updateLedgeClimb(dt) {
  const { box, axis, side, carry } = ledgeClimb;
  const other = axis === "x" ? "z" : "x";
  if (player.pos.y - 0.9 >= box.max.y) {
    // The feet have cleared the lip: step over it with the stored speed.
    player.vel[axis] = -side * carry;
    hook.ledge.climbed = true;
    ledgeClimb = null;
    return;
  }
  const contact = ledgeContact(box);
  if (!contact || contact.axis !== axis || contact.gap > 0.3) {
    ledgeClimb = null; // Pushed off the face; the rope takes over again.
    return;
  }
  // Grip the face: skid along it dies within a few ticks, and a gentle drift
  // keeps the body over the roof when it hit the wall near a corner.
  const inside = THREE.MathUtils.clamp(player.pos[other], box.min[other] + 0.6, box.max[other] - 0.6);
  const drift = THREE.MathUtils.clamp((inside - player.pos[other]) * 12, -6, 6);
  player.vel[other] = drift + (player.vel[other] - drift) * Math.exp(-40 * dt);
  player.vel[axis] = -side * 3; // Stay pressed against the wall.
  // Climb fast, then ease off so the feet arrive just above the lip.
  const rise = Math.max(0, box.max.y + 0.9 + 0.1 - player.pos.y);
  const target = Math.min(t.ledgeClimbSpeed, Math.sqrt(2 * 100 * rise), 20 * rise);
  player.vel.y = player.vel.y < target ? Math.min(target, player.vel.y + 200 * dt) : target;
  player.grounded = false;
}

function yank() {
  if (hook.state !== "zip" || !hook.target || hook.target.dead) return;
  const d = hook.target;
  const direction = d.pos.clone().sub(player.pos).setY(0).normalize();
  const destination = player.pos.clone().addScaledVector(direction, 3);
  // A fixed flight time gives a readable arc and lands near the chosen point.
  const flight = 1.1;
  const horizontalScale = 1.5 / (1 - Math.exp(-1.5 * flight));
  d.vel.set((destination.x - d.pos.x) * horizontalScale,
    (destination.y - d.pos.y + 12 * flight * flight) / flight,
    (destination.z - d.pos.z) * horizontalScale);
  d.displaced = 3;
  if (bowlMap) d.tug = 0;
  d.returning = true;
  releaseHook();
}
function gunSpread() {
  const speedFactor = THREE.MathUtils.clamp((player.vel.length() - 6) / 19, 0, 1);
  return THREE.MathUtils.lerp(t.gunSpreadSlow, t.gunSpreadFast, (!player.grounded || ["swing", "zip"].includes(hook.state)) ? Math.max(speedFactor, hook.state === "swing" || hook.state === "zip" ? 1 : 0) : speedFactor);
}
function shoot() {
  if (
    player.gun > 0 ||
    player.reload > 0 ||
    (hook.state === "swing" && hook.prize) || hook.state === "revive"
  )
    return;
  if (player.ammo <= 0) {
    reload();
    return;
  }
  player.ammo--;
  if (bowlMap) bots.hear(player.team, player.pos);
  player.gun = 1 / t.gunRate;
  const dir = forward();
  const spread = gunSpread();
  dir
    .add(
      new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
      ),
    )
    .normalize();
  const origin = third
    ? camera.position
    : player.pos.clone().add(new THREE.Vector3(0, 0.55, 0));
  const range = 160 + (third ? 4 : 0);
  const hit = intersections(origin, dir, range, third);
  const muzzle = third && contestant?.model.userData.muzzle
    ? contestant.model.userData.muzzle.getWorldPosition(new THREE.Vector3())
    : origin.clone().addScaledVector(dir, 0.6).add(new THREE.Vector3(0, -0.15, 0));
  showTracer(muzzle, hit ? hit.point : origin.clone().addScaledVector(dir, range), Boolean(hit));
  if (hit?.object.userData.dummy)
    dummies.damage(hit.object.userData.dummy, t.gunDamage * (1 - 0.4 * THREE.MathUtils.clamp((origin.distanceTo(hit.point) - 30) / 30, 0, 1)), "gun");
}
function reload() {
  if (player.reload <= 0 && player.ammo < t.magazine)
    player.reload = t.reloadTime;
}
function action(name, down = true, internal = false) {
  if (!internal) { if (down) held.add(name); else held.delete(name); }
  // While dead, ignore presses but still take releases, or keys let go during the wait stay held.
  if (bowlMap && down && name !== "camera" && (jackpot.phase !== "active" || player.status === "eliminated" || (player.status === "knocked" && !["forward", "back", "left", "right"].includes(name)))) return;
  if (bowlMap && down && name === "reset" && !internal) return;
  if (["jump", "whip", "yank"].includes(name)) {
    if (down) keys.add(name); else keys.delete(name);
  }
  if (name === "hook") {
    // Key repeats are filtered at keydown, so every press here is a fresh press.
    if (down) { keys.add("hook"); if (!fireHook()) hook.buffer = 0.15; }
    else { hook.buffer = 0; keys.delete("hook"); if (hook.state !== "ready") releaseHook({ clean: true }); }
  } else if (name === "jump" && down) {
    if (hook.state === "swing" || hook.state === "zip") grappleJump();
    else if (!mantle && !ledgeClimb) { player.jumpBuffer = 0.12; wallJump.buffer = 0.1; }
  } else if (name === "whip" && down) whip();
  else if (name === "melee" && down) melee();
  else if (name === "yank" && down) yank();
  else if (name === "fire") {
    if (down) {
      keys.add("fire");
      shoot();
    } else keys.delete("fire");
  } else if (name === "camera" && down) third = !third;
  else if (name === "shoulder" && down) shoulder = shoulder === "right" ? "left" : "right";
  else if (name === "reload" && down) reload();
  else if (name === "reset" && down) {
    player.pos.copy(bowlMap ? world.spawnPoints[player.team] : new THREE.Vector3(0, 0.9, 4));
    player.vel.set(0, 0, 0);
    hook.state = "ready";
    refillHookCharges();
    hook.refireDelay = 0;
    hook.buffer = 0;
    keys.delete("hook");
    player.landingSlide = 0;
    player.slideBoostCooldown = 0;
    hook.target = null;
    hitstop = 0;
    player.whip = 0; player.melee = 0; meleeActive = 0;
    player.cancel = 0;
    player.jumpBuffer = 0;
    wallJump.contact = wallJump.last = null;
    wallJump.coyote = wallJump.buffer = wallJump.display = 0;
    whipActive = 0;
    whipBuffered = false;
    whipChain = 0; whipAge = Infinity; whipCancelled = false; whipRefunded = false;
    whipHits.clear();
    mantle = null;
    ledgeClimb = null;
    hook.ledge = null;
    lastSafe.copy(player.pos);
  } else if (["forward", "back", "left", "right", "slide"].includes(name)) {
    down ? keys.add(name) : keys.delete(name);
  }
}
function eliminatePlayer(source, attacker = { name: "#7" }) {
  if (player.status === "eliminated") return;
  if (attacker?.name && attacker.name !== "#7") { killer = { name: attacker.name, team: attacker.team, how: source === "ringout" ? "fall" : source }; killerTime = 3; }
  spectatorIndex = 0; spectateKillerTime = killer ? 2 : 0;
  player.status = "eliminated"; jackpot.dead = true; player.hp = 0; jackpot.tug.progress = 0;
  player.vel.set(0, 0, 0); releaseHook();
  hud.message(source === "ringout" ? "WIPEOUT!" : "ELIMINATED #7");
  hud.feed(source === "ringout" ? "#7 fell off the set" : source === "bleed" ? "#7 bled out" : source === "wipe" ? "#7 out (team wipe)" : `${attacker.name} eliminated #7`);
}
function revivePlayer(reviver) {
  if (player.status !== "knocked") return;
  player.status = "alive"; player.hp = 40; player.knockedHp = 50; player.damageDelay = t.healthRegenDelay;
  restoreHeld();
  hud.feed(`${reviver} revived #7`);
}
function damagePlayer(amount, attacker, source) {
  if (player.status === "eliminated" || (bowlMap && world.inSpawn(player.pos, player.team))) return;
  if (source === "gun" && (hook.state === "swing" || hook.state === "zip" || player.vel.length() > 25)) amount *= t.gunVsDiver;
  if (player.status === "knocked") player.knockedHp = Math.max(0, player.knockedHp - amount);
  else player.hp = Math.max(0, player.hp - amount);
  player.damageDelay = t.healthRegenDelay;
  hud.damage(attacker.pos, player.pos, player.yaw);
  if (source === "whip" || source === "melee") { jackpot.tug.progress = 0; releaseHook(); }
  if (player.status === "knocked" && player.knockedHp <= 0) eliminatePlayer(source, attacker);
  else if (player.status === "alive" && player.hp <= 0) {
    player.status = "knocked"; player.knockedHp = 50; player.vel.multiplyScalar(0.2); releaseHook(); keys.clear();
    killer = { name: attacker.name, team: attacker.team, how: source }; killerTime = 3; restoreHeld();
    hud.message("KNOCKED"); hud.feed(`${attacker.name} ${source === "melee" ? "kicked" : "knocked"} #7`);
  }
}
const botEvents = [];
if (bowlMap) bots = createBots(scene, world, {
  hit: (amount, pos, source) => notifyDummy("damage", amount, pos.clone().add(new THREE.Vector3(0, 2, 0)), source),
  kill: (name, source) => { if (source !== "whip" && source !== "melee") refillHookCharges(); hud.message(`ELIMINATED ${name}`); },
  players: () => onlineTeam ? online.all : [],
  remoteDamage: (target, amount, source, bot) => online?.damage(target, amount, source, Math.atan2(-bot.facing.x, -bot.facing.z)),
  remoteRevive: (target) => online?.sendEvent({t:"revive",to:target.id}),
  feed: (message) => { botEvents.push({ round: jackpot.number, time: t.roundTime - jackpot.roundTimer, message }); hud.feed(message); }, claim: (team) => forceClaim(team), damagePlayer, revivePlayer,
});
const jackpot = { barriers: { team: null, progress: 0 }, holder: null, guarded: false, clock: 0, tug: { team: null, progress: 0 }, score: { rockets: 0, comets: 0 }, phase: "countdown", timer: 3, roundTimer: t.roundTime, number: 1, suddenDeath: false, dead: false };
if (onlineTeam) online.onEvent((message) => {
  if (message.t === "start") { waiting = false; if (online.isHost) resetRound(); }
  if (message.t === "bot-hit" && online.isHost) { const bot=bots.all.find(b=>b.number===message.number); if(bot && bot.team !== message.attackerTeam && Number.isFinite(message.amount)) bots.damage(bot, Math.max(0,Math.min(100,message.amount)), message.source, "PLAYER"); }
  if (message.t === "claim" && online.isHost) forceClaim(message.team);
  if (message.t === "wipe" && message.to === online.id && player.status === "knocked") eliminatePlayer("wipe");
  if (message.t === "revive") { if (message.to && message.to === online.id) revivePlayer("Teammate"); else if (online.isHost && message.number) { const bot=bots.all.find(b=>b.number===message.number); if(bot) bots.revive(bot,"Teammate"); } }
  if (message.t === "snapshot" && !online.isHost && message.round) {
    const wasPhase=jackpot.phase, wasNumber=jackpot.number;
    if (message.round.number !== wasNumber && message.round.phase === "countdown") resetRound();
    const localDead = jackpot.dead, localTug = jackpot.tug;
    Object.assign(jackpot, message.round); jackpot.dead=localDead; jackpot.tug=localTug;
    if(wasPhase!=="active" && jackpot.phase==="active") restoreHeld();
    bots.configure(message.slots, message.bots);
    for(const data of message.actors || []) { const b=bots.all.find(x=>x.number===data.number); if(!b) continue; b.pos.fromArray(data.pos); b.vel.fromArray(data.vel); b.group.position.copy(b.pos); b.group.visible=!data.dead; b.dead=data.dead; b.status=data.status; b.hp=data.hp; b.knockedHp=data.knockedHp; b.state=data.state; b.grounded=data.grounded; b.facing.fromArray(data.facing); }
    world.updateBarriers(jackpot.barriers.progress,jackpot.barriers.team,[player,...bots.all]);
  }
});
function winRound(team, reason) {
  if (jackpot.phase !== "active") return;
  botEvents.push({ round: jackpot.number, time: t.roundTime - jackpot.roundTimer, winner: team });
  jackpot.result = { team, reason };
  jackpot.score[team]++; jackpot.winner = team; jackpot.tug.progress = 0;
  hud.message(`${team.toUpperCase()} WIN THE ROUND`);
  jackpot.phase = jackpot.score[team] >= t.bankTarget ? "winner" : "break";
  jackpot.timer = t.breakTime; releaseHook(); keys.clear(); bots.hideRopes();
  for (const tracer of tracers) { tracer.life = 0; tracer.streak.visible = tracer.spark.visible = false; }
}
function forceClaim(team) {
  if (!bowlMap || !["rockets", "comets"].includes(team) || jackpot.phase !== "active") return;
  if (jackpot.suddenDeath) { jackpot.holder = team; winRound(team, "sudden"); return; }
  const snatch = jackpot.holder && jackpot.holder !== team;
  botEvents.push({ round: jackpot.number, time: t.roundTime - jackpot.roundTimer, claim: team, snatch: !!snatch });
  if (jackpot.holder === team) return;
  jackpot.clock = snatch ? Math.max(t.snatchFloor, jackpot.clock) : t.jackpotTime;
  jackpot.holder = team;
  world.podium.material.color.setHex(team === "rockets" ? 0xd75e59 : 0x608ddd);
  hud.message(snatch ? "SNATCHED!" : "JACKPOT!");
}
function resetRound() {
  jackpot.phase = "countdown"; jackpot.timer = 3; jackpot.roundTimer = t.roundTime; jackpot.suddenDeath = false;
  jackpot.holder = null; jackpot.guarded = false; jackpot.clock = 0; jackpot.dead = false; jackpot.tug.team = null; jackpot.tug.progress = 0;
  jackpot.barriers.team = null; jackpot.barriers.progress = 0; world.updateBarriers(0, null, []);
  world.prize.visible = true; world.prize.position.y = -0.3; world.podium.material.color.setHex(0xc7a43d);
  player.status = "alive"; player.hp = t.playerHealth; player.knockedHp = 50; player.damageDelay = 0;
  player.ammo = t.magazine; player.reload = 0; player.gun = 0; keys.clear();
  // Use the normal movement reset without allowing the reset key during a round.
  jackpot.phase = "active"; action("reset", true, true); jackpot.phase = "countdown";
  player.slide = false; slideEase = landingDip = landingTime = cameraPullback = 0; player.landingSlide = 0;
  killer = null; killerTime = 0;
  bots.resetAll();
}
function restartJackpot() {
  botEvents.length = 0;
  jackpot.score.rockets = jackpot.score.comets = 0; jackpot.number = 1; resetRound();
}
function updateJackpot(dt) {
  if (onlineTeam && !online.isHost) {
    const tugging = jackpot.phase === "active" && player.status === "alive" && hook.state === "swing" && hook.prize && Math.hypot(player.pos.x,player.pos.z)<=34 && jackpot.holder !== player.team;
    jackpot.tug.team=tugging ? player.team : null;
    jackpot.tug.progress=tugging ? Math.min(1,jackpot.tug.progress+dt/Math.max(.01,jackpot.holder?t.snatchTime:t.tugTime)) : 0;
    if(jackpot.tug.progress>=1){online.sendEvent({t:"claim",team:player.team});jackpot.tug.progress=0;}
    return;
  }
  const barriers = jackpot.barriers;
  const desired = jackpot.phase === "active" ? jackpot.holder : null;
  if (barriers.team !== desired && barriers.progress > 0) barriers.progress = Math.max(0, barriers.progress - dt / 0.6);
  else { barriers.team = desired; barriers.progress = Math.min(1, barriers.progress + (desired ? dt / 0.6 : 0)); }
  world.updateBarriers(barriers.progress, barriers.team, [player, ...bots.all]);
  if (jackpot.phase === "winner") return;
  if (jackpot.phase === "break") { jackpot.timer -= dt; if (jackpot.timer <= 0) { jackpot.number++; resetRound(); } return; }
  if (jackpot.phase === "countdown") { if (waiting) return; jackpot.timer = Math.max(0, jackpot.timer - dt); if (!jackpot.timer) { jackpot.phase = "active"; jackpot.result = null; restoreHeld(); } return; }
  // A team with nobody left standing can't revive anyone, so everyone knocked is out.
  const roster = [player, ...bots.all, ...(onlineTeam ? online.all : [])];
  const standing = (team) => roster.some(b => b.team === team && b.status === "alive");
  for (const team of ["rockets", "comets"]) {
    if (standing(team)) continue;
    for (const b of bots.all) if (b.team === team && b.status === "knocked") bots.damage(b, 0, "ringout", "TEAM WIPE");
    if (team === player.team && player.status === "knocked") eliminatePlayer("wipe");
    if (onlineTeam) for(const remote of online.all) if(remote.team === team && remote.status === "knocked") { remote.status="eliminated"; remote.dead=1; online.sendEvent({t:"wipe",to:remote.id}); }
  }
  const rockets = roster.some(b => b.team === "rockets" && b.status !== "eliminated");
  const comets = roster.some(b => b.team === "comets" && b.status !== "eliminated");
  if (onlineTeam && !roster.some(b=>b.team==="comets")) return;
  if (!rockets || !comets) { winRound(rockets ? "rockets" : "comets", "wipe"); return; }
  jackpot.roundTimer = Math.max(0, jackpot.roundTimer - dt);
  if (!jackpot.roundTimer && !jackpot.suddenDeath) {
    if (jackpot.holder) { winRound(jackpot.holder, "time"); return; }
    jackpot.suddenDeath = true; hud.message("SUDDEN DEATH · NEXT CLAIM WINS");
  }
  jackpot.guarded = !!jackpot.holder && [...roster].some((body) => body.team === jackpot.holder && body.status === "alive" && Math.hypot(body.pos.x, body.pos.z) < 22 && body.pos.y < 7);
  if (jackpot.holder && jackpot.guarded) { jackpot.clock = Math.max(0, jackpot.clock - dt); if (!jackpot.clock) { winRound(jackpot.holder, "bank"); return; } }
  const tugging = player.status === "alive" && hook.state === "swing" && hook.prize && Math.hypot(player.pos.x, player.pos.z) <= 34 && jackpot.holder !== player.team;
  jackpot.tug.team = tugging ? player.team : null;
  jackpot.tug.progress = tugging ? Math.min(1, jackpot.tug.progress + dt / Math.max(0.01, jackpot.holder ? t.snatchTime : t.tugTime)) : 0;
  if (jackpot.tug.progress >= 1) { forceClaim(player.team); jackpot.tug.progress = 0; jackpot.tug.team = null; }
}
function tick(dt) {
  if (!bowlMap && respawnTimer > 0) {
    respawnTimer -= dt;
    if (respawnTimer <= 0) { player.hp = t.playerHealth; player.status = "alive"; player.pos.set((Math.random()-.5)*24, 0.9, (Math.random()-.5)*24); player.vel.set(0,0,0); lastSafe.copy(player.pos); hud.message("BACK IN THE FIGHT"); }
    return;
  }
  if (!bowlMap) { player.damageDelay = Math.max(0, player.damageDelay - dt); if (!player.damageDelay) player.hp = Math.min(t.playerHealth, player.hp + t.healthRegenRate * dt); }
  if (killerTime > 0) killerTime = Math.max(0, killerTime - dt);
  if (spectateKillerTime > 0) spectateKillerTime = Math.max(0, spectateKillerTime - dt);
  if (bowlMap && jackpot.phase !== "active") { updateJackpot(dt); return; }
  if (bowlMap && jackpot.dead) { dummies.update(dt); updateJackpot(dt); return; }
  if (bowlMap && player.status === "knocked") {
    player.knockedHp -= 2.5 * dt;
    if (player.knockedHp <= 0) eliminatePlayer("bleed");
  }
  if (bowlMap) {
    player.damageDelay = Math.max(0, player.damageDelay - dt);
    if (!player.damageDelay && player.status === "alive") player.hp = Math.min(t.playerHealth, player.hp + t.healthRegenRate * dt);
  }
  if (hitstop > 0) {
    hitstop -= dt;
    return;
  }
  whipAge += dt;
  if (whipAge > t.whipCancelEnd && !whipCancelled) whipChain = 0;
  if (whipActive > 0) {
    updateWhip();
    whipActive = Math.max(0, whipActive - dt);
  }
  player.whip = Math.max(0, player.whip - dt);
  player.melee = Math.max(0, player.melee - dt);
  meleeActive = Math.max(0, meleeActive - dt);
  if (whipBuffered && player.whip === 0) whip();
  player.gun = Math.max(0, player.gun - dt);
  player.cancel = Math.max(0, player.cancel - dt);
  player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
  hook.refireDelay = Math.max(0, hook.refireDelay - dt);
  hook.charges = Math.min(hook.charges, maxHookCharges());
  if (hook.charges < maxHookCharges()) {
    hook.recharge += dt;
    if (hook.recharge >= Math.max(0.01, t.chargeTime)) {
      hook.recharge -= Math.max(0.01, t.chargeTime);
      addHookCharge();
    }
  } else hook.recharge = 0;
  hook.buffer = Math.max(0, hook.buffer - dt);
  player.slideBoostCooldown = Math.max(0, player.slideBoostCooldown - dt);
  player.landingSlide = Math.max(0, player.landingSlide - dt);
  // Only a fresh press (buffered briefly) throws; holding the button never auto-throws a second hook.
  if (hook.state === "ready" && hook.refireDelay === 0 && (t.unlimitedHooks || hook.charges > 0) && hook.buffer > 0) {
    hook.buffer = 0; fireHook();
  }
  arcTime = Math.max(0, arcTime - dt);
  updateTracers(dt);
  if (player.reload > 0) {
    player.reload -= dt;
    if (player.reload <= 0) player.ammo = t.magazine;
  }
  // Full auto: holding fire keeps shooting at gunRate.
  if (keys.has("fire")) shoot();
  const slide = keys.has("slide") && player.grounded;
  const horizontalSpeed = Math.hypot(player.vel.x, player.vel.z);
  if (slide && !player.slide && horizontalSpeed > 8 && horizontalSpeed < 18 && player.slideBoostCooldown === 0) {
    player.slideBoostCooldown = 1;
    player.vel.x *= t.slideBoost;
    player.vel.z *= t.slideBoost;
  }
  player.slide = slide;
  slideEase += (Number(slide) - slideEase) * Math.min(1, dt / 0.1);
  landingDip = Math.max(0, landingDip - dt * 1.8);
  // Steer toward the look direction, offset by A/D. Cost scales with actual turn angle.
  const steer = Number(keys.has("right")) - Number(keys.has("left"));
  if (horizontalSpeed > (slide ? 1 : 35) && (slide || (!player.grounded && steer))) {
    const angle = Math.atan2(player.vel.x, -player.vel.z);
    const target = -player.yaw + (slide ? steer * Math.PI / 2 : steer * Math.PI / 2 + angle);
    const difference = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
    const turn = THREE.MathUtils.clamp(difference, -(slide ? t.carveStrength : 0.45) * dt, (slide ? t.carveStrength : 0.45) * dt);
    const speed = Math.hypot(player.vel.x, player.vel.z) * Math.exp(-Math.abs(turn) * (slide ? t.carveSpeedCost : 0.04));
    player.vel.x = Math.sin(angle + turn) * speed;
    player.vel.z = -Math.cos(angle + turn) * speed;
  }
  if (
    player.grounded &&
    !player.cancel &&
    !player.jumpBuffer &&
    // A ledge rope goes slack once the climb is over, so the roof has grip.
    (hook.state !== "swing" || hook.ledge?.climbed) &&
    hook.state !== "zip"
  ) {
    const friction = slide || player.landingSlide > 0 ? t.slideFriction : t.friction;
    const factor = Math.max(0, 1 - friction * dt);
    player.vel.x *= factor;
    player.vel.z *= factor;
  }
  const wish = new THREE.Vector3(
    (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0),
    0,
    (keys.has("back") ? 1 : 0) - (keys.has("forward") ? 1 : 0),
  );
  if (wish.lengthSq()) {
    wish.normalize().applyAxisAngle(up, player.yaw);
    if (player.grounded && player.groundNormal.y < 0.82) {
      const uphill = new THREE.Vector3(-player.groundNormal.x, 0, -player.groundNormal.z).normalize();
      const component = wish.dot(uphill);
      if (component > 0) wish.addScaledVector(uphill, -component);
    }
    const speed = bowlMap && player.status === "knocked" ? 2 : player.grounded ? t.groundSpeed : t.airWishSpeed;
    const add = speed - player.vel.dot(wish);
    if (add > 0)
      player.vel.addScaledVector(
        wish,
        Math.min(add, (player.grounded ? t.groundAccel : t.airAccel) * dt),
      );
    if (hook.state === "swing") {
      // Steering acts across the rope, leaving radial pull to the grapple.
      const radial = hook.point.clone().sub(player.pos).normalize();
      const tangent = wish.clone().addScaledVector(radial, -wish.dot(radial));
      player.vel.addScaledVector(tangent, t.swingSteer * dt);
    }
  }
  updateWallJump(dt);
  if (player.grounded && player.groundNormal.y >= 0.6 && player.jumpBuffer > 0) {
    player.vel.y = t.jumpSpeed;
    player.grounded = false;
    player.jumpBuffer = wallJump.buffer = 0;
  }
  player.vel.y -= t.gravity * dt;
  if (hook.state === "flying") {
    const travel = Math.min(t.hookSpeed * dt, t.hookRange - hook.distance);
    let hit = intersections(hook.point, hook.dir, travel, false, true);
    if (hit && !hit.object.userData.dummy && hook.pendingTarget &&
        hit.point.distanceTo(hook.pendingTarget.pos) < 2.5) {
      hit = { point: hook.pendingTarget.pos.clone(), object: hook.pendingTarget.group };
    }
    if (hit) {
      hook.point.copy(hit.point);
      hook.pullPoint.copy(hit.point);
      const d = hit.object.userData.dummy;
      hook.prize = !!hit.object.userData.prize;
      hook.ground = !hook.prize && player.grounded && hit.point.y <= player.pos.y - 0.8;
      if (hook.ground && player.pos.distanceTo(hit.point) < 4) addHookCharge();
      showAnchorPuff(hit.point);
      hook.age = 0;
      hook.peakSpeed = player.vel.length();
      const toward = hook.point.clone().sub(player.pos).normalize();
      const velocityBeforeAttach = player.vel.clone();
      const speedBeforeAttach = velocityBeforeAttach.length();
      if (!hook.prize && !hook.ground) player.vel.addScaledVector(toward, t.attachKick);
      if (player.vel.lengthSq() < 1e-10 && speedBeforeAttach > 0) {
        player.vel.copy(velocityBeforeAttach);
      } else if (player.vel.length() < speedBeforeAttach) {
        player.vel.setLength(speedBeforeAttach);
      }
      fovKick = t.attachFov;
      if (d && bowlMap && d.team === player.team && d.status === "knocked") {
        player.vel.copy(velocityBeforeAttach); hook.state = "revive"; hook.target = d; hook.reviveProgress = 0;
      } else if (d) {
        hook.state = "zip";
        hook.target = d;
        hook.zipDir.copy(toward);
        player.grounded = false;
        player.vel.y = Math.max(player.vel.y, 3);
      } else {
        hook.ledge = null;
        const box = world.boxes.find((b) => b.mesh === hit.object);
        if (box && !hook.prize) setLedgePullPoint(box, hit.point);
        hook.state = "swing";
        hook.length = player.pos.distanceTo(hook.point);
      }
    } else {
      hook.point.addScaledVector(hook.dir, travel);
      hook.distance += travel;
      if (hook.distance >= t.hookRange) {
        hook.state = "ready";
      }
    }
  }
  if (hook.state === "revive") {
    const ally = hook.target;
    if (!ally || ally.status !== "knocked" || player.pos.distanceTo(ally.pos) > t.hookRange || world.blockedBySlope?.(player.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), ally.pos.clone().add(new THREE.Vector3(0, 0.6, 0)))) releaseHook();
    else {
      hook.point.copy(ally.pos); hook.reviveProgress += dt;
      const pull = player.pos.clone().sub(ally.pos).setY(0);
      const gap = pull.length() - 2;
      if (gap > 0) ally.pos.addScaledVector(pull.normalize(), Math.min(2 * dt, gap));
      if (hook.reviveProgress >= t.reviveTime) { if (onlineTeam && ally.id) online.sendEvent({t:"revive",to:ally.id}); else if (onlineTeam && !online.isHost) online.sendEvent({t:"revive",number:ally.number}); else bots.revive(ally, "#7"); releaseHook(); }
    }
  }
  if (hook.state === "zip") {
    if (!hook.target || hook.target.dead || hook.target.status === "knocked") {
      // No speed cap here: momentum is yours to keep (or to fly off the set with).
      releaseHook();
    } else {
      hook.point.copy(hook.target.pos);
      const diff = hook.point.clone().sub(player.pos),
        dist = diff.length();
      if (dist < 1.9) {
        dummies.damage(
          hook.target,
          Math.min(
            70,
            t.whipBase + t.whipSpeedDamage * player.vel.length(),
          ),
          "zip",
        );
        const direction = diff.normalize();
        player.vel.addScaledVector(direction, -player.vel.dot(direction) - 8);
        player.vel.y = Math.max(player.vel.y, 7);
        releaseHook();
      } else {
        const desired = diff.normalize();
        const angle = hook.zipDir.angleTo(desired);
        if (angle > 1e-6) {
          const axis = new THREE.Vector3().crossVectors(hook.zipDir, desired);
          if (axis.lengthSq() > 1e-10) hook.zipDir.applyAxisAngle(axis.normalize(), Math.min(angle, Math.PI / 2 * dt));
        }
        const dir = hook.zipDir;
        const along = player.vel.dot(dir);
        player.vel.addScaledVector(
          dir,
          Math.min(t.zipAccel * dt, Math.max(0, t.zipSpeed - along)),
        );
      }
    }
  }
  if (hook.state === "swing" || hook.state === "zip") {
    hook.age += dt;
    hook.peakSpeed = Math.max(hook.peakSpeed, player.vel.length());
  }
  if (hook.state === "swing") {
    const toward = hook.pullPoint.clone().sub(player.pos);
    const distance = hook.point.distanceTo(player.pos);
    if (hook.ground && distance < 1.1) { releaseHook(); }
    // Near a plain anchor the rope locks short; a ledge rope stays slack for the climb.
    if (hook.state !== "swing") { /* arrived */ } else if (distance < t.pullReleaseDistance && !hook.ground) {
      if (!hook.ledge) hook.length = Math.min(hook.length, distance);
    } else if (!hook.ledge?.climbed) {
      // A fading force adds momentum; gravity remains independent of the rope.
      const strength = Math.max(0, 1 - hook.age / Math.max(0.01, t.pullDuration));
      player.vel.addScaledVector(toward.clone().normalize(), t.pullAccel * strength * dt * (hook.prize ? 0.5 : hook.ground ? Math.min(1, distance / 3) : 1));
    }
    if (hook.state === "swing" && distance > 0 && distance >= hook.length - 0.05) {
      const radial = toward.normalize().negate();
      const outward = player.vel.dot(radial);
      if (outward > 0) player.vel.addScaledVector(radial, -outward);
    }
  }
  // Catch a ledge approach at the wall before collision can deflect it sideways.
  if (hook.state === "swing" && hook.ledge && !ledgeClimb && !mantle) tryLedgeClimb(dt);
  const wasGrounded = player.grounded;
  const fallSpeed = -player.vel.y;
  // The climb only steers velocity; collision still moves the body up the face.
  if (ledgeClimb) updateLedgeClimb(dt);
  else if (!mantle) tryMantle(dt);
  if (mantle) updateMantle(dt);
  else {
    const contact = {};
    player.grounded = moveBody(player.pos, player.vel, dt, world.boxes, 0.55, 0.9, world.slopes, contact);
    player.groundNormal.copy(contact.normal || up);
  }
  if (!wasGrounded && player.grounded) landingTime = 0.18;
  landingTime = Math.max(0, landingTime - dt);
  if (!wasGrounded && player.grounded) landingDip = Math.min(0.28, Math.max(0, fallSpeed - 3) * 0.012);
  if (!wasGrounded && player.grounded && Math.hypot(player.vel.x, player.vel.z) > t.groundSpeed)
    player.landingSlide = THREE.MathUtils.clamp(Math.hypot(player.vel.x, player.vel.z) / 45, 0.15, 0.8);
  if (hook.state === "swing" && !mantle && !ledgeClimb) {
    const delta = player.pos.clone().sub(hook.point),
      dist = delta.length();
    if (dist > hook.length) {
      const correction = delta
        .normalize()
        .multiplyScalar(-(dist - hook.length) / dt);
      moveBody(player.pos, correction, dt, world.boxes, 0.55, 0.9, world.slopes);
      const actual = player.pos.distanceTo(hook.point);
      if (actual > hook.length + 0.02) hook.length = actual;
      const radial = player.pos.clone().sub(hook.point).normalize(),
        out = player.vel.dot(radial);
      if (out > 0) player.vel.addScaledVector(radial, -out);
    }
  }
  if (bowlMap && Math.abs(Math.abs(player.pos.x) - 91) < 14 && Math.abs(player.pos.z) < 14 && player.pos.y > 9) { player.vel.z += (player.pos.z < 0 ? -1 : 1) * 35 * dt; }
  if (bowlMap && (player.pos.y - 0.9 < world.killHeight || (player.pos.y - 0.9 < world.ringOutHeight && Math.hypot(player.pos.x, player.pos.z) > 23))) {
    if (!jackpot.dead) eliminatePlayer("ringout");
  }
  if (!bowlMap && (Math.abs(player.pos.x) > 99 || Math.abs(player.pos.z) > 99 || player.pos.y - 0.9 < -10)) {
    player.pos.copy(lastSafe); player.vel.set(0, 0, 0); player.grounded = true;
    mantle = null; ledgeClimb = null;
    if (hook.state !== "ready") releaseHook();
  } else if (player.grounded && bodyClear(player.pos)) lastSafe.copy(player.pos);
  dummies.update(dt);
  if (bowlMap) updateJackpot(dt);

}
function render(dt) {
  for (const puff of anchorPuffs) if (puff.life > 0) { puff.life = Math.max(0, puff.life - dt); puff.mesh.material.opacity = puff.life / 0.25; puff.mesh.scale.setScalar(1 + (1 - puff.life / 0.25) * 4); puff.mesh.quaternion.copy(camera.quaternion); puff.mesh.visible = puff.life > 0; }
  const idle = bowlMap && jackpot.phase !== "active";
  contestant?.update(dt, {
    velocity: idle ? new THREE.Vector3() : player.vel, position: player.pos, target: hook.point,
    grounded: idle || player.grounded, slide: !idle && player.slide, hook: idle ? "ready" : hook.state,
    mantle: !!(mantle || ledgeClimb), walljump: wallJump.display > 0, landing: landingTime > 0, whip: whipActive > 0, melee: meleeActive,
    aim: forward(), gun: player.gun, status: idle ? "alive" : player.status,
    reviver: bowlMap ? bots.all.find((b) => b.reviveTarget === player)?.pos ?? null : null,
    lip: mantle ? mantle.raised.y - 0.91 : ledgeClimb ? ledgeClimb.box.max.y : null,
  });
  if (bowlMap) bots.pose(dt, camera, idle);
  const eye = player.pos.clone().add(new THREE.Vector3(0, 0.55 - slideEase * 0.22 - landingDip, 0)),
    f = forward();
  camera.position.copy(eye);
  // Keep the speed pull-back small so the contestant never looks tiny; only a hook earns more room.
  const pullbackTarget = Math.max(
    THREE.MathUtils.clamp((player.vel.length() - 10) / 30, 0, 1) * 0.9,
    hook.state === "swing" || hook.state === "zip" ? 1.5 : 0,
  );
  cameraPullback += (pullbackTarget - cameraPullback) * (1 - Math.exp(-dt / 0.4));
  if (third) {
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const cameraDistance = (side) => {
      // Knocked contestants lie on the floor, so back the camera off and up to keep the whole body in frame.
      const downed = bowlMap && player.status === "knocked" ? 1 : 0;
      const offset = f.clone().multiplyScalar(-({ near: 2.8, default: 4, far: 5.5 }[settings.distance]) - cameraPullback - downed).addScaledVector(right, side * (0.8 + cameraPullback * 0.25)).add(new THREE.Vector3(0, 0.5 + cameraPullback * 0.3 + downed * 0.4, 0));
      const length = offset.length(), direction = offset.normalize();
      let distance = length;
      // Offset rays approximate a camera sphere and catch nearby shoulder walls.
      for (const sample of [new THREE.Vector3(), right.clone().multiplyScalar(0.3), right.clone().multiplyScalar(-0.3), new THREE.Vector3(0, 0.3, 0)]) {
        ray.set(eye.clone().add(sample), direction); ray.near = 0; ray.far = length;
        const hit = ray.intersectObjects(world.meshes)[0];
        if (hit) distance = Math.min(distance, Math.max(0.1, hit.distance - 0.3));
      }
      return { direction, distance };
    };
    const rightView = cameraDistance(1), leftView = cameraDistance(-1);
    const preferred = shoulder === "left" ? leftView : rightView, alternate = shoulder === "left" ? rightView : leftView;
    const view = alternate.distance > preferred.distance + 0.2 ? alternate : preferred;
    camera.position.copy(eye).addScaledVector(view.direction, view.distance);
  }
  if (bowlMap && player.status === "eliminated") {
    const teammates = bots.all.filter((b) => b.team === player.team && b.status === "alive");
    teammates.sort((a, b) => a.pos.distanceToSquared(world.prize.position) - b.pos.distanceToSquared(world.prize.position));
    const watched = spectateKillerTime > 0 && killer ? bots.all.find((b) => b.name === killer.name && b.group.visible) : null;
    const chosen = watched || (teammates.length ? teammates[((spectatorIndex % teammates.length) + teammates.length) % teammates.length] : null);
    spectating = chosen?.name || null;
    const target = chosen?.pos || world.prize.position;
    camera.position.copy(target).add(new THREE.Vector3(0, 5, 9));
    camera.lookAt(target);
  }
  camera.rotation.order = "YXZ";
  const sideSpeed =
    player.vel.x * Math.cos(player.yaw) - player.vel.z * Math.sin(player.yaw);
  const targetRoll =
    hook.state === "swing"
      ? THREE.MathUtils.clamp(-sideSpeed / 30, -1, 1) *
        THREE.MathUtils.degToRad(t.swingTilt)
      : 0;
  roll = THREE.MathUtils.lerp(roll, targetRoll, Math.min(1, dt * 5));
  camera.rotation.set(player.pitch + kick, player.yaw, roll);
  kick = Math.max(0, kick - dt * 0.15);
  camera.fov = THREE.MathUtils.lerp(
    camera.fov,
    t.baseFov + (settings.fov - 72) + Math.min(15, player.vel.length() * t.speedFov) + fovKick + slideEase * 2,
    Math.min(1, dt * 5),
  );
  fovKick = Math.max(0, fovKick - dt * 12);
  if (bowlMap && player.status === "eliminated") {
    const teammates = bots.all.filter((b) => b.team === player.team && b.status === "alive");
    camera.lookAt(bots.all.find((b) => b.name === spectating)?.pos || world.prize.position);
  }
  camera.updateProjectionMatrix();
  body.visible = third && (!bowlMap || player.status !== "eliminated");
  body.position.copy(player.pos);

  rope.material.color.setHex(hook.prize ? 0xffcf33 : hook.point.y < player.pos.y ? 0xffffff : 0xffffdd);
  rope.material.depthTest = !hook.prize;
  rope.visible = hook.state !== "ready";
  if (rope.visible) {
    const start = third
      ? (contestant ? contestant.model.userData.reel.getWorldPosition(new THREE.Vector3()) : body.localToWorld(new THREE.Vector3(0.4, 0.3, 0)))
      : eye.clone().add(new THREE.Vector3(0.3, -0.35, -0.25).applyAxisAngle(up, player.yaw));
    const segment = hook.point.clone().sub(start);
    rope.position.copy(start).addScaledVector(segment, 0.5);
    rope.scale.set(1, segment.length(), 1);
    if (segment.lengthSq()) rope.quaternion.setFromUnitVectors(up, segment.normalize());
  }
  arc.visible = arcTime > 0;
  arc.material.opacity = 0.8 * arcTime / 0.12;
  arc.position.copy(eye).addScaledVector(f, 0.6);
  arc.rotation.set(-Math.PI / 2, 0, 0);
  arc.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(up, player.yaw + (1 - arcTime / 0.12) * 1.8 - 0.9));
  const hit = aimRay();
  aim = hit ? (hit.object.userData.dummy ? "dummy" : "world") : aimRay(160) ? "out" : "none";
  const reviver = bowlMap ? bots.all.find((b) => b.reviveTarget === player) : null;
  const projectedPrize = bowlMap ? world.prize.position.clone().project(camera) : null;
  hud.update(
    {
      show: { team: player.team, guarded: bowlMap && jackpot.guarded, whipChain, whipCancel: whipCancelOpen(), result: bowlMap ? jackpot.result || null : null,
        bleed: player.status === "knocked" ? Math.max(0, player.knockedHp / 2.5) : null,
        revive: hook.state === "revive" && hook.target ? { progress: Math.min(1, hook.reviveProgress / t.reviveTime), name: hook.target.name, role: "reviving" } : reviver ? { progress: Math.min(1, reviver.reviveProgress / t.reviveTime), name: reviver.name, role: "revived" } : null,
        killer: killer && (killerTime > 0 || player.status === "eliminated") ? killer : null, spectating, waiting,
        prize: projectedPrize ? { x: (projectedPrize.x + 1) * innerWidth / 2, y: (1 - projectedPrize.y) * innerHeight / 2, onScreen: projectedPrize.z <= 1 && Math.abs(projectedPrize.x) <= 1 && Math.abs(projectedPrize.y) <= 1, behind: projectedPrize.z > 1 } : null,
        hpFrac: THREE.MathUtils.clamp(player.hp / t.playerHealth, 0, 1) },
      speed: player.vel.length(),
      state: mantle || ledgeClimb ? "MANTLE" : hook.state === "zip" ? "ZIP" : hook.state === "swing" ? "HOOKED" : wallJump.display > 0 ? "WALL JUMP" : player.slide ? "SLIDE" : player.grounded ? "RUN" : "AIR",
      keys,
      hook: `HOOK ${t.unlimitedHooks ? "∞" : hook.charges}/${maxHookCharges()}`,
      charges: t.unlimitedHooks ? maxHookCharges() : hook.charges,
      maxCharges: maxHookCharges(),
      rechargeProgress: hook.recharge / Math.max(0.01, t.chargeTime),
      ammo: player.reload > 0 ? "RELOADING" : `${player.ammo} / ${t.magazine}`,
      aim,
      jackpot: bowlMap ? jackpot : null, statuses: bowlMap ? [player, ...bots.all, ...(onlineTeam ? online.all : [])] : [], status: player.status,
      hp: player.status === "knocked" ? player.knockedHp : player.hp, dead: bowlMap && jackpot.dead,
    },
    dt,
  );
  if (bowlMap) world.updateClock(jackpot.phase === "break" ? String(Math.ceil(jackpot.timer)) : jackpot.holder ? String(Math.ceil(jackpot.clock)) : "--");
  renderer.render(scene, camera);
}
function boundActions(code) {
  return Object.keys(settings.bindings).filter((name) => settings.bindings[name].includes(code));
}
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  logInput("keydown", e.code);
  if (settingsMenu.open) { if (e.code === "KeyT" && (debug || !bowlMap)) hud.togglePanel(); return; }
  // macOS never sends keyup for keys pressed while Cmd is held, so they would stick.
  if (e.metaKey) { forgetKeys("cmd"); return; }
  if (debug && bowlMap && e.code === "KeyN") forceClaim("comets");
  else if (bowlMap && e.code === "Enter" && jackpot.phase === "winner") restartJackpot();
  else if (e.code === "KeyT" && (debug || !bowlMap)) hud.togglePanel();
  else if (e.code === "KeyH") hud.toggleControls();
  else if (e.code === "KeyR" && !boundActions(e.code).length) action("reset", true);
  else for (const name of boundActions(e.code)) { e.preventDefault(); action(name, true); }
});
addEventListener("keyup", (e) => {
  logInput("keyup", e.code);
  for (const name of boundActions(e.code)) action(name, false);
});
// Safari can drop keyups when focus or pointer lock changes (either way); forget held keys then.
function forgetKeys(reason) { if (keys.size) logInput(`forget(${reason})`, [...keys].join("+")); keys.clear(); held.clear(); hook.buffer = 0; }
addEventListener("blur", () => forgetKeys("blur"));
document.addEventListener("visibilitychange", () => forgetKeys("hidden"));
document.addEventListener("pointerlockchange", () => { if (document.pointerLockElement === renderer.domElement) restoreHeld(); else forgetKeys("lock"); });
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
renderer.domElement.addEventListener("auxclick", (e) => e.preventDefault());
// Recent key and mouse events, for diagnosing input problems from the console (__game.inputLog).
const inputLog = [];
function logInput(type, button) {
  inputLog.push(`${performance.now().toFixed(0)} ${type} ${button} ${hook.state}/${hook.charges}`);
  if (inputLog.length > 80) inputLog.shift();
}
let hookReleaseTimer = 0;
renderer.domElement.addEventListener("mousedown", (e) => {
  if (e.button >= 3) e.preventDefault();
  if (bowlMap && player.status === "eliminated" && (e.button === 0 || e.button === 2)) { spectateKillerTime = 0; spectatorIndex += e.button === 0 ? 1 : -1; return; }
  if (document.pointerLockElement !== renderer.domElement) {
    if (!onlineTeam) waiting = false;
    renderer.domElement.requestPointerLock();
    return;
  }
  logInput("down", e.button);
  for (const name of boundActions(`Mouse${e.button}`)) {
    // A bouncy button sends down-up-down within a few ms; treat that as one held hook, not two throws.
    if (name === "hook" && hookReleaseTimer) { clearTimeout(hookReleaseTimer); hookReleaseTimer = 0; logInput("bounce", e.button); continue; }
    action(name, true);
  }
});
addEventListener("mouseup", (e) => {
  if (e.button >= 3 && document.pointerLockElement === renderer.domElement) e.preventDefault();
  logInput("up", e.button);
  for (const name of boundActions(`Mouse${e.button}`)) {
    if (name === "hook") {
      clearTimeout(hookReleaseTimer);
      hookReleaseTimer = setTimeout(() => { hookReleaseTimer = 0; action("hook", false); }, 40);
    } else action(name, false);
  }
});
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
    const sensitivity =
      t.sensitivity * settings.sensitivity * (e.buttons !== 0 ? settings.heldSensitivity * t.heldSensitivity / tuningHeldDefault : 1);
    player.yaw -= e.movementX * sensitivity;
    player.pitch = THREE.MathUtils.clamp(
      player.pitch - e.movementY * sensitivity * (settings.invertY ? -1 : 1),
      -1.5,
      1.5,
    );
  }
});
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const vec = (v) => ({ x: v.x, y: v.y, z: v.z });
window.__game = {
  online: () => online,
  inputLog,
  settings,
  state: () => ({
    effectiveSensitivity: t.sensitivity * settings.sensitivity,
    look: { yaw: player.yaw, pitch: player.pitch },
    cameraFov: camera.fov,
    map: bowlMap ? "bowl" : "practice",
    round: bowlMap ? { number: jackpot.number, score: { ...jackpot.score }, timer: jackpot.roundTimer, phase: jackpot.phase, suddenDeath: jackpot.suddenDeath } : null,
    gunSpread: gunSpread(),
    jackpot: bowlMap ? { barriers: { ...jackpot.barriers }, holder: jackpot.holder, guarded: jackpot.guarded, clock: jackpot.clock, tug: { ...jackpot.tug }, score: { ...jackpot.score }, phase: jackpot.phase } : null,
    player: {
      position: vec(player.pos),
      hp: player.hp, status: player.status, knockedHp: player.knockedHp, dead: bowlMap && jackpot.dead,
      velocity: vec(player.vel),
      speed: player.vel.length(),
      grounded: player.grounded, slide: player.slide,
      groundNormal: vec(player.groundNormal),
      whipChain, whipCancel: whipCancelOpen(), whipCooldown: player.whip,
      ammo: player.ammo,
      animation: contestant?.animation ?? "loading",
      screenPosition: vec(player.pos.clone().project(camera)),
    },
    hook: {
      state: hook.state,
      charges: hook.charges,
      rechargeProgress: hook.recharge / Math.max(0.01, t.chargeTime),
      point: vec(hook.point),
      length: hook.length,
      target: hook.target?.name,
      age: hook.age,
      peakSpeed: hook.peakSpeed,
    },
    bots: bowlMap ? bots.all.map((b) => ({ name: b.name, number: b.number, animation: b.visual?.animation ?? "loading", target: b.target ? b.target.name || "#7" : null, team: b.team, role: b.role, personality: b.personality, perch: b.perch, perches: [...b.perches], climbs: b.climbs, pos: vec(b.pos), hp: b.hp, status: b.status, knockedHp: b.knockedHp, state: b.state, dbg: { ...b.dbg } })) : [],
    dummies: dummies.all.map((d) => ({
      name: d.name,
      position: vec(d.pos),
      velocity: vec(d.vel),
      hp: d.hp,
      dead: d.dead,
    })),
    camera: third ? "third" : "first",
    aim,
  }),
  setPosition: (x, y, z) => {
    player.pos.set(x, y, z);
    player.grounded = false;
  },
  setVelocity: (x, y, z) => player.vel.set(x, y, z),
  setLook: (yaw, pitch) => {
    player.yaw = yaw;
    player.pitch = pitch;
  },
  lookAt: (x, y, z) => lookAtPoint(new THREE.Vector3(x, y, z)),
  press: (n) => action(n, true),
  release: (n) => action(n, false),
  step: (n) => {
    manual = true; waiting = false;
    for (let i = 0; i < n; i++) tick(1 / 120);
    render(n / 120);
    return window.__game.state();
  },
  resume: () => {
    manual = false;
    last = performance.now();
    acc = 0;
  },
  // Test fixtures use the same collision and raycast representation as the world.
  addTestBox: (x, y, z, width, height, depth) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
    mesh.position.set(x, y, z);
    scene.add(mesh);
    world.meshes.push(mesh);
    world.boxes.push({
      min: new THREE.Vector3(x - width / 2, y - height / 2, z - depth / 2),
      max: new THREE.Vector3(x + width / 2, y + height / 2, z + depth / 2),
      mesh,
    });
  },
  bowlCoverNames: () => world.boxes.map((b) => b.mesh.name).filter(Boolean),
  // Intersect a vertical ray with the same ground colliders used by movement.
  groundAt: (x, z, fromY = 2) => {
    let height = -Infinity;
    for (const b of world.groundBoxes ?? []) {
      if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y <= fromY)
        height = Math.max(height, b.max.y);
    }
    for (const slope of world.groundSlopes ?? []) {
      let y;
      if (slope.radial) {
        const r = Math.hypot(x, z);
        if (r > 34) continue;
        y = bowlHeight(x, z);
      } else {
        const dx = x - slope.x, dz = z - slope.z;
        const along = dx * slope.dx + dz * slope.dz, across = -dx * slope.dz + dz * slope.dx;
        if (along < 0 || along > slope.length || Math.abs(across) > slope.width / 2) continue;
        y = slope.low + slope.rise * along / slope.length;
      }
      if (y <= fromY) height = Math.max(height, y);
    }
    return Number.isFinite(height) ? height : null;
  },
  bowlLineBlocked: (from, to) => {
    const start = new THREE.Vector3(...from), delta = new THREE.Vector3(...to).sub(start);
    const distance = delta.length(), ray = new THREE.Ray(start, delta.normalize()), hit = new THREE.Vector3();
    return world.blockedBySlope?.(start, new THREE.Vector3(...to)) || world.boxes.some((b) => {
      const point = ray.intersectBox(new THREE.Box3(b.min, b.max), hit);
      return point && point.distanceTo(start) < distance - 0.01;
    });
  },
  botsSeed: (value) => { if (bots) bots.seed(value); },
  botEvents: () => botEvents.map((event) => ({ ...event })),
  botsPause: (value) => { if (bots) bots.pause(value); },
  botsFreeze: (value) => { if (bots) bots.freeze(value); },
  botGoto: (number, nodes) => { if (bots) bots.goto(number, nodes); },
  botSkill: (value) => { if (bots) bots.skill(value); },
  setPlayerHP: (hp) => { if (bowlMap) { player.hp = Math.max(0, hp); if (!player.hp && player.status === "alive") { player.status = "knocked"; player.knockedHp = 50; releaseHook(); keys.clear(); } } },
  setBotHP: (number, hp) => { const b = bots?.all.find((d) => d.number === Number(String(number).replace("#", ""))); if (b) { b.hp = Math.max(0, hp); if (!b.hp && b.status === "alive") { b.hp = 1; bots.damage(b, 1, "test"); } } },
  knockBot: (number) => { const b = bots?.all.find((d) => d.number === Number(String(number).replace("#", ""))); if (b && b.status === "alive") { b.hp = 1; bots.damage(b, 1, "test"); } },
  damageBot: (number, amount, source = "gun") => { const b = bots?.all.find((d) => d.number === Number(String(number).replace("#", ""))); if (b) bots.damage(b, amount, source); },
  testZipBot: (number) => { const b = bots?.all.find((d) => d.number === number); if (b) { hook.state = "zip"; hook.target = b; hook.point.copy(b.pos); } },
  testReviveBot: (number) => { const b = bots?.all.find((d) => d.number === Number(String(number).replace("#", ""))); if (b?.status === "knocked") { hook.state = "revive"; hook.target = b; hook.reviveProgress = 0; hook.point.copy(b.pos); } },
  setBotVelocity: (number, x, y, z) => { const b = bots?.all.find((d) => d.number === Number(String(number).replace("#", ""))); if (b) b.vel.set(x, y, z); },
  setBotPosition: (number, x, y, z) => { const b = bots?.all.find((d) => d.number === Number(String(number).replace("#", ""))); if (b) { b.pos.set(x, y, z); b.group.position.copy(b.pos); } },
  jackpotForceClaim: (team) => { if (bowlMap) forceClaim(team); },
  jackpotSetClock: (seconds) => { if (bowlMap) jackpot.clock = Math.max(0, seconds); },
  tuning: t,
};
let teamSnapshotTime=0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!manual && !settingsMenu.open) {
    acc += dt;
    while (acc >= 1 / 120) {
      tick(1 / 120);
      acc -= 1 / 120;
    }
  }
  settingsMenu.updateFps(dt);
  if (!bowlMap || onlineTeam) {
    if (onlineTeam && online.slot && !onlineSpawned) { player.team=online.slot % 2 ? "rockets" : "comets"; if(player.team === "comets") createContestant("blue",online.slot).then(visual => { if(contestant) body.remove(contestant.model); contestant=visual; body.add(visual.model); }); player.pos.copy(world.spawnPoints[player.team]); player.yaw=player.team === "rockets" ? -Math.PI/2 : Math.PI/2; lastSafe.copy(player.pos); onlineSpawned=true; }
    if (!onlineTeam && !onlineSpawned && online.slot) {
      const spawns = [[-4, 0.9, 4], [-4, 0.9, -8], [4, 0.9, 4], [4, 0.9, -8]];
      player.pos.fromArray(spawns[online.slot - 1]); player.yaw = online.slot % 2 === 0 ? Math.PI : 0; lastSafe.copy(player.pos); onlineSpawned = true;
    }
    if (onlineTeam && online.slot) {
      const slots=[online.slot,...online.all.map(p=>p.slot)]; bots.configure(slots, online.botsEnabled);
      if (online.isHost && online.started) { teamSnapshotTime += dt; if(teamSnapshotTime >= .12) { teamSnapshotTime=0; const round={...jackpot,dead:false,tug:{team:null,progress:0}}; online.sendEvent({t:"snapshot",round,slots,bots:online.botsEnabled,actors:bots.all.map(b=>({number:b.number,pos:b.pos.toArray(),vel:b.vel.toArray(),dead:b.dead,status:b.status,hp:b.hp,knockedHp:b.knockedHp,state:b.state,grounded:b.grounded,facing:b.facing.toArray()}))}); } }
    }
    online.update(dt, player, hook, onlineKills, onlineTeam ? player.status === "eliminated" : respawnTimer > 0, camera);
  }
  render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
