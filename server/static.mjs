// Belt Run server (Railway): serves www/ and runs online head-to-head drag races over WebSocket (/ws).
// Each phone simulates its own car with the shared physics; the server pairs racers, starts both
// countdowns at the same instant, relays live car positions, and decides the winner from both
// time slips. Rooms live in memory (a race lasts seconds; nothing needs to survive a restart).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self' wss: ws:; worker-src 'self'; media-src 'self' blob:";

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size, online: wss.clients.size })); }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file);
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'content-length': st.size,
      'cache-control': ext === '.html' || p === '/sw.js' ? 'no-cache' : 'public, max-age=86400',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' };
    if (ext === '.html') headers['content-security-policy'] = CSP;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

// ───────────────────────── online racing ─────────────────────────
const rooms = new Map();          // code -> room
let waiting = null;               // socket waiting for "Find a racer"
const DISTANCES = ['eighth', 'quarter', 'half'], VENUES = ['ny', 'fl', 'ga', 'tx', 'ja'];
const KEYS = ['engine', 'power', 'intake', 'nitrous', 'body', 'tires', 'gearbox'];

const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const clean = (s, n = 16) => String(s ?? '').replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, n);
function cleanCar(c) {
  if (!c || typeof c !== 'object' || !/^[A-Za-z0-9]{2,20}$/.test(String(c.id))) return null;
  const lv = {}; for (const k of KEYS) lv[k] = Math.max(0, Math.min(5, (c.lv?.[k] | 0)));
  const t = c.tune || {}, num = (v, a, b) => Number.isFinite(+v) ? Math.max(a, Math.min(b, +v)) : undefined;
  const tune = { launchRpm: num(t.launchRpm, 1000, 12000), tirePsi: num(t.tirePsi, 10, 45), final: num(t.final, 1, 8), nosSeconds: num(t.nosSeconds, 0, 10), tc: ['street', 'sport', 'off'].includes(t.tc) ? t.tc : 'sport',
    gears: Array.isArray(t.gears) ? t.gears.slice(0, 10).map(g => num(g, 0.3, 7) ?? 1) : undefined };
  return { id: String(c.id), lv, tune, hp: num(c.hp, 0, 5000) || 0 };
}
function newCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c; do { c = Array.from(crypto.randomBytes(4), b => A[b % A.length]).join(''); } while (rooms.has(c)); return c; }

function roomView(room, seat) {
  return { t: 'room', room: { code: room.code, you: seat, host: 0, status: room.status, distance: room.distance, venue: room.venue,
    players: room.seats.map(p => p && { name: p.name, car: p.car, ready: p.ready, connected: p.ws?.readyState === 1, wins: p.wins }) } };
}
function broadcastRoom(room) { room.seats.forEach((p, i) => p && send(p.ws, roomView(room, i))); }

