import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { loadFonts, logoTexture } from "./textures.js";
import { buildStudio, makeBeam, glowSprite, STUDIO_Y } from "./studio.js";
import { buildKitchen } from "./kitchen.js";
import { buildSetB } from "./lookb.js";
import { makeContestant, setVariant, TEAMS } from "./contestant.js";
import { buildAudience } from "./audience.js";
import { buildHud } from "./hud.js";
import { toon, shared, addOutlines } from "./toon.js";
import { GradeShader, VhsShader, SanitizeShader } from "./post.js";

const q = new URLSearchParams(location.search);
await loadFonts();

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0a14);
scene.fog = new THREE.Fog(0x0c0a14, 70, 230);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600);

// ---------------- lights ----------------
const GRID_Y = 50 - 1.6; // fixtures hang just under the truss bottom chord
const HERO = { pos: new THREE.Vector3(-10, 15.5, 12), anchor: new THREE.Vector3(-16, 49.2, -4) };
const BLUE = { pos: new THREE.Vector3(30, 22, -18), anchor: new THREE.Vector3(40, 49.35, -30) };

const hemi = new THREE.HemisphereLight(0x5a5078, 0x2a1f24, 0.8);
scene.add(hemi);
// warm spill bouncing off the lit set back toward the house (audience, cameras)
const spill = new THREE.DirectionalLight(0xffb98a, 0.35);
spill.position.set(0, 20, -40);
spill.target.position.set(0, 0, 60);
scene.add(spill, spill.target);

