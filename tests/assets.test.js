const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CFG = require('../js/config.js');

const root = path.join(__dirname, '..');

test('every image in CONFIG.assets exists on disk', () => {
  for (const [name, rel] of Object.entries(CFG.assets)) {
    assert.ok(fs.existsSync(path.join(root, rel)), name + ' missing: ' + rel);
  }
});

test('every sound file referenced by audio.js exists on disk', () => {
  const src = fs.readFileSync(path.join(root, 'js/audio.js'), 'utf8');
  const files = src.match(/assets\/sounds\/[\w.-]+\.mp3/g) || [];
  assert.ok(files.length >= 10, 'expected sound references in audio.js');
  for (const rel of new Set(files)) {
    assert.ok(fs.existsSync(path.join(root, rel)), 'missing sound: ' + rel);
  }
});

test('enemy and pickup sprite references point at real CONFIG.assets keys', () => {
  for (const def of Object.values(CFG.enemies)) {
    if (def.sprite) assert.ok(CFG.assets[def.sprite.image], 'bad enemy sprite key: ' + def.sprite.image);
  }
  const coin = CFG.pickups.ammoSprite;
  assert.ok(CFG.assets[coin.image], 'bad pickup sprite key: ' + coin.image);
});

test('the knife weapon uses the knife image asset', () => {
  const knife = CFG.weapons.knife;
  assert.equal(knife.image, 'knife');
  assert.ok(CFG.assets[knife.image], 'knife image key must exist in CONFIG.assets');
  assert.ok(knife.scale > 0 && knife.scale < 0.3, 'knife scale should keep it small in the hand');
});

test('background keys point at real CONFIG.assets keys', () => {
  assert.ok(CFG.assets[CFG.backgrounds.fight]);
  assert.ok(CFG.assets[CFG.backgrounds.shop]);
});
