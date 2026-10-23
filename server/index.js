'use strict';
/* Tiny Turbo server: static files + WebSocket game rooms. `npm start` -> http://localhost:3000 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const { Room, PH } = require('../public/js/room.js');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, '..', 'public');
const MAX_ROOMS = +process.env.MAX_ROOMS || 300;
const MAX_PER_IP = +process.env.MAX_PER_IP || 24;
const MAX_ROOM_PLAYERS = 12; // 8 racers + a few spectators

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const fileCache = new Map();
function serveStatic(req, res) {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (url === '/') url = '/index.html';
  const fp = path.normalize(path.join(PUBLIC, url));
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); res.end('no'); return; }
  let ent = fileCache.get(fp);
  const st = (() => { try { return fs.statSync(fp); } catch (e) { return null; } })();
  if (!st || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
  if (!ent || ent.mtime !== st.mtimeMs) {
    const raw = fs.readFileSync(fp); const ext = path.extname(fp);
    ent = { mtime: st.mtimeMs, raw, gz: /\.(html|js|css|json|svg|webmanifest)$/.test(ext) ? zlib.gzipSync(raw) : null, type: MIME[ext] || 'application/octet-stream' };
    fileCache.set(fp, ent);
  }
  const headers = { 'content-type': ent.type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
  const acceptsGz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (ent.gz && acceptsGz) { headers['content-encoding'] = 'gzip'; res.writeHead(200, headers); res.end(ent.gz); }
  else { res.writeHead(200, headers); res.end(ent.raw); }
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096, perMessageDeflate: false });

const rooms = new Map();
const conns = new Map(); // pid -> {ws, room, ip, msgs}
const ipCount = new Map();
let nextPid = 1;
const CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXYZ';
function newCode() {
  for (let k = 0; k < 200; k++) {
    let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}
function makeRoom() {
  const code = newCode(); if (!code) return null;
  const room = new Room(code, (pid, str) => {
    const c = conns.get(pid); if (c && c.ws.readyState === 1) { try { c.ws.send(str); } catch (e) { /* ignore */ } }
  });
  rooms.set(code, room); return room;
}
function sendErr(ws, msg, fatal) { try { ws.send(JSON.stringify({ t: 'err', msg, fatal: fatal ? 1 : 0 })); } catch (e) { /* ignore */ } }

wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').toString().split(',')[0].trim();
  const n = (ipCount.get(ip) || 0) + 1;
  if (n > MAX_PER_IP) { ws.close(1013, 'busy'); return; }
  ipCount.set(ip, n);
  const pid = nextPid++;
  const c = { ws, room: null, ip, msgs: 0, pid, alive: true };
  conns.set(pid, c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    c.msgs++;
    if (c.msgs > 400) return; // flood guard (reset every second)
    let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!c.room) {
      if (m.t === 'create') {
        if (rooms.size >= MAX_ROOMS) return sendErr(ws, 'Server is full, try again soon', true);
        const room = makeRoom(); if (!room) return sendErr(ws, 'Could not create room', true);
        c.room = room; room.join(pid, m);
        if (m.diff != null) room.handle(pid, { t: 'cfg', diff: m.diff });
      } else if (m.t === 'join') {
        const code = String(m.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        const room = rooms.get(code);
        if (!room) return sendErr(ws, 'Room ' + code + ' not found. Check the code!', true);
        // token rejoin
        if (m.token) {
          for (const p of room.players.values()) {
            if (p.token === m.token && !p.conn) { c.room = room; room.rebind(p.pid, pid); return; }
          }
        }
        if (room.players.size >= MAX_ROOM_PLAYERS || (room.phase === PH.LOBBY && room.humanCount() >= 8)) return sendErr(ws, 'Room is full', true);
        c.room = room; room.join(pid, m);
      } else if (m.t === 'p') ws.send(JSON.stringify({ t: 'q', c: m.c }));
      return;
    }
    c.room.handle(pid, m);
  });
  const cleanup = () => {
    if (!conns.has(pid)) return; conns.delete(pid);
    const left = (ipCount.get(ip) || 1) - 1; if (left <= 0) ipCount.delete(ip); else ipCount.set(ip, left);
    if (c.room) c.room.disconnect(pid);
  };
  ws.on('close', cleanup); ws.on('error', cleanup);
});

setInterval(() => { for (const c of conns.values()) c.msgs = 0; }, 1000);
// heartbeat: drop dead sockets (phones that went to sleep)
setInterval(() => {
  for (const c of conns.values()) { if (!c.alive) { try { c.ws.terminate(); } catch (e) { /* */ } continue; } c.alive = false; try { c.ws.ping(); } catch (e) { /* */ } }
}, 15000);
// room GC
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (r.players.size === 0 && (!r.emptySince || now - r.emptySince > 30000)) rooms.delete(code);
    else if (r.humanCount() === 0 && now - r.lastActive > 120000) rooms.delete(code);
  }
}, 10000);

// fixed 60 Hz simulation loop for all active rooms (drift-correcting)
const STEP = 1000 / 60;
let acc = 0, last = process.hrtime.bigint();
let tickMs = 0, tickN = 0;
function loop() {
  const now = process.hrtime.bigint();
  acc += Number(now - last) / 1e6; last = now;
  if (acc > 250) acc = 250;
  while (acc >= STEP) {
    acc -= STEP;
    const t0 = process.hrtime.bigint();
    for (const r of rooms.values()) { try { r.update(); } catch (e) { console.error('room error', r.code, e); r.phase = PH.LOBBY; r.cars = []; } }
    tickMs += Number(process.hrtime.bigint() - t0) / 1e6; tickN++;
  }
  setTimeout(loop, 4);
}
loop();
setInterval(() => { if (process.env.DEBUG_STATS) console.log(`rooms=${rooms.size} conns=${conns.size} avgTick=${(tickMs / Math.max(1, tickN)).toFixed(3)}ms`); tickMs = 0; tickN = 0; }, 10000);

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Tiny Turbo server running: http://localhost:${PORT}`);
    const nets = require('os').networkInterfaces();
    for (const k of Object.keys(nets)) for (const a of nets[k]) if (a.family === 'IPv4' && !a.internal) console.log(`  on your network: http://${a.address}:${PORT}`);
  });
}
module.exports = { server, rooms, wss };
