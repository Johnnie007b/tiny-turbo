/* Tiny Turbo - input: keyboard, gamepad, multi-touch on-screen controls. */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});
  const keys = new Set();
  const out = { st: 0, g: 0, b: 0, d: 0, u: 0 };
  let useLatch = 0, usePrev = false;
  const touch = { pressed: new Set(), slide: null, slideSt: 0 };
  const cfg = { steerMode: 'buttons', autoGas: false, enabled: false, onPause: null, onAnyKey: null };
  let touchRoot = null, slideKnob = null;

  const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyF', 'KeyX', 'Enter']);
  g.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (cfg.enabled && GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (cfg.enabled && (e.code === 'Escape' || e.code === 'KeyP') && cfg.onPause) cfg.onPause();
    if (cfg.onAnyKey) cfg.onAnyKey(e);
  });
  g.addEventListener('keyup', (e) => { keys.delete(e.code); });
  g.addEventListener('blur', () => { keys.clear(); touch.pressed.clear(); });

  function setPressedClasses() {
    if (!touchRoot) return;
    touchRoot.querySelectorAll('[data-ctl]').forEach((el) => { el.classList.toggle('on', touch.pressed.has(el.dataset.ctl)); });
  }
  function evalTouches(e, ended) {
    const list = e.touches; const pressed = new Set(); let slideSt = 0, slideFound = false;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (touch.slide && t.identifier === touch.slide.id) { slideFound = true; slideSt = Math.max(-1, Math.min(1, (t.clientX - touch.slide.x0) / 48)); if (slideKnob) slideKnob.style.transform = `translate(${slideSt * 40}px,0)`; continue; }
      const el = document.elementFromPoint(t.clientX, t.clientY); const c = el && el.closest ? el.closest('[data-ctl]') : null;
      if (!c) continue;
      const ctl = c.dataset.ctl;
      if (ctl === 'slide') { if (!touch.slide && e.type === 'touchstart') { touch.slide = { id: t.identifier, x0: t.clientX }; slideFound = true; if (slideKnob) { slideKnob.style.left = (t.clientX - c.getBoundingClientRect().left) + 'px'; slideKnob.style.top = (t.clientY - c.getBoundingClientRect().top) + 'px'; slideKnob.style.opacity = 1; } } continue; }
      pressed.add(ctl);
    }
    if (touch.slide && !slideFound) { touch.slide = null; slideSt = 0; if (slideKnob) slideKnob.style.opacity = 0; }
    touch.pressed = pressed; touch.slideSt = touch.slide ? slideSt : 0;
    setPressedClasses();
  }
  function bindTouch(root, knob) {
    touchRoot = root; slideKnob = knob;
    const h = (e) => { if (!cfg.enabled) return; e.preventDefault(); evalTouches(e); };
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((ev) => root.addEventListener(ev, h, { passive: false }));
    // mouse fallback so the on-screen buttons also work with a mouse (and in desktop browsers)
    let md = null;
    root.addEventListener('mousedown', (e) => { const c = e.target.closest('[data-ctl]'); if (c && c.dataset.ctl !== 'slide') { md = c.dataset.ctl; touch.pressed.add(md); setPressedClasses(); } });
    g.addEventListener('mouseup', () => { if (md) { touch.pressed.delete(md); md = null; setPressedClasses(); } });
    // block page zoom / selection gestures
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
    document.addEventListener('dblclick', (e) => { if (cfg.enabled) e.preventDefault(); });
    document.addEventListener('contextmenu', (e) => { if (cfg.enabled || /touch|android|iphone|ipad/i.test(navigator.userAgent)) e.preventDefault(); });
  }
  let padPrevStart = false;
  function poll() {
    let st = 0, gas = 0, brk = 0, drift = 0, use = 0;
    // keyboard
    if (keys.has('ArrowLeft') || keys.has('KeyA')) st -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) st += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) gas = 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) brk = 1;
    if (keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight')) drift = 1;
    if (keys.has('KeyE') || keys.has('KeyF') || keys.has('KeyX') || keys.has('Enter')) use = 1;
    // gamepad
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p || !p.connected) continue;
        const ax = p.axes[0] || 0; if (Math.abs(ax) > 0.14) st += Math.sign(ax) * Math.min(1, (Math.abs(ax) - 0.14) / 0.8);
        const b = p.buttons;
        if (b[14] && b[14].pressed) st -= 1; if (b[15] && b[15].pressed) st += 1;
        if ((b[7] && b[7].value > 0.2) || (b[0] && b[0].pressed)) gas = 1;
        if ((b[6] && b[6].value > 0.2) || (b[1] && b[1].pressed)) brk = 1;
        if ((b[2] && b[2].pressed) || (b[5] && b[5].pressed)) drift = 1;
        if ((b[3] && b[3].pressed) || (b[4] && b[4].pressed)) use = 1;
        const start = !!(b[9] && b[9].pressed); if (start && !padPrevStart && cfg.enabled && cfg.onPause) cfg.onPause(); padPrevStart = start;
      }
    } catch (e) { /* ignore */ }
    // touch
    if (touch.pressed.has('left')) st -= 1;
    if (touch.pressed.has('right')) st += 1;
    if (touch.slide) st += touch.slideSt;
    if (touch.pressed.has('gas')) gas = 1;
    if (touch.pressed.has('brake')) brk = 1;
    if (touch.pressed.has('drift')) drift = 1;
    if (touch.pressed.has('item')) use = 1;
    if (cfg.autoGas && cfg.enabled) gas = 1;
    out.st = Math.max(-1, Math.min(1, st)); out.g = gas; out.b = brk; out.d = drift;
    if (use && !usePrev) useLatch = 4; usePrev = !!use; if (useLatch > 0) { useLatch--; use = 1; }
    out.u = use;
    return out;
  }
  function anyPadConnected() { try { return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).some((p) => p && p.connected); } catch (e) { return false; } }
  TT.input = { poll, cfg, bindTouch, touch, anyPadConnected, reset() { keys.clear(); touch.pressed.clear(); touch.slide = null; setPressedClasses(); } };
})(window);
