// Scripted movement states for reviewing the contestant's animation set outside the game.
// Each scenario makes a fresh state object (the shape main.js passes to contestant.update) and
// steps it with simple physics. Used by tests/anim-viewer.html and tests/contestant.mjs.
import * as THREE from "three";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const G = 24, GUN_RATE = 4.5;
export const FORWARD = V(0, 0, -1); // the review camera looks down -z, like yaw 0 in the game

function base() {
  return {
    velocity: V(), position: V(0, 0.9, 0), target: V(), grounded: true, slide: false, hook: "ready",
    mantle: false, walljump: false, landing: false, whip: false, aim: FORWARD.clone(), gun: 0,
    status: "alive", reviver: null, lip: null,
    // review-only extras: floor height under the contestant, props to draw
    floor: 0, box: null, ally: null, firing: false,
  };
}
// Shared helpers for the step functions.
function fire(s, dt) {
  s.gun = Math.max(0, s.gun - dt);
  if (s.firing && s.gun <= 0) s.gun = 1 / GUN_RATE;
}
function integrate(s, dt) {
  if (!s.grounded) s.velocity.y -= G * dt;
  s.position.addScaledVector(s.velocity, dt);
  if (s.position.y - 0.9 <= s.floor && s.velocity.y <= 0) {
    if (!s.grounded) s.landingTime = 0.18;
    s.position.y = s.floor + 0.9; s.velocity.y = 0; s.grounded = true;
  }
  s.landingTime = Math.max(0, (s.landingTime ?? 0) - dt);
  s.landing = s.landingTime > 0;
}
const move = (s, t, dt) => integrate(s, dt);
const yawDir =(yaw) => V(-Math.sin(yaw), 0, -Math.cos(yaw));
const approach = (v, target, rate, dt) => v.lerp(target, 1 - Math.exp(-rate * dt));

// A rope pendulum: keeps the body on a sphere round the anchor and lets gravity swing it.
function pendulum(s, dt) {
  s.velocity.y -= G * dt;
  s.position.addScaledVector(s.velocity, dt);
  const r = s.position.clone().sub(s.target), len = s.ropeLength;
  if (r.length() > len) {
    r.setLength(len);
    s.position.copy(s.target).add(r);
    const n = r.normalize(), out = s.velocity.dot(n);
    if (out > 0) s.velocity.addScaledVector(n, -out);
  }
  s.grounded = false;
}

