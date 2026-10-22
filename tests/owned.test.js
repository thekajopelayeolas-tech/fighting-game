const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Base = require('../js/base.js');

const root = path.join(__dirname, '..');

const weapon = { key: 'weapon:sword', kind: 'weapon', name: 'Sword', price: 20, currency: 'coins' };
const armour = { key: 'armour:helmet', kind: 'armour', name: 'Helmet', price: 40, currency: 'coins' };
const colour = { key: 'colour:blue', kind: 'colour', name: 'Blue', price: 3, currency: 'dust' };

test('a weapon is owned only when the player has it', () => {
  assert.equal(Base.isOwned(weapon, { owned: { gun: true } }, {}), false);
  assert.equal(Base.isOwned(weapon, { owned: { gun: true, sword: true } }, {}), true);
});

test('an armour piece is owned once it is bought, at any tier', () => {
  assert.equal(Base.isOwned(armour, { armour: { helmet: -1 } }, {}), false);
  assert.equal(Base.isOwned(armour, { armour: { helmet: 0 } }, {}), true, 'wood counts as owned');
  assert.equal(Base.isOwned(armour, { armour: { helmet: 5 } }, {}), true, 'netherite counts as owned');
});

test('a colour is owned only when it is in the saved colours', () => {
  assert.equal(Base.isOwned(colour, {}, { owned: ['red'] }), false);
  assert.equal(Base.isOwned(colour, {}, { owned: ['red', 'blue'] }), true);
});

test('a missing item or player never counts as owned', () => {
  assert.equal(Base.isOwned(null, {}, {}), false);
  assert.equal(Base.isOwned(weapon, null, null), false);
});

test('the room draws an OWNED tag, and the E key refuses owned items', () => {
  const render = fs.readFileSync(path.join(root, 'js/render.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.ok(render.indexOf("'OWNED'") !== -1, 'the pedestal shows OWNED');
  assert.ok(main.indexOf('if (Base.isOwned(shelf.item, p, save))') !== -1, 'E checks ownership before buying');
});
