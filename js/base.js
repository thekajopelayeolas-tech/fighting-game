// The base hub: dust, player colours, and practice dummies. Pure logic, no DOM access,
// so it can be tested with Node. main.js draws the base and calls these functions.
(function (root) {
  'use strict';

  const CFG = typeof module !== 'undefined' && module.exports ? require('./config.js') : CONFIG;
  const RAINBOW = 'rainbow';

  // A fresh save: one free colour (red), no dust, no coins, and no score yet.
  // coins is the arena money that carries between runs; lifetimeScore adds up every run.
  function newSave() {
    // characters lists the special characters the player has bought (the Super Character).
    return { dust: 0, owned: ['red'], color: 'red', bestScore: 0, coins: 0, lifetimeScore: 0, characters: [] };
  }

  // Records a super character as owned in the save. The coins are taken from the run by the caller
  // (see buyShelfItem), so this only checks the character and records it. Returns { ok, reason, cost }.
  function buySuperCharacter(save, id) {
    const def = CFG.characters.find((c) => c.id === id && c.super);
    if (!def) return { ok: false, reason: 'Unknown character' };
    save.characters = Array.isArray(save.characters) ? save.characters : [];
    if (save.characters.indexOf(id) !== -1) return { ok: false, reason: 'Already owned' };
    save.characters.push(id);
    return { ok: true, cost: def.cost };
  }

  // Whether a character can be picked on the select screen. Normal characters always can;
  // the Super Character needs to be bought first.
  function characterUnlocked(save, id) {
    const def = CFG.characters.find((c) => c.id === id);
    if (!def) return false;
    if (!def.super) return true;
    return !!(save && Array.isArray(save.characters) && save.characters.indexOf(id) !== -1);
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

  // Items on display in each room. Every item has a key, a name, a price and a currency.
  // Prices and names come from the shop, armour, colour and rainbow lists, so there is one source of truth.
  function roomItems(roomId) {
    if (roomId === 'shop') {
      const weapons = CFG.shop.weapons.map((w) => ({
        key: 'weapon:' + w.id, name: CFG.weapons[w.id].name, price: w.cost, currency: 'coins', kind: 'weapon',
      }));
      const armour = CFG.armour.pieces.map((p) => ({
        key: 'armour:' + p.id, name: p.name, price: p.cost, currency: 'coins', kind: 'armour',
      }));
      // The Super Character is sold here too, for coins. It is one item, not a set.
      const supers = CFG.characters.filter((c) => c.super).map((c) => ({
        key: 'character:' + c.id, name: c.name, price: c.cost, currency: 'coins', kind: 'character',
      }));
      return weapons.concat(armour, supers);
    }
    if (roomId === 'colour') {
      return CFG.base.colors.filter((c) => c.cost > 0).map((c) => ({
        key: 'colour:' + c.id, name: c.name, price: c.cost, currency: 'dust', kind: 'colour', hex: c.hex,
      }));
    }
    if (roomId === 'dust') {
      return [{ key: 'colour:' + RAINBOW, name: 'Rainbow', price: CFG.base.rainbowCost, currency: 'dust', kind: 'colour', rainbow: true }];
    }
    return [];
  }

  // Whether the player already owns an item on display. Used by both the room view and the E key,
  // so an owned item always looks owned and can never be bought again.
  // p is the player; save holds the owned colours.
  function isOwned(item, p, save) {
    if (!item) return false;
    const id = item.key.split(':')[1];
    if (item.kind === 'weapon') return !!(p && p.owned && p.owned[id]);
    if (item.kind === 'armour') return !!(p && p.armour && p.armour[id] >= 0);
    if (item.kind === 'colour') return !!(save && save.owned && save.owned.indexOf(id) !== -1);
    if (item.kind === 'character') return !!(save && save.characters && save.characters.indexOf(id) !== -1);
    return false;
  }

  // Works out whether a saved balance can pay for an item. Returns { ok, reason }.
  function canAfford(item, wallets) {
    const have = item.currency === 'dust' ? wallets.dust : wallets.coins;
    if (have < item.price) return { ok: false, reason: 'Not enough ' + item.currency };
    return { ok: true };
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

  // The portal the player is standing in, or null. Walking into one and pressing E starts its match.
  function portalAt(p) {
    const portals = CFG.base.portals;
    for (const id of Object.keys(portals)) {
      const portal = portals[id];
      if (Math.hypot(p.x - portal.x, p.y - portal.y) <= portal.radius) return Object.assign({ id: id }, portal);
    }
    return null;
  }

  // True when the player is in any portal.
  function nearPortal(p) {
    return portalAt(p) !== null;
  }

  const api = {
    RAINBOW: RAINBOW,
    newSave: newSave,
    buySuperCharacter: buySuperCharacter,
    characterUnlocked: characterUnlocked,
    carryRun: carryRun,
    carryLoadout: carryLoadout,
    loadoutFor: loadoutFor,
    roomItems: roomItems,
    canAfford: canAfford,
    isOwned: isOwned,
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
    portalAt: portalAt,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Base = api;
})(typeof window !== 'undefined' ? window : globalThis);
