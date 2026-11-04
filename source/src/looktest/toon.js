import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Three-band toon ramp: shadow / mid / lit. Kept soft-ish so big surfaces
// don't look posterised, while forms still read as cel shaded.
function ramp(values) {
  const data = new Uint8Array(values.length * 4);
  values.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const t = new THREE.DataTexture(data, values.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
export const RAMPS = {
  set: ramp([92, 150, 205, 255]),
  char: ramp([80, 168, 255]),
};

export const INK = new THREE.Color(0x120e18);
export const shared = {
  outlineRes: { value: new THREE.Vector2(1280, 720) },
  styleB: { value: 0 },
};

/**
 * Toon material with an optional fresnel rim. `rim` is the rim colour and
 * `rimStrength` how much it adds; studio rigs throw lots of back light so a
 * rim is what keeps silhouettes separated from the dark studio.
 */
export function toon({
  color = 0xffffff,
  map = null,
  ramp = RAMPS.set,
  rim = 0xffd7b0,
  rimStrength = 0.0,
  emissive = 0x000000,
  emissiveIntensity = 1,
  side = THREE.FrontSide,
  transparent = false,
  opacity = 1,
  vertexColors = false,
  fog = true,
} = {}) {
  const m = new THREE.MeshToonMaterial({
    color,
    map,
    gradientMap: ramp,
    emissive,
    emissiveIntensity,
    side,
    transparent,
    opacity,
    vertexColors,
    fog,
  });
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  if (rimStrength > 0) addRim(m, rim, rimStrength);
  return m;
}

export function addRim(m, rim, strength, power = 3.0) {
  m.userData.rimColor = { value: new THREE.Color(rim) };
  m.userData.rimStrength = { value: strength };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prev?.call(m, s, r);
    s.uniforms.rimColor = m.userData.rimColor;
    s.uniforms.rimStrength = m.userData.rimStrength;
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 rimColor; uniform float rimStrength;",
      )
      .replace(
        "#include <opaque_fragment>",
        `{ float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
           float rimBand = smoothstep(0.55, 0.75, pow(fr, ${power.toFixed(1)}) * 1.6);
           outgoingLight += rimColor * rimBand * rimStrength; }
         #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => "rim" + power;
  return m;
}

// Screen-space inverted hull. Thickness is in pixels at 1280x720 and thins out
// with distance so far props don't turn into ink blobs.
export function outlineMaterial(px = 2.5, color = INK, near = 12) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  m.userData.px = { value: px };
  m.userData.near = { value: near };
  m.onBeforeCompile = (s) => {
    s.uniforms.outlinePx = m.userData.px;
    s.uniforms.outlineNear = m.userData.near;
    s.uniforms.outlineRes = shared.outlineRes;
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float outlinePx; uniform float outlineNear; uniform vec2 outlineRes;",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        #ifdef USE_SKINNING
          vec3 oN = objectNormal;
        #else
          vec3 oN = normal;
        #endif
        vec4 cN = projectionMatrix * vec4(normalize(normalMatrix * oN), 0.0);
        vec2 dir = cN.xy; float l = length(dir); dir = l > 1e-4 ? dir / l : vec2(0.0);
        float fall = clamp(outlineNear / max(gl_Position.w, 0.001), 0.3, 1.0);
        gl_Position.xy += dir * outlinePx * fall * 2.0 / vec2(1280.0, 720.0) * gl_Position.w;
        gl_Position.z += 0.0002 * gl_Position.w;`,
      );
  };
  m.customProgramCacheKey = () => "outline";
  return m;
}

const smoothCache = new WeakMap();
function smoothGeometry(g) {
  if (smoothCache.has(g)) return smoothCache.get(g);
  const c = new THREE.BufferGeometry();
  c.setAttribute("position", g.getAttribute("position"));
  if (g.index) c.setIndex(g.index);
  const m = mergeVertices(c, 1e-4);
  m.computeVertexNormals();
  smoothCache.set(g, m);
  return m;
}

/** Adds an ink outline hull to every mesh under `root`. */
export function addOutlines(root, px = 2.5, near = 12) {
  const mat = outlineMaterial(px, INK, near);
  const list = [];
  root.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && !o.userData.noOutline) list.push(o);
  });
  for (const o of list) {
    let hull;
    if (o.isSkinnedMesh) {
      hull = new THREE.SkinnedMesh(o.geometry, mat);
      hull.bind(o.skeleton, o.bindMatrix);
    } else {
      hull = new THREE.Mesh(smoothGeometry(o.geometry), mat);
    }
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.userData.isOutline = true;
    hull.renderOrder = -1;
    hull.frustumCulled = o.frustumCulled;
    o.add(hull);
  }
  return mat;
}

/** Replace every material in a loaded model using a name -> material map. */
export function recolor(root, table, fallback) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (mat) => table[mat.name] ?? fallback ?? mat;
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  return root;
}

export function shadows(root, cast = true, receive = true) {
  root.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return root;
}
