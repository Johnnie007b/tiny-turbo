// Multi-client websocket integration test: 4 bot clients (with prediction + simulated latency) + server bots, full race, rematch, duel mode.
const WebSocket = require('ws');
const assert = require('assert');
const { server } = require('../server/index.js');
const { GameClient } = require('../public/js/client.js');
const S = require('../public/js/sim.js'); const AI = require('../public/js/ai.js');
const { PH } = require('../public/js/room.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAT = +process.env.LAT || 40; // one-way ms
const JIT = +process.env.JIT || 15;
let failures = 0;
function check(name, cond, extra) { if (cond) console.log('  PASS', name, extra || ''); else { failures++; console.log('  FAIL', name, extra || ''); } }

class Bot {
  constructor(url, name, color, lat) {
    this.name = name; this.lat = lat; this.q = [];
    this.ws = new WebSocket(url);
    this.sendT = 0; this.client = new GameClient((s) => this.delayUp(() => this.ws.readyState === 1 && this.ws.send(s)));
    this.ws.on('message', (d) => this.delay(() => this.client.onMessage(d.toString())));
    this.opened = new Promise((r) => this.ws.on('open', r));
    this.brain = AI.makeBrain(name.length * 31 + color, 0.7);
    this.inp = { st: 0, g: 0, b: 0, d: 0 };
    this.events = []; this.client.onevent = (e) => this.events.push(e);
    this.timer = null; this.color = color; this.dt = 0;
    this.msgCount = 0; this.bytes = 0;
    this.ws.on('message', (d) => { this.msgCount++; this.bytes += d.length; });
  }
  // in-order delivery (like TCP): jitter can delay but never reorder
  delay(fn) { this.pump('dq', fn); }
  // strictly FIFO delivery queue (setTimeout alone can reorder callbacks scheduled with different delays)
  pump(qn, fn) {
    const q = this[qn + 'Q'] || (this[qn + 'Q'] = []); const t = Math.max(Date.now() + this.lat + Math.random() * JIT, q.length ? q[q.length - 1].t : 0); q.push({ t, fn });
    if (q.length === 1) this.drain(q);
  }
  drain(q) { if (!q.length) return; const w = q[0].t - Date.now(); if (w > 0) return void setTimeout(() => this.drain(q), w); q.shift().fn(); this.drain(q); }
  startDriving() {
    let last = process.hrtime.bigint(), acc = 0;
    this.timer = setInterval(() => {
      const now = process.hrtime.bigint(); acc += Number(now - last) / 1e6; last = now;
      while (acc >= 1000 / 60) {
        acc -= 1000 / 60;
        const c = this.client; if (c.me && c.T && c.phase === PH.RACING) { AI.drive(c.T, c.me, this.brain, [c.me], this.inp, S.DT, { racing: true }); }
        else { this.inp.st = 0; this.inp.g = 0; this.inp.b = 0; this.inp.d = 0; }
        { const r = c.last && c.last.c.find((x) => x[0] === c.carId); this.inp.u = (r && r[19] > 0 && c.phase === PH.RACING && Math.random() < 0.1) ? 1 : 0; if (this.inp.u) this.used = (this.used || 0) + 1; }
        c.step(this.inp);
      }
    }, 5);
  }
  delayUp(fn) { this.pump('uq', fn); }
  stop() { clearInterval(this.timer); this.ws.close(); }
  tx(o) { this.delayUp(() => this.ws.readyState === 1 && this.ws.send(JSON.stringify(o))); }
}
async function until(fn, ms, label) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } console.log('  TIMEOUT waiting for', label); return false; }

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; const url = `ws://127.0.0.1:${port}/ws`;
  console.log(`Net test on port ${port}, simulated one-way latency ${LAT}ms +-${JIT}ms`);
  // ---- lobby
  const bots = [new Bot(url, 'Alice', 0, LAT), new Bot(url, 'Bob', 1, LAT), new Bot(url, 'Cara', 2, LAT), new Bot(url, 'Dan', 3, LAT)];
  await Promise.all(bots.map((b) => b.opened));
  bots[0].tx({ t: 'create', name: 'Alice', color: 0, style: 1, diff: 2 });
  await until(() => bots[0].client.code, 2000, 'room code');
  const code = bots[0].client.code;
  await until(() => bots[0].client.room && bots[0].client.room.cfg.diff === 2, 2000, 'diff'); check('bot level from create is applied to the room (HARD)', bots[0].client.room.cfg.diff === 2, bots[0].client.room.cfg.diff);
  check('room created with 4-letter code', /^[A-Z]{4}$/.test(code), code);
  for (let i = 1; i < 4; i++) bots[i].tx({ t: 'join', code: code.toLowerCase(), name: bots[i].name, color: bots[i].color, style: i });
  await until(() => bots.every((b) => b.client.room && b.client.room.players.length === 4), 3000, 'all joined');
  check('4 players visible in lobby on all clients', bots.every((b) => b.client.room.players.length === 4), bots.map((b) => b.client.room && b.client.room.players.map((p) => p.n).join('/') + ' err=' + b.client.err).join(' ; '));
  // bad join
  const bad = new Bot(url, 'X', 0, 0); await bad.opened; bad.tx({ t: 'join', code: 'ZZZZ', name: 'X' });
  await until(() => bad.client.err, 2000, 'err'); check('joining unknown room gives error', !!bad.client.err, bad.client.err); bad.stop();
  // host start blocked until ready
  bots[0].tx({ t: 'cfg', track: 2, mode: 'race', laps: 1, fill: 6 });
  bots[0].tx({ t: 'start' });
  await sleep(300);
  check('start refused until everyone is ready', bots[0].client.room.ph === PH.LOBBY && /Waiting/.test(bots[0].client.err || ''), bots[0].client.err);
  check('non-host cfg ignored', (bots[1].tx({ t: 'cfg', laps: 9 }), true));
  await sleep(100);
  check('laps cfg only host', bots[0].client.room.cfg.laps === 1, JSON.stringify(bots[0].client.room.cfg));
  for (let i = 1; i < 4; i++) bots[i].tx({ t: 'ready', v: 1 });
  await until(() => bots[0].client.room.players.filter((p) => p.r).length === 3, 2000, 'ready');
  bots.forEach((b) => b.startDriving());
  bots[0].tx({ t: 'start' });
  await until(() => bots.every((b) => b.client.room.ph >= PH.COUNTDOWN), 3000, 'countdown');
  check('all clients entered countdown', bots.every((b) => b.client.room.ph === PH.COUNTDOWN || b.client.room.ph === PH.RACING));
  await until(() => bots.every((b) => b.client.phase === PH.RACING), 8000, 'racing');
  check('racing started', bots.every((b) => b.client.phase === PH.RACING));
  check('6 cars (4 humans + 2 bots) in snapshot', bots[0].client.last.c.length === 6, bots[0].client.last.c.length);
  // sync check mid-race
  await sleep(6000);
  let maxDiv = 0;
  const lastSnaps = bots.map((b) => b.client.last);
  // compare each client's view of car 0..5 by tick-aligned snapshot from the server: use same tick if available
  const byTick = new Map();
  bots.forEach((b) => b.client.snaps.forEach((s) => { if (!byTick.has(s.k)) byTick.set(s.k, []); byTick.get(s.k).push({ b, s }); }));
  let compared = 0;
  for (const [k, arr] of byTick) if (arr.length === bots.length) { compared++; for (const row of arr[0].s.c) for (const o of arr) { const r2 = o.s.c.find((r) => r[0] === row[0]); maxDiv = Math.max(maxDiv, Math.hypot(r2[1] - row[1], r2[2] - row[2])); } }
  check('all clients receive identical authoritative snapshots', compared > 0 && maxDiv < 0.01, `ticks compared=${compared} maxDiv=${maxDiv}`);
  const rate = bots[0].client.stats.snaps / ((Date.now()) / 1000);
  // prediction quality
  const st = bots.map((b) => b.client.stats);
  const avgErr = st.map((s) => s.sumErr / Math.max(1, s.recon));
  check('client prediction error small (avg < 4 units)', avgErr.every((e) => e < 4), 'avg ' + avgErr.map((e) => e.toFixed(2)).join(','));
  console.log('   max prediction error', st.map((s) => s.maxErr.toFixed(1)).join(','), 'hard resets', st.map((s) => s.resets).join(','));
  // render-state sample sanity
  check('snapshots carry item state (it + row[19])', !!bots[0].client.last.it && bots[0].client.last.c.every((r) => r.length >= 20), JSON.stringify(Object.keys(bots[0].client.last.it || {})));
  const pickEv = bots[0].events.filter((e) => e[0] === 'pick').length, fireEv = bots[0].events.filter((e) => e[0] === 'fire').length;
  check('pick events delivered to clients', pickEv >= 1, pickEv); check('humans used items via the u input flag', bots.reduce((n, b) => n + (b.used || 0), 0) >= 1 && fireEv >= 1, 'inputs=' + bots.map((b) => b.used || 0) + ' fire events=' + fireEv);
  { const out = []; bots[0].client.sampleMissiles(out); check('sampleMissiles runs', Array.isArray(out)); }
  const smp = bots[1].client.sample(); check('interpolated sample has all cars', smp.size === 6);
  const t0 = Date.now(); const n0 = bots[1].msgCount, b0 = bots[1].bytes; await sleep(2000);
  console.log(`   downstream: ${((bots[1].msgCount - n0) / 2).toFixed(0)} msg/s, ${((bots[1].bytes - b0) / 2 / 1024).toFixed(1)} KB/s per client`);
  // finish
  const finished = await until(() => bots.every((b) => b.client.room.ph === PH.RESULTS), 150000, 'race finish');
  check('race finished -> results on all clients', finished);
  const res = bots[0].client.room.res;
  check('results list all 6 cars with places', res && res.length === 6 && res.map((r) => r.place).join() === '1,2,3,4,5,6', res && res.map((r) => r.name + ':' + r.time).join(' '));
  check('all human cars finished', bots.every((b) => res.find((r) => r.name === b.name && r.fin)));
  const lapEvents = bots[0].events.filter((e) => e[0] === 'lap').length; check('lap events delivered', lapEvents >= 6, lapEvents);
  // rematch
  bots.forEach((b) => b.tx({ t: 'rematch' }));
  await until(() => bots.every((b) => b.client.room.ph === PH.COUNTDOWN), 4000, 'rematch');
  check('rematch (all voted) restarts race', bots.every((b) => b.client.room.ph >= PH.COUNTDOWN));
  await until(() => bots.every((b) => b.client.phase === PH.RACING), 8000, 'racing2');
  // disconnect mid-race: bot 3 leaves, bot takes over, race continues
  bots[3].ws.close();
  await sleep(1500);
  check('host sees disconnected player flagged', bots[0].client.room.players.find((p) => p.n === 'Dan').cn === 0);
  // rejoin with token
  const rj = new Bot(url, 'Dan', 3, LAT); await rj.opened; rj.tx({ t: 'join', code, token: bots[3].client.token, name: 'Dan' });
  await until(() => rj.client.room && rj.client.carId >= 0, 3000, 'rejoin'); check('token rejoin restores the same car', rj.client.carId === bots[3].client.carId, rj.client.carId);
  rj.startDriving(); bots[3] = rj;
  await until(() => bots.every((b) => b.client.room.ph === PH.RESULTS), 150000, 'race2 finish');
  check('second race finished', bots.every((b) => b.client.room.ph === PH.RESULTS));
  // back to lobby by host, then duel
  bots[0].tx({ t: 'lobby' }); await until(() => bots.every((b) => b.client.room.ph === PH.LOBBY), 3000, 'lobby');
  check('host returns everyone to lobby', bots.every((b) => b.client.room.ph === PH.LOBBY));
  bots[0].tx({ t: 'cfg', track: 2, mode: 'duel', fill: 0 });
  await sleep(200); for (let i = 1; i < 4; i++) bots[i].tx({ t: 'ready', v: 1 });
  await sleep(300); bots[0].tx({ t: 'start' });
  await until(() => bots.every((b) => b.client.phase === PH.RACING), 8000, 'duel racing');
  const duelEvents = []; bots[0].client.onevent = (e) => duelEvents.push(e);
  const done = await until(() => bots.every((b) => b.client.room.ph === PH.RESULTS), 240000, 'duel end');
  check('duel finished', done, 'events: out=' + duelEvents.filter((e) => e[0] === 'out').length + ' score=' + duelEvents.filter((e) => e[0] === 'score').length + ' rounds=' + (bots[0].client.last && bots[0].client.last.rd));
  const dres = bots[0].client.room.res; console.log('   duel results:', dres && dres.map((r) => `${r.name}:${r.pts}`).join(' '));
  check('duel has a winner at target points', dres && dres[0].pts >= bots[0].client.room.target);
  bots.forEach((b) => b.stop());
  console.log(failures ? `\nNET TESTS FAILED (${failures})` : '\nNET TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
