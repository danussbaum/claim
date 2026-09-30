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
  const VS_INVULN_MS = 1500;
  const VS_SHOT_STUN_MS = 800;   // nach einem Abschuss: kurz stehen, dann weiter
  const VS_CRASH_STUN_MS = 1500;  // Linie gekreuzt/gekappt, vom Waechter erwischt: laenger stehen
  const VS_MATCH_MS = 120000;
  const VS_WIN_PCT = 50;
  const VS_COUNTDOWN_MS = COUNTDOWN_SPEECH_LEAD_MS + COUNTDOWN_STEPS.length * COUNTDOWN_STEP_MS; // wie im 1-Spieler-Modus
  const VS_SEND_MS = 33;
  const VS_BOOSTS = 3;           // Boosts pro Match
  // Koop: beide gegen mehr Waechter, gemeinsames Land, gemeinsame Leben, Ziel in der Zeit erreichen
  const VS_COOP_GUARDS = 3;
  const VS_COOP_LIVES = 5;
  const VS_COOP_WIN_PCT = 70;
  // Serie: gewonnen hat, wer mindestens VS_SERIES_WINS Matches und VS_SERIES_LEAD Siege mehr hat
  const VS_SERIES_WINS = 3;
  const VS_SERIES_LEAD = 2;   // wie im Tennis: zwei Siege Vorsprung

  let vsActive = false;      // Versus-Bildschirm aktiv (Lobby oder Match)
  let vsPlaying = false;     // Match laeuft
  let vsIsHost = false;
  let vsCpu = false;         // lokales Match gegen die KI (zum Testen ohne zweites Geraet)
  let vsCoop = false;        // Koop statt Versus (entscheidet der Host)
  let vsMe = 0;              // 0 = Host, 1 = Gast
  let vsState = null;        // beim Host die Wahrheit, beim Gast die letzte Kopie
  let vsGadgets = ['hook', 'hook']; // gewaehltes Gadget je Spieler (der Gast meldet seines)
  let vsSeries = [0, 0];      // Matchsiege in der laufenden Serie (Host fuehrt)
  let vsRaf = 0, vsLastTime = 0, vsSendTimer = 0, vsPlayed = 0;

  // --- Overlay / Lobby ---
  function vsPanel() { return document.getElementById('vsPanel'); }

  let vsLastPanel = null; // zuletzt gezeigtes Panel, fuer "Keep playing" beim Verlassen
  let vsQuitOpen = false;

  function vsShowPanel(title, text, buttons, showQr) {
    vsQuitOpen = false; // ein neues Panel (z. B. Matchende) ersetzt die Frage
    vsLastPanel = [title, text, buttons, showQr];
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
    vsShowPanel('2 Player', 'Versus: claim more ground than your rival. Win 3 matches with a 2-match lead. Cut their line or shoot them to send them back home.\n' +
      'Co-op: claim ' + VS_COOP_WIN_PCT + '% together against ' + VS_COOP_GUARDS + ' guards before time runs out. You share the land and ' + VS_COOP_LIVES + ' lives.', [
      { label: '📡 Host versus', primary: true, onClick: () => { vsCoop = false; vsStartHost(); } },
      { label: '🤝 Host co-op', primary: true, onClick: () => { vsCoop = true; vsStartHost(); } },
      { label: '🤖 Versus vs CPU', onClick: () => { vsCoop = false; vsStartCpu(); } },
      { label: '🤖 Co-op with CPU', onClick: () => { vsCoop = true; vsStartCpu(); } },
      { label: 'Back', onClick: vsLeave },
    ], false);
    vsSetStatus('To join, scan the host\'s QR code with your camera.');
  }

  function vsStartCpu() {
    vsIsHost = true; vsMe = 0; vsCpu = true;
    vsGadgets = [gadgetChoice, 'hook'];
    vsSeries = [0, 0];
    vsHostStartMatch();
  }

  function vsStartHost() {
    vsIsHost = true; vsMe = 0; vsCpu = false;
    vsGadgets = [gadgetChoice, 'hook'];
    vsSeries = [0, 0];
    vsBindNet();
    const url = Net.joinUrl(Net.host());
    vsShowPanel('2 Player', vsCoop ? 'Let your teammate scan this code.' : 'Let your rival scan this code.', [{ label: 'Cancel', onClick: vsLeave }], true);
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
      else {
        Net.send({ t: 'hello', gadget: gadgetChoice });
        vsShowPanel('2 Player', 'Connected! Waiting for host...', [{ label: 'Leave', onClick: vsLeave }], false);
      }
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
    vsQuitOpen = false;
    vsStopLoop();
    Net.onClose = () => {};
    Net.close();
    vsState = null;
    vsExitRender();
    vsHidePanel();
    openModeSelect();
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
      if (msg.t === 'hello' && GADGETS[msg.gadget]) {
        vsGadgets[1] = msg.gadget;
        if (vsState) vsState.players[1].gadget = msg.gadget; // Match laeuft evtl. schon
        return;
      }
      if (!vsState) return;
      const pl = vsState.players[1];
      if (msg.t === 'dir') vsApplyDir(pl, msg.d);
      else if (msg.t === 'shoot') vsShoot(vsState, 1, performance.now());
      else if (msg.t === 'gadget') vsUseGadget(vsState, 1, performance.now());
      else if (msg.t === 'boost') vsUseBoost(vsState, 1, performance.now());
      else if (msg.t === 'rematch' && vsState.over) vsNextMatch();
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
      players: msg.players.map(pl => ({ x: pl.x, y: pl.y, inv: pl.inv,
        speedUntil: now + pl.speed, slowUntil: now + pl.slow, shieldUntil: now + pl.shield, rapidUntil: now + pl.rapid,
        stunUntil: now + pl.stun, stunMs: pl.stunMs,
        gadgetReadyAt: now + pl.gadgetCd, smokeUntil: now + pl.smoke, shotReady: now + pl.shotCd, boosts: pl.boosts })),
      guards: msg.guards.map(g => ({ x: g[0], y: g[1], deadUntil: g[2], hunting: !!g[3],
        stunUntil: g[4] ? now + 300 : 0, breakUntil: g[5] ? now + 300 : 0, pers: g[6], name: g[7] })),
      powerUps: msg.powerUps.map(u => ({ x: u[0], y: u[1], type: u[2], kind: u[3] })),
      mines: (msg.mines || []).map(m => ({ x: m[0], y: m[1], p: m[2], armedAt: now + m[3] })),
      freezeUntil: now + msg.freeze,
      events: [],
      timeLeft: msg.timeLeft, countdown: msg.countdown, over: msg.over, pct: msg.pct, series: msg.series,
      coop: !!msg.coop, lives: msg.lives || 0,
    };
  }

  function vsApplyDir(pl, d) {
    if (!['up', 'down', 'left', 'right'].includes(d)) return;
    if (pl.trail.length && pl.dir === INVERTED_DIR[d]) return; // nicht in die eigene Linie umdrehen
    pl.next = d;
    pl.lastDir = d;
  }

  // --- Eingaben (ersetzen die 1-Spieler-Handler, solange Versus aktiv ist) ---
  function vsInputDir(d) {
    ensureAudio(); // der Gast kommt per QR-Link und hat evtl. noch nie getippt
    if (!vsPlaying) return;
    if (d === dir) vsInputBoost(); // gleiche Richtung nochmals = Boost, wie im 1-Spieler-Modus
    if (vsIsHost) vsApplyDir(vsState.players[0], d);
    else Net.send({ t: 'dir', d });
  }

  function vsInputGadget() {
    ensureAudio();
    if (!vsPlaying) return;
    if (vsIsHost) vsUseGadget(vsState, 0, performance.now());
    else Net.send({ t: 'gadget' });
  }

  function vsInputBoost() {
    if (!vsPlaying) return;
    if (vsIsHost) vsUseBoost(vsState, 0, performance.now());
    else Net.send({ t: 'boost' });
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
    // Countdown des 1-Spieler-Modus (Anzeige in draw(), Piepser, Sprachausgabe)
    triggerStartCountdown();
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
    if (vsState) updateActionButtonsUI();
    const over = vsState && vsState.over;
    if (over && !vsShownOver) { vsShownOver = true; setTimeout(vsShowResult, 900); }
    vsRaf = requestAnimationFrame(vsLoop);
  }

  function vsShowResult() {
    const over = vsState && vsState.over;
    if (!over || !vsActive) return;
    const pct = vsState.pct || [vsPct(vsState, 0), vsPct(vsState, 1)];
    if (over.coop) {
      vsShowPanel(over.won ? 'Team wins! 🤝🏆' : 'Team lost 💀',
        'Reason: ' + over.reason + '\nTeam ' + pct[0] + '% of ' + VS_COOP_WIN_PCT + '%  ·  Lives left ' + Math.max(0, vsState.lives || 0), [
          { label: '🔁 Play again', primary: true, onClick: () => {
            if (vsIsHost) vsNextMatch();
            else { Net.send({ t: 'rematch' }); vsSetStatus('Waiting for host...'); }
          } }, { label: 'Leave', onClick: vsLeave }], false);
      vsSetStatus('');
      return;
    }
    const series = over.series || [0, 0];
    const seriesDone = over.seriesWinner >= 0;
    let title;
    if (seriesDone) title = over.seriesWinner === vsMe ? 'You win the series! 🏆' : 'Rival wins the series 💀';
    else title = over.winner === -1 ? 'Draw!' : (over.winner === vsMe ? 'Match won! 👍' : 'Match lost 👎');
    const text = 'Reason: ' + over.reason + '\nYou ' + pct[vsMe] + '%  ·  Rival ' + pct[1 - vsMe] + '%' +
      '\n\nMatches  ' + series[vsMe] + ' : ' + series[1 - vsMe] +
      (seriesDone ? '' : '\nFirst to ' + VS_SERIES_WINS + ' wins' + (VS_SERIES_LEAD > 1 ? ' (lead by ' + VS_SERIES_LEAD + ')' : ''));
    const buttons = [{ label: seriesDone ? '🔁 New series' : '▶ Next match', primary: true, onClick: () => {
      if (vsIsHost) vsNextMatch();
      else { Net.send({ t: 'rematch' }); vsSetStatus('Waiting for host...'); }
    } }, { label: 'Leave', onClick: vsLeave }];
    vsShowPanel(title, text, buttons, false);
    vsSetStatus('');
  }

  // --- Einhaengen in das bestehende Spiel ---
  (function vsHook() {
    const origSetDir = setDir, origShoot = shoot, origUseGadget = useGadget,
      origUseBoost = useBoost, origTogglePause = togglePause, origOpenQuit = openQuitConfirm,
      origOpenModeSelect = openModeSelect, origHideOverlay = hideOverlay;
    setDir = function (d) { if (vsActive) vsInputDir(d); else origSetDir(d); };
    shoot = function () { if (vsActive) vsInputShoot(); else origShoot(); };
    useGadget = function () { if (vsActive) vsInputGadget(); else origUseGadget(); };
    useBoost = function () { if (vsActive) vsInputBoost(); else origUseBoost(); };
    togglePause = function () { if (!vsActive) origTogglePause(); };
    openQuitConfirm = function () {
      if (!vsActive) { origOpenQuit(); return; }
      if (vsQuitOpen) return;
      const wasHidden = document.getElementById('overlay').classList.contains('hidden') ||
        vsPanel().classList.contains('hidden');
      const prev = vsLastPanel;
      vsShowPanel('Leave this match?', 'The 2 player match ends for both players.', [
        { label: '↩ Back to menu', primary: true, onClick: () => { vsQuitOpen = false; vsLeave(); } },
        { label: 'Keep playing', onClick: () => {
          vsQuitOpen = false;
          if (!vsActive) return;
          if (wasHidden || !prev) { vsHidePanel(); document.getElementById('overlay').classList.add('hidden'); }
          else vsShowPanel.apply(null, prev);
        } }
      ], false);
      vsLastPanel = prev;
      vsQuitOpen = true;
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
