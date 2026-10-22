const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Base = require('../js/base.js');
const G = require('../js/game.js');

const root = path.join(__dirname, '..');

test('a new save has no loadout, so a fresh player starts fresh', () => {
  assert.equal(Base.loadoutFor(Base.newSave()), null);
});

test('carryLoadout saves the owned weapons, equipped weapon, ammo and upgrades', () => {
  const s = G.createRun(2, 'solo', ['knight']);
  G.startBase(s);
  const p = s.players[0];
  p.owned.shotgun = true;
  p.owned.sword = true;
  p.weapon = 'sword';
  p.upgrades.maxHealth = 2;
  const save = Base.newSave();
  Base.carryLoadout(save, p);
  const l = Base.loadoutFor(save);
  assert.deepEqual(l.owned.sort(), ['gun', 'shotgun', 'sword']);
  assert.equal(l.weapon, 'sword');
  assert.equal(l.upgrades.maxHealth, 2);
});

test('a damaged loadout drops non-text weapon ids', () => {
  const save = Base.newSave();
  save.loadout = { owned: ['gun', 42, null], weapon: 'sword', ammo: {}, upgrades: {} };
  const l = Base.loadoutFor(save);
  assert.deepEqual(l.owned, ['gun'], 'only text ids are kept');
  assert.equal(typeof l.weapon, 'string');
});

test('the loadout restore code only grants known weapons', () => {
  const src = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const start = src.indexOf('function restoreLoadout(p)');
  const body = src.slice(start, src.indexOf('\n  }\n', start));
  assert.ok(body.indexOf('WEAPON_IDS.indexOf(id) !== -1') !== -1, 'unknown weapon ids must be ignored');
  assert.ok(body.indexOf("if (!p.owned[l.weapon]) l.weapon = 'gun';") !== -1, 'an unowned equipped weapon falls back to the gun');
});

test('restoring upgrades reapplies max health through the shop rule', () => {
  const src = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const start = src.indexOf('function restoreLoadout(p)');
  const body = src.slice(start, src.indexOf('\n  }\n', start));
  assert.ok(body.indexOf('p.maxHealth = CONFIG.player.maxHealth + p.upgrades.maxHealth') !== -1);
});

test('the base shop and the loadout save happen on the same carry', () => {
  const src = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const start = src.indexOf('function carryRunToSave()');
  const body = src.slice(start, src.indexOf('\n  }\n', start));
  assert.ok(body.indexOf('Base.carryLoadout(save, run.players[0])') !== -1);
});
