  // --- Gadgets: einmal pro Run gewaehlt, mit eigenem Cooldown ---
  const GADGETS = {
    hook:  { label: 'Grapple Hook', icon: '🪝', desc: 'Yank yourself 2 cells forward through open ground.', cooldown: 6000 },
    smoke: { label: 'Smoke Bomb',   icon: '💨', desc: 'Vanish from every guard\'s sight for 2.5s.', cooldown: 10000 }
  };
  const GADGET_HOOK_PULL = 2;
  const GADGET_SMOKE_MS = 2500;
  let gadgetChoice = 'hook';
  let gadgetCooldownUntil = 0;
  let smokeUntil = 0;
  let hookAnim = null; // { ox, oy, dx, dy, reachCells, startTime, mode }
  try {
    const gd = localStorage.getItem('claim_gadget');
    if (gd && GADGETS[gd]) gadgetChoice = gd;
  } catch (e) { /* ignore */ }
  function setGadgetChoice(g) {
    if (!GADGETS[g]) return;
    gadgetChoice = g;
    try { localStorage.setItem('claim_gadget', g); } catch (e) { /* ignore */ }
  }

  // Welt-Punkt -> Bildschirm-Punkt, passend zur Kamera-Transformation in draw().
  function worldToScreen(wx, wy) {
    if (cameraMode === 'follow' || cameraMode === 'push') {
      return [boardCanvas.width / 2, boardCanvas.height / 2];
    }
    return [wx, wy];
  }
  let gameMode = 'normal';
  let cameraMode = 'standard';
  try {
    const m = localStorage.getItem('claim_mode');
    if (m && MODES[m]) gameMode = m;
    const c = localStorage.getItem('claim_camera');
    if (c && CAMERAS[c]) cameraMode = c;
  } catch (e) { /* ignore */ }

  function setGameMode(m) {
    if (!MODES[m]) return;
    gameMode = m;
    try { localStorage.setItem('claim_mode', m); } catch (e) { /* ignore */ }
    loadHighScoreForMode();
  }
  function setCameraMode(c) {
    if (!CAMERAS[c]) return;
    cameraMode = c;
    try { localStorage.setItem('claim_camera', c); } catch (e) { /* ignore */ }
  }

  let grid;
  let bgVignette = null, bgNoisePattern = null;
  // Tiefenschicht: laeuft langsamer als die Kamera und erzeugt so Raumgefuehl
  let bgParallaxPattern = null;
  const PARALLAX_FACTOR = 0.3;
  // 0 = ruhig, 1 = gejagt; treibt die Gitterfarbe und den Pulsrhythmus
  let threatDisp = 0;
  // Energiewellen im Hintergrund: expandierende Ringe an Schluesselmomenten.
  // Position in Zellkoordinaten, damit ein resize (neues CELL) sie nicht verzieht.
  let bgRipples = [];
  function addRipple(cx, cy, maxCells, dur, color, strength) {
    if (bgRipples.length > 12) bgRipples.shift();
    bgRipples.push({ cx, cy, maxCells, dur, color,
                     strength: strength === undefined ? 0.75 : strength,
                     start: performance.now() });
  }
  let px, py, dir, nextDir;
  let prevPx, prevPy, playerStepTime = 0;
  let enemyStepTime = 0;
  let trail = [];
  // Run-Statistik fuer den Game-Over-Screen
  let statBiggestCut = 0, statLongestTrail = 0, statKills = 0, statLevelsCleared = 0;
  function resetRunStats() { statBiggestCut = 0; statLongestTrail = 0; statKills = 0; statLevelsCleared = 0; }
  let enemies = [];
  let powerUps = [];
  let powerUpSpawnTimer = 0;
  let shieldUntil = 0, speedUntil = 0, freezeUntil = 0;
  let confuseUntil = 0, fogUntil = 0, alarmUntil = 0;
  let trailGuardUntil = 0;
  let rapidfireUntil = 0, spikesUntil = 0;
  let slowUntil = 0, swarmUntil = 0, drunkUntil = 0;
  let swarmEnemies = [];
  let shotCooldownUntil = 0;
  let enemyDeathAnims = [];
  let shotProjectiles = [];
  const POWERUP_TYPES = ['speed', 'shield', 'freeze', 'trailguard', 'rapidfire', 'spikes'];
  const POWERUP_COLORS = {
    speed: '#f5d347', shield: '#4f7ee5', freeze: '#7fdcff', trailguard: '#3fd6b0',
    rapidfire: '#ff7a3d', spikes: '#c9752e'
  };
  const POWERUP_SYMBOLS = {
    speed: '⚡', shield: '◆', freeze: '❄', trailguard: '🔗',
    rapidfire: '🔫', spikes: '🦔'
  };
  const POWERDOWN_TYPES = ['confuse', 'fog', 'alarm', 'slow', 'swarm', 'drunk'];
  const POWERDOWN_COLORS = {
    confuse: '#8a3fa0', fog: '#5a5a62', alarm: '#c23a2e',
    slow: '#4a6b8a', swarm: '#8a2f2f', drunk: '#caa14a'
  };
  const POWERDOWN_SYMBOLS = {
    confuse: '🌀', fog: '🌫️', alarm: '🚨',
    slow: '🐌', swarm: '👥', drunk: '🍺'
  };
  const ALL_ICON_COLORS = Object.assign({}, POWERUP_COLORS, POWERDOWN_COLORS);
  const ALL_ICON_SYMBOLS = Object.assign({}, POWERUP_SYMBOLS, POWERDOWN_SYMBOLS);
  const ALL_ICON_NAMES = {
    speed: 'Speed Boost', shield: 'Shield', freeze: 'Freeze', trailguard: 'Trail Guard',
    rapidfire: 'Rapid Fire', spikes: 'Spikes',
    confuse: 'Confused!', fog: 'Fog', alarm: 'Alarm!',
    slow: 'Slowed!', swarm: 'Reinforcements!', drunk: 'Drunk!'
  };
  const MYSTERY_COLOR = '#c9cdd6';
  const MYSTERY_SYMBOL = '?';
  const ALL_MYSTERY_TYPES = POWERUP_TYPES.concat(POWERDOWN_TYPES);
  const ROULETTE_MS = 500;
  const ROULETTE_STEP_MS = 55;
  const REVEAL_HOLD_MS = 700;
  let score, level, capturedPct, gameOver, paused, running;
  let prevStatsScore = 0;
  let lives = 3;
  let highScore = 0;

  function highScoreKey() { return 'claim_highscore_' + gameMode; }

  function loadHighScoreForMode() {
    let v = 0;
    try {
      const stored = localStorage.getItem(highScoreKey());
      if (stored !== null) {
        v = parseInt(stored, 10) || 0;
      } else if (gameMode === 'normal') {
        // Alter, modus-loser Rekord wird zum Normal-Rekord.
        v = parseInt(localStorage.getItem('claim_highscore') || '0', 10) || 0;
      }
    } catch (e) { v = 0; }
    highScore = v;
  }
  loadHighScoreForMode();

  function saveHighScoreIfNeeded() {
    if (score > highScore) {
      highScore = score;
      try { localStorage.setItem(highScoreKey(), String(highScore)); } catch (e) { /* ignore */ }
      return true;
    }
    return false;
  }

  const ACHIEVEMENTS = {
    first_level: { emoji: '🎯', title: 'First Taste of Blood' },
    speed_demon: { emoji: '⚡', title: 'Speed Rush' },
    untouchable: { emoji: '🛡️', title: 'Untouchable' },
    gambler: { emoji: '💰', title: 'Gambler' }
  };
  let unlockedAchievements = {};
  try { unlockedAchievements = JSON.parse(localStorage.getItem('claim_achievements') || '{}'); } catch (e) { unlockedAchievements = {}; }

  let achievementQueue = [];
  let achievementShowing = false;

  function unlockAchievement(id) {
    if (unlockedAchievements[id]) return;
    unlockedAchievements[id] = true;
    try { localStorage.setItem('claim_achievements', JSON.stringify(unlockedAchievements)); } catch (e) { /* ignore */ }
    achievementQueue.push(id);
    processAchievementQueue();
  }

  function processAchievementQueue() {
    if (achievementShowing || achievementQueue.length === 0) return;
    achievementShowing = true;
    const id = achievementQueue.shift();
    const a = ACHIEVEMENTS[id];
    const banner = document.getElementById('achievementBanner');
    document.getElementById('achEmoji').textContent = a.emoji;
    document.getElementById('achTitle').textContent = 'Achievement: ' + a.title;
    sndAchievement();
    requestAnimationFrame(() => banner.classList.add('show'));
    setTimeout(() => {
      banner.classList.remove('show');
      setTimeout(() => {
        achievementShowing = false;
        processAchievementQueue();
      }, 450);
    }, 2400);
  }

  let boostsRemaining = 3;
  let boostsMax = 3;
  // Kaufmoment: dauerhafte Upgrades fuer den laufenden Run
  let perks = null;
  function defaultPerks() {
    return { lives: 0, shotSpeed: 0, moveSpeed: 0, payday: 0, kevlar: 0, boosts: 0, duration: 0, stealth: 0 };
  }
  perks = defaultPerks();

  const PERK_CARDS = [
    { id: 'life',     icon: '❤️', name: 'Spare life',   desc: 'One extra life, right now.',                    max: 99, apply: () => { perks.lives++; lives++; updateStats(); } },
    { id: 'shot',     icon: '🔫', name: 'Quick draw',   desc: 'Shots recharge 25% faster.',                    max: 3,  apply: () => perks.shotSpeed++ },
    { id: 'move',     icon: '👟', name: 'Light feet',   desc: 'You move 10% faster.',                          max: 3,  apply: () => perks.moveSpeed++ },
    { id: 'payday',   icon: '💰', name: 'Payday',       desc: 'Captured cells pay 25% more.',                  max: 4,  apply: () => perks.payday++ },
    { id: 'kevlar',   icon: '🛡️', name: 'Kevlar vest',  desc: 'Start every level with a 3s shield.',           max: 2,  apply: () => perks.kevlar++ },
    { id: 'boosts',   icon: '⚡', name: 'Spare cells',  desc: 'Two more boosts per level.',                    max: 3,  apply: () => { perks.boosts++; boostsRemaining += 2; boostsMax += 2; updateStats(); } },
    { id: 'duration', icon: '⏳', name: 'Slow burn',    desc: 'Power-ups last 50% longer.',                    max: 2,  apply: () => perks.duration++ },
    { id: 'stealth',  icon: '👁️', name: 'Low profile',  desc: 'Guards spot you one cell later.',               max: 3,  apply: () => perks.stealth++ }
  ];
  function perkCount(id) {
    if (id === 'life') return perks.lives;
    if (id === 'shot') return perks.shotSpeed;
    if (id === 'move') return perks.moveSpeed;
    if (id === 'payday') return perks.payday;
    if (id === 'kevlar') return perks.kevlar;
    if (id === 'boosts') return perks.boosts;
    if (id === 'duration') return perks.duration;
    if (id === 'stealth') return perks.stealth;
    return 0;
  }
  function powerDurationFactor() { return 1 + perks.duration * 0.5; }
  let comboCount = 0;
  let prevNearestDist = 99;
  let nearMissCooldownUntil = 0;
  let nearMissPopups = [];
  let comboPopups = [];
  let revealPopups = [];
  let fireworkParticles = [];
  let levelReadyToComplete = false;
  let lifeLostThisLevel = false;
  let gamblerStreak = 0;
  let milestone25Shown = false, milestone50Shown = false;
  let milestonePopups = [];
  let dustParticles = [];
  let smokeParticles = [];
  let emotePopups = [];

  function spawnEmote(emoji, x, y) {
    emotePopups.push({ emoji, x, y, startTime: performance.now() });
  }
  let lastDustSpawn = 0;
  let lastSmokeSpawn = 0;
  let celebrating = false;
  let shakeMagnitude = 0, shakeDuration = 1, shakeEndTime = 0;

  let slowMoUntil = 0;
  function triggerSlowMo(ms) { slowMoUntil = performance.now() + ms; }

  function triggerShake(magnitude, duration) {
    shakeMagnitude = magnitude;
    shakeDuration = duration;
    shakeEndTime = performance.now() + duration;
  }

  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* ignore */ }
  }

  function lerpColor(c1, c2, t) {
    const r1 = parseInt(c1.slice(1,3),16), g1 = parseInt(c1.slice(3,5),16), b1 = parseInt(c1.slice(5,7),16);
    const r2 = parseInt(c2.slice(1,3),16), g2 = parseInt(c2.slice(3,5),16), b2 = parseInt(c2.slice(5,7),16);
    const r = Math.round(r1 + (r2-r1)*t), g = Math.round(g1 + (g2-g1)*t), b = Math.round(b1 + (b2-b1)*t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function trailRiskColor(len) {
    const stops = ['#63c96a', '#f5d347', '#e89b3d', '#e3574a'];
    const segments = stops.length - 1;
    const t = Math.min(1, len / 16) * segments;
    const idx = Math.min(segments - 1, Math.floor(t));
    return lerpColor(stops[idx], stops[idx + 1], t - idx);
  }
  let lifeLostFlag = false;
  let playerInterval, enemyInterval;
  let playerTimer, enemyTimer;
  let rafId, lastTime;
  const MAX_FRAME_DELTA = 100; // ms - Obergrenze fuer einen Simulationsschritt
  let flashCells = [];
  let freezeWasActive = false;
  let thawFlashUntil = 0;
  let gameOverEmoji = '';
  let dying = false;
  let countdownActive = false, countdownStartTime = 0;
  const COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'];
  const COUNTDOWN_STEP_MS = 500;

  function isObstacle(v) { return v === BLOCK || v === PIT; }

  function totalCells() {
    let blocked = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isObstacle(grid[r][c])) blocked++;
    return COLS * ROWS - blocked;
  }

  function initGrid() {
    grid = Array.from({length: ROWS}, () => Array(COLS).fill(EMPTY));
    for (let c = 0; c < COLS; c++) { grid[0][c] = TERRITORY; grid[ROWS-1][c] = TERRITORY; }
    for (let r = 0; r < ROWS; r++) { grid[r][0] = TERRITORY; grid[r][COLS-1] = TERRITORY; }
  }

