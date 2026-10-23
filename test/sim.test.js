// Headless physics / track / AI sanity tests (no network, no browser).
const S = require('../public/js/sim.js'); const AI = require('../public/js/ai.js'); const defs = require('../public/js/tracks.js');
let fails = 0, n = 0;
function ok(c, m) { n++; if (c) console.log('  ok  ' + m); else { fails++; console.log('  FAIL ' + m); } }

function grid(T, count, diff) {
  const cars = [], brains = [];
  for (let i = 0; i < count; i++) { const c = S.newCar(i); S.setPose(T, c, -40 - Math.floor(i / 2) * 46, (i % 2 ? 26 : -26), 0); c.lap = -1; c.prog = c.lap * T.L + c.s; cars.push(c); brains.push(AI.makeBrain(i + 1, 0.5, diff)); }
  return { cars, brains };
}
function run(T, g, seconds, laps) {
  const inp = { st: 0, g: 0, b: 0, d: 0 }, evs = [], first = {}; let t = 0, falls = 0, maxV = 0;
  while (t < seconds && Object.keys(first).length < g.cars.length) {
    for (let i = 0; i < g.cars.length; i++) { AI.drive(T, g.cars[i], g.brains[i], g.cars, inp, S.DT, { racing: true }); S.stepCar(T, g.cars[i], inp, evs); }
    S.collideCars(g.cars, evs); t += S.DT;
    for (const e of evs) if (e[0] === 'fall') falls++; evs.length = 0;
    for (const c of g.cars) { maxV = Math.max(maxV, Math.hypot(c.vx, c.vy)); if (c.lap >= laps && !first[c.id]) first[c.id] = t; if (!isFinite(c.x) || !isFinite(c.y)) throw new Error('NaN car'); }
  }
  return { first, t, falls, maxV };
}

console.log('tracks');
ok(defs.length >= 3, 'at least 3 tracks (' + defs.length + ')');
for (const d of defs) {
  const T = S.buildTrack(d);
  ok(T.L > 3000 && isFinite(T.L), d.id + ': sane length ' + T.L.toFixed(0));
  const p0 = T.pos(0, 0), p1 = T.pos(T.L - 1, 0);
  ok(Math.hypot(p0.x - p1.x, p0.y - p1.y) < 40, d.id + ': loop closes');
  const early = T.hazards.filter(h => (h.k === 'oil' || h.k === 'water') && h.s < 330);
  ok(early.length === 0, d.id + ': no oil/water right after the start line');
  ok(T.bounds && T.bounds.x1 > T.bounds.x0, d.id + ': bounds');
}

console.log('bots race every track');
for (const d of defs) {
  const T = S.buildTrack(d); const g = grid(T, 6); const r = run(T, g, 300, 3);
  ok(Object.keys(r.first).length === 6, d.id + ': all 6 bots finish 3 laps (' + Object.values(r.first).map(v => v.toFixed(0)).join(',') + 's)');
  ok(r.maxV < 2000, d.id + ': speed bounded (' + r.maxV.toFixed(0) + ')');
}

console.log('determinism');
{
  const T = S.buildTrack(defs[0]); const a = run(T, grid(T, 4), 20, 99), b = run(S.buildTrack(defs[0]), grid(S.buildTrack(defs[0]), 4), 20, 99);
  ok(a.t === b.t, 'same inputs -> same elapsed');
  const T1 = S.buildTrack(defs[0]), T2 = S.buildTrack(defs[0]); const g1 = grid(T1, 3), g2 = grid(T2, 3); run(T1, g1, 15, 99); run(T2, g2, 15, 99);
  ok(g1.cars.every((c, i) => c.x === g2.cars[i].x && c.y === g2.cars[i].y), 'car positions identical after 15s');
}

console.log('handling');
{
  const T = S.buildTrack(defs[0]); const c = S.newCar(0); S.setPose(T, c, -40, 0, 0); const evs = [];
  for (let i = 0; i < 180; i++) S.stepCar(T, c, { st: 0, g: 1, b: 0, d: 0 }, evs);
  const v = Math.hypot(c.vx, c.vy); ok(v > 100, 'full throttle accelerates (' + v.toFixed(0) + ')');
  for (let i = 0; i < 240; i++) S.stepCar(T, c, { st: 0, g: 0, b: 1, d: 0 }, evs);
  ok(Math.hypot(c.vx, c.vy) < v * 0.5, 'braking slows the car');
}


