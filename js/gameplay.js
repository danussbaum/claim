  // --- Gameplay: Level-Start, Gegner, Schiessen, Power-ups, Gadgets, Bewegung, Eroberung, Levelende ---

  function resetLevel(newLevel) {
    level = newLevel;
    scoreAtLevelStart = score || 0;
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
    slowUntil = 0; swarmUntil = 0; drunkUntil = 0; psyloUntil = 0;
    smokeParticles = [];
    hookAnim = null;
    swarmEnemies = [];
    decoyCharges = 0; decoys = []; mines = []; trailSpotted = false; guardBubbles = [];
    duckUntil = 0; heliumUntil = 0; discoUntil = 0; bananaSlide = 0; bananaPeels = [];
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
      r, c, prevR: r, prevC: c, personality: personality || 'wanderer', name: guardName(personality || 'wanderer'),
      dc0: [1,-1,0,0][Math.floor(Math.random()*4)], dr0: 0, angleDisp: undefined,
      wasHunting: false, huntingActive: false, huntCooldownUntil: 0, lastSeenAt: -99999
    };
  }

  // kind: 'shot' (weggeschleudert in dx/dy), 'spikes' (plattgewalzt), 'sealed' (versteinert),
  // 'pit' (in die Grube gefallen), 'crushed' (von beweglicher Saeule zerquetscht, dx/dy = Schubrichtung)
  const MULTIKILL_WINDOW = 2000;
  const MULTIKILL_NAMES = ['', '', 'DOUBLE KILL!', 'TRIPLE KILL!', 'MULTI KILL!', 'MONSTER KILL!'];
  let lastKillAt = 0, killStreak = 0;
  function killEnemyByShot(e, kind, dx, dy, trick) {
    const idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
    enemyDeathAnims.push({
      r: e.r, c: e.c, kind: kind || 'shot', dx: dx || 0, dy: dy || 0,
      color: PERSONALITY_COLORS[e.personality] || '#e3574a',
      startTime: performance.now()
    });
    sndEnemyDeath();
    spawnSparks(e.c * CELL + CELL / 2, e.r * CELL + CELL / 2, PERSONALITY_COLORS[e.personality] || '#e3574a', 22, 260, 0);
    spawnSparks(e.c * CELL + CELL / 2, e.r * CELL + CELL / 2, '#fff2c0', 10, 200, 0);
    guardScream(e);
    guardReactToDeath(e);
    statKills++;
    triggerShake(6, 220);
    triggerSlowMo(110);
    vibrate([25]);
    score += 50;

    const nowK = performance.now();
    killStreak = nowK - lastKillAt < MULTIKILL_WINDOW ? killStreak + 1 : 1;
    lastKillAt = nowK;
    let special = false;
    if (killStreak >= 2) {
      const label = MULTIKILL_NAMES[Math.min(killStreak, MULTIKILL_NAMES.length - 1)];
      const bonus = 50 * killStreak;
      score += bonus;
      milestonePopups.push({ x: e.c, y: e.r - 1, text: '💀 ' + label + ' +' + bonus, startTime: nowK });
      announce(label);
      special = true;
    }
    if (trick) {
      score += 75;
      milestonePopups.push({ x: e.c, y: e.r + 1, text: '🪓 TRICK SHOT +75', startTime: nowK });
      if (!special) announce('Trick shot!');
      special = true;
    }
    if (special) triggerKillCam(e.c, e.r);
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
    // Die Axt fliegt geradeaus und prallt einmal um 90 Grad von Wand, Saeule oder Flaeche ab
    let sdx = ddx, sdy = ddy, cx = px, cy = py, bounced = false;
    const path = [[px, py]];
    const shotBlocked = (x, y) => !inBounds(x, y) || grid[y][x] === TERRITORY || grid[y][x] === BLOCK;
    for (let step = 0; step < SHOT_RANGE; ) {
      const nx = cx + sdx, ny = cy + sdy;
      if (shotBlocked(nx, ny)) {
        if (bounced || step === 0) break;
        // Seite waehlen: bevorzugt die, auf der ein Waechter in Reichweite steht
        const sides = [[sdy, sdx], [-sdy, -sdx]].filter(([bx, by]) => !shotBlocked(cx + bx, cy + by));
        if (!sides.length) break;
        const rest = SHOT_RANGE - step;
        const seesGuard = ([bx, by]) => enemies.some(en => {
          for (let k = 1; k <= rest; k++) {
            const tx = cx + bx * k, ty = cy + by * k;
            if (shotBlocked(tx, ty)) return false;
            if (en.c === tx && en.r === ty) return true;
          }
          return false;
        });
        const pick = sides.find(seesGuard) || sides[Math.floor(Math.random() * sides.length)];
        path.push([cx, cy]);
        sdx = pick[0]; sdy = pick[1];
        bounced = true;
        sndGuardJam();
        continue;
      }
      cx = nx; cy = ny; step++;
      const hit = enemies.find(e => e.c === cx && e.r === cy);
      if (hit) { hitEnemy = hit; break; }
      // Eigene Linie freischiessen: der Schuss bleibt in ihr stecken
      if (grid[cy][cx] === TRAIL) { hitTrail = [cx, cy]; break; }
    }
    path.push([cx, cy]);

    shotProjectiles.push({
      pts: path.map(([x, y]) => [x * CELL + CELL / 2, y * CELL + CELL / 2]),
      startTime: now, life: 220 + (path.length > 2 ? 140 : 0)
    });
    addRipple(px, py, 2.6, 380, '255,138,110', 0.55);
    sndShoot();

    if (hitEnemy && hitEnemy.personality === 'shield' && sdx === -hitEnemy.dc0 && sdy === -hitEnemy.dr0) {
      // Schildwaechter: von vorne prallt die Axt ab, nur von hinten oder der Seite verwundbar
      spawnEmote('🛡️', hitEnemy.c, hitEnemy.r);
      milestonePopups.push({ x: hitEnemy.c, y: hitEnemy.r - 1, text: '🛡️ CLANG!', startTime: now });
      guardShout(hitEnemy, 'Ha! Nice try!');
      sndGuardJam();
      triggerShake(3, 140);
    } else if (hitEnemy) {
      killEnemyByShot(hitEnemy, 'shot', sdx, sdy, bounced);
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
    sparkParticles = [];
    dustParticles = [];
    emotePopups = [];
    milestonePopups = [];
    gamblerStreak = 0;
    enemyDeathAnims = [];
    shotProjectiles = []; killCam = null; killStreak = 0;
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
    if (bananaSlide > 0) return; // rutscht: keine Kontrolle
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
    const downPool = gameMode === 'chaos' ? POWERDOWN_TYPES.concat(CHAOS_POWERDOWN_TYPES) : POWERDOWN_TYPES;
    const type = isDown
      ? downPool[Math.floor(Math.random() * downPool.length)]
      : POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerUps.push({ r, c, type, kind, spawnTime: performance.now() });
  }

  function activatePowerUp(type) {
    const now = performance.now();
    const f = powerDurationFactor();
    if (type === 'speed') speedUntil = now + POWER_MS.speed * f;
    else if (type === 'shield') shieldUntil = now + POWER_MS.shield * f;
    else if (type === 'freeze') freezeUntil = now + POWER_MS.freeze * f;
    else if (type === 'trailguard') trailGuardUntil = now + POWER_MS.trailguard * f;
    else if (type === 'rapidfire') rapidfireUntil = now + POWER_MS.rapidfire * f;
    else if (type === 'spikes') spikesUntil = now + POWER_MS.spikes * f;
    else if (type === 'decoy') decoyCharges = Math.min(DECOY_MAX, decoyCharges + DECOY_CHARGES);
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
    if (decoyCharges > 0) { throwDecoy(); return; } // Decoy-Wuerfe haben Vorrang vor dem Gadget
    if (!gadgetReady()) return;
    const now = performance.now();
    // Auf eigenem Gebiet waere eine Mine nutzlos (Waechter betreten es nie): kein Wurf, kein Cooldown
    if (gadgetChoice === 'mine' && grid[py][px] === TERRITORY) return;
    gadgetCooldownUntil = now + GADGETS[gadgetChoice].cooldown;

    tutorialFlag('gadgetUsed');
    tutorialFlag(gadgetChoice === 'smoke' ? 'smokeUsed' : gadgetChoice === 'mine' ? 'mineUsed' : 'hookUsed');
    if (gadgetChoice === 'mine') {
      if (mines.length >= MINE_MAX) mines.shift();
      mines.push({ c: px, r: py, armedAt: now + MINE_ARM_MS });
      sndDecoyThrow();
      spawnEmote('💣', px, py);
      return;
    }
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

  // Stein in Blickrichtung werfen (bis DECOY_RANGE Zellen, stoppt vor Saeulen).
  // Waechter im Umkreis, die dich gerade nicht jagen, laufen zur Aufschlagstelle.
  function throwDecoy() {
    const now = performance.now();
    const [dx, dy] = dirDelta(dir);
    let c = px, r = py;
    for (let i = 0; i < DECOY_RANGE; i++) {
      const nc = c + dx, nr = r + dy;
      if (!inBounds(nc, nr) || grid[nr][nc] === BLOCK) break;
      c = nc; r = nr;
    }
    if (c === px && r === py) return; // direkt vor einer Wand: kein Wurf, keine Ladung verbraucht
    decoyCharges--;
    decoys.push({ c, r, start: now, until: now + DECOY_MS });
    addRipple(c, r, DECOY_LURE_RADIUS, 700, '232,220,192', 0.6);
    sndDecoyThrow();
    for (const e of enemies) {
      if (e.huntingActive || Math.hypot(e.c - c, e.r - r) > DECOY_LURE_RADIUS) continue;
      e.distractC = c; e.distractR = r; e.distractedUntil = now + DECOY_MS;
      spawnEmote('❓', e.c, e.r);
      guardSay(e, 'decoy');
    }
  }

  // Ente: jeder Schritt quakt und lockt Waechter im Umkreis zur aktuellen Position
  function duckQuack() {
    const now = performance.now();
    sndQuack();
    for (const e of enemies) {
      if (Math.hypot(e.c - px, e.r - py) > DUCK_QUACK_RADIUS) continue;
      e.distractC = px; e.distractR = py; e.distractedUntil = now + 1200;
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
    else if (type === 'slow') slowUntil = now + POWER_MS.slow;
    else if (type === 'swarm') { swarmUntil = now + 6000; spawnSwarmEnemy(); }
    else if (type === 'drunk') drunkUntil = now + 5500;
    else if (type === 'psylo') psyloUntil = now + 8000;
    else if (type === 'duck') duckUntil = now + DUCK_MS;
    else if (type === 'helium') heliumUntil = now + HELIUM_MS;
    else if (type === 'disco') discoUntil = now + DISCO_MS;
    else if (type === 'banana') {
      bananaSlide = BANANA_SLIDE;
      bananaPeels.push({ c: px, r: py });
      spawnEmote('😱', px, py);
    }
    updateStats();
    sndPowerDown(type);
  }

  function currentPlayerInterval() {
    const now = performance.now();
    if (bananaSlide > 0) return playerInterval * 0.45;
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
      if (hit) killEnemyByShot(hit, 'spikes');
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
      if (trail.length === 0) trailSpotted = false; // neue Linie beginnt ungesehen
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
    if (bananaSlide > 0) bananaSlide--;
    else {
      if (nextDir !== dir) {
        playerSquashTime = playerStepTime; playerSquashAmt = 0.16;
        spawnSparks(px * CELL + CELL / 2, py * CELL + CELL / 2, 'rgba(220,240,228,0.9)', 7, 75, 0);
      }
      dir = nextDir;
    }
    const [dx, dy] = dirDelta(dir);
    const nx = px + dx, ny = py + dy;
    // Rutschen endet an Saeulen und Gruben statt hineinzufallen
    if (bananaSlide > 0 && (!inBounds(nx, ny) || isObstacle(grid[ny][nx]))) bananaSlide = 0;
    const res = advancePlayerToCell(nx, ny);
    if (res === 'moved' && performance.now() < duckUntil) duckQuack();
    else if (res === 'moved' && performance.now() < heliumUntil) sndHeliumSqueak();
  }

  // Effekte einer Eroberung (1-Spieler und Versus). cells: [[r, c]], (x, y): Figur.
  const CAPTURE_FX_GREEN = { ripple: '127,224,160', fireworks: ['#63c96a', '#7fe0a0', '#ffd23f'] };
  const CAPTURE_FX_BLUE = { ripple: '140,196,255', fireworks: ['#4a8fe0', '#8cc4ff', '#ffd23f'] };
  function playCaptureEffects(cells, x, y, combo, fx) {
    const gained = cells.length;
    if (!gained) return;
    const now = performance.now();
    let sumR = 0, sumC = 0;
    // Flaeche waechst wellenfoermig von der Figur aus; Gesamtdauer begrenzt
    let maxD = 1;
    for (const [r, c] of cells) maxD = Math.max(maxD, Math.hypot(c - x, r - y));
    const stepMs = Math.min(35, 450 / maxD);
    const sparkEvery = Math.max(1, Math.ceil(gained / 40));
    cells.forEach(([r, c], i) => {
      const delay = Math.hypot(c - x, r - y) * stepMs;
      flashCells.push({ r, c, time: now, delay });
      if (i % sparkEvery === 0) spawnSparks(c * CELL + CELL / 2, r * CELL + CELL / 2, fx.fireworks[i % 3], 3, 130, delay);
      sumR += r; sumC += c;
    });
    playerSquashTime = now; playerSquashAmt = Math.min(0.3, 0.12 + gained * 0.004);
    // Welle aus dem Schwerpunkt der eroberten Flaeche - je groesser der Claim,
    // desto weiter laeuft sie.
    addRipple(sumC / gained, sumR / gained, Math.min(14, 2.5 + Math.sqrt(gained) * 1.4),
              520 + Math.min(380, gained * 6), fx.ripple, 0.8);
    sndCapture(gained, combo);
    if (gained > 12) {
      triggerShake(Math.min(7, 2 + gained * 0.08), 220);
      spawnEmote('💪', x, y);
    }
    if (gained > 2) spawnFireworkBurst(x * CELL + CELL / 2, y * CELL + CELL / 2, fx.fireworks);
    if (combo >= 2) comboPopups.push({ x, y, combo, mult: comboMultiplier(combo), startTime: now });
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

    const gainedCells = [];
    for (const comp of components) {
      const hasEnemy = comp.some(([r, c]) => enemies.some(e => e.r === r && e.c === c));
      if (!hasEnemy) {
        for (const [r, c] of comp) {
          grid[r][c] = TERRITORY;
          gainedCells.push([r, c]);
        }
      }
    }
    const gained = gainedCells.length;
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
        guardSay(e, 'stuck', true);
        enemies.splice(i, 1);
        guardReactToDeath(e);
        enemyDeathAnims.push({
          r: e.r, c: e.c, kind: 'sealed',
          color: PERSONALITY_COLORS[e.personality] || '#e3574a',
          startTime: performance.now()
        });
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
      if (!trailSpotted && !tutorialActive) {
        // Stealth: Linie ungesehen geschlossen
        const ghost = Math.round(gained * 5 * (STEALTH_MULT - 1));
        score += ghost;
        milestonePopups.push({ x: px, y: py - 1, text: '👻 Ghost +' + ghost, startTime: performance.now() });
      }
      playCaptureEffects(gainedCells, px, py, comboCount, CAPTURE_FX_GREEN);
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

  function spawnSparks(cx, cy, color, count, speed, delay) {
    const t0 = performance.now() + (delay || 0);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      sparkParticles.push({ x0: cx, y0: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        color, startTime: t0, life: 500 + Math.random() * 400, size: 0.14 + Math.random() * 0.12 });
    }
    if (sparkParticles.length > 400) sparkParticles.splice(0, sparkParticles.length - 400);
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

    const pops = [];
    if (isNewHigh) pops.push('🏆 NEW HIGH SCORE!');
    pops.push('✅ Territory secured');
    if (bonusPct > 0) pops.push('🎲 Risk bonus: +' + bonusPct + '%');
    const scoreFrom = scoreAtLevelStart, scoreTo = score;

    setTimeout(() => {
      celebrating = false;
      fireworkParticles = [];
      statLevelsCleared++;
      resetLevel(lv);
      running = false;
      openShop('Level ' + lv + ' - choose your edge', () => {
        showOverlay('Level ' + lv + '!', 'Onward - faster and with more guards.', 'Continue',
                    { scoreFrom, scoreTo, pops });
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
  // Effekte einer gekappten Linie (1-Spieler und Versus). cells: [[c, r]], die letzte ist die Schnittstelle.
  function playLineCutEffects(cells, emoji, doVibrate) {
    const now = performance.now();
    for (const [c, r] of cells) flashCells.push({ r, c, time: now });
    sndLineCut();
    triggerShake(5, 200);
    if (doVibrate) vibrate([40, 30, 40]);
    const [cx, cy] = cells[cells.length - 1];
    milestonePopups.push({ x: cx, y: cy, text: (emoji || '✂️') + ' Line cut!', startTime: now });
  }
  function cutTrailAt(cx, cy, emoji) {
    const idx = trail.findIndex(([tx, ty]) => tx === cx && ty === cy);
    if (idx < 0) return 0;
    const removed = trail.splice(0, idx + 1);
    for (const [tx, ty] of removed) {
      if (grid[ty][tx] === TRAIL) grid[ty][tx] = EMPTY;
    }
    comboCount = 0;
    tutorialFlag('lineCut');
    playLineCutEffects(removed, emoji, true);
  }

