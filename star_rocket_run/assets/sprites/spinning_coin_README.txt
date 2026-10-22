Spinning Coin is a 7-frame animation strip.
Each frame is 32 x 32 pixels, left to right.

PhaserJS:
  this.load.spritesheet('spinning_coin', 'spinning_coin.png', { frameWidth: 32, frameHeight: 32 });
  this.anims.create({ key: 'spinning_coin', frames: this.anims.generateFrameNumbers('spinning_coin'), frameRate: 6, repeat: -1 });
  this.add.sprite(100, 100, 'spinning_coin').play('spinning_coin');