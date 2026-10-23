/* Tiny Turbo - WebAudio chiptune music + sound effects. Everything is synthesized at runtime (original tunes, nothing downloaded). */
(function (g) {
  'use strict';
  const TT = g.TT || (g.TT = {});
  let ctx = null, master, sfxBus, musBus, musDelayIn, noiseBuf;
  let unlocked = false;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const st = { sfx: true, music: true, sfxVol: 0.8, musicVol: 0.7 };
  try {
    const s = JSON.parse(localStorage.getItem('tt_audio') || '{}');
    if (typeof s.sv === 'number') st.sfxVol = clamp(s.sv, 0, 1); if (typeof s.mv === 'number') st.musicVol = clamp(s.mv, 0, 1);
    if (s.sfx === false) st.sfxVol = 0; if (s.music === false) st.musicVol = 0;
    st.sfx = st.sfxVol > 0; st.music = st.musicVol > 0;
  } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem('tt_audio', JSON.stringify({ sfx: st.sfx, music: st.music, sv: st.sfxVol, mv: st.musicVol })); } catch (e) { /* ignore */ } };
  const MUS_GAIN = 0.34;

  function makeNoise(c) {
    const b = c.createBuffer(1, Math.floor(c.sampleRate * 1), c.sampleRate);
    const d = b.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 2147483648) - 1; }
    return b;
  }
  function init() {
    if (ctx) return;
    const AC = g.AudioContext || g.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = st.sfxVol; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = st.musicVol * MUS_GAIN; musBus.connect(master);
    // a touch of echo on the music (cheap "bigger" sound)
    musDelayIn = ctx.createGain(); musDelayIn.gain.value = 0.22; const dl = ctx.createDelay(1); dl.delayTime.value = 0.19; const fb = ctx.createGain(); fb.gain.value = 0.28; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    musDelayIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(musBus);
    noiseBuf = makeNoise(ctx); sx = new Syn(ctx, sfxBus, noiseBuf);
  }
  function unlock() {
    init(); if (!ctx) return;
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) { /* ignore */ } }
    if (!unlocked) { // iOS: play a silent buffer inside the gesture
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); unlocked = true;
    }
    if (wantMusic && !seq.name) startMusic(wantMusic);
  }
  if (typeof document !== 'undefined') {
    ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click'].forEach((ev) => g.addEventListener(ev, unlock, { passive: true }));
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
  }

  /* ------------------------------------------------------------ synth helpers (work on a live or an offline context) */
  const waves = new WeakMap();
  function pulseWave(c, duty) { // band-limited pulse via Fourier series
    let m = waves.get(c); if (!m) { m = {}; waves.set(c, m); } if (m[duty]) return m[duty];
    const N = 40, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) { im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty); }
    return (m[duty] = c.createPeriodicWave(re, im));
  }
  function envGain(c, gain, t, a, dur, peak) { gain.gain.setValueAtTime(0.0001, t); gain.gain.linearRampToValueAtTime(peak, t + a); gain.gain.exponentialRampToValueAtTime(0.0001, t + a + dur); }
  function Syn(c, bus, nb) { this.c = c; this.bus = bus; this.nb = nb; }
  Syn.prototype.blip = function (f0, f1, dur, type, vol, delay, bus) {
    const c = this.c, t = c.currentTime + (delay || 0); const o = c.createOscillator(), gn = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    envGain(c, gn, t, 0.004, dur, vol || 0.2); o.connect(gn); gn.connect(bus || this.bus); o.start(t); o.stop(t + dur + 0.05);
  };
  Syn.prototype.noise = function (dur, f0, f1, vol, type, delay, q, bus) {
    const c = this.c, t = c.currentTime + (delay || 0); const s = c.createBufferSource(); s.buffer = this.nb; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); if (q) f.Q.value = q;
    const gn = c.createGain(); envGain(c, gn, t, 0.004, dur, vol || 0.2); s.connect(f); f.connect(gn); gn.connect(bus || this.bus); s.start(t, (delay || 0) * 0.37 % 0.5); s.stop(t + dur + 0.05);
  };
  Syn.prototype.vib = function (f, depth, rate, dur, type, vol, delay) { // wobbling tone (oil / siren style)
    const c = this.c, t = c.currentTime + (delay || 0); const o = c.createOscillator(), l = c.createOscillator(), lg = c.createGain(), gn = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f * 0.4), t + dur); l.frequency.value = rate; lg.gain.value = depth; l.connect(lg); lg.connect(o.frequency);
    envGain(c, gn, t, 0.006, dur, vol || 0.15); o.connect(gn); gn.connect(this.bus); o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
  };
  let sx = null; // live synth
  const blip = (...a) => sx.blip(...a), noise = (...a) => sx.noise(...a), vib = (...a) => sx.vib(...a);

  /* ------------------------------------------------------------ sound effects (v = distance volume, m = impact 0..1) */
  const SFX = {
    click: () => blip(660, 880, 0.07, 'square', 0.12),
    back: () => blip(520, 330, 0.09, 'square', 0.12),
    beep: () => blip(440, 440, 0.18, 'square', 0.22),
    go: () => { blip(880, 880, 0.14, 'square', 0.25); blip(1320, 1320, 0.45, 'square', 0.22, 0.12); blip(660, 660, 0.45, 'triangle', 0.18, 0.12); },
    boost: (v) => { noise(0.6, 300, 4200, 0.24 * v, 'bandpass', 0, 2); blip(160, 1100, 0.5, 'sawtooth', 0.12 * v); blip(80, 400, 0.4, 'triangle', 0.2 * v); },
    dtier: (v, m) => { const f = [880, 1175, 1568][clamp(m | 0, 1, 3) - 1]; blip(f, f * 1.5, 0.09, 'square', 0.09 * v); blip(f * 2, f * 2, 0.08, 'triangle', 0.06 * v, 0.04); },
    dboost: (v, m) => { const k = clamp(m | 0, 1, 3); noise(0.3 + k * 0.1, 500, 5200, (0.16 + k * 0.04) * v, 'bandpass', 0, 3); blip(220 * k, 1500, 0.28 + k * 0.05, 'sawtooth', 0.11 * v); blip(110, 330 + k * 120, 0.2, 'square', 0.1 * v); },
    pick: (v) => { [784, 988, 1319].forEach((f, i) => { blip(f, f, 0.1, 'square', 0.1 * v, i * 0.055); blip(f * 2, f * 2, 0.09, 'triangle', 0.05 * v, i * 0.055 + 0.01); }); },
    fire: (v) => { noise(0.45, 3000, 400, 0.22 * v, 'bandpass', 0, 2); blip(260, 1000, 0.35, 'sawtooth', 0.1 * v); blip(90, 60, 0.15, 'square', 0.12 * v); },
    hit: (v) => { noise(0.8, 2400, 90, 0.34 * v, 'lowpass'); blip(180, 28, 0.6, 'sine', 0.5 * v); blip(260, 40, 0.5, 'square', 0.16 * v, 0.02); for (let i = 0; i < 4; i++) noise(0.05, 4000, 1500, 0.1 * v, 'highpass', 0.12 + i * 0.07); },
    drop: (v) => { noise(0.18, 900, 200, 0.14 * v, 'lowpass'); blip(320, 130, 0.2, 'triangle', 0.2 * v); blip(200, 90, 0.16, 'sine', 0.2 * v, 0.06); },
    pop: (v) => { noise(0.15, 2200, 500, 0.14 * v, 'bandpass'); blip(900, 300, 0.08, 'square', 0.06 * v); },
    oil: (v) => { vib(620, 70, 22, 0.55, 'square', 0.12 * v); blip(430, 90, 0.5, 'sine', 0.16 * v, 0.05); noise(0.35, 900, 200, 0.12 * v, 'lowpass'); },
    splash: (v) => { noise(0.45, 3200, 600, 0.26 * v, 'bandpass', 0, 1.1); noise(0.2, 6000, 2000, 0.1 * v, 'highpass', 0.05); blip(500, 200, 0.12, 'sine', 0.1 * v); },
    bump: (v, m) => { m = m == null ? 0.5 : m; blip(190, 48, 0.15 + m * 0.1, 'sine', 0.3 * v + 0.2 * v * m); noise(0.08 + m * 0.05, 1500, 250, 0.1 * v + 0.12 * v * m); blip(900 + m * 400, 500, 0.05, 'square', 0.06 * v, 0.01); },
    wall: (v, m) => { m = m == null ? 0.5 : m; noise(0.12 + m * 0.1, 2000, 260, 0.2 * v + 0.16 * v * m, 'lowpass'); blip(120, 55, 0.1 + m * 0.08, 'square', 0.1 * v + 0.08 * v * m); if (m > 0.5) { blip(1400, 900, 0.07, 'square', 0.05 * v, 0.02); noise(0.1, 5000, 2500, 0.07 * v, 'highpass', 0.04); } },
    car: (v, m) => { m = m == null ? 0.5 : m; blip(320, 110, 0.09 + m * 0.05, 'square', 0.16 * v + 0.1 * v * m); noise(0.08, 3200, 700, 0.14 * v, 'highpass'); blip(1250, 800, 0.06, 'triangle', 0.07 * v, 0.015); blip(1700, 1100, 0.05, 'triangle', 0.05 * v, 0.035); if (m > 0.6) blip(140, 40, 0.18, 'sine', 0.3 * v); },
    ramp: (v) => { blip(220, 760, 0.38, 'square', 0.13 * v); blip(330, 1100, 0.38, 'triangle', 0.1 * v, 0.03); noise(0.3, 600, 3000, 0.07 * v, 'bandpass'); },
    land: (v) => { blip(130, 42, 0.2, 'sine', 0.42 * v); noise(0.14, 1000, 200, 0.2 * v); blip(300, 160, 0.06, 'square', 0.08 * v, 0.01); },
    fall: (v) => { blip(900, 60, 1.0, 'triangle', 0.26 * v); blip(700, 50, 1.0, 'square', 0.07 * v, 0.04); },
    lap: () => { blip(660, 660, 0.09, 'square', 0.2); blip(990, 990, 0.2, 'square', 0.2, 0.09); blip(1320, 1320, 0.2, 'triangle', 0.1, 0.09); },
    finallap: () => { [660, 880, 660, 880, 1320].forEach((f, i) => blip(f, f, 0.1, 'square', 0.18, i * 0.08)); },
    fin: () => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => { blip(f, f, 0.13, 'square', 0.2, i * 0.09); blip(f / 2, f / 2, 0.13, 'triangle', 0.16, i * 0.09); }); },
    win: () => { [523, 523, 523, 659, 784, 659, 784, 1046].forEach((f, i) => { blip(f, f, i === 7 ? 0.6 : 0.11, 'square', 0.2, i * 0.11); blip(f / 2, f / 2, i === 7 ? 0.6 : 0.11, 'triangle', 0.16, i * 0.11); }); blip(262, 262, 1.1, 'triangle', 0.25, 0); },
    lose: () => { [392, 349, 330, 262].forEach((f, i) => { blip(f, f * 0.98, 0.22, 'triangle', 0.25, i * 0.2); blip(f * 2, f * 1.96, 0.18, 'square', 0.05, i * 0.2); }); },
    score: () => { blip(784, 784, 0.1, 'square', 0.2); blip(1046, 1046, 0.1, 'square', 0.2, 0.1); blip(1568, 1568, 0.28, 'square', 0.2, 0.2); },
    out: (v) => { blip(500, 55, 0.5, 'sawtooth', 0.2 * v); noise(0.4, 3000, 160, 0.17 * v, 'lowpass'); blip(150, 35, 0.4, 'sine', 0.3 * v, 0.05); },
    join: () => { blip(600, 900, 0.1, 'square', 0.14); },
    warn: () => { blip(880, 880, 0.08, 'square', 0.14); blip(660, 660, 0.08, 'square', 0.14, 0.1); }
  };
  const ok = () => ctx && ctx.state === 'running' && st.sfx;
  const lastPlay = {};
  function sfx(name, v, m) {
    if (!ok()) return; const f = SFX[name]; if (!f) return;
    const now = ctx.currentTime; if (lastPlay[name] && now - lastPlay[name] < 0.035) return; lastPlay[name] = now; // de-dupe pile-ups
    try { f(v == null ? 1 : v, m); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ continuous voices: engine (gears), tire screech, wind/boost */
  let eng = null, skidV = null, windV = null, gearPrev = 0;
  function voices() {
    if (eng) return;
    const mkLoop = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; };
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o3.type = 'triangle';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 2.2; const gn = ctx.createGain(); gn.gain.value = 0;
    const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain(); g1.gain.value = 0.55; g2.gain.value = 0.25; g3.gain.value = 0.5;
    const trem = ctx.createOscillator(), tg = ctx.createGain(); trem.frequency.value = 28; tg.gain.value = 0.2; trem.connect(tg); tg.connect(gn.gain); // rough idle flutter
    o1.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(f); g2.connect(f); g3.connect(f); f.connect(gn); gn.connect(sfxBus); o1.start(); o2.start(); o3.start(); trem.start();
    eng = { o1, o2, o3, f, gn, tg };
    const ns = mkLoop(), nf2 = ctx.createBiquadFilter(); nf2.type = 'bandpass'; nf2.frequency.value = 2100; nf2.Q.value = 5; const ng = ctx.createGain(); ng.gain.value = 0; ns.connect(nf2); nf2.connect(ng); ng.connect(sfxBus); ns.start(0, 0.2);
    skidV = { f: nf2, g: ng };
    const ws = mkLoop(), wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 900; wf.Q.value = 0.7; const wg = ctx.createGain(); wg.gain.value = 0; ws.connect(wf); wf.connect(wg); wg.connect(sfxBus); ws.start(0, 0.6);
    windV = { f: wf, g: wg };
  }
  // speedFrac 0..1.2, boosting, on, throttle 0/1, slip 0..1 (sideways sliding)
  function engine(speedFrac, boosting, on, throttle, slip) {
    if (!ctx || ctx.state !== 'running') return; voices();
    const t = ctx.currentTime; const live = on && st.sfx;
    // 4 "gears": rpm climbs inside each gear then drops on the shift, which gives the engine a speed-driven character
    const x = clamp(speedFrac, 0, 1.25) * 4.2; const gear = Math.min(3, Math.floor(x)); const inG = x - gear; const rpm = clamp(inG * 0.8 + 0.2 + (throttle ? 0.12 : 0), 0, 1.05);
    const f = 48 + rpm * 70 + gear * 11 + (boosting ? 22 : 0);
    if (gear !== gearPrev) { if (live && gear > gearPrev && speedFrac > 0.15) { eng.o1.frequency.setValueAtTime(f * 0.78, t); } gearPrev = gear; }
    eng.o1.frequency.setTargetAtTime(f, t, 0.04); eng.o2.frequency.setTargetAtTime(f * 1.5, t, 0.04); eng.o3.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    eng.f.frequency.setTargetAtTime(260 + rpm * 700 + speedFrac * 700 + (throttle ? 350 : 0) + (boosting ? 500 : 0), t, 0.06);
    eng.gn.gain.setTargetAtTime(live ? 0.026 + (throttle ? 0.026 : 0.008) + speedFrac * 0.03 + (boosting ? 0.02 : 0) : 0, t, 0.07);
    eng.tg.gain.setTargetAtTime(live ? 0.012 * (1.2 - speedFrac) : 0, t, 0.1);
    skidV.g.gain.setTargetAtTime(live ? clamp(slip || 0, 0, 1) * 0.085 : 0, t, 0.05); skidV.f.frequency.setTargetAtTime(1500 + (slip || 0) * 900 + speedFrac * 500, t, 0.08);
    windV.g.gain.setTargetAtTime(live ? clamp(speedFrac - 0.5, 0, 1) * 0.05 + (boosting ? 0.06 : 0) : 0, t, 0.1); windV.f.frequency.setTargetAtTime(600 + speedFrac * 1400, t, 0.1);
  }

  /* ------------------------------------------------------------ music: original tunes, 16th-note grid, 8-bar loops */
  // lead tokens 'Note:len' (len in 16ths, 'r' = rest); every bar must add up to 16.
  const NN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(n) { const m = /^([A-G])([#b]?)(\d)$/.exec(n); if (!m) return -1; return NN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12; }
  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function chordNotes(name) { // 'Am' 'F' 'B7' 'Bb' -> {root(midi, octave 2), notes[]}
    const m = /^([A-G])([#b]?)(m?)(7?)$/.exec(name); const r = NN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 36; const minor = !!m[3];
    const n = [r, r + (minor ? 3 : 4), r + 7]; if (m[4]) n.push(r + 10); return { root: r, notes: n };
  }
  const TUNES = {
    breakfast: {
      title: 'Pancake Panic', bpm: 148, swing: 0.14, duty: 0.25, bass: 'bounce', drums: { k: 'x...x..xx...x...', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.xx' }, arp: 1,
      chords: 'C Am F G C Em F G',
      lead: ['E5:2 G5:2 C6:4 G5:2 E5:2 G5:4', 'A5:2 G5:2 E5:4 C5:2 E5:2 A5:4', 'A5:2 G5:2 F5:4 C5:2 F5:2 A5:4', 'G5:2 F5:2 D5:4 B4:2 D5:2 G5:2 r:2',
        'E5:2 G5:2 C6:4 E6:2 D6:2 C6:4', 'B5:2 G5:2 E5:4 G5:2 B5:2 E6:4', 'C6:2 A5:2 F5:4 A5:2 C6:2 F6:4', 'D6:2 B5:2 G5:2 B5:2 D6:4 G5:2 r:2']
    },
    workbench: {
      title: 'Rivet Rally', bpm: 160, swing: 0, duty: 0.5, bass: 'drive', drums: { k: 'x..xx..xx..xx.x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx' }, arp: 1,
      chords: 'Am Am F G Am Am Dm E',
      lead: ['A5:3 A5:1 C6:2 A5:2 E5:2 A5:2 C6:2 E6:2', 'D6:3 C6:1 B5:2 A5:2 E5:8', 'F5:3 F5:1 A5:2 C6:2 A5:2 F5:2 C5:4', 'B5:3 A5:1 G5:2 D5:2 G5:4 B5:2 D6:2',
        'A5:3 A5:1 C6:2 A5:2 E6:4 D6:2 C6:2', 'D6:3 E6:1 F6:2 E6:2 C6:4 A5:4', 'D6:2 C6:2 A5:2 F5:2 A5:2 D6:2 F6:4', 'E6:2 D6:2 B5:2 G#5:2 B5:4 E5:2 r:2']
    },
    sandbox: {
      title: 'Castle Beach', bpm: 132, swing: 0.22, duty: 0.125, bass: 'bounce', drums: { k: 'x.....x.x.x...x.', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' }, arp: 0,
      chords: 'D A Bm G D A G A',
      lead: ['F#5:2 A5:2 D6:2 A5:2 F#5:4 r:2 A5:2', 'E5:2 A5:2 C#6:2 A5:2 E5:4 r:4', 'D5:2 F#5:2 B5:2 F#5:2 D5:2 F#5:2 B5:4', 'B5:2 G5:2 D5:2 G5:2 B5:4 A5:2 G5:2',
        'F#5:2 A5:2 D6:2 E6:2 F#6:4 E6:2 D6:2', 'E6:2 C#6:2 A5:2 C#6:2 E6:4 r:4', 'D6:2 B5:2 G5:2 B5:2 D6:2 B5:2 G5:4', 'C#6:2 E6:2 A5:4 A5:2 B5:2 C#6:2 E6:2']
    },
    bathtub: {
      title: 'Bubble Bounce', bpm: 126, swing: 0.1, duty: 0.25, bass: 'sway', drums: { k: 'x.......x..x....', s: '....x.......x...', h: '..x...x...x...x.' }, arp: 2,
      chords: 'Em C G D Em C Am B7',
      lead: ['B5:2 E6:2 G6:4 F#6:2 E6:2 B5:4', 'C6:2 E6:2 G6:4 E6:2 C6:2 G5:4', 'D6:2 G6:2 B6:4 A6:2 G6:2 D6:4', 'A5:2 D6:2 F#6:4 E6:2 D6:2 A5:4',
        'B5:2 E6:2 G6:2 B6:2 A6:4 G6:4', 'G6:2 E6:2 C6:2 E6:2 G6:4 E6:4', 'A5:2 C6:2 E6:4 D6:2 C6:2 A5:4', 'D#6:2 F#6:2 B6:4 A6:2 F#6:2 D#6:2 r:2']
    },
    menu: {
      title: 'Toy Box', bpm: 112, swing: 0.08, duty: 0.25, bass: 'sway', drums: { k: 'x.......x.......', s: '........x.......', h: 'x...x...x...x...' }, arp: 2,
      chords: 'C G Am F C G Am F',
      lead: ['E5:4 G5:4 C6:6 r:2', 'D6:4 B5:4 G5:6 r:2', 'C6:4 E6:4 A5:6 r:2', 'A5:4 F5:4 C6:6 r:2',
        'E5:2 G5:2 C6:2 E6:2 D6:4 C6:4', 'B5:2 D6:2 G6:2 D6:2 B5:4 G5:4', 'C6:2 E6:2 A6:2 E6:2 C6:4 A5:4', 'A5:2 C6:2 F6:2 C6:2 G6:4 r:4']
    },
    results: {
      title: 'Podium', bpm: 120, swing: 0.1, duty: 0.25, bass: 'sway', drums: { k: 'x.......x.......', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' }, arp: 2,
      chords: 'F C Dm C F C Dm C',
      lead: ['A5:2 C6:2 F6:4 E6:2 C6:2 A5:4', 'G5:2 C6:2 E6:4 D6:2 C6:2 G5:4', 'A5:2 D6:2 F6:4 E6:2 D6:2 A5:4', 'G5:2 C6:2 E6:2 G6:2 G6:8',
        'C6:2 F6:2 A6:4 G6:2 F6:2 C6:4', 'C6:2 E6:2 G6:4 F6:2 E6:2 C6:4', 'D6:2 F6:2 A6:4 G6:2 F6:2 D6:4', 'E6:2 G6:2 C7:6 r:6']
    }
  };
  // names used by the game: track theme -> tune
  const compiled = {};
  function compile(name) {
    if (compiled[name]) return compiled[name]; const T = TUNES[name]; if (!T) return null;
    const bars = T.lead.length, steps = bars * 16, lead = new Array(steps).fill(null);
    T.lead.forEach((bar, bi) => { let p = bi * 16; for (const tok of bar.trim().split(/\s+/)) { const [n, l] = tok.split(':'); const len = parseInt(l, 10); if (n !== 'r') lead[p] = { m: midi(n), len }; p += len; } });
    const chords = T.chords.split(' ').map(chordNotes);
    const dr = {}; for (const k of 'ksh') dr[k] = T.drums[k].split('').map((c) => c === 'x');
    return (compiled[name] = { T, bars, steps, lead, chords, dr });
  }
  function validate() { // used by the tests: every bar sums to 16 sixteenths
    const out = [];
    for (const name of Object.keys(TUNES)) { TUNES[name].lead.forEach((bar, i) => { let s = 0; for (const tok of bar.trim().split(/\s+/)) s += parseInt(tok.split(':')[1], 10); if (s !== 16) out.push(name + ' bar ' + (i + 1) + ' = ' + s); }); if (TUNES[name].chords.split(' ').length !== TUNES[name].lead.length) out.push(name + ' chord count'); }
    return out;
  }

  function pulseNote(S, freq, t, dur, vol, duty, bus, echo) {
    const c = S.c; const o = c.createOscillator(), gn = c.createGain(); o.setPeriodicWave(pulseWave(c, duty)); o.frequency.value = freq;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol, t + 0.006); gn.gain.setTargetAtTime(vol * 0.55, t + 0.02, 0.09); gn.gain.setTargetAtTime(0.0001, t + dur * 0.82, 0.03);
    o.connect(gn); gn.connect(bus); if (echo && S.echo) gn.connect(S.echo); o.start(t); o.stop(t + dur + 0.15);
  }
  function triNote(S, freq, t, dur, vol, bus) {
    const c = S.c; const o = c.createOscillator(), gn = c.createGain(); o.type = 'triangle'; o.frequency.value = freq;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol, t + 0.006); gn.gain.setTargetAtTime(0.0001, t + dur * 0.78, 0.03);
    o.connect(gn); gn.connect(bus); o.start(t); o.stop(t + dur + 0.12);
  }
  function drumHit(S, t, kind, bus) {
    const c = S.c;
    if (kind === 'k') { const o = c.createOscillator(), gn = c.createGain(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.11); gn.gain.setValueAtTime(0.6, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(gn); gn.connect(bus); o.start(t); o.stop(t + 0.2); return; }
    const s = c.createBufferSource(); s.buffer = S.nb; const f = c.createBiquadFilter(); f.type = kind === 's' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 's' ? 1900 : 7500;
    const gn = c.createGain(); gn.gain.setValueAtTime(kind === 's' ? 0.34 : 0.1, t); gn.gain.exponentialRampToValueAtTime(0.001, t + (kind === 's' ? 0.13 : 0.035)); s.connect(f); f.connect(gn); gn.connect(bus); s.start(t, (t * 7.3) % 0.5); s.stop(t + 0.2);
  }
  // schedule one 16th step of a tune at time t (seconds on that context)
  function playStep(S, C, i, t, sd) {
    const T = C.T; const bar = Math.floor(i / 16) % C.bars; const s16 = i % 16; const ch = C.chords[bar]; const bus = S.bus;
    const L = C.lead[i % C.steps];
    if (L) pulseNote(S, mf(L.m), t, L.len * sd * 0.95, 0.12, T.duty, bus, true);
    // bass
    const r = ch.root, f = (m) => mf(m);
    const bp = T.bass;
    if (bp === 'drive') { if (s16 % 2 === 0) triNote(S, f(r + (s16 % 8 === 6 ? 12 : 0)), t, sd * 1.8, 0.3, bus); }
    else if (bp === 'bounce') { if (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 14) triNote(S, f(r + (s16 === 6 || s16 === 14 ? 7 : 0)), t, sd * (s16 === 0 || s16 === 8 ? 3 : 1.6), 0.3, bus); if (s16 === 4 || s16 === 12) triNote(S, f(r + 12), t, sd * 1.5, 0.2, bus); }
    else { if (s16 === 0 || s16 === 8) triNote(S, f(r), t, sd * 6, 0.3, bus); if (s16 === 6 || s16 === 14) triNote(S, f(r + 7), t, sd * 1.8, 0.2, bus); }
    // arpeggio / harmony
    if (T.arp === 1 && s16 % 2 === 1) pulseNote(S, mf(ch.notes[((s16 - 1) / 2) % ch.notes.length] + 24), t, sd * 1.4, 0.04, 0.125, bus);
    else if (T.arp === 2 && s16 % 2 === 0) pulseNote(S, mf(ch.notes[(s16 / 2) % ch.notes.length] + 24 + (s16 % 8 >= 4 ? 0 : 0)), t, sd * 1.6, 0.04, 0.125, bus);
    // drums
    if (C.dr.k[s16]) drumHit(S, t, 'k', bus); if (C.dr.s[s16]) drumHit(S, t, 's', bus); if (C.dr.h[s16]) drumHit(S, t, 'h', bus);
    if (bar % 4 === 3 && s16 >= 12 && s16 % 2 === 0) drumHit(S, t, 's', bus); // little fill into the next phrase
  }
  const seq = { name: null, step: 0, next: 0, timer: null, tempo: 1, C: null };
  let wantMusic = null, S_live = null;
  function stepDur(C) { return 60 / (C.T.bpm * seq.tempo) / 4; }
  function tick() {
    if (!ctx || !seq.C) return; const C = seq.C;
    while (seq.next < ctx.currentTime + 0.3) {
      const sd = stepDur(C); const sw = (seq.step % 2 === 1) ? C.T.swing * sd : 0;
      playStep(S_live, C, seq.step, seq.next + sw, sd); seq.step++; seq.next += sd;
    }
  }
  function startMusic(name) {
    wantMusic = name;
    if (!ctx || ctx.state !== 'running') return;
    if (seq.name === name) return;
    stopMusic(true); const C = compile(name); if (!C) return;
    S_live = new Syn(ctx, musBus, noiseBuf); S_live.echo = musDelayIn;
    seq.C = C; seq.name = name; seq.step = 0; seq.next = ctx.currentTime + 0.1; seq.tempo = 1; seq.timer = setInterval(tick, 40);
  }
  function stopMusic(keepWant) { if (!keepWant) wantMusic = null; if (seq.timer) clearInterval(seq.timer); seq.timer = null; seq.C = null; seq.name = null; }
  function music(name) { if (!name) { stopMusic(); return; } startMusic(name); }
  function setTempo(m) { seq.tempo = clamp(m || 1, 0.8, 1.4); }
  function now() { return seq.name || wantMusic; }
  function tuneFor(theme) { return TUNES[theme] ? theme : 'breakfast'; }
  function setSfxVol(v) { st.sfxVol = clamp(v, 0, 1); st.sfx = st.sfxVol > 0; if (sfxBus) sfxBus.gain.value = st.sfxVol; save(); }
  function setMusicVol(v) { st.musicVol = clamp(v, 0, 1); st.music = st.musicVol > 0; if (musBus) musBus.gain.value = st.musicVol * MUS_GAIN; save(); }
  function setSfx(v) { setSfxVol(v ? (st.sfxVol > 0 ? st.sfxVol : 0.8) : 0); if (!v && eng) eng.gn.gain.value = 0; }
  function setMusic(v) { setMusicVol(v ? (st.musicVol > 0 ? st.musicVol : 0.7) : 0); }
  function ctxState() { return ctx ? ctx.state : 'none'; }

  // test hook: render a tune offline for `secs` seconds and report loudness (proves the synth graph works and isn't silent/clipping)
  function renderTune(name, secs) {
    const OC = g.OfflineAudioContext || g.webkitOfflineAudioContext; const C = compile(name); if (!OC || !C) return Promise.resolve(null);
    const sr = 22050; const oc = new OC(1, Math.floor(sr * secs), sr); const nb = makeNoise(oc); const bus = oc.createGain(); bus.gain.value = MUS_GAIN * 0.7; bus.connect(oc.destination);
    const S = new Syn(oc, bus, nb); let t = 0, i = 0; const sd = 60 / C.T.bpm / 4;
    while (t < secs) { playStep(S, C, i, t + (i % 2 ? C.T.swing * sd : 0), sd); i++; t += sd; }
    return oc.startRendering().then((buf) => { const d = buf.getChannelData(0); let sum = 0, pk = 0, nz = 0; for (let k = 0; k < d.length; k++) { const a = Math.abs(d[k]); sum += d[k] * d[k]; if (a > pk) pk = a; if (a > 0.002) nz++; } return { rms: Math.sqrt(sum / d.length), peak: pk, active: nz / d.length }; });
  }

  TT.audio = { unlock, sfx, engine, music, setSfx, setMusic, setSfxVol, setMusicVol, setTempo, now, tuneFor, state: st, ctxState, tunes: TUNES, validate, renderTune, sfxNames: Object.keys(SFX) };
})(window);
