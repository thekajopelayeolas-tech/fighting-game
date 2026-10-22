Invader Crab is a 5-frame animation strip.
Each frame is 48 x 48 pixels, left to right.

PhaserJS:
  this.load.spritesheet('invader_crab', 'invader_crab.png', { frameWidth: 48, frameHeight: 48 });
  this.anims.create({ key: 'invader_crab', frames: this.anims.generateFrameNumbers('invader_crab'), frameRate: 6, repeat: -1 });
  this.add.sprite(100, 100, 'invader_crab').play('invader_crab');