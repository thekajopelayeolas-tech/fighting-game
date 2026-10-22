const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

const root = path.join(__dirname, '..');

// A run that is fighting, with no enemies or queued spawns, at the given wave number.
function fightingRun(seed, wave) {
  const s = G.createRun(seed == null ? 11 : seed);
  s.wave = (wave || 1) - 1;
  G.startNextWave(s);
  s.enemies = [];
  s.spawnQueue = [];
  return s;
}

// Forces one slime to spawn in a run and returns it.
function spawnOneSlime(run) {
  run.enemies = [];
  run.spawnQueue = ['slime'];
  run.spawnTimer = 0;
  G.update(run, 0.016, [{}]);
  return run.enemies[0];
}

test('enemies get tougher with each wave', () => {
  const early = spawnOneSlime(fightingRun(1, 1));
  const late = spawnOneSlime(fightingRun(1, 5));
  assert.ok(late.maxHealth > early.maxHealth, 'wave 5 enemies should have more health than wave 1');
  assert.ok(late.speed >= early.speed, 'wave 5 enemies should be at least as fast');
});

test('the wave config drives scaling, and speed is capped', () => {
  const w = CFG.waves;
  assert.ok(w.healthPerWave > 0 && w.speedPerWave > 0);
  assert.ok(w.speedCap > 1 && w.speedCap <= 3, 'the speed cap should keep enemies fightable');
});

test('a boss appears every 3 waves', () => {
  assert.equal(CFG.waves.bossEvery, 3);
  // fightingRun already starts wave 3 (it sets the wave to 2 and starts the next one), so queue it once.
  const s = G.createRun(3);
  s.wave = 2;
  G.startNextWave(s);
  assert.equal(s.wave, 3);
  assert.ok(s.spawnQueue.indexOf('boss') !== -1, 'wave 3 should queue the Overlord');
  const notBoss = G.createRun(3);
  notBoss.wave = 0;
  G.startNextWave(notBoss);
  assert.equal(notBoss.spawnQueue.indexOf('boss'), -1, 'wave 1 should not queue a boss');
});

test('the dasher is faster and more fragile than the bat', () => {
  assert.ok(CFG.enemies.dasher.speed > CFG.enemies.bat.speed);
  assert.ok(CFG.enemies.dasher.health < CFG.enemies.bat.health);
});

test('the armoured enemy takes less damage from the same hit', () => {
  const s = fightingRun(5, 6);
  const shooter = s.players[0];
  const armoured = { id: 1, type: 'armoured', x: 500, y: 300, radius: 26, health: 200, maxHealth: 200, speed: 0, damage: 2, attackCd: 9, hitFlash: 0, dead: false };
  const slime = { id: 2, type: 'slime', x: 600, y: 300, radius: 14, health: 200, maxHealth: 200, speed: 0, damage: 1, attackCd: 9, hitFlash: 0, dead: false };
  s.enemies.push(armoured, slime);
  const hit = 50;
  // A projectile hits each enemy once, so each takes the same raw hit through the game's damage rules.
  s.projectiles.push({ owner: shooter, x: armoured.x, y: armoured.y, vx: 0, vy: 0, life: 1, damage: hit, hitIds: [], pierce: false });
  G.update(s, 0.016, [{}]);
  s.projectiles.push({ owner: shooter, x: slime.x, y: slime.y, vx: 0, vy: 0, life: 1, damage: hit, hitIds: [], pierce: false });
  G.update(s, 0.016, [{}]);
  const armouredLost = 200 - armoured.health;
  const slimeLost = 200 - slime.health;
  assert.ok(armouredLost < slimeLost, 'armour should soak up part of the damage');
  assert.ok(Math.abs(armouredLost - hit * (1 - CFG.enemies.armoured.armour)) < 1, 'armour should reduce the hit by its percentage');
});

test('the Overlord splits into a ring of dashers below half health, only once', () => {
  const s = fightingRun(7, 3);
  const boss = { id: 50, type: 'boss', x: 800, y: 400, radius: CFG.enemies.boss.radius, health: CFG.enemies.boss.health, maxHealth: CFG.enemies.boss.health, speed: 0, damage: 2, attackCd: 9, hitFlash: 0, dead: false };
  s.enemies.push(boss);
  G.update(s, 0.016, [{}]);
  assert.equal(s.enemies.filter((e) => e.type === 'dasher').length, 0, 'no split while the boss is healthy');
  boss.health = boss.maxHealth * 0.4;
  G.update(s, 0.016, [{}]);
  assert.equal(s.enemies.filter((e) => e.type === 'dasher').length, 8, 'the Overlord should release 8 dashers');
  G.update(s, 0.016, [{}]);
  assert.equal(s.enemies.filter((e) => e.type === 'dasher').length, 8, 'the split should only happen once');
});

test('the dasher has its own tint, and the renderer applies sprite tints', () => {
  assert.ok(CFG.enemies.dasher.sprite.tint, 'the dasher has its own tint');
  const render = fs.readFileSync(path.join(root, 'js/render.js'), 'utf8');
  assert.ok(render.indexOf('spr.tint') !== -1, 'the renderer applies sprite tints');
});
