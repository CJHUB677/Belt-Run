// Shared longitudinal vehicle model. Player and AI cars both run through stepCar — no
// separate "AI physics". Fixed timestep (SIM_DT) for determinism.
import { torqueAt, G } from './build.js';

export const SIM_HZ = 240;
export const SIM_DT = 1 / SIM_HZ;
const RPM_PER_RAD = 60 / (2 * Math.PI);
const RAD_PER_RPM = 1 / RPM_PER_RAD;

export function createCarState(bc, { speed = 0, gear = 0 } = {}) {
  const st = {
    x: 0, v: speed, a: 0,
    gear, pendingGear: 0,
    clutch: gear > 0 ? 'lock' : 'open', clutchT: 0, engageTime: 0,
    shiftT: 0,
    wOmega: speed / bc.r,
    eOmega: bc.idle * RAD_PER_RPM,
    boost: 0, heat: 0,
    throttle: 0,
    spinning: false, slipV: 0,
    limiterCut: false, tcF: 1, tcArm: 0,
    launched: gear > 0, launchHold: false,
    shiftCount: 0, lastShiftQuality: null,
    wheelAngle: 0, smoke: 0,
    rpmFlareSync: 0,
    nosLeft: bc.nosSeconds || 0, nosOn: false, nosUsed: 0,
  };
  if (gear > 0) {
    const G_ = bc.ratios[gear - 1] * bc.final;
    st.eOmega = Math.max(bc.idle * RAD_PER_RPM, st.wOmega * G_);
    st.boost = bc.boosted ? 0.4 : 0;
  }
  return st;
}

export const rpmOf = st => st.eOmega * RPM_PER_RAD;

// Request a gear change. Returns {ok, reason}.
export function requestShift(bc, st, dir) {
  if (st.shiftT > 0) return { ok: false, reason: 'busy' };
  const n = bc.ratios.length;
  if (dir > 0) {
    if (st.gear === 0) { // launch: drop into first
      st.gear = 1; st.clutch = 'slip'; st.clutchT = 0; st.engageTime = bc.launchEngage;
      st.launched = true; st.launchHold = false;
      return { ok: true, launch: true };
    }
    if (st.gear >= n) return { ok: false, reason: 'top' };
    st.pendingGear = st.gear + 1;
  } else {
    if (st.gear <= 1) return { ok: false, reason: 'bottom' };
    const target = st.gear - 1;
    const newRpm = st.wOmega * bc.ratios[target - 1] * bc.final * RPM_PER_RAD;
    if (newRpm > bc.limiter + 150) return { ok: false, reason: 'overrev' };
    st.pendingGear = target;
  }
  st.shiftT = bc.shiftTime;
  st.clutch = 'open';
  st.shiftCount++;
  return { ok: true };
}

function driveAxleLimit(bc, st) {
  const m = bc.mass;
  const transfer = m * st.a * bc.cgH / bc.wb * bc.wt;
  const Nr = Math.max(0.15 * m * G, m * G * (1 - bc.wdf) + transfer);
  const Nf = Math.max(0.15 * m * G, m * G * bc.wdf - transfer);
  let N;
  if (bc.drive === 'RWD') N = Nr;
  else if (bc.drive === 'FWD') N = Nf;
  else {
    const s = bc.rearShare;
    N = Math.min(Nr / s, Nf / (1 - s));
    N = Math.min(N, Nr + Nf);
  }
  return bc.mu * N * bc.diffF;
}

// TC as a wheel-torque limiter: 'street' is conservative (90% of grip), 'sport' 97%.
// While the tire is already spinning it cuts below the sliding force so the wheel recovers.
function tcLimit(bc, st, Tw, Irot, Fmax) {
  if (!st.tcArm || Tw <= 0) { st.tcF = 1; return Tw; }
  const ratio = bc.tcMode === 'street' ? 0.90 : 0.97;
  const lim = st.spinning
    ? Fmax * slideFactor(bc, st.slipV) * bc.r * 0.85
    : Fmax * ratio * bc.r + Irot * (Fmax / bc.mass) / bc.r;
  const out = Math.min(Tw, lim);
  st.tcF = out / Tw;
  return out;
}

function slideFactor(bc, slipV) {
  return 1 - bc.tireDrop * (1 - Math.exp(-slipV / 2.5));
}

