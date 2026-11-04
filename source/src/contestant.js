import * as THREE from "three";
import { makeContestant, setVariant, TEAMS } from "./looktest/contestant.js";
import { shared } from "./looktest/toon.js";
import { loadClips } from "./anim/library.js";
import { fontsReady, numberTexture, helmetTexture, makeBlaster, makeLauncher, makeCable, makeDust } from "./anim/gear.js";
import { aimBone, chain, twoBoneIK, rotateWorld, setWorldQuaternion } from "./anim/ik.js";

// The animated contestant. A base layer of mocap clips (Quaternius UAL1/UAL2 and retargeted
// KayKit, all CC0) is blended by hand with phase-synced locomotion, then procedural layers pose
// it from the game state: spine and head follow the aim, the right hand carries the blaster
// (two-bone IK to its grips, with recoil), the left arm owns the grapple (throw, rope, whip,
// reeling), and full-body poses cover swinging, zips, tows, slides, climbs, knocks and revives.
//
// update(dt, state) takes the game's movement state. Fields after `whip` are optional:
//   velocity, position, target (hook point), grounded, slide, hook ("ready" | "flying" | "swing"
//   | "zip" | "revive"), mantle, walljump, landing, whip,
//   aim       world look direction (Vector3); without it the contestant faces its travel
//   gun       the gun's refire timer: each rise is a shot (player.gun, or a bot's cooldown)
//   status    "alive" | "knocked" | "eliminated"
//   reviver   world position of whoever is reeling this knocked contestant in
//   lip       height of the ledge being climbed (mantle or ledge climb)

const base = "/assets/looktest/chars/ubc/";
const options = (team, number) => ({
  body: `${base}Superhero_Male_FullBody.gltf`,
  skin: `${base}T_Superhero_Male_Ligh.png`,
  team: TEAMS[team], number, variant: "final", tweaks: {},
});
shared.styleB.value = 1;
const D = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const smooth = (x) => x * x * (3 - 2 * x);
const swingLean = (speed) => smooth(clamp((speed - 8) / 20, 0, 1)) * D(35);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Locomotion clips: [ground speed at 1x (m/s), travel direction (deg, + is the contestant's
// left), phase of the left foot passing under the hips]. Speeds were tuned so planted feet
// hold still (tests/anim-viewer.html reports the slip); phases line up the feet when blending.
export const LOCO = {
  Walk_Loop: [1.05, 0, 0.246],
  Jog_Fwd_Loop: [6.0, 0, 0.108],
  Sprint_Loop: [8.85, 0, 0.121],
  KK_Running_Strafe_Left: [5.6, 55, 0.146],
  KK_Running_Strafe_Right: [5.6, -55, 0.175],
  KK_Walking_Backwards: [1.6, 180, 0.929],
  KK_Crouching: [2.0, 0, 0.342],
  KK_Crawling: [1.3, 0, 0.096],
};
const cycle = (name, slots) => LOCO[name][0] * slots[name].clip.duration;

// Limb aims: [joint, child joint, direction] in a pose frame where +z is the contestant's
// front, +x their left and +y their head end.
// Hanging under the rope: legs loose below the hips, trailing a little.
const hangAims = [
  ["thigh_r", "calf_r", [-0.07, -0.97, -0.1]],
  ["calf_r", "foot_r", [-0.03, -0.82, -0.57]],
  ["thigh_l", "calf_l", [0.1, -0.86, 0.42]],
  ["calf_l", "foot_l", [0.05, -0.88, -0.45]],
];
// A fast swing: legs stream out behind the travel, one knee bent, toes pointed.
const trailAims = [
  ["thigh_r", "calf_r", [-0.06, -0.86, -0.5]],
  ["calf_r", "foot_r", [-0.03, -0.7, -0.71]],
  ["thigh_l", "calf_l", [0.08, -0.93, -0.18]],
  ["calf_l", "foot_l", [0.04, -0.55, -0.83]],
];
// A hard pull stretches the body out: legs long, toes pointed.
const stretchAims = [
  ["thigh_r", "calf_r", [-0.05, -0.98, -0.12]],
  ["calf_r", "foot_r", [-0.03, -0.92, -0.35]],
  ["thigh_l", "calf_l", [0.07, -0.95, 0.15]],
  ["calf_l", "foot_l", [0.04, -0.85, -0.5]],
  ["neck_01", "Head", [0, 0.92, -0.38]],
];
// Anchor behind: a trapeze kick, knees driving up in front, hips piked.
const kickAims = [
  ["thigh_r", "calf_r", [-0.12, -0.35, 0.93]],
  ["calf_r", "foot_r", [-0.05, -0.8, 0.6]],
  ["thigh_l", "calf_l", [0.12, -0.55, 0.83]],
  ["calf_l", "foot_l", [0.05, -0.95, 0.3]],
];
// Zip: a head-first dive along the rope, legs streaming behind, one knee tucked.
const diveAims = [
  ["pelvis", "spine_01", [0, 1, 0.1]],
  ["spine_01", "spine_03", [0, 1, 0.12]],
  ["spine_03", "neck_01", [0, 0.97, 0.25]],
  ["neck_01", "Head", [0, 0.6, 0.8]],
  ["thigh_r", "calf_r", [-0.1, -0.99, -0.08]],
  ["calf_r", "foot_r", [-0.04, -0.94, -0.33]],
  ["thigh_l", "calf_l", [0.12, -0.8, 0.45]],
  ["calf_l", "foot_l", [0.06, -0.55, -0.83]],
];
// Towed by a rope hooked into the floor ahead: a water-skier's stance, knees bent and driving
// forward, hips sat low and the back leaning against the rope's pull, head up to the anchor.
const towAims = [
  ["pelvis", "spine_01", [0, 0.84, -0.54]],
  ["spine_01", "spine_03", [0, 0.9, -0.44]],
  ["spine_03", "neck_01", [0, 0.99, 0.0]],
  ["neck_01", "Head", [0, 0.86, 0.5]],
  ["thigh_r", "calf_r", [-0.16, -0.5, 0.85]],
  ["calf_r", "foot_r", [-0.06, -0.93, -0.36]],
  ["thigh_l", "calf_l", [0.18, -0.62, 0.76]],
  ["calf_l", "foot_l", [0.06, -0.96, -0.26]],
];
// Wall jump, in the frame facing away from the wall: both legs driving back into it.
const pushAims = [
  ["thigh_r", "calf_r", [-0.18, -0.55, -0.82]],
  ["calf_r", "foot_r", [-0.12, -0.45, -0.88]],
  ["thigh_l", "calf_l", [0.2, -0.75, -0.3]],
  ["calf_l", "foot_l", [0.1, -0.6, -0.8]],
  ["pelvis", "spine_01", [0, 0.88, 0.47]],
  ["spine_01", "spine_03", [0, 0.9, 0.42]],
];
// Reeling a teammate in: braced, sat back on the heels away from them.
const braceAims = [
  ["pelvis", "spine_01", [0, 0.85, -0.52]],
  ["spine_01", "spine_03", [0, 0.9, -0.44]],
  ["thigh_l", "calf_l", [0.3, -0.35, 0.89]],
  ["calf_l", "foot_l", [0.12, -0.97, 0.2]],
  ["thigh_r", "calf_r", [-0.28, -0.8, -0.2]],
  ["calf_r", "foot_r", [-0.1, -0.85, -0.5]],
];
// Being dragged on the back towards a reviver: the free hand trails, the head lifts to look.
const draggedAims = [
  ["upperarm_r", "lowerarm_r", [-0.8, -0.45, -0.35]],
  ["lowerarm_r", "hand_r", [-0.5, -0.2, 0.85]],
];

// Hand-in-gun frames (gun frame: +z barrel, +y up, +x the gun's left), and each wrist's offset
// from the gun's origin at the shooting grip. Hand bones: +y runs along the fingers, the right
// palm faces local -x and the left palm local +x, and the thumbs point along local +z.
function basis(x, y) {
  const X = new THREE.Vector3(...x).normalize(), Y = new THREE.Vector3(...y);
  Y.addScaledVector(X, -Y.dot(X)).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y)));
}
const GRIP_R = basis([-1, 0.05, 0], [0, -0.35, 0.94]);
const GRIP_L = basis([-0.35, 0.94, 0], [-0.55, 0.0, 0.84]);
const WRIST_R = new THREE.Vector3(-0.03, 0.03, -0.075);
const WRIST_L = new THREE.Vector3(0.025, -0.01, 0.2);