function makeRoom(ws) {
  const room = { code: newCode(), seats: [null, null], status: 'lobby', distance: 'quarter', venue: 'ny', results: [null, null], timer: null, created: Date.now() };
  rooms.set(room.code, room);
  return room;
}
function seatPlayer(room, ws, i) {
  room.seats[i] = { ws, name: ws.name || 'Racer', car: ws.car, ready: false, wins: 0 };
  ws.room = room; ws.seat = i;
}
function leave(ws, why = 'left') {
  if (waiting === ws) waiting = null;
  const room = ws.room; if (!room) return;
  ws.room = null;
  const i = ws.seat, other = room.seats[1 - i];
  if (room.status === 'racing') {
    // Mid-race: the other racer still gets a result; this seat is a DNF.
    room.seats[i].ws = null; room.seats[i].gone = true;
    maybeFinish(room);
  } else room.seats[i] = null;
  if (other) send(other.ws, { t: 'notice', msg: why === 'left' ? 'Your rival left the room' : 'Your rival disconnected' });
  if (!room.seats.some(p => p && p.ws)) { clearTimeout(room.timer); rooms.delete(room.code); return; }
  if (room.status !== 'racing') { room.status = 'lobby'; if (room.seats[0] == null && room.seats[1]) { room.seats[0] = room.seats[1]; room.seats[1] = null; room.seats[0].ws.seat = 0; } }
  broadcastRoom(room);
}
function tryStart(room) {
  if (room.status !== 'lobby' || !room.seats.every(p => p && p.ready && p.ws?.readyState === 1)) return;
  room.status = 'racing'; room.results = [null, null];
  const at = Date.now() + 3500, seed = crypto.randomInt(1, 1e9);
  room.seats.forEach((p, i) => { p.ready = false; p.gone = false; send(p.ws, { t: 'start', at, seed, seat: i, distance: room.distance, venue: room.venue, players: room.seats.map(q => ({ name: q.name, car: q.car })) }); });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => finishRoom(room), 3500 + 60_000);   // nobody takes a minute for a half mile
}
function maybeFinish(room) {
  if (room.status !== 'racing') return;
  if (room.seats.every((p, i) => room.results[i] || !p || p.gone)) finishRoom(room);
}
function finishRoom(room) {
  if (room.status !== 'racing') return;
  clearTimeout(room.timer);
  room.status = 'lobby';
  const et = i => room.results[i]?.et ?? Infinity;
  const winner = et(0) === Infinity && et(1) === Infinity ? -1 : et(0) <= et(1) ? 0 : 1;
  if (winner >= 0 && room.seats[winner]) room.seats[winner].wins++;
  room.seats.forEach(p => p && p.ws && send(p.ws, { t: 'result', results: room.results, winner }));
  for (let i = 0; i < 2; i++) if (room.seats[i]?.gone) room.seats[i] = null;
  if (!room.seats.some(p => p && p.ws)) rooms.delete(room.code); else broadcastRoom(room);
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
wss.on('connection', ws => {
  ws.alive = true; ws.name = 'Racer'; ws.car = null;
  let tokens = 60; const refill = setInterval(() => { tokens = Math.min(60, tokens + 30); }, 1000);
  ws.on('pong', () => { ws.alive = true; });
  ws.on('close', () => { clearInterval(refill); leave(ws, 'disconnected'); });
  ws.on('message', raw => {
    if (--tokens < 0) return;                                   // flood guard (states are sent ~20/s)
    let m; try { m = JSON.parse(raw); } catch { return; }
    const room = ws.room;
    switch (m.t) {
      case 'ping': return send(ws, { t: 'pong', c: m.c, s: Date.now() });
      case 'hello': ws.name = clean(m.name) || 'Racer'; ws.car = cleanCar(m.car); return;
      case 'car': ws.car = cleanCar(m.car); if (room && room.status === 'lobby') { room.seats[ws.seat].car = ws.car; room.seats[ws.seat].ready = false; broadcastRoom(room); } return;
      case 'create': { leave(ws); if (!ws.car) return send(ws, { t: 'error', msg: 'Pick a car first' }); const r = makeRoom(); seatPlayer(r, ws, 0); return broadcastRoom(r); }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return send(ws, { t: 'error', msg: 'No room with that code' });
        if (r === room) return broadcastRoom(r);
        const free = r.seats.findIndex(s => !s);
        if (free < 0 || r.status !== 'lobby') return send(ws, { t: 'error', msg: 'That room is full' });
        if (!ws.car) return send(ws, { t: 'error', msg: 'Pick a car first' });
        leave(ws); seatPlayer(r, ws, free); return broadcastRoom(r);
      }
      case 'queue': {
        if (room) leave(ws);
        if (!ws.car) return send(ws, { t: 'error', msg: 'Pick a car first' });
        if (waiting && waiting !== ws && waiting.readyState === 1) {
          const r = makeRoom(); seatPlayer(r, waiting, 0); seatPlayer(r, ws, 1); waiting = null; return broadcastRoom(r);
        }
        waiting = ws; return send(ws, { t: 'queued' });
      }
      case 'unqueue': if (waiting === ws) waiting = null; return send(ws, { t: 'unqueued' });
      case 'leave': leave(ws); return send(ws, { t: 'left' });
      case 'settings':
        if (!room || ws.seat !== 0 || room.status !== 'lobby') return;
        if (DISTANCES.includes(m.distance)) room.distance = m.distance;
        if (VENUES.includes(m.venue)) room.venue = m.venue;
        room.seats.forEach(p => p && (p.ready = false));
        return broadcastRoom(room);
      case 'ready':
        if (!room || room.status !== 'lobby') return;
        if (m.car) { const c = cleanCar(m.car); if (c) ws.car = room.seats[ws.seat].car = c; }
        room.seats[ws.seat].ready = !!m.ready; broadcastRoom(room); return tryStart(room);
      case 'state': { if (!room || room.status !== 'racing') return; const o = room.seats[1 - ws.seat]; if (o) send(o.ws, { t: 'state', s: m.s }); return; }
      case 'finish': {
        if (!room || room.status !== 'racing' || room.results[ws.seat]) return;
        const s = m.slip || {}, n = v => Number.isFinite(+v) && +v > 0 && +v < 120 ? +v : null;
        room.results[ws.seat] = { et: n(s.et), trap: n(s.trap), ft60: n(s.ft60), launch: clean(s.launch, 8), perfectShifts: s.perfectShifts | 0, shifts: s.shifts | 0 };
        if (room.results[ws.seat].et == null) room.results[ws.seat] = { et: null, dnf: true };
        const o = room.seats[1 - ws.seat]; if (o) send(o.ws, { t: 'rivalFinished', et: room.results[ws.seat].et });
        return maybeFinish(room);
      }
    }
  });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 15000).unref();
setInterval(() => { const now = Date.now(); for (const [c, r] of rooms) if (!r.seats.some(p => p && p.ws) || now - r.created > 6 * 3600e3) rooms.delete(c); }, 60000).unref();

server.listen(Number(process.env.PORT || 8080), () => console.log('Belt Run (web + online racing) on', process.env.PORT || 8080));