function spot({ color, from, to, angle, penumbra = 0.6, intensity, shadow = false, beam = 0.0, decay = 0 }) {
  const l = new THREE.SpotLight(color, intensity, 0, THREE.MathUtils.degToRad(angle), penumbra, decay);
  l.position.copy(from);
  l.target.position.copy(to);
  scene.add(l, l.target);
  if (shadow) {
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.bias = -0.0006;
    l.shadow.normalBias = 0.18;
    l.shadow.camera.near = 5;
    l.shadow.camera.far = 220;
  }
  if (beam > 0) scene.add(makeBeam(from, to, Math.min(angle * 0.45, 9), color, beam));
  return l;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rigReal = [
  // key: tungsten from the front-of-house truss
  { kind: "fresnel", pos: V(-8, GRID_Y + 4, 52), target: V(-6, 0, -6), gel: 0xffe6c2 },
  // gels from the grid
  { kind: "par", pos: V(-46, GRID_Y, -4), target: V(-14, 0, -24), gel: 0xff3da8 },
  { kind: "par", pos: V(48, GRID_Y, -4), target: V(16, 0, -16), gel: 0x3dd8ff },
  { kind: "par", pos: V(-4, GRID_Y, -30), target: V(-4, 22, -41), gel: 0xffb23d },
  // follow spots
  { kind: "fresnel", pos: V(14, GRID_Y + 4, 52), target: HERO.pos, gel: 0xfff2dc },
  { kind: "fresnel", pos: V(40, GRID_Y + 4, 52), target: BLUE.pos, gel: 0xfff2dc },
];
// purely decorative fixtures: lens glow + soft beam, no real light
const rigFake = [];
for (const [i, x] of [-52, -38, -24, 10, 24, 38, 52].entries()) {
  const gel = [0xff3da8, 0x3dd8ff, 0xffb23d][i % 3];
  rigFake.push({ kind: "par", pos: V(x, GRID_Y, 22), target: V(x * 0.7, 0, 6 + (i % 2) * 8), gel, beam: 0.07 });
}
for (const [i, x] of [-56, -30, 2, 30, 56].entries()) {
  const gel = [0x3dd8ff, 0xffb23d, 0xff3da8][i % 3];
  rigFake.push({ kind: "par", pos: V(x, GRID_Y, -30), target: V(x * 0.8, 4, -38), gel, beam: 0.06 });
}
for (const x of [-48, -24, 0, 24, 48])
  rigFake.push({ kind: "blinder", pos: V(x, GRID_Y + 4, 52), target: V(x * 0.8, 6, 75), gel: 0xffc98a, beam: 0 });

const studio = await buildStudio(scene, { rig: [...rigReal, ...rigFake] });
const kitchen = await buildKitchen(scene);
const setB = buildSetB(scene, kitchen);

const lights = {
  key: spot({ color: 0xffe6c2, from: rigReal[0].pos, to: rigReal[0].target, angle: 34, intensity: 2.0, shadow: true }),
  mag: spot({ color: 0xff3da8, from: rigReal[1].pos, to: rigReal[1].target, angle: 22, penumbra: 0.45, intensity: 2.4, beam: 0.08 }),
  cyan: spot({ color: 0x3dd8ff, from: rigReal[2].pos, to: rigReal[2].target, angle: 22, penumbra: 0.45, intensity: 2.2, beam: 0.07 }),
  amber: spot({ color: 0xffb23d, from: rigReal[3].pos, to: rigReal[3].target, angle: 46, intensity: 1.3, beam: 0.045 }),
  follow: spot({ color: 0xfff2dc, from: rigReal[4].pos, to: HERO.pos, angle: 2.6, penumbra: 0.4, intensity: 0.9, shadow: true, beam: 0.12 }),
  follow2: spot({ color: 0xfff2dc, from: rigReal[5].pos, to: BLUE.pos, angle: 2.4, penumbra: 0.4, intensity: 1.7, beam: 0.1 }),
  rim: spot({ color: 0xbfd8ff, from: V(-30, GRID_Y, -30), to: HERO.pos, angle: 5, penumbra: 0.5, intensity: 5.0 }),
  audience: spot({ color: 0x6a5cff, from: V(0, GRID_Y + 4, 40), to: V(0, 6, 70), angle: 40, intensity: 0.7 }),
};
for (const f of rigFake) if (f.beam) scene.add(makeBeam(f.pos, f.target, 7, f.gel, f.beam));
// lens glows for every fixture
for (const r of [...rigReal, ...rigFake]) {
  const dir = r.target.clone().sub(r.pos).normalize();
  const s = glowSprite(r.gel, r.kind === "blinder" ? 5 : 2.6, r.kind === "blinder" ? 0.4 : 0.75);
  s.position.copy(r.pos).addScaledVector(dir, 1.3);
  scene.add(s);
}

// ---------------- show logo marquee hanging over the set ----------------
{
  const g = new THREE.Group();
  const w = 30,
    h = 12;
  const board = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.8, 4, 1.4), toon({ color: 0x2a1f3a }));
  g.add(board);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.94, h * 0.94 * 0.98),
    new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true, fog: false }),
  );
  face.position.z = 0.42;
  face.scale.set(1, 1, 1);
  g.add(face);
  // chase-light bulbs around the edge
  const bulbs = [];
  const n = 46;
  const shape = (t) => {
    const per = 2 * (w + h - 4);
    let d = t * per;
    const hw = w / 2 - 0.9,
      hh = h / 2 - 0.9;
    if (d < 2 * hw) return [-hw + d, hh];
    d -= 2 * hw;
    if (d < 2 * hh) return [hw, hh - d];
    d -= 2 * hh;
    if (d < 2 * hw) return [hw - d, -hh];
    d -= 2 * hw;
    return [-hw, -hh + d];
  };
  const bulbGeo = new THREE.SphereGeometry(0.28, 10, 8);
  const on = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(2.2) });
  const off = new THREE.MeshBasicMaterial({ color: 0x6b5a3a });
  for (let i = 0; i < n; i++) {
    const [x, y] = shape(i / n);
    const b = new THREE.Mesh(bulbGeo, i % 3 === 0 ? off : on);
    b.position.set(x, y, 0.55);
    g.add(b);
  }
  // hanging cables
  const cableMat = toon({ color: 0x15131a });
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 9, 6), cableMat);
    c.position.set(sx * (w / 2 - 3), h / 2 + 4.5, 0);
    g.add(c);
  }
  g.position.set(-38, 34, 21);
  g.rotation.y = 0.42;
  scene.add(g);
}

