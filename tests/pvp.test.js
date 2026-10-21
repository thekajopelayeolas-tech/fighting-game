const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

function pvpRun(seed) {
  const s = G.createRun(seed == null ? 31 : seed, 'pvp');
  G.startVersusRound(s);
  return s;
}

test('pvp run creates two players and no enemies', () => {
  const s = G.createRun(1, 'pvp');
  assert.equal(s.mode, 'pvp');
  assert.equal(s.players.length, 2);
  assert.equal(s.players[0].maxHealth, CFG.versus.maxHealth);
});

test('coop and solo keep their modes', () => {
  assert.equal(G.createRun(1, 'coop').mode, 'coop');
  assert.equal(G.createRun(1, 'solo').mode, 'solo');
  assert.equal(G.createRun(1, 2).mode, 'coop');
  assert.equal(G.createRun(1).players.length, 1);
});

test('a rival hit deals scaled damage and pays the shooter coins', () => {
  const s = pvpRun();
  const [a, b] = s.players;
  const before = b.health;
  G.damageRival(s, a, b, 40);
  assert.equal(b.health, before - Math.round(40 * CFG.versus.damageScale));
  assert.equal(a.coins, CFG.versus.coinsPerHit);
  assert.equal(b.coins, 0);
});

test('a player cannot damage themselves', () => {
  const s = pvpRun();
  const [a] = s.players;
  const before = a.health;
  assert.equal(G.damageRival(s, a, a, 40), false);
  assert.equal(a.health, before);
});

test('reducing a player to zero ends the round and gives the other a round win', () => {
  const s = pvpRun();
  const [a, b] = s.players;
  b.health = 1;
  G.damageRival(s, a, b, 40);
  assert.equal(b.down, true);
  assert.equal(a.roundWins, 1);
  assert.equal(s.phase, 'roundover');
});

test('first to the round target wins the match', () => {
  const s = pvpRun();
  const [a, b] = s.players;
  a.roundWins = CFG.versus.roundsToWin - 1;
  b.health = 1;
  G.damageRival(s, a, b, 40);
  assert.equal(s.phase, 'over');
  assert.equal(s.matchWinner, 'P1');
});

test('next round resets health, clears downs, and keeps round wins', () => {
  const s = pvpRun();
  const [a, b] = s.players;
  b.health = 1;
  G.damageRival(s, a, b, 40);
  G.startVersusRound(s);
  assert.equal(b.down, false);
  assert.equal(b.health, b.maxHealth);
  assert.equal(a.roundWins, 1);
  assert.equal(s.phase, 'fighting');
});

test('each player spends their own coins in PvP', () => {
  const s = pvpRun();
  const [a, b] = s.players;
  a.coins = 100;
  b.coins = 0;
  assert.equal(G.buyUpgrade(s, 'damage', b).ok, false);
  assert.equal(G.buyUpgrade(s, 'damage', a).ok, true);
  assert.ok(a.coins < 100);
  assert.equal(b.coins, 0);
});

test('PvP does not spawn enemies or end on an empty arena', () => {
  const s = pvpRun();
  for (let i = 0; i < 600; i++) G.update(s, 1 / 60, [{}, {}]);
  assert.equal(s.enemies.length, 0);
  assert.equal(s.phase, 'fighting');
});

test('a fired PvP bullet hits the rival and not its owner', () => {
  const s = pvpRun();
  const [a, b] = s.players;
  a.weapon = 'gun';
  a.ammo.gun = 10;
  b.x = a.x + 200;
  b.y = a.y;
  b.invuln = 0;
  const before = b.health;
  G.fire(s, b.x, b.y, a);
  for (let i = 0; i < 60; i++) G.update(s, 1 / 60, [{}, {}]);
  assert.ok(b.health < before, 'rival should take damage');
  assert.equal(a.health, a.maxHealth, 'shooter should not take damage');
});
