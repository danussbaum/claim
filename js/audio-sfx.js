  // --- Sound ---
  let audioCtx = null;
  let musicGain = null, sfxGain = null;
  let musicMuted = false;
  let padOsc1 = null, padOsc2 = null, padFilter = null, padGain = null;
  let subOsc = null, subGain = null;
  let shimmerOsc = null, shimmerGain = null, shimmerLFO = null, shimmerLFOGain = null;
  let iceOsc = null, iceGain = null;
  let noiseBuffer = null;
  let menuNextStepTime = 0, menuStepIndex = 0;
  let smoothedTension = 0;

  // Musik wird so weit im Voraus geplant (s), damit spaete Frames nicht zu Knacken fuehren
  const MUSIC_LOOKAHEAD = 0.12;

  function ensureAudio() {
    if (!audioCtx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        musicGain = audioCtx.createGain();
        musicGain.gain.value = musicMuted ? 0 : 1;
        // Limiter vor dem Ausgang: Spitzen aus Musik, Effekten und Stimmen uebersteuern sonst
        // (auf Handylautsprechern als Knistern hoerbar)
        const limiter = audioCtx.createDynamicsCompressor();
        limiter.threshold.value = -3;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.1;
        limiter.connect(audioCtx.destination);
        musicGain.connect(limiter);
        sfxGain = audioCtx.createGain();
        sfxGain.gain.value = 1;
        sfxGain.connect(limiter);

        // Atmosphaerische Dauer-Drone: Pad + Sub-Bass, laufend per Gain/Filter moduliert
        padFilter = audioCtx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.Q.value = 1.1;
        padFilter.frequency.value = 400;
        padGain = audioCtx.createGain();
        padGain.gain.value = 0.0001;
        padFilter.connect(padGain);
        padGain.connect(musicGain);

        padOsc1 = audioCtx.createOscillator();
        padOsc1.type = 'sawtooth';
        padOsc1.frequency.value = 87.3;
        padOsc1.connect(padFilter);
        padOsc1.start();

        padOsc2 = audioCtx.createOscillator();
        padOsc2.type = 'sawtooth';
        padOsc2.frequency.value = 87.3 * Math.pow(2, 7/12);
        padOsc2.detune.value = 7;
        padOsc2.connect(padFilter);
        padOsc2.start();

        subOsc = audioCtx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.value = 43.65;
        subGain = audioCtx.createGain();
        subGain.gain.value = 0.0001;
        subOsc.connect(subGain);
        subGain.connect(musicGain);
        subOsc.start();

        // Schild-Schimmer: hohe Sinuswelle mit Tremolo, aktiv waehrend Schild
        shimmerOsc = audioCtx.createOscillator();
        shimmerOsc.type = 'sine';
        shimmerOsc.frequency.value = 87.3 * 4;
        shimmerGain = audioCtx.createGain();
        shimmerGain.gain.value = 0.0001;
        shimmerOsc.connect(shimmerGain);
        shimmerGain.connect(musicGain);
        shimmerOsc.start();

        shimmerLFO = audioCtx.createOscillator();
        shimmerLFO.type = 'sine';
        shimmerLFO.frequency.value = 5.5;
        shimmerLFOGain = audioCtx.createGain();
        shimmerLFOGain.gain.value = 0.0001;
        shimmerLFO.connect(shimmerLFOGain);
        shimmerLFOGain.connect(shimmerGain.gain);
        shimmerLFO.start();

        // Eis-Glitzer: sehr hohe, leise Sinuswelle, aktiv waehrend Waechter eingefroren
        iceOsc = audioCtx.createOscillator();
        iceOsc.type = 'sine';
        iceOsc.frequency.value = 87.3 * 8;
        iceGain = audioCtx.createGain();
        iceGain.gain.value = 0.0001;
        iceOsc.connect(iceGain);
        iceGain.connect(musicGain);
        iceOsc.start();

        // Noise-Buffer fuer 80er-Drum-Machine (Snare/Hihat)
        const bufLen = audioCtx.sampleRate * 1;
        noiseBuffer = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

        menuNextStepTime = audioCtx.currentTime + 0.1;
        menuStepIndex = 0;
      } catch (e) { audioCtx = null; }
    }
    if (audioCtx && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) audioCtx.resume().catch(() => {});
    if (!audioLoopStarted) {
      audioLoopStarted = true;
      requestAnimationFrame(audioLoop);
    }
  }

  let audioLoopStarted = false;
  function audioLoop(t) {
    updateAmbient(performance.now());
    updateMenuTheme();
    requestAnimationFrame(audioLoop);
  }

  function setMusicMuted(muted) {
    musicMuted = muted;
    if (audioCtx && musicGain) {
      musicGain.gain.setValueAtTime(muted ? 0 : 1, audioCtx.currentTime);
    }
    const btn = document.getElementById('musicBtn');
    if (btn) btn.textContent = muted ? '🔇' : '🔊';
  }

  function tone(freq, dur, type, vol, delay, glideTo, channel) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol != null ? vol : 0.14, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(channel === 'music' ? (musicGain || audioCtx.destination) : (sfxGain || audioCtx.destination));
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function playNoise(dur, filterFreq, filterType, vol, delay, channel) {
    if (!audioCtx || !noiseBuffer) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    const filt = audioCtx.createBiquadFilter();
    filt.type = filterType || 'highpass';
    filt.frequency.value = filterFreq;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt); filt.connect(gain);
    gain.connect(channel === 'music' ? (musicGain || audioCtx.destination) : (sfxGain || audioCtx.destination));
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