const fingers = /^(thumb|index|middle|ring|pinky)_0[123]_([lr])$/;

const sharedResources = new Map();
export async function createContestant(team, number) {
  await fontsReady();
  const [model, clips] = await Promise.all([makeContestant(options(team, number)), loadClips()]);
  setVariant(model, "final");
  const bones = model.userData.bones;
  const byName = Object.fromEntries(clips.map((c) => [c.name, c]));
  dress(model, team, number);
  // Contestants of one team and number share geometry and materials.
  shareResources(model, `${team}:${number}`);
  model.position.y = -0.9;

  const mixer = new THREE.AnimationMixer(model.children[0]);
  const slots = {};
  const slot = (name) => {
    if (!slots[name]) {
      const clip = byName[name];
      const tracks = clip.tracks.filter((t) => !/^root\./.test(t.name) && !/leaf/.test(t.name));
      const action = mixer.clipAction(new THREE.AnimationClip(name, clip.duration, tracks));
      action.setEffectiveTimeScale(0);
      slots[name] = { action, clip, weight: 0, target: 0, clock: 0, playing: false };
    }
    return slots[name];
  };
  for (const name of Object.keys(LOCO)) slot(name);
  // Finger poses: a pistol grip for both hands on the blaster, a fist on the rope.
  const handPose = (clipName, time, side) => {
    const clip = byName[clipName];
    return clip.tracks.filter((t) => fingers.test(t.name.split(".")[0]) && t.name.endsWith(".quaternion") && t.name.split(".")[0].endsWith(side))
      .map((t) => {
        const i = Math.min(t.times.length - 1, Math.max(0, t.times.findIndex((x) => x >= time)));
        return [bones[t.name.split(".")[0]], new THREE.Quaternion().fromArray(t.values, i * 4)];
      });
  };
  const gripRight = handPose("Pistol_Idle_Loop", 0, "_r"), gripLeft = handPose("Pistol_Idle_Loop", 0, "_l");
  const fistLeft = handPose("Punch_Cross", 0, "_l");

  // Gear: the blaster rides the right hand, the launcher the left forearm, and the whip cable
  // and slide dust live in world space (added to the scene by the first update).
  model.updateMatrixWorld(true);
  const gun = makeBlaster(team);
  attachToHand(gun, bones.hand_r, GRIP_R, WRIST_R);
  const flash = muzzleFlash();
  gun.userData.muzzle.add(flash);
  model.userData.muzzle = gun.userData.muzzle;
  const launcher = makeLauncher(team);
  const foreHolder = new THREE.Group();
  bones.lowerarm_l.add(foreHolder);
  foreHolder.quaternion.copy(bones.lowerarm_l.getWorldQuaternion(new THREE.Quaternion())).invert();
  foreHolder.add(launcher);
  model.userData.reel = launcher.userData.exit;
  const cable = makeCable();
  const dust = makeDust();
  const fx = new THREE.Group();
  fx.add(cable, dust.group);
  let fxAdded = false;

  // Rest data for the posing helpers.
  const restWorld = {};
  for (const [name, bone] of Object.entries(bones)) restWorld[name] = bone.getWorldQuaternion(new THREE.Quaternion());
  const headFront = new THREE.Vector3(0, 0, 1).applyQuaternion(restWorld.Head.clone().invert());
  const headLeft = new THREE.Vector3(1, 0, 0).applyQuaternion(restWorld.Head.clone().invert());
  // Elbow hinges at rest (T-pose, palms down): the forearms fold forward.
  const leftArm = () => chain(bones.upperarm_l, bones.lowerarm_l, bones.hand_l, new THREE.Vector3(0, 1, 0));
  const rightArm = () => chain(bones.upperarm_r, bones.lowerarm_r, bones.hand_r, new THREE.Vector3(0, -1, 0));
  const ik = { gunR: rightArm(), gunL: leftArm(), crawlL: leftArm(), crawlR: rightArm(), rope: leftArm(), reel: leftArm(), whip: leftArm(), climbL: leftArm(), climbR: rightArm() };
  const padHolders = model.userData.parts.pads.map((pad) => pad.parent);
  const padRest = padHolders.map((h) => h.getWorldQuaternion(new THREE.Quaternion()));
  const padDroop = [1, -1].map((s) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), s * D(22)));
  const padExtra = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  const armRestDir = ["l", "r"].map((s) => bones["lowerarm_" + s].getWorldPosition(new THREE.Vector3()).sub(bones["upperarm_" + s].getWorldPosition(new THREE.Vector3())).normalize());

  // --- state ---
  let name = "idle", previousName = "idle";
  let heading = Math.PI, lowerYaw = Math.PI, aimYaw = Math.PI;
  let sector = "F", phase = 0, pitch = 0, tilt = 0, lift = 0;
  let hang = 0, stretch = 0, kick = 0, dive = 0, towPose = 0, slidePose = 0, climbPose = 0, trail = 0, gunArmIn = 1;
  let pushPose = 0, bracePose = 0, dragPose = 0, knockPose = 0;
  let airTime = 0, groundTime = 0, prevVy = 0, landT = 9, hardLand = false;
  let previousWhip = false, whipT = 9, whipSide = 1;
  let previousMelee = 0, meleeT = 9;
  let previousGun = 0, recoil = 0, recoilT = 9, aimHold = 0, aimW = 0, twoHand = 1, gunVisible = 1;
  let ropeArm = 0, throwT = 9, previousHook = "ready";
  let wallT = 9, previousWall = false;
  const wallNormal = new THREE.Vector3(1, 0, 0), prevVel = new THREE.Vector3();
  let diedKnocked = false, slideExitT = 9, spineAim = 0, climbClock = 0, climbRamp = 0, pushRamp = 0;
  const lastRope = new THREE.Vector3(0, 10, 0);
  let status = "alive", statusT = 9, previousStatus = "alive", getUpT = 9;
  let climbT = 0, reelT = 0;
  const hangFrame = new THREE.Quaternion(), hangTarget = new THREE.Quaternion();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const rope = new THREE.Vector3(), axis = new THREE.Vector3(), front = new THREE.Vector3(), side = new THREE.Vector3();
  const dir = new THREE.Vector3(), basisM = new THREE.Matrix4(), pivot = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const euler = new THREE.Euler(0, 0, 0, "YXZ"), upright = new THREE.Quaternion(), frame = new THREE.Quaternion();
  const aimDir = new THREE.Vector3(0, 0, -1);
  const gunPos = new THREE.Vector3(), gunQuat = new THREE.Quaternion();
  const cablePoints = Array.from({ length: 18 }, () => new THREE.Vector3());

  const aimPose = (pairs, pose, weight) => {
    for (const [joint, next, vector] of pairs) aimBone(bones[joint], bones[next], dir.set(...vector).normalize().applyQuaternion(pose), weight);
  };
  // Joints that can touch the floor, with the distance from the joint to the skin below it.
  const contacts = [["ball_l", 0.02], ["ball_r", 0.02], ["foot_l", 0.1], ["foot_r", 0.1], ["calf_l", 0.07], ["calf_r", 0.07],
    ["pelvis", 0.13], ["hand_l", 0.04], ["hand_r", 0.04], ["lowerarm_l", 0.05], ["lowerarm_r", 0.05], ["Head", 0.12], ["spine_03", 0.14]];
  // Hooked: head end leaning from upright towards the rope (no further than `limit` radians),
  // front turned to the direction of travel across the rope.
  const hangOrientation = (state, limit, out) => {
    rope.copy(state.target).sub(state.position).normalize();
    front.copy(state.velocity).addScaledVector(rope, -state.velocity.dot(rope));
    // At speed the chest leads and the legs stream behind: tip the head end into the travel.
    if (front.lengthSq() > 1) rope.addScaledVector(front.normalize(), clamp(state.velocity.length() / 50, 0, 0.42)).normalize();
    const level = Math.hypot(rope.x, rope.z);
    const lean = Math.min(Math.acos(clamp(rope.y, -1, 1)), limit) * Math.min(1, level / 0.25);
    const head = level > 1e-4 ? axis.set(rope.x / level, 0, rope.z / level).multiplyScalar(Math.sin(lean)).setY(Math.cos(lean)) : axis.copy(up);
    front.copy(state.velocity).addScaledVector(head, -state.velocity.dot(head)).addScaledVector(v1.set(Math.sin(heading), 0, Math.cos(heading)), 2);
    front.addScaledVector(head, -front.dot(head)).normalize();
    side.crossVectors(head, front);
    out.setFromRotationMatrix(basisM.makeBasis(side, head, front));
    // Zips bank a little onto the gun side, so the chase camera sees the back, not a ball.
    if (state.hook === "zip") out.premultiply(q2.setFromAxisAngle(head, -0.3));
    // A fast swing flies rather than hangs: the chest leads into the travel (up to 35 degrees).
    else out.premultiply(q2.setFromAxisAngle(side, swingLean(state.velocity.length())));
    return out;
  };

  // ---- base layer: hand-blended clips with explicit clocks ----
  let fade = 0.12;
  const want = {};
  const play = (clip, weight, mode) => { slot(clip); want[clip] = { weight, mode }; };
  const applyBase = (dt) => {
    let total = 0;
    for (const [clip, s] of Object.entries(slots)) {
      const w = want[clip];
      s.target = w ? w.weight : 0;
      if (s.target > 0 && s.weight < 0.002 && w.mode.once) s.clock = w.mode.from ?? 0;
      const step = dt / Math.max(0.01, w?.mode.fade ?? fade);
      s.weight = s.target > s.weight ? Math.min(s.target, s.weight + step) : Math.max(s.target, s.weight - step);
      total += s.weight;
    }
    for (const [clip, s] of Object.entries(slots)) {
      const w = want[clip];
      const m = w?.mode;
      if (m) {
        if (m.sync !== undefined) s.clock = ((((m.sync + LOCO[clip][2]) % 1) + 1) % 1) * s.clip.duration;
        else if (m.at !== undefined) s.clock = m.at;
        else if (m.once) s.clock = Math.min(m.to ?? s.clip.duration, s.clock + dt * (m.rate ?? 1));
        else s.clock = (s.clock + dt * (m.rate ?? 1)) % s.clip.duration;
      }
      const weight = total > 0 ? s.weight / total : 0;
      if (weight > 0.001) {
        if (!s.playing) { s.action.play(); s.playing = true; }
        s.action.time = s.clock;
        s.action.setEffectiveWeight(weight);
      } else if (s.playing) { s.action.stop(); s.playing = false; }
    }
    for (const k of Object.keys(want)) delete want[k];
    mixer.update(0);
    // three.js skips writing a property whose mixed value matches last frame's. The procedural
    // layers below edit the same bones after the mixer, so a held frame would let their edits
    // pile up; clearing the remembered results makes the mixer rewrite every bone every frame.
    for (const binding of mixer._bindings) binding.buffer.fill(NaN, binding.valueSize, binding.valueSize * 3);
  };

  // ---- the blaster: placed in the aim frame, hands IK'd to it ----
  const placeGun = (chest, shoulder, bodyQuat, firing) => {
    const f = aimDir, u = v1.copy(up).addScaledVector(f, -f.y).normalize(), l = v2.crossVectors(u, f);
    // Two hands: shouldered when shooting, low ready otherwise (lower still at a sprint).
    const shoulderedPos = v3.copy(chest).addScaledVector(l, -0.16).addScaledVector(u, 0.05).addScaledVector(f, 0.34);
    const lowPos = new THREE.Vector3().copy(chest).addScaledVector(l, -0.13).addScaledVector(u, -0.2).addScaledVector(f, 0.3);
    const twoPos = lowPos.lerp(shoulderedPos, aimW);
    const lowQuat = q1.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.clone().addScaledVector(u, -0.55).addScaledVector(l, 0.35).normalize());
    const aimQuat = q2.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f);
    // keep the gun upright about its barrel
    const level = (q, fwd) => {
      const right = new THREE.Vector3().crossVectors(fwd, up);
      if (right.lengthSq() < 1e-4) return q;
      const gunUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const wantUp = new THREE.Vector3().crossVectors(right.normalize(), fwd).normalize();
      const roll = Math.atan2(new THREE.Vector3().crossVectors(gunUp, wantUp).dot(fwd), gunUp.dot(wantUp));
      return q.premultiply(new THREE.Quaternion().setFromAxisAngle(fwd, roll));
    };
    level(aimQuat, f);
    level(lowQuat, new THREE.Vector3(0, 0, 1).applyQuaternion(lowQuat));
    const twoQuat = lowQuat.clone().slerp(aimQuat, aimW);
    // One hand (the left is busy): arm out at the target when shooting, held by the hip otherwise.
    const onePos = new THREE.Vector3().copy(shoulder).addScaledVector(f, 0.5).addScaledVector(u, -0.06).addScaledVector(l, -0.04);
    const bodyDown = new THREE.Vector3(0, -1, 0).applyQuaternion(bodyQuat), bodyFront = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyQuat);
    // Relaxed one-handed: tucked along the body, muzzle forward along the aim and dipped.
    // On a fast swing the free (gun) arm sweeps back along the body.
    const restPos = new THREE.Vector3().copy(shoulder).addScaledVector(bodyDown, 0.3 + 0.08 * trail).addScaledVector(bodyFront, 0.18 - 0.32 * trail).addScaledVector(f, 0.12 * (1 - trail));
    const restQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.clone().addScaledVector(u, -0.45).addScaledVector(l, 0.15).normalize());
    level(restQuat, new THREE.Vector3(0, 0, 1).applyQuaternion(restQuat));
    onePos.lerp(restPos, 1 - aimW);
    const oneQuat = restQuat.slerp(aimQuat, aimW);
    gunPos.copy(onePos).lerp(twoPos, twoHand);
    gunQuat.copy(oneQuat).slerp(twoQuat, twoHand);
    // Recoil: the gun kicks back and the muzzle climbs.
    if (recoil > 0.001) {
      const back = new THREE.Vector3(0, 0, -1).applyQuaternion(gunQuat);
      gunPos.addScaledVector(back, 0.06 * recoil);
      const climbAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(gunQuat);
      gunQuat.premultiply(new THREE.Quaternion().setFromAxisAngle(climbAxis, -D(9) * recoil));
    }
    return firing;
  };
  const holdGun = (bodyQuat, weightR, weightL) => {
    const right = v3.copy(up).negate().addScaledVector(v1.crossVectors(up, aimDir).normalize(), -0.7).addScaledVector(aimDir, -0.3);
    twoBoneIK(ik.gunR, gunPos.clone().add(WRIST_R.clone().applyQuaternion(gunQuat)), right, weightR);
    setWorldQuaternion(bones.hand_r, gunQuat.clone().multiply(GRIP_R), weightR);
    for (const [bone, pose] of gripRight) bone.quaternion.slerp(pose, weightR);
    if (weightL > 0.001) {
      // The support hand goes to the gun where the right hand actually put it.
      const g = gun.getWorldPosition(new THREE.Vector3()), gq = gun.getWorldQuaternion(new THREE.Quaternion());
      const left = new THREE.Vector3(0, -1, 0).addScaledVector(v1.crossVectors(up, aimDir).normalize(), 0.5);
      twoBoneIK(ik.gunL, g.add(WRIST_L.clone().applyQuaternion(gq)), left, weightL);
      setWorldQuaternion(bones.hand_l, gq.multiply(GRIP_L), weightL);
      for (const [bone, pose] of gripLeft) bone.quaternion.slerp(pose, weightL);
    }
  };

  return {
    model,
    update(dt, state) {
      if (!fxAdded && model.parent) {
        let root = model; while (root.parent) root = root.parent;
        if (root.isScene) { root.add(fx); fxAdded = true; }
      }
      const vel = state.velocity;
      const speed = Math.hypot(vel.x, vel.z);
      const hookState = state.hook ?? "ready";
      const hooked = hookState === "swing" || hookState === "zip";
      status = state.status ?? "alive";
      if (status !== previousStatus) { statusT = 0; diedKnocked = previousStatus === "knocked"; if (previousStatus === "knocked" && status === "alive") getUpT = 0; }
      statusT += dt; getUpT += dt;
      previousStatus = status;
      // Airborne for a moment before the hanging pose takes over, so skims along the floor
      // while hooked stay on their feet.
      airTime = state.grounded ? 0 : airTime + dt;
      groundTime = state.grounded ? groundTime + dt : 0;
      const crouch = state.slide && speed < (name === "slide" ? 5 : 6);
      const towed = hookState === "swing" && state.target.y < state.position.y + (name === "tow" || name === "slide" ? 0.75 : 0.45);
      const flying = !state.grounded && airTime > 0.06;
      const sliding = state.slide && !crouch && (!hooked || state.grounded);
      // Landing: soft, or hard from a high fall speed.
      if (state.landing && landT > 0.4 && airTime === 0) { landT = 0; hardLand = prevVy < -15; }
      landT += dt;
      // Wall jump: the push leaves along the change in velocity, away from the wall.
      if (state.walljump && !previousWall) {
        wallNormal.set(vel.x - prevVel.x, 0, vel.z - prevVel.z);
        if (wallNormal.lengthSq() < 0.01) wallNormal.set(vel.x, 0, vel.z);
        wallNormal.normalize();
        wallT = 0;
      }
      previousWall = state.walljump;
      wallT += dt;
      previousName = name;
      if (status === "eliminated") name = "dead";
      else if (status === "knocked") name = state.reviver ? "revived" : speed > 0.3 ? "crawl" : "knocked";
      else if (hookState === "revive") name = "reviving";
      else if (state.mantle) name = "mantle";
      else if (sliding) name = "slide";
      else if (hookState === "zip" && (flying || !state.grounded)) name = "zip";
      else if (towed || (hooked && state.grounded)) name = "tow";
      else if (hookState === "swing") name = flying ? "swing" : "tow";
      else if (hookState === "zip") name = "tow";
      else if (state.walljump || wallT < 0.3) name = "walljump";
      else if (state.slide) name = "crouch";
      else if (!state.grounded) name = vel.y > 1 && airTime < 0.5 ? "jump" : "air";
      else if (state.landing || landT < (hardLand ? 0.45 : 0.25)) name = hardLand ? "hardland" : "land";
      else name = speed > 0.35 ? "run" : "idle";
      if (name === "mantle" && previousName !== "mantle") climbT = 0;
      climbT += dt;

      // ---- aim ----
      if (state.aim && state.aim.lengthSq() > 1e-6) aimDir.copy(state.aim).normalize();
      else if (speed > 0.5) aimDir.set(vel.x, 0, vel.z).normalize();
      const targetAimYaw = Math.atan2(aimDir.x, aimDir.z);
      aimYaw = targetAimYaw;
      const aimPitch = Math.asin(clamp(aimDir.y, -1, 1));
      // Shots: each rise of the refire timer.
      const gunTimer = state.gun ?? 0;
      const shot = gunTimer > previousGun + 1e-4;
      previousGun = gunTimer;
      // The blaster comes back once a revived contestant is most of the way up.
      const armed = !["dead", "knocked", "crawl", "revived", "mantle"].includes(name) && !(status === "alive" && getUpT < 0.4);
      // The gun arm and the head's aim blend in and out on a ramp, so getting up from a revive
      // or off a ledge doesn't snap the arms and head onto the aim in one frame.
      gunArmIn = clamp(gunArmIn + (armed ? dt / 0.25 : -dt / 0.12), 0, 1);
      const armS = smooth(gunArmIn);
      if (shot && armed) { recoilT = 0; aimHold = 1.1; flash.userData.t = 0; }
      recoilT += dt;
      aimHold = Math.max(0, aimHold - dt);
      recoil = recoilT < 0.035 ? recoilT / 0.035 : Math.exp(-(recoilT - 0.035) / 0.07);
      if (recoilT > 0.6) recoil = 0;
      const ease = (time) => 1 - Math.exp(-dt / time);
      aimW = THREE.MathUtils.lerp(aimW, aimHold > 0 ? 1 : 0, ease(aimHold > 0 ? 0.05 : 0.25));

      if ((state.melee || 0) > previousMelee + 0.001) meleeT = 0;
      previousMelee = state.melee || 0; meleeT += dt;
      // ---- whip and hook-arm events ----
      if (state.whip && !previousWhip) { whipT = 0; whipSide = 1; }
      previousWhip = state.whip;
      whipT += dt;
      if (hookState === "flying" && previousHook !== "flying") throwT = 0;
      previousHook = hookState;
      throwT += dt;

      // ---- base clips ----
      // Getting up out of a slide is a bigger change of pose: blend it a little longer.
      slideExitT = name === "slide" ? 0 : slideExitT + dt;
      fade = slideExitT < 0.3 ? 0.22 : 0.12;
      const locomotion = name === "run" || name === "idle" || name === "land" || name === "hardland";
      let moveYaw = speed > 0.3 ? Math.atan2(vel.x, vel.z) : lowerYaw;
      if (locomotion || name === "crouch") {
        const rel = wrap(moveYaw - aimYaw);
        const a = Math.abs(rel);
        if (name === "crouch") sector = a < (sector === "B" ? 95 : 115) * Math.PI / 180 ? "F" : "B";
        else if (sector === "F") sector = a > D(80) ? (a > D(125) ? "B" : rel > 0 ? "L" : "R") : "F";
        else if (sector === "B") sector = a < D(115) ? (a < D(70) ? "F" : rel > 0 ? "L" : "R") : "B";
        else sector = a < D(65) ? "F" : a > D(130) ? "B" : rel > 0 ? "L" : "R";
        if (speed < 0.35) sector = "F";
      }
      const run = (weight) => {
        // Speed blend within the direction sector, all clips on one phase.
        const s = speed;
        const clipsFor = {
          F: [["Walk_Loop", 0.3, 1.6], ["Jog_Fwd_Loop", 1.6, 7.0], ["Sprint_Loop", 7.0, 99]],
          B: [["KK_Walking_Backwards", 0.3, 2.6], ["Jog_Fwd_Loop", 2.6, 99]],
          L: [["KK_Running_Strafe_Left", 0.3, 99]],
          R: [["KK_Running_Strafe_Right", 0.3, 99]],
        }[sector];
        const band = 1.2;
        const ws = clipsFor.map(([, lo, hi], i) => {
          const fadeIn = i === 0 ? 1 : smooth(clamp((s - lo + band / 2) / band, 0, 1));
          const fadeOut = i === clipsFor.length - 1 ? 1 : 1 - smooth(clamp((s - hi + band / 2) / band, 0, 1));
          return fadeIn * fadeOut;
        });
        const sum = ws.reduce((x, y) => x + y, 0) || 1;
        let stride = 0;
        clipsFor.forEach(([clip], i) => { stride += (ws[i] / sum) * cycle(clip, slots); });
        // Backwards, the jog plays in reverse; the backpedal walk is authored backwards already.
        phase += (dt * s) / Math.max(0.3, stride) * (sector === "B" ? -1 : 1);
        phase -= Math.floor(phase);
        clipsFor.forEach(([clip], i) => {
          if (ws[i] / sum < 0.001) return;
          const p = clip === "Jog_Fwd_Loop" && sector === "B" ? phase : clip === "KK_Walking_Backwards" ? -phase : phase;
          play(clip, weight * ws[i] / sum, { sync: p, fade: 0.2 });
        });
      };
      const moving = clamp((speed - 0.25) / 0.9, 0, 1);
      switch (name) {
        case "idle": case "run": {
          if (moving > 0) run(moving);
          if (moving < 1) play("Idle_Loop", 1 - moving, { rate: 1, fade: 0.2 });
          break;
        }
        case "land": case "hardland": {
          const t = landT;
          const landWeight = hardLand ? 1 - smooth(clamp((t - 0.25) / 0.2, 0, 1)) : 1 - smooth(clamp((t - 0.08) / 0.17, 0, 1));
          if (hardLand) play("UAL2_NinjaJump_Land", landWeight, { once: true, from: 0.12, to: 0.62, rate: 1.1, fade: 0.05 });
          else play("Jump_Land", landWeight, { once: true, from: 0.12, to: 0.6, rate: 1.6, fade: 0.05 });
          if (moving > 0) run((1 - landWeight) * moving + 0.001);
          if (moving < 1) play("Idle_Loop", (1 - landWeight) * (1 - moving) + 0.001, { rate: 1 });
          break;
        }
        case "crouch": {
          const fwd = sector === "F" ? 1 : -1;
          phase += (dt * speed) / cycle("KK_Crouching", slots) * fwd;
          phase -= Math.floor(phase);
          const m = clamp((speed - 0.2) / 0.8, 0, 1);
          if (m > 0) play("KK_Crouching", m, { sync: phase, fade: 0.15 });
          if (m < 1) play("Crouch_Idle_Loop", 1 - m, { rate: 1, fade: 0.15 });
          break;
        }
        case "slide": {
          fade = 0.08;
          play("UAL2_Slide_Start", 1 - smooth(clamp((slidePose - 0.3) / 0.6, 0, 1)) + 0.001, { once: true, from: 0.18, to: 0.42, rate: 1.5, fade: 0.08 });
          play("UAL2_Slide_Loop", smooth(clamp((slidePose - 0.3) / 0.6, 0, 1)) + 0.001, { rate: 1, fade: 0.1 });
          break;
        }
        case "tow": case "reviving": play("Crouch_Idle_Loop", 1, { rate: 1 }); break;
        case "jump": play("Jump_Start", 1, { once: true, from: 0.35, to: 1.0, rate: 1.4 }); break;
        case "walljump": {
          if (wallT < 0.14) play("Jump_Start", 1, { once: true, from: 0.45, to: 0.7, rate: 1, fade: 0.05 });
          else play("UAL2_NinjaJump_Idle_Loop", 1, { rate: 1, fade: 0.12 });
          break;
        }
        case "air": case "swing": play("Jump_Loop", 1, { rate: 1 }); break;
        case "zip": play("Jump_Loop", 1, { rate: 1 }); break;
        case "mantle": {
          // Climb timing follows the body's height against the lip when the game gives it.
          const feet = state.position.y - 0.9;
          const below = state.lip !== undefined && state.lip !== null ? state.lip - feet : null;
          const t = below !== null ? THREE.MathUtils.lerp(0.18, 0.44, clamp(1 - below / 1.5, 0, 1)) + (below <= 0.05 ? Math.min(0.12, climbT * 0.4) : 0) : 0.18 + Math.min(0.38, climbT * 1.6);
          // The clip only runs forward, and no faster than 2.5x, so the lip crossing can't jump.
          climbClock = name !== previousName ? Math.min(t, 0.62) : clamp(Math.min(t, 0.62), climbClock, climbClock + dt * 2.5);
          play("UAL2_ClimbUp_1m", 1, { at: climbClock, fade: 0.12 });
          break;
        }
        case "crawl": case "knocked": {
          phase += (dt * speed) / cycle("KK_Crawling", slots);
          phase -= Math.floor(phase);
          if (statusT < 0.75 && previousStatus === "knocked") play("KK_Death_A", 1, { once: true, from: 0.05, to: 0.6, rate: 1.1, fade: 0.08 });
          else play("KK_Crawling", 1, { sync: name === "knocked" ? phase + 0.02 * Math.sin(statusT * 2) : phase, fade: 0.3 });
          break;
        }
        case "revived": play("UAL2_LayToIdle", 1, { at: 0.02, fade: 0.25 }); break;
        // From a run: pitch forward onto the chest. From a crawl: slump flat where they lie.
        case "dead": play("KK_Death_B", 1, diedKnocked ? { at: 2.0, fade: 0.35 } : { once: true, from: 0.35, to: 2.05, rate: 2.2, fade: 0.08 }); break;
      }
      // Getting up after a revive overrides the start of whatever comes next.
      if (getUpT < 0.55 && status === "alive") {
        const k = 1 - smooth(clamp((getUpT - 0.3) / 0.25, 0, 1));
        for (const w of Object.values(want)) w.weight *= 1 - k;
        play("UAL2_LayToIdle", k, { once: true, from: 0.55, to: 1.28, rate: 1.6, fade: 0.05 });
      }
      applyBase(dt);

      // ---- root orientation ----
      const gunMode = locomotion || name === "crouch" || name === "jump" || name === "air";
      if (gunMode) {
        // Legs travel along their clip's direction; the hips turn so that matches the motion,
        // and the spine turns the rest of the way to the aim.
        const clipDir = { F: 0, B: Math.PI, L: D(55), R: D(-55) }[sector];
        let target;
        if (speed > 0.35 && state.grounded) target = moveYaw - (name === "crouch" ? (sector === "B" ? Math.PI : 0) : clipDir);
        else if (!state.grounded && speed > 1) {
          const rel = wrap(moveYaw - aimYaw), folded = Math.abs(rel) > Math.PI / 2 ? wrap(rel - Math.PI) : rel;
          target = aimYaw + clamp(folded, -D(45), D(45));
        } else {
          const off = wrap(lowerYaw - aimYaw);
          target = Math.abs(off) > D(60) ? aimYaw + Math.sign(off) * D(55) : lowerYaw;
        }
        const delta = wrap(target - lowerYaw);
        // Keep the twist from the hips to the aim inside what a spine can do.
        const yawBefore = lowerYaw;
        lowerYaw += delta * ease(0.09);
        const twist = wrap(aimYaw - lowerYaw);
        // Past what a spine can twist, the hips come round quickly (but never in one frame).
        if (Math.abs(twist) > D(95)) lowerYaw += wrap(twist - Math.sign(twist) * D(95)) * ease(0.05);
        // Just up from a revive (facing the reviver), turn to the aim at a walk, not a spin.
        if (status === "alive" && getUpT < 1.2) {
          const most = D(90 + 500 * smooth(clamp(getUpT / 1.2, 0, 1))) * dt;
          lowerYaw = yawBefore + clamp(wrap(lowerYaw - yawBefore), -most, most);
        }
        const turnRate = wrap(target - heading);
        heading = lowerYaw;
        tilt = THREE.MathUtils.lerp(tilt, clamp(-turnRate * speed / 40, -0.3, 0.3), ease(1 / 7));
      } else {
        const direction = hookState === "zip" ? rope.copy(state.target).sub(state.position)
          : name === "reviving" ? rope.copy(state.target).sub(state.position)
          : name === "revived" && state.reviver ? rope.copy(state.position).sub(state.reviver)
          : name === "mantle" && hooked ? rope.copy(state.target).sub(state.position) : vel;
        if (Math.hypot(direction.x, direction.z) > 0.3) {
          const desired = Math.atan2(direction.x, direction.z);
          const delta = wrap(desired - heading);
          heading += delta * ease(name === "dead" ? 0.5 : 1 / 9);
          tilt = THREE.MathUtils.lerp(tilt, clamp(-delta * speed / 35, -0.4, 0.4), ease(1 / 7));
        } else tilt *= Math.exp(-dt * 7);
        lowerYaw = heading;
      }
      const leanRun = locomotion && sector === "F" ? Math.min(speed / 150, 0.06) : 0;
      pitch = THREE.MathUtils.lerp(pitch, leanRun, ease(1 / 7));
      const roll = name === "slide" || name === "tow" ? clamp(tilt * 5, -0.45, 0.45) : tilt;
      // A slide sits a little side-on, so the legs clear the torso from behind.
      const facing = heading - 0.45 * slidePose;
      upright.setFromEuler(euler.set(pitch, facing, roll));
      const hanging = name === "swing" || name === "zip";
      const hangWas = hang;
      hang = THREE.MathUtils.lerp(hang, hanging ? 1 : 0, ease(0.08));
      dive = THREE.MathUtils.lerp(dive, name === "zip" ? 1 : 0, ease(0.1));
      stretch = THREE.MathUtils.lerp(stretch, name === "swing" ? clamp((vel.length() - 18) / 14, 0, 0.6) : 0, ease(0.15));
      if (hanging) {
        hangOrientation(state, name === "zip" ? D(66) : THREE.MathUtils.lerp(0.85, 1.05, stretch), hangTarget);
        if (hangWas < 0.02) hangFrame.copy(hangTarget);
        else hangFrame.slerp(hangTarget, ease(0.07));
      }
      model.quaternion.slerpQuaternions(upright, hangFrame, hang);
      // Hanging turns about the hips rather than the feet, so the rope line stays put.
      const pivotHeight = 0.9 * hang;
      pivot.set(0, pivotHeight, 0).applyQuaternion(model.quaternion);
      model.position.set(0, pivotHeight - 0.9, 0).sub(pivot);
      const squash = name === "hardland" && landT < 0.15 ? 0.92 : 1;
      model.scale.y = THREE.MathUtils.lerp(model.scale.y, squash, ease(1 / 18));
      model.updateMatrixWorld(true);
      const parentQ = model.parent ? model.parent.getWorldQuaternion(q1) : q1.identity();
      const headingFrame = frame.setFromEuler(euler.set(0, facing, roll)).premultiply(parentQ).clone();
      const bodyQuat = model.getWorldQuaternion(new THREE.Quaternion());

      // ---- full-body procedural poses ----
      towPose = THREE.MathUtils.lerp(towPose, name === "tow" ? 1 : 0, ease(0.1));
      if (towPose > 0.001) aimPose(towAims, headingFrame, towPose);
      slidePose = THREE.MathUtils.lerp(slidePose, name === "slide" ? 1 : 0, ease(0.08));
      if (hang > 0.001) {
        rope.copy(state.target).sub(state.position);
        front.set(vel.x, 0, vel.z);
        // How far the anchor sits behind the travel: the swing's front end, kick the legs up.
        const behind = front.lengthSq() > 4 ? clamp(-rope.setY(0).normalize().dot(front.normalize()) * 1.6, 0, 1) : 0;
        kick = THREE.MathUtils.lerp(kick, name === "swing" ? behind : 0, ease(0.15));
        aimPose(hangAims, bodyQuat, hang * (1 - dive));
        trail = THREE.MathUtils.lerp(trail, name === "swing" ? swingLean(vel.length()) / D(35) : 0, ease(0.15));
        if (trail > 0.001) aimPose(trailAims, bodyQuat, hang * trail * (1 - kick) * (1 - dive));
        if (stretch > 0.001) aimPose(stretchAims, bodyQuat, hang * stretch * (1 - kick));
        if (kick > 0.001) aimPose(kickAims, bodyQuat, hang * kick * (1 - dive));
        if (dive > 0.001) aimPose(diveAims, bodyQuat, hang * dive);
      }
      pushRamp = clamp(pushRamp + (name === "walljump" && wallT < 0.16 ? dt : -dt) / 0.07, 0, 1);
      pushPose = smooth(pushRamp);
      if (pushPose > 0.001) {
        frame.setFromUnitVectors(new THREE.Vector3(0, 0, 1), wallNormal);
        aimPose(pushAims, frame.clone().premultiply(parentQ), pushPose);
      }
      bracePose = THREE.MathUtils.lerp(bracePose, name === "reviving" ? 1 : 0, ease(0.12));
      if (bracePose > 0.001) aimPose(braceAims, headingFrame, bracePose);
      dragPose = THREE.MathUtils.lerp(dragPose, name === "revived" ? 1 : 0, ease(0.2));
      if (dragPose > 0.001) aimPose(draggedAims, headingFrame, dragPose);
      // Knocked: crawl on the elbows, chest low, head up.
      knockPose = THREE.MathUtils.lerp(knockPose, name === "crawl" || name === "knocked" ? 1 : 0, ease(0.15));
      // The elbow crawl eases in once the knock-down fall has landed.
      const crawlIK = knockPose * (status === "knocked" ? smooth(clamp((statusT - 0.45) / 0.5, 0, 1)) : 1);
      if (crawlIK > 0.001) {
        const hands = [bones.hand_l.getWorldPosition(new THREE.Vector3()), bones.hand_r.getWorldPosition(new THREE.Vector3())];
        const chestDown = new THREE.Quaternion().setFromAxisAngle(v1.set(Math.cos(heading), 0, -Math.sin(heading)), D(22) * crawlIK);
        rotateWorld(bones.spine_01, chestDown, 0.6);
        rotateWorld(bones.spine_02, chestDown, 0.4);
        rotateWorld(bones.neck_01, chestDown.clone().invert(), 1.4);
        const outward = (s) => v2.set(Math.cos(heading) * s, -0.6, -Math.sin(heading) * s).normalize();
        twoBoneIK(ik.crawlL, hands[0], outward(1).clone(), crawlIK);
        twoBoneIK(ik.crawlR, hands[1], outward(-1).clone(), crawlIK);
      }

      // ---- upper body follows the aim ----
      spineAim = THREE.MathUtils.lerp(spineAim, gunMode ? 1 : name === "slide" ? 0.8 : name === "tow" ? 0.7 : hanging ? 0.5 * aimW : name === "walljump" ? 0.5 : 0, ease(0.1));
      if (spineAim > 0.001) {
        // Read the chest's heading off the shoulder line, which stays level when bent over.
        const chestLeft = v1.set(1, 0, 0).applyQuaternion(bones.spine_03.getWorldQuaternion(q1).multiply(restWorld.spine_03.clone().invert()));
        const chestYaw = Math.atan2(chestLeft.x, chestLeft.z) - Math.PI / 2;
        // An aim right behind the chest can't be twisted to: fade the twist out towards 180
        // degrees so it can't flip from one side to the other (swinging and firing backwards).
        const rawTwist = wrap(aimYaw - chestYaw);
        const behindFade = 1 - smooth(clamp((Math.abs(rawTwist) - D(120)) / D(50), 0, 1));
        const twist = clamp(rawTwist, -D(100), D(100)) * spineAim * behindFade;
        const yawTurn = new THREE.Quaternion().setFromAxisAngle(up, twist);
        // Children inherit their parents' turn, so the shares add up to the whole twist.
        rotateWorld(bones.spine_01, yawTurn, 0.3);
        rotateWorld(bones.spine_02, yawTurn, 0.35);
        rotateWorld(bones.spine_03, yawTurn, 0.35);
        const chestPitch = Math.asin(clamp(v1.set(0, 0, 1).applyQuaternion(bones.spine_03.getWorldQuaternion(q1).multiply(restWorld.spine_03.clone().invert())).y, -1, 1));
        const lateral = v2.set(Math.cos(aimYaw), 0, -Math.sin(aimYaw));
        // Straighten the chest towards the aim's pitch (all the way when crouched, which bends far over).
        const straighten = name === "crouch" ? 1 : 0.7;
        const bend = new THREE.Quaternion().setFromAxisAngle(lateral, -clamp(aimPitch - chestPitch, -D(70), D(70)) * straighten * spineAim);
        rotateWorld(bones.spine_02, bend, 0.5);
        rotateWorld(bones.spine_03, bend, 0.5);
      }
      // Recoil rocks the chest back a touch.
      if (recoil > 0.001 && armed) rotateWorld(bones.spine_03, new THREE.Quaternion().setFromAxisAngle(v1.set(Math.cos(aimYaw), 0, -Math.sin(aimYaw)), -D(3.5) * recoil));

      // ---- left arm: throw, rope, whip, reel ----
      // Dragged by a reviver, the knocked contestant holds their end of the rope overhead.
      const dragged = name === "revived" && state.reviver;
      const ropeTarget = dragged ? state.reviver : state.target;
      const ropeWanted = ((hooked || hookState === "flying" || hookState === "revive") && name !== "mantle" && armed) || dragged;
      ropeArm = THREE.MathUtils.lerp(ropeArm, ropeWanted ? 1 : 0, ease(hookState === "flying" ? 0.025 : 0.08));
      const whipping = whipT < 0.42 && armed;
      // The support hand leaves the gun for the rope, the whip, the climb and the slide's hand-down.
      const leftBusy = Math.max(ropeArm, whipping ? 1 : 0, name === "mantle" ? 1 : 0, name === "slide" ? slidePose : 0, name === "walljump" ? 0.6 : 0, hanging ? 1 : 0, name === "tow" ? 1 : 0);
      twoHand = THREE.MathUtils.lerp(twoHand, 1 - leftBusy, ease(leftBusy > twoHand ? 0.04 : 0.12));
      gunVisible = THREE.MathUtils.lerp(gunVisible, armed ? 1 : 0, ease(armed ? 0.07 : 0.035));
      gun.visible = gunVisible > 0.05;
      gun.scale.setScalar(Math.max(0.001, gunVisible));

      // ---- the blaster ----
      // The hands let go of the blaster as it's put away, rather than snapping off it.
      // Linear ramps eased by smoothstep: no big first-frame jump like an exponential ease.
      climbRamp = clamp(climbRamp + (name === "mantle" ? dt : -dt) / 0.12, 0, 1);
      climbPose = smooth(climbRamp);
      if (gunVisible > 0.002) {
        model.updateMatrixWorld(true);
        const chest = bones.spine_03.getWorldPosition(new THREE.Vector3());
        const shoulder = bones.upperarm_r.getWorldPosition(new THREE.Vector3());
        placeGun(chest, shoulder, bodyQuat, aimHold > 0);
        holdGun(bodyQuat, armS * (1 - 0.6 * climbPose), armS * twoHand * (1 - climbPose));
      }

      if (ropeArm > 0.001) {
        // Thrown: a snap at the hook; held: the arm runs straight up the rope to the anchor.
        const snap = hookState === "flying" ? smooth(clamp(throwT / 0.09, 0, 1)) : 1;
        if (ropeWanted) lastRope.copy(ropeTarget);
        const shoulderL = bones.upperarm_l.getWorldPosition(new THREE.Vector3());
        const along = lastRope.clone().sub(shoulderL);
        if (along.lengthSq() > 0.01) {
          along.normalize();
          // nearly straight, the elbow turned out to the side and back (never along the arm)
          const bq = model.getWorldQuaternion(q1);
          const pole = v3.set(1, -0.3, -0.6).applyQuaternion(bq);
          twoBoneIK(ik.rope, shoulderL.addScaledVector(along, 0.56), pole, ropeArm * snap);
        }
        for (const [bone, closed] of fistLeft) bone.quaternion.slerp(closed, ropeArm);
        if (hookState === "revive") {
          // Hand over hand: the rope hand draws back towards the chest and reaches out again.
          reelT += dt;
          const draw = 0.5 - 0.5 * Math.cos(reelT * Math.PI * 2 / 0.7);
          const toChest = bones.spine_03.getWorldPosition(new THREE.Vector3()).sub(bones.hand_l.getWorldPosition(v1));
          const elbowOut = v2.set(Math.cos(heading), -0.8, -Math.sin(heading));
          const hand = bones.hand_l.getWorldPosition(new THREE.Vector3()).addScaledVector(toChest, 0.55 * draw);
          twoBoneIK(ik.reel, hand, elbowOut, 1);
        }
      }
      if (whipping) {
        // Backhand lash with the launcher arm: cock across the chest, crack out to the left,
        // follow through. Faster contestants throw their whole body into it.
        const flair = clamp(1 + speed / 25, 1, 2.2);
        const t = whipT;
        const keys = [[0, [-0.05, 0.0, 0.3]], [0.05, [-0.24, 0.26, 0.16]], [0.13, [0.48, 0.08, 0.3]], [0.22, [0.45, -0.12, -0.15]], [0.42, [0.2, -0.3, 0.15]]];
        let k = 0;
        while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
        const [t0, p0] = keys[k], [t1, p1] = keys[k + 1];
        const s = smooth(clamp((t - t0) / (t1 - t0), 0, 1));
        const local = new THREE.Vector3(...p0).lerp(new THREE.Vector3(...p1), s);
        const f = v1.set(Math.sin(aimYaw), 0, Math.cos(aimYaw)), l = v2.set(Math.cos(aimYaw), 0, -Math.sin(aimYaw));
        const shoulderL = bones.upperarm_l.getWorldPosition(new THREE.Vector3());
        const hand = shoulderL.clone().addScaledVector(l, local.x).addScaledVector(up, local.y).addScaledVector(f, local.z);
        const weight = t < 0.3 ? smooth(Math.min(1, t / 0.05)) : 1 - smooth((t - 0.3) / 0.12);
        const torso = (t < 0.05 ? -smooth(t / 0.05) * 0.4 : t < 0.16 ? -0.4 + smooth((t - 0.05) / 0.11) * 0.9 : 0.5 * (1 - smooth(clamp((t - 0.16) / 0.26, 0, 1)))) * flair;
        const coil = new THREE.Quaternion().setFromAxisAngle(up, torso * weight);
        rotateWorld(bones.spine_01, coil, 0.3);
        rotateWorld(bones.spine_03, coil, 0.7);
        // elbow hangs below the lash (the hand path stays within ~45 degrees of level)
        const pole = new THREE.Vector3().copy(up).negate().addScaledVector(l, 0.3);
        twoBoneIK(ik.whip, hand, pole, weight);
        for (const [bone, closed] of fistLeft) bone.quaternion.slerp(closed, weight);
      }
      // Climbing: hands go to the lip.
      if (climbPose > 0.001 && state.lip !== undefined && state.lip !== null) {
        const feet = state.position.y - 0.9 - lift;
        const lipLocal = state.lip - feet;
        if (lipLocal > 0.3) {
          const f = v1.set(Math.sin(heading), 0, Math.cos(heading)), l = v2.set(Math.cos(heading), 0, -Math.sin(heading));
          const centre = model.parent ? model.parent.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
          for (const [s, arm] of [[1, ik.climbL], [-1, ik.climbR]]) {
            const target = centre.clone().addScaledVector(f, 0.45).addScaledVector(l, 0.24 * s).setY(state.lip + 0.04);
            twoBoneIK(arm, target, v3.copy(l).multiplyScalar(s).addScaledVector(f, -0.5).addScaledVector(up, -0.6), climbPose * clamp((lipLocal - 0.3) / 0.3, 0, 1));
          }
        }
      }

      if (meleeT < 0.25 && status === "alive") {
        const weight = Math.sin(Math.PI * meleeT / 0.25);
        const lateral = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
        rotateWorld(bones.thigh_r, new THREE.Quaternion().setFromAxisAngle(lateral, -1.15 * weight), 1);
        rotateWorld(bones.spine_01, new THREE.Quaternion().setFromAxisAngle(lateral, 0.18 * weight), 1);
      }
      // ---- head looks along the aim ----
      const look = name !== "revived" ? (hanging ? 0.6 : 0.85) * armS : 0;
      if (look > 0.001) {
        // Turn (about world up) and nod separately, so an aim behind the head can't flip it;
        // past about 110 degrees the head stops trying.
        const headLeftNow = v1.copy(headLeft).applyQuaternion(bones.Head.getWorldQuaternion(q1));
        const yawDelta = wrap(aimYaw - (Math.atan2(headLeftNow.x, headLeftNow.z) - Math.PI / 2));
        const reachable = clamp((D(150) - Math.abs(yawDelta)) / D(40), 0, 1) * clamp((Math.hypot(headLeftNow.x, headLeftNow.z) - 0.25) / 0.3, 0, 1);
        const turn = new THREE.Quaternion().setFromAxisAngle(up, clamp(yawDelta, -D(70), D(70)) * look * reachable);
        rotateWorld(bones.neck_01, turn, 0.4);
        rotateWorld(bones.Head, turn, 0.6);
        const headF2 = v1.copy(headFront).applyQuaternion(bones.Head.getWorldQuaternion(q1));
        const nod = clamp(aimPitch - Math.asin(clamp(headF2.y, -1, 1)), -D(45), D(45)) * look * reachable;
        const lateralAxis = v2.set(headF2.z, 0, -headF2.x);
        // (fading out as the face turns straight up or down, where the nod axis is undefined)
        const nodFade = clamp((lateralAxis.length() - 0.15) / 0.25, 0, 1);
        if (nodFade > 0) rotateWorld(bones.Head, new THREE.Quaternion().setFromAxisAngle(lateralAxis.normalize(), -nod * nodFade), 1);
      }

      // ---- shoulder pads sit on the shoulders like football pads: they ride the chest and take
      // only part of the arm's swing (more when it rises, so a raised arm doesn't poke through) ----
      model.updateMatrixWorld(true);
      const chestTurn = bones.spine_03.getWorldQuaternion(new THREE.Quaternion()).multiply(restWorld.spine_03.clone().invert());
      const chestUp = v3.set(0, 1, 0).applyQuaternion(chestTurn);
      ["l", "r"].forEach((s, i) => {
        const holder = padHolders[i];
        const armDir = bones["lowerarm_" + s].getWorldPosition(v1).sub(bones["upperarm_" + s].getWorldPosition(v2)).normalize();
        const restDir = armRestDir[i].clone().applyQuaternion(chestTurn);
        const raised = armDir.dot(chestUp);
        const follow = Math.min(0.15, 0.3 - 0.15 * Math.max(0, raised));
        const swing = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), new THREE.Quaternion().setFromUnitVectors(restDir, armDir), follow);
        // ...and slope down off the shoulder (further with the arm up), so the edge never
        // stands up beside the helmet
        const extra = padExtra.setFromAxisAngle(zAxis, (i ? -1 : 1) * D(15) * smooth(clamp((raised - 0.3) / 0.4, 0, 1)));
        const world = swing.multiply(chestTurn.clone().multiply(padDroop[i]).multiply(extra).multiply(padRest[i]));
        holder.quaternion.copy(holder.parent.getWorldQuaternion(q1).invert().multiply(world));
      });

      // ---- keep the skin on the floor ----
      model.updateMatrixWorld(true);
      const floor = (model.parent ? model.parent.getWorldPosition(v1).y : 0) - 0.9;
      let lowest = Infinity;
      for (const [bone, clearance] of contacts) lowest = Math.min(lowest, bones[bone].getWorldPosition(v2).y - clearance - floor);
      const planted = state.grounded && name !== "mantle" && !hanging;
      const target = planted ? -lowest : Math.max(0, -lowest);
      const rate = target > lift ? 0.015 : name === "run" ? 0.25 : planted ? 0.08 : 0.15;
      lift += (target - lift) * ease(rate);
      model.position.y += lift;
      model.updateMatrixWorld(true);

      // ---- effects ----
      flash.userData.t = (flash.userData.t ?? 9) + dt;
      flash.visible = flash.userData.t < 0.06 && gun.visible;
      if (flash.visible) { flash.rotation.z = Math.random() * Math.PI; flash.scale.setScalar(0.8 + Math.random() * 0.5); }
      updateCable(dt);
      const heel = bones.foot_r.getWorldPosition(new THREE.Vector3());
      dust.update(dt, name === "slide" && speed > 6 && state.grounded, heel, vel, speed * 2.2);
      prevVy = vel.y;
      prevVel.copy(vel);
    },
    get animation() { return whipT < 0.12 ? "whip" : name; },
    get poseDebug() { return { brace: bracePose, drag: dragPose, knock: knockPose, tow: towPose, push: pushPose, hang, slide: slidePose, climb: climbPose, dive, kick, stretch, lift, name, lowerYaw, aimYaw, heading, sector, spineAim, speed: prevVel.length() }; },
    get clips() { return Object.entries(slots).filter(([, s]) => s.weight > 0.01).map(([n, s]) => `${n} ${s.weight.toFixed(2)} @${s.clock.toFixed(2)}`); },
    get layers() { return { fire: recoilT < 0.2, aim: +aimW.toFixed(2), twoHand: +twoHand.toFixed(2), sector, rope: +ropeArm.toFixed(2), whip: whipT < 0.42 }; },
    setVisibleGear(on) { gun.visible = on; },
  };

  // The whip cable: cracks out along the game's whip arc (right to left across the front) and
  // snaps back into the launcher.
  function updateCable(dt) {
    void dt;
    const t = whipT;
    cable.visible = t < 0.32 && fxAdded;
    if (!cable.visible) return;
    const start = model.userData.reel.getWorldPosition(new THREE.Vector3());
    const out = t < 0.13 ? smooth(t / 0.13) : 1 - smooth(clamp((t - 0.13) / 0.19, 0, 1));
    const length = 0.5 + 5.6 * out;
    // from the right (-) round the front to the left (+), as the game's whip arc sweeps
    const sweep = -1.3 + 2.1 * smooth(clamp(t / 0.14, 0, 1));
    const yaw = aimYaw + sweep;
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const lateral = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const n = cablePoints.length;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      // a travelling wave: the crack rolls down the cable towards the tip
      const wave = Math.sin(s * 9 - t * 60) * 0.35 * s * (1 - out * 0.6);
      const lag = s * s * 0.6 * (1 - smooth(clamp(t / 0.13, 0, 1)));
      cablePoints[i].copy(start).addScaledVector(f, length * s).addScaledVector(lateral, wave + lag * length * 0.3).addScaledVector(up, -0.25 * s * s + 0.1 * Math.sin(s * 5 - t * 40) * s);
    }
    cable.userData.setPoints(cablePoints);
  }
}

