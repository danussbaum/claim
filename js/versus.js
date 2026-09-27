  // --- 2-Spieler-Versus ueber WebRTC (js/net.js) ---
  // Eigene, schlanke Simulation, damit die 1-Spieler-Logik unberuehrt bleibt.
  // Gezeichnet wird trotzdem mit draw() aus render.js (siehe vsSyncRender).
  // Der Host rechnet alles, der Gast schickt nur Eingaben und zeichnet den Zustand.

  const VS_STEP_MS = 170;         // Spielerschritt
  const VS_GUARD_MS = 260;        // Waechterschritt
  const VS_SHOT_RANGE = 8;
  const VS_SHOT_COOLDOWN = 900;
  const VS_GUARDS = 3;
  const VS_GUARD_RESPAWN = 3000;
  const VS_LIVES = 3;
  const VS_INVULN_MS = 1500;
  const VS_MATCH_MS = 120000;
  const VS_WIN_PCT = 50;
  const VS_COUNTDOWN_MS = 3000;
  const VS_SEND_MS = 33;

  let vsActive = false;      // Versus-Bildschirm aktiv (Lobby oder Match)
  let vsPlaying = false;     // Match laeuft
  let vsIsHost = false;
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
    vsExitRender();
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
      events: [],             // Schuesse usw. fuer die Darstellung, werden mit dem Zustand verschickt
      timeLeft: VS_MATCH_MS,
      countdown: VS_COUNTDOWN_MS,
      over: null,
      stepT: 0, guardT: 0,
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
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s.land[vsIdx(c.x + dx, c.y + dy)] = p + 1;
      best = c;
    }
    pl.x = best.x; pl.y = best.y;
    pl.dir = pl.next = null;
    pl.inv = now + VS_INVULN_MS;
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

  // Wie im 1-Spieler-Modus trifft der Schuss sofort; die Axt fliegt nur als Animation.
  function vsShoot(s, p, now) {
    const pl = s.players[p];
    if (now < pl.shotReady || s.countdown > 0 || s.over) return;
    pl.shotReady = now + VS_SHOT_COOLDOWN;
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
        s.events.push({ t: 'guardDown', x, y, dx, dy, i: s.guards.indexOf(g) });
        break;
      }
      if ((op.x === x && op.y === y) || s.trail[vsIdx(x, y)] === opp + 1) {
        vsKill(s, opp, now);
        break;
      }
    }
    s.events.push({ t: 'shot', path });
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
    s.stepT += delta; s.guardT += delta;
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
      guards: s.guards.map(g => [g.x, g.y, g.deadUntil ? 1 : 0]),
      events: s.events,
      timeLeft: s.timeLeft, countdown: s.countdown, over: s.over,
      pct: [vsPct(s, 0), vsPct(s, 1)],
    };
  }

  function vsHostStartMatch() {
    vsState = vsNewState();
    vsPlayed = 0;
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
      else if (msg.t === 'state') {
        vsState = vsUnpack(msg);
        (msg.events || []).forEach(vsPlayEvent);
      }
    }
  }

  function vsUnpack(msg) {
    return {
      land: Array.from(msg.land, Number), trail: Array.from(msg.trail, Number),
      players: msg.players, guards: msg.guards.map(g => ({ x: g[0], y: g[1], deadUntil: g[2] })),
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
        Net.send(vsSnapshot(vsState));
        vsState.events = [];
        vsPlayed = 0;
      }
    }
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
    if (!perks) perks = defaultPerks();
    // Reste eines 1-Spieler-Laufs abschalten
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
    shieldUntil = 0; enemies = []; shotProjectiles = []; enemyDeathAnims = []; trail = [];
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
    shieldUntil = vsInvul(mp, now) ? now + 1000 : 0; // Schildring waehrend der Schonzeit

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
    vsRival.inv = vsInvul(rp, now);
    vsRival.trailLen = rivalTrail;

    // Waechter: feste Objekte je Index, damit sie gleiten statt springen
    const alive = [], movedNow = [];
    s.guards.forEach((g, i) => {
      if (g.deadUntil) { vsGuardObjs[i] = null; return; }
      let e = vsGuardObjs[i];
      if (!e) {
        const pers = BASE_PERSONALITIES[i % BASE_PERSONALITIES.length];
        e = { r: g.y, c: g.x, prevR: g.y, prevC: g.x, personality: pers, name: guardName(pers),
          dc0: 1, dr0: 0, angleDisp: undefined, wasHunting: false, huntingActive: false,
          huntCooldownUntil: 0, lastSeenAt: -99999 };
        vsGuardObjs[i] = e;
      } else if (e.c !== g.x || e.r !== g.y) {
        e.dc0 = Math.sign(g.x - e.c); e.dr0 = Math.sign(g.y - e.r);
        e.prevC = e.c; e.prevR = e.r; e.c = g.x; e.r = g.y;
        movedNow.push(e);
      }
      alive.push(e);
    });
    if (movedNow.length) {
      enemyStepTime = now;
      alive.forEach(e => { if (!movedNow.includes(e)) { e.prevC = e.c; e.prevR = e.r; } });
    }
    enemies = alive;

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
      const pers = BASE_PERSONALITIES[ev.i % BASE_PERSONALITIES.length];
      enemyDeathAnims.push({ r: ev.y, c: ev.x, kind: 'shot', dx: ev.dx, dy: ev.dy,
        color: PERSONALITY_COLORS[pers] || '#e3574a', startTime: now });
      sndEnemyDeath();
      triggerShake(6, 220);
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
    vsDrawCountdown();
  }

  // Wird von draw() im Weltkoordinatensystem aufgerufen
  function vsDrawWorld(now) {
    const rv = vsRival;
    if (!rv) return;
    const dt = Math.min(120, Math.max(0, now - rv.lastDraw));
    rv.lastDraw = now;
    rv.headingDisp = easeAngle(rv.headingDisp, rv.heading, dt, 52);
    const t = Math.min(1, (now - rv.stepTime) / VS_STEP_MS);
    const cx = (rv.prevX + (rv.x - rv.prevX) * t) * CELL + CELL / 2;
    const cy = (rv.prevY + (rv.y - rv.prevY) * t) * CELL + CELL / 2;
    const R = CELL * 0.38;
    const bounce = Math.sin(t * Math.PI);
    const h = rv.headingDisp;

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
    ctx.fillStyle = '#8cc4ff';
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // Gesicht wie beim Spieler: entschlossen mit Linie, sonst entspannt
    const eyeOffX = R * 0.36, eyeOffY = -R * 0.06;
    const lookX = Math.cos(h) * 0.5, lookY = Math.sin(h) * 0.5;
    const determined = rv.trailLen > 0;
    const eyeR = determined ? R * 0.2 : R * 0.22;
    for (const side of [-1, 1]) {
      const exx = side * eyeOffX;
      ctx.beginPath();
      ctx.arc(exx, eyeOffY, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(exx + lookX * eyeR * 0.5, eyeOffY + lookY * eyeR * 0.5, eyeR * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = '#101414';
      ctx.fill();
    }
    ctx.strokeStyle = '#101414';
    ctx.lineWidth = Math.max(1.3, R * 0.1);
    ctx.lineCap = 'round';
    if (determined) {
      ctx.beginPath();
      ctx.moveTo(-eyeOffX - R * 0.18, eyeOffY - R * 0.32);
      ctx.lineTo(-eyeOffX + R * 0.15, eyeOffY - R * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(eyeOffX + R * 0.18, eyeOffY - R * 0.32);
      ctx.lineTo(eyeOffX - R * 0.15, eyeOffY - R * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-R * 0.16, R * 0.4);
      ctx.lineTo(R * 0.16, R * 0.4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, R * 0.28, R * 0.22, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();

    // Namensschilder
    const pt = Math.min(1, (now - playerStepTime) / VS_STEP_MS);
    const mx = (prevPx + (px - prevPx) * pt) * CELL + CELL / 2;
    const my = (prevPy + (py - prevPy) * pt) * CELL + CELL / 2;
    ctx.save();
    ctx.font = '700 ' + Math.max(9, Math.round(CELL * 0.34)) + 'px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText('RIVAL', cx, cy - CELL * 0.7);
    ctx.fillStyle = '#8cc4ff';
    ctx.fillText('RIVAL', cx, cy - CELL * 0.7);
    ctx.strokeText('YOU', mx, my - CELL * 0.7);
    ctx.fillStyle = '#7fe0a0';
    ctx.fillText('YOU', mx, my - CELL * 0.7);
    ctx.restore();
  }

  function vsDrawCountdown() {
    const s = vsState;
    if (!s || s.countdown <= 0) return;
    const w = boardCanvas.width, h = boardCanvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = '800 ' + Math.round(CELL * 3) + 'px Orbitron, sans-serif';
    ctx.fillText(String(Math.ceil(s.countdown / 1000)), w / 2, h / 2);
    ctx.font = '600 ' + Math.round(CELL * 0.6) + 'px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#7fe0a0';
    ctx.fillText('You are green', w / 2, h / 2 + CELL * 2);
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
