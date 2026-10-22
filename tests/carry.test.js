const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Base = require('../js/base.js');
const G = require('../js/game.js');

const root = path.join(__dirname, '..');

test('carryRun stores the coins as the new balance', () => {
  const save = Base.newSave();
  Base.carryRun(save, 42.9, 0);
  assert.equal(save.coins, 42);
});

test('carryRun adds each run score into the lifetime total', () => {
  const save = Base.newSave();
  Base.carryRun(save, 0, 500);
  Base.carryRun(save, 0, 750);
  assert.equal(save.lifetimeScore, 1250);
});

test('a negative coin balance never gets saved', () => {
  const save = Base.newSave();
  Base.carryRun(save, -5, 0);
  assert.equal(save.coins, 0);
});

test('a solo run in the base keeps its coins while the player walks around', () => {
  const s = G.createRun(4);
  G.startBase(s);
  s.coins = 77;
  for (let i = 0; i < 120; i++) G.update(s, 1 / 60, [{ moveX: 1 }]);
  assert.equal(s.coins, 77, 'coins should not change in the base');
  assert.equal(s.score, 0, 'the base should not add score');
});

test('the base shop spends the coins the run carries, like the arena shop', () => {
  const s = G.createRun(4, 'solo', ['knight']);
  G.startBase(s);
  s.coins = 40;
  const result = G.buyWeapon(s, 'shotgun', s.players[0]);
  assert.equal(result.ok, true);
  assert.equal(s.coins, 40 - 25, 'shotgun costs 25 coins');
});

test('the save defaults include the carry fields', () => {
  const save = Base.newSave();
  assert.equal(save.coins, 0);
  assert.equal(save.lifetimeScore, 0);
});

test('the base NEXT button leaves the shop without starting a fight', () => {
  const src = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const start = src.indexOf("document.getElementById('next-wave-btn').addEventListener");
  const body = src.slice(start, src.indexOf('});', start));
  const baseBranch = body.indexOf('if (baseShopOpen)');
  const fightCall = body.indexOf('Game.startNextWave(run)');
  assert.ok(baseBranch !== -1 && fightCall !== -1);
  assert.ok(baseBranch < fightCall, 'the base branch must return before any fight starts');
});
