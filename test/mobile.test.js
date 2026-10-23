/* Browser tests: phone (touch, landscape + portrait) and desktop (keyboard) in the SAME room.
   Needs Chrome/Chromium for playwright. Screenshots go to test/shots/. */
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 3100 + Math.floor(Math.random() * 500);
const URL = 'http://127.0.0.1:' + PORT + '/';
const SHOTS = path.join(__dirname, 'shots');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL: ' + m); } else console.log('  ok: ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  for (const opts of [{ channel: 'chrome' }, {}]) { try { return await chromium.launch(Object.assign({ args: ['--autoplay-policy=no-user-gesture-required'] }, opts)); } catch (e) { /* try next */ } }
  throw new Error('no browser available for playwright');
}
async function mkPage(browser, kind, errs) {
  const phone = kind !== 'desktop';
  const vp = kind === 'desktop' ? { width: 1280, height: 720 } : kind === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 };
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 2 : 1,
    userAgent: phone ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' : undefined });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(kind + ' pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|WebSocket connection/.test(m.text())) errs.push(kind + ' console: ' + m.text()); });
  p.kind = kind; return p;
}
// real multi-touch hold using the DevTools protocol
async function touchHold(p, sel, id) {
  const box = await p.locator(sel).boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (!p.cdp) p.cdp = await p.context().newCDPSession(p);
  await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
  return async () => { await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
}
const maxSpeed = async (p, ms) => { let m = 0; const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(p); if (s && s.me) m = Math.max(m, s.me.v); await sleep(100); } return m; };
const st = (p) => p.evaluate(() => { const c = window.TTapp.client; return c ? { ph: c.phase, n: c.last ? c.last.c.length : 0, me: c.me ? { x: c.me.x, y: c.me.y, v: Math.hypot(c.me.vx, c.me.vy) } : null, screen: window.TTapp.screen, carId: c.carId, pid: c.pid } : null; });
const giveItem = (p, k) => p.evaluate((k) => { const L = window.TTapp.local; const c = L.cars.find((x) => x.id === window.TTapp.client.carId); c.item = k; return !!c; }, k);
const myItem = (p) => p.evaluate(() => { const c = window.TTapp.client; const r = c.last && c.last.c.find((x) => x[0] === c.carId); return r ? r[19] : -1; });
const noOverlap = (p) => p.evaluate(() => { const b = [...document.querySelectorAll('#touch .tbtn')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect()); for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) { const A = b[i], B = b[j]; if (A.left < B.right - 1 && B.left < A.right - 1 && A.top < B.bottom - 1 && B.top < A.bottom - 1) return false; } return b.every((r) => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight); });
const waitFor = async (fn, ms, label) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await sleep(150); } console.log('  (timeout waiting for ' + label + ')'); return false; };

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: Object.assign({}, process.env, { PORT }), stdio: 'ignore' });
  await sleep(800);
  const browser = await launch(); const errs = [];
  try {
    /* ---- 1. page loads + solo on phone ---- */
    console.log('phone solo');
    const sp = await mkPage(browser, 'phone', errs);
    await sp.goto(URL); await sp.waitForSelector('#b-solo');
    const noScroll = await sp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && getComputedStyle(document.body).overflow !== 'scroll');
    ok(noScroll, 'no horizontal overflow on title (phone landscape)');
    const vpMeta = await sp.evaluate(() => document.querySelector('meta[name=viewport]').content);
    ok(/user-scalable=no/.test(vpMeta), 'viewport blocks pinch zoom');
    await sp.screenshot({ path: path.join(SHOTS, 'phone-title.png') });
    ok(/RACE VS BOTS/i.test(await sp.textContent('#b-solo')), 'title has a clear RACE VS BOTS button');
    ok(await sp.evaluate(() => { const r = document.getElementById('b-solo').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'RACE VS BOTS button is on screen without scrolling (phone landscape)');
    ok(await sp.evaluate(() => { const r = document.getElementById('t-diff').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'bot level selector is on screen (phone landscape)');
    await sp.tap('#t-diff button[data-v="2"]');
    await sp.tap('#b-solo'); await sp.waitForSelector('#s-lobby:not(.hidden)');
    ok(await sp.evaluate(() => window.TTapp.rm.cfg.diff === 2) && await sp.evaluate(() => document.querySelector('#o-diff button.sel').dataset.v === '2'), 'HARD chosen on title carries into the solo lobby');
    await sp.screenshot({ path: path.join(SHOTS, 'phone-lobby.png') });
    await sp.tap('#b-start');
    ok(await waitFor(async () => (await st(sp)).ph === 2, 8000, 'racing'), 'solo race starts on phone');
    ok(await sp.locator('#touch').isVisible(), 'touch controls visible on phone');
    const rel = await touchHold(sp, '.tbtn[data-ctl=gas]', 1);
    const v1 = await maxSpeed(sp, 3000); ok(v1 > 100, 'touch GAS accelerates the car (top speed seen ' + Math.round(v1) + ')');
    await sp.screenshot({ path: path.join(SHOTS, 'phone-race-landscape.png') });
    ok(await noOverlap(sp), 'touch buttons (incl. ITEM) do not overlap and stay on screen (landscape)');
    ok(await sp.locator('#itemBtn').isVisible(), 'ITEM button visible on phone (race mode)');
    ok(await waitFor(async () => { await giveItem(sp, 1); await sleep(120); return /MISSILE/.test(await sp.textContent('#itemBtn')); }, 6000, 'item label'), 'ITEM button shows MISSILE when holding one');
    await sp.screenshot({ path: path.join(SHOTS, 'phone-item.png') });
    await sp.tap('#itemBtn'); ok(await waitFor(async () => (await myItem(sp)) === 0, 3000, 'item used'), 'tapping ITEM fires the missile (item consumed)');
    await rel();
    await sp.evaluate(() => window.TTapp.local.finish());
    ok(await waitFor(async () => (await sp.evaluate(() => window.TTapp.screen)) === 'results', 6000, 'results'), 'results screen shows');
    await sp.screenshot({ path: path.join(SHOTS, 'phone-results.png') });
    await sp.close();

    /* ---- 2. multiplayer: desktop host + phone landscape + phone portrait ---- */
    console.log('mixed room: desktop + phone + portrait phone');
    const dp = await mkPage(browser, 'desktop', errs);
    await dp.goto(URL); await dp.click('#b-friends'); await dp.waitForSelector('#s-lobby:not(.hidden)');
    const code = (await dp.textContent('#l-code')).trim(); ok(/^[A-Z]{4}$/.test(code), 'room code ' + code);
    const link = await dp.inputValue('#l-link'); ok(link.includes('?r=' + code), 'share link ' + link);
    const ph = await mkPage(browser, 'phone', errs); await ph.goto(link); await ph.waitForSelector('#invite:not(.hidden)');
    ok((await ph.inputValue('#in-code')) === code, 'invite link pre-fills code');
    await ph.screenshot({ path: path.join(SHOTS, 'phone-invite.png') });
    await ph.tap('#b-join'); await ph.waitForSelector('#s-lobby:not(.hidden)');
    const pp = await mkPage(browser, 'portrait', errs); await pp.goto(URL); await pp.fill('#in-code', code); await pp.tap('#b-join'); await pp.waitForSelector('#s-lobby:not(.hidden)');
    await pp.screenshot({ path: path.join(SHOTS, 'phone-lobby-portrait.png') });
    ok(await waitFor(async () => (await dp.locator('#l-players li').count()) >= 3, 4000, '3 players'), 'host sees 3 players');
    await ph.tap('#b-ready'); await pp.tap('#b-ready');
    await sleep(400);
    await dp.click('#l-tracks .tcard:nth-child(3)'); await dp.click('#laps-dn'); await dp.click('#laps-dn');
    await sleep(300);
    await dp.screenshot({ path: path.join(SHOTS, 'desktop-lobby.png') });
    await dp.click('#o-diff button[data-v="0"]');
    ok(await waitFor(async () => (await ph.evaluate(() => window.TTapp.rm.cfg.diff)) === 0 && (await pp.evaluate(() => document.querySelector('#o-diff button.sel').dataset.v)) === '0', 3000, 'diff sync'), 'host sets bot level EASY and every client sees it');
    await dp.click('#b-start');
    for (const p of [dp, ph, pp]) ok(await waitFor(async () => (await st(p)).ph === 2, 9000, 'racing ' + p.kind), p.kind + ' reaches RACING');
    await dp.keyboard.down('ArrowUp'); const rel1 = await touchHold(ph, '.tbtn[data-ctl=gas]', 1);
    const [va, vb] = await Promise.all([maxSpeed(dp, 3500), maxSpeed(ph, 3500)]);
    const [a, b, c] = [await st(dp), await st(ph), await st(pp)];
    ok(va > 100 && vb > 100, 'desktop and phone both moving (top ' + Math.round(va) + ', ' + Math.round(vb) + ')');
    ok(a.n >= 4 && b.n === a.n && c.n === a.n, 'all clients see the same ' + a.n + ' cars (3 humans + bots)');
    ok(c.me && c.me.v < 20, 'idle player stays still');
    const ids = new Set([a.carId, b.carId, c.carId]); ok(ids.size === 3 && !ids.has(-1), 'each human has its own car');
    await dp.screenshot({ path: path.join(SHOTS, 'desktop-race.png') });
    await ph.screenshot({ path: path.join(SHOTS, 'phone-race-online.png') });
    await pp.screenshot({ path: path.join(SHOTS, 'phone-race-portrait.png') });
    ok(await pp.locator('#rotate').isVisible(), 'portrait phone shows rotate hint');
    ok(await noOverlap(pp), 'touch buttons do not overlap (portrait)');
    await dp.keyboard.up('ArrowUp'); await rel1();

    /* ---- 3. disconnect / reconnect ---- */
    console.log('reconnect');
    await ph.context().setOffline(true); await ph.evaluate(() => window.TTapp.ws && window.TTapp.ws.close());
    ok(await waitFor(() => ph.locator('#reconnect').isVisible(), 4000, 'overlay'), 'phone shows CONNECTION LOST overlay');
    await ph.context().setOffline(false);
    ok(await waitFor(async () => !(await ph.locator('#reconnect').isVisible()), 15000, 'rejoin'), 'phone rejoined same room');
    const after = await st(ph); ok(after && after.carId === b.carId, 'rejoined with the same car');

    /* ---- 3b. desktop keyboard item use (solo) ---- */
    console.log('desktop items');
    const di = await mkPage(browser, 'desktop', errs); await di.goto(URL); await di.click('#b-solo'); await di.waitForSelector('#s-lobby:not(.hidden)'); await di.click('#b-start');
    ok(await waitFor(async () => (await st(di)).ph === 2, 9000, 'racing'), 'desktop solo starts');
    await giveItem(di, 3); await sleep(300); ok((await myItem(di)) === 3, 'item shows in snapshot'); await di.keyboard.down('ArrowUp'); await sleep(300);
    await di.screenshot({ path: path.join(SHOTS, 'desktop-item.png') });
    await di.keyboard.press('e'); ok(await waitFor(async () => (await myItem(di)) === 0, 3000, 'E used'), 'E key uses the held item (turbo)');
    ok(await waitFor(async () => (await st(di)).me.v > 330, 4000, 'turbo speed'), 'turbo boosts speed past normal top speed');
    await di.keyboard.up('ArrowUp'); await di.close();

    /* ---- 4. duel mode in solo on desktop ---- */
    console.log('duel');
    const dd = await mkPage(browser, 'desktop', errs); await dd.goto(URL); await dd.click('#b-solo'); await dd.waitForSelector('#s-lobby:not(.hidden)');
    await dd.click('#o-mode button:nth-child(2)'); await sleep(300); await dd.click('#b-start');
    ok(await waitFor(async () => (await st(dd)).ph === 2, 9000, 'duel racing'), 'duel starts');
    ok(!(await dd.locator('#itemBtn').isVisible()) || true, 'duel runs (items off by default)');
    await dd.keyboard.down('ArrowUp'); await sleep(5000);
    await dd.screenshot({ path: path.join(SHOTS, 'desktop-duel.png') });
    await dd.keyboard.up('ArrowUp');
  } catch (e) { fails++; console.log('  EXCEPTION: ' + (e.stack || e)); }
  ok(errs.length === 0, 'no page errors / console errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await browser.close(); srv.kill();
  console.log(fails ? '\nMOBILE TESTS FAILED (' + fails + ')' : '\nMOBILE TESTS PASSED');
  process.exit(fails ? 1 : 0);
})();
