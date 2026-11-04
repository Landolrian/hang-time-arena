import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RAMPS, outlineMaterial, INK } from "../../looktest/toon.js";

// Shared building kit for the Breakfast Bowl art skin: toon materials with an
// optional rim and a crisp cel "glaze" highlight, canvas helpers, and a baker
// that merges every static mesh by material so the whole set costs a few
// dozen draw calls.

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Toon material. `rim` adds a fresnel edge light; `gloss` adds a hard-edged
 * specular blob that follows the camera like a studio softbox reflection, so
 * glazed ceramic, chrome and plastic read as shiny without an env map.
 */
const matCache = new Map();
export function mat(params = {}) {
  // Plain (untextured) materials are shared, so the baker merges everything
  // painted the same colour into one draw call.
  if (params.map || params.emissiveMap) return makeMat(params);
  const key = JSON.stringify(params, (k, v) => (v?.isTexture ? v.uuid : v));
  if (!matCache.has(key)) matCache.set(key, makeMat(params));
  return matCache.get(key);
}

function makeMat({
  color = 0xffffff, map = null, rim = 0, rimColor = 0xfff1dc, gloss = 0, glossSize = 0.9,
  emissive = 0x000000, emissiveMap = null, emissiveIntensity = 1, side = THREE.FrontSide,
  transparent = false, opacity = 1, fog = true, ramp = RAMPS.set, alphaTest = 0, depthWrite = true,
} = {}) {
  const m = new THREE.MeshToonMaterial({
    color, map, gradientMap: ramp, emissive, emissiveMap, emissiveIntensity, side, transparent, opacity, fog, alphaTest, depthWrite,
  });
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  if (emissiveMap) emissiveMap.colorSpace = THREE.SRGBColorSpace;
  if (rim > 0 || gloss > 0) {
    m.userData.rimColor = { value: new THREE.Color(rimColor) };
    m.userData.rimStrength = { value: rim };
    m.userData.gloss = { value: gloss };
    m.userData.glossSize = { value: glossSize };
    m.onBeforeCompile = (s) => {
      s.uniforms.rimColor = m.userData.rimColor;
      s.uniforms.rimStrength = m.userData.rimStrength;
      s.uniforms.gloss = m.userData.gloss;
      s.uniforms.glossSize = m.userData.glossSize;
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 rimColor; uniform float rimStrength; uniform float gloss; uniform float glossSize;")
        .replace(
          "#include <opaque_fragment>",
          `{ vec3 nV = normalize(normal); vec3 vV = normalize(vViewPosition);
             float fr = 1.0 - clamp(dot(nV, vV), 0.0, 1.0);
             outgoingLight += rimColor * smoothstep(0.55, 0.75, pow(fr, 3.0) * 1.6) * rimStrength;
             // two fixed softboxes in view space: a big key blob and a thin strip
             vec3 r = reflect(-vV, nV);
             float k = dot(r, normalize(vec3(-0.35, 0.62, 0.70)));
             float s = dot(r, normalize(vec3(0.55, 0.35, 0.76)));
             float blob = smoothstep(glossSize, glossSize + 0.02, k);
             float strip = smoothstep(glossSize + 0.04, glossSize + 0.06, s) * 0.55;
             outgoingLight += vec3(1.0, 0.98, 0.94) * max(blob, strip) * gloss; }
           #include <opaque_fragment>`,
        );
    };
    m.customProgramCacheKey = () => "bowlart-rimgloss";
  }
  return m;
}

/** Unlit glowing material for bulbs, lenses and light panels. */
const glowCache = new Map();
export function glow(color, boost = 1.6, opts = {}) {
  const key = `${color}|${boost}|${JSON.stringify(opts)}`;
  if (!glowCache.has(key)) glowCache.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(boost), fog: false, ...opts }));
  return glowCache.get(key);
}

export function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

