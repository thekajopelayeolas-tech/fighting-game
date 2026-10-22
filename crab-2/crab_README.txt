Crab is a 5-frame animation strip.
Each frame is 48 x 48 pixels, left to right.

PhaserJS:
  this.load.spritesheet('crab', 'crab.png', { frameWidth: 48, frameHeight: 48 });
  this.anims.create({ key: 'crab', frames: this.anims.generateFrameNumbers('crab'), frameRate: 6, repeat: -1 });
  this.add.sprite(100, 100, 'crab').play('crab');