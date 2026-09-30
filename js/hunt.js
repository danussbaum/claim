// --- Jagd-Modus (Rolle 'guard', kombinierbar mit Normal/Chaos/Zen): du steuerst einen Waechter,
// die CPU steuert die Spielfigur ---
// Die CPU erobert Land wie sonst der Spieler. Erwischst du sie (oder ihre Linie), ist das Level
// geschafft; holt sie 75 %, kostet es ein Leben. Die Figur ist nur im Kegel deines Waechters
// sichtbar, sonst verraten sie ihre Linie, kurze Radar-Pings und ein verblassender Geist.

  const HUNT_GHOST_MS = 2500;   // so lange bleibt der Geist an der letzten Sichtstelle (+ Perk)
  const HUNT_PING_SHOW = 600;   // so lange ist die Figur bei einem Ping sichtbar

  let huntDir = 'right';        // gewuenschte Richtung deines Waechters
  let huntPlan = { phase: 'home', count: 0, len: 0 };
  let huntHomeSince = 0;        // seit wann die CPU zu Hause wartet
  let huntLastSeen = null;      // { x, y, t } letzte Sichtstelle
  let huntNextPing = 0, huntPingAt = -1e9;
  const HUNT_CPU_LIVES = 3;     // so oft musst du die CPU pro Level erwischen
  let huntCpuLives = HUNT_CPU_LIVES;
  let huntLosing = false;
  let huntCpuShooting = false;  // shoot() ist sonst im Jagd-Modus gesperrt       // endGame() soll ausnahmsweise wirklich ein Leben abziehen

  const HUNT_ROLES = {
    runner: { label: 'Runner', desc: '' },
    guard:  { label: 'Guard',  desc: 'You are a guard: catch the runner before it claims 75%.' }
  };
  let huntRole = 'runner';
  try { const r = localStorage.getItem('claim_role'); if (r && HUNT_ROLES[r]) huntRole = r; } catch (e) { /* ignore */ }
  function setHuntRole(r) {
    if (!HUNT_ROLES[r]) return;
    huntRole = r;
    try { localStorage.setItem('claim_role', r); } catch (e) { /* ignore */ }
    loadHighScoreForMode();
  }

  function huntActive() {
    return huntRole === 'guard' && !tutorialActive && !versusRender && !(typeof vsActive !== 'undefined' && vsActive);
  }

  // Eigenes Tempo deines Waechters
  let huntGuardIv = 250, huntGuardTimer = 0;
  function huntGuardInterval(now) { return now < huntSprintUntil ? huntGuardIv * 0.55 : huntGuardIv; }

  // Animationsfortschritt eines Waechters; dein Waechter laeuft im eigenen Takt
  function guardStepT(e, now) {
    if (e.ownStepTime !== undefined) return Math.min(1, (now - e.ownStepTime) / e.ownInterval);
    return Math.min(1, (now - enemyStepTime) / enemyInterval);
  }

  // Ping-Abstand je Level: anfangs oft, ab Level 6 keine Pings mehr
  // Radar-Perk: Pings kommen je Stufe 1 s frueher und auch ab Level 6 (dann alle 6 s, 5 s, 4 s)
  function huntPingInterval() {
    if (level >= 6 && !huntPerks.radar) return 0;
    const base = level >= 6 ? 7000 : 3000 + (level - 1) * 1000;
    return Math.max(1500, base - huntPerks.radar * 1000);
  }
  function huntGhostMs() { return HUNT_GHOST_MS + huntPerks.ghost * 1500; }

  // --- Perks der Waechter-Rolle (ersetzen im Shop die Laeufer-Perks) ---
  let huntPerks = { legs: 0, eye: 0, radar: 0, ghost: 0, backup: 0 };
  function huntResetPerks() { huntPerks = { legs: 0, eye: 0, radar: 0, ghost: 0, backup: 0 }; }
  const HUNT_PERK_CARDS = [
    PERK_CARDS.find(c => c.id === 'life'),
    { id: 'h_legs',   icon: '👟', name: 'Quick boots',  desc: 'Your guard moves 8% faster.',               max: 3, apply: () => huntPerks.legs++ },
    { id: 'h_eye',    icon: '🔭', name: 'Eagle eye',    desc: 'Your guard sees one cell further.',         max: 3, apply: () => huntPerks.eye++ },
    { id: 'h_radar',  icon: '📡', name: 'Radar',        desc: 'Radar pings come 1s sooner, also later on.', max: 3, apply: () => huntPerks.radar++ },
    { id: 'h_ghost',  icon: '👻', name: 'Long memory',  desc: 'The ghost of the runner stays 1.5s longer.', max: 2, apply: () => huntPerks.ghost++ },
    { id: 'h_backup', icon: '👮', name: 'Backup',       desc: 'One more guard every level.',               max: 2, apply: () => huntPerks.backup++ }
  ];
  function huntPerkCount(id) { return huntPerks[id.slice(2)] || 0; }

  function huntSetupLevel() {
    const now = performance.now();
    if (!enemies.length) { const e = spawnEnemy('wanderer'); if (e) enemies.push(e); }
    for (let i = 0; i < huntPerks.backup; i++) { const e = spawnEnemy(randomPersonality()); if (e) enemies.push(e); }
    const me = enemies[0];
    if (me) { me.controlled = true; me.personality = 'wanderer'; huntDir = me.dc0 > 0 ? 'right' : 'left'; }
    playerInterval = Math.max(150, 230 - (level - 1) * 10);
    // Anfangs ist dein Waechter etwas schneller als die Figur, spaeter etwas langsamer
    huntGuardIv = Math.round(playerInterval * Math.min(1.08, 0.9 + (level - 1) * 0.04));
    enemyInterval = huntGuardIv;
    huntGuardIv = Math.round(huntGuardIv * Math.pow(0.92, huntPerks.legs)); // nur dein Waechter
    huntGuardTimer = 0;
    if (me) { me.ownStepTime = now; me.ownInterval = huntGuardIv; }
    shieldUntil = 0;
    huntResetAbilities();
    huntPlan = { phase: 'home', count: 0, len: 0 };
    huntHomeSince = now;
    huntLastSeen = null;
    huntPingAt = -1e9;
    huntNextPing = now + (huntPingInterval() || 1e12);
    huntLosing = false;
    huntCpuLives = HUNT_CPU_LIVES;
    if (me) milestonePopups.push({ x: me.c, y: me.r - 1, text: '🎯 Catch the runner!', startTime: now });
  }

  function huntControlled() { return enemies.find(e => e.controlled) || null; }

  // Eigener Waechter tot: sofort in den naechsten lebenden springen
  function huntEnsureControl() {
    if (huntControlled() || !running || dying) return;
    const alive = enemies.filter(e => !e.temporary);
    if (!alive.length) { huntLose('All your guards are down.', '💀'); return; }
    const me = alive[0];
    me.controlled = true;
    me.ownStepTime = performance.now(); me.ownInterval = huntGuardIv;
    huntDir = me.dr0 < 0 ? 'up' : me.dr0 > 0 ? 'down' : me.dc0 < 0 ? 'left' : 'right';
    milestonePopups.push({ x: me.c, y: me.r - 1, text: '🔁 Switched guard', startTime: performance.now() });
  }

  function huntSetDir(d) {
    if (d === huntDir) huntSprint();
    huntDir = d;
  }

  // Schritt deines Waechters: gewuenschte Richtung, sonst stehen bleiben
  function huntGuardStep(e, opts) {
    const [dx, dy] = dirDelta(huntDir);
    return opts.find(([ox, oy]) => ox === dx && oy === dy) || null;
  }

  // CPU erwischt (von dir oder einem anderen Waechter): Level geschafft
  function huntCaught(reason) {
    if (celebrating) return;
    const now = performance.now();
    huntCpuLives--;
    const pct = Math.round((countTerritory() / totalCells()) * 100);
    const bonus = huntCpuLives > 0 ? 100 : Math.max(0, 75 - pct) * 10;
    score += bonus;
    updateStats();
    enemyDeathAnims.push({ r: py, c: px, kind: 'shot', dx: 0, dy: 0, color: '#7fe0a0', startTime: now });
    spawnSparks(px * CELL + CELL / 2, py * CELL + CELL / 2, '#7fe0a0', 26, 280, 0);
    const left = huntCpuLives > 0 ? '  ' + '❤'.repeat(huntCpuLives) + ' left' : '';
    milestonePopups.push({ x: px, y: py - 1, text: '🎯 Caught! +' + bonus + left, startTime: now });
    announce(huntCpuLives > 0 ? 'Caught!' : 'Runner down!');
    triggerShake(7, 280);
    vibrate([40, 30, 60]);
    if (huntCpuLives <= 0) { triggerLevelCompleteFireworks(); return; }
    huntRespawnRunner(now);
  }

  // CPU verliert ein Leben: Linie weg, neu auf eigener Flaeche moeglichst weit weg von den Waechtern
  function huntRespawnRunner(now) {
    for (const [tx, ty] of trail) if (grid[ty][tx] === TRAIL) grid[ty][tx] = EMPTY;
    trail = [];
    let best = null, bestDist = -1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] !== TERRITORY) continue;
        const d = huntGuardDistAt(c, r) + Math.random();
        if (d > bestDist) { bestDist = d; best = [c, r]; }
      }
    }
    if (best) { px = best[0]; py = best[1]; }
    prevPx = px; prevPy = py;
    playerStepTime = now;
    huntPlan = { phase: 'home', count: 0, len: 0 };
    huntHomeSince = now;
    huntLastSeen = null;
    huntPingAt = now; // kurz zeigen, wo sie wieder auftaucht
    addRipple(px, py, 3, 600, '140,196,255', 0.7);
  }

  function huntLose(reason, emoji) {
    huntLosing = true;
    endGame(reason, emoji);
    huntLosing = false;
  }

  // --- CPU-Figur ---
  function huntFreeDirs() {
    return ['up', 'down', 'left', 'right'].filter(d => {
      if (trail.length && d === INVERTED_DIR[dir]) return false;
      const [dx, dy] = dirDelta(d), x = px + dx, y = py + dy;
      return inBounds(x, y) && !isObstacle(grid[y][x]) && grid[y][x] !== TRAIL;
    });
  }

  function huntGuardDistAt(x, y) {
    let best = 99;
    for (const e of enemies) best = Math.min(best, Math.abs(e.c - x) + Math.abs(e.r - y));
    return best;
  }

  // Erster Schritt auf dem kuerzesten Weg zur eigenen Flaeche, ohne die Linie zu kreuzen
  function huntWayHome() {
    const prev = new Int16Array(COLS * ROWS).fill(-1);
    const start = py * COLS + px;
    prev[start] = start;
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % COLS, y = (i - x) / COLS;
      if (i !== start && grid[y][x] === TERRITORY) {
        let cur = i;
        while (prev[cur] !== start) cur = prev[cur];
        const cx = cur % COLS, cy = (cur - cx) / COLS;
        return cx > px ? 'right' : cx < px ? 'left' : cy > py ? 'down' : 'up';
      }
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const ni = ny * COLS + nx;
        if (prev[ni] !== -1 || grid[ny][nx] === TRAIL || isObstacle(grid[ny][nx])) continue;
        prev[ni] = i;
        queue.push(ni);
      }
    }
    return null;
  }

  function huntCpuThink() {
    const now = performance.now();
    let free = huntFreeDirs();
    if (!free.length) return;
    // Nicht direkt neben einen Waechter treten, wenn es anders geht
    const cautious = free.filter(d => { const [dx, dy] = dirDelta(d); return huntGuardDistAt(px + dx, py + dy) > 1; });
    if (cautious.length) free = cautious;
    const pick = list => list[Math.floor(Math.random() * list.length)];
    const awareness = 2 + Math.min(level, 6);   // wie weit die CPU Waechter wittert
    // Kurz vor dem Ziel oder nach langem Warten wird sie mutig: flieht erst, wenn ein Waechter direkt daneben ist
    const pctNow = Math.round((countTerritory() / totalCells()) * 100);
    const endgame = pctNow >= 55;
    const fleeDist = huntPlan.bold ? 1 : (level < 3 ? 2 : 3); // ab diesem Abstand bricht sie ab und flieht
    let danger = huntGuardDistAt(px, py);
    if (danger > awareness) danger = 99;
    const onLand = grid[py][px] === TERRITORY;
    let d = dir;

    if (onLand && !trail.length) {
      const out = free.filter(k => { const [dx, dy] = dirDelta(k); return grid[py + dy][px + dx] !== TERRITORY; });
      const waited = now - huntHomeSince > (endgame ? 1000 : 2000); // nicht ewig warten, wenn du vor der Tuer stehst
      if (out.length && (waited || (danger > fleeDist + 1 && Math.random() < 0.7))) {
        // Ausgang moeglichst weit weg vom naechsten Waechter
        out.sort((a, b) => {
          const [ax, ay] = dirDelta(a), [bx, by] = dirDelta(b);
          return huntGuardDistAt(px + bx, py + by) - huntGuardDistAt(px + ax, py + ay);
        });
        d = out[0];
        const bold = waited || endgame;
        // Mutige Ausfluege sind kurz: schnell ein kleines Stueck schliessen
        const len = bold ? 2 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * (4 + Math.min(level, 5)));
        huntPlan = { phase: 'out', count: 0, len, bold };
      } else {
        const stay = free.filter(k => !out.includes(k));
        const pool = stay.length ? stay : free;
        // Auf der Flaeche vom Waechter weg wandern
        if (danger < 99) {
          pool.sort((a, b) => {
            const [ax, ay] = dirDelta(a), [bx, by] = dirDelta(b);
            return huntGuardDistAt(px + bx, py + by) - huntGuardDistAt(px + ax, py + ay);
          });
          d = pool[0];
        } else if (!pool.includes(d) || Math.random() < 0.2) d = pick(pool);
      }
    } else {
      huntHomeSince = now;
      const maxTrail = 12 + Math.min(level, 8);
      if (huntPlan.phase === 'back' || danger <= fleeDist || trail.length >= maxTrail) {
        huntPlan.phase = 'back';
        d = huntWayHome() || pick(free);
      } else {
        huntPlan.count++;
        if (huntPlan.count >= huntPlan.len) {
          if (huntPlan.phase === 'out') {
            const turns = free.filter(k => k !== dir);
            if (turns.length) d = pick(turns);
            huntPlan = { phase: 'turn', count: 0, len: (huntPlan.bold ? 1 : 3) + Math.floor(Math.random() * 4), bold: huntPlan.bold };
          } else {
            huntPlan.phase = 'back';
            d = huntWayHome() || pick(free);
          }
        }
      }
      if (!free.includes(d)) d = huntWayHome() || pick(free);
      if (!free.includes(d)) d = pick(free);
    }
    if (onLand && trail.length === 0 && huntPlan.phase === 'back') huntPlan.phase = 'home';
    nextDir = d;
  }

  // Punkte der CPU zaehlen nicht fuer dich
  function huntStepPlayer() {
    const s0 = score;
    huntCpuThink();
    stepPlayer();
    if (running && !dying && !celebrating) huntCpuMaybeShoot();
    if (score !== s0) { score = s0; updateStats(); }
  }

  // --- Sicht ---
  function huntRunnerVisible(now) {
    if (!running || gameOver || dying || celebrating || countdownActive) return true;
    if (now - huntPingAt < HUNT_PING_SHOW) return true;
    const me = huntControlled();
    return !!me && canSeePlayer(me);
  }

  function huntUpdate(now, delta) {
    huntEnsureControl();
    const me = huntControlled();
    if (me && now >= freezeUntil) {
      huntGuardTimer += delta;
      const iv = huntGuardInterval(now);
      if (huntGuardTimer > iv) {
        huntGuardTimer = Math.min(huntGuardTimer - iv, iv);
        me.ownStepTime = now; me.ownInterval = iv;
        moveEnemies(me);
      }
    }
    const iv = huntPingInterval();
    if (iv && now >= huntNextPing) {
      huntPingAt = now;
      huntNextPing = now + iv;
      addRipple(px, py, 3, 600, '140,196,255', 0.7);
    }
    if (huntRunnerVisible(now)) huntLastSeen = { x: px, y: py, t: now };
  }

  // Markierung unter deinem Waechter und Geist an der letzten Sichtstelle
  function huntDrawWorld(now, runnerVisible) {
    const me = huntControlled();
    if (me) {
      const eT = guardStepT(me, now);
      const pc = me.prevC !== undefined ? me.prevC : me.c, pr = me.prevR !== undefined ? me.prevR : me.r;
      const cx = (pc + (me.c - pc) * eT) * CELL + CELL / 2, cy = (pr + (me.r - pr) * eT) * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * (0.62 + 0.05 * Math.sin(now / 180)), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    if (!runnerVisible && huntLastSeen && now - huntLastSeen.t < huntGhostMs()) {
      const a = 1 - (now - huntLastSeen.t) / huntGhostMs();
      ctx.beginPath();
      ctx.arc(huntLastSeen.x * CELL + CELL / 2, huntLastSeen.y * CELL + CELL / 2, CELL * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220,240,228,' + (0.35 * a).toFixed(3) + ')';
      ctx.fill();
      ctx.font = Math.round(CELL * 0.6) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = a * 0.8;
      ctx.fillText('👻', huntLastSeen.x * CELL + CELL / 2, huntLastSeen.y * CELL + CELL / 2);
      ctx.globalAlpha = 1;
    }
  }


  // CPU schiesst, wenn ein Waechter geradeaus in Reichweite steht (Treffsicherheit steigt mit dem Level)
  function huntCpuMaybeShoot() {
    const now = performance.now();
    if (now < shotCooldownUntil && now >= rapidfireUntil) return;
    const [dx, dy] = dirDelta(dir);
    let target = null;
    for (let k = 1; k <= SHOT_RANGE; k++) {
      const x = px + dx * k, y = py + dy * k;
      if (!inBounds(x, y) || grid[y][x] === TERRITORY || grid[y][x] === BLOCK) break;
      target = enemies.find(e => e.c === x && e.r === y);
      if (target) break;
    }
    if (!target || Math.random() > Math.min(0.9, 0.35 + level * 0.08)) return;
    huntCpuShooting = true;
    shoot();
    huntCpuShooting = false;
  }

  // --- Faehigkeiten deines Waechters (auf den Knoepfen von Boost, Schuss und Gadget) ---
  const HUNT_SPRINT_MS = 1200, HUNT_SPRINTS = 3;
  const HUNT_RADAR_CD = 10000, HUNT_ALARM_CD = 18000, HUNT_ALARM_MS = 3000;
  let huntSprintUntil = 0, huntRadarReadyAt = 0, huntAlarmReadyAt = 0;

  function huntAbilityOk() { return running && !paused && !gameOver && !dying && !celebrating && !countdownActive; }

  // ⚡ Sprint: kurz schneller (auch durch nochmaliges Druecken der Laufrichtung)
  function huntSprint() {
    if (!huntAbilityOk() || boostsRemaining <= 0) return;
    huntSprintUntil = performance.now() + HUNT_SPRINT_MS;
    boostsRemaining--;
    updateStats();
    sndBoost();
  }

  // 📡 Radar: deckt die Figur sofort kurz auf
  function huntRadar() {
    const now = performance.now();
    if (!huntAbilityOk() || now < huntRadarReadyAt) return;
    huntRadarReadyAt = now + HUNT_RADAR_CD;
    huntPingAt = now;
    addRipple(px, py, 3, 600, '140,196,255', 0.7);
    sndPowerUp('speed');
  }

  // 🚨 Alarm: alle Waechter jagen kurz die Figur
  function huntAlarm() {
    const now = performance.now();
    if (!huntAbilityOk() || now < huntAlarmReadyAt) return;
    huntAlarmReadyAt = now + HUNT_ALARM_CD;
    alarmUntil = now + HUNT_ALARM_MS;
    triggerShake(3, 200);
    sndHunterAlert();
  }

  function huntResetAbilities() {
    huntSprintUntil = 0; huntRadarReadyAt = 0; huntAlarmReadyAt = 0;
    boostsRemaining = HUNT_SPRINTS; boostsMax = HUNT_SPRINTS;
  }

  // Knopf-Symbole: Radar statt Fadenkreuz, Alarm statt Gadget
  let huntButtonsShown = null;
  function huntSyncButtons() {
    const hunt = huntActive();
    if (hunt === huntButtonsShown) return;
    huntButtonsShown = hunt;
    const shootBtn = document.getElementById('btnShoot');
    if (!shootBtn) return;
    const cross = shootBtn.querySelector('.crosshairIcon');
    if (cross) cross.style.display = hunt ? 'none' : '';
    let icon = document.getElementById('huntRadarIcon');
    if (!icon) {
      icon = document.createElement('span');
      icon.id = 'huntRadarIcon';
      icon.textContent = '📡';
      shootBtn.insertBefore(icon, shootBtn.firstChild);
    }
    icon.style.display = hunt ? '' : 'none';
  }

  function huntUpdateButtonsUI() {
    const now = performance.now();
    const gadget = document.getElementById('btnGadget'), gSweep = document.getElementById('gadgetSweep');
    if (gadget && gSweep) {
      if (gadget.firstChild && gadget.firstChild.nodeType === 3 && gadget.firstChild.nodeValue !== '🚨') gadget.firstChild.nodeValue = '🚨';
      const f = Math.max(0, Math.min(1, (huntAlarmReadyAt - now) / HUNT_ALARM_CD));
      gSweep.style.setProperty('--cd', (f * 100) + '%');
      gadget.classList.toggle('oncooldown', f > 0);
      flashWhenReady(gadget, 'gadget', f === 0 && running && !gameOver);
    }
    const shootEl = document.getElementById('btnShoot'), sSweep = document.getElementById('shootSweep');
    if (shootEl && sSweep) {
      const f = Math.max(0, Math.min(1, (huntRadarReadyAt - now) / HUNT_RADAR_CD));
      sSweep.style.setProperty('--cd', (f * 100) + '%');
      shootEl.classList.toggle('oncooldown', f > 0);
      flashWhenReady(shootEl, 'shoot', f === 0 && running && !gameOver);
    }
  }
