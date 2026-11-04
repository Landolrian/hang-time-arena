import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--no-sandbox'] });
const base = `http://127.0.0.1:${process.env.PORT || 5420}`;
try {
  const page = await browser.newPage();
  await page.goto(`${base}/?map=bowl&bowlart=0`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__game);
  const result = await page.evaluate(() => {
    const g = window.__game;
    g.botsPause(true); g.step(361);
    for (const bot of g.state().bots) g.setBotPosition(bot.number, bot.team === 'rockets' ? -60 : 60, 1, 25);
    g.setPosition(-60, 1, 25); g.jackpotForceClaim('rockets'); g.jackpotSetClock(20);
    const before = g.state().jackpot.clock; g.step(120);
    const paused = g.state().jackpot;
    g.setBotPosition(1, -10, 0, 0); g.step(120);
    const guarded = g.state().jackpot;
    g.setBotPosition(1, -60, 1, 25);
    // A long narrow box is the bridge: running on its top must cross the bowl.
    g.setPosition(-18, 9.9001, 9); g.setVelocity(0, 0, 0); g.setLook(-Math.PI / 2, 0);
    g.press('forward'); g.step(560); g.release('forward'); // run speed is about 7.8 m/s
    const bridge = g.state().player.position;
    const anchors = [];
    for (const [x, z] of [[-15,-7], [14,-9], [0,16]]) {
      g.setPosition(x, 10, z); g.setVelocity(0, 0, 0); g.lookAt(x, 21, z); g.step(1);
      g.press('hook'); g.step(12); anchors.push(g.state().hook); g.release('hook'); g.step(500);
    }
    return { before, paused, guarded, bridge, anchors };
  });
  assert.equal(result.paused.guarded, false);
  assert.equal(result.paused.clock, result.before);
  assert.equal(result.guarded.guarded, true);
  assert.ok(result.guarded.clock < result.paused.clock - 0.9);
  assert.ok(result.bridge.x > 10 && result.bridge.y > 9, JSON.stringify(result.bridge));
  assert.ok(result.anchors.every(h => h.state === 'swing' && h.point.y > 20), JSON.stringify(result.anchors));
  assert.equal(await page.locator('#jackpot-hud .holder').count(), 1);
  await page.reload({ waitUntil: 'networkidle' });
  const combat = await page.evaluate(() => {
    const g = window.__game; g.botsPause(true); g.step(361);
    for (const bot of g.state().bots) g.setBotPosition(bot.number, bot.team === 'rockets' ? -60 : 60, 1, 25);
    const ready = (number, speed, distance = 2) => {
      g.setPosition(35, 0.9001, 0); g.setVelocity(speed, 0, 0); g.setLook(-Math.PI / 2, 0);
      g.setBotPosition(number, 35 + distance, 0.9001, 0); g.setBotHP(number, 150);
    };
    const press = (name) => { g.press(name); g.release(name); };
    const target = (number) => g.state().bots.find(b => b.number === number);
    ready(12, 30); press('whip'); g.step(1);
    const first = target(12).hp;
    g.step(19); ready(12, 0); g.setBotHP(12, first); press('melee');
    const cancelled = g.state(), afterKick = target(12);
    // The kick's hitstop freezes a few frames, so give the second whip time to connect.
    ready(12, 30); g.setBotHP(12, afterKick.hp); press('whip'); g.step(12);
    const combo = g.state();
    g.setBotPosition(12, 60, 1, 25);
    g.step(120); ready(13, 25, 5); press('whip'); g.step(1); g.step(19);
    g.setPosition(35, 0.9001, 0); g.setVelocity(0, 0, 0); press('melee');
    g.setBotPosition(13, 60, 1, 25); ready(14, 25, 5); press('whip'); g.step(1); const second = g.state();
    g.step(120); ready(14, 70, 5); press('whip'); g.step(1); const single = target(14);
    g.step(120); ready(14, 0); press('melee'); const kick = target(14).hp;
    press('melee'); const cooldown = target(14).hp;
    g.step(100); ready(14, 0); g.setBotHP(14, cooldown); press('melee'); const cooled = target(14).hp;
    g.step(120); ready(14, 0, 5); press('whip'); g.step(40); press('melee'); const late = g.state();
    return { first, cancelled, afterKick, combo, second, single, kick, cooldown, cooled, late };
  });
  assert.equal(combat.cancelled.player.whipCooldown, 0, 'kick inside the window cancels cooldown');
  assert.equal(combat.afterKick.status, 'alive', 'whip and kick alone do not knock');
  assert.equal(combat.combo.player.whipChain, 2);
  assert.equal(combat.combo.bots.find(b => b.number === 12).status, 'knocked', '30 m/s whip, kick and whip knock');
  assert.ok(Math.abs(combat.second.bots.find(b => b.number === 14).hp - 84.75) < 2, 'second whip deals 75% damage');
  assert.equal(combat.single.status, 'alive', 'one max-speed whip cannot knock');
  assert.equal(combat.kick, 120, 'kick deals 30 damage');
  assert.equal(combat.cooldown, 120, 'kick cooldown blocks another kick');
  assert.equal(combat.cooled, 90, 'kick works after 0.8 seconds');
  assert.ok(combat.late.player.whipCooldown > 0, 'a late kick does not cancel');
  console.log('Bowl bridge, anchors and guarded clock passed');
} finally { await browser.close(); }
