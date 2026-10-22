const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

const root = path.join(__dirname, '..');

// A fighting run with one player of the given character and no enemies.
function runAs(character) {
  const s = G.createRun(41, 'solo', [character]);
  G.startNextWave(s);
  s.enemies = [];
  s.spawnQueue = [];
  s.player.x = 600;
  s.player.y = 400;
  // A far-off enemy keeps the wave active, so the update loop keeps ticking cooldowns.
  s.enemies.push(enemyAt(999, 1500, 100));
  return s;
}

function enemyAt(id, x, y) {
  return { id: id, type: 'brute', x: x, y: y, radius: 24, health: 500, maxHealth: 500, speed: 0, damage: 2, attackCd: 9, hitFlash: 0, dead: false };
}

test('each character has exactly one special with a cooldown', () => {
  for (const c of CFG.characters) {
    assert.ok(c.special, c.id + ' needs a special');
    assert.ok(c.special.cooldown > 0, c.id + ' special needs a cooldown');
    assert.ok(c.special.name, c.id + ' special needs a name');
  }
  // Five normal characters plus the Super Character.
  assert.equal(CFG.characters.length, 6);
});

test('the special is on cooldown after it is used, and only works again when ready', () => {
  const s = runAs('knight');
  assert.equal(G.useSpecial(s, s.player), true);
  assert.equal(G.useSpecial(s, s.player), false, 'should be cooling down');
  const cd = CFG.characters.find((c) => c.id === 'knight').special.cooldown;
  for (let i = 0; i < Math.ceil((cd + 0.5) * 60); i++) G.update(s, 1 / 60, [{}]);
  assert.equal(G.useSpecial(s, s.player), true, 'ready again after the cooldown');
});

test('knight Shield Wall gives the existing shield power-up', () => {
  const s = runAs('knight');
  G.useSpecial(s, s.player);
  assert.ok(s.player.powerUps.shield > 0, 'shield should be active');
});

test('bolt Overcharge gives the existing haste power-up', () => {
  const s = runAs('bolt');
  G.useSpecial(s, s.player);
  assert.ok(s.player.powerUps.haste > 0, 'haste should be active');
});

test('dino Stomp damages and knocks back enemies in its radius only', () => {
  const s = runAs('dino');
  const near = enemyAt(1, 650, 400);
  const far = enemyAt(2, 1200, 400);
  s.enemies.push(near, far);
  const sp = CFG.characters.find((c) => c.id === 'dino').special;
  const beforeX = near.x;
  G.useSpecial(s, s.player);
  assert.equal(near.health, 500 - sp.damage, 'enemy in the radius takes the stomp damage');
  assert.ok(near.x > beforeX, 'enemy is pushed away from the dino');
  assert.equal(far.health, 500, 'enemy outside the radius is untouched');
});

test('forest Heal restores health, but never above max', () => {
  const s = runAs('forest');
  s.player.health = 1;
  G.useSpecial(s, s.player);
  assert.equal(s.player.health, 1 + CFG.characters.find((c) => c.id === 'forest').special.amount);
  s.player.health = s.player.maxHealth;
  s.player.specialCooldown = 0;
  G.useSpecial(s, s.player);
  assert.equal(s.player.health, s.player.maxHealth, 'heal is capped at max');
});

test('frog Croak slows enemies in its radius, and the slow ends', () => {
  const s = runAs('frog');
  const near = enemyAt(1, 650, 400);
  s.enemies.push(near);
  G.useSpecial(s, s.player);
  assert.ok(near.slowUntil > s.time, 'enemy should be slowed');
  assert.ok(near.slowFactor < 1);
  s.time = near.slowUntil + 1;
  assert.ok(!(near.slowUntil && s.time < near.slowUntil), 'the slow should have ended');
});

test('a special does nothing while the player is down or outside a fight', () => {
  const s = runAs('dino');
  s.player.down = true;
  assert.equal(G.useSpecial(s, s.player), false);
  s.player.down = false;
  s.phase = 'shop';
  assert.equal(G.useSpecial(s, s.player), false);
});

test('Left Shift is player 1 and Enter is player 2 for specials', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.ok(main.indexOf("const SPECIAL_KEYS = ['ShiftLeft', 'Enter'];") !== -1);
  assert.ok(main.indexOf('e.code === SPECIAL_KEYS[0]) pendingSpecial[0] = true') !== -1);
  assert.ok(main.indexOf('e.code === SPECIAL_KEYS[1]) pendingSpecial[1] = true') !== -1);
});

test('Enter as the special key does not replace the menu Enter handling', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  // The title, game-over and select menus still use Enter.
  assert.ok(main.indexOf("screen === 'title' && (e.code === 'Enter'") !== -1);
  assert.ok(main.indexOf("screen === 'select' && e.code === 'Enter'") !== -1);
});

test('the HUD shows the special with its key and state', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.ok(main.indexOf('function specialHudText(p)') !== -1);
  assert.ok(main.indexOf("'READY'") !== -1);
});
