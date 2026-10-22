Space World Tiles: 16 tiles, each 16 x 16 pixels, no spacing.
Tile number N is at column N % 4, row floor(N / 4).

PhaserJS:  this.load.spritesheet('space_world_tiles', 'space_world_tiles.png', { frameWidth: 16, frameHeight: 16 });
Tiled:     open space_world_tiles.tsj to paint maps with these tiles.