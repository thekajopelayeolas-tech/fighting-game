// Loads the browser scripts into a stubbed DOM and runs frames to catch runtime errors.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Finds a clickable element by data-action in the rendered select grid, so tests click what the page renders.
function findCard(els, action) {
  const html = els['select-grid'].innerHTML;
  const found = html.indexOf('data-action="' + action + '"') !== -1;
  if (!found) throw new Error('no rendered control for ' + action);
  return { listeners: { click: [(evt) => {
    const btn = { getAttribute: () => action, disabled: false };
    els['select'].listeners.click.forEach((fn) => fn({ target: { closest: () => btn } }));
  }] } };
}

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
      // Gradient methods must return an object with addColorStop, as a real canvas does.
      const gradient = () => ({ addColorStop() {} });
      return new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient' ? gradient : function () {})),
        set: (t, k, v) => { t[k] = v; return true; },
      });
    },
    closest() { return null; },
    querySelectorAll() { return []; },
  };
}

test('browser scripts run for many frames without throwing', () => {
  const root = path.join(__dirname, '..');
  const ids = ['game', 'hud', 'shop', 'title', 'gameover', 'shop-coins', 'shop-upgrades', 'shop-weapons',
    'next-wave-btn', 'start-btn', 'start-coop-btn', 'start-pvp-btn', 'retry-btn', 'final-score', 'final-wave', 'final-best', 'shop-tabs', 'gameover-title', 'final-score-label', 'final-wave-label', 'final-best-label', 'select', 'select-slots', 'select-grid', 'select-status', 'select-start', 'select-back', 'howto', 'howto-btn', 'howto-back', 'bg-choices', 'bg-random', 'base-back-btn', 'pause', 'pause-resume-btn', 'pause-menu-btn', 'shop-armour', 'track-btn'];
  const els = {};
  for (const id of ids) els[id] = makeEl(id);
  const store = {};
  let frameCb = null;
  const sandbox = {
    document: { getElementById: (id) => els[id] },
    window: null,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    requestAnimationFrame: (cb) => { frameCb = cb; return 1; },
    Image: function () { this.complete = true; this.naturalWidth = 64; this.naturalHeight = 64; },
    Audio: function (file) { this.file = file; this.volume = 1; this.play = () => { sandbox.played.push(file); return Promise.resolve(); }; this.pause = () => {}; },
    played: [],
    drawCalls: 0,
    console,
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = () => {};
  const ctx = vm.createContext(sandbox);
  for (const f of ['js/config.js', 'js/audio.js', 'js/base.js', 'js/game.js', 'js/render.js', 'js/main.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  assert.ok(frameCb, 'a frame should be scheduled');
  let now = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { now += 16; frameCb(now); } };
  const click = (el) => (el.listeners.click || []).forEach((fn) => fn({ target: el }));

  step(30);
  click(els['start-btn']);
  step(5);
  assert.equal(els['select'].classList.contains('hidden'), false, 'character select should open after a mode is picked');
  assert.equal(els['select-start'].disabled, true, 'START should be disabled until a character is chosen');
  click(findCard(els, 'pick:knight'));
  assert.equal(els['select-start'].disabled, false, 'START should enable after a character is chosen');
  click(els['select-start']);
  step(600);
  // The fight is random, so the player may already be down; the HUD then reads DOWN or the match has ended.
  const hudText = els['hud'].textContent;
  const alive = hudText.indexOf('HP ') !== -1;
  const down = hudText.indexOf('DOWN') !== -1;
  const ended = els['gameover'].classList.contains('hidden') === false;
  assert.ok(alive || down || ended, 'HUD should show health, a downed player, or the game over screen');
  assert.ok(sandbox.played.some((f) => f.indexOf('assets/sounds/') === 0), 'sound effects should play during a fight');
  assert.ok(sandbox.played.some((f) => f.indexOf('space_adventure_music') !== -1), 'music should start on START');
  assert.equal(typeof sandbox.Game, 'object');
});

test('PvP versus starts a match and shows both players', () => {
  const root = path.join(__dirname, '..');
  const ids = ['game', 'hud', 'shop', 'title', 'gameover', 'shop-coins', 'shop-upgrades', 'shop-weapons', 'shop-tabs',
    'next-wave-btn', 'start-btn', 'start-coop-btn', 'start-pvp-btn', 'retry-btn', 'final-score', 'final-wave', 'final-best',
    'gameover-title', 'final-score-label', 'final-wave-label', 'final-best-label', 'select', 'select-slots', 'select-grid', 'select-status', 'select-start', 'select-back', 'howto', 'howto-btn', 'howto-back', 'bg-choices', 'bg-random', 'base-back-btn', 'pause', 'pause-resume-btn', 'pause-menu-btn', 'shop-armour', 'track-btn'];
  const els = {};
  for (const id of ids) els[id] = makeEl(id);
  const store = {};
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
  sandbox.addEventListener = () => {};
  const ctx = vm.createContext(sandbox);
  for (const f of ['js/config.js', 'js/audio.js', 'js/base.js', 'js/game.js', 'js/render.js', 'js/main.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  let now = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { now += 16; frameCb(now); } };
  const click = (el) => (el.listeners.click || []).forEach((fn) => fn({ target: el }));

  step(5);
  click(els['start-pvp-btn']);
  step(5);
  click(findCard(els, 'pick:knight'));
  click(findCard(els, 'pick:bolt'));
  click(els['select-start']);
  step(5);
  assert.equal(els['select'].classList.contains('hidden'), true, 'select should close once the match starts');
  assert.ok(els['hud'].textContent.indexOf('P2') !== -1, 'PvP HUD should show both players');
  assert.ok(els['hud'].textContent.indexOf('Round 1') !== -1, 'HUD should show round 1');
  step(120);
  assert.ok(els['hud'].textContent.indexOf('First to 3') !== -1, 'HUD should show the match target');
});

test('2 player co-op runs through the browser code', () => {
  const root = path.join(__dirname, '..');
  const ids = ['game', 'hud', 'shop', 'title', 'gameover', 'shop-coins', 'shop-upgrades', 'shop-weapons', 'shop-tabs',
    'next-wave-btn', 'start-btn', 'start-coop-btn', 'start-pvp-btn', 'retry-btn', 'final-score', 'final-wave', 'final-best', 'shop-tabs', 'gameover-title', 'final-score-label', 'final-wave-label', 'final-best-label', 'select', 'select-slots', 'select-grid', 'select-status', 'select-start', 'select-back', 'howto', 'howto-btn', 'howto-back', 'bg-choices', 'bg-random', 'base-back-btn', 'pause', 'pause-resume-btn', 'pause-menu-btn', 'shop-armour', 'track-btn'];
  const els = {};
  for (const id of ids) els[id] = makeEl(id);
  const store = {};
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
  sandbox.addEventListener = () => {};
  const ctx = vm.createContext(sandbox);
  for (const f of ['js/config.js', 'js/audio.js', 'js/base.js', 'js/game.js', 'js/render.js', 'js/main.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  let now = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { now += 16; frameCb(now); } };
  const click = (el) => (el.listeners.click || []).forEach((fn) => fn({ target: el }));

  step(5);
  click(els['start-coop-btn']);
  step(5);
  click(findCard(els, 'pick:knight'));
  click(findCard(els, 'pick:frog'));
  click(els['select-start']);
  step(5);
  assert.ok(els['hud'].textContent.indexOf('P2') !== -1, 'co-op HUD should show P2');
  step(600);
  assert.ok(els['hud'].textContent.indexOf('P1:') !== -1, 'HUD should show P1');
  assert.ok(els['hud'].textContent.indexOf('P2:') !== -1, 'HUD should show P2');
});
