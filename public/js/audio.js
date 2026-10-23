/* Tiny Turbo - WebAudio chiptune music + sound effects. All synthesized, nothing downloaded. */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});
  let ctx = null, master, sfxBus, musBus, noiseBuf, engOsc = null, engOsc2, engGain, engFilt;
  let unlocked = false;
  const st = { sfx: true, music: true, vol: 0.8 };
  try { const s = JSON.parse(localStorage.getItem('tt_audio') || '{}'); if (s.sfx === false) st.sfx = false; if (s.music === false) st.music = false; } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem('tt_audio', JSON.stringify({ sfx: st.sfx, music: st.music })); } catch (e) { /* ignore */ } };

  function init() {
    if (ctx) return;
    const AC = g.AudioContext || g.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = st.vol; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = st.sfx ? 1 : 0; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = st.music ? 0.32 : 0; musBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  // must be called from a user gesture (touchend / pointerup / keydown / click)
  function unlock() {
    init(); if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume();
    if (!unlocked) { // iOS: play a silent buffer inside the gesture
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); unlocked = true;
      if (wantMusic) startMusic(wantMusic);
    }
  }
  ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click'].forEach((ev) => g.addEventListener(ev, unlock, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });

  const ok = () => ctx && ctx.state === 'running' && st.sfx;
  function env(gain, t0, a, d, peak, end) { gain.gain.setValueAtTime(0.0001, t0); gain.gain.linearRampToValueAtTime(peak, t0 + a); gain.gain.exponentialRampToValueAtTime(end || 0.0001, t0 + a + d); }
  function blip(f0, f1, dur, type, vol, delay, bus) {
    const t = ctx.currentTime + (delay || 0); const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(gn, t, 0.005, dur, vol || 0.2); o.connect(gn); gn.connect(bus || sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, f0, f1, vol, type, delay, q) {
    const t = ctx.currentTime + (delay || 0); const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); if (q) f.Q.value = q;
    const gn = ctx.createGain(); env(gn, t, 0.005, dur, vol || 0.2); s.connect(f); f.connect(gn); gn.connect(sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  const SFX = {
    click: () => blip(660, 880, 0.07, 'square', 0.12),
    back: () => blip(520, 330, 0.09, 'square', 0.12),
    beep: () => blip(440, 440, 0.18, 'square', 0.22),
    go: () => { blip(880, 880, 0.14, 'square', 0.25); blip(1320, 1320, 0.4, 'square', 0.22, 0.12); },
    boost: (v) => { noise(0.5, 400, 3200, 0.22 * v, 'bandpass', 0, 2); blip(200, 900, 0.4, 'sawtooth', 0.12 * v); },
    pick: (v) => { blip(660, 990, 0.1, 'square', 0.12 * v); blip(990, 1320, 0.14, 'square', 0.12 * v, 0.09); },
    fire: (v) => { noise(0.35, 2400, 500, 0.2 * v, 'bandpass', 0, 2); blip(300, 900, 0.3, 'sawtooth', 0.1 * v); },
    hit: (v) => { noise(0.5, 1800, 120, 0.3 * v, 'lowpass'); blip(260, 50, 0.45, 'square', 0.25 * v); blip(120, 40, 0.5, 'sawtooth', 0.18 * v, 0.05); },
    drop: (v) => { blip(300, 140, 0.18, 'triangle', 0.16 * v); },
    pop: (v) => { noise(0.15, 1500, 400, 0.12 * v, 'bandpass'); },
    oil: (v) => { blip(520, 120, 0.5, 'triangle', 0.22 * v); blip(430, 100, 0.55, 'sine', 0.14 * v, 0.05); noise(0.35, 900, 200, 0.1 * v, 'lowpass'); },
    splash: (v) => { noise(0.4, 2600, 500, 0.24 * v, 'bandpass', 0, 1.2); },
    bump: (v) => { blip(160, 50, 0.16, 'sine', 0.38 * v); noise(0.07, 1200, 300, 0.12 * v); },
    wall: (v) => { noise(0.12, 1800, 300, 0.26 * v, 'lowpass'); blip(110, 60, 0.1, 'square', 0.12 * v); },
    car: (v) => { blip(300, 120, 0.09, 'square', 0.2 * v); noise(0.07, 3000, 800, 0.16 * v, 'highpass'); },
    ramp: (v) => { blip(220, 700, 0.35, 'square', 0.14 * v); blip(330, 1000, 0.35, 'triangle', 0.1 * v, 0.03); },
    land: (v) => { blip(120, 45, 0.18, 'sine', 0.4 * v); noise(0.12, 900, 200, 0.2 * v); },
    fall: (v) => { blip(900, 70, 0.9, 'triangle', 0.26 * v); blip(700, 55, 0.95, 'square', 0.07 * v, 0.04); },
    lap: () => { blip(660, 660, 0.09, 'square', 0.2); blip(990, 990, 0.18, 'square', 0.2, 0.09); },
    fin: () => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => blip(f, f, 0.13, 'square', 0.2, i * 0.09)); },
    win: () => { [523, 523, 523, 659, 784, 659, 784, 1046].forEach((f, i) => blip(f, f, i === 7 ? 0.5 : 0.11, 'square', 0.2, i * 0.11)); blip(262, 262, 0.9, 'triangle', 0.25, 0); },
    lose: () => { [392, 349, 330, 262].forEach((f, i) => blip(f, f * 0.98, 0.2, 'triangle', 0.25, i * 0.2)); },
    score: () => { blip(784, 784, 0.1, 'square', 0.2); blip(1046, 1046, 0.1, 'square', 0.2, 0.1); blip(1568, 1568, 0.25, 'square', 0.2, 0.2); },
    out: (v) => { blip(500, 60, 0.45, 'sawtooth', 0.2 * v); noise(0.3, 3000, 200, 0.15 * v); },
    join: () => { blip(600, 900, 0.1, 'square', 0.14); },
    warn: () => { blip(880, 880, 0.08, 'square', 0.14); blip(660, 660, 0.08, 'square', 0.14, 0.1); }
  };
  function sfx(name, v) { if (!ok()) return; const f = SFX[name]; if (f) try { f(v == null ? 1 : v); } catch (e) { /* ignore */ } }

  /* ---------------- engine (own car) */
  function engine(speedFrac, boosting, on) {
    if (!ctx || ctx.state !== 'running') return;
    if (!engOsc) {
      engOsc = ctx.createOscillator(); engOsc.type = 'sawtooth'; engOsc2 = ctx.createOscillator(); engOsc2.type = 'square';
      engFilt = ctx.createBiquadFilter(); engFilt.type = 'lowpass'; engFilt.frequency.value = 500; engGain = ctx.createGain(); engGain.gain.value = 0;
      engOsc.connect(engFilt); engOsc2.connect(engFilt); engFilt.connect(engGain); engGain.connect(sfxBus); engOsc.start(); engOsc2.start();
    }
    const t = ctx.currentTime; const f = 55 + speedFrac * 120 + (boosting ? 40 : 0);
    engOsc.frequency.setTargetAtTime(f, t, 0.05); engOsc2.frequency.setTargetAtTime(f * 1.5, t, 0.05); engFilt.frequency.setTargetAtTime(300 + speedFrac * 1200, t, 0.08);
    engGain.gain.setTargetAtTime(on && st.sfx ? 0.035 + speedFrac * 0.035 : 0, t, 0.08);
  }

  /* ---------------- music sequencer */
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function nf(n) { // 'A4' 'C#5' 'Bb3'
    const m = /^([A-G])([#b]?)(\d)$/.exec(n); if (!m) return 0;
    const semi = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
    return 440 * Math.pow(2, (semi - 69) / 12);
  }
  const TUNES = {
    race: {
      bpm: 156,
      lead: 'A4 - C5 - E5 - C5 - D5 - B4 - G4 - B4 - C5 - A4 - F4 - A4 - B4 - E5 - G#4 - B4 - ' +
        'A5 - - E5 - C5 E5 A5 - - G5 - E5 D5 - E5 G5 - - F5 - D5 C5 - D5 F5 - - E5 - G#4 B4',
      bass: 'A2 A2 E3 A2 A2 E3 A2 E3 G2 G2 D3 G2 G2 D3 G2 D3 F2 F2 C3 F2 F2 C3 F2 C3 E2 E2 B2 E2 E2 B2 E2 B2',
      arp: null
    },
    menu: {
      bpm: 112,
      lead: 'E5 - G5 - C6 - G5 - E5 - G5 - D5 - - - F5 - A5 - D6 - A5 - F5 - A5 - G5 - - - ' +
        'E5 - G5 - C6 - D6 - E6 - D6 - C6 - G5 - D5 - G5 - B5 - D6 - G5 - - - - - - -',
      bass: 'C3 - G3 - C3 - G3 - D3 - A3 - D3 - A3 - C3 - G3 - C3 - G3 - G2 - D3 - G2 - D3 -'
    }
  };
  function parse(str) { return str.trim().split(/\s+/); }
  const seq = { tune: null, name: null, step: 0, next: 0, timer: null };
  let wantMusic = null;
  function pulse(freq, t, dur, vol, type, bus) {
    const o = ctx.createOscillator(), gn = ctx.createGain(); o.type = type; o.frequency.value = freq;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol, t + 0.008); gn.gain.setTargetAtTime(0.0001, t + dur * 0.8, dur * 0.12);
    o.connect(gn); gn.connect(bus); o.start(t); o.stop(t + dur + 0.1);
  }
  function drum(t, kind, bus) {
    if (kind === 'k') { const o = ctx.createOscillator(), gn = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); gn.gain.setValueAtTime(0.55, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(gn); gn.connect(bus); o.start(t); o.stop(t + 0.2); }
    else { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = kind === 's' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 's' ? 1800 : 7000; const gn = ctx.createGain(); gn.gain.setValueAtTime(kind === 's' ? 0.35 : 0.12, t); gn.gain.exponentialRampToValueAtTime(0.001, t + (kind === 's' ? 0.13 : 0.04)); s.connect(f); f.connect(gn); gn.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + 0.2); }
  }
  function tick() {
    if (!ctx || !seq.tune) return;
    const T = seq.tune; const sd = 60 / T.bpm / 2; // 8th-note step
    while (seq.next < ctx.currentTime + 0.25) {
      const i = seq.step; const t = seq.next;
      const L = T.leadA[i % T.leadA.length], B = T.bassA[i % T.bassA.length];
      if (L && L !== '-') pulse(nf(L), t, sd * 1.8, 0.13, 'square', musBus);
      if (B && B !== '-') pulse(nf(B), t, sd * 1.9, 0.26, 'triangle', musBus);
      if (seq.name === 'race') { if (i % 4 === 0) drum(t, 'k', musBus); if (i % 4 === 2) drum(t, 's', musBus); drum(t, 'h', musBus); if (i % 2 === 1) drum(t + sd / 2, 'h', musBus); }
      else if (i % 4 === 0) { drum(t, 'k', musBus); } else if (i % 4 === 2) drum(t, 'h', musBus);
      seq.step++; seq.next += sd;
    }
  }
  function startMusic(name) {
    wantMusic = name;
    if (!ctx || ctx.state !== 'running') return;
    if (seq.name === name) return;
    stopMusic(true);
    const T = TUNES[name]; if (!T) return;
    seq.tune = { bpm: T.bpm, leadA: parse(T.lead), bassA: parse(T.bass) }; seq.name = name; seq.step = 0; seq.next = ctx.currentTime + 0.1;
    seq.timer = setInterval(tick, 40);
  }
  function stopMusic(keepWant) { if (!keepWant) wantMusic = null; if (seq.timer) clearInterval(seq.timer); seq.timer = null; seq.tune = null; seq.name = null; }
  function music(name) { if (!name) { stopMusic(); return; } startMusic(name); }
  function setSfx(v) { st.sfx = !!v; if (sfxBus) sfxBus.gain.value = st.sfx ? 1 : 0; if (!st.sfx && engGain) engGain.gain.value = 0; save(); }
  function setMusic(v) { st.music = !!v; if (musBus) musBus.gain.value = st.music ? 0.32 : 0; save(); }
  function ctxState() { return ctx ? ctx.state : 'none'; }

  TT.audio = { unlock, sfx, engine, music, setSfx, setMusic, state: st, ctxState };
})(window);