// A four-point cream star at the muzzle, shown for a frame or two per shot.
let flashGeometry = null, flashGlow = null;
function muzzleFlash() {
  if (!flashGeometry) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 0.06 : 0.32, a = (i / 8) * Math.PI * 2;
      shape[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r);
    }
    flashGeometry = new THREE.ShapeGeometry(shape);
    // A soft hot-yellow bloom round the star, big enough to show past the shooter's body from
    // the chase camera (the muzzle itself is in front of the chest).
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d"), grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,248,210,1)");
    grad.addColorStop(0.25, "rgba(255,225,77,0.85)");
    grad.addColorStop(1, "rgba(255,150,40,0)");
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    flashGlow = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    flashGlow.map.colorSpace = THREE.SRGBColorSpace;
  }
  const star = new THREE.Mesh(flashGeometry, new THREE.MeshBasicMaterial({ color: 0xfff1b8, side: THREE.DoubleSide, depthWrite: false }));
  const g = new THREE.Group();
  g.add(star);
  const cross = star.clone();
  cross.rotation.y = Math.PI / 2;
  g.add(cross);
  const glow = new THREE.Sprite(flashGlow);
  glow.scale.setScalar(0.85);
  glow.renderOrder = 3;
  glow.raycast = () => {};
  g.add(glow);
  g.position.z = 0.06;
  g.visible = false;
  return g;
}

