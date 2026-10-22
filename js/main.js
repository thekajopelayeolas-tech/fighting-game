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
  // Counts down to the next footstep sound while a player is walking.
  let footstepTimer = 0;
  // Fight background picked on the title screen. The shop always uses CONFIG.backgrounds.shop.
  let fightBackground = CONFIG.backgrounds.fight;

  // Draws one button per background on the title screen, and marks the one in use.
  function renderBackgroundChoices() {
    const box = document.getElementById('bg-choices');
    box.innerHTML = CONFIG.backgrounds.choices.map(function (c) {
      const cls = 'bg-choice' + (c.asset === fightBackground ? ' selected' : '');
      return '<button class="' + cls + '" data-action="bg:' + c.asset + '">' +
        '<img src="' + CONFIG.assets[c.asset] + '" alt="">' +
        '<span>' + c.name + '</span></button>';
    }).join('');
  }

  document.getElementById('bg-choices').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    fightBackground = btn.getAttribute('data-action').split(':')[1];
    renderBackgroundChoices();
  });

  // RANDOM picks any background from the list, so every choice is reachable.
  document.getElementById('bg-random').addEventListener('click', function () {
    const choices = CONFIG.backgrounds.choices;
    fightBackground = choices[Math.floor(Math.random() * choices.length)].asset;
    renderBackgroundChoices();
  });

  renderBackgroundChoices();

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
      if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
      if (e.code === 'KeyE' && run.inBase) useBaseSpot(run.players[0]);
      else if (e.code === 'KeyE') Game.interact(run, run.players[0]);
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
  // If the window loses focus (Cmd+Tab, a system dialog), keyup never arrives.
  // Clear everything so no key or the mouse button stays stuck down.
  window.addEventListener('blur', function () {
    for (const code of Object.keys(keys)) keys[code] = false;
    mouse.down = false;
  });

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

  // Starts a match with the chosen characters. Solo players begin in the base; co-op and PvP start the fight.
  function startMatch(mode, picks) {
    playerCount = mode === 'solo' ? 1 : 2;
    gameMode = mode;
    run = Game.createRun(null, mode, picks);
    shopPlayer = 0;
    setPaused(false);
    screen = 'playing';
    selectEl.classList.add('hidden');
    titleEl.classList.add('hidden');
    overEl.classList.add('hidden');
    Sound.playMusic();
    Sound.play('confirm');
    // The saved colour glows on the player 1 character.
    applyGlow(run.players[0]);
    // Solo runs continue with the coins, weapons and upgrades carried in the save.
    if (mode === 'solo') {
      run.coins = save.coins || 0;
      restoreLoadout(run.players[0]);
    }
    if (mode === 'solo') {
      Game.startBase(run);
      hideShop();
      return;
    }
    Game.startNextWave(run);
    hideShop();
  }

  // Saved progress: dust, owned colours, and the chosen colour. Stored in the browser.
  const SAVE_KEY = 'survivalArena.save';
  let save = loadSave();

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return Object.assign(Base.newSave(), JSON.parse(raw));
    } catch (err) {
      // A damaged save starts a fresh one instead of breaking the game.
    }
    return Base.newSave();
  }

  function writeSave() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }

  // Pressing E in the base uses whatever the player is standing at: the portal, a station, or nothing.
  function useBaseSpot(p) {
    const B = CONFIG.base;
    if (Base.nearPortal(p)) {
      enterPortal();
      return;
    }
    if (Base.nearPoint(p, B.shop)) {
      openBaseShop();
      return;
    }
    if (Base.nearPoint(p, B.colorStation)) {
      openColorPanel();
      return;
    }
    if (Base.nearPoint(p, B.dustMachine)) {
      openDustPanel();
    }
  }

  // The base shop: the same weapons and upgrades as the arena, spent from the saved coins.
  function openBaseShop() {
    shopPlayer = 0;
    renderShop();
    shopEl.classList.remove('hidden');
    // NEXT WAVE in the base leaves the shop and goes back to the base floor, not into a fight.
    document.getElementById('next-wave-btn').textContent = 'BACK TO BASE';
    baseShopOpen = true;
  }

  let baseShopOpen = false;

  // Shows the colour panel: the colours you own, and what it costs to buy the rest.
  function openColorPanel() {
    basePanel('COLOUR', renderColorPanel);
  }

  // Shows the dust machine: the rainbow colour, and your dust balance.
  function openDustPanel() {
    basePanel('DUST', renderDustPanel);
  }

  // Shared base panel: one overlay with a title, body, and close button.
  function basePanel(title, render) {
    const el = document.getElementById('base-panel');
    el.classList.remove('hidden');
    document.getElementById('base-panel-title').textContent = title;
    render();
    document.getElementById('base-panel-close').onclick = function () { el.classList.add('hidden'); };
    document.getElementById('base-panel-body').onclick = basePanelClick;
  }

  // Lists the ten dust colours. Owned colours show EQUIP, the one in use shows EQUIPPED.
  function renderColorPanel() {
    const body = document.getElementById('base-panel-body');
    const rows = CONFIG.base.colors.map(function (c) {
      const owned = save.owned.indexOf(c.id) !== -1;
      const equipped = save.color === c.id;
      const label = equipped ? 'EQUIPPED' : owned ? 'EQUIP' : c.cost + ' dust';
      return '<button class="base-row' + (equipped ? ' on' : '') + '" data-action="color:' + c.id + '">' +
        '<span class="swatch" style="background:' + c.hex + '"></span>' +
        '<span class="name">' + c.name + '</span><span class="cost">' + label + '</span></button>';
    }).join('');
    // The rainbow shows here too once it is owned, so it can be equipped like any colour.
    let rainbow = '';
    if (save.owned.indexOf(Base.RAINBOW) !== -1) {
      const equipped = save.color === Base.RAINBOW;
      rainbow = '<button class="base-row' + (equipped ? ' on' : '') + '" data-action="color:' + Base.RAINBOW + '">' +
        '<span class="swatch rainbow"></span><span class="name">Rainbow</span>' +
        '<span class="cost">' + (equipped ? 'EQUIPPED' : 'EQUIP') + '</span></button>';
    }
    body.innerHTML = rows + rainbow + '<p class="hint">Dust: ' + save.dust + '</p>';
  }

  function renderDustPanel() {
    const body = document.getElementById('base-panel-body');
    const rainbowOwned = save.owned.indexOf(Base.RAINBOW) !== -1;
    const label = rainbowOwned ? 'OWNED' : CONFIG.base.rainbowCost + ' dust';
    body.innerHTML =
      '<p>Earn 1 dust for every ' + CONFIG.base.pointsPerDust + ' points in the arena.</p>' +
      '<button class="base-row" data-action="buy:' + Base.RAINBOW + '"' + (rainbowOwned ? ' disabled' : '') + '>' +
      '<span class="swatch rainbow"></span><span class="name">Rainbow</span><span class="cost">' + label + '</span></button>' +
      '<p class="hint">Dust: ' + save.dust + '</p>';
  }

  // One click handler for the base panel: buys a colour, equips one, or buys the rainbow.
  function basePanelClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    const parts = btn.getAttribute('data-action').split(':');
    const kind = parts[0];
    const id = parts[1];
    if (kind === 'color') {
      if (save.owned.indexOf(id) === -1) {
        const result = Base.buyColor(save, id);
        if (!result.ok) { say(result.reason); return; }
      }
      Base.equipColor(save, id);
      writeSave();
      // Apply the new colour to the player straight away, so it shows in the base.
      applyGlow(run.players[0]);
      renderColorPanel();
    } else if (kind === 'buy') {
      const result = Base.buyColor(save, id);
      say(result.ok ? 'Bought the Rainbow!' : result.reason);
      writeSave();
      renderDustPanel();
    }
  }

  function say(text) {
    if (run) {
      run.message = text;
      run.messageTime = 1.5;
    }
  }

  // Sets the player's glow from the saved colour. Red is the default, so it shows no halo.
  function applyGlow(p) {
    const id = save.color;
    if (!p || id === 'red' || !id) {
      p.glow = null;
      return;
    }
    if (id === Base.RAINBOW) {
      p.glow = 'rainbow';
      p.glowHex = null;
      return;
    }
    const def = Base.findColor(id);
    p.glow = 'colour';
    p.glowHex = def ? def.hex : null;
  }

  // Walking into the portal and pressing E sends the player from the base into the real arena.
  // enterArena starts the first wave itself, so this only has to switch the screen state.
  function enterPortal() {
    Game.enterArena(run);
    hideShop();
    Sound.play('next');
  }

  // Writes the run's coins and score into the save, so they carry to the base and the next run.
  // The base run is still a solo run (its mode is 'base' only while the hub is open), so both count.
  function carryRunToSave() {
    if (!run || (run.mode !== 'solo' && run.mode !== 'base')) return;
    Base.carryRun(save, run.coins || 0, run.score || 0);
    // Weapons and upgrades bought in the base or the arena are kept too.
    Base.carryLoadout(save, run.players[0]);
    writeSave();
  }

  // Every weapon id the game knows, so a saved loadout can only ever grant real weapons.
  const WEAPON_IDS = Object.keys(CONFIG.weapons);

  // Puts the saved weapons, ammo, equipped weapon and upgrades onto a new solo player.
  // Upgrades reapply their stat changes through the same rules the shop uses.
  function restoreLoadout(p) {
    const l = Base.loadoutFor(save);
    if (!l) return;
    p.owned = { gun: true };
    for (const id of l.owned) {
      if (WEAPON_IDS.indexOf(id) !== -1) p.owned[id] = true;
    }
    if (!p.owned[l.weapon]) l.weapon = 'gun';
    p.weapon = l.weapon;
    p.ammo = Object.assign({ gun: CONFIG.weapons.gun.ammo }, l.ammo);
    for (const key of Object.keys(p.upgrades)) {
      p.upgrades[key] = Math.max(0, Math.floor(Number(l.upgrades[key]) || 0));
    }
    p.maxHealth = CONFIG.player.maxHealth + p.upgrades.maxHealth;
    p.health = p.maxHealth;
    // Armour: each piece is -1 (not bought) or a tier level 0 to 5. Anything else is ignored.
    const top = CONFIG.armour.tiers.length - 1;
    p.armour = { helmet: -1, chestplate: -1, leggings: -1, boots: -1 };
    const saved = l.armour || {};
    for (const piece of CONFIG.armour.pieces) {
      const level = Math.floor(Number(saved[piece.id]));
      if (!isNaN(level) && level >= -1 && level <= top) p.armour[piece.id] = level;
    }
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
      // Dust comes from the arena score: 1 dust per pointsPerDust points.
      const dustGained = Base.addRunDust(save, score);
      // Coins and score carry over to the base and the next run.
      carryRunToSave();
      if (dustGained > 0) say('+' + dustGained + ' dust');
      document.getElementById('final-score').textContent = String(score);
      // Only a solo run has a base to return to, so only solo shows BACK TO BASE.
      const backBtn = document.getElementById('base-back-btn');
      if (gameMode === 'solo') backBtn.classList.remove('hidden');
      else backBtn.classList.add('hidden');
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
    document.getElementById('shop-armour').innerHTML = armourRows(p, wallet);
  }

  // One row per armour piece. Unbought pieces show their price; owned ones show their tier and next upgrade.
  function armourRows(p, wallet) {
    p.armour = p.armour || { helmet: -1, chestplate: -1, leggings: -1, boots: -1 };
    let rows = '';
    for (const piece of CONFIG.armour.pieces) {
      const level = p.armour[piece.id];
      if (level < 0) {
        rows += shopButton(piece.name, piece.cost, 'armour-buy:' + piece.id, wallet.coins < piece.cost);
        continue;
      }
      const tier = CONFIG.armour.tiers[level];
      const next = Base.armourUpgradeCost(level);
      const label = next === null ? tier.name + ' (MAX)' : tier.name + ' - upgrade ' + next + ' coins';
      rows += shopButton(piece.name, next || 0, 'armour-up:' + piece.id, next === null || wallet.coins < next, label);
    }
    return rows;
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
    else if (result.tier) run.message = 'Upgraded to ' + result.tier + ' for ' + result.cost + ' coins';
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
    else if (kind === 'armour-buy') flash(Game.buyArmour(run, id, p));
    else if (kind === 'armour-up') flash(Game.upgradeArmour(run, id, p));
    // Keep the saved coins up to date after every purchase, so nothing is lost if the page closes.
    if (baseShopOpen) carryRunToSave();
    renderShop();
  });

  document.getElementById('next-wave-btn').addEventListener('click', function () {
    // In the base, the button leaves the shop and returns to the base floor. It never starts a fight.
    if (baseShopOpen) {
      baseShopOpen = false;
      carryRunToSave();
      document.getElementById('next-wave-btn').textContent = run.mode === 'pvp' ? 'NEXT ROUND' : 'NEXT WAVE';
      hideShop();
      return;
    }
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
  // BACK TO BASE: a new solo run in the base, with the same character and the saved dust and colours.
  document.getElementById('base-back-btn').addEventListener('click', function () {
    const picks = [run.players[0].character];
    overEl.classList.add('hidden');
    startMatch('solo', picks);
  });

  // The base uses the frost backdrop with a dark floor, so the stations read clearly.
  function drawBaseBackground() {
    const bg = assets[CONFIG.backgrounds.shop];
    if (bg && bg.naturalWidth) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#14213d';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = 'rgba(7, 11, 22, 0.35)';
    ctx.fillRect(0, 0, W, H);
  }

  function drawBackground() {
    const bgName = run && run.phase === 'shop' ? CONFIG.backgrounds.shop : fightBackground;
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

  // One place that pauses and resumes: it sets the flag and shows or hides the pause menu together.
  function setPaused(value) {
    paused = value;
    const el = document.getElementById('pause');
    if (paused && screen === 'playing') el.classList.remove('hidden');
    else el.classList.add('hidden');
  }

  // RESUME: back to the game. Same as pressing P or Esc again.
  document.getElementById('pause-resume-btn').addEventListener('click', function () {
    setPaused(false);
  });

  // MAIN MENU: leave the current run and go to the title screen. Coins and score are saved first,
  // so nothing earned in this run is lost. Dust and colours are already in the save.
  document.getElementById('pause-menu-btn').addEventListener('click', function () {
    goToMainMenu();
  });

  function goToMainMenu() {
    carryRunToSave();
    setPaused(false);
    run = null;
    screen = 'title';
    hideShop();
    overEl.classList.add('hidden');
    selectEl.classList.add('hidden');
    document.getElementById('base-panel').classList.add('hidden');
    document.getElementById('base-back-btn').classList.add('hidden');
    baseShopOpen = false;
    titleEl.classList.remove('hidden');
    hud.textContent = '';
    Sound.stopMusic();
  }

  function drawPausedLabel() {
    ctx.save();
    ctx.fillStyle = 'rgba(7, 11, 22, 0.6)';
    ctx.fillRect(0, 0, W, H);
    // The PAUSED title and buttons are the HTML pause menu, drawn on top of this dim.
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    time += dt;
    if (screen === 'playing' && run && !paused && run.phase === 'base') {
      Game.update(run, dt, readInputs());
    } else if (screen === 'playing' && run && !paused && run.phase === 'fighting') {
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
    // Footsteps: one soft step every ~0.4s while a living player is walking in a fight.
    if (run && screen === 'playing' && !paused && run.phase === 'fighting') {
      footstepTimer -= dt;
      const walking = run.players.some(function (p) { return !p.down && p.moving; });
      if (walking && footstepTimer <= 0) {
        Sound.play('footstep');
        footstepTimer = 0.4;
      }
    }
    if (run) {
      // Screen shake offsets the whole scene; the HUD and messages stay still.
      ctx.save();
      if (run.shake > 0) ctx.translate((Math.random() * 2 - 1) * run.shake, (Math.random() * 2 - 1) * run.shake);
      if (run.phase === 'base') {
        drawBaseBackground();
        Render.drawBase(ctx, run, time);
      } else {
        drawBackground();
      }
      Render.drawPickups(ctx, run, assets, time);
      Render.drawWalls(ctx, run, assets);
      Render.drawEnemies(ctx, run, assets, time);
      Render.drawProjectiles(ctx, run);
      Render.drawSwings(ctx, run);
      Render.drawPlayers(ctx, run, assets, time);
      Render.drawEffects(ctx, run);
      ctx.restore();
      drawMessage();
      if (paused) drawPausedLabel();
      updateHud();
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
