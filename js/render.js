// Canvas drawing only. Reads game state; never changes it.
(function (root) {
  'use strict';

  const FS = CONFIG.sprite.frameSize;
  const PLAYER_COLORS = ['#4cc9f0', '#ff9f1c'];
  // Sprite key for a player's chosen character (falls back to the knight).
  // The Super Character cycles through the five character sheets, like the rainbow cycles hues.
  // The step changes every half second, using the game clock, so the cycle is the same for every viewer.
  function characterAsset(p, time) {
    const c = CONFIG.characters.find((ch) => ch.id === p.character);
    if (!c) return 'knight';
    if (c.super && c.cycle) {
      const step = Math.floor((time || 0) * 2) % c.cycle.length;
      return c.cycle[step];
    }
    return c.asset;
  }

  // Tinted frames are cached: one offscreen canvas per sheet, frame, and colour.
  const tintCache = {};

  // Hex colour for one of 12 hue steps (30 degrees each), used for the rainbow.
  // Standard HSV to RGB at full saturation and brightness.
  function rainbowHex(step) {
    const hue = (step % 12) * 30;
    const x = 1 - Math.abs(((hue / 60) % 2) - 1);
    const sector = Math.floor(hue / 60);
    const rgb = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][sector];
    return '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  // Returns a copy of one frame with the colour applied to its solid pixels only.
  // The transparent parts stay transparent, so the character's silhouette is unchanged.
  function tintedFrame(img, row, frame, hex) {
    const key = [img.src, row, frame, hex].join('|');
    if (tintCache[key]) return tintCache[key];
    const c = document.createElement('canvas');
    c.width = FS;
    c.height = FS;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, frame * FS, row * FS, FS, FS, 0, 0, FS, FS);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = hex;
    cx.globalAlpha = 0.55;
    cx.fillRect(0, 0, FS, FS);
    tintCache[key] = c;
    return c;
  }

  // A tinted copy of one frame from a horizontal strip, cached like the sprite-sheet tints.
  function tintedStrip(img, frame, frameSize, hex) {
    const key = ['strip', img.src, frame, frameSize, hex].join('|');
    if (tintCache[key]) return tintCache[key];
    const c = document.createElement('canvas');
    c.width = frameSize;
    c.height = frameSize;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, frame * frameSize, 0, frameSize, frameSize, 0, 0, frameSize, frameSize);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = hex;
    cx.globalAlpha = 0.6;
    cx.fillRect(0, 0, frameSize, frameSize);
    tintCache[key] = c;
    return c;
  }

  // Draws one frame of a sprite sheet. With `tint` (a hex colour) the character takes that colour.
  function drawSprite(ctx, img, row, frame, x, y, size, flip, tint) {
    if (!img || !img.complete || !img.naturalWidth) return false;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    if (tint && typeof document !== 'undefined') {
      ctx.drawImage(tintedFrame(img, row, frame, tint), -size / 2, -size / 2, size, size);
    } else {
      ctx.drawImage(img, frame * FS, row * FS, FS, FS, -size / 2, -size / 2, size, size);
    }
    ctx.restore();
    return true;
  }

  function drawWeapon(ctx, p, assets) {
    const def = CONFIG.weapons[p.weapon];
    if (!def.image || !assets[def.image]) return;
    const img = assets[def.image];
    // Weapon scales were tuned for a 64px body; shrink them with the body so proportions match.
    const scale = (def.scale || 0.2) * (CONFIG.player.drawSize / 64);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim);
    if (Math.cos(p.aim) < 0) ctx.scale(1, -1);
    ctx.translate(p.radius - 4, 0);
    ctx.drawImage(img, 0, -h / 2, w, h);
    ctx.restore();
  }

  function drawPlayer(ctx, p, assets, time) {
    const color = PLAYER_COLORS[p.index] || '#ffffff';
    const blink = p.invuln > 0 && !p.down && Math.floor(time * 20) % 2 === 0;
    if (blink) return;
    if (p.powerUps.shield > 0 && !p.down) {
      ctx.save();
      ctx.strokeStyle = CONFIG.powerUps.shield.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const cfg = CONFIG.sprite;
    // Show the attack pose for a short moment after a melee swing; otherwise walk or stand.
    const swinging = p.swingTime > 0;
    const row = swinging ? cfg.rows.attack : cfg.rows.walk;
    const frames = swinging ? cfg.frames.attack : cfg.frames.walk;
    const frame = swinging
      ? Math.min(frames - 1, Math.floor((1 - p.swingTime / CONFIG.sprite.swingPose) * frames))
      : p.moving ? Math.floor(time * cfg.fps) % frames : 0;
    ctx.save();
    if (p.down) ctx.globalAlpha = 0.35;
    const size = CONFIG.player.drawSize;
    // The equipped dust colour tints the character. The rainbow cycles through hues over time.
    // Hue moves in 30-degree steps, so the tint cache only holds 12 rainbow frames.
    const tint = p.glow === 'rainbow' ? rainbowHex(Math.floor(time * 4) % 12) : p.glowHex;
    const drawn = drawSprite(ctx, assets[characterAsset(p, time)], row, frame, p.x, p.y, size, p.facing < 0, p.glow ? tint : null);
    ctx.restore();
    if (!drawn) {
      ctx.save();
      ctx.globalAlpha = p.down ? 0.35 : 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (!p.down) drawWeapon(ctx, p, assets);
    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(p.down ? p.name + ' DOWN (E to revive)' : p.name, p.x, p.y - CONFIG.player.drawSize / 2 - 6);
    ctx.restore();
  }

  function drawPlayers(ctx, state, assets, time) {
    for (const p of state.players) drawPlayer(ctx, p, assets, time);
  }

  // Draws one frame of a horizontal strip (frames laid out left to right).
  function drawStrip(ctx, img, frame, frameSize, x, y, size, flip, rotation, tint) {
    if (!img || !img.naturalWidth) return false;
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    if (tint && typeof document !== 'undefined') {
      // Tinted strips reuse the cached colour frames; the tint only colours the solid pixels.
      ctx.drawImage(tintedStrip(img, frame, frameSize, tint), -size / 2, -size / 2, size, size);
    } else {
      ctx.drawImage(img, frame * frameSize, 0, frameSize, frameSize, -size / 2, -size / 2, size, size);
    }
    ctx.restore();
    return true;
  }

  // Draws a whole image at a fixed height, keeping its own proportions.
  function drawWhole(ctx, img, x, y, height, flip) {
    if (!img || !img.naturalWidth) return false;
    const width = height * (img.naturalWidth / img.naturalHeight);
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
    ctx.restore();
    return true;
  }

  // X position of the nearest standing player; enemies face toward it.
  function nearestLivingX(state, x) {
    let best = x;
    let bestDist = Infinity;
    for (const p of state.players) {
      if (p.down) continue;
      const d = Math.abs(p.x - x);
      if (d < bestDist) {
        bestDist = d;
        best = p.x;
      }
    }
    return best;
  }

  function drawEnemies(ctx, state, assets, time) {
    for (const e of state.enemies) {
      const def = CONFIG.enemies[e.type];
      const spr = def.sprite;
      const img = spr ? assets[spr.image] : null;
      const size = spr && spr.whole ? spr.height : e.radius * 2.4;
      const half = Math.max(e.radius, size / 2);
      const facingLeft = e.x > nearestLivingX(state, e.x);
      const drawn = spr && (spr.whole
        ? drawWhole(ctx, img, e.x, e.y, size, facingLeft)
        : drawStrip(
          ctx, img,
          spr.frames > 1 ? Math.floor(time * 8 + e.id) % spr.frames : 0,
          spr.frameSize,
          e.x, e.y, size,
          facingLeft,
          spr.spin ? time * 1.5 : 0,
          spr.tint
        ));
      // Armoured enemies get a grey shell ring, so the damage reduction is visible.
      if (def.armour) {
        ctx.save();
        ctx.strokeStyle = 'rgba(173, 181, 189, 0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, half + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (!drawn) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : def.color;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-e.radius, half + 4, e.radius * 2, 4);
      ctx.fillStyle = '#ef476f';
      ctx.fillRect(-e.radius, half + 4, (e.radius * 2 * Math.max(0, e.health)) / e.maxHealth, 4);
      ctx.restore();
    }
  }

  // Neon glow: draws a shape with a soft coloured halo behind it.
  // A soft halo is a wider, faint stroke under the sharp line. Shadow blur is slow to draw every frame.
  function neon(ctx, color, width, draw) {
    const alpha = ctx.globalAlpha;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.18;
    ctx.lineWidth = width * 4;
    draw();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    draw();
    ctx.restore();
  }

  // Draws the base hub: a lit floor, the practice range with dummies, neon stations, and an animated portal.
  // Only reads state and config, so it never changes the game.
  function drawBase(ctx, state, time) {
    const B = CONFIG.base;
    drawBaseFloor(ctx, time);
    drawPracticeRange(ctx, B.practice, time);
    drawDummies(ctx, state);
    drawStations(ctx, B, time);
    for (const id of Object.keys(B.portals)) drawPortal(ctx, B.portals[id], time);
    drawMotes(ctx, time);
  }

  // Draws a shop room: a lit interior, a counter, and the items on display with their prices.
  // The item nearest the player shows an "E to buy" prompt. Only reads state.
  // owned(item) says whether the player already owns an item; owned items show an OWNED tag.
  function drawRoom(ctx, state, roomId, nearest, time, owned) {
    const room = CONFIG.base.rooms[roomId];
    if (!room) return;
    const r = room.interior;
    ctx.save();
    // Room walls and floor.
    ctx.fillStyle = 'rgba(12, 10, 32, 0.92)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    neon(ctx, '#c77dff', 3, function () {
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    });
    // Counter along the bottom of the room.
    ctx.fillStyle = 'rgba(199, 125, 255, 0.18)';
    ctx.fillRect(r.x, r.y + r.h - 110, r.w, 40);
    // Room name sign.
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(room.name, r.x + r.w / 2, r.y + 44);
    ctx.restore();

    // Items on display, each on a small pedestal with its name and price.
    const shelves = Game.roomShelves(roomId);
    for (const s of shelves) {
      const isNear = nearest && nearest.item.key === s.item.key;
      const isOwned = owned ? owned(s.item) : false;
      drawPedestal(ctx, s, isNear, time, isOwned);
    }

    // The exit, shown as a door at the bottom of the room.
    ctx.save();
    ctx.fillStyle = 'rgba(247, 37, 133, 0.35)';
    ctx.fillRect(room.exit.x - 30, room.exit.y - 30, 60, 60);
    ctx.fillStyle = '#f1faee';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', room.exit.x, room.exit.y + 46);
    ctx.restore();

    if (nearest) {
      ctx.save();
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('E to buy ' + nearest.item.name + ' - ' + nearest.item.price + ' ' + nearest.item.currency, r.x + r.w / 2, r.y + r.h - 30);
      ctx.restore();
    }
  }

  // One item on display: a pedestal, a swatch or icon, its name, and its price.
  function drawPedestal(ctx, s, isNear, time, isOwned) {
    const item = s.item;
    ctx.save();
    ctx.fillStyle = isOwned ? 'rgba(29, 49, 87, 0.6)' : 'rgba(29, 49, 87, 0.95)';
    ctx.fillRect(s.x - 62, s.y - 30, 124, 110);
    ctx.strokeStyle = isNear ? '#ffd166' : isOwned ? '#70e000' : 'rgba(76, 201, 240, 0.6)';
    ctx.lineWidth = isNear ? 3 : 2;
    ctx.strokeRect(s.x - 62, s.y - 30, 124, 110);
    if (isOwned) {
      // An OWNED tag across the top of the pedestal; the item below stays visible but dimmed.
      ctx.fillStyle = '#70e000';
      ctx.fillRect(s.x - 48, s.y - 42, 96, 20);
      ctx.fillStyle = '#070b16';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OWNED', s.x, s.y - 27);
    }
    ctx.globalAlpha = isOwned ? 0.6 : 1;
    // Colour items show their colour as a glowing orb; the rainbow cycles through hues.
    if (item.kind === 'colour') {
      const fill = item.rainbow ? 'hsl(' + ((time * 90) % 360) + ', 100%, 60%)' : item.hex;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(s.x, s.y + 8, 18, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#f1faee';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.kind === 'armour' ? 'ARMOUR' : 'WEAPON', s.x, s.y + 12);
    }
    ctx.fillStyle = '#f1faee';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.name, s.x, s.y + 60);
    ctx.fillStyle = item.currency === 'dust' ? '#c77dff' : '#ffd166';
    ctx.fillText(item.price + ' ' + item.currency, s.x, s.y + 76);
    ctx.restore();
  }

  // Dark floor with a perspective grid, and a glowing horizon line.
  function drawBaseFloor(ctx, time) {
    const W = CONFIG.world.width;
    const H = CONFIG.world.height;
    const horizon = H * 0.58;
    ctx.save();
    const g = ctx.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, 'rgba(10, 8, 30, 0.2)');
    g.addColorStop(1, 'rgba(7, 11, 22, 0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, W, H - horizon);
    ctx.strokeStyle = 'rgba(199, 125, 255, 0.22)';
    ctx.lineWidth = 1;
    // Horizontal lines bunch up toward the horizon, and slide toward the viewer over time.
    for (let i = 0; i < 14; i++) {
      const t = (i + (time * 0.6) % 1) / 14;
      const y = horizon + (H - horizon) * t * t;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // Vertical lines fan out from the centre of the horizon.
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2, horizon);
      ctx.lineTo(W / 2 + i * 180, H);
      ctx.stroke();
    }
    neon(ctx, '#c77dff', 2, function () {
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(W, horizon);
      ctx.stroke();
    });
    ctx.restore();
  }

  // The practice range: a striped lane with a neon border that scrolls.
  function drawPracticeRange(ctx, pr, time) {
    ctx.save();
    ctx.fillStyle = 'rgba(7, 11, 22, 0.6)';
    ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    ctx.fillStyle = 'rgba(255, 209, 102, 0.06)';
    for (let x = pr.x; x < pr.x + pr.w; x += 40) ctx.fillRect(x, pr.y, 20, pr.h);
    neon(ctx, '#ffd166', 3, function () {
      ctx.setLineDash([14, 8]);
      ctx.lineDashOffset = -time * 20;
      ctx.strokeRect(pr.x, pr.y, pr.w, pr.h);
      ctx.setLineDash([]);
    });
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PRACTICE RANGE', pr.x + 10, pr.y - 10);
    ctx.restore();
  }

  // Practice dummies: targets with a health bar. They can be hit but never fight back.
  function drawDummies(ctx, state) {
    for (const d of state.dummies || []) {
      ctx.save();
      ctx.fillStyle = '#e9ecef';
      ctx.strokeStyle = '#495057';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(d.x - 22, d.y + 28, 44, 5);
      ctx.fillStyle = '#70e000';
      ctx.fillRect(d.x - 22, d.y + 28, 44 * (d.health / d.maxHealth), 5);
      ctx.restore();
    }
  }

  // Station pillars: a dark block with a neon frame that pulses and a glowing sign.
  function drawStations(ctx, B, time) {
    const stations = [
      { at: B.colorStation, label: 'COLOUR', color: '#4cc9f0' },
      { at: B.dustMachine, label: 'DUST', color: '#ffd166' },
      { at: B.shop, label: 'SHOP', color: '#70e000' },
    ];
    for (const s of stations) {
      const pulse = 0.75 + 0.25 * Math.sin(time * 3 + s.at.x);
      ctx.save();
      ctx.fillStyle = 'rgba(20, 33, 61, 0.95)';
      ctx.fillRect(s.at.x - 62, s.at.y - 46, 124, 92);
      ctx.globalAlpha = pulse;
      neon(ctx, s.color, 3, function () {
        ctx.strokeRect(s.at.x - 62, s.at.y - 46, 124, 92);
      });
      ctx.globalAlpha = 1;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = s.color;
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.label, s.at.x, s.at.y + 6);
      ctx.restore();
    }
  }

  // Portal: a glowing core, three counter-rotating neon rings, and sparks orbiting outside.
  function drawPortal(ctx, portal, time) {
    ctx.save();
    const core = ctx.createRadialGradient(portal.x, portal.y, 4, portal.x, portal.y, portal.radius);
    core.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    core.addColorStop(0.4, 'rgba(199, 125, 255, 0.55)');
    core.addColorStop(1, 'rgba(199, 125, 255, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(portal.x, portal.y, portal.radius, 0, Math.PI * 2);
    ctx.fill();
    const colors = ['#c77dff', '#4cc9f0', '#f72585'];
    for (let i = 0; i < 3; i++) {
      const dir = i % 2 ? -1 : 1;
      const spin = time * (1.2 + i * 0.4) * dir;
      neon(ctx, colors[i], 5 - i, function () {
        ctx.beginPath();
        ctx.arc(portal.x, portal.y, portal.radius - i * 10, spin, spin + Math.PI * 1.6);
        ctx.stroke();
      });
    }
    for (let i = 0; i < 6; i++) {
      const a = time * 1.5 + i * (Math.PI / 3);
      ctx.fillStyle = '#f1faee';
      ctx.beginPath();
      ctx.arc(portal.x + Math.cos(a) * (portal.radius + 8), portal.y + Math.sin(a) * (portal.radius + 8), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f1faee';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((portal.label || 'ARENA') + ' - press E', portal.x, portal.y + portal.radius + 22);
    ctx.restore();
  }

  // Slow drifting light motes across the base, for atmosphere.
  function drawMotes(ctx, time) {
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const x = (i * 157 + time * (10 + (i % 5) * 4)) % CONFIG.world.width;
      const y = ((i * 97) % CONFIG.world.height) * 0.7 + Math.sin(time + i) * 12;
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(time * 2 + i);
      ctx.fillStyle = i % 3 === 0 ? '#ffd166' : '#c77dff';
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
  }
  // PvP walls: each wall is tiled with one solid block from the wall tile sheet (tile 0, top left).
  // A light tint and an outline keep walls readable on dark backgrounds.
  function drawWalls(ctx, state, assets) {
    const img = assets.wallTiles;
    const cfg = CONFIG.versus.walls;
    const tile = cfg.tile;
    for (const wall of state.walls || []) {
      ctx.save();
      for (let y = wall.y; y < wall.y + wall.h; y += tile) {
        for (let x = wall.x; x < wall.x + wall.w; x += tile) {
          if (img && img.naturalWidth) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, tile, tile, x, y, tile, tile);
          } else {
            ctx.fillStyle = '#4a4e69';
            ctx.fillRect(x, y, tile, tile);
          }
        }
      }
      ctx.fillStyle = cfg.tint;
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      // Dark border first, then a light edge inside it, so the shape reads on light and dark backgrounds.
      ctx.strokeStyle = cfg.shadowColor;
      ctx.lineWidth = cfg.shadowWidth;
      ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = cfg.edgeColor;
      ctx.lineWidth = cfg.edgeWidth;
      ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
      ctx.restore();
    }
  }

  function drawProjectiles(ctx, state) {
    for (const pr of state.projectiles) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pr.x, pr.y);
      ctx.lineTo(pr.x - pr.vx * 0.02, pr.y - pr.vy * 0.02);
      ctx.stroke();
    }
  }

  // Each melee swing is drawn from the position of the player who made it.
  function drawSwings(ctx, state) {
    for (const s of state.swings) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.life / 0.18);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.range, s.angle - s.arc / 2, s.angle + s.arc / 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPickups(ctx, state, assets, time) {
    const coin = CONFIG.pickups.ammoSprite;
    for (const pk of state.pickups) {
      const bob = Math.sin(time * 4 + pk.x) * 3;
      if (pk.kind === 'ammo' && drawStrip(ctx, assets[coin.image], Math.floor(time * 10 + pk.x) % coin.frames, coin.frameSize, pk.x, pk.y + bob, 26, false, 0)) {
        continue;
      }
      const color = pk.kind === 'powerUp' ? CONFIG.powerUps[pk.id].color
        : pk.kind === 'heal' ? CONFIG.powerUps.heal.color
        : pk.kind === 'ammo' ? '#ffd166'
        : '#ffffff';
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Sparks are dots that shrink as they fade; popups are damage numbers that fade out.
  function drawEffects(ctx, state) {
    for (const fx of state.effects) {
      const t = Math.max(0, fx.life / fx.maxLife);
      ctx.save();
      ctx.globalAlpha = t;
      ctx.fillStyle = fx.color;
      if (fx.kind === 'spark') {
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 1.5 + 2.5 * t, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(7, 11, 22, 0.8)';
        ctx.lineWidth = 3;
        ctx.strokeText(fx.text, fx.x, fx.y);
        ctx.fillText(fx.text, fx.x, fx.y);
      }
      ctx.restore();
    }
  }

  const api = {
    drawSprite: drawSprite,
    drawPlayers: drawPlayers,
    drawEnemies: drawEnemies,
    drawWalls: drawWalls,
    drawBase: drawBase,
    drawRoom: drawRoom,
    drawProjectiles: drawProjectiles,
    drawSwings: drawSwings,
    drawPickups: drawPickups,
    drawEffects: drawEffects,
  };
  root.Render = api;
})(typeof window !== 'undefined' ? window : globalThis);
