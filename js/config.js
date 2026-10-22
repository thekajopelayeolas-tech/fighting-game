// Central balance and asset config. Edit numbers here, not in game logic.
const CONFIG = {
  world: { width: 1600, height: 900 },
  // true = ranged weapons never run out. Set to false to bring back ammo limits.
  infiniteAmmo: true,
  player: { speed: 230, maxHealth: 5, radius: 18, invulnTime: 0.9, drawSize: 40 },
  sprite: {
    frameSize: 64,
    // Row numbers from the sheet README (one row per action).
    rows: { walk: 0, attack: 3, standFront: 5, walkFront: 6, walkBack: 12 },
    frames: { walk: 9, attack: 7, walkFront: 9, walkBack: 9 },
    fps: 10,
    // Seconds the attack pose stays on screen after a melee swing.
    swingPose: 0.25,
  },
  assets: {
    knight: 'assets/characters/knight.png',
    gun: 'assets/weapons/gun.png',
    sword: 'assets/weapons/sword.png',
    sniper: 'assets/weapons/sniper.png',
    knife: 'assets/weapons/knife.png',
    shotgun: 'assets/weapons/shotgun.png',
    redCrab: 'assets/sprites/red_crab.png',
    roboGuard: 'assets/sprites/robo_guard.png',
    spikeBall: 'assets/sprites/spike_ball.png',
    brute: 'assets/sprites/space_meteor_large.png',
    coin: 'assets/sprites/spinning_coin.png',
    space: 'assets/backgrounds/space.png',
    frost: 'assets/backgrounds/frost.png',
    sunset: 'assets/backgrounds/sunset.png',
    ocean: 'assets/backgrounds/ocean.png',
    forestNight: 'assets/backgrounds/forest_night.png',
    desertDusk: 'assets/backgrounds/desert_dusk.png',
    wallTiles: 'assets/sprites/wall_tiles.png',
    bolt: 'assets/characters/bolt.png',
    dino: 'assets/characters/dino.png',
    forest: 'assets/characters/forest.png',
    frog: 'assets/characters/frog.png',
  },
  // Fight backgrounds the player can pick on the title screen. The shop always uses 'frost'.
  backgrounds: {
    fight: 'space',
    shop: 'frost',
    choices: [
      { id: 'space', name: 'Space', asset: 'space' },
      { id: 'sunset', name: 'Sunset', asset: 'sunset' },
      { id: 'ocean', name: 'Deep Ocean', asset: 'ocean' },
      { id: 'forestNight', name: 'Forest Night', asset: 'forestNight' },
      { id: 'desertDusk', name: 'Desert Dusk', asset: 'desertDusk' },
    ],
  },
  // Playable characters shown on the select screen. Each uses a 64x64 sprite sheet.
  // Each character has one special ability, used with its key (Q for player 1, Numpad Enter for player 2).
  // Cooldown is in seconds. The numbers are per special, see the effect in game.js useSpecial.
  characters: [
    { id: 'knight', name: 'Little Knight', asset: 'knight', special: { id: 'shieldWall', name: 'Shield Wall', cooldown: 14, duration: 5 } },
    { id: 'bolt', name: 'Bolt the Robot', asset: 'bolt', special: { id: 'overcharge', name: 'Overcharge', cooldown: 16, duration: 5 } },
    { id: 'dino', name: 'Dino Buddy', asset: 'dino', special: { id: 'stomp', name: 'Stomp', cooldown: 10, radius: 130, damage: 25, knockback: 160 } },
    { id: 'forest', name: 'Forest Ranger', asset: 'forest', special: { id: 'heal', name: 'Heal', cooldown: 18, amount: 3 } },
    { id: 'frog', name: 'Frog Hero', asset: 'frog', special: { id: 'croak', name: 'Croak', cooldown: 12, radius: 200, duration: 4, slow: 0.5 } },
    // Super Character: unlocked in the SHOP room for coins. Its sprite cycles through all five
    // characters, and its one special runs all five specials at once.
    { id: 'super', name: 'Super Character', asset: 'knight', super: true, cost: 500,
      cycle: ['knight', 'bolt', 'dino', 'forest', 'frog'],
      special: { id: 'superBurst', name: 'Super Burst', cooldown: 30, parts: ['shieldWall', 'overcharge', 'stomp', 'heal', 'croak'] } },
  ],
  weapons: {
    gun: { name: 'Assault Rifle', damage: 14, cooldown: 0.12, speed: 760, spread: 0.06, range: 620, ammo: 120, pellets: 1, image: 'gun', scale: 0.2, color: '#ffd166' },
    sniper: { name: 'Sniper', damage: 70, cooldown: 0.9, speed: 1400, spread: 0, range: 1200, ammo: 25, pellets: 1, pierce: true, image: 'sniper', scale: 0.14, color: '#8ecae6' },
    shotgun: { name: 'Shotgun', damage: 9, cooldown: 0.6, speed: 620, spread: 0.32, range: 320, ammo: 40, pellets: 6, image: 'shotgun', scale: 0.4, color: '#ef476f' },
    sword: { name: 'Sword', damage: 34, cooldown: 0.45, range: 90, arc: 1.6, image: 'sword', scale: 0.12, color: '#caf0f8', melee: true },
    knife: { name: 'Knife', damage: 18, cooldown: 0.25, range: 58, arc: 1.2, image: 'knife', scale: 0.1, color: '#adb5bd', melee: true },
  },
  enemies: {
    slime: { name: 'Slime', health: 30, speed: 70, damage: 1, radius: 14, color: '#06d6a0', score: 10, xp: 1, sprite: { image: 'redCrab', frames: 5, frameSize: 48 } },
    bat: { name: 'Bat', health: 18, speed: 120, damage: 1, radius: 11, color: '#9d4edd', score: 15, xp: 1, sprite: { image: 'bolt', frames: 9, frameSize: 64 } },
    brute: { name: 'Brute', health: 120, speed: 45, damage: 2, radius: 24, color: '#e63946', score: 40, xp: 3, sprite: { image: 'brute', whole: true, height: 110 } },
    boss: { name: 'Overlord', health: 900, speed: 55, damage: 2, radius: 46, color: '#ff006e', score: 500, xp: 15, sprite: { image: 'roboGuard', frames: 7, frameSize: 48 } },
    // Dasher: fast and fragile. Fast enough to punish standing still.
    dasher: { name: 'Dasher', health: 14, speed: 185, damage: 1, radius: 10, color: '#ffd166', score: 20, xp: 2, sprite: { image: 'spikeBall', frames: 7, frameSize: 32, tint: '#ffd166' } },
    // Armoured: slow and tough. Every hit does less damage to it (armour), so it needs sustained fire.
    armoured: { name: 'Armoured', health: 220, speed: 38, damage: 2, radius: 26, color: '#adb5bd', score: 60, xp: 4, armour: 0.35, sprite: { image: 'brute', whole: true, height: 96 } },
  },
  powerUps: {
    shield: { name: 'Shield', duration: 6, color: '#4cc9f0', icon: 'S' },
    rage: { name: 'Rage', duration: 8, color: '#ff4d6d', icon: 'R' },
    haste: { name: 'Haste', duration: 8, color: '#ffd166', icon: 'H' },
    heal: { name: 'Heal', amount: 2, color: '#70e000', icon: '+' },
  },
  // autoKinds: pickup kinds that apply as soon as a player walks over them. Others still need E.
  pickups: { dropChance: 0.22, lifetime: 12, pickupRadius: 40, autoKinds: ['powerUp'], ammoSprite: { image: 'coin', frames: 7, frameSize: 32 } },
  // Armour: four pieces. Each starts at wood; each upgrade moves it one tier up.
  // Upgrade cost starts at upgradeStart and goes up by upgradeStep for each later upgrade.
  // Each tier cuts incoming damage by reduction (the same for every piece on that tier).
  armour: {
    pieces: [
      { id: 'helmet', name: 'Helmet', cost: 40 },
      { id: 'chestplate', name: 'Chestplate', cost: 40 },
      { id: 'leggings', name: 'Leggings', cost: 30 },
      { id: 'boots', name: 'Boots', cost: 20 },
    ],
    upgradeStart: 10,
    upgradeStep: 5,
    tiers: [
      { id: 'wood', name: 'Wood', reduction: 0.0, color: '#a47148' },
      { id: 'iron', name: 'Iron', reduction: 0.04, color: '#d0d0d0' },
      { id: 'copper', name: 'Copper', reduction: 0.08, color: '#c87533' },
      { id: 'gold', name: 'Gold', reduction: 0.12, color: '#ffd700' },
      { id: 'diamond', name: 'Diamond', reduction: 0.16, color: '#5ddde0' },
      { id: 'netherite', name: 'Netherite', reduction: 0.2, color: '#4a3b40' },
    ],
  },
  shop: {
    upgrades: [
      { id: 'maxHealth', name: 'Max Health +1', cost: 12, max: 5 },
      { id: 'damage', name: 'Damage +15%', cost: 10, max: 5 },
      { id: 'speed', name: 'Move Speed +10%', cost: 8, max: 4 },
      { id: 'ammo', name: 'Ammo Pack (+30 each)', cost: 6, max: 10 },
    ],
    weapons: [
      { id: 'sniper', cost: 30 },
      { id: 'shotgun', cost: 25 },
      { id: 'sword', cost: 20 },
      { id: 'knife', cost: 8 },
    ],
  },

  coop: { coinPerKill: 1 },
  versus: {
    maxHealth: 40, healthPerUpgrade: 8, damageScale: 0.25, healAmount: 10, coinsPerHit: 2, roundsToWin: 3, pickupEvery: 6, maxPickups: 4,
    // PvP walls, rebuilt at the start of every round. Each wall is `length` tiles long, drawn with `tile` px tiles.
    // edgeColor outlines each wall and tint lightens the tile, so walls stay visible on the dark backgrounds.
    walls: { count: 5, length: 3, tile: 16, spawnClearance: 140, edgeColor: '#f1faee', edgeWidth: 2, shadowColor: '#070b16', shadowWidth: 5, tint: 'rgba(120, 200, 255, 0.35)' },
  },
  // Wave difficulty. Enemy health grows by healthPerWave and speed by speedPerWave each wave (speed capped at speedCap).
  waves: {
    firstWaveEnemies: 7, extraPerWave: 4, bossEvery: 3, spawnInterval: 0.9, breakTime: 3,
    healthPerWave: 0.2, speedPerWave: 0.06, speedCap: 2.2,
  },
  // The base: the hub a 1 PLAYER game starts in. Positions are in world pixels.
  base: {
    // Dust is earned in the real arena: 1 dust per this many points.
    pointsPerDust: 100,
    // Cost of the rainbow colour, in dust.
    rainbowCost: 10,
    // Practice dummies cannot hurt the player; they only soak up shots.
    dummyHealth: 100,
    spawn: { x: 220, y: 450 },
    // Portals: each starts a different kind of match. Solo goes straight into the arena;
    // PvP and Player 2 open the character select, with player 1 keeping the base character.
    portals: {
      solo: { x: 1380, y: 450, radius: 60, label: 'ARENA', mode: 'solo' },
      pvp: { x: 1380, y: 260, radius: 50, label: 'PVP', mode: 'pvp' },
      coop: { x: 1380, y: 640, radius: 50, label: 'PLAYER 2', mode: 'coop' },
    },
    colorStation: { x: 260, y: 240 },
    dustMachine: { x: 620, y: 240 },
    shop: { x: 980, y: 240 },
    practice: { x: 800, y: 620, w: 520, h: 200 },
    // Shop rooms. Walking onto a room's door enters it; walking onto the exit leaves.
    // Items sit on shelves inside the room. Prices come from the shop, colour and rainbow lists.
    rooms: {
      shop: {
        name: 'SHOP', currency: 'coins', door: { x: 980, y: 240, r: 46 },
        exit: { x: 980, y: 520, r: 40 },
        interior: { x: 380, y: 170, w: 1200, h: 520 },
      },
      colour: {
        name: 'COLOUR', currency: 'dust', door: { x: 260, y: 240, r: 46 },
        exit: { x: 260, y: 520, r: 40 },
        interior: { x: 380, y: 170, w: 1200, h: 520 },
      },
      dust: {
        name: 'DUST', currency: 'dust', door: { x: 620, y: 240, r: 46 },
        exit: { x: 620, y: 520, r: 40 },
        interior: { x: 380, y: 170, w: 1200, h: 520 },
      },
    },
    // Ten colours of dust. Each is a fixed price, so the list is ordered by how rare it is.
    colors: [
      { id: 'red', name: 'Red', hex: '#e63946', cost: 0 },
      { id: 'orange', name: 'Orange', hex: '#f77f00', cost: 1 },
      { id: 'yellow', name: 'Yellow', hex: '#ffd166', cost: 1 },
      { id: 'green', name: 'Green', hex: '#70e000', cost: 2 },
      { id: 'teal', name: 'Teal', hex: '#06d6a0', cost: 2 },
      { id: 'cyan', name: 'Cyan', hex: '#4cc9f0', cost: 3 },
      { id: 'blue', name: 'Blue', hex: '#3a86ff', cost: 3 },
      { id: 'purple', name: 'Purple', hex: '#9d4edd', cost: 4 },
      { id: 'pink', name: 'Pink', hex: '#ff006e', cost: 5 },
      { id: 'white', name: 'White', hex: '#f1faee', cost: 6 },
    ],
  },
  // Visual feedback (see updateEffects in game.js). Times are seconds; shake is in pixels.
  effects: { hitSparks: 6, deathSparks: 16, sparkLife: 0.35, popupLife: 0.7, shake: 6, shakeDecay: 30 },
};
if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
