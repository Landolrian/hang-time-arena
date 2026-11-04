// World-space posing helpers for a three.js skeleton. Every function edits bone.quaternion
// (local) and refreshes the world matrices below the bone, so later calls see earlier ones.
import * as THREE from "three";

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();
const turn = new THREE.Quaternion(), identity = new THREE.Quaternion();
const legA = new THREE.Quaternion(), legB = new THREE.Quaternion();

/** Sets a bone's world rotation (blended by `weight` from its current one). */
export function setWorldQuaternion(bone, world, weight = 1) {
  const parent = bone.parent.getWorldQuaternion(q1).invert();
  const local = q2.copy(parent).multiply(world);
  if (weight >= 1) bone.quaternion.copy(local);
  else bone.quaternion.slerp(local, weight);
  bone.updateMatrixWorld(true);
}

/** Applies a world-space rotation `rotation` to a bone (blended by `weight`). */
export function rotateWorld(bone, rotation, weight = 1) {
  const world = bone.getWorldQuaternion(q3);
  const target = turn.slerpQuaternions(identity, rotation, weight).multiply(world);
  setWorldQuaternion(bone, target);
}

/**
 * Turns `bone` so the segment towards `child` points `weight` of the way to world direction
 * `to`. A turn that could pass near half a circle goes by way of `via`, so neither its path nor
 * its leftover twist can flip between frames.
 */
export function aimBone(bone, child, to, weight = 1, via = null) {
  const from = child.getWorldPosition(v2).sub(bone.getWorldPosition(v1)).normalize();
  if (via) {
    const first = from.angleTo(via), second = via.angleTo(to), travel = weight * (first + second);
    legA.setFromUnitVectors(from, via);
    if (travel <= first) turn.slerpQuaternions(identity, legA, first > 1e-6 ? travel / first : 1);
    else turn.slerpQuaternions(identity, legB.setFromUnitVectors(via, to), second > 1e-6 ? (travel - first) / second : 1).multiply(legA);
  } else turn.slerpQuaternions(identity, legA.setFromUnitVectors(from, to), weight);
  setWorldQuaternion(bone, turn.multiply(bone.getWorldQuaternion(q3)));
}

/**
 * Rest-pose data for a two-bone chain, so the solver can build each bone's whole orientation
 * (direction plus the roll that keeps the joint's hinge in the bend plane) instead of the
 * shortest turn from wherever the clip left it, which can flip when the clip's limb points the
 * other way. `hinge` is the bend axis in world space at rest: the joint bends so that
 * `hinge x segment` points from the joint towards the far end.
 */
export function chain(upper, lower, end, hinge) {
  const local = (bone, child) => {
    const world = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    return { dir: child.position.clone().normalize(), hinge: hinge.clone().applyQuaternion(world).normalize() };
  };
  return { upper, lower, end, a: local(upper, lower), b: local(lower, end) };
}
const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), qa = new THREE.Quaternion();
// World rotation that takes the bone's local (dir, hinge) frame to the world (dir, hinge) frame.
function frameRotation(localDir, localHinge, dir, hinge, out) {
  const lh = v1.copy(localHinge).addScaledVector(localDir, -localHinge.dot(localDir)).normalize();
  m1.makeBasis(lh, localDir, v2.crossVectors(lh, localDir));
  const wh = v3.copy(hinge).addScaledVector(dir, -hinge.dot(dir)).normalize();
  m2.makeBasis(wh, dir, v4.crossVectors(wh, dir));
  return out.setFromRotationMatrix(m2.multiply(m1.transpose()));
}

/**
 * Two-bone IK on a `chain()`: puts the end joint at world point `target`, with the middle joint
 * bending out towards world direction `pole`. Blended by `weight` against the current pose.
 */
export function twoBoneIK(c, target, pole, weight = 1) {
  if (weight <= 0) return;
  const { upper, lower, end } = c;
  const a = upper.getWorldPosition(new THREE.Vector3());
  const l1 = a.distanceTo(lower.getWorldPosition(v3)), l2 = lower.getWorldPosition(v3).distanceTo(end.getWorldPosition(v4));
  const toTarget = target.clone().sub(a);
  const d = THREE.MathUtils.clamp(toTarget.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
  const n = toTarget.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const p = pole.clone().addScaledVector(n, -pole.dot(n));
  if (p.lengthSq() < 1e-8) p.set(0, -1, 0).addScaledVector(n, -n.y);
  p.normalize();
  const elbow = a.clone().addScaledVector(n, l1 * cosA).addScaledVector(p, l1 * Math.sqrt(1 - cosA * cosA));
  const hand = a.clone().addScaledVector(n, d);
  // The hinge is perpendicular to the bend plane, oriented so the joint bends towards the pole.
  const upperDir = elbow.clone().sub(a).normalize(), lowerDir = hand.clone().sub(elbow).normalize();
  const hinge = new THREE.Vector3().crossVectors(lowerDir, upperDir);
  if (hinge.lengthSq() < 1e-6) hinge.crossVectors(p, upperDir);
  hinge.normalize();
  const before = [upper.quaternion.clone(), lower.quaternion.clone()];
  setWorldQuaternion(upper, frameRotation(c.a.dir, c.a.hinge, upperDir, hinge, qa));
  setWorldQuaternion(lower, frameRotation(c.b.dir, c.b.hinge, lowerDir, hinge, qa));
  if (weight < 1) {
    upper.quaternion.copy(before[0].slerp(upper.quaternion, weight));
    lower.quaternion.copy(before[1].slerp(lower.quaternion, weight));
    upper.updateMatrixWorld(true);
  }
}

/** Spreads a world-space rotation over a chain of bones by the given shares. */
export function spread(bones, rotation, shares) {
  bones.forEach((bone, i) => rotateWorld(bone, rotation, shares[i]));
}
