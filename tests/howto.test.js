const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeEl(id) {
  const classes = new Set();
  return {
    id: id,
    width: 0,
    height: 0,
    textContent: '',
    innerHTML: '',
    disabled: false,
    listeners: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    getContext() {
      return new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : function () {}),
        set: (t, k, v) => { t[k] = v; return true; },
      });
    },
    closest() { return null; },
    querySelectorAll() { return []; },
  };
}

test('HOW TO PLAY opens the panel and BACK or Escape closes it', () => {
  const root = path.join(__dirname, '..');
  const ids = ['game', 'hud', 'shop', 'title', 'gameover', 'shop-coins', 'shop-upgrades', 'shop-weapons', 'shop-tabs',
    'next-wave-btn', 'start-btn', 'start-coop-btn', 'start-pvp-btn', 'retry-btn', 'final-score', 'final-wave', 'final-best',
    'gameover-title', 'final-score-label', 'final-wave-label', 'final-best-label',
    'select', 'select-slots', 'select-grid', 'select-status', 'select-start', 'select-back',
    'howto', 'howto-btn', 'howto-back'];
  const els = {};
  for (const id of ids) els[id] = makeEl(id);
  // The page starts with these overlays hidden; mirror that in the stubs.
  els['howto'].classList.add('hidden');
  els['select'].classList.add('hidden');
  els['gameover'].classList.add('hidden');
  const store = {};
  const keyHandlers = [];
  let frameCb = null;
  const sandbox = {
    document: { getElementById: (id) => els[id] },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    requestAnimationFrame: (cb) => { frameCb = cb; return 1; },
    Image: function () { this.complete = true; this.naturalWidth = 64; this.naturalHeight = 64; },
    Audio: function () { this.volume = 1; this.play = () => Promise.resolve(); this.pause = () => {}; },
    console,
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (type, fn) => { if (type === 'keydown') keyHandlers.push(fn); };
  const ctx = vm.createContext(sandbox);
  for (const f of ['js/config.js', 'js/audio.js', 'js/game.js', 'js/render.js', 'js/main.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const click = (el) => (el.listeners.click || []).forEach((fn) => fn({ target: el }));
  const press = (code) => keyHandlers.forEach((fn) => fn({ code: code, key: code, preventDefault() {} }));
  let now = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { now += 16; frameCb(now); } };

  step(3);
  assert.equal(els['howto'].classList.contains('hidden'), true, 'panel starts closed');
  click(els['howto-btn']);
  assert.equal(els['howto'].classList.contains('hidden'), false, 'HOW TO PLAY should open the panel');
  click(els['howto-back']);
  assert.equal(els['howto'].classList.contains('hidden'), true, 'BACK should close the panel');
  assert.equal(els['title'].classList.contains('hidden'), false, 'title screen should still be visible');

  click(els['howto-btn']);
  press('Escape');
  assert.equal(els['howto'].classList.contains('hidden'), true, 'Escape should close the panel');
  assert.equal(els['select'].classList.contains('hidden'), true, 'the match should not have started');
});
