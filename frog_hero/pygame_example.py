# Pygame — load and play frog_hero
# Run with:  pip install pygame  then  python pygame_example.py
import pygame

FRAME_W, FRAME_H = 64, 64
# action: (row in the sheet, number of frames)
ANIMATIONS = {
    "walk": (0, 9),
    "run": (1, 9),
    "jump": (2, 7),
    "attack": (3, 7),
    "shoot": (4, 7),
    "stand-front": (5, 1),
    "walk-front": (6, 9),
    "run-front": (7, 9),
    "jump-front": (8, 7),
    "attack-front": (9, 7),
    "shoot-front": (10, 7),
    "stand-back": (11, 1),
    "walk-back": (12, 9),
    "run-back": (13, 9),
    "jump-back": (14, 7),
    "attack-back": (15, 7),
    "shoot-back": (16, 7),
    "walk-left": (17, 9),
    "run-left": (18, 9),
    "jump-left": (19, 7),
    "attack-left": (20, 7),
    "shoot-left": (21, 7),
}


def load_animations(path):
    sheet = pygame.image.load(path).convert_alpha()
    anims = {}
    for action, (row, count) in ANIMATIONS.items():
        frames = []
        for i in range(count):
            frame = sheet.subsurface(pygame.Rect(i * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H))
            frames.append(pygame.transform.scale(frame, (FRAME_W * 2, FRAME_H * 2)))
        anims[action] = frames
    return anims


def main():
    pygame.init()
    screen = pygame.display.set_mode((800, 450))
    pygame.display.set_caption("frog_hero — press 1-22 to change action")
    clock = pygame.time.Clock()
    anims = load_animations("frog_hero_spritesheet.png")
    actions = list(ANIMATIONS.keys())
    action, frame, timer = "walk", 0, 0

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN and pygame.K_1 <= event.key < pygame.K_1 + len(actions):
                action, frame = actions[event.key - pygame.K_1], 0

        timer += clock.tick(60)
        if timer > 100:  # 10 frames per second
            timer = 0
            frame = (frame + 1) % len(anims[action])

        screen.fill((135, 206, 235))
        screen.blit(anims[action][frame], (400 - FRAME_W, 225 - FRAME_H))
        pygame.display.flip()

    pygame.quit()


if __name__ == "__main__":
    main()
