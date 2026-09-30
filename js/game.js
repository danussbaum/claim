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
          (nc === px && nr === py);
        if (blockedCell) { mb.dr = -mb.dr; mb.dc = -mb.dc; continue; }
        // Waechter im Weg: wird zerquetscht
        const squashed = enemies.find(e => e.r === nr && e.c === nc);
        if (squashed) killEnemyByShot(squashed, 'crushed', mb.dc, mb.dr);
        if (grid[nr][nc] === TRAIL) cutTrailAt(nc, nr, '🪨');
        grid[mb.r][mb.c] = EMPTY;
        mb.prevR = mb.r; mb.prevC = mb.c;
        mb.r = nr; mb.c = nc;
        grid[nr][nc] = BLOCK;
        moved = true;
      }
    }
  }

  // Sicht jeden Frame pruefen, nicht nur beim Waechterzug: sonst liesse sich durch den
  // sichtbaren Kegel huschen, solange der Waechter zwischen zwei Schritten ist.
  function updateGuardSight(now) {
    if (now < alarmUntil) return;
    for (const e of enemies) {
      if (canSeePlayer(e)) { e.huntingActive = true; e.lastSeenAt = now; if (trail.length) trailSpotted = true; }
    }
  }

  // Wohin laeuft ein Waechter? Gemeinsam fuer 1-Spieler und Versus (js/versus.js).
  // opts: freie Richtungen [[dx, dy]]. target {c, r}: direkt darauf zu (Jagd, Ablenkung).
  // Sonst je nach Charakter: isLand(c, r) = eroberte Flaeche, trailCells = Linie [[c, r]].
  function chooseGuardStep(e, opts, target, isLand, trailCells) {
    const closest = (tc, tr) => {
      let best = null, bestDist = Infinity;
      for (const [dx, dy] of opts) {
        const d = Math.abs(e.c + dx - tc) + Math.abs(e.r + dy - tr);
        if (d < bestDist) { bestDist = d; best = [dx, dy]; }
      }
      return best;
    };
    if (target) return closest(target.c, target.r);
    if ((e.personality === 'cutter' || e.personality === 'dog') && trailCells && trailCells.length) {
      // Sucht die Linie statt den Spieler
      let t = trailCells[0], tDist = Infinity;
      for (const [tx, ty] of trailCells) {
        const d = Math.abs(tx - e.c) + Math.abs(ty - e.r);
        if (d < tDist) { tDist = d; t = [tx, ty]; }
      }
      return closest(t[0], t[1]);
    }
    if (e.personality === 'guardian') {
      // Haelt Abstand zu eroberter Flaeche
      let best = null, bestScore = -Infinity;
      for (const [dx, dy] of opts) {
        const nx = e.c + dx, ny = e.r + dy;
        let terrCount = 0;
        for (const [ddx, ddy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const cx = nx + ddx, cy = ny + ddy;
          if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) continue;
          if (isLand(cx, cy)) terrCount++;
        }
        const score = -terrCount + Math.random() * 0.5;
        if (score > bestScore) { bestScore = score; best = [dx, dy]; }
      }
      return best;
    }
    if (e.personality === 'nervous') return opts[Math.floor(Math.random() * opts.length)];
    if (Math.random() < 0.65) {
      const keepGoing = opts.find(([dx, dy]) => dx === e.dc0 && dy === e.dr0);
      return keepGoing || opts[Math.floor(Math.random() * opts.length)];
    }
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // only: nur diesen Waechter ziehen (Jagd-Modus: deinen Waechter im eigenen Takt)
  function moveEnemies(only) {
    if (!only) {
      enemyStepTime = performance.now();
      if (enemyStepTime < discoUntil) sndDiscoBeat();
    }
    // Ueber eine Kopie laufen: killEnemyByShot() kann waehrend der Schleife
    // Waechter entfernen und neue anhaengen.
    for (const e of (only ? [only] : enemies.slice())) {
      if (enemies.indexOf(e) === -1) continue; // in diesem Tick bereits entfernt
      if (e.controlled && !only) continue;
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

      let choice, isHuntingNow = false;
      const now = performance.now();
      if (e.controlled) {
        // Jagd-Modus: diesen Waechter steuerst du
        if (now < (e.stunnedUntil || 0)) continue;
        choice = huntGuardStep(e, opts);
        if (!choice) continue;
      } else {
      const nowP = performance.now();
      // Disco: getanzt wird nur auf jeden zweiten Takt
      if (nowP < discoUntil) {
        e.discoBeat = !e.discoBeat;
        if (!e.discoBeat) { e.prevR = e.r; e.prevC = e.c; continue; }
      }
      // Benommen nach Stolpern oder in der Kaffeepause: bleibt stehen
      if (nowP < (e.stunnedUntil || 0)) continue;
      if (nowP < (e.breakUntil || 0)) {
        if (!e.breakSneaked && !huntActive() && Math.abs(e.c - px) + Math.abs(e.r - py) <= 2) {
          e.breakSneaked = true;
          score += BREAK_SNEAK_BONUS;
          updateStats();
          milestonePopups.push({ x: e.c, y: e.r - 1, text: '☕ Sneaky +' + BREAK_SNEAK_BONUS, startTime: nowP });
        }
        continue;
      }
      if (!e.huntingActive && nowP >= alarmUntil && nowP >= (e.distractedUntil || 0) &&
          !tutorialActive && Math.random() < GUARD_BREAK_CHANCE) {
        e.breakUntil = nowP + GUARD_BREAK_MS;
        e.breakSneaked = false;
        guardSay(e, 'break', true);
        sndCoffeeBreak();
        continue;
      }

      if (e.personality === 'nervous' && Math.random() < 0.28) {
        continue; // stockt kurz, wirkt unruhig
      }
      // Scharfschuetze: bewegt sich nur jeden zweiten Takt
      if (e.personality === 'sniper') {
        e.slowBeat = !e.slowBeat;
        if (e.slowBeat) continue;
      }
      // Hund: bleibt ab und zu schnueffelnd stehen
      if (e.personality === 'dog' && Math.random() < 0.3) {
        if (Math.random() < 0.3) spawnEmote('🐾', e.c, e.r);
        continue;
      }

      const alarmActive = now < alarmUntil;

      // Waechter jagen nur, was sie sehen - und merken es sich kurz.
      const seesPlayer = canSeePlayer(e);
      if (seesPlayer) { e.huntingActive = true; e.lastSeenAt = now; if (trail.length) trailSpotted = true; }
      else if (e.huntingActive && now - e.lastSeenAt > VISION_MEMORY) { e.huntingActive = false; guardSay(e, 'lost'); }

      isHuntingNow = alarmActive || e.huntingActive;
      if (isHuntingNow && !e.wasHunting) { sndHunterAlert(); if (!alarmActive) guardSay(e, 'spotted'); }
      e.wasHunting = isHuntingNow;

      if (isHuntingNow) {
        choice = chooseGuardStep(e, opts, { c: px, r: py });
        const best = choice;
        // Stau: ein anderer jagender Waechter steht im Weg - beide blockieren sich
        const blocker = enemies.find(o => o !== e && o.c === e.c + best[0] && o.r === e.r + best[1] &&
                                          (o.huntingActive || alarmActive));
        if (blocker) {
          if (now - (e.lastJamAt || 0) > 3000) {
            e.lastJamAt = now; blocker.lastJamAt = now;
            spawnEmote('😤', e.c, e.r);
            spawnEmote('😤', blocker.c, blocker.r);
            guardSay(e, 'jam', true);
            sndGuardJam();
          }
          continue;
        }
      } else if (now < (e.distractedUntil || 0)) {
        // Abgelenkt: zur Aufschlagstelle laufen und dort stehen bleiben
        if (e.c === e.distractC && e.r === e.distractR) continue;
        choice = chooseGuardStep(e, opts, { c: e.distractC, r: e.distractR });
      } else {
        choice = chooseGuardStep(e, opts, null, (c, r) => grid[r][c] === TERRITORY, trail);
      }
      }

      e.dc0 = choice[0]; e.dr0 = choice[1];
      e.c += choice[0]; e.r += choice[1];

      // Mine: Waechter tritt drauf, er und alle Waechter daneben fliegen in die Luft
      const mine = mines.findIndex(m => m.c === e.c && m.r === e.r && now >= m.armedAt);
      if (mine >= 0) {
        explodeMine(mines.splice(mine, 1)[0], true);
        continue;
      }

      // Bananenschale: Waechter rutscht aus und fliegt
      const peel = bananaPeels.findIndex(b => b.c === e.c && b.r === e.r);
      if (peel >= 0) {
        bananaPeels.splice(peel, 1);
        e.stunnedUntil = now + 1500;
        e.huntingActive = false;
        spawnEmote('🍌', e.c, e.r);
        sndGuardSlip();
        triggerShake(3, 160);
        addRipple(e.c, e.r, 2, 400, '245,221,74', 0.6);
        // Rutscht er dabei in eine Grube daneben, ist es aus
        const pit = [[0,1],[0,-1],[1,0],[-1,0]].map(([dx, dy]) => [e.c + dx, e.r + dy])
          .find(([x, y]) => inBounds(x, y) && grid[y][x] === PIT);
        if (pit && Math.random() < 0.6) {
          e.prevC = e.c; e.prevR = e.r;
          e.c = pit[0]; e.r = pit[1];
          killEnemyByShot(e, 'pit');
          continue;
        }
        guardSay(e, 'trip', true);
      }

      // Stolpern: wer blind hinterherjagt, faellt schon mal in eine Grube
      if (isHuntingNow && grid[e.r][e.c] === PIT && Math.random() < GUARD_TRIP_CHANCE) {
        // Manchmal faellt er ganz hinein
        if (Math.random() < 0.25) { killEnemyByShot(e, 'pit'); continue; }
        e.stunnedUntil = now + GUARD_TRIP_MS;
        e.huntingActive = false;
        spawnEmote('💫', e.c, e.r);
        guardSay(e, 'trip', true);
        sndGuardTrip();
        triggerShake(2, 120);
      }

      if (e.c === px && e.r === py) {
        const nowT = performance.now();
        if (nowT >= shieldUntil) {
          if (nowT < spikesUntil) {
            killEnemyByShot(e, 'spikes');
            continue;
          }
          endGame('A guard caught you.', '😈');
          return;
        }
      } else if (grid[e.r][e.c] === TRAIL) {
        if (e.personality === 'cutter' && !e.controlled) {
          cutTrailAt(e.c, e.r, '✂️');
        } else {
          endGame('A guard cut your line.', '✂️');
          return;
        }
      }
    }
  }

  // Zusaetzlich zur Feldpruefung: Abstand der animierten Positionen,
  // damit Beruehrungen zwischen zwei Feldern (und Feldtausch) zaehlen.
  const TOUCH_RADIUS = 0.6;
  function checkContinuousCollision(now) {
    if (!running || gameOver || dying) return;
    const pT = Math.min(1, (now - playerStepTime) / currentPlayerInterval());
    const dpx = prevPx + (px - prevPx) * pT;
    const dpy = prevPy + (py - prevPy) * pT;
    for (const e of enemies.slice()) {
      const eT = guardStepT(e, now);
      if (now < (e.stunnedUntil || 0)) continue;
      const pc = e.prevC !== undefined ? e.prevC : e.c;
      const pr = e.prevR !== undefined ? e.prevR : e.r;
      const ec = pc + (e.c - pc) * eT, er = pr + (e.r - pr) * eT;
      if (Math.hypot(ec - dpx, er - dpy) >= TOUCH_RADIUS) continue;
      if (now < shieldUntil) continue;
      if (now < spikesUntil) { killEnemyByShot(e, 'spikes'); continue; }
      endGame('A guard caught you.', '😈');
      return;
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
    if (huntActive() && !huntLosing) { huntCaught(reason); return; } // Jagd: die CPU-Figur ist erwischt
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
        if (huntActive()) {
          closeText = '';
        } else if (levelReadyToComplete || capturedPct >= 75) {
          closeText = ' You already had ' + capturedPct + '% - the bonus is gone, but so close!';
        } else {
          closeText = ' Only ' + (75 - capturedPct) + '% left to the next level!';
        }
        const highText = isNewHigh ? '🏆 New high score! ' : '';
        const statsLine = huntActive() ? '\n\n📊 Levels cleared: ' + statLevelsCleared : '\n\n📊 Biggest cut: ' + statBiggestCut + ' cells  ·  Longest line: ' +
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

  // Klickton fuer alle Menueknoepfe (nicht fuer die Spielsteuerung)
  document.addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest && ev.target.closest('button');
    if (!b || b.closest('.controls') || b.disabled) return;
    sndUiClick();
  });

  let shopOpen = false;

  function drawableCards() {
    if (huntActive()) return HUNT_PERK_CARDS.filter(c => (c.id === 'life' ? perks.lives : huntPerkCount(c.id)) < c.max);
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
      const owned = card.id.startsWith('h_') ? huntPerkCount(card.id) : perkCount(card.id);
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
    hideOverlayExtras();
    animateOverlayIn();
  }

  function showOverlay(title, text, btnLabel, opts) {
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
    hideOverlayExtras();
    if (opts) showOverlayResults(opts);
    animateOverlayIn();
  }

  // Menue-Inhalte gestaffelt einblenden (Titel zuerst, dann der Rest)
  function animateOverlayIn() {
    const ov = document.getElementById('overlay');
    ov.classList.remove('enter');
    void ov.offsetWidth; // Animation neu starten
    let i = 0;
    for (const el of ov.children) {
      if (el.classList.contains('hidden')) continue;
      el.style.animationDelay = (i++ * 55) + 'ms';
    }
    ov.classList.add('enter');
  }

  let overlayTimers = [];
  function hideOverlayExtras() {
    for (const t of overlayTimers) clearTimeout(t);
    overlayTimers = [];
    document.getElementById('overlayScore').classList.add('hidden');
    document.getElementById('overlayPops').classList.add('hidden');
  }

  // Levelabschluss: Punkte zaehlen hoch, danach poppen die Zeilen einzeln auf
  function showOverlayResults(opts) {
    const scoreEl = document.getElementById('overlayScore');
    const popsEl = document.getElementById('overlayPops');
    const from = opts.scoreFrom || 0, to = opts.scoreTo || 0;
    scoreEl.classList.remove('hidden');
    scoreEl.classList.remove('done');
    scoreEl.textContent = from;
    popsEl.innerHTML = '';
    popsEl.classList.remove('hidden');
    const items = (opts.pops || []).map(txt => {
      const d = document.createElement('div');
      d.className = 'pop';
      d.textContent = txt;
      popsEl.appendChild(d);
      return d;
    });
    const dur = Math.min(1100, 300 + (to - from) * 2);
    const start = performance.now() + 250;
    let lastTick = 0;
    const step = () => {
      const now = performance.now();
      const t = Math.max(0, Math.min(1, (now - start) / dur));
      const e = 1 - Math.pow(1 - t, 3);
      scoreEl.textContent = Math.round(from + (to - from) * e);
      if (t > 0 && now - lastTick > 55 && t < 1) { lastTick = now; sndScoreTick(e); }
      if (t < 1) { overlayTimers.push(setTimeout(step, 16)); return; }
      scoreEl.classList.add('done');
      items.forEach((d, i) => overlayTimers.push(setTimeout(() => {
        d.classList.add('in');
        sndOverlayPop(i);
      }, 120 + i * 260)));
    };
    step();
  }

  // Kurzer diagonaler Wisch ueber das Feld beim Levelstart
  function playLevelWipe() {
    const w = document.getElementById('levelWipe');
    if (!w) return;
    w.classList.remove('active');
    void w.offsetWidth;
    w.classList.add('active');
  }
  function hideOverlay() {
    document.getElementById('overlay').classList.add('hidden');
  }

