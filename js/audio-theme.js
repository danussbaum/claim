  // --- 80er-Jahre Drum Machine (Start-Screen-Theme) ---
  function drum808Kick(delay) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(48, t0 + 0.14);
    gain.gain.setValueAtTime(0.22, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
    osc.connect(gain);
    gain.connect(musicGain || audioCtx.destination);
    osc.start(t0); osc.stop(t0 + 0.24);
  }
  function drum808Snare(delay) {
    playNoise(0.14, 1700, 'bandpass', 0.16, delay, 'music');
    tone(190, 0.1, 'triangle', 0.08, delay, 140, 'music');
  }

  // --- Synth-Stimmen fuer das Start-Theme ---
  function musicOut() { return musicGain || audioCtx.destination; }

  // Saettigungskurve fuer den Kick. Ein reiner Sinus bei 40 Hz ist auf Handy- und
  // Laptoplautsprechern praktisch unhoerbar - erst die Obertoene, die hier entstehen,
  // machen den Ton dort als Bass wahrnehmbar. Die Kurve ist leicht asymmetrisch:
  // die negative Halbwelle wird haerter beschnitten, das erzeugt zusaetzlich
  // geradzahlige Obertoene und damit den Biss. Einmal gebaut und gecacht.
  let kickCurve = null;
  function kickSaturation() {
    if (kickCurve) return kickCurve;
    const n = 2048, drive = 8.5;
    kickCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const d = x < 0 ? drive * 1.35 : drive;
      kickCurve[i] = Math.tanh(x * d) / Math.tanh(d);
    }
    return kickCurve;
  }

  // Techno-Kick aus vier Schichten: Koerper mit sehr schnellem Tonhoehensturz fuer den
  // Schlag, ein liegender Sub darunter fuer den Druck, ein kurzer Knock im Mittenbereich
  // fuer den Biss und ein Klick obendrauf. Alles durch die Saettigung und danach durch
  // einen kurzen Kompressor - der faengt die Spitzen ab, damit die Kette hart gefahren
  // werden kann, ohne dass das Signal clippt.
  // Saettigung und Kompressor einmal fuer alle Kicks: ein eigener Kompressor pro Schlag
  // ist auf dem Handy zu teuer und fuehrt zu Knacken
  let kickBusIn = null;
  function kickBus() {
    if (kickBusIn) return kickBusIn;
    const shaper = audioCtx.createWaveShaper();
    shaper.curve = kickSaturation();
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    const out = audioCtx.createGain();
    out.gain.value = 0.62;
    shaper.connect(comp); comp.connect(out); out.connect(musicOut());
    return (kickBusIn = shaper);
  }
  function technoKick(delay) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);

    const shaper = kickBus();

    // Koerper: 260 Hz faellt in 25 ms auf 55 Hz (der Schlag), danach traeger weiter
    // auf 38 Hz (das Nachsacken). Je schneller der erste Sturz, desto haerter der Anschlag.
    const body = audioCtx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(260, t0);
    body.frequency.exponentialRampToValueAtTime(55, t0 + 0.025);
    body.frequency.exponentialRampToValueAtTime(38, t0 + 0.26);
    const bodyGain = audioCtx.createGain();
    bodyGain.gain.setValueAtTime(0.62, t0);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
    // Zum Schluss ganz auf null: die Saettigung verstaerkt leise Reste, ein harter
    // Stopp bei 0.001 waere als Knacken am Ende des Kicks hoerbar
    bodyGain.gain.linearRampToValueAtTime(0, t0 + 0.45);
    body.connect(bodyGain); bodyGain.connect(shaper);
    body.start(t0); body.stop(t0 + 0.47);

    // Sub: fester Ton unter dem Koerper, kurz verzoegert eingeblendet, damit er den
    // Anschlag nicht verwaschen laesst. Er traegt das Fundament.
    const sub = audioCtx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(40, t0);
    const subGainNode = audioCtx.createGain();
    subGainNode.gain.setValueAtTime(0.0001, t0);
    subGainNode.gain.exponentialRampToValueAtTime(0.46, t0 + 0.012);
    subGainNode.gain.exponentialRampToValueAtTime(0.001, t0 + 0.36);
    subGainNode.gain.linearRampToValueAtTime(0, t0 + 0.39);
    sub.connect(subGainNode); subGainNode.connect(shaper);
    sub.start(t0); sub.stop(t0 + 0.41);

    // Knock: kurzer Rechteckimpuls in den Mitten. Das ist der Anteil, den man als
    // Haerte hoert - er verschwindet nach 55 ms wieder komplett.
    const knock = audioCtx.createOscillator();
    knock.type = 'square';
    knock.frequency.setValueAtTime(190, t0);
    knock.frequency.exponentialRampToValueAtTime(90, t0 + 0.05);
    const knockFilt = audioCtx.createBiquadFilter();
    knockFilt.type = 'bandpass';
    knockFilt.frequency.value = 320;
    knockFilt.Q.value = 1.4;
    const knockGain = audioCtx.createGain();
    knockGain.gain.setValueAtTime(0.40, t0);
    knockGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.055);
    knockGain.gain.linearRampToValueAtTime(0, t0 + 0.065);
    knock.connect(knockFilt); knockFilt.connect(knockGain); knockGain.connect(shaper);
    knock.start(t0); knock.stop(t0 + 0.08);

    // Klick: zwei Rauschstoesse - einer hoch fuer die Spitze, einer in den oberen
    // Mitten fuer den Schlag des Schlegels.
    playNoise(0.008, 4200, 'highpass', 0.06, delay, 'music');
    playNoise(0.022, 1800, 'bandpass', 0.05, delay, 'music');
  }

  // Hats fuer das Offbeat - heller und kuerzer als die 808-Hats.
  function technoHat(delay, open, vol) {
    playNoise(open ? 0.12 : 0.032, open ? 7000 : 9500, 'highpass', vol, delay, 'music');
  }

  // 808-Clap: drei schnelle Rauschstoesse plus Fahne, traegt Zwei und Vier.
  function clap808(delay, vol) {
    const d = delay || 0;
    for (let i = 0; i < 3; i++) playNoise(0.018, 1600, 'bandpass', vol, d + i * 0.011, 'music');
    playNoise(0.15, 1400, 'bandpass', vol * 0.55, d + 0.03, 'music');
  }

  // TB-303-Bass: Saegezahn durch resonanten Tiefpass mit eigener Huellkurve.
  // glideFrom laesst die Note hineinrutschen - das typische Acid-Schlenzen.
  function acidBass(freq, dur, delay, cutoff, vol, glideFrom) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    if (glideFrom) {
      osc.frequency.setValueAtTime(glideFrom, t0);
      osc.frequency.exponentialRampToValueAtTime(freq, t0 + Math.min(0.08, dur * 0.6));
    } else {
      osc.frequency.setValueAtTime(freq, t0);
    }
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 10;
    filt.frequency.setValueAtTime(Math.max(120, cutoff), t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(110, freq * 2.2), t0 + dur * 0.85);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(filt); filt.connect(g); g.connect(musicOut());
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // Verstimmte Doppelsaege durch resonanten Tiefpass - der typische 80er-Polysynth.
  function polyVoice(freq, dur, delay, cutoff, vol, detuneCents) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 6;
    filt.frequency.setValueAtTime(Math.max(200, cutoff), t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(180, cutoff * 0.45), t0 + dur);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const d = detuneCents === undefined ? 9 : detuneCents;
    for (const cents of [-d, d]) {
      const o = audioCtx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, t0);
      o.detune.setValueAtTime(cents, t0);
      o.connect(filt);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    filt.connect(g); g.connect(musicOut());
  }

  // DX7-Glocke: Sinus-Traeger, dessen Frequenz von einem zweiten Sinus moduliert wird.
  function fmBell(freq, dur, delay, vol) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const car = audioCtx.createOscillator();
    car.type = 'sine'; car.frequency.setValueAtTime(freq, t0);
    const mod = audioCtx.createOscillator();
    mod.type = 'sine'; mod.frequency.setValueAtTime(freq * 3.5, t0);
    const modGain = audioCtx.createGain();
    modGain.gain.setValueAtTime(freq * 2.4, t0);
    modGain.gain.exponentialRampToValueAtTime(1, t0 + dur * 0.5);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    mod.connect(modGain); modGain.connect(car.frequency);
    car.connect(g); g.connect(musicOut());
    mod.start(t0); mod.stop(t0 + dur + 0.02);
    car.start(t0); car.stop(t0 + dur + 0.02);
  }

  // Anschwellende Rauschfahne als Uebergang am Zyklusende.
  function riser(dur, delay, vol) {
    if (!audioCtx || !noiseBuffer) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer; src.loop = true;
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'bandpass'; filt.Q.value = 2;
    filt.frequency.setValueAtTime(400, t0);
    filt.frequency.exponentialRampToValueAtTime(6000, t0 + dur);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(musicOut());
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  function resetMenuThemeTiming() {
    if (!audioCtx) return;
    menuNextStepTime = audioCtx.currentTime + 0.1;
    menuStepIndex = 0;
  }

  // --- Start-Theme: hypnotischer Techno mit 80er-Instrumentierung ---
  // Sechzehntel-Raster, 16-Takt-Zyklus. Die Harmonie wechselt nur alle vier Takte -
  // die Entwicklung kommt aus der langsamen Filterfahrt, nicht aus den Noten.
  // Das Raster ist bewusst starr: kein Swing, keine Humanisierung.
  const MENU_CHORDS = [
    { root:  0, tones: [0, 3, 7, 10] },  // Am7
    { root:  0, tones: [0, 3, 7, 10] },  // Am7
    { root: -4, tones: [0, 4, 7, 11] },  // Fmaj7
    { root: -2, tones: [0, 4, 7, 10] }   // G7
  ];
  // Arpeggio-Figur ueber die Akkordtoene - laeuft durchgehend und traegt den Sog.
  const MENU_ARP = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 5, 4, 2, 1, 0];
  const MENU_BASS_STEPS = [0, 3, 6, 8, 11, 14];

  function updateMenuTheme() {
    if (!audioCtx || menuNextStepTime === 0) return;
    if (hasStarted) { menuNextStepTime = 0; return; }
    const bpm = 126;
    const stepDur = 60 / bpm / 4;
    const root = 220; // A

    // Zu weit hinten (Tab im Hintergrund, Handy ausgelastet): nicht alles nachholen, neu einsetzen
    if (audioCtx.currentTime - menuNextStepTime > 0.25) menuNextStepTime = audioCtx.currentTime + 0.05;
    // Mit Vorlauf planen: die Noten liegen exakt im Raster, auch wenn ein Frame spaet kommt
    while (menuNextStepTime < audioCtx.currentTime + MUSIC_LOOKAHEAD) {
      const at = Math.max(0, menuNextStepTime - audioCtx.currentTime);
      const step = menuStepIndex % 16;
      const bar = Math.floor(menuStepIndex / 16);
      const cycleBar = bar % 16;
      const chord = MENU_CHORDS[Math.floor(cycleBar / 4) % MENU_CHORDS.length];
      const chordRoot = root * Math.pow(2, chord.root / 12);

      // Filterfahrt ueber den ganzen Zyklus: oeffnet und schliesst einmal in 16 Takten.
      const cyclePos = (cycleBar + step / 16) / 16;
      const sweep = 0.5 - 0.5 * Math.cos(cyclePos * Math.PI * 2);
      const arpCutoff = 420 + sweep * 3400;
      const bassCutoff = 260 + sweep * 900;

      // Arrangement: die Schichten kommen gestaffelt dazu, der letzte Takt bricht auf.
      const breakBar = cycleBar === 15;
      const arpOn = cycleBar >= 2;
      const padOn = cycleBar >= 4;
      const clapOn = cycleBar >= 4 && !breakBar;
      const bellOn = cycleBar >= 8;
      const dropped = breakBar && step >= 8;

      if (step % 4 === 0 && !dropped) technoKick(at);
      if (step % 4 === 2) technoHat(at, true, 0.05);
      else if (step % 2 === 0) technoHat(at, false, 0.03);
      else if (cycleBar >= 6 && (step === 7 || step === 15)) technoHat(at, false, 0.016);
      if (clapOn && (step === 4 || step === 12)) clap808(at, 0.075);

      // Rollender Bass; auf den Oktavspruengen rutscht die Note hinein.
      if (MENU_BASS_STEPS.indexOf(step) !== -1 && !dropped) {
        const up = (step === 6 || step === 14);
        const f = chordRoot / 2 * (up ? 2 : 1);
        acidBass(f, stepDur * 1.6, at, bassCutoff, 0.085, up ? chordRoot / 2 : 0);
      }

      // Arpeggio in Sechzehnteln - der hypnotische Kern des Stuecks.
      if (arpOn) {
        const t = chord.tones;
        const scale = [t[0], t[1], t[2], t[3], t[0] + 12, t[1] + 12];
        const semis = scale[MENU_ARP[step] % scale.length];
        polyVoice(chordRoot * Math.pow(2, semis / 12), stepDur * 1.5, at,
                  arpCutoff, 0.036, 11);
      }

      // Pad: ein liegender Akkord pro Takt, breit verstimmt.
      if (padOn && step === 0) {
        for (const semis of chord.tones) {
          polyVoice(chordRoot * Math.pow(2, semis / 12) / 2, stepDur * 15,
                    at, 700 + sweep * 900, 0.022, 14);
        }
      }

      // Glocken-Akzente in der zweiten Zyklushaelfte.
      if (bellOn && (step === 6 || (cycleBar % 4 === 3 && step === 14))) {
        fmBell(chordRoot * 4, 0.9, at, 0.035);
      }

      // Uebergang zurueck auf Eins.
      if (breakBar && step === 8) riser(stepDur * 8, at, 0.06);

      menuNextStepTime += stepDur;
      menuStepIndex++;
    }
  }

  function sndCapture(gained, combo) {
    const bump = Math.min(combo || 1, 10) * 0.015;
    const notes = [523, 659, 784];
    notes.forEach((f, i) => tone(f * (1 + bump), 0.12, 'triangle', 0.12 + bump * 0.1, i * 0.05));
    if ((combo || 1) >= 2) {
      tone(1047 * (1 + bump), 0.14, 'sine', 0.08, 0.14);
    }
  }
  function sndPowerUp(type) {
    if (type === 'speed') tone(880, 0.14, 'square', 0.1, 0, 1400);
    else if (type === 'shield') { tone(440, 0.16, 'sine', 0.12); tone(660, 0.16, 'sine', 0.1, 0.05); }
    else if (type === 'freeze') tone(1200, 0.3, 'sine', 0.1, 0, 500);
    else if (type === 'trailguard') { tone(300, 0.1, 'square', 0.1); tone(520, 0.2, 'sine', 0.1, 0.08); tone(780, 0.25, 'sine', 0.07, 0.14); }
    else if (type === 'rapidfire') {
      for (let i = 0; i < 4; i++) tone(950 - i * 40, 0.05, 'square', 0.08, i * 0.05);
    }
    else if (type === 'decoy') { playNoise(0.06, 900, 'lowpass', 0.1, 0); playNoise(0.06, 900, 'lowpass', 0.1, 0.1); tone(660, 0.1, 'triangle', 0.06, 0.18); }
    else if (type === 'spikes') {
      tone(200, 0.1, 'sawtooth', 0.12, 0, 140);
      tone(140, 0.18, 'square', 0.09, 0.08, 90);
    }
  }
  function sndPowerDown(type) {
    if (type === 'confuse') {
      tone(500, 0.18, 'sawtooth', 0.1, 0, 900);
      tone(900, 0.18, 'sawtooth', 0.08, 0.09, 400);
    } else if (type === 'fog') {
      tone(220, 0.4, 'sine', 0.09, 0, 110);
      tone(140, 0.5, 'triangle', 0.06, 0.1, 80);
    } else if (type === 'alarm') {
      for (let i = 0; i < 3; i++) {
        tone(880, 0.12, 'square', 0.1, i * 0.28);
        tone(660, 0.12, 'square', 0.09, i * 0.28 + 0.14);
      }
    } else if (type === 'slow') {
      tone(300, 0.35, 'sine', 0.1, 0, 120);
      tone(180, 0.4, 'triangle', 0.07, 0.15, 90);
    } else if (type === 'swarm') {
      tone(220, 0.14, 'square', 0.1, 0);
      tone(180, 0.14, 'square', 0.1, 0.1);
      tone(140, 0.2, 'square', 0.1, 0.2);
    } else if (type === 'drunk') {
      tone(330, 0.3, 'sine', 0.09, 0, 260);
      tone(392, 0.35, 'sine', 0.08, 0.12, 300);
      tone(220, 0.4, 'triangle', 0.07, 0.2, 260);
    } else if (type === 'psylo') {
      // Psychedischer Anstieg: zwei steigende Töne plus Highpass-Schimmer,
      // bewusst leise gehalten, um zum restlichen Power-down-Inventory zu passen.
      tone(260, 1.0, 'sine', 0.08, 0, 523);
      tone(392, 1.0, 'triangle', 0.06, 0.15, 784);
      tone(620, 1.1, 'sine', 0.045, 0.5, 1240);
      playNoise(0.45, 7000, 'highpass', 0.04, 0.12);
    } else if (type === 'duck') {
      sndQuack(); sndQuack(0.22);
    } else if (type === 'helium') {
      // Ballon wird aufgeblasen: Rauschen plus steil steigender Pfeifton
      playNoise(0.35, 2500, 'bandpass', 0.05, 0);
      tone(300, 0.45, 'sine', 0.07, 0.05, 1400);
      tone(1400, 0.12, 'triangle', 0.05, 0.5, 1700);
    } else if (type === 'disco') {
      // Kurzer Disco-Groove: Bass, Hi-Hat, Akkord
      for (let i = 0; i < 4; i++) {
        tone(i % 2 ? 110 : 82, 0.12, 'square', 0.08, i * 0.14, undefined);
        playNoise(0.04, 8000, 'highpass', 0.04, i * 0.14 + 0.07);
      }
      tone(523, 0.3, 'triangle', 0.05, 0.56); tone(659, 0.3, 'triangle', 0.05, 0.56); tone(784, 0.3, 'triangle', 0.05, 0.56);
    } else if (type === 'banana') {
      // Ausrutschen: Quietschen nach oben, dann Plumps
      tone(400, 0.25, 'sawtooth', 0.07, 0, 1500);
      tone(160, 0.18, 'sine', 0.12, 0.3, 60);
    }
  }
  // --- Chaos- und Waechter-Sounds ---
  function sndQuack(delay) {
    tone(620, 0.08, 'square', 0.07, delay || 0, 380);
    tone(560, 0.09, 'square', 0.06, (delay || 0) + 0.09, 320);
  }
  function sndHeliumSqueak() {
    tone(1300 + Math.random() * 400, 0.05, 'sine', 0.035, 0, 1900);
  }
  function sndDiscoBeat() {
    tone(70, 0.1, 'sine', 0.1, 0, 45);
    playNoise(0.03, 9000, 'highpass', 0.03, 0.05);
  }
  function sndDecoyThrow() {
    tone(900, 0.15, 'sine', 0.04, 0, 400);       // Wurf
    playNoise(0.08, 900, 'lowpass', 0.12, 0.16); // Aufschlag
    tone(120, 0.1, 'triangle', 0.08, 0.16, 70);
  }
  function sndGuardTrip() {
    tone(500, 0.12, 'triangle', 0.06, 0, 200);
    playNoise(0.1, 700, 'lowpass', 0.12, 0.12);
    tone(90, 0.14, 'sine', 0.1, 0.12, 50);
  }
  function sndGuardSlip() {
    tone(350, 0.3, 'sawtooth', 0.06, 0, 1600);
    tone(1600, 0.2, 'sine', 0.04, 0.3, 300);
    playNoise(0.12, 600, 'lowpass', 0.12, 0.5);
  }
  function sndCoffeeBreak() {
    playNoise(0.25, 1800, 'bandpass', 0.03, 0); // Schluerfen
    tone(260, 0.3, 'sine', 0.05, 0.3, 200);     // "Ahh"
  }
  function sndGuardJam() {
    tone(140, 0.15, 'sawtooth', 0.06, 0, 110);
    tone(120, 0.15, 'sawtooth', 0.06, 0.16, 95);
  }
  // Kauderwelsch der Waechter: ein kurzer Ton pro Silbe. Tonlage nach Typ,
  // Melodie nach Satzzeichen ('!' steigt, '?' fragt, '...' faellt ab).
  const GIBBERISH_VOICE = {
    wanderer: { base: 300, wave: 'square' },
    hunter:   { base: 190, wave: 'sawtooth' },
    guardian: { base: 240, wave: 'triangle' },
    nervous:  { base: 440, wave: 'square' },
    cutter:   { base: 360, wave: 'triangle' }
  };
  function sndGibberish(text, personality, voiceShift) {
    const voice = GIBBERISH_VOICE[personality] || GIBBERISH_VOICE.wanderer;
    const syllables = Math.max(2, Math.min(9, (text.toLowerCase().match(/[aeiouy]+/g) || []).length + (Math.random() < 0.4 ? 1 : 0)));
    const shout = /!/.test(text), ask = /\?/.test(text), trail = /\.\.\./.test(text);
    const base = voice.base * (voiceShift || 1);
    const gap = personality === 'nervous' ? 0.065 : 0.09;
    // Satzmelodie pro Spruch zufaellig: steigend, fallend, Welle oder hin und her springend
    const contour = Math.floor(Math.random() * 4);
    const vol = shout ? 0.11 : 0.08;
    let t = 0;
    for (let i = 0; i < syllables; i++) {
      const last = i === syllables - 1;
      const k = syllables > 1 ? i / (syllables - 1) : 0;
      let shape = 1;
      if (contour === 0) shape = 0.85 + k * 0.4;
      else if (contour === 1) shape = 1.2 - k * 0.4;
      else if (contour === 2) shape = 1 + Math.sin(k * Math.PI * 2) * 0.25;
      else shape = i % 2 ? 0.8 : 1.25;
      let f = base * shape * (1 + (Math.random() - 0.5) * 0.6);
      if (shout) f *= 1.2;
      if (trail) f *= 1 - k * 0.35;
      // Jede Silbe gleitet anders: hoch, runter oder "wa-wa"
      let glide = f * (0.75 + Math.random() * 0.55);
      if (last && ask) glide = f * 1.7;
      else if (last && shout) glide = f * 1.35;
      else if (last && trail) glide = f * 0.7;
      const dur = gap * (0.55 + Math.random() * 0.7) * (last && (ask || trail) ? 1.8 : 1);
      const wave = Math.random() < 0.25 ? (voice.wave === 'triangle' ? 'square' : 'triangle') : voice.wave;
      tone(f, dur, wave, vol, t, glide);
      // Zweiter, hoeherer Oberton faerbt den "Vokal" jeder Silbe unterschiedlich
      tone(f * (2 + Math.random() * 1.5), dur * 0.8, 'sine', vol * 0.35, t, glide * 2.2);
      t += dur + gap * (0.15 + Math.random() * 0.5);
      if (!last && Math.random() < 0.12) t += gap; // kleine Denkpause
    }
  }

  function sndGadgetHook() {
    tone(260, 0.1, 'square', 0.11, 0, 520);
    tone(180, 0.14, 'sawtooth', 0.09, 0.04, 340);
  }
  function sndGadgetSmoke() {
    tone(500, 0.16, 'sine', 0.08, 0, 260);
    tone(220, 0.3, 'sine', 0.07, 0.08, 120);
  }
  function sndLineCut() {
    tone(900, 0.05, 'square', 0.10, 0, 300);
    tone(600, 0.06, 'square', 0.09, 0.05, 200);
    tone(260, 0.22, 'sawtooth', 0.09, 0.1, 120);
  }
  function sndRouletteTick() {
    tone(700, 0.045, 'square', 0.05, 0);
  }
  function sndThaw() {
    tone(500, 0.18, 'square', 0.1, 0, 900);
  }
  function sndHunterAlert() {
    tone(900, 0.09, 'square', 0.09);
    tone(900, 0.09, 'square', 0.09, 0.11);
  }
  function sndShoot() {
    tone(900, 0.08, 'square', 0.09, 0, 300);
    tone(1400, 0.05, 'sine', 0.05, 0.01, 2000);
  }
  function sndEnemyDeath() {
    [660, 880, 1175].forEach((f, i) => tone(f, 0.25, 'sine', 0.1, i * 0.08, f * 1.15));
  }
  function sndNearMiss() {
    tone(280, 0.09, 'sine', 0.1, 0, 200);
    tone(700, 0.16, 'sine', 0.09, 0.1, 500);
  }
  function sndLevelUp() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, i * 0.09));
  }

  function sndHighscoreSting() {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, 'square', 0.09, 1.35 + i * 0.11, undefined, 'music'));
    tone(1975, 0.5, 'sine', 0.08, 1.85, undefined, 'music');
  }

  function sndAchievement() {
    tone(660, 0.12, 'sine', 0.09, 0);
    tone(880, 0.16, 'sine', 0.09, 0.1);
    tone(1320, 0.22, 'sine', 0.07, 0.2);
  }

  function sndVictoryFanfare() {
    // Perkussiver Auftakt
    drum808Kick(0);
    drum808Snare(0.32);

    // Zwei aufsteigende Akkord-Stabs (Blechblaeser-Charakter via Sawtooth)
    const stab1 = [261.63, 329.63, 392.00];
    const stab2 = [349.23, 440.00, 523.25];
    stab1.forEach(f => {
      tone(f, 0.14, 'sawtooth', 0.09, 0.02, undefined, 'music');
      tone(f * 2, 0.1, 'square', 0.03, 0.02, undefined, 'music');
    });
    stab2.forEach(f => {
      tone(f, 0.14, 'sawtooth', 0.1, 0.17, undefined, 'music');
      tone(f * 2, 0.1, 'square', 0.03, 0.17, undefined, 'music');
    });

    // Grosser, satter Schluss-Akkord (C-Dur), lang ausklingend
    const chord = [523.25, 659.25, 783.99, 1046.50];
    chord.forEach((f, i) => {
      tone(f, 0.9, 'sawtooth', 0.1 - i * 0.012, 0.32, undefined, 'music');
      tone(f, 0.9, 'triangle', 0.06, 0.32, undefined, 'music');
    });
    // Sub-Bass-Fundament unter dem Akkord
    tone(130.81, 1.0, 'triangle', 0.1, 0.32, undefined, 'music');
    // Schimmerndes Crash-Becken fuer epische Breite
    playNoise(1.1, 5500, 'highpass', 0.05, 0.32, 'music');

    // Funkelnder Glocken-Ding zum Abschluss
    tone(1046.50, 0.5, 'sine', 0.09, 0.95, undefined, 'music');
    tone(1567.98, 0.4, 'sine', 0.05, 0.97, undefined, 'music');
  }

  function sndFireworkPop() {
    const base = 480 + Math.random() * 420;
    tone(base, 0.14, 'square', 0.08, 0, base * 0.4);
    for (let i = 0; i < 4; i++) {
      tone(1300 + Math.random() * 1000, 0.05, 'sine', 0.03, 0.03 + i * 0.035);
    }
  }
  function sndGameOver(type) {
    if (type === '😈') {
      [440, 349, 277, 220].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.11, i * 0.13, f * 0.85));
    } else if (type === '✂️') {
      tone(900, 0.06, 'square', 0.13);
      tone(700, 0.06, 'square', 0.12, 0.07);
      [400, 300, 200].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.1, 0.16 + i * 0.11, f * 0.8));
    } else {
      [349, 311, 261, 220].forEach((f, i) => tone(f, 0.3, 'triangle', 0.11, i * 0.14, f * 0.9));
    }
  }

