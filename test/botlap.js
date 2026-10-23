const S = require('../public/js/sim.js'); const AI = require('../public/js/ai.js'); const defs = require('../public/js/tracks.js');
for (const d of defs) {
  const T = S.buildTrack(d); const cars = []; const brains = [];
  for (let i = 0; i < 6; i++) { const c = S.newCar(i); S.setPose(T, c, -40 - Math.floor(i / 2) * 46, (i % 2 ? 26 : -26), 0); c.lap = -1; c.prog = c.lap*T.L + c.s; cars.push(c); brains.push(AI.makeBrain(i + 1, 0.5)); }
  const inp = { st: 0, g: 0, b: 0, d: 0 }; const stats = { fall: 0, wall: 0, bump: 0, car: 0, boost: 0 }; const evs = [];
  const lapT = []; let t = 0, done = false;
  const first = {}; 
  while (t < 240 && !done) {
    for (let i = 0; i < cars.length; i++) { AI.drive(T, cars[i], brains[i], cars, inp, S.DT, { racing: true }); S.stepCar(T, cars[i], inp, evs); }
    S.collideCars(cars, evs); t += S.DT;
    for (const e of evs) stats[e[0]] = (stats[e[0]] || 0) + 1; evs.length = 0;
    for (const c of cars) if (c.lap >= 3 && !first[c.id]) first[c.id] = t;
    if (Object.keys(first).length == cars.length) done = true;
  }
  console.log(d.id.padEnd(10), 'L', T.L.toFixed(0), 'finish times', Object.values(first).map(v => v.toFixed(1)).join(' '), 'prog', cars.map(c => (c.prog / T.L).toFixed(2)).join(' '), JSON.stringify(stats));
}
