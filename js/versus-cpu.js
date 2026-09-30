// 2-Spieler-Versus: KI-Gegner (nur bei vsCpu). Teil der Simulation, siehe versus-sim.js.

  // --- KI-Gegner (nur bei vsCpu, steuert Spieler 1) ---
  // Einfache Schleifen: vom eigenen Land ein Stueck hinaus, einmal abbiegen,
  // auf kuerzestem Weg zurueck. Bei Gefahr sofort heim; schiesst, wenn etwas in der Linie steht.
  let vsCpuPlan = { phase: 'home', count: 0, len: 0 };
  let vsCpuGuardSeenAt = -1e9;

  // Die CPU sieht wie ein Waechter (Kegel in Fahrtrichtung, dieselbe Geometrie wie canSeePoint)
  function vsCpuView(pl) {
    const [dx, dy] = dirDelta(pl.dir || pl.lastDir);
    return { personality: 'wanderer', dc0: dx, dr0: dy, c: pl.x, r: pl.y };
  }
  function vsCpuSees(pl, x, y) {
    return canSeePoint(vsCpuView(pl), pl.x + 0.5, pl.y + 0.5, x + 0.5, y + 0.5);
  }

  function vsCpuSafeDirs(s, pl, p) {
    return ['up', 'down', 'left', 'right'].filter(d => {
      if (pl.trail.length && d === INVERTED_DIR[pl.dir]) return false;
      const [dx, dy] = dirDelta(d), x = pl.x + dx, y = pl.y + dy;
      return vsInBounds(x, y) && s.trail[vsIdx(x, y)] !== p + 1;
    });
  }

  // Erster Schritt auf dem kuerzesten Weg zum eigenen Land, ohne die eigene Linie zu kreuzen
  function vsCpuWayHome(s, pl, p) {
    const prev = new Int16Array(COLS * ROWS).fill(-1);
    const start = vsIdx(pl.x, pl.y);
    prev[start] = start;
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % COLS, y = (i - x) / COLS;
      if (i !== start && s.land[i] === vsTeam(s, p)) {
        let cur = i;
        while (prev[cur] !== start) cur = prev[cur];
        const cx = cur % COLS, cy = (cur - cx) / COLS;
        return cx > pl.x ? 'right' : cx < pl.x ? 'left' : cy > pl.y ? 'down' : 'up';
      }
      for (const [dx, dy] of VS_DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (!vsInBounds(nx, ny)) continue;
        const ni = vsIdx(nx, ny);
        if (prev[ni] !== -1 || s.trail[ni] === p + 1) continue;
        prev[ni] = i;
        queue.push(ni);
      }
    }
    return null;
  }

  function vsCpuThink(s, now) {
    const p = 1, pl = s.players[p], opp = s.players[0];
    const plan = vsCpuPlan;
    const safe = vsCpuSafeDirs(s, pl, p);
    if (!safe.length) return;
    const pick = list => list[Math.floor(Math.random() * list.length)];
    // Gefahr nur, wenn sie den Waechter sieht (oder ihn eben noch gesehen hat)
    let guardDist = 99;
    s.guards.forEach(g => {
      if (g.deadUntil || !vsCpuSees(pl, g.x, g.y)) return;
      vsCpuGuardSeenAt = now;
      guardDist = Math.min(guardDist, Math.abs(g.x - pl.x) + Math.abs(g.y - pl.y));
    });
    if (guardDist === 99 && now - vsCpuGuardSeenAt < VISION_MEMORY) guardDist = 3;
    const onLand = s.land[vsIdx(pl.x, pl.y)] === vsTeam(s, p);
    let dir = pl.dir;

    if (onLand && !pl.trail.length) {
      // Zu Hause: meist gleich wieder los, Richtung freies Feld
      const out = safe.filter(d => {
        const [dx, dy] = dirDelta(d);
        return s.land[vsIdx(pl.x + dx, pl.y + dy)] !== vsTeam(s, p);
      });
      if (out.length && guardDist > 3 && Math.random() < 0.5) {
        dir = pick(out);
        vsCpuPlan = { phase: 'out', count: 0, len: 2 + Math.floor(Math.random() * 4) };
      } else {
        // Sonst auf dem eigenen Land bleiben
        const stay = safe.filter(d => !out.includes(d));
        if (!dir || !stay.includes(dir)) dir = pick(stay.length ? stay : safe);
      }
    } else if (plan.phase === 'back' || guardDist <= 3 || pl.trail.length >= 10) {
      plan.phase = 'back';
      dir = vsCpuWayHome(s, pl, p) || pick(safe);
    } else {
      plan.count++;
      if (plan.count >= plan.len) {
        if (plan.phase === 'out') {
          // Einmal abbiegen, dann zurueck
          const turns = safe.filter(d => d !== pl.dir);
          if (turns.length) dir = pick(turns);
          vsCpuPlan = { phase: 'turn', count: 0, len: 2 + Math.floor(Math.random() * 3) };
        } else {
          plan.phase = 'back';
          dir = vsCpuWayHome(s, pl, p) || pick(safe);
        }
      }
      if (!dir || !safe.includes(dir)) dir = pick(safe);
    }
    pl.next = dir;
    pl.lastDir = dir;

    // Schiessen, wenn Gegner, seine Linie oder ein Waechter in Reichweite in der Linie steht
    const [dx, dy] = dirDelta(dir);
    for (let k = 1; k <= VS_SHOT_RANGE; k++) {
      const x = pl.x + dx * k, y = pl.y + dy * k;
      if (!vsInBounds(x, y)) break;
      if (!vsCpuSees({ x: pl.x, y: pl.y, dir }, x, y)) break; // ausserhalb der Sicht
      const oppVisible = now >= opp.smokeUntil;
      const hit = (!s.coop && ((oppVisible && opp.x === x && opp.y === y) || s.trail[vsIdx(x, y)] === 1)) ||
        s.guards.some(g => !g.deadUntil && g.x === x && g.y === y);
      if (hit) { pl.dir = dir; vsShoot(s, p, now); break; }
    }
  }