// Re-paint the printed graphics (bolder numbers, helmet gasket and team emblem), swap the
// grapple launcher onto the left forearm and give the pads a slimmer rim.
function dress(model, team, number) {
  const body = model.userData.bodyMesh;
  body.material.userData.suit.numTex.value = numberTexture(number, team);
  const helmet = model.userData.parts.helmet;
  helmet.children[0].material.map = helmetTexture(team, number);
  helmet.children[0].material.needsUpdate = true;
  // The look test's launcher sits on the right forearm; the right hand now carries the blaster.
  const fore = model.userData.bones.lowerarm_r;
  for (const child of [...fore.children]) if (!child.isBone) child.visible = false;
  // Pads: the look test's hollow torus rim showed as a hoop (or horns) whenever an arm rose.
  // Swap it for a closed lip that seals the dome: a cream rolled edge round a team-dark underside.
  const lip = lipGeometry.get(team) ?? lipGeometry.set(team, makeLip(team === "red" ? 0x8a1a22 : 0x1a2f8f)).get(team);
  for (const pad of model.userData.parts.pads) {
    pad.scale.multiplyScalar(0.85);
    const rim = pad.children.find((c) => c.geometry?.type === "TorusGeometry");
    if (!rim) continue;
    rim.geometry = lip;
    rim.rotation.set(0, 0, 0);
    rim.scale.set(1, 1, 1);
    rim.position.y = 0;
    rim.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: rim.material.gradientMap });
    const hull = rim.children.find((c) => c.userData.isOutline);
    if (hull) hull.geometry = lip;
  }
}

