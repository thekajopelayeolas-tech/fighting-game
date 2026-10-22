const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CFG = require('../js/config.js');

const root = path.join(__dirname, '..');

// Runs main.js's applyGlow logic by reading it from the source, so the test checks the real code.
function loadApplyGlow(save) {
  const src = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const start = src.indexOf('  function applyGlow(p) {');
  const end = src.indexOf('\n  }\n', start) + 4;
  const body = src.slice(start, end).replace('  function applyGlow', 'function applyGlow');
  const sandbox = { save: save, Base: require('../js/base.js') };
  vm.createContext(sandbox);
  vm.runInContext(body, sandbox);
  return sandbox.applyGlow;
}

test('equipping a dust colour sets the player glow to that colour', () => {
  const save = { color: 'blue' };
  const applyGlow = loadApplyGlow(save);
  const p = {};
  applyGlow(p);
  const blue = CFG.base.colors.find((c) => c.id === 'blue');
  assert.equal(p.glow, 'colour');
  assert.equal(p.glowHex, blue.hex);
});

test('red (the free default) leaves the character untinted', () => {
  const applyGlow = loadApplyGlow({ color: 'red' });
  const p = {};
  applyGlow(p);
  assert.equal(p.glow, null);
});

test('the rainbow sets the glow to rainbow, which cycles', () => {
  const applyGlow = loadApplyGlow({ color: 'rainbow' });
  const p = {};
  applyGlow(p);
  assert.equal(p.glow, 'rainbow');
});

test('the rainbow tint cycles through distinct colours', () => {
  const src = fs.readFileSync(path.join(root, 'js/render.js'), 'utf8');
  const start = src.indexOf('  function rainbowHex(step) {');
  const end = src.indexOf('\n  }\n', start) + 4;
  const body = src.slice(start, end).replace('  function rainbowHex', 'function rainbowHex');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(body, sandbox);
  const seen = new Set();
  for (let i = 0; i < 12; i++) seen.add(sandbox.rainbowHex(i));
  assert.equal(seen.size, 12, 'twelve hue steps should give twelve colours');
});

test('equipping a colour in the base re-applies the glow to the live player', () => {
  const src = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const clickStart = src.indexOf('function basePanelClick(e) {');
  const clickBody = src.slice(clickStart, src.indexOf('\n  }\n', clickStart));
  assert.ok(clickBody.indexOf('applyGlow(run.players[0])') !== -1, 'equip should update the player');
});

test('the sprite draw path takes a tint argument', () => {
  const src = fs.readFileSync(path.join(root, 'js/render.js'), 'utf8');
  assert.ok(src.indexOf('function drawSprite(ctx, img, row, frame, x, y, size, flip, tint)') !== -1);
  assert.ok(src.indexOf("'source-atop'") !== -1, 'tint should only colour the solid pixels');
});
