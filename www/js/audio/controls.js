// Pure mapping from the race simulation's car state to synth controls + one-shot sound events.
// No Web Audio here, so it is unit-tested in Node against the real physics.
const RPM = 60 / (2 * Math.PI);
export function createTracker(bc) { return { bc, prevGear: 0, prevBoost: 0, prevThrottle: false, prevCut: 0 }; }
/** car = { bc, st, input }, mode = 'menu' | 'stage' | 'race' | 'done'. Returns { c, events[] } */
export function controls(tr, car, mode) {
  const st = car.st, bc = car.bc, input = car.input || {};
  const rpm = Math.max(bc.idle, st.eOmega * RPM);
  const gas = mode === 'race' || mode === 'stage' ? !!input.throttle : false;
  const inGear = st.gear > 0 && st.clutch !== 'open';
  const cut = st.shiftT > 0 && gas ? 1 : 0;
  const limiter = st.limiterCut && gas ? 1 : 0;
  const c = {
    rpm, throttle: gas ? 1 : 0, load: gas && inGear && !cut && !limiter ? 1 : 0, cut, limiter, launch: st.launchHold ? 1 : 0,
    boost: bc.boosted ? st.boost : 0, slip: st.spinning ? Math.min(1, st.slipV / 3) : 0, speed: st.v, on: mode === 'menu' ? 0 : 1,
  };
  const events = [];
  if (tr) {
    if (st.gear !== tr.prevGear && tr.prevGear > 0 && st.gear > 0) events.push('shift');
    if (bc.turboFam && tr.prevBoost > 0.42 && ((tr.prevThrottle && !gas) || (!tr.prevCut && cut))) events.push('bov');
    tr.prevGear = st.gear; tr.prevBoost = c.boost; tr.prevThrottle = gas; tr.prevCut = cut;
  }
  return { c, events };
}

// Sound profile for a built car. An NA engine with the turbo-kit upgrade gets turbo sounds
// (spool whistle, blow-off) using the same spool window as its physics torque curve.
export function buildProfile(profileFor, bc) {
  const p = profileFor(bc.car);
  if (bc.turboFam && p.ind.type !== 'turbo') p.ind = { type: 'turbo', twin: false, whistle: [2600, 7200], whistleGain: 0.022, hiss: 0.03, spool: [bc.spool0, bc.spool1], rate: 5, bov: 'bov', bovGain: 0.07 };
  else if (p.ind.type === 'turbo') p.ind = { ...p.ind, spool: [bc.spool0, bc.spool1] };
  p.id = p.id + ':' + bc.type + ':' + bc.lv.power;
  return p;
}
