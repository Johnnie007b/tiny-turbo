/* Tiny Turbo - procedural art: pixel font, toy cars, props, hazards. Everything is drawn in code (no image files). */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});

  /* ---------------------------------------------------------------- colors */
  const CAR_COLORS = [
    { n: 'Red', c: '#e8392d' }, { n: 'Orange', c: '#f28a1d' }, { n: 'Yellow', c: '#f4d31f' }, { n: 'Lime', c: '#8ad52a' },
    { n: 'Green', c: '#1fa650' }, { n: 'Teal', c: '#17b5a6' }, { n: 'Sky', c: '#35b6f0' }, { n: 'Blue', c: '#2f5be0' },
    { n: 'Purple', c: '#8b45d6' }, { n: 'Pink', c: '#f067b4' }, { n: 'White', c: '#f1f3f6' }, { n: 'Black', c: '#3a3d47' }
  ];
  const CAR_STYLES = ['Racer', 'Buggy', 'Pickup', 'Bug', 'Wedge', 'Van'];

  function shade(hex, f) { // f>0 lighten, f<0 darken
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; gg += (255 - gg) * f; b += (255 - b) * f; } else { r *= 1 + f; gg *= 1 + f; b *= 1 + f; }
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
  function rng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

  /* ---------------------------------------------------------------- pixel font (5x7) */
  const FONT_SRC = {
    A: '01110/10001/10001/11111/10001/10001/10001', B: '11110/10001/10001/11110/10001/10001/11110', C: '01110/10001/10000/10000/10000/10001/01110',
    D: '11110/10001/10001/10001/10001/10001/11110', E: '11111/10000/10000/11110/10000/10000/11111', F: '11111/10000/10000/11110/10000/10000/10000',
    G: '01110/10001/10000/10111/10001/10001/01111', H: '10001/10001/10001/11111/10001/10001/10001', I: '01110/00100/00100/00100/00100/00100/01110',
    J: '00111/00010/00010/00010/00010/10010/01100', K: '10001/10010/10100/11000/10100/10010/10001', L: '10000/10000/10000/10000/10000/10000/11111',
    M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/11001/10101/10011/10001/10001/10001', O: '01110/10001/10001/10001/10001/10001/01110',
    P: '11110/10001/10001/11110/10000/10000/10000', Q: '01110/10001/10001/10001/10101/10010/01101', R: '11110/10001/10001/11110/10100/10010/10001',
    S: '01111/10000/10000/01110/00001/00001/11110', T: '11111/00100/00100/00100/00100/00100/00100', U: '10001/10001/10001/10001/10001/10001/01110',
    V: '10001/10001/10001/10001/10001/01010/00100', W: '10001/10001/10001/10101/10101/11011/10001', X: '10001/10001/01010/00100/01010/10001/10001',
    Y: '10001/10001/01010/00100/00100/00100/00100', Z: '11111/00001/00010/00100/01000/10000/11111',
    0: '01110/10001/10011/10101/11001/10001/01110', 1: '00100/01100/00100/00100/00100/00100/01110', 2: '01110/10001/00001/00010/00100/01000/11111',
    3: '11110/00001/00001/01110/00001/00001/11110', 4: '00010/00110/01010/10010/11111/00010/00010', 5: '11111/10000/11110/00001/00001/10001/01110',
    6: '00110/01000/10000/11110/10001/10001/01110', 7: '11111/00001/00010/00100/01000/01000/01000', 8: '01110/10001/10001/01110/10001/10001/01110',
    9: '01110/10001/10001/01111/00001/00010/01100',
    '.': '00000/00000/00000/00000/00000/01100/01100', ':': '00000/01100/01100/00000/01100/01100/00000', '!': '00100/00100/00100/00100/00100/00000/00100',
    '?': '01110/10001/00001/00010/00100/00000/00100', '-': '00000/00000/00000/11111/00000/00000/00000', '+': '00000/00100/00100/11111/00100/00100/00000',
    '/': '00001/00001/00010/00100/01000/10000/10000', "'": '00100/00100/01000/00000/00000/00000/00000', '%': '11000/11001/00010/00100/01000/10011/00011',
    '>': '01000/00100/00010/00001/00010/00100/01000', '<': '00010/00100/01000/10000/01000/00100/00010', ',': '00000/00000/00000/00000/01100/00100/01000',
    '*': '00000/10101/01110/11111/01110/10101/00000', '#': '01010/11111/01010/01010/11111/01010/00000', '(': '00010/00100/01000/01000/01000/00100/00010', ')': '01000/00100/00010/00010/00010/00100/01000',
    '=': '00000/00000/11111/00000/11111/00000/00000', '_': '00000/00000/00000/00000/00000/00000/11111'
  };
  const GLYPHS = {};
  for (const k in FONT_SRC) GLYPHS[k] = FONT_SRC[k].split('/');
  const atlasCache = new Map();
  const CHARS = Object.keys(GLYPHS);
  function getAtlas(color, scale, outline) {
    const key = color + '|' + scale + '|' + (outline || '');
    let a = atlasCache.get(key); if (a) return a;
    const pad = outline ? scale : 0, cw = 6 * scale + pad * 2, ch = 8 * scale + pad * 2;
    const cv = mk(cw * CHARS.length, ch); const x = cv.getContext('2d');
    const idx = {};
    CHARS.forEach((c, i) => {
      idx[c] = i * cw; const gl = GLYPHS[c];
      const draw = (ox, oy, col) => { x.fillStyle = col; for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (gl[r][q] === '1') x.fillRect(i * cw + pad + q * scale + ox, pad + r * scale + oy, scale, scale); };
      if (outline) { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) draw(dx * scale, dy * scale, outline); }
      draw(0, 0, color);
    });
    a = { cv, idx, cw, ch, pad }; atlasCache.set(key, a); return a;
  }
  function textWidth(str, scale) { return str.length * 6 * scale - scale; }
  // draws in the ctx's current coordinate space; scale = integer pixel size
  function drawText(ctx, str, x, y, scale, color, align, outline) {
    str = String(str).toUpperCase(); scale = Math.max(1, Math.round(scale));
    const a = getAtlas(color || '#fff', scale, outline);
    const w = textWidth(str, scale);
    if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    for (let i = 0; i < str.length; i++) {
      const ch = str[i]; const sx = a.idx[ch];
      if (sx === undefined) continue;
      ctx.drawImage(a.cv, sx, 0, a.cw, a.ch, x + i * 6 * scale - a.pad, y - a.pad, a.cw, a.ch);
    }
    return w;
  }

  /* ---------------------------------------------------------------- toy cars */
  const carCache = new Map();
  const CAR_W = 40, CAR_H = 24, CAR_SS = 4; // sprite canvas in world units, supersample
  function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function drawWheels(x, pos, len, wid, hub) {
    for (const [px, py] of pos) {
      x.fillStyle = 'rgba(0,0,0,.35)'; rr(x, px - len / 2 + 0.6, py - wid / 2 + 0.9, len, wid, 1.4); x.fill();
      x.fillStyle = '#14141b'; rr(x, px - len / 2, py - wid / 2, len, wid, 1.5); x.fill();
      x.strokeStyle = '#2c2c38'; x.lineWidth = 0.5; for (let k = -len / 2 + 1.3; k < len / 2 - 0.5; k += 1.6) { x.beginPath(); x.moveTo(px + k, py - wid / 2 + 0.4); x.lineTo(px + k, py + wid / 2 - 0.4); x.stroke(); }
      x.fillStyle = '#3d3d4b'; rr(x, px - len / 2 + 1, py - wid / 2 + 0.4, len - 2, 0.9, 0.4); x.fill();
      if (hub) { x.fillStyle = hub; x.beginPath(); x.arc(px, py, Math.min(len, wid) * 0.2, 0, 7); x.fill(); }
    }
  }
  function carSprite(style, colorIdx) {
    const key = style + ':' + colorIdx; let c = carCache.get(key); if (c) return c;
    const cv = mk(CAR_W * CAR_SS, CAR_H * CAR_SS); const x = cv.getContext('2d');
    x.scale(CAR_SS, CAR_SS); x.translate(CAR_W / 2, CAR_H / 2);
    const base = CAR_COLORS[colorIdx % CAR_COLORS.length].c, hi = shade(base, 0.45), lo = shade(base, -0.35), dk = shade(base, -0.6);
    const n = parseInt(base.slice(1), 16), lum = (((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255);
    const acc = lum > 0.72 ? '#2a2d38' : '#ffffff', glass = '#142238', glassHi = 'rgba(160,215,255,.55)';
    const outline = 'rgba(8,8,18,.8)';
    x.lineJoin = 'round'; x.lineCap = 'round';
    const gloss = (path) => { // soft highlight + bottom shading, clipped to the body
      x.save(); path(); x.clip();
      const g1 = x.createLinearGradient(-6, -9, 6, 9); g1.addColorStop(0, 'rgba(255,255,255,.4)'); g1.addColorStop(0.45, 'rgba(255,255,255,0)'); g1.addColorStop(1, 'rgba(0,0,0,.22)');
      x.fillStyle = g1; x.fillRect(-20, -12, 40, 24); x.restore();
    };
    const body = (path, fill) => {
      const gr = x.createLinearGradient(0, -8, 0, 8); gr.addColorStop(0, hi); gr.addColorStop(0.35, base); gr.addColorStop(1, lo);
      path(); x.fillStyle = fill || gr; x.fill(); gloss(path); path(); x.lineWidth = 0.9; x.strokeStyle = outline; x.stroke();
    };
    const lights = (fx, rx, wf, wr) => { x.fillStyle = '#fff6b8'; x.fillRect(fx, -wf, 1.8, 2.1); x.fillRect(fx, wf - 2.1, 1.8, 2.1); x.fillStyle = 'rgba(255,240,150,.35)'; x.fillRect(fx + 1.8, -wf - 0.4, 1.4, 2.9); x.fillRect(fx + 1.8, wf - 2.5, 1.4, 2.9); x.fillStyle = '#e02020'; x.fillRect(rx, -wr, 1.3, 2); x.fillRect(rx, wr - 2, 1.3, 2); };
    const helmet = (hx, hy, r) => { x.fillStyle = acc; x.beginPath(); x.arc(hx, hy, r, 0, 7); x.fill(); x.strokeStyle = outline; x.lineWidth = 0.6; x.stroke(); x.fillStyle = '#142238'; x.beginPath(); x.ellipse(hx + r * 0.35, hy, r * 0.5, r * 0.72, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(hx - r * 0.3, hy - r * 0.35, r * 0.28, r * 0.18, -0.6, 0, 7); x.fill(); };
    const num = (nx, ny, r, t) => { x.fillStyle = '#fff'; x.beginPath(); x.arc(nx, ny, r, 0, 7); x.fill(); x.strokeStyle = outline; x.lineWidth = 0.5; x.stroke(); x.fillStyle = '#16161e'; x.font = 'bold ' + (r * 1.5) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, nx, ny + 0.3); };
    if (style === 0) { // racer: pointy open-wheel
      drawWheels(x, [[10.5, -8.4], [10.5, 8.4], [-10, -8.6], [-10, 8.6]], 7.4, 4.6, hi);
      x.fillStyle = dk; rr(x, -17.2, -9, 4.4, 18, 1); x.fill(); x.strokeStyle = outline; x.lineWidth = 0.8; x.stroke(); x.fillStyle = acc; x.fillRect(-16.6, -8.6, 1.2, 17.2); // rear wing
      x.fillStyle = hi; rr(x, 12.4, -8, 3.8, 16, 1); x.fill(); x.stroke(); x.fillStyle = acc; x.fillRect(13.2, -7.6, 1, 15.2); // front wing
      x.strokeStyle = '#1a1c25'; x.lineWidth = 1; x.beginPath(); x.moveTo(11, -5.2); x.lineTo(10.5, -7.4); x.moveTo(11, 5.2); x.lineTo(10.5, 7.4); x.stroke();
      body(() => { x.beginPath(); x.moveTo(17.5, 0); x.lineTo(11, -2.8); x.lineTo(3, -5.2); x.lineTo(-8, -5.8); x.lineTo(-14, -4.4); x.lineTo(-14, 4.4); x.lineTo(-8, 5.8); x.lineTo(3, 5.2); x.lineTo(11, 2.8); x.closePath(); });
      x.fillStyle = acc; x.globalAlpha = 0.9; x.fillRect(-13, -0.9, 29, 1.8); x.globalAlpha = 1;
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(-6, -5.6, 5, 1.2); x.fillRect(-6, 4.4, 5, 1.2); // side intakes
      helmet(-2.2, 0, 3.3); num(8.5, 0, 2.1, '7');
    } else if (style === 1) { // buggy
      drawWheels(x, [[9.5, -9], [9.5, 9], [-9.5, -9.2], [-9.5, 9.2]], 8.6, 5.6, lo);
      x.fillStyle = '#23252e'; rr(x, -16.2, -2.6, 4.2, 5.2, 2.2); x.fill(); x.strokeStyle = '#5a5e6c'; x.lineWidth = 0.6; x.stroke(); x.fillStyle = '#3b3e4a'; x.beginPath(); x.arc(-14.1, 0, 1, 0, 7); x.fill(); // spare tire
      body(() => rr(x, -12.5, -6.6, 26, 13.2, 3.6));
      x.fillStyle = 'rgba(0,0,0,.3)'; rr(x, -9.4, -4.5, 12.5, 9, 2); x.fill();
      x.strokeStyle = '#1a1c25'; x.lineWidth = 1.5; rr(x, -8.6, -5.6, 11.8, 11.2, 2.2); x.stroke(); x.strokeStyle = acc; x.lineWidth = 0.5; rr(x, -8.6, -5.6, 11.8, 11.2, 2.2); x.stroke(); // roll cage
      x.strokeStyle = '#1a1c25'; x.lineWidth = 1; x.beginPath(); x.moveTo(-8.6, -5.6); x.lineTo(3.2, 5.6); x.moveTo(-8.6, 5.6); x.lineTo(3.2, -5.6); x.stroke();
      helmet(-2.4, 0, 3);
      x.fillStyle = acc; x.fillRect(4.5, -6.4, 7.5, 1.2); x.fillRect(4.5, 5.2, 7.5, 1.2);
      x.fillStyle = '#2a2d38'; rr(x, 13.4, -6.8, 2, 13.6, 1); x.fill(); x.stroke(); lights(11.2, -12.9, 5.5, 5.4);
    } else if (style === 2) { // pickup truck
      drawWheels(x, [[10, -8.6], [10, 8.6], [-10, -8.6], [-10, 8.6]], 8.4, 4.8, '#9aa0ae');
      body(() => rr(x, -16.4, -7.6, 33, 15.2, 2.8));
      x.fillStyle = 'rgba(0,0,0,.5)'; rr(x, -15, -5.8, 13.6, 11.6, 1.2); x.fill(); x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 0.5; for (let k = -13; k < -2; k += 2.4) { x.beginPath(); x.moveTo(k, -5.6); x.lineTo(k, 5.6); x.stroke(); }
      x.fillStyle = acc; x.globalAlpha = 0.9; rr(x, -12.5, -3.3, 5.6, 4.6, 0.8); x.fill(); x.globalAlpha = 1; x.strokeStyle = outline; x.lineWidth = 0.5; x.stroke(); // cargo crate
      x.fillStyle = hi; rr(x, -1.4, -6.6, 9.8, 13.2, 2.2); x.fill(); gloss(() => rr(x, -1.4, -6.6, 9.8, 13.2, 2.2)); x.strokeStyle = outline; x.lineWidth = 0.7; rr(x, -1.4, -6.6, 9.8, 13.2, 2.2); x.stroke();
      x.fillStyle = glass; rr(x, 4.6, -5.5, 3.4, 11, 1); x.fill(); x.fillRect(-0.7, -5.2, 1.4, 10.4); x.fillStyle = glassHi; x.fillRect(5.2, -4.6, 0.8, 4);
      x.fillStyle = '#ffcf40'; for (let k = -3; k <= 3; k += 3) x.fillRect(2.2, k - 0.6, 1.3, 1.2); // roof lights
      x.fillStyle = '#c4c9d4'; x.fillRect(16.6, -6.4, 1.2, 12.8); lights(14.4, -16.7, 6.4, 6.3);
    } else if (style === 3) { // bug: round
      drawWheels(x, [[9.6, -8.4], [9.6, 8.4], [-9.6, -8.4], [-9.6, 8.4]], 7.8, 4.6, hi);
      x.fillStyle = lo; rr(x, -17, -2, 3, 4, 1); x.fill(); x.strokeStyle = outline; x.lineWidth = 0.5; x.stroke();
      body(() => { x.beginPath(); x.ellipse(0, 0, 15.6, 8.2, 0, 0, 7); });
      x.fillStyle = hi; x.beginPath(); x.ellipse(-1, 0, 6.6, 6.2, 0, 0, 7); x.fill(); gloss(() => { x.beginPath(); x.ellipse(-1, 0, 6.6, 6.2, 0, 0, 7); }); x.strokeStyle = outline; x.lineWidth = 0.7; x.beginPath(); x.ellipse(-1, 0, 6.6, 6.2, 0, 0, 7); x.stroke();
      x.fillStyle = acc; x.globalAlpha = 0.85; x.fillRect(-7.5, -0.7, 19.5, 1.4); x.globalAlpha = 1;
      x.fillStyle = glass; x.beginPath(); x.moveTo(6.2, -4.8); x.lineTo(3.4, -3.4); x.lineTo(3.4, 3.4); x.lineTo(6.2, 4.8); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(-7.8, -4.5); x.lineTo(-5.2, -3.1); x.lineTo(-5.2, 3.1); x.lineTo(-7.8, 4.5); x.closePath(); x.fill(); x.fillStyle = glassHi; x.fillRect(4.6, -3.6, 0.7, 2.4);
      x.fillStyle = '#fff6b8'; x.beginPath(); x.arc(14.6, -4.6, 1.8, 0, 7); x.arc(14.6, 4.6, 1.8, 0, 7); x.fill(); x.fillStyle = '#e02020'; x.beginPath(); x.arc(-14.6, -4.3, 1.3, 0, 7); x.arc(-14.6, 4.3, 1.3, 0, 7); x.fill();
      x.fillStyle = '#d8dce6'; rr(x, 15.4, -1.6, 1.4, 3.2, 0.6); x.fill();
    } else if (style === 4) { // wedge: low sports coupe
      drawWheels(x, [[10.5, -8.2], [10.5, 8.2], [-10, -8.4], [-10, 8.4]], 8.2, 4.8, hi);
      x.fillStyle = dk; rr(x, -18, -9.2, 4.8, 18.4, 1.2); x.fill(); x.strokeStyle = outline; x.lineWidth = 0.7; x.stroke(); x.fillStyle = acc; x.fillRect(-17.4, -8.8, 1.2, 17.6); // spoiler
      x.strokeStyle = '#1a1c25'; x.lineWidth = 1.1; x.beginPath(); x.moveTo(-14, -5); x.lineTo(-16.2, -7.4); x.moveTo(-14, 5); x.lineTo(-16.2, 7.4); x.stroke();
      body(() => { x.beginPath(); x.moveTo(18.2, 0); x.lineTo(15, -4.6); x.lineTo(4, -6.9); x.lineTo(-10, -7.1); x.lineTo(-14.4, -5.8); x.lineTo(-14.4, 5.8); x.lineTo(-10, 7.1); x.lineTo(4, 6.9); x.lineTo(15, 4.6); x.closePath(); });
      x.fillStyle = acc; x.globalAlpha = 0.9; x.fillRect(-14, -3, 31, 1.4); x.fillRect(-14, 1.6, 31, 1.4); x.globalAlpha = 1; // twin stripes
      x.fillStyle = glass; x.beginPath(); x.moveTo(5.6, -4.8); x.lineTo(1, -5.4); x.lineTo(-7.2, -4.8); x.lineTo(-7.2, 4.8); x.lineTo(1, 5.4); x.lineTo(5.6, 4.8); x.closePath(); x.fill(); x.fillStyle = glassHi; x.beginPath(); x.moveTo(4.8, -4); x.lineTo(2, -4.4); x.lineTo(2.4, -2.4); x.lineTo(4.6, -2.2); x.fill();
      x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(8, -6.3, 3.2, 1); x.fillRect(8, 5.3, 3.2, 1); x.fillStyle = '#fff6b8'; x.beginPath(); x.moveTo(15.6, -4); x.lineTo(17.6, -1.6); x.lineTo(15.2, -2.6); x.fill(); x.beginPath(); x.moveTo(15.6, 4); x.lineTo(17.6, 1.6); x.lineTo(15.2, 2.6); x.fill();
      x.fillStyle = '#e02020'; x.fillRect(-14.8, -5, 1, 2.2); x.fillRect(-14.8, 2.8, 1, 2.2);
    } else { // van: boxy delivery van
      drawWheels(x, [[9.8, -9], [9.8, 9], [-9.8, -9], [-9.8, 9]], 8.4, 4.8, '#9aa0ae');
      body(() => rr(x, -17.2, -8, 34.4, 16, 3.2));
      x.fillStyle = acc; x.globalAlpha = 0.9; x.fillRect(-17, -8, 1.8, 16); x.globalAlpha = 1; // rear band
      const roof = () => rr(x, -15, -6.4, 24, 12.8, 2.2);
      x.fillStyle = hi; roof(); x.fill(); gloss(roof); x.strokeStyle = outline; x.lineWidth = 0.6; roof(); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,.2)'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(-6, -6.4); x.lineTo(-6, 6.4); x.moveTo(2, -6.4); x.lineTo(2, 6.4); x.stroke();
      x.fillStyle = acc; x.globalAlpha = 0.85; rr(x, -12, -2, 8, 4, 1.4); x.fill(); x.globalAlpha = 1; x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 0.5; x.stroke(); // roof vent
      x.fillStyle = glass; rr(x, 9.4, -6.6, 5, 13.2, 1.6); x.fill(); x.fillStyle = glassHi; x.fillRect(10.2, -5.4, 0.8, 5);
      x.fillStyle = '#c4c9d4'; x.fillRect(16.8, -6.6, 1.2, 13.2); x.fillStyle = base; rr(x, 8, -9.6, 2.6, 1.8, 0.7); x.fill(); rr(x, 8, 7.8, 2.6, 1.8, 0.7); x.fill(); // mirrors
      lights(15, -17.3, 6.4, 6.3);
    }
    c = { cv, w: CAR_W, h: CAR_H }; carCache.set(key, c); return c;
  }
  // soft drop shadow helpers (cached canvases; never blur per frame)
  function softShadow(src, blur, ox, oy, alpha) { const out = mk(src.width, src.height); const x = out.getContext('2d'); x.shadowColor = 'rgba(0,0,0,' + alpha + ')'; x.shadowBlur = blur; x.shadowOffsetX = ox; x.shadowOffsetY = oy; x.drawImage(src, 0, 0); return out; }
  const shCache = new Map();
  function carShadow(style) { // shadow-only sprite for a car style (colour independent), world size = CAR_W+12 x CAR_H+12
    let s = shCache.get(style); if (s) return s;
    const spr = carSprite(style, 0); const pad = 8 * CAR_SS, w = spr.cv.width + pad * 2, h = spr.cv.height + pad * 2; const cv = mk(w, h); const x = cv.getContext('2d');
    x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 6 * CAR_SS; x.shadowOffsetX = w + 0; x.shadowOffsetY = 0; x.drawImage(spr.cv, pad - w, pad);
    s = { cv, w: w / CAR_SS, h: h / CAR_SS }; shCache.set(style, s); return s;
  }

  /* ---------------------------------------------------------------- props (obstacles) */
  const propCache = new Map();
  const PS = 3;
  function circle(x, cx, cy, r, fill, stroke, lw) { x.beginPath(); x.arc(cx, cy, r, 0, 7); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.lineWidth = lw || 1; x.strokeStyle = stroke; x.stroke(); } }
  function blob(x, cx, cy, r, seed, jitter, n) {
    const R = rng(seed); n = n || 14; const pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, rad = r * (1 - jitter + R() * jitter * 2); pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
    x.beginPath(); x.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; x.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
    x.closePath();
  }
  function shadow(x, r, kind) { return; /* soft shadow is added when the sprite is finished */
     x.save(); x.fillStyle = 'rgba(0,0,0,.28)'; x.translate(r * 0.16, r * 0.22); if (kind === 'rect') { rr(x, -r * 1.0, -r * 0.75, r * 2, r * 1.5, r * 0.3); } else { x.beginPath(); x.arc(0, 0, r * 1.02, 0, 7); } x.fill(); x.restore(); }
  function propSprite(kind, r, id) {
    const key = kind + ':' + r + ':' + (id % 4); let c = propCache.get(key); if (c) return c;
    const size = Math.ceil((r * 2 + 28) * PS); const cv = mk(size, size); const x = cv.getContext('2d');
    x.scale(PS, PS); x.translate(size / PS / 2, size / PS / 2); x.lineJoin = 'round'; x.lineCap = 'round';
    const R = rng(id * 977 + r);
    const pal = [['#e5473b', '#f4a12b', '#3b82e0', '#4cb050'], ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71']][0];
    switch (kind) {
      case 'bowl': {
        shadow(x, r);
        circle(x, 0, 0, r, '#efe7da', '#b9ad9b', 1.2); circle(x, 0, 0, r * 0.88, '#fbf6ec'); circle(x, 0, 0, r * 0.8, '#fffdf7', '#e0d6c4', 1);
        for (let i = 0; i < 17; i++) { const a = R() * 7, d = Math.sqrt(R()) * r * 0.66; const px = Math.cos(a) * d, py = Math.sin(a) * d; circle(x, px, py, 2.9, null, i % 3 ? '#d99a3d' : '#b8742a', 1.6); }
        x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(-r * 0.4, -r * 0.5, r * 0.22, r * 0.1, -0.7, 0, 7); x.fill();
        break; }
      case 'mug': {
        shadow(x, r);
        x.strokeStyle = '#a63224'; x.lineWidth = 3.4; x.beginPath(); x.arc(r * 0.78, 0, r * 0.38, -1.6, 1.6); x.stroke();
        circle(x, 0, 0, r * 0.86, '#d94f3d', '#8f2a1d', 1.1); circle(x, 0, 0, r * 0.72, '#f6efe6'); circle(x, 0, 0, r * 0.62, '#4a2c17');
        circle(x, -r * 0.12, -r * 0.14, r * 0.3, 'rgba(255,255,255,.1)'); x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.ellipse(-r * 0.3, -r * 0.34, r * 0.18, r * 0.07, -0.6, 0, 7); x.fill();
        x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, r * 0.8, 3.4, 4.4); x.stroke();
        break; }
      case 'jar': {
        shadow(x, r);
        circle(x, 0, 0, r, '#b72e26', '#6d1713', 1.1); circle(x, 0, 0, r * 0.84, '#d4443a');
        for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 0.9; x.beginPath(); x.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); x.lineTo(Math.cos(a) * r, Math.sin(a) * r); x.stroke(); }
        circle(x, 0, 0, r * 0.55, '#fff0d8', '#caa', 0.8); circle(x, 0, 0, r * 0.47, '#e9573f');
        x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(-r * 0.35, -r * 0.4, r * 0.25, r * 0.09, -0.7, 0, 7); x.fill();
        break; }
      case 'cube': {
        const col = pal[id % 4]; x.save(); x.rotate((id % 7) * 0.4);
        const gr = x.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(1, shade(col, -0.25));
        rr(x, -r * 0.9, -r * 0.9, r * 1.8, r * 1.8, 2.2); x.fillStyle = gr; x.fill(); x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 0.9; x.stroke();
        x.fillStyle = 'rgba(255,255,255,.9)'; const lt = 'ABCD'[id % 4]; // emboss letter via simple strokes
        x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1.5; x.beginPath();
        if (lt === 'A') { x.moveTo(-3, 4); x.lineTo(0, -4); x.lineTo(3, 4); x.moveTo(-1.8, 1); x.lineTo(1.8, 1); } else if (lt === 'B') { x.moveTo(-2.5, -4); x.lineTo(-2.5, 4); x.lineTo(1.5, 4); x.lineTo(2.5, 2); x.lineTo(1.5, 0); x.lineTo(-2.5, 0); x.moveTo(1.5, 0); x.lineTo(2.2, -2); x.lineTo(1.2, -4); x.lineTo(-2.5, -4); } else if (lt === 'C') { x.moveTo(3, -3); x.lineTo(-1, -4); x.lineTo(-3, 0); x.lineTo(-1, 4); x.lineTo(3, 3); } else { x.moveTo(-2.5, -4); x.lineTo(-2.5, 4); x.lineTo(1.5, 3); x.lineTo(2.5, 0); x.lineTo(1.5, -3); x.closePath(); }
        x.stroke(); x.restore(); break; }
      case 'bolt': {
        shadow(x, r);
        x.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + 0.3; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath();
        const gr = x.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, '#f2f4f7'); gr.addColorStop(0.5, '#a9b2bd'); gr.addColorStop(1, '#6a7480');
        x.fillStyle = gr; x.fill(); x.strokeStyle = '#3b424b'; x.lineWidth = 1.1; x.stroke();
        circle(x, 0, 0, r * 0.62, '#8e98a4', '#4a525c', 1); circle(x, 0, 0, r * 0.4, '#bcc4cd'); x.strokeStyle = '#4a525c'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-r * 0.4, 0); x.lineTo(r * 0.4, 0); x.stroke();
        break; }
      case 'can': {
        shadow(x, r);
        const col = ['#2f6fdc', '#f2b417', '#2fa84f', '#e04a3a'][id % 4];
        circle(x, 0, 0, r, '#c3c9d1', '#59606a', 1.2); circle(x, 0, 0, r * 0.88, '#9aa2ad'); circle(x, 0, 0, r * 0.78, col, 'rgba(0,0,0,.35)', 1);
        circle(x, r * 0.1, r * 0.1, r * 0.4, shade(col, 0.2)); x.strokeStyle = '#d8dde3'; x.lineWidth = 1.8; x.beginPath(); x.moveTo(-r * 0.9, 0); x.lineTo(r * 0.9, 0); x.stroke();
        x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.ellipse(-r * 0.4, -r * 0.45, r * 0.22, r * 0.08, -0.7, 0, 7); x.fill();
        break; }
      case 'rock': {
        blob(x, 0, 0, r, id * 31 + 5, 0.22, 11);
        const gr = x.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, '#b9b4aa'); gr.addColorStop(0.55, '#8a857c'); gr.addColorStop(1, '#5d5952');
        x.fillStyle = gr; x.fill(); x.strokeStyle = '#3d3a35'; x.lineWidth = 1.1; x.stroke();
        x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 0.9; x.beginPath(); x.moveTo(-r * 0.2, -r * 0.5); x.lineTo(r * 0.1, -r * 0.05); x.lineTo(r * 0.5, r * 0.25); x.stroke();
        x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(-r * 0.35, -r * 0.4, r * 0.3, r * 0.14, -0.7, 0, 7); x.fill();
        break; }
      case 'bucket': {
        shadow(x, r);
        const col = ['#e04a3a', '#2f8fe0', '#f2b417', '#2fa84f'][id % 4];
        circle(x, 0, 0, r, col, shade(col, -0.5), 1.3); circle(x, 0, 0, r * 0.82, shade(col, -0.3)); circle(x, 0, 0, r * 0.72, '#d9bf7e');
        x.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 18; i++) { circle(x, (R() - 0.5) * r * 1.2, (R() - 0.5) * r * 1.2, 1.2, 'rgba(120,90,40,.5)'); }
        x.strokeStyle = '#6b727c'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-r * 0.95, 0); x.quadraticCurveTo(0, -r * 0.3, r * 0.95, 0); x.stroke();
        x.fillStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.ellipse(-r * 0.45, -r * 0.5, r * 0.22, r * 0.08, -0.7, 0, 7); x.fill();
        break; }
      case 'pot': {
        shadow(x, r);
        circle(x, 0, 0, r, '#c9693c', '#7b3a1d', 1.2); circle(x, 0, 0, r * 0.86, '#df7f4c'); circle(x, 0, 0, r * 0.7, '#4a3324');
        for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + 0.4; x.fillStyle = i % 2 ? '#3f9b3a' : '#56b84a'; x.save(); x.rotate(a); x.beginPath(); x.ellipse(r * 0.28, 0, r * 0.3, r * 0.12, 0, 0, 7); x.fill(); x.restore(); }
        circle(x, 0, 0, 2.4, '#ffd23f');
        break; }
      case 'duck': {
        x.fillStyle = '#f7d21a'; x.strokeStyle = '#a6830a'; x.lineWidth = 1.1;
        x.beginPath(); x.ellipse(-r * 0.12, 0, r * 0.85, r * 0.68, 0, 0, 7); x.fill(); x.stroke(); // body
        circle(x, r * 0.5, 0, r * 0.48, '#fbdc3a', '#a6830a', 1.1); // head
        x.fillStyle = '#f28a1d'; x.beginPath(); x.ellipse(r * 0.98, 0, r * 0.26, r * 0.2, 0, 0, 7); x.fill(); x.strokeStyle = '#a45a0a'; x.lineWidth = 0.8; x.stroke();
        circle(x, r * 0.62, -r * 0.22, 1.5, '#111'); circle(x, r * 0.62, r * 0.22, 1.5, '#111');
        x.strokeStyle = 'rgba(200,150,0,.6)'; x.lineWidth = 1; x.beginPath(); x.ellipse(-r * 0.2, -r * 0.3, r * 0.4, r * 0.18, 0.2, 0, 3.4); x.stroke(); x.beginPath(); x.ellipse(-r * 0.2, r * 0.3, r * 0.4, r * 0.18, -0.2, 3, 6.3); x.stroke();
        x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.ellipse(-r * 0.2, -r * 0.1, r * 0.3, r * 0.12, -0.5, 0, 7); x.fill();
        break; }
      case 'soap': {
        shadow(x, r, 'rect');
        const gr = x.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, '#ffc2da'); gr.addColorStop(1, '#f06fa6');
        rr(x, -r, -r * 0.72, r * 2, r * 1.44, r * 0.45); x.fillStyle = gr; x.fill(); x.strokeStyle = '#b8467a'; x.lineWidth = 1.2; x.stroke();
        rr(x, -r * 0.7, -r * 0.42, r * 1.4, r * 0.84, r * 0.3); x.strokeStyle = 'rgba(180,60,110,.45)'; x.lineWidth = 1; x.stroke();
        for (let i = 0; i < 9; i++) { circle(x, (R() - 0.5) * r * 2.1, (R() - 0.5) * r * 1.5, 1.5 + R() * 2.2, 'rgba(255,255,255,.55)', 'rgba(255,255,255,.85)', 0.6); }
        break; }
      case 'bomb': {
        shadow(x, r);
        const gr = x.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r); gr.addColorStop(0, '#ffd6f6'); gr.addColorStop(0.45, '#b66cf0'); gr.addColorStop(1, '#5a2aa8');
        circle(x, 0, 0, r, gr, '#3c1a78', 1.1);
        x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.6; x.beginPath(); x.arc(0, 0, r * 0.6, 0.5, 3.3); x.stroke(); x.beginPath(); x.arc(0, 0, r * 0.35, 3.5, 6.2); x.stroke();
        for (let i = 0; i < 10; i++) { const a = R() * 7, d = Math.sqrt(R()) * r * 0.85; circle(x, Math.cos(a) * d, Math.sin(a) * d, 0.8 + R() * 0.8, '#fff'); }
        break; }
      default: shadow(x, r); circle(x, 0, 0, r, '#999', '#444', 1);
    }
    const fin = softShadow(cv, 7 * PS, 2.4 * PS, 3.6 * PS, 0.4); c = { cv: fin, s: size / PS }; propCache.set(key, c); return c;
  }

  /* ---------------------------------------------------------------- hazards (pads, puddles, ramps) */
  function drawHazard(x, h) { // draws into x at world coords (x already transformed to world)
    x.save(); x.translate(h.x, h.y); x.lineJoin = 'round'; x.lineCap = 'round';
    const r = h.r, R = rng(h.id * 131 + 7);
    if (h.k === 'oil') {
      blob(x, 0, 0, r, h.id * 17 + 3, 0.16, 14); x.fillStyle = '#101018'; x.fill();
      x.save(); x.clip();
      const gr = x.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, 'rgba(120,60,200,.0)'); gr.addColorStop(0.3, 'rgba(70,210,200,.4)'); gr.addColorStop(0.55, 'rgba(230,80,200,.4)'); gr.addColorStop(0.8, 'rgba(240,210,70,.28)'); gr.addColorStop(1, 'rgba(120,60,200,0)');
      x.fillStyle = gr; x.fillRect(-r, -r, 2 * r, 2 * r);
      x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(-r * 0.3, -r * 0.35, r * 0.28, r * 0.1, -0.6, 0, 7); x.fill();
      x.restore(); blob(x, 0, 0, r, h.id * 17 + 3, 0.16, 14); x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 1.5; x.stroke();
    } else if (h.k === 'water') {
      blob(x, 0, 0, r * 1.03, h.id * 19 + 5, 0.14, 14); x.fillStyle = 'rgba(40,110,200,.35)'; x.fill();
      blob(x, 0, 0, r * 0.97, h.id * 19 + 5, 0.14, 14); const gr = x.createRadialGradient(-r * 0.25, -r * 0.3, 2, 0, 0, r); gr.addColorStop(0, 'rgba(190,235,255,.95)'); gr.addColorStop(0.6, 'rgba(100,185,250,.9)'); gr.addColorStop(1, 'rgba(60,140,230,.9)');
      x.fillStyle = gr; x.fill(); x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.4; x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = 1; for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse((R() - 0.5) * r * 0.5, (R() - 0.5) * r * 0.5, r * (0.18 + i * 0.12), r * (0.1 + i * 0.07), R(), 0, 7); x.stroke(); }
    } else if (h.k === 'boost') {
      x.rotate(h.a);
      circle(x, 0, 0, r + 3, 'rgba(255,170,30,.28)'); circle(x, 0, 0, r, '#23262f', '#ffb21a', 2.4);
      x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1; circle(x, 0, 0, r * 0.88, null, 'rgba(255,255,255,.12)', 1);
      for (let i = -1; i <= 1; i++) {
        const ox = i * r * 0.42; x.fillStyle = i === 1 ? '#fff176' : i === 0 ? '#ffc21a' : '#ff9a1a';
        x.beginPath(); x.moveTo(ox - r * 0.22, -r * 0.42); x.lineTo(ox + r * 0.2, 0); x.lineTo(ox - r * 0.22, r * 0.42); x.lineTo(ox - r * 0.1, 0); x.closePath(); x.fill();
      }
    } else if (h.k === 'ramp') {
      x.rotate(h.a);
      const w = r * 1.05, L = r * 1.2;
      x.fillStyle = 'rgba(0,0,0,.35)'; rr(x, -L + 4, -w + 5, L * 2, w * 2, 5); x.fill();
      const gr = x.createLinearGradient(-L, 0, L, 0); gr.addColorStop(0, '#d98a1a'); gr.addColorStop(0.7, '#ffc83a'); gr.addColorStop(1, '#fff0a0');
      rr(x, -L, -w, L * 2, w * 2, 5); x.fillStyle = gr; x.fill(); x.strokeStyle = '#6a4208'; x.lineWidth = 1.6; x.stroke();
      x.save(); rr(x, -L, -w, L * 2, w * 2, 5); x.clip();
      x.fillStyle = 'rgba(30,20,0,.55)'; for (let i = -4; i < 6; i++) { x.beginPath(); x.moveTo(-L + i * 14, -w); x.lineTo(-L + i * 14 + 7, -w); x.lineTo(-L + i * 14 + 7 + w * 0.0, -w + 8); x.lineTo(-L + i * 14, -w + 8); x.closePath(); x.fill(); x.beginPath(); x.moveTo(-L + i * 14, w); x.lineTo(-L + i * 14 + 7, w); x.lineTo(-L + i * 14 + 7, w - 8); x.lineTo(-L + i * 14, w - 8); x.closePath(); x.fill(); }
      x.fillStyle = 'rgba(40,24,0,.75)'; for (let i = 0; i < 3; i++) { const ox = -L * 0.5 + i * L * 0.5; x.beginPath(); x.moveTo(ox - 6, -w * 0.5); x.lineTo(ox + 6, 0); x.lineTo(ox - 6, w * 0.5); x.lineTo(ox - 2, 0); x.closePath(); x.fill(); }
      x.fillStyle = '#7a4a0a'; x.fillRect(L - 6, -w, 6, w * 2);
      x.restore();
    }
    x.restore();
  }


  // item icons (kind 1 missile, 2 oil slick, 3 turbo) centered at cx,cy; r = half size in px
  function itemIcon(ctx, kind, cx, cy, r) {
    ctx.save(); ctx.translate(cx, cy); ctx.lineWidth = Math.max(1, r * 0.12); ctx.strokeStyle = '#10121f'; ctx.lineJoin = 'round';
    if (kind === 1) { // rocket pointing up-right
      ctx.rotate(-0.7);
      ctx.fillStyle = '#ff9a1f'; ctx.beginPath(); ctx.moveTo(-r * 0.25, r * 0.55); ctx.lineTo(0, r * 1.0); ctx.lineTo(r * 0.25, r * 0.55); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8ecf6'; ctx.beginPath(); ctx.moveTo(0, -r * 0.95); ctx.quadraticCurveTo(r * 0.38, -r * 0.4, r * 0.3, r * 0.55); ctx.lineTo(-r * 0.3, r * 0.55); ctx.quadraticCurveTo(-r * 0.38, -r * 0.4, 0, -r * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8372c'; ctx.beginPath(); ctx.moveTo(0, -r * 0.95); ctx.quadraticCurveTo(r * 0.3, -r * 0.6, r * 0.27, -r * 0.3); ctx.lineTo(-r * 0.27, -r * 0.3); ctx.quadraticCurveTo(-r * 0.3, -r * 0.6, 0, -r * 0.95); ctx.fill();
      ctx.fillStyle = '#e8372c'; ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.2); ctx.lineTo(-r * 0.62, r * 0.7); ctx.lineTo(-r * 0.3, r * 0.55); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(r * 0.3, r * 0.2); ctx.lineTo(r * 0.62, r * 0.7); ctx.lineTo(r * 0.3, r * 0.55); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5ec8ff'; ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 2) { // oil drop
      ctx.fillStyle = '#1b1530'; ctx.beginPath(); ctx.moveTo(0, -r * 0.95); ctx.bezierCurveTo(r * 0.2, -r * 0.4, r * 0.8, 0, r * 0.7, r * 0.4); ctx.bezierCurveTo(r * 0.6, r * 0.95, -r * 0.6, r * 0.95, -r * 0.7, r * 0.4); ctx.bezierCurveTo(-r * 0.8, 0, -r * 0.2, -r * 0.4, 0, -r * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b57cff'; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.ellipse(-r * 0.28, r * 0.25, r * 0.12, r * 0.28, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    } else if (kind === 3) { // turbo bolt
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(r * 0.3, -r); ctx.lineTo(-r * 0.6, r * 0.12); ctx.lineTo(-r * 0.05, r * 0.12); ctx.lineTo(-r * 0.3, r); ctx.lineTo(r * 0.65, -r * 0.2); ctx.lineTo(r * 0.08, -r * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  TT.gfx = { softShadow, carShadow, itemIcon, CAR_COLORS, CAR_STYLES, shade, mk, hash, rng, drawText, textWidth, carSprite, propSprite, drawHazard, blob, rr, circle, CAR_W, CAR_H };
})(window);
