  // --- Adaptive Hintergrundmusik ---
  let musicNextNoteTime = 0;
  let musicStepIndex = 0;
  const MUSIC_SCALE = [0, 3, 5, 7, 10, 12, 15, 19];
  const MUSIC_ROOT = 174.6;
  const MUSIC_BASS_PATTERN = [1, 0, 1, 1, 0, 1, 1, 0]; // Acid-Bass der zweiten Gefahren-Ebene

  function resetMusicTiming() {
    if (!audioCtx) return;
    musicNextNoteTime = audioCtx.currentTime + 0.1;
    musicStepIndex = 0;
  }

  function nearestEnemyDist() {
    if (!enemies.length) return 99;
    let min = 99;
    for (const e of enemies) {
      const d = Math.abs(e.c - px) + Math.abs(e.r - py);
      if (d < min) min = d;
    }
    return min;
  }

  function checkNearMiss(now) {
    if (gameOver || paused || huntActive()) return; // Jagd: wuerde die versteckte Figur verraten
    const d = nearestEnemyDist();
    if (d === 1 && prevNearestDist > 1 && now > nearMissCooldownUntil) {
      nearMissCooldownUntil = now + 1500;
      nearMissPopups.push({ x: px, y: py, startTime: now });
      addRipple(px, py, 4.5, 620, '255,210,63', 0.7);
      spawnEmote('😅', px, py);
      sndNearMiss();
      triggerShake(3, 200);
      vibrate(40);
    }
    prevNearestDist = d;
  }

  function computeTension(now) {
    let t = 0;
    const dist = nearestEnemyDist();
    t += Math.max(0, 1 - dist / 9) * 0.5;
    if (trail.length > 0) t += 0.15;
    if (enemies.some(e => e.personality === 'hunter' && (Math.abs(e.c - px) + Math.abs(e.r - py)) <= 6)) t += 0.25;
    if (lives === 1) t += 0.15;
    if (capturedPct >= 65) t += 0.1;
    if (now < shieldUntil || now < freezeUntil) t -= 0.15;
    return Math.max(0, Math.min(1, t));
  }

  function updateAmbient(now) {
    if (!audioCtx || !padGain || !subGain || !padFilter || !padOsc2) return;
    const active = running && !paused && !gameOver;
    const speedActive = active && now < speedUntil;
    const shieldActive = active && now < shieldUntil;
    const iceActive = active && now < freezeUntil;

    const target = active ? computeTension(now) : 0;
    smoothedTension += (target - smoothedTension) * 0.04;

    // Grund-Pad: dunkler/traeger bei Eis, heller bei Speed
    let cutoff = 320 + smoothedTension * 2300 + ((level || 1) - 1) * 40;
    let detune = 6 + smoothedTension * 22;
    let padVol = active ? (0.016 + smoothedTension * 0.05) : 0.0001;
    let subVol = active ? (0.012 + smoothedTension * 0.06) : 0.0001;

    if (speedActive) { cutoff += 900; padVol *= 1.25; }
    if (iceActive) { cutoff *= 0.4; detune *= 0.25; subVol *= 0.6; }

    padGain.gain.setTargetAtTime(padVol, audioCtx.currentTime, 0.25);
    subGain.gain.setTargetAtTime(subVol, audioCtx.currentTime, 0.3);
    padFilter.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, 0.2);
    padOsc2.detune.setTargetAtTime(detune, audioCtx.currentTime, 0.2);

    // Schild: schimmernder Tremolo-Ton
    if (shimmerGain && shimmerLFOGain) {
      shimmerGain.gain.setTargetAtTime(shieldActive ? 0.03 : 0.0001, audioCtx.currentTime, 0.2);
      shimmerLFOGain.gain.setTargetAtTime(shieldActive ? 0.022 : 0.0001, audioCtx.currentTime, 0.2);
    }

    // Eis: hohes Glitzern waehrend Waechter eingefroren
    if (iceGain) {
      iceGain.gain.setTargetAtTime(iceActive ? 0.012 : 0.0001, audioCtx.currentTime, 0.15);
    }
  }

  function sndBoost() {
    tone(1400, 0.06, 'sine', 0.06, 0, 2000, 'music');
    tone(1900, 0.05, 'sine', 0.05, 0.03, 2600, 'music');
  }

  function musicFreq(semitoneIdx, octaveShift) {
    const n = MUSIC_SCALE[semitoneIdx % MUSIC_SCALE.length] + (octaveShift || 0) * 12;
    return MUSIC_ROOT * Math.pow(2, n / 12);
  }

  function updateMusicScheduler() {
    if (!audioCtx || musicNextNoteTime === 0) return;
    const now = performance.now();
    let bpm = Math.min(150, 92 + (level - 1) * 6);
    if (now < speedUntil) bpm *= 1.55;
    if (now < freezeUntil) bpm *= 0.5;
    const stepDur = 60 / bpm / 2;

    if (audioCtx.currentTime - musicNextNoteTime > 0.25) musicNextNoteTime = audioCtx.currentTime + 0.05;
    while (musicNextNoteTime < audioCtx.currentTime + MUSIC_LOOKAHEAD) {
      const at = Math.max(0, musicNextNoteTime - audioCtx.currentTime);
      const dist = nearestEnemyDist();
      const danger = Math.max(0, Math.min(1, 1 - dist / 9));
      const isTrailing = trail.length > 0;
      const frozen = performance.now() < freezeUntil;
      const step = musicStepIndex % 8;
      const levelOffset = Math.floor((level - 1) / 2);

      if (step === 0 || step === 4) {
        tone(musicFreq(0 + levelOffset, -1), stepDur * 1.7, 'triangle', 0.05 + danger * 0.03, at, undefined, 'music');
      }
      if (step % 2 === 0) {
        const idx = (step / 2 + levelOffset) % MUSIC_SCALE.length;
        tone(musicFreq(idx, 0), stepDur * 0.9, 'sine', 0.045 + danger * 0.035, at, undefined, 'music');
      }
      if (!frozen && danger > 0.4 && (step === 2 || step === 6)) {
        tone(musicFreq((step + levelOffset) % MUSIC_SCALE.length, 1), stepDur * 0.5, 'square', 0.03 + danger * 0.04, at, undefined, 'music');
      }
      if (isTrailing && step % 2 === 1) {
        tone(musicFreq((step + 3 + levelOffset) % MUSIC_SCALE.length, 1), stepDur * 0.4, 'triangle', 0.025, at, undefined, 'music');
      }

      // Gefahren-Ebenen: kommen mit threatDisp (siehe draw()) nacheinander dazu und blenden weich ein
      if (!frozen) {
        const th = threatDisp;
        const hat = Math.max(0, Math.min(1, (th - 0.2) / 0.2));
        const bass = Math.max(0, Math.min(1, (th - 0.45) / 0.2));
        const clap = Math.max(0, Math.min(1, (th - 0.75) / 0.15));
        if (hat > 0) technoHat(at, step % 4 === 2, (step % 2 ? 0.02 : 0.03) * hat);
        if (bass > 0 && MUSIC_BASS_PATTERN[step]) {
          acidBass(musicFreq(levelOffset, -2), stepDur * 0.8, at, 380 + th * 1800, 0.07 * bass,
            step === 0 ? musicFreq(levelOffset, -1) : undefined);
        }
        if (clap > 0 && (step === 2 || step === 6)) clap808(at, 0.08 * clap);
      }

      musicNextNoteTime += stepDur;
      musicStepIndex++;
    }
  }
