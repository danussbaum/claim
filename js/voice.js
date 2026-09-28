  // --- Sprachausgabe aus MP3-Dateien (erzeugt mit tools/kokoro_voices.py) ---
  // Die Liste der Dateien kommt aus audio/voice/manifest.js (window.CLAIM_VOICES).
  // Fehlt eine Datei, sprechen die Aufrufer wie bisher per speechSynthesis.

  // Klang-Einstellungen pro Sprechertyp. Filter in Hz, 0 = aus.
  //   rate: Tonhoehe/Tempo, drive: Verzerrung 0..1, reverb: Hall-Anteil 0..1,
  //   peak: Mitten-Anhebung (Megafon), bass: Bass-Anhebung in dB
  const VOICE_FX = {
    guard:     { rate: 1.0,  highpass: 380, lowpass: 3400,  drive: 0.35, reverb: 0,    peak: 0,    bass: 0, gain: 1.2 }, // Funkgeraet
    scream:    { rate: 1.12, highpass: 120, lowpass: 9000,  drive: 0,    reverb: 0.18, peak: 0,    bass: 0, gain: 1.0 },
    dog:       { rate: 1.0,  highpass: 200, lowpass: 5000,  drive: 0.1,  reverb: 0,    peak: 0,    bass: 0, gain: 1.0 },
    announcer: { rate: 0.95, highpass: 450, lowpass: 4500,  drive: 0.6,  reverb: 0.35, peak: 1800, bass: 0, gain: 1.0 }, // Megafon
    countdown: { rate: 0.94, highpass: 0,   lowpass: 12000, drive: 0,    reverb: 0.3,  peak: 0,    bass: 7, gain: 1.1 }
  };
  const VOICE_FILTERS_ON = true;   // false = Dateien ohne Filter abspielen
  const VOICE_DISTANCE_ON = true;  // Waechter weiter weg: leiser, dumpfer, seitlich
  const VOICE_FEMALE_NAMES = ['Karen', 'Brenda', 'Linda', 'Doris', 'Sandra'];

  const voiceManifest = window.CLAIM_VOICES || null;
  // Direkt geoeffnete index.html (file://): fetch ist blockiert, dann nur <audio> ohne Filter
  const voiceWebAudio = location.protocol !== 'file:';
  const voiceBuffers = {};   // Pfad -> AudioBuffer | Promise | 'fail'
  let voiceCurrent = null;   // { playing(), stop() }
  let voiceReverbIR = null;
  let voiceGuardVoiceIds = null;

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
  function voiceIdOf(path) { const p = path.split('/'); return p[p.length - 2]; }
  function voiceBusy() { return !!(voiceCurrent && voiceCurrent.playing()); }
  function voiceStop() {
    if (voiceCurrent) voiceCurrent.stop();
    voiceCurrent = null;
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
    let pool = voiceGuardVoiceIds.filter(v => (v[1] === 'f') === female);
    if (!pool.length) pool = voiceGuardVoiceIds;
    e.voiceFileId = pool.length ? pool[Math.floor(Math.random() * pool.length)] : '';
    e.voiceFileRate = 0.88 + Math.random() * 0.22;
  }

  function voiceLoad(path) {
    const b = voiceBuffers[path];
    if (b) return b instanceof Promise ? b : Promise.resolve(b);
    const p = fetch(path)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
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
  function voiceReverb() {
    if (voiceReverbIR) return voiceReverbIR;
    const len = Math.floor(audioCtx.sampleRate * 1.4);
    const ir = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return (voiceReverbIR = ir);
  }

  // Filterkette: Quelle -> Hochpass -> Mitten -> Bass -> Verzerrung -> Tiefpass -> Lautstaerke -> Panorama
  function voiceChain(src, fx, opt) {
    let node = src;
    const link = n => { node.connect(n); node = n; };
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
        const w = audioCtx.createWaveShaper(); w.curve = voiceDriveCurve(fx.drive); w.oversample = '2x'; link(w);
      }
    }
    const lp = Math.min(VOICE_FILTERS_ON ? fx.lowpass || 20000 : 20000, opt.lowpass || 20000);
    if (lp < 20000) {
      const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; link(f);
    }
    const g = audioCtx.createGain();
    g.gain.value = (fx.gain || 1) * (opt.vol == null ? 1 : opt.vol);
    link(g);
    let out = g;
    if (audioCtx.createStereoPanner && opt.pan) {
      const p = audioCtx.createStereoPanner(); p.pan.value = opt.pan; g.connect(p); out = p;
    }
    out.connect(sfxGain || audioCtx.destination);
    if (VOICE_FILTERS_ON && fx.reverb) {
      const conv = audioCtx.createConvolver(); conv.buffer = voiceReverb();
      const wet = audioCtx.createGain(); wet.gain.value = fx.reverb;
      g.connect(conv); conv.connect(wet); wet.connect(out === g ? (sfxGain || audioCtx.destination) : out);
    }
  }

  // Spielt eine Datei; gibt false zurueck, wenn nichts abgespielt werden kann
  function voicePlay(path, fx, opt) {
    opt = opt || {};
    ensureAudio();
    if (!audioCtx) return false;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const rate = (fx.rate || 1) * (opt.rate || 1);
    voiceStop();

    if (!voiceWebAudio) {
      const a = new Audio(path);
      a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false;
      a.playbackRate = rate;
      a.volume = Math.max(0, Math.min(1, opt.vol == null ? 1 : opt.vol));
      a.play().catch(() => {});
      voiceCurrent = { playing: () => !a.paused && !a.ended, stop: () => a.pause() };
      return true;
    }

    if (voiceBuffers[path] === 'fail') return false;
    const requested = performance.now();
    let src = null, playing = true;
    const cur = {
      playing: () => playing,
      stop: () => { playing = false; if (src) try { src.stop(); } catch (err) { /* ignore */ } }
    };
    voiceCurrent = cur;
    voiceLoad(path).then(buf => {
      // Zu spaet geladen oder inzwischen abgebrochen: weglassen
      if (!playing || buf === 'fail' || performance.now() - requested > 1500) { playing = false; return; }
      src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.onended = () => { playing = false; };
      voiceChain(src, fx, opt);
      src.start();
    });
    return true;
  }

  // Waechter: true = erledigt (abgespielt oder bewusst unterdrueckt), false = Browser-Stimme nehmen
  function voicePlayGuard(e, text, scream) {
    const dog = e.personality === 'dog';
    const files = scream ? voiceFiles('guard_scream', text) : (dog ? voiceFiles('dog', text) : voiceGuardFiles(text));
    if (!files || !files.length) return false;
    if (!scream && voiceBusy()) return true; // laeuft schon ein Spruch
    voiceAssign(e);
    const path = files.find(p => voiceIdOf(p) === e.voiceFileId) || files[0];
    const opt = { rate: dog ? 1 : e.voiceFileRate };
    if (VOICE_DISTANCE_ON && typeof px === 'number' && typeof py === 'number') {
      const d = Math.hypot(e.c - px, e.r - py);
      opt.vol = Math.max(0.45, 1 - d / 30);
      opt.lowpass = Math.max(1400, 9000 - d * 350);
      opt.pan = Math.max(-0.7, Math.min(0.7, (e.c - px) / (COLS / 2)));
    }
    return voicePlay(path, scream ? VOICE_FX.scream : (dog ? VOICE_FX.dog : VOICE_FX.guard), opt);
  }
  function voicePlayCountdown(word) {
    const files = voiceFiles('countdown', word);
    return !!(files && voicePlay(files[0], VOICE_FX.countdown));
  }
  function voicePlayAnnouncer(text) {
    const files = voiceFiles('announcer', text);
    return !!(files && voicePlay(files[0], VOICE_FX.announcer));
  }