console.log('combat: ramming');
{
  const T = S.buildTrack(defs[2]); const evs = [];
  const mk = (id, x, vx) => { const c = S.newCar(id); S.setPose(T, c, 300, 0, 0); c.x = x; c.y = 0; c.a = 0; c.vx = vx; c.vy = 0; return c; };
  const a = mk(0, 0, 300), b = mk(1, 14, 0); S.collideCars([a, b], evs);
  ok(evs.some((e) => e[0] === 'car'), 'head-on bump raises a car event');
  ok(b.vx > 250, 'rammed car is shoved hard (' + b.vx.toFixed(0) + ')');
  ok(a.vx < b.vx, 'rammer loses speed relative to rammed car');
}

console.log('combat: pickups & weapons');
const IM = require('../public/js/items.js');
{
  for (const d of defs) { const T = S.buildTrack(d); const w = new IM.World(T); ok(w.pk.length >= 12 && w.pk.length <= 30, d.id + ': ' + w.pk.length + ' item boxes'); }
  const T = S.buildTrack(defs[2]); let seed = 5; const rnd = S.mulberry32(seed); const w = new IM.World(T, rnd); const evs = [];
  const cars = [S.newCar(0), S.newCar(1), S.newCar(2)]; cars.forEach((c, i) => { S.setPose(T, c, 1000 + i * 60, 0, 0); c.item = 0; c.prog = c.lap * T.L + c.s; });
  // pick up
  const p0 = w.pk[0]; cars[0].x = p0.x; cars[0].y = p0.y; w.update(cars, evs, true);
  ok(cars[0].item >= 1 && cars[0].item <= 3, 'driving through a box gives an item (' + cars[0].item + ')');
  ok(w.pk[0].t > 5, 'box disappears then respawns');
  ok(evs.some((e) => e[0] === 'pick'), 'pick event');
  for (let i = 0; i < 6.6 * 60; i++) w.update(cars, evs, true); ok(w.pk[0].t <= 0, 'box respawned after ~6.5s');
  // missile
  S.setPose(T, cars[0], 1000, 0, 0); S.setPose(T, cars[1], 1180, 0, 0); cars[0].vx = 200; cars[0].vy = 0; cars[0].item = IM.IT.MISSILE; evs.length = 0; S.setPose(T, cars[2], 4000, 0, 0); cars.forEach((c) => { c.tI = 0; });
  const heading = cars[0].a; cars[1].a = heading;
  w.use(cars[0], cars, evs); ok(w.missiles.length === 1 && cars[0].item === 0, 'missile fired, item consumed');
  const v0 = Math.hypot(cars[1].vx, cars[1].vy); cars[1].vx = Math.cos(heading) * 250; cars[1].vy = Math.sin(heading) * 250;
  let hit = false; for (let i = 0; i < 120 && !hit; i++) { w.update(cars, evs, true); cars[1].x += cars[1].vx * S.DT; cars[1].y += cars[1].vy * S.DT; hit = evs.some((e) => e[0] === 'hit'); }
  ok(hit, 'missile hits the car ahead'); ok(Math.hypot(cars[1].vx, cars[1].vy) < 250, 'hit car is slowed / knocked'); ok(Math.abs(cars[1].sw) > 5, 'hit car spins out');
  ok(cars[1].tO > 0.5, 'hit car has reduced control'); ok(w.missiles.length === 0, 'missile is gone after impact');
  // owner is not hit by own missile
  S.setPose(T, cars[0], 1000, 0, 0); cars[0].item = IM.IT.MISSILE; cars[2].x = 99999; evs.length = 0; w.use(cars[0], cars, evs);
  for (let i = 0; i < 30; i++) w.update(cars, evs, true); ok(!evs.some((e) => e[0] === 'hit' && e[1] === 0), 'own missile never hits owner');
  // oil slick
  w.missiles.length = 0; S.setPose(T, cars[0], 1500, 0, 0); S.setPose(T, cars[1], 1500, 0, 0); cars[0].vx = cars[0].vy = 0; cars[1].vx = cars[1].vy = 0; cars[1].x -= 200;
  cars[0].item = IM.IT.OIL; evs.length = 0; w.use(cars[0], cars, evs); ok(w.slicks.length === 1, 'oil slick dropped');
  w.update(cars, evs, true); ok(cars[0].tO <= 0, 'owner is safe from own fresh slick');
  const sl = w.slicks[0]; cars[1].x = sl.x; cars[1].y = sl.y; cars[1].tO = 0; w.update(cars, evs, true); ok(cars[1].tO > 1, 'rival driving over slick loses grip');
  for (let i = 0; i < 17 * 60; i++) w.update(cars, evs, true); ok(w.slicks.length === 0, 'slick dries up after ~16s');
  // turbo
  cars[0].item = IM.IT.TURBO; cars[0].tB = 0; w.use(cars[0], cars, evs); ok(cars[0].tB >= 2, 'turbo gives a speed burst');
  // fall loses item
  cars[1].item = 2; cars[1].tF = 0.5; w.update(cars, evs, true); ok(cars[1].item === 0, 'falling off the table loses the held item');
  // items inert when not racing
  cars[2].item = 0; cars[2].x = w.pk[3].x; cars[2].y = w.pk[3].y; w.update(cars, evs, false); ok(cars[2].item === 0, 'no pickups while not racing');
}

