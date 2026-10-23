/* Tiny Turbo - world renderer: baked themed track bitmap + dynamic cars, skid marks, particles, minimap. */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});
  const G = TT.gfx;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TAU = Math.PI * 2;
  const CS = (TT.sim && TT.sim.P && TT.sim.P.CAR_SCALE) || 1; // cars are drawn at this scale (matches collision size)

  /* ---------------------------------------------------------------- pattern tiles */
  function tile(size, fn) { const c = G.mk(size, size); const x = c.getContext('2d'); fn(x, size); return c; }
  function noiseDots(x, size, n, colors, rmin, rmax, R) {
    for (let i = 0; i < n; i++) { x.fillStyle = colors[(R() * colors.length) | 0]; const r = rmin + R() * (rmax - rmin); x.beginPath(); x.arc(R() * size, R() * size, r, 0, TAU); x.fill(); }
  }
  const TILES = {
    gingham: () => tile(96, (x, s) => {
      x.fillStyle = '#fbf6ee'; x.fillRect(0, 0, s, s);
      x.fillStyle = 'rgba(220,60,50,.62)'; x.fillRect(0, 0, s, s / 2); x.fillStyle = 'rgba(220,60,50,.62)'; x.fillRect(0, 0, s / 2, s);
      const R = G.rng(5); x.fillStyle = 'rgba(120,30,20,.05)'; for (let i = 0; i < 160; i++) x.fillRect(R() * s, R() * s, 1.5, 1.5);
    }),
    lino: () => tile(192, (x, s) => {
      x.fillStyle = '#5a4838'; x.fillRect(0, 0, s, s); x.fillStyle = '#4a3b2e'; x.fillRect(0, 0, s / 2, s / 2); x.fillRect(s / 2, s / 2, s / 2, s / 2);
      x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 2; x.strokeRect(0, 0, s / 2, s / 2); x.strokeRect(s / 2, 0, s / 2, s / 2); x.strokeRect(0, s / 2, s / 2, s / 2); x.strokeRect(s / 2, s / 2, s / 2, s / 2);
      noiseDots(x, s, 60, ['rgba(255,255,255,.04)', 'rgba(0,0,0,.06)'], 1, 3, G.rng(3));
    }),
    planks: () => tile(256, (x, s) => {
      const R = G.rng(11); const cols = ['#b88a56', '#c4965f', '#ad7f4c', '#bf9059'];
      for (let i = 0; i < 4; i++) {
        const y0 = i * 64; x.fillStyle = cols[i]; x.fillRect(0, y0, s, 64);
        for (let k = 0; k < 14; k++) { x.strokeStyle = `rgba(90,55,25,${0.06 + R() * 0.1})`; x.lineWidth = 0.8 + R() * 1.2; const yy = y0 + 4 + R() * 56; x.beginPath(); x.moveTo(0, yy); x.bezierCurveTo(s * 0.3, yy + (R() - 0.5) * 6, s * 0.6, yy + (R() - 0.5) * 6, s, yy + (R() - 0.5) * 4); x.stroke(); }
        x.fillStyle = 'rgba(60,35,15,.55)'; x.fillRect(0, y0, s, 2); x.fillStyle = 'rgba(255,230,190,.2)'; x.fillRect(0, y0 + 2, s, 1.5);
        const kx = R() * s, ky = y0 + 14 + R() * 36; x.strokeStyle = 'rgba(80,45,20,.4)'; x.lineWidth = 1.2; for (let q = 1; q < 4; q++) { x.beginPath(); x.ellipse(kx, ky, q * 3.5, q * 2, 0, 0, TAU); x.stroke(); }
        x.fillStyle = 'rgba(60,35,15,.5)'; x.fillRect((i * 97) % s, y0, 2, 64);
      }
    }),
    plate: () => tile(48, (x, s) => {
      x.fillStyle = '#3a3e46'; x.fillRect(0, 0, s, s);
      x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = 3; x.lineCap = 'round';
      x.beginPath(); x.moveTo(6, 10); x.lineTo(16, 2); x.moveTo(30, 36); x.lineTo(40, 28); x.moveTo(30, 12); x.lineTo(40, 20); x.moveTo(6, 34); x.lineTo(16, 42); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,.2)'; x.lineWidth = 2; x.beginPath(); x.moveTo(8, 12); x.lineTo(18, 4); x.moveTo(32, 38); x.lineTo(42, 30); x.stroke();
    }),
    grass: () => tile(160, (x, s) => {
      x.fillStyle = '#4d9a3a'; x.fillRect(0, 0, s, s); const R = G.rng(21);
      for (let i = 0; i < 380; i++) { x.strokeStyle = ['#5eb04a', '#3f8530', '#6cbf55', '#46913a'][(R() * 4) | 0]; x.lineWidth = 1.2; const px = R() * s, py = R() * s; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (R() - 0.5) * 5, py - 4 - R() * 6); x.stroke(); }
      noiseDots(x, s, 14, ['rgba(255,255,255,.55)', 'rgba(255,224,80,.6)'], 1.2, 2.2, R);
    }),
    sand: (base, spec) => tile(128, (x, s) => {
      x.fillStyle = base; x.fillRect(0, 0, s, s); const R = G.rng(33);
      noiseDots(x, s, 420, spec, 0.6, 1.5, R);
      x.strokeStyle = 'rgba(120,90,40,.1)'; x.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const y = R() * s; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(s * 0.3, y + 6, s * 0.7, y - 6, s, y + 2); x.stroke(); }
    }),
    bathfloor: () => tile(160, (x, s) => {
      x.fillStyle = '#d4e6ef'; x.fillRect(0, 0, s, s); x.fillStyle = '#c3dae7'; x.fillRect(0, 0, s / 2, s / 2); x.fillRect(s / 2, s / 2, s / 2, s / 2);
      x.strokeStyle = '#8fb0c3'; x.lineWidth = 3; x.strokeRect(0, 0, s / 2, s / 2); x.strokeRect(s / 2, 0, s / 2, s / 2); x.strokeRect(0, s / 2, s / 2, s / 2); x.strokeRect(s / 2, s / 2, s / 2, s / 2);
      x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(5, 5, s / 2 - 12, 4); x.fillRect(s / 2 + 5, s / 2 + 5, s / 2 - 12, 4);
    }),
    tubwater: () => tile(160, (x, s) => {
      x.fillStyle = '#b4e2f5'; x.fillRect(0, 0, s, s); /* flat: a gradient here made visible tile seams */
      const R = G.rng(44); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2;
      for (let i = 0; i < 9; i++) { const y = (i + 0.5) * s / 9; x.beginPath(); for (let px = 0; px <= s; px += 8) { const yy = y + Math.sin(px / s * TAU * 2 + i) * 4; px === 0 ? x.moveTo(px, yy) : x.lineTo(px, yy); } x.stroke(); }
      for (let i = 0; i < 9; i++) { const px = R() * s, py = R() * s, r = 3 + R() * 7; x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.2; x.beginPath(); x.arc(px, py, r, 0, TAU); x.stroke(); x.fillStyle = 'rgba(255,255,255,.25)'; x.fill(); x.fillStyle = 'rgba(255,255,255,.8)'; x.beginPath(); x.arc(px - r * 0.3, py - r * 0.3, r * 0.22, 0, TAU); x.fill(); }
    })
  };

  /* ---------------------------------------------------------------- track baking */
  function closedPath(T, d, step) {
    const p = new Path2D(); const n = T.n; step = step || 1;
    for (let i = 0; i < n; i += step) { const x = T.px[i] + T.nx[i] * d, y = T.py[i] + T.ny[i] * d; if (i === 0) p.moveTo(x, y); else p.lineTo(x, y); }
    p.closePath(); return p;
  }
  function strokeW(x, path, w, style, cap) { x.lineWidth = w; x.strokeStyle = style; x.lineJoin = 'round'; x.lineCap = cap || 'round'; x.stroke(path); }
  function pat(x, cv) { return x.createPattern(cv, 'repeat'); }

  const THEMES = {
    breakfast(x, T, B) {
      x.fillStyle = pat(x, TILES.lino()); x.fillRect(B.x0, B.y0, B.w, B.h);
      const road = closedPath(T, 0, 1);
      x.save(); x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 28 * B.res; x.shadowOffsetX = 14 * B.res; x.shadowOffsetY = 20 * B.res; strokeW(x, road, 2 * (T.hw + 11), '#6d4426'); x.restore();
      strokeW(x, road, 2 * (T.hw + 11), '#6d4426'); strokeW(x, road, 2 * (T.hw + 7), '#a8703f'); strokeW(x, road, 2 * (T.hw + 3.5), '#c58b52');
      strokeW(x, road, 2 * T.hw, pat(x, TILES.gingham()));
      x.setLineDash([26, 30]); strokeW(x, road, 4, 'rgba(255,255,255,.4)', 'butt'); x.setLineDash([]);
      // crumbs & cereal bits
      const R = G.rng(77); for (let i = 0; i < 260; i++) { const s = R() * T.L, d = (R() * 2 - 1) * (T.hw - 6), p = T.pos(s, d); x.fillStyle = ['#c98a3e', '#e3b25f', '#8c5a26', '#f0d9a0'][(R() * 4) | 0]; x.beginPath(); x.arc(p.x, p.y, 1.2 + R() * 2.2, 0, TAU); x.fill(); }
      for (let i = 0; i < 18; i++) { const s = R() * T.L, d = (R() * 2 - 1) * (T.hw - 14), p = T.pos(s, d); x.strokeStyle = '#d99a3d'; x.lineWidth = 2.4; x.beginPath(); x.arc(p.x, p.y, 4, 0, TAU); x.stroke(); }
    },
    workbench(x, T, B) {
      x.fillStyle = pat(x, TILES.planks()); x.fillRect(B.x0, B.y0, B.w, B.h);
      const road = closedPath(T, 0, 1);
      x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 20 * B.res; x.shadowOffsetX = 8 * B.res; x.shadowOffsetY = 12 * B.res; strokeW(x, road, 2 * (T.hw + 20), '#22262c'); x.restore();
      strokeW(x, road, 2 * (T.hw + 20), '#2a2e35'); strokeW(x, road, 2 * (T.hw + 16), '#8793a0'); strokeW(x, road, 2 * (T.hw + 11), '#c1cad4'); strokeW(x, road, 2 * (T.hw + 7), '#555e69');
      strokeW(x, road, 2 * T.hw, pat(x, TILES.plate()));
      x.setLineDash([30, 26]); strokeW(x, road, 4, 'rgba(255,205,40,.55)', 'butt'); x.setLineDash([]);
      // screws on the rim
      const R = G.rng(5); for (let i = 0; i < T.n; i += 9) { for (const sg of [-1, 1]) { const d = sg * (T.hw + 13.5), px = T.px[i] + T.nx[i] * d, py = T.py[i] + T.ny[i] * d; x.fillStyle = '#6b7581'; x.beginPath(); x.arc(px, py, 2.2, 0, TAU); x.fill(); x.strokeStyle = '#2a2e35'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(px - 1.5, py - 1.5 + R()); x.lineTo(px + 1.5, py + 1.5); x.stroke(); } }
      for (let i = 0; i < 14; i++) { const s = R() * T.L, d = (R() * 2 - 1) * (T.hw - 20), p = T.pos(s, d); x.fillStyle = 'rgba(10,10,12,.35)'; G.blob(x, p.x, p.y, 8 + R() * 10, i * 3, 0.3, 9); x.fill(); }
    },
    sandbox(x, T, B) {
      x.fillStyle = pat(x, TILES.grass()); x.fillRect(B.x0, B.y0, B.w, B.h);
      const road = closedPath(T, 0, 1);
      x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 20 * B.res; x.shadowOffsetX = 8 * B.res; x.shadowOffsetY = 12 * B.res; strokeW(x, road, 2 * (T.limit + 20), '#5b3a1c'); x.restore();
      strokeW(x, road, 2 * (T.limit + 20), '#5b3a1c'); strokeW(x, road, 2 * (T.limit + 15), '#9a6a35'); strokeW(x, road, 2 * (T.limit + 9), '#b98748');
      strokeW(x, road, 2 * T.limit, pat(x, TILES.sand('#ead49b', ['rgba(255,255,255,.35)', 'rgba(160,120,50,.28)', 'rgba(255,235,170,.4)'])));
      strokeW(x, road, 2 * (T.hw + 8), 'rgba(190,150,80,.28)');
      strokeW(x, road, 2 * T.hw, pat(x, TILES.sand('#cfae6a', ['rgba(255,235,170,.25)', 'rgba(120,85,30,.3)', 'rgba(90,60,20,.18)'])));
      for (const d of [-26, 26]) { const tr = closedPath(T, d, 1); x.setLineDash([60, 20]); strokeW(x, tr, 6, 'rgba(110,75,25,.2)', 'butt'); x.setLineDash([]); }
      const R = G.rng(9); for (let i = 0; i < 70; i++) { const s = R() * T.L, d = (R() < 0.5 ? -1 : 1) * (T.hw + 6 + R() * (T.limit - T.hw - 12)), p = T.pos(s, d); x.fillStyle = ['#b8a070', '#d9c28a', '#a89060'][(R() * 3) | 0]; x.beginPath(); x.arc(p.x, p.y, 2 + R() * 3, 0, TAU); x.fill(); }
    },
    bathtub(x, T, B) {
      x.fillStyle = pat(x, TILES.bathfloor()); x.fillRect(B.x0, B.y0, B.w, B.h);
      const road = closedPath(T, 0, 1);
      x.save(); x.shadowColor = 'rgba(30,60,90,.5)'; x.shadowBlur = 26 * B.res; x.shadowOffsetX = 12 * B.res; x.shadowOffsetY = 18 * B.res; strokeW(x, road, 2 * (T.hw + 26), '#aebfca'); x.restore();
      strokeW(x, road, 2 * (T.hw + 26), '#a7bcc9'); strokeW(x, road, 2 * (T.hw + 21), '#f6fafc'); strokeW(x, road, 2 * (T.hw + 13), '#dce8ef'); strokeW(x, road, 2 * (T.hw + 6), '#a9c6d6');
      strokeW(x, road, 2 * T.hw, pat(x, TILES.tubwater()));
      x.setLineDash([24, 34]); strokeW(x, road, 4, 'rgba(255,255,255,.45)', 'butt'); x.setLineDash([]);
      const R = G.rng(61); for (let i = 0; i < 70; i++) { const s = R() * T.L, d = (R() < 0.5 ? -1 : 1) * (T.hw - 14 + R() * 12), p = T.pos(s, d), r = 3 + R() * 8; x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1.3; x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.arc(p.x, p.y, r, 0, TAU); x.fill(); x.stroke(); x.fillStyle = '#fff'; x.beginPath(); x.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.2, 0, TAU); x.fill(); }
    }
  };
  const VOID = { breakfast: '#2b211a', workbench: '#7a5a38', sandbox: '#356b29', bathtub: '#a9c5d4' };
  const DUST = { breakfast: ['#f4efe6', '#e8dcc4'], workbench: ['#b9b9c0', '#8c8c95'], sandbox: ['#e8d29a', '#d4b877'], bathtub: ['#ffffff', '#cfeaf8'] };
  const SKID = { breakfast: 'rgba(20,10,5,.33)', workbench: 'rgba(0,0,0,.4)', sandbox: 'rgba(90,60,20,.34)', bathtub: 'rgba(60,110,150,.32)' };

  function bake(T) {
    const b = T.bounds; const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const maxPx = TT.lowMem ? 3.0e6 : 5.2e6; const res = Math.min(1, Math.sqrt(maxPx / (bw * bh)));
    const cv = G.mk(Math.ceil(bw * res), Math.ceil(bh * res)); const x = cv.getContext('2d');
    x.setTransform(res, 0, 0, res, -b.x0 * res, -b.y0 * res);
    const B = { x0: b.x0, y0: b.y0, w: bw, h: bh, res };
    (THEMES[T.theme] || THEMES.sandbox)(x, T, B);
    if (TT.decor) { try { TT.decor.place(x, T, B, T.theme); } catch (e) { if (g.console) console.warn('decor', e); } }
    // direction chevrons
    x.save(); x.strokeStyle = 'rgba(255,255,255,.2)'; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
    for (let s = 260; s < T.L - 100; s += 430) { const p = T.at(s); x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.beginPath(); x.moveTo(-9, -16); x.lineTo(7, 0); x.lineTo(-9, 16); x.stroke(); x.restore(); }
    x.restore();
    // start/finish line
    { const cols = Math.round(T.hw * 2 / 9), cw = T.hw * 2 / cols; x.fillStyle = '#f4f4f4';
      for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) { x.fillStyle = (r + c) % 2 ? '#111' : '#f6f6f6'; const p0 = T.pos(r * 9 - 9, -T.hw + c * cw), p1 = T.pos(r * 9 - 9, -T.hw + (c + 1) * cw), p2 = T.pos(r * 9, -T.hw + (c + 1) * cw), p3 = T.pos(r * 9, -T.hw + c * cw); x.beginPath(); x.moveTo(p0.x, p0.y); x.lineTo(p1.x, p1.y); x.lineTo(p2.x, p2.y); x.lineTo(p3.x, p3.y); x.closePath(); x.fill(); } }
    // grid boxes
    x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = 2; for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) { const s = -(46 + row * 52), d = col ? 28 : -28; const p = T.pos(s, d); x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.strokeRect(-18, -12, 36, 24); x.restore(); }
    // gaps (pits)
    for (const gp of T.gaps) {
      const w = (T.edge === 'fall' ? T.hw + 12 : T.limit + 22); const L = gp.s1 - gp.s0;
      const quad = (sa, sb, da, db) => { const p0 = T.pos(sa, da), p1 = T.pos(sa, db), p2 = T.pos(sb, db), p3 = T.pos(sb, da); x.beginPath(); x.moveTo(p0.x, p0.y); x.lineTo(p1.x, p1.y); x.lineTo(p2.x, p2.y); x.lineTo(p3.x, p3.y); x.closePath(); };
      quad(gp.s0, gp.s1, -w, w); const pa = T.pos(gp.s0, 0), pb = T.pos(gp.s1, 0);
      const gr = x.createLinearGradient(pa.x, pa.y, pb.x, pb.y); gr.addColorStop(0, '#13131c'); gr.addColorStop(0.15, '#050509'); gr.addColorStop(0.85, '#050509'); gr.addColorStop(1, '#13131c'); x.fillStyle = gr; x.fill();
      // hazard-striped lips
      for (const [sa, sb] of [[gp.s0 - 9, gp.s0], [gp.s1, gp.s1 + 9]]) { const n = Math.round(w * 2 / 14); for (let k = 0; k < n; k++) { quad(sa, sb, -w + k * 2 * w / n, -w + (k + 1) * 2 * w / n); x.fillStyle = k % 2 ? '#1a1a1a' : '#f2c21a'; x.fill(); } }
      // deep shading to sell the drop
      x.fillStyle = 'rgba(255,255,255,.04)'; for (let k = 1; k < 5; k++) { quad(gp.s0 + L * k / 5 - 1, gp.s0 + L * k / 5 + 1, -w, w); x.fill(); }
    }
    // hazards then props
    for (const h of T.hazards) G.drawHazard(x, h);
    for (const o of T.obstacles) { const sp = G.propSprite(o.k, o.r, o.id); x.drawImage(sp.cv, o.x - sp.s / 2, o.y - sp.s / 2, sp.s, sp.s); }
    // minimap
    const mm = bakeMini(T);
    return { cv, res, b, mm };
  }
  function bakeMini(T) {
    const W = 200, H = 150, pad = 14; let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (let i = 0; i < T.n; i++) { minx = Math.min(minx, T.px[i]); maxx = Math.max(maxx, T.px[i]); miny = Math.min(miny, T.py[i]); maxy = Math.max(maxy, T.py[i]); }
    const sc = Math.min((W - pad * 2) / (maxx - minx), (H - pad * 2) / (maxy - miny));
    const ox = (W - (maxx - minx) * sc) / 2 - minx * sc, oy = (H - (maxy - miny) * sc) / 2 - miny * sc;
    const cv = G.mk(W, H); const x = cv.getContext('2d'); x.lineJoin = 'round'; x.lineCap = 'round';
    const path = new Path2D(); for (let i = 0; i < T.n; i += 2) { const px = T.px[i] * sc + ox, py = T.py[i] * sc + oy; if (i === 0) path.moveTo(px, py); else path.lineTo(px, py); } path.closePath();
    x.lineWidth = 11; x.strokeStyle = 'rgba(0,0,0,.75)'; x.stroke(path); x.lineWidth = 7; x.strokeStyle = 'rgba(210,225,240,.95)'; x.stroke(path);
    // start tick
    const sx = T.px[0] * sc + ox, sy = T.py[0] * sc + oy; x.fillStyle = '#fff'; x.fillRect(sx - 5, sy - 1.5, 10, 3);
    for (const gp of T.gaps) { const a = T.at(gp.s0), b2 = T.at(gp.s1); x.strokeStyle = '#111'; x.lineWidth = 7; x.beginPath(); x.moveTo(a.x * sc + ox, a.y * sc + oy); x.lineTo(b2.x * sc + ox, b2.y * sc + oy); x.stroke(); }
    return { cv, W, H, sc, ox, oy };
  }

  /* ---------------------------------------------------------------- Renderer */
  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.W = 800; this.H = 450; this.dpr = 1; this.q = 1;
      this.T = null; this.baked = null; this.decal = null; this.parts = []; this.maxParts = 260; this.prev = new Map(); this.airMax = new Map();
      this.shake = 0; this.cam = { x: 0, y: 0, sc: 1 }; this.theme = 'sandbox'; this.time = 0; this.lowFx = false;
    }
    resize(qual) {
      if (qual) this.q = qual;
      const r = this.cv.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.q;
      this.W = Math.max(2, r.width); this.H = Math.max(2, r.height); this.dpr = dpr;
      const w = Math.round(this.W * dpr), h = Math.round(this.H * dpr);
      if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    }
    setTrack(T) {
      if (this.T && this.T.id === T.id && this.baked) { this.T = T; this.clearDecals(); return; }
      this.T = T; this.theme = T.theme; this.baked = bake(T); this.makeDecal(); this.parts.length = 0; this.prev.clear();
    }
    makeDecal() {
      const b = this.baked; const dres = b.res * 0.5;
      this.decal = G.mk(Math.ceil((b.b.x1 - b.b.x0) * dres), Math.ceil((b.b.y1 - b.b.y0) * dres)); this.dres = dres;
      this.dctx = this.decal.getContext('2d'); this.dctx.lineCap = 'round';
    }
    clearDecals() { if (this.dctx) this.dctx.clearRect(0, 0, this.decal.width, this.decal.height); this.parts.length = 0; this.prev.clear(); this.airMax.clear(); }
    w2s(x, y) { const c = this.cam; return [this.W / 2 + (x - c.x) * c.sc, this.H / 2 + (y - c.y) * c.sc]; }
    burst(x, y, kind, n, ang, spread, col) {
      if (this.lowFx) n = Math.ceil(n / 2);
      const T = this.theme; const d = DUST[T] || DUST.sandbox;
      for (let i = 0; i < n; i++) {
        if (this.parts.length >= this.maxParts) this.parts.shift();
        const a = (ang == null ? Math.random() * TAU : ang + (Math.random() - 0.5) * (spread || 1)), sp = 30 + Math.random() * 110;
        let p;
        if (kind === 'spark') p = { x, y, vx: Math.cos(a) * sp * 1.6, vy: Math.sin(a) * sp * 1.6, life: 0.25 + Math.random() * 0.2, r0: 2, r1: 0.5, col: Math.random() < 0.5 ? '#ffe27a' : '#fff', sq: 1 };
        else if (kind === 'splash') p = { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.3, r0: 3, r1: 1, col: Math.random() < 0.5 ? '#bfe6ff' : '#6db9f5' };
        else if (kind === 'puff') p = { x, y, vx: Math.cos(a) * sp * 0.5, vy: Math.sin(a) * sp * 0.5, life: 0.5 + Math.random() * 0.35, r0: 3, r1: 11, col: d[(Math.random() * d.length) | 0], al: 0.55 };
        else if (kind === 'confetti') p = { x, y, vx: Math.cos(a) * sp * 2, vy: Math.sin(a) * sp * 2, life: 0.9 + Math.random() * 0.8, r0: 3, r1: 2.5, col: G.CAR_COLORS[(Math.random() * 12) | 0].c, sq: 1 };
        else if (kind === 'boom') p = { x, y, vx: Math.cos(a) * sp * 1.4, vy: Math.sin(a) * sp * 1.4, life: 0.45 + Math.random() * 0.3, r0: 5, r1: 1, col: ['#ffd23f', '#ff7a1a', '#ffffff'][(Math.random() * 3) | 0] };
        else p = { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4, r0: 2, r1: 0.5, col: '#fff' };
        if (col) p.col = col; p.r0 *= CS; p.r1 *= CS; p.max = p.life; p.al = p.al || 1; this.parts.push(p);
      }
    }
    updateParts(dt) {
      const ps = this.parts; let j = 0;
      for (let i = 0; i < ps.length; i++) { const p = ps[i]; p.life -= dt; if (p.life <= 0) continue; const dr = Math.exp(-3.2 * dt); p.vx *= dr; p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt; ps[j++] = p; }
      ps.length = j;
    }
    // per-car fx: skid marks, smoke, flame. cars: [{x,y,a,vx,vy,tA,tF,tB,tW,...}]
    carFx(cars, dt) {
      const T = this.T; const sk = this.dctx; const dres = this.dres, b = this.baked.b;
      for (const c of cars) {
        const cs = Math.cos(c.a), sn = Math.sin(c.a); const sp = Math.hypot(c.vx, c.vy);
        const lat = -c.vx * sn + c.vy * cs; const air = c.tA > 0 || c.tF > 0;
        let pv = this.prev.get(c.id); if (!pv) { pv = { has: false, lx: 0, ly: 0, rx: 0, ry: 0 }; this.prev.set(c.id, pv); }
        const bo = 9.6 * CS, so = 7.6 * CS; const lx = c.x - cs * bo + sn * so, ly = c.y - sn * bo - cs * so, rx = c.x - cs * bo - sn * so, ry = c.y - sn * bo + cs * so;
        const dc = c.dc || 0; const sliding = !air && sp > 60 && (Math.abs(lat) > 62 || dc > 0.2);
        const tcol = dc >= 2.1 ? '#d27bff' : dc >= 1.3 ? '#ff9a2a' : dc >= 0.6 ? '#4db8ff' : null;
        if (sliding && pv.has && sk) {
          sk.strokeStyle = SKID[this.theme] || SKID.sandbox; sk.lineWidth = 3.2 * CS * dres;
          sk.beginPath(); sk.moveTo((pv.lx - b.x0) * dres, (pv.ly - b.y0) * dres); sk.lineTo((lx - b.x0) * dres, (ly - b.y0) * dres); sk.moveTo((pv.rx - b.x0) * dres, (pv.ry - b.y0) * dres); sk.lineTo((rx - b.x0) * dres, (ry - b.y0) * dres); sk.stroke();
          if (Math.random() < 0.45) this.burst(lx, ly, 'puff', 1, c.a + Math.PI, 1.2);
          if (Math.random() < 0.45) this.burst(rx, ry, 'puff', 1, c.a + Math.PI, 1.2);
          if (tcol) { this.burst(lx, ly, 'spark', 1, c.a + Math.PI + 0.6, 1.2, tcol); this.burst(rx, ry, 'spark', 1, c.a + Math.PI - 0.6, 1.2, tcol); }
        }
        pv.has = sliding; pv.lx = lx; pv.ly = ly; pv.rx = rx; pv.ry = ry;
        if (!air && c.tB > 0) { const n = this.lowFx ? 1 : 2; for (let i = 0; i < n; i++) { this.parts.push({ x: c.x - cs * 16 * CS, y: c.y - sn * 16 * CS, vx: -cs * 170 + (Math.random() - 0.5) * 50 + c.vx * 0.3, vy: -sn * 170 + (Math.random() - 0.5) * 50 + c.vy * 0.3, life: 0.22, max: 0.22, r0: 4.5 * CS, r1: 0.8, col: Math.random() < 0.5 ? '#ffb21a' : '#fff1a0', al: 0.95 }); } if (this.parts.length > this.maxParts) this.parts.splice(0, this.parts.length - this.maxParts); }
        if (!air && c.tW > 0.2 && sp > 120 && Math.random() < 0.5) this.burst(c.x - cs * 8 * CS, c.y - sn * 8 * CS, 'splash', 1, c.a + Math.PI, 1.6);
        if (!air && T.edge === 'rough' && sp > 140 && Math.random() < 0.3) { const q = this.roughCheck && this.roughCheck(c); if (q) this.burst(lx, ly, 'puff', 1, c.a + Math.PI, 1); }
        // airMax tracking
        if (c.tA > 0) { const m = this.airMax.get(c.id) || 0; if (c.tA > m) this.airMax.set(c.id, c.tA); } else if (this.airMax.has(c.id)) this.airMax.delete(c.id);
      }
    }
    /* ------------------------------------------------ main draw */
    drawWorld(f) {
      const ctx = this.ctx, T = this.T, bk = this.baked; if (!T || !bk) return;
      const cam = this.cam, W = this.W, H = this.H, dpr = this.dpr, sc = cam.sc;
      let cx = cam.x, cy = cam.y;
      if (this.shake > 0.01) { cx += (Math.random() - 0.5) * this.shake * 10; cy += (Math.random() - 0.5) * this.shake * 10; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = VOID[T.theme] || '#222'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      const k = dpr * sc; ctx.setTransform(k, 0, 0, k, dpr * (W / 2 - cx * sc), dpr * (H / 2 - cy * sc));
      const vx0 = cx - W / 2 / sc, vy0 = cy - H / 2 / sc, vx1 = cx + W / 2 / sc, vy1 = cy + H / 2 / sc;
      // baked layer (clipped source rect)
      const b = bk.b; const ax0 = Math.max(vx0, b.x0), ay0 = Math.max(vy0, b.y0), ax1 = Math.min(vx1, b.x1), ay1 = Math.min(vy1, b.y1);
      if (ax1 > ax0 && ay1 > ay0) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(bk.cv, (ax0 - b.x0) * bk.res, (ay0 - b.y0) * bk.res, (ax1 - ax0) * bk.res, (ay1 - ay0) * bk.res, ax0, ay0, ax1 - ax0, ay1 - ay0);
        ctx.drawImage(this.decal, (ax0 - b.x0) * this.dres, (ay0 - b.y0) * this.dres, (ax1 - ax0) * this.dres, (ay1 - ay0) * this.dres, ax0, ay0, ax1 - ax0, ay1 - ay0);
      }
      // animated hazard shimmer
      const t = f.time / 1000;
      for (const h of T.hazards) {
        if (h.x < vx0 - 60 || h.x > vx1 + 60 || h.y < vy0 - 60 || h.y > vy1 + 60) continue;
        if (h.k === 'boost') { ctx.globalAlpha = 0.18 + 0.14 * Math.sin(t * 7 + h.id); ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 0.95, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        else if (h.k === 'water') { ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.4; for (let i = 0; i < 2; i++) { const u = (t * 0.6 + i * 0.5 + h.id * 0.13) % 1; ctx.globalAlpha = 1 - u; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * (0.2 + u * 0.7), h.r * (0.14 + u * 0.5), 0, 0, TAU); ctx.stroke(); } ctx.globalAlpha = 1; }
        else if (h.k === 'oil') { ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t * 2 + h.id); ctx.fillStyle = '#d9a3ff'; ctx.beginPath(); ctx.ellipse(h.x - h.r * 0.15, h.y - h.r * 0.2, h.r * 0.35, h.r * 0.1, -0.5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      }
      // duel leash
      if (f.duel && f.duel.leader) {
        const L = f.duel.leader, R = f.duel.R; const danger = f.duel.danger; ctx.save();
        ctx.setLineDash([14, 12]); ctx.lineDashOffset = -t * 20; ctx.lineWidth = 3; ctx.strokeStyle = danger ? `rgba(255,70,60,${0.45 + 0.35 * Math.sin(t * 12)})` : 'rgba(255,255,255,.28)';
        ctx.beginPath(); ctx.arc(L.x, L.y, R, 0, TAU); ctx.stroke(); ctx.restore();
      }
      // item boxes + oil slicks (ground layer)
      const IM = TT.items; const it = f.items;
      if (it && IM) {
        if (this._pkT !== T) { this._pk = IM.makePickups(T); this._pkT = T; }
        for (const s2 of it.o) { if (s2[1] < vx0 - 40 || s2[1] > vx1 + 40 || s2[2] < vy0 - 40 || s2[2] > vy1 + 40) continue; const fade = Math.min(1, s2[3] / 2); ctx.globalAlpha = 0.9 * fade; ctx.fillStyle = '#141024'; ctx.beginPath(); ctx.ellipse(s2[1], s2[2], 22, 18, s2[0] * 0.7, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.5 * fade; ctx.fillStyle = '#b57cff'; ctx.beginPath(); ctx.ellipse(s2[1] - 6, s2[2] - 6, 8, 3.2, -0.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        const pk = this._pk; for (let i = 0; i < pk.length; i++) {
          const p = pk[i]; if (it.pk & (1 << i)) continue; if (p.x < vx0 - 30 || p.x > vx1 + 30 || p.y < vy0 - 30 || p.y > vy1 + 30) continue;
          const bob = Math.sin(t * 3 + i) * 1.5, rot = Math.sin(t * 2 + i * 1.7) * 0.25;
          ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1.25, 1.25); ctx.globalAlpha = 0.28; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(2, 8, 11, 5, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          ctx.translate(0, -4 + bob); ctx.rotate(rot);
          const gr = ctx.createLinearGradient(-11, -11, 11, 11); gr.addColorStop(0, '#ffe66b'); gr.addColorStop(0.5, '#ff7ad9'); gr.addColorStop(1, '#6aa8ff');
          ctx.fillStyle = gr; ctx.strokeStyle = '#10121f'; ctx.lineWidth = 2; G.rr(ctx, -10, -10, 20, 20, 4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-7, -8, 9, 2.5);
          ctx.fillStyle = '#10121f'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 1.5);
          ctx.restore();
        }
      }
      // cars: shadows, then ground cars, then airborne cars
      const cars = f.cars; const ground = [], airb = [];
      for (const c of cars) { if (c.x < vx0 - 80 || c.x > vx1 + 80 || c.y < vy0 - 80 || c.y > vy1 + 80) continue; (c.tA > 0.02 ? airb : ground).push(c); }
      ground.sort((a, b2) => a.y - b2.y); airb.sort((a, b2) => a.y - b2.y);
      for (const c of ground) this.drawCar(c, f.time);
      // particles under airborne cars but above ground cars
      this.drawParts();
      for (const c of airb) this.drawCar(c, f.time);
      if (f.missiles) for (const m of f.missiles) {
        if (m.x < vx0 - 40 || m.x > vx1 + 40 || m.y < vy0 - 40 || m.y > vy1 + 40) continue;
        ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.a); ctx.scale(1.3, 1.3);
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.fillRect(-9, -2, 18, 6); ctx.globalAlpha = 1;
        const fl = 7 + Math.random() * 5; ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-8 - fl, 0); ctx.lineTo(-8, 3); ctx.fill(); ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.moveTo(-8, -1.5); ctx.lineTo(-8 - fl * 0.55, 0); ctx.lineTo(-8, 1.5); ctx.fill();
        ctx.fillStyle = '#e8ecf6'; ctx.strokeStyle = '#10121f'; ctx.lineWidth = 1.5; G.rr(ctx, -9, -3.6, 16, 7.2, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8372c'; ctx.beginPath(); ctx.moveTo(7, -3.6); ctx.lineTo(12, 0); ctx.lineTo(7, 3.6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8372c'; ctx.fillRect(-9, -5.5, 4, 2.5); ctx.fillRect(-9, 3, 4, 2.5);
        ctx.restore();
        if (!this.lowFx && Math.random() < 0.8) this.burst && this.burst(m.x - Math.cos(m.a) * 12, m.y - Math.sin(m.a) * 12, 'puff', 1);
      }
      this.drawOverlay(f.dt || 0.016);
      return { vx0, vy0, vx1, vy1 };
    }
    drawParts() {
      const ctx = this.ctx; const ps = this.parts;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]; const u = 1 - p.life / p.max; const r = p.r0 + (p.r1 - p.r0) * u;
        ctx.globalAlpha = Math.max(0, p.al * (1 - u * (p.sq ? 0.6 : 1))); ctx.fillStyle = p.col;
        if (p.sq) ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); else { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }
    drawCar(c, time) {
      const ctx = this.ctx; const spr = G.carSprite(c.style, c.color);
      let h = 0, sc = 1, rot = c.a, alpha = 1;
      if (c.tA > 0.001) { const m = this.airMax.get(c.id) || 0.6; const u = clamp(c.tA / m, 0, 1); h = Math.sin(Math.PI * (1 - u)); sc = 1 + 0.42 * h; rot += Math.sin(time / 90) * 0.04 * h; }
      if (c.tF > 0) { const p = 1 - clamp(c.tF / 0.95, 0, 1); sc = 1 - p * 0.9; rot += p * 6; alpha = 1 - p * 0.5; }
      if (c.tI > 0 && Math.floor(c.tI * 14) % 2) alpha *= 0.4;
      if (c.out) alpha *= 0.35;
      const k = sc * CS;
      ctx.save(); ctx.translate(c.x, c.y);
      if (c.tF <= 0) { // soft cached shadow, drifts away from the car while airborne
        const sh = G.carShadow(c.style); ctx.save(); ctx.translate((2.4 + h * 12) * CS, (3.6 + h * 18) * CS); ctx.rotate(c.a); ctx.globalAlpha = (0.55 - h * 0.25) * alpha; const q = CS * (1 + h * 0.1);
        ctx.drawImage(sh.cv, -sh.w / 2 * q, -sh.h / 2 * q, sh.w * q, sh.h * q); ctx.restore();
      }
      ctx.rotate(rot); ctx.scale(k, k); ctx.globalAlpha = alpha;
      // slight body squash on hard braking / boost stretch looks lively
      if (c.tB > 0) ctx.scale(1.06, 0.97);
      ctx.drawImage(spr.cv, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      if (c.hitT > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(c.hitT * 3, 0, 0.7); ctx.drawImage(spr.cv, -spr.w / 2, -spr.h / 2, spr.w, spr.h); ctx.globalCompositeOperation = 'source-over'; }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // screen-space overlay: speed lines while boosting/fast, impact flash vignette
    drawOverlay(dt) {
      const ctx = this.ctx, W = this.cv.width, H = this.cv.height; ctx.setTransform(1, 0, 0, 1, 0, 0);
      const sf = this.speedFx || 0;
      if (sf > 0.02 && !this.lowFx) {
        ctx.save(); ctx.globalAlpha = Math.min(0.5, sf * 0.5); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, W / 700); ctx.lineCap = 'round'; ctx.beginPath();
        const cx = W / 2, cy = H / 2, n = 16, t = performance.now() / 1000;
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU + Math.sin(i * 12.9) * 0.2, u = ((t * 2.2 + i * 0.37) % 1), r0 = Math.min(W, H) * (0.46 + 0.22 * u), r1 = r0 + Math.min(W, H) * (0.1 + 0.18 * sf); ctx.moveTo(cx + Math.cos(a) * r0 * 1.25, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1 * 1.25, cy + Math.sin(a) * r1); }
        ctx.stroke(); ctx.restore();
      }
      if (this.flash > 0.01) {
        const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72); const col = this.flashCol || '255,60,40';
        gr.addColorStop(0, 'rgba(' + col + ',0)'); gr.addColorStop(1, 'rgba(' + col + ',' + (this.flash * 0.55).toFixed(3) + ')'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
        this.flash = Math.max(0, this.flash - dt * 2.8);
      }
    }
  }
  TT.render = { Renderer, THEMES: Object.keys(THEMES), bake, bakeMini, TILES };
})(window);
