// Canvas drawing only. Reads game state; never changes it.
(function (root) {
  'use strict';

  const FS = CONFIG.sprite.frameSize;
  const PLAYER_COLORS = ['#4cc9f0', '#ff9f1c'];
  // Sprite key for a player's chosen character (falls back to the knight).
  function characterAsset(p) {
    const c = CONFIG.characters.find((ch) => ch.id === p.character);
    return c ? c.asset : 'knight';
  }

  function drawSprite(ctx, img, row, frame, x, y, size, flip) {
    if (!img || !img.complete || !img.naturalWidth) return false;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, frame * FS, row * FS, FS, FS, -size / 2, -size / 2, size, size);
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
    const frame = p.moving ? Math.floor(time * cfg.fps) % cfg.frames.walk : 0;
    ctx.save();
    if (p.down) ctx.globalAlpha = 0.35;
    const size = CONFIG.player.drawSize;
    const drawn = drawSprite(ctx, assets[characterAsset(p)], cfg.rows.walk, frame, p.x, p.y, size, p.facing < 0);
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
  function drawStrip(ctx, img, frame, frameSize, x, y, size, flip, rotation) {
    if (!img || !img.naturalWidth) return false;
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, frame * frameSize, 0, frameSize, frameSize, -size / 2, -size / 2, size, size);
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
      const size = e.radius * 2.4;
      const half = Math.max(e.radius, size / 2);
      const drawn = spr && drawStrip(
        ctx, img,
        spr.frames > 1 ? Math.floor(time * 8 + e.id) % spr.frames : 0,
        spr.frameSize,
        e.x, e.y, size,
        e.x > nearestLivingX(state, e.x),
        e.type === 'brute' ? time * 1.5 : 0
      );
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

  const api = {
    drawSprite: drawSprite,
    drawPlayers: drawPlayers,
    drawEnemies: drawEnemies,
    drawProjectiles: drawProjectiles,
    drawSwings: drawSwings,
    drawPickups: drawPickups,
  };
  root.Render = api;
})(typeof window !== 'undefined' ? window : globalThis);
