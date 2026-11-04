import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { toon, addOutlines, shadows } from "./toon.js";
import * as T from "./textures.js";
import { WALL_Z } from "./kitchen.js";

/**
 * Look B set dressing: the set admits it is a set. Props become painted
 * plywood cut-outs held up by stage jacks, the back wall shows its flat seams
 * and clamps, and a painted show drop hangs on a batten behind it all.
 */
export function buildSetB(scene, kitchen) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const ply = toon({ map: T.plyTexture() });
  const plyEdge = toon({ color: 0xd9bb86 });
  const brace = toon({ color: 0x8b6a43 });
  const bagMat = toon({ color: 0x4d4a3c });
  const steel = toon({ color: 0x3a3842, rim: 0xb9b6c6, rimStrength: 0.3 });

  function jack(x, z, ry, h, depth) {
    // right-triangle stage jack + sandbag, built from 1x4 stock
    const g = new THREE.Group();
    const len = Math.hypot(h, depth);
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.5), brace);
    upright.position.set(0, h / 2, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, depth), brace);
    foot.position.set(0, 0.25, -depth / 2);
    const diag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, len), brace);
    diag.position.set(0, h / 2, -depth / 2);
    diag.rotation.x = -Math.atan2(h, depth);
    const bag = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.8, 1.0, 2, 0.3), bagMat);
    bag.position.set(0, 0.9, -depth + 0.6);
    g.add(upright, foot, diag, bag);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    return g;
  }

  // ---- cereal box as a painted cut-out flat ----
  const c = kitchen.cereal;
  {
    const { front } = T.cerealTextures();
    const w = 10.4,
      h = 14.6;
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.35), [plyEdge, plyEdge, plyEdge, plyEdge, toon({ map: front }), ply]);
    board.position.set(0, h / 2, 0);
    const g = new THREE.Group();
    g.add(board);
    // painted-on "side" panel faked in perspective, a classic scenic trick
    const sideShape = new THREE.Shape();
    sideShape.moveTo(0, 0);
    sideShape.lineTo(2.2, 1.0);
    sideShape.lineTo(2.2, h + 1.0);
    sideShape.lineTo(0, h);
    const side = new THREE.Mesh(new THREE.ShapeGeometry(sideShape), toon({ color: 0x24479f }));
    side.position.set(w / 2, 0, 0.18);
    g.add(side);
    for (const sx of [-3.2, 3.2]) g.add(jack(sx, -0.2, 0, h * 0.72, 5.5));
    g.position.copy(c.position);
    g.rotation.copy(c.rotation);
    root.add(g);
    root.userData.cereal = g;
  }

  // ---- painted show drop on a pipe batten behind the kitchen wall ----
  {
    const cv = document.createElement("canvas");
    cv.width = 2048;
    cv.height = 512;
    const g = cv.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, "#2a1440");
    grd.addColorStop(1, "#7a2a6a");
    g.fillStyle = grd;
    g.fillRect(0, 0, 2048, 512);
    g.save();
    g.translate(1024, 560);
    for (let i = 0; i < 36; i++) {
      g.rotate((Math.PI * 2) / 36);
      g.fillStyle = i % 2 ? "rgba(255,180,61,0.32)" : "rgba(255,61,168,0.22)";
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-90, -1400);
      g.lineTo(90, -1400);
      g.fill();
    }
    g.restore();
    // hand-painted stars
    const r = T.rng(9);
    for (let i = 0; i < 40; i++) {
      const x = r() * 2048,
        y = r() * 380,
        s = 8 + r() * 18;
      g.fillStyle = r() > 0.5 ? "#ffe14d" : "#fff4e0";
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = k % 2 ? s * 0.42 : s;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.fill();
    }
    // canvas wrinkles / seams
    g.strokeStyle = "rgba(0,0,0,0.18)";
    g.lineWidth = 3;
    for (let x = 256; x < 2048; x += 256) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 6, 512);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const dropMat = toon({ map: t, side: THREE.DoubleSide });
    dropMat.emissiveMap = t;
    dropMat.emissive.set(0xffffff);
    dropMat.emissiveIntensity = 0.55;
    const drop = new THREE.Mesh(new THREE.PlaneGeometry(130, 32, 64, 1), dropMat);
    // gentle hanging folds
    const pos = drop.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 0.45) * 0.5);
    drop.geometry.computeVertexNormals();
    drop.position.set(0, 30, WALL_Z - 16);
    root.add(drop);
    const batten = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 132, 10), steel);
    batten.rotation.z = Math.PI / 2;
    batten.position.set(0, 46.1, WALL_Z - 16);
    root.add(batten);
    for (let x = -60; x <= 60; x += 12) {
      const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), toon({ color: 0x1a1820 }));
      tie.position.set(x, 45.6, WALL_Z - 16);
      root.add(tie);
    }
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 131, 10), steel);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 14.1, WALL_Z - 16);
    root.add(pipe);
  }

  // ---- flat seams with dutchman strips + C-clamps along the top edge ----
  {
    const seamMat = toon({ color: 0xe6c770 });
    for (let x = -45; x <= 45; x += 18) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 33.6, 0.08), seamMat);
      seam.position.set(x, 17, WALL_Z + 0.05);
      seam.renderOrder = 1;
      root.add(seam);
      // a C-clamp biting the two flats together at the top edge
      const clamp = new THREE.Group();
      const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 8, 16, Math.PI), steel);
      jaw.rotation.y = Math.PI / 2;
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), steel);
      screw.rotation.x = Math.PI / 2;
      screw.position.set(0, -0.75, 0);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), steel);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(0, -0.75, 0.8);
      clamp.add(jaw, screw, handle);
      clamp.position.set(x, 34.1, WALL_Z - 0.3);
      root.add(clamp);
    }
    // the stage-left end of the back flat: exposed toggle frame + brace
    const end = new THREE.Group();
    const stile = new THREE.Mesh(new THREE.BoxGeometry(0.5, 34, 0.9), toon({ color: 0xb08850 }));
    stile.position.set(-56.2, 17, WALL_Z - 0.3);
    end.add(stile);
    end.add(jack(-56.2, WALL_Z + 0.1, Math.PI, 22, 8));
    root.add(end);
  }

  shadows(root, true, true);
  return {
    root,
    set(on, cutout = on) {
      root.visible = on;
      root.userData.cereal.visible = cutout;
      c.visible = !cutout;
    },
  };
}
