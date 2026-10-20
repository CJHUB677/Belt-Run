// The race screen: fixed-step simulation (240 Hz) under a rAF render loop, touch controls,
// camera, HUD, messages and audio. Player and opponent use the same physics.
import { createRace, stepRace, setThrottle, setNitrous, shift, launchZone, shiftZone, DIST_LABEL, MS_TO_MPH } from '../sim/race.js';
import { SIM_DT, rpmOf } from '../sim/physics.js';
import { optimalShiftRpms } from '../sim/build.js';
import { drawCar, loadSprite, spriteMetrics, createMotion, stepMotion, preload } from '../render/sprites.js';
import { createScene, drawScene, layout, emitSmoke, drawSmoke } from '../render/scene.js';
import { drawTach, drawBoost, drawProgress, drawLights } from '../render/hud.js';
import * as Audio from '../audio/audio.js';

const $ = id => document.getElementById(id);
const LAUNCH_MSG = { perfect: ['PERFECT LAUNCH', 'good'], good: ['GOOD LAUNCH', 'ok'], bog: ['BOGGED — TOO FEW REVS', 'bad'], spin: ['WHEELSPIN — TOO MANY REVS', 'bad'] };
const SHIFT_MSG = { perfect: ['PERFECT SHIFT', 'good'], good: ['GOOD SHIFT', 'ok'], early: ['EARLY SHIFT', 'bad'], late: ['LATE SHIFT', 'bad'] };

