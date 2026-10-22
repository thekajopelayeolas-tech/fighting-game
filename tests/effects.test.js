const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

function fightingRun(seed) {
  const s = G.createRun(seed == null ? 13 : seed);
  G.startNextWave(s);
  s.enemies = [];
  s.spawnQueue = [];
  return s;
}

function enemyAt(id, x, y, extra) {
  return Object.assign(
    { id: id, type: 'brute', x: x, y: y, radius: 24, health: 500, maxHealth: 500, speed: 0, damage: 2, attackCd: 9, hitFlash: 0, dead: false },
    extra || {}
  );
}

function equipSword(s) {
  s.player.x = 400;
  s.player.y = 300;
  s.player.weapon = 'sword';
  s.player.owned.sword = true;
}

test('a hit spawns sparks and a damage number', () => {
  const s = fightingRun();
  s.enemies.push(enemyAt(1, 440, 300));
  equipSword(s);
  G.fire(s, 800, 300);
  const sparks = s.effects.filter((fx) => fx.kind === 'spark');
  const popups = s.effects.filter((fx) => fx.kind === 'text');
  assert.equal(sparks.length, CFG.effects.hitSparks);
  assert.equal(popups.length, 1);
  assert.equal(popups[0].text, String(Math.round(CFG.weapons.sword.damage * G.playerStats(s.player).damageMult)));
});

test('killing an enemy adds a bigger burst of sparks', () => {
  const s = fightingRun();
  s.enemies.push(enemyAt(1, 440, 300, { health: 1 }));
  equipSword(s);
  G.fire(s, 800, 300);
  const sparks = s.effects.filter((fx) => fx.kind === 'spark');
  assert.equal(sparks.length, CFG.effects.hitSparks + CFG.effects.deathSparks);
});

test('effects expire after their lifetime', () => {
  const s = fightingRun();
  s.enemies.push(enemyAt(1, 440, 300, { health: 1 }));
  equipSword(s);
  G.fire(s, 800, 300);
  for (let i = 0; i < 120; i++) G.update(s, 1 / 60, [{}]);
  assert.equal(s.effects.length, 0, 'all effects should be gone after 2 seconds');
});

test('damage to the player shakes the screen, and the shake fades out', () => {
  const s = fightingRun();
  // attackCd 0 lets the enemy attack on this frame.
  s.enemies.push(enemyAt(1, s.player.x, s.player.y, { attackCd: 0 }));
  G.update(s, 0.016, [{}]);
  assert.ok(s.shake >= CFG.effects.shake - 0.5, 'hit should start the shake');
  for (let i = 0; i < 120; i++) G.update(s, 1 / 60, [{}]);
  assert.equal(s.shake, 0, 'shake should fade to zero');
});

test('effects do not change what a seeded run spawns', () => {
  const a = G.createRun(21);
  const b = G.createRun(21);
  G.startNextWave(a);
  G.startNextWave(b);
  b.effects.push({ kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 1, color: '#fff' });
  for (let i = 0; i < 300; i++) {
    G.update(a, 1 / 60, [{}]);
    G.update(b, 1 / 60, [{}]);
  }
  assert.deepEqual(a.spawnQueue, b.spawnQueue);
  assert.equal(a.enemies.length, b.enemies.length);
});
