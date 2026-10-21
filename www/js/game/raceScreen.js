// The race screen: fixed-step simulation (240 Hz) under a rAF render loop, touch controls,
// camera, HUD, messages and audio. Player and opponent use the same physics.
import { createRace, stepRace, setThrottle, setNitrous, shift, launchZone, shiftZone, DIST_LABEL, MS_TO_MPH } from '../sim/race.js';
import { SIM_DT, rpmOf } from '../sim/physics.js';
import { optimalShiftRpms, gearSpeeds } from '../sim/build.js';
import { drawCar, loadSprite, spriteMetrics, createMotion, stepMotion, preload } from '../render/sprites.js';
import { createScene, drawScene, layout, emitSmoke, drawSmoke, addMark } from '../render/scene.js';
import { drawGauge, drawBoost, drawProgress, drawLights, GAUGES, GAUGE_COLORS } from '../render/hud.js';
import * as Audio from '../audio/audio.js';
import { snapshot, createRemoteCar } from '../net/online.js';

const $ = id => document.getElementById(id);
const LAUNCH_MSG = { perfect: ['PERFECT LAUNCH', 'good'], good: ['GOOD LAUNCH', 'ok'], bog: ['BOGGED — TOO FEW REVS', 'bad'], spin: ['WHEELSPIN — TOO MANY REVS', 'bad'], roll: ['GO GO GO!', 'good'] };
const SHIFT_MSG = { perfect: ['PERFECT SHIFT', 'good'], good: ['GOOD SHIFT', 'ok'], early: ['EARLY SHIFT', 'bad'], late: ['LATE SHIFT', 'bad'] };

