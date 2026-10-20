// Online racing client: one WebSocket to the Belt Run server (Railway). Rooms by code, "find a
// racer" matchmaking, server-clock sync so both countdowns start together, live car snapshots.
const RAILWAY = 'wss://belt-run-production.up.railway.app/ws';
export function serverUrl() {
  const h = location.host, local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (/\.up\.railway\.app$/.test(h) || local) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + h + '/ws';
  return RAILWAY;   // Render site, iPhone app, previews: all race through the Railway server
}

export function createOnline() {
  const O = {
    ws: null, status: 'offline', room: null, queued: false, offset: 0, rtt: 0, error: null,
    listeners: new Set(), handlers: {},
  };
  const emit = () => { for (const f of O.listeners) try { f(O); } catch (e) { console.error(e); } };
  O.onChange = f => { O.listeners.add(f); return () => O.listeners.delete(f); };
  O.on = (type, f) => { O.handlers[type] = f; };
  O.send = m => { if (O.ws && O.ws.readyState === 1) { O.ws.send(JSON.stringify(m)); return true; } return false; };
  const samples = [];
  O.connect = (hello) => new Promise(resolve => {
    if (O.ws && O.ws.readyState <= 1) { if (O.ws.readyState === 1) { O.send({ t: 'hello', ...hello }); resolve(true); } else O.ws.addEventListener('open', () => resolve(true), { once: true }); return; }
    O.status = 'connecting'; O.error = null; emit();
    let ws;
    try { ws = new WebSocket(serverUrl()); } catch (e) { O.status = 'offline'; O.error = 'Could not reach the race server'; emit(); return resolve(false); }
    O.ws = ws;
    const t = setTimeout(() => { if (ws.readyState !== 1) { try { ws.close(); } catch {} O.status = 'offline'; O.error = 'Race server did not answer — check your connection'; emit(); resolve(false); } }, 8000);
    ws.onopen = () => {
      clearTimeout(t); O.status = 'online'; emit();
      O.send({ t: 'hello', ...hello });
      samples.length = 0;
      for (let i = 0; i < 5; i++) setTimeout(() => O.send({ t: 'ping', c: Date.now() }), i * 150);
      resolve(true);
    };
    ws.onclose = () => { clearTimeout(t); if (O.ws === ws) { O.ws = null; O.status = 'offline'; O.room = null; O.queued = false; emit(); O.handlers.closed?.(); } };
    ws.onerror = () => { O.error = 'Connection problem with the race server'; };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') {
        const now = Date.now(), rtt = now - m.c;
        samples.push({ rtt, off: m.s - (m.c + rtt / 2) });
        samples.sort((a, b) => a.rtt - b.rtt);
        O.offset = samples[0].off; O.rtt = samples[0].rtt; return;
      }
      if (m.t === 'room') { O.room = m.room; O.queued = false; }
      else if (m.t === 'queued') O.queued = true;
      else if (m.t === 'unqueued' || m.t === 'left') { O.queued = false; if (m.t === 'left') O.room = null; }
      else if (m.t === 'error') O.error = m.msg;
      O.handlers[m.t]?.(m);
      emit();
    };
  });
  O.disconnect = () => { try { O.ws?.close(); } catch {} O.ws = null; O.status = 'offline'; O.room = null; emit(); };
  // local performance.now() that corresponds to a server timestamp
  O.perfAt = serverMs => performance.now() + (serverMs - O.offset - Date.now());
  return O;
}

// ── live car snapshots ──
const F = ['x', 'v', 'a', 'gear', 'eOmega', 'wOmega', 'boost', 'slipV', 'wheelAngle', 'smoke', 'nosLeft'];
export function snapshot(race, car) {
  const st = car.st, s = { rt: +race.t.toFixed(3) };
  for (const k of F) s[k] = +(+st[k] || 0).toFixed(3);
  s.cl = st.clutch; s.sh = +st.shiftT.toFixed(3); s.lc = st.limiterCut ? 1 : 0; s.lh = st.launchHold ? 1 : 0; s.sp = st.spinning ? 1 : 0; s.n = st.nosOn ? 1 : 0;
  s.th = car.input.throttle ? 1 : 0; s.fin = car.finishT != null ? 1 : 0;
  return s;
}
// Remote car: same shape the renderer/audio expect from a simulated car, filled by interpolating
// snapshots ~120 ms in the past so motion stays smooth over a bumpy connection.
export function createRemoteCar(bc) {
  const st = { x: 0, v: 0, a: 0, gear: 0, eOmega: bc.idle * Math.PI / 30, wOmega: 0, boost: 0, slipV: 0, wheelAngle: 0, smoke: 0, nosLeft: bc.nosSeconds || 0,
    clutch: 'open', shiftT: 0, limiterCut: false, launchHold: false, spinning: false, nosOn: false };
  const buf = [];
  return {
    bc, st, input: { throttle: false }, finishT: null, remote: true, lastAt: 0,
    push(s) { if (buf.length && s.rt <= buf[buf.length - 1].rt) return; buf.push(s); if (buf.length > 60) buf.shift(); this.lastAt = performance.now(); },
    update(raceT) {
      if (!buf.length) return;
      const t = raceT - 0.12;
      let i = buf.findIndex(s => s.rt >= t);
      let a, b;
      if (i <= 0) { a = b = buf[i < 0 ? buf.length - 1 : 0]; }
      else { a = buf[i - 1]; b = buf[i]; }
      const k = b.rt > a.rt ? Math.max(0, Math.min(1, (t - a.rt) / (b.rt - a.rt))) : 1;
      const L = f => a[f] + (b[f] - a[f]) * k;
      // extrapolate a little past the newest snapshot if packets are late
      const newest = buf[buf.length - 1];
      if (i < 0) { const dt = Math.min(0.3, t - newest.rt); st.x = newest.x + newest.v * Math.max(0, dt); st.v = newest.v; }
      else { st.x = L('x'); st.v = L('v'); }
      st.a = b.a; st.gear = b.gear; st.eOmega = L('eOmega'); st.wOmega = L('wOmega'); st.boost = L('boost'); st.slipV = b.slipV; st.smoke = b.smoke; st.nosLeft = b.nosLeft;
      st.wheelAngle = b.wheelAngle; st.clutch = b.cl; st.shiftT = b.sh; st.limiterCut = !!b.lc; st.launchHold = !!b.lh; st.spinning = !!b.sp; st.nosOn = !!b.n;
      this.input.throttle = !!b.th;
      if (b.fin && this.finishT == null) this.finishT = raceT;
    },
  };
}
