  // ===================== Input, buttons, layout, startup =====================
  document.getElementById('modeBtn').addEventListener('click', () => {
    ensureAudio();
    openModeSelect();
  });

  document.getElementById('quitCancelBtn').addEventListener('click', cancelQuit);

  document.getElementById('tutorialBtn').addEventListener('click', () => {
    ensureAudio();
    startTutorial();
  });
  document.getElementById('tutorialSkipBtn').addEventListener('click', () => {
    if (tutorialActive) { markTutorialDone(); stopTutorial(); }
  });

  document.querySelector('.topbar h1').addEventListener('click', () => {
    if (quitConfirmOpen) cancelQuit();
    else openQuitConfirm();
  });

  document.getElementById('skipBtn').addEventListener('click', () => {
    if (hasStarted || onboardingDone) return;
    finishOnboarding();
  });

  document.getElementById('startBtn').addEventListener('click', () => {
    if (shopOpen) return; // waehrend des Kaufmoments zaehlt nur eine Karte
    if (quitConfirmOpen) { quitToMenu(); return; }
    if (!hasStarted && !onboardingDone) {
      if (obIndex < obSteps.length - 1) {
        obIndex++;
        renderOnboardStep();
        return;
      }
      finishOnboarding();
      return;
    }
    if (!audioUnlocked) {
      audioUnlocked = true;
      ensureAudio();
      // Im Hauptmenue startet der Knopf direkt, sonst erst Ton freischalten
      if (!modeSelectOpen) {
        document.getElementById('startBtn').textContent = '▶ Let\'s go!';
        return;
      }
    }
    ensureAudio();
    if (modeSelectOpen) { openPlayRole(); return; }
    if (!hasStarted) { openModeSelect(); return; }
    if (lifeLostFlag) { lifeLostFlag = false; retryLevel(); return; }
    if (gameOver) { startGame(); return; }
    if (paused) { paused = false; hideOverlay(); return; }
    if (!running) { continueLevel(); return; }
    startGame();
  });
  document.getElementById('pauseBtn').addEventListener('click', () => {
    if (levelReadyToComplete && running && !gameOver && !celebrating) {
      triggerLevelCompleteFireworks();
      return;
    }
    togglePause();
  });
  document.getElementById('musicBtn').addEventListener('click', () => {
    ensureAudio();
    setMusicMuted(!musicMuted);
  });

  let swipeStartX = null, swipeStartY = null;
  let swipeMoved = false;
  let hasSwipedEver = false;
  let swipeHintUntil = 0;
  try { hasSwipedEver = localStorage.getItem('claim_swiped') === '1'; } catch (e) { /* ignore */ }
  const SWIPE_THRESHOLD = 18;

  function handleSwipeStart(clientX, clientY) {
    swipeStartX = clientX;
    swipeStartY = clientY;
    swipeMoved = false;
  }

  function handleSwipeMove(clientX, clientY) {
    if (swipeStartX === null) return;
    const dx = clientX - swipeStartX;
    const dy = clientY - swipeStartY;
    const dist = Math.hypot(dx, dy);
    if (dist < SWIPE_THRESHOLD) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      setDir(dx > 0 ? 'right' : 'left');
    } else {
      setDir(dy > 0 ? 'down' : 'up');
    }
    if (!swipeMoved && !hasSwipedEver) {
      hasSwipedEver = true;
      try { localStorage.setItem('claim_swiped', '1'); } catch (e) { /* ignore */ }
    }
    swipeMoved = true;
    swipeStartX = clientX;
    swipeStartY = clientY;
  }

  function handleSwipeEnd() {
    if (swipeStartX !== null && !swipeMoved) {
      shoot();
    }
    cancelSwipe();
  }

  // Abgebrochener Kontakt: nur zuruecksetzen, nicht als Tippen werten.
  function cancelSwipe() {
    swipeStartX = null;
    swipeStartY = null;
    swipeMoved = false;
  }

  boardCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    handleSwipeStart(t.clientX, t.clientY);
  }, { passive: false });

  boardCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    handleSwipeMove(t.clientX, t.clientY);
  }, { passive: false });

  boardCanvas.addEventListener('touchend', handleSwipeEnd);
  boardCanvas.addEventListener('touchcancel', cancelSwipe);

  boardCanvas.addEventListener('mousedown', (e) => {
    handleSwipeStart(e.clientX, e.clientY);
  });
  boardCanvas.addEventListener('mousemove', (e) => {
    if (e.buttons === 1) handleSwipeMove(e.clientX, e.clientY);
  });
  boardCanvas.addEventListener('mouseup', handleSwipeEnd);
  boardCanvas.addEventListener('mouseleave', handleSwipeEnd);

  function bindTap(id, fn) {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, {passive: false});
    el.addEventListener('mousedown', (e) => { e.preventDefault(); fn(); });
  }
  bindTap('btnUp', () => setDir('up'));
  bindTap('btnDown', () => setDir('down'));
  bindTap('btnLeft', () => setDir('left'));
  bindTap('btnRight', () => setDir('right'));
  bindTap('btnShoot', () => shoot());
  bindTap('btnGadget', () => useGadget());
  bindTap('infoCell', () => useBoost());

  document.addEventListener('keydown', (e) => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Shift'].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft') setDir('left');
    else if (e.key === 'ArrowRight') setDir('right');
    else if (e.key === 'ArrowUp') setDir('up');
    else if (e.key === 'ArrowDown') setDir('down');
    else if (e.key === ' ') shoot();
    else if (e.key === 'Shift') useGadget();
    else if (e.key === 'p' || e.key === 'P') togglePause();
    else if (e.key === 'Escape') {
      if (tutorialActive) { markTutorialDone(); stopTutorial(); }
      else if (quitConfirmOpen) cancelQuit();
      else openQuitConfirm();
    }
  });

  document.addEventListener('touchmove', (e) => {
    // Das Overlay ist bewusst scrollbar (overflow-y: auto) - dort nicht blockieren,
    // sonst sind lange Inhalte wie Shop oder Modusauswahl unten nicht erreichbar.
    if (e.target && e.target.closest && e.target.closest('#overlay')) return;
    e.preventDefault();
  }, {passive: false});

  function buildBoardBackground() {
    if (!boardCanvas.width || !boardCanvas.height) return;
    const w = boardCanvas.width, h = boardCanvas.height;

    const vg = ctx.createRadialGradient(w/2, h*0.42, Math.min(w,h)*0.08, w/2, h*0.5, Math.max(w,h)*0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    vg.addColorStop(1, 'rgba(0,0,0,0.8)');
    bgVignette = vg;

    const tile = 64;
    const nc = document.createElement('canvas');
    nc.width = tile; nc.height = tile;
    const nctx = nc.getContext('2d');
    const imgData = nctx.createImageData(tile, tile);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const v = Math.random() < 0.5 ? 255 : 0;
      const a = Math.random() * 26;
      imgData.data[i] = v; imgData.data[i+1] = v; imgData.data[i+2] = v; imgData.data[i+3] = a;
    }
    nctx.putImageData(imgData, 0, 0);
    bgNoisePattern = ctx.createPattern(nc, 'repeat');

    // Tiefenschicht als Kachel: grobes Gitter (3 Zellen Raster) plus Staubpartikel.
    // Als Pattern gebaut, damit das Wiederholen beim Verschieben gratis ist.
    const pTile = Math.max(48, Math.round(CELL * 6));
    const pc = document.createElement('canvas');
    pc.width = pTile; pc.height = pTile;
    const pctx = pc.getContext('2d');
    pctx.strokeStyle = 'rgba(127,224,160,0.055)';
    pctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const o = Math.round(i * pTile / 2) + 0.5;
      pctx.beginPath(); pctx.moveTo(o, 0); pctx.lineTo(o, pTile); pctx.stroke();
      pctx.beginPath(); pctx.moveTo(0, o); pctx.lineTo(pTile, o); pctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const mx = Math.random() * pTile, my = Math.random() * pTile;
      const rad = CELL * (0.04 + Math.random() * 0.07);
      const mg = pctx.createRadialGradient(mx, my, 0, mx, my, rad * 3);
      mg.addColorStop(0, 'rgba(160,235,190,' + (0.10 + Math.random() * 0.12) + ')');
      mg.addColorStop(1, 'rgba(160,235,190,0)');
      pctx.fillStyle = mg;
      pctx.beginPath(); pctx.arc(mx, my, rad * 3, 0, Math.PI * 2); pctx.fill();
    }
    bgParallaxPattern = ctx.createPattern(pc, 'repeat');
  }

  function resize() {
    const app = document.getElementById('app');
    const topbar = document.querySelector('.topbar');
    const controls = document.querySelector('.controls');
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;

    // Auf grossen Screens duerfen Buttons und Board mitwachsen.
    const bigScreen = Math.min(vw, vh) > 700;
    const btnH = bigScreen ? Math.round(Math.min(76, Math.max(52, vh * 0.062))) : 52;
    document.documentElement.style.setProperty('--btn-h', btnH + 'px');
    document.documentElement.style.setProperty('--btn-font', Math.round(btnH * 0.46) + 'px');

    // Breite nicht am (noch alten) #app messen, sonst friert das Layout auf 480px ein.
    const maxAppW = Math.min(vw - 16, 900);
    const tutBar = document.getElementById('tutorialBar');
    const tutBarH = (tutBar && !tutBar.classList.contains('hidden')) ? tutBar.offsetHeight + 8 : 0;
    const reserved = topbar.offsetHeight + controls.offsetHeight + 40 + tutBarH;
    const availW = maxAppW - 8;
    const availH = vh - reserved;
    CELL = Math.floor(Math.min(availW / COLS, availH / ROWS));
    CELL = Math.max(12, Math.min(CELL, 64));
    app.style.maxWidth = (COLS * CELL + 24) + 'px';
    boardCanvas.width = COLS * CELL;
    boardCanvas.height = ROWS * CELL;
    buildBoardBackground();
    if (grid) draw(performance.now());
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
  }

  initGrid();
  px = Math.floor(COLS / 2); py = 0;
  resize();
  draw(performance.now());
  // Mobile Browser-Toolbars aendern die Viewport-Hoehe oft erst nach dem ersten Layout-Pass
  setTimeout(resize, 200);
  setTimeout(resize, 600);

