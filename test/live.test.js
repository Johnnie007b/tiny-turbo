// Smoke test against a deployed server: node test/live.test.js wss://host/ws  (2 clients, bots fill the grid, 1-lap race to results)
const WebSocket = require('ws');
const { GameClient } = require('../public/js/client.js');
const S = require('../public/js/sim.js'); const AI = require('../public/js/ai.js');
const { PH } = require('../public/js/room.js');
const url = process.argv[2] || 'wss://tiny-turbo.onrender.com/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (n, c, x) => { if (!c) fails++; console.log(c ? '  PASS' : '  FAIL', n, x === undefined ? '' : x); };
class P {
  constructor(name, color) {
    this.name = name; this.color = color; this.ws = new WebSocket(url); this.t0 = Date.now();
    this.client = new GameClient((s) => this.ws.readyState === 1 && this.ws.send(s));
    this.ws.on('message', (d) => this.client.onMessage(d.toString()));
    this.opened = new Promise((r, j) => { this.ws.on('open', r); this.ws.on('error', j); });
    this.brain = AI.makeBrain(color * 7 + 3, 0.8); this.inp = { st: 0, g: 0, b: 0, d: 0 };
  }
  tx(o) { this.ws.send(JSON.stringify(o)); }
  drive() {
    let last = process.hrtime.bigint(), acc = 0;
    this.timer = setInterval(() => {
      const now = process.hrtime.bigint(); acc += Number(now - last) / 1e6; last = now;
      while (acc >= 1000 / 60) { acc -= 1000 / 60; const c = this.client;
        if (c.me && c.T && c.phase === PH.RACING) AI.drive(c.T, c.me, this.brain, [c.me], this.inp, S.DT, { racing: true }); else { this.inp.st = 0; this.inp.g = 0; this.inp.b = 0; this.inp.d = 0; }
        c.step(this.inp); }
    }, 5);
  }
}
async function until(fn, ms, label) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25); } console.log('  TIMEOUT', label); return false; }
(async () => {
  const t0 = Date.now(); const a = new P('Alice', 0); await a.opened; check('wss connected', true, (Date.now() - t0) + 'ms');
  a.tx({ t: 'create', name: 'Alice', color: 0, style: 1, diff: 2 });
  check('room created', await until(() => a.client.code, 5000, 'code'), a.client.code);
  const b = new P('Bob', 1); await b.opened; b.tx({ t: 'join', code: a.client.code, name: 'Bob', color: 1, style: 2 });
  check('second client joined', await until(() => a.client.room && a.client.room.players.length === 2 && b.client.room, 5000, 'join'));
  a.tx({ t: 'cfg', track: 0, mode: 'race', laps: 1, fill: 4, items: true, diff: 2 });
  await until(() => a.client.room.cfg.laps === 1, 3000, 'cfg');
  check('bot level HARD set on room', a.client.room.cfg.diff === 2);
  a.tx({ t: 'ready', v: true }); b.tx({ t: 'ready', v: true }); await sleep(300); a.tx({ t: 'start' });
  check('race starts', await until(() => a.client.room.ph >= PH.COUNTDOWN && b.client.room.ph >= PH.COUNTDOWN, 5000, 'start'));
  await until(() => a.client.phase === PH.RACING, 10000, 'racing'); a.drive(); b.drive();
  const lat = []; const tp = Date.now();
  check('cars on grid = 2 humans + bots', (a.client.room.n || (a.client.last && a.client.last.c.length)) >= 4, a.client.last && a.client.last.c.length);
  check('race finishes, results broadcast to both', await until(() => a.client.room.ph === PH.RESULTS && b.client.room.ph === PH.RESULTS, 150000, 'results'), Math.round((Date.now() - tp) / 1000) + 's');
  const res = a.client.room.res || [];
  console.log('   results:', res.map((r) => r.place + '.' + r.name + (r.fin ? ' ' + r.time : ' DNF')).join(' | '));
  check('humans finished', ['Alice', 'Bob'].every((n) => res.find((r) => r.name === n && r.fin)));
  check('bots filled the grid', res.length >= 4, res.length);
  a.ws.close(); b.ws.close(); clearInterval(a.timer); clearInterval(b.timer);
  console.log(fails ? 'LIVE TESTS FAILED (' + fails + ')' : 'LIVE TESTS PASSED'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
