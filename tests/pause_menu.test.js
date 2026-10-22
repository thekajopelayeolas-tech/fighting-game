const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');

test('the pause menu has RESUME and MAIN MENU buttons', () => {
  assert.ok(html.indexOf('id="pause"') !== -1, 'pause overlay');
  assert.ok(html.indexOf('id="pause-resume-btn"') !== -1, 'resume button');
  assert.ok(html.indexOf('id="pause-menu-btn"') !== -1, 'main menu button');
});

test('pausing and resuming go through one function', () => {
  assert.ok(main.indexOf('function setPaused(value)') !== -1);
  assert.ok(main.indexOf("if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);") !== -1,
    'P and Esc should use setPaused');
});

test('MAIN MENU saves the run before leaving, and returns to the title', () => {
  const start = main.indexOf('function goToMainMenu()');
  const body = main.slice(start, main.indexOf('\n  }\n', start));
  assert.ok(body.indexOf('carryRunToSave()') !== -1, 'coins and score must be saved first');
  assert.ok(body.indexOf("screen = 'title'") !== -1, 'screen goes back to the title');
  assert.ok(body.indexOf('titleEl.classList.remove') !== -1, 'the title is shown');
});

test('a new match always starts unpaused', () => {
  const start = main.indexOf('function startMatch(mode, picks)');
  const body = main.slice(start, main.indexOf('\n  }\n', start));
  assert.ok(body.indexOf('setPaused(false)') !== -1);
});

test('the pause overlay is listed in the browser test stubs', () => {
  const smoke = fs.readFileSync(path.join(root, 'tests/smoke.test.js'), 'utf8');
  assert.ok(smoke.indexOf("'pause-menu-btn'") !== -1);
});
