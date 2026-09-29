// Bildschirm-Effekte ueber dem fertigen Bild (nach dem Zeichnen der Welt).

  // PSYLO: Phase der Hue-Rotation (Grad), lauft nur waehtrend aktiv. Auf Modul-
  // Ebene, damit die Rotation bei Re-Auslösung glatt weitläuft statt zu springen.
  let psyloPhase = 0;
  // Offscreen-Buffer fuer das Double-Vision-Ghosting. Lazily erzeugt und wird
  // beim Level-/Resize-Größenwechsel neu angelegt.
  let psyloScreen = null, psyloScreenCtx = null, psyloScreenSize = [0, 0];
  function ensurePsyloScreen() {
    const w = boardCanvas.width, h = boardCanvas.height;
    if (psyloScreen === null || psyloScreenSize[0] !== w || psyloScreenSize[1] !== h) {
      psyloScreen = document.createElement('canvas');
      psyloScreen.width = w;
      psyloScreen.height = h;
      psyloScreenCtx = psyloScreen.getContext('2d');
      psyloScreenSize = [w, h];
    }
  }

  // Ente (Chaos-Power-down) mit Vektorformen statt Emoji: animierbare Beine und

// Szenenfilter, PSYLO-Ghosting, Nebel, Vignette und Countdown ueber dem fertigen Bild.
function drawOverlays(now, psyloActive, sceneFilter, pcx, pcy) {
    // Szenenfilter (Drunk/PSYLO) in einem einzigen Durchgang aufs fertige Bild
    if (sceneFilter) {
      ensurePsyloScreen();
      if (psyloScreen && psyloScreenCtx) {
        psyloScreenCtx.clearRect(0, 0, psyloScreen.width, psyloScreen.height);
        psyloScreenCtx.drawImage(boardCanvas, 0, 0);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
        ctx.filter = sceneFilter;
        ctx.drawImage(psyloScreen, 0, 0);
        ctx.restore();
      }
    }

    // PSYLO Double-Vision-Ghosting: komplettes Frame als Ghost-Layer (sinusförmig
    // oscillierender Offset, ~45% Alpha) über dem Hauptbild. Offscreen-Buffer wird
    // nur beim ersten aktiven Frame erzeugt und bei Canvas-Größenwechsel neu angelegt.
    if (psyloActive) {
      ensurePsyloScreen();
      if (psyloScreen && psyloScreenCtx) {
        const ps = psyloScreen, pctx = psyloScreenCtx;
        pctx.clearRect(0, 0, ps.width, ps.height);
        pctx.drawImage(boardCanvas, 0, 0);
        const s = Math.sin(now / 900); // glatter Sinus, Periode ~5.6s
        const gMax = Math.max(4, (boardCanvas.width + boardCanvas.height) * 0.012);
        const gx = s * gMax * 0.9, gy = -s * gMax * 0.35;
        ctx.globalAlpha = Math.max(0.07, 0.45 * (Math.abs(s) + 0.28));
        ctx.drawImage(ps, gx, gy);
        ctx.drawImage(ps, -gx, -gy);
        ctx.globalAlpha = 1;
      }
    }

    // Nebel-Effekt: nur ein Radius um den Spieler bleibt sichtbar
    if (now < fogUntil) {
      const fogRadius = CELL * 3.1;
      const [fogCx, fogCy] = worldToScreen(pcx, pcy);
      const fg = ctx.createRadialGradient(fogCx, fogCy, fogRadius * 0.25, fogCx, fogCy, fogRadius * 1.15);
      fg.addColorStop(0, 'rgba(6,6,10,0)');
      fg.addColorStop(1, 'rgba(6,6,10,0.95)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    }

    // Spannungs-Vignette: dunkler Rand, der bei Gefahr staerker und roetlicher wird
    const vw = boardCanvas.width, vh = boardCanvas.height;
    drawVignette(vw, vh);

    if (countdownActive) {
      const elapsed = Math.max(0, now - countdownStartTime); // vor dem Start (Sprachvorlauf) steht die 3
      const totalDur = COUNTDOWN_STEPS.length * COUNTDOWN_STEP_MS;
      if (now - countdownStartTime >= totalDur) {
        countdownActive = false;
      } else {
        ctx.fillStyle = 'rgba(5,8,6,0.5)';
        ctx.fillRect(0, 0, vw, vh);
        const stepIdx = Math.min(COUNTDOWN_STEPS.length - 1, Math.floor(elapsed / COUNTDOWN_STEP_MS));
        const stepT = (elapsed - stepIdx * COUNTDOWN_STEP_MS) / COUNTDOWN_STEP_MS;
        const label = COUNTDOWN_STEPS[stepIdx];
        const scale = stepT < 0.25 ? (1.7 - (stepT / 0.25) * 0.7) : 1;
        const alpha = stepT > 0.78 ? Math.max(0, 1 - (stepT - 0.78) / 0.22) : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(vw / 2, vh / 2);
        ctx.scale(scale, scale);
        ctx.font = "800 " + Math.floor(CELL * 2.2) + "px 'Orbitron', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const glowColor = label === 'GO!' ? '#7fe0a0' : '#ffd23f';
        ctx.fillStyle = glowColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = CELL * 0.9;
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
}


function drawVignette(vw, vh) {
  const vcx = vw / 2, vcy = vh / 2;
  const vOuter = Math.sqrt(vcx * vcx + vcy * vcy);
  const gBase = ctx.createRadialGradient(vcx, vcy, vOuter * 0.65, vcx, vcy, vOuter);
  gBase.addColorStop(0, 'rgba(0,0,0,0)');
  gBase.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = gBase;
  ctx.fillRect(0, 0, vw, vh);

  const tensionAlpha = Math.min(0.45, smoothedTension * 0.45);
  if (tensionAlpha > 0.01) {
    const gTension = ctx.createRadialGradient(vcx, vcy, vOuter * 0.55, vcx, vcy, vOuter);
    gTension.addColorStop(0, 'rgba(200,20,20,0)');
    gTension.addColorStop(1, 'rgba(200,20,20,' + tensionAlpha + ')');
    ctx.fillStyle = gTension;
    ctx.fillRect(0, 0, vw, vh);
  }
}
