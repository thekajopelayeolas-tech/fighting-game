Platformer Tiles: 180 tiles, each 18 x 18 pixels, no spacing.
Tile number N is at column N % 20, row floor(N / 20).

PhaserJS:  this.load.spritesheet('platformer_tiles', 'platformer_tiles.png', { frameWidth: 18, frameHeight: 18 });
Tiled:     open platformer_tiles.tsj to paint maps with these tiles.