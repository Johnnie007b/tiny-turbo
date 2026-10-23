/* Tiny Turbo - in-race HUD drawn on the canvas with the pixel font. */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});
  const G = TT.gfx;
  const banners = [];
  const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function fmt(t) { if (!(t >= 0)) t = 0; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }
  function fmt2(t) { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
  function banner(text, sub, color, dur) { banners.length = 0; banners.push({ text, sub, color: color || '#ffd23f', t0: performance.now(), dur: dur || 1400 }); }
  function clear() { banners.length = 0; }

  function draw(r, s) {
    const ctx = r.ctx, dpr = r.dpr, W = r.cv.width, H = r.cv.height; const cssH = r.H;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    const vh = Math.min(cssH, r.W * 0.85); const k0 = vh < 420 ? 1.5 : vh < 700 ? 2 : 2.5;
    const ts = (k) => Math.max(1, Math.round(dpr * k0 * k));
    const pad = Math.round(10 * dpr) + (s.safe || 0);
    const T = s.T; const my = s.me;
    const sm = ts(1), md = ts(1.6), bg = ts(3), hg = ts(5);
    const txt = (str, x, y, sc, col, al, out) => G.drawText(ctx, str, Math.round(x), Math.round(y), sc, col, al || 'left', out || '#10121f');
    // ---- top-left: place + lap + time
    if (!s.spectator) {
      let y = pad;
      if (s.mode === 'race' || s.myPlace) {
        const p = s.myPlace || 1; txt(ORD[p - 1] || p + 'TH', pad, y, bg, p === 1 ? '#ffd23f' : '#fff'); const w = G.textWidth(ORD[p - 1] || p + 'TH', bg); txt('/' + s.total, pad + w + sm * 2, y + bg * 3, md, '#c8cde8'); y += bg * 8 + sm * 2;
      }
      if (s.mode === 'race') { txt('LAP ' + clamp(s.lap, 1, s.laps) + '/' + s.laps, pad, y, md, '#fff'); y += md * 8; }
      else { txt('ROUND ' + s.round, pad, y, md, '#fff'); y += md * 8; }
      txt(fmt(s.raceT), pad, y, md, '#c8f2ff'); y += md * 8;
      if (s.mode === 'race' && s.lastLap > 0) { txt('LAST ' + fmt2(s.lastLap), pad, y, sm, '#9fb0ff'); y += sm * 8; }
      if (s.best > 0) { txt('BEST ' + fmt2(s.best), pad, y, sm, '#9fe8a8'); y += sm * 8; }
      s._yEnd = y;
    } else { txt('SPECTATING', pad, pad, md, '#ffd23f'); txt('YOU JOIN NEXT RACE', pad, pad + md * 8, sm, '#fff'); s._yEnd = pad + md * 8 + sm * 9; }
    // standings (tall screens, race)
    if (!s.touch || cssH > 560) {
      if (s.mode === 'race' && cssH >= 480 && s.order) {
        let y = (s._yEnd || pad) + sm * 4; const rows = Math.min(8, s.order.length);
        for (let i = 0; i < rows; i++) {
          const c = s.order[i]; const isMe = my && c.id === my.id;
          ctx.globalAlpha = isMe ? 1 : 0.8; ctx.fillStyle = G.CAR_COLORS[c.color % 12].c; ctx.fillRect(pad, y, sm * 4, sm * 6); ctx.globalAlpha = 1;
          txt((i + 1) + ' ' + (c.name || '').toUpperCase().slice(0, 10), pad + sm * 6, y, sm, isMe ? '#ffd23f' : '#fff'); y += sm * 8;
        }
      }
    }
    // ---- top-right: minimap (below the DOM buttons)
    if (T && r.baked && r.baked.mm && s.cars) {
      const mm = r.baked.mm; const mw = Math.round(Math.min(cssH < 420 ? 128 : 190, r.W * 0.24) * dpr), mh = Math.round(mw * mm.H / mm.W);
      const mx = W - pad - mw, my0 = pad + Math.round((cssH < 420 ? 44 : 52) * dpr);
      ctx.globalAlpha = 0.85; ctx.fillStyle = 'rgba(10,12,28,.55)'; ctx.fillRect(mx - 3, my0 - 3, mw + 6, mh + 6); ctx.globalAlpha = 0.9; ctx.drawImage(mm.cv, mx, my0, mw, mh); ctx.globalAlpha = 1;
      const kx = mw / mm.W;
      for (const c of s.cars) {
        if (c.tF > 0.5) continue;
        const px = mx + (c.x * mm.sc + mm.ox) * kx, py = my0 + (c.y * mm.sc + mm.oy) * kx; const isMe = my && c.id === my.id; const rr = Math.round((isMe ? 4.2 : 3) * dpr);
        ctx.fillStyle = '#000'; ctx.fillRect(px - rr - 1, py - rr - 1, rr * 2 + 2, rr * 2 + 2); ctx.fillStyle = G.CAR_COLORS[c.color % 12].c; ctx.fillRect(px - rr, py - rr, rr * 2, rr * 2);
        if (isMe) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, dpr); ctx.strokeRect(px - rr - 1, py - rr - 1, rr * 2 + 2, rr * 2 + 2); }
      }
    }
    // ---- duel scoreboard (top center)
    if (s.mode === 'duel' && s.cars) {
      const list = s.cars.slice().sort((a, b) => a.id - b.id); const cw = sm * 11; const total = list.length * cw; let x = W / 2 - total / 2; const y = pad;
      for (const c of list) {
        ctx.globalAlpha = c.out ? 0.35 : 1; ctx.fillStyle = 'rgba(10,12,28,.6)'; ctx.fillRect(x, y, cw - sm, sm * 20);
        ctx.fillStyle = G.CAR_COLORS[c.color % 12].c; ctx.fillRect(x + sm, y + sm, cw - sm * 3, sm * 6);
        for (let i = 0; i < s.target; i++) { ctx.fillStyle = i < c.pts ? '#ffd23f' : 'rgba(255,255,255,.2)'; ctx.fillRect(x + sm * 1.5 + (i % 3) * sm * 3, y + sm * 9 + Math.floor(i / 3) * sm * 4, sm * 2, sm * 2.6); }
        if (my && c.id === my.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, dpr); ctx.strokeRect(x, y, cw - sm, sm * 20); }
        ctx.globalAlpha = 1; x += cw;
      }
    }
    // ---- item slot (top center)
    if (s.items && my && !my.out && s.phase !== 0) {
      const sz = sm * 17, cx0 = W / 2, y0 = pad + (s.mode === 'duel' ? sm * 22 : 0);
      ctx.fillStyle = 'rgba(10,12,28,.62)'; ctx.fillRect(cx0 - sz / 2, y0, sz, sz); ctx.lineWidth = Math.max(1, dpr * 2);
      const it = my.item | 0; const t = performance.now();
      ctx.strokeStyle = it ? (Math.floor(t / 180) % 2 ? '#fff' : '#ffd23f') : 'rgba(255,255,255,.3)'; ctx.strokeRect(cx0 - sz / 2, y0, sz, sz);
      if (it) { const bob = Math.sin(t / 160) * sz * 0.03; G.itemIcon(ctx, it, cx0, y0 + sz / 2 + bob, sz * 0.38); if (!s.touch) txt('E', cx0 + sz / 2 - sm * 2, y0 + sz - sm * 7, sm, '#ffd23f', 'right'); }
      else txt('?', cx0, y0 + sz * 0.5 - sm * 3.5, sm, 'rgba(255,255,255,.35)', 'center');
    }
    // ---- countdown
    const cx = W / 2;
    if (s.phase === 1) {
      const n = Math.ceil(s.cd - 0.6);
      const lw = hg * 5.5; const ly = Math.round(H * 0.16);
      ctx.fillStyle = 'rgba(10,12,28,.75)'; ctx.fillRect(cx - lw * 1.6, ly - lw * 0.6, lw * 3.2, lw * 1.2);
      for (let i = 0; i < 3; i++) { const lit = (3 - i) >= n && n >= 1 ? true : false; ctx.fillStyle = lit ? (n === 1 ? '#ffd23f' : '#ff3b30') : '#3a2430'; ctx.beginPath(); ctx.arc(cx + (i - 1) * lw, ly, lw * 0.36, 0, 7); ctx.fill(); }
      if (n >= 1) txt(String(n), cx, ly + lw * 0.8, Math.max(2, Math.round(hg * 0.8)), '#fff', 'center', '#10121f');
      else txt('GET READY', cx, ly + lw * 0.9, bg, '#fff', 'center');
    }
    // ---- duel warning
    if (s.mode === 'duel' && my && my.outT > 0 && !my.out) {
      const f = clamp(my.outT / 0.55, 0, 1); const bw = sm * 70, bh = sm * 5, bx = cx - bw / 2, by = H - pad - bh - sm * 16 - (s.touch ? Math.round(110 * dpr) : 0);
      const flash = Math.floor(performance.now() / 120) % 2;
      txt('KEEP UP!', cx, by - md * 9, md, flash ? '#ff5a4a' : '#ffd23f', 'center');
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4); ctx.fillStyle = f > 0.6 ? '#ff3b30' : '#ffb21a'; ctx.fillRect(bx, by, bw * f, bh);
    }
    // ---- speed + drift charge meter (bottom centre)
    if (my && s.phase === 2 && !my.out && !my.fin) {
      const P = (TT.sim && TT.sim.P) || {}; const t1 = P.DRIFT_T1 || 0.6, t2 = P.DRIFT_T2 || 1.3, t3 = P.DRIFT_T3 || 2.1, tm = P.DRIFT_MAX || 2.25;
      const bw = sm * 56, bh = sm * 3.4, bx = Math.round(cx - bw / 2), by = Math.round(H - pad - bh - (s.touch ? sm * 2 : 0));
      const sp = clamp((s.speed || 0) / 430, 0, 1);
      ctx.fillStyle = 'rgba(10,12,28,.7)'; ctx.fillRect(bx - sm, by - sm, bw + sm * 2, bh + sm * 2);
      const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#5df58a'); gr.addColorStop(0.65, '#ffd23f'); gr.addColorStop(1, '#ff5a4a'); ctx.fillStyle = gr; ctx.fillRect(bx, by, bw * sp, bh);
      if (my.tB > 0) { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(performance.now() / 50); ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, bw * sp, bh * 0.4); ctx.globalAlpha = 1; }
      const dc = my.dc || 0;
      if (dc > 0.04) {
        const dy = by - sm * 6; const tier = dc >= t3 ? 3 : dc >= t2 ? 2 : dc >= t1 ? 1 : 0;
        const col = ['#8e96b8', '#4db8ff', '#ff9a2a', '#d27bff'][tier];
        ctx.fillStyle = 'rgba(10,12,28,.7)'; ctx.fillRect(bx - sm, dy - sm, bw + sm * 2, bh + sm * 2);
        ctx.fillStyle = col; ctx.fillRect(bx, dy, bw * clamp(dc / tm, 0, 1), bh);
        if (tier === 3 && Math.floor(performance.now() / 90) % 2) { ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.5; ctx.fillRect(bx, dy, bw * clamp(dc / tm, 0, 1), bh * 0.45); ctx.globalAlpha = 1; }
        ctx.fillStyle = 'rgba(255,255,255,.85)'; for (const tt of [t1, t2, t3]) ctx.fillRect(bx + Math.round(bw * tt / tm), dy - sm * 0.5, Math.max(1, Math.round(sm * 0.6)), bh + sm);
        txt(tier ? ['', 'DRIFT', 'DRIFT+', 'MAX DRIFT!'][tier] : 'DRIFT', cx, dy - sm * 8, sm, col, 'center');
      }
    }
    // ---- banners
    const now = performance.now();
    for (let i = banners.length - 1; i >= 0; i--) {
      const b = banners[i]; const u = (now - b.t0) / b.dur; if (u > 1) { banners.splice(i, 1); continue; }
      const pop = u < 0.12 ? 0.6 + u / 0.12 * 0.4 : 1; const a = u > 0.8 ? (1 - u) / 0.2 : 1; ctx.globalAlpha = a;
      let sc = Math.max(2, Math.round(bg * (cssH < 420 ? 1.5 : 1.6) * pop)); const y = Math.round(H * 0.3); while (sc > 2 && G.textWidth(b.text, sc) > W * 0.92) sc--;
      txt(b.text, cx, y, sc, b.color, 'center', '#10121f'); if (b.sub) txt(b.sub, cx, y + sc * 9, Math.max(2, Math.round(md * 1.1)), '#fff', 'center');
      ctx.globalAlpha = 1;
    }
    // ---- status
    if (s.online) { const label = s.rtt > 0 ? Math.round(s.rtt) + 'MS' : '...'; txt(label, W - pad, H - pad - sm * 7, sm, s.rtt > 160 ? '#ff7a6a' : s.rtt > 90 ? '#ffd23f' : '#8cf0a0', 'right'); }
    if (s.fps) txt(s.fps + 'FPS', W - pad, H - pad - sm * 16, sm, '#fff', 'right');
  }
  TT.hud = { draw, banner, clear, fmt, fmt2, ORD };
})(window);
