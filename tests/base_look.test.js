const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CFG = require('../js/config.js');

const root = path.join(__dirname, '..');

// A canvas stand-in that accepts every call and returns a gradient object for gradient calls.
function recordingCtx() {
  const calls = [];
  const gradient = () => ({ addColorStop() {} });
  const ctx = new Proxy({}, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return gradient;
      return (...args) => { calls.push({ fn: k, args: args }); };
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { ctx: ctx, calls: calls };
}

function loadRender() {
  const sandbox = { CONFIG: CFG, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/render.js'), 'utf8'), sandbox, { filename: 'js/render.js' });
  return sandbox.Render;
}

test('the base draws every part of the hub: floor, range, dummies, stations, portal', () => {
  const Render = loadRender();
  const { ctx, calls } = recordingCtx();
  const state = { dummies: [{ id: 1, x: 500, y: 600, health: 50, maxHealth: 100 }] };
  Render.drawBase(ctx, state, 1.5);
  const texts = calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0]);
  assert.ok(texts.indexOf('PRACTICE RANGE') !== -1, 'practice range label');
  assert.ok(texts.indexOf('COLOUR') !== -1 && texts.indexOf('DUST') !== -1 && texts.indexOf('SHOP') !== -1, 'station signs');
  assert.ok(texts.some((t) => t.indexOf('ARENA') === 0), 'portal label');
});

test('the base is drawn without crashing at different times', () => {
  const Render = loadRender();
  for (const t of [0, 0.5, 3.7, 120]) {
    const { ctx } = recordingCtx();
    assert.doesNotThrow(() => Render.drawBase(ctx, { dummies: [] }, t));
  }
});

test('the game-over screen has a BACK TO BASE button in the markup', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.indexOf('id="base-back-btn"') !== -1);
  assert.ok(html.indexOf('BACK TO BASE') !== -1);
});

test('BACK TO BASE is only shown for solo runs', () => {
  const src = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.ok(src.indexOf("if (gameMode === 'solo') backBtn.classList.remove('hidden');") !== -1);
  assert.ok(src.indexOf("else backBtn.classList.add('hidden');") !== -1);
});
