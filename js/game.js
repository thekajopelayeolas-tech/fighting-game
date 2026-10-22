// Pure game logic: no DOM access, so it can be tested with Node.
(function (root) {
  'use strict';

  const CFG = typeof module !== 'undefined' && module.exports ? require('./config.js') : CONFIG;
  // Keeps pickups in the arena a bit away from the top and bottom edges (used by PvP pickups).
  const H_MARGIN = 80;

  function createRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(bx - ax, by - ay);
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function say(state, text, seconds) {
    state.message = text;
    state.messageTime = seconds || 2;
  }

  function isRanged(id) {
    return !CFG.weapons[id].melee;
  }

  function createPlayer(index, mode, character) {
    const W = CFG.world;
    const pvp = mode === 'pvp';
    const maxHealth = pvp ? CFG.versus.maxHealth : CFG.player.maxHealth;
    const x = pvp ? W.width * (index === 0 ? 0.25 : 0.75) : W.width / 2 + (index === 0 ? -40 : 40);
    return {
      index: index,
      name: 'P' + (index + 1),
      character: character || 'knight',
      x: x,
      y: W.height / 2,
      radius: CFG.player.radius,
      health: maxHealth,
      maxHealth: maxHealth,
      down: false,
      facing: 1,
      moving: false,
      aim: 0,
      invuln: 0,
      cooldown: 0,
      // Special ability: a timer that counts down after each use (0 means ready).
      specialCooldown: 0,
      weapon: 'gun',
      owned: { gun: true },
      ammo: { gun: CFG.weapons.gun.ammo },
      upgrades: { maxHealth: 0, damage: 0, speed: 0, ammo: 0 },
      // Armour level per piece: 0 is wood, 5 is netherite.
      armour: { helmet: -1, chestplate: -1, leggings: -1, boots: -1 },
      powerUps: {},
      coins: 0,
      roundWins: 0,
    };
  }

  // mode is 'solo', 'coop' or 'pvp'. The numbers 1 and 2 still work for older callers.
  function normalizeMode(mode) {
    if (mode === 'pvp') return 'pvp';
    if (mode === 'coop' || mode === 2) return 'coop';
    return 'solo';
  }

  // characters: array of character ids, one per player. Missing entries default to the knight.
  function createRun(seed, mode, characters) {
    const m = normalizeMode(mode);
    const count = m === 'solo' ? 1 : 2;
    const picks = characters || [];
    const players = [];
    for (let i = 0; i < count; i++) players.push(createPlayer(i, m, picks[i]));
    return {
      mode: m,
      matchWinner: null,
      rng: createRng(seed == null ? Date.now() : seed),
      time: 0,
      score: 0,
      coins: 0,
      kills: 0,
      wave: 0,
      phase: 'shop', // 'shop' | 'fighting' | 'over'
      message: '',
      messageTime: 0,
      players: players,
      player: players[0], // player 1, used by single-player helpers
      enemies: [],
      projectiles: [],
      pickups: [],
      spawnQueue: [],
      spawnTimer: 0,
      nextId: 1,
      swings: [],
      effects: [],
      walls: [],
      shake: 0,
      events: [],
    };
  }

  function livingPlayers(state) {
    return state.players.filter((p) => !p.down);
  }

  function nearestLiving(state, x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const p of state.players) {
      if (p.down) continue;
      const d = dist(p.x, p.y, x, y);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }

  // Prefix for messages in co-op so players know who did what.
  function labelFor(state, p) {
    return state.players.length > 1 ? p.name + ' ' : '';
  }

  // Stats after upgrades and power-ups.
  function playerStats(p) {
    const hasted = p.powerUps.haste > 0;
    const raging = p.powerUps.rage > 0;
    return {
      damageMult: (1 + 0.15 * p.upgrades.damage) * (raging ? 2 : 1),
      speed: CFG.player.speed * (1 + 0.1 * p.upgrades.speed) * (hasted ? 1.5 : 1),
      cooldownMult: hasted ? 0.5 : 1,
    };
  }

  // Enemy mix by wave. Later waves bring the tougher and faster enemies in, so each wave feels new.
  function pickEnemyType(state) {
    const r = state.rng();
    if (state.wave >= 6 && r < 0.14) return 'armoured';
    if (state.wave >= 4 && r < 0.3) return 'dasher';
    if (state.wave >= 3 && r < 0.45) return 'brute';
    if (state.wave >= 2 && r < 0.65) return 'bat';
    return 'slime';
  }

  // Starts the base hub for a solo player: no enemies, no waves, practice dummies to shoot.
  // The base is not a fight, so the phase is 'base' and update() only moves and shoots.
  function startBase(state) {
    state.mode = 'base';
    state.phase = 'base';
    state.inBase = true;
    state.enemies = [];
    state.spawnQueue = [];
    state.walls = [];
    const p = state.players[0];
    p.x = CFG.base.spawn.x;
    p.y = CFG.base.spawn.y;
    p.down = false;
    p.health = p.maxHealth;
    state.dummies = (typeof Base !== 'undefined' ? Base : require('./base.js')).makeDummies();
  }

  // Shop rooms. Standing on a room's door enters it; standing on its exit leaves.
  // While inside, the base floor is not used: the player is moved to the room's entrance.
  function roomAt(p, x, y, r) {
    return Math.hypot(p.x - x, p.y - y) <= r;
  }

  function enterRoom(state, roomId) {
    const room = CFG.base.rooms[roomId];
    if (!room) return false;
    const p = state.players[0];
    state.room = roomId;
    // Enter at the bottom centre of the room, clear of the exit.
    p.x = room.interior.x + room.interior.w / 2;
    p.y = room.interior.y + room.interior.h - 80;
    return true;
  }

  // Stepping on the exit of the current room returns the player to the base, at that room's door.
  function leaveRoomIfAtExit(state) {
    if (!state.room) return false;
    const room = CFG.base.rooms[state.room];
    const p = state.players[0];
    if (!roomAt(p, room.exit.x, room.exit.y, room.exit.r)) return false;
    p.x = room.door.x;
    p.y = room.door.y + room.door.r + 30;
    state.room = null;
    return true;
  }

  // Shelf positions for a room's items: a grid across the room's interior.
  // Returns [{ item, x, y }] so the renderer and the E key agree on where each item sits.
  function roomShelves(roomId) {
    const room = CFG.base.rooms[roomId];
    if (!room) return [];
    const items = (typeof Base !== 'undefined' ? Base : require('./base.js')).roomItems(roomId);
    const cols = Math.min(4, Math.max(1, items.length));
    const gap = room.interior.w / (cols + 1);
    return items.map(function (item, i) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return { item: item, x: room.interior.x + gap * (col + 1), y: room.interior.y + 150 + row * 170 };
    });
  }

  // The item nearest the player that is within reach, or null.
  function nearestShelfItem(state, p) {
    if (!state.room) return null;
    let best = null;
    let bestDist = 90;
    for (const s of roomShelves(state.room)) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  // Buys (or equips) the item the player is standing next to. Uses the same rules as the arena shop and base panels.
  // dust is the saved dust balance, which lives in the save, not on the run, so the caller passes it in.
  function buyShelfItem(state, p, dust) {
    const shelf = nearestShelfItem(state, p);
    if (!shelf) return { ok: false, reason: 'Stand next to an item' };
    const item = shelf.item;
    const B = typeof Base !== 'undefined' ? Base : require('./base.js');
    const wallets = { coins: state.coins, dust: dust || 0 };
    const afford = B.canAfford(item, wallets);
    if (!afford.ok) return afford;
    if (item.kind === 'weapon') {
      const id = item.key.split(':')[1];
      if (p.owned[id]) return { ok: false, reason: 'Already owned' };
      return buyWeapon(state, id, p);
    }
    if (item.kind === 'armour') {
      return buyArmour(state, item.key.split(':')[1], p);
    }
    // The Super Character is paid in coins from the run. main.js records it in the save.
    if (item.kind === 'character') {
      const id = item.key.split(':')[1];
      state.coins -= item.price;
      return { ok: true, character: id, cost: item.price, coins: true };
    }
    // Colours and the rainbow are paid in dust; the save handles that in main.js.
    return { ok: true, colour: item.key.split(':')[1], cost: item.price, dust: true };
  }

  // Leaves the base and starts the real arena wave, as a normal solo run.
  function enterArena(state) {
    state.mode = 'solo';
    state.inBase = false;
    state.dummies = [];
    state.players[0].x = CFG.world.width / 2;
    state.players[0].y = CFG.world.height / 2;
    startNextWave(state);
  }

  function startNextWave(state) {
    const w = CFG.waves;
    // A PvP match starts here rather than in startVersusRound, so its first round needs walls too.
    if (state.mode === 'pvp') {
      buildWalls(state);
      state.round = (state.round || 0) + 1;
      say(state, 'Round ' + state.round, 2);
      state.phase = 'fighting';
      state.events.push('next');
      return;
    }
    state.wave += 1;
    state.phase = 'fighting';
    // Downed players get back up with 1 HP when a new wave starts.
    for (const p of state.players) {
      if (p.down) {
        p.down = false;
        p.health = 1;
      }
    }
    const count = w.firstWaveEnemies + w.extraPerWave * (state.wave - 1);
    const queue = [];
    for (let i = 0; i < count; i++) queue.push(pickEnemyType(state));
    if (state.wave % w.bossEvery === 0) queue.push('boss');
    state.spawnQueue = queue;
    state.spawnTimer = 0.5;
    say(state, 'Wave ' + state.wave, 2.5);
    state.events.push('next');
  }

  function spawnEnemy(state, type) {
    const def = CFG.enemies[type];
    const W = CFG.world;
    const rng = state.rng;
    let x;
    let y;
    switch (Math.floor(rng() * 4)) {
      case 0: x = rng() * W.width; y = -30; break;
      case 1: x = W.width + 30; y = rng() * W.height; break;
      case 2: x = rng() * W.width; y = W.height + 30; break;
      default: x = -30; y = rng() * W.height; break;
    }
    const w = CFG.waves;
    const maxHealth = Math.round(def.health * (1 + w.healthPerWave * (state.wave - 1)));
    const speedMult = Math.min(w.speedCap, 1 + w.speedPerWave * (state.wave - 1));
    state.enemies.push({
      id: state.nextId++,
      type: type,
      x: x,
      y: y,
      radius: def.radius,
      health: maxHealth,
      maxHealth: maxHealth,
      speed: def.speed * speedMult,
      damage: def.damage,
      attackCd: 0,
      hitFlash: 0,
      dead: false,
    });
  }

  // Visual effects live in state.effects. They use fixed angles, not the seeded rng,
  // so adding them never changes what a seeded run spawns.
  function spawnSparks(state, x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + state.time;
      const speed = 90 + 40 * (i % 3);
      const life = CFG.effects.sparkLife;
      state.effects.push({
        kind: 'spark', x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: life, maxLife: life, color: color,
      });
    }
  }

  function spawnPopup(state, x, y, text, color) {
    const life = CFG.effects.popupLife;
    state.effects.push({ kind: 'text', x: x, y: y, vx: 0, vy: -55, text: text, life: life, maxLife: life, color: color });
  }

  // Moves sparks and popups, expires them, and fades the screen shake.
  function updateEffects(state, dt) {
    state.shake = Math.max(0, state.shake - CFG.effects.shakeDecay * dt);
    const drag = Math.pow(0.02, dt);
    for (const fx of state.effects) {
      fx.life -= dt;
      fx.x += fx.vx * dt;
      fx.y += fx.vy * dt;
      if (fx.kind === 'spark') {
        fx.vx *= drag;
        fx.vy *= drag;
      }
    }
    state.effects = state.effects.filter((fx) => fx.life > 0);
  }

  // shooter is the player who dealt the hit. In co-op, that player earns the kill coin.
  function damageEnemy(state, e, amount, shooter) {
    if (e.dead) return;
    // Armour soaks up part of every hit. Enemies without armour take the full amount.
    const armour = CFG.enemies[e.type].armour || 0;
    amount = amount * (1 - armour);
    e.health -= amount;
    e.hitFlash = 0.1;
    spawnSparks(state, e.x, e.y, CFG.effects.hitSparks, '#ffe066');
    spawnPopup(state, e.x, e.y - e.radius, String(Math.round(amount)), '#ffffff');
    if (e.health <= 0) {
      e.dead = true;
      const def = CFG.enemies[e.type];
      spawnSparks(state, e.x, e.y, CFG.effects.deathSparks, def.color);
      state.kills += 1;
      state.score += def.score;
      if (state.mode === 'coop' && shooter) {
        shooter.coins += CFG.coop.coinPerKill;
        state.events.push('coin');
      } else {
        state.coins += def.xp;
      }
      maybeDrop(state, e.x, e.y);
    }
  }

  // Damage reduction a player gets from their armour. Uses the same rule as the base module.
  // A piece that is not bought yet is level -1. Reduction only applies when all four pieces are owned,
  // and then the weakest piece sets the tier, so a half-upgraded set protects like its weakest piece.
  function armourReductionOf(p) {
    if (!p.armour) return 0;
    const levels = CFG.armour.pieces.map((piece) => p.armour[piece.id]);
    if (levels.some((level) => level === undefined || level < 0)) return 0;
    const weakest = Math.min.apply(null, levels);
    const tier = CFG.armour.tiers[Math.max(0, Math.min(CFG.armour.tiers.length - 1, weakest))];
    return tier.reduction;
  }

  // Returns true when the hit landed.
  function damagePlayer(state, p, amount) {
    if (state.phase !== 'fighting' || p.down || p.invuln > 0 || p.powerUps.shield > 0) return false;
    // Armour cuts the damage before it lands. Health never goes below zero from one hit.
    const reduced = Math.max(0, amount * (1 - armourReductionOf(p)));
    p.health = Math.max(0, p.health - reduced);
    p.invuln = CFG.player.invulnTime;
    state.shake = Math.max(state.shake, CFG.effects.shake);
    state.events.push('hurt');
    if (p.health <= 0) {
      p.down = true;
      if (state.mode === 'pvp') {
        endRound(state, p);
        return true;
      }
      say(state, p.name + ' is down!', 3);
      if (livingPlayers(state).length === 0) {
        state.phase = 'over';
        say(state, 'You were overwhelmed', 5);
      }
    }
    return true;
  }

  // PvP: a player's hit lands on the other player. Only the shooter earns coins.
  function damageRival(state, shooter, target, rawDamage) {
    if (state.phase !== 'fighting' || target.down || target === shooter) return false;
    const amount = Math.max(1, Math.round(rawDamage * CFG.versus.damageScale));
    if (target.invuln > 0 || target.powerUps.shield > 0) return false;
    target.health = Math.max(0, target.health - amount);
    target.invuln = 0.2;
    // Sparks take the shooter's player colour, matching the rest of the UI.
    spawnSparks(state, target.x, target.y, CFG.effects.hitSparks, shooter.index === 0 ? '#4cc9f0' : '#ff9f1c');
    spawnPopup(state, target.x, target.y - target.radius, String(amount), '#ffffff');
    state.shake = Math.max(state.shake, CFG.effects.shake / 2);
    shooter.coins += CFG.versus.coinsPerHit;
    state.events.push('coin');
    if (target.health <= 0) {
      target.down = true;
      endRound(state, target);
    }
    return true;
  }

  // PvP round ends when someone is down. The other player wins the round.
  function endRound(state, downed) {
    const winner = state.players.find((p) => p !== downed);
    if (winner) winner.roundWins += 1;
    state.phase = 'roundover';
    const needed = CFG.versus.roundsToWin;
    if (winner && winner.roundWins >= needed) {
      state.matchWinner = winner.name;
      state.phase = 'over';
      say(state, winner.name + ' wins the match!', 6);
      state.events.push('win');
      return;
    }
    say(state, (winner ? winner.name : 'Nobody') + ' takes the round!', 3);
    state.events.push('next');
  }

  // PvP walls. Each wall is a list of tile-sized blocks laid end to end, horizontal or vertical.
  // Walls are placed from the seeded rng, so a seeded match always gets the same layout.
  // A wall never comes within spawnClearance of either player's starting spot, and walls never overlap.
  function buildWalls(state) {
    const cfg = CFG.versus.walls;
    const W = CFG.world;
    const size = cfg.tile * cfg.length;
    const spawns = [W.width * 0.25, W.width * 0.75];
    const walls = [];
    let attempts = 0;
    while (walls.length < cfg.count && attempts < 500) {
      attempts += 1;
      const horizontal = state.rng() < 0.5;
      const w = horizontal ? size : cfg.tile;
      const h = horizontal ? cfg.tile : size;
      const x = CFG.player.radius + state.rng() * (W.width - w - 2 * CFG.player.radius);
      const y = H_MARGIN + state.rng() * (W.height - h - 2 * H_MARGIN);
      const rect = { x: x, y: y, w: w, h: h };
      if (spawns.some((sx) => rectNearPoint(rect, sx, W.height / 2, cfg.spawnClearance))) continue;
      if (walls.some((other) => rectsOverlap(rect, other))) continue;
      walls.push(rect);
    }
    state.walls = walls;
  }

  // True when the rectangle is within `reach` pixels of the point.
  function rectNearPoint(rect, px, py, reach) {
    const nx = clamp(px, rect.x, rect.x + rect.w);
    const ny = clamp(py, rect.y, rect.y + rect.h);
    return dist(px, py, nx, ny) < reach;
  }

  function rectsOverlap(a, b) {
    const pad = CFG.versus.walls.tile;
    return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
  }

  // True when a circle of radius r at (x, y) touches any wall.
  function hitsWall(state, x, y, r) {
    if (!state.walls) return false;
    for (const wall of state.walls) {
      const nx = clamp(x, wall.x, wall.x + wall.w);
      const ny = clamp(y, wall.y, wall.y + wall.h);
      if (dist(x, y, nx, ny) < r) return true;
    }
    return false;
  }

  // Starts the next PvP round: both players are reset and the arena is cleared.
  function startVersusRound(state) {
    for (const p of state.players) {
      const maxHealth = CFG.versus.maxHealth + CFG.versus.healthPerUpgrade * p.upgrades.maxHealth;
      p.maxHealth = maxHealth;
      p.health = maxHealth;
      p.down = false;
      p.invuln = 0;
      p.cooldown = 0;
      p.powerUps = {};
    }
    state.players[0].x = CFG.world.width * 0.25;
    state.players[1].x = CFG.world.width * 0.75;
    state.players[0].y = state.players[1].y = CFG.world.height / 2;
    state.projectiles = [];
    state.pickups = [];
    state.swings = [];
    buildWalls(state);
    state.round = (state.round || 0) + 1;
    state.phase = 'fighting';
    say(state, 'Round ' + state.round, 2);
    state.events.push('next');
  }

  function maybeDrop(state, x, y) {
    const rng = state.rng;
    if (rng() > CFG.pickups.dropChance) return;
    const unowned = CFG.shop.weapons
      .map((w) => w.id)
      .filter((id) => !state.players.some((p) => p.owned[id]));
    const powerIds = Object.keys(CFG.powerUps).filter((id) => id !== 'heal');
    const r = rng();
    let pk;
    if (r < 0.35) pk = { kind: 'ammo' };
    else if (r < 0.6) pk = { kind: 'heal' };
    else if (r < 0.85 || unowned.length === 0) pk = { kind: 'powerUp', id: pick(rng, powerIds) };
    else pk = { kind: 'weapon', id: pick(rng, unowned) };
    pk.x = x;
    pk.y = y;
    pk.life = CFG.pickups.lifetime;
    state.pickups.push(pk);
    state.events.push('drop');
  }

  function applyPickup(state, pk, p) {
    const tag = labelFor(state, p);
    const sound = pk.kind === 'weapon' ? 'select' : pk.kind === 'powerUp' ? 'powerUp' : 'coin';
    state.events.push(sound);
    if (pk.kind === 'heal') {
      const amount = CFG.powerUps.heal.amount;
      p.health = Math.min(p.maxHealth, p.health + amount);
      say(state, tag + 'Healed +' + amount);
    } else if (pk.kind === 'powerUp') {
      const def = CFG.powerUps[pk.id];
      p.powerUps[pk.id] = def.duration;
      say(state, tag + def.name + ' active!');
    } else if (pk.kind === 'weapon') {
      if (!p.owned[pk.id]) {
        p.owned[pk.id] = true;
        if (isRanged(pk.id)) p.ammo[pk.id] = CFG.weapons[pk.id].ammo;
      }
      p.weapon = pk.id;
      say(state, tag + 'Picked up ' + CFG.weapons[pk.id].name);
    } else if (pk.kind === 'ammo') {
      for (const id of Object.keys(p.owned)) {
        if (isRanged(id)) p.ammo[id] += 20;
      }
      say(state, tag + 'Ammo +20');
    }
  }

  // Walking over an auto-kind pickup (power-ups and coins) applies it straight away.
  // Weapons and healing still wait for E.
  function collectPowerUps(state, p) {
    if (state.phase !== 'fighting' || p.down) return;
    const reach = CFG.pickups.pickupRadius;
    const auto = CFG.pickups.autoKinds || [];
    const near = state.pickups.filter(
      (pk) => auto.indexOf(pk.kind) !== -1 && dist(p.x, p.y, pk.x, pk.y) <= reach
    );
    for (const pk of near) {
      state.pickups = state.pickups.filter((other) => other !== pk);
      applyPickup(state, pk, p);
    }
  }

  // E key: revive a nearby downed ally first, otherwise pick up the closest item.
  function interact(state, p) {
    p = p || state.player;
    if (state.phase !== 'fighting' || p.down) return false;
    for (const ally of state.players) {
      if (ally === p || !ally.down) continue;
      if (dist(p.x, p.y, ally.x, ally.y) > CFG.pickups.pickupRadius + 20) continue;
      ally.down = false;
      ally.health = Math.ceil(ally.maxHealth / 2);
      ally.invuln = 1;
      say(state, p.name + ' revived ' + ally.name + '!');
      state.events.push('select');
      return true;
    }
    let best = null;
    let bestDist = Infinity;
    for (const pk of state.pickups) {
      const d = dist(p.x, p.y, pk.x, pk.y);
      if (d <= CFG.pickups.pickupRadius && d < bestDist) {
        best = pk;
        bestDist = d;
      }
    }
    if (!best) return false;
    state.pickups = state.pickups.filter((pk) => pk !== best);
    applyPickup(state, best, p);
    return true;
  }

  function swing(state, p, def, st, aimAngle) {
    p.swingTime = CFG.sprite.swingPose;
    state.swings.push({ x: p.x, y: p.y, angle: aimAngle, life: 0.18, range: def.range, arc: def.arc, color: def.color });
    state.events.push('swing');
    if (state.mode === 'pvp') {
      for (const other of state.players) {
        if (other === p || other.down) continue;
        if (dist(p.x, p.y, other.x, other.y) > def.range + other.radius) continue;
        let diff = Math.atan2(other.y - p.y, other.x - p.x) - aimAngle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) > def.arc / 2) continue;
        damageRival(state, p, other, def.damage * st.damageMult);
      }
      return;
    }
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (dist(p.x, p.y, e.x, e.y) > def.range + e.radius) continue;
      let diff = Math.atan2(e.y - p.y, e.x - p.x) - aimAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > def.arc / 2) continue;
      damageEnemy(state, e, def.damage * st.damageMult, p);
    }
  }

  function fireRanged(state, p, def, id, st, aimAngle) {
    if (!CFG.infiniteAmmo) {
      if (p.ammo[id] <= 0) {
        say(state, labelFor(state, p) + 'Out of ammo', 1);
        p.cooldown = 0.3;
        return;
      }
      p.ammo[id] -= 1;
    }
    state.events.push('laser');
    for (let i = 0; i < def.pellets; i++) {
      let offset = 0;
      if (def.spread > 0) {
        const unit = def.pellets > 1 ? (i / (def.pellets - 1)) * 2 - 1 : state.rng() * 2 - 1;
        offset = unit * def.spread;
      }
      const a = aimAngle + offset;
      state.projectiles.push({
        owner: p,
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * def.speed,
        vy: Math.sin(a) * def.speed,
        damage: def.damage * st.damageMult,
        life: def.range / def.speed,
        pierce: !!def.pierce,
        hitIds: [],
      });
    }
  }

  function fire(state, aimX, aimY, p) {
    p = p || state.player;
    if (p.down) return;
    const id = p.weapon;
    const def = CFG.weapons[id];
    const st = playerStats(p);
    const ax = aimX == null ? p.x + p.facing * 100 : aimX;
    const ay = aimY == null ? p.y : aimY;
    const aimAngle = Math.atan2(ay - p.y, ax - p.x);
    if (def.melee) swing(state, p, def, st, aimAngle);
    else fireRanged(state, p, def, id, st, aimAngle);
    p.cooldown = def.cooldown * st.cooldownMult;
  }

  // Enemies chase the nearest standing player and hit anyone they touch.
  // The Overlord releases a ring of Dashers the first time its health drops below half.
  function bossSplit(state, boss) {
    if (boss.type !== 'boss' || boss.split || boss.health > boss.maxHealth * 0.5) return;
    boss.split = true;
    const count = 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      state.enemies.push({
        id: state.nextId++,
        type: 'dasher',
        x: boss.x + Math.cos(a) * (boss.radius + 20),
        y: boss.y + Math.sin(a) * (boss.radius + 20),
        radius: CFG.enemies.dasher.radius,
        health: CFG.enemies.dasher.health,
        maxHealth: CFG.enemies.dasher.health,
        speed: CFG.enemies.dasher.speed,
        damage: CFG.enemies.dasher.damage,
        attackCd: 0,
        hitFlash: 0,
        dead: false,
      });
    }
    state.events.push('drop');
    spawnSparks(state, boss.x, boss.y, CFG.effects.deathSparks, CFG.enemies.boss.color);
  }

  function updateEnemies(state, dt) {
    for (const e of state.enemies) {
      if (e.dead) continue;
      bossSplit(state, e);
      e.attackCd = Math.max(0, e.attackCd - dt);
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      const target = nearestLiving(state, e.x, e.y);
      if (!target) continue;
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      // A croak slows enemies: while slowUntil is in the future, they move at slowFactor speed.
      const slow = e.slowUntil && state.time < e.slowUntil ? e.slowFactor : 1;
      e.x += (dx / d) * e.speed * slow * dt;
      e.y += (dy / d) * e.speed * slow * dt;
      if (e.attackCd > 0) continue;
      for (const p of state.players) {
        if (p.down) continue;
        if (dist(e.x, e.y, p.x, p.y) < e.radius + p.radius && damagePlayer(state, p, e.damage)) {
          e.attackCd = 0.8;
          break;
        }
      }
    }
  }

  function updateProjectiles(state, dt) {
    const W = CFG.world;
    for (const pr of state.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      // Walls stop every projectile, including the sniper's piercing shot.
      if (hitsWall(state, pr.x, pr.y, 3)) {
        pr.life = 0;
        continue;
      }
      if (state.mode === 'pvp') {
        const owner = pr.owner;
        for (const other of state.players) {
          if (other === owner || other.down || pr.hitIds.indexOf(other.index) !== -1) continue;
          if (dist(pr.x, pr.y, other.x, other.y) < other.radius + 4) {
            pr.hitIds.push(other.index);
            damageRival(state, owner, other, pr.damage);
            pr.life = 0;
            break;
          }
        }
        continue;
      }
      for (const e of state.enemies) {
        if (e.dead || pr.hitIds.indexOf(e.id) !== -1) continue;
        if (dist(pr.x, pr.y, e.x, e.y) < e.radius + 4) {
          pr.hitIds.push(e.id);
          damageEnemy(state, e, pr.damage, pr.owner);
          if (!pr.pierce) {
            pr.life = 0;
            break;
          }
        }
      }
    }
    state.projectiles = state.projectiles.filter(
      (pr) => pr.life > 0 && pr.x > -50 && pr.x < W.width + 50 && pr.y > -50 && pr.y < W.height + 50
    );
  }

  function onWaveCleared(state) {
    const bonus = 5 * state.wave;
    state.phase = 'shop';
    state.coins += bonus;
    state.score += 100 * state.wave;
    say(state, 'Wave ' + state.wave + ' cleared! +' + bonus + ' coins', 3);
    state.events.push('win');
  }

  function tickPlayer(p, dt) {
    p.swingTime = Math.max(0, (p.swingTime || 0) - dt);
    for (const id of Object.keys(p.powerUps)) {
      p.powerUps[id] -= dt;
      if (p.powerUps[id] <= 0) delete p.powerUps[id];
    }
    p.invuln = Math.max(0, p.invuln - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.specialCooldown = Math.max(0, (p.specialCooldown || 0) - dt);
  }

  // The special ability a player's character has, or null.
  function specialOf(p) {
    const c = CFG.characters.find((ch) => ch.id === p.character);
    return c && c.special ? c.special : null;
  }

  // Track Down: the enemy a player should aim at, or null when there is nothing to track.
  // Used by player 1 when Track Down is on, so the gun locks onto the nearest enemy.
  function trackTarget(state, p) {
    let best = null;
    let bestDist = Infinity;
    for (const e of state.enemies || []) {
      if (e.dead) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  // Uses the player's special if it is ready. Returns true when it fired.
  // Each special reuses the game's own rules: shield and haste are the existing power-ups.
  function useSpecial(state, p) {
    const sp = specialOf(p);
    if (!sp || p.down || state.phase !== 'fighting' || p.specialCooldown > 0) return false;
    p.specialCooldown = sp.cooldown;
    // The Super Burst runs all five specials at once; each part runs its normal effect.
    if (sp.id === 'superBurst') {
      for (const part of sp.parts) runSpecialEffect(state, p, part);
      state.events.push('special');
      return true;
    }
    runSpecialEffect(state, p, sp.id);
    state.events.push('special');
    return true;
  }

  // Finds the numbers for one special effect by its id, from whichever character defines it.
  // The Super Burst's parts reuse the numbers from the normal characters' specials.
  function findSpecialById(id) {
    for (const c of CFG.characters) {
      if (c.special && c.special.id === id) return c.special;
    }
    return null;
  }

  // The effect of one special, by its id. Used directly for normal characters and once per part for the Super Burst.
  function runSpecialEffect(state, p, id) {
    const sp = findSpecialById(id);
    if (!sp) return false;
    switch (sp.id) {
      case 'shieldWall':
        p.powerUps.shield = sp.duration;
        break;
      case 'overcharge':
        p.powerUps.haste = sp.duration;
        break;
      case 'stomp':
        for (const e of state.enemies) {
          if (e.dead || dist(p.x, p.y, e.x, e.y) > sp.radius) continue;
          damageEnemy(state, e, sp.damage, p);
          // Knock back: push the enemy away from the player by `knockback` pixels.
          const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
          e.x += ((e.x - p.x) / d) * sp.knockback;
          e.y += ((e.y - p.y) / d) * sp.knockback;
        }
        spawnSparks(state, p.x, p.y, CFG.effects.deathSparks, '#70e000');
        state.shake = Math.max(state.shake, CFG.effects.shake);
        break;
      case 'heal':
        p.health = Math.min(p.maxHealth, p.health + sp.amount);
        spawnPopup(state, p.x, p.y - 30, '+' + sp.amount, '#70e000');
        break;
      case 'croak':
        for (const e of state.enemies) {
          if (e.dead || dist(p.x, p.y, e.x, e.y) > sp.radius) continue;
          e.slowUntil = state.time + sp.duration;
          e.slowFactor = sp.slow;
        }
        spawnSparks(state, p.x, p.y, CFG.effects.hitSparks, '#70e000');
        break;
      default:
        return false;
    }
    return true;
  }

  function movePlayer(p, dt, input, state) {
    const W = CFG.world;
    if (p.down) {
      p.moving = false;
      return;
    }
    const st = playerStats(p);
    let mx = input.moveX || 0;
    let my = input.moveY || 0;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    // Move one axis at a time, so the player slides along a wall instead of sticking to it.
    const nx = clamp(p.x + mx * st.speed * dt, CFG.player.radius, W.width - CFG.player.radius);
    if (!hitsWall(state, nx, p.y, p.radius)) p.x = nx;
    const ny = clamp(p.y + my * st.speed * dt, CFG.player.radius, W.height - CFG.player.radius);
    if (!hitsWall(state, p.x, ny, p.radius)) p.y = ny;
    p.moving = len > 0.01;
    if (mx < -0.01) p.facing = -1;
    else if (mx > 0.01) p.facing = 1;
    if (input.aimX != null) p.aim = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  }

  // inputs: an array with one entry per player, or a single object for player 1.
  // The base is a safe hub: the player walks, shoots practice dummies, and nothing can hurt them.
  function updateBase(state, dt, inputs) {
    const list = Array.isArray(inputs) ? inputs : [inputs || {}];
    const p = state.players[0];
    const input = list[0] || {};
    tickPlayer(p, dt);
    movePlayer(p, dt, input, state);
    // Walking onto a door opens that room; walking onto the room's exit leaves it.
    if (state.room) {
      leaveRoomIfAtExit(state);
    } else {
      for (const id of Object.keys(CFG.base.rooms)) {
        const d = CFG.base.rooms[id].door;
        if (roomAt(p, d.x, d.y, d.r)) {
          enterRoom(state, id);
          break;
        }
      }
    }
    if (input.firing && p.cooldown <= 0) fire(state, input.aimX, input.aimY, p);
    // Dummies take hits and never attack; they reset to full health when they die.
    for (const d of state.dummies || []) {
      if (d.health < d.maxHealth) d.health = Math.min(d.maxHealth, d.health + dt * 4);
    }
    state.projectiles = state.projectiles.filter((pr) => {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      for (const d of state.dummies || []) {
        if (pr.hitIds.indexOf(d.id) !== -1) continue;
        if (dist(pr.x, pr.y, d.x, d.y) < 24) {
          pr.hitIds.push(d.id);
          d.health = Math.max(0, d.health - pr.damage);
          spawnPopup(state, d.x, d.y - 28, String(Math.round(pr.damage)), '#ffffff');
          pr.life = 0;
        }
      }
      return pr.life > 0 && pr.x > -50 && pr.x < CFG.world.width + 50 && pr.y > -50 && pr.y < CFG.world.height + 50;
    });
    updateEffects(state, dt);
  }

  // inputs: an array with one entry per player, or a single object for player 1.
  function update(state, dt, inputs) {
    if (state.phase === 'base') {
      updateBase(state, dt, inputs);
      return;
    }
    // Effects keep fading during the shop and between waves, so nothing freezes on screen.
    if (state.phase !== 'fighting') {
      updateEffects(state, dt);
      return;
    }
    const list = Array.isArray(inputs) ? inputs : [inputs || {}];
    state.time += dt;
    if (state.mode !== 'pvp') state.score += dt;
    for (let i = 0; i < state.players.length; i++) {
      if (state.phase !== 'fighting') break;
      const p = state.players[i];
      const input = list[i] || {};
      tickPlayer(p, dt);
      movePlayer(p, dt, input, state);
      if (input.firing && p.cooldown <= 0) fire(state, input.aimX, input.aimY, p);
      if (input.interact) interact(state, p);
      if (input.special) useSpecial(state, p);
      collectPowerUps(state, p);
    }
    state.swings = state.swings.filter((s) => {
      s.life -= dt;
      return s.life > 0;
    });
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state, state.spawnQueue.shift());
        state.spawnTimer = CFG.waves.spawnInterval;
      }
    }
    updateEnemies(state, dt);
    updateProjectiles(state, dt);
    updateEffects(state, dt);
    state.enemies = state.enemies.filter((e) => !e.dead);
    state.pickups = state.pickups.filter((pk) => {
      pk.life -= dt;
      return pk.life > 0;
    });
    if (state.mode === 'pvp') {
      updatePvpPickups(state, dt);
      return;
    }
    if (state.phase === 'fighting' && state.spawnQueue.length === 0 && state.enemies.length === 0) {
      onWaveCleared(state);
    }
  }

  // PvP keeps a few pickups in the arena so the fight stays lively.
  function updatePvpPickups(state, dt) {
    const cfg = CFG.versus;
    state.pvpPickupTimer = (state.pvpPickupTimer || 0) - dt;
    if (state.pvpPickupTimer > 0 || state.pickups.length >= cfg.maxPickups) return;
    state.pvpPickupTimer = cfg.pickupEvery;
    const W = CFG.world;
    const r = state.rng();
    const kinds = ['heal', 'ammo', 'powerUp'];
    const kind = kinds[Math.floor(r * kinds.length)];
    const pk = { kind: kind, x: W.width * (0.3 + 0.4 * state.rng()), y: H_MARGIN + (W.height - 2 * H_MARGIN) * state.rng(), life: CFG.pickups.lifetime };
    if (kind === 'powerUp') pk.id = pick(state.rng, Object.keys(CFG.powerUps).filter((id) => id !== 'heal'));
    state.pickups.push(pk);
    state.events.push('drop');
  }



  function upgradeCost(def, level) {
    return Math.round(def.cost * (1 + 0.5 * level));
  }

  // PvP: each player has their own wallet. Solo and co-op share one pool on the run.
  function walletOf(state, p) {
    return state.mode === 'pvp' ? p : state;
  }

  // Shop purchases: upgrades and weapons belong to one player (default: player 1).
  function buyUpgrade(state, id, p) {
    p = p || state.player;
    const wallet = walletOf(state, p);
    const def = CFG.shop.upgrades.find((u) => u.id === id);
    if (!def) return { ok: false, reason: 'Unknown item' };
    const level = p.upgrades[id];
    if (level >= def.max) return { ok: false, reason: 'Maxed out' };
    const cost = upgradeCost(def, level);
    if (wallet.coins < cost) return { ok: false, reason: 'Not enough coins' };
    wallet.coins -= cost;
    p.upgrades[id] += 1;
    if (id === 'maxHealth') {
      const base = state.mode === 'pvp' ? CFG.versus.maxHealth : CFG.player.maxHealth;
      const per = state.mode === 'pvp' ? CFG.versus.healthPerUpgrade : 1;
      p.maxHealth = base + per * p.upgrades.maxHealth;
      p.health = Math.min(p.maxHealth, p.health + per);
    }
    if (id === 'ammo') {
      for (const wid of Object.keys(p.owned)) {
        if (isRanged(wid)) p.ammo[wid] += 30;
      }
    }
    return { ok: true, cost: cost };
  }

  function buyWeapon(state, id, p) {
    p = p || state.player;
    const entry = CFG.shop.weapons.find((w) => w.id === id);
    if (!entry) return { ok: false, reason: 'Unknown weapon' };
    if (p.owned[id]) return { ok: false, reason: 'Already owned' };
    const wallet = walletOf(state, p);
    if (wallet.coins < entry.cost) return { ok: false, reason: 'Not enough coins' };
    wallet.coins -= entry.cost;
    p.owned[id] = true;
    if (isRanged(id)) p.ammo[id] = CFG.weapons[id].ammo;
    p.weapon = id;
    return { ok: true, cost: entry.cost };
  }

  // Buys an armour piece at wood (level 0). Costs the piece's base price. Returns { ok, reason, cost }.
  function buyArmour(state, pieceId, p) {
    p = p || state.player;
    const piece = CFG.armour.pieces.find((x) => x.id === pieceId);
    if (!piece) return { ok: false, reason: 'Unknown armour' };
    p.armour = p.armour || { helmet: -1, chestplate: -1, leggings: -1, boots: -1 };
    if (p.armour[pieceId] >= 0) return { ok: false, reason: 'Already owned' };
    const wallet = walletOf(state, p);
    if (wallet.coins < piece.cost) return { ok: false, reason: 'Not enough coins' };
    wallet.coins -= piece.cost;
    p.armour[pieceId] = 0;
    return { ok: true, cost: piece.cost };
  }

  // Upgrades an owned armour piece one tier. The cost depends on the piece's current level.
  function upgradeArmour(state, pieceId, p) {
    p = p || state.player;
    const piece = CFG.armour.pieces.find((x) => x.id === pieceId);
    if (!piece) return { ok: false, reason: 'Unknown armour' };
    p.armour = p.armour || { helmet: -1, chestplate: -1, leggings: -1, boots: -1 };
    const level = p.armour[pieceId];
    if (level < 0) return { ok: false, reason: 'Buy it first' };
    const max = CFG.armour.tiers.length - 1;
    if (level >= max) return { ok: false, reason: 'Already netherite' };
    const cost = CFG.armour.upgradeStart + CFG.armour.upgradeStep * level;
    const wallet = walletOf(state, p);
    if (wallet.coins < cost) return { ok: false, reason: 'Not enough coins' };
    wallet.coins -= cost;
    p.armour[pieceId] = level + 1;
    return { ok: true, cost: cost, tier: CFG.armour.tiers[level + 1].name };
  }

  function equipWeapon(state, id, p) {
    p = p || state.player;
    if (!p.owned[id]) return false;
    p.weapon = id;
    return true;
  }

  const api = {
    createRng: createRng,
    createRun: createRun,
    livingPlayers: livingPlayers,
    nearestLiving: nearestLiving,
    playerStats: playerStats,
    startNextWave: startNextWave,
    startVersusRound: startVersusRound,
    damageRival: damageRival,
    endRound: endRound,
    walletOf: walletOf,
    update: update,
    startBase: startBase,
    enterArena: enterArena,
    buyUpgrade: buyUpgrade,
    buyWeapon: buyWeapon,
    equipWeapon: equipWeapon,
    buyArmour: buyArmour,
    enterRoom: enterRoom,
    roomShelves: roomShelves,
    nearestShelfItem: nearestShelfItem,
    buyShelfItem: buyShelfItem,
    upgradeArmour: upgradeArmour,
    armourReductionOf: armourReductionOf,
    upgradeCost: upgradeCost,
    fire: fire,
    interact: interact,
    trackTarget: trackTarget,
    useSpecial: useSpecial,
    specialOf: specialOf,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
