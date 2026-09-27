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
  // unabhaengig von Emoji-Schriften, Spiegelung und Szenenfiltern.
  // Zeichnet um (0,0), Blick nach rechts; R = Kopfradius des Spielers.
  let duckFacingLeft = false;
  function drawDuck(R, now, walking) {
    const step = walking ? Math.sin(now / 65) : 0;
    ctx.lineCap = 'round';
    // Beine: schwingen gegenlaeufig, Fuesse als kleine Schwimmflossen
    ctx.strokeStyle = '#e8892b';
    ctx.fillStyle = '#e8892b';
    ctx.lineWidth = Math.max(1.5, R * 0.16);
    for (const [hipX, phase] of [[-R * 0.22, 1], [R * 0.18, -1]]) {
      const swing = step * phase * R * 0.32;
      const lift = Math.max(0, -step * phase) * R * 0.18;
      const footX = hipX + swing, footY = R * 1.02 - lift;
      ctx.beginPath();
      ctx.moveTo(hipX, R * 0.55);
      ctx.lineTo(footX, footY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(footX - R * 0.08, footY);
      ctx.lineTo(footX + R * 0.34, footY + R * 0.02);
      ctx.lineTo(footX + R * 0.12, footY - R * 0.14);
      ctx.closePath();
      ctx.fill();
    }
    // Koerper wippt beim Watscheln
    const bob = walking ? Math.abs(step) * -R * 0.08 : 0;
    const tilt = walking ? step * 0.08 : 0;
    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(tilt);
    ctx.fillStyle = '#f7d23e';
    ctx.strokeStyle = '#8a6a12';
    ctx.lineWidth = Math.max(1, R * 0.07);
    // Schwanz
    ctx.beginPath();
    ctx.moveTo(-R * 0.75, R * 0.05);
    ctx.lineTo(-R * 1.08, -R * 0.28);
    ctx.lineTo(-R * 0.62, -R * 0.12);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Rumpf
    ctx.beginPath();
    ctx.ellipse(-R * 0.05, R * 0.18, R * 0.82, R * 0.52, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Fluegel flattert leicht
    ctx.fillStyle = '#e9bd2a';
    ctx.beginPath();
    ctx.ellipse(-R * 0.15, R * 0.14, R * 0.42, R * 0.24, -0.25 + step * 0.15, 0, Math.PI * 2);
    ctx.fill();
    // Kopf
    ctx.fillStyle = '#f7d23e';
    ctx.beginPath();
    ctx.arc(R * 0.5, -R * 0.42, R * 0.42, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Schnabel: klappt beim Quaken (jeder Schritt) kurz auf
    const open = walking ? Math.max(0, step) * R * 0.1 : 0;
    ctx.fillStyle = '#f08a24';
    ctx.beginPath();
    ctx.moveTo(R * 0.82, -R * 0.44 - open);
    ctx.lineTo(R * 1.28, -R * 0.36 - open * 0.5);
    ctx.lineTo(R * 0.84, -R * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(R * 0.84, -R * 0.3);
    ctx.lineTo(R * 1.2, -R * 0.28 + open * 0.5);
    ctx.lineTo(R * 0.82, -R * 0.2 + open);
    ctx.closePath();
    ctx.fill();
    // Auge
    ctx.fillStyle = '#101414';
    ctx.beginPath();
    ctx.arc(R * 0.6, -R * 0.52, R * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(R * 0.62, -R * 0.55, R * 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Todesanimationen je nach Todesart. Gibt true zurueck, wenn fertig.
function drawGuardDeath(a, now) {
  const LIFE = a.kind === 'sealed' ? 1500 : 1100;
  const t = (now - a.startTime) / LIFE;
  if (t >= 1) return true;
  const cx = a.c * CELL + CELL / 2, cy = a.r * CELL + CELL / 2;
  const R = CELL * 0.34;
  ctx.save();
  if (a.kind === 'pit') {
    // In die Grube gefallen: dreht sich, schrumpft und verschwindet in der Tiefe
    const f = Math.min(1, t / 0.7);
    ctx.globalAlpha = 1 - Math.max(0, (t - 0.6) / 0.4);
    ctx.translate(cx, cy);
    ctx.rotate(f * Math.PI * 4);
    ctx.scale(1 - f * 0.9, 1 - f * 0.9);
    ctx.fillStyle = shadeColor(a.color, -f * 0.6);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    drawDeadEyes(R);
  } else if (a.kind === 'crushed') {
    // Zerquetscht: in Schubrichtung plattgedrueckt, Sterne kreisen darueber
    const squash = Math.min(1, t / 0.12);
    const horiz = a.dx !== 0;
    const sq = 1 - squash * 0.8, st = 1 + squash * 0.6;
    ctx.globalAlpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
    ctx.translate(cx + a.dx * R * 0.6 * squash, cy + a.dy * R * 0.6 * squash);
    ctx.fillStyle = a.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * (horiz ? sq : st), R * (horiz ? st : sq), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = Math.floor(CELL * 0.3) + 'px -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < 3; k++) {
      const ang = now / 150 + k * Math.PI * 2 / 3;
      ctx.fillText('⭐', Math.cos(ang) * R, -R * 1.1 + Math.sin(ang) * R * 0.3);
    }
  } else if (a.kind === 'shot') {
    // Weggeschleudert: fliegt in Schussrichtung, dreht sich, hopst und verblasst
    const dist = CELL * 2.2 * (1 - Math.pow(1 - t, 2));
    const hop = Math.sin(Math.min(1, t * 1.6) * Math.PI) * CELL * 0.6;
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    ctx.translate(cx + a.dx * dist, cy + a.dy * dist - hop);
    ctx.rotate(t * Math.PI * 5 * (a.dx < 0 ? -1 : 1));
    ctx.fillStyle = a.color;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    drawDeadEyes(R);
    // Treffer-Funken am Einschlagsort
    if (t < 0.35) {
      ctx.restore(); ctx.save();
      ctx.globalAlpha = 1 - t / 0.35;
      ctx.fillStyle = '#ffd23f';
      for (let k = 0; k < 8; k++) {
        const ang = k * Math.PI / 4 + a.c;
        const rr = CELL * (0.2 + t * 1.8);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, CELL * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (a.kind === 'spikes') {
    // Plattgewalzt: wird flach wie eine Flunder, dann verblasst der Fleck
    const squash = Math.min(1, t / 0.15);
    const sy = 1 - squash * 0.8, sx = 1 + squash * 0.7;
    ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    ctx.translate(cx, cy + R * (1 - sy) * 0.6);
    ctx.fillStyle = a.color;
    ctx.beginPath(); ctx.ellipse(0, 0, R * sx, R * sy, 0, 0, Math.PI * 2); ctx.fill();
    // Spritzer rundherum
    for (let k = 0; k < 6; k++) {
      const ang = k * Math.PI / 3 + 0.3;
      const rr = R * (1.2 + squash * 0.6);
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * rr, Math.sin(ang) * rr * 0.5, R * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.scale(sx, sy);
    drawDeadEyes(R);
  } else {
    // Eingeschlossen: wird zu grauem Stein und zerbroeckelt
    const stone = Math.min(1, t / 0.45);
    const crumble = t < 0.55 ? 0 : (t - 0.55) / 0.45;
    ctx.globalAlpha = 1 - crumble;
    ctx.translate(cx, cy);
    const shake = crumble > 0 ? 0 : Math.sin(now / 25) * stone * CELL * 0.04;
    if (crumble === 0) {
      ctx.fillStyle = a.color;
      ctx.beginPath(); ctx.arc(shake, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = stone;
      ctx.fillStyle = '#8a8f94';
      ctx.beginPath(); ctx.arc(shake, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4b4f53';
      ctx.lineWidth = Math.max(1, R * 0.08);
      ctx.beginPath();
      ctx.moveTo(shake - R * 0.5, -R * 0.6); ctx.lineTo(shake - R * 0.1, -R * 0.1);
      ctx.lineTo(shake - R * 0.3, R * 0.4); ctx.moveTo(shake + R * 0.2, -R * 0.8);
      ctx.lineTo(shake + R * 0.4, R * 0.2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      drawDeadEyes(R);
    } else {
      // Brocken fallen auseinander
      ctx.fillStyle = '#8a8f94';
      for (let k = 0; k < 7; k++) {
        const ang = k * 0.9 + a.r;
        const spread = crumble * CELL * 0.6;
        const fx = Math.cos(ang) * (R * 0.5 + spread);
        const fy = Math.sin(ang) * R * 0.5 + crumble * crumble * CELL * 1.2;
        ctx.beginPath();
        ctx.arc(fx, fy, R * (0.35 - k * 0.02), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
  return false;
}
// Hundeohren, Schild, Gewehr - im Koordinatensystem des Waechters (Ursprung = Mitte)
function drawGuardGear(e, R, faceAng, now) {
  const p = e.personality;
  if (p !== 'dog' && p !== 'shield' && p !== 'sniper') {
    if (now < (e.enragedUntil || 0)) {
      // Wuetend: Zornesader
      ctx.fillStyle = '#ff2a2a';
      ctx.font = Math.floor(R * 0.9) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💢', R * 0.7, -R * 0.9);
    }
    return;
  }
  ctx.save();
  ctx.rotate(faceAng);
  if (p === 'dog') {
    ctx.fillStyle = '#6b4424';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-R * 0.1, side * R * 0.85, R * 0.45, R * 0.22, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(R * 1.3, 0, R * 0.16, 0, Math.PI * 2); ctx.fill();
  } else if (p === 'shield') {
    ctx.fillStyle = '#c9d1d6';
    ctx.strokeStyle = '#4b5258';
    ctx.lineWidth = Math.max(1, R * 0.1);
    ctx.beginPath();
    ctx.roundRect(R * 1.05, -R * 0.85, R * 0.32, R * 1.7, R * 0.15);
    ctx.fill(); ctx.stroke();
  } else {
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = Math.max(2, R * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(R * 0.2, R * 0.55); ctx.lineTo(R * 2.1, R * 0.55); ctx.stroke();
    // Zielfernrohr blitzt
    const glint = 0.5 + 0.5 * Math.sin(now / 200);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + glint * 0.6).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(R * 1.1, R * 0.3, R * 0.14, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawDeadEyes(R) {
  ctx.strokeStyle = '#101414';
  ctx.lineWidth = Math.max(1.5, R * 0.14);
  ctx.lineCap = 'round';
  const xr = R * 0.18;
  for (const side of [-1, 1]) {
    const ex = side * R * 0.4, ey = -R * 0.05;
    ctx.beginPath();
    ctx.moveTo(ex - xr, ey - xr); ctx.lineTo(ex + xr, ey + xr);
    ctx.moveTo(ex + xr, ey - xr); ctx.lineTo(ex - xr, ey + xr);
    ctx.stroke();
  }
}

// Gesicht des Spielers (ohne PSYLO), um (0,0) mit Kopfradius R.
// Wird auch fuer den Gegner im 2-Spieler-Modus verwendet (js/versus.js).
function drawPlayerFace(R, emotion, lookX, lookY) {
  const eyeOffX = R * 0.36, eyeOffY = -R * 0.06;
  if (emotion === 'startled') {
    for (const side of [-1, 1]) {
      const exx = side * eyeOffX, eyy = eyeOffY - R * 0.05;
      ctx.beginPath();
      ctx.arc(exx, eyy, R * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(exx, eyy, R * 0.11, 0, Math.PI * 2);
      ctx.fillStyle = '#101414';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, R * 0.42, R * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#101414';
    ctx.fill();
  } else if (emotion === 'worried') {
    for (const side of [-1, 1]) {
      const exx = side * eyeOffX, eyy = eyeOffY;
      ctx.beginPath();
      ctx.arc(exx, eyy, R * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(exx + lookX * R * 0.1, eyy + lookY * R * 0.1, R * 0.11, 0, Math.PI * 2);
      ctx.fillStyle = '#101414';
      ctx.fill();
    }
    ctx.strokeStyle = '#101414';
    ctx.lineWidth = Math.max(1.3, R * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-eyeOffX - R*0.15, eyeOffY - R*0.42);
    ctx.lineTo(-eyeOffX + R*0.2, eyeOffY - R*0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(eyeOffX + R*0.15, eyeOffY - R*0.42);
    ctx.lineTo(eyeOffX - R*0.2, eyeOffY - R*0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, R * 0.42, R * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (emotion === 'determined') {
    const eyeR = R * 0.2;
    for (const side of [-1, 1]) {
      const exx = side * eyeOffX, eyy = eyeOffY;
      ctx.beginPath();
      ctx.arc(exx, eyy, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(exx + lookX * eyeR * 0.5, eyy + lookY * eyeR * 0.5, eyeR * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '#101414';
      ctx.fill();
    }
    ctx.strokeStyle = '#101414';
    ctx.lineWidth = Math.max(1.3, R * 0.1);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-eyeOffX - R*0.18, eyeOffY - R*0.32);
    ctx.lineTo(-eyeOffX + R*0.15, eyeOffY - R*0.22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(eyeOffX + R*0.18, eyeOffY - R*0.32);
    ctx.lineTo(eyeOffX - R*0.15, eyeOffY - R*0.22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-R * 0.16, R * 0.4);
    ctx.lineTo(R * 0.16, R * 0.4);
    ctx.stroke();
  } else {
    const eyeR = R * 0.22;
    for (const side of [-1, 1]) {
      const exx = side * eyeOffX, eyy = eyeOffY;
      ctx.beginPath();
      ctx.arc(exx, eyy, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(exx + lookX * eyeR * 0.4, eyy + lookY * eyeR * 0.4, eyeR * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#101414';
      ctx.fill();
    }
    ctx.strokeStyle = '#101414';
    ctx.lineWidth = Math.max(1.3, R * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, R * 0.28, R * 0.22, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }
}

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
    const camFollow = cameraMode === 'follow' || cameraMode === 'push';

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

    ctx.strokeStyle = 'rgba(' + gr + ',' + gg + ',' + gb + ',' + gridAlpha.toFixed(3) + ')';
    ctx.lineWidth = 1 + threatDisp * 1.1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x*CELL, 0); ctx.lineTo(x*CELL, ROWS*CELL); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y*CELL); ctx.lineTo(COLS*CELL, y*CELL); ctx.stroke();
    }
    ctx.lineWidth = 1;

    for (let i = flashCells.length - 1; i >= 0; i--) {
      if (now - flashCells[i].time > 400) flashCells.splice(i, 1);
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = grid[r][c];
        if (v === BLOCK) {
          const mover = movingBlocks.find(m => m.r === r && m.c === c);
          if (mover) {
            ctx.fillStyle = '#4a4634';
            ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
            ctx.fillStyle = '#5e5a3f';
            ctx.fillRect(c*CELL+2, r*CELL+2, CELL-4, CELL-4);
            ctx.strokeStyle = 'rgba(255,210,63,0.55)';
            ctx.lineWidth = Math.max(1, CELL * 0.06);
            ctx.strokeRect(c*CELL+2.5, r*CELL+2.5, CELL-5, CELL-5);
            // Richtungspfeil
            ctx.save();
            ctx.translate(c*CELL + CELL/2, r*CELL + CELL/2);
            ctx.rotate(Math.atan2(mover.dr, mover.dc));
            ctx.fillStyle = 'rgba(255,226,140,0.85)';
            ctx.beginPath();
            ctx.moveTo(CELL*0.22, 0);
            ctx.lineTo(-CELL*0.10, -CELL*0.13);
            ctx.lineTo(-CELL*0.10, CELL*0.13);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            continue;
          }
          ctx.fillStyle = '#3a4238';
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          ctx.fillStyle = '#4c5749';
          ctx.fillRect(c*CELL+2, r*CELL+2, CELL-4, CELL-4);
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(c*CELL+2, r*CELL+2, CELL-4, 3);
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(c*CELL+0.5, r*CELL+0.5, CELL-1, CELL-1);
          continue;
        }
        if (v === PIT) {
          ctx.fillStyle = '#05070a';
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          const pg = ctx.createRadialGradient(
            c*CELL+CELL/2, r*CELL+CELL/2, CELL*0.1,
            c*CELL+CELL/2, r*CELL+CELL/2, CELL*0.6);
          pg.addColorStop(0, 'rgba(0,0,0,1)');
          pg.addColorStop(1, 'rgba(40,60,80,0.35)');
          ctx.fillStyle = pg;
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          continue;
        }
        if (v === TERRITORY) {
          ctx.fillStyle = '#2f8f5c';
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(c*CELL, r*CELL, CELL, 2);
        } else if (v === RIVAL_TERRITORY) {
          ctx.fillStyle = '#2f5f9f';
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(c*CELL, r*CELL, CELL, 2);
        } else if (v === RIVAL_TRAIL) {
          ctx.save();
          ctx.shadowColor = '#6fb4ff';
          ctx.shadowBlur = CELL * 0.55;
          ctx.fillStyle = '#6fb4ff';
          ctx.fillRect(c*CELL+3, r*CELL+3, CELL-6, CELL-6);
          ctx.restore();
        } else if (v === TRAIL) {
          if (c === px && r === py && playerT < 1) {
            // neuester Trail-Block: erst einblenden, wenn der Punkt visuell ankommt
          } else {
            const guarded = now < trailGuardUntil;
            const riskColor = guarded ? '#3fd6b0' : trailRiskColor(trail.length);
            ctx.save();
            ctx.shadowColor = riskColor;
            ctx.shadowBlur = CELL * 0.55;
            ctx.fillStyle = riskColor;
            ctx.fillRect(c*CELL+3, r*CELL+3, CELL-6, CELL-6);
            ctx.restore();
            if (guarded) {
              const glowPulse = 0.5 + Math.sin(now / 180 + c + r) * 0.5;
              ctx.strokeStyle = 'rgba(200,255,240,' + (0.35 + glowPulse * 0.4) + ')';
              ctx.lineWidth = Math.max(1, CELL * 0.05);
              ctx.strokeRect(c*CELL+3, r*CELL+3, CELL-6, CELL-6);
            }
          }
        }
      }
    }

    for (const f of flashCells) {
      const t = (now - f.time) / 400;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - t)) + ')';
      ctx.fillRect(f.c*CELL, f.r*CELL, CELL, CELL);
    }

    // Energiewellen ueber dem Feld, aber unter Spieler und Waechtern
    for (let i = bgRipples.length - 1; i >= 0; i--) {
      const rp = bgRipples[i];
      const t = (now - rp.start) / rp.dur;
      if (t >= 1) { bgRipples.splice(i, 1); continue; }
      const rad = rp.maxCells * CELL * (1 - Math.pow(1 - t, 2.6));
      if (rad < 0.5) continue;
      const alpha = (1 - t) * (1 - t) * rp.strength;
      const rcx = rp.cx * CELL + CELL / 2, rcy = rp.cy * CELL + CELL / 2;
      ctx.save();
      const rg = ctx.createRadialGradient(rcx, rcy, rad * 0.68, rcx, rcy, rad);
      rg.addColorStop(0, 'rgba(' + rp.color + ',0)');
      rg.addColorStop(1, 'rgba(' + rp.color + ',' + (alpha * 0.30).toFixed(3) + ')');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(rcx, rcy, rad, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(' + rp.color + ',' + alpha.toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, CELL * 0.15 * (1 - t));
      ctx.beginPath(); ctx.arc(rcx, rcy, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    for (let i = nearMissPopups.length - 1; i >= 0; i--) {
      const p = nearMissPopups[i];
      const t = (now - p.startTime) / 900;
      if (t >= 1) { nearMissPopups.splice(i, 1); continue; }
      const alpha = 1 - t;
      const yOff = -t * CELL * 1.4;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffd23f';
      ctx.font = '700 ' + Math.floor(CELL * 0.55) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      const tx = p.x * CELL + CELL / 2, ty = p.y * CELL + CELL / 2 + yOff - CELL * 0.6;
      ctx.strokeText('Whew!', tx, ty);
      ctx.fillText('Whew!', tx, ty);
      ctx.restore();
    }

    for (let i = comboPopups.length - 1; i >= 0; i--) {
      const p = comboPopups[i];
      const t = (now - p.startTime) / 1100;
      if (t >= 1) { comboPopups.splice(i, 1); continue; }
      const alpha = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
      const bounce = t < 0.22 ? 1.5 - (t / 0.22) * 0.5 : 1;
      const yOff = -t * CELL * 1.1;
      const cx = p.x * CELL + CELL / 2;
      const cy = p.y * CELL + CELL / 2 + yOff - CELL * 1.1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.scale(bounce, bounce);

      const size = Math.floor(CELL * (0.5 + Math.min(p.combo, 8) * 0.045));
      ctx.font = '800 ' + size + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const grad = ctx.createLinearGradient(0, -size/2, 0, size/2);
      grad.addColorStop(0, '#ffe27a');
      grad.addColorStop(1, '#ff6a3d');

      ctx.strokeStyle = 'rgba(30,10,0,0.75)';
      ctx.lineWidth = 4;
      ctx.strokeText('🔥 COMBO ×' + p.mult.toFixed(1), 0, 0);
      ctx.fillStyle = grad;
      ctx.fillText('🔥 COMBO ×' + p.mult.toFixed(1), 0, 0);
      ctx.restore();
    }

    for (let i = milestonePopups.length - 1; i >= 0; i--) {
      const m = milestonePopups[i];
      const t = (now - m.startTime) / 1000;
      if (t >= 1) { milestonePopups.splice(i, 1); continue; }
      const bounce = t < 0.2 ? 1.4 - (t / 0.2) * 0.4 : 1;
      const alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      const mx = m.x * CELL + CELL / 2, my = m.y * CELL + CELL / 2 - CELL * 1.6 - t * CELL * 0.6;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(mx, my);
      ctx.scale(bounce, bounce);
      ctx.font = '800 ' + Math.floor(CELL * 0.5) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(m.text, 0, 0);
      ctx.fillStyle = '#7fe0a0';
      ctx.fillText(m.text, 0, 0);
      ctx.restore();
    }

    // Bonuszone: goldener Rahmen, solange sie noch nicht gesichert ist
    if (bonusCells.length && !bonusClaimed) {
      const pulse = 0.55 + Math.sin(now / 280) * 0.3;
      for (const b of bonusCells) {
        ctx.fillStyle = 'rgba(255,210,63,' + (0.10 + pulse * 0.10) + ')';
        ctx.fillRect(b.c*CELL, b.r*CELL, CELL, CELL);
        ctx.strokeStyle = 'rgba(255,210,63,' + (0.35 + pulse * 0.45) + ')';
        ctx.lineWidth = Math.max(1, CELL * 0.06);
        ctx.strokeRect(b.c*CELL+2, b.r*CELL+2, CELL-4, CELL-4);
      }
      const first = bonusCells[0];
      ctx.font = '700 ' + Math.floor(CELL * 0.5) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,226,120,' + (0.5 + pulse * 0.5) + ')';
      ctx.fillText('×' + BONUS_MULT, first.c*CELL + CELL/2, first.r*CELL + CELL/2 + 1);
    }

    for (let i = revealPopups.length - 1; i >= 0; i--) {
      const rp = revealPopups[i];
      const age = now - rp.startTime;
      const totalLife = ROULETTE_MS + REVEAL_HOLD_MS;
      if (age >= totalLife) { revealPopups.splice(i, 1); continue; }

      if (age < ROULETTE_MS) {
        // Roulette: rasch wechselndes Icon an der Aufsammel-Stelle
        const spinIdx = Math.floor(age / ROULETTE_STEP_MS) % ALL_MYSTERY_TYPES.length;
        const spinType = ALL_MYSTERY_TYPES[spinIdx];
        const cx = rp.x * CELL + CELL / 2, cy = rp.y * CELL + CELL / 2;
        const wobble = 1 + Math.sin(age / 40) * 0.06;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(wobble, wobble);
        ctx.beginPath();
        ctx.arc(0, 0, CELL * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = ALL_ICON_COLORS[spinType];
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = Math.max(1.5, CELL * 0.05);
        ctx.stroke();
        ctx.font = '700 ' + Math.floor(CELL * 0.4) + 'px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#101414';
        ctx.fillText(ALL_ICON_SYMBOLS[spinType], 0, 1);
        ctx.restore();
      } else {
        // Reveal: das tatsaechliche Ergebnis fliegt hoch und verblasst
        const t = (age - ROULETTE_MS) / REVEAL_HOLD_MS;
        const bounce = t < 0.25 ? 1.5 - (t / 0.25) * 0.5 : 1;
        const alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
        const yOff = -t * CELL * 1.3;
        const rx = rp.x * CELL + CELL / 2, ry = rp.y * CELL + CELL / 2 + yOff - CELL * 0.6;
        const label = ALL_ICON_SYMBOLS[rp.type] + ' ' + ALL_ICON_NAMES[rp.type];
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(rx, ry);
        ctx.scale(bounce, bounce);
        ctx.font = '800 ' + Math.floor(CELL * 0.42) + 'px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 3;
        ctx.strokeText(label, 0, 0);
        ctx.fillStyle = ALL_ICON_COLORS[rp.type];
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }

    for (let i = fireworkParticles.length - 1; i >= 0; i--) {
      const p = fireworkParticles[i];
      const age = now - p.startTime;
      if (age < 0) continue;
      if (age > p.life) { fireworkParticles.splice(i, 1); continue; }
      const t = age / 1000;
      const px2 = p.x0 + p.vx * t;
      const py2 = p.y0 + p.vy * t + 0.5 * 200 * t * t;
      const alpha = 1 - age / p.life;
      const size = Math.max(2, CELL * 0.16);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(px2 - size / 2), Math.round(py2 - size / 2), size, size);
    }
    ctx.globalAlpha = 1;

    for (let i = shotProjectiles.length - 1; i >= 0; i--) {
      const sp = shotProjectiles[i];
      const t = (now - sp.startTime) / sp.life;
      if (t >= 1) { shotProjectiles.splice(i, 1); continue; }
      // Position entlang der Flugbahn (mit Abpraller: mehrere Teilstrecken)
      const pts = sp.pts;
      let total = 0;
      for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k-1][0], pts[k][1] - pts[k-1][1]);
      let along = total * t, tx = pts[0][0], ty = pts[0][1];
      for (let k = 1; k < pts.length; k++) {
        const seg = Math.hypot(pts[k][0] - pts[k-1][0], pts[k][1] - pts[k-1][1]);
        if (along <= seg || k === pts.length - 1) {
          const f = seg ? Math.min(1, along / seg) : 1;
          tx = pts[k-1][0] + (pts[k][0] - pts[k-1][0]) * f;
          ty = pts[k-1][1] + (pts[k][1] - pts[k-1][1]) * f;
          break;
        }
        along -= seg;
      }
      // Rotierende Axt
      const L = CELL * 0.42;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate((now - sp.startTime) / 28);
      ctx.strokeStyle = '#8b5a2b';
      ctx.lineWidth = Math.max(2, CELL * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, L * 0.6); ctx.lineTo(0, -L * 0.6);
      ctx.stroke();
      ctx.fillStyle = '#c9d1d6';
      ctx.strokeStyle = '#5c6368';
      ctx.lineWidth = Math.max(1, CELL * 0.03);
      ctx.beginPath();
      ctx.moveTo(0, -L * 0.6);
      ctx.lineTo(L * 0.55, -L * 0.85);
      ctx.quadraticCurveTo(L * 0.75, -L * 0.45, L * 0.55, -L * 0.05);
      ctx.lineTo(0, -L * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    for (const p of powerUps) {
      const pulse = 1 + Math.sin(now / 260 + p.r + p.c) * 0.08;
      const cx = p.c*CELL + CELL/2, cy = p.r*CELL + CELL/2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.beginPath();
      ctx.arc(0, 0, CELL*0.34, 0, Math.PI*2);
      ctx.fillStyle = MYSTERY_COLOR;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#101414';
      ctx.font = '700 ' + Math.floor(CELL * 0.4) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(MYSTERY_SYMBOL, 0, 1);
      ctx.restore();
    }

    // Bananenschalen
    ctx.font = Math.floor(CELL * 0.6) + 'px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of bananaPeels) ctx.fillText('🍌', b.c * CELL + CELL / 2, b.r * CELL + CELL / 2 + 1);

    // Decoy-Steine: Aufschlagstelle mit pulsierendem Ring, verblasst am Ende
    decoys = decoys.filter(d => now < d.until);
    for (const d of decoys) {
      const cx = d.c*CELL + CELL/2, cy = d.r*CELL + CELL/2;
      const left = (d.until - now) / (d.until - d.start);
      const ring = ((now - d.start) % 900) / 900;
      ctx.save();
      ctx.globalAlpha = Math.min(1, left * 3) * (1 - ring) * 0.7;
      ctx.strokeStyle = '#e8dcc0';
      ctx.lineWidth = Math.max(1, CELL * 0.06);
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * (0.35 + ring * 1.1), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = Math.min(1, left * 3);
      ctx.font = Math.floor(CELL * 0.6) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🪨', cx, cy + 1);
      ctx.restore();
    }

    const blinkOnGlobal = Math.floor(now / 110) % 2 === 0;

    const shieldRemaining = shieldUntil - now;
    const shieldActive = now < shieldUntil;
    const shieldBlinking = shieldActive && shieldRemaining < 900;
    if (shieldActive && !(shieldBlinking && !blinkOnGlobal)) {
      ctx.beginPath();
      ctx.arc(dispPx*CELL + CELL/2, dispPy*CELL + CELL/2, CELL*0.52, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(79,126,229,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const spikesRemaining = spikesUntil - now;
    const spikesActive = now < spikesUntil;
    const spikesBlinking = spikesActive && spikesRemaining < 900;
    if (spikesActive && !(spikesBlinking && !blinkOnGlobal)) {
      const spikeCx = dispPx * CELL + CELL / 2, spikeCy = dispPy * CELL + CELL / 2;
      const spikeCount = 8;
      const rInner = CELL * 0.48, rOuter = CELL * 0.68;
      ctx.beginPath();
      for (let i = 0; i < spikeCount; i++) {
        const a0 = (i / spikeCount) * Math.PI * 2 + now / 500;
        const a1 = a0 + (Math.PI * 2) / spikeCount / 2;
        ctx.moveTo(spikeCx + Math.cos(a0) * rInner, spikeCy + Math.sin(a0) * rInner);
        ctx.lineTo(spikeCx + Math.cos(a1) * rOuter, spikeCy + Math.sin(a1) * rOuter);
        const a2 = a0 + (Math.PI * 2) / spikeCount;
        ctx.lineTo(spikeCx + Math.cos(a2) * rInner, spikeCy + Math.sin(a2) * rInner);
      }
      ctx.strokeStyle = 'rgba(201,117,46,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const speedRemaining = speedUntil - now;
    const speedActive = now < speedUntil;
    const speedBlinking = speedActive && speedRemaining < 900;
    const showSpeedColor = speedActive && !(speedBlinking && !blinkOnGlobal);

    // Bewegungs-Lehnen: Streckung/Stauchung entlang der animierten Blickrichtung
    const [pdx, pdy] = dirDelta(dir);
    const R = CELL * 0.38;
    const bounce = Math.sin(Math.min(1, playerT) * Math.PI);
    const stretch = 1 + bounce * 0.18;
    const squeeze = 1 - bounce * 0.13;
    const headX = Math.cos(playerHeadingDisp), headY = Math.sin(playerHeadingDisp);

    const pcx = dispPx * CELL + CELL / 2, pcy = dispPy * CELL + CELL / 2;

    // Wisch-Hinweis: Geisterfinger, der einmal quer zieht. Verschwindet nach dem ersten Wisch.
    const showSwipeHint = IS_TOUCH && !hasSwipedEver && running && !countdownActive && now < swipeHintUntil &&
      (tutorialActive ? tutorialStage === 0 : level === 1);
    if (showSwipeHint) {
      const cycle = 1800;
      const t = (now % cycle) / cycle;
      const ease = t < 0.75 ? (1 - Math.pow(1 - t / 0.75, 3)) : 1;
      const fade = t < 0.1 ? t / 0.1 : (t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.2) : 1);
      const gx = COLS * CELL * 0.28 + ease * COLS * CELL * 0.34;
      const gy = ROWS * CELL * 0.62;
      ctx.save();
      ctx.globalAlpha = fade * 0.85;
      // Schleifspur
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(2, CELL * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(COLS * CELL * 0.28, gy);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      // Fingerkuppe
      ctx.beginPath();
      ctx.arc(gx, gy, CELL * 0.40, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1.5, CELL * 0.06);
      ctx.stroke();
      // Pfeilspitze in Wischrichtung
      ctx.beginPath();
      ctx.moveTo(gx + CELL * 0.62, gy);
      ctx.lineTo(gx + CELL * 0.22, gy - CELL * 0.26);
      ctx.lineTo(gx + CELL * 0.22, gy + CELL * 0.26);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();
      ctx.restore();
    }

    // Enterhaken: Seil schnellt heraus, der Haken fasst, dann zieht das Seil den Spieler heran.
    if (hookAnim) {
      const HOOK_EXTEND_MS = 80, HOOK_BOUNCE_MS = 190;
      const hAge = now - hookAnim.startTime;
      const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
      const ox = hookAnim.ox * CELL + CELL / 2, oy = hookAnim.oy * CELL + CELL / 2;
      let tipX, tipY, ropeAlive = true, hookCaught = false;

      if (hookAnim.mode === 'pull') {
        const extendT = easeOutQuad(Math.min(1, hAge / HOOK_EXTEND_MS));
        const fullDist = hookAnim.reachCells * CELL;
        const tipDist = fullDist * extendT;
        tipX = ox + hookAnim.dx * tipDist;
        tipY = oy + hookAnim.dy * tipDist;
        hookCaught = extendT >= 1;
        // Sobald der Spieler beim Haken ankommt, ist der Zug abgeschlossen.
        if (hookCaught && Math.hypot(pcx - tipX, pcy - tipY) < CELL * 0.12) {
          ropeAlive = false;
        }
        if (hAge > 900) ropeAlive = false; // Sicherheitsnetz, falls die Bewegung ausbleibt
      } else {
        // Blockiert: das Seil schnellt kurz raus und prallt sofort zurueck.
        const t = Math.min(1, hAge / HOOK_BOUNCE_MS);
        const dist = t < 0.5
          ? hookAnim.reachCells * CELL * easeOutQuad(t / 0.5)
          : hookAnim.reachCells * CELL * (1 - easeOutQuad((t - 0.5) / 0.5));
        tipX = ox + hookAnim.dx * dist;
        tipY = oy + hookAnim.dy * dist;
        hookCaught = t >= 0.5 && t < 0.95;
        if (t >= 1) ropeAlive = false;
      }

      if (!ropeAlive) {
        hookAnim = null;
      } else {
        const ropeFromX = hookAnim.mode === 'pull' ? pcx : ox;
        const ropeFromY = hookAnim.mode === 'pull' ? pcy : oy;

        // Seil: leicht angeschraegte Doppellinie, wirkt gespannt statt starr
        ctx.save();
        ctx.strokeStyle = '#c9a86a';
        ctx.lineWidth = Math.max(1.5, CELL * 0.07);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ropeFromX, ropeFromY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(0.8, CELL * 0.025);
        ctx.beginPath();
        ctx.moveTo(ropeFromX, ropeFromY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // Haken: kleine gebogene Spitze, die in Flugrichtung zeigt
        const hookAngle = Math.atan2(hookAnim.dy, hookAnim.dx);
        ctx.translate(tipX, tipY);
        ctx.rotate(hookAngle);
        const hs = CELL * (hookCaught ? 0.30 : 0.24);
        ctx.fillStyle = '#aebac2';
        ctx.strokeStyle = '#5c6870';
        ctx.lineWidth = Math.max(1, CELL * 0.035);
        ctx.beginPath();
        ctx.moveTo(-hs * 0.7, 0);
        ctx.lineTo(hs * 0.5, 0);
        ctx.quadraticCurveTo(hs * 1.15, 0, hs * 1.05, -hs * 0.75);
        ctx.quadraticCurveTo(hs * 0.95, -hs * 1.15, hs * 0.45, -hs * 0.85);
        ctx.lineTo(hs * 0.55, -hs * 0.15);
        ctx.lineTo(-hs * 0.7, -hs * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (hookCaught) {
          // kurzer Funkenstoss beim Einhaken
          ctx.strokeStyle = 'rgba(255,230,150,0.85)';
          ctx.lineWidth = Math.max(1, CELL * 0.045);
          for (const a of [-0.5, 0, 0.5]) {
            ctx.beginPath();
            ctx.moveTo(hs * 0.7, -hs * 0.4);
            ctx.lineTo(hs * (0.7 + 0.5 * Math.cos(a)), -hs * (0.4 + 0.5 * Math.sin(a)));
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    // Staubwolken-Partikel hinter dem Charakter beim Boosten
    if (speedActive && now - lastDustSpawn > 35) {
      lastDustSpawn = now;
      for (let i = 0; i < 2; i++) {
        const backAngle = Math.atan2(-pdy, -pdx) + (Math.random() - 0.5) * 1.1;
        const speed = 30 + Math.random() * 45;
        dustParticles.push({
          x0: pcx + (Math.random() - 0.5) * R * 0.6,
          y0: pcy + (Math.random() - 0.5) * R * 0.6,
          vx: Math.cos(backAngle) * speed - pdx * 20,
          vy: Math.sin(backAngle) * speed - pdy * 20,
          size: R * (0.22 + Math.random() * 0.18),
          startTime: now,
          life: 320 + Math.random() * 220
        });
      }
    }
    for (let i = dustParticles.length - 1; i >= 0; i--) {
      const d = dustParticles[i];
      const age = now - d.startTime;
      if (age > d.life) { dustParticles.splice(i, 1); continue; }
      const t = age / 1000;
      const dx2 = d.x0 + d.vx * t;
      const dy2 = d.y0 + d.vy * t + 0.5 * 40 * t * t;
      const alpha = (1 - age / d.life) * 0.5;
      const sz = d.size * (1 - age / d.life * 0.3);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#d8c9a3';
      ctx.beginPath();
      ctx.arc(dx2, dy2, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Rauchbombe: Spieler wird transparent, dichte Rauchwolke driftet um ihn herum
    const smokeActive = now < smokeUntil;
    if (smokeActive && now - lastSmokeSpawn > 45) {
      lastSmokeSpawn = now;
      smokeParticles.push({
        x0: pcx + (Math.random() - 0.5) * R * 1.2,
        y0: pcy + (Math.random() - 0.5) * R * 1.2,
        vx: (Math.random() - 0.5) * 22,
        vy: (Math.random() - 0.5) * 22 - 8,
        size: R * (0.55 + Math.random() * 0.35),
        startTime: now,
        life: 650 + Math.random() * 350
      });
    }
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
      const sp = smokeParticles[i];
      const age = now - sp.startTime;
      if (age > sp.life) { smokeParticles.splice(i, 1); continue; }
      const t = age / 1000;
      const sx = sp.x0 + sp.vx * t, sy = sp.y0 + sp.vy * t;
      const grow = 1 + t * 0.9;
      const alpha = (1 - age / sp.life) * 0.35;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#b9c2c9';
      ctx.beginPath();
      ctx.arc(sx, sy, sp.size * grow, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Emotion bestimmen
    const nearestD = nearestEnemyDist();
    let justStartled = false;
    for (const nm of nearMissPopups) {
      if (now - nm.startTime < 500) { justStartled = true; break; }
    }
    let emotion;
    if (justStartled) emotion = 'startled';
    else if (nearestD <= 4) emotion = 'worried';
    else if (trail.length > 0) emotion = 'determined';
    else emotion = 'relaxed';

    ctx.save();
    ctx.translate(pcx, pcy);
    // Streckung entlang der Blickrichtung, damit die Drehung mitlaeuft
    ctx.rotate(playerHeadingDisp);
    ctx.scale(stretch, squeeze);
    ctx.rotate(-playerHeadingDisp);
    // Kopf lehnt sich leicht in die Kurve und richtet sich wieder auf
    ctx.rotate(playerLeanDisp);
    if (now < heliumUntil) {
      // Heliumkopf: aufgeblasen und leicht schwebend
      const puff = 1.7 + Math.sin(now / 160) * 0.06;
      ctx.translate(0, -CELL * 0.12);
      ctx.scale(puff, puff);
    }

    if (smokeActive) ctx.globalAlpha = 0.38;
    else if (playerHidden(now)) ctx.globalAlpha = 0.55; // versteckt in der eigenen Flaeche
    if (now < duckUntil) {
      // Ente statt Kopf: steht aufrecht, schaut nach links/rechts (bei hoch/runter bleibt die letzte Seite)
      ctx.rotate(-playerLeanDisp);
      const hx = Math.cos(playerHeadingDisp);
      if (Math.abs(hx) > 0.3) duckFacingLeft = hx < 0;
      if (duckFacingLeft) ctx.scale(-1, 1);
      const walking = running && !paused && !gameOver && !countdownActive;
      drawDuck(R * 0.95, now, walking);
    } else {
    // PSYLO-Kopf: Regenbogen-Pulsung, der zur Szenenfilter-Drehung phasenversetzt
    // läuft (innerhalb des gefilterten Blocks also noch schneller als die Bühne).
    ctx.fillStyle = psyloActive ? 'hsl(' + Math.round((psyloPhase * 1.7) % 360) + ', 90%, 62%)' : (showSpeedColor ? '#f5d347' : '#7fe0a0');
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    // Augen: Pupillen schauen in Bewegungsrichtung
    const eyeOffX = R * 0.36, eyeOffY = -R * 0.06;
    const lookX = headX * 0.5, lookY = headY * 0.5;

    if (psyloActive) {
      // PSYLO-Gesicht: wirbelnde Spiralenpupillen + welliger Mund, auf dem Regenbogen-Kopf.
      const eyeR = R * 0.26;
      for (const side of [-1, 1]) {
        const exx = side * eyeOffX, eyy = eyeOffY;
        ctx.beginPath();
        ctx.arc(exx, eyy, eyeR, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        // Drehende Spirale als Pupille
        const pr = eyeR * 0.55;
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const a = now / 300 + (i / 24) * Math.PI * 5.5;
          const rr = pr * (1 - i / 24);
          if (i === 0) ctx.moveTo(exx + Math.cos(a) * rr, eyy + Math.sin(a) * rr);
          else ctx.lineTo(exx + Math.cos(a) * rr, eyy + Math.sin(a) * rr);
        }
        ctx.strokeStyle = '#101414';
        ctx.lineWidth = Math.max(1.5, R * 0.032);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      // Welliger Mund, leicht im Takt der Psylo-Drehung
      const mw = R * 0.28;
      ctx.beginPath();
      let first = true;
      for (let x = -mw; x <= mw + 1e-6; x += R * 0.012) {
        const y = R * 0.42 + Math.sin((x / R) * 31 + now / 150) * R * 0.04;
        if (first) { ctx.moveTo(x, y); first = false; }
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#101414';
      ctx.lineWidth = Math.max(1.5, R * 0.042);
      ctx.lineCap = 'round';
      ctx.stroke();
    } else {
      drawPlayerFace(R, emotion, lookX, lookY);
    }
    } // Ende Kopf (else-Zweig der Ente)

    ctx.restore();

    // Power-up-Icon ueber dem Kopf
    let activeIcon = null;
    if (shieldActive) activeIcon = 'shield';
    else if (now < freezeUntil) activeIcon = 'freeze';
    else if (speedActive) activeIcon = 'speed';
    else if (now < rapidfireUntil) activeIcon = 'rapidfire';
    else if (now < spikesUntil) activeIcon = 'spikes';
    else if (now < trailGuardUntil) activeIcon = 'trailguard';
    else if (now < confuseUntil) activeIcon = 'confuse';
    else if (now < fogUntil) activeIcon = 'fog';
    else if (now < alarmUntil) activeIcon = 'alarm';
    else if (now < slowUntil) activeIcon = 'slow';
    else if (now < swarmUntil) activeIcon = 'swarm';
    else if (now < drunkUntil) activeIcon = 'drunk';
    else if (now < psyloUntil) activeIcon = 'psylo';
    else if (now < duckUntil) activeIcon = 'duck';
    else if (now < heliumUntil) activeIcon = 'helium';
    else if (now < discoUntil) activeIcon = 'disco';
    if (activeIcon) {
      const bobY = Math.sin(now / 260) * R * 0.12;
      const iconY = pcy - R * 1.55 + bobY;
      ctx.font = '700 ' + Math.floor(R * 1.1) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ALL_ICON_COLORS[activeIcon];
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeText(ALL_ICON_SYMBOLS[activeIcon], pcx, iconY);
      ctx.fillText(ALL_ICON_SYMBOLS[activeIcon], pcx, iconY);
    }

    for (let i = emotePopups.length - 1; i >= 0; i--) {
      const em = emotePopups[i];
      const t = (now - em.startTime) / 750;
      if (t >= 1) { emotePopups.splice(i, 1); continue; }
      const bounce = t < 0.25 ? 1.4 - (t / 0.25) * 0.4 : 1 - (t - 0.25) * 0.1;
      const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const ex = em.x * CELL + CELL / 2 + R * 1.3;
      const ey = em.y * CELL + CELL / 2 - R * 1.3 - t * CELL * 0.5;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(ex, ey);
      ctx.scale(bounce, bounce);
      ctx.font = '700 ' + Math.floor(CELL * 0.55) + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(em.emoji, 0, 0);
      ctx.restore();
    }

    const enemyT = Math.min(1, (now - enemyStepTime) / enemyInterval);
    const frozen = now < freezeUntil;
    const freezeRemaining = freezeUntil - now;
    const blinking = frozen && freezeRemaining < 900;
    const blinkOn = blinkOnGlobal;

    if (freezeWasActive && !frozen) { thawFlashUntil = now + 550; sndThaw(); }
    freezeWasActive = frozen;
    const justThawed = now < thawFlashUntil;

    // Verstecke (tiefe eigene Flaeche) werden aus den Kegeln ausgespart - dort sieht kein Waechter hin
    const hidingCells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isHidingCell(c, r)) hidingCells.push([c, r]);

    // Sichtkegel unter den Waechtern
    for (const e of enemies) {
      const v = VISION[e.personality] || VISION.wanderer;
      const dc = e.prevC + (e.c - e.prevC) * enemyT;
      const dr = e.prevR + (e.r - e.prevR) * enemyT;
      const cx = dc*CELL + CELL/2, cy = dr*CELL + CELL/2;
      const ang = (e.angleDisp !== undefined) ? e.angleDisp : enemyFacing(e);
      if (guardBlind(e, now)) continue; // benommen oder in der Pause: kein Kegel
      const alerted = e.huntingActive || now < alarmUntil;
      const radius = visionRange(e) * CELL;
      let g = ctx.createRadialGradient(cx, cy, CELL * 0.3, cx, cy, radius);
      if (alerted) {
        g.addColorStop(0, 'rgba(255,80,60,0.30)');
        g.addColorStop(1, 'rgba(255,80,60,0)');
      } else {
        g.addColorStop(0, 'rgba(255,220,120,0.16)');
        g.addColorStop(1, 'rgba(255,220,120,0)');
      }
      if (now < discoUntil) {
        // Disco: Kegel als bunte Scheinwerfer
        const hue = Math.round((now / 6 + e.c * 47 + e.r * 23) % 360);
        g = ctx.createRadialGradient(cx, cy, CELL * 0.3, cx, cy, radius);
        g.addColorStop(0, 'hsla(' + hue + ',100%,65%,0.45)');
        g.addColorStop(1, 'hsla(' + hue + ',100%,65%,0)');
      }
      ctx.save();
      if (hidingCells.length) {
        ctx.beginPath();
        ctx.rect(-CELL, -CELL, (COLS + 2) * CELL, (ROWS + 2) * CELL);
        for (const [hc, hr] of hidingCells) ctx.rect(hc * CELL, hr * CELL, CELL, CELL);
        ctx.clip('evenodd');
      }
      ctx.beginPath();
      // Exakter Sichtbereich (dieselbe Geometrie wie canSeePlayer) plus Nahbereich
      const [sox, soy] = guardSightOrigin(e, now);
      const poly = visionPolygon(e, sox, soy);
      ctx.moveTo(poly[0][0] * CELL, poly[0][1] * CELL);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0] * CELL, poly[i][1] * CELL);
      ctx.closePath();
      ctx.moveTo(cx + NEAR_SIGHT * CELL, cy);
      ctx.arc(cx, cy, NEAR_SIGHT * CELL, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = alerted ? 'rgba(255,110,90,0.45)' : 'rgba(255,225,150,0.20)';
      ctx.lineWidth = Math.max(1, CELL * 0.035);
      ctx.stroke();
      ctx.restore();
    }

    for (const e of enemies) {
      const dispC = e.prevC + (e.c - e.prevC) * enemyT;
      const dispR = e.prevR + (e.r - e.prevR) * enemyT;
      const ecx = dispC*CELL + CELL/2, ecy = dispR*CELL + CELL/2;

      const gridDist = Math.abs(e.c - px) + Math.abs(e.r - py);
      const isClose = gridDist <= 4 && !frozen && !justThawed;
      const isFar = gridDist > 8 && !frozen && !justThawed;

      let pulseFreq = 340, pulseAmp = 0.03;
      if (isClose) { pulseFreq = 140; pulseAmp = 0.07; }
      else if (frozen) { pulseFreq = 900; pulseAmp = 0.015; }
      const pulse = 1 + Math.sin(now / pulseFreq + e.c * 1.7 + e.r) * pulseAmp;
      const R = CELL * 0.36 * pulse;

      ctx.save();
      ctx.translate(ecx, ecy);

      const bodyColor = frozen ? (blinking && !blinkOn ? '#e3574a' : '#7fdcff') : (PERSONALITY_COLORS[e.personality] || '#e3574a');
      const faceAng = (e.angleDisp !== undefined) ? e.angleDisp : 0;
      const tailAng = (e.tailAngleDisp !== undefined) ? e.tailAngleDisp : faceAng;
      // Wie stark dreht er gerade? Steuert Flossenausschlag und Nasenlaenge.
      const turnAmount = Math.max(-1, Math.min(1, shortestAngleDelta(tailAng, faceAng) * 1.6));

      // Flossen hinten: laufen der Drehung hinterher und schwingen dabei aus
      ctx.save();
      ctx.rotate(tailAng);
      ctx.fillStyle = shadeColor(bodyColor, -0.28);
      for (const side of [-1, 1]) {
        const spread = 0.62 + side * turnAmount * 0.22;
        ctx.save();
        ctx.rotate(Math.PI + side * spread);
        ctx.beginPath();
        ctx.moveTo(R * 0.55, 0);
        ctx.quadraticCurveTo(R * 1.35, side * R * 0.20, R * 1.62, 0);
        ctx.quadraticCurveTo(R * 1.25, -side * R * 0.12, R * 0.55, -side * R * 0.26);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // Koerper: Tropfenform mit Nase in Blickrichtung
      ctx.save();
      ctx.rotate(faceAng);
      const noseLen = R * (1.34 + Math.abs(turnAmount) * 0.10);
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0.42 * Math.PI, 1.58 * Math.PI);
      ctx.quadraticCurveTo(R * 1.05, -R * 0.52, noseLen, 0);
      ctx.quadraticCurveTo(R * 1.05, R * 0.52, R * Math.cos(0.42 * Math.PI), R * Math.sin(0.42 * Math.PI));
      ctx.closePath();
      ctx.fill();

      // Heller Visierrand vorne - macht die Blickrichtung auch ohne Kegel lesbar
      ctx.fillStyle = shadeColor(bodyColor, 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.02, -0.36 * Math.PI, 0.36 * Math.PI);
      ctx.arc(0, 0, R * 0.66, 0.36 * Math.PI, -0.36 * Math.PI, true);
      ctx.closePath();
      ctx.fill();
      // Dunkler Saum hinten
      ctx.strokeStyle = shadeColor(bodyColor, -0.35);
      ctx.lineWidth = Math.max(1, R * 0.10);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.94, 0.72 * Math.PI, 1.28 * Math.PI);
      ctx.stroke();
      ctx.restore();

      // Ausruestung je nach Waechtertyp
      drawGuardGear(e, R, faceAng, now);

      if (now < alarmUntil) {
        const alarmPulse = 0.5 + Math.sin(now / 90) * 0.5;
        ctx.strokeStyle = 'rgba(255,60,40,' + (0.4 + alarmPulse * 0.5) + ')';
        ctx.lineWidth = Math.max(1.5, R * 0.14);
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.22, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Augen
      const eyeOffX = R * 0.42, eyeOffY = -R * 0.08;
      const ang = (e.eyeAngleDisp !== undefined) ? e.eyeAngleDisp : Math.atan2(py - e.r, px - e.c);
      // Gesicht sitzt vorne: wandert weich mit der Drehung mit
      const faceShiftX = Math.cos(faceAng) * R * 0.30;
      const faceShiftY = Math.sin(faceAng) * R * 0.30;
      const lookX = Math.cos(ang), lookY = Math.sin(ang);

      if (justThawed) {
        // ueberrascht: grosse Augen, kleine Pupille zentriert
        for (const side of [-1, 1]) {
          const exx = faceShiftX + side * eyeOffX, eyy = faceShiftY + eyeOffY;
          ctx.beginPath();
          ctx.arc(exx, eyy, R * 0.30, 0, Math.PI*2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(exx, eyy, R * 0.12, 0, Math.PI*2);
          ctx.fillStyle = '#101414';
          ctx.fill();
        }
      } else if (isFar) {
        // schlaefrig: geschlossene Augen (kleine Bögen)
        ctx.strokeStyle = '#101414';
        ctx.lineWidth = Math.max(1.5, R * 0.11);
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          const exx = faceShiftX + side * eyeOffX, eyy = faceShiftY + eyeOffY;
          ctx.beginPath();
          ctx.arc(exx, eyy, R * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.stroke();
        }
      } else {
        // normal / angespannt: runde Augen mit verfolgender Pupille
        const eyeR = R * 0.24;
        const pupilR = eyeR * 0.5;
        const pupilRange = eyeR - pupilR;
        for (const side of [-1, 1]) {
          const exx = faceShiftX + side * eyeOffX, eyy = faceShiftY + eyeOffY;
          ctx.beginPath();
          ctx.arc(exx, eyy, eyeR, 0, Math.PI*2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(exx + lookX * pupilRange, eyy + lookY * pupilRange, pupilR, 0, Math.PI*2);
          ctx.fillStyle = '#101414';
          ctx.fill();
        }
        if (isClose) {
          // wuetende Augenbrauen
          ctx.strokeStyle = '#101414';
          ctx.lineWidth = Math.max(1.5, R * 0.13);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(faceShiftX - eyeOffX - eyeR*0.9, faceShiftY + eyeOffY - eyeR*1.5);
          ctx.lineTo(faceShiftX - eyeOffX + eyeR*0.7, faceShiftY + eyeOffY - eyeR*0.6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(faceShiftX + eyeOffX + eyeR*0.9, faceShiftY + eyeOffY - eyeR*1.5);
          ctx.lineTo(faceShiftX + eyeOffX - eyeR*0.7, faceShiftY + eyeOffY - eyeR*0.6);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    for (let i = enemyDeathAnims.length - 1; i >= 0; i--) {
      const a = enemyDeathAnims[i];
      if (a.kind) {
        if (drawGuardDeath(a, now)) enemyDeathAnims.splice(i, 1);
        continue;
      }
      const ANGEL_LIFE = 1300;
      const t = (now - a.startTime) / ANGEL_LIFE;
      if (t >= 1) { enemyDeathAnims.splice(i, 1); continue; }

      const acx = a.c * CELL + CELL / 2;
      const startY = a.r * CELL + CELL / 2;
      const targetY = -CELL * 2.5; // sicher ausserhalb des Spielfelds oben
      const acy = startY - (startY - targetY) * t;
      const alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
      const aR = CELL * 0.34 * (1 - t * 0.2);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(acx, acy);

      // Fluegel
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(-aR * 1.1, aR * 0.1, aR * 0.55, aR * 0.32, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(aR * 1.1, aR * 0.1, aR * 0.55, aR * 0.32, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Koerper
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.arc(0, 0, aR, 0, Math.PI * 2);
      ctx.fill();

      // Heiligenschein
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1.5, aR * 0.1);
      ctx.beginPath();
      ctx.ellipse(0, -aR * 1.35, aR * 0.55, aR * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();

      // X-Augen
      const dAeyeOffX = aR * 0.4, dAeyeOffY = -aR * 0.05;
      ctx.strokeStyle = '#101414';
      ctx.lineWidth = Math.max(1.5, aR * 0.14);
      ctx.lineCap = 'round';
      const xr = aR * 0.18;
      for (const side of [-1, 1]) {
        const exx = side * dAeyeOffX, eyy = dAeyeOffY;
        ctx.beginPath();
        ctx.moveTo(exx - xr, eyy - xr); ctx.lineTo(exx + xr, eyy + xr);
        ctx.moveTo(exx + xr, eyy - xr); ctx.lineTo(exx - xr, eyy + xr);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Waechter-Zustand (Sterne / Kaffee) und Sprechblasen
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of enemies) {
      const stunned = now < (e.stunnedUntil || 0), onBreak = now < (e.breakUntil || 0);
      if (!stunned && !onBreak) continue;
      const ex = (e.prevC + (e.c - e.prevC) * enemyT) * CELL + CELL / 2;
      const ey = (e.prevR + (e.r - e.prevR) * enemyT) * CELL + CELL / 2;
      ctx.font = Math.floor(CELL * 0.42) + 'px -apple-system, sans-serif';
      if (stunned) {
        for (let k = 0; k < 3; k++) {
          const a = now / 180 + k * Math.PI * 2 / 3;
          ctx.fillText('⭐', ex + Math.cos(a) * CELL * 0.4, ey - CELL * 0.45 + Math.sin(a) * CELL * 0.12);
        }
      } else {
        ctx.fillText('☕', ex + CELL * 0.35, ey + CELL * 0.1);
        const z = ((now / 700) % 1);
        ctx.globalAlpha = 1 - z;
        ctx.fillText('z', ex + CELL * (0.2 + z * 0.3), ey - CELL * (0.5 + z * 0.5));
        ctx.globalAlpha = 1;
      }
    }
    guardBubbles = guardBubbles.filter(b => now - b.start < BUBBLE_MS);
    for (const b of guardBubbles) {
      if (enemies.includes(b.e)) {
        b.x = b.e.prevC + (b.e.c - b.e.prevC) * enemyT;
        b.y = b.e.prevR + (b.e.r - b.e.prevR) * enemyT;
      }
      const t = (now - b.start) / BUBBLE_MS;
      const pop = t < 0.1 ? 0.6 + t * 4 : 1;
      ctx.save();
      ctx.globalAlpha = t > 0.8 ? (1 - t) / 0.2 : 1;
      ctx.font = '700 ' + Math.max(10, Math.floor(CELL * 0.42)) + 'px -apple-system, sans-serif';
      const w = ctx.measureText(b.text).width + CELL * 0.4, h = CELL * 0.62;
      let bx = b.x * CELL + CELL / 2;
      bx = Math.max(w / 2, Math.min(COLS * CELL - w / 2, bx));
      const by = Math.max(h / 2, b.y * CELL - CELL * 0.35);
      ctx.translate(bx, by);
      ctx.scale(pop, pop);
      ctx.fillStyle = 'rgba(250,248,240,0.95)';
      ctx.strokeStyle = 'rgba(20,20,20,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(b.text, 0, 1);
      ctx.restore();
    }
    if (versusRender) vsDrawWorld(now);
    ctx.restore();

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
      const elapsed = now - countdownStartTime;
      const totalDur = COUNTDOWN_STEPS.length * COUNTDOWN_STEP_MS;
      if (elapsed >= totalDur) {
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