// Engine torque available right now (crank), including throttle, limiter and TC.
function engineTorque(bc, st, throttle, rpm) {
  let T = torqueAt(bc, rpm, bc.boosted ? st.boost : 0) * throttle;
  // Nitrous: a fixed-power shot (P = T·ω) while the button is held, the bottle lasts and we're in gear.
  if (st.nosOn && throttle > 0) T += bc.nosKW * 1000 / (Math.max(rpm, 2500) * RAD_PER_RPM);
  if (bc.heatSoak) T *= 1 - bc.heatSoak * Math.min(1, st.heat / 8) * (bc.boosted ? st.boost : 0);
  const friction = bc.peakT * (0.04 + 0.10 * rpm / bc.limiter);
  return T * st.tcF - friction * (1 - throttle);
}

export function stepCar(bc, st, input, dt = SIM_DT) {
  const r = bc.r;
  let throttle = input.throttle ? 1 : 0;
  let rpm = st.eOmega * RPM_PER_RAD;

  // Launch control (cars that have it): in neutral with throttle held, the ECU holds launch rpm and
  // pre-builds boost. Cars without it free-rev to the limiter — the driver has to feather the pedal.
  st.launchHold = st.gear === 0 && throttle > 0 && bc.hasLaunchControl;
  if (st.launchHold && rpm > bc.launchRpm) throttle = 0;

  // Rev limiter (fuel cut with hysteresis)
  if (rpm >= bc.limiter) st.limiterCut = true;
  else if (rpm < bc.limiter - 180) st.limiterCut = false;
  if (st.limiterCut) throttle = 0;

  // Shift in progress: torque interrupted (ignition/throttle cut while gears change)
  if (st.shiftT > 0) {
    throttle = 0;
    st.shiftT -= dt;
    if (st.shiftT <= 0) {
      st.shiftT = 0;
      st.gear = st.pendingGear;
      st.clutch = 'slip'; st.clutchT = 0; st.engageTime = bc.engageAfterShift;
    }
  }
  st.throttle = throttle;
  st.nosOn = !!input.nitrous && st.nosLeft > 0 && st.gear > 0 && st.shiftT === 0 && throttle > 0;
  if (st.nosOn) { st.nosLeft = Math.max(0, st.nosLeft - dt); st.nosUsed += dt; }

  // ── Boost dynamics ──
  if (bc.boosted) {
    let target = throttle;
    if (st.launchHold && input.throttle) target = Math.min(1, bc.lcBoost * (rpm / Math.max(1, bc.launchRpm)));
    else if (st.gear === 0 && input.throttle) target = 0.15; // unloaded free-rev builds little boost
    let k;
    if (bc.type === 'supercharged') k = 25;
    else if (target > st.boost) {
      // Exhaust energy grows with rpm; below spool the turbo barely builds.
      const e = Math.max(0.08, Math.min(1.6, (rpm - bc.spool0 * 0.55) / Math.max(1, bc.spool1 - bc.spool0 * 0.55)));
      k = bc.spoolRate * e;
    } else k = 14; // wastegate / blow-off drop
    st.boost += (target - st.boost) * (1 - Math.exp(-k * dt));
    st.heat += st.boost * dt;
  }

  // ── Resistive forces ──
  const v = st.v;
  const Faero = 0.5 * bc.rho * bc.cdA * v * v;
  const Froll = v > 0.05 ? bc.crr * bc.mass * G : 0;
  const Fres = Faero + Froll;
  const Fmax = driveAxleLimit(bc, st);
  const mEffAll = bc.mass + bc.IallWheels / (r * r);

  const Gr = st.gear > 0 ? bc.ratios[st.gear - 1] * bc.final : 0;
  const eta = bc.driveEff;
  let a = 0, Fx = 0;

  if (st.gear === 0 || st.clutch === 'open') {
    // Engine decoupled
    const Te = engineTorque(bc, st, throttle, rpm);
    st.eOmega += Te / bc.Ie * dt;
    a = v > 0.01 ? -Fres / mEffAll : 0;
    st.spinning = false; st.slipV = 0;
    st.v = Math.max(0, v + a * dt);
    st.wOmega = st.v / r;
  } else if (st.clutch === 'slip') {
    st.clutchT += dt;
    const Te = engineTorque(bc, st, throttle, rpm);
    let cap = bc.clutchCap * Math.min(1, (st.clutchT / st.engageTime) ** 1.3);
    const dOm = st.eOmega - st.wOmega * Gr;
    // Clutch modulation: a drag launch slips the clutch to keep the engine near its launch rpm
    // instead of dragging it down to wheel speed (bogging). Below the floor the clutch transmits
    // no more torque than the engine makes, so revs hold while the car gathers speed.
    const floorRpm = st.gear === 1 ? Math.max(bc.idle * 1.6, bc.launchRpm * 0.72) : bc.idle * 1.3;
    if (dOm > 0 && rpm < floorRpm) cap = Math.min(cap, Math.max(0, Te));
    let Tc = Math.sign(dOm) * cap;
    const Tw0 = Tc * Gr * (Tc > 0 ? eta : 1);
    const Tw = tcLimit(bc, st, Tw0, bc.Iw, Fmax);
    let TeEff = Te;
    if (Tw < Tw0) { Tc *= Tw / Tw0; TeEff = Math.min(Te, Tc + 0.03 * bc.peakT); } // TC also trims the engine
    ({ a, Fx } = wheelDynamics(bc, st, Tw, bc.Iw, Fres, Fmax, mEffAll, dt));
    // engine side
    st.eOmega += (TeEff - Tc) / bc.Ie * dt;
    const dOm2 = st.eOmega - st.wOmega * Gr;
    if ((Math.sign(dOm2) !== Math.sign(dOm) || Math.abs(dOm2) < 3) && st.clutchT >= st.engageTime * 0.5) {
      st.clutch = 'lock';
      st.eOmega = st.wOmega * Gr;
    }
  } else {
    // Locked: engine rotates with the driven wheels
    rpm = st.wOmega * Gr * RPM_PER_RAD;
    const Te = engineTorque(bc, st, throttle, rpm);
    const Irot = bc.Iw + bc.Ie * Gr * Gr;
    const Tw = tcLimit(bc, st, Te * Gr * (Te > 0 ? eta : 1), Irot, Fmax);
    ({ a, Fx } = wheelDynamics(bc, st, Tw, Irot, Fres, Fmax, mEffAll, dt));
    st.eOmega = st.wOmega * Gr;
  }

  // Engine can't stall below idle in this model (anti-stall)
  const idleOm = bc.idle * RAD_PER_RPM;
  if (st.eOmega < idleOm) {
    if (st.clutch === 'lock' && st.gear > 0) st.clutch = 'slip', st.clutchT = st.engageTime;
    st.eOmega = idleOm;
  }
  st.eOmega = Math.min(st.eOmega, (bc.limiter + 400) * RAD_PER_RPM);

  // Traction control arming: it reacts only after it detects slip (detection lag), then
  // stays active briefly. 'off' leaves the launch entirely to the driver's setup.
  if (bc.tcMode !== 'off' && st.launched) {
    if (st.spinning && st.slipV > 0.35) st.tcArm = 0.6; else st.tcArm = Math.max(0, (st.tcArm || 0) - dt);
  } else st.tcArm = 0;

  st.a = a;
  st.x += st.v * dt;
  st.wheelAngle = (st.wheelAngle + st.wOmega * dt) % (Math.PI * 2);
  st.smoke = st.spinning ? Math.min(1, st.smoke + dt * 4) : Math.max(0, st.smoke - dt * 2);
  return st;
}