// ---------------- audience ----------------
await buildAudience(scene, studio.bleachers);

// ---------------- contestants ----------------
const look = ["a", "b"].includes(q.get("style")) ? q.get("style") : "final";
const hero = await makeContestant({
  body: "/assets/looktest/chars/ubc/Superhero_Male_FullBody.gltf",
  skin: "/assets/looktest/chars/ubc/T_Superhero_Male_Ligh.png",
  hair: "/assets/looktest/chars/ubc/Hair_Buzzed.gltf",
  hairTint: 0x7a5236,
  team: TEAMS.red,
  number: 7,
  clip: "Jump_Loop",
  t: 0.25,
  tweaks: {},
  // "flying fast": chest leading, free arm swept back, legs streaming behind
  aims: [
    ["spine_01", [0, 1, 0.22]],
    ["spine_03", [0.06, 1, 0.3]],
    ["neck_01", [0, 1, 0.75]],
    ["upperarm_r", [-0.15, 1, 0.35]],
    ["lowerarm_r", [-0.05, 1, 0.4]],
    ["upperarm_l", [0.55, -0.25, -0.8]],
    ["lowerarm_l", [0.3, -0.35, -0.9]],
    ["thigh_r", [-0.1, -0.8, -0.55]],
    ["calf_r", [-0.04, -0.35, -0.95]],
    ["thigh_l", [0.14, -0.95, -0.15]],
    ["calf_l", [0.06, -0.7, -0.7]],
  ],
  variant: look,
});
const blue = await makeContestant({
  body: "/assets/looktest/chars/ubc/Superhero_Female_FullBody.gltf",
  skin: "/assets/looktest/chars/ubc/T_Superhero_Female_Dark_BaseColor.png",
  hair: "/assets/looktest/chars/ubc/Hair_Buns.gltf",
  hairTint: 0x3a2a22,
  team: TEAMS.blue,
  number: 12,
  clip: "Jump_Loop",
  t: 0.5,
  tweaks: {},
  aims: [
    ["upperarm_r", [-0.3, 1, -0.1]],
    ["lowerarm_r", [-0.1, 1, 0.1]],
    ["upperarm_l", [0.8, -0.35, 0.5]],
    ["lowerarm_l", [0.3, 0.2, 1]],
    ["thigh_r", [-0.1, -0.75, 0.65]],
    ["calf_r", [0, -0.5, -0.85]],
    ["thigh_l", [0.15, -0.9, 0.4]],
    ["calf_l", [0.05, -1, 0.0]],
  ],
  variant: look,
});
scene.add(hero, blue);

/** Aligns a posed contestant so the cable hand points at the anchor. */
function hang(group, at, anchor, yaw, backTo = null) {
  group.position.copy(at);
  group.rotation.set(0, yaw, 0);
  group.updateMatrixWorld(true);
  const hand = group.userData.bones.hand_r;
  const hp = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
  // tilt the whole body so the shoulder->hand line points along the cable
  const sh = new THREE.Vector3().setFromMatrixPosition(group.userData.bones.upperarm_r.matrixWorld);
  const arm = hp.clone().sub(sh).normalize();
  const want = anchor.clone().sub(sh).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(arm, want);
  group.quaternion.premultiply(q);
  group.updateMatrixWorld(true);
  if (backTo) {
    // spin about the cable so the number on the back faces the chase camera
    const b = group.userData.bones;
    const P = (n) => new THREE.Vector3().setFromMatrixPosition(b[n].matrixWorld);
    const backDir = () => {
      const left = P("upperarm_l").sub(P("upperarm_r"));
      const up = P("neck_01").sub(P("pelvis"));
      return new THREE.Vector3().crossVectors(left, up).normalize().negate();
    };
    const axis = want.clone();
    const base = group.quaternion.clone();
    let best = -2, bestA = 0;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      group.quaternion.copy(base).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, a));
      group.updateMatrixWorld(true);
      const d = backDir().dot(backTo);
      if (d > best) (best = d), (bestA = a);
    }
    group.quaternion.copy(base).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, bestA));
    // pivot was the feet; keep the shoulder where it was so the cable still lands
    group.updateMatrixWorld(true);
    const sh2 = P("upperarm_r");
    group.position.add(sh.clone().sub(sh2));
  }
  group.updateMatrixWorld(true);
  return group;
}
hang(hero, HERO.pos, HERO.anchor, Math.PI + 0.25, new THREE.Vector3(-0.25, 0.35, 1).normalize());
hang(blue, BLUE.pos, BLUE.anchor, 2.4);

