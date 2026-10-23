/* Tiny Turbo - themed scenery props (render-only, baked into the track bitmap). Cereal boxes, tools, beach toys, bath toys... all drawn in code. */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});
  const G = TT.gfx; const { mk, rr, circle, blob, rng, shade } = G;
  const TAU = Math.PI * 2;
  const DS = 2; // sprite supersample (world units -> pixels)
  const cache = new Map();
  const PAL = ['#e5473b', '#f4a12b', '#3b82e0', '#4cb050', '#8b45d6', '#f067b4'];

  const gradLin = (x, x0, y0, x1, y1, stops) => { const gr = x.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s)); return gr; };
  const shine = (x, cx, cy, rx, ry, rot, a) => { x.fillStyle = 'rgba(255,255,255,' + (a || 0.5) + ')'; x.beginPath(); x.ellipse(cx, cy, rx, ry, rot || -0.6, 0, TAU); x.fill(); };
  const line = (x, pts, col, w) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); };

  // kind -> { r: half extent, flat: no drop shadow, draw(x, R, v) } ; drawn centered at 0,0, facing +x
  const D = {
    /* ---- breakfast */
    cereal: { r: 40, draw(x, R, v) {
      const col = PAL[v % 4], W = 70, H = 46;
      rr(x, -W / 2, -H / 2, W, H, 3); x.fillStyle = gradLin(x, 0, -H / 2, 0, H / 2, [shade(col, 0.25), col, shade(col, -0.25)]); x.fill(); x.strokeStyle = shade(col, -0.6); x.lineWidth = 1.4; x.stroke();
      rr(x, -W / 2 + 5, -H / 2 + 5, W - 10, H - 10, 3); x.fillStyle = 'rgba(255,255,255,.22)'; x.fill();
      circle(x, -8, 0, 13, '#fffdf7', '#d9cfbd', 1.2); circle(x, -8, 0, 9.5, '#f4efe4'); for (let i = 0; i < 9; i++) { const a = i * 2.4, d = 3 + (i % 3) * 2.6; circle(x, -8 + Math.cos(a) * d, Math.sin(a) * d, 2.4, null, '#d99a3d', 1.4); }
      x.fillStyle = '#fff'; x.font = 'bold 11px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(10, -13, 18, 4); x.fillRect(10, -5, 14, 3); x.fillRect(10, 1, 18, 3); x.fillStyle = '#ffd23f'; x.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, r = i % 2 ? 3.5 : 7; x.lineTo(21 + Math.cos(a) * r, 12 + Math.sin(a) * r * 0.9); } x.fill();
      line(x, [[-W / 2, -H / 2 + 3], [W / 2, -H / 2 + 3]], 'rgba(0,0,0,.25)', 1.2); line(x, [[-W / 2, H / 2 - 3], [W / 2, H / 2 - 3]], 'rgba(0,0,0,.25)', 1.2);
    } },
    spoon: { r: 36, draw(x, R) {
      const L = 70; x.fillStyle = gradLin(x, 0, -4, 0, 4, ['#f4f6f9', '#aab2bd', '#e6e9ee']); x.beginPath(); x.moveTo(-L / 2 + 20, -2.2); x.quadraticCurveTo(0, -3.4, L / 2 - 20, -4.5); x.lineTo(L / 2 - 20, 4.5); x.quadraticCurveTo(0, 3.4, -L / 2 + 20, 2.2); x.closePath(); x.fill(); x.strokeStyle = '#7b838e'; x.lineWidth = 0.9; x.stroke();
      x.beginPath(); x.ellipse(L / 2 - 8, 0, 14, 10, 0, 0, TAU); x.fillStyle = gradLin(x, L / 2 - 20, -10, L / 2 + 6, 10, ['#f4f6f9', '#b9c0ca', '#dde1e7']); x.fill(); x.stroke(); x.beginPath(); x.ellipse(L / 2 - 8, 0, 10.5, 7, 0, 0, TAU); x.fillStyle = '#e8ebf0'; x.fill(); shine(x, L / 2 - 12, -3, 5, 2, -0.3, 0.8);
      x.beginPath(); x.ellipse(-L / 2 + 3, 0, 6, 4.5, 0, 0, TAU); x.fillStyle = '#d4d9e0'; x.fill(); x.stroke();
    } },
    milk: { r: 38, flat: 1, draw(x, R, v) {
      blob(x, 0, 0, 30, v * 13 + 5, 0.3, 11); x.fillStyle = 'rgba(250,252,255,.94)'; x.fill(); x.strokeStyle = 'rgba(160,185,215,.9)'; x.lineWidth = 1.6; x.stroke();
      blob(x, -2, -2, 22, v * 13 + 9, 0.2, 9); x.fillStyle = 'rgba(255,255,255,.7)'; x.fill(); shine(x, -10, -12, 9, 3.5, -0.6, 0.9);
      for (let i = 0; i < 5; i++) { const a = R() * TAU, d = 31 + R() * 6; circle(x, Math.cos(a) * d, Math.sin(a) * d, 1.6 + R() * 3, 'rgba(250,252,255,.94)', 'rgba(160,185,215,.8)', 1); }
    } },
    toast: { r: 30, draw(x, R) {
      const S = 46; x.beginPath(); x.moveTo(-S / 2, S / 2 - 6); x.quadraticCurveTo(-S / 2 - 4, -S / 2 + 6, -S / 2 + 10, -S / 2 + 2); x.quadraticCurveTo(-5, -S / 2 - 6, 0, -S / 2 - 1); x.quadraticCurveTo(5, -S / 2 - 6, S / 2 - 10, -S / 2 + 2); x.quadraticCurveTo(S / 2 + 4, -S / 2 + 6, S / 2, S / 2 - 6); x.quadraticCurveTo(S / 2, S / 2, S / 2 - 6, S / 2); x.lineTo(-S / 2 + 6, S / 2); x.quadraticCurveTo(-S / 2, S / 2, -S / 2, S / 2 - 6); x.closePath();
      x.fillStyle = '#b8782e'; x.fill(); x.strokeStyle = '#7a4a16'; x.lineWidth = 1.2; x.stroke(); x.save(); x.scale(0.84, 0.84); x.fillStyle = '#e8b86a'; x.fill(); x.restore();
      for (let i = 0; i < 20; i++) circle(x, (R() - 0.5) * 30, (R() - 0.5) * 30, 0.8 + R(), 'rgba(150,95,30,.35)'); rr(x, -6, -5, 13, 10, 2); x.fillStyle = '#ffe58a'; x.fill(); x.strokeStyle = '#d8b84a'; x.lineWidth = 0.8; x.stroke(); shine(x, -3, -2, 3.5, 1.4, -0.3, 0.8);
    } },
    cheerios: { r: 30, draw(x, R) { for (let i = 0; i < 11; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 24, cx = Math.cos(a) * d, cy = Math.sin(a) * d; circle(x, cx, cy, 5.6, null, '#b8742a', 4.2); circle(x, cx, cy, 5.6, null, '#e0a54a', 2.8); circle(x, cx, cy, 4.4, null, 'rgba(255,240,200,.55)', 0.8); } } },
    glass: { r: 22, draw(x) {
      circle(x, 0, 0, 20, 'rgba(235,245,255,.9)', '#9fb4c8', 1.6); circle(x, 0, 0, 17, '#ff9f1a'); const gr = x.createRadialGradient(-5, -5, 2, 0, 0, 17); gr.addColorStop(0, 'rgba(255,230,120,.9)'); gr.addColorStop(1, 'rgba(255,120,0,.2)'); circle(x, 0, 0, 17, gr); circle(x, 0, 0, 17, null, 'rgba(255,255,255,.7)', 1); shine(x, -8, -9, 7, 2.6, -0.8, 0.85); circle(x, 5, 5, 2.4, 'rgba(255,255,255,.5)');
    } },
    napkin: { r: 32, draw(x, R, v) { const S = 52; x.save(); x.rotate(0.2); rr(x, -S / 2, -S / 2, S, S, 2); x.fillStyle = '#fbf3f0'; x.fill(); x.strokeStyle = '#d9a9a0'; x.lineWidth = 1; x.stroke(); rr(x, -S / 2 + 4, -S / 2 + 4, S - 8, S - 8, 1); x.strokeStyle = PAL[v % 3] + '99'; x.lineWidth = 1.4; x.stroke(); line(x, [[-S / 2, 0], [S / 2, 0]], 'rgba(0,0,0,.14)', 1); line(x, [[0, -S / 2], [0, S / 2]], 'rgba(0,0,0,.14)', 1); x.restore(); } },
    /* ---- workbench */
    hammer: { r: 38, draw(x) {
      rr(x, -34, -3.6, 52, 7.2, 3); x.fillStyle = gradLin(x, 0, -3.6, 0, 3.6, ['#d9a566', '#b57a38', '#8c5a22']); x.fill(); x.strokeStyle = '#5b3a14'; x.lineWidth = 1; x.stroke();
      line(x, [[-30, -1], [10, -1]], 'rgba(255,255,255,.25)', 0.8);
      rr(x, 14, -7, 11, 14, 1.5); x.fillStyle = gradLin(x, 14, -7, 25, 7, ['#d5dae1', '#7e8794', '#4d5560']); x.fill(); x.strokeStyle = '#2f353d'; x.lineWidth = 1; x.stroke();
      x.beginPath(); x.moveTo(25, -5); x.quadraticCurveTo(34, -9, 38, -3); x.lineTo(34, -1); x.quadraticCurveTo(30, -4, 25, -2); x.closePath(); x.fillStyle = '#9aa3af'; x.fill(); x.stroke(); x.beginPath(); x.moveTo(25, 5); x.quadraticCurveTo(34, 9, 38, 3); x.lineTo(34, 1); x.quadraticCurveTo(30, 4, 25, 2); x.closePath(); x.fill(); x.stroke();
      shine(x, 18, -3.4, 3, 1.1, 0, 0.6);
    } },
    wrench: { r: 36, draw(x) {
      const gr = gradLin(x, 0, -5, 0, 5, ['#e8ecf1', '#a3acb8', '#6f7885']); x.fillStyle = gr; x.strokeStyle = '#3a414a'; x.lineWidth = 1.1;
      rr(x, -30, -4.4, 46, 8.8, 4); x.fill(); x.stroke(); circle(x, -29, 0, 5.4, gr, '#3a414a', 1.1); circle(x, -29, 0, 2.6, '#5b3a14', '#3a414a', 0.8);
      x.beginPath(); x.arc(22, 0, 11, 0, TAU); x.fill(); x.stroke(); x.fillStyle = '#7a5a38'; x.beginPath(); x.moveTo(18, -4.2); x.lineTo(34, -4.2); x.lineTo(34, 4.2); x.lineTo(18, 4.2); x.lineTo(15, 0); x.closePath(); x.fill(); x.strokeStyle = '#3a414a'; x.stroke(); shine(x, 22, -7, 5, 1.4, 0, 0.5);
    } },
    screwdriver: { r: 34, draw(x, R, v) {
      const col = PAL[v % 4]; rr(x, -32, -5.2, 26, 10.4, 5); x.fillStyle = gradLin(x, 0, -5, 0, 5, [shade(col, 0.35), col, shade(col, -0.4)]); x.fill(); x.strokeStyle = shade(col, -0.65); x.lineWidth = 1; x.stroke();
      for (let k = -28; k < -8; k += 4.5) line(x, [[k, -4.5], [k, 4.5]], 'rgba(0,0,0,.18)', 1);
      rr(x, -6, -2, 36, 4, 1.4); x.fillStyle = gradLin(x, 0, -2, 0, 2, ['#f0f2f5', '#9099a5', '#c6ccd4']); x.fill(); x.strokeStyle = '#4a525c'; x.lineWidth = 0.8; x.stroke(); rr(x, 28, -2.6, 5, 5.2, 1); x.fillStyle = '#7b838e'; x.fill();
    } },
    nut: { r: 14, draw(x) { x.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; x.lineTo(Math.cos(a) * 10, Math.sin(a) * 10); } x.closePath(); x.fillStyle = gradLin(x, -10, -10, 10, 10, ['#f4f6f9', '#a3acb8', '#6a7380']); x.fill(); x.strokeStyle = '#3a414a'; x.lineWidth = 1; x.stroke(); circle(x, 0, 0, 4.4, '#6a5a44', '#3a414a', 0.9); circle(x, 0, 0, 6.5, null, 'rgba(255,255,255,.4)', 0.8); } },
    screw: { r: 16, draw(x, R, v) { rr(x, -2, -2.2, 14, 4.4, 1); x.fillStyle = '#9aa3af'; x.fill(); x.strokeStyle = '#4a525c'; x.lineWidth = 0.7; x.stroke(); for (let k = 0; k < 12; k += 2) line(x, [[-1 + k, -2.2], [1 + k, 2.2]], 'rgba(0,0,0,.35)', 0.7); circle(x, -4, 0, 4.8, '#c3cad3', '#4a525c', 0.9); line(x, [[-6.6, 0.8], [-1.6, -0.8]], '#3a414a', 1.2); } },
    tape: { r: 24, draw(x, R, v) {
      const col = ['#f2c21a', '#3b82e0', '#e5473b', '#4cb050'][v % 4]; rr(x, 8, 11, 34, 11, 1); x.fillStyle = col; x.fill(); x.strokeStyle = shade(col, -0.5); x.lineWidth = 0.9; x.stroke(); line(x, [[12, 15], [38, 15]], 'rgba(255,255,255,.4)', 1);
      circle(x, 0, 0, 19, col, shade(col, -0.5), 1.3); circle(x, 0, 0, 14.5, null, 'rgba(0,0,0,.18)', 1); circle(x, 0, 0, 11, '#c9b88f', '#8a7a52', 1.2); circle(x, 0, 0, 8.5, '#4a3d28'); shine(x, -8, -9, 7, 2.2, -0.8, 0.5);
    } },
    pencil: { r: 32, draw(x) {
      rr(x, -30, -3.4, 46, 6.8, 1); x.fillStyle = gradLin(x, 0, -3.4, 0, 3.4, ['#ffe46a', '#f4c21a', '#c99a0a']); x.fill(); x.strokeStyle = '#7a5a0a'; x.lineWidth = 0.9; x.stroke(); line(x, [[-28, -1], [14, -1]], 'rgba(255,255,255,.5)', 0.8);
      x.beginPath(); x.moveTo(16, -3.4); x.lineTo(28, -0.9); x.lineTo(28, 0.9); x.lineTo(16, 3.4); x.closePath(); x.fillStyle = '#e8c48f'; x.fill(); x.stroke(); x.beginPath(); x.moveTo(25, -1.1); x.lineTo(30, 0); x.lineTo(25, 1.1); x.fillStyle = '#2a2d38'; x.fill();
      rr(x, -34, -3.4, 6, 6.8, 1); x.fillStyle = '#f08ab0'; x.fill(); x.strokeStyle = '#a44a6a'; x.stroke(); rr(x, -29, -3.4, 2.5, 6.8, 0); x.fillStyle = '#b8bec8'; x.fill();
    } },
    ruler: { r: 40, draw(x) { const W = 76; rr(x, -W / 2, -7, W, 14, 1.2); x.fillStyle = gradLin(x, 0, -7, 0, 7, ['#f8e6b0', '#e8cf86']); x.fill(); x.strokeStyle = '#8a6a22'; x.lineWidth = 1; x.stroke(); for (let k = 0; k <= 30; k++) line(x, [[-W / 2 + 4 + k * 2.3, -7], [-W / 2 + 4 + k * 2.3, k % 5 === 0 ? -1 : -4]], '#5a4310', 0.7); x.fillStyle = '#5a4310'; x.font = 'bold 5px sans-serif'; x.textAlign = 'center'; for (let k = 1; k < 7; k++) x.fillText(k, -W / 2 + 4 + k * 11.5, 4); } },
    sawdust: { r: 26, flat: 1, draw(x, R, v) { blob(x, 0, 0, 22, v * 7 + 3, 0.3, 10); x.fillStyle = 'rgba(224,190,130,.8)'; x.fill(); for (let i = 0; i < 40; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 26; x.fillStyle = ['#e8c98f', '#c9a566', '#f2dcaa'][i % 3]; x.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1.4, 1); } } },
    paint: { r: 30, flat: 1, draw(x, R, v) { const col = PAL[(v + 2) % 6]; blob(x, 0, 0, 16, v * 9 + 2, 0.35, 10); x.fillStyle = col; x.fill(); for (let i = 0; i < 7; i++) { const a = R() * TAU, d = 18 + R() * 12; circle(x, Math.cos(a) * d, Math.sin(a) * d, 1.5 + R() * 3, col); line(x, [[0, 0], [Math.cos(a) * d * 0.9, Math.sin(a) * d * 0.9]], col, 2 + R() * 2); } shine(x, -5, -5, 6, 2, -0.6, 0.45); } },
    /* ---- sandbox */
    beachball: { r: 26, draw(x) {
      const cols = ['#e5473b', '#ffffff', '#f4c21a', '#ffffff', '#3b82e0', '#ffffff']; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 24, i / 6 * TAU, (i + 1) / 6 * TAU); x.closePath(); x.fillStyle = cols[i]; x.fill(); }
      circle(x, 0, 0, 24, null, '#6b6f7a', 1.2); circle(x, 0, 0, 4.4, '#fff', '#9aa0aa', 1); const gr = x.createRadialGradient(-8, -8, 2, 0, 0, 24); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.22)'); circle(x, 0, 0, 24, gr);
    } },
    sandcastle: { r: 38, draw(x, R, v) {
      const sand = '#dcbf80', dark = '#a8864a'; circle(x, 0, 0, 30, sand, dark, 1.4); circle(x, 0, 0, 24, null, 'rgba(120,90,40,.4)', 1.2);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.8; const tx = Math.cos(a) * 24, ty = Math.sin(a) * 24; circle(x, tx, ty, 9, sand, dark, 1.2); circle(x, tx, ty, 5.6, null, 'rgba(120,90,40,.45)', 1); for (let k = 0; k < 6; k++) { const b = k / 6 * TAU; x.fillStyle = dark; x.fillRect(tx + Math.cos(b) * 8 - 1, ty + Math.sin(b) * 8 - 1, 2, 2); } }
      circle(x, 0, 0, 14, '#e8cd8e', dark, 1.2); circle(x, 0, 0, 9, '#d4b676'); shine(x, -3, -4, 5, 2, -0.5, 0.3);
      x.strokeStyle = '#6b4a2a'; x.lineWidth = 1.2; line(x, [[0, 0], [0, -14]], '#6b4a2a', 1.2); x.fillStyle = '#e5473b'; x.beginPath(); x.moveTo(0, -14); x.lineTo(11, -10); x.lineTo(0, -6); x.closePath(); x.fill(); x.strokeStyle = '#7a1d14'; x.lineWidth = 0.8; x.stroke();
    } },
    spade: { r: 38, draw(x, R, v) {
      const col = ['#f4c21a', '#e5473b', '#3b82e0'][v % 3]; rr(x, -34, -2.8, 38, 5.6, 2.5); x.fillStyle = col; x.fill(); x.strokeStyle = shade(col, -0.6); x.lineWidth = 1; x.stroke(); rr(x, -37, -8, 7, 16, 3.5); x.fillStyle = shade(col, 0.15); x.fill(); x.stroke(); rr(x, -35, -5, 3, 10, 1.5); x.fillStyle = 'rgba(0,0,0,.25)'; x.fill();
      x.beginPath(); x.moveTo(2, -4); x.quadraticCurveTo(6, -17, 24, -15); x.quadraticCurveTo(38, -8, 38, 0); x.quadraticCurveTo(38, 8, 24, 15); x.quadraticCurveTo(6, 17, 2, 4); x.closePath(); x.fillStyle = gradLin(x, 0, -14, 0, 14, [shade(col, 0.3), col, shade(col, -0.25)]); x.fill(); x.stroke(); line(x, [[8, 0], [30, 0]], 'rgba(0,0,0,.2)', 1); shine(x, 14, -8, 7, 2, 0.1, 0.55);
    } },
    starfish: { r: 26, draw(x, R, v) {
      const col = ['#f08a3a', '#f0627a'][v % 2]; x.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 7 : 24; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.lineJoin = 'round'; x.fillStyle = gradLin(x, -20, -20, 20, 20, [shade(col, 0.3), col, shade(col, -0.25)]); x.fill(); x.lineWidth = 5; x.strokeStyle = col; x.stroke(); x.lineWidth = 1; x.strokeStyle = shade(col, -0.5); x.stroke();
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - Math.PI / 2; for (let k = 1; k < 5; k++) circle(x, Math.cos(a) * k * 4.4, Math.sin(a) * k * 4.4, 1, shade(col, 0.55)); }
    } },
    shell: { r: 18, draw(x, R, v) {
      const col = ['#f4c8b8', '#f0e0c0'][v % 2]; x.beginPath(); x.moveTo(-10, 0); for (let i = 0; i <= 8; i++) { const a = -1.2 + i / 8 * 2.4; x.lineTo(Math.cos(a) * 17, Math.sin(a) * 17); } x.closePath(); x.fillStyle = gradLin(x, -10, -14, 16, 14, [shade(col, 0.4), col, shade(col, -0.2)]); x.fill(); x.strokeStyle = shade(col, -0.45); x.lineWidth = 1; x.stroke();
      for (let i = 0; i <= 6; i++) { const a = -1.1 + i / 6 * 2.2; line(x, [[-9, 0], [Math.cos(a) * 16, Math.sin(a) * 16]], shade(col, -0.35), 0.8); } rr(x, -13, -3, 6, 6, 2); x.fillStyle = shade(col, -0.1); x.fill();
    } },
    blocks: { r: 28, draw(x, R, v) {
      const spots = [[-9, -7, 0.3], [9, -4, -0.2], [-1, 10, 0.1]]; spots.forEach((s, i) => { const col = PAL[(v + i * 2) % 6]; x.save(); x.translate(s[0], s[1]); x.rotate(s[2]); x.shadowColor = 'rgba(0,0,0,0)'; rr(x, -9, -9, 18, 18, 2); x.fillStyle = gradLin(x, -9, -9, 9, 9, [shade(col, 0.4), col, shade(col, -0.3)]); x.fill(); x.strokeStyle = shade(col, -0.6); x.lineWidth = 1; x.stroke(); rr(x, -6, -6, 12, 12, 1.5); x.strokeStyle = 'rgba(255,255,255,.4)'; x.stroke(); x.fillStyle = 'rgba(255,255,255,.92)'; x.font = 'bold 9px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ABCDEF'[(v + i * 2) % 6], 0, 0.5); x.restore(); });
    } },
    flower: { r: 22, flat: 1, draw(x, R, v) {
      for (let i = 0; i < 6; i++) { x.save(); x.rotate(i / 6 * TAU + 0.2); x.fillStyle = i % 2 ? '#3f9b3a' : '#56b84a'; x.beginPath(); x.ellipse(11, 0, 10, 3.6, 0, 0, TAU); x.fill(); x.restore(); }
      const col = ['#ffffff', '#f067b4', '#ffd23f', '#9bb4ff'][v % 4]; for (let i = 0; i < 5; i++) { x.save(); x.rotate(i / 5 * TAU); x.fillStyle = col; x.beginPath(); x.ellipse(5.6, 0, 5.6, 3.8, 0, 0, TAU); x.fill(); x.strokeStyle = 'rgba(0,0,0,.2)'; x.lineWidth = 0.6; x.stroke(); x.restore(); } circle(x, 0, 0, 3.2, col === '#ffd23f' ? '#e5473b' : '#ffd23f');
    } },
    /* ---- bathtub */
    sponge: { r: 32, draw(x, R) {
      rr(x, -26, -17, 52, 34, 8); x.fillStyle = gradLin(x, 0, -17, 0, 17, ['#fff07a', '#f4d21a', '#d6aa0a']); x.fill(); x.strokeStyle = '#8a6a0a'; x.lineWidth = 1.2; x.stroke();
      for (let i = 0; i < 26; i++) circle(x, -23 + R() * 46, -14 + R() * 28, 0.8 + R() * 2.2, 'rgba(150,110,10,.5)', 'rgba(255,240,150,.4)', 0.6);
      x.save(); rr(x, -26, -17, 52, 34, 8); x.clip(); x.fillStyle = '#3fae5a'; x.fillRect(-26, 5, 52, 12); for (let i = 0; i < 16; i++) circle(x, -24 + i * 3.2, 8 + (i % 3) * 3, 1, 'rgba(255,255,255,.35)'); x.restore(); line(x, [[-24, 5], [24, 5]], '#1f7a38', 1.2); shine(x, -12, -11, 8, 2.4, 0, 0.5);
    } },
    towel: { r: 46, draw(x, R, v) {
      const col = ['#3b82e0', '#f067b4', '#4cb050'][v % 3]; const W = 84, H = 56; x.save(); x.rotate(0.12);
      rr(x, -W / 2, -H / 2, W, H, 6); x.fillStyle = '#f7fbff'; x.fill(); x.strokeStyle = '#9db0c0'; x.lineWidth = 1.2; x.stroke(); x.save(); rr(x, -W / 2, -H / 2, W, H, 6); x.clip(); x.fillStyle = col; x.fillRect(-W / 2, -H / 2 + 8, W, 6); x.fillRect(-W / 2, -H / 2 + 17, W, 3); x.fillRect(-W / 2, H / 2 - 14, W, 3); x.fillRect(-W / 2, H / 2 - 9, W, 6); x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(-W / 2, -2, W, 4); x.restore();
      for (let i = 0; i < 18; i++) line(x, [[-W / 2 + 3 + i * 4.6, -H / 2], [-W / 2 + 3 + i * 4.6, -H / 2 - 3]], '#dfe8f0', 1); for (let k = 0; k < 8; k++) line(x, [[-W / 2, -H / 2 + 4 + k * 7], [W / 2, -H / 2 + 5 + k * 7]], 'rgba(150,170,190,.18)', 1); x.restore();
    } },
    shampoo: { r: 20, draw(x, R, v) { const col = PAL[(v + 3) % 6]; circle(x, 0, 0, 16, shade(col, 0.15), shade(col, -0.55), 1.3); circle(x, 0, 0, 12.5, col, shade(col, -0.35), 1); circle(x, 0, 0, 6, shade(col, 0.4), shade(col, -0.4), 1); rr(x, 2, -2.2, 18, 4.4, 2); x.fillStyle = shade(col, 0.2); x.fill(); x.strokeStyle = shade(col, -0.55); x.lineWidth = 1; x.stroke(); shine(x, -6, -7, 5, 1.8, -0.8, 0.6); } },
    boat: { r: 34, draw(x, R, v) {
      const col = PAL[v % 4]; x.beginPath(); x.moveTo(34, 0); x.quadraticCurveTo(24, -14, -4, -15); x.lineTo(-24, -13); x.quadraticCurveTo(-30, 0, -24, 13); x.lineTo(-4, 15); x.quadraticCurveTo(24, 14, 34, 0); x.closePath(); x.fillStyle = gradLin(x, 0, -15, 0, 15, [shade(col, 0.35), col, shade(col, -0.3)]); x.fill(); x.strokeStyle = shade(col, -0.6); x.lineWidth = 1.3; x.stroke();
      x.beginPath(); x.moveTo(26, 0); x.quadraticCurveTo(18, -9, -2, -10); x.lineTo(-18, -9); x.quadraticCurveTo(-23, 0, -18, 9); x.lineTo(-2, 10); x.quadraticCurveTo(18, 9, 26, 0); x.fillStyle = '#f4d9a0'; x.fill(); x.strokeStyle = '#9a7a3a'; x.lineWidth = 0.8; x.stroke(); rr(x, -12, -6, 14, 12, 3); x.fillStyle = '#fff'; x.fill(); x.strokeStyle = '#8a929c'; x.stroke(); rr(x, -9, -3.5, 8, 7, 2); x.fillStyle = '#7ab8f0'; x.fill(); rr(x, 4, -2, 5, 4, 1); x.fillStyle = '#e5473b'; x.fill(); shine(x, 14, -8, 6, 1.6, 0.1, 0.5);
    } },
    bubbles: { r: 30, flat: 1, draw(x, R, v) {
      const n = 6 + (v % 3) * 2; for (let i = 0; i < n; i++) { const a = R() * TAU, d = Math.sqrt(R()) * 22, r = 4 + R() * 11, cx = Math.cos(a) * d, cy = Math.sin(a) * d; const gr = x.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.7, 'rgba(210,240,255,.4)'); gr.addColorStop(1, 'rgba(255,190,240,.45)'); circle(x, cx, cy, r, gr, 'rgba(255,255,255,.95)', 1.2); circle(x, cx, cy, r * 0.8, null, 'rgba(150,220,255,.4)', 0.8); shine(x, cx - r * 0.35, cy - r * 0.4, r * 0.28, r * 0.14, -0.7, 0.95); }
    } },
    ducky: { r: 26, draw(x, R) { // decor rubber duck (bigger)
      const r = 24; x.fillStyle = '#f7d21a'; x.strokeStyle = '#a6830a'; x.lineWidth = 1.3; x.beginPath(); x.ellipse(-r * 0.12, 0, r * 0.85, r * 0.68, 0, 0, TAU); x.fill(); x.stroke(); circle(x, r * 0.5, 0, r * 0.48, '#fbdc3a', '#a6830a', 1.3);
      x.fillStyle = '#f28a1d'; x.beginPath(); x.ellipse(r * 0.98, 0, r * 0.26, r * 0.2, 0, 0, TAU); x.fill(); x.strokeStyle = '#a45a0a'; x.lineWidth = 0.9; x.stroke(); circle(x, r * 0.62, -r * 0.22, 1.7, '#111'); circle(x, r * 0.62, r * 0.22, 1.7, '#111');
      x.strokeStyle = 'rgba(200,150,0,.7)'; x.lineWidth = 1.1; x.beginPath(); x.ellipse(-r * 0.2, -r * 0.3, r * 0.4, r * 0.18, 0.2, 0, 3.4); x.stroke(); x.beginPath(); x.ellipse(-r * 0.2, r * 0.3, r * 0.4, r * 0.18, -0.2, 3, 6.3); x.stroke(); shine(x, -r * 0.2, -r * 0.1, r * 0.3, r * 0.12, -0.5, 0.55);
    } },
    soapbar: { r: 24, draw(x, R, v) { const c1 = ['#ffc2da', '#c2e8ff', '#d8ffc2'][v % 3], c2 = ['#f06fa6', '#5fb0e8', '#7ad056'][v % 3]; rr(x, -22, -15, 44, 30, 9); x.fillStyle = gradLin(x, -22, -15, 22, 15, [c1, c2]); x.fill(); x.strokeStyle = shade(c2, -0.4); x.lineWidth = 1.2; x.stroke(); rr(x, -15, -9, 30, 18, 6); x.strokeStyle = 'rgba(0,0,0,.18)'; x.stroke(); for (let i = 0; i < 6; i++) circle(x, (R() - 0.5) * 40, (R() - 0.5) * 26, 1.5 + R() * 2, 'rgba(255,255,255,.6)', 'rgba(255,255,255,.9)', 0.6); shine(x, -10, -9, 7, 2, 0, 0.5); } }
  };

  const THEME_DECOR = { // [kind, weight, scale min, scale max]
    breakfast: { margin: 20, count: 120, list: [['cereal', 3, 0.9, 1.35], ['spoon', 3, 0.9, 1.4], ['milk', 3, 0.8, 1.6], ['toast', 2, 0.9, 1.3], ['cheerios', 5, 0.8, 1.3], ['glass', 2, 0.9, 1.3], ['napkin', 2, 0.9, 1.3]] },
    workbench: { margin: 26, count: 130, list: [['hammer', 2, 1, 1.5], ['wrench', 3, 0.9, 1.5], ['screwdriver', 3, 0.9, 1.4], ['nut', 5, 0.8, 1.3], ['screw', 5, 0.8, 1.2], ['tape', 3, 0.9, 1.3], ['pencil', 3, 0.9, 1.3], ['ruler', 2, 0.9, 1.3], ['sawdust', 3, 0.8, 1.5], ['paint', 2, 0.8, 1.4]] },
    sandbox: { margin: 30, count: 120, list: [['beachball', 2, 0.9, 1.4], ['sandcastle', 2, 1, 1.5], ['spade', 3, 0.9, 1.4], ['starfish', 3, 0.7, 1.2], ['shell', 5, 0.8, 1.3], ['blocks', 3, 0.9, 1.4], ['flower', 6, 0.8, 1.4]] },
    bathtub: { margin: 36, count: 110, list: [['sponge', 3, 0.9, 1.4], ['towel', 2, 1, 1.5], ['shampoo', 3, 0.9, 1.4], ['boat', 2, 0.9, 1.3], ['ducky', 3, 0.8, 1.4], ['soapbar', 3, 0.9, 1.3], ['bubbles', 6, 0.8, 1.5]] }
  };

  function sprite(kind, v) {
    const key = kind + ':' + v; let s = cache.get(key); if (s) return s;
    const d = D[kind]; const ext = d.r + 14; const size = Math.ceil(ext * 2 * DS); const cv = mk(size, size); const x = cv.getContext('2d');
    x.scale(DS, DS); x.translate(ext, ext); x.lineJoin = 'round'; x.lineCap = 'round';
    d.draw(x, rng(v * 7919 + kind.length * 131 + kind.charCodeAt(0)), v);
    const out = d.flat ? cv : G.softShadow(cv, 6 * DS, 2.4 * DS, 3.6 * DS, 0.38);
    s = { cv: out, ext, r: d.r }; cache.set(key, s); return s;
  }

  // scatter props over the area around the track (never on the driving surface); everything is seeded so every client sees the same scenery
  function place(x, T, B, theme) {
    const cfg = THEME_DECOR[theme]; if (!cfg) return 0;
    const R = rng((T.seed || 1) * 7 + 99); const b = T.bounds;
    const rim = (theme === 'sandbox' ? T.limit : theme === 'workbench' ? T.hw + 20 : theme === 'bathtub' ? T.hw + 26 : T.hw + 11) + cfg.margin * 0.4;
    const pts = []; for (let i = 0; i < T.n; i += 3) pts.push(T.px[i], T.py[i]);
    const minDist = (px, py) => { let m = 1e12; for (let i = 0; i < pts.length; i += 2) { const dx = pts[i] - px, dy = pts[i + 1] - py; const d = dx * dx + dy * dy; if (d < m) m = d; } return Math.sqrt(m); };
    const tot = cfg.list.reduce((a, l) => a + l[1], 0);
    const placed = []; let tries = 0;
    while (placed.length < cfg.count && tries < cfg.count * 40) {
      tries++;
      let pick = R() * tot, e = cfg.list[0]; for (const l of cfg.list) { pick -= l[1]; if (pick <= 0) { e = l; break; } }
      const sc = e[2] + R() * (e[3] - e[2]), rad = D[e[0]].r * sc * 0.82;
      let px, py;
      if (R() < 0.7) { const i = (R() * T.n) | 0, side = R() < 0.5 ? -1 : 1, dd = rim + rad + 6 + R() * 150; px = T.px[i] + T.nx[i] * dd * side; py = T.py[i] + T.ny[i] * dd * side; }
      else { px = b.x0 + 20 + R() * (b.x1 - b.x0 - 40); py = b.y0 + 20 + R() * (b.y1 - b.y0 - 40); }
      if (px < b.x0 + rad || px > b.x1 - rad || py < b.y0 + rad || py > b.y1 - rad) continue;
      if (minDist(px, py) < rim + rad + 4) continue;
      let ok = true; for (const q of placed) { const dx = q.x - px, dy = q.y - py, rr2 = q.r + rad; if (dx * dx + dy * dy < rr2 * rr2) { ok = false; break; } }
      if (!ok) continue;
      placed.push({ x: px, y: py, r: rad, k: e[0], sc, v: (R() * 6) | 0, a: R() * TAU });
    }
    for (const p of placed) { const s = sprite(p.k, p.v); const w = s.cv.width / DS * p.sc; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.drawImage(s.cv, -w / 2, -w / 2, w, w); x.restore(); }
    if (theme === 'bathtub') foam(x, T, R); // foam clusters on the porcelain rim
    return placed.length;
  }
  function foam(x, T, R) {
    const s = sprite('bubbles', 1);
    for (let i = 0; i < T.n; i += 14) { const side = R() < 0.5 ? -1 : 1, d = side * (T.hw + 13 + (R() - 0.5) * 12); const px = T.px[i] + T.nx[i] * d, py = T.py[i] + T.ny[i] * d; const w = s.cv.width / DS * (0.35 + R() * 0.4); x.save(); x.translate(px, py); x.rotate(R() * TAU); x.drawImage(s.cv, -w / 2, -w / 2, w, w); x.restore(); }
  }
  TT.decor = { place, sprite, kinds: Object.keys(D), THEME_DECOR };
})(window);