export const SCENARIOS = [
  // 1. Locomotion with the blaster
  { id: "idle", group: "Locomotion", label: "Idle (aim sweeps)", length: 4, step(s, t) { s.aim.copy(yawDir(Math.sin(t * 1.4) * 0.8)); } },
  { id: "jog", group: "Locomotion", label: "Jog 5 m/s", length: 3, init(s) { s.velocity.set(0, 0, -5); }, step: move },
  { id: "sprint", group: "Locomotion", label: "Sprint 10 m/s", length: 3, init(s) { s.velocity.set(0, 0, -10); }, step: move },
  { id: "startstop", group: "Locomotion", label: "Start / stop", length: 4, step(s, t, dt) {
    const want = t % 4 < 0.7 ? 0 : t % 4 < 2.2 ? 10 : 0;
    const v = s.velocity, speed = -v.z;
    v.z = -(want > speed ? Math.min(want, speed + 55 * dt) : Math.max(0, speed - Math.max(speed * 7, 6) * dt));
    integrate(s, dt);
  } },
  { id: "backpedal", group: "Locomotion", label: "Backpedal 5 m/s", length: 3, init(s) { s.velocity.set(0, 0, 5); }, step: move },
  { id: "strafeL", group: "Locomotion", label: "Strafe left 7 m/s", length: 3, init(s) { s.velocity.set(-7, 0, 0); }, step: move },
  { id: "strafeR", group: "Locomotion", label: "Strafe right 7 m/s", length: 3, init(s) { s.velocity.set(7, 0, 0); }, step: move },
  { id: "circle", group: "Locomotion", label: "Circle strafe (all directions)", length: 6, step(s, t, dt) {
    const a = t * (Math.PI * 2 / 6);
    s.velocity.set(Math.sin(a) * 8, 0, -Math.cos(a) * 8);
    s.firing = true; fire(s, dt);
    integrate(s, dt);
  } },
  { id: "crouch", group: "Locomotion", label: "Crouch walk", length: 4, step(s, t, dt) {
    s.slide = true;
    const a = Math.floor(t / 2) % 2 ? Math.PI / 2 : 0;
    s.velocity.copy(yawDir(a)).multiplyScalar(t % 2 < 0.4 ? 0 : 3);
    integrate(s, dt);
  } },
  // 2. Firing
  { id: "fireIdle", group: "Firing", label: "Fire standing", length: 3, step(s, t, dt) { s.firing = true; fire(s, dt); s.aim.copy(yawDir(Math.sin(t) * 0.3)).setY(Math.sin(t * 0.7) * 0.3).normalize(); } },
  { id: "fireRun", group: "Firing", label: "Fire on the run", length: 3, init(s) { s.velocity.set(0, 0, -8); }, step(s, t, dt) { s.firing = true; fire(s, dt); integrate(s, dt); } },
  { id: "fireStrafe", group: "Firing", label: "Fire strafing", length: 3, init(s) { s.velocity.set(7, 0, 0); }, step(s, t, dt) { s.firing = true; fire(s, dt); integrate(s, dt); } },
  // 3. Hook throw
  { id: "throw", group: "Hook", label: "Hook throw then swing", length: 3, init(s) { s.velocity.set(0, 0, -8); s.anchor = V(0, 15, -14); }, step(s, t, dt) {
    if (t < 0.35) { integrate(s, dt); s.hook = "ready"; return; }
    if (t < 0.55) {
      s.hook = "flying";
      const k = (t - 0.35) / 0.2;
      s.target.copy(s.position).add(V(0, 0.4, 0)).lerp(s.anchor, k);
      integrate(s, dt);
      return;
    }
    if (s.hook !== "swing") { s.hook = "swing"; s.target.copy(s.anchor); s.ropeLength = s.position.distanceTo(s.anchor); s.velocity.y = 4; s.position.y += 0.1; }
    pendulum(s, dt);
  } },
  // 4. Swing, ground pull, zip
  { id: "swing", group: "Hook", label: "Swing (full pendulum)", length: 4, init(s) { s.target.set(0, 17, -8); s.position.set(0, 9, 4); s.ropeLength = s.position.distanceTo(s.target); s.velocity.set(0, 0, -10); s.hook = "swing"; s.grounded = false; }, step(s, t, dt) { pendulum(s, dt); } },
  { id: "swingFire", group: "Hook", label: "Swing while firing", length: 4, init(s) { s.target.set(0, 17, -8); s.position.set(0, 9, 4); s.ropeLength = s.position.distanceTo(s.target); s.velocity.set(-4, 0, -10); s.hook = "swing"; s.grounded = false; }, step(s, t, dt) { s.firing = true; fire(s, dt); s.aim.copy(yawDir(0.5)); pendulum(s, dt); } },
  { id: "swingBehind", group: "Hook", label: "Swing past the anchor (anchor behind)", length: 3, init(s) { s.target.set(0, 14, 0); s.position.set(0, 7, -2); s.ropeLength = s.position.distanceTo(s.target); s.velocity.set(0, 6, -14); s.hook = "swing"; s.grounded = false; }, step(s, t, dt) { pendulum(s, dt); } },
  { id: "tow", group: "Hook", label: "Ground pull (anchor in the floor)", length: 3, init(s) { s.velocity.set(0, 0, -14); s.hook = "swing"; }, step(s, t, dt) { s.target.copy(s.position).add(V(0, -0.9, -9)); integrate(s, dt); } },
  { id: "slideHook", group: "Hook", label: "Slide hooked to a high anchor", length: 3, init(s) { s.velocity.set(0, 0, -18); s.hook = "swing"; s.slide = true; }, step(s, t, dt) { s.target.copy(s.position).add(V(2, 10, -12)); integrate(s, dt); } },
  { id: "zip", group: "Hook", label: "Zip to a point", length: 1.1, init(s) { s.position.set(0, 2, 0); s.hook = "zip"; s.grounded = false; s.target.set(0, 9, -40); }, step(s, t, dt) {
    const to = s.target.clone().sub(s.position).normalize();
    approach(s.velocity, to.multiplyScalar(36), 4, dt);
    s.position.addScaledVector(s.velocity, dt);
    s.grounded = false;
  } },
  // 5. Slide
  { id: "slide", group: "Slide", label: "Slide (run in, carve)", length: 3, init(s) { s.velocity.set(0, 0, -10); }, step(s, t, dt) {
    if (t > 0.4 && t < 2.6) {
      if (!s.slide) s.velocity.multiplyScalar(2.2);
      s.slide = true;
      s.velocity.applyAxisAngle(V(0, 1, 0), (t > 1.5 ? 0.5 : 0) * dt);
      s.velocity.multiplyScalar(Math.exp(-0.25 * dt));
    } else if (t >= 2.6) { s.slide = false; approach(s.velocity, s.velocity.clone().setLength(9), 6, dt); }
    integrate(s, dt);
  } },
  { id: "slideFire", group: "Slide", label: "Slide while firing", length: 3, init(s) { s.velocity.set(0, 0, -20); s.slide = true; }, step(s, t, dt) { s.firing = true; fire(s, dt); s.velocity.multiplyScalar(Math.exp(-0.2 * dt)); integrate(s, dt); } },
  // 6. Whip
  { id: "whip", group: "Whip", label: "Whip standing", length: 1.5, step(s, t) { s.whip = t > 0.3 && t < 0.42; } },
  { id: "whipFast", group: "Whip", label: "Whip at a sprint", length: 1.5, init(s) { s.velocity.set(0, 0, -12); }, step(s, t, dt) { s.whip = t > 0.4 && t < 0.52; integrate(s, dt); } },
  { id: "whipAir", group: "Whip", label: "Whip flying fast", length: 1.5, init(s) { s.position.y = 6; s.grounded = false; s.velocity.set(0, 4, -28); s.floor = -100; }, step(s, t, dt) { s.whip = t > 0.4 && t < 0.52; integrate(s, dt); } },
  // 7. Wall jump
  { id: "walljump", group: "Air", label: "Wall jump", length: 2.2, init(s) { s.position.set(-0.4, 3, 0); s.grounded = false; s.velocity.set(-3, 2, -8); s.floor = 0; s.wall = -1.0; }, step(s, t, dt) {
    if (t > 0.3 && !s.jumped) { s.jumped = true; s.velocity.set(8, 9, -8); s.wallT = 0; }
    s.wallT = (s.wallT ?? 9) + dt;
    s.walljump = s.wallT < 0.3;
    integrate(s, dt);
  } },
  // 9. Landings
  { id: "landSoft", group: "Air", label: "Soft landing", length: 2, init(s) { s.position.y = 2.2; s.grounded = false; s.velocity.set(0, 3, -5); }, step: move },
  { id: "landHard", group: "Air", label: "Hard landing (big drop)", length: 2.6, init(s) { s.position.y = 9; s.grounded = false; s.velocity.set(0, 0, -4); }, step(s, t, dt) { if (s.grounded) s.velocity.set(0, 0, 0); integrate(s, dt); } },
  { id: "jump", group: "Air", label: "Jump from a run", length: 2, init(s) { s.velocity.set(0, 0, -8); }, step(s, t, dt) { if (t > 0.3 && !s.jumped) { s.jumped = true; s.velocity.y = 9; s.grounded = false; } integrate(s, dt); } },
  // 8. Ledge climb
  { id: "mantle", group: "Climb", label: "Ledge climb (1.5 m lip)", length: 2.2, init(s) { s.velocity.set(0, 0, -6); s.box = { z0: -4, z1: -12, h: 1.5 }; }, step(s, t, dt) {
    const box = s.box;
    if (!s.climb && s.position.z - 0.55 <= box.z0 && s.position.y < box.h + 0.9) {
      s.climb = { start: s.position.clone(), elapsed: 0 };
      s.climb.raised = s.climb.start.clone().setY(box.h + 0.91);
      s.climb.end = s.climb.raised.clone().setZ(box.z0 - 0.6);
      s.grounded = false;
    }
    if (s.climb && s.climb.elapsed < 0.42) {
      s.mantle = true; s.lip = box.h;
      s.climb.elapsed += dt;
      const p = Math.min(1, s.climb.elapsed / 0.42);
      if (p < 0.6) s.position.lerpVectors(s.climb.start, s.climb.raised, p / 0.6);
      else s.position.lerpVectors(s.climb.raised, s.climb.end, (p - 0.6) / 0.4);
      if (p === 1) { s.mantle = false; s.lip = null; s.grounded = true; s.floor = box.h; }
      return;
    }
    s.mantle = false;
    integrate(s, dt);
  } },
  // 10-13. Knocked, revives, elimination
  { id: "knockdown", group: "Down", label: "Knocked down, then crawl", length: 4, init(s) { s.velocity.set(0, 0, -6); }, step(s, t, dt) {
    if (t > 0.5) { s.status = "knocked"; s.velocity.set(0, 0, t > 1.8 ? -2 : 0); }
    integrate(s, dt);
  } },
  { id: "crawl", group: "Down", label: "Knocked crawl", length: 3, init(s) { s.status = "knocked"; s.velocity.set(0, 0, -2); }, step: move },
  { id: "knocked", group: "Down", label: "Knocked idle", length: 3, init(s) { s.status = "knocked"; } },
  { id: "revived", group: "Down", label: "Being revived (dragged)", length: 3.5, init(s) { s.status = "knocked"; s.ally = V(0, 0.9, -7); }, step(s, t, dt) {
    s.reviver = t < 3.0 ? s.ally : null;
    if (t >= 3.0) s.status = "alive";
    const pull = s.ally.clone().sub(s.position).setY(0);
    const speed = s.reviver && pull.length() > 2 ? 2 : 0;
    s.velocity.copy(pull.normalize().multiplyScalar(speed));
    integrate(s, dt);
  } },
  { id: "reviving", group: "Down", label: "Reviving a teammate (reeling)", length: 3, init(s) { s.hook = "revive"; s.ally = V(0.5, 0.9, -6); }, step(s, t, dt) {
    s.ally.z = Math.min(-2, s.ally.z + 2 * dt);
    s.target.copy(s.ally);
    s.velocity.set(0, 0, 0);
    integrate(s, dt);
  } },
  { id: "death", group: "Down", label: "Eliminated from a run", length: 3, init(s) { s.velocity.set(0, 0, -7); }, step(s, t, dt) {
    if (t > 0.5) { s.status = "eliminated"; s.velocity.multiplyScalar(Math.exp(-4 * dt)); }
    integrate(s, dt);
  } },
  { id: "deathKnocked", group: "Down", label: "Eliminated while knocked", length: 3, init(s) { s.status = "knocked"; s.velocity.set(0, 0, -2); }, step(s, t, dt) {
    if (t > 1) { s.status = "eliminated"; s.velocity.set(0, 0, 0); }
    integrate(s, dt);
  } },
];

/** A fresh state for scenario `id`, with its step function bound. */
export function startScenario(id) {
  const sc = SCENARIOS.find((x) => x.id === id);
  const s = base();
  sc.init?.(s);
  s.firing ||= false;
  return { scenario: sc, state: s, time: 0, step(dt) { this.time += dt; (sc.step ?? (() => {}))(s, this.time, dt); } };
}
