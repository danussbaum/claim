  // --- Bewegliche Saeulen ---
  let movingBlocks = [];
  const MOVING_BLOCK_INTERVAL = 1100;

  function updateMovingBlocks(delta) {
    if (!movingBlocks.length) return;
    for (const mb of movingBlocks) {
      mb.timer += delta;
      if (mb.timer < MOVING_BLOCK_INTERVAL) continue;
      mb.timer = Math.min(mb.timer - MOVING_BLOCK_INTERVAL, MOVING_BLOCK_INTERVAL);
      let moved = false;
      for (let attempt = 0; attempt < 2 && !moved; attempt++) {
        const nr = mb.r + mb.dr, nc = mb.c + mb.dc;
        const blockedCell = !inBounds(nc, nr) || nr < 1 || nr > ROWS - 2 || nc < 1 || nc > COLS - 2 ||
          grid[nr][nc] === TERRITORY || grid[nr][nc] === BLOCK || grid[nr][nc] === PIT ||
          enemies.some(e => e.r === nr && e.c === nc) || (nc === px && nr === py);
        if (blockedCell) { mb.dr = -mb.dr; mb.dc = -mb.dc; continue; }
        if (grid[nr][nc] === TRAIL) cutTrailAt(nc, nr, '🪨');
        grid[mb.r][mb.c] = EMPTY;
        mb.prevR = mb.r; mb.prevC = mb.c;
        mb.r = nr; mb.c = nc;
        grid[nr][nc] = BLOCK;
        moved = true;
      }
    }
  }

  function moveEnemies() {
    enemyStepTime = performance.now();
    // Ueber eine Kopie laufen: killEnemyByShot() kann waehrend der Schleife
    // Waechter entfernen und neue anhaengen.
    for (const e of enemies.slice()) {
      if (enemies.indexOf(e) === -1) continue; // in diesem Tick bereits entfernt
      e.prevR = e.r; e.prevC = e.c;
      const opts = [[0,-1],[0,1],[-1,0],[1,0]].filter(([dx,dy]) => {
        const nx = e.c + dx, ny = e.r + dy;
        if (!inBounds(nx, ny)) return false;
        if (grid[ny][nx] === TERRITORY) return false;
        if (grid[ny][nx] === BLOCK) return false; // Gruben duerfen Waechter nutzen, Saeulen nicht
        if (grid[ny][nx] === TRAIL && performance.now() < trailGuardUntil) return false;
        return true;
      });
      if (opts.length === 0) continue;

      if (e.personality === 'nervous' && Math.random() < 0.28) {
        continue; // stockt kurz, wirkt unruhig
      }

      let choice;
      const now = performance.now();
      const alarmActive = now < alarmUntil;

      // Waechter jagen nur, was sie sehen - und merken es sich kurz.
      const seesPlayer = canSeePlayer(e);
      if (seesPlayer) { e.huntingActive = true; e.lastSeenAt = now; }
      else if (e.huntingActive && now - e.lastSeenAt > VISION_MEMORY) e.huntingActive = false;

      const isHuntingNow = alarmActive || e.huntingActive;
      if (isHuntingNow && !e.wasHunting) sndHunterAlert();
      e.wasHunting = isHuntingNow;

      if (isHuntingNow) {
        let best = null, bestDist = Infinity;
        for (const [dx, dy] of opts) {
          const nx = e.c + dx, ny = e.r + dy;
          const d = Math.abs(nx - px) + Math.abs(ny - py);
          if (d < bestDist) { bestDist = d; best = [dx, dy]; }
        }
        choice = best;
      } else if (e.personality === 'cutter' && trail.length) {
        // Sucht die eigene Linie statt den Spieler
        let target = trail[0], tDist = Infinity;
        for (const [tx, ty] of trail) {
          const d = Math.abs(tx - e.c) + Math.abs(ty - e.r);
          if (d < tDist) { tDist = d; target = [tx, ty]; }
        }
        let best = null, bestDist = Infinity;
        for (const [dx, dy] of opts) {
          const nx = e.c + dx, ny = e.r + dy;
          const d = Math.abs(nx - target[0]) + Math.abs(ny - target[1]);
          if (d < bestDist) { bestDist = d; best = [dx, dy]; }
        }
        choice = best;
      } else if (e.personality === 'guardian') {
        let best = null, bestScore = -Infinity;
        for (const [dx, dy] of opts) {
          const nx = e.c + dx, ny = e.r + dy;
          let terrCount = 0;
          for (const [ddx, ddy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const cx = nx + ddx, cy = ny + ddy;
            if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) continue;
            if (grid[cy][cx] === TERRITORY) terrCount++;
          }
          const score = -terrCount + Math.random() * 0.5;
          if (score > bestScore) { bestScore = score; best = [dx, dy]; }
        }
        choice = best;
      } else if (e.personality === 'nervous') {
        choice = opts[Math.floor(Math.random() * opts.length)];
      } else {
        if (Math.random() < 0.65) {
          const keepGoing = opts.find(([dx,dy]) => dx === e.dc0 && dy === e.dr0);
          choice = keepGoing || opts[Math.floor(Math.random() * opts.length)];
        } else {
          choice = opts[Math.floor(Math.random() * opts.length)];
        }
      }

      e.dc0 = choice[0]; e.dr0 = choice[1];
      e.c += choice[0]; e.r += choice[1];

      if (e.c === px && e.r === py) {
        const nowT = performance.now();
        if (nowT >= shieldUntil) {
          if (nowT < spikesUntil) {
            killEnemyByShot(e);
            continue;
          }
          endGame('A guard caught you.', '😈');
          return;
        }
      } else if (grid[e.r][e.c] === TRAIL) {
        if (e.personality === 'cutter') {
          cutTrailAt(e.c, e.r, '✂️');
        } else {
          endGame('A guard cut your line.', '✂️');
          return;
        }
      }
    }
  }

  function triggerDeathFlash() {
    const flash = document.getElementById('deathFlash');
    flash.classList.remove('active');
    void flash.offsetWidth;
    flash.classList.add('active');
  }

  function endGame(reason, emoji) {
    if (!running || dying) return; // verhindert doppelten Lebensabzug bei mehrfachem Aufruf
    if (tutorialActive) {
      // Im Tutorial kostet ein Fehler nichts - die Etappe startet einfach neu.
      dying = true;
      sndGameOver(emoji || '💀');
      triggerShake(6, 260);
      document.getElementById('board-wrap').classList.add('dimming');
      running = false;
      tutorialRetryStage(reason);
      return;
    }
    dying = true;
    lives--;
    comboCount = 0;
    lifeLostThisLevel = true;
    updateStats();
    gameOverEmoji = emoji || '💀';
    sndGameOver(gameOverEmoji);
    triggerShake(9, 380);
    triggerDeathFlash();
    document.getElementById('board-wrap').classList.add('dimming');
    vibrate([70, 40, 90]);

    setTimeout(() => {
      running = false;
      dying = false;

      if (lives <= 0) {
        gameOver = true;
        lifeLostFlag = false;
        const isNewHigh = saveHighScoreIfNeeded();
        let closeText;
        if (levelReadyToComplete || capturedPct >= 75) {
          closeText = ' You already had ' + capturedPct + '% - the bonus is gone, but so close!';
        } else {
          closeText = ' Only ' + (75 - capturedPct) + '% left to the next level!';
        }
        const highText = isNewHigh ? '🏆 New high score! ' : '';
        const statsLine = '\n\n📊 Biggest cut: ' + statBiggestCut + ' cells  ·  Longest line: ' +
                          statLongestTrail + '  ·  Guards down: ' + statKills +
                          '  ·  Levels cleared: ' + statLevelsCleared;
        showOverlay(gameOverEmoji + ' Game Over', highText + reason + ' Score: ' + score + '.' + closeText + statsLine,
                    '▶ Again (' + MODES[gameMode].label + ')');
        document.getElementById('modeBtn').classList.remove('hidden');
      } else {
        gameOver = false;
        lifeLostFlag = true;
        showOverlay(gameOverEmoji + ' Life lost!', reason + ' ' + lives + ' lives left. Level restarts.', 'Continue');
      }
    }, 420);
  }

  let shopOpen = false;

  function drawableCards() {
    return PERK_CARDS.filter(c => perkCount(c.id) < c.max);
  }

  function openShop(nextLevelLabel, onDone) {
    const pool = drawableCards();
    if (pool.length === 0) { onDone(); return; }
    const picks = [];
    const copy = pool.slice();
    while (picks.length < 3 && copy.length) {
      picks.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    shopOpen = true;
    const row = document.getElementById('shopRow');
    row.innerHTML = '';
    for (const card of picks) {
      const b = document.createElement('button');
      b.className = 'card';
      const owned = perkCount(card.id);
      b.innerHTML = '<span class="cardIcon">' + card.icon + '</span>' +
        '<span><span class="cardName">' + card.name + (owned ? ' ×' + (owned + 1) : '') + '</span><br>' +
        '<span class="cardDesc">' + card.desc + '</span></span>';
      b.addEventListener('click', () => {
        if (!shopOpen) return;
        shopOpen = false;
        card.apply();
        sndPowerUp('shield');
        document.getElementById('shop').classList.add('hidden');
        onDone();
      });
      row.appendChild(b);
    }
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('modeSelect').classList.add('hidden');
    document.getElementById('modeBtn').classList.add('hidden');
    document.getElementById('skipBtn').classList.add('hidden');
    document.getElementById('overlayText').classList.add('hidden');
    document.getElementById('startBtn').classList.add('hidden');
    document.getElementById('shop').classList.remove('hidden');
    document.getElementById('overlayTitle').textContent = nextLevelLabel;
  }

  function showOverlay(title, text, btnLabel) {
    shopOpen = false;
    document.getElementById('tutorialBtn').classList.add('hidden');
    document.getElementById('shop').classList.add('hidden');
    document.getElementById('startBtn').classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('modeSelect').classList.add('hidden');
    document.getElementById('modeBtn').classList.add('hidden');
    document.getElementById('overlayText').classList.remove('hidden');
    document.getElementById('overlayTitle').textContent = title;
    document.getElementById('overlayText').textContent = text;
    document.getElementById('startBtn').textContent = btnLabel;
  }
  function hideOverlay() {
    document.getElementById('overlay').classList.add('hidden');
  }

  function draw(now) {
    const dtMs = Math.min(120, Math.max(0, now - (lastDrawTime || now)));
    lastDrawTime = now;

    // Bedrohungsgrad: dieselbe Kurve, die schon Musik und Spannungs-Vignette treibt
    // (computeTension), aber hier eigenstaendig geglaettet - updateAmbient laeuft
    // nur mit aktivem Audio, das Bild soll auch stumm reagieren.
    // Aktive Jagd oder Alarm zieht den Wert sofort auf Anschlag.
    const tensionNow = (running && !paused && !gameOver) ? computeTension(now) : 0;
    const hunted = (now < alarmUntil || enemies.some(e => e.huntingActive)) ? 1 : 0;
    const threatTarget = Math.max(tensionNow, hunted);
    threatDisp = easeValue(threatDisp, threatTarget, dtMs, threatTarget > threatDisp ? 90 : 500);
    const gridPulse = 0.5 + 0.5 * Math.sin(now / (1500 - threatDisp * 1150));
    const gridAlpha = 0.05 + gridPulse * 0.03 + threatDisp * (0.10 + gridPulse * 0.20);
    const gr = Math.round(127 + 128 * threatDisp);
    const gg = Math.round(224 - 150 * threatDisp);
    const gb = Math.round(160 - 105 * threatDisp);

    // Spieler: Blickrichtung weich nachziehen, mit leichtem Einlenken
    const [tdx, tdy] = dirDelta(dir);
    const targetHeading = Math.atan2(tdy, tdx);
    const pendingTurn = shortestAngleDelta(playerHeadingDisp, targetHeading);
    playerHeadingDisp = easeAngle(playerHeadingDisp, targetHeading, dtMs, 52);
    playerLeanDisp = easeValue(playerLeanDisp, Math.max(-0.38, Math.min(0.38, pendingTurn * 0.45)), dtMs, 60);

    // Waechter: Kegelwinkel weich nachziehen
    for (const e of enemies) {
      const target = enemyFacing(e);
      if (e.angleDisp === undefined) e.angleDisp = target;
      else e.angleDisp = easeAngle(e.angleDisp, target, dtMs, 95);
      // Blick: nach vorne, ausser er hat dich entdeckt - dann folgt der Blick dir
      const alerted = e.huntingActive || now < alarmUntil;
      const eyeTarget = alerted ? Math.atan2(py - e.r, px - e.c) : e.angleDisp;
      if (e.eyeAngleDisp === undefined) e.eyeAngleDisp = eyeTarget;
      else e.eyeAngleDisp = easeAngle(e.eyeAngleDisp, eyeTarget, dtMs, alerted ? 70 : 110);
      // Traegerer Winkel: die Flossen schwingen der Drehung hinterher
      if (e.tailAngleDisp === undefined) e.tailAngleDisp = e.angleDisp;
      else e.tailAngleDisp = easeAngle(e.tailAngleDisp, e.angleDisp, dtMs, 230);
    }

    const playerT = Math.min(1, (now - playerStepTime) / currentPlayerInterval());
    const dispPx = prevPx + (px - prevPx) * playerT;
    const dispPy = prevPy + (py - prevPy) * playerT;
    const camFollow = cameraMode === 'follow' || cameraMode === 'push';

    const bgT = threatDisp * (0.75 + gridPulse * 0.25);
    ctx.fillStyle = 'rgb(' + Math.round(10 + 32 * bgT) + ',' +
                             Math.round(15 - 7 * bgT) + ',' +
                             Math.round(11 - 3 * bgT) + ')';
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

    // Tiefenschicht: folgt der Kamera nur zu PARALLAX_FACTOR und driftet zusaetzlich
    // ganz langsam, damit der Hintergrund auch bei stehender Kamera atmet.
    if (bgParallaxPattern) {
      const camX = camFollow ? boardCanvas.width / 2 - (dispPx * CELL + CELL / 2) : 0;
      const camY = camFollow ? boardCanvas.height / 2 - (dispPy * CELL + CELL / 2) : 0;
      const ox = camX * PARALLAX_FACTOR + Math.sin(now / 9000) * CELL * 0.6;
      const oy = camY * PARALLAX_FACTOR + Math.cos(now / 11000) * CELL * 0.45;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillStyle = bgParallaxPattern;
      ctx.fillRect(-ox, -oy, boardCanvas.width, boardCanvas.height);
      ctx.restore();
    }

    if (bgVignette) { ctx.fillStyle = bgVignette; ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height); }
    if (bgNoisePattern) { ctx.fillStyle = bgNoisePattern; ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height); }

    ctx.save();
    if (camFollow) {
      ctx.translate(boardCanvas.width / 2 - (dispPx * CELL + CELL / 2),
                    boardCanvas.height / 2 - (dispPy * CELL + CELL / 2));
    }
    const shakeRemaining = shakeEndTime - now;
    if (shakeRemaining > 0) {
      const shakeT = shakeRemaining / shakeDuration;
      const mag = shakeMagnitude * shakeT;
      ctx.translate((Math.random() * 2 - 1) * mag, (Math.random() * 2 - 1) * mag);
    }

    const drunkActive = now < drunkUntil;
    if (drunkActive) {
      const tt = now / 1000;
      const angle = Math.sin(tt * 5.2) * 0.11 + Math.sin(tt * 3.1) * 0.05;
      const dx = Math.sin(tt * 7.4) * CELL * 0.42 + Math.sin(tt * 4.1) * CELL * 0.15;
      const dy = Math.cos(tt * 6.3) * CELL * 0.34 + Math.cos(tt * 3.7) * CELL * 0.12;
      const pivotX = camFollow ? dispPx * CELL + CELL / 2 : COLS * CELL / 2;
      const pivotY = camFollow ? dispPy * CELL + CELL / 2 : ROWS * CELL / 2;
      ctx.translate(pivotX, pivotY);
      ctx.rotate(angle);
      ctx.translate(-pivotX + dx, -pivotY + dy);
      ctx.filter = 'blur(2.4px)';
    }

    ctx.strokeStyle = 'rgba(' + gr + ',' + gg + ',' + gb + ',' + gridAlpha.toFixed(3) + ')';
    ctx.lineWidth = 1 + threatDisp * 1.1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x*CELL, 0); ctx.lineTo(x*CELL, ROWS*CELL); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y*CELL); ctx.lineTo(COLS*CELL, y*CELL); ctx.stroke();
    }
    ctx.lineWidth = 1;

    for (let i = flashCells.length - 1; i >= 0; i--) {
      if (now - flashCells[i].time > 400) flashCells.splice(i, 1);
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = grid[r][c];
        if (v === BLOCK) {
          const mover = movingBlocks.find(m => m.r === r && m.c === c);
          if (mover) {
            ctx.fillStyle = '#4a4634';
            ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
            ctx.fillStyle = '#5e5a3f';
            ctx.fillRect(c*CELL+2, r*CELL+2, CELL-4, CELL-4);
            ctx.strokeStyle = 'rgba(255,210,63,0.55)';
            ctx.lineWidth = Math.max(1, CELL * 0.06);
            ctx.strokeRect(c*CELL+2.5, r*CELL+2.5, CELL-5, CELL-5);
            // Richtungspfeil
            ctx.save();
            ctx.translate(c*CELL + CELL/2, r*CELL + CELL/2);
            ctx.rotate(Math.atan2(mover.dr, mover.dc));
            ctx.fillStyle = 'rgba(255,226,140,0.85)';
            ctx.beginPath();
            ctx.moveTo(CELL*0.22, 0);
            ctx.lineTo(-CELL*0.10, -CELL*0.13);
            ctx.lineTo(-CELL*0.10, CELL*0.13);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            continue;
          }
          ctx.fillStyle = '#3a4238';
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          ctx.fillStyle = '#4c5749';
          ctx.fillRect(c*CELL+2, r*CELL+2, CELL-4, CELL-4);
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(c*CELL+2, r*CELL+2, CELL-4, 3);
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(c*CELL+0.5, r*CELL+0.5, CELL-1, CELL-1);
          continue;
        }
        if (v === PIT) {
          ctx.fillStyle = '#05070a';
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          const pg = ctx.createRadialGradient(
            c*CELL+CELL/2, r*CELL+CELL/2, CELL*0.1,
            c*CELL+CELL/2, r*CELL+CELL/2, CELL*0.6);
          pg.addColorStop(0, 'rgba(0,0,0,1)');
          pg.addColorStop(1, 'rgba(40,60,80,0.35)');
          ctx.fillStyle = pg;
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          continue;
        }
        if (v === TERRITORY) {
          ctx.fillStyle = '#2f8f5c';
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(c*CELL, r*CELL, CELL, 2);
        } else if (v === TRAIL) {
          if (c === px && r === py && playerT < 1) {
            // neuester Trail-Block: erst einblenden, wenn der Punkt visuell ankommt
          } else {
            const guarded = now < trailGuardUntil;
            const riskColor = guarded ? '#3fd6b0' : trailRiskColor(trail.length);
            ctx.save();
            ctx.shadowColor = riskColor;
            ctx.shadowBlur = CELL * 0.55;
            ctx.fillStyle = riskColor;
            ctx.fillRect(c*CELL+3, r*CELL+3, CELL-6, CELL-6);
            ctx.restore();
            if (guarded) {
              const glowPulse = 0.5 + Math.sin(now / 180 + c + r) * 0.5;
              ctx.strokeStyle = 'rgba(200,255,240,' + (0.35 + glowPulse * 0.4) + ')';
              ctx.lineWidth = Math.max(1, CELL * 0.05);
              ctx.strokeRect(c*CELL+3, r*CELL+3, CELL-6, CELL-6);
            }
          }
        }
      }
    }

    for (const f of flashCells) {
      const t = (now - f.time) / 400;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - t)) + ')';
      ctx.fillRect(f.c*CELL, f.r*CELL, CELL, CELL);
    }

    // Energiewellen ueber dem Feld, aber unter Spieler und Waechtern
    for (let i = bgRipples.length - 1; i >= 0; i--) {
      const rp = bgRipples[i];
      const t = (now - rp.start) / rp.dur;
      if (t >= 1) { bgRipples.splice(i, 1); continue; }
      const rad = rp.maxCells * CELL * (1 - Math.pow(1 - t, 2.6));
      if (rad < 0.5) continue;
      const alpha = (1 - t) * (1 - t) * rp.strength;
      const rcx = rp.cx * CELL + CELL / 2, rcy = rp.cy * CELL + CELL / 2;
      ctx.save();
      const rg = ctx.createRadialGradient(rcx, rcy, rad * 0.68, rcx, rcy, rad);
      rg.addColorStop(0, 'rgba(' + rp.color + ',0)');
      rg.addColorStop(1, 'rgba(' + rp.color + ',' + (alpha * 0.30).toFixed(3) + ')');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(rcx, rcy, rad, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(' + rp.color + ',' + alpha.toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, CELL * 0.15 * (1 - t));
      ctx.beginPath(); ctx.arc(rcx, rcy, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    for (let i = nearMissPopups.length - 1; i >= 0; i--) {
      const p = nearMissPopups[i];
      const t = (now - p.startTime) / 900;
      if (t >= 1) { nearMissPopups.splice(i, 1); continue; }
      const alpha = 1 - t;
      const yOff = -t * CELL * 1.4;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffd23f';
      ctx.font = '700 ' + Math.floor(CELL * 0.55) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      const tx = p.x * CELL + CELL / 2, ty = p.y * CELL + CELL / 2 + yOff - CELL * 0.6;
      ctx.strokeText('Whew!', tx, ty);
      ctx.fillText('Whew!', tx, ty);
      ctx.restore();
    }

    for (let i = comboPopups.length - 1; i >= 0; i--) {
      const p = comboPopups[i];
      const t = (now - p.startTime) / 1100;
      if (t >= 1) { comboPopups.splice(i, 1); continue; }
      const alpha = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
      const bounce = t < 0.22 ? 1.5 - (t / 0.22) * 0.5 : 1;
      const yOff = -t * CELL * 1.1;
      const cx = p.x * CELL + CELL / 2;
      const cy = p.y * CELL + CELL / 2 + yOff - CELL * 1.1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.scale(bounce, bounce);

      const size = Math.floor(CELL * (0.5 + Math.min(p.combo, 8) * 0.045));
      ctx.font = '800 ' + size + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const grad = ctx.createLinearGradient(0, -size/2, 0, size/2);
      grad.addColorStop(0, '#ffe27a');
      grad.addColorStop(1, '#ff6a3d');

      ctx.strokeStyle = 'rgba(30,10,0,0.75)';
      ctx.lineWidth = 4;
      ctx.strokeText('🔥 COMBO ×' + p.mult.toFixed(1), 0, 0);
      ctx.fillStyle = grad;
      ctx.fillText('🔥 COMBO ×' + p.mult.toFixed(1), 0, 0);
      ctx.restore();
    }

    for (let i = milestonePopups.length - 1; i >= 0; i--) {
      const m = milestonePopups[i];
      const t = (now - m.startTime) / 1000;
      if (t >= 1) { milestonePopups.splice(i, 1); continue; }
      const bounce = t < 0.2 ? 1.4 - (t / 0.2) * 0.4 : 1;
      const alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      const mx = m.x * CELL + CELL / 2, my = m.y * CELL + CELL / 2 - CELL * 1.6 - t * CELL * 0.6;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(mx, my);
      ctx.scale(bounce, bounce);
      ctx.font = '800 ' + Math.floor(CELL * 0.5) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(m.text, 0, 0);
      ctx.fillStyle = '#7fe0a0';
      ctx.fillText(m.text, 0, 0);
      ctx.restore();
    }

    // Bonuszone: goldener Rahmen, solange sie noch nicht gesichert ist
    if (bonusCells.length && !bonusClaimed) {
      const pulse = 0.55 + Math.sin(now / 280) * 0.3;
      for (const b of bonusCells) {
        ctx.fillStyle = 'rgba(255,210,63,' + (0.10 + pulse * 0.10) + ')';
        ctx.fillRect(b.c*CELL, b.r*CELL, CELL, CELL);
        ctx.strokeStyle = 'rgba(255,210,63,' + (0.35 + pulse * 0.45) + ')';
        ctx.lineWidth = Math.max(1, CELL * 0.06);
        ctx.strokeRect(b.c*CELL+2, b.r*CELL+2, CELL-4, CELL-4);
      }
      const first = bonusCells[0];
      ctx.font = '700 ' + Math.floor(CELL * 0.5) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,226,120,' + (0.5 + pulse * 0.5) + ')';
      ctx.fillText('×' + BONUS_MULT, first.c*CELL + CELL/2, first.r*CELL + CELL/2 + 1);
    }

    for (let i = revealPopups.length - 1; i >= 0; i--) {
      const rp = revealPopups[i];
      const age = now - rp.startTime;
      const totalLife = ROULETTE_MS + REVEAL_HOLD_MS;
      if (age >= totalLife) { revealPopups.splice(i, 1); continue; }

      if (age < ROULETTE_MS) {
        // Roulette: rasch wechselndes Icon an der Aufsammel-Stelle
        const spinIdx = Math.floor(age / ROULETTE_STEP_MS) % ALL_MYSTERY_TYPES.length;
        const spinType = ALL_MYSTERY_TYPES[spinIdx];
        const cx = rp.x * CELL + CELL / 2, cy = rp.y * CELL + CELL / 2;
        const wobble = 1 + Math.sin(age / 40) * 0.06;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(wobble, wobble);
        ctx.beginPath();
        ctx.arc(0, 0, CELL * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = ALL_ICON_COLORS[spinType];
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = Math.max(1.5, CELL * 0.05);
        ctx.stroke();
        ctx.font = '700 ' + Math.floor(CELL * 0.4) + 'px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#101414';
        ctx.fillText(ALL_ICON_SYMBOLS[spinType], 0, 1);
        ctx.restore();
      } else {
        // Reveal: das tatsaechliche Ergebnis fliegt hoch und verblasst
        const t = (age - ROULETTE_MS) / REVEAL_HOLD_MS;
        const bounce = t < 0.25 ? 1.5 - (t / 0.25) * 0.5 : 1;
        const alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
        const yOff = -t * CELL * 1.3;
        const rx = rp.x * CELL + CELL / 2, ry = rp.y * CELL + CELL / 2 + yOff - CELL * 0.6;
        const label = ALL_ICON_SYMBOLS[rp.type] + ' ' + ALL_ICON_NAMES[rp.type];
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(rx, ry);
        ctx.scale(bounce, bounce);
        ctx.font = '800 ' + Math.floor(CELL * 0.42) + 'px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 3;
        ctx.strokeText(label, 0, 0);
        ctx.fillStyle = ALL_ICON_COLORS[rp.type];
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }

    for (let i = fireworkParticles.length - 1; i >= 0; i--) {
      const p = fireworkParticles[i];
      const age = now - p.startTime;
      if (age < 0) continue;
      if (age > p.life) { fireworkParticles.splice(i, 1); continue; }
      const t = age / 1000;
      const px2 = p.x0 + p.vx * t;
      const py2 = p.y0 + p.vy * t + 0.5 * 200 * t * t;
      const alpha = 1 - age / p.life;
      const size = Math.max(2, CELL * 0.16);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(px2 - size / 2), Math.round(py2 - size / 2), size, size);
    }
    ctx.globalAlpha = 1;

    for (let i = shotProjectiles.length - 1; i >= 0; i--) {
      const sp = shotProjectiles[i];
      const t = (now - sp.startTime) / sp.life;
      if (t >= 1) { shotProjectiles.splice(i, 1); continue; }
      const tx = sp.x0 + (sp.x1 - sp.x0) * t;
      const ty = sp.y0 + (sp.y1 - sp.y0) * t;
      ctx.save();
      ctx.globalAlpha = 1 - t * 0.3;
      ctx.strokeStyle = '#fff2b8';
      ctx.lineWidth = Math.max(2, CELL * 0.1);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sp.x0 + (sp.x1 - sp.x0) * Math.max(0, t - 0.35), sp.y0 + (sp.y1 - sp.y0) * Math.max(0, t - 0.35));
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = '#ffe27a';
      ctx.arc(tx, ty, CELL * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const p of powerUps) {
      const pulse = 1 + Math.sin(now / 260 + p.r + p.c) * 0.08;
      const cx = p.c*CELL + CELL/2, cy = p.r*CELL + CELL/2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.beginPath();
      ctx.arc(0, 0, CELL*0.34, 0, Math.PI*2);
      ctx.fillStyle = MYSTERY_COLOR;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#101414';
      ctx.font = '700 ' + Math.floor(CELL * 0.4) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(MYSTERY_SYMBOL, 0, 1);
      ctx.restore();
    }

    const blinkOnGlobal = Math.floor(now / 110) % 2 === 0;

    const shieldRemaining = shieldUntil - now;
    const shieldActive = now < shieldUntil;
    const shieldBlinking = shieldActive && shieldRemaining < 900;
    if (shieldActive && !(shieldBlinking && !blinkOnGlobal)) {
      ctx.beginPath();
      ctx.arc(dispPx*CELL + CELL/2, dispPy*CELL + CELL/2, CELL*0.52, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(79,126,229,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const spikesRemaining = spikesUntil - now;
    const spikesActive = now < spikesUntil;
    const spikesBlinking = spikesActive && spikesRemaining < 900;
    if (spikesActive && !(spikesBlinking && !blinkOnGlobal)) {
      const spikeCx = dispPx * CELL + CELL / 2, spikeCy = dispPy * CELL + CELL / 2;
      const spikeCount = 8;
      const rInner = CELL * 0.48, rOuter = CELL * 0.68;
      ctx.beginPath();
      for (let i = 0; i < spikeCount; i++) {
        const a0 = (i / spikeCount) * Math.PI * 2 + now / 500;
        const a1 = a0 + (Math.PI * 2) / spikeCount / 2;
        ctx.moveTo(spikeCx + Math.cos(a0) * rInner, spikeCy + Math.sin(a0) * rInner);
        ctx.lineTo(spikeCx + Math.cos(a1) * rOuter, spikeCy + Math.sin(a1) * rOuter);
        const a2 = a0 + (Math.PI * 2) / spikeCount;
        ctx.lineTo(spikeCx + Math.cos(a2) * rInner, spikeCy + Math.sin(a2) * rInner);
      }
      ctx.strokeStyle = 'rgba(201,117,46,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const speedRemaining = speedUntil - now;
    const speedActive = now < speedUntil;
    const speedBlinking = speedActive && speedRemaining < 900;
    const showSpeedColor = speedActive && !(speedBlinking && !blinkOnGlobal);

    // Bewegungs-Lehnen: Streckung/Stauchung entlang der animierten Blickrichtung
    const [pdx, pdy] = dirDelta(dir);
    const R = CELL * 0.38;
    const bounce = Math.sin(Math.min(1, playerT) * Math.PI);
    const stretch = 1 + bounce * 0.18;
    const squeeze = 1 - bounce * 0.13;
    const headX = Math.cos(playerHeadingDisp), headY = Math.sin(playerHeadingDisp);

    const pcx = dispPx * CELL + CELL / 2, pcy = dispPy * CELL + CELL / 2;

    // Wisch-Hinweis: Geisterfinger, der einmal quer zieht. Verschwindet nach dem ersten Wisch.
    const showSwipeHint = IS_TOUCH && !hasSwipedEver && running && !countdownActive && now < swipeHintUntil &&
      (tutorialActive ? tutorialStage === 0 : level === 1);
    if (showSwipeHint) {
      const cycle = 1800;
      const t = (now % cycle) / cycle;
      const ease = t < 0.75 ? (1 - Math.pow(1 - t / 0.75, 3)) : 1;
      const fade = t < 0.1 ? t / 0.1 : (t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.2) : 1);
      const gx = COLS * CELL * 0.28 + ease * COLS * CELL * 0.34;
      const gy = ROWS * CELL * 0.62;
      ctx.save();
      ctx.globalAlpha = fade * 0.85;
      // Schleifspur
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(2, CELL * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(COLS * CELL * 0.28, gy);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      // Fingerkuppe
      ctx.beginPath();
      ctx.arc(gx, gy, CELL * 0.40, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1.5, CELL * 0.06);
      ctx.stroke();
      // Pfeilspitze in Wischrichtung
      ctx.beginPath();
      ctx.moveTo(gx + CELL * 0.62, gy);
      ctx.lineTo(gx + CELL * 0.22, gy - CELL * 0.26);
      ctx.lineTo(gx + CELL * 0.22, gy + CELL * 0.26);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();
      ctx.restore();
    }

    // Enterhaken: Seil schnellt heraus, der Haken fasst, dann zieht das Seil den Spieler heran.
    if (hookAnim) {
      const HOOK_EXTEND_MS = 80, HOOK_BOUNCE_MS = 190;
      const hAge = now - hookAnim.startTime;
      const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
      const ox = hookAnim.ox * CELL + CELL / 2, oy = hookAnim.oy * CELL + CELL / 2;
      let tipX, tipY, ropeAlive = true, hookCaught = false;

      if (hookAnim.mode === 'pull') {
        const extendT = easeOutQuad(Math.min(1, hAge / HOOK_EXTEND_MS));
        const fullDist = hookAnim.reachCells * CELL;
        const tipDist = fullDist * extendT;
        tipX = ox + hookAnim.dx * tipDist;
        tipY = oy + hookAnim.dy * tipDist;
        hookCaught = extendT >= 1;
        // Sobald der Spieler beim Haken ankommt, ist der Zug abgeschlossen.
        if (hookCaught && Math.hypot(pcx - tipX, pcy - tipY) < CELL * 0.12) {
          ropeAlive = false;
        }
        if (hAge > 900) ropeAlive = false; // Sicherheitsnetz, falls die Bewegung ausbleibt
      } else {
        // Blockiert: das Seil schnellt kurz raus und prallt sofort zurueck.
        const t = Math.min(1, hAge / HOOK_BOUNCE_MS);
        const dist = t < 0.5
          ? hookAnim.reachCells * CELL * easeOutQuad(t / 0.5)
          : hookAnim.reachCells * CELL * (1 - easeOutQuad((t - 0.5) / 0.5));
        tipX = ox + hookAnim.dx * dist;
        tipY = oy + hookAnim.dy * dist;
        hookCaught = t >= 0.5 && t < 0.95;
        if (t >= 1) ropeAlive = false;
      }

      if (!ropeAlive) {
        hookAnim = null;
      } else {
        const ropeFromX = hookAnim.mode === 'pull' ? pcx : ox;
        const ropeFromY = hookAnim.mode === 'pull' ? pcy : oy;

        // Seil: leicht angeschraegte Doppellinie, wirkt gespannt statt starr
        ctx.save();
        ctx.strokeStyle = '#c9a86a';
        ctx.lineWidth = Math.max(1.5, CELL * 0.07);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ropeFromX, ropeFromY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(0.8, CELL * 0.025);
        ctx.beginPath();
        ctx.moveTo(ropeFromX, ropeFromY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // Haken: kleine gebogene Spitze, die in Flugrichtung zeigt
        const hookAngle = Math.atan2(hookAnim.dy, hookAnim.dx);
        ctx.translate(tipX, tipY);
        ctx.rotate(hookAngle);
        const hs = CELL * (hookCaught ? 0.30 : 0.24);
        ctx.fillStyle = '#aebac2';
        ctx.strokeStyle = '#5c6870';
        ctx.lineWidth = Math.max(1, CELL * 0.035);
        ctx.beginPath();
        ctx.moveTo(-hs * 0.7, 0);
        ctx.lineTo(hs * 0.5, 0);
        ctx.quadraticCurveTo(hs * 1.15, 0, hs * 1.05, -hs * 0.75);
        ctx.quadraticCurveTo(hs * 0.95, -hs * 1.15, hs * 0.45, -hs * 0.85);
        ctx.lineTo(hs * 0.55, -hs * 0.15);
        ctx.lineTo(-hs * 0.7, -hs * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (hookCaught) {
          // kurzer Funkenstoss beim Einhaken
          ctx.strokeStyle = 'rgba(255,230,150,0.85)';
          ctx.lineWidth = Math.max(1, CELL * 0.045);
          for (const a of [-0.5, 0, 0.5]) {
            ctx.beginPath();
            ctx.moveTo(hs * 0.7, -hs * 0.4);
            ctx.lineTo(hs * (0.7 + 0.5 * Math.cos(a)), -hs * (0.4 + 0.5 * Math.sin(a)));
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    // Staubwolken-Partikel hinter dem Charakter beim Boosten
    if (speedActive && now - lastDustSpawn > 35) {
      lastDustSpawn = now;
      for (let i = 0; i < 2; i++) {
        const backAngle = Math.atan2(-pdy, -pdx) + (Math.random() - 0.5) * 1.1;
        const speed = 30 + Math.random() * 45;
        dustParticles.push({
          x0: pcx + (Math.random() - 0.5) * R * 0.6,
          y0: pcy + (Math.random() - 0.5) * R * 0.6,
          vx: Math.cos(backAngle) * speed - pdx * 20,
          vy: Math.sin(backAngle) * speed - pdy * 20,
          size: R * (0.22 + Math.random() * 0.18),
          startTime: now,
          life: 320 + Math.random() * 220
        });
      }
    }
    for (let i = dustParticles.length - 1; i >= 0; i--) {
      const d = dustParticles[i];
      const age = now - d.startTime;
      if (age > d.life) { dustParticles.splice(i, 1); continue; }
      const t = age / 1000;
      const dx2 = d.x0 + d.vx * t;
      const dy2 = d.y0 + d.vy * t + 0.5 * 40 * t * t;
      const alpha = (1 - age / d.life) * 0.5;
      const sz = d.size * (1 - age / d.life * 0.3);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#d8c9a3';
      ctx.beginPath();
      ctx.arc(dx2, dy2, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Rauchbombe: Spieler wird transparent, dichte Rauchwolke driftet um ihn herum
    const smokeActive = now < smokeUntil;
    if (smokeActive && now - lastSmokeSpawn > 45) {
      lastSmokeSpawn = now;
      smokeParticles.push({
        x0: pcx + (Math.random() - 0.5) * R * 1.2,
        y0: pcy + (Math.random() - 0.5) * R * 1.2,
        vx: (Math.random() - 0.5) * 22,
        vy: (Math.random() - 0.5) * 22 - 8,
        size: R * (0.55 + Math.random() * 0.35),
        startTime: now,
        life: 650 + Math.random() * 350
      });
    }
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
      const sp = smokeParticles[i];
      const age = now - sp.startTime;
      if (age > sp.life) { smokeParticles.splice(i, 1); continue; }
      const t = age / 1000;
      const sx = sp.x0 + sp.vx * t, sy = sp.y0 + sp.vy * t;
      const grow = 1 + t * 0.9;
      const alpha = (1 - age / sp.life) * 0.35;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#b9c2c9';
      ctx.beginPath();
      ctx.arc(sx, sy, sp.size * grow, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Emotion bestimmen
    const nearestD = nearestEnemyDist();
    let justStartled = false;
    for (const nm of nearMissPopups) {
      if (now - nm.startTime < 500) { justStartled = true; break; }
    }
    let emotion;
    if (justStartled) emotion = 'startled';
    else if (nearestD <= 4) emotion = 'worried';
    else if (trail.length > 0) emotion = 'determined';
    else emotion = 'relaxed';

    ctx.save();
    ctx.translate(pcx, pcy);
    // Streckung entlang der Blickrichtung, damit die Drehung mitlaeuft
    ctx.rotate(playerHeadingDisp);
    ctx.scale(stretch, squeeze);
    ctx.rotate(-playerHeadingDisp);
    // Kopf lehnt sich leicht in die Kurve und richtet sich wieder auf
    ctx.rotate(playerLeanDisp);

    if (smokeActive) ctx.globalAlpha = 0.38;
    ctx.fillStyle = showSpeedColor ? '#f5d347' : '#7fe0a0';
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    // Augen: Pupillen schauen in Bewegungsrichtung
    const eyeOffX = R * 0.36, eyeOffY = -R * 0.06;
    const lookX = headX * 0.5, lookY = headY * 0.5;

    if (emotion === 'startled') {
      for (const side of [-1, 1]) {
        const exx = side * eyeOffX, eyy = eyeOffY - R * 0.05;
        ctx.beginPath();
        ctx.arc(exx, eyy, R * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(exx, eyy, R * 0.11, 0, Math.PI * 2);
        ctx.fillStyle = '#101414';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, R * 0.42, R * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#101414';
      ctx.fill();
    } else if (emotion === 'worried') {
      for (const side of [-1, 1]) {
        const exx = side * eyeOffX, eyy = eyeOffY;
        ctx.beginPath();
        ctx.arc(exx, eyy, R * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(exx + lookX * R * 0.1, eyy + lookY * R * 0.1, R * 0.11, 0, Math.PI * 2);
        ctx.fillStyle = '#101414';
        ctx.fill();
      }
      ctx.strokeStyle = '#101414';
      ctx.lineWidth = Math.max(1.3, R * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-eyeOffX - R*0.15, eyeOffY - R*0.42);
      ctx.lineTo(-eyeOffX + R*0.2, eyeOffY - R*0.28);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(eyeOffX + R*0.15, eyeOffY - R*0.42);
      ctx.lineTo(eyeOffX - R*0.2, eyeOffY - R*0.28);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, R * 0.42, R * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else if (emotion === 'determined') {
      const eyeR = R * 0.2;
      for (const side of [-1, 1]) {
        const exx = side * eyeOffX, eyy = eyeOffY;
        ctx.beginPath();
        ctx.arc(exx, eyy, eyeR, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(exx + lookX * eyeR * 0.5, eyy + lookY * eyeR * 0.5, eyeR * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#101414';
        ctx.fill();
      }
      ctx.strokeStyle = '#101414';
      ctx.lineWidth = Math.max(1.3, R * 0.1);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-eyeOffX - R*0.18, eyeOffY - R*0.32);
      ctx.lineTo(-eyeOffX + R*0.15, eyeOffY - R*0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(eyeOffX + R*0.18, eyeOffY - R*0.32);
      ctx.lineTo(eyeOffX - R*0.15, eyeOffY - R*0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-R * 0.16, R * 0.4);
      ctx.lineTo(R * 0.16, R * 0.4);
      ctx.stroke();
    } else {
      const eyeR = R * 0.22;
      for (const side of [-1, 1]) {
        const exx = side * eyeOffX, eyy = eyeOffY;
        ctx.beginPath();
        ctx.arc(exx, eyy, eyeR, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(exx + lookX * eyeR * 0.4, eyy + lookY * eyeR * 0.4, eyeR * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#101414';
        ctx.fill();
      }
      ctx.strokeStyle = '#101414';
      ctx.lineWidth = Math.max(1.3, R * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, R * 0.28, R * 0.22, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();

    // Power-up-Icon ueber dem Kopf
    let activeIcon = null;
    if (shieldActive) activeIcon = 'shield';
    else if (now < freezeUntil) activeIcon = 'freeze';
    else if (speedActive) activeIcon = 'speed';
    else if (now < rapidfireUntil) activeIcon = 'rapidfire';
    else if (now < spikesUntil) activeIcon = 'spikes';
    else if (now < trailGuardUntil) activeIcon = 'trailguard';
    else if (now < confuseUntil) activeIcon = 'confuse';
    else if (now < fogUntil) activeIcon = 'fog';
    else if (now < alarmUntil) activeIcon = 'alarm';
    else if (now < slowUntil) activeIcon = 'slow';
    else if (now < swarmUntil) activeIcon = 'swarm';
    else if (now < drunkUntil) activeIcon = 'drunk';
    if (activeIcon) {
      const bobY = Math.sin(now / 260) * R * 0.12;
      const iconY = pcy - R * 1.55 + bobY;
      ctx.font = '700 ' + Math.floor(R * 1.1) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ALL_ICON_COLORS[activeIcon];
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeText(ALL_ICON_SYMBOLS[activeIcon], pcx, iconY);
      ctx.fillText(ALL_ICON_SYMBOLS[activeIcon], pcx, iconY);
    }

    for (let i = emotePopups.length - 1; i >= 0; i--) {
      const em = emotePopups[i];
      const t = (now - em.startTime) / 750;
      if (t >= 1) { emotePopups.splice(i, 1); continue; }
      const bounce = t < 0.25 ? 1.4 - (t / 0.25) * 0.4 : 1 - (t - 0.25) * 0.1;
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const ex = em.x * CELL + CELL / 2 + R * 1.3;
      const ey = em.y * CELL + CELL / 2 - R * 1.3 - t * CELL * 0.5;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(ex, ey);
      ctx.scale(bounce, bounce);
      ctx.font = '700 ' + Math.floor(CELL * 0.55) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(em.emoji, 0, 0);
      ctx.restore();
    }

    const enemyT = Math.min(1, (now - enemyStepTime) / enemyInterval);
    const frozen = now < freezeUntil;
    const freezeRemaining = freezeUntil - now;
    const blinking = frozen && freezeRemaining < 900;
    const blinkOn = blinkOnGlobal;

    if (freezeWasActive && !frozen) { thawFlashUntil = now + 550; sndThaw(); }
    freezeWasActive = frozen;
    const justThawed = now < thawFlashUntil;

    // Sichtkegel unter den Waechtern
    for (const e of enemies) {
      const v = VISION[e.personality] || VISION.wanderer;
      const dc = e.prevC + (e.c - e.prevC) * enemyT;
      const dr = e.prevR + (e.r - e.prevR) * enemyT;
      const cx = dc*CELL + CELL/2, cy = dr*CELL + CELL/2;
      const ang = (e.angleDisp !== undefined) ? e.angleDisp : enemyFacing(e);
      const alerted = e.huntingActive || now < alarmUntil;
      const radius = visionRange(e) * CELL;
      const g = ctx.createRadialGradient(cx, cy, CELL * 0.3, cx, cy, radius);
      if (alerted) {
        g.addColorStop(0, 'rgba(255,80,60,0.30)');
        g.addColorStop(1, 'rgba(255,80,60,0)');
      } else {
        g.addColorStop(0, 'rgba(255,220,120,0.16)');
        g.addColorStop(1, 'rgba(255,220,120,0)');
      }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, ang - v.half, ang + v.half);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = alerted ? 'rgba(255,110,90,0.45)' : 'rgba(255,225,150,0.20)';
      ctx.lineWidth = Math.max(1, CELL * 0.035);
      ctx.stroke();
      ctx.restore();
    }

    for (const e of enemies) {
      const dispC = e.prevC + (e.c - e.prevC) * enemyT;
      const dispR = e.prevR + (e.r - e.prevR) * enemyT;
      const ecx = dispC*CELL + CELL/2, ecy = dispR*CELL + CELL/2;

      const gridDist = Math.abs(e.c - px) + Math.abs(e.r - py);
      const isClose = gridDist <= 4 && !frozen && !justThawed;
      const isFar = gridDist > 8 && !frozen && !justThawed;

      let pulseFreq = 340, pulseAmp = 0.03;
      if (isClose) { pulseFreq = 140; pulseAmp = 0.07; }
      else if (frozen) { pulseFreq = 900; pulseAmp = 0.015; }
      const pulse = 1 + Math.sin(now / pulseFreq + e.c * 1.7 + e.r) * pulseAmp;
      const R = CELL * 0.36 * pulse;

      ctx.save();
      ctx.translate(ecx, ecy);

      const bodyColor = frozen ? (blinking && !blinkOn ? '#e3574a' : '#7fdcff') : (PERSONALITY_COLORS[e.personality] || '#e3574a');
      const faceAng = (e.angleDisp !== undefined) ? e.angleDisp : 0;
      const tailAng = (e.tailAngleDisp !== undefined) ? e.tailAngleDisp : faceAng;
      // Wie stark dreht er gerade? Steuert Flossenausschlag und Nasenlaenge.
      const turnAmount = Math.max(-1, Math.min(1, shortestAngleDelta(tailAng, faceAng) * 1.6));

      // Flossen hinten: laufen der Drehung hinterher und schwingen dabei aus
      ctx.save();
      ctx.rotate(tailAng);
      ctx.fillStyle = shadeColor(bodyColor, -0.28);
      for (const side of [-1, 1]) {
        const spread = 0.62 + side * turnAmount * 0.22;
        ctx.save();
        ctx.rotate(Math.PI + side * spread);
        ctx.beginPath();
        ctx.moveTo(R * 0.55, 0);
        ctx.quadraticCurveTo(R * 1.35, side * R * 0.20, R * 1.62, 0);
        ctx.quadraticCurveTo(R * 1.25, -side * R * 0.12, R * 0.55, -side * R * 0.26);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // Koerper: Tropfenform mit Nase in Blickrichtung
      ctx.save();
      ctx.rotate(faceAng);
      const noseLen = R * (1.34 + Math.abs(turnAmount) * 0.10);
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0.42 * Math.PI, 1.58 * Math.PI);
      ctx.quadraticCurveTo(R * 1.05, -R * 0.52, noseLen, 0);
      ctx.quadraticCurveTo(R * 1.05, R * 0.52, R * Math.cos(0.42 * Math.PI), R * Math.sin(0.42 * Math.PI));
      ctx.closePath();
      ctx.fill();

      // Heller Visierrand vorne - macht die Blickrichtung auch ohne Kegel lesbar
      ctx.fillStyle = shadeColor(bodyColor, 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.02, -0.36 * Math.PI, 0.36 * Math.PI);
      ctx.arc(0, 0, R * 0.66, 0.36 * Math.PI, -0.36 * Math.PI, true);
      ctx.closePath();
      ctx.fill();
      // Dunkler Saum hinten
      ctx.strokeStyle = shadeColor(bodyColor, -0.35);
      ctx.lineWidth = Math.max(1, R * 0.10);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.94, 0.72 * Math.PI, 1.28 * Math.PI);
      ctx.stroke();
      ctx.restore();

      if (now < alarmUntil) {
        const alarmPulse = 0.5 + Math.sin(now / 90) * 0.5;
        ctx.strokeStyle = 'rgba(255,60,40,' + (0.4 + alarmPulse * 0.5) + ')';
        ctx.lineWidth = Math.max(1.5, R * 0.14);
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.22, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Augen
      const eyeOffX = R * 0.42, eyeOffY = -R * 0.08;
      const ang = (e.eyeAngleDisp !== undefined) ? e.eyeAngleDisp : Math.atan2(py - e.r, px - e.c);
      // Gesicht sitzt vorne: wandert weich mit der Drehung mit
      const faceShiftX = Math.cos(faceAng) * R * 0.30;
      const faceShiftY = Math.sin(faceAng) * R * 0.30;
      const lookX = Math.cos(ang), lookY = Math.sin(ang);

      if (justThawed) {
        // ueberrascht: grosse Augen, kleine Pupille zentriert
        for (const side of [-1, 1]) {
          const exx = faceShiftX + side * eyeOffX, eyy = faceShiftY + eyeOffY;
          ctx.beginPath();
          ctx.arc(exx, eyy, R * 0.30, 0, Math.PI*2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(exx, eyy, R * 0.12, 0, Math.PI*2);
          ctx.fillStyle = '#101414';
          ctx.fill();
        }
      } else if (isFar) {
        // schlaefrig: geschlossene Augen (kleine Bögen)
        ctx.strokeStyle = '#101414';
        ctx.lineWidth = Math.max(1.5, R * 0.11);
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          const exx = faceShiftX + side * eyeOffX, eyy = faceShiftY + eyeOffY;
          ctx.beginPath();
          ctx.arc(exx, eyy, R * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.stroke();
        }
      } else {
        // normal / angespannt: runde Augen mit verfolgender Pupille
        const eyeR = R * 0.24;
        const pupilR = eyeR * 0.5;
        const pupilRange = eyeR - pupilR;
        for (const side of [-1, 1]) {
          const exx = faceShiftX + side * eyeOffX, eyy = faceShiftY + eyeOffY;
          ctx.beginPath();
          ctx.arc(exx, eyy, eyeR, 0, Math.PI*2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(exx + lookX * pupilRange, eyy + lookY * pupilRange, pupilR, 0, Math.PI*2);
          ctx.fillStyle = '#101414';
          ctx.fill();
        }
        if (isClose) {
          // wuetende Augenbrauen
          ctx.strokeStyle = '#101414';
          ctx.lineWidth = Math.max(1.5, R * 0.13);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(faceShiftX - eyeOffX - eyeR*0.9, faceShiftY + eyeOffY - eyeR*1.5);
          ctx.lineTo(faceShiftX - eyeOffX + eyeR*0.7, faceShiftY + eyeOffY - eyeR*0.6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(faceShiftX + eyeOffX + eyeR*0.9, faceShiftY + eyeOffY - eyeR*1.5);
          ctx.lineTo(faceShiftX + eyeOffX - eyeR*0.7, faceShiftY + eyeOffY - eyeR*0.6);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    for (let i = enemyDeathAnims.length - 1; i >= 0; i--) {
      const a = enemyDeathAnims[i];
      const ANGEL_LIFE = 1300;
      const t = (now - a.startTime) / ANGEL_LIFE;
      if (t >= 1) { enemyDeathAnims.splice(i, 1); continue; }

      const acx = a.c * CELL + CELL / 2;
      const startY = a.r * CELL + CELL / 2;
      const targetY = -CELL * 2.5; // sicher ausserhalb des Spielfelds oben
      const acy = startY - (startY - targetY) * t;
      const alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
      const aR = CELL * 0.34 * (1 - t * 0.2);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(acx, acy);

      // Fluegel
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(-aR * 1.1, aR * 0.1, aR * 0.55, aR * 0.32, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(aR * 1.1, aR * 0.1, aR * 0.55, aR * 0.32, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Koerper
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.arc(0, 0, aR, 0, Math.PI * 2);
      ctx.fill();

      // Heiligenschein
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1.5, aR * 0.1);
      ctx.beginPath();
      ctx.ellipse(0, -aR * 1.35, aR * 0.55, aR * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();

      // X-Augen
      const dAeyeOffX = aR * 0.4, dAeyeOffY = -aR * 0.05;
      ctx.strokeStyle = '#101414';
      ctx.lineWidth = Math.max(1.5, aR * 0.14);
      ctx.lineCap = 'round';
      const xr = aR * 0.18;
      for (const side of [-1, 1]) {
        const exx = side * dAeyeOffX, eyy = dAeyeOffY;
        ctx.beginPath();
        ctx.moveTo(exx - xr, eyy - xr); ctx.lineTo(exx + xr, eyy + xr);
        ctx.moveTo(exx + xr, eyy - xr); ctx.lineTo(exx - xr, eyy + xr);
        ctx.stroke();
      }

      ctx.restore();
    }
    ctx.restore();

    // Nebel-Effekt: nur ein Radius um den Spieler bleibt sichtbar
    if (now < fogUntil) {
      const fogRadius = CELL * 3.1;
      const [fogCx, fogCy] = worldToScreen(pcx, pcy);
      const fg = ctx.createRadialGradient(fogCx, fogCy, fogRadius * 0.25, fogCx, fogCy, fogRadius * 1.15);
      fg.addColorStop(0, 'rgba(6,6,10,0)');
      fg.addColorStop(1, 'rgba(6,6,10,0.95)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    }

    // Spannungs-Vignette: dunkler Rand, der bei Gefahr staerker und roetlicher wird
    const vw = boardCanvas.width, vh = boardCanvas.height;
    const vcx = vw / 2, vcy = vh / 2;
    const vOuter = Math.sqrt(vcx * vcx + vcy * vcy);
    const gBase = ctx.createRadialGradient(vcx, vcy, vOuter * 0.65, vcx, vcy, vOuter);
    gBase.addColorStop(0, 'rgba(0,0,0,0)');
    gBase.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = gBase;
    ctx.fillRect(0, 0, vw, vh);

    const tensionAlpha = Math.min(0.45, smoothedTension * 0.45);
    if (tensionAlpha > 0.01) {
      const gTension = ctx.createRadialGradient(vcx, vcy, vOuter * 0.55, vcx, vcy, vOuter);
      gTension.addColorStop(0, 'rgba(200,20,20,0)');
      gTension.addColorStop(1, 'rgba(200,20,20,' + tensionAlpha + ')');
      ctx.fillStyle = gTension;
      ctx.fillRect(0, 0, vw, vh);
    }

    if (countdownActive) {
      const elapsed = now - countdownStartTime;
      const totalDur = COUNTDOWN_STEPS.length * COUNTDOWN_STEP_MS;
      if (elapsed >= totalDur) {
        countdownActive = false;
      } else {
        ctx.fillStyle = 'rgba(5,8,6,0.5)';
        ctx.fillRect(0, 0, vw, vh);
        const stepIdx = Math.min(COUNTDOWN_STEPS.length - 1, Math.floor(elapsed / COUNTDOWN_STEP_MS));
        const stepT = (elapsed - stepIdx * COUNTDOWN_STEP_MS) / COUNTDOWN_STEP_MS;
        const label = COUNTDOWN_STEPS[stepIdx];
        const scale = stepT < 0.25 ? (1.7 - (stepT / 0.25) * 0.7) : 1;
        const alpha = stepT > 0.78 ? Math.max(0, 1 - (stepT - 0.78) / 0.22) : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(vw / 2, vh / 2);
        ctx.scale(scale, scale);
        ctx.font = "800 " + Math.floor(CELL * 2.2) + "px 'Orbitron', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const glowColor = label === 'GO!' ? '#7fe0a0' : '#ffd23f';
        ctx.fillStyle = glowColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = CELL * 0.9;
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
  }

  function loop(time) {
    if (!running) return;
    if (!lastTime) lastTime = time;
    let delta = time - lastTime;
    lastTime = time;
    // Nach einem Tabwechsel steht rAF still; ohne Deckel kaeme die gesamte
    // Pause als ein Schritt zurueck (Spielerzug, Waechterzug und Power-up gleichzeitig).
    if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;
    if (time < slowMoUntil) delta *= 0.25; // kurze Zeitlupe nach einem Abschuss

    if (!paused && !gameOver && !celebrating && !dying && !countdownActive) {
      playerTimer += delta;
      const playerIv = currentPlayerInterval();
      if (playerTimer > playerIv) {
        // Rest behalten statt auf 0 zu setzen, sonst haengt die Schrittrate
        // an der Bildrate. Auf ein Intervall begrenzt, damit nach einem
        // Aussetzer keine Schritte nachgeholt werden.
        playerTimer = Math.min(playerTimer - playerIv, playerIv);
        stepPlayer();
      }
      if (running && !gameOver) {
        const guardsFrozen = performance.now() < freezeUntil || tutorialGuardsStand ||
          (!tutorialActive && !MODES[gameMode].enemiesMove);
        if (guardsFrozen) {
          // Waechter eingefroren (Power-up, Zen-Modus oder Sichtkegel-Etappe)
        } else {
          enemyTimer += delta;
          if (enemyTimer > enemyInterval) {
            enemyTimer = Math.min(enemyTimer - enemyInterval, enemyInterval);
            moveEnemies();
          }
        }
        powerUpSpawnTimer += delta;
        if (!tutorialActive && powerUpSpawnTimer > MODES[gameMode].puInterval && powerUps.length < MODES[gameMode].puMax) {
          powerUpSpawnTimer = 0;
          spawnPowerUp();
        }
        updateMovingBlocks(delta);
        updatePendingReveals(performance.now());
        updateTutorial();
        if (swarmEnemies.length && performance.now() >= swarmUntil) clearSwarmEnemies();
        updateMusicScheduler();
        checkNearMiss(performance.now());
      }
    }
    updateActionButtonsUI();
    if (!paused) draw(time);
    if (running) rafId = requestAnimationFrame(loop);
  }

  // Merkt sich pro Knopf, ob er bereit war, und blitzt genau beim Umschlagen einmal auf.
  const readyState = { gadget: true, shoot: true, cash: false };
  function flashWhenReady(el, key, isReady) {
    if (!el) return;
    if (isReady && !readyState[key]) {
      el.classList.remove('justReady');
      void el.offsetWidth; // Reflow erzwingen, damit die Animation neu startet
      el.classList.add('justReady');
      setTimeout(() => el.classList.remove('justReady'), 520);
    }
    readyState[key] = isReady;
  }

  function updateActionButtonsUI() {
    const el = document.getElementById('btnGadget');
    const sweep = document.getElementById('gadgetSweep');
    if (el && sweep) {
      const frac = gadgetCooldownFrac();
      sweep.style.setProperty('--cd', (frac * 100) + '%');
      el.classList.toggle('oncooldown', frac > 0);
      flashWhenReady(el, 'gadget', frac === 0 && running && !gameOver);
    }
    const cashFill = document.getElementById('cashFill');
    if (cashFill) {
      // Waehrend eines Laufs baut sich die Auszahlung mit jedem Prozent Flaeche auf.
      const inRun = hasStarted && !gameOver;
      const cashUsable = levelReadyToComplete && running && !gameOver;
      const progress = cashUsable ? 1 : (inRun ? Math.max(0, Math.min(1, capturedPct / 75)) : 0);
      cashFill.style.setProperty('--fill', (progress * 100) + '%');
      flashWhenReady(document.getElementById('pauseBtn'), 'cash', cashUsable);
    }
    const shootEl = document.getElementById('btnShoot');
    const shootSweep = document.getElementById('shootSweep');
    if (shootEl && shootSweep) {
      const now = performance.now();
      const rapidfireActive = now < rapidfireUntil;
      const shootFrac = rapidfireActive ? 0 : Math.max(0, Math.min(1, (shotCooldownUntil - now) / shotCooldownMs()));
      shootSweep.style.setProperty('--cd', (shootFrac * 100) + '%');
      shootEl.classList.toggle('oncooldown', shootFrac > 0);
      flashWhenReady(shootEl, 'shoot', shootFrac === 0 && running && !gameOver);
    }
  }

  function sndCountdownBeep(isLast) {
    if (isLast) { tone(1046, 0.2, 'square', 0.13, 0, 1600); }
    else { tone(700, 0.11, 'square', 0.1, 0, 900); }
  }

  function triggerStartCountdown() {
    countdownActive = true;
    countdownStartTime = performance.now();
    for (let i = 0; i < COUNTDOWN_STEPS.length; i++) {
      setTimeout(() => sndCountdownBeep(i === COUNTDOWN_STEPS.length - 1), i * COUNTDOWN_STEP_MS);
    }
  }

  function startGame() {
    tutorialActive = false;
    tutorialGuardsStand = false;
    tutorialRestoreGadget();
    hideTutorialBar();
    document.getElementById('tutorialBtn').classList.add('hidden');
    loadHighScoreForMode();
    updateModeBadge();
    document.getElementById('modeBtn').classList.add('hidden');
    resetGame();
    hideOverlay();
    dying = false;
    document.getElementById('board-wrap').classList.remove('dimming');
    running = true;
    lastTime = 0;
    triggerStartCountdown();
    draw(performance.now());
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    resetMusicTiming();
  }

  function continueLevel() {
    hideOverlay();
    dying = false;
    document.getElementById('board-wrap').classList.remove('dimming');
    running = true;
    lastTime = 0;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    resetMusicTiming();
  }

  function retryLevel() {
    resetLevel(level);
    hideOverlay();
    dying = false;
    document.getElementById('board-wrap').classList.remove('dimming');
    running = true;
    lastTime = 0;
    triggerStartCountdown();
    draw(performance.now());
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    resetMusicTiming();
  }

  function togglePause() {
    if (gameOver || !running || quitConfirmOpen) return;
    paused = !paused;
    if (paused) showOverlay('Pause', 'Score: ' + score, 'Continue');
    else { hideOverlay(); resetMusicTiming(); }
  }

  let modeSelectOpen = false;

  function updateModeBadge() {
    const el = document.getElementById('modeBadge');
    if (!el) return;
    const parts = [MODES[gameMode].label];
    if (cameraMode !== 'standard') parts.push(CAMERAS[cameraMode].label);
    el.textContent = gameMode === 'normal' && cameraMode === 'standard' ? '' : parts.join(' · ');
  }

  let modeSelectBuilt = false;

  function buildModeSelect() {
    const modeRow = document.getElementById('modeRow');
    const cameraRow = document.getElementById('cameraRow');
    Object.keys(MODES).forEach(key => {
      const b = document.createElement('button');
      b.className = 'pill';
      b.dataset.mode = key;
      b.textContent = MODES[key].label;
      b.addEventListener('click', () => { setGameMode(key); refreshModeSelect(); });
      modeRow.appendChild(b);
    });
    Object.keys(CAMERAS).forEach(key => {
      const b = document.createElement('button');
      b.className = 'pill';
      b.dataset.camera = key;
      b.textContent = CAMERAS[key].label;
      b.addEventListener('click', () => { setCameraMode(key); refreshModeSelect(); });
      cameraRow.appendChild(b);
    });
    const gadgetRow = document.getElementById('gadgetRow');
    Object.keys(GADGETS).forEach(key => {
      const b = document.createElement('button');
      b.className = 'pill';
      b.dataset.gadget = key;
      b.textContent = GADGETS[key].icon + ' ' + GADGETS[key].label;
      b.addEventListener('click', () => { setGadgetChoice(key); refreshModeSelect(); });
      gadgetRow.appendChild(b);
    });
    modeSelectBuilt = true;
  }

  function updateGadgetButtonIcon() {
    const btn = document.getElementById('btnGadget');
    if (!btn) return;
    btn.textContent = '';
    btn.appendChild(document.createTextNode(GADGETS[gadgetChoice].icon));
    const sweepEl = document.createElement('div');
    sweepEl.className = 'gadgetSweep';
    sweepEl.id = 'gadgetSweep';
    btn.appendChild(sweepEl);
  }

  function refreshModeSelect() {
    if (!modeSelectBuilt) buildModeSelect();
    document.querySelectorAll('#modeRow .pill').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === gameMode);
    });
    document.querySelectorAll('#cameraRow .pill').forEach(b => {
      b.classList.toggle('active', b.dataset.camera === cameraMode);
    });
    document.querySelectorAll('#gadgetRow .pill').forEach(b => {
      b.classList.toggle('active', b.dataset.gadget === gadgetChoice);
    });
    document.getElementById('selectDesc').textContent =
      MODES[gameMode].desc + ' ' + CAMERAS[cameraMode].desc + ' ' + GADGETS[gadgetChoice].desc;
    updateGadgetButtonIcon();
    updateModeBadge();
  }

  let quitConfirmOpen = false;
  let overlaySnapshot = null;

  function canQuitToMenu() {
    return hasStarted && !modeSelectOpen && !quitConfirmOpen && !gameOver && !shopOpen && !tutorialActive;
  }

  // Merkt sich den aktuellen Overlay-Zustand, damit "Keep playing" ihn exakt wiederherstellt.
  function snapshotOverlay() {
    return {
      hidden: document.getElementById('overlay').classList.contains('hidden'),
      title: document.getElementById('overlayTitle').textContent,
      text: document.getElementById('overlayText').textContent,
      textHidden: document.getElementById('overlayText').classList.contains('hidden'),
      btn: document.getElementById('startBtn').textContent,
      modeBtnHidden: document.getElementById('modeBtn').classList.contains('hidden'),
      paused: paused
    };
  }

  function restoreOverlay(snap) {
    document.getElementById('overlayTitle').textContent = snap.title;
    document.getElementById('overlayText').textContent = snap.text;
    document.getElementById('overlayText').classList.toggle('hidden', snap.textHidden);
    document.getElementById('startBtn').textContent = snap.btn;
    document.getElementById('modeBtn').classList.toggle('hidden', snap.modeBtnHidden);
    document.getElementById('overlay').classList.toggle('hidden', snap.hidden);
  }

  function openQuitConfirm() {
    if (!canQuitToMenu()) return;
    overlaySnapshot = snapshotOverlay();
    quitConfirmOpen = true;
    paused = true; // Lauf einfrieren, solange die Frage offen ist
    showOverlay('Leave this run?', 'Level ' + level + ', score ' + score + ' - all of it is lost.', '↩ Back to menu');
    document.getElementById('quitCancelBtn').classList.remove('hidden');
  }

  function cancelQuit() {
    if (!quitConfirmOpen) return;
    quitConfirmOpen = false;
    document.getElementById('quitCancelBtn').classList.add('hidden');
    paused = overlaySnapshot.paused;
    restoreOverlay(overlaySnapshot);
    overlaySnapshot = null;
    if (!paused) resetMusicTiming();
  }

  function quitToMenu() {
    quitConfirmOpen = false;
    overlaySnapshot = null;
    document.getElementById('quitCancelBtn').classList.add('hidden');
    paused = false;
    running = false;
    gameOver = false;
    dying = false;
    lifeLostFlag = false;
    celebrating = false;
    cancelAnimationFrame(rafId);
    document.getElementById('board-wrap').classList.remove('dimming');
    hasStarted = false; // laesst das Menue-Theme wieder anlaufen
    resetMenuThemeTiming();
    openModeSelect();
  }

  function openModeSelect() {
    modeSelectOpen = true;
    shopOpen = false;
    document.getElementById('shop').classList.add('hidden');
    document.getElementById('startBtn').classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('overlayText').classList.add('hidden');
    document.getElementById('skipBtn').classList.add('hidden');
    document.getElementById('modeBtn').classList.add('hidden');
    document.getElementById('modeSelect').classList.remove('hidden');
    document.getElementById('overlayTitle').textContent = 'Choose your run';
    const firstTime = !tutorialDone();
    const tutBtn = document.getElementById('tutorialBtn');
    tutBtn.classList.remove('hidden');
    tutBtn.textContent = firstTime ? '🎓 Play the tutorial first' : '🎓 Replay tutorial';
    document.getElementById('startBtn').textContent = firstTime ? '▶ Skip - straight into the game' : "▶ Let's go!";
    refreshModeSelect();
  }

