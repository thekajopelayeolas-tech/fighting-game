const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

// Loads audio.js in a sandbox with a fake Audio that counts how many elements are created.
function loadAudio() {
  const created = [];
  const sandbox = {
    Audio: function (file) {
      this.file = file;
      this.volume = 1;
      this.currentTime = 0;
      this.play = () => { this.plays = (this.plays || 0) + 1; return Promise.resolve(); };
      this.pause = () => {};
      created.push(this);
    },
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/audio.js'), 'utf8'), sandbox, { filename: 'js/audio.js' });
  return { Sound: sandbox.Sound, created };
}

test('repeated sound plays reuse a small pool instead of creating an Audio per play', () => {
  const { Sound, created } = loadAudio();
  for (let i = 0; i < 200; i++) Sound.play('laser');
  assert.ok(created.length <= 4, 'expected at most 4 audio elements for one sound, got ' + created.length);
  const total = created.reduce((n, el) => n + (el.plays || 0), 0);
  assert.equal(total, 200, 'every play should still start a sound');
});

test('the audio pool does not change muting', () => {
  const { Sound, created } = loadAudio();
  Sound.toggleMute();
  Sound.play('coin');
  assert.equal(created.length, 0, 'a muted game should not create or play sounds');
});

test('the neon halo draws with a wide faint stroke, not shadow blur', () => {
  const render = fs.readFileSync(path.join(root, 'js/render.js'), 'utf8');
  const neonStart = render.indexOf('function neon(');
  const neonBody = render.slice(neonStart, render.indexOf('\n  }', neonStart));
  assert.equal(neonBody.indexOf('shadowBlur'), -1, 'neon should not use shadowBlur');
  assert.ok(neonBody.indexOf('lineWidth = width * 4') !== -1, 'neon should draw a wider halo stroke');
});

test('the HUD only writes its text when the text changes', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const hudStart = main.indexOf('function updateHud(');
  const hudBody = main.slice(hudStart, main.indexOf('\n  }', hudStart));
  assert.ok(hudBody.indexOf('if (text === lastHudText) return;') !== -1, 'HUD should skip unchanged text');
  assert.ok(main.indexOf("lastHudText = '';") !== -1, 'clearing the HUD should reset the cache');
});
