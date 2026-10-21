const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

function fightingRun(seed) {
  const s = G.createRun(seed == null ? 5 : seed);
  G.startNextWave(s);
  s.enemies = [];
  s.spawnQueue = [];
  return s;
}

function bruteAt(x, y) {
  return { id: 99, type: 'brute', x: x, y: y, radius: 24, health: 500, maxHealth: 500, speed: 0, damage: 2, attackCd: 0, hitFlash: 0, dead: false };
}

test('shield power-up blocks enemy damage while active', () => {
  const s = fightingRun();
  s.player.powerUps.shield = 5;
  s.enemies.push(bruteAt(s.player.x, s.player.y));
  G.update(s, 0.016, {});
  assert.equal(s.player.health, CFG.player.maxHealth);
});

test('enemy damages the player when no shield is active', () => {
  const s = fightingRun();
  s.enemies.push(bruteAt(s.player.x, s.player.y));
  G.update(s, 0.016, {});
  assert.equal(s.player.health, CFG.player.maxHealth - 2);
});

test('haste halves cooldown and raises speed', () => {
  const s = fightingRun();
  const normal = G.playerStats(s.player);
  s.player.powerUps.haste = 5;
  const hasted = G.playerStats(s.player);
  assert.equal(hasted.cooldownMult, 0.5);
  assert.ok(hasted.speed > normal.speed);
});

test('rage doubles damage multiplier', () => {
  const s = fightingRun();
  const normal = G.playerStats(s.player).damageMult;
  s.player.powerUps.rage = 5;
  assert.equal(G.playerStats(s.player).damageMult, normal * 2);
});

test('power-ups expire after their duration', () => {
  const s = fightingRun();
  s.player.powerUps.shield = 0.5;
  G.update(s, 1, {});
  assert.equal(s.player.powerUps.shield, undefined);
});

test('a heal pickup restores health up to max', () => {
  const s = fightingRun();
  s.player.health = s.player.maxHealth - 1;
  s.pickups.push({ kind: 'heal', x: s.player.x, y: s.player.y, life: 10 });
  G.interact(s);
  assert.equal(s.player.health, s.player.maxHealth);
});

test('a power-up pickup activates that power-up', () => {
  const s = fightingRun();
  s.pickups.push({ kind: 'powerUp', id: 'rage', x: s.player.x, y: s.player.y, life: 10 });
  G.interact(s);
  assert.equal(s.player.powerUps.rage, CFG.powerUps.rage.duration);
});

test('the sniper pierces every enemy on its line', () => {
  const s = fightingRun();
  s.player.weapon = 'sniper';
  s.player.owned.sniper = true;
  s.player.ammo.sniper = 3;
  s.player.x = 100;
  s.player.y = 300;
  const a = Object.assign(bruteAt(300, 300), { id: 1 });
  const b = Object.assign(bruteAt(500, 300), { id: 2 });
  s.enemies.push(a, b);
  G.fire(s, 900, 300);
  for (let i = 0; i < 90; i++) G.update(s, 1 / 60, {});
  assert.ok(a.health < 500 && b.health < 500);
});

test('walking over a power-up applies it without pressing E', () => {
  const s = fightingRun();
  s.pickups.push({ kind: 'powerUp', id: 'rage', x: s.player.x, y: s.player.y, life: 10 });
  G.update(s, 0.016, [{}]);
  assert.equal(s.player.powerUps.rage > 0, true, 'rage should be active after walking onto it');
  assert.equal(s.pickups.filter((pk) => pk.kind === 'powerUp').length, 0, 'the pickup should be used up');
});

test('a power-up outside the pickup radius is not collected', () => {
  const s = fightingRun();
  s.pickups.push({ kind: 'powerUp', id: 'haste', x: s.player.x + 400, y: s.player.y, life: 10 });
  G.update(s, 0.016, [{}]);
  assert.equal(s.player.powerUps.haste, undefined);
  assert.equal(s.pickups.length, 1, 'the far pickup should stay on the ground');
});

test('healing and ammo pickups still need E when walked over', () => {
  const s = fightingRun();
  // Keep a wave active: an empty arena clears the wave, and E only works while fighting.
  s.enemies.push(bruteAt(s.player.x + 900, s.player.y));
  s.player.health = 2;
  s.pickups.push({ kind: 'heal', x: s.player.x, y: s.player.y, life: 10 });
  G.update(s, 0.016, [{}]);
  assert.equal(s.player.health, 2, 'heal should not apply on contact');
  assert.equal(s.pickups.length, 1, 'heal should stay until E is pressed');
  G.update(s, 0.016, [{ interact: true }]);
  assert.equal(s.player.health, 4, 'heal should apply after E');
});

test('ranged weapons never run out when infiniteAmmo is on', () => {
  assert.equal(CFG.infiniteAmmo, true, 'this test expects infinite ammo to be on');
  const s = fightingRun();
  s.player.weapon = 'sniper';
  s.player.owned.sniper = true;
  s.player.ammo.sniper = 0;
  s.player.cooldown = 0;
  G.fire(s, 900, 300, s.player);
  assert.equal(s.player.ammo.sniper, 0);
  assert.ok(s.projectiles.length > 0, 'a shot should still be fired with 0 ammo');
  assert.equal(s.messageTime > 0 && s.message.indexOf('Out of ammo') !== -1, false, 'no out-of-ammo message');
});

test('a sword kill awards coins and score', () => {
  const s = fightingRun();
  s.player.weapon = 'sword';
  s.player.owned.sword = true;
  s.player.x = 400;
  s.player.y = 300;
  s.enemies.push(Object.assign(bruteAt(440, 300), { health: 1 }));
  s.coins = 0;
  const scoreBefore = s.score;
  G.fire(s, 800, 300);
  assert.equal(s.kills, 1);
  assert.ok(s.coins >= CFG.enemies.brute.xp, 'kill should award xp as coins');
  assert.ok(s.score >= scoreBefore + CFG.enemies.brute.score);
});
