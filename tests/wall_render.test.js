const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CFG = require('../js/config.js');

// Loads render.js into a sandbox and returns its Render API.
function loadRender() {
  const root = path.join(__dirname, '..');
  const sandbox = { CONFIG: CFG, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/render.js'), 'utf8'), sandbox, { filename: 'js/render.js' });
  return sandbox.Render;
}

// A canvas stand-in that records every call the wall code makes.
function recordingCtx() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push({ fn: k, args: args }); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { ctx: ctx, calls: calls };
}

test('each PvP wall gets a dark border and a light edge, so it shows on dark backgrounds', () => {
  const Render = loadRender();
  const { ctx, calls } = recordingCtx();
  const wall = { x: 100, y: 200, w: 48, h: 16 };
  Render.drawWalls(ctx, { walls: [wall] }, {});
  const outlines = calls.filter((c) => c.fn === 'strokeRect');
  assert.equal(outlines.length, 2, 'one dark border and one light edge');
  for (const o of outlines) {
    assert.deepEqual(o.args, [wall.x, wall.y, wall.w, wall.h]);
  }
});

test('walls draw nothing when the arena has none', () => {
  const Render = loadRender();
  const { ctx, calls } = recordingCtx();
  Render.drawWalls(ctx, { walls: [] }, {});
  assert.equal(calls.length, 0);
});

test('the wall edge colours are visibly different from each other', () => {
  const cfg = CFG.versus.walls;
  assert.notEqual(cfg.shadowColor, cfg.edgeColor);
  assert.ok(cfg.shadowWidth > cfg.edgeWidth, 'the dark border should be wider than the light edge');
});
