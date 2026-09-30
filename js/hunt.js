// --- Jagd-Modus (gameMode 'hunt'): du steuerst einen Waechter, die CPU steuert die Spielfigur ---
// Die CPU erobert Land wie sonst der Spieler. Erwischst du sie (oder ihre Linie), ist das Level
// geschafft; holt sie 75 %, kostet es ein Leben. Die Figur ist nur im Kegel deines Waechters
// sichtbar, sonst verraten sie ihre Linie, kurze Radar-Pings und ein verblassender Geist.

  const HUNT_GHOST_MS = 2500;   // so lange bleibt der Geist an der letzten Sichtstelle
  const HUNT_PING_SHOW = 600;   // so lange ist die Figur bei einem Ping sichtbar

  let huntDir = 'right';        // gewuenschte Richtung deines Waechters
  let huntPlan = { phase: 'home', count: 0, len: 0 };
  let huntHomeSince = 0;        // seit wann die CPU zu Hause wartet
  let huntLastSeen = null;      // { x, y, t } letzte Sichtstelle
  let huntNextPing = 0, huntPingAt = -1e9;
  let huntLosing = false;       // endGame() soll ausnahmsweise wirklich ein Leben abziehen

  function huntActive() { return gameMode === 'hunt' && !tutorialActive && !versusRender; }

  // Ping-Abstand je Level: anfangs oft, ab Level 6 keine Pings mehr
  function huntPingInterval() { return level >= 6 ? 0 : 3000 + (level - 1) * 1000; }

  function huntSetupLevel() {
    const now = performance.now();
    if (!enemies.length) { const e = spawnEnemy('wanderer'); if (e) enemies.push(e); }
    const me = enemies[0];
    if (me) { me.controlled = true; me.personality = 'wanderer'; huntDir = me.dc0 > 0 ? 'right' : 'left'; }
    playerInterval = Math.max(150, 230 - (level - 1) * 10);
    enemyInterval = Math.round(playerInterval * 1.08); // Waechter etwas langsamer als die Figur
    shieldUntil = 0;
    boostsRemaining = 0; boostsMax = 0;
    huntPlan = { phase: 'home', count: 0, len: 0 };
    huntHomeSince = now;
    huntLastSeen = null;
    huntPingAt = -1e9;
    huntNextPing = now + (huntPingInterval() || 1e12);
    huntLosing = false;
  }

  function huntControlled() { return enemies.find(e => e.controlled) || null; }

  // Eigener Waechter tot: sofort in den naechsten lebenden springen
  function huntEnsureControl() {
    if (huntControlled() || !running || dying) return;
    const alive = enemies.filter(e => !e.temporary);
    if (!alive.length) { huntLose('All your guards are down.', '💀'); return; }
    const me = alive[0];
    me.controlled = true;
    huntDir = me.dr0 < 0 ? 'up' : me.dr0 > 0 ? 'down' : me.dc0 < 0 ? 'left' : 'right';
    milestonePopups.push({ x: me.c, y: me.r - 1, text: '🔁 Switched guard', startTime: performance.now() });
  }

  function huntSetDir(d) { huntDir = d; }

  // Schritt deines Waechters: gewuenschte Richtung, sonst stehen bleiben
  function huntGuardStep(e, opts) {
    const [dx, dy] = dirDelta(huntDir);
    return opts.find(([ox, oy]) => ox === dx && oy === dy) || null;
  }

  // CPU erwischt (von dir oder einem anderen Waechter): Level geschafft
  function huntCaught(reason) {
    if (celebrating) return;
    const pct = Math.round((countTerritory() / totalCells()) * 100);
    const bonus = Math.max(0, 75 - pct) * 10;
    score += bonus;
    enemyDeathAnims.push({ r: py, c: px, kind: 'shot', dx: 0, dy: 0, color: '#7fe0a0', startTime: performance.now() });
    spawnSparks(px * CELL + CELL / 2, py * CELL + CELL / 2, '#7fe0a0', 26, 280, 0);
    milestonePopups.push({ x: px, y: py - 1, text: '🎯 Caught! +' + bonus, startTime: performance.now() });
    announce('Caught!');
    triggerShake(7, 280);
    vibrate([40, 30, 60]);
    triggerLevelCompleteFireworks();
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
    const awareness = 3 + Math.min(level, 6);   // wie weit die CPU Waechter wittert
    let danger = huntGuardDistAt(px, py);
    if (danger > awareness) danger = 99;
    const onLand = grid[py][px] === TERRITORY;
    let d = dir;

    if (onLand && !trail.length) {
      const out = free.filter(k => { const [dx, dy] = dirDelta(k); return grid[py + dy][px + dx] !== TERRITORY; });
      const waited = now - huntHomeSince > 4000; // nicht ewig warten, wenn du vor der Tuer stehst
      if (out.length && (danger > 4 || waited) && Math.random() < 0.5) {
        // Ausgang moeglichst weit weg vom naechsten Waechter
        out.sort((a, b) => {
          const [ax, ay] = dirDelta(a), [bx, by] = dirDelta(b);
          return huntGuardDistAt(px + bx, py + by) - huntGuardDistAt(px + ax, py + ay);
        });
        d = out[0];
        huntPlan = { phase: 'out', count: 0, len: 2 + Math.floor(Math.random() * (3 + Math.min(level, 5))) };
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
      const maxTrail = 8 + Math.min(level, 8);
      if (huntPlan.phase === 'back' || danger <= 3 || trail.length >= maxTrail) {
        huntPlan.phase = 'back';
        d = huntWayHome() || pick(free);
      } else {
        huntPlan.count++;
        if (huntPlan.count >= huntPlan.len) {
          if (huntPlan.phase === 'out') {
            const turns = free.filter(k => k !== dir);
            if (turns.length) d = pick(turns);
            huntPlan = { phase: 'turn', count: 0, len: 2 + Math.floor(Math.random() * 3) };
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
    if (score !== s0) { score = s0; updateStats(); }
  }

  // --- Sicht ---
  function huntRunnerVisible(now) {
    if (!running || gameOver || dying || celebrating || countdownActive) return true;
    if (now - huntPingAt < HUNT_PING_SHOW) return true;
    const me = huntControlled();
    return !!me && canSeePlayer(me);
  }

  function huntUpdate(now) {
    huntEnsureControl();
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
      const eT = Math.min(1, (now - enemyStepTime) / enemyInterval);
      const pc = me.prevC !== undefined ? me.prevC : me.c, pr = me.prevR !== undefined ? me.prevR : me.r;
      const cx = (pc + (me.c - pc) * eT) * CELL + CELL / 2, cy = (pr + (me.r - pr) * eT) * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * (0.62 + 0.05 * Math.sin(now / 180)), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    if (!runnerVisible && huntLastSeen && now - huntLastSeen.t < HUNT_GHOST_MS) {
      const a = 1 - (now - huntLastSeen.t) / HUNT_GHOST_MS;
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
