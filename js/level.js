  // --- Level-Layout: Saeulen, Gruben, Bonuszone (ab Level 2) ---

  function obstaclePlan(lv) {
    if (lv < 2) return { pillars: 0, pits: 0, bonus: false };
    return {
      pillars: Math.min(14, 3 + (lv - 2) * 2),
      pits: lv >= 5 ? Math.min(8, 2 + Math.floor((lv - 5) / 2) * 2) : 0,
      bonus: lv >= 3
    };
  }

  // Alle freien Zellen muessen vom Start aus erreichbar bleiben, sonst sind 100% unmoeglich.
  function layoutIsReachable() {
    const seen = Array.from({length: ROWS}, () => Array(COLS).fill(false));
    const stack = [[0, Math.floor(COLS / 2)]];
    seen[0][Math.floor(COLS / 2)] = true;
    let reached = 0, free = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!isObstacle(grid[r][c])) free++;
    while (stack.length) {
      const [r, c] = stack.pop();
      reached++;
      for (const [nr, nc] of [[r+1,c],[r-1,c],[r,c+1],[r,c-1]]) {
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        if (seen[nr][nc] || isObstacle(grid[nr][nc])) continue;
        seen[nr][nc] = true;
        stack.push([nr, nc]);
      }
    }
    return reached === free;
  }

  function placeObstacles(lv) {
    bonusCells = [];
    bonusClaimed = false;
    movingBlocks = [];
    const plan = obstaclePlan(lv);
    if (!plan.pillars && !plan.pits && !plan.bonus) return;

    for (let attempt = 0; attempt < 40; attempt++) {
      initGrid();
      const taken = [];
      // Spiegelsymmetrisch setzen, das liest sich als Level-Design statt als Rauschen.
      const put = (r, c, val) => {
        if (r < 2 || r > ROWS - 3 || c < 1 || c > COLS - 2) return;
        if (grid[r][c] !== EMPTY) return;
        if (Math.abs(r - 1) + Math.abs(c - Math.floor(COLS / 2)) < 3) return; // Startbereich frei
        grid[r][c] = val;
        taken.push([r, c]);
      };
      let placed = 0;
      let guard = 0;
      while (placed < plan.pillars && guard++ < 200) {
        const r = 2 + Math.floor(Math.random() * (ROWS - 5));
        const c = 1 + Math.floor(Math.random() * (COLS - 2));
        const before = taken.length;
        put(r, c, BLOCK);
        put(r, COLS - 1 - c, BLOCK);
        placed += taken.length - before;
      }
      let pitsPlaced = 0;
      guard = 0;
      while (pitsPlaced < plan.pits && guard++ < 200) {
        const r = 3 + Math.floor(Math.random() * (ROWS - 7));
        const c = 1 + Math.floor(Math.random() * (COLS - 2));
        const before = taken.length;
        put(r, c, PIT);
        put(ROWS - 1 - r, c, PIT);
        pitsPlaced += taken.length - before;
      }

      if (plan.bonus) {
        let ok = false;
        for (let t = 0; t < 60 && !ok; t++) {
          const size = lv >= 6 ? 3 : 2;
          const r0 = Math.floor(ROWS * 0.45) + Math.floor(Math.random() * (Math.floor(ROWS * 0.45) - size));
          const c0 = 1 + Math.floor(Math.random() * (COLS - 2 - size));
          let clear = true;
          for (let r = r0; r < r0 + size; r++)
            for (let c = c0; c < c0 + size; c++)
              if (r >= ROWS - 1 || c >= COLS - 1 || grid[r][c] !== EMPTY) clear = false;
          if (!clear) continue;
          for (let r = r0; r < r0 + size; r++)
            for (let c = c0; c < c0 + size; c++) bonusCells.push({ r, c });
          ok = true;
        }
      }

      if (layoutIsReachable()) {
        // Ab Level 4 wandert ein Teil der Saeulen.
        const movers = lv >= 4 ? Math.min(4, 1 + Math.floor((lv - 4) / 3)) : 0;
        const blockCells = taken.filter(([r, c]) => grid[r][c] === BLOCK);
        for (let i = 0; i < movers && blockCells.length; i++) {
          const idx = Math.floor(Math.random() * blockCells.length);
          const [r, c] = blockCells.splice(idx, 1)[0];
          const horizontal = Math.random() < 0.5;
          movingBlocks.push({
            r, c, prevR: r, prevC: c,
            dr: horizontal ? 0 : (Math.random() < 0.5 ? 1 : -1),
            dc: horizontal ? (Math.random() < 0.5 ? 1 : -1) : 0,
            timer: Math.random() * MOVING_BLOCK_INTERVAL
          });
        }
        return;
      }
      bonusCells = [];
      movingBlocks = [];
    }
    // Kein gueltiges Layout gefunden: lieber ein leeres Feld als ein unloesbares.
    initGrid();
    bonusCells = [];
    movingBlocks = [];
  }

  function countTerritory() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === TERRITORY) n++;
    return n;
  }

  function updateStats() {
    capturedPct = Math.round((countTerritory() / totalCells()) * 100);
    const pctEl = document.getElementById('pct');
    if (levelReadyToComplete) {
      const bonusPct = Math.min(100, Math.max(0, Math.floor((capturedPct - 75) / 5)) * 5);
      pctEl.textContent = capturedPct + '%' + (bonusPct > 0 ? ' (+' + bonusPct + '%)' : '');
    } else {
      pctEl.textContent = capturedPct + '%';
    }
    document.getElementById('score').textContent = score;
    document.getElementById('level').textContent = level;
    document.getElementById('lives').textContent = lives;
    if (score !== prevStatsScore) {
      const scoreEl = document.getElementById('score');
      scoreEl.classList.remove('scorePopAnim');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('scorePopAnim');
      prevStatsScore = score;
    }
    const boostEl = document.getElementById('boosts');
    if (boostEl) boostEl.textContent = boostsRemaining;
    const infoCellEl = document.getElementById('infoCell');
    if (infoCellEl) infoCellEl.classList.toggle('empty', boostsRemaining <= 0);
    const boostFillEl = document.getElementById('boostFill');
    if (boostFillEl) {
      // Der Vorrat leert sich pro Einsatz um einen Anteil - Gegenstueck zu den ladenden Knoepfen.
      const frac = boostsMax > 0 ? Math.max(0, Math.min(1, boostsRemaining / boostsMax)) : 0;
      boostFillEl.style.setProperty('--fill', (frac * 100) + '%');
    }
    const pauseBtnEl = document.getElementById('pauseBtn');
    const pauseGlyphEl = document.getElementById('pauseGlyph');
    const cashReady = levelReadyToComplete && running && !gameOver;
    if (pauseGlyphEl) pauseGlyphEl.textContent = cashReady ? '💰' : '⏸';
    if (pauseBtnEl) pauseBtnEl.classList.toggle('cashReady', cashReady);
    const comboEl = document.getElementById('comboBadge');
    if (comboEl) {
      if (comboCount >= 2) {
        const mult = comboMultiplier();
        comboEl.style.display = 'block';
        comboEl.className = 'comboBadgePill';
        comboEl.textContent = '🔥 COMBO ×' + mult.toFixed(1);
        // Animation neu triggern
        comboEl.style.animation = 'none';
        void comboEl.offsetWidth;
        comboEl.style.animation = '';
      } else {
        comboEl.style.display = 'none';
        comboEl.className = '';
      }
    }
  }

  function comboMultiplier() {
    return 1 + Math.min(comboCount - 1, 9) * 0.1;
  }

  const BASE_PERSONALITIES = ['wanderer', 'hunter', 'guardian', 'nervous'];
  function personalityPool() {
    return level >= 3 ? BASE_PERSONALITIES.concat(['cutter']) : BASE_PERSONALITIES;
  }
  function randomPersonality() {
    const pool = personalityPool();
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const PERSONALITY_COLORS = {
    wanderer: '#e3574a', hunter: '#ff4d3d', guardian: '#9b4fd6', nervous: '#e8935c',
    cutter: '#2fb8c9'
  };
  // --- Sichtkegel ---
  const VISION = {
    wanderer: { range: 6, half: 0.70 },
    hunter:   { range: 9, half: 0.62 },
    guardian: { range: 5, half: 0.85 },
    nervous:  { range: 5, half: 1.00 },
    cutter:   { range: 6, half: 0.70 }
  };
  const VISION_MEMORY = 1200; // ms, so lange wird nach Sichtverlust noch verfolgt

  // --- Weiche Drehungen ---
  let lastDrawTime = 0;
  let playerHeadingDisp = 0;
  let playerLeanDisp = 0;

  // Hellt eine Hex-Farbe auf (amount > 0) oder dunkelt sie ab (amount < 0).
  function shadeColor(hex, amount) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amount >= 0) {
      r = Math.round(r + (255 - r) * amount);
      g = Math.round(g + (255 - g) * amount);
      b = Math.round(b + (255 - b) * amount);
    } else {
      const f = 1 + amount;
      r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function shortestAngleDelta(from, to) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  // Zeitkonstante tau in ms: kleiner = schnapptiger. Frameratenunabhaengig.
  function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function easeAngle(cur, target, dtMs, tau) {
    return normAngle(cur + shortestAngleDelta(cur, target) * (1 - Math.exp(-dtMs / tau)));
  }
  function easeValue(cur, target, dtMs, tau) {
    return cur + (target - cur) * (1 - Math.exp(-dtMs / tau));
  }

  function enemyFacing(e) {
    if (e.dc0 === 0 && e.dr0 === 0) return 0;
    return Math.atan2(e.dr0, e.dc0);
  }

  // --- Sicht: exakte Geometrie, gemeinsam fuer Logik und Kegel-Darstellung ---
  // Koordinaten in Zellen, Zellmitte = c + 0.5. Saeulen sind Rechtecke [c, c+1] x [r, r+1].
  // Gruben blockieren die Sicht nicht.
  const NEAR_SIGHT = 1.2; // direkt daneben wird man immer bemerkt

  function visionRange(e) {
    const v = VISION[e.personality] || VISION.wanderer;
    return Math.max(3, v.range - (perks ? perks.stealth : 0));
  }

  // Gezeichnete (interpolierte) Position von Waechter und Spieler
  function guardSightOrigin(e, now) {
    const t = Math.min(1, (now - enemyStepTime) / enemyInterval);
    const pc = e.prevC !== undefined ? e.prevC : e.c, pr = e.prevR !== undefined ? e.prevR : e.r;
    return [pc + (e.c - pc) * t + 0.5, pr + (e.r - pr) * t + 0.5];
  }
  function playerSightPoint(now) {
    const t = Math.min(1, (now - playerStepTime) / currentPlayerInterval());
    return [prevPx + (px - prevPx) * t + 0.5, prevPy + (py - prevPy) * t + 0.5];
  }
  function guardFacing(e) {
    return (e.angleDisp !== undefined) ? e.angleDisp : enemyFacing(e);
  }

  // Alle Saeulen im Umkreis als [x0, y0] (Rechteck bis x0+1, y0+1)
  function sightBlockers(ox, oy, reach) {
    const list = [];
    const r0 = Math.max(0, Math.floor(oy - reach)), r1 = Math.min(ROWS - 1, Math.floor(oy + reach));
    const c0 = Math.max(0, Math.floor(ox - reach)), c1 = Math.min(COLS - 1, Math.floor(ox + reach));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (grid[r][c] === BLOCK) list.push([c, r]);
    return list;
  }

  // Erster Eintrittsparameter t (in Zellen) eines Strahls in ein Rechteck, sonst Infinity.
  // Beruehrung zaehlt als Treffer: zwei Saeulen, die sich nur an einer Ecke beruehren, sind dicht.
  function rayRectEntry(ox, oy, ca, sa, x0, y0) {
    let tmin = 0, tmax = Infinity;
    if (Math.abs(ca) < 1e-12) { if (ox < x0 || ox > x0 + 1) return Infinity; }
    else {
      let t1 = (x0 - ox) / ca, t2 = (x0 + 1 - ox) / ca;
      if (t1 > t2) { const k = t1; t1 = t2; t2 = k; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    }
    if (Math.abs(sa) < 1e-12) { if (oy < y0 || oy > y0 + 1) return Infinity; }
    else {
      let t1 = (y0 - oy) / sa, t2 = (y0 + 1 - oy) / sa;
      if (t1 > t2) { const k = t1; t1 = t2; t2 = k; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    }
    return tmin <= tmax ? tmin : Infinity;
  }

  function rayDistance(ox, oy, ca, sa, maxT, blockers) {
    let t = maxT;
    for (const [x0, y0] of blockers) {
      const h = rayRectEntry(ox, oy, ca, sa, x0, y0);
      if (h < t) t = h;
    }
    return t;
  }

  function inSightCone(e, ang) {
    const v = VISION[e.personality] || VISION.wanderer;
    let diff = ang - guardFacing(e);
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= v.half;
  }

  // Sieht der Waechter (von ox, oy aus) den Punkt tx, ty?
  function canSeePoint(e, ox, oy, tx, ty) {
    const dx = tx - ox, dy = ty - oy;
    const dist = Math.hypot(dx, dy);
    const range = visionRange(e);
    if (dist > range) return false;
    if (dist < NEAR_SIGHT) return true;
    const ang = Math.atan2(dy, dx);
    if (!inSightCone(e, ang)) return false;
    return rayDistance(ox, oy, dx / dist, dy / dist, dist, sightBlockers(ox, oy, range + 1)) >= dist;
  }

  function canSeePlayer(e) {
    const now = performance.now();
    if (now < smokeUntil) return false; // Rauchbombe: fuer alle unsichtbar
    const [ox, oy] = guardSightOrigin(e, now);
    const [tx, ty] = playerSightPoint(now);
    return canSeePoint(e, ox, oy, tx, ty);
  }

  // Sichtbarer Bereich als Polygon (Zellkoordinaten, beginnt am Waechter).
  // Strahlen gehen auf beide Kegelraender, knapp an jeder Saeulenecke vorbei und in feinen Schritten dazwischen.
  function visionPolygon(e, ox, oy) {
    const v = VISION[e.personality] || VISION.wanderer;
    const range = visionRange(e);
    const face = guardFacing(e);
    const blockers = sightBlockers(ox, oy, range + 1);
    const rel = [-v.half, v.half];
    const STEP = 0.05;
    for (let a = -v.half + STEP; a < v.half; a += STEP) rel.push(a);
    const EPS = 1e-4;
    for (const [x0, y0] of blockers) {
      for (const [cx, cy] of [[x0, y0], [x0 + 1, y0], [x0, y0 + 1], [x0 + 1, y0 + 1]]) {
        let d = Math.atan2(cy - oy, cx - ox) - face;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        for (const dd of [d - EPS, d, d + EPS]) if (Math.abs(dd) <= v.half) rel.push(dd);
      }
    }
    rel.sort((p, q) => p - q);
    const pts = [[ox, oy]];
    for (const r of rel) {
      const ca = Math.cos(face + r), sa = Math.sin(face + r);
      const t = rayDistance(ox, oy, ca, sa, range, blockers);
      pts.push([ox + ca * t, oy + sa * t]);
    }
    return pts;
  }