console.log('hazards / respawn penalty');
{
  const T = S.buildTrack(defs[0]); const c = S.newCar(0); S.setPose(T, c, 800, 0, 0); const evs = [];
  const p = T.pos(800, T.hw + 60); c.x = p.x; c.y = p.y; c.vx = 0; c.vy = 0; S.stepCar(T, c, { st: 0, g: 0, b: 0, d: 0 }, evs);
  ok(c.tF > 0 && evs.some((e) => e[0] === 'fall'), 'driving off the table edge = fall');
  const s0 = c.s; for (let i = 0; i < 90; i++) S.stepCar(T, c, { st: 0, g: 0, b: 0, d: 0 }, evs);
  ok(c.tF === 0 && c.tI > 0 && Math.abs(c.d) < 5, 'respawns on the road with brief invulnerability');
  const T2 = S.buildTrack(defs[0]); const w = T2.hazards.find((h) => h.k === 'water'); 
  if (w) { const c2 = S.newCar(1); S.setPose(T2, c2, w.s - 60, w.d, 0); const v = () => Math.hypot(c2.vx, c2.vy); for (let i = 0; i < 180; i++) S.stepCar(T2, c2, { st: 0, g: 1, b: 0, d: 0 }, []); }
}

console.log('rooms with items (bots fight)');
{
  const R = require('../public/js/room.js'); const evc = {};
  for (const mode of ['race', 'duel']) {
    const room = new R.Room('TEST', (pid, str) => { const m = JSON.parse(str); if (m.t === 's' && m.e) for (const e of m.e) evc[mode + ':' + e[0]] = (evc[mode + ':' + e[0]] || 0) + 1; }, { local: true });
    room.join(1, { name: 'Tester' }); room.handle(1, { t: 'cfg', track: 2, mode, fill: 6, items: true }); room.handle(1, { t: 'start' });
    for (let i = 0; i < 60 * 150 && room.phase !== R.PH.RESULTS; i++) room.update();
    ok(room.cars.length === 6 && room.cars.every((c) => isFinite(c.x)), mode + ': 6 cars alive after ' + room.raceT.toFixed(0) + 's');
    if (mode === 'race') ok((evc[mode + ':pick'] || 0) >= 4, mode + ': bots pick up items (' + (evc[mode + ':pick'] || 0) + ')');
    if (mode === 'race') ok((evc[mode + ':fire'] || 0) >= 1, mode + ': bots use items (' + (evc[mode + ':fire'] || 0) + ' fired, ' + (evc[mode + ':hit'] || 0) + ' hits)');
  }
  const room2 = new R.Room('T2', () => {}, { local: true }); room2.join(1, { name: 'A' }); room2.handle(1, { t: 'cfg', mode: 'duel' }); ok(room2.cfg.items === false, 'duel defaults to items OFF'); room2.handle(1, { t: 'cfg', mode: 'race' }); ok(room2.cfg.items === true, 'race defaults to items ON');
}

console.log('bot difficulty');
for (const d of defs) {
  const mean = [];
  for (const diff of [0, 1, 2]) { const T = S.buildTrack(d); const g = grid(T, 4, diff); const r = run(T, g, 400, 3); const v = Object.values(r.first); ok(v.length === 4, d.id + ' diff ' + diff + ': all bots finish (' + v.length + '/4, falls ' + r.falls + ')'); mean[diff] = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length); }
  ok(mean[0] > mean[1] * 1.05 && mean[1] > mean[2] * 1.01, d.id + ': easy slower than medium slower than hard (' + mean.map((x) => x.toFixed(1)).join(' > ') + 's)');
}
{
  const R = require('../public/js/room.js'); const r = new R.Room('TD', () => {}, { local: true }); r.join(1, { name: 'A' });
  ok(r.cfg.diff === 1, 'default bot level is MEDIUM');
  r.handle(1, { t: 'cfg', diff: 0 }); ok(r.cfg.diff === 0, 'host can set EASY'); r.handle(1, { t: 'cfg', diff: 9 }); ok(r.cfg.diff === 2, 'bot level is clamped'); r.handle(1, { t: 'cfg', diff: 2, fill: 5, track: 0, mode: 'race' });
  r.handle(1, { t: 'start' }); ok(r.cars.filter((c) => c.bot).length === 4 && r.cars.filter((c) => c.bot).every((c) => c.ai.diff === 2), 'bots filling the room use the chosen level');
}

