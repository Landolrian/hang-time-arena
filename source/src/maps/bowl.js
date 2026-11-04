import * as THREE from "three";
import { dressBowl } from "./bowl-art.js";
import { bowlHeight } from "./bowl-profile.js";

// Coordinates in the layout are translated by (-75, -52); height is unchanged.
export function createBowl(scene) {
  const boxes = [], meshes = [], slopes = [];
  const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const grey = material(0x85898a), red = material(0x9b8585), blue = material(0x858d9d);
  const dark = material(0x41474b), gold = material(0xc7a43d);
  function box(x, y, z, w, h, d, mat = grey, hookable = true, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); mesh.userData.hookable = hookable;
    scene.add(mesh); meshes.push(mesh);
    if (solid) boxes.push({ min: new THREE.Vector3(x-w/2,y-h/2,z-d/2), max: new THREE.Vector3(x+w/2,y+h/2,z+d/2), mesh });
    return mesh;
  }
  function ramp(x, z, dx, dz, length, width, low, rise) {
    const bottom = -6, high = low + rise, w = width / 2;
    const verts = [-w,bottom,0, w,bottom,0, -w,low,0, w,low,0, -w,bottom,length, w,bottom,length, -w,high,length, w,high,length];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geometry.setIndex([2,6,3, 3,6,7, 0,1,4, 1,5,4, 0,4,2, 2,4,6, 1,3,5, 3,7,5, 0,2,1, 1,2,3, 4,5,6, 5,7,6]);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, grey);
    mesh.position.set(x,0,z); mesh.rotation.y = Math.atan2(dx,dz);
    scene.add(mesh); meshes.push(mesh);
    slopes.push({ x,z,dx,dz,length,width,low,rise,bottom,mesh });
  }
  // A continuous radial profile keeps the two walkable slopes free of seams.
  // The surrounding table starts beyond the outer toe at radius 34.
  box(-69.5,-3,0,71,6,100,red); box(69.5,-3,0,71,6,100,blue);
  box(0,-3,-41,68,6,18); box(0,-3,41,68,6,18);
  for (let x=-33;x<34;x+=2) for(let z=-33;z<34;z+=2) {
    if (Math.hypot(Math.max(0,Math.abs(x)-1), Math.max(0,Math.abs(z)-1)) >= 34)
      box(x,-3,z,2,6,2, x<0?red:blue);
    else if (Math.hypot(Math.abs(x)+1, Math.abs(z)+1) >= 34)
      // Fill boundary cells, overlapping the bowl toe and adjacent tiles.
      box(x,-3,z,2.02,6,2.02, x<0?red:blue);
  }
  const vertices = [], indices = [], rings = 136, segments = 256;
  for (let i = 0; i <= rings; i++) for (let j = 0; j <= segments; j++) {
    const radius = 34 * i / rings, angle = 2 * Math.PI * j / segments;
    const x = radius * Math.cos(angle), z = radius * Math.sin(angle);
    vertices.push(x, bowlHeight(x, z), z);
    if (i && j) { const a = (i-1)*(segments+1)+j-1, b = i*(segments+1)+j-1; indices.push(a,b,a+1, a+1,b,b+1); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const bowl = new THREE.Mesh(geometry, grey);
  bowl.material.side = THREE.DoubleSide; scene.add(bowl); meshes.push(bowl);
  slopes.push({ radial: true, bottom: -6, mesh: bowl });
  // Keep the ground separate from cover and the ring-out floor for coverage checks.
  const groundBoxes = boxes.slice(), groundSlopes = slopes.slice();
  const bridge = box(0,8.7,9,40,0.6,1.4); bridge.name = "spoon-bridge";
  for (const [x,z] of [[-15,-7],[14,-9],[0,16]]) { const anchor = box(x,21,z,2,1,2,dark,true,false); anchor.name = "bowl-anchor"; }
  for (const sx of [-1,1]) for (const sz of [-1,1]) {
    const x = sx * 17, z = sz * 14;
    const lip = box(x,bowlHeight(x,z)+1,z,2,2,2); lip.name = `gap-cover-${sx}-${sz}`;
  }
  box(0,15,-40.5,18,30,9);
  function cover(name, x, y, z, w, h, d) {
    const mesh = box(x, y, z, w, h, d);
    mesh.name = name;
    return mesh;
  }
  // Two low flaps leave a two-metre firing gap at the bowl edge.
  for (const side of [-1, 1])
    cover(`box-flap-${side < 0 ? "west" : "east"}`, side*4.75,30.6,-36.5,7.5,1.2,0.6);
  cover("box-back-block", 0,31.25,-43,4,2.5,1.5);
  for(const side of [-1,1]) {
    box(side*37,6,-30,16,12,10,side<0?red:blue);
    // The 1.5 m slot runs north-south, towards the bowl.
    box(side*37-2.5,15,-30,3.5,6,9);
    box(side*37+2.5,15,-30,3.5,6,9);
    const label = side < 0 ? "west" : "east";
    cover(`toaster-lever-${label}`,side*43.5,12.75,-30,2,1.5,3);
    cover(`carton-spout-${label}`,side*51,25,14,3,2,2);
    for (const z of [-9,9]) {
      const x = side * 27;
      const radius = Math.hypot(x,z);
      const top = 6 - (radius - 22) * 0.5;
      cover(`rim-cover-${label}-${z < 0 ? "north" : "south"}`,x,top+0.65,z,2,1.7,4);
    }
    cover(`sugar-cube-${label}`,side*18,0.65,37,2.5,1.3,2.5);
    box(side*51,12,12,10,24,10,side<0?red:blue);
    box(side*68,3,-2,10,6,24,side<0?red:blue);
    // Backstage room: side doors force a turn before a bowl hook is possible.
    box(side*91,-1,0,28,2,28,side<0?red:blue,false);
    box(side*105,4,0,1,8,28,dark,false);
    box(side*77,4,0,1,8,28,dark,false);
    for (const z of [-14,14]) {
      box(side*82,4,z,10,8,1,dark,false);
      box(side*100,4,z,10,8,1,dark,false);
      box(side*91,7,z,8,2,1,dark,false);
    }
    box(side*91,8.5,0,28,1,28,dark,false);
  }
  for(let x=-60;x<=60;x+=24) box(x,36,-45,1.2,1.2,1.2,dark,true,false);
  box(0,36,-45,122,0.5,0.5,dark,true,false);
  // Three freestanding thick ring silhouettes, the only cover in the bowl.
  for(const [x,z] of [[-7,-5],[7,-5],[0,8]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5,0.9,8,16),grey);
    ring.position.set(x,-0.3,z); ring.scale.y = 0.5; scene.add(ring); meshes.push(ring);
    const collider = box(x,-0.5,z,6.8,3,1.8,grey); collider.name = `cereal-ring-${x}-${z}`; // Solid plinth makes the visible ring block shots as well as bodies.
  }
  const podium=box(0,-2.5,0,4,1,4,gold.clone());
  const prize=box(0,-0.3,0,2.4,2.4,2.4,gold);
  prize.userData.prize = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(19.65,20,64),new THREE.MeshBasicMaterial({color:0xe9cd64,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2; ring.position.y=4.87; scene.add(ring);
  box(0,-7,0,240,2,180,dark,false);
  box(0,25,-90,240,64,2,dark,false); box(0,25,90,240,64,2,dark,false);
  box(-120,25,0,2,64,180,dark,false); box(120,25,0,2,64,180,dark,false);
  const lines = [];
  for (let x = -74; x <= 74; x += 2) for (let z = -52; z < 48; z += 2) {
    if (Math.hypot(x, z) < 34) continue;
    lines.push(x, 0.015, z, x, 0.015, z + 2, x, 0.015, z, x + 2, 0.015, z);
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
  const grid = new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: 0x686c6d }));
  scene.add(grid);
  const clockCanvas = document.createElement("canvas"); clockCanvas.width = 256; clockCanvas.height = 128;
  const clockTexture = new THREE.CanvasTexture(clockCanvas);
  const clock = new THREE.Sprite(new THREE.SpriteMaterial({ map: clockTexture, depthTest: true }));
  clock.position.set(0, 29, 0); clock.scale.set(10, 5, 1); scene.add(clock);
  let clockLabel;
  function updateClock(label) {
    if (label === clockLabel) return;
    clockLabel = label;
    const ctx = clockCanvas.getContext("2d");
    ctx.fillStyle = "#292d30"; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#ffd45a"; ctx.font = "bold 68px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(label, 128, 88); clockTexture.needsUpdate = true;
  }
  updateClock("--");
  scene.background=new THREE.Color(0x9ba3a6); scene.fog=new THREE.Fog(0x9ba3a6,120,260);
  const hemi=new THREE.HemisphereLight(0xe7f0f2,0x50575a,2); scene.add(hemi);
  const light=new THREE.DirectionalLight(0xffffff,1.5); light.position.set(20,50,15); scene.add(light);
  const barrierMaterial = material(0xc84c4c);
  const barriers = [[-21,0,1,8], [21,0,1,8], [-7,-20,8,1], [7,20,8,1]].map(([x,z,w,d]) => {
    const mesh = box(x,3.5,z,w,2.5,d,barrierMaterial);
    return { mesh, collision: boxes[boxes.length - 1], x, z, w, d };
  });
  function updateBarriers(progress, team, bodies) {
    barrierMaterial.color.setHex(team === "comets" ? 0x4b75d0 : 0xc84c4c);
    for (const b of barriers) {
      const top = 4.75 + progress * 2.5;
      b.mesh.position.y = top - 1.25;
      b.collision.min.set(b.x-b.w/2, top-2.5, b.z-b.d/2);
      b.collision.max.set(b.x+b.w/2, top, b.z+b.d/2);
      b.mesh.visible = progress > 0;
      if (progress > 0) for (const body of bodies) {
        if (body.dead || Math.abs(body.pos.x-b.x) > b.w/2+0.55 || Math.abs(body.pos.z-b.z) > b.d/2+0.55) continue;
        if (body.pos.y + 0.9 > top-2.5 && body.pos.y - 0.9 < top) {
          body.pos.y = top + 0.9001; body.vel.y = Math.max(0, body.vel.y);
        }
      }
    }
  }
  updateBarriers(0, null, []);
  const inSpawn = (pos, team) => Math.abs(pos.x - (team === "rockets" ? -91 : 91)) < 13.5 && Math.abs(pos.z) < 9.5 && pos.y < 8;
  function blockedBySlope(a, b) {
    const steps = Math.ceil(a.distanceTo(b) / 0.75);
    for (let i = 1; i < steps; i++) {
      const p = a.clone().lerp(b, i / steps);
      for (const slope of slopes) {
        let y;
        if (slope.radial) {
          const r = Math.hypot(p.x, p.z);
          if (r >= 34) continue;
          y = bowlHeight(p.x, p.z);
        } else {
          const dx = p.x - slope.x, dz = p.z - slope.z;
          const along = dx * slope.dx + dz * slope.dz, across = -dx * slope.dz + dz * slope.dx;
          if (along < 0 || along > slope.length || Math.abs(across) > slope.width / 2) continue;
          y = slope.low + slope.rise * along / slope.length;
        }
        if (p.y < y - 0.1 && p.y > slope.bottom) return true;
      }
    }
    return false;
  }
  const world = { boxes, meshes, slopes, blockedBySlope, groundBoxes, groundSlopes, updateClock, updateBarriers, inSpawn,
    spawnPoints: { rockets: new THREE.Vector3(-91,0.9,-6), comets: new THREE.Vector3(91,0.9,0) },
    doors: { rockets: [[-91,0.9,-14],[-91,0.9,14]], comets: [[91,0.9,-14],[91,0.9,14]] },
    podium, prize, podiumPosition: new THREE.Vector3(0,-2,0), ringOutHeight: -3, killHeight: -5 };
  // The art skin only adds meshes and re-materials these; collision stays as built above.
  dressBowl(scene, world, { grid, clock, snatchRing: ring, lights: [hemi, light], barriers, barrierMaterial });
  return world;
}
