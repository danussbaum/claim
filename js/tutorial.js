  // ===================== Tutorial =====================
  let tutorialActive = false;
  let tutorialStage = 0;
  let tutorialGuardsStand = false;
  let tutorialStageDoneAt = 0;
  let tutorialAllowCashOut = false;
  let tutorialSavedGadget = null;
  // Setzt fuer eine Etappe ein bestimmtes Gadget, ohne die gespeicherte Wahl anzufassen.
  function tutorialUseGadget(which) {
    if (tutorialSavedGadget === null) tutorialSavedGadget = gadgetChoice;
    gadgetChoice = which;
    gadgetCooldownUntil = 0;
    updateGadgetButtonIcon();
  }
  function tutorialRestoreGadget() {
    if (tutorialSavedGadget !== null) {
      gadgetChoice = tutorialSavedGadget;
      tutorialSavedGadget = null;
      updateGadgetButtonIcon();
    }
  }
  const tutorialFlags = {
    captured: false, killed: false, bonus: false,
    lineCut: false, selfShot: false, gadgetUsed: false,
    boost: false, orb: false, cashedOut: false,
    hookUsed: false, smokeUsed: false
  };
  function tutorialDone() {
    try { return localStorage.getItem('claim_tutorial_done') === '1'; } catch (e) { return false; }
  }
  function markTutorialDone() {
    try { localStorage.setItem('claim_tutorial_done', '1'); } catch (e) { /* ignore */ }
  }
  function resetTutorialFlags() {
    for (const k of Object.keys(tutorialFlags)) tutorialFlags[k] = false;
  }
  function tutorialFlag(name) {
    if (tutorialActive) tutorialFlags[name] = true;
  }

  function setCells(cells, val) {
    for (const [c, r] of cells) {
      if (r > 0 && r < ROWS - 1 && c > 0 && c < COLS - 1) grid[r][c] = val;
    }
  }
  function tutorialSpawnAt(c, r, personality) {
    const e = {
      r, c, prevR: r, prevC: c, personality,
      dc0: 0, dr0: 1, angleDisp: undefined,
      wasHunting: false, huntingActive: false, huntCooldownUntil: 0, lastSeenAt: -99999
    };
    enemies.push(e);
    return e;
  }

  // Hilfen fuer den Aufbau einzelner Etappen
  function tutorialPlaceOrb(c, r, type, kind) {
    powerUps.push({ r, c, type, kind, spawnTime: performance.now() });
  }
  function tutorialAddMovingBlock(c, r, dc, dr) {
    grid[r][c] = BLOCK;
    movingBlocks.push({ r, c, prevR: r, prevC: c, dr, dc, timer: 0 });
  }
  // Fuellt das Feld von unten auf, damit die 75%-Schwelle in wenigen Zuegen erreichbar ist.
  function tutorialPrefillTerritory(fromRow) {
    for (let r = fromRow; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) grid[r][c] = TERRITORY;
    }
    updateStats();
  }

  const TUTORIAL_STAGES = [
    {
      hint: () => (IS_TOUCH
        ? 'Swipe anywhere on the board to steer - the arrow buttons work too. '
        : 'Steer with the arrow keys or the buttons below. ')
        + 'Walk into the open field, draw a line, and come back to the green border to enclose the area.',
      setup: () => {},
      done: () => tutorialFlags.captured
    },
    {
      hint: 'Tap the ⚡ button - or press the direction you are already running in - to burn one boost for a short sprint. Three per level.',
      setup: () => {},
      done: () => tutorialFlags.boost
    },
    {
      hint: 'Guards patrol the field - face one and press the crosshair (or spacebar) to take it out. '
        + 'Their colour is their type: red wanders, bright red hunts, purple lurks, orange is jumpy, teal cuts your line.',
      setup: () => { tutorialSpawnAt(4, 10, 'wanderer'); },
      done: () => tutorialFlags.killed
    },
    {
      hint: 'Guards only chase what they see. This one stands still - sneak around its cone and enclose another area.',
      setup: () => { tutorialGuardsStand = true; tutorialSpawnAt(7, 9, 'hunter'); },
      done: () => tutorialFlags.captured
    },
    {
      hint: 'Grey pillars block you and the guards, black pits stop only you. The pillar with the arrow roams and cuts any line it rolls over. Enclose an area around them.',
      setup: () => {
        setCells([[4,6],[5,6],[9,6],[8,6],[4,13],[9,13]], BLOCK);
        setCells([[6,10],[7,10],[6,11],[7,11]], PIT);
        tutorialAddMovingBlock(3, 8, 1, 0);
      },
      done: () => tutorialFlags.captured
    },
    {
      hint: 'Grab the ❓ orb. Every orb is a gamble: it rolls and turns into a power-up or a power-down.',
      setup: () => {
        tutorialPlaceOrb(7, 6, 'shield', 'up');
        tutorialPlaceOrb(4, 11, 'speed', 'up');
      },
      done: () => tutorialFlags.orb
    },
    {
      hint: 'The golden zone pays triple. Enclose all of it in one go.',
      setup: () => {
        bonusCells = [{r: 11, c: 6}, {r: 11, c: 7}, {r: 12, c: 6}, {r: 12, c: 7}];
        bonusClaimed = false;
        tutorialSpawnAt(11, 4, 'wanderer');
      },
      done: () => tutorialFlags.bonus
    },
    {
      hint: 'The teal Cutter hunts your line, not you. Draw a long line into the open and let it reach the line - you lose the line, not a life.',
      setup: () => { tutorialSpawnAt(7, 8, 'cutter'); },
      done: () => tutorialFlags.lineCut
    },
    {
      hint: 'Trapped by your own line? Draw a line, turn around and shoot it - one block per shot, 100 points each.',
      setup: () => {},
      done: () => tutorialFlags.selfShot
    },
    {
      hint: () => 'Gadget one, the ' + GADGETS.hook.label + ' ' + GADGETS.hook.icon + ': press the blue button (or Shift). '
        + GADGETS.hook.desc + ' It stops at pillars and walls.',
      setup: () => { tutorialUseGadget('hook'); setCells([[7,9],[8,9],[9,9]], BLOCK); },
      done: () => tutorialFlags.hookUsed
    },
    {
      hint: () => 'Gadget two, the ' + GADGETS.smoke.label + ' ' + GADGETS.smoke.icon + ': same button. '
        + GADGETS.smoke.desc + ' Guards lose your trail while it lasts. Pick your favourite before each run.',
      setup: () => { tutorialUseGadget('smoke'); tutorialSpawnAt(7, 10, 'hunter'); },
      done: () => tutorialFlags.smokeUsed
    },
    {
      hint: 'Almost there: past 75% the ⏸ button turns into 💰. Enclose one more strip, then cash out - or push on for a bigger risk bonus.',
      setup: () => {
        tutorialAllowCashOut = true;
        tutorialPrefillTerritory(8);
      },
      done: () => tutorialFlags.cashedOut
    }
  ];

  function showTutorialBar(text, stepLabel, doneStyle) {
    const bar = document.getElementById('tutorialBar');
    const wasHidden = bar.classList.contains('hidden');
    bar.classList.remove('hidden');
    bar.classList.toggle('done', !!doneStyle);
    document.getElementById('tutorialStep').textContent = stepLabel;
    document.getElementById('tutorialHint').textContent = text;
    if (wasHidden) resize();
  }
  function hideTutorialBar() {
    const bar = document.getElementById('tutorialBar');
    if (bar.classList.contains('hidden')) return;
    bar.classList.add('hidden');
    resize();
  }

  function applyTutorialStage(idx) {
    tutorialStage = idx;
    tutorialStageDoneAt = 0;
    tutorialGuardsStand = false;
    tutorialAllowCashOut = false;
    resetTutorialFlags();
    resetLevel(1);
    bonusCells = [];
    bonusClaimed = false;
    movingBlocks = [];
    enemies = [];
    powerUps = [];
    TUTORIAL_STAGES[idx].setup();
    const hint = TUTORIAL_STAGES[idx].hint;
    showTutorialBar(typeof hint === 'function' ? hint() : hint,
                    'Step ' + (idx + 1) + ' of ' + TUTORIAL_STAGES.length, false);
  }

  function startTutorial() {
    tutorialActive = true;
    hasStarted = true;
    modeSelectOpen = false;
    document.getElementById('modeSelect').classList.add('hidden');
    document.getElementById('tutorialBtn').classList.add('hidden');
    document.getElementById('modeBtn').classList.add('hidden');
    resetGame();
    lives = 3;
    applyTutorialStage(0);
    hideOverlay();
    dying = false;
    gameOver = false;
    document.getElementById('board-wrap').classList.remove('dimming');
    running = true;
    lastTime = 0;
    triggerStartCountdown();
    draw(performance.now());
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    resetMusicTiming();
  }

  function stopTutorial() {
    tutorialActive = false;
    tutorialAllowCashOut = false;
    levelReadyToComplete = false;
    tutorialRestoreGadget();
    tutorialGuardsStand = false;
    hideTutorialBar();
    running = false;
    cancelAnimationFrame(rafId);
    document.getElementById('board-wrap').classList.remove('dimming');
    dying = false;
    gameOver = false;
    hasStarted = false;
    resetMenuThemeTiming();
    updateStats();
    updateActionButtonsUI();
    openModeSelect();
  }

  function finishTutorial() {
    markTutorialDone();
    tutorialActive = false;
    tutorialAllowCashOut = false;
    levelReadyToComplete = false;
    tutorialRestoreGadget();
    tutorialGuardsStand = false;
    hideTutorialBar();
    running = false;
    cancelAnimationFrame(rafId);
    hasStarted = false;
    sndVictoryFanfare();
    resetMenuThemeTiming();
    updateStats();
    updateActionButtonsUI();
    openModeSelect();
    document.getElementById('overlayTitle').textContent = '🎓 Tutorial complete';
  }

  // Nach einem Fehltritt im Tutorial: nur die Etappe neu aufbauen, kein Leben weg.
  function tutorialRetryStage(reason) {
    showTutorialBar(reason + ' No harm done - try again.', 'Step ' + (tutorialStage + 1) + ' of ' + TUTORIAL_STAGES.length, false);
    const idx = tutorialStage;
    setTimeout(() => {
      if (!tutorialActive) return;
      applyTutorialStage(idx);
      document.getElementById('board-wrap').classList.remove('dimming');
      dying = false;
      gameOver = false;
      running = true;
      lastTime = 0;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
    }, 900);
  }

  function updateTutorial() {
    if (!tutorialActive) return;
    const stage = TUTORIAL_STAGES[tutorialStage];
    const now = performance.now();
    if (!tutorialStageDoneAt) {
      if (stage.done()) {
        tutorialStageDoneAt = now;
        showTutorialBar('✓ Got it!', 'Step ' + (tutorialStage + 1) + ' of ' + TUTORIAL_STAGES.length, true);
        sndPowerUp('shield');
      }
      return;
    }
    if (now - tutorialStageDoneAt > 1200) {
      if (tutorialStage + 1 >= TUTORIAL_STAGES.length) finishTutorial();
      else applyTutorialStage(tutorialStage + 1);
    }
  }

  let hasStarted = false;
  let audioUnlocked = false;
  let obIndex = 0;
  let onboardingDone = false;
  // Die Mechaniken erklaert jetzt das Tutorial. Hier bleibt nur, was sich im Spiel
  // schlecht nebenbei vermitteln laesst: die Farben der Waechtertypen.
  const obSteps = [
    {
      icon: '✏️',
      title: 'How to play',
      html: '<span style="display:block;margin-bottom:7px;">Draw a line across open ground and come back to your territory to claim it. Guards want to stop you:</span>'
        + '<span class="legendRow"><span class="dotSwatch" style="background:#e3574a"></span>Wanderer - moves randomly</span>'
        + '<span class="legendRow"><span class="dotSwatch" style="background:#ff4d3d"></span>Hunter - chases what it sees</span>'
        + '<span class="legendRow"><span class="dotSwatch" style="background:#9b4fd6"></span>Guardian - lurks in open field</span>'
        + '<span class="legendRow"><span class="dotSwatch" style="background:#e8935c"></span>Nervous - unpredictable</span>'
        + '<span class="legendRow"><span class="dotSwatch" style="background:#2fb8c9"></span>Cutter - cuts your line, not your life</span>'
        + '<span style="display:block;margin-top:7px;">Everything else is best learned by playing - the tutorial walks you through it.</span>'
    }
  ];

  function renderOnboardStep() {
    const step = obSteps[obIndex];
    document.getElementById('obIcon').textContent = step.icon;
    document.getElementById('obTitle').textContent = step.title;
    const textEl = document.getElementById('obText');
    if (step.html) textEl.innerHTML = step.html; else textEl.textContent = step.text;
    const dotsEl = document.getElementById('obDots');
    dotsEl.innerHTML = '';
    if (obSteps.length > 1) {
      obSteps.forEach((_, i) => {
        const d = document.createElement('span');
        d.className = 'dot' + (i === obIndex ? ' active' : '');
        dotsEl.appendChild(d);
      });
    }
    document.getElementById('skipBtn').classList.toggle('hidden', obSteps.length <= 1);
    document.getElementById('startBtn').textContent = (obIndex === obSteps.length - 1) ? 'Got it' : 'Next →';
  }
  renderOnboardStep();
  // Die Erklaerkarte entfaellt - das Tutorial uebernimmt das. Der erste Tipp
  // schaltet nur noch den Ton frei und fuehrt direkt zur Modusauswahl.
  finishOnboarding();

  function finishOnboarding() {
    onboardingDone = true;
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('skipBtn').classList.add('hidden');
    document.getElementById('overlayText').classList.remove('hidden');
    document.getElementById('overlayText').textContent = 'Draw a line, come back, take the ground. Tap once to enable sound.';
    document.getElementById('startBtn').textContent = 'Start';
  }
