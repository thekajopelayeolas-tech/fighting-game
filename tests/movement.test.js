const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');
const CFG = require('../js/config.js');

test('a new match starts fighting so the player can move right away', () => {
  const s = G.createRun(1, 'solo', ['knight']);
  G.startNextWave(s);
  assert.equal(s.phase, 'fighting');
  const startX = s.players[0].x;
  G.update(s, 0.5, [{ moveX: 1, moveY: 0 }]);
  assert.ok(s.players[0].x > startX, 'player should move right when moveX is 1');
});

test('movement works in every mode', () => {
  for (const mode of ['solo', 'coop', 'pvp']) {
    const s = G.createRun(2, mode, ['knight', 'bolt']);
    if (mode === 'pvp') G.startVersusRound(s);
    else G.startNextWave(s);
    const p = s.players[0];
    const before = p.y;
    G.update(s, 0.5, [{ moveY: 1 }, { moveY: 0 }]);
    assert.ok(p.y > before, mode + ': player 1 should move down');
  }
});

test('a chosen character is stored on the player', () => {
  const s = G.createRun(3, 'coop', ['bolt', 'frog']);
  assert.equal(s.players[0].character, 'bolt');
  assert.equal(s.players[1].character, 'frog');
});

test('missing character picks fall back to the knight', () => {
  const s = G.createRun(4, 'coop');
  assert.equal(s.players[0].character, 'knight');
  assert.equal(s.players[1].character, 'knight');
});

test('the arena is 1600 by 900 and players stay inside it', () => {
  assert.equal(CFG.world.width, 1600);
  assert.equal(CFG.world.height, 900);
  const s = G.createRun(5, 'solo', ['knight']);
  G.startNextWave(s);
  const p = s.players[0];
  G.update(s, 10, [{ moveX: 1, moveY: 1 }]);
  assert.ok(p.x <= CFG.world.width - CFG.player.radius, 'player should not leave the right edge');
  assert.ok(p.y <= CFG.world.height - CFG.player.radius, 'player should not leave the bottom edge');
});

test('the player is drawn smaller than the old 64px sprite', () => {
  assert.ok(CFG.player.drawSize < 64, 'drawSize should be below the 64px frame');
  assert.ok(CFG.player.drawSize >= 24, 'drawSize should still be readable');
});

test('every character on the select screen has a sprite asset', () => {
  assert.equal(CFG.characters.length, 5);
  for (const c of CFG.characters) {
    assert.ok(CFG.assets[c.asset], c.id + ' has no asset key');
  }
});
