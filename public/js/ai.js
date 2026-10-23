/* Tiny Turbo - bot driver. Produces the same input struct a human would. */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});
  const S = typeof module === 'object' && module.exports ? require('./sim.js') : TT.sim;
  const { clamp, wrapAngle } = S;

  // bot difficulty: 0 easy, 1 medium (the original tuning), 2 hard
  const DIFF_SKILL = [0.8, 1.0, 1.06];
  const DIFF_NAMES = ['EASY', 'MEDIUM', 'HARD'];
  function makeBrain(seed, level, diff) {
    diff = diff == null ? 1 : clamp(diff | 0, 0, 2);
    const rnd = S.mulberry32(seed * 7919 + 13);
    return {
      diff,
      skill: clamp(0.84 + level * 0.16 + (rnd() - 0.5) * 0.06, 0.78, 1.0) * DIFF_SKILL[diff],
      lane: (rnd() - 0.5) * 50, laneT: 0, stuck: 0, rev: 0, rnd, tune: 0.9 + rnd() * 0.2
    };
  }

  // others: all cars (for light avoidance)
  function drive(T, c, brain, cars, inp, dt, opts) {
    const n = T.n, sp = T.sp;
    const speed = Math.hypot(c.vx, c.vy);
    const cs = Math.cos(c.a), sn = Math.sin(c.a);
    const vF = c.vx * cs + c.vy * sn;
    inp.g = 0; inp.b = 0; inp.d = 0; inp.st = 0;
    if (c.tF > 0) return inp;
    const idx = c.idx >= 0 ? c.idx : 0;
    // reverse out of trouble
    if (brain.rev > 0) {
      brain.rev -= dt;
      inp.b = 1; inp.st = -clamp(c.d / 40, -1, 1) * 0.0 + (brain.revDir || 1);
      return inp;
    }
    if (speed < 25 && opts.racing) { brain.stuck += dt; if (brain.stuck > 1.1) { brain.rev = 0.8; brain.stuck = 0; brain.revDir = c.d > 0 ? 1 : -1; } } else brain.stuck = Math.max(0, brain.stuck - dt * 2);

    // lane choice: look ahead for hazards / obstacles
    let laneWant = brain.lane;
    const look = 80 + speed * 0.55;
    let attractD = null;
    const sNow = c.s;
    const hwUse = T.hw - 24;
    for (let i = 0; i < T.hazards.length; i++) {
      const h = T.hazards[i];
      let ds = h.s - sNow; if (ds < -T.L / 2) ds += T.L; else if (ds > T.L / 2) ds -= T.L;
      if (ds < -10 || ds > look + 120) continue;
      if (h.k === 'ramp') { attractD = h.d; continue; }
      if (h.k === 'boost') { if (brain.rnd() < 2) attractD = h.d; continue; }
      // avoid oil/water if there's room
      const clearL = h.d - h.r - 20, clearR = h.d + h.r + 20;
      if (laneWant > clearL - 10 && laneWant < clearR + 10) {
        const goL = clearL > -hwUse, goR = clearR < hwUse;
        if (goL && (!goR || Math.abs(clearL - laneWant) < Math.abs(clearR - laneWant))) laneWant = clearL;
        else if (goR) laneWant = clearR;
      }
    }
    for (let i = 0; i < T.obstacles.length; i++) {
      const o = T.obstacles[i];
      let ds = o.s - sNow; if (ds < -T.L / 2) ds += T.L; else if (ds > T.L / 2) ds -= T.L;
      if (ds < -5 || ds > look + 40) continue;
      const clearL = o.d - o.r - 17, clearR = o.d + o.r + 17;
      if (laneWant > clearL && laneWant < clearR) {
        const goL = clearL > -hwUse, goR = clearR < hwUse;
        if (goL && (!goR || Math.abs(clearL - laneWant) < Math.abs(clearR - laneWant))) laneWant = clearL;
        else if (goR) laneWant = clearR;
      }
    }
    if (attractD !== null && Math.abs(attractD - laneWant) < 70) laneWant = attractD;
    // other cars ahead
    for (let k = 0; k < cars.length; k++) {
      const o = cars[k]; if (o === c || o.out || o.tF > 0) continue;
      const dx = o.x - c.x, dy = o.y - c.y; const ahead = dx * cs + dy * sn; const side = -dx * sn + dy * cs;
      if (ahead > 0 && ahead < 70 && Math.abs(side) < 22) { laneWant = clamp(c.d + (side > 0 ? -45 : 45), -hwUse, hwUse); break; }
    }
    laneWant = clamp(laneWant, -hwUse, hwUse);
    brain.laneT += (laneWant - brain.laneT) * Math.min(1, dt * 5);

    // target point
    const Ld = 38 + speed * 0.26;
    const ti = (idx + Math.round(Ld / sp)) % n;
    const tx = T.px[ti] + T.nx[ti] * brain.laneT, ty = T.py[ti] + T.ny[ti] * brain.laneT;
    // aim using velocity direction when moving fast (handles sliding)
    const desired = Math.atan2(ty - c.y, tx - c.x);
    const heading = speed > 80 ? c.a + wrapAngle(Math.atan2(c.vy, c.vx) - c.a) * 0.35 : c.a;
    let diff = wrapAngle(desired - heading);
    inp.st = clamp(diff * 2.2, -1, 1);
    // speed control
    const brakeDist = (speed * speed) / (2 * 760) + 60;
    const ahead = Math.round(brakeDist / sp);
    let vlim = 1e9;
    for (let k = 0; k <= ahead; k += 3) {
      const j = (idx + k) % n; const allowed = T.vmax[j] * brain.skill * brain.tune * Math.sqrt(T.grip) * (T.edge === 'fall' ? 0.86 : 1);
      const need = allowed + k * sp * 0.9; // we can brake over the distance
      if (need < vlim) vlim = need;
    }
    vlim = Math.min(vlim, S.P.MAXV * 1.35);
    if (Math.abs(c.d) > T.hw + 5) vlim = Math.min(vlim, 160);
    if (opts.rubber) vlim *= opts.rubber;
    if (c.tO > 0) vlim = Math.min(vlim, 150);
    if (vF < vlim) inp.g = 1;
    else if (vF > vlim + 40) inp.b = 1;
    // handbrake on very sharp turns while fast
    // (bots never use the handbrake)
    return inp;
  }
  TT.ai = { makeBrain, drive, DIFF_NAMES, DIFF_SKILL };
  if (typeof module === 'object' && module.exports) module.exports = TT.ai;
})(typeof window !== 'undefined' ? window : globalThis);
