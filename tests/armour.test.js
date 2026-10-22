const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/game.js');
const Base = require('../js/base.js');
const CFG = require('../js/config.js');

const root = path.join(__dirname, '..');

function soloRun() {
  const s = G.createRun(21, 'solo', ['knight']);
  G.startNextWave(s);
  s.enemies = [];
  s.spawnQueue = [];
  s.coins = 500;
  return s;
}

test('armour prices are helmet 40, chestplate 40, leggings 30, boots 20', () => {
  const price = (id) => CFG.armour.pieces.find((p) => p.id === id).cost;
  assert.equal(price('helmet'), 40);
  assert.equal(price('chestplate'), 40);
  assert.equal(price('leggings'), 30);
  assert.equal(price('boots'), 20);
});

test('buying a piece costs its price and starts it at wood', () => {
  const s = soloRun();
  const r = G.buyArmour(s, 'helmet', s.players[0]);
  assert.equal(r.ok, true);
  assert.equal(s.coins, 500 - 40);
  assert.equal(s.players[0].armour.helmet, 0);
  assert.equal(CFG.armour.tiers[0].id, 'wood');
});

test('a piece cannot be bought twice', () => {
  const s = soloRun();
  G.buyArmour(s, 'boots', s.players[0]);
  const again = G.buyArmour(s, 'boots', s.players[0]);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'Already owned');
});

test('upgrades cost 10, 15, 20, 25, 30 and go iron, copper, gold, diamond, netherite', () => {
  const s = soloRun();
  const p = s.players[0];
  G.buyArmour(s, 'chestplate', p);
  const names = [];
  const costs = [];
  for (let i = 0; i < 5; i++) {
    const r = G.upgradeArmour(s, 'chestplate', p);
    assert.equal(r.ok, true);
    costs.push(r.cost);
    names.push(r.tier);
  }
  assert.deepEqual(costs, [10, 15, 20, 25, 30]);
  assert.deepEqual(names, ['Iron', 'Copper', 'Gold', 'Diamond', 'Netherite']);
});

test('netherite is the top tier and cannot be upgraded further', () => {
  const s = soloRun();
  const p = s.players[0];
  G.buyArmour(s, 'leggings', p);
  for (let i = 0; i < 5; i++) G.upgradeArmour(s, 'leggings', p);
  const r = G.upgradeArmour(s, 'leggings', p);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'Already netherite');
});

test('an upgrade needs the piece bought first and enough coins', () => {
  const s = soloRun();
  assert.equal(G.upgradeArmour(s, 'helmet', s.players[0]).reason, 'Buy it first');
  G.buyArmour(s, 'helmet', s.players[0]);
  s.coins = 5;
  assert.equal(G.upgradeArmour(s, 'helmet', s.players[0]).reason, 'Not enough coins');
});

test('full netherite armour reduces incoming damage by the netherite reduction', () => {
  const s = soloRun();
  const p = s.players[0];
  for (const piece of CFG.armour.pieces) p.armour[piece.id] = 5;
  const reduction = G.armourReductionOf(p);
  assert.equal(reduction, CFG.armour.tiers[5].reduction);
  // A 10-damage hit lands as 10 * (1 - reduction).
  assert.ok(Math.abs(10 * (1 - reduction) - 8) < 1e-9);
});

test('a piece not owned yet gives no reduction', () => {
  const s = soloRun();
  const p = s.players[0];
  p.armour = { helmet: 5, chestplate: 5, leggings: 5, boots: -1 };
  assert.equal(G.armourReductionOf(p), 0, 'all four pieces are needed');
});

test('the weakest piece sets the reduction', () => {
  const s = soloRun();
  const p = s.players[0];
  p.armour = { helmet: 5, chestplate: 5, leggings: 5, boots: 2 };
  assert.equal(G.armourReductionOf(p), CFG.armour.tiers[2].reduction);
});

test('the armour loadout carries over with the other items', () => {
  const save = Base.newSave();
  const s = soloRun();
  G.buyArmour(s, 'helmet', s.players[0]);
  G.upgradeArmour(s, 'helmet', s.players[0]);
  Base.carryLoadout(save, s.players[0]);
  const l = Base.loadoutFor(save);
  assert.equal(l.armour.helmet, 1, 'helmet should be iron after one upgrade');
});

test('the shop has an Armour section and routes its buttons', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.ok(html.indexOf('id="shop-armour"') !== -1);
  assert.ok(main.indexOf("kind === 'armour-buy'") !== -1);
  assert.ok(main.indexOf("kind === 'armour-up'") !== -1);
});
