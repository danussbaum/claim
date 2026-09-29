// Spielfeld und alles, was auf dem Feld liegt oder darueber schwebt (ohne Figuren).
// Die Funktionen laufen im Weltkoordinatensystem, das draw() vorher gesetzt hat.

// Gitter, Zellen (Land, Linie, Saeulen, Gruben, Bonuszone), Saeulenschatten und Aufblitzen erobert/gekappter Zellen.
function drawBoard(now, gr, gg, gb, gridAlpha, playerT) {
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
      if (now - flashCells[i].time - (flashCells[i].delay || 0) > 400) flashCells.splice(i, 1);
    }
    // Eroberung: Zellen, deren Welle noch nicht angekommen ist, bleiben leer
    const growCells = new Map();
    for (const f of flashCells) if (f.delay) growCells.set(f.r * COLS + f.c, f);

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
          const gf = growCells.get(r * COLS + c);
          if (gf) {
            const ga = now - gf.time - gf.delay;
            if (ga < 0) continue;
            if (ga < 220) {
              // Aufpoppen mit leichtem Ueberschwingen
              const t = ga / 220, k = 1.7;
              const s = 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);
              const h = CELL * s / 2;
              ctx.fillStyle = '#2f8f5c';
              ctx.fillRect(c*CELL + CELL/2 - h, r*CELL + CELL/2 - h, h * 2, h * 2);
              continue;
            }
          }
          ctx.fillStyle = '#2f8f5c';
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(c*CELL, r*CELL, CELL, 2);
          // Tiefe: Kante nach unten, wo die Flaeche endet
          if (r + 1 >= ROWS || grid[r + 1][c] !== TERRITORY) {
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.fillRect(c*CELL, (r+1)*CELL - Math.max(2, CELL * 0.12), CELL, Math.max(2, CELL * 0.12));
          }
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

    // Tiefe: Schlagschatten der Saeulen nach rechts unten
    const shOff = Math.max(2, Math.round(CELL * 0.18));
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] !== BLOCK) continue;
        if (c + 1 < COLS && grid[r][c + 1] !== BLOCK) ctx.fillRect((c+1)*CELL, r*CELL + shOff, shOff, CELL - shOff);
        if (r + 1 < ROWS && grid[r + 1][c] !== BLOCK) ctx.fillRect(c*CELL + shOff, (r+1)*CELL, CELL - shOff, shOff);
        if (c + 1 < COLS && r + 1 < ROWS && grid[r + 1][c + 1] !== BLOCK) ctx.fillRect((c+1)*CELL, (r+1)*CELL, shOff, shOff);
      }
    }

    for (const f of flashCells) {
      const t = (now - f.time - (f.delay || 0)) / 400;
      if (t < 0) continue;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - t)) + ')';
      ctx.fillRect(f.c*CELL, f.r*CELL, CELL, CELL);
    }
}

// Energiewellen, Popups, Bonusrahmen, Roulette, Feuerwerk und Funken.
function drawWorldEffects(now) {
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
      ctx.font = '700 ' + Math.floor(CELL * 0.55) + 'px "Space Grotesk", -apple-system, sans-serif';
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
      ctx.font = '800 ' + size + 'px Orbitron, "Space Grotesk", sans-serif';
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
      ctx.font = '800 ' + Math.floor(CELL * 0.5) + 'px Orbitron, "Space Grotesk", sans-serif';
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
      ctx.font = '700 ' + Math.floor(CELL * 0.5) + 'px "Space Grotesk", -apple-system, sans-serif';
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
        ctx.font = '700 ' + Math.floor(CELL * 0.4) + 'px "Space Grotesk", -apple-system, sans-serif';
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
        ctx.font = '800 ' + Math.floor(CELL * 0.42) + 'px Orbitron, "Space Grotesk", sans-serif';
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
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparkParticles.length - 1; i >= 0; i--) {
      const p = sparkParticles[i];
      const age = now - p.startTime;
      if (age < 0) continue;
      if (age > p.life) { sparkParticles.splice(i, 1); continue; }
      // Luftwiderstand: Weg = v * (1 - e^-kt) / k
      const k = 4, t = age / 1000, d = (1 - Math.exp(-k * t)) / k;
      const f = 1 - age / p.life;
      const size = Math.max(1.5, CELL * p.size * (0.4 + f * 0.6));
      const sx = p.x0 + p.vx * d, sy = p.y0 + p.vy * d;
      ctx.fillStyle = p.color;
      // Leuchten ohne shadowBlur (teuer auf Handys): weicher Hof + heller Kern
      ctx.globalAlpha = f * 0.3;
      ctx.fillRect(sx - size, sy - size, size * 2, size * 2);
      ctx.globalAlpha = f;
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
}

// Fliegende Aexte, Power-ups, Bananenschalen, Minen und Decoy-Steine.
function drawWorldObjects(now) {
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
      ctx.font = '700 ' + Math.floor(CELL * 0.4) + 'px "Space Grotesk", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(MYSTERY_SYMBOL, 0, 1);
      ctx.restore();
    }

    // Bananenschalen
    ctx.font = Math.floor(CELL * 0.6) + 'px "Space Grotesk", -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of bananaPeels) ctx.fillText('🍌', b.c * CELL + CELL / 2, b.r * CELL + CELL / 2 + 1);

    // Minen: scharf mit pulsierendem Ring (rot = eigene, blau = die des Gegners)
    for (const m of mines) {
      const cx = m.c * CELL + CELL / 2, cy = m.r * CELL + CELL / 2;
      const armed = now >= m.armedAt;
      const pulse = 0.5 + 0.5 * Math.sin(now / 160);
      ctx.save();
      ctx.globalAlpha = armed ? 0.35 + 0.4 * pulse : 0.3;
      ctx.strokeStyle = m.foe ? '#6aa8ff' : '#ff6a4a';
      ctx.lineWidth = Math.max(1, CELL * 0.07);
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * (0.4 + 0.12 * pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = armed ? 1 : 0.5;
      ctx.font = Math.floor(CELL * 0.6) + 'px "Space Grotesk", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💣', cx, cy + 1);
      ctx.restore();
    }

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
      ctx.font = Math.floor(CELL * 0.6) + 'px "Space Grotesk", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🪨', cx, cy + 1);
      ctx.restore();
    }
}
