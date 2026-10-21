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
    frames: { walk: 9, walkFront: 9, walkBack: 9 },
    fps: 10,
  },
  assets: {
    knight: 'assets/characters/knight.png',
    gun: 'assets/weapons/gun.png',
    sword: 'assets/weapons/sword.png',
    sniper: 'assets/weapons/sniper.png',
    knife: 'assets/weapons/knife.png',
    crab: 'assets/sprites/invader_crab.png',
    meteor: 'assets/sprites/space_meteor_large.png',
    coin: 'assets/sprites/spinning_coin.png',
    space: 'assets/backgrounds/space.png',
    frost: 'assets/backgrounds/frost.png',
    bolt: 'assets/characters/bolt.png',
    dino: 'assets/characters/dino.png',
    forest: 'assets/characters/forest.png',
    frog: 'assets/characters/frog.png',
  },
  backgrounds: { fight: 'space', shop: 'frost' },
  // Playable characters shown on the select screen. Each uses a 64x64 sprite sheet.
  characters: [
    { id: 'knight', name: 'Little Knight', asset: 'knight' },
    { id: 'bolt', name: 'Bolt the Robot', asset: 'bolt' },
    { id: 'dino', name: 'Dino Buddy', asset: 'dino' },
    { id: 'forest', name: 'Forest Ranger', asset: 'forest' },
    { id: 'frog', name: 'Frog Hero', asset: 'frog' },
  ],
  weapons: {
    gun: { name: 'Assault Rifle', damage: 14, cooldown: 0.12, speed: 760, spread: 0.06, range: 620, ammo: 120, pellets: 1, image: 'gun', scale: 0.2, color: '#ffd166' },
    sniper: { name: 'Sniper', damage: 70, cooldown: 0.9, speed: 1400, spread: 0, range: 1200, ammo: 25, pellets: 1, pierce: true, image: 'sniper', scale: 0.14, color: '#8ecae6' },
    shotgun: { name: 'Shotgun', damage: 9, cooldown: 0.6, speed: 620, spread: 0.32, range: 320, ammo: 40, pellets: 6, image: null, color: '#ef476f' },
    sword: { name: 'Sword', damage: 34, cooldown: 0.45, range: 90, arc: 1.6, image: 'sword', scale: 0.12, color: '#caf0f8', melee: true },
    knife: { name: 'Knife', damage: 18, cooldown: 0.25, range: 58, arc: 1.2, image: 'knife', scale: 0.1, color: '#adb5bd', melee: true },
  },
  enemies: {
    slime: { name: 'Slime', health: 30, speed: 70, damage: 1, radius: 14, color: '#06d6a0', score: 10, xp: 1 },
    bat: { name: 'Bat', health: 18, speed: 120, damage: 1, radius: 11, color: '#9d4edd', score: 15, xp: 1, sprite: { image: 'crab', frames: 5, frameSize: 48 } },
    brute: { name: 'Brute', health: 120, speed: 45, damage: 2, radius: 24, color: '#e63946', score: 40, xp: 3, sprite: { image: 'meteor', frames: 1, frameSize: 64 } },
    boss: { name: 'Overlord', health: 900, speed: 55, damage: 2, radius: 46, color: '#ff006e', score: 500, xp: 15 },
  },
  powerUps: {
    shield: { name: 'Shield', duration: 6, color: '#4cc9f0', icon: 'S' },
    rage: { name: 'Rage', duration: 8, color: '#ff4d6d', icon: 'R' },
    haste: { name: 'Haste', duration: 8, color: '#ffd166', icon: 'H' },
    heal: { name: 'Heal', amount: 2, color: '#70e000', icon: '+' },
  },
  // autoKinds: pickup kinds that apply as soon as a player walks over them. Others still need E.
  pickups: { dropChance: 0.22, lifetime: 12, pickupRadius: 40, autoKinds: ['powerUp'], ammoSprite: { image: 'coin', frames: 7, frameSize: 32 } },
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
  versus: { maxHealth: 40, healthPerUpgrade: 8, damageScale: 0.25, healAmount: 10, coinsPerHit: 2, roundsToWin: 3, pickupEvery: 6, maxPickups: 4 },
  waves: { firstWaveEnemies: 6, extraPerWave: 3, bossEvery: 5, spawnInterval: 1.1, breakTime: 3 },
};
if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
