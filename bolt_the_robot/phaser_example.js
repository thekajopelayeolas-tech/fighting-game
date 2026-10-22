// PhaserJS 4 — load and play bolt_the_robot
// Put bolt_the_robot_spritesheet.png and bolt_the_robot_atlas.json next to your game file.

function preload() {
  this.load.atlas('bolt_the_robot', 'bolt_the_robot_spritesheet.png', 'bolt_the_robot_atlas.json');
}

function create() {
  this.anims.create({
    key: 'walk',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'walk-', start: 0, end: 8 }),
    frameRate: 10,
    repeat: -1,
  });
  this.anims.create({
    key: 'run',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'run-', start: 0, end: 8 }),
    frameRate: 14,
    repeat: -1,
  });
  this.anims.create({
    key: 'jump',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'jump-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'attack',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'attack-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'shoot',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'shoot-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'stand-front',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'stand-front-', start: 0, end: 0 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'walk-front',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'walk-front-', start: 0, end: 8 }),
    frameRate: 10,
    repeat: -1,
  });
  this.anims.create({
    key: 'run-front',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'run-front-', start: 0, end: 8 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'jump-front',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'jump-front-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'attack-front',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'attack-front-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'shoot-front',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'shoot-front-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'stand-back',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'stand-back-', start: 0, end: 0 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'walk-back',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'walk-back-', start: 0, end: 8 }),
    frameRate: 10,
    repeat: -1,
  });
  this.anims.create({
    key: 'run-back',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'run-back-', start: 0, end: 8 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'jump-back',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'jump-back-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'attack-back',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'attack-back-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'shoot-back',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'shoot-back-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'walk-left',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'walk-left-', start: 0, end: 8 }),
    frameRate: 10,
    repeat: -1,
  });
  this.anims.create({
    key: 'run-left',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'run-left-', start: 0, end: 8 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'jump-left',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'jump-left-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'attack-left',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'attack-left-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });
  this.anims.create({
    key: 'shoot-left',
    frames: this.anims.generateFrameNames('bolt_the_robot', { prefix: 'shoot-left-', start: 0, end: 6 }),
    frameRate: 10,
    repeat: 0,
  });

  const player = this.add.sprite(200, 200, 'bolt_the_robot');
  player.setScale(2);
  player.play('walk');

  // Try every action with the number keys: 1 = walk, 2 = run, 3 = jump, 4 = attack, 5 = shoot, 6 = stand-front, 7 = walk-front, 8 = run-front, 9 = jump-front, 10 = attack-front, 11 = shoot-front, 12 = stand-back, 13 = walk-back, 14 = run-back, 15 = jump-back, 16 = attack-back, 17 = shoot-back, 18 = walk-left, 19 = run-left, 20 = jump-left, 21 = attack-left, 22 = shoot-left
  // Face left: player.setFlipX(true)
  const keys = ['walk', 'run', 'jump', 'attack', 'shoot', 'stand-front', 'walk-front', 'run-front', 'jump-front', 'attack-front', 'shoot-front', 'stand-back', 'walk-back', 'run-back', 'jump-back', 'attack-back', 'shoot-back', 'walk-left', 'run-left', 'jump-left', 'attack-left', 'shoot-left'];
  this.input.keyboard.on('keydown', (event) => {
    const index = Number(event.key) - 1;
    if (keys[index]) player.play(keys[index]);
  });
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 450,
  backgroundColor: '#87ceeb',
  pixelArt: true,
  scene: { preload, create },
});
