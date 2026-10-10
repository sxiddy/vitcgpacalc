// Share card drawing. VCCard.draw(canvas, data, { size: 'story'|'square', design }) paints a PNG-ready card.
// data = { sem, rows: [{ code, title, mark, grade }], stats: [{ label, value, note }], hideMarks }
(function (root) {
  const SIZES = { story: [1080, 1920], square: [1080, 1080] };
  const SITE = 'vitcgpacalc.vercel.app', URL = 'https://' + SITE;
  const C = {
    bg: '#0a0a0d', bg2: '#131318', text: '#f3f0e8', text2: '#a7a3ad', text3: '#6f6c76',
    gold: '#e8b84a', gold2: '#f6d98b', blue: '#4c86ff', blue2: '#8fb3ff', ink: '#1a1405'
  };
  const GRADE = { S: '#e8b84a', A: '#4c86ff', B: '#2fc4a8', C: '#9d7bff', D: '#f2a23c', E: '#f07a4a', F: '#ff5d5d' };
  const DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif', BODY = '"Inter", system-ui, sans-serif';

  // ---------- helpers ----------
  const font = (ctx, px, weight, fam) => { ctx.font = `${weight || 400} ${px}px ${fam || BODY}`; };
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function fill(ctx, style, x, y, w, h, r) { ctx.fillStyle = style; rr(ctx, x, y, w, h, r); ctx.fill(); }
  // shortens text with an ellipsis until it fits maxW
  function fit(ctx, text, maxW) {
    text = String(text);
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text.trimEnd() + '…';
  }
  function txt(ctx, text, x, y, color, align, maxW) {
    ctx.fillStyle = color; ctx.textAlign = align || 'left';
    ctx.fillText(maxW ? fit(ctx, text, maxW) : text, x, y);
  }
  function glow(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // biggest font size (<= max) at which text fits in w
  function sizeToFit(ctx, text, w, max, weight, fam) {
    let px = max;
    for (; px > 10; px -= 2) { font(ctx, px, weight, fam); if (ctx.measureText(text).width <= w) break; }
    return px;
  }

  let qrCache = null;
  function qr(ctx, x, y, s, opts) {
    opts = opts || {};
    if (!qrCache) qrCache = root.VCQR.make(URL);
    const q = qrCache, quiet = 2, n = q.size + quiet * 2, m = s / n;
    fill(ctx, opts.bg || '#ffffff', x, y, s, s, opts.r == null ? s * 0.08 : opts.r);
    ctx.fillStyle = opts.fg || C.bg;
    for (let yy = 0; yy < q.size; yy++) for (let xx = 0; xx < q.size; xx++)
      if (q.dark(xx, yy)) ctx.fillRect(Math.floor(x + (xx + quiet) * m), Math.floor(y + (yy + quiet) * m), Math.ceil(m), Math.ceil(m));
  }

  // "VIT cgpa" wordmark, like the site header
  function logo(ctx, x, y, px, align) {
    font(ctx, px, 700, DISPLAY); const w1 = ctx.measureText('VIT').width;
    font(ctx, px, 500, DISPLAY); const w2 = ctx.measureText('cgpa').width;
    const gap = px * 0.04, w = w1 + gap + w2;
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    font(ctx, px, 700, DISPLAY); txt(ctx, 'VIT', x0, y, C.gold);
    font(ctx, px, 500, DISPLAY); txt(ctx, 'cgpa', x0 + w1 + gap, y, C.text);
    fill(ctx, C.blue, x0 + w1 + gap + px * 0.08, y + px * 0.16, w2 - px * 0.12, Math.max(3, px * 0.08), 4);
    return w;
  }

  function gradeBadge(ctx, cx, cy, s, grade, solid) {
    const col = GRADE[grade] || C.text3;
    if (solid) fill(ctx, col, cx - s / 2, cy - s / 2, s, s, s * 0.26);
    else { fill(ctx, col + '26', cx - s / 2, cy - s / 2, s, s, s * 0.26); }
    font(ctx, s * 0.56, 700, DISPLAY); ctx.textBaseline = 'middle';
    txt(ctx, grade || '–', cx, cy + s * 0.03, solid ? C.ink : col, 'center');
    ctx.textBaseline = 'alphabetic';
  }

  // how many rows fit: returns { list, rowH } where the last item may be { more: n }
  let lastShown = 0;
  function fitRows(rows, h, minH, maxH) {
    const cap = Math.max(1, Math.floor(h / minH));
    let list = rows;
    if (rows.length > cap) list = rows.slice(0, cap - 1).concat([{ more: rows.length - cap + 1 }]);
    lastShown = list.length - (list.length < rows.length || (list.length && list[list.length - 1].more) ? 1 : 0);
    return { list, rowH: Math.min(maxH, h / Math.max(list.length, 1)) };
  }
  const markText = r => (r.mark === null || r.mark === undefined ? '' : String(Math.round(r.mark * 100) / 100));

  // a plain subject row: code over title on the left, mark and grade on the right
  function subjectRow(ctx, r, x, y, w, h, o) {
    o = o || {};
    const cy = y + h / 2, k = Math.min(1, h / 110);
    if (r.more) { font(ctx, 30 * k + 4, 500); txt(ctx, `+ ${r.more} more subject${r.more === 1 ? '' : 's'}`, x, cy + 10, C.text2); return; }
    const badge = Math.min(h * 0.72, 84);
    let right = x + w;
    if (r.grade) { if (o.letter) { font(ctx, badge * 0.8, 700, DISPLAY); txt(ctx, r.grade, right, cy + badge * 0.28, GRADE[r.grade], 'right'); } else gradeBadge(ctx, right - badge / 2, cy, badge, r.grade, o.solid); right -= badge + 22; }
    const m = markText(r);
    if (m) {
      font(ctx, 22 * k + 8, 500); const sw = ctx.measureText('/100').width;
      txt(ctx, '/100', right, cy + 12 * k + 2, C.text3, 'right');
      font(ctx, 44 * k + 6, 600, DISPLAY); txt(ctx, m, right - sw - 6, cy + 14 * k + 2, C.text, 'right');
      right -= sw + 6 + ctx.measureText(m).width + 24;
    }
    font(ctx, 22 * k + 5, 600, DISPLAY); txt(ctx, r.code, x, cy - 8 * k, o.codeColor || C.gold, 'left', right - x);
    font(ctx, 28 * k + 6, 500); txt(ctx, r.title, x, cy + 30 * k, C.text, 'left', right - x);
  }

  function headline(d) { return d.stats.length ? null : d.rows.length === 1 ? 'My result' : 'My results'; }

  // ---------- design 1: Glow (gradient, glass panel, score ring) ----------
  function glowDesign(ctx, W, H, d, story) {
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0d0c12'); bg.addColorStop(1, '#07070a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    glow(ctx, W * 0.1, H * 0.08, W * 0.8, 'rgba(232,184,74,0.20)');
    glow(ctx, W * 0.95, H * 0.75, W * 0.85, 'rgba(76,134,255,0.20)');
    const P = 72;
    logo(ctx, P, story ? 150 : 110, story ? 56 : 46);
    font(ctx, story ? 30 : 26, 500); const pw = ctx.measureText(d.sem).width + 48;
    fill(ctx, 'rgba(255,255,255,0.08)', W - P - pw, story ? 104 : 70, pw, story ? 62 : 54, 31);
    txt(ctx, d.sem, W - P - pw / 2, story ? 146 : 107, C.text, 'center');

    let y = story ? 250 : 170;
    if (d.stats.length) {
      const hero = d.stats[0], R = story ? 185 : 118, cx = story ? W / 2 : P + R, cy = y + R + 10;
      ctx.lineWidth = story ? 30 : 22; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R); g.addColorStop(0, C.gold2); g.addColorStop(1, C.gold);
      ctx.strokeStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, +hero.value / 10)); ctx.stroke();
      font(ctx, story ? 124 : 80, 700, DISPLAY); txt(ctx, hero.value, cx, cy + (story ? 34 : 20), C.text, 'center');
      font(ctx, story ? 28 : 22, 500); txt(ctx, hero.label, cx, cy + (story ? 84 : 56), C.text2, 'center');
      const second = d.stats[1];
      if (second) {
        const bw = story ? 560 : W - P - (cx + R + 50), bh = story ? 116 : 160;
        const bx = story ? (W - bw) / 2 : cx + R + 50, by = story ? cy + R + 40 : cy - bh / 2;
        fill(ctx, 'rgba(76,134,255,0.14)', bx, by, bw, bh, 28);
        ctx.strokeStyle = 'rgba(76,134,255,0.35)'; ctx.lineWidth = 2; rr(ctx, bx, by, bw, bh, 28); ctx.stroke();
        if (story) {
          font(ctx, 30, 500); txt(ctx, second.label, bx + 36, by + bh / 2 + 10, C.text2);
          font(ctx, 72, 700, DISPLAY); txt(ctx, second.value, bx + bw - 36, by + bh / 2 + 26, C.blue2, 'right');
          if (second.note) { font(ctx, 24, 600); txt(ctx, second.note, bx + 36, by + bh / 2 + 44, C.text3); }
        } else {
          font(ctx, 26, 500); txt(ctx, second.label, bx + 32, by + 56, C.text2, 'left', bw - 64);
          font(ctx, 76, 700, DISPLAY); txt(ctx, second.value, bx + 32, by + 136, C.blue2);
          if (second.note) { font(ctx, 24, 600); txt(ctx, second.note, bx + bw - 28, by + 136, C.text2, 'right'); }
        }
        y = story ? by + bh + 40 : cy + R + 40;
      } else y = cy + R + (story ? 60 : 40);
    } else {
      font(ctx, story ? 120 : 96, 700, DISPLAY); txt(ctx, headline(d), P, y + (story ? 110 : 80), C.text);
      y += story ? 170 : 130;
    }

    // glass panel with subjects
    const footH = story ? 250 : 170, panelBottom = H - footH - (story ? 30 : 14);
    if (d.rows.length) {
      const ph = panelBottom - y;
      fill(ctx, 'rgba(255,255,255,0.05)', P - 24, y, W - 2 * P + 48, ph, 36);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; rr(ctx, P - 24, y, W - 2 * P + 48, ph, 36); ctx.stroke();
      const f = fitRows(d.rows, ph - 40, story ? 96 : 68, story ? 140 : 100);
      f.list.forEach((r, i) => {
        const ry = y + 20 + i * f.rowH;
        if (i) { ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(P + 8, ry, W - 2 * P - 16, 2); }
        subjectRow(ctx, r, P + 12, ry, W - 2 * P - 24, f.rowH);
      });
    }
    footer(ctx, W, H, P, footH, story, { tag: 'Can you beat this?' });
  }

  // shared footer: tagline + link on the left, QR on the right
  function footer(ctx, W, H, P, h, story, o) {
    const s = story ? 200 : 132, y = H - P - s + (story ? 0 : 16);
    qr(ctx, W - P - s, y, s);
    font(ctx, story ? 46 : 36, 700, DISPLAY); txt(ctx, o.tag, P, y + s / 2 - (story ? 6 : 4), o.tagColor || C.text);
    font(ctx, story ? 32 : 26, 500); txt(ctx, 'Work out yours at', P, y + s / 2 + (story ? 44 : 36), C.text2);
    const w = ctx.measureText('Work out yours at ').width;
    font(ctx, story ? 32 : 26, 600); txt(ctx, SITE, P + w, y + s / 2 + (story ? 44 : 36), o.linkColor || C.gold);
  }

  // ---------- design 2: Editorial (pure black, huge gold number, thin rules) ----------
  function editorialDesign(ctx, W, H, d, story) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const P = story ? 84 : 72;
    fill(ctx, C.blue, 0, 0, W, story ? 14 : 10, 0);
    logo(ctx, P, story ? 140 : 104, story ? 48 : 40);
    font(ctx, story ? 28 : 24, 500); txt(ctx, d.sem.toUpperCase(), W - P, story ? 136 : 100, C.text2, 'right');
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(P, story ? 186 : 136, W - 2 * P, 2);

    let y = story ? 186 : 136;
    if (d.stats.length) {
      const hero = d.stats[0];
      font(ctx, story ? 34 : 26, 600); txt(ctx, hero.label.toUpperCase(), P, y + (story ? 90 : 62), C.gold);
      font(ctx, story ? 330 : 210, 700, DISPLAY); txt(ctx, hero.value, P - (story ? 12 : 8), y + (story ? 380 : 250), C.gold);
      const second = d.stats[1];
      if (second) {
        const sx = story ? P : W - P, al = story ? 'left' : 'right', base = story ? y + 470 : y + 160;
        font(ctx, story ? 30 : 24, 600); txt(ctx, second.label.toUpperCase(), sx, base, C.blue2, al);
        font(ctx, story ? 120 : 110, 700, DISPLAY); txt(ctx, second.value, sx, base + (story ? 120 : 108), C.text, al);
        if (second.note) { font(ctx, story ? 28 : 24, 600); txt(ctx, second.note, story ? P + 360 : sx, story ? base + 120 : base + 150, C.text2, al); }
        y = story ? base + 180 : y + 300;
      } else y += story ? 440 : 300;
    } else {
      font(ctx, story ? 140 : 110, 700, DISPLAY); txt(ctx, headline(d), P, y + (story ? 170 : 130), C.gold);
      y += story ? 230 : 180;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(P, y, W - 2 * P, 2);

    const footH = story ? 300 : 190;
    if (d.rows.length) {
      const f = fitRows(d.rows, H - footH - y - 20, story ? 104 : 80, story ? 132 : 100);
      f.list.forEach((r, i) => {
        const ry = y + 10 + i * f.rowH;
        subjectRow(ctx, r, P, ry, W - 2 * P, f.rowH, { letter: true, codeColor: C.text2 });
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; if (!r.more) ctx.fillRect(P, ry + f.rowH, W - 2 * P, 1);
      });
    }
    footer(ctx, W, H, P, footH, story, { tag: 'Can you beat this?', tagColor: C.text, linkColor: C.blue2 });
  }

  // ---------- design 3: Tiles (grid of grade tiles, ticket footer) ----------
  function tilesDesign(ctx, W, H, d, story) {
    const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#101016'); bg.addColorStop(1, '#09090c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    glow(ctx, W / 2, 0, W * 0.7, 'rgba(232,184,74,0.12)');
    const P = 64;
    logo(ctx, W / 2, story ? 150 : 104, story ? 60 : 46, 'center');
    font(ctx, story ? 30 : 24, 500); txt(ctx, d.sem, W / 2, story ? 210 : 148, C.text2, 'center');

    let y = story ? 270 : 180;
    if (d.stats.length) {
      const n = d.stats.length, gap = 24, bw = (W - 2 * P - gap * (n - 1)) / n, bh = story ? 260 : 170;
      d.stats.forEach((s, i) => {
        const bx = P + i * (bw + gap), first = i === 0;
        if (first) { const g = ctx.createLinearGradient(bx, y, bx + bw, y + bh); g.addColorStop(0, C.gold2); g.addColorStop(1, C.gold); fill(ctx, g, bx, y, bw, bh, 32); }
        else fill(ctx, C.blue, bx, y, bw, bh, 32);
        const fg = first ? C.ink : '#ffffff';
        font(ctx, story ? 30 : 24, 600); txt(ctx, s.label, bx + 36, y + (story ? 64 : 50), fg, 'left', bw - 72);
        const px = sizeToFit(ctx, s.value, bw - 72, story ? (n === 1 ? 170 : 140) : (n === 1 ? 110 : 96), 700, DISPLAY);
        font(ctx, px, 700, DISPLAY); txt(ctx, s.value, bx + 36, y + bh - (story ? 48 : 30), fg);
        if (s.note) { font(ctx, story ? 26 : 22, 600); txt(ctx, s.note, bx + bw - 32, y + (story ? 64 : 50), first ? 'rgba(26,20,5,0.7)' : 'rgba(255,255,255,0.8)', 'right'); }
      });
      y += bh + 30;
    } else {
      font(ctx, story ? 110 : 80, 700, DISPLAY); txt(ctx, headline(d), W / 2, y + (story ? 100 : 70), C.text, 'center');
      y += story ? 150 : 110;
    }

    const stubH = story ? 300 : 186, area = H - stubH - y - 30;
    if (d.rows.length) {
      const cols = story ? 2 : 3, gap = 20, tw = (W - 2 * P - gap * (cols - 1)) / cols;
      const maxRowsOfTiles = Math.max(1, Math.floor((area + gap) / ((story ? 220 : 170) + gap)));
      const cap = maxRowsOfTiles * cols;
      let list = d.rows;
      if (list.length > cap) list = list.slice(0, cap - 1).concat([{ more: d.rows.length - cap + 1 }]);
      lastShown = list.length - (list.length < d.rows.length || list[list.length - 1].more ? 1 : 0);
      const rowsOfTiles = Math.ceil(list.length / cols);
      const th = Math.min(story ? 300 : 230, (area - gap * (rowsOfTiles - 1)) / rowsOfTiles);
      list.forEach((r, i) => {
        const tx = P + (i % cols) * (tw + gap), ty = y + Math.floor(i / cols) * (th + gap);
        fill(ctx, 'rgba(255,255,255,0.05)', tx, ty, tw, th, 26);
        ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 2; rr(ctx, tx, ty, tw, th, 26); ctx.stroke();
        if (r.more) { font(ctx, story ? 40 : 32, 600, DISPLAY); txt(ctx, `+${r.more} more`, tx + tw / 2, ty + th / 2 + 12, C.text2, 'center'); return; }
        const k = th / (story ? 260 : 210);
        const tk = story ? 1.25 : 1;
        font(ctx, 24 * k * tk + 2, 600, DISPLAY); txt(ctx, r.code, tx + 26, ty + 46 * k, C.gold, 'left', tw - 52);
        font(ctx, 22 * k * tk + 3, 500); txt(ctx, r.title, tx + 26, ty + (story ? 90 : 82) * k, C.text2, 'left', tw - 52);
        if (r.grade) { font(ctx, 110 * k, 700, DISPLAY); txt(ctx, r.grade, tx + 24, ty + th - 26 * k, GRADE[r.grade]); }
        const m = markText(r);
        if (m) { font(ctx, 40 * k + 6, 600, DISPLAY); txt(ctx, m, tx + tw - 26, ty + th - 32 * k, C.text, 'right'); }
      });
    }

    // ticket stub
    const sy = H - stubH;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 3; ctx.setLineDash([14, 12]);
    ctx.beginPath(); ctx.moveTo(P, sy); ctx.lineTo(W - P, sy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.bg; [0, W].forEach(x => { ctx.beginPath(); ctx.arc(x, sy, 26, 0, Math.PI * 2); ctx.fill(); });
    const s = story ? 190 : 124, qy = sy + (stubH - s) / 2;
    qr(ctx, P, qy, s);
    font(ctx, story ? 44 : 34, 700, DISPLAY); txt(ctx, 'Can you beat this?', P + s + 36, qy + s / 2 - 6, C.text);
    font(ctx, story ? 30 : 24, 600); txt(ctx, SITE, P + s + 36, qy + s / 2 + (story ? 44 : 34), C.gold);
  }

  // ---------- design 4: Split (gold block on top, black list below, blue footer) ----------
  function splitDesign(ctx, W, H, d, story) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const P = 72, topH = d.stats.length ? (story ? 760 : 420) : (story ? 430 : 300);
    const g = ctx.createLinearGradient(0, 0, W, topH); g.addColorStop(0, C.gold2); g.addColorStop(1, C.gold);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, topH - 90); ctx.lineTo(0, topH); ctx.closePath(); ctx.fill();
    // wordmark in dark ink on gold
    font(ctx, story ? 52 : 42, 700, DISPLAY); txt(ctx, 'VIT', P, story ? 140 : 104, C.ink);
    const w1 = ctx.measureText('VIT').width; font(ctx, story ? 52 : 42, 500, DISPLAY); txt(ctx, 'cgpa', P + w1 + 2, story ? 140 : 104, C.ink);
    fill(ctx, C.blue, P + w1 + 6, (story ? 140 : 104) + 8, ctx.measureText('cgpa').width - 6, 4, 2);
    font(ctx, story ? 30 : 24, 600); txt(ctx, d.sem, W - P, story ? 136 : 100, 'rgba(26,20,5,0.75)', 'right');

    if (d.stats.length) {
      const hero = d.stats[0];
      font(ctx, story ? 36 : 28, 600); txt(ctx, hero.label, P, story ? 280 : 186, 'rgba(26,20,5,0.75)');
      const second = d.stats[1];
      const heroW = W - 2 * P - (second ? (story ? 380 : 330) + 40 : 0);
      font(ctx, sizeToFit(ctx, hero.value, heroW, story ? 300 : 180, 700, DISPLAY), 700, DISPLAY); txt(ctx, hero.value, P - 8, story ? 540 : 340, C.ink);
      if (second) {
        const bw = story ? 380 : 330, bh = story ? 170 : 140, bx = W - P - bw, by = story ? 380 : 210;
        fill(ctx, C.bg, bx, by, bw, bh, 30);
        font(ctx, story ? 28 : 24, 500); txt(ctx, second.label, bx + 32, by + (story ? 54 : 46), C.text2, 'left', bw - 64);
        font(ctx, story ? 88 : 72, 700, DISPLAY); txt(ctx, second.value, bx + 32, by + bh - (story ? 30 : 24), C.blue2);
        if (second.note) { font(ctx, story ? 24 : 20, 600); txt(ctx, second.note, bx + bw - 28, by + bh - (story ? 36 : 28), C.text2, 'right'); }
      }
    } else {
      font(ctx, story ? 130 : 100, 700, DISPLAY); txt(ctx, headline(d), P, story ? 320 : 230, C.ink);
    }

    const footH = story ? 300 : 190, y = topH + (story ? 20 : 0);
    if (d.rows.length) {
      const f = fitRows(d.rows, H - footH - y - 30, story ? 104 : 82, story ? 140 : 104);
      f.list.forEach((r, i) => subjectRow(ctx, r, P, y + i * f.rowH, W - 2 * P, f.rowH, { solid: true }));
    }
    // blue footer band
    fill(ctx, C.blue, 0, H - footH, W, footH, 0);
    const s = story ? 200 : 130, qy = H - footH + (footH - s) / 2;
    qr(ctx, W - P - s, qy, s, { bg: '#ffffff' });
    font(ctx, story ? 48 : 36, 700, DISPLAY); txt(ctx, 'Can you beat this?', P, qy + s / 2 - 4, '#ffffff');
    font(ctx, story ? 32 : 26, 600); txt(ctx, SITE, P, qy + s / 2 + (story ? 46 : 36), 'rgba(255,255,255,0.85)');
  }

  const DESIGNS = {
    glow: { name: 'Glow', draw: glowDesign },
    editorial: { name: 'Editorial', draw: editorialDesign },
    tiles: { name: 'Tiles', draw: tilesDesign },
    split: { name: 'Split', draw: splitDesign }
  };

  function draw(canvas, data, opts) {
    const [W, H] = SIZES[opts.size] || SIZES.story;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    lastShown = data.rows.length;
    (DESIGNS[opts.design] || DESIGNS.glow).draw(ctx, W, H, data, opts.size !== 'square');
    return { shown: lastShown, total: data.rows.length };
  }

  // fonts must be loaded before drawing or the canvas falls back to system fonts
  function ready() {
    if (!root.document || !document.fonts) return Promise.resolve();
    return Promise.all(['700 100px "Bricolage Grotesque"', '600 100px "Bricolage Grotesque"', '500 100px "Bricolage Grotesque"', '400 40px "Inter"', '500 40px "Inter"', '600 40px "Inter"']
      .map(f => document.fonts.load(f).catch(() => null))).then(() => null);
  }

  root.VCCard = { draw, ready, DESIGNS, SIZES, SITE, URL };
})(this);
