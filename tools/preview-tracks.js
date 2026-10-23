// Writes SVG previews + sanity report for each track (min corner radius, self-proximity).
const fs = require('fs'), path = require('path');
const sim = require('../public/js/sim.js'); const defs = require('../public/js/tracks.js');
const out = path.join(__dirname, '..', 'tmp'); fs.mkdirSync(out, { recursive: true });
for (const d of defs) {
  const T = sim.buildTrack(d);
  let minR = 1e9, minProx = 1e9;
  for (let i = 0; i < T.n; i++) { const r = 1 / Math.max(T.kappa[i], 1e-6); if (r < minR) { minR = r; var at = [T.px[i]|0, T.py[i]|0]; } }
  for (let i = 0; i < T.n; i += 3) for (let j = i + 1; j < T.n; j += 3) {
    let ds = Math.abs(i - j) * T.sp; ds = Math.min(ds, T.L - ds); if (ds < 400) continue;
    const dd = Math.hypot(T.px[i] - T.px[j], T.py[i] - T.py[j]); if (dd < minProx) minProx = dd;
  }
  console.log(d.id.padEnd(10), 'len', T.L.toFixed(0), 'hw', T.hw, 'minRadius', minR.toFixed(0), 'at', at, 'minProx', minProx.toFixed(0), 'need>', (2 * T.hw + 60));
  const b = T.bounds; let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x0} ${b.y0} ${b.x1 - b.x0} ${b.y1 - b.y0}" width="900"><rect x="${b.x0}" y="${b.y0}" width="100%" height="100%" fill="#222"/>`;
  let pd = 'M'; for (let i = 0; i < T.n; i++) pd += `${T.px[i].toFixed(1)},${T.py[i].toFixed(1)} `; pd += 'Z';
  svg += `<path d="${pd}" fill="none" stroke="#889" stroke-width="${T.hw * 2}" stroke-linejoin="round"/><path d="${pd}" fill="none" stroke="#fff" stroke-width="3"/>`;
  T.hazards.forEach(h => svg += `<circle cx="${h.x}" cy="${h.y}" r="${h.r}" fill="${{ boost: '#0f0', oil: '#000', water: '#0af', ramp: '#fa0' }[h.k]}"/>`);
  T.obstacles.forEach(h => svg += `<circle cx="${h.x}" cy="${h.y}" r="${h.r}" fill="#e44"/>`);
  svg += `<circle cx="${T.px[0]}" cy="${T.py[0]}" r="12" fill="#ff0"/><text x="${b.x0 + 40}" y="${b.y0 + 90}" font-size="80" fill="#fff">${d.name}</text></svg>`;
  fs.writeFileSync(path.join(out, d.id + '.svg'), svg);
}
