/* Tiny Turbo - shared physics + track geometry. Runs in Node (server, tests) and the browser. */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});

  const DT = 1 / 60;
  const P = {
    MAXV: 380, REVMAX: 130, ENG: 560, BRK: 820, REVACC: 300,
    TURN: 3.55, STEER_RATE: 9, GRIP: 6.2, CAR_R: 9, WHEEL_R: 8.5, WHEEL_OFF: 7.5,
    BOOST_T: 1.1, BOOST_V: 1.32, FALL_T: 0.95, INV_T: 1.6,
    WALL_PAD: 14, ROUGH_BAND: 80, FALL_PAD: 6, BUMP_E: 0.8, RAM: 0.28
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------ track building */
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return [
      0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    ];
  }

  function buildTrack(def) {
    const ctrl = def.pts, n0 = ctrl.length, dense = [];
    for (let i = 0; i < n0; i++) {
      const p0 = ctrl[(i - 1 + n0) % n0], p1 = ctrl[i], p2 = ctrl[(i + 1) % n0], p3 = ctrl[(i + 2) % n0];
      for (let k = 0; k < 40; k++) dense.push(catmull(p0, p1, p2, p3, k / 40));
    }
    // arc length
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = cum[dense.length];
    const SP = 8;
    const n = Math.round(total / SP), sp = total / n;
    const px = new Float64Array(n), py = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const target = i * sp;
      while (cum[j + 1] < target) j++;
      const a = dense[j], b = dense[(j + 1) % dense.length];
      const f = (target - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
      px[i] = a[0] + (b[0] - a[0]) * f; py[i] = a[1] + (b[1] - a[1]) * f;
    }
    const tx = new Float64Array(n), ty = new Float64Array(n), ang = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      const dx = px[b] - px[a], dy = py[b] - py[a], l = Math.hypot(dx, dy) || 1;
      tx[i] = dx / l; ty[i] = dy / l; ang[i] = Math.atan2(dy, dx);
    }
    // right-hand normal in screen coords (y down): (-ty, tx)
    const nx = new Float64Array(n), ny = new Float64Array(n);
    for (let i = 0; i < n; i++) { nx[i] = -ty[i]; ny[i] = tx[i]; }
    // curvature -> AI speed limits
    const W = Math.round(70 / sp);
    const vmax = new Float64Array(n);
    const kappa = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - W + n) % n, b = (i + W) % n;
      const da = Math.abs(wrapAngle(ang[b] - ang[a]));
      kappa[i] = da / (2 * W * sp);
    }
    for (let i = 0; i < n; i++) {
      const k = Math.max(kappa[i], 1e-5);
      vmax[i] = clamp(Math.sqrt(1000 / k) * 1.0, 150, P.MAXV);
    }
    const T = {
      id: def.id, def, name: def.name, theme: def.theme, edge: def.edge || 'wall', hw: def.hw || 78,
      grip: def.grip || 1, n, sp, L: n * sp, px, py, tx, ty, nx, ny, ang, vmax, kappa,
      laps: def.laps || 3, hazards: [], obstacles: [], gaps: [], bounds: null
    };
    T.at = function (s) { // centerline sample at arc position s (wraps)
      s = ((s % T.L) + T.L) % T.L;
      const f = s / T.sp, i = Math.floor(f) % T.n, fr = f - Math.floor(f), j = (i + 1) % T.n;
      let da = wrapAngle(T.ang[j] - T.ang[i]);
      return { x: T.px[i] + (T.px[j] - T.px[i]) * fr, y: T.py[i] + (T.py[j] - T.py[i]) * fr, a: T.ang[i] + da * fr, nx: T.nx[i], ny: T.ny[i], i };
    };
    T.pos = function (s, d) { const p = T.at(s); p.x += p.nx * d; p.y += p.ny * d; return p; };
    // content placement (done in the authored frame, then the track is rotated so s=0 is the start line)
    (def.hazards || []).forEach((h, idx) => {
      const p = T.pos(h.s * T.L, h.d || 0);
      T.hazards.push({ k: h.k, x: p.x, y: p.y, a: p.a, r: h.r || 30, s: h.s * T.L, d: h.d || 0, id: idx });
    });
    (def.obstacles || []).forEach((o, idx) => {
      const p = T.pos(o.s * T.L, o.d || 0);
      T.obstacles.push({ k: o.k, x: p.x, y: p.y, a: p.a, r: o.r || 16, s: o.s * T.L, d: o.d || 0, id: idx, v: o.v || 0 });
    });
    (def.gaps || []).forEach((gp) => { T.gaps.push({ s0: gp.s0 * T.L, s1: gp.s1 * T.L }); });
    if (def.startAt) {
      let bi = 0, bd = 1e18;
      for (let i = 0; i < n; i++) { const d2 = (px[i] - def.startAt[0]) ** 2 + (py[i] - def.startAt[1]) ** 2; if (d2 < bd) { bd = d2; bi = i; } }
      const rot = (arr) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = arr[(i + bi) % n]; return o; };
      T.px = rot(px); T.py = rot(py); T.tx = rot(tx); T.ty = rot(ty); T.ang = rot(ang); T.nx = rot(nx); T.ny = rot(ny); T.vmax = rot(vmax); T.kappa = rot(kappa);
      const shift = bi * sp; const fix = (v) => ((v - shift) % T.L + T.L) % T.L;
      T.hazards.forEach((h) => { h.s = fix(h.s); }); T.obstacles.forEach((o) => { o.s = fix(o.s); });
      T.gaps.forEach((gp) => { gp.s0 = fix(gp.s0); gp.s1 = fix(gp.s1); });
    }
    // keep the start grid and the first moments of the race free of slippery stuff
    T.hazards.forEach((h) => { if ((h.k === 'oil' || h.k === 'water') && h.s < 330) { h.s += 340; const q = T.pos(h.s, h.d); h.x = q.x; h.y = q.y; h.a = q.a; } });
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (let i = 0; i < n; i++) { minx = Math.min(minx, px[i]); maxx = Math.max(maxx, px[i]); miny = Math.min(miny, py[i]); maxy = Math.max(maxy, py[i]); }
    const m = T.hw + 260;
    T.bounds = { x0: minx - m, y0: miny - m, x1: maxx + m, y1: maxy + m };
    T.limit = T.edge === 'rough' ? T.hw + P.ROUGH_BAND : T.edge === 'wall' ? T.hw + P.WALL_PAD : T.hw + P.FALL_PAD;
    return T;
  }

  // nearest centerline point. hint = previous index (fast local search). returns into out object.
  function query(T, x, y, hint, out) {
    const n = T.n, px = T.px, py = T.py;
    let best = -1, bd = 1e18;
    if (hint >= 0) {
      for (let k = -22; k <= 22; k++) {
        const i = (hint + k + n) % n; const dx = x - px[i], dy = y - py[i]; const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = i; }
      }
    }
    if (best < 0 || bd > (T.hw * 2.2) * (T.hw * 2.2)) {
      bd = 1e18;
      for (let i = 0; i < n; i++) { const dx = x - px[i], dy = y - py[i]; const d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = i; } }
    }
    // refine on segments (best-1,best) and (best,best+1)
    let bestS = best * T.sp, bestD2 = bd, cx = px[best], cy = py[best], bi = best;
    for (let side = -1; side <= 1; side += 2) {
      const a = side < 0 ? (best - 1 + n) % n : best, b = (a + 1) % n;
      const ax = px[a], ay = py[a], ex = px[b] - ax, ey = py[b] - ay;
      const l2 = ex * ex + ey * ey; let t = ((x - ax) * ex + (y - ay) * ey) / l2; t = clamp(t, 0, 1);
      const qx = ax + ex * t, qy = ay + ey * t; const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d2 <= bestD2) {
        bestD2 = d2; cx = qx; cy = qy;
        bestS = a * T.sp + t * T.sp; bi = t > 0.5 ? b : a;
        if (bestS >= T.L) bestS -= T.L;
      }
    }
    const nxv = T.nx[bi], nyv = T.ny[bi];
    out.i = bi; out.s = bestS; out.cx = cx; out.cy = cy; out.d = (x - cx) * nxv + (y - cy) * nyv; out.dist = Math.sqrt(bestD2);
    out.nx = nxv; out.ny = nyv; out.tx = T.tx[bi]; out.ty = T.ty[bi];
    return out;
  }

  /* ------------------------------------------------------------ cars */
  function newCar(id) {
    return {
      id, x: 0, y: 0, a: 0, vx: 0, vy: 0, st: 0, sw: 0,
      tB: 0, tO: 0, tA: 0, tF: 0, tI: 0, tW: 0, // boost, oil, air, fall, invuln, in-water flag
      idx: -1, s: 0, lap: -1, prog: 0, d: 0, q: {}, airMax: 1,
      // meta
      out: false, fin: 0, finT: 0, lastLapT: 0, bestLap: 0, lapStart: 0, safeS: 0, ai: null, name: '', color: 0, style: 0, pts: 0, outT: 0, dist: 0, roll: 0
    };
  }
  function setPose(T, c, s, d, lapBase) {
    const p = T.pos(s, d);
    c.x = p.x; c.y = p.y; c.a = p.a; c.vx = 0; c.vy = 0; c.st = 0; c.sw = 0; c.tB = 0; c.tO = 0; c.tA = 0; c.tF = 0; c.idx = p.i;
    const sn = ((s % T.L) + T.L) % T.L;
    c.s = sn; c.lap = Math.round((s - sn) / T.L) + (lapBase || 0); c.prog = c.lap * T.L + c.s;
  }

  const _q = {};
  function inGap(T, s) { for (let i = 0; i < T.gaps.length; i++) { const g2 = T.gaps[i]; if (s >= g2.s0 && s <= g2.s1) return g2; } return null; }

  function respawn(T, c) {
    // put on centerline, slightly behind where it left the road / before the gap
    let s = c.s - 70;
    const gp = inGap(T, c.s) || inGap(T, c.s - 70);
    if (gp) s = gp.s0 - 280;
    const lapShift = c.lap;
    const sn = ((s % T.L) + T.L) % T.L;
    const wrapped = (s < 0 ? -1 : 0);
    const prog = (lapShift + wrapped) * T.L + sn;
    const p = T.at(s);
    c.x = p.x; c.y = p.y; c.a = p.a; c.vx = Math.cos(p.a) * 40; c.vy = Math.sin(p.a) * 40; c.st = 0; c.sw = 0; c.tB = 0; c.tO = 0; c.tA = 0; c.tF = 0;
    c.tI = P.INV_T; c.idx = p.i; c.s = sn; c.lap = lapShift + wrapped; c.prog = prog;
  }

  // input: {st:-1..1, g:0/1, b:0/1, d:0/1}
  function stepCar(T, c, inp, evs, dt) {
    dt = dt || DT;
    if (c.tI > 0) c.tI -= dt;
    if (c.tF > 0) {
      c.tF -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= (1 - 1.5 * dt); c.vy *= (1 - 1.5 * dt); c.a += 3 * dt;
      if (c.tF <= 0) { c.tF = 0; respawn(T, c); }
      return;
    }
    const air = c.tA > 0;
    // steering smoothing
    const target = clamp(inp.st || 0, -1, 1);
    const rate = P.STEER_RATE * dt;
    c.st += clamp(target - c.st, -rate, rate);
    if (c.tB > 0) c.tB -= dt;
    if (c.tO > 0) c.tO -= dt;
    // surface status from last query
    const q = c.q;
    const rough = T.edge === 'rough' && Math.abs(c.d) > T.hw;
    const water = c.tW > 0 && !air;
    const oil = c.tO > 0;
    const hb = inp.d ? 1 : 0;
    let maxV = P.MAXV * (rough ? 0.55 : 1) * (c.tB > 0 ? P.BOOST_V : 1) * (water ? 0.72 : 1);
    // heading
    const cs0 = Math.cos(c.a), sn0 = Math.sin(c.a);
    let vF = c.vx * cs0 + c.vy * sn0;
    if (!air) {
      let steerGain = oil ? 0.3 : water ? 0.85 : rough ? 0.8 : 1;
      const spd = Math.abs(vF);
      const sf = clamp(spd / 110, 0, 1) * (1.1 - 0.4 * clamp(spd / P.MAXV, 0, 1));
      const dir = vF >= -5 ? 1 : -1;
      c.a += c.st * P.TURN * sf * steerGain * dir * (hb ? 1.4 : 1) * dt;
    } else {
      c.a += c.st * 0.8 * dt;
    }
    c.a += c.sw * dt; c.sw *= Math.exp(-2.4 * dt);
    if (c.a > Math.PI) c.a -= 2 * Math.PI; else if (c.a < -Math.PI) c.a += 2 * Math.PI;
    const cs = Math.cos(c.a), sn = Math.sin(c.a);
    vF = c.vx * cs + c.vy * sn;
    let vL = -c.vx * sn + c.vy * cs;
    if (!air) {
      // throttle / brake
      if (inp.g) {
        const acc = P.ENG * Math.max(0, 1 - Math.max(vF, 0) / maxV) + (c.tB > 0 ? 520 : 0);
        vF += (vF < 0 ? acc + 500 : acc) * dt;
      } else {
        vF -= vF * (rough ? 1.6 : 0.55) * dt;
      }
      if (inp.b) {
        if (vF > 15) vF -= P.BRK * dt;
        else vF = Math.max(vF - P.REVACC * dt, -P.REVMAX);
      }
      if (vF > maxV) vF -= (vF - maxV) * 2.4 * dt;
      if (rough) vF -= vF * 1.2 * dt;
      if (water) vF -= vF * 1.1 * dt;
      // lateral grip
      let gk = P.GRIP * T.grip;
      if (Math.abs(c.st) > 0.55 && Math.abs(vF) > 240) gk *= 0.72;
      if (hb) { gk *= 0.2; vF -= vF * 0.25 * dt; }
      if (oil) gk *= 0.1; else if (water) gk *= 0.6; else if (rough) gk *= 0.75;
      vL *= Math.exp(-gk * dt);
      c.vx = cs * vF - sn * vL; c.vy = sn * vF + cs * vL;
    } else {
      // in the air: gentle auto-guidance keeps jumps landing on the road ahead
      const tp = T.pos(c.s + 110, 0);
      const want = Math.atan2(tp.y - c.y, tp.x - c.x), cur = Math.atan2(c.vy, c.vx);
      const sp = Math.hypot(c.vx, c.vy) * (1 - 0.08 * dt);
      const na = cur + clamp(wrapAngle(want - cur), -3.2 * dt, 3.2 * dt);
      c.vx = Math.cos(na) * sp; c.vy = Math.sin(na) * sp;
      c.a += wrapAngle(na - c.a) * Math.min(1, 7 * dt);
    }
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.tW = Math.max(0, c.tW - dt * 6);

    // ---- environment
    query(T, c.x, c.y, c.idx, q);
    c.idx = q.i; c.d = q.d;
    let ds = q.s - c.s;
    if (ds < -T.L / 2) c.lap++; else if (ds > T.L / 2) c.lap--;
    c.s = q.s; c.prog = c.lap * T.L + c.s;
    const ad = Math.abs(q.d);
    if (!air) {
      if (T.edge === 'fall') {
        if (ad > T.limit) { c.tF = P.FALL_T; evs && evs.push(['fall', c.id]); return; }
      } else if (ad > T.limit - (T.edge === 'wall' ? 0 : 0)) {
        if (T.edge === 'wall' || T.edge === 'rough') wallPush(T, c, q, evs);
      }
      const gp = inGap(T, c.s);
      if (gp && ad < T.hw + 4) { c.tF = P.FALL_T; evs && evs.push(['fall', c.id]); return; }
      // hazards
      for (let i = 0; i < T.hazards.length; i++) {
        if (c.tI > 0 && (T.hazards[i].k === 'oil' || T.hazards[i].k === 'water')) continue;
        const h = T.hazards[i]; const dx = c.x - h.x, dy = c.y - h.y; const rr = h.r + 4;
        if (dx * dx + dy * dy < rr * rr) {
          if (h.k === 'boost') { if (c.tB < 0.5) { evs && evs.push(['boost', c.id]); const f = Math.cos(c.a), g2 = Math.sin(c.a); c.vx += f * 70; c.vy += g2 * 70; } c.tB = P.BOOST_T; }
          else if (h.k === 'oil') { if (c.tO <= 0) { evs && evs.push(['oil', c.id]); c.sw += (((c.id + h.id) & 1) ? 1 : -1) * 5; } c.tO = 1.5; }
          else if (h.k === 'water') { if (c.tW <= 0.1) evs && evs.push(['splash', c.id]); c.tW = 1; }
          else if (h.k === 'ramp') {
            const sp = Math.hypot(c.vx, c.vy);
            if (sp > 90 && c.tA <= 0) { if (sp < 270) { const f = Math.cos(c.a), g3 = Math.sin(c.a); c.vx = f * 270; c.vy = g3 * 270; } c.tA = clamp(215 / Math.max(sp, 270), 0.4, 0.8); c.airMax = c.tA; evs && evs.push(['ramp', c.id]); }
          }
        }
      }
      // obstacles
      for (let i = 0; i < T.obstacles.length; i++) {
        const o = T.obstacles[i]; const dx = c.x - o.x, dy = c.y - o.y; const rr = o.r + P.CAR_R;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.01, nxx = dx / d, nyy = dy / d;
          c.x = o.x + nxx * rr; c.y = o.y + nyy * rr;
          const vn = c.vx * nxx + c.vy * nyy;
          if (vn < 0) {
            c.vx -= 1.45 * vn * nxx; c.vy -= 1.45 * vn * nyy; c.vx *= 0.93; c.vy *= 0.93;
            if (-vn > 70) evs && evs.push(['bump', c.id]);
          }
        }
      }
    } else {
      c.tA -= dt;
      if (c.tA <= 0) {
        // landing: check immediately for gap / fall (a little mercy: hang in the air a bit longer if we'd land in the gap)
        const gp = inGap(T, c.s);
        if (gp && c.tM !== 1) { c.tA = 0.1; c.tM = 1; return; }
        c.tM = 0; c.tA = 0; evs && evs.push(['land', c.id]);
        if (gp && ad < T.hw + 4) { c.tF = P.FALL_T; evs && evs.push(['fall', c.id]); }
        else if (T.edge === 'fall' && ad > T.limit) { c.tF = P.FALL_T; evs && evs.push(['fall', c.id]); }
      }
    }
  }

  function wallPush(T, c, q, evs) {
    const lim = T.limit - P.CAR_R * 0.4; // car center must stay inside
    const sign = q.d >= 0 ? 1 : -1;
    const ex = (Math.abs(q.d) - lim);
    if (ex <= 0) return;
    // push back along the normal
    c.x -= q.nx * sign * ex; c.y -= q.ny * sign * ex;
    const vn = (c.vx * q.nx + c.vy * q.ny) * sign; // outward component
    if (vn > 0) {
      c.vx -= 1.35 * vn * q.nx * sign; c.vy -= 1.35 * vn * q.ny * sign;
      c.vx *= 0.97; c.vy *= 0.97;
      if (vn > 70) evs && evs.push(['wall', c.id]);
    }
    c.d = sign * lim;
  }

  function carCircles(c, out) {
    const cs = Math.cos(c.a), sn = Math.sin(c.a);
    out[0] = c.x + cs * P.WHEEL_OFF; out[1] = c.y + sn * P.WHEEL_OFF;
    out[2] = c.x - cs * P.WHEEL_OFF; out[3] = c.y - sn * P.WHEEL_OFF;
  }
  const _ca = [0, 0, 0, 0], _cb = [0, 0, 0, 0];
  function collideCars(cars, evs) {
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i]; if (a.out || a.tF > 0 || a.tI > 0 || a.tA > 0.1) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j]; if (b.out || b.tF > 0 || b.tI > 0 || b.tA > 0.1) continue;
        const ddx = a.x - b.x, ddy = a.y - b.y; if (ddx * ddx + ddy * ddy > 40 * 40) continue;
        carCircles(a, _ca); carCircles(b, _cb);
        let hit = false;
        for (let u = 0; u < 2; u++) for (let v = 0; v < 2; v++) {
          const ax = _ca[u * 2], ay = _ca[u * 2 + 1], bx = _cb[v * 2], by = _cb[v * 2 + 1];
          let dx = ax - bx, dy = ay - by; const rr = P.WHEEL_R * 2; const d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.01; dx /= d; dy /= d; const pen = (rr - d) * 0.5;
            a.x += dx * pen; a.y += dy * pen; b.x -= dx * pen; b.y -= dy * pen;
            const rvx = a.vx - b.vx, rvy = a.vy - b.vy; const vn = rvx * dx + rvy * dy;
            if (vn < 0) {
              const aIn = Math.max(0, -(a.vx * dx + a.vy * dy)), bIn = Math.max(0, (b.vx * dx + b.vy * dy));
              const J = -(1 + P.BUMP_E) * vn * 0.5;
              a.vx += dx * J; a.vy += dy * J; b.vx -= dx * J; b.vy -= dy * J;
              // ram bonus: the car that is driving INTO the other shoves it extra hard (classic bump-them-off-the-table feel)
              if (aIn > bIn) { b.vx -= dx * aIn * P.RAM; b.vy -= dy * aIn * P.RAM; } else if (bIn > aIn) { a.vx += dx * bIn * P.RAM; a.vy += dy * bIn * P.RAM; }
              // torque from off-center contact
              const cax = ax - a.x, cay = ay - a.y, cbx = bx - b.x, cby = by - b.y;
              a.sw += clamp((cax * dy - cay * dx) * J * 0.012, -3, 3);
              b.sw -= clamp((cbx * dy - cby * dx) * J * 0.012, -3, 3);
              if (-vn > 60 && !hit) { hit = true; evs && evs.push(['car', a.id, b.id]); }
            }
          }
        }
      }
    }
  }

  TT.sim = { DT, P, clamp, wrapAngle, mulberry32, buildTrack, query, newCar, setPose, stepCar, collideCars, respawn, inGap };
  if (typeof module === 'object' && module.exports) module.exports = TT.sim;
})(typeof window !== 'undefined' ? window : globalThis);
