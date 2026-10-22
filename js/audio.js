// Sound effects and music. Every call is a no-op if audio is unavailable.
(function (root) {
  'use strict';

  const SOUNDS = {
    laser: { file: 'assets/sounds/laser_1.mp3', volume: 0.35 },
    swing: { file: 'assets/sounds/pirate_swing.mp3', volume: 0.3 },
    dash: { file: 'assets/sounds/dash_whoosh.mp3', volume: 0.5 },
    coin: { file: 'assets/sounds/coin_pickup.mp3', volume: 0.5 },
    drop: { file: 'assets/sounds/drop.mp3', volume: 0.5 },
    confirm: { file: 'assets/sounds/confirm.mp3', volume: 0.5 },
    select: { file: 'assets/sounds/select.mp3', volume: 0.4 },
    back: { file: 'assets/sounds/back.mp3', volume: 0.4 },
    next: { file: 'assets/sounds/next.mp3', volume: 0.5 },
    win: { file: 'assets/sounds/rover_win.mp3', volume: 0.6 },
    hurt: { file: 'assets/sounds/jump_1.mp3', volume: 0.45 },
    powerUp: { file: 'assets/sounds/spring_bounce.mp3', volume: 0.5 },
    footstep: { file: 'assets/sounds/footstep_snow.mp3', volume: 0.15 },
  };
  const MUSIC = { file: 'assets/sounds/space_adventure_music.mp3', volume: 0.25 };

  let music = null;
  let muted = false;

  function hasAudio() {
    return typeof Audio !== 'undefined';
  }

  function safePlay(el) {
    const p = el.play();
    if (p && p.catch) p.catch(function () {});
  }

  function play(name) {
    const def = SOUNDS[name];
    if (!def || muted || !hasAudio()) return;
    const el = new Audio(def.file);
    el.volume = def.volume;
    safePlay(el);
  }

  function playMusic() {
    if (muted || !hasAudio()) return;
    if (!music) {
      music = new Audio(MUSIC.file);
      music.loop = true;
      music.volume = MUSIC.volume;
    }
    safePlay(music);
  }

  function stopMusic() {
    if (music) {
      music.pause();
      music.currentTime = 0;
    }
  }

  function toggleMute() {
    muted = !muted;
    if (muted) stopMusic();
    else playMusic();
    return muted;
  }

  root.Sound = { play: play, playMusic: playMusic, stopMusic: stopMusic, toggleMute: toggleMute };
})(typeof window !== 'undefined' ? window : globalThis);
