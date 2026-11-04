import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RAMPS, addRim, addOutlines, shared } from "./toon.js";
import { numberTexture, helmetTexture } from "./textures.js";

const loader = new GLTFLoader();
const cache = new Map();
function load(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}
const texLoader = new THREE.TextureLoader();
function loadTex(url) {
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  return t;
}

export const TEAMS = {
  red: { suit: 0xe8242c, dark: 0x7a0e16, trim: 0xfff4e0 },
  blue: { suit: 0x1f5bff, dark: 0x0b2380, trim: 0xfff4e0 },
};

let animClips = null;
async function clips() {
  if (!animClips) animClips = (await load("/assets/looktest/chars/UAL1_Standard.glb")).animations;
  return animClips;
}

const D = THREE.MathUtils.degToRad;
const CHILD = {
  upperarm_r: "lowerarm_r", lowerarm_r: "hand_r", upperarm_l: "lowerarm_l", lowerarm_l: "hand_l",
  thigh_r: "calf_r", calf_r: "foot_r", thigh_l: "calf_l", calf_l: "foot_l",
  spine_01: "spine_03", spine_03: "neck_01", neck_01: "Head", clavicle_r: "upperarm_r", clavicle_l: "upperarm_l",
  hand_r: "middle_01_r", hand_l: "middle_01_l", foot_r: "ball_r", foot_l: "ball_l",
};
/** Points `name` so its child joint lies along `dir` (in the character's own space). */
function aim(root, name, dir) {
  const b = root.getObjectByName(name), c = root.getObjectByName(CHILD[name]);
  root.updateMatrixWorld(true);
  const bp = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  const cp = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const want = new THREE.Vector3(...dir).normalize().applyQuaternion(rootQ);
  const dq = new THREE.Quaternion().setFromUnitVectors(cp.sub(bp).normalize(), want);
  const bw = b.getWorldQuaternion(new THREE.Quaternion());
  const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.copy(pw.invert().multiply(dq.multiply(bw)));
  root.updateMatrixWorld(true);
}
function applyPose(root, clip, t, tweaks, aims = []) {
  const mixer = new THREE.AnimationMixer(root);
  if (clip) {
    mixer.clipAction(clip).play();
    mixer.setTime(t);
  }
  root.updateMatrixWorld(true);
  for (const [name, dir] of aims) aim(root, name, dir);
  root.traverse((b) => {
    if (!b.isBone || !tweaks[b.name]) return;
    const [x, y, z] = tweaks[b.name];
    b.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(D(x), D(y), D(z), "XYZ")));
  });
  root.updateMatrixWorld(true);
}

/**
 * Builds the jumpsuit as a shader layer over the base body. Every panel is
 * computed in the rest (T-pose) space of the mesh, so stripes, numbers and
 * cuffs bend with the skin with no seams or decals to float off the body.
 */
