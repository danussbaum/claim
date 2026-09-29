// Spieler und Waechter. Aufgerufen von draw() im Weltkoordinatensystem.

// Spieler samt Effekten (Schild, Stacheln, Enterhaken, Staub, Rauch, Wisch-Hinweis, Power-up-Icon, Emotes).
function drawPlayer(now, blinkOnGlobal, dispPx, dispPy, pcx, pcy, playerT, psyloActive) {
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
    // Nachwippen nach Kurve oder Eroberung (gedaempfte Schwingung)
    const sqAge = (now - playerSquashTime) / 1000;
    const wobble = sqAge < 0.6 ? playerSquashAmt * Math.exp(-sqAge * 7) * Math.cos(sqAge * 28) : 0;
    const stretch = (1 + bounce * 0.18) * (1 - wobble);
    const squeeze = (1 - bounce * 0.13) * (1 + wobble);
    const headX = Math.cos(playerHeadingDisp), headY = Math.sin(playerHeadingDisp);


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

    // Tiefe: weicher Bodenschatten unter dem Spieler
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(pcx + CELL * 0.06, pcy + R * 0.85, R * 0.85 * stretch, R * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

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
      ctx.font = '700 ' + Math.floor(R * 1.1) + 'px "Space Grotesk", -apple-system, sans-serif';
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
      ctx.font = '700 ' + Math.floor(CELL * 0.55) + 'px "Space Grotesk", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(em.emoji, 0, 0);
      ctx.restore();
    }
}

// Waechter: Sichtkegel, Figuren, Todesanimationen, Zustand und Sprechblasen.
function drawGuards(now, blinkOnGlobal) {
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
      const [sox, soy] = guardSightOrigin(e, now);
      fillVisionCone(e, sox, soy, cx, cy, g, alerted ? 'rgba(255,110,90,0.45)' : 'rgba(255,225,150,0.20)');
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

      // Tiefe: Bodenschatten
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(ecx + CELL * 0.06, ecy + R * 0.85, R * 0.85, R * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

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
      ctx.font = Math.floor(CELL * 0.42) + 'px "Space Grotesk", -apple-system, sans-serif';
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
      ctx.font = '700 ' + Math.max(10, Math.floor(CELL * 0.42)) + 'px "Space Grotesk", -apple-system, sans-serif';
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
}
