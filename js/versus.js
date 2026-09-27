  // --- 2-Spieler-Versus ueber WebRTC (js/net.js) ---
  // Eigene, schlanke Simulation, damit die 1-Spieler-Logik unberuehrt bleibt.
  // Gezeichnet wird trotzdem mit draw() aus render.js (siehe vsSyncRender).
  // Der Host rechnet alles, der Gast schickt nur Eingaben und zeichnet den Zustand.

  const VS_STEP_MS = 170;         // Spielerschritt
  const VS_GUARD_MS = 260;        // Waechterschritt
  const VS_SHOT_RANGE = 8;
  const VS_SHOT_COOLDOWN = 900;
  const VS_GUARDS = 1;
  const VS_GUARD_RESPAWN = 3000;
  const VS_LIVES = 3;
  const VS_INVULN_MS = 1500;
  const VS_MATCH_MS = 120000;
  const VS_WIN_PCT = 50;
  const VS_COUNTDOWN_MS = COUNTDOWN_STEPS.length * COUNTDOWN_STEP_MS; // wie im 1-Spieler-Modus
  const VS_SEND_MS = 33;

  let vsActive = false;      // Versus-Bildschirm aktiv (Lobby oder Match)
  let vsPlaying = false;     // Match laeuft
  let vsIsHost = false;
  let vsCpu = false;         // lokales Match gegen die KI (zum Testen ohne zweites Geraet)
  let vsMe = 0;              // 0 = Host, 1 = Gast
  let vsState = null;        // beim Host die Wahrheit, beim Gast die letzte Kopie
  let vsRaf = 0, vsLastTime = 0, vsSendTimer = 0, vsPlayed = 0;

  // --- Overlay / Lobby ---
  function vsPanel() { return document.getElementById('vsPanel'); }

  function vsShowPanel(title, text, buttons, showQr) {
    const overlay = document.getElementById('overlay');
    Array.from(overlay.children).forEach(el => {
      if (el.id !== 'overlayTitle' && el.id !== 'vsPanel') el.classList.add('vsHide');
    });
    overlay.classList.remove('hidden');
    document.getElementById('overlayTitle').textContent = title;
    vsPanel().classList.remove('hidden');
    document.getElementById('vsText').textContent = text || '';
    document.getElementById('vsQr').classList.toggle('hidden', !showQr);
    const row = document.getElementById('vsButtons');
    row.textContent = '';
    (buttons || []).forEach(b => {
      const el = document.createElement('button');
      el.textContent = b.label;
      el.className = b.primary ? 'primary' : 'vsLink';
      el.addEventListener('click', b.onClick);
      row.appendChild(el);
    });
  }

  function vsHidePanel() {
    vsPanel().classList.add('hidden');
    document.querySelectorAll('#overlay .vsHide').forEach(el => el.classList.remove('vsHide'));
  }

  function vsSetStatus(text) {
    const el = document.getElementById('vsStatus');
    if (el) el.textContent = text;
  }

  function vsOpenLobby() {
    vsActive = true;
    vsShowPanel('2 Player', 'Versus: claim more ground than your rival. Cut their line or shoot them to take a life.', [
      { label: '📡 Host a match', primary: true, onClick: vsStartHost },
      { label: '🤖 Play vs CPU', onClick: vsStartCpu },
      { label: 'Back', onClick: vsLeave },
    ], false);
    vsSetStatus('To join, scan the host\'s QR code with your camera.');
  }

  function vsStartCpu() {
    vsIsHost = true; vsMe = 0; vsCpu = true;
    vsHostStartMatch();
  }

  function vsStartHost() {
    vsIsHost = true; vsMe = 0; vsCpu = false;
    vsBindNet();
    const url = Net.joinUrl(Net.host());
    vsShowPanel('2 Player', 'Let your rival scan this code.', [{ label: 'Cancel', onClick: vsLeave }], true);
    QR.draw(document.getElementById('vsQr'), url, 220);
  }

  function vsStartGuest(room) {
    vsActive = true;
    vsCpu = false;
    vsIsHost = false; vsMe = 1;
    vsBindNet();
    vsShowPanel('2 Player', 'Joining match...', [{ label: 'Cancel', onClick: vsLeave }], false);
    Net.join(room);
  }

  function vsBindNet() {
    Net.onStatus = vsSetStatus;
    Net.onOpen = () => {
      if (vsIsHost) vsHostStartMatch();
      else vsShowPanel('2 Player', 'Connected! Waiting for host...', [{ label: 'Leave', onClick: vsLeave }], false);
    };
    Net.onMessage = vsOnMessage;
    Net.onClose = () => {
      if (!vsActive) return;
      vsStopLoop();
      vsShowPanel('Connection lost', 'The other player is gone.', [{ label: 'Menu', primary: true, onClick: vsLeave }], false);
      vsSetStatus('');
    };
  }

  function vsLeave() {
    vsActive = false;
    vsStopLoop();
    Net.onClose = () => {};
    Net.close();
    vsState = null;
    vsExitRender();
    vsHidePanel();
    openModeSelect();
  }

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
        trail: [], lives: VS_LIVES, inv: 0, shotReady: 0, stepT: 0,
        speedUntil: 0, slowUntil: 0, shieldUntil: 0, rapidUntil: 0 });
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

  function vsDelta(d) {
    return d === 'up' ? [0, -1] : d === 'down' ? [0, 1] : d === 'left' ? [-1, 0] : [1, 0];
  }

  function vsOnOwnLand(s, p) {
    const pl = s.players[p];
    return s.land[vsIdx(pl.x, pl.y)] === p + 1;
  }

  function vsKill(s, p, now) {
    const pl = s.players[p];
    if (now < pl.inv || now < pl.shieldUntil || s.over) return;
    pl.trail.forEach(i => { s.trail[i] = 0; });
    pl.trail = [];
    pl.lives--;
    s.events.push({ t: 'hit', p });
    if (pl.lives <= 0) { vsEndMatch(s, 1 - p, 'out of lives'); return; }
    // Zurueck aufs eigene Land, moeglichst nahe der Startecke
    const c = vsSpawnCorner(p);
    let best = null, bestD = 1e9;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (s.land[vsIdx(x, y)] !== p + 1) continue;
      const d = Math.abs(x - c.x) + Math.abs(y - c.y);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    if (!best) {
      // Alles verloren: Startkante zurueck (nur freie Zellen, fremdes Land bleibt)
      const before = s.land.slice();
      vsClaimStartEdges(s, p);
      for (let i = 0; i < s.land.length; i++) if (before[i] && before[i] !== p + 1) s.land[i] = before[i];
      best = c;
      s.land[vsIdx(c.x, c.y)] = p + 1;
    }
    pl.x = best.x; pl.y = best.y;
    pl.dir = pl.next = null;
    pl.inv = now + VS_INVULN_MS;
    s.guards.forEach(g => { if (g.target === p) g.hunting = false; });
  }

  function vsCapture(s, p) {
    const own = p + 1, pl = s.players[p], opp = s.players[1 - p];
    pl.trail.forEach(i => { s.trail[i] = 0; s.land[i] = own; });
    pl.trail = [];
    // Alles, was weder Waechter noch Gegner erreichen koennen, gehoert jetzt mir
    // (auch Land des Gegners).
    const seen = new Uint8Array(COLS * ROWS);
    const stack = [];
    const seed = (x, y) => {
      const i = vsIdx(x, y);
      if (s.land[i] !== own && !seen[i]) { seen[i] = 1; stack.push(i); }
    };
    s.guards.forEach(g => { if (!g.deadUntil) seed(g.x, g.y); });
    seed(opp.x, opp.y);
    while (stack.length) {
      const i = stack.pop(), x = i % COLS, y = (i - x) / COLS;
      if (x > 0) seed(x - 1, y);
      if (x < COLS - 1) seed(x + 1, y);
      if (y > 0) seed(x, y - 1);
      if (y < ROWS - 1) seed(x, y + 1);
    }
    for (let i = 0; i < COLS * ROWS; i++) {
      if (!seen[i] && s.land[i] !== own) { s.land[i] = own; s.trail[i] = 0; }
    }
    s.powerUps = s.powerUps.filter(u => s.land[vsIdx(u.x, u.y)] === 0);
  }

  function vsPlayerInterval(pl, now) {
    return VS_STEP_MS * (now < pl.speedUntil ? 0.55 : now < pl.slowUntil ? 1.6 : 1);
  }

  function vsStepPlayer(s, p, now) {
    const pl = s.players[p];
    if (pl.next) { pl.dir = pl.next; pl.next = null; }
    if (!pl.dir) return;
    const [dx, dy] = vsDelta(pl.dir);
    const nx = pl.x + dx, ny = pl.y + dy;
    if (!vsInBounds(nx, ny)) { pl.dir = null; return; }
    const i = vsIdx(nx, ny);
    if (s.trail[i] === p + 1) { vsKill(s, p, now); return; }       // eigene Linie gekreuzt
    if (s.trail[i] === 2 - p) vsKill(s, 1 - p, now);                // Linie des Gegners gekappt
    if (s.over) return;
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
    if (vsHidden(s, p)) return false;
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
  }

  // Wie im 1-Spieler-Modus trifft der Schuss sofort; die Axt fliegt nur als Animation.
  function vsShoot(s, p, now) {
    const pl = s.players[p];
    if (now < pl.shotReady || s.countdown > 0 || s.over) return;
    pl.shotReady = now + (now < pl.rapidUntil ? VS_RAPID_COOLDOWN : VS_SHOT_COOLDOWN);
    const [dx, dy] = vsDelta(pl.dir || pl.lastDir);
    const opp = 1 - p, op = s.players[opp];
    const path = [[pl.x, pl.y]];
    let x = pl.x, y = pl.y;
    for (let k = 0; k < VS_SHOT_RANGE; k++) {
      x += dx; y += dy;
      if (!vsInBounds(x, y)) break;
      path.push([x, y]);
      const g = s.guards.find(g => !g.deadUntil && g.x === x && g.y === y);
      if (g) {
        g.deadUntil = now + VS_GUARD_RESPAWN;
        s.events.push({ t: 'guardDown', x, y, dx, dy, i: s.guards.indexOf(g), pers: g.pers });
        break;
      }
      if (op.x === x && op.y === y) { vsKill(s, opp, now); break; }
      if (s.trail[vsIdx(x, y)] === opp + 1) { vsCutTrail(s, opp, vsIdx(x, y)); break; }
    }
    s.events.push({ t: 'shot', path });
  }

  // Treffer auf die unfertige Linie: wie im 1-Spieler-Modus (cutTrailAt) faellt das Stueck
  // vom Land bis zur Trefferstelle weg, ein Leben kostet es nicht.
  function vsCutTrail(s, p, hitIdx) {
    const pl = s.players[p];
    const k = pl.trail.indexOf(hitIdx);
    if (k < 0) return;
    const removed = pl.trail.splice(0, k + 1);
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
    s.over = { winner, reason };
  }

  function vsHostTick(delta, now) {
    const s = vsState;
    if (s.over) return;
    if (s.countdown > 0) { s.countdown -= delta; return; }
    s.timeLeft -= delta;
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
      players: s.players.map(pl => ({ x: pl.x, y: pl.y, lives: pl.lives, inv: now < pl.inv,
        speed: left(pl.speedUntil), slow: left(pl.slowUntil), shield: left(pl.shieldUntil), rapid: left(pl.rapidUntil) })),
      guards: s.guards.map(g => [g.x, g.y, g.deadUntil ? 1 : 0, g.hunting ? 1 : 0,
        now < g.stunUntil ? 1 : 0, now < g.breakUntil ? 1 : 0, g.pers, g.name]),
      powerUps: s.powerUps.map(u => [u.x, u.y, u.type, u.kind]),
      freeze: left(s.freezeUntil),
      events: s.events,
      timeLeft: s.timeLeft, countdown: s.countdown, over: s.over,
      pct: [vsPct(s, 0), vsPct(s, 1)],
    };
  }

  // --- KI-Gegner (nur bei vsCpu, steuert Spieler 1) ---
  // Einfache Schleifen: vom eigenen Land ein Stueck hinaus, einmal abbiegen,
  // auf kuerzestem Weg zurueck. Bei Gefahr sofort heim; schiesst, wenn etwas in der Linie steht.
  let vsCpuPlan = { phase: 'home', count: 0, len: 0 };
  let vsCpuGuardSeenAt = -1e9;

  // Die CPU sieht wie ein Waechter (Kegel in Fahrtrichtung, dieselbe Geometrie wie canSeePoint)
  function vsCpuView(pl) {
    const [dx, dy] = vsDelta(pl.dir || pl.lastDir);
    return { personality: 'wanderer', dc0: dx, dr0: dy, c: pl.x, r: pl.y };
  }
  function vsCpuSees(pl, x, y) {
    return canSeePoint(vsCpuView(pl), pl.x + 0.5, pl.y + 0.5, x + 0.5, y + 0.5);
  }

  function vsCpuSafeDirs(s, pl, p) {
    const back = { up: 'down', down: 'up', left: 'right', right: 'left' };
    return ['up', 'down', 'left', 'right'].filter(d => {
      if (pl.trail.length && d === back[pl.dir]) return false;
      const [dx, dy] = vsDelta(d), x = pl.x + dx, y = pl.y + dy;
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
      if (i !== start && s.land[i] === p + 1) {
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
    const onLand = s.land[vsIdx(pl.x, pl.y)] === p + 1;
    let dir = pl.dir;

    if (onLand && !pl.trail.length) {
      // Zu Hause: meist gleich wieder los, Richtung freies Feld
      const out = safe.filter(d => {
        const [dx, dy] = vsDelta(d);
        return s.land[vsIdx(pl.x + dx, pl.y + dy)] !== p + 1;
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
    const [dx, dy] = vsDelta(dir);
    for (let k = 1; k <= VS_SHOT_RANGE; k++) {
      const x = pl.x + dx * k, y = pl.y + dy * k;
      if (!vsInBounds(x, y)) break;
      if (!vsCpuSees({ x: pl.x, y: pl.y, dir }, x, y)) break; // ausserhalb der Sicht
      const hit = (opp.x === x && opp.y === y) || s.trail[vsIdx(x, y)] === 1 ||
        s.guards.some(g => !g.deadUntil && g.x === x && g.y === y);
      if (hit) { pl.dir = dir; vsShoot(s, p, now); break; }
    }
  }

  function vsHostStartMatch() {
    vsState = vsNewState();
    vsPlayed = 0;
    vsCpuPlan = { phase: 'home', count: 0, len: 0 };
    vsCpuGuardSeenAt = -1e9;
    if (!vsCpu) Net.send({ t: 'start' });
    vsBeginLoop();
  }

  // --- Nachrichten ---
  function vsOnMessage(msg) {
    if (vsIsHost) {
      if (!vsState) return;
      const pl = vsState.players[1];
      if (msg.t === 'dir') vsApplyDir(pl, msg.d);
      else if (msg.t === 'shoot') vsShoot(vsState, 1, performance.now());
      else if (msg.t === 'rematch' && vsState.over) vsHostStartMatch();
    } else {
      if (msg.t === 'start') { vsState = null; vsBeginLoop(); }
      else if (msg.t === 'state') {
        vsState = vsUnpack(msg);
        (msg.events || []).forEach(vsPlayEvent);
      }
    }
  }

  // Beim Gast: Restzeiten wieder in lokale Zeitstempel umrechnen
  function vsUnpack(msg) {
    const now = performance.now();
    return {
      land: Array.from(msg.land, Number), trail: Array.from(msg.trail, Number),
      players: msg.players.map(pl => ({ x: pl.x, y: pl.y, lives: pl.lives, inv: pl.inv,
        speedUntil: now + pl.speed, slowUntil: now + pl.slow, shieldUntil: now + pl.shield, rapidUntil: now + pl.rapid })),
      guards: msg.guards.map(g => ({ x: g[0], y: g[1], deadUntil: g[2], hunting: !!g[3],
        stunUntil: g[4] ? now + 300 : 0, breakUntil: g[5] ? now + 300 : 0, pers: g[6], name: g[7] })),
      powerUps: msg.powerUps.map(u => ({ x: u[0], y: u[1], type: u[2], kind: u[3] })),
      freezeUntil: now + msg.freeze,
      events: [],
      timeLeft: msg.timeLeft, countdown: msg.countdown, over: msg.over, pct: msg.pct,
    };
  }

  function vsApplyDir(pl, d) {
    if (!['up', 'down', 'left', 'right'].includes(d)) return;
    const back = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (pl.trail.length && pl.dir === back[d]) return; // nicht in die eigene Linie umdrehen
    pl.next = d;
    pl.lastDir = d;
  }

  // --- Eingaben (ersetzen die 1-Spieler-Handler, solange Versus aktiv ist) ---
  function vsInputDir(d) {
    ensureAudio(); // der Gast kommt per QR-Link und hat evtl. noch nie getippt
    if (!vsPlaying) return;
    if (vsIsHost) vsApplyDir(vsState.players[0], d);
    else Net.send({ t: 'dir', d });
  }

  function vsInputShoot() {
    ensureAudio();
    if (!vsPlaying) return;
    if (vsIsHost) vsShoot(vsState, 0, performance.now());
    else Net.send({ t: 'shoot' });
  }

  // --- Schleife ---
  function vsBeginLoop() {
    vsPlaying = true;
    vsHidePanel();
    document.getElementById('overlay').classList.add('hidden');
    vsEnterRender();
    // Countdown des 1-Spieler-Modus (Anzeige in draw(), Piepser) plus Sprachausgabe
    triggerStartCountdown();
    vsSpeakCountdown();
    vsShownOver = false;
    vsLastTime = 0;
    cancelAnimationFrame(vsRaf);
    vsRaf = requestAnimationFrame(vsLoop);
  }

  function vsStopLoop() {
    vsPlaying = false;
    cancelAnimationFrame(vsRaf);
  }

  let vsShownOver = false;
  function vsLoop(time) {
    if (!vsPlaying) return;
    if (!vsLastTime) vsLastTime = time;
    const delta = Math.min(time - vsLastTime, MAX_FRAME_DELTA);
    vsLastTime = time;
    if (vsIsHost && vsState) {
      vsHostTick(delta, performance.now());
      // Eigene Effekte sofort zeigen, verschickt werden sie mit dem naechsten Zustand
      vsState.events.slice(vsPlayed).forEach(vsPlayEvent);
      vsPlayed = vsState.events.length;
      vsSendTimer += delta;
      if (vsSendTimer >= VS_SEND_MS || vsState.over) {
        vsSendTimer = 0;
        if (!vsCpu) Net.send(vsSnapshot(vsState));
        vsState.events = [];
        vsPlayed = 0;
      }
    }
    if (vsState && !vsState.over && !(vsState.countdown > 0)) updateMusicScheduler();
    vsDraw(performance.now());
    const over = vsState && vsState.over;
    if (over && !vsShownOver) { vsShownOver = true; setTimeout(vsShowResult, 900); }
    vsRaf = requestAnimationFrame(vsLoop);
  }

  function vsShowResult() {
    const over = vsState && vsState.over;
    if (!over || !vsActive) return;
    const title = over.winner === -1 ? 'Draw!' : (over.winner === vsMe ? 'You win! 🏆' : 'You lose 💀');
    const pct = vsState.pct || [vsPct(vsState, 0), vsPct(vsState, 1)];
    const text = 'Reason: ' + over.reason + '\nYou ' + pct[vsMe] + '%  ·  Rival ' + pct[1 - vsMe] + '%';
    const buttons = [{ label: '🔁 Rematch', primary: true, onClick: () => {
      if (vsIsHost) vsHostStartMatch();
      else { Net.send({ t: 'rematch' }); vsSetStatus('Waiting for host...'); }
    } }, { label: 'Leave', onClick: vsLeave }];
    vsShowPanel(title, text, buttons, false);
    vsSetStatus('');
  }

  // --- Zeichnen: nutzt draw() aus render.js ---
  // Der Versus-Zustand wird in die globalen 1-Spieler-Variablen gespiegelt, damit
  // Feld, Figur, Waechter und Axt genau gleich aussehen wie im 1-Spieler-Modus.
  // Den Gegner zeichnet vsDrawWorld() dazu (Hook am Ende von draw()).
  let vsGuardObjs = [];
  let vsRival = null;
  let vsSaved = null;       // waehrend des Matches ueberschriebene Einstellungen
  let vsHud = {};
  const VS_STAT_LABELS = ['YOU', 'RIVAL', 'TIME', 'LIVES'];

  function vsEnterRender() {
    if (!vsSaved) {
      const stats = Array.from(document.querySelectorAll('.topbar .stat'));
      vsSaved = { cameraMode, labels: stats.map(el => el.firstChild.nodeValue) };
      stats.forEach((el, i) => { el.firstChild.nodeValue = VS_STAT_LABELS[i]; });
    }
    cameraMode = 'standard';
    // Reste eines 1-Spieler-Laufs abschalten
    perks = defaultPerks();
    shieldUntil = speedUntil = freezeUntil = confuseUntil = fogUntil = alarmUntil = 0;
    trailGuardUntil = rapidfireUntil = spikesUntil = slowUntil = swarmUntil = 0;
    drunkUntil = psyloUntil = duckUntil = heliumUntil = discoUntil = smokeUntil = 0;
    bananaSlide = 0; hookAnim = null; killCam = null;
    powerUps = []; swarmEnemies = []; decoys = []; bananaPeels = []; movingBlocks = [];
    bonusCells = []; flashCells = []; guardBubbles = []; enemyDeathAnims = []; shotProjectiles = [];
    nearMissPopups = []; comboPopups = []; revealPopups = []; milestonePopups = []; emotePopups = [];
    fireworkParticles = []; dustParticles = []; smokeParticles = []; bgRipples = [];
    countdownActive = false; dying = false; gameOver = false; paused = false;
    playerInterval = VS_STEP_MS; enemyInterval = VS_GUARD_MS;
    level = 1;
    hasStarted = true;   // Titelmelodie aus, Spielmusik wie im 1-Spieler-Modus
    resetMusicTiming();
    enemies = []; vsGuardObjs = []; vsRival = null; vsHud = {};
    px = py = prevPx = prevPy = -99; // erste Position ohne Gleiten uebernehmen
    versusRender = true;
  }

  function vsExitRender() {
    versusRender = false;
    if (!vsSaved) return;
    cameraMode = vsSaved.cameraMode;
    document.querySelectorAll('.topbar .stat').forEach((el, i) => { el.firstChild.nodeValue = vsSaved.labels[i]; });
    vsSaved = null;
    hasStarted = false; // zurueck im Menue: Titelmelodie wieder an
    resetMenuThemeTiming();
    shieldUntil = speedUntil = slowUntil = rapidfireUntil = freezeUntil = 0;
    enemies = []; powerUps = []; revealPopups = []; guardBubbles = [];
    shotProjectiles = []; enemyDeathAnims = []; trail = [];
    initGrid();
    px = Math.floor(COLS / 2); py = 0; prevPx = px; prevPy = py;
    draw(performance.now());
  }

  function vsInvul(pl, now) { return typeof pl.inv === 'boolean' ? pl.inv : now < pl.inv; }

  const VS_DIRS = { '0,-1': 'up', '0,1': 'down', '-1,0': 'left', '1,0': 'right' };

  function vsSyncRender(now) {
    const s = vsState, me = vsMe;
    let myTrail = 0, rivalTrail = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = vsIdx(c, r), t = s.trail[i], l = s.land[i];
      if (t === me + 1) myTrail++; else if (t) rivalTrail++;
      grid[r][c] = t ? (t === me + 1 ? TRAIL : RIVAL_TRAIL) : l ? (l === me + 1 ? TERRITORY : RIVAL_TERRITORY) : EMPTY;
    }
    trail = new Array(myTrail);

    // Eigene Figur: Schritt erkennen und wie im 1-Spieler-Modus gleiten lassen
    const mp = s.players[me];
    if (mp.x !== px || mp.y !== py) {
      const jump = Math.abs(mp.x - px) + Math.abs(mp.y - py) > 1;
      const d = VS_DIRS[(mp.x - px) + ',' + (mp.y - py)];
      if (d) dir = d;
      else if (jump && px === -99) dir = me === 0 ? 'down' : 'up';
      prevPx = jump ? mp.x : px; prevPy = jump ? mp.y : py;
      px = mp.x; py = mp.y;
      playerStepTime = now;
    }
    // Schildring waehrend der Schonzeit oder mit Schild-Power-up
    shieldUntil = Math.max(vsInvul(mp, now) ? now + 1000 : 0, mp.shieldUntil);
    speedUntil = mp.speedUntil; slowUntil = mp.slowUntil; rapidfireUntil = mp.rapidUntil;
    freezeUntil = s.freezeUntil;

    // Gegner
    const rp = s.players[1 - me];
    if (!vsRival) {
      const h = me === 0 ? -Math.PI / 2 : Math.PI / 2;
      vsRival = { x: rp.x, y: rp.y, prevX: rp.x, prevY: rp.y, stepTime: 0, heading: h, headingDisp: h, lastDraw: now };
    } else if (rp.x !== vsRival.x || rp.y !== vsRival.y) {
      const dx = rp.x - vsRival.x, dy = rp.y - vsRival.y;
      const jump = Math.abs(dx) + Math.abs(dy) > 1;
      if (!jump) vsRival.heading = Math.atan2(dy, dx);
      vsRival.prevX = jump ? rp.x : vsRival.x; vsRival.prevY = jump ? rp.y : vsRival.y;
      vsRival.x = rp.x; vsRival.y = rp.y;
      vsRival.stepTime = now;
    }
    vsRival.inv = vsInvul(rp, now) || now < rp.shieldUntil;
    vsRival.iv = vsPlayerInterval(rp, now);
    vsRival.fast = now < rp.speedUntil;
    vsRival.trailLen = rivalTrail;

    // Waechter: feste Objekte je Index, damit sie gleiten statt springen
    const alive = [], movedNow = [];
    s.guards.forEach((g, i) => {
      if (g.deadUntil) { vsGuardObjs[i] = null; return; }
      let e = vsGuardObjs[i];
      const pers = BASE_PERSONALITIES[g.pers] || 'wanderer', name = GUARD_NAMES[g.name] || 'Bob';
      if (e && (e.personality !== pers || e.name !== name)) e = null; // neu gespawnt
      if (!e) {
        e = { r: g.y, c: g.x, prevR: g.y, prevC: g.x, personality: pers, name,
          dc0: 1, dr0: 0, angleDisp: undefined, wasHunting: false, huntingActive: false,
          huntCooldownUntil: 0, lastSeenAt: -99999 };
        vsGuardObjs[i] = e;
      } else if (e.c !== g.x || e.r !== g.y) {
        e.dc0 = Math.sign(g.x - e.c); e.dr0 = Math.sign(g.y - e.r);
        e.prevC = e.c; e.prevR = e.r; e.c = g.x; e.r = g.y;
        movedNow.push(e);
      }
      e.huntingActive = g.hunting;
      e.stunnedUntil = g.stunUntil;
      e.breakUntil = g.breakUntil;
      alive.push(e);
    });
    if (movedNow.length) {
      enemyStepTime = now;
      alive.forEach(e => { if (!movedNow.includes(e)) { e.prevC = e.c; e.prevR = e.r; } });
    }
    enemies = alive;

    // Power-ups: bestehende Objekte behalten, damit die Einblend-Animation nicht neu startet
    powerUps = s.powerUps.map(u => powerUps.find(o => o.c === u.x && o.r === u.y && o.type === u.type) ||
      { r: u.y, c: u.x, type: u.type, kind: u.kind, spawnTime: now });

    // Anzeige oben
    const pct = s.pct || [vsPct(s, 0), vsPct(s, 1)];
    const secs = Math.max(0, Math.ceil(s.timeLeft / 1000));
    vsSetHud('pct', pct[me] + '%');
    vsSetHud('score', pct[1 - me] + '%');
    vsSetHud('level', Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'));
    vsSetHud('lives', String(Math.max(0, mp.lives)));
  }

  function vsSetHud(id, text) {
    if (vsHud[id] === text) return;
    vsHud[id] = text;
    document.getElementById(id).textContent = text;
  }

  function vsPlayEvent(ev) {
    const now = performance.now();
    if (ev.t === 'shot') {
      shotProjectiles.push({
        pts: ev.path.map(([x, y]) => [x * CELL + CELL / 2, y * CELL + CELL / 2]),
        startTime: now, life: 220 + (ev.path.length > 2 ? 140 : 0)
      });
      sndShoot();
    } else if (ev.t === 'guardDown') {
      const pers = BASE_PERSONALITIES[ev.pers] || 'wanderer';
      enemyDeathAnims.push({ r: ev.y, c: ev.x, kind: 'shot', dx: ev.dx, dy: ev.dy,
        color: PERSONALITY_COLORS[pers] || '#e3574a', startTime: now });
      sndEnemyDeath();
      triggerShake(6, 220);
    } else if (ev.t === 'say') {
      const e = vsGuardObjs[ev.i];
      if (e) guardShout(e, ev.text);
    } else if (ev.t === 'alert') {
      sndHunterAlert();
    } else if (ev.t === 'break') {
      sndCoffeeBreak();
    } else if (ev.t === 'cut') {
      ev.cells.forEach(i => flashCells.push({ r: Math.floor(i / COLS), c: i % COLS, time: now }));
      const last = ev.cells[ev.cells.length - 1];
      milestonePopups.push({ x: last % COLS, y: Math.floor(last / COLS), text: '✂️ Line cut!', startTime: now });
      sndLineCut();
      triggerShake(5, 200);
      if (ev.p === vsMe) vibrate([40, 30, 40]);
    } else if (ev.t === 'pick') {
      revealPopups.push({ x: ev.x, y: ev.y, type: ev.type, kind: ev.kind,
        startTime: now, resolveAt: now + ROULETTE_MS, applied: true, lastTickIdx: -1 });
      if (ev.p === vsMe) { if (ev.kind === 'down') sndPowerDown(ev.type); else sndPowerUp(ev.type); }
    } else if (ev.t === 'hit') {
      triggerShake(8, 300);
      if (ev.p === vsMe) { triggerDeathFlash(); vibrate(150); }
    }
  }

  function vsDraw(now) {
    if (!vsState) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0d1410';
      ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
      ctx.fillStyle = '#7fe0a0';
      ctx.font = '600 ' + Math.round(CELL * 0.7) + 'px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Waiting for host...', boardCanvas.width / 2, boardCanvas.height / 2);
      ctx.restore();
      return;
    }
    vsSyncRender(now);
    draw(now);
  }

  // Wird von draw() im Weltkoordinatensystem aufgerufen
  function vsDrawWorld(now) {
    const rv = vsRival;
    if (!rv) return;
    const dt = Math.min(120, Math.max(0, now - rv.lastDraw));
    rv.lastDraw = now;
    rv.headingDisp = easeAngle(rv.headingDisp, rv.heading, dt, 52);
    const t = Math.min(1, (now - rv.stepTime) / (rv.iv || VS_STEP_MS));
    const cx = (rv.prevX + (rv.x - rv.prevX) * t) * CELL + CELL / 2;
    const cy = (rv.prevY + (rv.y - rv.prevY) * t) * CELL + CELL / 2;
    const R = CELL * 0.38;
    const bounce = Math.sin(t * Math.PI);
    const h = rv.headingDisp;

    if (vsCpu) vsDrawCpuCone(cx, cy, h);

    if (rv.inv) {
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.52, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(79,126,229,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(h);
    ctx.scale(1 + bounce * 0.18, 1 - bounce * 0.13);
    ctx.rotate(-h);
    ctx.fillStyle = rv.fast ? '#f5d347' : '#8cc4ff';
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // Gesicht wie beim Spieler: entschlossen mit Linie, sonst entspannt
    drawPlayerFace(R, rv.trailLen > 0 ? 'determined' : 'relaxed', Math.cos(h) * 0.5, Math.sin(h) * 0.5);
    ctx.restore();

    // Namensschilder
    const pt = Math.min(1, (now - playerStepTime) / currentPlayerInterval());
    const mx = (prevPx + (px - prevPx) * pt) * CELL + CELL / 2;
    const my = (prevPy + (py - prevPy) * pt) * CELL + CELL / 2;
    ctx.save();
    ctx.font = '700 ' + Math.max(9, Math.round(CELL * 0.34)) + 'px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    const rivalLabel = vsCpu ? 'CPU' : 'RIVAL';
    ctx.strokeText(rivalLabel, cx, cy - CELL * 0.7);
    ctx.fillStyle = '#8cc4ff';
    ctx.fillText(rivalLabel, cx, cy - CELL * 0.7);
    ctx.strokeText('YOU', mx, my - CELL * 0.7);
    ctx.fillStyle = '#7fe0a0';
    ctx.fillText('YOU', mx, my - CELL * 0.7);
    ctx.restore();
  }

  // Sichtkegel der CPU, gleiche Geometrie wie bei den Waechtern, aber blau
  function vsDrawCpuCone(cx, cy, heading) {
    const ox = cx / CELL, oy = cy / CELL;
    const view = { personality: 'wanderer', angleDisp: heading, c: Math.floor(ox), r: Math.floor(oy) };
    const radius = visionRange(view) * CELL;
    const g = ctx.createRadialGradient(cx, cy, CELL * 0.3, cx, cy, radius);
    g.addColorStop(0, 'rgba(120,180,255,0.20)');
    g.addColorStop(1, 'rgba(120,180,255,0)');
    const poly = visionPolygon(view, ox, oy);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(poly[0][0] * CELL, poly[0][1] * CELL);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0] * CELL, poly[i][1] * CELL);
    ctx.closePath();
    ctx.moveTo(cx + NEAR_SIGHT * CELL, cy);
    ctx.arc(cx, cy, NEAR_SIGHT * CELL, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,196,255,0.25)';
    ctx.lineWidth = Math.max(1, CELL * 0.035);
    ctx.stroke();
    ctx.restore();
  }

  const VS_COUNTDOWN_WORDS = ['Three', 'Two', 'One', 'Go!'];
  function vsSpeakCountdown() {
    if (voiceMode === 'off' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    speechSynthesis.cancel();
    VS_COUNTDOWN_WORDS.forEach((word, i) => setTimeout(() => {
      if (!vsPlaying) return;
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US';
      u.rate = 1.3;
      u.pitch = i === VS_COUNTDOWN_WORDS.length - 1 ? 1.3 : 1;
      speechSynthesis.speak(u);
    }, i * COUNTDOWN_STEP_MS));
  }

  // --- Einhaengen in das bestehende Spiel ---
  (function vsHook() {
    const origSetDir = setDir, origShoot = shoot, origUseGadget = useGadget,
      origUseBoost = useBoost, origTogglePause = togglePause, origOpenQuit = openQuitConfirm,
      origOpenModeSelect = openModeSelect, origHideOverlay = hideOverlay;
    setDir = function (d) { if (vsActive) vsInputDir(d); else origSetDir(d); };
    shoot = function () { if (vsActive) vsInputShoot(); else origShoot(); };
    useGadget = function () { if (!vsActive) origUseGadget(); };
    useBoost = function () { if (!vsActive) origUseBoost(); };
    togglePause = function () { if (!vsActive) origTogglePause(); };
    openQuitConfirm = function () {
      if (!vsActive) { origOpenQuit(); return; }
      if (window.confirm('Leave the 2 player match?')) vsLeave();
    };
    openModeSelect = function () {
      origOpenModeSelect();
      document.getElementById('vsBtn').classList.remove('hidden');
    };
    hideOverlay = function () {
      document.getElementById('vsBtn').classList.add('hidden');
      origHideOverlay();
    };
    document.getElementById('vsBtn').addEventListener('click', () => {
      ensureAudio();
      modeSelectOpen = false;
      document.getElementById('modeSelect').classList.add('hidden');
      vsOpenLobby();
    });

    // Per QR-Code geoeffnet: direkt beitreten
    const room = Net.roomFromUrl();
    if (room) {
      history.replaceState(null, '', location.pathname + location.search);
      onboardingDone = true;
      vsStartGuest(room);
    }
  })();
