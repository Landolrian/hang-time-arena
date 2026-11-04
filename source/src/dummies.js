import * as THREE from "three";
import { moveBody } from "./world.js";
import { createContestant } from "./contestant.js";
import { tuning } from "./tuning.js";
export function createDummies(scene, world, notify) {
  const all = [];
  function add(name, x, y, z, kind = "static") {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xc5c8c6 });
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.48, 0.9, 4, 8),
      mat,
    );
    body.position.y = 0.15;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), mat);
    head.position.y = 1.15;
    group.add(head);
    // Keep these exact meshes for raycasts; only their rendering is replaced.
    mat.visible = false;
    createContestant("blue", 12).then((visual) => {
      group.add(visual.model);
      d.visual = visual;
      visual.model.traverse((mesh) => {
        if (!mesh.isMesh) return;
        mesh.raycast = () => {};
        if (!mesh.material.emissive) return;
        mesh.onBeforeRender = () => mesh.material.emissive.setHex(d.flash ? 0xff695f : 0x000000);
      });
    });
    scene.add(group);
    const d = {
      name,
      kind,
      group,
      mat,
      pos: new THREE.Vector3(x, y, z),
      spawn: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      hp: tuning.playerHealth,
      dead: 0,
      flash: 0,
      phase: 0,
      displaced: 0,
      returning: false,
    };
    group.position.copy(d.pos);
    group.userData.dummy = d;
    body.userData.dummy = d;
    head.userData.dummy = d;
    all.push(d);
  }
  if (world.spawnPoints) {
    add("toaster", 37, 18.9, -33);
    add("rim", 20, 8.9, 0);
    add("carton", 51, 24.9, 12);
    add("bowl", 4, -3.1, 3, "patrol");
  } else {
    add("static", 0, 0.9, -12);
    add("static2", -10, 0.9, -22);
    add("patrol", -30, 0.9, 10, "patrol");
    add("ledge", -35.3, 10.9, -25.9, "ledge");
    add("strafer", 22, 0.9, -18, "strafe");
  }
  let wave = 0;
  function damage(d, amount, source = "whip") {
    if (d.dead > 0) return;
    amount = Math.round(amount);
    d.hp -= amount;
    d.flash = 0.15;
    d.mat.color.setHex(0xff695f);
    notify("damage", amount, d.pos.clone().add(new THREE.Vector3(0, 2, 0)), source);
    if (d.hp <= 0) {
      d.dead = world.spawnPoints ? Math.max(0.01, tuning.respawnWave - wave) : 2;
      d.group.visible = false;
      notify("kill", d.name, null, source);
    }
  }
  function update(dt) {
    if (world.spawnPoints) wave = (wave + dt) % Math.max(0.01, tuning.respawnWave);
    for (const d of all) {
      if (d.dead > 0) {
        d.dead -= dt;
        if (d.dead <= 0) {
          d.dead = 0;
          d.hp = tuning.playerHealth;
          d.pos.copy(d.spawn);
          d.vel.set(0, 0, 0);
          d.group.visible = true;
          d.displaced = 0;
          d.returning = false;
        }
        continue;
      }
      d.phase += dt;
      d.flash = Math.max(0, d.flash - dt);
      d.mat.color.setHex(d.flash ? 0xff695f : 0xc5c8c6);
      d.visual?.update(dt, { velocity: new THREE.Vector3(), position: d.pos, target: d.pos,
        grounded: true, slide: false, hook: "ready", mantle: false, landing: false, whip: false });
      d.displaced = Math.max(0, d.displaced - dt);
      if (d.returning && !d.displaced) {
        // Walk home, including a gradual climb back onto the ledge.
        const home = d.spawn.clone().sub(d.pos);
        if (home.length() < 0.08) {
          d.pos.copy(d.spawn); d.vel.set(0, 0, 0); d.returning = false;
        } else {
          d.pos.addScaledVector(home, Math.min(4 * dt, home.length()) / home.length());
          d.group.position.copy(d.pos);
          continue;
        }
      }
      if (!d.displaced && (d.kind === "patrol" || d.kind === "strafe")) {
        d.vel.x =
          Math.cos(d.phase * (d.kind === "strafe" ? 2 : 0.5)) *
          (d.kind === "strafe" ? 4 : 2);
      } else {
        d.vel.x *= Math.exp(-1.5 * dt);
        d.vel.z *= Math.exp(-1.5 * dt);
      }
      d.vel.y -= 24 * dt;
      moveBody(d.pos, d.vel, dt, world.boxes, 0.48, 0.9, world.slopes);
      if (world.spawnPoints && (d.pos.y - 0.9 < world.killHeight || (d.pos.y - 0.9 < world.ringOutHeight && Math.hypot(d.pos.x, d.pos.z) > 23))) damage(d, d.hp, "ringout");
      d.group.position.copy(d.pos);
    }
  }
  function resetAll() {
    for (const d of all) {
      d.dead = 0; d.hp = tuning.playerHealth; d.pos.copy(d.spawn); d.vel.set(0, 0, 0);
      d.group.position.copy(d.pos); d.group.visible = true; d.displaced = 0; d.returning = false;
    }
  }
  return { all, damage, update, resetAll };
}
