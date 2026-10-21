// Browser entry point: input, screens, HUD, and the game loop.
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const shopEl = document.getElementById('shop');
  const titleEl = document.getElementById('title');
  const overEl = document.getElementById('gameover');
  const selectEl = document.getElementById('select');
  const W = CONFIG.world.width;
  const H = CONFIG.world.height;
  const BEST_KEY = 'survivalArena.best';

  canvas.width = W;
  canvas.height = H;

  const assets = {};
  for (const name of Object.keys(CONFIG.assets)) {
    const img = new Image();
    img.src = CONFIG.assets[name];
    assets[name] = img;
  }

  const keys = {};
  const mouse = { x: W / 2, y: H / 2, down: false };
  let run = null;
  let playerCount = 1;
  let gameMode = 'solo';
  // Character select state: which mode is being set up, each player's pick, and which slot is active.
  let selectMode = 'solo';
  let selectPicks = [null, null];
  let selectActive = 0;
  let screen = 'title';
  let paused = false;
  let last = 0;
  let time = 0;
  let bestScore = Number(localStorage.getItem(BEST_KEY) || 0);
  // Which player the shop is buying for (Player 2 has its own panel in co-op).
  let shopPlayer = 0;

  // Player 2 controls: arrows move, Right Shift fires, Right Ctrl interacts, Numpad 0 switches weapons.
  const P2_KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'ShiftRight', interact: 'ControlRight', cycle: 'Numpad0' };

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'KeyM') Sound.toggleMute();
    if (!document.getElementById('howto').classList.contains('hidden')) {
      if (e.code === 'Escape' || e.code === 'Enter') document.getElementById('howto').classList.add('hidden');
      return;
    }
    if (screen === 'title' && (e.code === 'Enter' || e.code === 'Space')) startGame('solo');
    else if (screen === 'over' && (e.code === 'Enter' || e.code === 'Space')) startGame(gameMode);
    else if (screen === 'select' && e.code === 'Enter') {
      const slotCount = selectMode === 'solo' ? 1 : 2;
      const picks = selectPicks.slice(0, slotCount);
      if (picks.every(function (x) { return x !== null; })) startMatch(selectMode, picks);
    }
    else if (screen === 'select' && e.code === 'Escape') {
      selectEl.classList.add('hidden');
      titleEl.classList.remove('hidden');
      screen = 'title';
    }
    else if (screen === 'playing') {
      if (e.code === 'KeyP' || e.code === 'Escape') paused = !paused;
      if (e.code === 'KeyE') Game.interact(run, run.players[0]);
      if (playerCount === 2 && e.code === P2_KEYS.interact) Game.interact(run, run.players[1]);
      const digit = Number(e.key);
      if (digit >= 1 && digit <= 9) cycleTo(run.players[0], digit - 1);
      if (playerCount === 2 && e.code === P2_KEYS.cycle) cycleWeapon(run.players[1]);
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) !== -1) e.preventDefault();
  });

  function cycleTo(p, index) {
    const owned = Object.keys(p.owned);
    if (owned[index]) Game.equipWeapon(run, owned[index], p);
  }

  function cycleWeapon(p) {
    const owned = Object.keys(p.owned);
    const next = owned[(owned.indexOf(p.weapon) + 1) % owned.length];
    Game.equipWeapon(run, next, p);
  }
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });

  canvas.addEventListener('mousemove', function (e) {
    const p = toCanvas(e);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  canvas.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    mouse.down = true;
    const p = toCanvas(e);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  window.addEventListener('mouseup', function () { mouse.down = false; });

  // Player 1: WASD + mouse aim + Space/click fire + E interact.
  function readP1() {
    let moveX = 0;
    let moveY = 0;
    if (keys.KeyA) moveX -= 1;
    if (keys.KeyD) moveX += 1;
    if (keys.KeyW) moveY -= 1;
    if (keys.KeyS) moveY += 1;
    const firing = mouse.down || !!keys.Space;
    return { moveX: moveX, moveY: moveY, firing: firing, aimX: mouse.x, aimY: mouse.y, interact: false };
  }

  // Player 2: arrows + Right Shift fire, auto-aims at the nearest enemy.
  function readP2(p) {
    let moveX = 0;
    let moveY = 0;
    if (keys[P2_KEYS.left]) moveX -= 1;
    if (keys[P2_KEYS.right]) moveX += 1;
    if (keys[P2_KEYS.up]) moveY -= 1;
    if (keys[P2_KEYS.down]) moveY += 1;
    const target = nearestEnemy(p);
    return {
      moveX: moveX,
      moveY: moveY,
      firing: !!keys[P2_KEYS.fire] && !!target,
      aimX: target ? target.x : p.x + p.facing * 100,
      aimY: target ? target.y : p.y,
      interact: false,
    };
  }

  // Auto-aim target: nearest enemy in co-op/solo, or the rival player in PvP.
  function nearestEnemy(p) {
    let best = null;
    let bestDist = Infinity;
    const targets = run.mode === 'pvp'
      ? run.players.filter((other) => other !== p && !other.down)
      : run.enemies;
    for (const e of targets) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  // Keyboard-held interact keys are one-shot, so E/Right Ctrl only fire on keydown.
  function readInputs() {
    const list = [readP1()];
    if (playerCount === 2) list.push(readP2(run.players[1]));
    return list;
  }

  // Opens the character select screen for a mode. Nothing starts until START is pressed there.
  function openSelect(mode) {
    selectMode = mode;
    selectPicks = [null, null];
    selectActive = 0;
    titleEl.classList.add('hidden');
    overEl.classList.add('hidden');
    selectEl.classList.remove('hidden');
    screen = 'select';
    renderSelect();
  }

  // Starts a match with the chosen characters. The first wave begins right away so players can move.
  function startMatch(mode, picks) {
    playerCount = mode === 'solo' ? 1 : 2;
    gameMode = mode;
    run = Game.createRun(null, mode, picks);
    shopPlayer = 0;
    paused = false;
    screen = 'playing';
    selectEl.classList.add('hidden');
    titleEl.classList.add('hidden');
    overEl.classList.add('hidden');
    Sound.playMusic();
    Sound.play('confirm');
    Game.startNextWave(run);
    hideShop();
  }

  function startGame(mode) {
    openSelect(mode);
  }

  // Draws a character's first walking frame from its sheet onto a small canvas.
  function drawCharacterPreview(canvasEl, assetKey) {
    const img = assets[assetKey];
    const c2d = canvasEl.getContext('2d');
    c2d.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if (!img || !img.naturalWidth) return;
    c2d.imageSmoothingEnabled = false;
    c2d.drawImage(img, 0, 0, 64, 64, 0, 0, canvasEl.width, canvasEl.height);
  }

  function renderSelect() {
    const slotCount = selectMode === 'solo' ? 1 : 2;
    const slotsEl = document.getElementById('select-slots');
    const gridEl = document.getElementById('select-grid');
    const statusEl = document.getElementById('select-status');
    const startBtn = document.getElementById('select-start');

    let slots = '';
    for (let i = 0; i < slotCount; i++) {
      const pick = selectPicks[i];
      const label = pick ? CONFIG.characters.find((c) => c.id === pick).name : 'Empty';
      const cls = 'slot' + (i === selectActive ? ' active' : '') + (pick ? ' filled' : '');
      slots += '<button class="' + cls + '" data-action="slot:' + i + '">P' + (i + 1) + ': ' + label + '</button>';
    }
    slotsEl.innerHTML = slots;

    gridEl.innerHTML = CONFIG.characters.map(function (c) {
      const takenBy = selectPicks.indexOf(c.id);
      const chosen = takenBy !== -1;
      const badge = chosen ? 'P' + (takenBy + 1) : '';
      const disabled = chosen && takenBy !== selectActive;
      return '<button class="char-card' + (chosen ? ' chosen' : '') + '" data-action="pick:' + c.id + '"' +
        (disabled ? ' disabled' : '') + '>' +
        '<canvas width="72" height="72" data-asset="' + c.asset + '"></canvas>' +
        '<span class="name">' + c.name + '</span>' +
        '<span class="badge">' + badge + '</span></button>';
    }).join('');
    gridEl.querySelectorAll('canvas').forEach(function (cv) {
      drawCharacterPreview(cv, cv.getAttribute('data-asset'));
    });

    const ready = selectPicks.slice(0, slotCount).every(function (x) { return x !== null; });
    startBtn.disabled = !ready;
    statusEl.textContent = ready
      ? 'Ready! Press START.'
      : 'Click a character to fill ' + (slotCount === 1 ? 'your slot' : 'the highlighted slot') + '.';
  }

  selectEl.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    const parts = btn.getAttribute('data-action').split(':');
    const kind = parts[0];
    const id = parts[1];
    const slotCount = selectMode === 'solo' ? 1 : 2;
    if (kind === 'slot') {
      selectActive = Number(id);
    } else if (kind === 'pick') {
      // A character can only be used by one player: take it from its old slot first.
      const old = selectPicks.indexOf(id);
      if (old !== -1) selectPicks[old] = null;
      selectPicks[selectActive] = id;
      // Move the cursor to the next empty slot, if there is one.
      for (let i = 0; i < slotCount; i++) {
        const next = (selectActive + 1 + i) % slotCount;
        if (selectPicks[next] === null) {
          selectActive = next;
          break;
        }
      }
    }
    renderSelect();
  });

  document.getElementById('select-back').addEventListener('click', function () {
    selectEl.classList.add('hidden');
    titleEl.classList.remove('hidden');
    screen = 'title';
  });

  document.getElementById('select-start').addEventListener('click', function () {
    const slotCount = selectMode === 'solo' ? 1 : 2;
    const picks = selectPicks.slice(0, slotCount);
    if (picks.some(function (x) { return x === null; })) return;
    startMatch(selectMode, picks);
  });

  function endGame() {
    screen = 'over';
    const title = document.getElementById('gameover-title');
    if (run.mode === 'pvp') {
      title.textContent = run.matchWinner ? run.matchWinner + ' WINS!' : 'MATCH OVER';
      document.getElementById('final-score').textContent = run.players.map((p) => p.name + ' ' + p.roundWins).join(' - ');
      document.getElementById('final-wave').textContent = String(run.round || 0);
      document.getElementById('final-best').textContent = '-';
      document.getElementById('final-best-label').textContent = 'Rounds played';
      document.getElementById('final-wave-label').textContent = 'Rounds';
      document.getElementById('final-score-label').textContent = 'Round wins';
    } else {
      title.textContent = 'GAME OVER';
      document.getElementById('final-score-label').textContent = 'Score';
      document.getElementById('final-wave-label').textContent = 'Wave';
      document.getElementById('final-best-label').textContent = 'Best';
      const score = Math.floor(run.score);
      if (score > bestScore) {
        bestScore = score;
        localStorage.setItem(BEST_KEY, String(bestScore));
      }
      document.getElementById('final-score').textContent = String(score);
      document.getElementById('final-wave').textContent = String(run.wave);
      document.getElementById('final-best').textContent = String(bestScore);
    }
    overEl.classList.remove('hidden');
    hideShop();
    Sound.stopMusic();
    Sound.play('back');
  }

  function shopButton(label, cost, action, disabled, note) {
    const cls = disabled ? 'shop-item disabled' : 'shop-item';
    return '<button class="' + cls + '" data-action="' + action + '"' + (disabled ? ' disabled' : '') + '>' +
      '<span class="name">' + label + '</span>' +
      '<span class="cost">' + (note || cost + ' coins') + '</span></button>';
  }

  function renderShop() {
    const p = run.players[shopPlayer];
    const tabs = run.players.map(function (pl, i) {
      const cls = i === shopPlayer ? 'shop-tab active' : 'shop-tab';
      return '<button class="' + cls + '" data-action="tab:' + i + '">' + pl.name + '</button>';
    }).join('');
    document.getElementById('shop-tabs').innerHTML = run.players.length > 1 ? tabs : '';
    let upgrades = '';
    for (const u of CONFIG.shop.upgrades) {
      const level = p.upgrades[u.id];
      const maxed = level >= u.max;
      const cost = Game.upgradeCost(u, level);
      const note = maxed ? 'MAX' : cost + ' coins (lv ' + level + '/' + u.max + ')';
      upgrades += shopButton(u.name, cost, 'upgrade:' + u.id, maxed || Game.walletOf(run, p).coins < cost, note);
    }
    let weapons = '';
    for (const w of CONFIG.shop.weapons) {
      const def = CONFIG.weapons[w.id];
      if (p.owned[w.id]) {
        weapons += shopButton(def.name, 0, 'equip:' + w.id, false, p.weapon === w.id ? 'EQUIPPED' : 'OWNED - equip');
      } else {
        weapons += shopButton(def.name, w.cost, 'weapon:' + w.id, Game.walletOf(run, p).coins < w.cost);
      }
    }
    const wallet = Game.walletOf(run, p);
    document.getElementById('shop-coins').textContent = String(wallet.coins);
    document.getElementById('next-wave-btn').textContent = run.mode === 'pvp' ? 'NEXT ROUND' : 'NEXT WAVE';
    document.getElementById('shop-upgrades').innerHTML = upgrades;
    document.getElementById('shop-weapons').innerHTML = weapons;
  }

  function openShop() {
    screen = 'playing';
    if (run.phase !== 'over') run.phase = 'shop';
    renderShop();
    shopEl.classList.remove('hidden');
  }

  function hideShop() {
    shopEl.classList.add('hidden');
  }

  function flash(result) {
    if (!result.ok) run.message = result.reason;
    else run.message = 'Bought for ' + result.cost + ' coins';
    run.messageTime = 1.5;
  }

  shopEl.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    const parts = btn.getAttribute('data-action').split(':');
    const kind = parts[0];
    const id = parts[1];
    const p = run.players[shopPlayer];
    if (kind === 'tab') shopPlayer = Number(id);
    else if (kind === 'upgrade') flash(Game.buyUpgrade(run, id, p));
    else if (kind === 'weapon') flash(Game.buyWeapon(run, id, p));
    else if (kind === 'equip') Game.equipWeapon(run, id, p);
    renderShop();
  });

  document.getElementById('next-wave-btn').addEventListener('click', function () {
    if (run.mode === 'pvp') Game.startVersusRound(run);
    else Game.startNextWave(run);
    hideShop();
  });
  document.getElementById('start-btn').addEventListener('click', function () { startGame('solo'); });
  document.getElementById('start-coop-btn').addEventListener('click', function () { startGame('coop'); });
  document.getElementById('start-pvp-btn').addEventListener('click', function () { startGame('pvp'); });

  // How to play: a panel on top of the title screen. Escape or BACK returns to the title.
  const howtoEl = document.getElementById('howto');
  function openHowTo() {
    howtoEl.classList.remove('hidden');
  }
  function closeHowTo() {
    howtoEl.classList.add('hidden');
  }
  document.getElementById('howto-btn').addEventListener('click', openHowTo);
  document.getElementById('howto-back').addEventListener('click', closeHowTo);
  document.getElementById('retry-btn').addEventListener('click', function () { startGame(gameMode); });

  function drawBackground() {
    const bgName = run && run.phase === 'shop' ? CONFIG.backgrounds.shop : CONFIG.backgrounds.fight;
    const bg = assets[bgName];
    if (bg && bg.naturalWidth) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, 0, W, H);
      ctx.fillStyle = 'rgba(7, 11, 22, 0.25)';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    ctx.fillStyle = '#14213d';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  function playerHudText(p) {
    const def = CONFIG.weapons[p.weapon];
    const ammo = def.melee ? '-' : (CONFIG.infiniteAmmo ? '∞' : p.ammo[p.weapon]);
    const hp = p.down ? 'DOWN' : 'HP ' + p.health + '/' + p.maxHealth;
    const coins = run.mode === 'pvp' ? '  Coins ' + p.coins : '';
    return p.name + ': ' + hp + '  ' + def.name + ' ' + ammo + coins;
  }

  function updateHud() {
    const parts = run.players.map(playerHudText);
    if (run.mode === 'pvp') {
      const wins = run.players.map((p) => p.roundWins).join(' - ');
      hud.textContent = parts.join('   |   ') + '   |   Round ' + (run.round || 1) +
        '   Wins ' + wins + '   First to ' + CONFIG.versus.roundsToWin;
      return;
    }
    hud.textContent = parts.join('   |   ') + '   |   Wave ' + run.wave +
      '   Score ' + Math.floor(run.score) + '   Coins ' + run.coins + '   Best ' + bestScore;
  }

  function drawMessage() {
    if (run.messageTime <= 0 || !run.message) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, run.messageTime);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(run.message, W / 2, 90);
    ctx.restore();
  }

  function drawPausedLabel() {
    ctx.save();
    ctx.fillStyle = 'rgba(7, 11, 22, 0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 56px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    time += dt;
    if (screen === 'playing' && run && !paused && run.phase === 'fighting') {
      const before = run.phase;
      Game.update(run, dt, readInputs());
      if (run.phase === 'over') endGame();
      else if (before === 'fighting' && (run.phase === 'shop' || run.phase === 'roundover')) openShop();
    }
    if (run && run.messageTime > 0) run.messageTime = Math.max(0, run.messageTime - dt);
    if (run && run.events.length) {
      for (const ev of run.events) Sound.play(ev);
      run.events = [];
    }
    if (run) {
      drawBackground();
      Render.drawPickups(ctx, run, assets, time);
      Render.drawEnemies(ctx, run, assets, time);
      Render.drawProjectiles(ctx, run);
      Render.drawSwings(ctx, run);
      Render.drawPlayers(ctx, run, assets, time);
      drawMessage();
      if (paused) drawPausedLabel();
      updateHud();
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
