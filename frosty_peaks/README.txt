Frosty Peaks
============

Made with Reactify Asset Studio.

game.json        the list of scenes (just this one)
scene.png        a picture of your scene
scene.json       your scene as a Tiled map (open it in Tiled: mapeditor.org)
assets/          every picture and sound your scene uses
phaser/          your scene running in PhaserJS
pygame/          your scene running in Pygame

Run the PhaserJS version
------------------------
Browsers only load game files from a web server, so start one in THIS folder:

    python -m http.server 8000

then open http://localhost:8000/phaser/ in your browser.

Run the Pygame version
----------------------
    pip install pygame
    python pygame/main.py

Controls
--------
Arrow keys move the camera if a scene is bigger than the window.
Press 1-4 to play your sounds: 1 = Footstep (Snow), 2 = Jump 1, 3 = Spring Bounce, 4 = Snowy Peaks Music.
