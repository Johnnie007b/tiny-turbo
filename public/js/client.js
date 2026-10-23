/* Tiny Turbo - DOM-free game client core: protocol, client-side prediction + reconciliation, snapshot interpolation. */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});
  const isNode = typeof module === 'object' && module.exports;
  const S = isNode ? require('./sim.js') : TT.sim;
  const R = isNode ? require('./room.js') : TT.room;
  const { DT, clamp, wrapAngle } = S;
  const PH = R.PH;
  const DT_MS = DT * 1000;
  const INTERP_TICKS = 6;

  class GameClient {
    constructor(send, opts) {
      this.send = send; opts = opts || {};
      this.now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
      this.pid = null; this.token = null; this.code = null; this.room = null; this.spectator = false;
      this.T = null; this.trackIdx = -1;
      this.snaps = []; this.last = null; this.offset = null; this.rtt = 0; this.err = null;
      this.me = null; this.carId = -1; this.hist = []; this.seq = 0; this.out = []; this.outFirst = 1; this.ox = 0; this.oy = 0; this.oa = 0;
      this.onevent = null; this.onroom = null; this.onerr = null; this.onphase = null; this.onwelcome = null; this.onsnap = null;
      this.phase = PH.LOBBY; this.stats = { snaps: 0, recon: 0, snapErr: 0, maxErr: 0, sumErr: 0, resets: 0 };
      this.inp = { st: 0, g: 0, b: 0, d: 0 }; this.evs = [];
      this.rows = new Map(); this.interp = INTERP_TICKS;
    }
    /* ------------------------------------------------ inbound */
    onMessage(str) {
      let m; try { m = typeof str === 'string' ? JSON.parse(str) : str; } catch (e) { return; }
      switch (m.t) {
        case 'welcome': this.pid = m.pid; this.token = m.token; this.code = m.code; this.spectator = !!m.spectator; this.onwelcome && this.onwelcome(m); break;
        case 'room': this.handleRoom(m); break;
        case 's': this.handleSnap(m); break;
        case 'q': this.rtt = this.now() - m.c; break;
        case 'err': this.err = m.msg; this.onerr && this.onerr(m); break;
      }
    }
    handleRoom(m) {
      const prev = this.room; this.room = m;
      const me = m.players.find((p) => p.id === this.pid); this.carId = me ? me.car : -1; this.spectator = !!(me && me.sp);
      if (m.ph !== PH.LOBBY && (this.trackIdx !== m.cfg.track || !this.T)) { this.trackIdx = m.cfg.track; this.T = R.getTrack(m.cfg.track); this.T.laps = m.cfg.laps; }
      if (this.T && m.cfg.laps) this.T.laps = m.cfg.laps;
      if (m.ph === PH.LOBBY) { this.snaps.length = 0; this.last = null; this.offset = null; this.me = null; this.hist.length = 0; }
      this.onroom && this.onroom(m, prev);
    }
    handleSnap(s) {
      if (!this.T) return;
      const t = this.now(); s.arr = t;
      this.stats.snaps++;
      const sample = s.k - t / DT_MS;
      if (this.offset === null || Math.abs(sample - this.offset) > 12) this.offset = sample;
      else this.offset += (sample - this.offset) * (sample > this.offset ? 0.25 : 0.01);
      const prevPhase = this.phase; this.phase = s.p;
      this.snaps.push(s); if (this.snaps.length > 12) this.snaps.shift();
      this.last = s;
      // events
      if (s.e && this.onevent) for (const e of s.e) this.onevent(e, s);
      // rows
      for (const row of s.c) this.rows.set(row[0], row);
      if (prevPhase !== s.p && this.onphase) this.onphase(s.p, prevPhase, s);
      this.reconcile(s);
      this.onsnap && this.onsnap(s);
    }
    reconcile(s) {
      const id = this.carId; if (id < 0 || this.spectator) { this.me = null; return; }
      const row = s.c.find((r) => r[0] === id); if (!row) { this.me = null; return; }
      const T = this.T;
      const c = this.me || (this.me = S.newCar(id));
      const old = { x: c.x, y: c.y, a: c.a };
      const hadState = this.me._init;
      c.x = row[1]; c.y = row[2]; c.a = row[3]; c.vx = row[4]; c.vy = row[5]; c.st = row[6]; c.sw = row[7];
      c.tB = row[8]; c.tO = row[9]; c.tA = row[10]; c.tF = row[11]; c.tI = row[12]; c.prog = row[13]; c.tW = row[17];
      const fl = row[14]; c.out = !!(fl & 1); c.fin = fl >> 4; c.pts = row[16];
      c.lap = Math.floor(c.prog / T.L); c.s = c.prog - c.lap * T.L; c.idx = -1;
      const ack = row[15];
      // drop acked history
      while (this.hist.length && this.hist[0].seq <= ack) this.hist.shift();
      if (s.p === PH.RACING && !c.out && !c.fin) {
        for (let i = 0; i < this.hist.length; i++) { const h = this.hist[i]; S.stepCar(T, c, h, null); }
        this.stats.recon++;
      } else { this.hist.length = this.hist.length > 120 ? 0 : this.hist.length; }
      c._init = true;
      if (hadState) {
        const ex = old.x - c.x, ey = old.y - c.y; const e = Math.hypot(ex, ey);
        this.stats.sumErr += e; if (e > this.stats.maxErr) this.stats.maxErr = e;
        if (e > 100 || c.tF > 0 || s.p !== PH.RACING) { this.ox = 0; this.oy = 0; this.oa = 0; this.stats.resets++; }
        else { this.ox = ex; this.oy = ey; this.oa = wrapAngle(old.a - c.a); }
      }
    }
    /* ------------------------------------------------ outbound / local step (call at 60 Hz) */
    step(input) {
      // record + send input
      const seq = ++this.seq; const f = (input.g ? 1 : 0) | (input.b ? 2 : 0) | (input.d ? 4 : 0) | (input.u ? 8 : 0);
      const item = { seq, st: input.st, g: input.g ? 1 : 0, b: input.b ? 1 : 0, d: input.d ? 1 : 0 };
      this.hist.push(item); if (this.hist.length > 240) this.hist.shift();
      if (this.out.length === 0) this.outFirst = seq;
      this.out.push([Math.round(input.st * 100) / 100, f]);
      item.st = Math.round(input.st * 100) / 100;
      if (this.out.length >= 2) this.flush();
      // predict
      const c = this.me;
      if (c && this.phase === PH.RACING && !c.out && !c.fin && this.T) {
        S.stepCar(this.T, c, item, this.evs); this.evs.length = 0;
      }
      const k = Math.exp(-DT * 9); this.ox *= k; this.oy *= k; this.oa *= k;
    }
    flush() { if (!this.out.length) return; this.send(JSON.stringify({ t: 'i', n: this.outFirst, a: this.out })); this.out = []; }
    /* ------------------------------------------------ render sampling */
    // interpolated missiles [{id,x,y,a}] for the same render time as sample(); slicks / pickup mask come from the latest snapshot
    sampleMissiles(out) {
      out = out || []; out.length = 0; const cur = this.cur; if (!cur || !cur.b.it) return out;
      const ma = cur.a.it ? cur.a.it.m : [], mb = cur.b.it.m;
      for (const m of mb) {
        const o = ma.find((x) => x[0] === m[0]);
        if (o) out.push({ id: m[0], x: o[1] + (m[1] - o[1]) * cur.f, y: o[2] + (m[2] - o[2]) * cur.f, a: o[3] + wrapAngle(m[3] - o[3]) * cur.f });
        else out.push({ id: m[0], x: m[1], y: m[2], a: m[3] });
      }
      return out;
    }
    renderTick() { return this.now() / DT_MS + (this.offset || 0) - this.interp; }
    // returns Map id -> {x,y,a,vx,vy,row(latest),tA,tF,tB,tO,tI,...}
    sample(into) {
      const out = into || new Map();
      const sn = this.snaps; if (!sn.length) return out;
      const rt = this.renderTick();
      let a = sn[0], b = sn[0];
      for (let i = sn.length - 1; i >= 0; i--) { if (sn[i].k <= rt) { a = sn[i]; b = sn[Math.min(i + 1, sn.length - 1)]; break; } if (i === 0) { a = sn[0]; b = sn[0]; } }
      let f = b.k === a.k ? 0 : (rt - a.k) / (b.k - a.k);
      let ext = 0;
      if (rt > sn[sn.length - 1].k) { a = b = sn[sn.length - 1]; f = 0; ext = Math.min(rt - a.k, 8) * DT; }
      this.cur = { a, b, f: clamp(f, 0, 1), ext };
      for (const ra of a.c) {
        const rb = b.c.find((r) => r[0] === ra[0]) || ra;
        const o = out.get(ra[0]) || {}; o.id = ra[0];
        const ff = clamp(f, 0, 1);
        let dx = rb[1] - ra[1], dy = rb[2] - ra[2];
        const teleport = dx * dx + dy * dy > 200 * 200 || (ra[11] > 0) !== (rb[11] > 0);
        o.x = teleport ? rb[1] : ra[1] + dx * ff + ra[4] * ext; o.y = teleport ? rb[2] : ra[2] + dy * ff + ra[5] * ext;
        o.a = ra[3] + wrapAngle(rb[3] - ra[3]) * ff + ra[7] * ext * 0.5;
        o.vx = ra[4] + (rb[4] - ra[4]) * ff; o.vy = ra[5] + (rb[5] - ra[5]) * ff;
        o.st = ra[6]; o.tB = rb[8]; o.tO = rb[9]; o.tA = rb[10]; o.tF = rb[11]; o.tI = rb[12]; o.prog = ra[13] + (rb[13] - ra[13]) * ff; o.flags = rb[14]; o.pts = rb[16]; o.tW = rb[17]; o.outT = rb[18]; o.item = rb[19] | 0;
        out.set(ra[0], o);
      }
      return out;
    }
  }
  TT.client = { GameClient, INTERP_TICKS };
  if (isNode) module.exports = TT.client;
})(typeof window !== 'undefined' ? window : globalThis);
