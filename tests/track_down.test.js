const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/game.js');

const root = path.join(__dirname, '..');

function fightingRun() {
  const s = G.createRun(51, 'solo', ['knight']);
  G.startNextWave(s);
  s.enemies = [];
  s.spawnQueue = [];
  s.player.x = 600;
  s.player.y = 400;
  return s;
}

function enemyAt(id, x, y) {
  return { id: id, type: 'brute', x: x, y: y, radius: 24, health: 500, maxHealth: 500, speed: 0, damage: 2, attackCd: 9, hitFlash: 0, dead: false };
}

test('track target is the nearest living enemy', () => {
  const s = fightingRun();
  const far = enemyAt(1, 1200, 400);
  const near = enemyAt(2, 700, 400);
  s.enemies.push(far, near);
  assert.equal(G.trackTarget(s, s.player), near);
});

test('track target ignores dead enemies', () => {
  const s = fightingRun();
  const dead = enemyAt(1, 650, 400);
  dead.dead = true;
  const alive = enemyAt(2, 1000, 400);
  s.enemies.push(dead, alive);
  assert.equal(G.trackTarget(s, s.player), alive);
});

test('track target is null when there is nothing to track', () => {
  const s = fightingRun();
  assert.equal(G.trackTarget(s, s.player), null);
});

test('Track Down is off by default and resets when a match starts', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.ok(main.indexOf('let trackDown = false;') !== -1, 'starts off');
  assert.ok(main.indexOf('setTrackDown(false);') !== -1, 'resets at the start of a match');
});

test('the button and the T key both toggle the same state', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.ok(main.indexOf('function toggleTrackDown()') !== -1);
  assert.ok(main.indexOf("e.code === 'KeyT') toggleTrackDown()") !== -1, 'T key toggles');
  assert.ok(main.indexOf("document.getElementById('track-btn').addEventListener('click'") !== -1, 'button toggles');
});

test('Track Down only changes aim, and firing still comes from the fire input', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const start = main.indexOf('function readP1()');
  const body = main.slice(start, main.indexOf('\n  }\n', start));
  assert.ok(body.indexOf('firing: firing') !== -1, 'firing comes from the fire input');
  assert.ok(body.indexOf('Game.trackTarget(run, run.players[0])') !== -1, 'aim uses the nearest enemy');
});

test('the track button is in the play view and styled as a toggle', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  assert.ok(html.indexOf('id="track-btn"') !== -1);
  assert.ok(css.indexOf('.track-btn.on') !== -1, 'the ON state pulses');
});
