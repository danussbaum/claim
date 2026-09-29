  // --- Gadgets: einmal pro Run gewaehlt, mit eigenem Cooldown ---
  const GADGETS = {
    hook:  { label: 'Grapple Hook', icon: '🪝', desc: 'Yank yourself 2 cells forward through open ground.', cooldown: 6000 },
    smoke: { label: 'Smoke Bomb',   icon: '💨', desc: 'Vanish from every guard\'s sight for 2.5s.', cooldown: 10000 },
    mine:  { label: 'Mine',         icon: '💣', desc: 'Drop a mine on a free cell next to you. It kills guards next to it, frees claimed cells around it, and kills the rival in 2 player. Max 3.', cooldown: 8000 }
  };
  const GADGET_HOOK_PULL = 2;
  const GADGET_SMOKE_MS = 2500;
  const MINE_ARM_MS = 500, MINE_MAX = 3;
  const MINE_CRATER = 2.2; // Radius, in dem eroberte Felder wieder frei werden
  let mines = []; // { c, r, armedAt, foe } - im 2-Spieler-Modus kommt die Liste aus dem Zustand
  // Wohin die Mine faellt: nicht unter die Figur (dort liegt die eigene Linie, die beim
  // Schliessen zu Gebiet wird und die Mine nutzlos macht), sondern auf ein freies Nachbarfeld.
  // Zuerst seitlich zur Laufrichtung, dann vorne, zuletzt hinten. null = kein freies Feld.
  function mineDropCell(x, y, d, isFree) {
    const [dx, dy] = dirDelta(d);
    const order = [[-dy, dx], [dy, -dx], [dx, dy], [-dx, -dy]];
    for (const [ox, oy] of order) {
      const c = x + ox, r = y + oy;
      if (c >= 0 && r >= 0 && c < COLS && r < ROWS && isFree(c, r)) return [c, r];
    }
    return null;
  }
  // Felder [c, r] im Explosionskrater; der Rand bleibt (Startland, nicht erobert)
  function mineCraterCells(cx, cy) {
    const out = [];
    const R = Math.ceil(MINE_CRATER);
    for (let r = cy - R; r <= cy + R; r++) {
      for (let c = cx - R; c <= cx + R; c++) {
        if (c < 1 || r < 1 || c > COLS - 2 || r > ROWS - 2) continue;
        if (Math.hypot(c - cx, r - cy) <= MINE_CRATER) out.push([c, r]);
      }
    }
    return out;
  }
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
  let slowUntil = 0, swarmUntil = 0, drunkUntil = 0, psyloUntil = 0;
  // Chaos-Power-downs (nur im Chaos-Modus im Pool)
  let duckUntil = 0, heliumUntil = 0, discoUntil = 0;
  let bananaSlide = 0;      // verbleibende Rutsch-Schritte
  let bananaPeels = [];     // { c, r } liegengebliebene Schalen, Waechter rutschen darauf aus
  const DUCK_MS = 5000, HELIUM_MS = 6000, DISCO_MS = 4000;
  const BANANA_SLIDE = 3, DUCK_QUACK_RADIUS = 4, HELIUM_EXTRA_RANGE = 3;
  let swarmEnemies = [];
  // Ablenkung: Power-up gibt Wuerfe, Waechter in der Naehe laufen zur Aufschlagstelle
  const DECOY_CHARGES = 2, DECOY_MAX = 3, DECOY_RANGE = 4, DECOY_LURE_RADIUS = 5, DECOY_MS = 3000;
  let decoyCharges = 0;
  let decoys = []; // { c, r, start, until }
  // Stealth: wurde die aktuelle Linie von einem Waechter gesehen?
  const STEALTH_MULT = 1.5;
  let trailSpotted = false;

  // --- Waechter-Persoenlichkeit: Sprechblasen, Stolpern, Kaffeepause, Stau ---
  const GUARD_LINES = {
    spotted: [
      'Hey!', 'There!', 'Gotcha!', 'Stop right there!', 'I see you!',
      'Intruder!', 'Freeze!', 'Found you!', 'You\'re mine!', 'Halt!',
      'Over here!', 'Not so fast!', 'Caught you!', 'Aha!', 'Busted!',
      'Don\'t move!', 'Target spotted!', 'Oi, you!', 'Get back here!', 'Peekaboo!'
    ],
    lost: [
      '...must be the wind.', 'Huh?', 'Where did it go?', 'Nothing here.', 'Weird.',
      'I swear it was here.', 'Lost it.', 'Hmm...', 'Was I dreaming?', 'Probably a cat.',
      'Back to patrol.', 'I\'ll get you next time!', 'Where are you?', 'Just my imagination.', 'Did anyone see that?',
      'Ghosts again?', 'Need new glasses.', 'Whatever.'
    ],
    decoy: [
      'A rock?!', 'Who throws rocks?!', 'What was that?', 'Ooh, shiny!', 'Did that rock move?',
      'Rock! Suspicious!', 'Hello, rock?', 'Must investigate!', 'Is that... gravel?', 'Who\'s there?',
      'I heard something!', 'Nice rock.', 'Rocks don\'t fly!', 'Sounded like trouble.'
    ],
    stuck: [
      'Uh... help?', 'Not again!', 'Let me out!', 'Mommy?', 'This is fine.',
      'Claustrophobic!', 'Walls everywhere!', 'I want my lawyer!', 'I\'ve been framed!', 'Tell my wife...',
      'Unfair!', 'Oh no...'
    ],
    trip: [
      'Whoa!', 'Oof!', 'My ankle!', 'Who put that there?!', 'Ouch!',
      'I meant to do that.', 'Stupid hole!', 'Nobody saw that.', 'My knee!', 'Graceful as always.',
      'Floor attacked me!', 'Ow ow ow!', 'Physics!', 'Mind the gap...'
    ],
    break: [
      'Coffee time.', 'Five minutes...', 'zzz', 'Union break!', 'Espresso o\'clock.',
      'Just resting my eyes.', 'Break time!', 'Need caffeine.', 'Not my shift.', 'Do not disturb.',
      'Mmm, decaf.', 'Donut time.'
    ],
    jam: [
      'Move!', 'You move!', 'After you.', 'Hey, my spot!', 'Excuse me?!',
      'Get out of my way!', 'Traffic jam!', 'I was here first!', 'Rude!', 'Budge over!',
      'Watch it!', 'Honk honk!'
    ]
  };
  const BUBBLE_MS = 1600;
  const GUARD_TRIP_CHANCE = 0.25;   // jagender Waechter tritt auf eine Grube
  const GUARD_TRIP_MS = 1000;
  const GUARD_BREAK_CHANCE = 0.004; // pro Waechterschritt, nur wenn ruhig
  const GUARD_BREAK_MS = 3000;
  const BREAK_SNEAK_BONUS = 25;
  let guardBubbles = []; // { e, x, y, text, start }
  let lastGuardLine = '';
  const GUARD_NAMES = ['Kevin', 'Gary', 'Steve', 'Bob', 'Dave', 'Karen', 'Brenda', 'Frank',
    'Greg', 'Linda', 'Chad', 'Doris', 'Nigel', 'Barry', 'Sandra', 'Hank'];
  const DOG_NAMES = ['Rex', 'Bello', 'Fido', 'Brutus', 'Waldi'];
  const DOG_LINES = ['Woof!', 'Woof woof!', 'Grrr... woof!', 'Arf arf!', 'Bark!'];
  function guardName(personality) {
    const pool = personality === 'dog' ? DOG_NAMES : GUARD_NAMES;
    const used = enemies.map(o => o.name);
    const free = pool.filter(n => !used.includes(n));
    const from = free.length ? free : pool;
    return from[Math.floor(Math.random() * from.length)];
  }
  function guardSay(e, kind, force) {
    const now = performance.now();
    if (!force && now - (e.lastBubbleAt || 0) < 2500) return;
    if (!force && guardBubbles.length >= 3) return;
    const pool = e.personality === 'dog' ? DOG_LINES : GUARD_LINES[kind];
    e.lastBubbleAt = now;
    guardBubbles = guardBubbles.filter(b => b.e !== e);
    // Nie zweimal hintereinander derselbe Spruch
    let text = pool[Math.floor(Math.random() * pool.length)];
    if (text === lastGuardLine) text = pool[(pool.indexOf(text) + 1) % pool.length];
    lastGuardLine = text;
    guardShout(e, text);
  }
  // Freier Text: Sprechblase mit Namen plus Stimme
  function guardShout(e, text) {
    const now = performance.now();
    e.lastBubbleAt = now;
    guardBubbles = guardBubbles.filter(b => b.e !== e);
    guardBubbles.push({ e, x: e.c, y: e.r, text: (e.name ? e.name + ': ' : '') + text, start: now });
    if (e.voiceShift === undefined) e.voiceShift = 0.8 + Math.random() * 0.45; // jeder Waechter hat seine eigene Stimmlage
    if (voiceMode === 'gibberish') sndGibberish(text, e.personality, e.voiceShift);
    else if (voiceMode === 'speech') guardSpeak(e, text);
  }

  // Stimmen der Waechter: Kauderwelsch, Sprachausgabe oder nichts
  const VOICE_MODES = {
    gibberish: { label: 'Gibberish', desc: 'Guards babble.' },
    speech: { label: 'Speech', desc: 'Guards speak their lines.' },
    off: { label: 'Off', desc: 'Guards are silent.' }
  };
  let voiceMode = 'gibberish';
  try {
    const v = localStorage.getItem('claim_voice');
    if (v && VOICE_MODES[v]) voiceMode = v;
  } catch (e) { /* ignore */ }
  function setVoiceMode(v) {
    if (!VOICE_MODES[v]) return;
    voiceMode = v;
    try { localStorage.setItem('claim_voice', v); } catch (e) { /* ignore */ }
    if (v !== 'speech' && window.speechSynthesis) speechSynthesis.cancel();
    if (v !== 'speech') voiceStop();
  }
  // Todesschrei beim Abschuss: unterbricht einen laufenden Spruch
  const GUARD_SCREAMS = ['Aaaaargh!', 'Noooooo!', 'Aaaaah!', 'Argh!', 'Waaaah!', 'Uaaaargh!'];
  function guardScream(e) {
    const text = GUARD_SCREAMS[Math.floor(Math.random() * GUARD_SCREAMS.length)];
    if (voiceMode === 'gibberish') {
      sndGibberish(text, e.personality, (e.voiceShift || 1) * 1.3);
    } else if (voiceMode === 'speech') {
      if (window.speechSynthesis) speechSynthesis.cancel();
      guardSpeak(e, text, true);
    }
  }
  // Andere Waechter reagieren auf einen Tod: rufen den Namen und werden wuetend
  const REACT_LINES = ['Nooo, {n}!', '{n}! You monster!', 'You got {n}!', 'Avenge {n}!', 'Not {n}!', '{n}, nooo!'];
  const ENRAGE_MS = 4000;
  function guardReactToDeath(dead) {
    if (!dead.name || !enemies.length) return;
    let best = null, bestD = Infinity;
    for (const o of enemies) {
      if (o.personality === 'dog') continue;
      const d = Math.abs(o.c - dead.c) + Math.abs(o.r - dead.r);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (!best) return;
    const o = best;
    setTimeout(() => {
      if (!running || gameOver || enemies.indexOf(o) === -1) return;
      const now = performance.now();
      const line = REACT_LINES[Math.floor(Math.random() * REACT_LINES.length)].replace('{n}', dead.name);
      o.enragedUntil = now + ENRAGE_MS;
      o.huntingActive = true;
      o.lastSeenAt = now + ENRAGE_MS - VISION_MEMORY; // jagt eine Weile auch ohne Sicht weiter
      o.stunnedUntil = 0; o.breakUntil = 0;
      spawnEmote('😡', o.c, o.r);
      guardShout(o, line);
    }, 1100);
  }

  // Ansager fuer Multikills und Trickschuesse
  function announce(text) {
    if (voiceMode !== 'speech') return;
    // Kurz warten, damit der Todesschrei noch zu hoeren ist
    setTimeout(() => announceNow(text), 650);
  }
  function announceNow(text) {
    if (voicePlayAnnouncer(text)) return;
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    const voices = guardVoices();
    if (voices.length) { u.voice = voices[0]; if (/^en/i.test(u.voice.lang)) u.lang = u.voice.lang; }
    u.pitch = 0.3; u.rate = 0.9; u.volume = volumes.voice;
    speechSynthesis.speak(u);
  }

  const GUARD_GROWLS = ['Grrr!', 'Hey!', 'Oi!', 'Argh!', 'Hah!', 'You!'];
  function guardVoices() {
    if (!window.speechSynthesis) return [];
    const all = speechSynthesis.getVoices();
    const en = all.filter(v => /^en/i.test(v.lang));
    return en.length ? en : all;
  }
  function guardSpeak(e, text, scream) {
    if (voicePlayGuard(e, text, scream)) return; // MP3-Datei vorhanden
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    // Laeuft schon ein Spruch, wird der neue unterdrueckt
    if (!scream && (synth.speaking || synth.pending)) return;
    // Jeder Waechter bekommt einmalig eigene Stimme, Tonhoehe und Tempo
    if (!e.speechVoice) {
      const voices = guardVoices();
      e.speechVoice = {
        idx: Math.floor(Math.random() * 1000),
        pitch: 0.1 + Math.random() * 0.4,  // sehr tief = bedrohlich
        rate: 1.2 + Math.random() * 0.3    // zuegig, aber verstaendlich
      };
      if (!voices.length) e.speechVoice.idx = -1;
    }
    const sv = e.speechVoice;
    // Ausrufezeichen statt Punkt: klingt bei vielen Stimmen schaerfer
    // Ausrufezeichen statt Punkt und ab und zu ein Knurren davor: klingt schaerfer
    let spoken = text.replace(/\.+$/, '!').replace(/([^!?])$/, '$1!').replace(/!+$/, '!!!');
    if (!scream && Math.random() < 0.4) {
      spoken = GUARD_GROWLS[Math.floor(Math.random() * GUARD_GROWLS.length)] + ' ' + spoken;
    }
    const u = new SpeechSynthesisUtterance(spoken);
    const voices = guardVoices();
    // Sprache immer Englisch setzen, sonst liest das Handy mit deutscher Stimme vor
    u.lang = 'en-US';
    if (voices.length) {
      u.voice = voices[Math.abs(sv.idx) % voices.length];
      if (/^en/i.test(u.voice.lang)) u.lang = u.voice.lang;
    }
    u.pitch = sv.pitch;
    u.rate = sv.rate;
    if (scream) { u.pitch = Math.min(2, sv.pitch + 0.8); u.rate = 1.1; }
    u.volume = volumes.voice;
    synth.speak(u);
  }
  // Benommen oder in der Pause: sieht nichts
  function guardBlind(e, now) {
    return now < (e.stunnedUntil || 0) || now < (e.breakUntil || 0);
  }
  let shotCooldownUntil = 0;
  let enemyDeathAnims = [];
  let shotProjectiles = [];
  const POWERUP_TYPES = ['speed', 'shield', 'freeze', 'trailguard', 'rapidfire', 'spikes', 'decoy'];
  // Grunddauer der Effekte in ms (1-Spieler und Versus)
  const POWER_MS = { speed: 4000, shield: 4000, freeze: 3000, trailguard: 5000, rapidfire: 5000, spikes: 5000, slow: 4000 };
  const POWERUP_COLORS = {
    speed: '#f5d347', shield: '#4f7ee5', freeze: '#7fdcff', trailguard: '#3fd6b0',
    rapidfire: '#ff7a3d', spikes: '#c9752e', decoy: '#a89f8c'
  };
  const POWERUP_SYMBOLS = {
    speed: '⚡', shield: '◆', freeze: '❄', trailguard: '🔗',
    rapidfire: '🔫', spikes: '🦔', decoy: '🪨'
  };
  const POWERDOWN_TYPES = ['confuse', 'fog', 'alarm', 'slow', 'swarm', 'drunk', 'psylo'];
  const CHAOS_POWERDOWN_TYPES = ['duck', 'helium', 'disco', 'banana'];
  const POWERDOWN_COLORS = {
    confuse: '#8a3fa0', fog: '#5a5a62', alarm: '#c23a2e',
    slow: '#4a6b8a', swarm: '#8a2f2f', drunk: '#caa14a', psylo: '#b26ee8',
    duck: '#f2c230', helium: '#f07bb5', disco: '#c86bff', banana: '#f5dd4a'
  };
  const POWERDOWN_SYMBOLS = {
    confuse: '🌀', fog: '🌫️', alarm: '🚨',
    slow: '🐌', swarm: '👥', drunk: '🍺', psylo: '🍄',
    duck: '🦆', helium: '🎈', disco: '🪩', banana: '🍌'
  };
  const ALL_ICON_COLORS = Object.assign({}, POWERUP_COLORS, POWERDOWN_COLORS);
  const ALL_ICON_SYMBOLS = Object.assign({}, POWERUP_SYMBOLS, POWERDOWN_SYMBOLS);
  const ALL_ICON_NAMES = {
    speed: 'Speed Boost', shield: 'Shield', freeze: 'Freeze', trailguard: 'Trail Guard',
    rapidfire: 'Rapid Fire', spikes: 'Spikes', decoy: 'Decoy x2',
    confuse: 'Confused!', fog: 'Fog', alarm: 'Alarm!',
    slow: 'Slowed!', swarm: 'Reinforcements!', drunk: 'Drunk!', psylo: 'PSYLO!',
    duck: 'Quack!', helium: 'Helium head!', disco: 'Disco!', banana: 'Banana!'
  };
  const MYSTERY_COLOR = '#c9cdd6';
  const MYSTERY_SYMBOL = '?';
  const ALL_MYSTERY_TYPES = POWERUP_TYPES.concat(POWERDOWN_TYPES, CHAOS_POWERDOWN_TYPES);
  const ROULETTE_MS = 500;
  const ROULETTE_STEP_MS = 55;
  const REVEAL_HOLD_MS = 700;
  let score, level, capturedPct, gameOver, paused, running;
  let scoreAtLevelStart = 0; // fuer das Hochzaehlen im Levelabschluss
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
  // Funken mit Luftwiderstand (Eroberung, Abschuesse, Richtungswechsel)
  let sparkParticles = [];
  // Squash & Stretch des Spielers: gedaempftes Nachwippen nach Kurve/Eroberung
  let playerSquashTime = 0, playerSquashAmt = 0;
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
  function triggerSlowMo(ms) { slowMoUntil = Math.max(slowMoUntil, performance.now() + ms); }
  // Kill-Cam: Zeitlupe plus Zoom auf die Stelle eines besonderen Abschusses
  let killCam = null; // { x, y, start, until }
  const KILLCAM_MS = 1100;
  function triggerKillCam(c, r) {
    const now = performance.now();
    killCam = { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2, start: now, until: now + KILLCAM_MS };
    triggerSlowMo(KILLCAM_MS * 0.8);
  }

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
  const COUNTDOWN_STEP_MS = 700; // lang genug, dass die Ansage jedes Wort ganz ausspricht
  const COUNTDOWN_SPEECH_LEAD_MS = 200; // Sprachausgabe braucht einen Moment: sie startet so viel vor der Anzeige

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

