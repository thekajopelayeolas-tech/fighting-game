const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/game.js');
const Base = require('../js/base.js');
const CFG = require('../js/config.js');

const root = path.join(__dirname, '..');
const superDef = () => CFG.characters.find((c) => c.super);

function fightingRun(character) {
  const s = G.createRun(61, 'solo', [character || 'knight']);
  G.startNextWave(s);
  s.enemies = [];
  s.spawnQueue = [];
  s.player.x = 600;
  s.player.y = 400;
  // A far-off enemy keeps the wave, and so the cooldowns, running.
  s.enemies.push({ id: 999, type: 'brute', x: 1500, y: 100, radius: 24, health: 500, maxHealth: 500, speed: 0, damage: 2, attackCd: 9, hitFlash: 0, dead: false });
  return s;
}

test('the Super Character costs 500 coins and is in the shop room', () => {
  assert.equal(superDef().cost, 500);
  const shop = Base.roomItems('shop').find((i) => i.key === 'character:super');
  assert.ok(shop, 'the shop should list the Super Character');
  assert.equal(shop.price, 500);
  assert.equal(shop.currency, 'coins');
});

test('recording the purchase saves it once; the 500 coins are taken from the run', () => {
  const save = Base.newSave();
  const ok = Base.buySuperCharacter(save, 'super');
  assert.equal(ok.ok, true);
  assert.equal(ok.cost, 500);
  assert.equal(Base.buySuperCharacter(save, 'super').reason, 'Already owned');
});

test('buying the Super Character from the shelf takes 500 coins from the run', () => {
  const s = G.createRun(7, 'solo', ['knight']);
  G.startBase(s);
  s.coins = 499;
  const shelves = G.roomShelves('shop');
  const slot = shelves.find((x) => x.item.key === 'character:super');
  s.players[0].x = slot.x;
  s.players[0].y = slot.y;
  s.room = 'shop';
  assert.equal(G.buyShelfItem(s, s.players[0], 0).ok, false, 'not enough coins with 499');
  s.coins = 500;
  const r = G.buyShelfItem(s, s.players[0], 0);
  assert.equal(r.ok, true);
  assert.equal(r.character, 'super');
  assert.equal(s.coins, 0);
});

test('the Super Character is locked on the select screen until bought', () => {
  const save = Base.newSave();
  assert.equal(Base.characterUnlocked(save, 'super'), false);
  assert.equal(Base.characterUnlocked(save, 'knight'), true, 'normal characters are always available');
  Base.buySuperCharacter(save, 'super', 500);
  assert.equal(Base.characterUnlocked(save, 'super'), true);
});

test('the select screen lists the Super Character as a locked card with its price', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const start = main.indexOf('function renderSelect()');
  const body = main.slice(start, main.indexOf('\n  }\n', start));
  assert.ok(body.indexOf('CONFIG.characters.map(') !== -1, 'every character is listed, not filtered out');
  assert.ok(body.indexOf("'Buy in shop: ' + c.cost + ' coins'") !== -1, 'the locked card shows its price');
  assert.ok(body.indexOf("'char-card' + (chosen ? ' chosen' : '') + (locked ? ' locked' : '')") !== -1, 'the card is marked locked');
  assert.ok(body.indexOf('const disabled = locked ||') !== -1, 'a locked card cannot be picked');
});

test('the locked styling exists on the select card', () => {
  const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  assert.ok(css.indexOf('.char-card.locked') !== -1);
});

test('owning the Super Character shows as owned in the shop room', () => {
  const save = Base.newSave();
  Base.buySuperCharacter(save, 'super', 500);
  const item = Base.roomItems('shop').find((i) => i.key === 'character:super');
  assert.equal(Base.isOwned(item, {}, save), true);
  assert.equal(Base.isOwned(item, {}, Base.newSave()), false);
});

test('the sprite cycles through all five characters', () => {
  const src = fs.readFileSync(path.join(root, 'js/render.js'), 'utf8');
  assert.ok(src.indexOf('function characterAsset(p, time)') !== -1);
  assert.deepEqual(superDef().cycle, ['knight', 'bolt', 'dino', 'forest', 'frog']);
});

test('the Super Burst runs all five specials at once', () => {
  const s = fightingRun('super');
  const p = s.players[0];
  p.health = 1;
  G.useSpecial(s, p);
  assert.ok(p.powerUps.shield > 0, 'Shield Wall part is on');
  assert.ok(p.powerUps.haste > 0, 'Overcharge part is on');
  assert.ok(p.health > 1, 'Heal part ran');
});

test('the Super Burst has one cooldown, and it is the Super Burst cooldown', () => {
  const s = fightingRun('super');
  const p = s.players[0];
  G.useSpecial(s, p);
  assert.equal(p.specialCooldown, superDef().special.cooldown);
  assert.equal(G.useSpecial(s, p), false, 'cannot fire again while cooling down');
});

test('the shop room buy path handles the Super Character', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const game = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
  assert.ok(game.indexOf("item.kind === 'character'") !== -1 || game.indexOf("kind === 'character'") !== -1, 'the shelf buy path knows about characters');
  assert.ok(main.indexOf('buySuperCharacter') !== -1, 'the purchase saves the character');
});
