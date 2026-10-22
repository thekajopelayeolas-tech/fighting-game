Frog Hero — animated character

frog_hero_spritesheet.png   every action in one image (one row per action)
frog_hero_atlas.json        frame names for PhaserJS (walk-0, walk-1, …)
strips/                   each action as its own strip, if you prefer
phaser_example.js         copy-paste PhaserJS code
pygame_example.py         copy-paste Pygame code

Every frame is 64 x 64 pixels.
Side actions face right. To face left, flip them (Phaser: setFlipX(true), Pygame: pygame.transform.flip).
front = facing the screen, back = facing away (great for top-down games).

Rows in the spritesheet:
  row 0: walk (9 frames)
  row 1: run (9 frames)
  row 2: jump (7 frames)
  row 3: attack (7 frames)
  row 4: shoot (7 frames)
  row 5: stand-front (1 frames)
  row 6: walk-front (9 frames)
  row 7: run-front (9 frames)
  row 8: jump-front (7 frames)
  row 9: attack-front (7 frames)
  row 10: shoot-front (7 frames)
  row 11: stand-back (1 frames)
  row 12: walk-back (9 frames)
  row 13: run-back (9 frames)
  row 14: jump-back (7 frames)
  row 15: attack-back (7 frames)
  row 16: shoot-back (7 frames)
  row 17: walk-left (9 frames)
  row 18: run-left (9 frames)
  row 19: jump-left (7 frames)
  row 20: attack-left (7 frames)
  row 21: shoot-left (7 frames)