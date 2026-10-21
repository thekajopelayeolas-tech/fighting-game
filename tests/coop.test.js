const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

function coopRun(seed) {
  const s = G.createRun(seed == null ? 21 : seed, 2);
  G.startNextWave(s);
  s.enemies = [];
  s.spawnQueue = [];
  return s;
}

function enemyAt(id, x, y, extra) {
  return Object.assign(
    { id: id, type: 'brute', x: x, y: y, radius: 24, health: 500, maxHealth: 500, speed: 0, damage: 2, attackCd: 0, hitFlash: 0, dead: false },
    extra || {}
  );
}

test('co-op run creates two players with separate state', () => {
  const s = G.createRun(1, 2);
  assert.equal(s.players.length, 2);
  assert.notEqual(s.players[0].x, s.players[1].x);
  assert.notEqual(s.players[0], s.players[1]);
});

test('single-player run still has one player', () => {
  assert.equal(G.createRun(1).players.length, 1);
});

test('co-op kill with a known shooter pays that player, not the shared pool', () => {
  const s = coopRun();
  s.coins = 0;
  s.enemies.push(enemyAt(1, 0, 0, { health: 1 }));
  s.enemies[0].x = s.players[0].x;
  s.enemies[0].y = s.players[0].y;
  s.players[0].weapon = 'sword';
  s.players[0].owned.sword = true;
  G.fire(s, s.players[0].x + 100, s.players[0].y, s.players[0]);
  assert.equal(s.coins, 0);
  assert.equal(s.players[0].coins, CFG.coop.coinPerKill);
});

test('in co-op, the player who lands a kill gets one coin', () => {
  const s = coopRun();
  const [a, b] = s.players;
  s.coins = 0;
  a.weapon = 'sword';
  a.owned.sword = true;
  a.x = 400;
  a.y = 300;
  s.enemies.push(enemyAt(1, 440, 300, { health: 1 }));
  G.fire(s, 800, 300, a);
  assert.equal(a.coins, CFG.coop.coinPerKill);
  assert.equal(b.coins, 0, 'the ally should not get the coin');
  assert.equal(s.coins, 0, 'the shared pool should not be used for co-op kills');
});

test('in co-op, a projectile kill credits the player who fired it', () => {
  const s = coopRun();
  const [a, b] = s.players;
  a.weapon = 'gun';
  a.ammo.gun = 10;
  a.x = 100;
  a.y = 300;
  s.enemies.push(enemyAt(1, 300, 300, { health: 1 }));
  G.fire(s, 900, 300, a);
  for (let i = 0; i < 60; i++) G.update(s, 1 / 60, [{}, {}]);
  assert.equal(s.kills, 1);
  assert.equal(a.coins, CFG.coop.coinPerKill);
  assert.equal(b.coins, 0);
});

test('each player buys upgrades for themselves from the shared pool', () => {
  const s = coopRun();
  s.coins = 100;
  assert.equal(G.buyUpgrade(s, 'damage', s.players[1]).ok, true);
  assert.equal(s.players[1].upgrades.damage, 1);
  assert.equal(s.players[0].upgrades.damage, 0);
});

test('a player at zero health goes down and the run continues', () => {
  const s = coopRun();
  s.players[0].health = 1;
  s.players[0].invuln = 0;
  s.enemies.push(enemyAt(1, s.players[0].x, s.players[0].y));
  G.update(s, 0.016, [{}, {}]);
  assert.equal(s.players[0].down, true);
  assert.equal(s.phase, 'fighting');
});

test('the game ends only when every player is down', () => {
  const s = coopRun();
  s.players[0].health = 1;
  s.players[1].health = 1;
  s.players[0].invuln = 0;
  s.players[1].invuln = 0;
  s.enemies.push(enemyAt(1, s.players[0].x, s.players[0].y));
  s.enemies.push(enemyAt(2, s.players[1].x, s.players[1].y));
  G.update(s, 0.016, [{}, {}]);
  assert.equal(s.phase, 'over');
});

test('an ally revives a downed player with half health', () => {
  const s = coopRun();
  s.players[1].down = true;
  s.players[1].health = 0;
  s.players[0].x = s.players[1].x + 10;
  s.players[0].y = s.players[1].y;
  assert.equal(G.interact(s, s.players[0]), true);
  assert.equal(s.players[1].down, false);
  assert.equal(s.players[1].health, Math.ceil(s.players[1].maxHealth / 2));
});

test('a downed player cannot fire', () => {
  const s = coopRun();
  s.players[1].down = true;
  s.players[1].weapon = 'gun';
  const before = s.players[1].ammo.gun;
  G.fire(s, 800, 300, s.players[1]);
  assert.equal(s.players[1].ammo.gun, before);
});

test('downed players return at 1 HP when the next wave starts', () => {
  const s = coopRun();
  s.players[1].down = true;
  s.phase = 'shop';
  G.startNextWave(s);
  assert.equal(s.players[1].down, false);
  assert.equal(s.players[1].health, 1);
});
