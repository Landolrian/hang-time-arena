import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:480,height:320}});
  await page.goto('http://127.0.0.1:5420/?map=bowl&bowlart=0',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/.vite/deps/three.js');
    const {createBowl}=await import('/src/maps/bowl.js');
    const {buildBowl}=await import('/src/maps/bowl-art/table.js');
    const {bowlHeight}=await import('/src/maps/bowl-profile.js');
    const scene=new THREE.Scene(), world=createBowl(scene), collider=world.slopes.find(s=>s.radial).mesh, art=new THREE.Group();
    buildBowl(art,world);
    const mesh=art.children.find(x=>x.isMesh && Array.isArray(x.material)), a=collider.geometry.getAttribute('position'), b=mesh.geometry.getAttribute('position');
    let maxMismatch=0,maxRayError=0,missing=0;
    for(let i=0;i<a.count;i++) maxMismatch=Math.max(maxMismatch,Math.abs(a.getX(i)-b.getX(i)),Math.abs(a.getY(i)-b.getY(i)),Math.abs(a.getZ(i)-b.getZ(i)));
    const ray=new THREE.Raycaster(), direction=new THREE.Vector3(0,-1,0);
    for(let angle=0;angle<Math.PI*2;angle+=0.25) for(let radius=4;radius<33;radius+=2){
      const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;ray.set(new THREE.Vector3(x,30,z),direction);
      const hit=ray.intersectObject(collider)[0];if(!hit){missing++;continue}maxRayError=Math.max(maxRayError,Math.abs(hit.point.y-bowlHeight(x,z)));
    }
    return {maxMismatch,maxRayError,missing};
  });
  assert.equal(result.maxMismatch,0,'rendered bowl and collision vertices should coincide');
  assert.equal(result.missing,0,'every test ray should hit the bowl');
  assert.ok(result.maxRayError<0.3,`bowl ray error ${result.maxRayError}`);
  console.log('Bowl art alignment and grapple raycasting passed');
} finally {await browser.close();}
