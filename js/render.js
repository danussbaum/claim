// draw(): ein Frame. Setzt Kamera und Filter, ruft dann die Teile aus render-world.js,
// render-actors.js und render-overlay.js in Zeichenreihenfolge auf.
function draw(now) {
    const dtMs = Math.min(120, Math.max(0, now - (lastDrawTime || now)));
    lastDrawTime = now;

    // Bedrohungsgrad: dieselbe Kurve, die schon Musik und Spannungs-Vignette treibt
    // (computeTension), aber hier eigenstaendig geglaettet - updateAmbient laeuft
    // nur mit aktivem Audio, das Bild soll auch stumm reagieren.
    // Aktive Jagd oder Alarm zieht den Wert sofort auf Anschlag.
    const tensionNow = (running && !paused && !gameOver) ? computeTension(now) : 0;
    const hunted = (now < alarmUntil || enemies.some(e => e.huntingActive)) ? 1 : 0;
    const threatTarget = Math.max(tensionNow, hunted);
    threatDisp = easeValue(threatDisp, threatTarget, dtMs, threatTarget > threatDisp ? 90 : 500);
    const gridPulse = 0.5 + 0.5 * Math.sin(now / (1500 - threatDisp * 1150));
    const gridAlpha = 0.05 + gridPulse * 0.03 + threatDisp * (0.10 + gridPulse * 0.20);
    const gr = Math.round(127 + 128 * threatDisp);
    const gg = Math.round(224 - 150 * threatDisp);
    const gb = Math.round(160 - 105 * threatDisp);

    // PSYLO-Flags schon oben bestimmen, damit sie auch für Hintergrund und Gesicht gelten.
    const psyloActive = now < psyloUntil;
    if (psyloActive) psyloPhase = (psyloPhase + dtMs * 0.015) % 360; // ~15°/s

    // Spieler: Blickrichtung weich nachziehen, mit leichtem Einlenken
    const [tdx, tdy] = dirDelta(dir);
    const targetHeading = Math.atan2(tdy, tdx);
    const pendingTurn = shortestAngleDelta(playerHeadingDisp, targetHeading);
    playerHeadingDisp = easeAngle(playerHeadingDisp, targetHeading, dtMs, 52);
    playerLeanDisp = easeValue(playerLeanDisp, Math.max(-0.38, Math.min(0.38, pendingTurn * 0.45)), dtMs, 60);

    // Waechter: Kegelwinkel weich nachziehen
    for (const e of enemies) {
      const target = enemyFacing(e);
      if (e.angleDisp === undefined) e.angleDisp = target;
      else e.angleDisp = easeAngle(e.angleDisp, target, dtMs, 95);
      // Blick: nach vorne, ausser er hat dich entdeckt - dann folgt der Blick dir
      const alerted = e.huntingActive || now < alarmUntil;
      const eyeTarget = alerted ? Math.atan2(py - e.r, px - e.c) : e.angleDisp;
      if (e.eyeAngleDisp === undefined) e.eyeAngleDisp = eyeTarget;
      else e.eyeAngleDisp = easeAngle(e.eyeAngleDisp, eyeTarget, dtMs, alerted ? 70 : 110);
      // Traegerer Winkel: die Flossen schwingen der Drehung hinterher
      if (e.tailAngleDisp === undefined) e.tailAngleDisp = e.angleDisp;
      else e.tailAngleDisp = easeAngle(e.tailAngleDisp, e.angleDisp, dtMs, 230);
    }

    const playerT = Math.min(1, (now - playerStepTime) / currentPlayerInterval());
    const dispPx = prevPx + (px - prevPx) * playerT;
    const dispPy = prevPy + (py - prevPy) * playerT;
    const camFollow = (cameraMode === 'follow' || cameraMode === 'push') && !huntActive();

    const bgT = threatDisp * (0.75 + gridPulse * 0.25);
    if (psyloActive) {
      // PSYLO background: saturated deep rainbow, rotating at double speed of the scene
      // filter → motion contrast between layers. Lightness pulses with gridPulse.
      ctx.fillStyle = 'hsl(' + Math.round((psyloPhase * 2) % 360) + ', 90%, ' + (13 + 8 * gridPulse).toFixed(1) + '%)';
    } else {
      ctx.fillStyle = 'rgb(' + Math.round(10 + 32 * bgT) + ',' +
                                Math.round(15 - 7 * bgT) + ',' +
                                Math.round(11 - 3 * bgT) + ')';
    }
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

    // Tiefenschicht: folgt der Kamera nur zu PARALLAX_FACTOR und driftet zusaetzlich
    // ganz langsam, damit der Hintergrund auch bei stehender Kamera atmet.
    if (bgParallaxPattern) {
      const camX = camFollow ? boardCanvas.width / 2 - (dispPx * CELL + CELL / 2) : 0;
      const camY = camFollow ? boardCanvas.height / 2 - (dispPy * CELL + CELL / 2) : 0;
      const ox = camX * PARALLAX_FACTOR + Math.sin(now / 9000) * CELL * 0.6;
      const oy = camY * PARALLAX_FACTOR + Math.cos(now / 11000) * CELL * 0.45;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillStyle = bgParallaxPattern;
      ctx.fillRect(-ox, -oy, boardCanvas.width, boardCanvas.height);
      ctx.restore();
    }

    if (bgVignette) { ctx.fillStyle = bgVignette; ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height); }
    if (bgNoisePattern) { ctx.fillStyle = bgNoisePattern; ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height); }

    ctx.save();
    if (camFollow) {
      ctx.translate(boardCanvas.width / 2 - (dispPx * CELL + CELL / 2),
                    boardCanvas.height / 2 - (dispPy * CELL + CELL / 2));
    }
    // Kill-Cam: kurzer Zoom auf besondere Abschuesse
    if (killCam && now < killCam.until) {
      const kt = (now - killCam.start) / (killCam.until - killCam.start);
      const z = 1 + 0.6 * Math.sin(Math.PI * Math.min(1, kt));
      ctx.translate(killCam.x, killCam.y);
      ctx.scale(z, z);
      ctx.translate(-killCam.x, -killCam.y);
    }
    const shakeRemaining = shakeEndTime - now;
    if (shakeRemaining > 0) {
      const shakeT = shakeRemaining / shakeDuration;
      const mag = shakeMagnitude * shakeT;
      ctx.translate((Math.random() * 2 - 1) * mag, (Math.random() * 2 - 1) * mag);
    }

    const drunkActive = now < drunkUntil;
    let sceneFilter = '';

    if (drunkActive || psyloActive) {
      if (drunkActive) {
        const tt = now / 1000;
        const angle = Math.sin(tt * 5.2) * 0.11 + Math.sin(tt * 3.1) * 0.05;
        const dx = Math.sin(tt * 7.4) * CELL * 0.42 + Math.sin(tt * 4.1) * CELL * 0.15;
        const dy = Math.cos(tt * 6.3) * CELL * 0.34 + Math.cos(tt * 3.7) * CELL * 0.12;
        const pivotX = camFollow ? dispPx * CELL + CELL / 2 : COLS * CELL / 2;
        const pivotY = camFollow ? dispPy * CELL + CELL / 2 : ROWS * CELL / 2;
        ctx.translate(pivotX, pivotY);
        ctx.rotate(angle);
        ctx.translate(-pivotX + dx, -pivotY + dy);
      }
      // PSYLO: Hue-Rotation + Sättigung. Drunk-Blur wird kombiniert (keine
      // Rotation bei PSYLO — siehe note_lsd.md). Der Filter wird NICHT hier auf
      // ctx gesetzt (sonst filtert der Browser jeden einzelnen Zeichenaufruf),
      // sondern einmal auf das fertige Bild nach der Szene.
      if (psyloActive) sceneFilter = 'hue-rotate(' + Math.round(psyloPhase) + 'deg) saturate(1.35)';
      if (drunkActive) sceneFilter += ' blur(2.4px)';
    }

    drawBoard(now, gr, gg, gb, gridAlpha, playerT);
    drawWorldEffects(now);
    drawWorldObjects(now);

    const blinkOnGlobal = Math.floor(now / 110) % 2 === 0;

    const pcx = dispPx * CELL + CELL / 2, pcy = dispPy * CELL + CELL / 2;

    // Jagd-Modus: die CPU-Figur nur zeichnen, wenn dein Waechter sie sieht (oder bei einem Ping)
    const hunt = huntActive();
    const runnerVisible = !hunt || huntRunnerVisible(now);
    if (runnerVisible) drawPlayer(now, blinkOnGlobal, dispPx, dispPy, pcx, pcy, playerT, psyloActive);
    drawGuards(now, blinkOnGlobal);
    if (hunt) huntDrawWorld(now, runnerVisible);

    if (versusRender) vsDrawWorld(now);
    ctx.restore();

    drawOverlays(now, psyloActive, sceneFilter, pcx, pcy);
}
