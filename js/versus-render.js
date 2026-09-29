// 2-Spieler-Versus: Darstellung. Spiegelt den Zustand in die 1-Spieler-Variablen und
// nutzt draw() aus render.js. Laedt vor versus.js.

  // --- Zeichnen: nutzt draw() aus render.js ---
  // Der Versus-Zustand wird in die globalen 1-Spieler-Variablen gespiegelt, damit
  // Feld, Figur, Waechter und Axt genau gleich aussehen wie im 1-Spieler-Modus.
  // Den Gegner zeichnet vsDrawWorld() dazu (Hook am Ende von draw()).
  let vsGuardObjs = [];
  let vsWasStunned = false;
  let vsRival = null;
  let vsSaved = null;       // waehrend des Matches ueberschriebene Einstellungen
  let vsHud = {};
  const VS_STAT_LABELS = ['YOU', 'RIVAL', 'TIME', 'MATCHES']; // statt Leben: Stand der Serie

  function vsEnterRender() {
    if (!vsSaved) {
      const stats = Array.from(document.querySelectorAll('.topbar .stat'));
      vsSaved = { cameraMode, labels: stats.map(el => el.firstChild.nodeValue) };
      stats.forEach((el, i) => {
        if (i < VS_STAT_LABELS.length) el.firstChild.nodeValue = VS_STAT_LABELS[i];
        else el.style.display = 'none';
      });
    }
    cameraMode = 'standard';
    // Reste eines 1-Spieler-Laufs abschalten
    perks = defaultPerks();
    shieldUntil = speedUntil = freezeUntil = confuseUntil = fogUntil = alarmUntil = 0;
    trailGuardUntil = rapidfireUntil = spikesUntil = slowUntil = swarmUntil = 0;
    drunkUntil = psyloUntil = duckUntil = heliumUntil = discoUntil = smokeUntil = 0;
    bananaSlide = 0; hookAnim = null; killCam = null;
    powerUps = []; swarmEnemies = []; decoys = []; mines = []; bananaPeels = []; movingBlocks = [];
    bonusCells = []; flashCells = []; guardBubbles = []; enemyDeathAnims = []; shotProjectiles = [];
    nearMissPopups = []; comboPopups = []; revealPopups = []; milestonePopups = []; emotePopups = [];
    fireworkParticles = []; sparkParticles = []; dustParticles = []; smokeParticles = []; bgRipples = [];
    countdownActive = false; dying = false; gameOver = false; paused = false;
    playerInterval = VS_STEP_MS; enemyInterval = VS_GUARD_MS;
    level = 1;
    setInGame(true);   // Titelmelodie aus, Spielmusik wie im 1-Spieler-Modus
    resetMusicTiming();
    enemies = []; vsGuardObjs = []; vsRival = null; vsHud = {};
    px = py = prevPx = prevPy = -99; // erste Position ohne Gleiten uebernehmen
    versusRender = true;
  }

  function vsExitRender() {
    versusRender = false;
    if (!vsSaved) return;
    cameraMode = vsSaved.cameraMode;
    document.querySelectorAll('.topbar .stat').forEach((el, i) => {
      el.firstChild.nodeValue = vsSaved.labels[i];
      el.style.display = '';
    });
    vsSaved = null;
    setInGame(false); // zurueck im Menue: Titelmelodie wieder an
    countdownActive = false; // bricht auch die Countdown-Ansage ab
    resetMenuThemeTiming();
    shieldUntil = speedUntil = slowUntil = rapidfireUntil = freezeUntil = 0;
    gadgetCooldownUntil = shotCooldownUntil = smokeUntil = 0; hookAnim = null;
    enemies = []; powerUps = []; revealPopups = []; guardBubbles = [];
    shotProjectiles = []; enemyDeathAnims = []; trail = [];
    initGrid();
    px = Math.floor(COLS / 2); py = 0; prevPx = px; prevPy = py;
    draw(performance.now());
  }

  function vsInvul(pl, now) { return typeof pl.inv === 'boolean' ? pl.inv : now < pl.inv; }

  // Sprung (neu setzen statt gleiten): alles ausser 1-2 Feldern geradeaus (Schritt, Enterhaken)
  function vsIsJump(dx, dy) { return (dx && dy) || Math.abs(dx) + Math.abs(dy) > GADGET_HOOK_PULL; }

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
      const jump = vsIsJump(mp.x - px, mp.y - py);
      const d = VS_DIRS[Math.sign(mp.x - px) + ',' + Math.sign(mp.y - py)];
      if (d) dir = d;
      else if (jump && px === -99) dir = me === 0 ? 'down' : 'up';
      prevPx = jump ? mp.x : px; prevPy = jump ? mp.y : py;
      px = mp.x; py = mp.y;
      playerStepTime = now;
    }
    // Schildring waehrend der Schonzeit oder mit Schild-Power-up
    shieldUntil = Math.max(vsInvul(mp, now) ? now + 1000 : 0, mp.shieldUntil);
    // Wartezeit vorbei: kurzer Piepser, damit man weiss, dass es weitergeht
    const stunned = now < (mp.stunUntil || 0);
    if (vsWasStunned && !stunned) sndCountdownBeep(true);
    vsWasStunned = stunned;
    speedUntil = mp.speedUntil; slowUntil = mp.slowUntil; rapidfireUntil = mp.rapidUntil;
    // Knoepfe: Gadget- und Schuss-Abklingzeit, Boost-Vorrat, Rauch
    gadgetCooldownUntil = mp.gadgetReadyAt; shotCooldownUntil = mp.shotReady; smokeUntil = mp.smokeUntil;
    decoyCharges = 0;
    if (boostsRemaining !== mp.boosts || boostsMax !== VS_BOOSTS) {
      boostsRemaining = mp.boosts; boostsMax = VS_BOOSTS;
      updateBoostUI();
    }
    freezeUntil = s.freezeUntil;

    // Gegner
    const rp = s.players[1 - me];
    if (!vsRival) {
      const h = me === 0 ? -Math.PI / 2 : Math.PI / 2;
      vsRival = { x: rp.x, y: rp.y, prevX: rp.x, prevY: rp.y, stepTime: 0, heading: h, headingDisp: h, lastDraw: now };
    } else if (rp.x !== vsRival.x || rp.y !== vsRival.y) {
      const dx = rp.x - vsRival.x, dy = rp.y - vsRival.y;
      const jump = vsIsJump(dx, dy);
      if (!jump) vsRival.heading = Math.atan2(dy, dx);
      vsRival.prevX = jump ? rp.x : vsRival.x; vsRival.prevY = jump ? rp.y : vsRival.y;
      vsRival.x = rp.x; vsRival.y = rp.y;
      vsRival.stepTime = now;
    }
    vsRival.inv = vsInvul(rp, now) || now < rp.shieldUntil;
    vsRival.iv = vsPlayerInterval(rp, now);
    vsRival.fast = now < rp.speedUntil;
    vsRival.smoke = now < rp.smokeUntil;
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

    mines = (s.mines || []).map(m => ({ c: m.x, r: m.y, armedAt: m.armedAt, foe: m.p !== me }));

    // Anzeige oben
    const pct = s.pct || [vsPct(s, 0), vsPct(s, 1)];
    const secs = Math.max(0, Math.ceil(s.timeLeft / 1000));
    vsSetHud('pct', pct[me] + '%');
    vsSetHud('score', pct[1 - me] + '%');
    vsSetHud('level', Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'));
    const series = vsIsHost ? vsSeries : (s.series || [0, 0]);
    vsSetHud('lives', series[me] + ':' + series[1 - me]);
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
        startTime: now, life: vsShotLife(ev.path.length)
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
    } else if (ev.t === 'capture') {
      vsPlayCapture(ev, now);
    } else if (ev.t === 'hook') {
      sndGadgetHook();
      if (ev.p === vsMe) {
        hookAnim = { ox: ev.ox, oy: ev.oy, dx: ev.dx, dy: ev.dy, reachCells: ev.pulled > 0 ? ev.pulled : 0.55,
          startTime: now, mode: ev.pulled > 0 ? 'pull' : 'bounce' };
      }
      if (ev.pulled > 0) { triggerShake(3, 140); spawnEmote('💨', ev.ox, ev.oy); }
      else triggerShake(2, 90);
    } else if (ev.t === 'smoke') {
      sndGadgetSmoke();
      spawnEmote('💨', ev.x, ev.y);
      triggerShake(2, 150);
    } else if (ev.t === 'mine') {
      sndDecoyThrow();
      spawnEmote('💣', ev.x, ev.y);
    } else if (ev.t === 'boom') {
      addRipple(ev.x, ev.y, 3, 500, '255,140,60', 0.8);
      (ev.cells || []).forEach(i => flashCells.push({ r: Math.floor(i / COLS), c: i % COLS, time: now }));
      spawnSparks(ev.x * CELL + CELL / 2, ev.y * CELL + CELL / 2, '#ffb347', 24, 260, 0);
      triggerShake(8, 260);
    } else if (ev.t === 'boost') {
      if (ev.p === vsMe) sndBoost();
    } else if (ev.t === 'cut') {
      playLineCutEffects(ev.cells.map(i => [i % COLS, Math.floor(i / COLS)]), '✂️', ev.p === vsMe);
    } else if (ev.t === 'pick') {
      revealPopups.push({ x: ev.x, y: ev.y, type: ev.type, kind: ev.kind,
        startTime: now, resolveAt: now + ROULETTE_MS, applied: true, lastTickIdx: -1 });
      if (ev.p === vsMe) { if (ev.kind === 'down') sndPowerDown(ev.type); else sndPowerUp(ev.type); }
    } else if (ev.t === 'hit') {
      const k = vsSpawnCorner(ev.p);
      milestonePopups.push({ x: k.x, y: k.y + (ev.p === 0 ? 1 : -1), text: '🏠 Back home!', startTime: now });
      triggerShake(8, 300);
      if (ev.p === vsMe) { triggerDeathFlash(); vibrate(150); }
    }
  }

  // Eroberungs-Effekte: dieselben wie im 1-Spieler-Modus, in der Farbe des Spielers
  function vsPlayCapture(ev, now) {
    const cells = ev.cells.map(i => [Math.floor(i / COLS), i % COLS]);
    playCaptureEffects(cells, ev.x, ev.y, ev.combo, ev.p === vsMe ? CAPTURE_FX_GREEN : CAPTURE_FX_BLUE);
    if (ev.stolen > 0) {
      milestonePopups.push({ x: ev.x, y: ev.y - 1, text: '🏴 Stolen ' + ev.stolen + '!', startTime: now });
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
    if (rv.smoke) ctx.globalAlpha = 0.38; // Rauchbombe: halb durchsichtig
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
    const meStunned = vsDrawStun(vsState.players[vsMe], mx, my, now);
    const rivalStunned = vsDrawStun(vsState.players[1 - vsMe], cx, cy, now);
    const rivalLabel = rivalStunned ? 'WAIT' : (vsCpu ? 'CPU' : 'RIVAL');
    ctx.strokeText(rivalLabel, cx, cy - CELL * 0.7);
    ctx.fillStyle = '#8cc4ff';
    ctx.fillText(rivalLabel, cx, cy - CELL * 0.7);
    const meLabel = meStunned ? 'WAIT' : 'YOU';
    ctx.strokeText(meLabel, mx, my - CELL * 0.7);
    ctx.fillStyle = '#7fe0a0';
    ctx.fillText(meLabel, mx, my - CELL * 0.7);
    ctx.restore();
  }

  // Wartezeit nach einem Treffer: kreisende Sterne (wie beim benommenen Waechter)
  // und ein Ring, der ablaeuft. Gibt true zurueck, solange gewartet wird.
  function vsDrawStun(pl, x, y, now) {
    const left = (pl.stunUntil || 0) - now;
    if (left <= 0) return false;
    const frac = Math.min(1, left / (pl.stunMs || 1));
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(2, CELL * 0.1);
    ctx.beginPath();
    ctx.arc(x, y, CELL * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(x, y, CELL * 0.62, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.font = Math.floor(CELL * 0.42) + 'px "Space Grotesk", -apple-system, sans-serif';
    for (let k = 0; k < 3; k++) {
      const a = now / 180 + k * Math.PI * 2 / 3;
      ctx.fillText('⭐', x + Math.cos(a) * CELL * 0.4, y - CELL * 0.45 + Math.sin(a) * CELL * 0.12);
    }
    ctx.restore();
    return true;
  }

  // Sichtkegel der CPU, gleiche Geometrie wie bei den Waechtern, aber blau
  function vsDrawCpuCone(cx, cy, heading) {
    const ox = cx / CELL, oy = cy / CELL;
    const view = { personality: 'wanderer', angleDisp: heading, c: Math.floor(ox), r: Math.floor(oy) };
    const radius = visionRange(view) * CELL;
    const g = ctx.createRadialGradient(cx, cy, CELL * 0.3, cx, cy, radius);
    g.addColorStop(0, 'rgba(120,180,255,0.20)');
    g.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.save();
    fillVisionCone(view, ox, oy, cx, cy, g, 'rgba(140,196,255,0.25)');
    ctx.restore();
  }
