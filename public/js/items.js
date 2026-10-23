/* Tiny Turbo - pickups & weapons: item boxes, MISSILE (homing-ish rocket), OIL SLICK (drop behind), TURBO (speed burst).
   Pure logic on top of sim.js; used by the authoritative Room (server, or local solo room). */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});
  const isNode = typeof module === 'object' && module.exports;
  const S = isNode ? require('./sim.js') : TT.sim;
  const { DT, clamp, wrapAngle } = S;

  const IT = { NONE: 0, MISSILE: 1, OIL: 2, TURBO: 3 };
  const NAMES = ['', 'MISSILE', 'OIL SLICK', 'TURBO'];
  const C = {
    PICK_R: 20, RESPAWN: 6.5, MISSILE_V: 560, MISSILE_LIFE: 2.1, MISSILE_TURN: 2.7, MISSILE_R: 13,
    SLICK_R: 22, SLICK_LIFE: 16, SLICK_GRACE: 1.1, MAX_SLICKS: 20, TURBO_T: 2.3, MISSILE_GRACE: 0.22
  };

  // deterministic item box rows around the lap (3 boxes across the road), clear of the grid / gaps / hazards / obstacles
  function makePickups(T) {
    const out = []; const rows = Math.max(4, Math.round(T.L / 1050)); const first = 620;
    for (let i = 0; i < rows; i++) {
      let s = first + (T.L - first - 500) * (i / rows);
      for (let tries = 0; tries < 30; tries++) {
        let bad = !!S.inGap(T, s) || !!S.inGap(T, s + 60) || !!S.inGap(T, s - 60);
        for (const h of T.hazards) { let ds = Math.abs(h.s - s); ds = Math.min(ds, T.L - ds); if (ds < h.r + 70) bad = true; }
        for (const o of T.obstacles) { let ds = Math.abs(o.s - s); ds = Math.min(ds, T.L - ds); if (ds < o.r + 70) bad = true; }
        if (!bad) break; s += 55;
      }
      const w = T.hw * 0.52;
      for (let k = -1; k <= 1; k++) { const p = T.pos(s, k * w); out.push({ x: p.x, y: p.y, s, d: k * w, t: 0 }); }
    }
    return out.slice(0, 30);
  }

  class World {
    constructor(T, rnd) {
      this.T = T; this.rnd = rnd || Math.random; this.pk = makePickups(T); this.slicks = []; this.missiles = []; this.nid = 1; this.q = {};
    }
    reset(cars) { this.pk.forEach((p) => { p.t = 0; }); this.slicks.length = 0; this.missiles.length = 0; if (cars) cars.forEach((c) => { c.item = 0; c.useT = 0; }); }
    rollItem(c, cars) {
      const alive = cars.filter((o) => !o.out); alive.sort((a, b) => b.prog - a.prog);
      const rank = Math.max(0, alive.indexOf(c)); const f = alive.length > 1 ? rank / (alive.length - 1) : 0;
      const wM = 0.3 + 0.3 * f, wO = 0.36 - 0.26 * f, wT = 0.34 + 0.02 * f; const tot = wM + wO + wT; let r = this.rnd() * tot;
      if ((r -= wM) < 0) return IT.MISSILE; if ((r -= wO) < 0) return IT.OIL; return IT.TURBO;
    }
    use(c, cars, evs) {
      const it = c.item; if (!it || c.out || c.fin || c.tF > 0) return false;
      c.item = 0; const cs = Math.cos(c.a), sn = Math.sin(c.a);
      if (it === IT.MISSILE) {
        let tgt = -1, best = 1e9;
        for (const o of cars) {
          if (o === c || o.out || o.tF > 0) continue; const dx = o.x - c.x, dy = o.y - c.y; const d = Math.hypot(dx, dy); if (d > 650 || d < 1) continue;
          const ang = Math.abs(wrapAngle(Math.atan2(dy, dx) - c.a)); if (ang > 0.62) continue; const score = d * (1 + ang); if (score < best) { best = score; tgt = o.id; }
        }
        const v = Math.max(C.MISSILE_V, Math.hypot(c.vx, c.vy) + 260);
        this.missiles.push({ id: this.nid++, x: c.x + cs * 20, y: c.y + sn * 20, a: c.a, v, life: C.MISSILE_LIFE, owner: c.id, tgt, age: 0 });
        evs && evs.push(['fire', c.id, IT.MISSILE]);
      } else if (it === IT.OIL) {
        if (this.slicks.length >= C.MAX_SLICKS) this.slicks.shift();
        this.slicks.push({ id: this.nid++, x: c.x - cs * 24, y: c.y - sn * 24, r: C.SLICK_R, life: C.SLICK_LIFE, owner: c.id, age: 0 });
        evs && evs.push(['fire', c.id, IT.OIL]);
      } else if (it === IT.TURBO) {
        c.tB = Math.max(c.tB, C.TURBO_T); c.vx += cs * 90; c.vy += sn * 90; evs && evs.push(['fire', c.id, IT.TURBO], ['boost', c.id]);
      }
      return true;
    }
    hitCar(c, dirx, diry, owner, evs) {
      if (c.tI > 0) return;
      c.vx = c.vx * 0.25 + dirx * 150; c.vy = c.vy * 0.25 + diry * 150; c.sw += (((c.id + this.nid) & 1) ? 1 : -1) * 9; c.tB = 0; c.tO = Math.max(c.tO, 1.0);
      if (c.item === 0) c.useT = 0.6; // brief lockout
      evs && evs.push(['hit', c.id, owner]);
    }
    // call once per tick (after cars stepped). cars: array of car objects. evs: event array
    update(cars, evs, active) {
      const T = this.T;
      for (const p of this.pk) if (p.t > 0) p.t -= DT;
      for (const c of cars) { if (c.useT > 0) c.useT -= DT; if (c.tF > 0) c.item = 0; }
      if (!active) return;
      // pickups
      for (const p of this.pk) {
        if (p.t > 0) continue;
        for (const c of cars) {
          if (c.out || c.fin || c.item || c.tF > 0 || c.tA > 0.1) continue;
          const dx = c.x - p.x, dy = c.y - p.y; if (dx * dx + dy * dy < C.PICK_R * C.PICK_R) { p.t = C.RESPAWN; c.item = this.rollItem(c, cars); evs && evs.push(['pick', c.id, c.item]); break; }
        }
      }
      // slicks
      for (let i = this.slicks.length - 1; i >= 0; i--) {
        const s = this.slicks[i]; s.age += DT; s.life -= DT; if (s.life <= 0) { this.slicks.splice(i, 1); continue; }
        for (const c of cars) {
          if (c.out || c.tF > 0 || c.tA > 0 || c.tI > 0) continue; if (c.id === s.owner && s.age < C.SLICK_GRACE) continue;
          const dx = c.x - s.x, dy = c.y - s.y, rr = s.r + 5; if (dx * dx + dy * dy < rr * rr) {
            if (c.tO <= 0) { evs && evs.push(['oil', c.id]); c.sw += (((c.id + s.id) & 1) ? 1 : -1) * 5; } c.tO = 1.5;
          }
        }
      }
      // missiles
      for (let i = this.missiles.length - 1; i >= 0; i--) {
        const m = this.missiles[i]; m.age += DT; m.life -= DT; let dead = m.life <= 0;
        if (!dead && m.tgt >= 0) {
          const t = cars[m.tgt]; if (t && !t.out && t.tF <= 0) { const want = Math.atan2(t.y - m.y, t.x - m.x); m.a += clamp(wrapAngle(want - m.a), -C.MISSILE_TURN * DT, C.MISSILE_TURN * DT); }
        }
        if (!dead) {
          m.x += Math.cos(m.a) * m.v * DT; m.y += Math.sin(m.a) * m.v * DT;
          const q = S.query(T, m.x, m.y, -1, this.q); if (Math.abs(q.d) > T.hw + 45 && T.edge !== 'rough') { dead = true; evs && evs.push(['pop', m.id]); }
          for (const o of T.obstacles) { const dx = m.x - o.x, dy = m.y - o.y; if (dx * dx + dy * dy < (o.r + 6) * (o.r + 6)) { dead = true; evs && evs.push(['pop', m.id]); break; } }
        }
        if (!dead) {
          for (const c of cars) {
            if (c.out || c.tF > 0 || c.tA > 0.1) continue; if (c.id === m.owner && m.age < C.MISSILE_GRACE) continue;
            const dx = c.x - m.x, dy = c.y - m.y, rr = C.MISSILE_R + 10; if (dx * dx + dy * dy < rr * rr) { this.hitCar(c, Math.cos(m.a), Math.sin(m.a), m.owner, evs); dead = true; break; }
          }
        }
        if (dead) this.missiles.splice(i, 1);
      }
    }
    // simple bot logic: returns true when the bot should use its item now
    botWants(c, cars) {
      if (!c.item || c.useT > 0) return false;
      if (c.item === IT.TURBO) return c.tB <= 0 && Math.hypot(c.vx, c.vy) > 120;
      if (c.item === IT.MISSILE) {
        for (const o of cars) { if (o === c || o.out || o.tF > 0) continue; const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy); if (d < 520 && d > 40 && Math.abs(wrapAngle(Math.atan2(dy, dx) - c.a)) < 0.3) return true; }
        return false;
      }
      if (c.item === IT.OIL) {
        for (const o of cars) { if (o === c || o.out || o.tF > 0) continue; const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy); if (d < 190 && d > 20 && Math.abs(wrapAngle(Math.atan2(dy, dx) - c.a + Math.PI)) < 0.6) return true; }
      }
      return false;
    }
    snap() {
      let mask = 0; this.pk.forEach((p, i) => { if (p.t > 0) mask |= (1 << i); });
      return { pk: mask, m: this.missiles.map((m) => [m.id, Math.round(m.x * 10) / 10, Math.round(m.y * 10) / 10, Math.round(m.a * 100) / 100]), o: this.slicks.map((s) => [s.id, Math.round(s.x), Math.round(s.y), Math.round(s.life * 10) / 10]) };
    }
  }
  TT.items = { World, makePickups, IT, NAMES, C };
  if (isNode) module.exports = TT.items;
})(typeof window !== 'undefined' ? window : globalThis);
