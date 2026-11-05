import * as THREE from "three";
import { loadFonts } from "../looktest/textures.js";
import { shared } from "../looktest/toon.js";
import { bake, collapseGlows } from "./bowl-art/kit.js";
import { buildTable, buildBowl } from "./bowl-art/table.js";
import { buildStudio, buildBackstage } from "./bowl-art/studio.js";
import { buildShow } from "./bowl-art/show.js";
import { buildBox, buildToasters, buildCartons, buildButter, buildSpoon, buildCover, buildBowlRings } from "./bowl-art/props.js";

// Breakfast Bowl art skin. It never touches collision: every grey-box mesh
// keeps its geometry, position, hookable flag and raycast, and only swaps to
// an invisible material once the art is ready. The art lives in its own
// groups and syncs to the live gameplay objects (prize, podium colour,
// barriers, clock) right before each frame renders.

const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });

export function dressBowl(scene, world, parts) {
  // ?bowlart=0 keeps the grey box (used for before/after performance numbers)
  if (new URLSearchParams(location.search).get("bowlart") === "0") return null;
  const state = { ready: false, frame: 0, t: 0, last: performance.now() };
  const size = new THREE.Vector2();
  const art = new THREE.Group();
  art.name = "bowl-art";
  const live = new THREE.Group(); // animated / synced pieces, never baked
  live.name = "bowl-art-live";
  const api = { state, art, live, world, parts };
  window.__bowlArt = api;

  // The renderer is only reachable at draw time; the first frame sets it up.
  scene.onBeforeRender = (renderer, _scene, camera) => {
    if (!state.renderer) setupRenderer(renderer, state);
    renderer.getSize(size);
    if (size.x !== shared.outlineRes.value.x || size.y !== shared.outlineRes.value.y) shared.outlineRes.value.copy(size);
    const now = performance.now();
    const dt = Math.min(0.1, (now - state.last) / 1000);
    state.last = now;
    state.t += dt;
    state.frame++;
    if (state.ready) for (const f of api.updaters ?? []) f(dt, state.t, camera);
    if (state.staticShadows && state.ready && state.frame % 120 === 1) renderer.shadowMap.needsUpdate = true;
    // Contestants keep body shadows, but their many small gear meshes (blaster,
    // launcher, pads...) would each cost a shadow-pass draw: ~250 draws for 8
    // players. Sweep them off now and then (contestants load asynchronously).
    if (state.frame % 90 === 2) {
      for (const child of scene.children) {
        if (child === art || child === live) continue;
        child.traverse((o) => {
          if (o.isMesh && !o.isSkinnedMesh && o.castShadow) o.castShadow = false;
        });
      }
    }
    const o = window.__bowlArtCam;
    if (o) {
      camera.position.set(...o.pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(...o.target);
      if (o.fov) camera.fov = o.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
    }
  };

  build(scene, world, parts, api).then(
    () => {
      state.ready = true;
      // With static shadows the first map must be rendered after the art loads.
      if (state.staticShadows && state.renderer) state.renderer.shadowMap.needsUpdate = true;
    },
    (error) => {
      console.error("Bowl art failed; keeping the grey box", error);
      state.failed = String(error?.stack || error);
    },
  );
  return api;
}

function setupRenderer(renderer, state) {
  state.renderer = renderer;
  // debug: ?bowlshadow=off|basic|pcf for performance comparisons
  const mode = new URLSearchParams(location.search).get("bowlshadow") ?? "static";
  renderer.shadowMap.enabled = mode !== "off";
  renderer.shadowMap.type = mode === "basic" ? THREE.BasicShadowMap : THREE.PCFShadowMap;
  if (mode === "static") {
    renderer.shadowMap.autoUpdate = false;
    state.staticShadows = true;
  }
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const size = renderer.getSize(new THREE.Vector2());
  shared.outlineRes.value.set(size.x, size.y);
}

async function build(scene, world, parts, api) {
  await loadFonts();
  const { art, live } = api;
  api.updaters = [];

  // ---------- set pieces ----------
  buildTable(art);
  buildBowl(art, world);
  buildBowlRings(art);
  buildBox(art);
  buildToasters(art);
  buildCartons(art);
  buildButter(art);
  // The reworked bowl uses a narrow bridge rather than the old spoon ramp.
  buildCover(art);
  await buildStudio(art, live);
  buildBackstage(art, live);
  api.updaters.push(...buildShow(scene, art, live, world, parts));

  // ---------- hide the grey box (keep it raycastable and solid) ----------
  const bridgeMaterial = new THREE.MeshStandardMaterial({ color: 0xa5aeb8, metalness: 0.55, roughness: 0.35 });
  const coverMaterial = new THREE.MeshStandardMaterial({ color: 0xd6c4a4, roughness: 0.8 });
  for (const mesh of world.meshes) {
    if (mesh.name === "spoon-bridge" || mesh.name === "bowl-anchor") mesh.material = bridgeMaterial;
    else if (mesh.name.startsWith("gap-cover-")) mesh.material = coverMaterial;
    else if (mesh === world.podium) mesh.material = new THREE.MeshBasicMaterial({ visible: false, color: mesh.material.color });
    else if (parts.barriers.some((b) => b.mesh === mesh)) continue;
    else mesh.material = HIDDEN;
  }
  parts.barrierMaterial.visible = false;
  parts.grid.visible = false;
  parts.clock.visible = false;
  parts.snatchRing.visible = false;
  for (const l of parts.lights) l.parent?.remove(l);

  // ---------- studio air ----------
  scene.background = new THREE.Color(0x0c0a14);
  scene.fog = new THREE.Fog(0x0c0a14, 110, 290);
  lights(scene, live);
  live.add(broadcastPass(api));

  // merge every static mesh by material, and every static glow into one point cloud
  bake(art);
  bake(live);
  const glows = [collapseGlows(art), collapseGlows(live)].filter(Boolean);
  const buf = new THREE.Vector2();
  api.updaters.push(() => {
    const h = api.state.renderer.getDrawingBufferSize(buf).y / 2;
    for (const p of glows) p.userData.glowScale.value = h;
  });
  scene.add(art, live);
}

/**
 * The whisper-light broadcast look (STYLE.md 2.3) without a post chain: one
 * full-screen triangle drawn last with multiply blending, carrying a soft
 * vignette, faint scanlines and grain. It only darkens, never blurs.
 */
function broadcastPass(api) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, res: { value: new THREE.Vector2(1280, 720) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform float time; uniform vec2 res; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 d = (vUv - 0.5) * vec2(res.x / res.y, 1.0);
        float vig = mix(0.72, 1.0, smoothstep(1.1, 0.38, length(d)));
        float line = 1.0 - 0.025 * (0.5 + 0.5 * cos(gl_FragCoord.y * 3.14159));
        float grain = 1.0 + (hash(gl_FragCoord.xy + fract(time) * 91.7) - 0.5) * 0.03;
        gl_FragColor = vec4(vec3(vig * line * grain), 1.0);
      }`,
    depthTest: false, depthWrite: false, transparent: true, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
  });
  const quad = new THREE.Mesh(geo, m);
  quad.frustumCulled = false;
  quad.renderOrder = 1000;
  quad.userData.keep = true;
  api.updaters.push((dt, t) => {
    m.uniforms.time.value = t;
    m.uniforms.res.value.copy(api.state.renderer.getDrawingBufferSize(m.uniforms.res.value));
  });
  return quad;
}

function spot(live, color, intensity, from, to, angleDeg, penumbra = 0.6) {
  const l = new THREE.SpotLight(color, intensity, 0, THREE.MathUtils.degToRad(angleDeg), penumbra, 0);
  l.position.copy(from);
  l.target.position.copy(to);
  live.add(l, l.target);
  return l;
}

// Real lights (5): hemi, key (the only shadow caster), two team washes and
// the Spotlight Well. Everything else (bulbs, lenses, beams, the backdrop's
// amber wash) is emissive or additive; per-pixel light count is the main
// fill cost at Retina resolution.
function lights(scene, live) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const hemi = new THREE.HemisphereLight(0x8a7fa8, 0x3a2a2a, 1.4);
  live.add(hemi);
  // team washes: Rockets coral-magenta on the west half, Comets cyan-blue on the east
  spot(live, 0xff6a8a, 1.1, V(-80, 95, 30), V(-62, 0, -6), 34, 0.7);
  spot(live, 0x5ab8ff, 1.1, V(80, 95, 30), V(62, 0, -6), 34, 0.7);
  // the Spotlight Well: hero spot straight down onto the bowl floor
  spot(live, 0xfff2dc, 1.0, V(0, 77, 6), V(0, -2, 0), 15, 0.55);
  // (the amber wash on the backdrop flats is painted in as emissive, see studio.js)
  // key: warm tungsten from the front-of-house truss (south, high)
  const key = new THREE.DirectionalLight(0xffe6c2, 2.1);
  key.position.set(-35, 110, 95);
  key.target.position.set(0, 0, -5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera;
  sc.left = -125; sc.right = 125; sc.top = 75; sc.bottom = -75; sc.near = 20; sc.far = 330;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.25;
  live.add(key, key.target);
}
