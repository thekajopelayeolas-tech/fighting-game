const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

function fightingRun(seed) {
  const s = G.createRun(seed == null ? 7 : seed);
  G.startNextWave(s);
  s.enemies = [];
  s.spawnQueue = [];
  return s;
}

function makeEnemy(id, x, y, extra) {
  return Object.assign(
    { id: id, type: 'brute', x: x, y: y, radius: 24, health: 500, maxHealth: 500, speed: 0, damage: 1, attackCd: 9, hitFlash: 0, dead: false },
    extra || {}
  );
}

test('rng is deterministic for the same seed', () => {
  const a = G.createRng(42);
  const b = G.createRng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('new run starts in shop with full health and the gun', () => {
  const s = G.createRun(1);
  assert.equal(s.phase, 'shop');
  assert.equal(s.player.health, CFG.player.maxHealth);
  assert.equal(s.player.weapon, 'gun');
  assert.equal(s.player.owned.gun, true);
});

test('wave 1 queues the configured number of enemies', () => {
  const s = G.createRun(3);
  G.startNextWave(s);
  assert.equal(s.wave, 1);
  assert.equal(s.phase, 'fighting');
  assert.equal(s.spawnQueue.length, CFG.waves.firstWaveEnemies);
});

test('a boss is queued on every bossEvery wave', () => {
  const s = G.createRun(3);
  s.wave = CFG.waves.bossEvery - 1;
  G.startNextWave(s);
  assert.equal(s.spawnQueue[s.spawnQueue.length - 1], 'boss');
});

test('sword hits an enemy in front and not one behind', () => {
  const s = fightingRun();
  s.player.weapon = 'sword';
  s.player.owned.sword = true;
  s.player.x = 400;
  s.player.y = 300;
  const front = makeEnemy(1, 440, 300);
  const back = makeEnemy(2, 360, 300);
  s.enemies.push(front, back);
  G.fire(s, 800, 300);
  assert.ok(front.health < 500, 'front enemy should be hit');
  assert.equal(back.health, 500, 'enemy behind should not be hit');
});

test('sniper bullet pierces through multiple enemies and respects the ammo rule', () => {
  const s = fightingRun();
  s.player.weapon = 'sniper';
  s.player.owned.sniper = true;
  s.player.ammo.sniper = 5;
  s.player.x = 100;
  s.player.y = 300;
  const a = makeEnemy(1, 300, 300);
  const b = makeEnemy(2, 500, 300);
  s.enemies.push(a, b);
  G.fire(s, 900, 300);
  for (let i = 0; i < 90; i++) G.update(s, 1 / 60, {});
  assert.ok(a.health < 500 && b.health < 500, 'both enemies should be hit');
  if (CFG.infiniteAmmo) {
    assert.equal(s.player.ammo.sniper, 5, 'infinite ammo: shots should not use ammo');
  } else {
    assert.equal(s.player.ammo.sniper, 4);
  }
});