export function haptic(kind = 'light', settings) {
  if (settings && !settings.haptics) return;
  try {
    const H = window.Capacitor?.Plugins?.Haptics;
    if (H) { H.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' })?.catch?.(() => {}); return; }
    navigator.vibrate?.(kind === 'heavy' ? 40 : kind === 'medium' ? 22 : 12);
  } catch {}
}

export async function startRace({ player, opponent = null, opponents = [], distance = 'quarter', venue = 'ny', settings, seed = (Math.random() * 1e9) | 0, title = '', onFinish, onQuit, online = null, roll = 0, aiDial = 0 }) {
  // online = { net, opps: [{ seat, car, bc, name, look }], startPerf, seat }: rivals are other phones (up to
  // three); their cars are drawn from live snapshots instead of being simulated here, and the server
  // decides the finishing order. Offline, `opponents` adds extra AI lanes beside the main rival.
  const rivalDefs = online ? online.opps : [opponent, ...opponents].filter(Boolean);
  if (online) opponent = rivalDefs[0];
  const root = $('race'), canvas = $('race-canvas'), g = canvas.getContext('2d');
  root.hidden = false; document.body.classList.add('racing');
  $('race-title').textContent = title;
  $('race-dist').textContent = DIST_LABEL[distance];
  $('btn-nos').hidden = false;
  $('btn-nos').classList.toggle('empty', !(player.bc.nosSeconds > 0));
  $('btn-nos').classList.remove('on');
  $('race-msg').className = 'race-msg'; $('race-msg').textContent = 'LOADING…';
  await preload([player.car, ...rivalDefs.map(r => r.car)]);

  const race = createRace({ player: player.bc, opponent: online ? null : opponent?.bc || null, opponents: online ? [] : opponents.map(o => ({ bc: o.bc, ai: o.ai })), aiSkill: opponent?.ai || 3, distance, seed, roll, aiDial });
  const P = race.cars[0];
  // one entry per rival lane: lane 1 is next to you, lane 3 is the far side
  const rivals = rivalDefs.map((d, i) => ({ def: d, lane: i + 1, car: online ? createRemoteCar(d.bc) : race.cars[i + 1], motion: createMotion(), ms: spriteMetrics(d.car, loadSprite(d.car)) }));
  const bySeat = online ? Object.fromEntries(rivals.map(r => [r.def.seat, r])) : {};
  const O = rivals[0]?.car || null;
  const nearestRival = () => rivals.reduce((b, r) => !b || Math.abs(r.car.st.x - P.st.x) < Math.abs(b.car.st.x - P.st.x) ? r : b, null)?.car || null;
  const rivalName = online && rivals.length === 1 ? (rivals[0].def.name || 'RIVAL') : 'THE FIELD';
  let sentFinish = false, lastSend = -1, serverResult = null;
  if (online) {
    online.net.on('state', m => (bySeat[m.from] || rivals[0])?.car.push(m.s));
    online.net.on('rivalFinished', m => { if (P.finishT == null) msg(String(m.name || bySeat[m.from]?.def.name || 'RIVAL').toUpperCase() + ' FINISHED', 'bad', 1200); });
    online.net.on('result', m => { serverResult = m; });
  }
  window.__race = race;   // exposed for automated tests
  const scene = createScene(venue);
  const motion = createMotion();
  const ms0 = spriteMetrics(player.car, loadSprite(player.car));
  const anyAhead = () => rivals.some(r => r.car.finishT != null && (P.finishT == null || r.car.finishT < P.finishT));
  const shiftPts = optimalShiftRpms(player.bc);
  const vTop = Math.max(...gearSpeeds(player.bc));
  const gaugeMax = () => { const u = settings.units === 'kmh' ? vTop * 3.6 : vTop * MS_TO_MPH, st = u > 240 ? 40 : 20; return Math.max(st * 6, Math.ceil(u * 1.05 / st) * st); };
  let gaugeHit = null;
  let evIdx = 0, acc = 0, last = performance.now(), raf = 0, paused = false, alive = true, doneAt = 0, msgUntil = 0, gearFlashUntil = 0;
  let W = 0, H = 0, dpr = 1;
  const units = settings.units === 'kmh' ? 'km/h' : 'mph', toUnits = v => settings.units === 'kmh' ? v * 3.6 : v * MS_TO_MPH;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  function msg(text, cls = '', ms = 1100) { const m = $('race-msg'); m.textContent = text; m.className = 'race-msg show ' + cls; msgUntil = performance.now() + ms; }

  // ── input ──
  const gasBtn = $('btn-gas'), shiftBtn = $('btn-shift'), downBtn = $('btn-down'), nosBtn = $('btn-nos');
  const gas = on => { if (paused) on = false; setThrottle(race, on); gasBtn.classList.toggle('on', !!on); };
  // Nitrous is a tap-to-fire toggle (one thumb stays on GAS, the other taps SHIFT / N₂O).
  // It flows while the bottle lasts, in gear, on throttle, and not mid-shift; tap again to save the rest.
  const hasNos = player.bc.nosSeconds > 0;
  let nosArmed = false;
  const nos = on => { nosArmed = !!on && !paused && hasNos && P.st.nosLeft > 0; setNitrous(race, nosArmed); nosBtn.classList.toggle('on', nosArmed); };
  const nosTap = () => {
    if (paused) return;
    if (!hasNos) { msg('NO NITROUS — INSTALL IT IN UPGRADES', 'bad', 1500); return; }
    if (P.st.nosLeft <= 0) { msg('BOTTLE EMPTY', 'bad', 900); return; }
    nos(!nosArmed); haptic(nosArmed ? 'medium' : 'light', settings);
    if (nosArmed && (race.phase !== 'run' || P.st.gear === 0)) msg('N₂O ARMED — FIRES AFTER LAUNCH', 'ok', 1100);
  };
  const up = () => { if (paused) return; const r = shift(race, 1); if (r.ok) haptic('medium', settings); shiftBtn.classList.add('on'); setTimeout(() => shiftBtn.classList.remove('on'), 120); };
  const down = () => { if (paused) return; const r = shift(race, -1); if (r.ok) haptic('light', settings); };
  const hold = (el, fn) => {
    const onDown = e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch {} fn(true); };
    const onUp = e => { e.preventDefault(); fn(false); };
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); el.addEventListener('lostpointercapture', onUp);
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); el.removeEventListener('lostpointercapture', onUp); };
  };
  const tap = (el, fn) => { const h = e => { e.preventDefault(); fn(); }; el.addEventListener('pointerdown', h); return () => el.removeEventListener('pointerdown', h); };
  const keys = e => {
    if (e.repeat) return;
    const dn = e.type === 'keydown', k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w' || k === ' ') { gas(dn); e.preventDefault(); }
    else if (dn && (k === 'arrowright' || k === 'd' || k === 'e' || k === 'shift')) { up(); e.preventDefault(); }
    else if (dn && (k === 'arrowleft' || k === 'a' || k === 'q')) down();
    else if (dn && k === 'n') nosTap();
    else if (dn && k === 'escape') pause(!paused);
  };
  // tap the gauge to switch speedometer style (saved to settings)
  const gaugeTap = e => {
    if (!gaugeHit) return;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.hypot(x - gaugeHit.x, y - gaugeHit.y) > gaugeHit.r * 1.3) return;
    const keys = Object.keys(GAUGES); settings.gauge = keys[(keys.indexOf(settings.gauge || 'classic') + 1) % keys.length];
    msg(GAUGES[settings.gauge].toUpperCase(), 'ok', 700); haptic('light', settings);
    dispatchEvent(new CustomEvent('beltrun:settings'));
  };
  canvas.addEventListener('pointerdown', gaugeTap);
  const offs = [() => canvas.removeEventListener('pointerdown', gaugeTap), hold(gasBtn, gas), tap(nosBtn, nosTap), tap(shiftBtn, up), tap(downBtn, down), tap($('btn-pause'), () => pause(true))];
  addEventListener('keydown', keys); addEventListener('keyup', keys);
  const blur = () => { gas(false); nos(false); if (!online && (race.phase === 'run' || race.phase === 'countdown')) pause(true); };
  addEventListener('blur', blur);
  const vis = () => { if (document.hidden) blur(); };
  document.addEventListener('visibilitychange', vis);

  function pause(on) {
    paused = on; $('race-pause').hidden = !on;
    if (on) { gas(false); nos(false); }
    last = performance.now();
  }
  $('pause-resume').onclick = () => pause(false);
  $('pause-quit').onclick = () => { if (online && !sentFinish) { sentFinish = true; online.net.send({ t: 'finish', slip: {} }); } cleanup(); onQuit?.(); };
  $('race-pause').querySelector('h2').textContent = online ? 'ONLINE RACE — KEEPS RUNNING' : 'PAUSED';

  function cleanup() {
    if (!alive) return; alive = false;
    cancelAnimationFrame(raf); ro.disconnect();
    offs.forEach(f => f()); removeEventListener('keydown', keys); removeEventListener('keyup', keys); removeEventListener('blur', blur); document.removeEventListener('visibilitychange', vis);
    root.hidden = true; document.body.classList.remove('racing'); $('race-pause').hidden = true;
    Audio.frame({ mode: 'menu' });
  }

  function handleEvents() {
    for (; evIdx < race.events.length; evIdx++) {
      const e = race.events[evIdx];
      if (e.type === 'light') { Audio.beep(false); msg(race.roll && e.n === 3 ? 'ROLLING AT 40 — FLOOR IT ON GREEN' : String(e.n), race.roll && e.n === 3 ? 'ok' : 'count', 850); }
      else if (e.type === 'go') { Audio.beep(true); }
      else if (e.type === 'launch' && e.car === 'player') { const [t, c] = LAUNCH_MSG[e.q]; msg(t, c, 1300); haptic(e.q === 'perfect' ? 'heavy' : 'medium', settings); }
      else if (e.type === 'shift' && e.car === 'player') { const [t, c] = SHIFT_MSG[e.q]; msg(t, c, 900); gearFlashUntil = performance.now() + 400; }
      else if (e.type === 'overrev' && e.car === 'player') msg('TOO FAST TO DOWNSHIFT', 'bad', 900);
      else if (e.type === 'finish' && e.car === 'player' && online) { gas(false); nos(false); const beaten = anyAhead(); msg(beaten ? 'BEATEN' : 'FINISH!', beaten ? 'bad' : 'good', 1500); }
      else if (e.type === 'finish' && e.car === 'player') { gas(false); nos(false); const ahead = rivals.filter(r => r.car.finishT != null && r.car.finishT < P.finishT).length; msg(!rivals.length ? 'FINISH' : ahead === 0 ? 'WINNER!' : rivals.length > 1 ? ['', '', '2ND PLACE', '3RD PLACE', '4TH PLACE'][ahead + 1] : 'BEATEN', ahead === 0 ? 'good' : 'bad', 2500); }
      else if (e.type === 'result') {
        if (!online) doneAt = performance.now();
        else if (!sentFinish) { sentFinish = true; const p = race.result.player; online.net.send({ t: 'finish', slip: { et: p.et, trap: p.trap, ft60: p.ft60, launch: p.launch?.q, perfectShifts: p.perfectShifts, shifts: p.shifts } }); if (!serverResult) msg('WAITING FOR ' + rivalName.toUpperCase() + '…', 'ok', 90000); }
      }
    }
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused && !online) dt = 0;
    if (online && now < online.startPerf) {           // both phones start the countdown together
      dt = 0; const s = Math.ceil((online.startPerf - now) / 1000);
      $('race-msg').textContent = (rivals.length > 1 ? rivals.length + 1 + '-LANE RACE' : 'VS ' + rivalName.toUpperCase()) + ' · ' + s; $('race-msg').className = 'race-msg show ok'; msgUntil = now + 200;
    }
    acc += dt;
    while (acc >= SIM_DT) {
      if (settings.autoShift && race.phase === 'run' && P.finishT == null) {
        const st = P.st, rpm = rpmOf(st);
        if (st.gear > 0 && st.gear < player.bc.ratios.length && st.shiftT === 0 && st.clutch === 'lock' && rpm >= shiftPts[st.gear - 1]) shift(race, 1);
      }
      stepRace(race, SIM_DT); acc -= SIM_DT;
      // keep running after the result so cars roll through the finish
    }
    if (nosArmed && P.st.nosLeft <= 0) { nos(false); nosBtn.classList.add('empty'); }
    if (online) {
      for (const r of rivals) r.car.update(race.t);
      if (dt > 0 && race.t - lastSend >= 0.05) { lastSend = race.t; online.net.send({ t: 'state', s: snapshot(race, P) }); }
      if (serverResult && race.finished && !doneAt) {
        const me = online.seat, r = serverResult.results || [], order = serverResult.order || [], names = serverResult.names || [];
        const otherSeats = order.filter(i => i !== me), bestOther = otherSeats[0], opp = r[bestOther];
        const place = order.indexOf(me) + 1 || order.length;
        race.result.winner = serverResult.winner === me ? 'player' : 'ai';
        race.result.place = place; race.result.field = order.length;
        race.result.opponent = opp ? { et: opp.et, trap: opp.trap, ft60: opp.ft60 } : { et: null };
        race.result.margin = opp?.et && P.et ? Math.abs(opp.et - P.et) : null;
        race.result.rivals = otherSeats.map(i => ({ name: names[i], et: r[i]?.et ?? null }));
        race.result.online = { rival: serverResult.winner === me ? names[bestOther] : names[serverResult.winner] ?? names[bestOther], winner: serverResult.winner, me, place, field: order.length };
        msg(race.result.winner === 'player' ? 'YOU WIN!' : order.length > 2 ? ['', '', '2ND PLACE', '3RD PLACE', '4TH PLACE'][place] || 'YOU LOSE' : 'YOU LOSE', race.result.winner === 'player' ? 'good' : 'bad', 2000);
        doneAt = performance.now();
      }
    }
    handleEvents();
    render(dt);
    const mode = race.phase === 'run' || race.phase === 'finished' ? 'race' : 'stage';
    Audio.frame({ mode: doneAt && now - doneAt > 2500 ? 'menu' : mode, player: P, rival: nearestRival() || O, dt });
    if (performance.now() > msgUntil) $('race-msg').classList.remove('show');
    if (doneAt && now - doneAt > 1600) { cleanup(); if (online) { online.net.on('state', null); online.net.on('result', null); online.net.on('rivalFinished', null); } onFinish?.(race); }
  }

  function render(dt) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const nLanes = Math.max(2, 1 + rivals.length), Lay = layout(W, H, nLanes);
    const carW = Math.min(W * 0.30, H * 0.72);
    const ppm = ms0 ? carW / ms0.lengthM : 60;
    const anchorX = W * 0.45 + Math.min(W * 0.03, P.st.v * 0.25);
    const cam = { x: P.st.x, anchorX, ppm, distM: race.distM, lanes: nLanes };
    drawScene(g, scene, W, H, dpr, cam);

    const liveRun = race.phase === 'run' || race.phase === 'finished';
    // rivals, farthest lane first so nearer cars overlap them
    for (let k = rivals.length - 1; k >= 0; k--) {
      const R = rivals[k], Oc = R.car, ln = Lay.lanes[R.lane];
      stepMotion(R.motion, Oc.st, dt, liveRun, Oc.bc.r);
      const fp = ppm * ln.scale, ow = (R.ms ? R.ms.lengthM : 4.7) * fp;
      const ox = anchorX + (Oc.st.x - P.st.x) * fp - ow / 2;   // world x = front bumper
      if (ox > -ow && ox < W + ow) {
        const info = drawCar(g, R.def.car, ox, ln.ground, ow, { motion: R.motion, nos: Oc.st.nosOn, look: R.def.look });
        if (info && (Oc.st.smoke > 0.05) && dt > 0) emitSmoke(scene, info.driveX, ln.ground - 2, Oc.st.smoke * (0.4 + Math.min(1, (Oc.st.slipV || 0) / 6)), Oc.st.v * fp, ln.scale);
        if (info && Oc.st.spinning && dt > 0) { const wx = Oc.st.x + (info.driveX - (ox + ow / 2)) / fp; addMark(scene, R.lane, wx - Oc.st.v * dt, wx, 0.25 + Math.min(0.5, (Oc.st.slipV || 0) / 8)); }
        if (online && R.def.name && liveRun === false) { g.save(); g.font = `800 ${Math.round(11 + 3 * ln.scale)}px "Barlow Condensed",sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.55)'; const tw = g.measureText(R.def.name).width + 12; const ly = ln.ground - ow * 0.36; g.fillRect(ox - tw / 2, ly - 16, tw, 16); g.fillStyle = '#fff'; g.fillText(R.def.name, ox, ly - 4); g.restore(); }
      }
    }
    stepMotion(motion, P.st, dt, liveRun, P.bc.r);
    drawSmoke(g, scene, dt, P.st.v * ppm * dt);
    const info = drawCar(g, player.car, anchorX - carW / 2, Lay.nearGround, carW, { motion, nos: P.st.nosOn, look: player.look });
    if (info && P.st.smoke > 0.05 && dt > 0) emitSmoke(scene, info.driveX, Lay.nearGround - 2, P.st.smoke * (0.5 + Math.min(1.2, (P.st.slipV || 0) / 5)), P.st.v * ppm);
    if (info && P.st.spinning && dt > 0) { const wx = P.st.x + (info.driveX - anchorX) / ppm; addMark(scene, 0, wx - P.st.v * dt, wx, 0.3 + Math.min(0.45, (P.st.slipV || 0) / 8)); }
    if (P.st.spinning && P.st.slipV > 0.8 && race.phase === 'run') { g.save(); g.font = '900 13px "Barlow Condensed",sans-serif'; const tw = Math.min(110, W * 0.12), Rr = Math.min(H * 0.19, W * 0.11), tx0 = W * 0.58 - Rr * 1.15 - tw, ty0 = H - (player.bc.nosSeconds > 0 ? 80 : 58); g.fillStyle = 'rgba(255,59,48,.92)'; g.beginPath(); g.roundRect ? g.roundRect(tx0, ty0, tw, 20, 6) : g.rect(tx0, ty0, tw, 20); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WHEELSPIN', tx0 + tw / 2, ty0 + 11); g.restore(); }
    // HUD
    const rpm = rpmOf(P.st), bc = player.bc;
    let zone = null, shiftFrac = 0;
    if ((race.phase === 'countdown' || race.phase === 'staging') && !race.roll) { zone = launchZone(bc); shiftFrac = Math.max(0, Math.min(1, (rpm - bc.idle) / Math.max(1, zone.lo - bc.idle))); }
    else if (P.st.gear > 0 && P.st.gear < bc.ratios.length && P.finishT == null) { zone = shiftZone(bc, P.st.gear); shiftFrac = Math.max(0, Math.min(1, (rpm - (zone.lo - 1800)) / 1800)); }
    const R = Math.min(H * 0.19, W * 0.11), tx = W * 0.58;
    gaugeHit = { x: tx, y: H - R - 8, r: R };
    drawGauge(g, tx, H - R - 8, R, { style: settings.gauge, accent: GAUGE_COLORS[settings.gaugeColor] || undefined, maxSpeed: gaugeMax(), rpm, limiter: bc.limiter, zone, zonePerfect: zone && rpm >= zone.lo && rpm <= zone.hi, gear: P.st.gear, speed: toUnits(P.st.v), units, shiftFrac, gearFlash: performance.now() < gearFlashUntil });
    if (bc.boosted) drawBoost(g, tx - R * 1.15 - Math.min(110, W * 0.12), H - 30, Math.min(110, W * 0.12), 16, P.st.boost, 'BOOST');
    if (bc.nosSeconds > 0) drawBoost(g, tx - R * 1.15 - Math.min(110, W * 0.12), H - 52, Math.min(110, W * 0.12), 16, P.st.nosLeft / bc.nosSeconds, 'N₂O');
    if (race.phase !== 'run' || race.t - race.goAt < 1.5) drawLights(g, W / 2, 62, race.lights, race.phase);
    const tRun = race.goAt != null ? (P.finishT != null ? P.et : race.t - race.goAt) : 0;
    $('race-timer').textContent = tRun.toFixed(3);
    drawProgress(g, W * 0.30, 16, W * 0.40, P.st.x / race.distM, rivals.map(r => r.car.st.x / race.distM), null);
  }

  last = performance.now();
  raf = requestAnimationFrame(frame);
  return { race, quit: () => { cleanup(); }, pause };
}
