  // --- 2-Spieler-Versus ueber WebRTC (js/net.js) ---
  // Eigene, schlanke Simulation, damit der 1-Spieler-Code unberuehrt bleibt.
  // Der Host rechnet alles, der Gast schickt nur Eingaben und zeichnet den Zustand.

  const VS_COLORS = [
    { head: '#3ecf7a', trail: '#8ff0b4', land: '#1f6b43', name: 'Green' },
    { head: '#4aa3ff', trail: '#a3d0ff', land: '#1f4f80', name: 'Blue' },
  ];
  const VS_STEP_MS = 140;         // Spielerschritt
  const VS_GUARD_MS = 260;        // Waechterschritt
  const VS_SHOT_MS = 45;          // Schuss pro Zelle
  const VS_SHOT_RANGE = 8;
  const VS_SHOT_COOLDOWN = 900;
  const VS_GUARDS = 3;
  const VS_GUARD_RESPAWN = 3000;
  const VS_LIVES = 3;
  const VS_INVULN_MS = 1500;
  const VS_MATCH_MS = 120000;
  const VS_WIN_PCT = 50;
  const VS_COUNTDOWN_MS = 3000;
  const VS_SEND_MS = 50;

  let vsActive = false;      // Versus-Bildschirm aktiv (Lobby oder Match)
  let vsPlaying = false;     // Match laeuft
  let vsIsHost = false;
  let vsMe = 0;              // 0 = Host, 1 = Gast
  let vsState = null;        // beim Host die Wahrheit, beim Gast die letzte Kopie
  let vsRaf = 0, vsLastTime = 0, vsSendTimer = 0;

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
      { label: 'Back', onClick: vsLeave },
    ], false);
    vsSetStatus('To join, scan the host\'s QR code with your camera.');
  }

  function vsStartHost() {
    vsIsHost = true; vsMe = 0;
    vsBindNet();
    const url = Net.joinUrl(Net.host());
    vsShowPanel('2 Player', 'Let your rival scan this code.', [{ label: 'Cancel', onClick: vsLeave }], true);
    QR.draw(document.getElementById('vsQr'), url, 220);
  }

  function vsStartGuest(room) {
    vsActive = true;
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
    vsHidePanel();
    openModeSelect();
  }

  // --- Simulation (nur Host) ---
  function vsIdx(x, y) { return y * COLS + x; }
  function vsInBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

  function vsSpawnCorner(p) {
    return p === 0 ? { x: 1, y: 1 } : { x: COLS - 2, y: ROWS - 2 };
  }

  function vsNewState() {
    const s = {
      land: new Array(COLS * ROWS).fill(0),   // 0 frei, 1 Spieler 0, 2 Spieler 1
      trail: new Array(COLS * ROWS).fill(0),  // 0 keine, 1/2 Linie von Spieler 0/1
      players: [],
      guards: [],
      shots: [],
      timeLeft: VS_MATCH_MS,
      countdown: VS_COUNTDOWN_MS,
      over: null,
      stepT: 0, guardT: 0, shotT: 0,
    };
    for (let p = 0; p < 2; p++) {
      const c = vsSpawnCorner(p);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s.land[vsIdx(c.x + dx, c.y + dy)] = p + 1;
      s.players.push({ x: c.x, y: c.y, dir: null, next: null, lastDir: p === 0 ? 'down' : 'up',
        trail: [], lives: VS_LIVES, inv: 0, shotReady: 0 });
    }
    for (let i = 0; i < VS_GUARDS; i++) s.guards.push(vsNewGuard(s));
    return s;
  }

  function vsNewGuard(s) {
    for (let tries = 0; tries < 200; tries++) {
      const x = 2 + Math.floor(Math.random() * (COLS - 4));
      const y = 4 + Math.floor(Math.random() * (ROWS - 8));
      if (s.land[vsIdx(x, y)] || s.trail[vsIdx(x, y)]) continue;
      if (s.players.some(p => Math.abs(p.x - x) + Math.abs(p.y - y) < 4)) continue;
      return { x, y, dx: Math.random() < 0.5 ? 1 : -1, dy: Math.random() < 0.5 ? 1 : -1, deadUntil: 0 };
    }
    return { x: 0, y: 0, dx: 1, dy: 1, deadUntil: performance.now() + VS_GUARD_RESPAWN };
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
    if (now < pl.inv || s.over) return;
    pl.trail.forEach(i => { s.trail[i] = 0; });
    pl.trail = [];
    pl.lives--;
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
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s.land[vsIdx(c.x + dx, c.y + dy)] = p + 1;
      best = c;
    }
    pl.x = best.x; pl.y = best.y;
    pl.dir = pl.next = null;
    pl.inv = now + VS_INVULN_MS;
    s.flash = { p, until: now + 400 };
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
    const opp = s.players[1 - p];
    if (opp.x === pl.x && opp.y === pl.y) {
      if (!vsOnOwnLand(s, 1 - p)) vsKill(s, 1 - p, now);
      if (!vsOnOwnLand(s, p)) vsKill(s, p, now);
    }
    vsCheckGuardHits(s, now);
  }

  function vsGuardBlocked(s, x, y) { return !vsInBounds(x, y) || s.land[vsIdx(x, y)] !== 0; }

  function vsStepGuards(s, now) {
    s.guards.forEach((g, gi) => {
      if (g.deadUntil) {
        if (now >= g.deadUntil) s.guards[gi] = vsNewGuard(s);
        return;
      }
      if (vsGuardBlocked(s, g.x + g.dx, g.y)) g.dx = -g.dx;
      if (vsGuardBlocked(s, g.x, g.y + g.dy)) g.dy = -g.dy;
      if (vsGuardBlocked(s, g.x + g.dx, g.y + g.dy)) { g.dx = -g.dx; g.dy = -g.dy; }
      if (!vsGuardBlocked(s, g.x + g.dx, g.y + g.dy)) { g.x += g.dx; g.y += g.dy; }
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

  function vsShoot(s, p, now) {
    const pl = s.players[p];
    if (now < pl.shotReady || s.countdown > 0 || s.over) return;
    pl.shotReady = now + VS_SHOT_COOLDOWN;
    const [dx, dy] = vsDelta(pl.dir || pl.lastDir);
    s.shots.push({ x: pl.x, y: pl.y, dx, dy, owner: p, left: VS_SHOT_RANGE });
  }

  function vsStepShots(s, now) {
    s.shots = s.shots.filter(sh => {
      sh.x += sh.dx; sh.y += sh.dy; sh.left--;
      if (!vsInBounds(sh.x, sh.y) || sh.left < 0) return false;
      const opp = 1 - sh.owner, op = s.players[opp];
      const g = s.guards.find(g => !g.deadUntil && g.x === sh.x && g.y === sh.y);
      if (g) { g.deadUntil = now + VS_GUARD_RESPAWN; return false; }
      if ((op.x === sh.x && op.y === sh.y) || s.trail[vsIdx(sh.x, sh.y)] === opp + 1) {
        vsKill(s, opp, now);
        return false;
      }
      return true;
    });
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
    s.stepT += delta; s.guardT += delta; s.shotT += delta;
    while (s.shotT >= VS_SHOT_MS) { s.shotT -= VS_SHOT_MS; vsStepShots(s, now); }
    if (s.stepT >= VS_STEP_MS) {
      s.stepT = Math.min(s.stepT - VS_STEP_MS, VS_STEP_MS);
      vsStepPlayer(s, 0, now);
      vsStepPlayer(s, 1, now);
    }
    if (s.guardT >= VS_GUARD_MS) {
      s.guardT = Math.min(s.guardT - VS_GUARD_MS, VS_GUARD_MS);
      vsStepGuards(s, now);
    }
    if (s.over) return;
    const a = vsPct(s, 0), b = vsPct(s, 1);
    if (a >= VS_WIN_PCT || b >= VS_WIN_PCT) vsEndMatch(s, a >= b ? 0 : 1, VS_WIN_PCT + '% claimed');
    else if (s.timeLeft <= 0) vsEndMatch(s, a === b ? -1 : (a > b ? 0 : 1), 'time is up');
  }

  // Kompakter Zustand fuer den Gast
  function vsSnapshot(s) {
    const now = performance.now();
    return {
      t: 'state',
      land: s.land.join(''),
      trail: s.trail.join(''),
      players: s.players.map(pl => ({ x: pl.x, y: pl.y, lives: pl.lives, inv: now < pl.inv,
        cd: Math.max(0, pl.shotReady - now) })),
      guards: s.guards.filter(g => !g.deadUntil).map(g => [g.x, g.y]),
      shots: s.shots.map(sh => [sh.x, sh.y, sh.owner]),
      timeLeft: s.timeLeft, countdown: s.countdown, over: s.over,
      pct: [vsPct(s, 0), vsPct(s, 1)],
    };
  }

  function vsHostStartMatch() {
    vsState = vsNewState();
    Net.send({ t: 'start' });
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
      else if (msg.t === 'state') vsState = vsUnpack(msg);
    }
  }

  function vsUnpack(msg) {
    return {
      land: Array.from(msg.land, Number), trail: Array.from(msg.trail, Number),
      players: msg.players, guards: msg.guards.map(g => ({ x: g[0], y: g[1] })),
      shots: msg.shots.map(s => ({ x: s[0], y: s[1], owner: s[2] })),
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
    if (!vsPlaying) return;
    if (vsIsHost) vsApplyDir(vsState.players[0], d);
    else Net.send({ t: 'dir', d });
  }

  function vsInputShoot() {
    if (!vsPlaying) return;
    if (vsIsHost) vsShoot(vsState, 0, performance.now());
    else Net.send({ t: 'shoot' });
  }

  // --- Schleife ---
  function vsBeginLoop() {
    vsPlaying = true;
    vsHidePanel();
    document.getElementById('overlay').classList.add('hidden');
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
      vsSendTimer += delta;
      if (vsSendTimer >= VS_SEND_MS || vsState.over) {
        vsSendTimer = 0;
        Net.send(vsSnapshot(vsState));
      }
    }
    vsDraw();
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

  // --- Zeichnen ---
  function vsDraw() {
    const w = boardCanvas.width, h = boardCanvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1410';
    ctx.fillRect(0, 0, w, h);
    const s = vsState;
    if (!s) {
      ctx.fillStyle = '#7fe0a0';
      ctx.font = '600 ' + Math.round(CELL * 0.7) + 'px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for host...', w / 2, h / 2);
      ctx.restore();
      return;
    }
    // Gitter
    ctx.strokeStyle = 'rgba(127,224,160,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, h); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(w, y * CELL + 0.5); ctx.stroke(); }
    // Land und Linien
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = vsIdx(x, y);
      if (s.land[i]) {
        ctx.fillStyle = VS_COLORS[s.land[i] - 1].land;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
      if (s.trail[i]) {
        ctx.fillStyle = VS_COLORS[s.trail[i] - 1].trail;
        const m = CELL * 0.25;
        ctx.fillRect(x * CELL + m, y * CELL + m, CELL - 2 * m, CELL - 2 * m);
      }
    }
    // Waechter
    s.guards.forEach(g => {
      ctx.fillStyle = '#e3574a';
      ctx.beginPath(); ctx.arc((g.x + 0.5) * CELL, (g.y + 0.5) * CELL, CELL * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc((g.x + 0.5) * CELL, (g.y + 0.42) * CELL, CELL * 0.1, 0, Math.PI * 2); ctx.fill();
    });
    // Schuesse
    s.shots.forEach(sh => {
      ctx.fillStyle = '#ffe36b';
      ctx.beginPath(); ctx.arc((sh.x + 0.5) * CELL, (sh.y + 0.5) * CELL, CELL * 0.15, 0, Math.PI * 2); ctx.fill();
    });
    // Spieler
    const now = performance.now();
    const players = s.players.map(pl => ({ x: pl.x, y: pl.y, lives: pl.lives,
      inv: typeof pl.inv === 'boolean' ? pl.inv : now < pl.inv }));
    players.forEach((pl, p) => {
      if (pl.inv && Math.floor(now / 120) % 2) return; // blinken nach Treffer
      const cx = (pl.x + 0.5) * CELL, cy = (pl.y + 0.5) * CELL;
      ctx.fillStyle = VS_COLORS[p].head;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1.5, CELL * 0.08);
      ctx.fillRect(pl.x * CELL + CELL * 0.12, pl.y * CELL + CELL * 0.12, CELL * 0.76, CELL * 0.76);
      ctx.strokeRect(pl.x * CELL + CELL * 0.12, pl.y * CELL + CELL * 0.12, CELL * 0.76, CELL * 0.76);
      if (p === vsMe) {
        ctx.fillStyle = '#fff';
        ctx.font = '700 ' + Math.round(CELL * 0.42) + 'px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('YOU', cx, cy - CELL * 0.6);
      }
    });
    // Anzeige oben
    const pct = s.pct || [vsPct(s, 0), vsPct(s, 1)];
    const me = vsMe, opp = 1 - vsMe;
    const barH = Math.round(CELL * 0.9);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, barH);
    ctx.font = '700 ' + Math.round(barH * 0.5) + 'px "Space Grotesk", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = VS_COLORS[me].head;
    ctx.fillText('YOU ' + pct[me] + '%  ' + '♥'.repeat(Math.max(0, players[me].lives)), 6, barH / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = VS_COLORS[opp].head;
    ctx.fillText('♥'.repeat(Math.max(0, players[opp].lives)) + '  ' + pct[opp] + '% RIVAL', w - 6, barH / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    const secs = Math.max(0, Math.ceil(s.timeLeft / 1000));
    ctx.fillText(Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'), w / 2, barH / 2);
    // Countdown
    if (s.countdown > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '800 ' + Math.round(CELL * 3) + 'px Orbitron, sans-serif';
      ctx.fillText(String(Math.ceil(s.countdown / 1000)), w / 2, h / 2);
      ctx.font = '600 ' + Math.round(CELL * 0.6) + 'px "Space Grotesk", sans-serif';
      ctx.fillStyle = VS_COLORS[me].head;
      ctx.fillText('You are ' + VS_COLORS[me].name, w / 2, h / 2 + CELL * 2);
    }
    ctx.restore();
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
