// The base hub: dust, player colours, and practice dummies. Pure logic, no DOM access,
// so it can be tested with Node. main.js draws the base and calls these functions.
(function (root) {
  'use strict';

  const CFG = typeof module !== 'undefined' && module.exports ? require('./config.js') : CONFIG;
  const RAINBOW = 'rainbow';

  // A fresh save: one free colour (red), no dust, no coins, and no score yet.
  // coins is the arena money that carries between runs; lifetimeScore adds up every run.
  function newSave() {
    return { dust: 0, owned: ['red'], color: 'red', bestScore: 0, coins: 0, lifetimeScore: 0 };
  }

  // Armour rules. A piece's level is 0 (wood) to 5 (netherite); each level is one tier up.
  // Buying a piece costs its base price. Upgrading costs upgradeStart for the first upgrade,
  // then upgradeStep more for each later one, so the upgrade prices are 10, 15, 20, 25, 30.
  function armourTier(level) {
    const tiers = CFG.armour.tiers;
    return tiers[Math.max(0, Math.min(tiers.length - 1, level | 0))];
  }

  // Coins needed to move a piece from `level` to `level + 1`. Returns null when it is already netherite.
  function armourUpgradeCost(level) {
    const max = CFG.armour.tiers.length - 1;
    if (level >= max) return null;
    return CFG.armour.upgradeStart + CFG.armour.upgradeStep * level;
  }

  // Damage reduction from all armour together: the lowest piece sets the reduction, so a
  // half-upgraded set does not protect better than its weakest piece. Capped by the top tier.
  function armourReduction(levels) {
    const pieces = CFG.armour.pieces.map((p) => (levels && levels[p.id]) || 0);
    if (pieces.length === 0) return 0;
    const weakest = Math.min.apply(null, pieces);
    return armourTier(weakest).reduction;
  }

  // Records what a finished run leaves behind: its coins and its score.
  function carryRun(save, coins, score) {
    save.coins = Math.max(0, Math.floor(coins));
    save.lifetimeScore = (save.lifetimeScore || 0) + Math.max(0, Math.floor(score));
    return save;
  }

  // Copies what a player has bought (weapons, ammo, equipped weapon, upgrades) into the save.
  // Only copies known fields with plain values, so a damaged save can't inject anything else.
  function carryLoadout(save, p) {
    save.loadout = {
      owned: Object.keys(p.owned || {}).filter((id) => p.owned[id] === true),
      weapon: typeof p.weapon === 'string' ? p.weapon : 'gun',
      ammo: Object.assign({}, p.ammo || {}),
      upgrades: Object.assign({ maxHealth: 0, damage: 0, speed: 0, ammo: 0 }, p.upgrades || {}),
      armour: Object.assign({ helmet: -1, chestplate: -1, leggings: -1, boots: -1 }, p.armour || {}),
    };
    return save;
  }

  // Returns the loadout a saved player should start with. Missing or invalid pieces fall back to a fresh start.
  function loadoutFor(save) {
    const l = save.loadout;
    if (!l || !Array.isArray(l.owned)) return null;
    return {
      owned: l.owned.filter((id) => typeof id === 'string'),
      weapon: typeof l.weapon === 'string' ? l.weapon : 'gun',
      ammo: l.ammo && typeof l.ammo === 'object' ? l.ammo : {},
      upgrades: l.upgrades && typeof l.upgrades === 'object' ? l.upgrades : {},
      armour: l.armour && typeof l.armour === 'object' ? l.armour : {},
    };
  }

  // Dust earned from a finished arena run: 1 per pointsPerDust points, rounded down.
  function dustForScore(score) {
    return Math.max(0, Math.floor(Math.floor(score) / CFG.base.pointsPerDust));
  }

  // Adds the dust from a finished run to the save. Returns how much was added.
  function addRunDust(save, score) {
    const gained = dustForScore(score);
    save.dust += gained;
    return gained;
  }

  // Returns the colour definition for an id, or the rainbow entry, or null.
  function findColor(id) {
    if (id === RAINBOW) return { id: RAINBOW, name: 'Rainbow', hex: null, cost: CFG.base.rainbowCost, rainbow: true };
    return CFG.base.colors.find((c) => c.id === id) || null;
  }

  // Buys a colour with dust. Returns { ok, reason }.
  function buyColor(save, id) {
    const def = findColor(id);
    if (!def) return { ok: false, reason: 'Unknown colour' };
    if (save.owned.indexOf(id) !== -1) return { ok: false, reason: 'Already owned' };
    if (save.dust < def.cost) return { ok: false, reason: 'Not enough dust' };
    save.dust -= def.cost;
    save.owned.push(id);
    return { ok: true, cost: def.cost };
  }

  // Equips a colour the player owns. Returns true if it changed.
  function equipColor(save, id) {
    if (save.owned.indexOf(id) === -1) return false;
    save.color = id;
    return true;
  }

  // Practice dummies are a fixed set of targets in the practice area.
  // They have no attack, so walking near them can never hurt the player.
  function makeDummies() {
    const p = CFG.base.practice;
    const xs = [0.2, 0.4, 0.6, 0.8];
    return xs.map(function (t, i) {
      return { id: 500 + i, x: p.x + p.w * t, y: p.y + p.h * 0.5, health: CFG.base.dummyHealth, maxHealth: CFG.base.dummyHealth, dummy: true };
    });
  }

  // True when the player is close enough to a point to use it.
  function nearPoint(p, point, reach) {
    return Math.hypot(p.x - point.x, p.y - point.y) <= (reach == null ? 70 : reach);
  }

  // The portal: walking into it (and pressing E) starts the real arena.
  function nearPortal(p) {
    const portal = CFG.base.portal;
    return Math.hypot(p.x - portal.x, p.y - portal.y) <= portal.radius;
  }

  const api = {
    RAINBOW: RAINBOW,
    newSave: newSave,
    carryRun: carryRun,
    carryLoadout: carryLoadout,
    loadoutFor: loadoutFor,
    armourTier: armourTier,
    armourUpgradeCost: armourUpgradeCost,
    armourReduction: armourReduction,
    dustForScore: dustForScore,
    addRunDust: addRunDust,
    findColor: findColor,
    buyColor: buyColor,
    equipColor: equipColor,
    makeDummies: makeDummies,
    nearPoint: nearPoint,
    nearPortal: nearPortal,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Base = api;
})(typeof window !== 'undefined' ? window : globalThis);
