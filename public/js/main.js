/* Tiny Turbo - app shell: menus, lobby, networking (or local solo room), game loop. */
(function () {
  'use strict';
  const TT = window.TT, G = TT.gfx, R = TT.room, PH = R.PH, DT = TT.sim.DT, HUD = TT.hud, AU = TT.audio, IN = TT.input;
  const DEFS = TT.trackDefs;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const isTouchDev = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || 'ontouchstart' in window;
  TT.lowMem = !!(navigator.deviceMemory && navigator.deviceMemory <= 3);

  /* ------------------------------------------------------------ persistent settings / profile */
  const load = (k, d) => { try { return Object.assign({}, d, JSON.parse(localStorage.getItem(k) || '{}')); } catch (e) { return Object.assign({}, d); } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const settings = load('tt_settings', { steer: 'buttons', auto: 0, cam: 'me', gfx: 'auto', fps: 0 });
  const profile = load('tt_profile', { diff: 1, name: '', color: Math.floor(Math.random() * 12), style: Math.floor(Math.random() * 4) });
  if (!profile.name) profile.name = 'Racer' + (10 + Math.floor(Math.random() * 90));

  /* ------------------------------------------------------------ app state */
  const S = {
    screen: 'title', view: 'menu', mode: null, client: null, local: null, ws: null, leaving: false, rm: null, paused: false,
    carInfo: new Map(), objs: new Map(), samples: new Map(), touchSeen: isTouchDev, resultsTimer: 0, lastLapRt: 0, lastLap: 0, best: 0, lastCdN: 99,
    reconnect: null, pingTimer: 0, camInit: false, myPlace: 0, qualityLocked: false, frames: 0, ftAcc: 0, fps: 0, fpsT: 0, trackLoaded: -1, resultsShown: false, inviteCode: ''
  };
  window.TTapp = S;
  const canvas = $('game'); const renderer = new TT.render.Renderer(canvas); S.renderer = renderer;

  /* ------------------------------------------------------------ small UI helpers */
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), ms || 3000); }
  function showScreen(name) {
    S.screen = name; document.querySelectorAll('.screen').forEach((e) => e.classList.toggle('hidden', e.id !== 's-' + name));
    const inGame = S.view === 'game'; const clear = !!(name && $('s-' + name) && $('s-' + name).classList.contains('clear'));
    $('menubg').style.display = inGame || clear ? 'none' : 'block'; canvas.style.display = inGame || clear ? 'block' : 'none';
    if (inGame && !name) { /* racing */ }
  }
  const hideAllScreens = () => { document.querySelectorAll('.screen').forEach((e) => e.classList.add('hidden')); S.screen = ''; };
  function setView(v) { S.view = v; const g = v === 'game'; $('topbtns').classList.toggle('hidden', !g); updateTouchUI(); $('menubg').style.display = g ? 'none' : 'block'; canvas.style.display = g ? 'block' : 'none'; IN.cfg.enabled = g; }
  function updateTouchUI() {
    const show = S.view === 'game' && S.touchSeen && !S.paused && !S.screen; $('touch').classList.toggle('hidden', !show);
    document.body.classList.toggle('touchseen', S.touchSeen); document.body.classList.toggle('slide', settings.steer === 'slide');
    updateRotateHint();
  }
  let rotDismissed = false;
  function updateRotateHint() { const need = S.touchSeen && S.view === 'game' && innerHeight > innerWidth * 1.05 && !rotDismissed; $('rotate').classList.toggle('hidden', !need); }
  $('rot-x').onclick = () => { rotDismissed = true; updateRotateHint(); };
  window.addEventListener('touchstart', () => { if (!S.touchSeen) { S.touchSeen = true; updateTouchUI(); } }, { passive: true });

  /* ------------------------------------------------------------ pickers */
  function buildSwatches(el, onPick) {
    el.innerHTML = ''; G.CAR_COLORS.forEach((c, i) => { const s = document.createElement('i'); s.style.background = c.c; s.title = c.n; s.onclick = () => { AU.sfx('click'); onPick(i); }; el.appendChild(s); });
  }
  function buildStyles(el, onPick) {
    el.innerHTML = ''; G.CAR_STYLES.forEach((n, i) => { const b = document.createElement('b'); b.title = n; const c = document.createElement('canvas'); c.width = 80; c.height = 48; b.appendChild(c); b.onclick = () => { AU.sfx('click'); onPick(i); }; el.appendChild(b); });
  }
  function refreshPickers() {
    for (const [sw, st] of [[$('sw-color'), $('sw-style')], [$('l-colors'), $('l-styles')]]) {
      [...sw.children].forEach((c, i) => c.classList.toggle('sel', i === profile.color));
      [...st.children].forEach((b, i) => { b.classList.toggle('sel', i === profile.style); const c = b.firstChild.getContext('2d'); c.clearRect(0, 0, 80, 48); const sp = G.carSprite(i, profile.color); c.drawImage(sp.cv, 0, 0, 80, 48); });
    }
  }
  function setProfile(p) { Object.assign(profile, p); save('tt_profile', profile); refreshPickers(); if (S.client && S.rm && S.rm.ph === PH.LOBBY) S.client.send(JSON.stringify({ t: 'prof', name: profile.name, color: profile.color, style: profile.style })); }
  buildSwatches($('sw-color'), (i) => setProfile({ color: i })); buildStyles($('sw-style'), (i) => setProfile({ style: i }));
  buildSwatches($('l-colors'), (i) => setProfile({ color: i })); buildStyles($('l-styles'), (i) => setProfile({ style: i }));
  const nameIn = $('in-name'); nameIn.value = profile.name;
  nameIn.addEventListener('input', () => { profile.name = nameIn.value.replace(/[^\w \-.!?']/g, '').slice(0, 14); save('tt_profile', profile); });
  nameIn.addEventListener('change', () => { if (!nameIn.value.trim()) { nameIn.value = 'Racer' + (10 + Math.floor(Math.random() * 90)); } profile.name = nameIn.value.trim(); save('tt_profile', profile); });
  refreshPickers();

  /* ------------------------------------------------------------ logo + menu background */
  function drawLogo() {
    const cv = $('logo'); cv.width = 320; cv.height = 96; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    const t1 = 'TINY', t2 = 'TURBO'; const sc = 7;
    const w1 = G.textWidth(t1, sc), w2 = G.textWidth(t2, sc);
    G.drawText(x, t1, 160 - w1 / 2 - 2, 8 + 4, sc, '#000', 'left'); G.drawText(x, t1, 160 - w1 / 2, 8, sc, '#ffd23f', 'left', '#7a2a00');
    G.drawText(x, t2, 160 - w2 / 2, 56, 5, '#ff5a3c', 'left', '#3a0d05');
    // speed lines + mini car
    const sp = G.carSprite(profile.style, profile.color); x.save(); x.translate(280, 22); x.rotate(-0.15); x.drawImage(sp.cv, -22, -13, 44, 26); x.restore();
    x.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 3; i++) x.fillRect(236 + i * 6, 14 + i * 7, 22 - i * 4, 2);
  }
  const mb = $('menubg'); const mctx = mb.getContext('2d'); let mbPat = null, mbT = 0;
  function menuBg(dt) {
    const w = innerWidth, h = innerHeight; const sc = 0.5; const cw = Math.ceil(w * sc), ch = Math.ceil(h * sc);
    if (mb.width !== cw || mb.height !== ch) { mb.width = cw; mb.height = ch; mbPat = null; }
    if (!mbPat) mbPat = mctx.createPattern(TT.render.TILES.gingham(), 'repeat');
    mbT += dt; mctx.setTransform(sc * 1.2, 0, 0, sc * 1.2, -mbT * 14, -mbT * 9); mctx.fillStyle = mbPat; mctx.fillRect(mbT * 14 / (sc * 1.2) - 10, mbT * 9 / (sc * 1.2) - 10, cw / (sc * 1.2) + 120, ch / (sc * 1.2) + 120);
    mctx.setTransform(1, 0, 0, 1, 0, 0); const gr = mctx.createRadialGradient(cw / 2, ch / 2, ch * 0.2, cw / 2, ch / 2, Math.max(cw, ch) * 0.75); gr.addColorStop(0, 'rgba(20,23,43,.55)'); gr.addColorStop(1, 'rgba(20,23,43,.95)'); mctx.fillStyle = gr; mctx.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 5; i++) {
      const t = mbT * (0.35 + i * 0.05) + i * 1.7; const A = cw * 0.42, B = ch * 0.36; const x = cw / 2 + Math.cos(t) * A, y = ch / 2 + Math.sin(t * 1.3 + i) * B;
      const dx = -Math.sin(t) * A, dy = Math.cos(t * 1.3 + i) * 1.3 * B; const a = Math.atan2(dy, dx);
      const spr = G.carSprite(i % 4, (i * 3 + 1) % 12); const k = Math.max(0.8, cw / 600);
      mctx.save(); mctx.translate(x + 3, y + 4); mctx.rotate(a); mctx.fillStyle = 'rgba(0,0,0,.35)'; mctx.fillRect(-16 * k, -8 * k, 32 * k, 16 * k); mctx.restore();
      mctx.save(); mctx.translate(x, y); mctx.rotate(a); mctx.drawImage(spr.cv, -20 * k, -12 * k, 40 * k, 24 * k); mctx.restore();
    }
  }

  /* ------------------------------------------------------------ session creation */
  function makeClient(sendFn) {
    const c = new TT.client.GameClient(sendFn);
    c.onwelcome = (m) => { if (S.reconnect) { S.reconnect = null; $('reconnect').classList.add('hidden'); toast('Back in the game!'); } };
    c.onroom = onRoom; c.onevent = onEvent;
    c.onerr = (m) => { toast(m.msg, 3500); if (m.fatal) { if (S.reconnect) { stopReconnect(); leave(true); } else if (!c.code) leave(true); } };
    return c;
  }
  function resetSessionState() {
    S.rm = null; S.carInfo.clear(); S.objs.clear(); S.samples.clear(); S.paused = false; S.resultsShown = false; clearTimeout(S.resultsTimer); S.trackLoaded = -1;
  }
  function startSolo() {
    leave(false, true); AU.unlock(); S.mode = 'solo'; resetSessionState();
    S.local = new R.Room('SOLO', (pid, str) => { if (S.client) S.client.onMessage(str); }, { local: true });
    S.client = makeClient((str) => { if (S.local) S.local.handle(1, JSON.parse(str)); }); S.client.interp = 2;
    S.local.join(1, { name: profile.name, color: profile.color, style: profile.style });
    S.local.handle(1, { t: 'cfg', fill: 4, laps: 3, track: S.lastTrack || 0, mode: 'race', diff: profile.diff == null ? 1 : profile.diff });
  }
  function wsURL() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; }
  function startOnline(first) {
    leave(false, true); AU.unlock(); S.mode = 'online'; resetSessionState(); S.leaving = false;
    S.client = makeClient((str) => { if (S.ws && S.ws.readyState === 1) S.ws.send(str); });
    $('loading').classList.remove('hidden'); $('loading').querySelector('h2').textContent = 'CONNECTING...';
    openWs(first, true);
  }
  function openWs(first, initial) {
    let ws; try { ws = new WebSocket(wsURL()); } catch (e) { toast('Online play needs the game server'); leave(true); return; }
    S.ws = ws; const myclient = S.client;
    ws.onopen = () => { if (S.ws !== ws) return; ws.send(JSON.stringify(first)); startPing(); };
    ws.onmessage = (ev) => { if (S.ws === ws && S.client === myclient) { if (initial) { $('loading').classList.add('hidden'); initial = false; } myclient.onMessage(ev.data); } };
    ws.onclose = () => { if (S.ws !== ws || S.leaving) return; stopPing(); $('loading').classList.add('hidden'); if (!S.client || !S.client.code) { toast('Could not connect to the game server'); leave(true); } else beginReconnect(); };
    ws.onerror = () => { /* handled by onclose */ };
  }
  function startPing() { stopPing(); S.pingTimer = setInterval(() => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ t: 'p', c: performance.now() })); }, 2000); }
  function stopPing() { clearInterval(S.pingTimer); }
  function beginReconnect() {
    if (!S.reconnect) S.reconnect = { n: 0, timer: 0 };
    $('reconnect').classList.remove('hidden'); IN.reset();
    const attempt = () => {
      if (!S.reconnect || S.leaving) return; const n = S.reconnect.n++;
      if (n > 14) { stopReconnect(); toast('Connection lost'); leave(true); return; }
      $('rc-msg').textContent = 'Reconnecting... (try ' + (n + 1) + ')';
      const c = S.client; openWs({ t: 'join', code: c.code, token: c.token, name: profile.name, color: profile.color, style: profile.style }, false);
      const ws = S.ws; const prevClose = ws.onclose;
      ws.onclose = () => { if (S.ws !== ws || S.leaving) return; if (S.reconnect) S.reconnect.timer = setTimeout(attempt, Math.min(5000, 600 * Math.pow(1.6, n))); };
      ws.onerror = () => {};
    };
    attempt();
  }
  function stopReconnect() { if (S.reconnect) clearTimeout(S.reconnect.timer); S.reconnect = null; $('reconnect').classList.add('hidden'); }
  $('rc-leave').onclick = () => { stopReconnect(); leave(true); };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.mode === 'online' && S.client && S.client.code && !S.leaving && (!S.ws || S.ws.readyState > 1) && !S.reconnect) beginReconnect();
    if (document.hidden && S.mode === 'solo' && S.view === 'game' && !S.screen) pause(true);
  });

  function leave(toTitle, silent) {
    S.leaving = true; stopPing(); stopReconnect(); clearTimeout(S.resultsTimer);
    if (S.ws) { const w = S.ws; S.ws = null; try { w.close(); } catch (e) { /* */ } }
    S.local = null; S.client = null; S.mode = null; S.paused = false; $('loading').classList.add('hidden');
    resetSessionState(); IN.reset(); AU.engine(0, false, false); HUD.clear(); renderer.clearDecals();
    if (silent) return;
    S.view = 'menu'; setView('menu'); AU.music('menu'); showScreen('title'); S.leaving = false;
  }

  /* ------------------------------------------------------------ title buttons */
  function cleanCode(v) { return String(v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }
  $('b-solo').onclick = () => { AU.sfx('click'); commitName(); startSolo(); };
  $('b-friends').onclick = () => { AU.sfx('click'); commitName(); startOnline({ t: 'create', diff: profile.diff == null ? 1 : profile.diff, name: profile.name, color: profile.color, style: profile.style }); };
  $('b-join').onclick = () => {
    const code = cleanCode($('in-code').value); commitName();
    if (code.length !== 4) { toast('Enter the 4-letter room code'); return; }
    AU.sfx('click'); startOnline({ t: 'join', code, name: profile.name, color: profile.color, style: profile.style });
  };
  $('in-code').addEventListener('input', (e) => { e.target.value = cleanCode(e.target.value); });
  $('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('b-join').click(); });
  function commitName() { profile.name = (nameIn.value || '').trim() || profile.name; nameIn.value = profile.name; save('tt_profile', profile); }
  $('b-help').onclick = () => { AU.sfx('click'); showScreen('help'); };
  $('h-back').onclick = () => { AU.sfx('back'); showScreen(S.view === 'game' ? 'pause' : 'title'); };
  $('b-settings').onclick = () => { AU.sfx('click'); S.settingsFrom = 'title'; showScreen('settings'); syncSettings(); };
  $('st-back').onclick = () => { AU.sfx('back'); showScreen(S.settingsFrom === 'pause' ? 'pause' : 'title'); };
  (function invite() {
    const q = new URLSearchParams(location.search); const code = cleanCode(q.get('r') || q.get('room') || '');
    if (code.length === 4) { S.inviteCode = code; $('in-code').value = code; $('invite').classList.remove('hidden'); $('inv-code').textContent = code; }
  })();

  /* ------------------------------------------------------------ settings */
  function bindSeg(id, key, conv, after) {
    const el = $(id); el.querySelectorAll('button').forEach((b) => { b.onclick = () => { AU.sfx('click'); settings[key] = conv(b.dataset.v); save('tt_settings', settings); syncSettings(); after && after(); }; });
  }
  function syncSettings() {
    const mark = (id, v) => $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.v === String(v)));
    mark('st-sfx', AU.state.sfx ? 1 : 0); mark('st-music', AU.state.music ? 1 : 0); mark('st-steer', settings.steer); mark('st-auto', settings.auto); mark('st-cam', settings.cam); mark('st-gfx', settings.gfx); mark('st-fps', settings.fps);
    IN.cfg.steerMode = settings.steer; IN.cfg.autoGas = !!settings.auto; updateTouchUI();
    $('b-snd').classList.toggle('off', !AU.state.sfx && !AU.state.music); $('p-sfx').textContent = 'SOUND: ' + (AU.state.sfx ? 'ON' : 'OFF'); $('p-music').textContent = 'MUSIC: ' + (AU.state.music ? 'ON' : 'OFF');
  }
  $('st-sfx').querySelectorAll('button').forEach((b) => { b.onclick = () => { AU.setSfx(b.dataset.v === '1'); AU.sfx('click'); syncSettings(); }; });
  $('st-music').querySelectorAll('button').forEach((b) => { b.onclick = () => { AU.setMusic(b.dataset.v === '1'); syncSettings(); }; });
  bindSeg('st-steer', 'steer', String); bindSeg('st-auto', 'auto', Number); bindSeg('st-cam', 'cam', String);
  bindSeg('st-gfx', 'gfx', String, () => { applyQuality(true); }); bindSeg('st-fps', 'fps', Number);
  function applyQuality(force) {
    const q = settings.gfx === 'high' ? 1 : settings.gfx === 'low' ? 0.65 : (force ? 1 : renderer.q);
    S.qualityLocked = settings.gfx !== 'auto'; renderer.lowFx = q < 0.85; renderer.maxParts = q < 0.85 ? 110 : 260; renderer.resize(q);
  }
  $('p-sfx').onclick = () => { AU.setSfx(!AU.state.sfx); syncSettings(); };
  $('p-music').onclick = () => { AU.setMusic(!AU.state.music); syncSettings(); };
  $('b-snd').onclick = () => { const on = AU.state.sfx || AU.state.music; AU.setSfx(!on); AU.setMusic(!on); syncSettings(); if (!on) AU.sfx('click'); };

  /* ------------------------------------------------------------ lobby */
  const trackCards = [];
  function buildTrackCards() {
    const el = $('l-tracks'); el.innerHTML = '';
    DEFS.forEach((d, i) => {
      const T = R.getTrack(i); const mm = TT.render.bakeMini(T);
      const card = document.createElement('div'); card.className = 'tcard'; const cv = document.createElement('canvas'); cv.width = 200; cv.height = 150; const x = cv.getContext('2d');
      const bgc = { breakfast: '#6d4a2e', workbench: '#a67b4b', sandbox: '#4d9a3a', bathtub: '#a9c8d8' }[d.theme] || '#333'; x.fillStyle = bgc; x.fillRect(0, 0, 200, 150); x.drawImage(mm.cv, 0, 0);
      const n = document.createElement('div'); n.className = 'tn'; n.textContent = d.name; card.appendChild(cv); card.appendChild(n);
      card.onclick = () => { if (!isHost()) return; AU.sfx('click'); sendCfg({ track: i }); S.lastTrack = i; };
      el.appendChild(card); trackCards.push(card);
    });
  }
  const isHost = () => !!(S.rm && S.client && S.rm.host === S.client.pid);
  const sendCfg = (o) => { o.t = 'cfg'; S.client && S.client.send(JSON.stringify(o)); };
  $('o-mode').querySelectorAll('button').forEach((b) => { b.onclick = () => { if (!isHost()) return; AU.sfx('click'); const o = { mode: b.dataset.v }; if (b.dataset.v === 'duel' && S.rm.cfg.fill < 2) o.fill = 2; sendCfg(o); }; });
  const setDiffSel = () => $('t-diff').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', +b.dataset.v === (profile.diff == null ? 1 : profile.diff)));
  $('t-diff').querySelectorAll('button').forEach((b) => { b.onclick = () => { AU.sfx('click'); profile.diff = +b.dataset.v; save('tt_profile', profile); setDiffSel(); }; });
  setDiffSel();
  $('o-diff').querySelectorAll('button').forEach((b) => { b.onclick = () => { if (!isHost()) return; AU.sfx('click'); profile.diff = +b.dataset.v; save('tt_profile', profile); setDiffSel(); sendCfg({ diff: +b.dataset.v }); }; });
  $('o-items').querySelectorAll('button').forEach((b) => { b.onclick = () => { if (!isHost()) return; AU.sfx('click'); sendCfg({ items: b.dataset.v === '1' }); }; });
  $('laps-dn').onclick = () => { if (isHost()) { AU.sfx('click'); sendCfg({ laps: Math.max(1, S.rm.cfg.laps - 1) }); } };
  $('laps-up').onclick = () => { if (isHost()) { AU.sfx('click'); sendCfg({ laps: Math.min(9, S.rm.cfg.laps + 1) }); } };
  $('fill-dn').onclick = () => { if (isHost()) { AU.sfx('click'); sendCfg({ fill: Math.max(S.rm.cfg.mode === 'duel' ? 2 : 1, S.rm.cfg.fill - 1) }); } };
  $('fill-up').onclick = () => { if (isHost()) { AU.sfx('click'); sendCfg({ fill: Math.min(8, S.rm.cfg.fill + 1) }); } };
  $('b-start').onclick = () => { AU.sfx('click'); S.client.send(JSON.stringify({ t: 'start' })); };
  $('b-ready').onclick = () => { AU.sfx('click'); const me = myPlayer(); S.client.send(JSON.stringify({ t: 'ready', v: me && me.r ? 0 : 1 })); };
  $('b-leave').onclick = () => { AU.sfx('back'); leave(true); };
  const myPlayer = () => (S.rm && S.client ? S.rm.players.find((p) => p.id === S.client.pid) : null);
  function inviteLink() { return location.origin + location.pathname.replace(/index\.html$/, '') + '?r=' + (S.client ? S.client.code : ''); }
  $('b-copy').onclick = () => { AU.sfx('click'); copyText(inviteLink()).then((ok) => toast(ok ? 'Link copied! Send it to your friends' : 'Press and hold the link to copy')); };
  $('b-share').onclick = () => { if (navigator.share) navigator.share({ title: 'Tiny Turbo', text: 'Race me in Tiny Turbo! Room ' + S.client.code, url: inviteLink() }).catch(() => {}); };
  if (navigator.share && isTouchDev) $('b-share').classList.remove('hidden');
  $('l-link').addEventListener('focus', (e) => e.target.select());
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(() => true, () => false);
    return new Promise((res) => { const i = $('l-link'); i.value = t; i.focus(); i.select(); try { res(document.execCommand('copy')); } catch (e) { res(false); } });
  }
  function drawCarIcon(cv, style, color) { const x = cv.getContext('2d'); cv.width = 88; cv.height = 52; x.clearRect(0, 0, 88, 52); const sp = G.carSprite(style, color); x.drawImage(sp.cv, 0, 0, 88, 52); }
  function updateLobby() {
    const m = S.rm, cl = S.client; if (!m || !cl) return; const solo = S.mode === 'solo'; const host = isHost();
    $('l-code').textContent = solo ? 'SOLO' : m.code; $('l-share').classList.toggle('hidden', solo); $('l-link').value = solo ? '' : inviteLink();
    const list = $('l-players'); list.innerHTML = '';
    const humans = m.players.filter((p) => !p.bot); $('l-count').textContent = '(' + humans.length + ')';
    for (const p of humans) {
      const li = document.createElement('li'); if (p.id === cl.pid) li.classList.add('me'); if (!p.cn) li.classList.add('off');
      const c = document.createElement('canvas'); drawCarIcon(c, p.st, p.c); li.appendChild(c);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.n; li.appendChild(nm);
      if (p.id === m.host) { const t = document.createElement('span'); t.className = 'tagm'; t.textContent = 'HOST'; li.appendChild(t); }
      if (p.id === cl.pid) { const t = document.createElement('span'); t.className = 'tagm'; t.textContent = 'YOU'; li.appendChild(t); }
      if (!solo && p.id !== m.host) { const r = document.createElement('span'); r.className = p.r ? 'rdy' : 'nrdy'; r.textContent = !p.cn ? '...' : p.r ? 'READY' : 'NOT READY'; r.style.fontSize = '11px'; li.appendChild(r); }
      list.appendChild(li);
    }
    if (solo || m.cfg.fill > humans.length) { const bots = Math.max(0, m.cfg.fill - humans.length); if (bots) { const li = document.createElement('li'); li.style.opacity = '.7'; li.innerHTML = '<span class="nm">+ ' + bots + ' bot' + (bots > 1 ? 's' : '') + ' will fill the grid</span>'; list.appendChild(li); } }
    trackCards.forEach((c, i) => { c.classList.toggle('sel', i === m.cfg.track); c.classList.toggle('ro', !host); });
    $('o-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.v === m.cfg.mode)); $('o-mode').classList.toggle('ro', !host);
    $('o-diff').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', +b.dataset.v === (m.cfg.diff == null ? 1 : m.cfg.diff))); $('o-diff').classList.toggle('ro', !host);
    $('o-items').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', (b.dataset.v === '1') === !!m.cfg.items)); $('o-items').classList.toggle('ro', !host);
    $('o-laps').textContent = m.cfg.laps; $('o-fill').textContent = m.cfg.fill; $('opt-laps').style.display = m.cfg.mode === 'race' ? '' : 'none';
    $('l-opts').querySelectorAll('.stepper button').forEach((b) => { b.disabled = !host; });
    $('l-modehelp').textContent = m.cfg.mode === 'duel' ? 'DUEL: stay near the leader or get knocked out. Last car racing scores - first to ' + (m.cfg.fill <= 2 ? 5 : 3) + ' wins!' : 'RACE: classic laps. Drift, ram rivals off the road, and grab item boxes: missile, oil slick, turbo!';
    const me = myPlayer(); $('b-start').classList.toggle('hidden', !host); $('b-ready').classList.toggle('hidden', host || solo);
    if (me) { $('b-ready').textContent = me.r ? 'READY! (tap to undo)' : 'READY!'; }
    const waiting = humans.filter((p) => p.id !== m.host && p.cn && !p.r).length;
    $('l-msg').textContent = host ? (humans.length > 1 ? (waiting ? 'Waiting for ' + waiting + ' player' + (waiting > 1 ? 's' : '') + '...' : 'Everyone is ready!') : (solo ? '' : 'Share the link to invite friends')) : 'Waiting for the host to start...';
    if (me) { const edit = $('l-colors'); [...edit.children].forEach((c, i) => c.classList.toggle('sel', i === me.c)); }
  }

  /* ------------------------------------------------------------ results */
  function showResults() {
    const m = S.rm; if (!m || !m.res || S.screen === 'results') return; S.resultsShown = true; updateResults(); showScreen('results');
    const mine = m.res.find((r) => r.car === S.client.carId); const won = mine && mine.place === 1;
    if (mine) AU.sfx(won ? 'win' : 'lose'); if (won) { const c = S.objs.get(S.client.carId); if (c) for (let i = 0; i < 4; i++) renderer.burst(c.x, c.y, 'confetti', 14); }
  }
  function updateResults() {
    const m = S.rm; if (!m || !m.res) return; const cl = S.client; const duel = m.cfg.mode === 'duel'; const mine = m.res.find((r) => r.car === cl.carId);
    $('r-title').textContent = !mine ? 'RESULTS' : mine.place === 1 ? 'YOU WIN!' : mine.place === 2 ? 'SO CLOSE!' : 'GOOD RACE!';
    const ol = $('r-list'); ol.innerHTML = '';
    for (const r of m.res) {
      const li = document.createElement('li'); if (r.car === cl.carId) li.classList.add('me');
      const pl = document.createElement('span'); pl.className = 'pl'; pl.textContent = r.place; li.appendChild(pl);
      const c = document.createElement('canvas'); drawCarIcon(c, r.style, r.color); li.appendChild(c);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name + (r.bot ? ' (bot)' : ''); li.appendChild(nm);
      const tm = document.createElement('span'); tm.className = 'tm';
      if (duel) tm.innerHTML = r.pts + ' pts'; else tm.innerHTML = (r.fin ? HUD.fmt2(r.time) : 'DNF') + (r.best ? '<small>best ' + HUD.fmt2(r.best) + '</small>' : '');
      li.appendChild(tm); ol.appendChild(li);
    }
    const host = isHost(); const humans = m.players.filter((p) => !p.bot && p.cn && !p.sp);
    const ready = humans.filter((p) => p.rm).length; const me = myPlayer();
    $('r-lobby').classList.toggle('hidden', !host); $('r-again').disabled = !!(me && me.rm);
    $('r-again').textContent = me && me.rm ? 'WAITING...' : 'RACE AGAIN';
    $('r-msg').textContent = S.mode === 'online' && humans.length > 1 ? ready + '/' + humans.length + ' want a rematch' + (host ? '' : '') : '';
  }
  $('r-again').onclick = () => { AU.sfx('click'); S.client.send(JSON.stringify({ t: 'rematch' })); };
  $('r-lobby').onclick = () => { AU.sfx('click'); S.client.send(JSON.stringify({ t: 'lobby' })); };
  $('r-leave').onclick = () => { AU.sfx('back'); leave(true); };

  /* ------------------------------------------------------------ pause */
  function pause(on) {
    if (S.view !== 'game' || !S.client) return;
    if (on && S.screen) return; if (!on && S.screen !== 'pause') return;
    S.paused = !!on && S.mode === 'solo'; IN.reset();
    if (on) { $('p-note').textContent = S.mode === 'solo' ? 'Game paused' : 'The race keeps going while you look at this!'; S.settingsFrom = 'pause'; showScreen('pause'); syncSettings(); }
    else { hideAllScreens(); S.paused = false; }
    updateTouchUI();
  }
  IN.cfg.onPause = () => pause(S.screen !== 'pause');
  $('b-pause').onclick = () => { AU.sfx('click'); pause(true); };
  $('p-resume').onclick = () => { AU.sfx('click'); pause(false); };
  $('p-leave').onclick = () => { AU.sfx('back'); leave(true); };
  const fsBtn = document.createElement('button'); fsBtn.className = 'ibtn'; fsBtn.innerHTML = '&#9974;'; fsBtn.setAttribute('aria-label', 'Fullscreen');
  if (document.documentElement.requestFullscreen && isTouchDev) { $('topbtns').insertBefore(fsBtn, $('b-snd')); }
  fsBtn.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* */ } }).catch(() => {}); };
  IN.bindTouch($('touch'), $('knob'));

  /* ------------------------------------------------------------ room / events from the client core */
  function rebuildCarInfo(m) {
    S.carInfo.clear();
    for (const p of m.players) if (p.car >= 0) S.carInfo.set(p.car, { name: p.n, color: p.c, style: p.st, bot: !!p.bot, pid: p.id });
  }
  let prebakeTimer = 0;
  function onRoom(m, prev) {
    S.rm = m; rebuildCarInfo(m); const cl = S.client;
    if (m.ph === PH.LOBBY) {
      if (S.view !== 'menu' || S.screen !== 'lobby') {
        setView('menu'); HUD.clear(); S.resultsShown = false; clearTimeout(S.resultsTimer); AU.music('menu'); AU.engine(0, false, false); showScreen('lobby'); S.paused = false; $('loading').classList.add('hidden');
        if (!trackCards.length) buildTrackCards();
        if (history.replaceState && S.mode === 'online') try { history.replaceState(null, '', '?r=' + m.code); } catch (e) { /* */ }
        refreshPickers();
      }
      updateLobby();
      clearTimeout(prebakeTimer); prebakeTimer = setTimeout(() => { if (S.rm && S.rm.ph === PH.LOBBY && S.client) { try { renderer.setTrack(R.getTrack(S.rm.cfg.track)); } catch (e) { /* */ } } }, 700);
      return;
    }
    // race in progress
    const wasGame = S.view === 'game' && prev && prev.ph !== PH.LOBBY && prev.ph !== PH.RESULTS;
    if (m.ph !== PH.RESULTS && (!wasGame || S.screen === 'results' || S.screen === 'lobby')) startGameView();
    if (m.ph === PH.RESULTS) {
      if (S.view !== 'game') { startGameView(); }
      if (!S.resultsShown && !S.resultsTimer) S.resultsTimer = setTimeout(() => { S.resultsTimer = 0; if (S.rm && S.rm.ph === PH.RESULTS) showResults(); }, S.rm.cfg.mode === 'duel' ? 1800 : 1400);
      else if (S.resultsShown) updateResults();
    } else if (S.screen === 'results') { /* handled above */ }
  }
  function startGameView() {
    const cl = S.client; if (!cl || !cl.T) return;
    clearTimeout(S.resultsTimer); S.resultsTimer = 0; S.resultsShown = false; S.paused = false;
    setView('game'); hideAllScreens(); updateTouchUI(); HUD.clear(); IN.reset();
    S.lastLapRt = 0; S.lastLap = 0; S.best = 0; S.camInit = false; S.lastCdN = 99; S.myPlace = 0; S.objs.clear();
    AU.music('race');
    const T = cl.T; S.lastTrack = cl.trackIdx;
    renderer.resize(); renderer.clearDecals();
    if (renderer.T !== T || !renderer.baked) { $('loading').classList.remove('hidden'); $('loading').querySelector('h2').textContent = 'LOADING...'; setTimeout(() => { try { renderer.setTrack(T); } catch (e) { console.error(e); toast('Graphics error: ' + e.message, 6000); } $('loading').classList.add('hidden'); }, 40); }
    if (S.rm && S.rm.cfg.mode === 'duel') HUD.banner('DUEL!', 'Stay close to the leader', '#ff7a3c', 2200);
  }
  function who(id) { const i = S.carInfo.get(id); return i ? i.name : 'Racer'; }
  function onEvent(e) {
    const cl = S.client; if (!cl || S.view !== 'game') return; const type = e[0]; const id = e[1]; const mine = id === cl.carId;
    const o = S.objs.get(id); let vol = 1;
    if (o && !mine) { const cam = renderer.cam; const d = Math.hypot(o.x - cam.x, o.y - cam.y); vol = clamp(1 - d / 900, 0.1, 0.8); } else if (!o && !mine) vol = 0.15;
    switch (type) {
      case 'go': AU.sfx('go'); HUD.banner('GO!', '', '#6dff7a', 900); break;
      case 'round': renderer.clearDecals(); if (e[1] > 1) HUD.banner('ROUND ' + e[1], '', '#fff', 1200); S.lastCdN = 99; break;
      case 'lap': if (mine) { const rt = cl.last ? cl.last.rt : 0; S.lastLapRt = rt; if (e[2] >= 1) { S.lastLap = e[3]; if (!S.best || e[3] < S.best) S.best = e[3]; const laps = cl.T.laps; if (S.rm.cfg.mode === 'race' && e[2] < laps) HUD.banner(e[2] + 1 === laps ? 'FINAL LAP!' : 'LAP ' + (e[2] + 1), HUD.fmt2(e[3]), '#ffd23f', 1500); AU.sfx('lap'); } } break;
      case 'fin': if (mine) { HUD.banner(HUD.ORD[e[2] - 1] + ' PLACE!', HUD.fmt2(e[3]), e[2] === 1 ? '#ffd23f' : '#fff', 3000); AU.sfx('fin'); if (e[2] === 1 && o) for (let i = 0; i < 3; i++) renderer.burst(o.x, o.y, 'confetti', 14); } break;
      case 'out': AU.sfx('out', vol); if (o) renderer.burst(o.x, o.y, 'boom', 18); if (mine) HUD.banner('KNOCKED OUT!', '', '#ff5a4a', 1500); break;
      case 'score': { const nm = who(id); HUD.banner(mine ? 'YOU SCORE!' : nm + ' SCORES!', S.rm.cfg.mode === 'duel' ? e[2] + ' / ' + S.rm.target : '', mine ? '#6dff7a' : '#ffd23f', 2100); AU.sfx('score'); break; }
      case 'fall': AU.sfx('fall', vol); break;
      case 'boost': AU.sfx('boost', vol); break;
      case 'oil': AU.sfx('oil', vol); break;
      case 'pick': AU.sfx('pick', vol); break;
      case 'fire': AU.sfx(e[2] === 2 ? 'drop' : e[2] === 3 ? 'boost' : 'fire', vol); break;
      case 'hit': AU.sfx('hit', vol); if (o) { renderer.burst(o.x, o.y, 'boom', 14); renderer.burst(o.x, o.y, 'spark', 8); } if (mine) { renderer.shake = Math.max(renderer.shake, 1); vib(60); HUD.banner('HIT!', '', '#ff5a4a', 900); } else if (e[2] === cl.carId) { HUD.banner('DIRECT HIT!', who(id), '#6dff7a', 900); } break;
      case 'pop': AU.sfx('pop', 0.4); break;
      case 'splash': AU.sfx('splash', vol); if (o) renderer.burst(o.x, o.y, 'splash', 8); break;
      case 'ramp': AU.sfx('ramp', vol); break;
      case 'land': AU.sfx('land', vol); if (o) renderer.burst(o.x, o.y, 'puff', 5); break;
      case 'bump': AU.sfx('bump', vol); if (mine) { renderer.shake = Math.max(renderer.shake, 0.6); vib(25); } break;
      case 'wall': AU.sfx('wall', vol); if (o) renderer.burst(o.x, o.y, 'spark', 5, o.a + Math.PI / 2, 3); if (mine) { renderer.shake = Math.max(renderer.shake, 0.5); vib(20); } break;
      case 'car': { AU.sfx('car', vol); const a = S.objs.get(e[1]), b = S.objs.get(e[2]); if (a && b) renderer.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 'spark', 6); if (e[1] === cl.carId || e[2] === cl.carId) { renderer.shake = Math.max(renderer.shake, 0.7); vib(35); } break; }
      default: break;
    }
  }
  function vib(ms) { try { if (navigator.vibrate && S.touchSeen) navigator.vibrate(ms); } catch (e) { /* */ } }

  /* ------------------------------------------------------------ per-frame: build render list */
  function buildCars(time) {
    const cl = S.client, T = cl.T; const sm = cl.sample(S.samples); const out = [];
    const myId = cl.spectator ? -1 : cl.carId;
    for (const [id, st] of sm) {
      let o = S.objs.get(id); if (!o) { o = {}; S.objs.set(id, o); }
      const inf = S.carInfo.get(id) || { name: 'Racer', color: id % 12, style: id % 4 };
      o.item = st.item | 0; o.id = id; o.name = inf.name; o.color = inf.color; o.style = inf.style; o.bot = inf.bot;
      let src = st;
      if (id === myId && cl.me && cl.me._init && cl.phase === PH.RACING) {
        const m = cl.me; o.x = m.x + cl.ox; o.y = m.y + cl.oy; o.a = m.a + cl.oa; o.vx = m.vx; o.vy = m.vy; o.tA = m.tA; o.tF = m.tF; o.tB = m.tB; o.tI = m.tI; o.tW = m.tW; o.st = m.st;
      } else { o.x = st.x; o.y = st.y; o.a = st.a; o.vx = st.vx; o.vy = st.vy; o.tA = st.tA; o.tF = st.tF; o.tB = st.tB; o.tI = st.tI; o.tW = st.tW; o.st = st.st; }
      o.prog = st.prog; o.pts = st.pts; o.outT = st.outT; o.out = !!(st.flags & 1); o.fin = st.flags >> 4; o.me = id === myId;
      if (id === myId && cl.me && cl.phase === PH.RACING) o.prog = cl.me.prog;
      out.push(o);
    }
    return out;
  }

  /* ------------------------------------------------------------ main loop */
  let lastTs = performance.now(), acc = 0, slowFrames = 0, goodFrames = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    let dt = (ts - lastTs) / 1000; lastTs = ts; if (dt > 0.1) dt = 0.1; if (dt <= 0) return;
    S.fpsT += dt; S.frames++;
    if (S.fpsT >= 1) { S.fps = Math.round(S.frames / S.fpsT); S.frames = 0; S.fpsT = 0; }
    if (S.view !== 'game' || !S.client) { if (S.screen !== 'results' && S.screen !== 'pause') { if (S.view !== 'game') menuBg(dt); } if (!S.client || S.view !== 'game') return; }
    const cl = S.client;
    // fixed-step update
    if (!S.paused) {
      acc += dt; let n = 0;
      while (acc >= DT && n < 6) {
        acc -= DT; n++;
        if (S.mode === 'solo' && S.local) S.local.update();
        if (!cl.spectator && cl.carId >= 0 && cl.phase === PH.RACING && !S.screen) cl.step(IN.poll()); else if (cl.out.length) cl.flush();
      }
      if (n >= 6) acc = 0;
    }
    render(ts, dt);
    // adaptive quality
    if (settings.gfx === 'auto' && !S.qualityLocked) {
      if (dt > 0.026) { slowFrames++; goodFrames = 0; } else { goodFrames++; if (goodFrames > 30) slowFrames = Math.max(0, slowFrames - 1); }
      if (slowFrames > 45 && renderer.q > 0.6) { slowFrames = 0; const q = Math.max(0.6, renderer.q - 0.15); renderer.lowFx = q < 0.85; renderer.maxParts = q < 0.85 ? 110 : 260; renderer.resize(q); }
    }
  }
  function render(ts, dt) {
    const cl = S.client, T = cl.T; if (!T || !renderer.baked || renderer.T !== T) { return; }
    if (cl.snaps.length === 0) return;
    if (canvas.style.display === 'none') return;
    renderer.resize(); const W = renderer.W, H = renderer.H;
    const cars = buildCars(ts); const snap = cl.last; if (!snap) return;
    const mode = S.rm ? S.rm.cfg.mode : 'race'; const duel = mode === 'duel';
    // ordering
    const order = cars.slice().sort((a, b) => (a.fin && b.fin ? a.fin - b.fin : a.fin ? -1 : b.fin ? 1 : b.prog - a.prog));
    let me = null; for (const c of cars) if (c.me) me = c;
    S.myPlace = me ? order.indexOf(me) + 1 : 0;
    let leader = null; for (const c of order) if (!c.out) { leader = c; break; } if (!leader) leader = order[0];
    // camera
    let focus = leader;
    if (!duel && me && settings.cam !== 'leader') focus = me; else if (duel && me && !me.out && cars.filter((c) => !c.out).length <= 1) focus = me;
    if (duel && me && me.out && leader) focus = leader;
    const cam = renderer.cam; const sp = focus ? Math.hypot(focus.vx, focus.vy) : 0;
    let tx = focus ? focus.x + clamp(focus.vx * 0.28, -90, 90) : cam.x, ty = focus ? focus.y + clamp(focus.vy * 0.28, -90, 90) : cam.y;
    let tsc = clamp(Math.min(W / 760, H / 460), 0.42, 1.6);
    if (duel) tsc = Math.min(tsc, Math.min(W, H) / (2 * (snap.R + 60)));
    tsc *= 1 - 0.08 * Math.min(1, sp / 330);
    if (!S.camInit && focus) { cam.x = tx; cam.y = ty; cam.sc = tsc; S.camInit = true; }
    else { const k = 1 - Math.exp(-(duel ? 7 : 9) * dt); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.sc += (tsc - cam.sc) * (1 - Math.exp(-3 * dt)); }
    renderer.shake *= Math.exp(-7 * dt);
    renderer.updateParts(dt); renderer.carFx(cars, dt);
    let danger = false; if (duel) for (const c of cars) if (c.outT > 0.05 && !c.out) danger = true;
    const itemsOn = !!(S.rm && S.rm.cfg.items && snap.it);
    renderer.drawWorld({ cars, time: ts, items: itemsOn ? snap.it : null, missiles: itemsOn ? cl.sampleMissiles(S.missiles || (S.missiles = [])) : null, duel: duel && leader ? { leader, R: snap.R, danger } : null });
    // name tags + me marker (device px)
    const ctx = renderer.ctx; const dpr = renderer.dpr; ctx.setTransform(1, 0, 0, 1, 0, 0);
    const tagS = Math.max(1, Math.round(dpr * (H < 420 ? 1 : 1.5)));
    for (const c of cars) {
      if (c.out && c !== me) continue; const p = renderer.w2s(c.x, c.y); const sx = p[0] * dpr, sy = p[1] * dpr;
      if (sx < -60 || sy < -60 || sx > renderer.cv.width + 60 || sy > renderer.cv.height + 60) continue;
      const lift = (c.tA > 0 ? 14 : 0) * cam.sc * dpr; const y0 = sy - 26 * cam.sc * dpr - lift - tagS * 7;
      if (c.me) { const a = 5 * dpr; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(sx, y0 + tagS * 7); ctx.lineTo(sx - a - 2, y0 - a * 0.2 - 2); ctx.lineTo(sx + a + 2, y0 - a * 0.2 - 2); ctx.fill(); ctx.fillStyle = G.CAR_COLORS[c.color % 12].c; ctx.beginPath(); ctx.moveTo(sx, y0 + tagS * 6); ctx.lineTo(sx - a, y0); ctx.lineTo(sx + a, y0); ctx.fill(); }
      else if (cam.sc > 0.38) G.drawText(ctx, c.name, sx, y0, tagS, c.bot ? '#d6d9ee' : '#fff', 'center', 'rgba(0,0,0,.85)');
    }
    // HUD
    const raceT = snap.rt;
    const hs = {
      phase: snap.p, cd: snap.cd, raceT, T, mode, laps: T.laps, me, spectator: cl.spectator || !me, cars, order, total: cars.length, myPlace: S.myPlace, round: snap.rd, target: S.rm ? S.rm.target : 3,
      lap: me ? Math.floor(me.prog / T.L) + 1 : 1, lastLap: S.lastLap, best: S.best, touch: S.touchSeen, online: S.mode === 'online', rtt: cl.rtt, fps: settings.fps ? S.fps + '' : '', safe: 0, items: itemsOn
    };
    { const k = itemsOn ? (me ? me.item | 0 : 0) : -1; if (S._ib !== k) { S._ib = k; const ib = $('itemBtn'); ib.textContent = k > 0 ? ['', 'MISSILE', 'OIL', 'TURBO'][k] : 'ITEM'; ib.classList.toggle('empty', k <= 0); ib.style.display = k < 0 ? 'none' : ''; } }
    HUD.draw(renderer, hs);
    // pointer arrow for duel
    if (duel && me && !me.out && leader && leader !== me && me.outT > 0.02) {
      const a = Math.atan2(leader.y - me.y, leader.x - me.x); const p = renderer.w2s(me.x, me.y); const r = 44 * dpr; ctx.save(); ctx.translate(p[0] * dpr + Math.cos(a) * r, p[1] * dpr + Math.sin(a) * r); ctx.rotate(a);
      ctx.fillStyle = Math.floor(ts / 150) % 2 ? '#ff5a4a' : '#ffd23f'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(10 * dpr, 0); ctx.lineTo(-6 * dpr, -8 * dpr); ctx.lineTo(-2 * dpr, 0); ctx.lineTo(-6 * dpr, 8 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // countdown beeps
    if (snap.p === PH.COUNTDOWN) { const n = Math.ceil(snap.cd - 0.6); if (n !== S.lastCdN) { if (n >= 1) AU.sfx('beep'); S.lastCdN = n; } }
    // engine
    if (me) { const spd = Math.hypot(me.vx, me.vy); AU.engine(clamp(spd / 330, 0, 1.2), me.tB > 0, snap.p === PH.RACING && !me.out && !me.fin && !S.paused && !S.screen); } else AU.engine(0, false, false);
    // keep results/pause overlays animating the world
  }

  /* ------------------------------------------------------------ boot */
  function resizeAll() { renderer.resize(); updateRotateHint(); }
  window.addEventListener('resize', resizeAll); window.addEventListener('orientationchange', () => setTimeout(resizeAll, 250));
  syncSettings(); applyQuality(false); drawLogo(); setView('menu'); showScreen('title'); AU.music('menu');
  const _setProf = setProfile; // refresh logo when car changes
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#sw-color,#sw-style')) drawLogo(); });
  // first user gesture unlocks audio + starts the menu tune
  const unlockOnce = () => { AU.unlock(); AU.music(S.view === 'game' ? 'race' : 'menu'); };
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unlockOnce, { once: true, passive: true }));
  requestAnimationFrame(frame);
  // register for Add-to-Home-Screen friendliness (no offline caching: keeps updates simple)
  if ('serviceWorker' in navigator) { /* intentionally none */ }
})();
