// Pure game logic: no DOM access, so it can be tested with Node.
(function (root) {
  'use strict';

  const CFG = typeof module !== 'undefined' && module.exports ? require('./config.js') : CONFIG;

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
      weapon: 'gun',
      owned: { gun: true },
      ammo: { gun: CFG.weapons.gun.ammo },
      upgrades: { maxHealth: 0, damage: 0, speed: 0, ammo: 0 },
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

  function pickEnemyType(state) {
    const r = state.rng();
    if (state.wave >= 3 && r < 0.2) return 'brute';
    if (state.wave >= 2 && r < 0.5) return 'bat';
    return 'slime';
  }

  function startNextWave(state) {
    const w = CFG.waves;
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
    const maxHealth = Math.round(def.health * (1 + 0.12 * (state.wave - 1)));
    const speedMult = Math.min(1.8, 1 + 0.04 * (state.wave - 1));
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

  // shooter is the player who dealt the hit. In co-op, that player earns the kill coin.
  function damageEnemy(state, e, amount, shooter) {
    if (e.dead) return;
    e.health -= amount;
    e.hitFlash = 0.1;
    if (e.health <= 0) {
      e.dead = true;
      const def = CFG.enemies[e.type];
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

  // Returns true when the hit landed.
  function damagePlayer(state, p, amount) {
    if (state.phase !== 'fighting' || p.down || p.invuln > 0 || p.powerUps.shield > 0) return false;
    p.health = Math.max(0, p.health - amount);
    p.invuln = CFG.player.invulnTime;
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
    state.events.push(pk.kind === 'weapon' ? 'select' : 'coin');
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
  function updateEnemies(state, dt) {
    for (const e of state.enemies) {
      if (e.dead) continue;
      e.attackCd = Math.max(0, e.attackCd - dt);
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      const target = nearestLiving(state, e.x, e.y);
      if (!target) continue;
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
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
    for (const id of Object.keys(p.powerUps)) {
      p.powerUps[id] -= dt;
      if (p.powerUps[id] <= 0) delete p.powerUps[id];
    }
    p.invuln = Math.max(0, p.invuln - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
  }

  function movePlayer(p, dt, input) {
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
    p.x = clamp(p.x + mx * st.speed * dt, CFG.player.radius, W.width - CFG.player.radius);
    p.y = clamp(p.y + my * st.speed * dt, CFG.player.radius, W.height - CFG.player.radius);
    p.moving = len > 0.01;
    if (mx < -0.01) p.facing = -1;
    else if (mx > 0.01) p.facing = 1;
    if (input.aimX != null) p.aim = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  }

  // inputs: an array with one entry per player, or a single object for player 1.
  function update(state, dt, inputs) {
    if (state.phase !== 'fighting') return;
    const list = Array.isArray(inputs) ? inputs : [inputs || {}];
    state.time += dt;
    if (state.mode !== 'pvp') state.score += dt;
    for (let i = 0; i < state.players.length; i++) {
      if (state.phase !== 'fighting') break;
      const p = state.players[i];
      const input = list[i] || {};
      tickPlayer(p, dt);
      movePlayer(p, dt, input);
      if (input.firing && p.cooldown <= 0) fire(state, input.aimX, input.aimY, p);
      if (input.interact) interact(state, p);
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

  const H_MARGIN = 80;

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
    buyUpgrade: buyUpgrade,
    buyWeapon: buyWeapon,
    equipWeapon: equipWeapon,
    upgradeCost: upgradeCost,
    fire: fire,
    interact: interact,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
