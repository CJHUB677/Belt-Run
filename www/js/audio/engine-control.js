// Turns the racing simulation's state into audio controls, every animation frame.
// Pure logic (no Web Audio), so it is unit-tested in Node.
//
// Inputs come straight from the game: physics state `s` (rpm, gear, cut, spin, v, finish),
// the throttle input, and the race mode ('idle' | 'count' | 'race' | 'done').
// Outputs: { rpm, throttle, load, cut, limiter, launch, boost, slip, speed, on } plus one-shot
// events: 'shift-up' / 'shift-down' (gear change), 'bov' (boost dumped), 'limiter' (hit).
(function (root) {
  'use strict';
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function createTracker(profile) {
    return { profile, boost: 0, prevGear: null, prevThrottle: 0, prevCut: 0, rpm: profile ? profile.idle : 800, onLimiter: false, coastRpm: null };
  }

  /**
   * @param tr tracker from createTracker(profile)
   * @param car roster car (uses red)
   * @param s physics state from Physics.state()/step()
   * @param ctx { gas:boolean, mode:string, dt:number, launchRpm:number }
   */
  function update(tr, car, s, ctx) {
    const p = tr.profile, ind = p.ind || { type: 'na' }, dt = Math.max(0, Math.min(0.1, ctx.dt || 0));
    const events = [];
    const gas = !!ctx.gas, mode = ctx.mode;
    let rpm, throttle = gas ? 1 : 0, load = 0, cut = 0, limiter = 0, launch = 0, on = 1, slip = 0;

    if (mode === 'idle') {
      // Menus / garage: engine is off (fades out).
      rpm = p.idle; throttle = 0; on = 0;
    } else if (mode === 'count') {
      // Staging: car is in neutral. Throttle free-revs against launch control (2-step) — no load.
      rpm = Math.max(p.idle, s.rpm);
      load = 0;
      launch = gas && s.rpm >= (ctx.launchRpm || 0) - 50 ? 1 : 0;
    } else if (mode === 'race' && s.finish === null) {
      rpm = Math.max(p.idle, s.rpm);
      cut = s.cut > 0 ? 1 : 0;
      limiter = gas && s.rpm >= car.red ? 1 : 0;
      // On-load when the throttle is open, ignition is live and the engine is driving the wheels.
      load = gas && !cut && !limiter ? 1 : 0;
      slip = gas ? Math.min(1, s.spin * 1.6) : 0;
    } else {
      // Finished / aborted: lift off and coast down toward idle (overrun).
      if (tr.coastRpm === null) tr.coastRpm = Math.max(p.idle, s.rpm);
      tr.coastRpm = Math.max(p.idle, tr.coastRpm - 2600 * dt);
      rpm = tr.coastRpm; throttle = 0; load = 0;
    }
    if (mode === 'race' || mode === 'count') tr.coastRpm = null;

    // ── Boost model (audio only; uses the same spool window as the physics torque curve) ──
    let target = 0;
    if (ind.type === 'turbo') {
      const sp = ind.spool || [1500, 2800];
      const spool = smooth(sp[0] * 0.8, sp[1], rpm);
      if (mode === 'race' && load) target = spool;
      else if (mode === 'count' && launch) target = 0.35 * spool + 0.15; // anti-lag-ish pre-spool on the line
      const rate = target > tr.boost ? (ind.rate || 6) * (0.25 + 0.75 * spool) : 9;
      tr.boost += (target - tr.boost) * (1 - Math.exp(-rate * dt));
      // Throttle lift or ignition cut with real boost dumps it → blow-off / flutter.
      const dumped = tr.boost > 0.42 && ((tr.prevThrottle && !gas) || (!tr.prevCut && cut));
      if (dumped) { events.push({ type: 'bov', level: Math.min(1, tr.boost * (cut ? 0.7 : 1.1)), kind: ind.bov }); tr.boost *= cut ? 0.55 : 0.15; }
    } else if (ind.type === 'sc') {
      tr.boost = throttle * Math.min(1, rpm / car.red); // positive displacement: boost follows rpm instantly
    }

    // ── Gear-change events (rev drop itself comes from the physics rpm) ──
    if (mode === 'race' && tr.prevGear !== null && s.gear !== tr.prevGear) events.push({ type: s.gear > tr.prevGear ? 'shift-up' : 'shift-down', gear: s.gear });
    if (limiter && !tr.onLimiter) events.push({ type: 'limiter' });
    tr.onLimiter = !!limiter;
    tr.prevGear = mode === 'race' ? s.gear : null;
    tr.prevThrottle = gas ? 1 : 0; tr.prevCut = cut;
    tr.rpm = rpm;
    return { c: { rpm, throttle, load, cut, limiter, launch, boost: tr.boost, slip, speed: s.v || 0, on }, events };
  }

  const api = { createTracker, update };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EngineControl = api;
})(typeof window !== 'undefined' ? window : globalThis);
