// Fehlschlag-Wiedergabe: nach dem Tod laeuft der Tod nochmal ab, als VHS-Band
// aus Sicht des Waechters, der dich erwischt hat.
// Aufzeichnung: kleine Kopien des fertigen Bildes (Ringpuffer) plus Positionen,
// Blickrichtungen und Ton-Ereignisse (Sprueche, Schuesse, Alarm).

  const REPLAY_SECONDS = 3;
  const REPLAY_FRAME_MS = 83;              // 12 Bilder pro Sekunde, dazwischen wird ueberblendet
  const REPLAY_MAX_FRAMES = Math.ceil(REPLAY_SECONDS * 1000 / REPLAY_FRAME_MS);
  const REPLAY_MAX_W = 240;                // Aufloesung der Kopien (Speicher: ~12 MB total)
  const REPLAY_FREEZE_MS = 1900;

  let replayFrames = [];   // { t, img, camX, camY, pcx, pcy, guards: [{ e, x, y, a, hunt }] }
  let replayPool = [];     // wiederverwendete Canvas
  let replayEvents = [];   // { t, fn, args, voice }
  let replayClock = 0, replayLastReal = 0, replayLastShot = -1e9;
  let replayActive = false;
  let replayRadio = false; // voice.js: Stimmen klingen wie aus dem Funkgeraet

  function replayReset() {
    for (const f of replayFrames) replayPool.push(f.img);
    replayFrames = [];
    replayEvents = [];
    replayClock = 0;
    replayLastReal = 0;
  }

  // Aufgerufen nach jedem draw() im Hauptloop
  function replayCapture(now) {
    if (replayActive || tutorialActive) return;
    if (countdownActive || !running) { if (countdownActive) replayReset(); return; }
    // Pausen und Overlays zaehlen nicht als Bandzeit
    const step = replayLastReal ? Math.min(now - replayLastReal, 100) : 0;
    replayLastReal = now;
    replayClock += step;
    if (replayClock - replayLastShot < REPLAY_FRAME_MS && replayFrames.length) return;
    replayLastShot = replayClock;

    const W = boardCanvas.width, H = boardCanvas.height;
    const s = Math.min(1, REPLAY_MAX_W / W);
    let img = replayFrames.length >= REPLAY_MAX_FRAMES ? replayFrames.shift().img : replayPool.pop();
    if (!img) img = document.createElement('canvas');
    const w = Math.round(W * s), h = Math.round(H * s);
    if (img.width !== w || img.height !== h) { img.width = w; img.height = h; }
    img.getContext('2d').drawImage(boardCanvas, 0, 0, w, h);

    // Gleiche Kamera-Rechnung wie draw(), damit Weltkoordinaten aufs Bild passen
    const pT = Math.min(1, (now - playerStepTime) / currentPlayerInterval());
    const dpx = prevPx + (px - prevPx) * pT, dpy = prevPy + (py - prevPy) * pT;
    const follow = cameraMode === 'follow' || cameraMode === 'push';
    const camX = follow ? W / 2 - (dpx * CELL + CELL / 2) : 0;
    const camY = follow ? H / 2 - (dpy * CELL + CELL / 2) : 0;
    const eT = Math.min(1, (now - enemyStepTime) / enemyInterval);
    const guards = enemies.map(e => {
      const pc = e.prevC !== undefined ? e.prevC : e.c;
      const pr = e.prevR !== undefined ? e.prevR : e.r;
      return {
        e, x: pc + (e.c - pc) * eT, y: pr + (e.r - pr) * eT,
        a: e.angleDisp !== undefined ? e.angleDisp : enemyFacing(e),
        hunt: !!e.huntingActive || now < alarmUntil
      };
    });
    replayFrames.push({ t: replayClock, img, camX, camY, px: dpx, py: dpy, guards });
    const t0 = replayFrames[0].t;
    replayEvents = replayEvents.filter(ev => ev.t >= t0);
  }

  // Ton-Ereignisse mitschreiben: Funktion ersetzen, Original weiter aufrufen
  function replayHook(name, voice) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      if (!replayActive && running && replayLastReal) {
        const t = replayClock + Math.min(100, performance.now() - replayLastReal);
        replayEvents.push({ t, fn: orig, args: Array.prototype.slice.call(arguments), voice });
      }
      return orig.apply(this, arguments);
    };
  }
  replayHook('guardShout', true);
  ['sndHunterAlert', 'sndShoot', 'sndEnemyDeath', 'sndNearMiss', 'sndGuardTrip', 'sndDecoyThrow',
   'sndQuack', 'sndLineCut', 'sndGameOver', 'sndGadgetHook', 'sndGadgetSmoke'].forEach(n => replayHook(n, false));

  // Der Waechter, der am naechsten am Spieler war (bei Mine/eigener Linie: keiner)
  function replayKiller(reason) {
    const last = replayFrames[replayFrames.length - 1];
    if (!last || !/guard/i.test(reason || '')) return null;
    let best = null, bd = 4;
    for (const g of last.guards) {
      const d = Math.hypot(g.x - last.px, g.y - last.py);
      if (d < bd) { bd = d; best = g.e; }
    }
    return best;
  }

  // Spielt die Aufzeichnung ab, dann done(). Ohne Aufzeichnung sofort done().
  function replayPlay(reason, done) {
    if (replayFrames.length < 6 || replayActive) { replayReset(); done(); return; }
    replayActive = true;
    // Die Tod-Abdunklung (CSS) wuerde auch die Wiedergabe verdunkeln
    const wrap = document.getElementById('board-wrap');
    wrap.classList.remove('dimming');
    const frames = replayFrames, events = replayEvents;
    const killer = replayKiller(reason);
    const camNo = killer ? (enemies.indexOf(killer) + 1 || frames[0].guards.findIndex(g => g.e === killer) + 1) : 0;
    const camLabel = 'CAM-' + String(camNo).padStart(2, '0') + (killer && killer.name ? '  ' + killer.name.toUpperCase() : '  FLOOR');
    const tStart = frames[0].t, tEnd = frames[frames.length - 1].t;
    const W = boardCanvas.width, H = boardCanvas.height;

    let phase = 'play', phaseStart = performance.now(), last = phaseStart;
    let tape = tStart, evIdx = 0, lastVoiceAt = -1e9, finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      replayActive = false;
      replayRadio = false;
      wrap.classList.add('dimming');
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
      window.removeEventListener('touchstart', skip, true);
      replayReset();
      for (const c of replayPool) { c.width = 0; c.height = 0; } // Speicher sofort freigeben
      replayPool = [];
      done();
    };
    const skip = (ev) => {
      ev.stopPropagation();
      if (ev.cancelable) ev.preventDefault();
      if (ev.type !== 'touchstart') finish();
    };
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);
    window.addEventListener('touchstart', skip, { capture: true, passive: false });

    // Zwei Nachbarbilder plus Mischanteil: Bild und Positionen werden ueberblendet
    const frameAt = (t) => {
      let i = 0;
      while (i < frames.length - 1 && frames[i + 1].t <= t) i++;
      const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
      const k = b === a ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
      if (!k) return a;
      const lerp = (x, y) => x + (y - x) * k;
      return {
        img: a.img, img2: b.img, mix: k,
        camX: lerp(a.camX, b.camX), camY: lerp(a.camY, b.camY), px: lerp(a.px, b.px), py: lerp(a.py, b.py),
        guards: a.guards.map(g => {
          const h = b.guards.find(o => o.e === g.e);
          return h ? { e: g.e, x: lerp(g.x, h.x), y: lerp(g.y, h.y), a: g.a + shortestAngleDelta(g.a, h.a) * k, hunt: g.hunt || h.hunt } : g;
        })
      };
    };

    const step = (now) => {
      if (finished) return;
      const dt = Math.min(100, now - last);
      last = now;
      const pe = now - phaseStart;

      if (phase === 'play') {
        const prev = tape;
        tape = Math.min(tEnd, tape + dt);
        // Ton-Ereignisse im passenden Moment ausloesen. Stimmen in normalem Tempo,
        // dicht aufeinanderfolgende werden ausgelassen, damit nichts ueberlappt.
        while (evIdx < events.length && events[evIdx].t <= tape) {
          const ev = events[evIdx++];
          if (ev.t < prev - 1) continue;
          if (ev.voice) {
            if (now - lastVoiceAt < 700) continue;
            lastVoiceAt = now;
            replayRadio = true;
            try { ev.fn.apply(null, ev.args); } catch (err) { /* ignore */ }
            replayRadio = false;
          } else {
            try { ev.fn.apply(null, ev.args); } catch (err) { /* ignore */ }
          }
        }
        if (tape >= tEnd) {
          phase = 'freeze'; phaseStart = now;
          if (killer && voiceMode !== 'off') {
            replayRadio = true;
            guardSay(killer, 'replay', true);
            replayRadio = false;
          }
        }
      } else if (pe >= REPLAY_FREEZE_MS) { finish(); return; }

      replayDrawFrame(frameAt(tape), now, phase, pe, killer, camLabel, tape, tStart, W, H);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function replayDrawFrame(f, now, phase, pe, killer, camLabel, tape, tStart, W, H) {
    const g = killer ? f.guards.find(o => o.e === killer) : null;
    // Blickpunkt: der Waechter (Bildschirmkoordinaten der Aufnahme) oder der Spieler
    const wx = g ? g.x : f.px, wy = g ? g.y : f.py;
    const sx = f.camX + wx * CELL + CELL / 2, sy = f.camY + wy * CELL + CELL / 2;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Bild wie im Spiel, ohne Zoom oder Farbfilter
    ctx.drawImage(f.img, 0, 0, W, H);
    if (f.img2) { ctx.globalAlpha = f.mix; ctx.drawImage(f.img2, 0, 0, W, H); ctx.globalAlpha = 1; }

    // "!" ueber dem Waechter, sobald er dich gesehen hat
    if (g && g.hunt) {
      const bob = Math.sin(now / 70) * 2;
      ctx.font = 'bold ' + Math.round(CELL * 1.2) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff3b30';
      ctx.fillText('!', sx, sy - CELL * 0.9 + bob);
    }

    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    // Leichtes Rauschen
    const noise = 80;
    for (let i = 0; i < noise; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.25)';
      ctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 1);
    }
    // Tracking-Streifen, der durchs Bild wandert
    const bandY = ((now / 9) % (H + 60)) - 30;
    ctx.fillStyle = 'rgba(255,255,255,' + 0.05 + ')';
    ctx.fillRect(0, bandY, W, 12);
    // Einblendungen
    const fs = Math.max(11, Math.round(W / 26));
    ctx.font = 'bold ' + fs + 'px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#e8ffe8';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    if (Math.floor(now / 500) % 2 === 0) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(fs * 0.9, fs * 1.25, fs * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8ffe8';
    }
    ctx.fillText('REC  ' + camLabel, fs * 1.6, fs * 0.7);
    const ms = Math.max(0, tape - tStart);
    const stamp = '00:' + String(Math.floor(ms / 1000)).padStart(2, '0') + ':' +
                  String(Math.floor((ms % 1000) / 1000 * 25)).padStart(2, '0');
    ctx.textAlign = 'right';
    ctx.fillText(stamp, W - fs * 0.8, fs * 0.7);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const mode = phase === 'play' ? '▶ PLAY' : '❚❚ PAUSE';
    ctx.fillText(mode, fs * 0.8, H - fs * 0.8);
    ctx.textAlign = 'right';
    ctx.globalAlpha = 0.7;
    ctx.fillText('tap to skip', W - fs * 0.8, H - fs * 0.8);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Standbild: Stempel
    if (phase === 'freeze') {
      const k = Math.min(1, pe / 160);
      const sc = 1.8 - 0.8 * k;
      ctx.save();
      ctx.translate(W / 2, H * 0.42);
      ctx.rotate(-0.2);
      ctx.scale(sc, sc);
      ctx.globalAlpha = k;
      const text = killer ? 'CAUGHT' : 'OOPS';
      ctx.font = '900 ' + Math.round(W / 7) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(text).width;
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = Math.max(3, W / 90);
      ctx.strokeRect(-tw / 2 - W * 0.04, -W * 0.09, tw + W * 0.08, W * 0.18);
      ctx.fillStyle = '#ff3b30';
      ctx.fillText(text, 0, W * 0.005);
      ctx.restore();
    }
    ctx.restore();
  }
