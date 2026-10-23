/* Visual review helper: autopilot a solo race on every track and screenshot desktop + phone. Output: test/shots/tour-*.png */
const { spawn } = require('child_process'); const path = require('path'); const { chromium } = require('playwright');
const PORT = 3600 + Math.floor(Math.random() * 300); const URL = 'http://127.0.0.1:' + PORT + '/'; const SHOTS = path.join(__dirname, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: Object.assign({}, process.env, { PORT }), stdio: 'ignore' }); await sleep(800);
  let br; for (const o of [{ channel: 'chrome' }, {}]) { try { br = await chromium.launch(Object.assign({ args: ['--autoplay-policy=no-user-gesture-required'] }, o)); break; } catch (e) { /* next */ } }
  const errs = []; const only = process.argv[2];
  try {
    for (const kind of ['desktop', 'phone']) {
      const phone = kind === 'phone';
      for (let ti = 0; ti < 4; ti++) {
        if (only && String(ti) !== only) continue;
        const ctx = await br.newContext({ viewport: phone ? { width: 844, height: 390 } : { width: 1280, height: 720 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 2 : 1,
          userAgent: phone ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' : undefined });
        const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(kind + ti + ' ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(kind + ti + ' ' + m.text()); });
        await p.goto(URL); await p.waitForSelector('#b-solo');
        if (ti === 0) await p.screenshot({ path: path.join(SHOTS, 'tour-' + kind + '-title.png') });
        await p.click('#b-solo'); await p.waitForSelector('#s-lobby:not(.hidden)');
        await p.click('#l-tracks .tcard:nth-child(' + (ti + 1) + ')'); await sleep(300);
        if (ti === 0) await p.screenshot({ path: path.join(SHOTS, 'tour-' + kind + '-lobby.png') });
        await p.click('#b-start');
        await p.waitForFunction(() => window.TTapp.client && window.TTapp.client.phase === 2, null, { timeout: 15000 });
        await p.evaluate(() => { const A = window.TTapp, L = A.local, T = A.client.T; const car = L.cars.find((c) => c.id === A.client.carId); const brain = TT.ai.makeBrain(7, 0.8); const inp = { st: 0, g: 0, b: 0, d: 0 };
          TT.input.poll = () => { TT.ai.drive(T, car, brain, L.cars, inp, 1 / 60, { racing: true }); return { st: inp.st, g: inp.g, b: inp.b, d: inp.d, u: 0 }; }; });
        await sleep(5000); await p.screenshot({ path: path.join(SHOTS, 'tour-' + kind + '-' + ti + 'a.png') });
        await sleep(4000); await p.screenshot({ path: path.join(SHOTS, 'tour-' + kind + '-' + ti + 'b.png') });
        await ctx.close();
      }
    }
  } finally { await br.close(); srv.kill(); }
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
})();
