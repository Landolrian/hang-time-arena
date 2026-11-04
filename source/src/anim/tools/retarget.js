// Retargets animation clips onto the Universal Base Character skeleton and returns them as JSON.
// It runs in the browser (driven headless by bake-clips.mjs), because three.js does the skinning
// maths for us there.
//
// KayKit Rig_Medium clips are retargeted by world-space rest deltas: both rigs rest in a T-pose
// facing +z, so a bone's world rotation relative to its rest carries straight across:
//   targetWorld(t) = sourceWorld(t) * inverse(sourceRestWorld) * targetRestWorld.
// Joints the KayKit rig lacks (spine_02, neck, clavicles) take a share of their neighbours.
// Hip travel is scaled by the leg-length ratio so the feet still meet the floor.
// Quaternius UAL2 clips share our skeleton, so their tracks are copied as they are.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const FPS = 30;

// target bone -> [source bone] or [sourceA, sourceB, mix] (a slerp between two source deltas)
const KAYKIT_MAP = {
  pelvis: ["hips"],
  spine_01: ["hips", "spine", 0.6],
  spine_02: ["spine", "chest", 0.5],
  spine_03: ["chest"],
  neck_01: ["chest", "head", 0.5],
  Head: ["head"],
  clavicle_l: ["chest"], clavicle_r: ["chest"],
  upperarm_l: ["upperarml"], lowerarm_l: ["lowerarml"], hand_l: ["handl"],
  upperarm_r: ["upperarmr"], lowerarm_r: ["lowerarmr"], hand_r: ["handr"],
  thigh_l: ["upperlegl"], calf_l: ["lowerlegl"], foot_l: ["footl"], ball_l: ["toesl"],
  thigh_r: ["upperlegr"], calf_r: ["lowerlegr"], foot_r: ["footr"], ball_r: ["toesr"],
};

function bonesOf(root) {
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  return bones;
}
function worldRotations(bones) {
  const out = {};
  for (const [name, bone] of Object.entries(bones)) out[name] = bone.getWorldQuaternion(new THREE.Quaternion());
  return out;
}
// Depth-first order, so parents are solved before children.
function ordered(bones) {
  const list = [];
  const visit = (b) => { list.push(b); b.children.forEach((c) => c.isBone && visit(c)); };
  Object.values(bones).filter((b) => !b.parent?.isBone).forEach(visit);
  return list;
}

export async function retargetKayKit(targetUrl, sourceUrl, names, rename = (n) => n) {
  const [target, source] = await Promise.all([loader.loadAsync(targetUrl), loader.loadAsync(sourceUrl)]);
  const tScene = target.scene, sScene = source.scene;
  const tBones = bonesOf(tScene), sBones = bonesOf(sScene);
  tScene.updateMatrixWorld(true); sScene.updateMatrixWorld(true);
  const tRest = worldRotations(tBones), sRest = worldRotations(sBones);
  const tRestLocal = Object.fromEntries(Object.entries(tBones).map(([n, b]) => [n, b.quaternion.clone()]));
  const tPelvisRest = tBones.pelvis.getWorldPosition(new THREE.Vector3());
  const sHipsRest = sBones.hips.getWorldPosition(new THREE.Vector3());
  const legRatio = (tBones.thigh_l.getWorldPosition(new THREE.Vector3()).y) / (sBones.upperlegl.getWorldPosition(new THREE.Vector3()).y);
  const order = ordered(tBones).filter((b) => KAYKIT_MAP[b.name]);
  const mixer = new THREE.AnimationMixer(sScene);
  const clips = [];
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion();
  const v = new THREE.Vector3();
  for (const name of names) {
    const clip = source.animations.find((c) => c.name === name);
    if (!clip) throw new Error(`missing source clip ${name}`);
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    const frames = Math.max(2, Math.round(clip.duration * FPS) + 1);
    const times = [], quats = Object.fromEntries(order.map((b) => [b.name, []])), hip = [];
    for (let f = 0; f < frames; f++) {
      const time = Math.min(clip.duration, f / FPS);
      mixer.setTime(time);
      sScene.updateMatrixWorld(true);
      times.push(+time.toFixed(4));
      const delta = (src) => qa.copy(sBones[src].getWorldQuaternion(q)).multiply(qb.copy(sRest[src]).invert()).clone();
      for (const bone of order) {
        const [a, b, mix] = KAYKIT_MAP[bone.name];
        const d = b ? delta(a).slerp(delta(b), mix) : delta(a);
        const world = d.multiply(tRest[bone.name]);
        const local = bone.parent.getWorldQuaternion(qp).invert().multiply(world);
        bone.quaternion.copy(local);
        bone.updateMatrixWorld(true);
        quats[bone.name].push(...local.toArray().map((x) => +x.toFixed(5)));
      }
      // Hip travel, scaled to our longer legs, in the pelvis parent's space.
      const travel = sBones.hips.getWorldPosition(v).sub(sHipsRest).multiplyScalar(legRatio);
      const world = tPelvisRest.clone().add(travel);
      tBones.pelvis.parent.worldToLocal(world);
      hip.push(...world.toArray().map((x) => +x.toFixed(5)));
    }
    for (const [n, b] of Object.entries(tBones)) b.quaternion.copy(tRestLocal[n]);
    const tracks = order.map((b) => ({ name: `${b.name}.quaternion`, type: "quaternion", times, values: quats[b.name] }));
    tracks.push({ name: "pelvis.position", type: "vector", times, values: hip });
    clips.push({ name: rename(name), duration: clip.duration, tracks });
  }
  return clips;
}

// Same skeleton: copy the clips, dropping root motion, finger leaf tracks and constant channels.
export async function copyClips(sourceUrl, names, rename = (n) => n) {
  const source = await loader.loadAsync(sourceUrl);
  return names.map((name) => {
    const clip = source.animations.find((c) => c.name === name);
    if (!clip) throw new Error(`missing source clip ${name}`);
    // Bone lengths never animate: keep rotations, plus the hips' travel.
    const keep = (t) => !/^root\.|leaf/.test(t.name) && (t.name.endsWith(".quaternion") || t.name === "pelvis.position");
    const tracks = clip.tracks.filter(keep).map((t) => ({
      name: t.name, type: t.ValueTypeName, times: Array.from(t.times, (x) => +x.toFixed(4)), values: Array.from(t.values, (x) => +x.toFixed(5)),
    }));
    return { name: rename(name), duration: clip.duration, tracks };
  });
}
