const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

function fightingRun(seed) {
  const s = G.createRun(seed == null ? 11 : seed);
  G.startNextWave(s);
  s.enemies = [];
  s.spawnQueue = [];
  return s;
}

test('buyUpgrade charges the level-scaled cost and raises the level', () => {
  const s = G.createRun(1);
  s.coins = 100;
  const cost = G.upgradeCost(CFG.shop.upgrades.find((u) => u.id === 'damage'), 0);
  const res = G.buyUpgrade(s, 'damage');
  assert.equal(res.ok, true);
  assert.equal(res.cost, cost);
  assert.equal(s.coins, 100 - cost);
  assert.equal(s.player.upgrades.damage, 1);
});

test('buyUpgrade maxHealth raises max health and heals one point', () => {
  const s = G.createRun(1);
  s.coins = 100;
  s.player.health = 3;
  G.buyUpgrade(s, 'maxHealth');
  assert.equal(s.player.maxHealth, CFG.player.maxHealth + 1);
  assert.equal(s.player.health, 4);
});

test('buyUpgrade refuses when coins are too low', () => {
  const s = G.createRun(1);
  s.coins = 0;
  assert.equal(G.buyUpgrade(s, 'maxHealth').ok, false);
});

test('buyUpgrade stops at the max level', () => {
  const s = G.createRun(1);
  s.coins = 100000;
  const def = CFG.shop.upgrades.find((u) => u.id === 'speed');
  for (let i = 0; i < def.max; i++) G.buyUpgrade(s, 'speed');
  assert.deepEqual(G.buyUpgrade(s, 'speed'), { ok: false, reason: 'Maxed out' });
});

test('buyWeapon adds a weapon once and refuses a duplicate', () => {
  const s = G.createRun(1);
  s.coins = 100;
  assert.equal(G.buyWeapon(s, 'sniper').ok, true);
  assert.equal(s.player.ammo.sniper, CFG.weapons.sniper.ammo);
  assert.deepEqual(G.buyWeapon(s, 'sniper'), { ok: false, reason: 'Already owned' });
});

test('buyWeapon refuses when coins are too low', () => {
  const s = G.createRun(1);
  s.coins = 1;
  assert.equal(G.buyWeapon(s, 'sniper').ok, false);
});

test('equipWeapon only switches to an owned weapon', () => {
  const s = G.createRun(1);
  assert.equal(G.equipWeapon(s, 'sniper'), false);
  assert.equal(s.player.weapon, 'gun');
});

test('interact picks up a weapon pickup and equips it', () => {
  const s = fightingRun();
  s.pickups.push({ kind: 'weapon', id: 'shotgun', x: s.player.x, y: s.player.y, life: 10 });
  assert.equal(G.interact(s), true);
  assert.equal(s.player.owned.shotgun, true);
  assert.equal(s.player.weapon, 'shotgun');
  assert.equal(s.pickups.length, 0);
});

test('interact does nothing when no pickup is in range', () => {
  const s = fightingRun();
  s.pickups.push({ kind: 'heal', x: s.player.x + 900, y: s.player.y, life: 10 });
  assert.equal(G.interact(s), false);
  assert.equal(s.pickups.length, 1);
});
