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

