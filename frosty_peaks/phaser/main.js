// Your game in PhaserJS 4. It reads ../game.json (the list of your scenes)
// and each scene's Tiled map, so you can keep editing scenes in Tiled and
// just refresh.
//
// Keys: arrows move the camera, 1-9 play the scene's sounds,
// N goes to the next scene and B goes back.

const ZOOM = 2;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 480;

const isLight = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.55;
};
const prop = (item, name, fallback) => {
  const p = (item.properties || []).find((x) => x.name === name);
  return p ? p.value : fallback;
};
// Paths inside a scene file start from that file's folder. This turns them
// into paths from the game folder: in scenes/level_1.json,
// "../assets/tiles/a.png" becomes "assets/tiles/a.png".
const fromFile = (file, rel) => {
  const parts = file.split('/').slice(0, -1);
  for (const part of rel.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
};

class SceneFromFile extends Phaser.Scene {
  constructor(index, scenes) {
    super('scene' + index);
    this.index = index;
    this.scenes = scenes; // [{ name, file }, …] from game.json
    this.info = scenes[index];
  }

  preload() {
    const file = this.info.file;
    this.load.setPath('../');
    // Pictures and sounds are named by their file, so scenes that share
    // one only load it once.
    const loadAssets = () => {
      const data = this.cache.json.get(file);
      const at = (rel) => fromFile(file, rel);
      const image = (rel) => {
        if (!this.textures.exists(at(rel))) this.load.image(at(rel), at(rel));
      };
      const audio = (rel) => {
        if (!this.cache.audio.exists(at(rel))) this.load.audio(at(rel), at(rel));
      };
      image(data.tilesets[0].image);
      const bg = prop(data, 'background', '');
      if (bg) image(bg);
      for (const layer of data.layers) {
        if (layer.type !== 'objectgroup') continue;
        for (const obj of layer.objects) {
          const kind = prop(obj, 'kind');
          if (kind === 'text') continue;
          const key = at(prop(obj, 'image'));
          if (this.textures.exists(key)) continue;
          if (kind === 'character') this.load.atlas(key, key, at(prop(obj, 'atlas')));
          if (kind === 'strip') {
            this.load.spritesheet(key, key, {
              frameWidth: prop(obj, 'frameWidth'),
              frameHeight: prop(obj, 'frameHeight'),
            });
          }
          if (kind === 'image') image(prop(obj, 'image'));
        }
      }
      prop(data, 'sounds', '').split(',').filter(Boolean).forEach(audio);
      const music = prop(data, 'music', '');
      if (music) audio(music);
    };
    if (!this.cache.tilemap.exists(file)) this.load.tilemapTiledJSON(file, file);
    if (this.cache.json.exists(file)) {
      loadAssets();
    } else {
      this.load.json(file, file);
      this.load.once('filecomplete-json-' + file, loadAssets);
    }
  }

  create() {
    const file = this.info.file;
    const data = this.cache.json.get(file);
    const at = (rel) => fromFile(file, rel);
    const width = data.width * data.tilewidth;
    const height = data.height * data.tileheight;
    const viewHeight = Math.min(height, MAX_HEIGHT);

    // Scenes can be different sizes, so fit the window to this one.
    this.scale.resize(Math.min(width, MAX_WIDTH), viewHeight);
    this.cameras.main.setBackgroundColor(prop(data, 'backgroundColor', '#87ceeb'));
    this.cameras.main.setBounds(0, 0, width, height);

    const bgFile = prop(data, 'background', '');
    if (bgFile) {
      const bg = this.add.image(0, height, at(bgFile)).setOrigin(0, 1);
      bg.setScale(Math.max(width / bg.width, height / bg.height));
    }

    const map = this.make.tilemap({ key: file });
    const tiles = map.addTilesetImage(data.tilesets[0].name, at(data.tilesets[0].image));
    map.createLayer('Ground', tiles);
    map.createLayer('Decor', tiles);

    // Things with a game role, e.g. this.byRole.player[0] is your player
    // and this.byRole.goal is a list of goals.
    this.byRole = {};
    for (const layer of data.layers) {
      if (layer.type !== 'objectgroup') continue;
      const isUi = layer.name === 'UI';
      for (const obj of layer.objects) {
        const kind = prop(obj, 'kind');
        const key = kind === 'text' ? '' : at(prop(obj, 'image'));
        const scale = prop(obj, 'scale', 1);
        let thing;
        if (kind === 'text') {
          thing = this.add.text(obj.x, obj.y, prop(obj, 'text', ''), {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: prop(obj, 'fontSize', 12) + 'px',
            color: prop(obj, 'color', '#ffffff'),
          });
          if (isLight(prop(obj, 'color', '#ffffff'))) thing.setStroke('#222034', 3);
        } else if (kind === 'character') {
          const action = prop(obj, 'action', 'walk');
          const animKey = key + '-' + action;
          if (!this.anims.exists(animKey)) {
            this.anims.create({
              key: animKey,
              frames: this.anims.generateFrameNames(key, { prefix: action + '-', start: 0, end: prop(obj, 'frames', 1) - 1 }),
              frameRate: 10,
              repeat: -1,
            });
          }
          thing = this.add.sprite(obj.x, obj.y, key).play(animKey);
        } else if (kind === 'strip') {
          if (!this.anims.exists(key)) {
            this.anims.create({ key, frames: this.anims.generateFrameNumbers(key), frameRate: 4, repeat: -1 });
          }
          thing = this.add.sprite(obj.x, obj.y, key).play(key);
        } else {
          thing = this.add.image(obj.x, obj.y, key);
        }
        thing.setOrigin(0, 0).setScale(scale);
        if (prop(obj, 'flipX', false) && thing.setFlipX) thing.setFlipX(true);
        if (isUi) thing.setScrollFactor(0).setDepth(1000);
        const role = prop(obj, 'role', '');
        if (role) {
          thing.setData('role', role);
          (this.byRole[role] = this.byRole[role] || []).push(thing);
        }
      }
    }

    // Sounds: 1-9 play this scene's sound effects.
    const sounds = prop(data, 'sounds', '').split(',').filter(Boolean).map(at);
    this.input.keyboard.on('keydown', (event) => {
      const n = Number(event.key);
      if (n >= 1 && n <= sounds.length) this.sound.play(sounds[n - 1]);
    });

    // Music loops while this scene is on. Browsers only play sound after
    // the first click or key press, so it may wait until then.
    const music = prop(data, 'music', '');
    if (music) {
      this.music = this.sound.add(at(music), { loop: true, volume: 0.5 });
      const start = () => this.music && this.music.play();
      if (this.sound.locked) this.sound.once('unlocked', start);
      else start();
      this.events.once('shutdown', () => {
        this.sound.off('unlocked', start);
        this.music.destroy();
        this.music = null;
      });
    }

    // N = next scene, B = back.
    if (this.scenes.length > 1) {
      this.input.keyboard.on('keydown-N', () => this.goToScene(this.index + 1));
      this.input.keyboard.on('keydown-B', () => this.goToScene(this.index - 1));
      const label = (this.index + 1) + '/' + this.scenes.length + '  ' + this.info.name + '   N = next   B = back';
      this.add
        .text(4, viewHeight - 4, label, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '9px',
          color: '#ffffff',
          backgroundColor: '#00000099',
          padding: { x: 3, y: 2 },
          resolution: ZOOM,
        })
        .setOrigin(0, 1)
        .setScrollFactor(0)
        .setDepth(2000);
    }

    this.cursors = this.input.keyboard.createCursorKeys();
  }

  // Go to another scene by number (0 is the first) or by name,
  // e.g. this.goToScene('Game Over') when the player touches a goal.
  goToScene(which) {
    const index = typeof which === 'number' ? which : this.scenes.findIndex((s) => s.name === which);
    if (index < 0 || index >= this.scenes.length || index === this.index) return;
    this.scene.start('scene' + index);
  }

  update() {
    const cam = this.cameras.main;
    const speed = 4;
    if (this.cursors.left.isDown) cam.scrollX -= speed;
    if (this.cursors.right.isDown) cam.scrollX += speed;
    if (this.cursors.up.isDown) cam.scrollY -= speed;
    if (this.cursors.down.isDown) cam.scrollY += speed;
  }
}

// One Phaser scene per scene in game.json. The first one starts the game.
fetch('../game.json')
  .then((res) => res.json())
  .then((game) => {
    new Phaser.Game({
      type: Phaser.AUTO,
      width: MAX_WIDTH,
      height: MAX_HEIGHT,
      zoom: ZOOM,
      pixelArt: true,
      scene: game.scenes.map((info, i) => new SceneFromFile(i, game.scenes)),
    });
  })
  .catch(() => {
    document.body.innerHTML =
      '<p style="color:white;font-family:sans-serif;padding:24px">Start a web server in the game folder first: <code>python -m http.server 8000</code>, then open http://localhost:8000/phaser/</p>';
  });
