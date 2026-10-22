const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

function pvpRun(seed) {
  const s = G.createRun(seed == null ? 31 : seed, 'pvp', ['knight', 'bolt']);
  G.startNextWave(s);
  return s;
}

test('a PvP round builds exactly the configured number of walls', () => {
  const s = pvpRun();
  assert.equal(s.walls.length, CFG.versus.walls.count);
});

test('each wall is exactly the configured length, in whole tiles', () => {
  const s = pvpRun();
  const tile = CFG.versus.walls.tile;
  const length = CFG.versus.walls.length * tile;
  for (const w of s.walls) {
    const long = Math.max(w.w, w.h);
    const thick = Math.min(w.w, w.h);
    assert.equal(long, length, 'wall should be ' + length + 'px long');
    assert.equal(thick, tile, 'wall should be one tile thick');
  }
});

test('walls never sit on a player spawn point', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = pvpRun(seed);
    const clear = CFG.versus.walls.spawnClearance;
    const cy = CFG.world.height / 2;
    for (const sx of [CFG.world.width * 0.25, CFG.world.width * 0.75]) {
      for (const w of s.walls) {
        const nx = Math.max(w.x, Math.min(sx, w.x + w.w));
        const ny = Math.max(w.y, Math.min(cy, w.y + w.h));
        assert.ok(Math.hypot(sx - nx, cy - ny) >= clear, 'seed ' + seed + ': wall too close to spawn');
      }
    }
  }
});

test('walls do not overlap each other', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = pvpRun(seed);
    for (let i = 0; i < s.walls.length; i++) {
      for (let j = i + 1; j < s.walls.length; j++) {
        const a = s.walls[i];
        const b = s.walls[j];
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        assert.equal(overlap, false, 'seed ' + seed + ': walls ' + i + ' and ' + j + ' overlap');
      }
    }
  }
});

test('the same seed always makes the same walls', () => {
  const a = pvpRun(77);
  const b = pvpRun(77);
  assert.deepEqual(a.walls, b.walls);
});

test('walls are rebuilt in a new round', () => {
  const s = pvpRun(41);
  const first = JSON.stringify(s.walls);
  G.startVersusRound(s);
  assert.notEqual(JSON.stringify(s.walls), first, 'round 2 should have different walls');
  assert.equal(s.walls.length, CFG.versus.walls.count);
});

test('a player cannot walk into a wall', () => {
  const s = pvpRun(5);
  const wall = s.walls[0];
  s.phase = 'fighting';
  // Put the player just left of the wall and push right into it.
  s.players[0].x = wall.x - CFG.player.radius - 1;
  s.players[0].y = wall.y + wall.h / 2;
  s.players[0].down = false;
  for (let i = 0; i < 120; i++) G.update(s, 1 / 60, [{ moveX: 1, moveY: 0 }, {}]);
  const r = CFG.player.radius;
  assert.ok(s.players[0].x <= wall.x - r + 0.01, 'player should stop at the wall edge');
});

test('a gun shot is stopped by a wall', () => {
  const s = pvpRun(9);
  const wall = s.walls[0];
  s.phase = 'fighting';
  const shooter = s.players[0];
  const other = s.players[1];
  shooter.weapon = 'gun';
  shooter.x = wall.x - 30;
  shooter.y = wall.y + wall.h / 2;
  other.x = wall.x + wall.w + 60;
  other.y = wall.y + wall.h / 2;
  other.health = other.maxHealth;
  other.invuln = 0;
  G.fire(s, other.x, other.y, shooter);
  for (let i = 0; i < 90; i++) G.update(s, 1 / 60, [{}, {}]);
  assert.equal(other.health, other.maxHealth, 'the wall should block the shot');
});

test('a sniper shot that would pierce is still stopped by a wall', () => {
  const s = pvpRun(9);
  const wall = s.walls[0];
  s.phase = 'fighting';
  const shooter = s.players[0];
  const other = s.players[1];
  shooter.weapon = 'sniper';
  shooter.owned.sniper = true;
  shooter.x = wall.x - 30;
  shooter.y = wall.y + wall.h / 2;
  other.x = wall.x + wall.w + 200;
  other.y = wall.y + wall.h / 2;
  other.health = other.maxHealth;
  other.invuln = 0;
  G.fire(s, other.x, other.y, shooter);
  for (let i = 0; i < 90; i++) G.update(s, 1 / 60, [{}, {}]);
  assert.equal(other.health, other.maxHealth, 'the sniper should not pierce a wall');
});

test('solo runs have no walls', () => {
  const s = G.createRun(4);
  G.startNextWave(s);
  assert.deepEqual(s.walls, []);
});