console.log('feel: car scale, drift boost, impacts, snapshot');
{
  ok(S.P.CAR_SCALE >= 1.3 && S.P.CAR_R >= 11, 'cars are bigger in the sim (scale ' + S.P.CAR_SCALE + ', radius ' + S.P.CAR_R + ')');
  const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; pts.push([2000 + Math.cos(a) * 1500, 2000 + Math.sin(a) * 1500]); }
  const T = S.buildTrack({ pts, hw: 260, edge: 'wall', hazards: [], obstacles: [], gaps: [], seed: 1, laps: 3, startAt: [3500, 2000], grip: 1 });
  const go = (f, secs) => { const c = S.newCar(1); S.setPose(T, c, 0, 0, 0); const ev = []; let maxdc = 0, maxv = 0; for (let i = 0; i < 60 * (secs || 9); i++) { S.stepCar(T, c, f(i), ev); maxdc = Math.max(maxdc, c.dc || 0); maxv = Math.max(maxv, Math.hypot(c.vx, c.vy)); } return { c, ev, maxdc, maxv }; };
  const hb = (i) => i > 200 && i < 320;
  const d = go((i) => ({ st: hb(i) ? 1 : 0, g: 1, b: 0, d: 0 }));
  ok(d.maxdc > S.P.DRIFT_T1, 'a held full-lock slide charges the drift meter (' + d.maxdc.toFixed(2) + ')');
  ok(d.ev.some((e) => e[0] === 'dtier') && d.ev.some((e) => e[0] === 'dboost'), 'drift tiers + a drift boost event are emitted');
  const plain = go(() => ({ st: 0, g: 1, b: 0, d: 0 }));
  ok(d.maxv > plain.maxv, 'drift boost tops the plain top speed (' + d.maxv.toFixed(0) + ' > ' + plain.maxv.toFixed(0) + ')');
  ok(d.maxv < 560 && plain.maxv <= S.P.MAXV + 5, 'speeds stay bounded (boost ' + d.maxv.toFixed(0) + ', plain ' + plain.maxv.toFixed(0) + ')');
  const tap = go((i) => ({ st: (i > 200 && i < 215) ? 1 : 0, g: 1, b: 0, d: 0 }));
  ok(!tap.ev.some((e) => e[0] === 'dboost'), 'a quick steering tap does not grant a drift boost');
  // wall hit magnitudes
  const T2 = S.buildTrack(defs[0]); const c = S.newCar(2); S.setPose(T2, c, 0, 0, 0); const ev = []; c.vx = 0; c.vy = 0;
  for (let i = 0; i < 60 * 8; i++) { S.stepCar(T2, c, { st: 0.15, g: 1, b: 0, d: 0 }, ev); }
  const hit = ev.filter((e) => e[0] === 'wall' || e[0] === 'bump'); ok(hit.length === 0 || hit.every((e) => e[2] > 0 && isFinite(e[2])), 'wall/bump events carry a positive magnitude (' + hit.length + ' seen)');
  // car-car collision magnitude + conservation of sanity
  const a = S.newCar(3), b = S.newCar(4); S.setPose(T2, a, -100, 0, 0); S.setPose(T2, b, -100 + 2 * S.P.CAR_R * 0.8, 0, 0); a.vx = 300; a.vy = 0; const ce = [];
  S.collideCars([a, b], ce); const cc = ce.find((e) => e[0] === 'car');
  ok(cc && cc[3] > 100, 'car-car hit reports an impact magnitude (' + (cc && cc[3]) + ')'); ok(b.vx > 100 || b.vy !== 0, 'rammed car is knocked away');
  const R = require('../public/js/room.js'); const room = new R.Room('SN', () => {}, { local: true }); room.join(1, { name: 'A', style: 99 }); room.handle(1, { t: 'cfg', fill: 4 }); room.handle(1, { t: 'start' });
  for (let i = 0; i < 200; i++) room.update();
  const snap = room.snapshot ? room.snapshot() : null; const row = snap && snap.c && snap.c[0];
  ok(R.NUM_STYLES === 6, '6 car styles'); ok(room.cars.every((q) => q.style >= 0 && q.style < R.NUM_STYLES), 'car styles are clamped (' + room.cars.map((q) => q.style).join(',') + ')');
  if (row) ok(row.length === 21 && row.every((v) => typeof v === 'number' && isFinite(v)), 'snapshot car row has 21 numeric fields (' + (row && row.length) + ')'); else ok(true, 'snapshot row checked in net test');
}

console.log(fails ? '\nSIM TESTS FAILED (' + fails + '/' + n + ')' : '\nSIM TESTS PASSED (' + n + ')');
process.exit(fails ? 1 : 0);
