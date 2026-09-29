  function loop(time) {
    if (!running) return;
    if (!lastTime) lastTime = time;
    let delta = time - lastTime;
    lastTime = time;
    // Nach einem Tabwechsel steht rAF still; ohne Deckel kaeme die gesamte
    // Pause als ein Schritt zurueck (Spielerzug, Waechterzug und Power-up gleichzeitig).
    if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;
    if (time < slowMoUntil) delta *= 0.25; // kurze Zeitlupe nach einem Abschuss

    if (!paused && !gameOver && !celebrating && !dying && !countdownActive) {
      playerTimer += delta;
      const playerIv = currentPlayerInterval();
      if (playerTimer > playerIv) {
        // Rest behalten statt auf 0 zu setzen, sonst haengt die Schrittrate
        // an der Bildrate. Auf ein Intervall begrenzt, damit nach einem
        // Aussetzer keine Schritte nachgeholt werden.
        playerTimer = Math.min(playerTimer - playerIv, playerIv);
        stepPlayer();
      }
      if (running && !gameOver) {
        const guardsFrozen = performance.now() < freezeUntil || tutorialGuardsStand ||
          (!tutorialActive && !MODES[gameMode].enemiesMove);
        if (guardsFrozen) {
          // Waechter eingefroren (Power-up, Zen-Modus oder Sichtkegel-Etappe)
        } else {
          updateGuardSight(performance.now());
          enemyTimer += delta;
          if (enemyTimer > enemyInterval) {
            enemyTimer = Math.min(enemyTimer - enemyInterval, enemyInterval);
            moveEnemies();
          }
        }
        powerUpSpawnTimer += delta;
        if (!tutorialActive && powerUpSpawnTimer > MODES[gameMode].puInterval && powerUps.length < MODES[gameMode].puMax) {
          powerUpSpawnTimer = 0;
          spawnPowerUp();
        }
        updateMovingBlocks(delta);
        updatePendingReveals(performance.now());
        updateTutorial();
        if (swarmEnemies.length && performance.now() >= swarmUntil) clearSwarmEnemies();
        updateMusicScheduler();
        checkNearMiss(performance.now());
        checkContinuousCollision(performance.now());
      }
    }
    updateActionButtonsUI();
    if (!paused) draw(time);
    if (running) rafId = requestAnimationFrame(loop);
  }

  // Merkt sich pro Knopf, ob er bereit war, und blitzt genau beim Umschlagen einmal auf.
  const readyState = { gadget: true, shoot: true, cash: false };
  function flashWhenReady(el, key, isReady) {
    if (!el) return;
    if (isReady && !readyState[key]) {
      el.classList.remove('justReady');
      void el.offsetWidth; // Reflow erzwingen, damit die Animation neu startet
      el.classList.add('justReady');
      setTimeout(() => el.classList.remove('justReady'), 520);
    }
    readyState[key] = isReady;
  }

  function updateActionButtonsUI() {
    const el = document.getElementById('btnGadget');
    const sweep = document.getElementById('gadgetSweep');
    if (el && sweep) {
      // Mit Decoy-Wuerfen zeigt der Knopf den Stein samt Anzahl und ist sofort bereit
      const icon = decoyCharges > 0 ? '🪨' + decoyCharges : GADGETS[gadgetChoice].icon;
      if (el.firstChild && el.firstChild.nodeType === 3 && el.firstChild.nodeValue !== icon) el.firstChild.nodeValue = icon;
      const frac = decoyCharges > 0 ? 0 : gadgetCooldownFrac();
      sweep.style.setProperty('--cd', (frac * 100) + '%');
      el.classList.toggle('oncooldown', frac > 0);
      flashWhenReady(el, 'gadget', frac === 0 && running && !gameOver);
    }
    const cashFill = document.getElementById('cashFill');
    if (cashFill) {
      // Waehrend eines Laufs baut sich die Auszahlung mit jedem Prozent Flaeche auf.
      const inRun = hasStarted && !gameOver;
      const cashUsable = levelReadyToComplete && running && !gameOver;
      const progress = cashUsable ? 1 : (inRun ? Math.max(0, Math.min(1, capturedPct / 75)) : 0);
      cashFill.style.setProperty('--fill', (progress * 100) + '%');
      flashWhenReady(document.getElementById('pauseBtn'), 'cash', cashUsable);
    }
    const shootEl = document.getElementById('btnShoot');
    const shootSweep = document.getElementById('shootSweep');
    if (shootEl && shootSweep) {
      const now = performance.now();
      const rapidfireActive = now < rapidfireUntil;
      const shootFrac = rapidfireActive ? 0 : Math.max(0, Math.min(1, (shotCooldownUntil - now) / shotCooldownMs()));
      shootSweep.style.setProperty('--cd', (shootFrac * 100) + '%');
      shootEl.classList.toggle('oncooldown', shootFrac > 0);
      flashWhenReady(shootEl, 'shoot', shootFrac === 0 && running && !gameOver);
    }
  }

  function sndCountdownBeep(isLast) {
    if (isLast) { tone(1046, 0.2, 'square', 0.13, 0, 1600); }
    else { tone(700, 0.11, 'square', 0.1, 0, 900); }
  }

  function triggerStartCountdown() {
    playLevelWipe();
    countdownActive = true;
    // Anzeige und Piepser starten etwas spaeter als die Sprache, damit alles gleichzeitig ankommt
    countdownStartTime = performance.now() + COUNTDOWN_SPEECH_LEAD_MS;
    for (let i = 0; i < COUNTDOWN_STEPS.length; i++) {
      setTimeout(() => sndCountdownBeep(i === COUNTDOWN_STEPS.length - 1),
        COUNTDOWN_SPEECH_LEAD_MS + i * COUNTDOWN_STEP_MS);
    }
    speakCountdown();
  }

  // Sprachausgabe zum Countdown (1-Spieler und Versus), aus bei "Guard voices: Off"
  const COUNTDOWN_WORDS = ['Three', 'Two', 'One', 'Go!'];

  // Klare englische Stimme: bekannte gute Stimmen zuerst, dann lokale en-US, dann irgendeine englische
  function countdownVoice() {
    const en = guardVoices().filter(v => /^en/i.test(v.lang));
    const preferred = /Google US English|Samantha|Daniel|Karen|Serena|Moira|Aaron|Microsoft (Aria|Jenny|Guy)/i;
    return en.find(v => preferred.test(v.name)) ||
      en.find(v => /en[-_]US/i.test(v.lang) && v.localService) ||
      en.find(v => /en[-_]US/i.test(v.lang)) || en[0] || null;
  }
  // Die Stimmenliste laedt der Browser verzoegert: frueh anstossen
  if (window.speechSynthesis) speechSynthesis.getVoices();

  function speakCountdown() {
    if (voiceMode === 'off') return;
    const tts = !!window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined';
    const voice = tts ? countdownVoice() : null;
    COUNTDOWN_WORDS.forEach((word, i) => setTimeout(() => {
      if (!countdownActive) return; // Spiel inzwischen verlassen
      if (voicePlayCountdown(word)) return; // MP3-Datei vorhanden
      if (!tts) return;
      // Jedes Wort genau zu seiner Zahl: nichts in die Warteschlange, Reste abbrechen
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'en-US';
      u.rate = 1.1;
      u.pitch = 0.5; // tiefe Stimme
      u.volume = volumes.voice;
      speechSynthesis.speak(u);
    }, i * COUNTDOWN_STEP_MS));
  }

  function startGame() {
    tutorialActive = false;
    tutorialGuardsStand = false;
    tutorialRestoreGadget();
    hideTutorialBar();
    document.getElementById('tutorialBtn').classList.add('hidden');
    loadHighScoreForMode();
    document.getElementById('modeBtn').classList.add('hidden');
    resetGame();
    hideOverlay();
    dying = false;
    document.getElementById('board-wrap').classList.remove('dimming');
    running = true;
    lastTime = 0;
    triggerStartCountdown();
    draw(performance.now());
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    resetMusicTiming();
  }

  function continueLevel() {
    hideOverlay();
    dying = false;
    document.getElementById('board-wrap').classList.remove('dimming');
    running = true;
    lastTime = 0;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    resetMusicTiming();
  }

  function retryLevel() {
    resetLevel(level);
    hideOverlay();
    dying = false;
    document.getElementById('board-wrap').classList.remove('dimming');
    running = true;
    lastTime = 0;
    triggerStartCountdown();
    draw(performance.now());
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    resetMusicTiming();
  }

  function togglePause() {
    if (gameOver || !running || quitConfirmOpen) return;
    paused = !paused;
    if (paused) showOverlay('Pause', 'Score: ' + score, 'Continue');
    else { hideOverlay(); resetMusicTiming(); }
  }

  // Browser minimiert oder Tab gewechselt: automatisch Pause, weiter geht es nur per Klick.
  // Nicht im 2-Spieler-Modus, dort laeuft das Match beim Gegner weiter.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || paused || vsActive) return;
    togglePause();
  });

  let modeSelectOpen = false;

  let modeSelectBuilt = false;

  function buildModeSelect() {
    const modeRow = document.getElementById('modeRow');
    const cameraRow = document.getElementById('cameraRow');
    Object.keys(MODES).forEach(key => {
      const b = document.createElement('button');
      b.className = 'pill';
      b.dataset.mode = key;
      b.textContent = MODES[key].label;
      b.addEventListener('click', () => { setGameMode(key); refreshModeSelect(); });
      modeRow.appendChild(b);
    });
    Object.keys(CAMERAS).forEach(key => {
      const b = document.createElement('button');
      b.className = 'pill';
      b.dataset.camera = key;
      b.textContent = CAMERAS[key].label;
      b.addEventListener('click', () => { setCameraMode(key); refreshModeSelect(); });
      cameraRow.appendChild(b);
    });
    const gadgetRow = document.getElementById('gadgetRow');
    Object.keys(GADGETS).forEach(key => {
      const b = document.createElement('button');
      b.className = 'pill';
      b.dataset.gadget = key;
      b.textContent = GADGETS[key].icon + ' ' + GADGETS[key].label;
      b.addEventListener('click', () => { setGadgetChoice(key); refreshModeSelect(); });
      gadgetRow.appendChild(b);
    });
    const voiceRow = document.getElementById('voiceRow');
    Object.keys(VOICE_MODES).forEach(key => {
      const b = document.createElement('button');
      b.className = 'pill';
      b.dataset.voice = key;
      b.textContent = VOICE_MODES[key].label;
      b.addEventListener('click', () => { setVoiceMode(key); refreshModeSelect(); });
      voiceRow.appendChild(b);
    });
    const volumeRows = document.getElementById('volumeRows');
    [['music', 'Music'], ['sfx', 'Effects'], ['voice', 'Voices']].forEach(([key, label]) => {
      const row = document.createElement('label');
      row.className = 'volumeRow';
      const name = document.createElement('span');
      name.textContent = label;
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '5';
      slider.value = String(Math.round(volumes[key] * 100));
      slider.addEventListener('input', () => { ensureAudio(); setVolume(key, slider.value / 100); });
      row.appendChild(name); row.appendChild(slider);
      volumeRows.appendChild(row);
    });
    document.getElementById('optionsToggle').addEventListener('click', openOptionsScreen);
    document.getElementById('optionsBackBtn').addEventListener('click', () => openModeSelect());
    modeSelectBuilt = true;
  }

  function updateGadgetButtonIcon() {
    const btn = document.getElementById('btnGadget');
    if (!btn) return;
    btn.textContent = '';
    btn.appendChild(document.createTextNode(GADGETS[gadgetChoice].icon));
    const sweepEl = document.createElement('div');
    sweepEl.className = 'gadgetSweep';
    sweepEl.id = 'gadgetSweep';
    btn.appendChild(sweepEl);
  }

  function refreshModeSelect() {
    if (!modeSelectBuilt) buildModeSelect();
    document.querySelectorAll('#modeRow .pill').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === gameMode);
    });
    document.querySelectorAll('#cameraRow .pill').forEach(b => {
      b.classList.toggle('active', b.dataset.camera === cameraMode);
    });
    document.querySelectorAll('#gadgetRow .pill').forEach(b => {
      b.classList.toggle('active', b.dataset.gadget === gadgetChoice);
    });
    document.querySelectorAll('#voiceRow .pill').forEach(b => {
      b.classList.toggle('active', b.dataset.voice === voiceMode);
    });
    document.getElementById('optionsSummary').textContent = [MODES[gameMode].label, CAMERAS[cameraMode].label,
      GADGETS[gadgetChoice].icon + ' ' + GADGETS[gadgetChoice].label, VOICE_MODES[voiceMode].label].join(' · ');
    document.getElementById('selectDesc').textContent =
      MODES[gameMode].desc + ' ' + CAMERAS[cameraMode].desc + ' ' + GADGETS[gadgetChoice].desc;
    updateGadgetButtonIcon();
  }

  let quitConfirmOpen = false;
  let overlaySnapshot = null;

  function canQuitToMenu() {
    return hasStarted && !modeSelectOpen && !quitConfirmOpen && !gameOver && !shopOpen && !tutorialActive;
  }

  // Merkt sich den aktuellen Overlay-Zustand, damit "Keep playing" ihn exakt wiederherstellt.
  function snapshotOverlay() {
    return {
      hidden: document.getElementById('overlay').classList.contains('hidden'),
      title: document.getElementById('overlayTitle').textContent,
      text: document.getElementById('overlayText').textContent,
      textHidden: document.getElementById('overlayText').classList.contains('hidden'),
      btn: document.getElementById('startBtn').textContent,
      modeBtnHidden: document.getElementById('modeBtn').classList.contains('hidden'),
      paused: paused
    };
  }

  function restoreOverlay(snap) {
    document.getElementById('overlayTitle').textContent = snap.title;
    document.getElementById('overlayText').textContent = snap.text;
    document.getElementById('overlayText').classList.toggle('hidden', snap.textHidden);
    document.getElementById('startBtn').textContent = snap.btn;
    document.getElementById('modeBtn').classList.toggle('hidden', snap.modeBtnHidden);
    document.getElementById('overlay').classList.toggle('hidden', snap.hidden);
  }

  function openQuitConfirm() {
    if (!canQuitToMenu()) return;
    overlaySnapshot = snapshotOverlay();
    quitConfirmOpen = true;
    paused = true; // Lauf einfrieren, solange die Frage offen ist
    showOverlay('Leave this run?', 'Level ' + level + ', score ' + score + ' - all of it is lost.', '↩ Back to menu');
    document.getElementById('quitCancelBtn').classList.remove('hidden');
  }

  function cancelQuit() {
    if (!quitConfirmOpen) return;
    quitConfirmOpen = false;
    document.getElementById('quitCancelBtn').classList.add('hidden');
    paused = overlaySnapshot.paused;
    restoreOverlay(overlaySnapshot);
    overlaySnapshot = null;
    if (!paused) resetMusicTiming();
  }

  function quitToMenu() {
    quitConfirmOpen = false;
    overlaySnapshot = null;
    document.getElementById('quitCancelBtn').classList.add('hidden');
    paused = false;
    running = false;
    gameOver = false;
    dying = false;
    lifeLostFlag = false;
    celebrating = false;
    cancelAnimationFrame(rafId);
    document.getElementById('board-wrap').classList.remove('dimming');
    hasStarted = false; // laesst das Menue-Theme wieder anlaufen
    resetMenuThemeTiming();
    openModeSelect();
  }

  // Eigener Bildschirm fuer die Einstellungen, erreichbar ueber den Options-Knopf im Hauptmenue
  function openOptionsScreen() {
    ensureAudio();
    ['startBtn', 'vsBtn', 'tutorialBtn', 'optionsToggle'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('runOptions').classList.remove('hidden');
    document.getElementById('overlayTitle').textContent = 'Options';
    refreshModeSelect();
    animateOverlayIn();
  }

  function openModeSelect() {
    modeSelectOpen = true;
    shopOpen = false;
    document.getElementById('shop').classList.add('hidden');
    document.getElementById('startBtn').classList.remove('hidden');
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('overlayText').classList.add('hidden');
    document.getElementById('skipBtn').classList.add('hidden');
    document.getElementById('modeBtn').classList.add('hidden');
    document.getElementById('modeSelect').classList.remove('hidden');
    document.getElementById('overlayTitle').textContent = 'Claim';
    document.getElementById('runOptions').classList.add('hidden');
    document.getElementById('optionsToggle').classList.remove('hidden');
    const firstTime = !tutorialDone();
    const tutBtn = document.getElementById('tutorialBtn');
    tutBtn.classList.remove('hidden');
    tutBtn.textContent = firstTime ? '🎓 Play the tutorial first' : '🎓 Replay tutorial';
    document.getElementById('startBtn').textContent = '▶ 1 Player';
    refreshModeSelect();
  }