export function haptic(kind = 'light', settings) {
  if (settings && !settings.haptics) return;
  try {
    const H = window.Capacitor?.Plugins?.Haptics;
    if (H) { H.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' })?.catch?.(() => {}); return; }
    navigator.vibrate?.(kind === 'heavy' ? 40 : kind === 'medium' ? 22 : 12);
  } catch {}
}

export async function startRace({ player, opponent = null, distance = 'quarter', venue = 'ny', settings, seed = (Math.random() * 1e9) | 0, title = '', onFinish, onQuit }) {
  const root = $('race'), canvas = $('race-canvas'), g = canvas.getContext('2d');
  root.hidden = false; document.body.classList.add('racing');
  $('race-title').textContent = title;
  $('race-dist').textContent = DIST_LABEL[distance];
  $('btn-nos').hidden = !(player.bc.nosSeconds > 0);
  $('race-msg').className = 'race-msg'; $('race-msg').textContent = 'LOADING…';
  await preload([player.car, ...(opponent ? [opponent.car] : [])]);

  const race = createRace({ player: player.bc, opponent: opponent?.bc || null, aiSkill: opponent?.ai || 3, distance, seed });
  const P = race.cars[0], O = race.cars[1] || null;
  window.__race = race;   // exposed for automated tests
  const scene = createScene(venue);
  const motions = [createMotion(), createMotion()];
  const ms = [spriteMetrics(player.car, loadSprite(player.car)), opponent ? spriteMetrics(opponent.car, loadSprite(opponent.car)) : null];
  const shiftPts = optimalShiftRpms(player.bc);
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
  const nos = on => { setNitrous(race, on && !paused); nosBtn.classList.toggle('on', !!on); };
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
    else if (k === 'n') nos(dn);
    else if (dn && k === 'escape') pause(!paused);
  };
  const offs = [hold(gasBtn, gas), hold(nosBtn, nos), tap(shiftBtn, up), tap(downBtn, down), tap($('btn-pause'), () => pause(true))];
  addEventListener('keydown', keys); addEventListener('keyup', keys);
  const blur = () => { gas(false); nos(false); if (race.phase === 'run' || race.phase === 'countdown') pause(true); };
  addEventListener('blur', blur);
  const vis = () => { if (document.hidden) blur(); };
  document.addEventListener('visibilitychange', vis);

  function pause(on) {
    paused = on; $('race-pause').hidden = !on;
    if (on) { gas(false); nos(false); }
    last = performance.now();
  }
  $('pause-resume').onclick = () => pause(false);
  $('pause-quit').onclick = () => { cleanup(); onQuit?.(); };

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
      if (e.type === 'light') { Audio.beep(false); msg(String(e.n), 'count', 850); }
      else if (e.type === 'go') { Audio.beep(true); }
      else if (e.type === 'launch' && e.car === 'player') { const [t, c] = LAUNCH_MSG[e.q]; msg(t, c, 1300); haptic(e.q === 'perfect' ? 'heavy' : 'medium', settings); }
      else if (e.type === 'shift' && e.car === 'player') { const [t, c] = SHIFT_MSG[e.q]; msg(t, c, 900); gearFlashUntil = performance.now() + 400; }
      else if (e.type === 'overrev' && e.car === 'player') msg('TOO FAST TO DOWNSHIFT', 'bad', 900);
      else if (e.type === 'finish' && e.car === 'player') { gas(false); nos(false); msg(O && O.finishT == null ? 'WINNER!' : O ? (O.finishT < P.finishT ? 'BEATEN' : 'WINNER!') : 'FINISH', O && O.finishT != null && O.finishT < P.finishT ? 'bad' : 'good', 2500); }
      else if (e.type === 'result') doneAt = performance.now();
    }
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (paused) dt = 0;
    acc += dt;
    while (acc >= SIM_DT) {
      if (settings.autoShift && race.phase === 'run' && P.finishT == null) {
        const st = P.st, rpm = rpmOf(st);
        if (st.gear > 0 && st.gear < player.bc.ratios.length && st.shiftT === 0 && st.clutch === 'lock' && rpm >= shiftPts[st.gear - 1]) shift(race, 1);
      }
      stepRace(race, SIM_DT); acc -= SIM_DT;
      // keep running after the result so cars roll through the finish
    }
    handleEvents();
    render(dt);
    const mode = race.phase === 'run' || race.phase === 'finished' ? 'race' : 'stage';
    Audio.frame({ mode: doneAt && now - doneAt > 2500 ? 'menu' : mode, player: P, rival: O, dt });
    if (performance.now() > msgUntil) $('race-msg').classList.remove('show');
    if (doneAt && now - doneAt > 1600) { cleanup(); onFinish?.(race); }
  }

  function render(dt) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const Lay = layout(W, H);
    const carW = Math.min(W * 0.30, H * 0.72);
    const ppm = ms[0] ? carW / ms[0].lengthM : 60;
    const anchorX = W * 0.45 + Math.min(W * 0.03, P.st.v * 0.25);
    const cam = { x: P.st.x, anchorX, ppm, distM: race.distM };
    drawScene(g, scene, W, H, dpr, cam);

    const liveRun = race.phase === 'run' || race.phase === 'finished';
    // opponent, far lane
    if (O) {
      stepMotion(motions[1], O.st, dt, liveRun, O.bc.r);
      const fp = ppm * Lay.farScale, ow = (ms[1] ? ms[1].lengthM : 4.7) * fp;
      const ox = anchorX + (O.st.x - P.st.x) * fp - ow / 2;   // world x = front bumper
      if (ox > -ow && ox < W + ow) {
        const info = drawCar(g, opponent.car, ox, Lay.farGround, ow, { motion: motions[1], nos: O.st.nosOn });
        if (info && (O.st.smoke > 0.05) && dt > 0) emitSmoke(scene, info.rearX, Lay.farGround - 2, O.st.smoke * 0.6, O.st.v * fp);
      }
    }
    stepMotion(motions[0], P.st, dt, liveRun, P.bc.r);
    drawSmoke(g, scene, dt, P.st.v * ppm * dt);
    const info = drawCar(g, player.car, anchorX - carW / 2, Lay.nearGround, carW, { motion: motions[0], nos: P.st.nosOn });
    if (info && P.st.smoke > 0.05 && dt > 0) emitSmoke(scene, info.rearX, Lay.nearGround - 2, P.st.smoke, P.st.v * ppm);
    // HUD
    const rpm = rpmOf(P.st), bc = player.bc;
    let zone = null, shiftFrac = 0;
    if (race.phase === 'countdown' || race.phase === 'staging') { zone = launchZone(bc); shiftFrac = Math.max(0, Math.min(1, (rpm - bc.idle) / Math.max(1, zone.lo - bc.idle))); }
    else if (P.st.gear > 0 && P.st.gear < bc.ratios.length && P.finishT == null) { zone = shiftZone(bc, P.st.gear); shiftFrac = Math.max(0, Math.min(1, (rpm - (zone.lo - 1800)) / 1800)); }
    const R = Math.min(H * 0.19, W * 0.11), tx = W * 0.58;
    drawTach(g, tx, H - R - 8, R, { rpm, limiter: bc.limiter, zone, zonePerfect: zone && rpm >= zone.lo && rpm <= zone.hi, gear: P.st.gear, speed: toUnits(P.st.v), units, shiftFrac, gearFlash: performance.now() < gearFlashUntil });
    if (bc.boosted) drawBoost(g, tx - R * 1.15 - Math.min(110, W * 0.12), H - 30, Math.min(110, W * 0.12), 16, P.st.boost, 'BOOST');
    if (bc.nosSeconds > 0) drawBoost(g, tx - R * 1.15 - Math.min(110, W * 0.12), H - 52, Math.min(110, W * 0.12), 16, P.st.nosLeft / bc.nosSeconds, 'N₂O');
    if (race.phase !== 'run' || race.t - race.goAt < 1.5) drawLights(g, W / 2, 62, race.lights, race.phase);
    const tRun = race.goAt != null ? (P.finishT != null ? P.et : race.t - race.goAt) : 0;
    $('race-timer').textContent = tRun.toFixed(3);
    drawProgress(g, W * 0.30, 16, W * 0.40, P.st.x / race.distM, O ? O.st.x / race.distM : null, null);
  }

  last = performance.now();
  raf = requestAnimationFrame(frame);
  return { race, quit: () => { cleanup(); }, pause };
}