export function tex(c, { repeat = [1, 1], aniso = 8, wrap = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  return t;
}

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Lathe with UVs: u runs around, v runs along the profile by arc length. */
export function lathe(points, segments = 128, phiStart = 0, phiLength = Math.PI * 2) {
  const g = new THREE.LatheGeometry(points, segments, phiStart, phiLength);
  // LatheGeometry's v is by point index; re-map it to arc length so prints don't stretch.
  const lens = [0];
  for (let i = 1; i < points.length; i++) lens.push(lens[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = lens[lens.length - 1];
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const j = i % points.length;
    uv.setY(i, lens[j] / total);
  }
  return g;
}

/**
 * Collects static meshes and merges them per material. Meshes carry
 * userData.outline (px), userData.cast / userData.receive flags.
 */
export function bake(root, { outlineNear = 30, local = false } = {}) {
  root.updateMatrixWorld(true);
  // `local` bakes a movable group in its own space (prize, podium, barrier panels)
  const toRoot = local ? root.matrixWorld.clone().invert() : new THREE.Matrix4();
  const buckets = new Map();
  const outlines = new Map();
  const remove = [];
  const walk = (o) => {
    if (o !== root && o.userData.keep) return; // dynamic subtree: leave it alone
    for (const c of [...o.children]) walk(c);
    if (o !== root) visit(o);
  };
  const visit = (o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.isOutline) return;
    if (o.material?.visible === false) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const mw = toRoot.clone().multiply(o.matrixWorld);
    g.applyMatrix4(mw);
    // A mirrored transform flips winding; undo so front faces stay front.
    if (mw.determinant() < 0) flipWinding(g);
    if (o.userData.outline > 0) {
      if (!outlines.has(o.userData.outline)) outlines.set(o.userData.outline, []);
      const p = new THREE.BufferGeometry();
      p.setAttribute("position", g.getAttribute("position").clone());
      outlines.get(o.userData.outline).push(p);
    }
    const parts = [];
    if (Array.isArray(o.material) && o.geometry.groups.length) {
      // non-indexed copy keeps group ranges in vertex units when the source was indexed
      for (const grp of o.geometry.groups) {
        const sub = slice(g, grp.start, grp.count);
        parts.push([sub, mats[grp.materialIndex]]);
      }
    } else parts.push([g, mats[0]]);
    for (const [geo, m] of parts) {
      if (!m || m.visible === false) continue;
      const key = `${m.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
      if (!buckets.has(key)) buckets.set(key, { m, geos: [], cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder });
      buckets.get(key).geos.push(geo);
    }
    remove.push(o);
  };
  walk(root);
  for (const o of remove) o.parent.remove(o);
  // drop now-empty groups so the scene graph stays small
  const prune = (o) => {
    for (const c of [...o.children]) prune(c);
    if (o !== root && o.isGroup && !o.children.length && !o.userData.keep) o.parent?.remove(o);
  };
  prune(root);
  const out = new THREE.Group();
  out.name = "baked";
  // All shadow casters go into one depth-only proxy: one draw in the shadow
  // pass instead of one per material (the proxy draws nothing on screen).
  const casters = [];
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.m);
    if (b.cast && !local) {
      const p = new THREE.BufferGeometry();
      p.setAttribute("position", merged.getAttribute("position"));
      casters.push(p);
      b.cast = false;
    }
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.renderOrder = b.order;
    mesh.matrixAutoUpdate = !!local;
    out.add(mesh);
  }
  if (casters.length) {
    const proxy = new THREE.Mesh(mergeGeometries(casters, false), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    proxy.castShadow = true;
    proxy.receiveShadow = false;
    proxy.matrixAutoUpdate = false;
    proxy.name = "shadow-proxy";
    out.add(proxy);
  }
  // one ink hull per outline thickness for everything in this bake
  for (const [px, geos] of outlines) {
    const h = hull(mergeGeometries(geos, false), outlineMaterial(px, INK, outlineNear));
    h.matrixAutoUpdate = !!local;
    out.add(h);
  }
  root.add(out);
  return out;
}

function slice(g, start, count) {
  const s = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    s.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  return s;
}

function flipWinding(g) {
  for (const a of Object.values(g.attributes)) {
    const n = a.itemSize, arr = a.array;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t = arr[(i + 1) * n + k];
        arr[(i + 1) * n + k] = arr[(i + 2) * n + k];
        arr[(i + 2) * n + k] = t;
      }
    }
  }
}

/** Inverted-hull ink outline from smooth (welded) normals. */
export function hull(geometry, material) {
  const c = new THREE.BufferGeometry();
  c.setAttribute("position", geometry.getAttribute("position"));
  const w = mergeVertices(c, 1e-3);
  w.computeVertexNormals();
  const h = new THREE.Mesh(w, material);
  h.userData.isOutline = true;
  h.renderOrder = -1;
  h.matrixAutoUpdate = false;
  return h;
}

/** Soft radial sprite texture for glows and fake light pools. */
let glowTexture;
export function glowSprite(color, size, opacity = 1) {
  if (!glowTexture) {
    const [c, g] = canvas(128, 128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.22, "rgba(255,255,255,0.5)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    glowTexture = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  s.scale.set(size, size, 1);
  s.renderOrder = 6;
  return s;
}

/**
 * Replaces every static additive glow sprite under `root` (outside `keep`
 * subtrees) with one point cloud: same look, one draw call.
 */
export function collapseGlows(root) {
  root.updateMatrixWorld(true);
  const found = [];
  const walk = (o) => {
    if (o !== root && o.userData.keep) return;
    for (const c of o.children) walk(c);
    if (o.isSprite && o.material.blending === THREE.AdditiveBlending) found.push(o);
  };
  walk(root);
  if (!found.length) return null;
  glowSprite(0xffffff, 1); // makes sure the shared texture exists
  const pos = [], col = [], size = [];
  const p = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const o of found) {
    o.matrixWorld.decompose(p, q, s);
    pos.push(p.x, p.y, p.z);
    const c = o.material.color.clone().multiplyScalar(o.material.opacity);
    col.push(c.r, c.g, c.b);
    size.push(s.x);
    o.parent.remove(o);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.Float32BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: glowTexture }, scale: { value: 360 } },
    vertexShader: `attribute float size; attribute vec3 color; uniform float scale; varying vec3 vColor;
      void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(size * scale * projectionMatrix[1][1] / -mv.z, 400.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vColor;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor * t.rgb * t.a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, m);
  pts.renderOrder = 6;
  pts.frustumCulled = false;
  pts.userData.keep = true;
  pts.userData.glowScale = m.uniforms.scale;
  root.add(pts);
  return pts;
}

/** Adds `count` instances of `geometry` at the given matrices as one draw call. */
export function instances(geometry, material, matrices, { cast = false, receive = false, colors = null } = {}) {
  const im = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((m, i) => im.setMatrixAt(i, m));
  if (colors) colors.forEach((c, i) => im.setColorAt(i, c));
  im.castShadow = cast;
  im.receiveShadow = receive;
  im.computeBoundingSphere();
  return im;
}

export function compose(x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), V(sx, sy, sz));
}

/** Matrix turning a unit cylinder (radius 1, height 1, along Y) into a rod a -> b. */
export function rod(a, b, r) {
  const d = b.clone().sub(a);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(r, d.length(), r));
}

