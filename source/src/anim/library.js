// The contestant's animation library: Quaternius UAL1 clips plus the extra clips baked into
// public/assets/anim/clips.json by src/anim/tools/bake-clips.mjs (Quaternius UAL2 and KayKit
// Character Animations, retargeted). Everything is CC0; see docs/ASSET_LICENSES.md.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const TRACK = { quaternion: THREE.QuaternionKeyframeTrack, vector: THREE.VectorKeyframeTrack, number: THREE.NumberKeyframeTrack };

function parse(json) {
  const tracks = json.tracks.map((t) => new TRACK[t.type](t.name, t.times, t.values));
  return new THREE.AnimationClip(json.name, json.duration, tracks);
}

let library = null;
/** Resolves to an array of THREE.AnimationClip, shared by every contestant. */
export function loadClips() {
  library ??= Promise.all([
    new GLTFLoader().loadAsync("/assets/looktest/chars/UAL1_Standard.glb").then((g) => g.animations),
    fetch("/assets/anim/clips.json").then((r) => r.json()).then((j) => j.clips.map(parse)),
  ]).then(([ual1, baked]) => [...ual1, ...baked]);
  return library;
}
