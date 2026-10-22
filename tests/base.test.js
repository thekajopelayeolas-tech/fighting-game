const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Base = require('../js/base.js');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

test('dust is 1 per 100 points, rounded down', () => {
  assert.equal(Base.dustForScore(0), 0);
  assert.equal(Base.dustForScore(99), 0);
  assert.equal(Base.dustForScore(100), 1);
  assert.equal(Base.dustForScore(1234), 12);
});

test('a finished run adds its dust to the save', () => {
  const save = Base.newSave();
  const gained = Base.addRunDust(save, 550);
  assert.equal(gained, 5);
  assert.equal(save.dust, 5);
});

test('the save starts with only the red colour owned', () => {
  const save = Base.newSave();
  assert.deepEqual(save.owned, ['red']);
  assert.equal(save.color, 'red');
  assert.equal(save.dust, 0);
});

test('there are exactly ten dust colours, and the rainbow is separate', () => {
  assert.equal(CFG.base.colors.length, 10);
  assert.equal(Base.findColor('rainbow').rainbow, true);
  assert.equal(Base.findColor('rainbow').cost, CFG.base.rainbowCost);
});

test('a colour cannot be bought without enough dust', () => {
  const save = Base.newSave();
  save.dust = 0;
  const result = Base.buyColor(save, 'blue');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'Not enough dust');
  assert.equal(save.owned.indexOf('blue'), -1);
});

test('buying a colour spends its cost and adds it to the owned list', () => {
  const save = Base.newSave();
  save.dust = 10;
  const blue = CFG.base.colors.find((c) => c.id === 'blue');
  const result = Base.buyColor(save, 'blue');
  assert.equal(result.ok, true);
  assert.equal(save.dust, 10 - blue.cost);
  assert.ok(save.owned.indexOf('blue') !== -1);
});

test('the rainbow costs 10 dust and is bought once', () => {
  const save = Base.newSave();
  save.dust = 9;
  assert.equal(Base.buyColor(save, 'rainbow').ok, false, 'not enough for the rainbow');
  save.dust = 25;
  assert.equal(Base.buyColor(save, 'rainbow').ok, true);
  assert.equal(save.dust, 15);
  assert.equal(Base.buyColor(save, 'rainbow').reason, 'Already owned');
});

test('only owned colours can be equipped', () => {
  const save = Base.newSave();
  assert.equal(Base.equipColor(save, 'pink'), false, 'not owned, so it cannot be equipped');
  assert.equal(save.color, 'red');
  save.owned.push('pink');
  assert.equal(Base.equipColor(save, 'pink'), true);
  assert.equal(save.color, 'pink');
});

test('practice dummies can be hit, but they never damage the player', () => {
  const s = G.createRun(3);
  G.startBase(s);
  assert.equal(s.phase, 'base');
  assert.equal(s.dummies.length, 4);
  const p = s.players[0];
  // Stand right next to a dummy and let several seconds pass.
  const d = s.dummies[0];
  p.x = d.x;
  p.y = d.y + 30;
  const before = p.health;
  for (let i = 0; i < 600; i++) G.update(s, 1 / 60, [{}]);
  assert.equal(p.health, before, 'dummies must never hurt the player');
});

test('a shot in the base reduces a dummy health', () => {
  const s = G.createRun(5);
  G.startBase(s);
  const p = s.players[0];
  const d = s.dummies[0];
  p.x = d.x - 200;
  p.y = d.y;
  p.weapon = 'gun';
  G.fire(s, d.x, d.y, p);
  for (let i = 0; i < 60; i++) G.update(s, 1 / 60, [{}]);
  assert.ok(d.health < d.maxHealth, 'the dummy should take the hit');
});

test('the base has no enemy waves', () => {
  const s = G.createRun(7);
  G.startBase(s);
  for (let i = 0; i < 600; i++) G.update(s, 1 / 60, [{}]);
  assert.equal(s.enemies.length, 0);
  assert.equal(s.phase, 'base');
});

test('entering the arena starts a real wave', () => {
  const s = G.createRun(9);
  G.startBase(s);
  G.enterArena(s);
  assert.equal(s.inBase, false);
  assert.equal(s.phase, 'fighting');
  assert.equal(s.wave, 1);
  assert.deepEqual(s.dummies, []);
});

test('the portal is only near the portal spot', () => {
  const p = { x: CFG.base.portal.x, y: CFG.base.portal.y };
  assert.equal(Base.nearPortal(p), true);
  assert.equal(Base.nearPortal({ x: 100, y: 100 }), false);
});

test('the base HTML has the base panel', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.indexOf('id="base-panel"') !== -1);
  assert.ok(html.indexOf('js/base.js') !== -1, 'base.js should be loaded');
});
