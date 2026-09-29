// 2-Spieler-Versus: Simulation (nur Host) und Zustands-Snapshot fuer den Gast.
// Laedt vor versus.js; Konstanten und Zustand (VS_*, vsState) stehen dort und werden erst zur Laufzeit gebraucht.

  // --- Simulation (nur Host) ---
  // Power-ups, Sicht, Schrittwahl und Sprueche stammen aus dem 1-Spieler-Modus
  // (POWER_MS, canSeePoint, chooseGuardStep, GUARD_LINES), angepasst auf zwei Spieler.
  const VS_POWERUP_TYPES = ['speed', 'shield', 'freeze', 'rapidfire'];
  const VS_PU_INTERVAL = 7000, VS_PU_MAX = 2;
  const VS_RAPID_COOLDOWN = 300;
  const VS_DIRS4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  function vsIdx(x, y) { return y * COLS + x; }
  function vsInBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

  function vsSpawnCorner(p) {
    return p === 0 ? { x: 0, y: 0 } : { x: COLS - 1, y: ROWS - 1 };
  }

  // Startland wie im 1-Spieler-Modus als Randlinie: Spieler 0 obere und linke Kante
  // (mit Ecke unten links), Spieler 1 untere und rechte Kante (mit Ecke oben rechts).
  // So bekommen beide gleich viele Randzellen.
  function vsClaimStartEdges(s, p) {
    for (let x = 0; x < COLS; x++) {
      if (p === 0 && x < COLS - 1) s.land[vsIdx(x, 0)] = 1;
      if (p === 1 && x > 0) s.land[vsIdx(x, ROWS - 1)] = 2;
    }
    for (let y = 0; y < ROWS; y++) {
      if (p === 0) s.land[vsIdx(0, y)] = 1;
      if (p === 1) s.land[vsIdx(COLS - 1, y)] = 2;
    }
  }

  function vsNewState() {
    const s = {
      land: new Array(COLS * ROWS).fill(0),   // 0 frei, 1 Spieler 0, 2 Spieler 1
      trail: new Array(COLS * ROWS).fill(0),  // 0 keine, 1/2 Linie von Spieler 0/1
      players: [],
      guards: [],
      mines: [],              // { x, y, p, armedAt }
      shots: [],              // fliegende Aexte (Treffer erst bei Ankunft)
      powerUps: [],
      events: [],             // Schuesse, Sprueche usw. fuer die Darstellung, reisen mit dem Zustand
      timeLeft: VS_MATCH_MS,
      countdown: VS_COUNTDOWN_MS,
      over: null,
      guardT: 0, puT: 0, freezeUntil: 0,
    };
    for (let p = 0; p < 2; p++) {
      const c = vsSpawnCorner(p);
      vsClaimStartEdges(s, p);
      s.players.push({ x: c.x, y: c.y, dir: null, next: null, lastDir: p === 0 ? 'down' : 'up',
        trail: [], inv: 0, shotReady: 0, stepT: 0,
        speedUntil: 0, slowUntil: 0, shieldUntil: 0, rapidUntil: 0,
        gadget: vsGadgets[p], gadgetReadyAt: 0, smokeUntil: 0, boosts: VS_BOOSTS });
    }
    for (let i = 0; i < VS_GUARDS; i++) s.guards.push(vsNewGuard(s));
    return s;
  }

  function vsCellFree(s, x, y) {
    const i = vsIdx(x, y);
    return !s.land[i] && !s.trail[i] &&
      !s.guards.some(g => !g.deadUntil && g.x === x && g.y === y) &&
      !s.players.some(p => p.x === x && p.y === y);
  }

  function vsNewGuard(s) {
    const usedNames = s.guards.filter(g => !g.deadUntil).map(g => g.name);
    for (let tries = 0; tries < 300; tries++) {
      const x = 1 + Math.floor(Math.random() * (COLS - 2));
      const y = 3 + Math.floor(Math.random() * (ROWS - 6));
      if (!vsCellFree(s, x, y)) continue;
      if (s.players.some(p => Math.abs(p.x - x) + Math.abs(p.y - y) < 5)) continue;
      let name = Math.floor(Math.random() * GUARD_NAMES.length);
      while (usedNames.includes(name)) name = (name + 1) % GUARD_NAMES.length;
      return { x, y, dc0: 1, dr0: 0, pers: Math.floor(Math.random() * BASE_PERSONALITIES.length), name,
        deadUntil: 0, hunting: false, target: -1, lastSeen: -1e9, stunUntil: 0, breakUntil: 0, lastBubbleAt: 0 };
    }
    return { x: 0, y: 0, dc0: 1, dr0: 0, pers: 0, name: 0, deadUntil: performance.now() + VS_GUARD_RESPAWN,
      hunting: false, target: -1, lastSeen: -1e9, stunUntil: 0, breakUntil: 0, lastBubbleAt: 0 };
  }

  function vsOnOwnLand(s, p) {
    const pl = s.players[p];
    return s.land[vsIdx(pl.x, pl.y)] === p + 1;
  }

  // Keine Leben im Versus: wer erwischt wird, verliert seine Linie, muss zurueck aufs
  // Startfeld und dort kurz stehen (nach einem Abschuss kuerzer als nach einem Crash).
  function vsSendHome(s, p, now, stunMs) {
    const pl = s.players[p];
    if (now < pl.inv || now < pl.shieldUntil || s.over) return;
    pl.trail.forEach(i => { s.trail[i] = 0; });
    pl.trail = [];
    pl.combo = 0;
    // Alles Land verloren: freie Zellen der Startkanten zurueck, sonst kaeme man nie mehr heim
    if (!s.land.includes(p + 1)) {
      const before = s.land.slice();
      vsClaimStartEdges(s, p);
      for (let i = 0; i < s.land.length; i++) if (before[i] && before[i] !== p + 1) s.land[i] = before[i];
    }
    const c = vsSpawnCorner(p);
    pl.x = pl.prevX = c.x; pl.y = pl.prevY = c.y;
    pl.dir = pl.next = null;
    pl.stunUntil = now + stunMs;
    pl.stunMs = stunMs;
    pl.inv = now + stunMs + VS_INVULN_MS;
    s.events.push({ t: 'hit', p });
    s.guards.forEach(g => { if (g.target === p) g.hunting = false; });
  }
  function vsShotDown(s, p, now) { vsSendHome(s, p, now, VS_SHOT_STUN_MS); }
  function vsKill(s, p, now) { vsSendHome(s, p, now, VS_CRASH_STUN_MS); }

  function vsCapture(s, p) {
    const own = p + 1, pl = s.players[p], opp = s.players[1 - p];
    const cells = pl.trail.slice();  // alles, was jetzt dazukommt (fuer die Effekte)
    let stolen = 0;
    pl.trail.forEach(i => { s.trail[i] = 0; s.land[i] = own; });
    pl.trail = [];
    // Die restlichen Zellen (frei oder Land des Gegners) in zusammenhaengende Gebiete teilen.
    // Mir gehoert jedes Gebiet ohne Waechter und ohne Gegner - ausser dem groessten:
    // das bleibt immer offen, damit nie das ganze Feld auf einmal wegfaellt
    // (z.B. wenn der Waechter gerade abgeschossen ist).
    const comp = new Int16Array(COLS * ROWS).fill(-1);
    const sizes = [];
    for (let start = 0; start < COLS * ROWS; start++) {
      if (s.land[start] === own || comp[start] >= 0) continue;
      const id = sizes.length, stack = [start];
      comp[start] = id;
      let n = 0;
      while (stack.length) {
        const i = stack.pop(), x = i % COLS, y = (i - x) / COLS;
        n++;
        for (const [dx, dy] of VS_DIRS4) {
          const nx = x + dx, ny = y + dy;
          if (!vsInBounds(nx, ny)) continue;
          const ni = vsIdx(nx, ny);
          if (s.land[ni] === own || comp[ni] >= 0) continue;
          comp[ni] = id;
          stack.push(ni);
        }
      }
      sizes.push(n);
    }
    const safe = new Set();
    let largest = -1;
    sizes.forEach((n, id) => { if (largest < 0 || n > sizes[largest]) largest = id; });
    if (largest >= 0) safe.add(largest);
    // Waechter schuetzen ihr Gebiet, auch abgeschossene (an ihrer letzten Stelle)
    s.guards.forEach(g => { const id = comp[vsIdx(g.x, g.y)]; if (id >= 0) safe.add(id); });
    // Der Gegner schuetzt sein Gebiet; steht er gerade auf meinem Land, die Gebiete daneben
    const oi = vsIdx(opp.x, opp.y);
    if (comp[oi] >= 0) safe.add(comp[oi]);
    else for (const [dx, dy] of VS_DIRS4) {
      if (vsInBounds(opp.x + dx, opp.y + dy)) {
        const id = comp[vsIdx(opp.x + dx, opp.y + dy)];
        if (id >= 0) safe.add(id);
      }
    }
    for (let i = 0; i < COLS * ROWS; i++) {
      if (comp[i] >= 0 && !safe.has(comp[i])) {
        if (s.land[i]) stolen++;
        s.land[i] = own; s.trail[i] = 0;
        cells.push(i);
      }
    }
    s.powerUps = s.powerUps.filter(u => s.land[vsIdx(u.x, u.y)] === 0);
    if (cells.length) {
      pl.combo = (pl.combo || 0) + 1;
      s.events.push({ t: 'capture', p, cells, stolen, combo: pl.combo, x: pl.x, y: pl.y });
    }
  }

  function vsPlayerInterval(pl, now) {
    return VS_STEP_MS * (now < pl.speedUntil ? 0.55 : now < pl.slowUntil ? 1.6 : 1);
  }

  function vsStepPlayer(s, p, now) {
    const pl = s.players[p];
    pl.prevX = pl.x; pl.prevY = pl.y;
    if (now < (pl.stunUntil || 0)) { pl.next = null; return; } // nach Abschuss kurz eingefroren
    if (pl.next) { pl.dir = pl.next; pl.next = null; }
    if (!pl.dir) return;
    const [dx, dy] = dirDelta(pl.dir);
    if (vsMoveTo(s, p, pl.x + dx, pl.y + dy, now) === 'blocked') pl.dir = null;
  }

  // Ein Feld weiter (normaler Schritt und Enterhaken). Gibt 'moved', 'blocked' oder 'hit' zurueck.
  function vsMoveTo(s, p, nx, ny, now) {
    const pl = s.players[p];
    if (!vsInBounds(nx, ny)) return 'blocked';
    const i = vsIdx(nx, ny);
    if (s.trail[i] === p + 1) { vsKill(s, p, now); return 'hit'; }  // eigene Linie gekreuzt
    if (s.trail[i] === 2 - p) vsKill(s, 1 - p, now);                // Linie des Gegners gekappt
    if (s.over) return 'hit';
    pl.x = nx; pl.y = ny;
    if (s.land[i] !== p + 1) { s.trail[i] = p + 1; pl.trail.push(i); }
    else if (pl.trail.length) vsCapture(s, p);
    const pu = s.powerUps.findIndex(u => u.x === nx && u.y === ny);
    if (pu >= 0) vsPickup(s, p, s.powerUps.splice(pu, 1)[0], now);
    const opp = s.players[1 - p];
    if (opp.x === pl.x && opp.y === pl.y) {
      if (!vsOnOwnLand(s, 1 - p)) vsKill(s, 1 - p, now);
      if (!vsOnOwnLand(s, p)) vsKill(s, p, now);
    }
    vsCheckGuardHits(s, now);
    return pl.x === nx && pl.y === ny ? 'moved' : 'hit';
  }

  // --- Gadgets und Boost (wie im 1-Spieler-Modus: GADGETS, GADGET_HOOK_PULL, GADGET_SMOKE_MS) ---
  function vsCanAct(s, pl, now) {
    return !s.over && !(s.countdown > 0) && now >= (pl.stunUntil || 0);
  }

  function vsUseGadget(s, p, now) {
    const pl = s.players[p];
    if (!vsCanAct(s, pl, now) || now < pl.gadgetReadyAt) return;
    // Mine auf ein Nachbarfeld ohne eigenes Land und ohne Linie (freies Feld oder Land des Gegners);
    // gibt es keins, kein Wurf und kein Cooldown
    const mineAt = pl.gadget === 'mine' ? mineDropCell(pl.x, pl.y, pl.dir || pl.lastDir, (x, y) => {
      const i = vsIdx(x, y);
      return s.land[i] !== p + 1 && !s.trail[i] && !s.mines.some(m => m.x === x && m.y === y) &&
        !s.guards.some(g => !g.deadUntil && g.x === x && g.y === y) && !s.players.some(o => o.x === x && o.y === y);
    }) : null;
    if (pl.gadget === 'mine' && !mineAt) return;
    pl.gadgetReadyAt = now + GADGETS[pl.gadget].cooldown;
    if (pl.gadget === 'smoke') {
      pl.smokeUntil = now + GADGET_SMOKE_MS;
      s.guards.forEach(g => { if (g.target === p) g.hunting = false; });
      s.events.push({ t: 'smoke', p, x: pl.x, y: pl.y });
      return;
    }
    if (pl.gadget === 'mine') {
      // Pro Spieler hoechstens MINE_MAX, die aelteste faellt weg
      const own = s.mines.filter(m => m.p === p);
      if (own.length >= MINE_MAX) s.mines.splice(s.mines.indexOf(own[0]), 1);
      s.mines.push({ x: mineAt[0], y: mineAt[1], p, armedAt: now + MINE_ARM_MS });
      s.events.push({ t: 'mine', p, x: mineAt[0], y: mineAt[1] });
      return;
    }
    // Enterhaken: bis zu GADGET_HOOK_PULL Felder in Blickrichtung
    const [dx, dy] = dirDelta(pl.dir || pl.lastDir);
    const ox = pl.x, oy = pl.y;
    let pulled = 0;
    for (let k = 0; k < GADGET_HOOK_PULL; k++) {
      if (vsMoveTo(s, p, pl.x + dx, pl.y + dy, now) !== 'moved') break;
      pulled++;
    }
    pl.stepT = 0;
    s.events.push({ t: 'hook', p, ox, oy, dx, dy, pulled });
  }

  function vsUseBoost(s, p, now) {
    const pl = s.players[p];
    if (!vsCanAct(s, pl, now) || pl.boosts <= 0) return;
    pl.speedUntil = Math.max(pl.speedUntil, now + 180);
    pl.boosts--;
    s.events.push({ t: 'boost', p });
  }

  // --- Power-ups ---
  function vsSpawnPowerUp(s) {
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.floor(Math.random() * COLS), y = Math.floor(Math.random() * ROWS);
      if (!vsCellFree(s, x, y) || s.powerUps.some(u => u.x === x && u.y === y)) continue;
      const down = Math.random() < 0.3;
      const type = down ? 'slow' : VS_POWERUP_TYPES[Math.floor(Math.random() * VS_POWERUP_TYPES.length)];
      s.powerUps.push({ x, y, type, kind: down ? 'down' : 'up' });
      return;
    }
  }

  function vsPickup(s, p, u, now) {
    const pl = s.players[p];
    const until = now + POWER_MS[u.type];
    if (u.type === 'speed') pl.speedUntil = until;
    else if (u.type === 'shield') pl.shieldUntil = until;
    else if (u.type === 'freeze') s.freezeUntil = until;
    else if (u.type === 'rapidfire') pl.rapidUntil = until;
    else if (u.type === 'slow') pl.slowUntil = until;
    s.events.push({ t: 'pick', x: u.x, y: u.y, type: u.type, kind: u.kind, p });
  }

  // --- Waechter: Sichtkegel, Jagd, Sprueche ---
  function vsSay(s, gi, kind, force, now) {
    const g = s.guards[gi];
    if (!force && now - g.lastBubbleAt < 2500) return;
    g.lastBubbleAt = now;
    const pool = GUARD_LINES[kind];
    s.events.push({ t: 'say', i: gi, text: pool[Math.floor(Math.random() * pool.length)] });
  }

  // Versteckt: eigene Flaeche, deren vier Nachbarn auch eigene Flaeche (oder Rand) sind
  function vsHidden(s, p) {
    const pl = s.players[p];
    return isHidingCellBy(pl.x, pl.y, (c, r) => s.land[vsIdx(c, r)] === p + 1);
  }

  function vsGuardSees(s, g, p) {
    if (vsHidden(s, p) || performance.now() < s.players[p].smokeUntil) return false;
    const pl = s.players[p];
    const view = { personality: BASE_PERSONALITIES[g.pers], dc0: g.dc0, dr0: g.dr0, c: g.x, r: g.y };
    return canSeePoint(view, g.x + 0.5, g.y + 0.5, pl.x + 0.5, pl.y + 0.5);
  }

  function vsGuardBlocked(s, x, y) { return !vsInBounds(x, y) || s.land[vsIdx(x, y)] !== 0; }

  function vsStepGuards(s, now) {
    s.guards.forEach((g, gi) => {
      if (g.deadUntil) {
        if (now >= g.deadUntil) s.guards[gi] = vsNewGuard(s);
        return;
      }
      g.prevX = g.x; g.prevY = g.y;
      if (now < g.stunUntil || now < g.breakUntil) return;

      // Sieht er einen Spieler? Bei beiden jagt er den naeheren.
      let seen = -1, bestD = Infinity;
      for (let p = 0; p < 2; p++) {
        if (!vsGuardSees(s, g, p)) continue;
        const pl = s.players[p], d = Math.abs(pl.x - g.x) + Math.abs(pl.y - g.y);
        if (d < bestD) { bestD = d; seen = p; }
      }
      if (seen >= 0) {
        if (!g.hunting) { vsSay(s, gi, 'spotted', true, now); s.events.push({ t: 'alert' }); }
        g.hunting = true; g.target = seen; g.lastSeen = now;
      } else if (g.hunting && now - g.lastSeen > VISION_MEMORY) {
        g.hunting = false;
        vsSay(s, gi, 'lost', false, now);
      }

      if (!g.hunting && Math.random() < GUARD_BREAK_CHANCE) {
        g.breakUntil = now + GUARD_BREAK_MS;
        vsSay(s, gi, 'break', true, now);
        s.events.push({ t: 'break' });
        return;
      }

      const opts = VS_DIRS4.filter(([dx, dy]) => !vsGuardBlocked(s, g.x + dx, g.y + dy) &&
        !s.guards.some(o => o !== g && !o.deadUntil && o.x === g.x + dx && o.y === g.y + dy));
      if (!opts.length) return;
      const pers = BASE_PERSONALITIES[g.pers];
      if (pers === 'nervous' && !g.hunting && Math.random() < 0.28) return; // stockt kurz

      const view = { personality: pers, c: g.x, r: g.y, dc0: g.dc0, dr0: g.dr0 };
      const t = g.hunting ? s.players[g.target] : null;
      const choice = chooseGuardStep(view, opts, t && { c: t.x, r: t.y }, (c, r) => s.land[vsIdx(c, r)] !== 0, []);

      g.dc0 = choice[0]; g.dr0 = choice[1];
      g.x += choice[0]; g.y += choice[1];
    });
    vsCheckGuardHits(s, now);
  }

  function vsCheckGuardHits(s, now) {
    s.guards.forEach(g => {
      if (g.deadUntil) return;
      const t = s.trail[vsIdx(g.x, g.y)];
      if (t) vsKill(s, t - 1, now);
      s.players.forEach((pl, p) => {
        if (pl.x === g.x && pl.y === g.y && !vsOnOwnLand(s, p)) vsKill(s, p, now);
      });
    });
    vsCheckMines(s, now);
  }

  // Scharfe Mine, auf der ein Waechter oder der Gegner des Besitzers steht: sie geht hoch.
  // Alle Waechter daneben sterben mit, der Gegner wird nur auf dem Feld selbst heimgeschickt.
  function vsCheckMines(s, now) {
    if (!s.mines.length) return;
    s.mines = s.mines.filter(m => {
      if (now < m.armedAt) return true;
      const foe = s.players[1 - m.p];
      const foeHere = foe.x === m.x && foe.y === m.y;
      if (!foeHere && !s.guards.some(g => !g.deadUntil && g.x === m.x && g.y === m.y)) return true;
      // Eroberte Felder (beider Spieler) im Krater werden wieder frei
      const freed = [];
      for (const [c, r] of mineCraterCells(m.x, m.y)) {
        const i = vsIdx(c, r);
        if (s.land[i]) { s.land[i] = 0; freed.push(i); }
      }
      s.events.push({ t: 'boom', x: m.x, y: m.y, cells: freed });
      s.guards.forEach((g, gi) => {
        if (g.deadUntil || Math.abs(g.x - m.x) > 1 || Math.abs(g.y - m.y) > 1) return;
        g.deadUntil = now + VS_GUARD_RESPAWN;
        s.events.push({ t: 'guardDown', x: g.x, y: g.y, dx: 0, dy: 0, i: gi, pers: g.pers });
      });
      if (foeHere) vsShotDown(s, 1 - m.p, now);
      return false;
    });
  }

  // Zusaetzlich zur Feldpruefung: Abstand der gleitenden Positionen (wie
  // checkContinuousCollision im 1-Spieler-Modus), damit Feldtausch und
  // Beruehrungen zwischen zwei Feldern zaehlen.
  function vsLerpPos(o, t) {
    const x0 = o.prevX !== undefined ? o.prevX : o.x, y0 = o.prevY !== undefined ? o.prevY : o.y;
    // Spruenge (Enterhaken, Respawn) nicht interpolieren
    if (Math.abs(o.x - x0) + Math.abs(o.y - y0) > 1) return { x: o.x, y: o.y };
    return { x: x0 + (o.x - x0) * t, y: y0 + (o.y - y0) * t };
  }
  function vsCheckTouch(s, now) {
    const pos = s.players.map(pl => vsLerpPos(pl, Math.min(1, pl.stepT / vsPlayerInterval(pl, now))));
    const gT = Math.min(1, s.guardT / VS_GUARD_MS);
    s.guards.forEach(g => {
      if (g.deadUntil || now < g.stunUntil) return;
      const gp = vsLerpPos(g, gT);
      s.players.forEach((pl, p) => {
        if (Math.hypot(gp.x - pos[p].x, gp.y - pos[p].y) < TOUCH_RADIUS && !vsOnOwnLand(s, p)) vsKill(s, p, now);
      });
    });
    if (s.over) return;
    if (Math.hypot(pos[0].x - pos[1].x, pos[0].y - pos[1].y) < TOUCH_RADIUS) {
      const off0 = !vsOnOwnLand(s, 0), off1 = !vsOnOwnLand(s, 1);
      if (off1) vsKill(s, 1, now);
      if (off0) vsKill(s, 0, now);
    }
  }

  // Flugzeit der Axt wie im 1-Spieler-Modus (shotProjectiles in shoot())
  function vsShotLife(pathLen) { return 220 + (pathLen > 2 ? 140 : 0); }

  // Die Axt fliegt bis zum ersten Ziel in der Linie (oder bis zur Reichweite).
  // Getroffen wird erst, wenn sie eine Zelle erreicht - wer ausweicht, entkommt.
  function vsShoot(s, p, now) {
    const pl = s.players[p];
    if (now < pl.shotReady || s.countdown > 0 || s.over) return;
    pl.shotReady = now + (now < pl.rapidUntil ? VS_RAPID_COOLDOWN : VS_SHOT_COOLDOWN);
    const [dx, dy] = dirDelta(pl.dir || pl.lastDir);
    const opp = 1 - p, op = s.players[opp];
    const path = [[pl.x, pl.y]];
    let x = pl.x, y = pl.y;
    for (let k = 0; k < VS_SHOT_RANGE; k++) {
      x += dx; y += dy;
      if (!vsInBounds(x, y)) break;
      path.push([x, y]);
      if (s.guards.some(g => !g.deadUntil && g.x === x && g.y === y)) break;
      if ((op.x === x && op.y === y) || s.trail[vsIdx(x, y)] === opp + 1) break;
    }
    s.events.push({ t: 'shot', path });
    if (path.length > 1) s.shots.push({ owner: p, path, dx, dy, start: now, life: vsShotLife(path.length), checked: 0 });
  }

  // Fliegende Aexte: jede neu erreichte Zelle pruefen, beim ersten Treffer ist Schluss
  function vsStepShots(s, now) {
    s.shots = s.shots.filter(sh => {
      const reached = Math.min(sh.path.length - 1, Math.floor((now - sh.start) / sh.life * (sh.path.length - 1)));
      const opp = 1 - sh.owner, op = s.players[opp];
      for (let k = sh.checked + 1; k <= reached; k++) {
        const [x, y] = sh.path[k];
        const g = s.guards.find(g => !g.deadUntil && g.x === x && g.y === y);
        if (g) {
          g.deadUntil = now + VS_GUARD_RESPAWN;
          s.events.push({ t: 'guardDown', x, y, dx: sh.dx, dy: sh.dy, i: s.guards.indexOf(g), pers: g.pers });
          return false;
        }
        if (op.x === x && op.y === y) { vsShotDown(s, opp, now); return false; }
        if (s.trail[vsIdx(x, y)] === opp + 1) { vsCutTrail(s, opp, vsIdx(x, y)); return false; }
      }
      sh.checked = reached;
      return reached < sh.path.length - 1;
    });
  }

  // Treffer auf die unfertige Linie: wie im 1-Spieler-Modus (cutTrailAt) faellt das Stueck
  // vom Land bis zur Trefferstelle weg, ein Leben kostet es nicht.
  function vsCutTrail(s, p, hitIdx) {
    const pl = s.players[p];
    const k = pl.trail.indexOf(hitIdx);
    if (k < 0) return;
    const removed = pl.trail.splice(0, k + 1);
    pl.combo = 0;
    removed.forEach(i => { s.trail[i] = 0; });
    s.events.push({ t: 'cut', cells: removed, p });
  }

  function vsPct(s, p) {
    let n = 0;
    for (let i = 0; i < s.land.length; i++) if (s.land[i] === p + 1) n++;
    return Math.round(n * 100 / s.land.length);
  }

  function vsEndMatch(s, winner, reason) {
    if (s.over) return;
    if (winner >= 0) vsSeries[winner]++;
    const [a, b] = vsSeries;
    const leader = a > b ? 0 : b > a ? 1 : -1;
    const done = leader >= 0 && vsSeries[leader] >= VS_SERIES_WINS &&
      vsSeries[leader] - vsSeries[1 - leader] >= VS_SERIES_LEAD;
    s.over = { winner, reason, series: vsSeries.slice(), seriesWinner: done ? leader : -1 };
  }

  // Neue Serie, wenn die letzte entschieden ist
  function vsNextMatch() {
    if (vsState && vsState.over && vsState.over.seriesWinner >= 0) vsSeries = [0, 0];
    vsHostStartMatch();
  }

  function vsHostTick(delta, now) {
    const s = vsState;
    if (s.over) return;
    if (s.countdown > 0) { s.countdown -= delta; return; }
    s.timeLeft -= delta;
    vsStepShots(s, now);
    for (let p = 0; p < 2; p++) {
      const pl = s.players[p], iv = vsPlayerInterval(pl, now);
      pl.stepT += delta;
      if (pl.stepT >= iv) {
        pl.stepT = Math.min(pl.stepT - iv, iv);
        if (vsCpu && p === 1) vsCpuThink(s, now);
        vsStepPlayer(s, p, now);
        if (s.over) return;
      }
    }
    if (now >= s.freezeUntil) {
      s.guardT += delta;
      if (s.guardT >= VS_GUARD_MS) {
        s.guardT = Math.min(s.guardT - VS_GUARD_MS, VS_GUARD_MS);
        vsStepGuards(s, now);
      }
    }
    vsCheckTouch(s, now);
    if (s.over) return;
    s.puT += delta;
    if (s.puT >= VS_PU_INTERVAL) {
      s.puT = 0;
      if (s.powerUps.length < VS_PU_MAX) vsSpawnPowerUp(s);
    }
    if (s.over) return;
    const a = vsPct(s, 0), b = vsPct(s, 1);
    if (a >= VS_WIN_PCT || b >= VS_WIN_PCT) vsEndMatch(s, a >= b ? 0 : 1, VS_WIN_PCT + '% claimed');
    else if (s.timeLeft <= 0) vsEndMatch(s, a === b ? -1 : (a > b ? 0 : 1), 'time is up');
  }

  // Kompakter Zustand fuer den Gast (Restzeiten statt Zeitstempel, die Uhren sind verschieden)
  function vsSnapshot(s) {
    const now = performance.now();
    const left = t => Math.max(0, Math.round(t - now));
    return {
      t: 'state',
      land: s.land.join(''),
      trail: s.trail.join(''),
      players: s.players.map(pl => ({ x: pl.x, y: pl.y, inv: now < pl.inv,
        speed: left(pl.speedUntil), slow: left(pl.slowUntil), shield: left(pl.shieldUntil), rapid: left(pl.rapidUntil),
        stun: left(pl.stunUntil || 0), stunMs: pl.stunMs || 1,
        gadgetCd: left(pl.gadgetReadyAt), smoke: left(pl.smokeUntil), shotCd: left(pl.shotReady), boosts: pl.boosts })),
      guards: s.guards.map(g => [g.x, g.y, g.deadUntil ? 1 : 0, g.hunting ? 1 : 0,
        now < g.stunUntil ? 1 : 0, now < g.breakUntil ? 1 : 0, g.pers, g.name]),
      powerUps: s.powerUps.map(u => [u.x, u.y, u.type, u.kind]),
      mines: s.mines.map(m => [m.x, m.y, m.p, left(m.armedAt)]),
      freeze: left(s.freezeUntil),
      events: s.events,
      timeLeft: s.timeLeft, countdown: s.countdown, over: s.over, series: vsSeries,
      pct: [vsPct(s, 0), vsPct(s, 1)],
    };
  }