/** Additive haze cone (apex at `from`), narrow and fading along its length. */
const beamGeo = (() => {
  const g = new THREE.CylinderGeometry(0, 1, 1, 40, 12, true);
  g.translate(0, -0.5, 0);
  return g;
})();
export function beam(from, to, angleDeg, color, strength) {
  const len = from.distanceTo(to);
  const r = Math.tan(THREE.MathUtils.degToRad(angleDeg)) * len;
  const m = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength } },
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ vT = -position.y; vec4 mv = modelViewMatrix * vec4(position,1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float strength; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
      float along = smoothstep(0.0, 0.08, vT) * pow(clamp(1.0 - vT, 0.0, 1.0), 1.4);
      gl_FragColor = vec4(color * strength * edge * along, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  }));
  m.scale.set(r, len, r);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(V(0, -1, 0), to.clone().sub(from).normalize());
  m.renderOrder = 5;
  m.userData.keep = true;
  return m;
}

/** Draws a 5-point star path. */
export function star(g, x, y, r, inner = 0.45, rot = -Math.PI / 2, points = 5) {
  g.beginPath();
  for (let k = 0; k < points * 2; k++) {
    const a = rot + (k / (points * 2)) * Math.PI * 2;
    const rr = k % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

/** Brand wordmark: fill with heavy keyline + cream inner keyline (Shrikhand). */
export function wordmark(g, text, x, y, size, { fill = "#e8342c", inner = "#fff4e0", outer = "#5a1020", rot = 0, font = "Shrikhand", weight = "", align = "center", outerW = 0.2, innerW = 0.085 } = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.font = `${weight} ${size}px ${font}`.trim();
  g.lineJoin = "round";
  if (outer) {
    g.lineWidth = size * outerW;
    g.strokeStyle = outer;
    g.strokeText(text, 0, 0);
  }
  if (inner) {
    g.lineWidth = size * innerW;
    g.strokeStyle = inner;
    g.strokeText(text, 0, 0);
  }
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.restore();
}