function suitMaterial(skinMap, team, number, variant) {
  const m = new THREE.MeshToonMaterial({ map: skinMap, gradientMap: RAMPS.char });
  const u = {
    suitCol: { value: new THREE.Color(team.suit) },
    darkCol: { value: new THREE.Color(team.dark) },
    trimCol: { value: new THREE.Color(team.trim) },
    gloveCol: { value: new THREE.Color(0x2a2430) },
    shoeCol: { value: new THREE.Color(0xe6dfd2) },
    numTex: { value: numberTexture(number) },
    helmet: { value: variant === "b" ? 1 : 0 },
    styleB: shared.styleB,
  };
  m.userData.suit = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute vec3 aRest; attribute vec3 aRestN; attribute vec3 aRegion;
         varying vec3 vRest; varying vec3 vRestN; varying vec3 vRegion;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vRest = aRest; vRestN = aRestN; vRegion = aRegion;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform vec3 suitCol, darkCol, trimCol, gloveCol, shoeCol; uniform sampler2D numTex; uniform float styleB;
         varying vec3 vRest; varying vec3 vRestN; varying vec3 vRegion;
         float band(float x, float a, float b) { return step(a, x) * step(x, b); }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          vec3 p = vRest; vec3 n = normalize(vRestN);
          float head = vRegion.x, hand = vRegion.y, foot = vRegion.z;
          vec3 c = suitCol;
          float ax = abs(p.x);
          // piping: outer leg + torso side, top of the arm and over the shoulder
          float sideOut = step(0.0, n.x * sign(p.x));
          float legStripe = band(p.y, 0.06, 0.98) * sideOut * step(0.86, abs(n.x)) * step(ax, 0.3);
          float torsoStripe = band(p.y, 0.98, 1.34) * step(0.965, abs(n.x)) * step(ax, 0.3);
          legStripe = max(legStripe, torsoStripe);
          float armStripe = step(0.24, ax) * step(0.80, n.y);
          float shoulder = band(ax, 0.12, 0.24) * step(0.93, n.y) * step(1.38, p.y);
          c = mix(c, trimCol, max(max(legStripe, armStripe), shoulder));
          // belt
          c = mix(c, darkCol, band(p.y, 0.965, 1.015) * step(ax, 0.3));
          // knee pads (front of knee)
          float knee = band(p.y, 0.47, 0.62) * step(0.25, n.z) * step(ax, 0.3);
          c = mix(c, vec3(0.16, 0.15, 0.19), knee);
          // look B: padded, quilted vest panels + elbow pads
          if (styleB > 0.5) {
            float vest = band(p.y, 1.02, 1.47) * step(ax, 0.2) * step(0.35, n.z);
            float quilt = step(0.8, fract(p.y / 0.07)) + step(0.92, fract((p.x + 0.5) / 0.09));
            vec3 padCol = mix(suitCol, darkCol, 0.28);
            c = mix(c, mix(padCol, darkCol, clamp(quilt, 0.0, 1.0) * 0.7), vest);
            float vestEdge = vest * (1.0 - band(p.y, 1.04, 1.45) * step(ax, 0.185));
            c = mix(c, trimCol, vestEdge);
            float elbow = band(ax, 0.42, 0.52) * step(n.z, -0.1);
            c = mix(c, vec3(0.16, 0.15, 0.19), elbow);
            float thighPad = band(p.y, 0.66, 0.9) * step(0.3, n.z) * step(ax, 0.3);
            c = mix(c, mix(padCol, darkCol, step(0.8, fract(p.y / 0.06)) * 0.7), thighPad);
          }
          // number on the back, small number on the chest
          vec2 bu = vec2((p.x + 0.22) / 0.44, (p.y - 0.99) / 0.44);
          float onBack = step(p.z, -0.02) * step(n.z, -0.2) * band(bu.x, 0.0, 1.0) * band(bu.y, 0.0, 1.0);
          vec4 nb = texture2D(numTex, vec2(1.0 - bu.x, bu.y));
          c = mix(c, nb.rgb, nb.a * onBack);
          vec2 cu = vec2((p.x + 0.17) / 0.11, (p.y - 1.31) / 0.11);
          float onChest = step(0.05, p.z) * step(0.35, n.z) * band(cu.x, 0.0, 1.0) * band(cu.y, 0.0, 1.0);
          vec4 nc = texture2D(numTex, vec2(cu.x, cu.y));
          c = mix(c, nc.rgb, nc.a * onChest);
          // collar
          c = mix(c, trimCol, step(0.12, head) * step(head, 0.62) * step(p.y, 1.62));
          // gloves with a cuff
          c = mix(c, trimCol, step(0.06, hand) * step(hand, 0.45));
          c = mix(c, gloveCol, step(0.45, hand));
          // high-top sneakers: cream upper, team-colour sole, dark lace panel
          float shoe = step(0.4, foot);
          vec3 sh = mix(shoeCol, darkCol, step(p.y, 0.035));
          sh = mix(sh, trimCol * 0.92, step(0.08, foot) * step(foot, 0.4));
          c = mix(c, sh, step(0.08, foot));
          // skin only on the head
          float skin = step(0.62, head);
          diffuseColor.rgb = mix(c, diffuseColor.rgb, skin);
        }`,
      );
  };
  m.customProgramCacheKey = () => "suit";
  addRim(m, 0xfff0dc, 0.32, 2.5);
  return m;
}

function bakeRestAttributes(mesh) {
  const g = mesh.geometry;
  const pos = g.getAttribute("position"),
    nor = g.getAttribute("normal");
  const si = g.getAttribute("skinIndex"),
    sw = g.getAttribute("skinWeight");
  mesh.updateMatrixWorld(true);
  const mw = mesh.matrixWorld,
    nm = new THREE.Matrix3().getNormalMatrix(mw);
  const rest = new Float32Array(pos.count * 3),
    restN = new Float32Array(pos.count * 3),
    region = new Float32Array(pos.count * 3);
  const names = mesh.skeleton.bones.map((b) => b.name);
  const isHead = names.map((n) => n === "Head");
  const isHand = names.map((n) => /hand_|index_|middle_|ring_|pinky_|thumb_/.test(n));
  const isFoot = names.map((n) => /foot_|ball_/.test(n));
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mw);
    rest.set([v.x, v.y, v.z], i * 3);
    v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    restN.set([v.x, v.y, v.z], i * 3);
    let h = 0,
      hd = 0,
      f = 0;
    for (let k = 0; k < 4; k++) {
      const b = si.getComponent(i, k),
        w = sw.getComponent(i, k);
      if (isHead[b]) h += w;
      if (isHand[b]) hd += w;
      if (isFoot[b]) f += w;
    }
    region.set([h, hd, f], i * 3);
  }
  g.setAttribute("aRest", new THREE.BufferAttribute(rest, 3));
  g.setAttribute("aRestN", new THREE.BufferAttribute(restN, 3));
  g.setAttribute("aRegion", new THREE.BufferAttribute(region, 3));
}

/** Full-face stunt helmet for the B look: shell + visor + chin bar + stripe. */
function makeHelmet(team, number) {
  const grp = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.155, 32, 24),
    addRim(
      new THREE.MeshToonMaterial({
        map: helmetTexture("#" + new THREE.Color(team.suit).getHexString(), "#fff4e0", number),
        gradientMap: RAMPS.char,
      }),
      0xffffff,
      0.5,
    ),
  );
  shell.scale.set(1.0, 1.08, 1.12);
  shell.position.set(0, 0.075, 0.0);
  grp.add(shell);
  // visor: dark smoked, glossy-looking via a bright band
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.1585, 32, 16, Math.PI * 0.1, Math.PI * 0.8, Math.PI * 0.34, Math.PI * 0.25),
    addRim(new THREE.MeshToonMaterial({ color: 0x15131c, gradientMap: RAMPS.char }), 0x9fdcff, 0.9, 2.0),
  );
  visor.scale.copy(shell.scale);
  visor.position.copy(shell.position);
  grp.add(visor);
  // toon glint across the visor
  const glint = new THREE.Mesh(
    new THREE.SphereGeometry(0.1595, 24, 4, Math.PI * 0.22, Math.PI * 0.3, Math.PI * 0.37, Math.PI * 0.03),
    new THREE.MeshBasicMaterial({ color: 0xdff3ff }),
  );
  glint.scale.copy(shell.scale);
  glint.position.copy(shell.position);
  grp.add(glint);
  return grp;
}

/**
 * opts: body gltf url, skin texture, hair url, team, number, clip name/time,
 * tweaks (bone -> euler degrees), variant "a"|"b".
 */
export async function makeContestant(opts) {
  const [gl, all] = await Promise.all([load(opts.body), clips()]);
  const clip = all.find((c) => c.name === opts.clip);
  const { clone } = await import("three/examples/jsm/utils/SkeletonUtils.js");
  const body = clone(gl.scene);
  body.updateMatrixWorld(true);
  const headRestQ = new THREE.Quaternion();
  body.getObjectByName("Head").getWorldQuaternion(headRestQ);
  const handRestQ = new THREE.Quaternion();
  body.getObjectByName("hand_r").getWorldQuaternion(handRestQ);
  const foreRestQ = new THREE.Quaternion();
  body.getObjectByName("lowerarm_r").getWorldQuaternion(foreRestQ);
  const armRestQ = { l: new THREE.Quaternion(), r: new THREE.Quaternion() };
  body.getObjectByName("upperarm_l").getWorldQuaternion(armRestQ.l);
  body.getObjectByName("upperarm_r").getWorldQuaternion(armRestQ.r);
  const group = new THREE.Group();
  group.add(body);
  const skin = loadTex(opts.skin);
  let bodyMesh = null;
  body.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.frustumCulled = false;
    if (/Superhero|SuperHero/.test(o.name)) {
      bodyMesh = o;
      o.geometry = o.geometry.clone();
      bakeRestAttributes(o);
      o.material = suitMaterial(skin, opts.team, opts.number, opts.variant);
    } else {
      const map = o.material.map;
      o.material = new THREE.MeshToonMaterial({ map, gradientMap: RAMPS.char });
      o.userData.noOutline = true;
      o.userData.faceDetail = true;
    }
  });
  applyPose(body, clip, opts.t ?? 0, opts.tweaks ?? {}, opts.aims);

  const parts = { face: [], hair: null, helmet: null };
  body.traverse((o) => o.userData.faceDetail && parts.face.push(o));
  if (opts.hair) {
    const hg = clone((await load(opts.hair)).scene);
    hg.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.frustumCulled = false;
        o.material = new THREE.MeshToonMaterial({
          map: o.material.map,
          color: opts.hairTint ?? 0xffffff,
          gradientMap: RAMPS.char,
        });
        o.userData.noOutline = !opts.hairOutline;
      }
    });
    applyPose(hg, clip, opts.t ?? 0, opts.tweaks ?? {}, opts.aims);
    group.add(hg);
    parts.hair = hg;
  }
  const bones = {};
  body.traverse((o) => o.isBone && (bones[o.name] = o));
  // Helmet (look B) rides the head bone.
  const helmet = makeHelmet(opts.team, opts.number);
  helmet.visible = false;
  {
    const head = bones.Head;
    // place in head-bone space at rest: helmet centre ~ 0.1 above the head joint
    const holder = new THREE.Group();
    head.add(holder);
    holder.position.set(0, 0.0, 0);
    // head bone axes differ from world; orient holder back to world-up at rest
    holder.quaternion.copy(headRestQ).invert();
    holder.add(helmet);
    parts.helmet = helmet;
    parts.helmetHolder = holder;
  }
  // forearm grapple gauntlet on the cable arm: slim launcher tube + reel drum
  {
    const fore = bones.lowerarm_r;
    const holder = new THREE.Group();
    fore.add(holder);
    holder.quaternion.copy(foreRestQ).invert();
    const gun = new THREE.MeshToonMaterial({ color: 0x34323c, gradientMap: RAMPS.char });
    addRim(gun, 0xffffff, 0.35);
    const capM = addRim(new THREE.MeshToonMaterial({ color: 0xd2d8de, gradientMap: RAMPS.char }), 0xffffff, 0.5);
    const g = new THREE.Group();
    // rest pose: right forearm runs from the elbow toward -X
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.2, 14), gun);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(-0.15, 0.055, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 14), new THREE.MeshToonMaterial({ color: opts.team.suit, gradientMap: RAMPS.char }));
    band.rotation.z = Math.PI / 2;
    band.position.set(-0.11, 0.055, 0);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.05, 12), capM);
    tip.rotation.z = Math.PI / 2;
    tip.position.set(-0.27, 0.055, 0);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 14), capM);
    drum.position.set(-0.17, 0.11, 0);
    g.add(tube, band, tip, drum);
    holder.add(g);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    // the cable leaves from the launcher tip
    const exit = new THREE.Object3D();
    exit.position.set(-0.29, 0.055, 0);
    holder.add(exit);
    group.userData.reel = exit;
  }
  // look B: chunky shoulder pads riding the upper arms
  parts.pads = [];
  for (const [side, sx] of [["l", 1], ["r", -1]]) {
    const bone = bones["upperarm_" + side];
    const holder = new THREE.Group();
    bone.add(holder);
    holder.quaternion.copy(armRestQ[side]).invert();
    const padMat = addRim(new THREE.MeshToonMaterial({ color: opts.team.suit, gradientMap: RAMPS.char }), 0xffffff, 0.35);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), padMat);
    pad.scale.set(1.15, 0.7, 1.2);
    pad.position.set(-0.01 * sx, 0.07, 0.0);
    pad.rotation.z = -0.35 * sx;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 24), new THREE.MeshToonMaterial({ color: opts.team.trim, gradientMap: RAMPS.char }));
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1, 1.05, 1);
    pad.add(rim);
    holder.add(pad);
    pad.visible = false;
    pad.castShadow = true;
    parts.pads.push(pad);
  }
  group.userData.parts = parts;
  group.userData.bones = bones;
  group.userData.bodyMesh = bodyMesh;
  group.userData.outline = addOutlines(body, 2.6, 6);
  group.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

export function setVariant(group, v) {
  const p = group.userData.parts;
  const b = v === "b" || v === "final";
  p.helmet.visible = b;
  if (p.hair) p.hair.visible = !b;
  p.face.forEach((o) => (o.visible = !b));
  p.pads.forEach((o) => (o.visible = b));
  group.userData.outline.userData.px.value = b ? 3.4 : 2.6;
}
