  // --- Adaptive Hintergrundmusik ---
  let musicNextNoteTime = 0;
  let musicStepIndex = 0;
  const MUSIC_SCALE = [0, 3, 5, 7, 10, 12, 15, 19];
  const MUSIC_ROOT = 174.6;

  function resetMusicTiming() {
    if (!audioCtx) return;
    musicNextNoteTime = audioCtx.currentTime + 0.1;
    musicStepIndex = 0;
  }

  function nearestEnemyDist() {
    if (!enemies.length) return 99;
    let min = 99;
    for (const e of enemies) {
      const d = Math.abs(e.c - px) + Math.abs(e.r - py);
      if (d < min) min = d;
    }
    return min;
  }

  function checkNearMiss(now) {
    if (gameOver || paused) return;
    const d = nearestEnemyDist();
    if (d === 1 && prevNearestDist > 1 && now > nearMissCooldownUntil) {
      nearMissCooldownUntil = now + 1500;
      nearMissPopups.push({ x: px, y: py, startTime: now });
      addRipple(px, py, 4.5, 620, '255,210,63', 0.7);
      spawnEmote('😅', px, py);
      sndNearMiss();
      triggerShake(3, 200);
      vibrate(40);
    }
    prevNearestDist = d;
  }

  function computeTension(now) {
    let t = 0;
    const dist = nearestEnemyDist();
    t += Math.max(0, 1 - dist / 9) * 0.5;
    if (trail.length > 0) t += 0.15;
    if (enemies.some(e => e.personality === 'hunter' && (Math.abs(e.c - px) + Math.abs(e.r - py)) <= 6)) t += 0.25;
    if (lives === 1) t += 0.15;
    if (capturedPct >= 65) t += 0.1;
    if (now < shieldUntil || now < freezeUntil) t -= 0.15;
    return Math.max(0, Math.min(1, t));
  }

  function updateAmbient(now) {
    if (!audioCtx || !padGain || !subGain || !padFilter || !padOsc2) return;
    const active = running && !paused && !gameOver;
    const speedActive = active && now < speedUntil;
    const shieldActive = active && now < shieldUntil;
    const iceActive = active && now < freezeUntil;

    const target = active ? computeTension(now) : 0;
    smoothedTension += (target - smoothedTension) * 0.04;

    // Grund-Pad: dunkler/traeger bei Eis, heller bei Speed
    let cutoff = 320 + smoothedTension * 2300 + ((level || 1) - 1) * 40;
    let detune = 6 + smoothedTension * 22;
    let padVol = active ? (0.016 + smoothedTension * 0.05) : 0.0001;
    let subVol = active ? (0.012 + smoothedTension * 0.06) : 0.0001;

    if (speedActive) { cutoff += 900; padVol *= 1.25; }
    if (iceActive) { cutoff *= 0.4; detune *= 0.25; subVol *= 0.6; }

    padGain.gain.setTargetAtTime(padVol, audioCtx.currentTime, 0.25);
    subGain.gain.setTargetAtTime(subVol, audioCtx.currentTime, 0.3);
    padFilter.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, 0.2);
    padOsc2.detune.setTargetAtTime(detune, audioCtx.currentTime, 0.2);

    // Schild: schimmernder Tremolo-Ton
    if (shimmerGain && shimmerLFOGain) {
      shimmerGain.gain.setTargetAtTime(shieldActive ? 0.03 : 0.0001, audioCtx.currentTime, 0.2);
      shimmerLFOGain.gain.setTargetAtTime(shieldActive ? 0.022 : 0.0001, audioCtx.currentTime, 0.2);
    }

    // Eis: hohes Glitzern waehrend Waechter eingefroren
    if (iceGain) {
      iceGain.gain.setTargetAtTime(iceActive ? 0.012 : 0.0001, audioCtx.currentTime, 0.15);
    }
  }

  function sndBoost() {
    tone(1400, 0.06, 'sine', 0.06, 0, 2000, 'music');
    tone(1900, 0.05, 'sine', 0.05, 0.03, 2600, 'music');
  }

  function musicFreq(semitoneIdx, octaveShift) {
    const n = MUSIC_SCALE[semitoneIdx % MUSIC_SCALE.length] + (octaveShift || 0) * 12;
    return MUSIC_ROOT * Math.pow(2, n / 12);
  }

  function updateMusicScheduler() {
    if (!audioCtx || musicNextNoteTime === 0) return;
    const now = performance.now();
    let bpm = Math.min(150, 92 + (level - 1) * 6);
    if (now < speedUntil) bpm *= 1.55;
    if (now < freezeUntil) bpm *= 0.5;
    const stepDur = 60 / bpm / 2;

    while (audioCtx.currentTime >= musicNextNoteTime) {
      const dist = nearestEnemyDist();
      const danger = Math.max(0, Math.min(1, 1 - dist / 9));
      const isTrailing = trail.length > 0;
      const frozen = performance.now() < freezeUntil;
      const step = musicStepIndex % 8;
      const levelOffset = Math.floor((level - 1) / 2);

      if (step === 0 || step === 4) {
        tone(musicFreq(0 + levelOffset, -1), stepDur * 1.7, 'triangle', 0.05 + danger * 0.03, 0, undefined, 'music');
      }
      if (step % 2 === 0) {
        const idx = (step / 2 + levelOffset) % MUSIC_SCALE.length;
        tone(musicFreq(idx, 0), stepDur * 0.9, 'sine', 0.045 + danger * 0.035, 0, undefined, 'music');
      }
      if (!frozen && danger > 0.4 && (step === 2 || step === 6)) {
        tone(musicFreq((step + levelOffset) % MUSIC_SCALE.length, 1), stepDur * 0.5, 'square', 0.03 + danger * 0.04, 0, undefined, 'music');
      }
      if (isTrailing && step % 2 === 1) {
        tone(musicFreq((step + 3 + levelOffset) % MUSIC_SCALE.length, 1), stepDur * 0.4, 'triangle', 0.025, 0, undefined, 'music');
      }

      musicNextNoteTime += stepDur;
      musicStepIndex++;
    }
  }

  function resetLevel(newLevel) {
    level = newLevel;
    initGrid();
    if (!tutorialActive) placeObstacles(level);
    else { bonusCells = []; bonusClaimed = false; movingBlocks = []; }
    px = Math.floor(COLS / 2); py = 0;
    prevPx = px; prevPy = py; playerStepTime = performance.now();
    dir = 'right'; nextDir = 'right';
    trail = [];
    enemies = [];
    const enemyCount = tutorialActive ? 0 : Math.min(1 + Math.floor((level - 1) / 2), 4);
    for (let i = 0; i < enemyCount; i++) {
      const personality = randomPersonality();
      const newEnemy = spawnEnemy(personality);
      if (newEnemy) enemies.push(newEnemy);
    }
    playerInterval = 190 * Math.pow(0.9, perks.moveSpeed);
    enemyInterval = Math.max(120, 280 - (level - 1) * 18);
    playerTimer = 0; enemyTimer = 0;
    enemyStepTime = performance.now();
    powerUps = [];
    revealPopups = [];
    powerUpSpawnTimer = 0;
    shieldUntil = perks.kevlar ? performance.now() + 3000 * perks.kevlar : 0;
    speedUntil = 0; freezeUntil = 0;
    confuseUntil = 0; fogUntil = 0; alarmUntil = 0;
    trailGuardUntil = 0;
    rapidfireUntil = 0; spikesUntil = 0;
    slowUntil = 0; swarmUntil = 0; drunkUntil = 0;
    smokeParticles = [];
    hookAnim = null;
    swarmEnemies = [];
    shotCooldownUntil = 0;
    boostsRemaining = 3 + perks.boosts * 2;
    boostsMax = boostsRemaining;
    prevNearestDist = 99;
    nearMissCooldownUntil = performance.now() + 500;
    swipeHintUntil = performance.now() + 20000;
    levelReadyToComplete = false;
    lifeLostThisLevel = false;
    milestone25Shown = false;
    milestone50Shown = false;
    gameOver = false;
    flashCells = [];
    bgRipples = [];
    updateStats();
  }

  function spawnEnemy(personality) {
    const MIN_DIST = 7;
    let r, c, tries = 0;

    // 1. Versuch: zufaellig mit Mindestabstand zum Spieler
    do {
      r = 1 + Math.floor(Math.random() * (ROWS - 2));
      c = 1 + Math.floor(Math.random() * (COLS - 2));
      tries++;
    } while (
      tries < 300 &&
      (grid[r][c] !== EMPTY || Math.abs(r - py) + Math.abs(c - px) < MIN_DIST)
    );

    // 2. Versuch: zufaellig, Mindestabstand egal, nur freies Feld noetig
    if (grid[r][c] !== EMPTY) {
      tries = 0;
      do {
        r = 1 + Math.floor(Math.random() * (ROWS - 2));
        c = 1 + Math.floor(Math.random() * (COLS - 2));
        tries++;
      } while (tries < 150 && grid[r][c] !== EMPTY);
    }

    // 3. Versuch: komplettes Feld systematisch nach einer freien Zelle absuchen
    if (grid[r][c] !== EMPTY) {
      let found = false;
      for (let rr = 1; rr < ROWS - 1 && !found; rr++) {
        for (let cc = 1; cc < COLS - 1 && !found; cc++) {
          if (grid[rr][cc] === EMPTY) { r = rr; c = cc; found = true; }
        }
      }
      if (!found) return null; // wirklich kein freies Feld mehr uebrig
    }

    return {
      r, c, prevR: r, prevC: c, personality: personality || 'wanderer',
      dc0: [1,-1,0,0][Math.floor(Math.random()*4)], dr0: 0, angleDisp: undefined,
      wasHunting: false, huntingActive: false, huntCooldownUntil: 0, lastSeenAt: -99999
    };
  }

  function killEnemyByShot(e) {
    const idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
    enemyDeathAnims.push({
      r: e.r, c: e.c,
      color: PERSONALITY_COLORS[e.personality] || '#e3574a',
      startTime: performance.now()
    });
    sndEnemyDeath();
    statKills++;
    triggerShake(6, 220);
    triggerSlowMo(110);
    vibrate([25]);
    score += 50;
    updateStats();

    tutorialFlag('killed');
    if (tutorialActive) return; // im Tutorial kommt kein Ersatz nach
    const newPersonality = randomPersonality();
    const newEnemy = spawnEnemy(newPersonality);
    if (newEnemy) enemies.push(newEnemy);
  }

  // Preis fuer das Freischiessen: ein Schuss zerstoert genau einen Linien-Block
  const SELF_CUT_COST = 100;
  const SHOT_COOLDOWN_BASE = 900;
  function shotCooldownMs() { return Math.max(300, SHOT_COOLDOWN_BASE * Math.pow(0.75, perks.shotSpeed)); }
  const SHOT_RANGE = 8;

  function shoot() {
    if (gameOver || paused || celebrating || countdownActive) return;
    const now = performance.now();
    const rapidfireActive = now < rapidfireUntil;
    if (!rapidfireActive) {
      if (now < shotCooldownUntil) return;
      shotCooldownUntil = now + shotCooldownMs();
    }

    const [ddx, ddy] = dirDelta(dir);
    let hitEnemy = null;
    let hitTrail = null;
    let endCx = px, endCy = py;

    for (let step = 1; step <= SHOT_RANGE; step++) {
      const cx = px + ddx * step, cy = py + ddy * step;
      if (!inBounds(cx, cy)) break;
      if (grid[cy][cx] === TERRITORY || grid[cy][cx] === BLOCK) { endCx = cx - ddx; endCy = cy - ddy; break; }
      endCx = cx; endCy = cy;
      const hit = enemies.find(e => e.c === cx && e.r === cy);
      if (hit) { hitEnemy = hit; break; }
      // Eigene Linie freischiessen: der Schuss bleibt in ihr stecken
      if (grid[cy][cx] === TRAIL) { hitTrail = [cx, cy]; break; }
    }

    shotProjectiles.push({
      x0: px * CELL + CELL / 2, y0: py * CELL + CELL / 2,
      x1: endCx * CELL + CELL / 2, y1: endCy * CELL + CELL / 2,
      startTime: now, life: 160
    });
    addRipple(px, py, 2.6, 380, '255,138,110', 0.55);
    sndShoot();

    if (hitEnemy) {
      killEnemyByShot(hitEnemy);
    } else if (hitTrail) {
      shootOutTrailCell(hitTrail[0], hitTrail[1]);
    }
  }

  function resetGame() {
    score = 0;
    lives = 3;
    gadgetCooldownUntil = 0;
    smokeUntil = 0;
    comboCount = 0;
    prevNearestDist = 99;
    nearMissPopups = [];
    comboPopups = [];
    revealPopups = [];
    fireworkParticles = [];
    dustParticles = [];
    emotePopups = [];
    milestonePopups = [];
    gamblerStreak = 0;
    enemyDeathAnims = [];
    shotProjectiles = [];
    celebrating = false;
    resetRunStats();
    perks = defaultPerks();
    resetLevel(1);
  }

  function dirDelta(d) {
    if (d === 'up') return [0, -1];
    if (d === 'down') return [0, 1];
    if (d === 'left') return [-1, 0];
    return [1, 0];
  }

  // Kurzer Sprint in die aktuelle Laufrichtung. Ausgeloest per ⚡-Knopf oder indem
  // man die Richtung nochmals angibt, in die man ohnehin laeuft.
  function useBoost() {
    if (gameOver || paused || countdownActive || !running || boostsRemaining <= 0) return;
    speedUntil = Math.max(speedUntil, performance.now() + 180);
    boostsRemaining--;
    tutorialFlag('boost');
    updateStats();
    sndBoost();
    if (boostsRemaining === 0) unlockAchievement('speed_demon');
  }

  function setDir(d) {
    if (gameOver || paused || countdownActive) return;
    // Push-Kamera und Confuse invertieren beide - zusammen heben sie sich auf.
    let mirrored = performance.now() < confuseUntil;
    if (cameraMode === 'push') mirrored = !mirrored;
    if (mirrored) d = INVERTED_DIR[d];
    if (d === dir) useBoost();
    nextDir = d;
  }

  function inBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

  function killEnemyCollisionCheck(x, y) {
    return enemies.some(e => e.c === x && e.r === y);
  }

  function spawnPowerUp() {
    let r = 0, c = 0, ok = false;
    for (let tries = 0; tries < 200 && !ok; tries++) {
      r = 1 + Math.floor(Math.random() * (ROWS - 2));
      c = 1 + Math.floor(Math.random() * (COLS - 2));
      ok = grid[r][c] === EMPTY &&
           !(r === py && c === px) &&
           !enemies.some(e => e.r === r && e.c === c) &&
           !powerUps.some(p => p.r === r && p.c === c);
    }
    if (!ok) return;
    const isDown = Math.random() < 0.35;
    const kind = isDown ? 'down' : 'up';
    const type = isDown
      ? POWERDOWN_TYPES[Math.floor(Math.random() * POWERDOWN_TYPES.length)]
      : POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerUps.push({ r, c, type, kind, spawnTime: performance.now() });
  }

  function activatePowerUp(type) {
    const now = performance.now();
    const f = powerDurationFactor();
    if (type === 'speed') speedUntil = now + 4000 * f;
    else if (type === 'shield') shieldUntil = now + 4000 * f;
    else if (type === 'freeze') freezeUntil = now + 3000 * f;
    else if (type === 'trailguard') trailGuardUntil = now + 5000 * f;
    else if (type === 'rapidfire') rapidfireUntil = now + 5000 * f;
    else if (type === 'spikes') spikesUntil = now + 5000 * f;
    score += 15;
    updateStats();
    sndPowerUp(type);
  }

  function gadgetReady() { return performance.now() >= gadgetCooldownUntil; }
  function gadgetCooldownFrac() {
    const rem = gadgetCooldownUntil - performance.now();
    const total = GADGETS[gadgetChoice].cooldown;
    return Math.max(0, Math.min(1, rem / total));
  }

  function useGadget() {
    if (gameOver || paused || celebrating || countdownActive || dying) return;
    if (!gadgetReady()) return;
    const now = performance.now();
    gadgetCooldownUntil = now + GADGETS[gadgetChoice].cooldown;

    tutorialFlag('gadgetUsed');
    tutorialFlag(gadgetChoice === 'smoke' ? 'smokeUsed' : 'hookUsed');
    if (gadgetChoice === 'smoke') {
      smokeUntil = now + GADGET_SMOKE_MS;
      sndGadgetSmoke();
      spawnEmote('💨', px, py);
      triggerShake(2, 150);
      return;
    }

    // Enterhaken: zieht den Spieler bis zu GADGET_HOOK_PULL Zellen in Blickrichtung.
    sndGadgetHook();
    const [dx, dy] = dirDelta(dir);
    const originC = px, originR = py;
    prevPx = px; prevPy = py;
    playerStepTime = now;
    let pulled = 0;
    for (let i = 0; i < GADGET_HOOK_PULL; i++) {
      const result = advancePlayerToCell(px + dx, py + dy);
      if (result === 'moved') { pulled++; continue; }
      break; // Wand, Saeule, Rand oder Tod - stoppt den Zug
    }
    hookAnim = {
      ox: originC, oy: originR, dx, dy,
      reachCells: pulled > 0 ? pulled : 0.55,
      startTime: now,
      mode: pulled > 0 ? 'pull' : 'bounce'
    };
    if (pulled > 0) {
      triggerShake(3, 140);
      spawnEmote('💨', prevPx, prevPy);
    } else {
      triggerShake(2, 90);
    }
  }

  function spawnSwarmEnemy() {
    const personality = randomPersonality();
    const e = spawnEnemy(personality);
    if (e) {
      e.temporary = true;
      enemies.push(e);
      swarmEnemies.push(e);
    }
  }

  function clearSwarmEnemies() {
    for (const se of swarmEnemies) {
      const idx = enemies.indexOf(se);
      if (idx >= 0) enemies.splice(idx, 1);
    }
    swarmEnemies = [];
  }

  function activatePowerDown(type) {
    const now = performance.now();
    if (type === 'confuse') confuseUntil = now + 4000;
    else if (type === 'fog') fogUntil = now + 5000;
    else if (type === 'alarm') { alarmUntil = now + 3500; triggerShake(4, 250); vibrate([50, 30, 50]); }
    else if (type === 'slow') slowUntil = now + 4000;
    else if (type === 'swarm') { swarmUntil = now + 6000; spawnSwarmEnemy(); }
    else if (type === 'drunk') drunkUntil = now + 5500;
    updateStats();
    sndPowerDown(type);
  }

  function currentPlayerInterval() {
    const now = performance.now();
    if (now < speedUntil) return playerInterval * 0.55;
    if (now < slowUntil) return playerInterval * 1.6;
    return playerInterval;
  }

  function checkPowerUpPickup(nx, ny) {
    const idx = powerUps.findIndex(p => p.c === nx && p.r === ny);
    if (idx >= 0) {
      const p = powerUps[idx];
      const now = performance.now();
      revealPopups.push({
        x: nx, y: ny, type: p.type, kind: p.kind,
        startTime: now, resolveAt: now + ROULETTE_MS, applied: false, lastTickIdx: -1
      });
      powerUps.splice(idx, 1);
      tutorialFlag('orb');
    }
  }

  function updatePendingReveals(now) {
    for (const rp of revealPopups) {
      if (rp.applied) continue;
      if (now >= rp.resolveAt) {
        rp.applied = true;
        if (rp.kind === 'down') activatePowerDown(rp.type);
        else activatePowerUp(rp.type);
        continue;
      }
      const idx = Math.floor((now - rp.startTime) / ROULETTE_STEP_MS) % ALL_MYSTERY_TYPES.length;
      if (idx !== rp.lastTickIdx) {
        rp.lastTickIdx = idx;
        sndRouletteTick();
      }
    }
  }
  // Eine einzelne Zellbewegung des Spielers - von normalem Schritt und Enterhaken geteilt.
  // Gibt 'moved', 'blocked' (Saeule/Grube/Rand) oder 'dead' (Spielende ausgeloest) zurueck.
  function advancePlayerToCell(nx, ny) {
    if (!inBounds(nx, ny)) return 'blocked';
    if (isObstacle(grid[ny][nx])) return 'blocked';

    const nowT = performance.now();
    const enemyAhead = killEnemyCollisionCheck(nx, ny);
    if (enemyAhead && nowT >= shieldUntil && nowT < spikesUntil) {
      const hit = enemies.find(e => e.c === nx && e.r === ny);
      if (hit) killEnemyByShot(hit);
    } else if (grid[ny][nx] === TRAIL) {
      endGame('You touched your own line.', '😵');
      return 'dead';
    } else if (enemyAhead && nowT >= shieldUntil) {
      endGame('A guard caught you.', '😈');
      return 'dead';
    }

    checkPowerUpPickup(nx, ny);

    if (grid[ny][nx] === TERRITORY) {
      if (trail.length > 0) finalizeCapture();
      px = nx; py = ny;
    } else {
      trail.push([nx, ny]);
      if (trail.length > statLongestTrail) statLongestTrail = trail.length;
      grid[ny][nx] = TRAIL;
      px = nx; py = ny;
    }
    return 'moved';
  }

  function stepPlayer() {
    prevPx = px; prevPy = py;
    playerStepTime = performance.now();
    dir = nextDir;
    const [dx, dy] = dirDelta(dir);
    advancePlayerToCell(px + dx, py + dy);
  }

  function finalizeCapture() {
    // Im Tutorial zaehlt schon die geschlossene Schleife, auch wenn sie nichts umschliesst.
    if (trail.length > 0) tutorialFlag('captured');
    for (const [tx, ty] of trail) grid[ty][tx] = TERRITORY;
    trail = [];

    const visited = Array.from({length: ROWS}, () => Array(COLS).fill(false));
    const components = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === EMPTY && !visited[r][c]) {
          const comp = [];
          const stack = [[r, c]];
          visited[r][c] = true;
          while (stack.length) {
            const [cr, cc] = stack.pop();
            comp.push([cr, cc]);
            const neigh = [[cr+1,cc],[cr-1,cc],[cr,cc+1],[cr,cc-1]];
            for (const [nr, nc] of neigh) {
              if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
              if (visited[nr][nc]) continue;
              if (grid[nr][nc] !== EMPTY) continue;
              visited[nr][nc] = true;
              stack.push([nr, nc]);
            }
          }
          components.push(comp);
        }
      }
    }

    let gained = 0;
    let gainSumR = 0, gainSumC = 0;
    for (const comp of components) {
      const hasEnemy = comp.some(([r, c]) => enemies.some(e => e.r === r && e.c === c));
      if (!hasEnemy) {
        for (const [r, c] of comp) {
          grid[r][c] = TERRITORY;
          flashCells.push({ r, c, time: performance.now() });
          gainSumR += r; gainSumC += c;
          gained++;
        }
      }
    }
    // Welle aus dem Schwerpunkt der eroberten Flaeche - je groesser der Claim,
    // desto weiter laeuft sie.
    if (gained > 0) {
      addRipple(gainSumC / gained, gainSumR / gained,
                Math.min(14, 2.5 + Math.sqrt(gained) * 1.4),
                520 + Math.min(380, gained * 6), '127,224,160', 0.8);
    }
    if (!bonusClaimed && bonusCells.length) {
      const allClaimed = bonusCells.every(b => grid[b.r][b.c] === TERRITORY);
      if (allClaimed) {
        bonusClaimed = true;
        tutorialFlag('bonus');
        const bonusScore = bonusCells.length * 5 * (BONUS_MULT - 1);
        score += bonusScore;
        const mid = bonusCells[Math.floor(bonusCells.length / 2)];
        milestonePopups.push({ x: mid.c, y: mid.r, text: '⭐ Bonus +' + bonusScore, startTime: performance.now() });
        spawnFireworkBurst(mid.c * CELL + CELL / 2, mid.r * CELL + CELL / 2, ['#ffd23f', '#ffb03a', '#fff2b0']);
        sndPowerUp('speed');
      }
    }
    if (gained > statBiggestCut) statBiggestCut = gained;
    // Waechter, die in einer Grube eingeschlossen wurden, koennen sich nie mehr bewegen.
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const stuck = [[e.r+1,e.c],[e.r-1,e.c],[e.r,e.c+1],[e.r,e.c-1]].every(([nr, nc]) =>
        nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc] === TERRITORY || grid[nr][nc] === BLOCK);
      if (stuck) {
        enemies.splice(i, 1);
        const si = swarmEnemies.indexOf(e);
        if (si >= 0) swarmEnemies.splice(si, 1);
        if (!e.temporary) {
          const ne = spawnEnemy(randomPersonality());
          if (ne) enemies.push(ne);
        }
      }
    }
    score += Math.round(gained * 5 * (1 + perks.payday * 0.25));
    if (gained > 0) {
      comboCount++;
      const mult = comboMultiplier();
      const bonus = Math.round(gained * 5 * (mult - 1));
      score += bonus;
      sndCapture(gained, comboCount);
      if (gained > 12) {
        triggerShake(Math.min(7, 2 + gained * 0.08), 220);
        spawnEmote('💪', px, py);
      }
      if (gained > 2) {
        spawnFireworkBurst(px * CELL + CELL / 2, py * CELL + CELL / 2, ['#63c96a', '#7fe0a0', '#ffd23f']);
      }
      if (comboCount >= 2) {
        comboPopups.push({ x: px, y: py, combo: comboCount, mult, startTime: performance.now() });
      }
    }
    const freshPct = Math.round((countTerritory() / totalCells()) * 100);

    if (!milestone25Shown && freshPct >= 25) {
      milestone25Shown = true;
      milestonePopups.push({ x: px, y: py, text: '🎉 25%!', startTime: performance.now() });
      sndPowerUp('shield');
    }
    if (!milestone50Shown && freshPct >= 50) {
      milestone50Shown = true;
      milestonePopups.push({ x: px, y: py, text: '🔥 Halfway!', startTime: performance.now() });
      sndPowerUp('speed');
    }
    if (freshPct >= 75 && !levelReadyToComplete && (!tutorialActive || tutorialAllowCashOut)) {
      levelReadyToComplete = true;
    }

    updateStats();

    if (freshPct >= 100 && !celebrating) {
      triggerLevelCompleteFireworks();
    }
  }

  function spawnFireworkBurst(cx, cy, customPalette) {
    const palette = customPalette || ['#ff4d4d', '#ffd23f', '#4f7ee5', '#63c96a', '#e89b3d', '#b06fe0', '#7fdcff'];
    const count = 22;
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 90 + Math.random() * 150;
      fireworkParticles.push({
        x0: cx, y0: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: palette[Math.floor(Math.random() * palette.length)],
        startTime: now,
        life: 700 + Math.random() * 500
      });
    }
  }

  function triggerLevelCompleteFireworks() {
    if (celebrating) return;
    if (tutorialActive) {
      levelReadyToComplete = false;
      if (tutorialAllowCashOut) {
        // Auszahlen ist der letzte Tutorialschritt - kein Levelwechsel.
        sndVictoryFanfare();
        vibrate([30, 30, 30, 30, 60]);
        tutorialFlag('cashedOut');
        return;
      }
      // Feld komplett erobert, Etappe aber noch offen: frisches Feld, sonst haengt man fest.
      if (!TUTORIAL_STAGES[tutorialStage].done()) {
        const idx = tutorialStage;
        sndLevelUp();
        showTutorialBar('Whole board claimed! Here is a fresh one - the step is still open.',
                        'Step ' + (idx + 1) + ' of ' + TUTORIAL_STAGES.length, true);
        running = false;
        cancelAnimationFrame(rafId);
        setTimeout(() => {
          if (!tutorialActive) return;
          applyTutorialStage(idx);
          dying = false;
          gameOver = false;
          running = true;
          lastTime = 0;
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(loop);
        }, 1100);
      }
      return;
    }
    celebrating = true;
    levelReadyToComplete = false;
    const lv = level + 1;

    const bonusPct = Math.min(100, Math.max(0, Math.floor((capturedPct - 75) / 5)) * 5);
    const levelBonus = Math.round(200 * (1 + bonusPct / 100));
    score += levelBonus;
    const isNewHigh = saveHighScoreIfNeeded();
    updateStats();
    sndVictoryFanfare();
    vibrate([30, 30, 30, 30, 60]);

    unlockAchievement('first_level');
    if (!lifeLostThisLevel) unlockAchievement('untouchable');
    if (bonusPct >= 15) {
      gamblerStreak++;
      if (gamblerStreak >= 3) unlockAchievement('gambler');
    } else {
      gamblerStreak = 0;
    }

    const burstCount = 5;
    for (let i = 0; i < burstCount; i++) {
      const delay = i * 220 + Math.random() * 100;
      setTimeout(() => {
        const cx = Math.random() * boardCanvas.width;
        const cy = CELL * 2 + Math.random() * Math.max(1, (ROWS - 4)) * CELL;
        const palette = isNewHigh ? ['#ffd23f', '#ffe27a', '#fff2b8', '#ff8a3d'] : undefined;
        spawnFireworkBurst(cx, cy, palette);
        sndFireworkPop();
      }, delay);
    }

    if (isNewHigh) {
      setTimeout(() => sndHighscoreSting(), 100);
    }

    const bonusText = bonusPct > 0 ? (' Risk bonus: +' + bonusPct + '%!') : '';
    const highText = isNewHigh ? '🏆 NEW HIGH SCORE! ' : '';

    setTimeout(() => {
      celebrating = false;
      fireworkParticles = [];
      statLevelsCleared++;
      resetLevel(lv);
      running = false;
      openShop('Level ' + lv + ' - choose your edge', () => {
        showOverlay('Level ' + lv + '!', highText + 'Territory secured.' + bonusText + ' Onward - faster and with more guards.', 'Continue');
      });
    }, 1900);
  }

  // Schiesst genau einen Block aus der eigenen Linie heraus - der Rest bleibt liegen.
  function shootOutTrailCell(cx, cy) {
    const idx = trail.findIndex(([tx, ty]) => tx === cx && ty === cy);
    if (idx < 0) return 0;
    trail.splice(idx, 1);
    if (grid[cy][cx] === TRAIL) grid[cy][cx] = EMPTY;
    flashCells.push({ r: cy, c: cx, time: performance.now() });
    comboCount = 0;
    tutorialFlag('selfShot');
    const penalty = Math.min(score, SELF_CUT_COST);
    score -= penalty;
    updateStats();
    sndLineCut();
    triggerShake(4, 180);
    vibrate([35, 25, 35]);
    milestonePopups.push({ x: cx, y: cy, text: '🔫 Blasted free -' + penalty, startTime: performance.now() });
    return penalty;
  }

  // Trennt die Linie an (cx, cy): alles vom Anfang bis zur Schnittstelle geht verloren.
  function cutTrailAt(cx, cy, emoji) {
    const idx = trail.findIndex(([tx, ty]) => tx === cx && ty === cy);
    if (idx < 0) return 0;
    const removed = trail.splice(0, idx + 1);
    for (const [tx, ty] of removed) {
      if (grid[ty][tx] === TRAIL) grid[ty][tx] = EMPTY;
      flashCells.push({ r: ty, c: tx, time: performance.now() });
    }
    comboCount = 0;
    tutorialFlag('lineCut');
    sndLineCut();
    triggerShake(5, 200);
    vibrate([40, 30, 40]);
    milestonePopups.push({ x: cx, y: cy, text: (emoji || '✂️') + ' Line cut!', startTime: performance.now() });
  }

