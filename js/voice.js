  // --- Sprachausgabe aus MP3-Dateien (erzeugt mit tools/kokoro_voices.py) ---
  // Die Liste der Dateien kommt aus audio/voice/manifest.js (window.CLAIM_VOICES).
  // Eintrag: "<pack>.mp3?v=<hash>#<start>,<laenge>" = Byte-Bereich einer Zeile im Paket
  // (ein Paket pro Kategorie und Stimme, damit das Spiel wenige Dateien hat).
  // Fehlt eine Datei, sprechen die Aufrufer wie bisher per speechSynthesis.

  // Klang-Einstellungen pro Sprechertyp. Filter in Hz, 0 = aus.
  //   rate: Tonhoehe/Tempo, drive: Verzerrung 0..1, reverb: Hall-Anteil 0..1,
  //   peak: Mitten-Anhebung (Megafon), bass: Bass-Anhebung in dB
  const VOICE_FX = {
    guard:     { rate: 1.0,  highpass: 380, lowpass: 3400,  drive: 0.35, reverb: 0,    peak: 0,    bass: 0, gain: 1.2 }, // Funkgeraet
    scream:    { rate: 1.12, highpass: 120, lowpass: 9000,  drive: 0,    reverb: 0.18, peak: 0,    bass: 0, gain: 1.0 },
    dog:       { rate: 1.0,  highpass: 200, lowpass: 5000,  drive: 0.1,  reverb: 0,    peak: 0,    bass: 0, gain: 1.0 },
    announcer: { rate: 0.95, highpass: 450, lowpass: 4500,  drive: 0.6,  reverb: 0.35, peak: 1800, bass: 0, gain: 1.0 } // Megafon
  };
  // Countdown: jeder Countdown bekommt zufaellig einen Stil (nie zweimal derselbe hintereinander).
  //   ring: Roboter-Ringmodulation in Hz, echo: Slapback-Echo, octave: Doppelung tiefer (Lautstaerke),
  //   rise: Tonhoehe steigt pro Wort, goGain/goReverb: "Go!" hervorheben. Kompressor ist immer an.
  const COUNTDOWN_STYLES = {
    arena:  { rate: 1.04, highpass: 90,  lowpass: 12000, drive: 0.1,  reverb: 0.25, peak: 2000, bass: 4, gain: 0.8,
              echo: { time: 0.12, feedback: 0.3, mix: 0.35 }, rise: 0.04, goGain: 1.25, goReverb: 0.5 },
    radio:  { rate: 1.06, highpass: 420, lowpass: 3600,  drive: 0.4,  reverb: 0,    peak: 1800, bass: 0, gain: 0.85,
              rise: 0.04, goGain: 1.2, goReverb: 0.2 },
    epic:   { rate: 1.0,  highpass: 60,  lowpass: 10000, drive: 0.05, reverb: 0.3,  peak: 0,    bass: 6, gain: 0.7,
              octave: 0.6, rise: 0.03, goGain: 1.25, goReverb: 0.55 },
    robot:  { rate: 1.02, highpass: 150, lowpass: 8000,  drive: 0.2,  reverb: 0.15, peak: 1500, bass: 2, gain: 0.8,
              ring: 55, rise: 0.05, goGain: 1.2, goReverb: 0.35 },
    dry:    { rate: 1.06, highpass: 80,  lowpass: 14000, drive: 0,    reverb: 0,    peak: 2500, bass: 3, gain: 0.85,
              rise: 0.04, goGain: 1.3, goReverb: 0.25 }
  };
  const VOICE_VOLUME = 0.55;       // Gesamtlautstaerke aller Stimmen im Verhaeltnis zur Musik
  const VOICE_FILTERS_ON = true;   // false = Dateien ohne Filter abspielen
  const VOICE_DISTANCE_ON = true;  // Waechter weiter weg: leiser, dumpfer, seitlich
  // Diese Waechterstimmen laedt js/pwa.js im Hintergrund fuer offline; ohne Netz nur diese verwenden
  const VOICE_OFFLINE_IDS = ['am_adam', 'bm_george', 'am_fenrir', 'af_bella', 'bf_emma'];
  const VOICE_FEMALE_NAMES = ['Karen', 'Brenda', 'Linda', 'Doris', 'Sandra'];

  const voiceManifest = window.CLAIM_VOICES || null;
  // Direkt geoeffnete index.html (file://): fetch ist blockiert, dann speechSynthesis
  const voiceWebAudio = location.protocol !== 'file:';
  const voiceBuffers = {};   // Pfad -> AudioBuffer | Promise | 'fail'
  const voicePacks = {};     // Paket-URL -> Promise<ArrayBuffer>
  const VOICE_MAX_GUARDS = 3;      // so viele Waechterstimmen duerfen sich hoechstens ueberlagern
  let voiceActive = [];      // laufende Stimmen: { playing(), stop(), guard, id }
  let voiceReverbIR = null;
  let voiceGuardVoiceIds = null;
  let countdownStyle = null, countdownStyleName = '';

  function voiceFiles(cat, text) {
    const c = voiceManifest && voiceManifest[cat];
    return (c && c[text]) || null;
  }
  function voiceGuardFiles(text) {
    if (!voiceManifest) return null;
    for (const cat in voiceManifest) {
      if (cat.indexOf('guard_') === 0 && voiceManifest[cat][text]) return voiceManifest[cat][text];
    }
    return null;
  }
  function voicePackUrl(path) { return path.split('#')[0]; }
  function voiceIdOf(path) {
    const p = voicePackUrl(path).split('?')[0].split('/');
    return p[p.length - 1].replace(/\.[^.]+$/, '');
  }
  function voicePrune() { voiceActive = voiceActive.filter(v => v.playing()); return voiceActive; }
  function voiceBusy() { return voicePrune().length > 0; }
  function voiceStop() {
    voiceActive.forEach(v => v.stop());
    voiceActive = [];
  }

  // Jeder Waechter bekommt einmalig eine feste Stimme (passend zum Namen) und Tonhoehe
  function voiceAssign(e) {
    if (e.voiceFileId) return;
    if (!voiceGuardVoiceIds) {
      const set = {};
      const c = (voiceManifest && voiceManifest.guard_spotted) || {};
      for (const t in c) c[t].forEach(p => { set[voiceIdOf(p)] = true; });
      voiceGuardVoiceIds = Object.keys(set);
    }
    const female = VOICE_FEMALE_NAMES.includes(e.name);
    let ids = voiceGuardVoiceIds;
    if (!navigator.onLine) {
      const off = ids.filter(v => VOICE_OFFLINE_IDS.includes(v));
      if (off.length) ids = off;
    }
    let pool = ids.filter(v => (v[1] === 'f') === female);
    if (!pool.length) pool = ids;
    e.voiceFileId = pool.length ? pool[Math.floor(Math.random() * pool.length)] : '';
    e.voiceFileRate = 0.88 + Math.random() * 0.22;
    voicePrefetchGuard(e.voiceFileId);
  }

  function voicePackFetch(url) {
    if (!voicePacks[url]) {
      voicePacks[url] = fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
      voicePacks[url].catch(() => { delete voicePacks[url]; });
    }
    return voicePacks[url];
  }
  // Pakete einer Waechterstimme vorladen, damit der erste Satz nicht zu spaet kommt
  function voicePrefetchGuard(id) {
    if (!voiceWebAudio || !voiceManifest || !id) return;
    for (const cat in voiceManifest) {
      if (cat.indexOf('guard_') !== 0) continue;
      for (const t in voiceManifest[cat]) {
        const p = voiceManifest[cat][t].find(f => voiceIdOf(f) === id);
        if (p) voicePackFetch(voicePackUrl(p)).catch(() => {});
        break; // ein Eintrag pro Kategorie genuegt, alle liegen im selben Paket
      }
    }
  }
  function voiceLoad(path) {
    const b = voiceBuffers[path];
    if (b) return b instanceof Promise ? b : Promise.resolve(b);
    const url = voicePackUrl(path);
    const range = (path.split('#')[1] || '').split(',').map(Number);
    const p = voicePackFetch(url)
      .then(pack => (range.length === 2 ? pack.slice(range[0], range[0] + range[1]) : pack.slice(0)))
      .then(data => new Promise((res, rej) => audioCtx.decodeAudioData(data, res, rej)))
      .then(buf => (voiceBuffers[path] = buf))
      .catch(() => (voiceBuffers[path] = 'fail'));
    voiceBuffers[path] = p;
    return p;
  }
  function voicePreload(cat) {
    if (!voiceWebAudio || !audioCtx || !voiceManifest || !voiceManifest[cat]) return;
    for (const t in voiceManifest[cat]) voiceManifest[cat][t].forEach(voiceLoad);
  }
  // Countdown und Ansager vorladen, sobald der Audio-Kontext steht
  function voicePreloadOnGesture() {
    setTimeout(() => {
      if (!audioCtx) return;
      voicePreload('countdown');
      voicePreload('announcer');
      window.removeEventListener('pointerdown', voicePreloadOnGesture);
      window.removeEventListener('keydown', voicePreloadOnGesture);
    }, 0);
  }
  if (voiceManifest) {
    window.addEventListener('pointerdown', voicePreloadOnGesture);
    window.addEventListener('keydown', voicePreloadOnGesture);
  }

  function voiceDriveCurve(amount) {
    const k = amount * 60, n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i * 2 / n - 1;
      curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }
    return curve;
  }
  // Ein gemeinsamer Hall fuer alle Stimmen: ein Faltungshall pro Satz ist auf dem Handy
  // zu teuer (Knacken, danach bleibt der Ton ganz weg)
  let voiceReverbBus = null;
  function voiceReverbInput() {
    if (voiceReverbBus) return voiceReverbBus;
    const conv = audioCtx.createConvolver();
    conv.buffer = voiceReverb();
    conv.connect(voiceOut());
    return (voiceReverbBus = conv);
  }
  function voiceReverb() {
    if (voiceReverbIR) return voiceReverbIR;
    const len = Math.floor(audioCtx.sampleRate * 0.9);
    const ir = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return (voiceReverbIR = ir);
  }

  // Filterkette: Quelle -> Hochpass -> Mitten -> Bass -> Verzerrung -> Tiefpass -> Lautstaerke -> Panorama
  // Gibt alle erzeugten Knoten zurueck, damit sie nach dem Satz wieder getrennt werden
  function voiceChain(src, fx, opt) {
    let node = src;
    const nodes = [];
    const link = n => { node.connect(n); node = n; nodes.push(n); };
    if (VOICE_FILTERS_ON) {
      if (fx.highpass) {
        const f = audioCtx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = fx.highpass; link(f);
      }
      if (fx.peak) {
        const f = audioCtx.createBiquadFilter(); f.type = 'peaking'; f.frequency.value = fx.peak; f.Q.value = 1; f.gain.value = 8; link(f);
      }
      if (fx.bass) {
        const f = audioCtx.createBiquadFilter(); f.type = 'lowshelf'; f.frequency.value = 180; f.gain.value = fx.bass; link(f);
      }
      if (fx.drive) {
        const w = audioCtx.createWaveShaper(); w.curve = voiceDriveCurve(fx.drive); w.oversample = 'none'; link(w);
      }
    }
    let ringOsc = null;
    if (VOICE_FILTERS_ON && fx.ring) {
      const ring = audioCtx.createGain(); ring.gain.value = 0;
      ringOsc = audioCtx.createOscillator(); ringOsc.frequency.value = fx.ring;
      ringOsc.connect(ring.gain); ringOsc.start();
      nodes.push(ringOsc);
      link(ring);
    }
    const lp = Math.min(VOICE_FILTERS_ON ? fx.lowpass || 20000 : 20000, opt.lowpass || 20000);
    if (lp < 20000) {
      const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; link(f);
    }
    if (VOICE_FILTERS_ON && fx.comp) {
      const c = audioCtx.createDynamicsCompressor();
      c.threshold.value = -22; c.knee.value = 8; c.ratio.value = 5; c.attack.value = 0.003; c.release.value = 0.15;
      link(c);
    }
    const g = audioCtx.createGain();
    g.gain.value = VOICE_VOLUME * (fx.gain || 1) * (opt.vol == null ? 1 : opt.vol);
    link(g);
    let out = g;
    if (audioCtx.createStereoPanner && opt.pan) {
      const p = audioCtx.createStereoPanner(); p.pan.value = opt.pan; g.connect(p); out = p; nodes.push(p);
    }
    out.connect(voiceOut());
    if (VOICE_FILTERS_ON && fx.reverb) {
      const wet = audioCtx.createGain(); wet.gain.value = fx.reverb;
      g.connect(wet); wet.connect(voiceReverbInput()); nodes.push(wet);
    }
    if (VOICE_FILTERS_ON && fx.echo) {
      const d = audioCtx.createDelay(1); d.delayTime.value = fx.echo.time;
      const fb = audioCtx.createGain(); fb.gain.value = fx.echo.feedback;
      const wet = audioCtx.createGain(); wet.gain.value = fx.echo.mix;
      g.connect(d); d.connect(fb); fb.connect(d); d.connect(wet);
      wet.connect(out === g ? (voiceOut()) : out);
      nodes.push(d, fb, wet);
    }
    return { ringOsc, nodes };
  }
  // Nach dem Satz (plus Zeit fuer Echo und Hall) alles trennen, sonst sammeln sich Knoten an
  function voiceRelease(chain, delayMs) {
    setTimeout(() => {
      if (chain.ringOsc) try { chain.ringOsc.stop(); } catch (err) { /* ignore */ }
      chain.nodes.forEach(n => { try { n.disconnect(); } catch (err) { /* ignore */ } });
    }, delayMs);
  }
  // Handy: Audio wird bei Anrufen, Sperrbildschirm oder Tab-Wechsel angehalten ('interrupted')
  function voiceResume() {
    if (audioCtx && audioCtx.state !== 'running' && audioCtx.state !== 'closed') audioCtx.resume().catch(() => {});
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) voiceResume(); });
  window.addEventListener('touchend', voiceResume, { passive: true });

  // Spielt eine Datei; gibt false zurueck, wenn nichts abgespielt werden kann
  function voicePlay(path, fx, opt) {
    opt = opt || {};
    ensureAudio();
    if (!audioCtx) return false;
    voiceResume();
    const rate = (fx.rate || 1) * (opt.rate || 1);
    // Waechter ueberlagern sich, alles andere (Countdown, Ansager) unterbricht
    if (!opt.guard) voiceStop();

    // Ohne fetch (file://) lassen sich Zeilen nicht aus dem Paket schneiden: speechSynthesis
    if (!voiceWebAudio) return false;
    if (voiceBuffers[path] === 'fail') return false;
    const requested = performance.now();
    let src = null, playing = true;
    const cur = {
      guard: !!opt.guard, id: opt.id || '',
      playing: () => playing,
      stop: () => { playing = false; if (src) try { src.stop(); } catch (err) { /* ignore */ } }
    };
    voiceActive.push(cur);
    voiceLoad(path).then(buf => {
      // Zu spaet geladen oder inzwischen abgebrochen: weglassen
      if (!playing || buf === 'fail' || performance.now() - requested > 1500) { playing = false; return; }
      src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const input = audioCtx.createGain();
      src.connect(input);
      // Doppelung: zweite Kopie eine Oktave tiefer, endet mit dem Original
      let oct = null;
      if (VOICE_FILTERS_ON && fx.octave) {
        oct = audioCtx.createBufferSource();
        oct.buffer = buf;
        oct.playbackRate.value = rate * 0.5;
        const og = audioCtx.createGain(); og.gain.value = fx.octave;
        oct.connect(og); og.connect(input);
      }
      const chain = voiceChain(input, fx, opt);
      chain.nodes.push(src, input);
      if (oct) chain.nodes.push(oct);
      // Laeuft auch nach stop(): Echo ausklingen lassen, dann alles trennen
      src.onended = () => {
        playing = false;
        if (oct) try { oct.stop(); } catch (err) { /* ignore */ }
        voiceRelease(chain, fx.echo ? 1500 : 200);
      };
      const stopSrc = cur.stop;
      cur.stop = () => {
        stopSrc();
        if (oct) try { oct.stop(); } catch (err) { /* ignore */ }
      };
      src.start();
      if (oct) oct.start();
    });
    return true;
  }

  // Waechter: true = erledigt (abgespielt oder bewusst unterdrueckt), false = Browser-Stimme nehmen
  function voicePlayGuard(e, text, scream) {
    const dog = e.personality === 'dog';
    const files = scream ? voiceFiles('guard_scream', text) : (dog ? voiceFiles('dog', text) : voiceGuardFiles(text));
    if (!files || !files.length) return false;
    voiceAssign(e);
    const active = voicePrune();
    if (active.some(v => !v.guard)) return true;              // Countdown/Ansager hat Vorrang
    if (active.some(v => v.id === e.voiceFileId)) return true; // dieselbe Stimme nicht doppelt
    if (active.length >= VOICE_MAX_GUARDS) {
      if (!scream) return true;
      active[0].stop(); // Schrei verdraengt die aelteste Stimme
      voicePrune();
    }
    const path = files.find(p => voiceIdOf(p) === e.voiceFileId) || files[0];
    const opt = { rate: dog ? 1 : e.voiceFileRate, guard: true, id: e.voiceFileId };
    if (VOICE_DISTANCE_ON && typeof px === 'number' && typeof py === 'number') {
      const d = Math.hypot(e.c - px, e.r - py);
      opt.vol = Math.max(0.45, 1 - d / 30);
      opt.lowpass = Math.max(1400, 9000 - d * 350);
      opt.pan = Math.max(-0.7, Math.min(0.7, (e.c - px) / (COLS / 2)));
    }
    if (replayRadio) { opt.lowpass = 2600; opt.vol = 0.9; opt.pan = 0; } // Wiedergabe: Funkgeraet-Klang
    return voicePlay(path, scream ? VOICE_FX.scream : (dog ? VOICE_FX.dog : VOICE_FX.guard), opt);
  }
  function voicePlayCountdown(word) {
    const files = voiceFiles('countdown', word);
    if (!files) return false;
    const step = Math.max(0, COUNTDOWN_WORDS.indexOf(word));
    const last = step === COUNTDOWN_WORDS.length - 1;
    // Neuer Stil beim ersten Wort, nie derselbe wie beim letzten Countdown
    if (step === 0 || !countdownStyle) {
      const names = Object.keys(COUNTDOWN_STYLES).filter(n => n !== countdownStyleName);
      countdownStyleName = names[Math.floor(Math.random() * names.length)];
      countdownStyle = COUNTDOWN_STYLES[countdownStyleName];
    }
    const st = countdownStyle;
    const fx = Object.assign({}, st, {
      rate: st.rate * (1 + (st.rise || 0) * step), // Spannung steigt bis "Go!"
      gain: st.gain * (last ? st.goGain || 1 : 1),
      reverb: last && st.goReverb != null ? st.goReverb : st.reverb,
      comp: true
    });
    return voicePlay(files[0], fx);
  }
  function voicePlayAnnouncer(text) {
    const files = voiceFiles('announcer', text);
    return !!(files && voicePlay(files[0], VOICE_FX.announcer));
  }
