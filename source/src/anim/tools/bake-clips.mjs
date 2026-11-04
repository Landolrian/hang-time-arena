// Bakes the extra animation clips the contestant uses into public/assets/anim/clips.json.
//
//   1. Download the CC0 source packs (see docs/ASSET_LICENSES.md) and copy these files into
//      public/assets/anim/src/: UAL2_Standard.glb (Quaternius UAL2, Unreal-Godot folder) and
//      Rig_Medium_{MovementAdvanced,MovementBasic,CombatRanged,General}.glb (KayKit
//      Character Animations 1.1, Animations/gltf/Rig_Medium).
//   2. npx vite --port 5421 --strictPort
//   3. BASE_URL=http://localhost:5421/ node src/anim/tools/bake-clips.mjs
//   4. Delete public/assets/anim/src/ again: only the baked JSON ships.
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://localhost:5421/";
// Only the clips src/contestant.js plays.
const KAYKIT = {
  MovementAdvanced: ["Running_Strafe_Left", "Running_Strafe_Right", "Walking_Backwards", "Crawling", "Crouching"],
  General: ["Death_A", "Death_B"],
};
const UAL2 = ["ClimbUp_1m", "Slide_Start", "Slide_Loop", "LayToIdle", "NinjaJump_Idle_Loop", "NinjaJump_Land"];

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
try {
  const page = await browser.newPage();
  await page.goto(`${base}src/anim/tools/bake.html`, { waitUntil: "networkidle" });
  const clips = await page.evaluate(async ({ KAYKIT, UAL2 }) => {
    const { retargetKayKit, copyClips } = await import("/src/anim/tools/retarget.js");
    const body = "/assets/looktest/chars/ubc/Superhero_Male_FullBody.gltf";
    const out = [];
    for (const [pack, names] of Object.entries(KAYKIT))
      out.push(...await retargetKayKit(body, `/assets/anim/src/Rig_Medium_${pack}.glb`, names, (n) => `KK_${n}`));
    out.push(...await copyClips("/assets/anim/src/UAL2_Standard.glb", UAL2, (n) => `UAL2_${n}`));
    return out;
  }, { KAYKIT, UAL2 });
  await writeFile("public/assets/anim/clips.json", JSON.stringify({ fps: 30, clips }));
  console.log(`baked ${clips.length} clips:`, clips.map((c) => c.name).join(", "));
} finally {
  await browser.close();
}