function cable(group, anchor, color) {
  const hand = new THREE.Vector3();
  group.userData.reel.getWorldPosition(hand);
  const len = hand.distanceTo(anchor);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8), toon({ color, rim: 0xffffff, rimStrength: 0.4 }));
  m.position.copy(hand).add(anchor).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), anchor.clone().sub(hand).normalize());
  scene.add(m);
  // grapple hook clamped on the truss chord
  const hook = new THREE.Group();
  const steel = toon({ color: 0xd2d8de, rim: 0xffffff, rimStrength: 0.5 });
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8), steel);
  hook.add(shank);
  for (let i = 0; i < 3; i++) {
    const prong = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 6, 12, Math.PI * 0.9), steel);
    prong.rotation.y = (i / 3) * Math.PI * 2;
    prong.position.y = 0.45;
    prong.rotation.z = Math.PI / 2;
    hook.add(prong);
  }
  hook.position.copy(anchor);
  hook.quaternion.copy(m.quaternion);
  scene.add(hook);
  return m;
}
cable(hero, HERO.anchor, 0xe9e2cf);
cable(blue, BLUE.anchor, 0xe9e2cf);

/** Speed streak: a soft ribbon along the swing arc behind the contestant. */
function swingTrail(group, anchor, travel, color, width = 1.1, sweep = 0.55) {
  const chest = new THREE.Vector3().setFromMatrixPosition(group.userData.bones.spine_03.matrixWorld);
  const rv = chest.clone().sub(anchor);
  const axis = new THREE.Vector3().crossVectors(rv, travel).normalize();
  const n = 40;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = rv.clone().applyAxisAngle(axis, -sweep * t - 0.06).add(anchor);
    const w = width * (1 - t * 0.55);
    // ribbon opens toward the camera side so it reads as a streak, not a blade
    const side = axis.clone().multiplyScalar(w / 2);
    pos.push(...p.clone().add(side).toArray(), ...p.clone().sub(side).toArray());
    uv.push(t, 0, t, 1);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(
    g,
    new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 color; varying vec2 vUv;
        void main(){ float a = pow(1.0 - vUv.x, 1.8) * smoothstep(0.0, 0.08, vUv.x);
          float e = 1.0 - pow(abs(vUv.y - 0.5) * 2.0, 2.0);
          float core = smoothstep(0.75, 1.0, e);
          gl_FragColor = vec4(mix(color, vec3(1.0), core * 0.6) * a * e * 0.55, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  m.renderOrder = 7;
  scene.add(m);
  return m;
}
const trails = [swingTrail(blue, BLUE.anchor, new THREE.Vector3(-1, 0, 0.6).normalize(), 0x4a7dff, 1.0, 0.45)];

// ---------------- post ----------------
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const sanitize = new ShaderPass(SanitizeShader);
composer.addPass(sanitize);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.45, 1.5);
composer.addPass(bloom);
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);
const output = new OutputPass();
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
composer.addPass(output);
const vhs = new ShaderPass(VhsShader);
vhs.enabled = false;
composer.addPass(vhs);

// ---------------- camera presets ----------------
// Presets 1 and 5 frame the hero from his chest bone, so they survive pose tweaks.
const chest = new THREE.Vector3().setFromMatrixPosition(hero.userData.bones.spine_03.matrixWorld);
const travel = new THREE.Vector3(0.25, 0, -1).normalize();
const heroRight = new THREE.Vector3().crossVectors(travel, V(0, 1, 0)).normalize();
const presets = {
  // hero: over-the-shoulder chase cam, looking where he is swinging
  1: {
    pos: chest.clone().addScaledVector(travel, -5.4).addScaledVector(heroRight, 1.9).add(V(0, 0.6, 0)),
    target: chest.clone().addScaledVector(travel, 30).addScaledVector(heroRight, 3).add(V(0, 1.5, 0)),
    fov: 62,
  },
  2: { pos: V(-6, 25, 96), target: V(0, 14, -14), fov: 50 }, // wide from the house
  3: { pos: chest.clone().add(V(9, -13.5, 9)), target: chest.clone().add(V(-1, 3, 0)), fov: 52 }, // from the floor, up at the swing
  4: { pos: V(-96, 30, -82), target: V(-6, 12, -16), fov: 46 }, // backstage: flats from behind
  // contestant close-up from the front-right
  5: {
    pos: chest.clone().addScaledVector(travel, 4.2).addScaledVector(heroRight, 2.0).add(V(0, 0.3, 0)),
    target: chest.clone().add(V(0, -0.2, 0)),
    fov: 40,
  },
  6: { pos: V(-82, 36, 62), target: V(6, 8, -14), fov: 46 }, // high stage-left: set inside the studio
  // straight behind the hero at play distance (number / helmet readability)
  7: { pos: chest.clone().addScaledVector(travel, -7).add(V(0, 0.6, 0)), target: chest.clone().add(V(0, -0.3, 0)), fov: 30 },
};
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.rotateSpeed = 0.35;
controls.zoomSpeed = 0.6;
controls.enablePan = false;
function setPreset(n) {
  const p = presets[n];
  if (!p) return;
  camera.position.copy(p.pos);
  camera.fov = p.fov;
  camera.updateProjectionMatrix();
  controls.target.copy(p.target);
  controls.update();
}
setPreset(+(q.get("cam") || 1));

let style = look;
function setStyle(s) {
  style = s;
  const b = s === "b",
    fin = s === "final";
  document.body.classList.toggle("style-b", b || fin);
  for (const c of [hero, blue]) setVariant(c, s);
  // final: A's crisp render + B's painted drop/flats + B's helmets, VHS at a whisper
  vhs.enabled = b || fin;
  vhs.uniforms.amount.value = b ? 1 : 0.3;
  setB.set(b || fin, b);
  shared.styleB.value = b || fin ? 1 : 0;
  resize();
}

// ---------------- HUD ----------------
buildHud(document.getElementById("hud"));
if (q.has("shot")) document.body.classList.add("shot");

function resize() {
  const b = document.body.classList.contains("style-b");
  const pr = Math.min(devicePixelRatio, 2) * (style === "b" ? 0.72 : 1);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  vhs.uniforms.resolution.value.set(innerWidth * pr, innerHeight * pr);
  grade.uniforms.aspect.value = innerWidth / innerHeight;
}
addEventListener("resize", resize);
setStyle(look);

addEventListener("keydown", (e) => {
  if (e.key >= "1" && e.key <= "7") setPreset(+e.key);
  // B cycles the looks: final -> a -> b -> final
  if (e.key === "b" || e.key === "B") setStyle({ final: "a", a: "b", b: "final" }[style]);
});

let frames = 0;
const clock = new THREE.Clock();
function loop() {
  controls.update();
  vhs.uniforms.time.value = clock.getElapsedTime();
  composer.render();
  if (++frames === 4) window.__ready = true;
  requestAnimationFrame(loop);
}
loop();
window.__look = { setPreset, setStyle, scene, camera, renderer, lights, hero, blue, composer, bloom, grade, vhs, output, trails };
