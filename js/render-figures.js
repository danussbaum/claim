// Figuren zeichnen: Ente, Waechter (Ausruestung, Augen, Sichtkegel, Todesanimation), Spielergesicht.
// Wird von draw() (render-actors.js) aufgerufen.

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
    ctx.font = Math.floor(CELL * 0.3) + 'px "Space Grotesk", -apple-system, sans-serif';
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
      ctx.font = Math.floor(R * 0.9) + 'px "Space Grotesk", -apple-system, sans-serif';
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

// Sichtkegel fuellen: exakter Sichtbereich (dieselbe Geometrie wie canSeePoint) plus Nahbereich.
// (ox, oy) in Zellen, (cx, cy) in Pixeln. Auch fuer den CPU-Gegner im Versus (js/versus.js).
function fillVisionCone(e, ox, oy, cx, cy, fill, stroke) {
  const poly = visionPolygon(e, ox, oy);
  ctx.beginPath();
  ctx.moveTo(poly[0][0] * CELL, poly[0][1] * CELL);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0] * CELL, poly[i][1] * CELL);
  ctx.closePath();
  ctx.moveTo(cx + NEAR_SIGHT * CELL, cy);
  ctx.arc(cx, cy, NEAR_SIGHT * CELL, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, CELL * 0.035);
  ctx.stroke();
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
