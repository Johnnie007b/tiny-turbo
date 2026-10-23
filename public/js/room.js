/* Tiny Turbo - authoritative game room (lobby, countdown, race / duel logic, bots).
   Runs on the Node server, and ALSO inside the browser for offline practice (same code path). */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});
  const isNode = typeof module === 'object' && module.exports;
  const S = isNode ? require('./sim.js') : TT.sim;
  const AI = isNode ? require('./ai.js') : TT.ai;
  const DEFS = isNode ? require('./tracks.js') : TT.trackDefs;
  const IM = isNode ? require('./items.js') : TT.items;
  const { DT, P, clamp } = S;

  const MAX_CARS = 8;
  const PH = { LOBBY: 0, COUNTDOWN: 1, RACING: 2, ROUNDEND: 3, RESULTS: 4 };
  const BOT_NAMES = ['Zippy', 'Turbo Ted', 'Pixel', 'Crumb', 'Nova', 'Sprocket', 'Dash', 'Bolt', 'Mango', 'Pebble', 'Gizmo', 'Waffle'];
  const NUM_COLORS = 12, NUM_STYLES = 6;
  const trackCache = {};
  function getTrack(i) { i = clamp(i | 0, 0, DEFS.length - 1); return trackCache[i] || (trackCache[i] = S.buildTrack(DEFS[i])); }
  const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
  const cleanName = (n) => String(n || '').replace(/[^\w \-.!?'’]/g, '').trim().slice(0, 14) || 'Racer';

  class Room {
    constructor(code, send, opts) {
      opts = opts || {};
      this.code = code; this.sendRaw = send; this.players = new Map(); this.hostPid = null;
      this.phase = PH.LOBBY; this.cfg = { track: 0, mode: 'race', laps: 3, fill: 4, items: true, diff: 1 }; this.world = null;
      this.tick = 0; this.cars = []; this.T = null; this.cd = 0; this.raceT = 0; this.round = 0; this.R = 300;
      this.events = []; this.res = null; this.lastActive = Date.now(); this.firstFinishT = 0; this.roundEndT = 0; this.winnerCar = -1;
      this.seed = (Math.random() * 1e9) | 0; this.local = !!opts.local; this.target = 3; this.snapN = 0; this.pendingRoom = false;
      this.emptySince = 0;
    }
    /* ---------------------------------------------------------------- messaging */
    sendTo(pid, obj) { this.sendRaw(pid, typeof obj === 'string' ? obj : JSON.stringify(obj)); }
    broadcast(obj) { const s = typeof obj === 'string' ? obj : JSON.stringify(obj); for (const p of this.players.values()) if (p.conn) this.sendRaw(p.pid, s); }
    roomMsg() {
      const players = [];
      for (const p of this.players.values()) players.push({ id: p.pid, n: p.name, c: p.color, st: p.style, r: p.ready ? 1 : 0, cn: p.conn ? 1 : 0, car: p.carId, sp: p.spec ? 1 : 0, rm: p.rematch ? 1 : 0 });
      const bots = this.cars.filter((c) => c.bot).map((c) => ({ id: -1 - c.id, n: c.name, c: c.color, st: c.style, r: 1, cn: 1, car: c.id, bot: 1 }));
      return { t: 'room', code: this.code, host: this.hostPid, ph: this.phase, cfg: this.cfg, players: players.concat(this.phase === PH.LOBBY ? [] : bots), res: this.res, target: this.target, seed: this.seed };
    }
    pushRoom() { this.broadcast(this.roomMsg()); }
    /* ---------------------------------------------------------------- membership */
    join(pid, info, sendWelcome) {
      info = info || {};
      const p = {
        pid, name: cleanName(info.name), color: clamp(info.color | 0, 0, NUM_COLORS - 1), style: clamp(info.style | 0, 0, NUM_STYLES - 1), ready: false, conn: true,
        token: info.token || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), carId: -1, q: [], last: { st: 0, g: 0, b: 0, d: 0 }, ack: 0, lastSeq: 0,
        rematch: false, spec: this.phase !== PH.LOBBY, dcAt: 0
      };
      this.players.set(pid, p);
      if (this.hostPid === null || !this.players.has(this.hostPid)) this.hostPid = pid;
      this.emptySince = 0;
      this.sendTo(pid, { t: 'welcome', pid, token: p.token, code: this.code, spectator: p.spec ? 1 : 0 });
      this.pushRoom();
      if (this.phase !== PH.LOBBY) this.sendTo(pid, this.snapshot());
      return p;
    }
    rebind(oldPid, newPid) { // reconnect with token
      const p = this.players.get(oldPid); if (!p) return null;
      this.players.delete(oldPid); p.pid = newPid; p.conn = true; p.dcAt = 0; this.players.set(newPid, p);
      if (this.hostPid === oldPid) this.hostPid = newPid;
      const car = this.cars[p.carId]; if (car && car.bot !== 1) { car.disc = false; car.ai = null; car.pid = newPid; }
      this.sendTo(newPid, { t: 'welcome', pid: newPid, token: p.token, code: this.code, spectator: p.spec ? 1 : 0, rejoin: 1 });
      this.pushRoom(); if (this.phase !== PH.LOBBY) this.sendTo(newPid, this.snapshot());
      return p;
    }
    disconnect(pid) {
      const p = this.players.get(pid); if (!p) return;
      p.conn = false; p.dcAt = Date.now(); p.ready = false;
      const car = this.cars[p.carId];
      if (car && this.phase !== PH.LOBBY && this.phase !== PH.RESULTS) { car.disc = true; if (!car.ai) car.ai = AI.makeBrain(car.id + 31, 0.4); }
      this.pushRoom();
    }
    removePlayer(pid) {
      const p = this.players.get(pid); if (!p) return;
      this.players.delete(pid);
      if (this.hostPid === pid) { const nx = [...this.players.values()].find((x) => x.conn); this.hostPid = nx ? nx.pid : null; }
      if (this.players.size === 0) this.emptySince = Date.now();
      this.pushRoom();
    }
    humanCount() { let n = 0; for (const p of this.players.values()) if (p.conn) n++; return n; }

    /* ---------------------------------------------------------------- client messages */
    handle(pid, m) {
      const p = this.players.get(pid); if (!p || !m) return;
      this.lastActive = Date.now();
      switch (m.t) {
        case 'i': this.onInput(p, m); break;
        case 'prof':
          if (this.phase === PH.LOBBY || p.spec) { if (m.name != null) p.name = cleanName(m.name); if (m.color != null) p.color = clamp(m.color | 0, 0, NUM_COLORS - 1); if (m.style != null) p.style = clamp(m.style | 0, 0, NUM_STYLES - 1); this.pushRoom(); }
          break;
        case 'ready': if (this.phase === PH.LOBBY) { p.ready = !!m.v; this.pushRoom(); } break;
        case 'cfg':
          if (pid === this.hostPid && this.phase === PH.LOBBY) {
            const c = this.cfg;
            if (m.track != null) c.track = clamp(m.track | 0, 0, DEFS.length - 1);
            if (m.mode === 'race' || m.mode === 'duel') { if (m.mode !== c.mode && m.items == null) c.items = m.mode === 'race'; c.mode = m.mode; }
            if (m.items != null) c.items = !!m.items;
            if (m.laps != null) c.laps = clamp(m.laps | 0, 1, 9);
            if (m.diff != null) c.diff = clamp(m.diff | 0, 0, 2);
            if (m.fill != null) c.fill = clamp(m.fill | 0, 0, MAX_CARS);
            this.pushRoom();
          }
          break;
        case 'start': if (pid === this.hostPid && this.phase === PH.LOBBY) this.tryStart(p); break;
        case 'rematch':
          if (this.phase === PH.RESULTS) {
            p.rematch = true;
            const humans = [...this.players.values()].filter((x) => x.conn && !x.spec);
            if (humans.every((x) => x.rematch)) this.startRace(); else this.pushRoom();
          }
          break;
        case 'lobby': if (this.phase === PH.RESULTS && pid === this.hostPid) this.toLobby(); break;
        case 'p': this.sendTo(pid, { t: 'q', c: m.c }); break;
      }
    }
    onInput(p, m) {
      const arr = m.a; if (!Array.isArray(arr) || arr.length > 16) return;
      let seq = m.n | 0;
      for (let i = 0; i < arr.length; i++, seq++) {
        if (seq <= p.lastSeq) continue;
        const it = arr[i]; if (!Array.isArray(it)) continue;
        const f = it[1] | 0;
        p.q.push({ seq, st: clamp(+it[0] || 0, -1, 1), g: f & 1, b: (f >> 1) & 1, d: (f >> 2) & 1, u: (f >> 3) & 1 });
        p.lastSeq = seq;
      }
      if (p.q.length > 20) p.q.splice(0, p.q.length - 6);
    }
    tryStart(host) {
      const waiting = [...this.players.values()].filter((x) => x.conn && !x.spec && x.pid !== this.hostPid && !x.ready);
      if (waiting.length) { this.sendTo(host.pid, { t: 'err', msg: 'Waiting for ' + waiting.map((x) => x.name).join(', ') + ' to ready up' }); return; }
      this.startRace();
    }
    toLobby() {
      this.phase = PH.LOBBY; this.cars = []; this.res = null;
      for (const p of this.players.values()) { p.ready = false; p.rematch = false; p.spec = false; p.carId = -1; p.q = []; }
      for (const [pid, p] of [...this.players]) if (!p.conn) this.players.delete(pid);
      if (!this.players.has(this.hostPid)) { const nx = [...this.players.values()][0]; this.hostPid = nx ? nx.pid : null; }
      this.pushRoom();
    }

    /* ---------------------------------------------------------------- race setup */
    startRace() {
      const cfg = this.cfg; const T = this.T = getTrack(cfg.track);
      T.laps = cfg.laps;
      const humans = [...this.players.values()].filter((p) => p.conn);
      humans.forEach((p) => { p.spec = false; p.ready = false; p.rematch = false; p.q = []; p.ack = p.lastSeq; });
      const total = clamp(Math.max(cfg.fill, humans.length), 1, MAX_CARS);
      const used = new Set(humans.map((p) => p.color));
      const botCount = Math.max(0, total - humans.length);
      const entries = humans.map((p) => ({ p }));
      let bi = this.seed % BOT_NAMES.length;
      for (let i = 0; i < botCount; i++) {
        let color = 0; while (used.has(color) && used.size < NUM_COLORS) color++; used.add(color);
        entries.push({ bot: { name: BOT_NAMES[(bi++) % BOT_NAMES.length], color, style: (i * 5 + 1) % NUM_STYLES } });
      }
      // shuffle grid
      const rnd = S.mulberry32((Math.random() * 1e9) | 0);
      for (let i = entries.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = entries[i]; entries[i] = entries[j]; entries[j] = t; }
      this.cars = entries.map((e, i) => {
        const c = S.newCar(i);
        if (e.p) { c.name = e.p.name; c.color = e.p.color; c.style = e.p.style; c.bot = 0; e.p.carId = i; c.pid = e.p.pid; }
        else { c.name = e.bot.name; c.color = e.bot.color; c.style = e.bot.style; c.bot = 1; c.ai = AI.makeBrain(i * 5 + this.seed, 0.45 + rnd() * 0.5, this.cfg.diff); }
        c.pts = 0; return c;
      });
      this.round = 0; this.target = this.cars.length <= 2 ? 5 : 3; this.res = null;
      this.world = new IM.World(T);
      this.seed = (Math.random() * 1e9) | 0;
      this.setupRound(null);
      this.pushRoom();
    }
    // grid: if leaderProg null -> start grid else reset around leader progress
    setupRound(front) {
      const T = this.T; this.round++; this.raceT = 0; this.firstFinishT = 0; this.winnerCar = -1; this.R = 300;
      const order = this.cars.slice();
      if (front !== null) order.sort((a, b) => (b === front) - (a === front));
      order.forEach((c, i) => {
        const row = Math.floor(i / 2), col = i % 2;
        let s, lapBase = 0;
        if (front === null) { s = -(46 + row * 52); }
        else s = front.prog - row * 52;
        const d = (col ? 28 : -28);
        S.setPose(T, c, s, d, 0);
        if (front === null) { c.lap = -1; c.prog = c.lap * T.L + c.s; }
        c.out = false; c.fin = 0; c.finT = 0; c.outT = 0; c.tI = 0; c.q = {}; c.d = 0; c.lapStart = 0; c.lastLap = 0; c.bestLap = c.bestLap || 0; c.finished = 0;
        c.disc = c.disc || false; c.outAt = 0; c.idx = -1;
        if (c.ai) { c.ai.stuck = 0; c.ai.rev = 0; }
      });
      if (this.world) this.world.reset(this.cars);
      this.cars.forEach((c) => { c.prevU = 0; c.useT = 0; c.botCool = (1 + Math.random() * 2) * [2, 1, 0.5][this.cfg.diff | 0]; });
      this.phase = PH.COUNTDOWN; this.cd = front === null ? 3.6 : 2.4; this.finishedCount = 0;
      this.events.push(['round', this.round]);
      this.sendSnap(true);
    }

    /* ---------------------------------------------------------------- simulation */
    update() {
      this.tick++;
      const T = this.T;
      if (this.phase === PH.LOBBY) { this.housekeeping(); return; }
      if (this.phase === PH.RESULTS) { if (this.tick % 30 === 0) this.housekeeping(); return; }
      const racing = this.phase === PH.RACING;
      // inputs
      const evs = this.events;
      const inp = this._inp || (this._inp = { st: 0, g: 0, b: 0, d: 0, u: 0 });
      const items = !!this.cfg.items && !!this.world;
      for (const c of this.cars) {
        const p = c.bot ? null : this.players.get(c.pid) || [...this.players.values()].find((x) => x.carId === c.id);
        if (!c.out && c.fin === 0 && this.phase !== PH.ROUNDEND) {
          if (c.ai || !p || !p.conn) {
            if (!c.ai) c.ai = AI.makeBrain(c.id + 99, 0.4);
            if (racing) { AI.drive(T, c, c.ai, this.cars, inp, DT, { racing: true, rubber: this.rubber(c) }); inp.u = 0; if (items && c.item) { c.botCool -= DT; if (c.botCool <= 0 && this.world.botWants(c, this.cars)) { inp.u = 1; c.botCool = (0.8 + Math.random() * 2.2) * [2.2, 1, 0.5][this.cfg.diff | 0]; } } } else { inp.st = 0; inp.g = 0; inp.b = 0; inp.d = 0; inp.u = 0; }
          } else {
            let it = null;
            if (p.q.length > 4) { let uu = 0; for (const x of p.q) uu |= x.u; it = p.q[p.q.length - 1]; it.u = uu; p.ack = it.seq; p.q.length = 0; }
            else if (p.q.length) { it = p.q.shift(); p.ack = it.seq; }
            if (it) p.last = it;
            const l = p.last; inp.st = l.st; inp.g = l.g; inp.b = l.b; inp.d = l.d; inp.u = l.u | 0;
            if (!racing) { p.q.length = 0; p.ack = p.lastSeq; }
          }
        } else { inp.st = 0; inp.g = 0; inp.b = 0; inp.d = 0; inp.u = 0; }
        if (c.out) { c.vx *= 0.9; c.vy *= 0.9; continue; }
        if (!racing) { // frozen on grid (still animates steering)
          c.st += clamp(inp.st - c.st, -0.15, 0.15); continue;
        }
        if (c.fin) { // finished cars coast with bot driving
          if (!c.ai) c.ai = AI.makeBrain(c.id + 5, 0.4);
          AI.drive(T, c, c.ai, this.cars, inp, DT, { racing: true, rubber: 0.8 });
        }
        const lapBefore = c.lap;
        const useEdge = inp.u && !c.prevU; c.prevU = inp.u;
        if (items && useEdge && !(c.useT > 0)) this.world.use(c, this.cars, evs);
        S.stepCar(T, c, inp, evs);
        this.afterStep(c, lapBefore);
      }
      if (racing) {
        S.collideCars(this.cars, evs);
        if (items) this.world.update(this.cars, evs, true);
        this.raceT += DT;
        this.modeLogic();
      }
      if (this.phase === PH.COUNTDOWN) {
        this.cd -= DT;
        if (this.cd <= 0) { this.phase = PH.RACING; this.raceT = 0; this.cd = 0; this.cars.forEach((c) => { c.lapStart = 0; }); evs.push(['go', 0]); this.pushRoom(); this.sendSnap(true); }
      } else if (this.phase === PH.ROUNDEND) {
        this.roundEndT -= DT;
        if (this.roundEndT <= 0) { const w = this.cars[this.winnerCar]; this.setupRound(w || this.cars[0]); }
      }
      if (this.tick % 2 === 0 || evs.length > 6) this.sendSnap(false);
      if (this.tick % 60 === 0) this.housekeeping();
    }
    rubber(c) {
      if (this.cfg.mode !== 'race' || c.bot !== 1) return 1;
      // gentle catch-up so bots stay in the mix of human players
      let best = -1e9, humanBest = -1e9;
      for (const o of this.cars) { if (o.prog > best) best = o.prog; if (!o.bot && o.prog > humanBest) humanBest = o.prog; }
      if (humanBest < -1e8) return 1;
      const gap = c.prog - humanBest;
      const d = this.cfg.diff;
      return clamp(1 - gap / 6000, d === 0 ? 0.8 : d === 2 ? 0.93 : 0.88, d === 0 ? 1.0 : d === 2 ? 1.08 : 1.06);
    }
    afterStep(c, lapBefore) {
      const T = this.T; if (c.finished) return;
      if (c.lap > lapBefore && c.lap >= 0) {
        const t = this.raceT;
        if (c.lap >= 1 || true) {
          const lt = t - c.lapStart; c.lapStart = t;
          if (c.lap >= 1 && (!c.bestLap || lt < c.bestLap)) c.bestLap = lt;
          this.events.push(['lap', c.id, c.lap, r2(lt)]);
        }
        if (this.cfg.mode === 'race' && c.lap >= T.laps && !c.fin) {
          c.finished = 1; c.fin = ++this.finishedCount; c.finT = t; this.events.push(['fin', c.id, c.fin, r2(t)]);
          if (!this.firstFinishT) this.firstFinishT = t;
        }
      } else if (c.lap < lapBefore && c.lap < 0) { /* backwards over the line at start: ignore */ }
    }
    modeLogic() {
      const evs = this.events;
      if (this.cfg.mode === 'race') {
        const humans = this.cars.filter((c) => !c.bot && !c.disc);
        const allHumansDone = humans.length === 0 ? this.cars.every((c) => c.fin) : humans.every((c) => c.fin);
        const timeout = this.firstFinishT && this.raceT - this.firstFinishT > 25;
        if (allHumansDone || timeout || this.raceT > 420) this.finish();
        return;
      }
      // duel: last place that falls outside the leash gets knocked out; last one standing scores
      const alive = this.cars.filter((c) => !c.out);
      if (this.raceT > 40) this.R = Math.max(190, 300 - (this.raceT - 40) * 3);
      let leader = alive[0]; for (const c of alive) if (c.prog > leader.prog) leader = c;
      for (const c of alive) {
        if (c === leader) { c.outT = 0; continue; }
        const dx = c.x - leader.x, dy = c.y - leader.y; const dist = Math.hypot(dx, dy); c.dist = dist;
        if (dist > this.R) c.outT += DT; else c.outT = Math.max(0, c.outT - DT * 2);
        if (c.outT > 0.55) { c.out = true; c.outAt = this.raceT; evs.push(['out', c.id]); }
      }
      const hum = this.cars.filter((c) => !c.out && !c.bot && !c.disc);
      let left = this.cars.filter((c) => !c.out);
      if (left.length > 1 && hum.length === 0) { // no humans alive: finish the round quickly
        left.forEach((c) => { if (c !== leader) { c.out = true; c.outAt = this.raceT; evs.push(['out', c.id]); } }); left = [leader];
      }
      if (left.length <= 1) {
        const w = left[0] || leader; w.pts++; this.winnerCar = w.id; evs.push(['score', w.id, w.pts]);
        if (w.pts >= this.target) { this.finish(); return; }
        this.phase = PH.ROUNDEND; this.roundEndT = 2.3; this.pushRoom(); this.sendSnap(true);
      }
    }
    finish() {
      const T = this.T; const duel = this.cfg.mode === 'duel';
      const list = this.cars.slice();
      if (duel) list.sort((a, b) => b.pts - a.pts || b.prog - a.prog);
      else list.sort((a, b) => (a.fin && b.fin ? a.fin - b.fin : a.fin ? -1 : b.fin ? 1 : b.prog - a.prog));
      this.res = list.map((c, i) => ({ car: c.id, name: c.name, color: c.color, style: c.style, bot: c.bot ? 1 : 0, place: i + 1, time: c.fin ? r2(c.finT) : 0, pts: c.pts, best: c.bestLap ? r2(c.bestLap) : 0, fin: c.fin ? 1 : 0, you: 0 }));
      this.phase = PH.RESULTS; this.events.push(['end', 0]);
      for (const p of this.players.values()) { p.rematch = false; p.q = []; }
      this.sendSnap(true); this.pushRoom();
    }
    housekeeping() {
      const now = Date.now();
      for (const [pid, p] of [...this.players]) {
        if (!p.conn && now - p.dcAt > 25000) this.removePlayer(pid);
      }
      if (this.phase !== PH.LOBBY && this.humanCount() === 0) { this.phase = PH.LOBBY; this.cars = []; this.res = null; }
    }

    /* ---------------------------------------------------------------- snapshots */
    snapshot() {
      const c = this.cars.map((c) => {
        const p = c.bot ? null : [...this.players.values()].find((x) => x.carId === c.id);
        const flags = (c.out ? 1 : 0) | (c.fin ? 2 : 0) | ((c.bot || c.disc) ? 4 : 0);
        return [c.id, r1(c.x), r1(c.y), r3(c.a), r1(c.vx), r1(c.vy), r2(c.st), r2(c.sw), r2(Math.max(0, c.tB)), r2(Math.max(0, c.tO)), r2(Math.max(0, c.tA)), r2(Math.max(0, c.tF)), r2(Math.max(0, c.tI)), r1(c.prog), flags | (c.fin << 4), p ? p.ack : 0, c.pts, r2(c.tW), r1(c.outT * 100) / 100, c.item | 0, r2(c.dc || 0)];
      });
      return { t: 's', k: this.tick, p: this.phase, cd: r2(this.cd), rt: r2(this.raceT), R: r1(this.R), rd: this.round, c, it: (this.cfg.items && this.world) ? this.world.snap() : undefined, e: this.events.length ? this.events.slice() : undefined };
    }
    sendSnap(force) {
      if (this.cars.length === 0) { this.events.length = 0; return; }
      const snap = this.snapshot(); this.events.length = 0;
      this.broadcast(snap);
    }
  }

  TT.room = { Room, PH, getTrack, MAX_CARS, NUM_COLORS, NUM_STYLES, cleanName };
  if (isNode) module.exports = TT.room;
})(typeof window !== 'undefined' ? window : globalThis);
