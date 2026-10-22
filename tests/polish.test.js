const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

const root = path.join(__dirname, '..');

function fightingRun(seed) {
  const s = G.createRun(seed == null ? 17 : seed);
  G.startNextWave(s);
  s.enemies = [];
  s.spawnQueue = [];
  return s;
}

function bruteAt(x, y, extra) {
  return Object.assign(
    { id: 99, type: 'brute', x: x, y: y, radius: 24, health: 500, maxHealth: 500, speed: 0, damage: 2, attackCd: 9, hitFlash: 0, dead: false },
    extra || {}
  );
}

test('a melee swing starts the attack pose, which then ends', () => {
  const s = fightingRun();
  // A far-off enemy keeps the wave active, so the update loop keeps ticking the player.
  s.enemies.push(bruteAt(1500, 100, { speed: 0 }));
  s.player.weapon = 'sword';
  s.player.owned.sword = true;
  G.fire(s, s.player.x + 100, s.player.y, s.player);
  assert.ok(s.player.swingTime > 0, 'swing should start the attack pose');
  for (let i = 0; i < 60; i++) G.update(s, 1 / 60, [{}]);
  assert.equal(s.player.swingTime, 0, 'attack pose should end after its time');
});

test('a gun shot does not start the attack pose', () => {
  const s = fightingRun();
  G.fire(s, s.player.x + 100, s.player.y, s.player);
  assert.equal(s.player.swingTime || 0, 0);
});

test('taking a hit queues the hurt sound', () => {
  const s = fightingRun();
  s.enemies.push(bruteAt(s.player.x, s.player.y, { attackCd: 0 }));
  G.update(s, 0.016, [{}]);
  assert.ok(s.events.indexOf('hurt') !== -1, 'hurt sound should be queued');
});

test('a power-up pickup queues the power-up sound, not the coin sound', () => {
  const s = fightingRun();
  s.pickups.push({ kind: 'powerUp', id: 'rage', x: s.player.x, y: s.player.y, life: 10 });
  G.update(s, 0.016, [{}]);
  assert.ok(s.events.indexOf('powerUp') !== -1, 'power-up sound should be queued');
});

test('every sound event the game queues has a sound entry in audio.js', () => {
  const src = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
  const audio = fs.readFileSync(path.join(root, 'js/audio.js'), 'utf8');
  const queued = new Set((src.match(/events\.push\('(\w+)'\)/g) || []).map((m) => m.match(/'(\w+)'/)[1]));
  // pickup sounds are chosen with a ternary, so list them explicitly.
  for (const name of ['powerUp', 'coin', 'select']) queued.add(name);
  for (const name of queued) {
    assert.ok(new RegExp('\\b' + name + ':\\s*\\{ file:').test(audio), 'no sound entry for ' + name);
  }
});

test('every sound file referenced by audio.js exists on disk', () => {
  const audio = fs.readFileSync(path.join(root, 'js/audio.js'), 'utf8');
  for (const rel of new Set(audio.match(/assets\/sounds\/[\w.-]+\.mp3/g) || [])) {
    assert.ok(fs.existsSync(path.join(root, rel)), 'missing sound: ' + rel);
  }
});

test('config has no unused sprite keys for removed enemies', () => {
  assert.equal(CFG.assets.crab, undefined);
  assert.equal(CFG.assets.meteor, undefined);
});