function wheelDynamics(bc, st, Tw, Irot, Fres, Fmax, mEffAll, dt) {
  const r = bc.r, v = st.v;
  let a, Fx;
  if (!st.spinning) {
    // Rolling: solve car + rotating inertia together, then check grip
    const mEff = mEffAll + (Irot - bc.Iw) / (r * r);
    a = (Tw / r - Fres) / mEff;
    Fx = bc.mass * a + Fres + (bc.IallWheels / (r * r)) * a;
    if (Fx > Fmax && Tw > 0) {
      st.spinning = true;
    } else {
      if (v <= 0.001 && a < 0) a = 0;
      st.v = Math.max(0, v + a * dt);
      st.wOmega = st.v / r;
      st.slipV = 0;
      return { a, Fx };
    }
  }
  // Spinning: tire force is the (falling) sliding force, wheels accelerate independently
  const slipV = Math.max(0, st.wOmega * r - v);
  Fx = Fmax * slideFactor(bc, slipV);
  const alpha = (Tw - Fx * r) / Irot;
  st.wOmega += alpha * dt;
  a = (Fx - Fres) / (bc.mass + (bc.IallWheels - bc.Iw) / (r * r));
  st.v = Math.max(0, v + a * dt);
  if (st.wOmega * r <= st.v) { st.spinning = false; st.wOmega = st.v / r; st.slipV = 0; }
  else st.slipV = st.wOmega * r - st.v;
  return { a, Fx };
}