// A lathed lip (pad space, before the pad's own squash): a flat underside in the team's dark
// colour rolling up into a cream edge just outside the dome's base. Smooth normals, so the ink
// outline wraps it cleanly.
const lipGeometry = new Map();
function makeLip(underside) {
  const profile = [[0.001, -0.02], [0.1, -0.022], [0.14, -0.019], [0.158, -0.01], [0.165, 0.002], [0.16, 0.014], [0.146, 0.02], [0.13, 0.018]];
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const cream = new THREE.Color(0xfff4e0), dark = new THREE.Color(underside);
  const colors = [];
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getZ(i)), y = position.getY(i);
    const c = r > 0.15 || y > -0.005 ? cream : dark;
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function attachToHand(gun, hand, grip, wrist) {
  // gun = hand * inverse(grip), positioned so the wrist sits at `wrist` in the gun frame.
  hand.updateMatrixWorld(true);
  const handPos = hand.getWorldPosition(new THREE.Vector3()), handQuat = hand.getWorldQuaternion(new THREE.Quaternion());
  const gunQuat = handQuat.clone().multiply(grip.clone().invert());
  const gunPos = handPos.clone().sub(wrist.clone().applyQuaternion(gunQuat));
  const world = new THREE.Matrix4().compose(gunPos, gunQuat, new THREE.Vector3(1, 1, 1));
  const local = hand.matrixWorld.clone().invert().multiply(world);
  local.decompose(gun.position, gun.quaternion, gun.scale);
  hand.add(gun);
}

function shareResources(model, key) {
  const meshes = [];
  model.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const known = sharedResources.get(key);
  if (!known) sharedResources.set(key, meshes.map((o) => ({ geometry: o.geometry, material: o.material })));
  else meshes.forEach((o, i) => {
    if (!known[i]) return;
    o.geometry = known[i].geometry;
    o.material = known[i].material;
  });
}
