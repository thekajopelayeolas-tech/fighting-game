# Your game in Pygame. Run from anywhere:  python pygame/main.py
# It reads ../game.json (the list of your scenes) and each scene's Tiled map.
#
# Keys: arrows move the camera, 1-9 play the scene's sounds,
# N goes to the next scene and B goes back.
import json
import os

import pygame

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ZOOM = 2
FPS = 60
MAX_WIDTH, MAX_HEIGHT = 800, 480


def prop(item, name, default=None):
    for p in item.get("properties", []):
        if p["name"] == name:
            return p["value"]
    return default


class Scene:
    """One scene from game.json, loaded and ready to draw."""

    def __init__(self, entry):
        self.name = entry["name"]
        self.file = entry["file"]
        with open(self.path(os.path.basename(self.file))) as f:
            data = json.load(f)
        tile = data["tilewidth"]
        self.world_w, self.world_h = data["width"] * tile, data["height"] * tile
        self.view_w, self.view_h = min(self.world_w, MAX_WIDTH), min(self.world_h, MAX_HEIGHT)

        # Draw the background + tiles once into a big "world" picture.
        self.world = pygame.Surface((self.world_w, self.world_h))
        self.world.fill(pygame.Color(prop(data, "backgroundColor", "#87ceeb")))
        bg_file = prop(data, "background", "")
        if bg_file:
            bg = pygame.image.load(self.path(bg_file)).convert_alpha()
            cover = max(self.world_w / bg.get_width(), self.world_h / bg.get_height())
            bg = pygame.transform.scale(bg, (int(bg.get_width() * cover), int(bg.get_height() * cover)))
            self.world.blit(bg, (0, self.world_h - bg.get_height()))
        ts = data["tilesets"][0]
        tiles = pygame.image.load(self.path(ts["image"])).convert_alpha()
        for layer in data["layers"]:
            if layer["type"] != "tilelayer":
                continue
            for i, gid in enumerate(layer["data"]):
                if gid:
                    index = gid - 1
                    src = pygame.Rect((index % ts["columns"]) * tile, (index // ts["columns"]) * tile, tile, tile)
                    self.world.blit(tiles, ((i % data["width"]) * tile, (i // data["width"]) * tile), src)

        font_cache = {}
        self.things = []  # (frames, x, y, is_ui, role)
        for layer in data["layers"]:
            if layer["type"] != "objectgroup":
                continue
            is_ui = layer["name"] == "UI"
            for obj in layer["objects"]:
                role = prop(obj, "role", "")
                if prop(obj, "kind") == "text":
                    size = int(prop(obj, "fontSize", 12) * prop(obj, "scale", 1))
                    font = font_cache.setdefault(size, pygame.font.SysFont("arialblack,arial", size, bold=True))
                    label = font.render(prop(obj, "text", ""), True, pygame.Color(prop(obj, "color", "#ffffff")))
                    self.things.append(([label], obj["x"], obj["y"], is_ui, role))
                else:
                    self.things.append((self.load_frames(obj), obj["x"], obj["y"], is_ui, role))

        self.sound_files = [s for s in prop(data, "sounds", "").split(",") if s]
        self.music = prop(data, "music", "")

    def path(self, rel):
        """Paths inside a scene file start from that file's folder."""
        return os.path.normpath(os.path.join(ROOT, os.path.dirname(self.file), rel))

    def load_frames(self, obj):
        """Returns the list of frames (Surfaces) an object animates through."""
        kind = prop(obj, "kind")
        size = (max(1, int(obj["width"])), max(1, int(obj["height"])))
        if kind == "character":
            sheet = pygame.image.load(self.path(prop(obj, "image"))).convert_alpha()
            with open(self.path(prop(obj, "atlas"))) as f:
                atlas = json.load(f)
            action = prop(obj, "action", "walk")
            frames = []
            for i in range(prop(obj, "frames", 1)):
                r = atlas["frames"][f"{action}-{i}"]["frame"]
                frames.append(sheet.subsurface(pygame.Rect(r["x"], r["y"], r["w"], r["h"])))
        elif kind == "strip":
            sheet = pygame.image.load(self.path(prop(obj, "image"))).convert_alpha()
            fw, fh = prop(obj, "frameWidth"), prop(obj, "frameHeight")
            frames = [sheet.subsurface(pygame.Rect(i * fw, 0, fw, fh)) for i in range(prop(obj, "frames", 1))]
        else:
            frames = [pygame.image.load(self.path(prop(obj, "image"))).convert_alpha()]
        frames = [pygame.transform.scale(f, size) for f in frames]
        if prop(obj, "flipX", False):
            frames = [pygame.transform.flip(f, True, False) for f in frames]
        return frames


def main():
    pygame.init()
    with open(os.path.join(ROOT, "game.json")) as f:
        game = json.load(f)
    entries = game["scenes"]
    pygame.display.set_caption(game.get("title", "My Game"))
    screen = pygame.display.set_mode((MAX_WIDTH * ZOOM, MAX_HEIGHT * ZOOM))
    clock = pygame.time.Clock()
    label_font = pygame.font.SysFont("arial", 18, bold=True)

    try:
        pygame.mixer.init()
        has_audio = True
    except pygame.error:
        has_audio = False  # No audio device — the game still runs.

    loaded = {}  # scene number -> Scene (each one loads the first time you visit it)
    index, scene = -1, None
    sounds = []
    cam_x = cam_y = 0

    def go_to_scene(n):
        """Switches to scene number n (0 is the first)."""
        nonlocal index, scene, screen, sounds, cam_x, cam_y
        if n < 0 or n >= len(entries) or n == index:
            return
        if n not in loaded:
            loaded[n] = Scene(entries[n])
        index, scene = n, loaded[n]
        screen = pygame.display.set_mode((scene.view_w * ZOOM, scene.view_h * ZOOM))
        cam_x = cam_y = 0
        sounds = []
        if has_audio:
            sounds = [pygame.mixer.Sound(scene.path(s)) for s in scene.sound_files]
            pygame.mixer.music.stop()
            if scene.music:
                pygame.mixer.music.load(scene.path(scene.music))
                pygame.mixer.music.play(-1)

    go_to_scene(0)

    frame, timer = 0, 0
    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN:
                if pygame.K_1 <= event.key <= pygame.K_9:
                    n = event.key - pygame.K_1
                    if n < len(sounds):
                        sounds[n].play()
                if event.key == pygame.K_n:
                    go_to_scene(index + 1)
                if event.key == pygame.K_b:
                    go_to_scene(index - 1)

        keys = pygame.key.get_pressed()
        cam_x += (keys[pygame.K_RIGHT] - keys[pygame.K_LEFT]) * 3
        cam_y += (keys[pygame.K_DOWN] - keys[pygame.K_UP]) * 3
        cam_x = max(0, min(cam_x, scene.world_w - scene.view_w))
        cam_y = max(0, min(cam_y, scene.world_h - scene.view_h))

        timer += clock.tick(FPS)
        if timer >= 100:  # animations at 10 frames per second
            timer = 0
            frame += 1

        view = pygame.Surface((scene.view_w, scene.view_h))
        view.blit(scene.world, (-cam_x, -cam_y))
        for frames, x, y, is_ui, role in scene.things:
            image = frames[frame % len(frames)]
            view.blit(image, (x, y) if is_ui else (x - cam_x, y - cam_y))
        screen.blit(pygame.transform.scale(view, screen.get_size()), (0, 0))
        if len(entries) > 1:
            text = f"{index + 1}/{len(entries)}  {scene.name}   N = next   B = back"
            label = label_font.render(text, True, (255, 255, 255))
            box = pygame.Surface((label.get_width() + 12, label.get_height() + 6), pygame.SRCALPHA)
            box.fill((0, 0, 0, 150))
            box.blit(label, (6, 3))
            screen.blit(box, (8, screen.get_height() - box.get_height() - 8))
        pygame.display.flip()

    pygame.quit()


if __name__ == "__main__":
    main()
