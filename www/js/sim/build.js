// Turns (car spec + installed upgrade levels + tune + venue conditions) into the physical
// parameters the simulation uses. Upgrades act on the model (torque curve, boost, grip, mass,
// shift time, nitrous), never on displayed numbers.
export const RPM_STEP = 25;
const TAU = Math.PI * 2;
export const DRIVER_KG = 80;
export const G = 9.81;
export const HP_PER_KW = 1 / 0.745699872;

// Shared calibration (no per-car fudge factors). Validated in tests/physics.test.mjs.
export const CAL = {
  muStreet: 1.20,
  driveEff: { RWD: 0.89, AWD: 0.86, FWD: 0.90 },
  rho: 1.18,
  rollout: 0.30,
  shiftTime: { DCT: 0.10, AT8M: 0.14, AT8: 0.20, MT: 0.34 },
};

export const UPGRADE_KEYS = ['engine', 'power', 'intake', 'nitrous', 'body', 'tires', 'gearbox'];
export const MAX_LEVEL = 5;
export const stockLevels = () => Object.fromEntries(UPGRADE_KEYS.map(k => [k, 0]));

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const piecewise = pts => rpm => {
  if (rpm <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (rpm <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return lerp(y0, y1, (rpm - x0) / (x1 - x0)); }
  return pts[pts.length - 1][1];
};
export const isTurboType = t => t === 'turbo' || t === 'twin-turbo' || t === 'single-turbo';

// What each upgrade stage does (also shown in the shop).
export const UPGRADE_INFO = {
  engine: { name: 'Engine', desc: 'Cams, pistons, ECU: +5% torque per stage across the rev range.' },
  power: { name: 'Turbo / Supercharger', desc: 'Turbo: +12% boost torque per stage, spools ~100 rpm later each. Supercharger: smaller pulley, +7%. NA engines get a turbo kit.' },
  intake: { name: 'Intake & Exhaust', desc: 'Breathes better up top: +2.5% high-rpm torque per stage; turbos spool a little sooner.' },
  nitrous: { name: 'Nitrous', desc: 'Adds a nitrous shot (hp) for a limited time each pass. Bigger shot and bottle per stage. Press NOS during the run.' },
  body: { name: 'Weight Reduction', desc: '−2.5% mass per stage.' },
  tires: { name: 'Tires', desc: '+5% grip per stage. Stage 3+ are drag radials: grip more at low pressure, recover from wheelspin better.' },
  gearbox: { name: 'Transmission', desc: 'Faster shifts per stage. Stage 1 unlocks gear-ratio tuning; stage 2 adds launch control to manual cars.' },
};

export function nitrousSpec(car, lv) {
  if (!lv) return { kW: 0, seconds: 0 };
  const hp = Math.round(car.hp * (0.05 + 0.035 * lv) + 15 * lv);
  return { hp, kW: hp / HP_PER_KW, seconds: 1.5 + 0.6 * lv };
}

export function defaultTune(car, lv = stockLevels()) {
  const e = car.phys.engine;
  let launchRpm = e.type === 'na' ? Math.round(e.redline * 0.62 / 100) * 100 : (car.phys.drive === 'AWD' ? 3600 : 2800);
  if (e.type === 'supercharged') launchRpm = car.phys.drive === 'AWD' ? 2600 : 2000;
  if (e.type === 'single-turbo') launchRpm = 4500;
  return { launchRpm, tirePsi: lv.tires >= 3 || car.phys.radial ? 18 : 30, gears: car.phys.trans.ratios.slice(), final: car.phys.trans.final, nosSeconds: nitrousSpec(car, lv.nitrous).seconds, tc: 'sport' };
}

export function tuneLimits(car, lv) {
  return {
    launchRpm: [1500, Math.round(car.phys.engine.redline * 0.9 / 100) * 100],
    tirePsi: [14, 40],
    gears: lv.gearbox >= 1 ? [0.8, 1.2] : null,
    final: [0.8, 1.2],
    nosSeconds: lv.nitrous ? [0.5, nitrousSpec(car, lv.nitrous).seconds] : null,
  };
}

export function sanitizeTune(car, lv, tune = {}) {
  const L = tuneLimits(car, lv), d = defaultTune(car, lv), t = { ...d, ...tune };
  t.launchRpm = clamp(Math.round(+t.launchRpm || d.launchRpm), ...L.launchRpm);
  t.tirePsi = clamp(+t.tirePsi || d.tirePsi, ...L.tirePsi);
  const stock = car.phys.trans.ratios;
  t.gears = stock.map((r, i) => L.gears ? clamp(+(t.gears?.[i]) || r, r * L.gears[0], r * L.gears[1]) : r);
  t.final = clamp(+t.final || car.phys.trans.final, car.phys.trans.final * L.final[0], car.phys.trans.final * L.final[1]);
  t.nosSeconds = L.nosSeconds ? clamp(+t.nosSeconds || d.nosSeconds, ...L.nosSeconds) : 0;
  if (!['street', 'sport', 'off'].includes(t.tc)) t.tc = 'sport';
  return t;
}

export function buildCar(car, lvIn = stockLevels(), tuneIn = {}, env = { mu: 1, density: 1 }) {
  const lv = { ...stockLevels(), ...lvIn };
  const ph = car.phys, e = ph.engine;
  const tune = sanitizeTune(car, lv, tuneIn);
  let type = e.type;
  const Tp = e.Nm, [r1, r2] = e.NmRpm, rp = e.kWrpm, redline = e.redline;
  const Tatp = Math.min(Tp, e.kW * 1000 / (rp * TAU / 60));
  let env0;
  if (type === 'na') {
    env0 = piecewise([[0, 0.55 * Tp], [e.idle, 0.62 * Tp], [r1 * 0.55, 0.84 * Tp], [r1, Tp], [Math.max(rp, r1 + 1), Tatp], [Math.max(redline, rp + 1), 0.93 * Tatp * rp / Math.max(redline, rp + 1)], [redline + 800, 0.45 * Tatp]]);
    if (e.vtec) { const base = env0; env0 = rpm => base(rpm) * (0.86 + 0.14 * smooth(e.vtec - 250, e.vtec + 250, rpm)); }
  } else {
    const rpE = Math.max(rp, r2 + 1);
    const Tm = rpm => Math.min(Tp, rpm <= rpE ? Tp + (Tatp - Tp) * (rpm - r2) / (rpE - r2) : Tatp * rpE / rpm * (1 - 0.07 * (rpm - rpE) / Math.max(1, redline - rpE)));
    env0 = rpm => rpm <= r1 ? 0.45 * Tp + 0.55 * Tp * rpm / r1 : rpm <= r2 ? Tp : rpm <= redline ? Tm(rpm) : Tm(redline) * Math.max(0.4, 1 - (rpm - redline) / 1600);
  }
  const b = e.boost || {};
  let naFrac = b.naFrac ?? 1, spool0 = b.spool?.[0] ?? 0, spool1 = b.spool ? Math.max(b.spool[1], r1) : 0, spoolRate = b.rate ?? 0, lcBoost = b.lcBoost ?? 0;
  let naBase = rpm => env0(rpm) * naFrac, envelope = env0, boostMult = 1;
  // Power adder stages
  if (type === 'na' && lv.power > 0) {
    type = 'single-turbo';
    const gain = 1.12 + 0.12 * lv.power;
    spool0 = Math.max(2600, redline * 0.34); spool1 = spool0 + 1400; spoolRate = 4; lcBoost = 0.4;
    naBase = rpm => env0(rpm); envelope = rpm => env0(rpm) * gain;
  } else if (isTurboType(type)) {
    boostMult *= 1 + 0.12 * lv.power; spool0 += 100 * lv.power; spool1 += 100 * lv.power;
  } else if (type === 'supercharged') boostMult *= 1 + 0.07 * lv.power;
  if (isTurboType(type)) { spool0 -= 60 * lv.intake; spool1 -= 60 * lv.intake; }
  const engineMult = 1 + 0.05 * lv.engine;
  const topGain = 1 + 0.025 * lv.intake;
  const topFactor = rpm => lerp(1, topGain, smooth(r1 * 0.9, Math.max(rp, r1 + 500), rpm));
  const dens = env.density ?? 1;
  const densF = type === 'na' ? dens : type === 'supercharged' ? 1 + (dens - 1) * 0.8 : 1 + (dens - 1) * 0.5;
  const boosted = type !== 'na';
  const scFull = b.scFull ?? 4000;
  const limiter = redline;
  const n = Math.ceil((limiter + 800) / RPM_STEP) + 2;
  const tss = new Float32Array(n), tna = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const rpm = i * RPM_STEP, common = engineMult * topFactor(rpm) * densF, base = naBase(rpm) * common;
    let full = base;
    if (boosted) {
      const s = type === 'supercharged' ? clamp(0.45 + 0.55 * rpm / scFull, 0, 1) : smooth(spool0, spool1, rpm);
      full = base + Math.max(0, envelope(rpm) * common - base) * boostMult * s;
    }
    tss[i] = full; tna[i] = base;
  }
  let peakT = 0; for (const t of tss) peakT = Math.max(peakT, t);
  // Transmission
  const transType = ph.trans.type;
  const shiftTime = CAL.shiftTime[transType] * (1 - 0.12 * lv.gearbox);
  const engageAfterShift = ({ DCT: 0.04, AT8M: 0.06, AT8: 0.08, MT: 0.14 })[transType];
  const launchEngage = ({ DCT: 0.30, AT8M: 0.32, AT8: 0.36, MT: 0.42 })[transType];
  const clutchCap = peakT * 1.5 * (1 + 0.1 * lv.gearbox);
  const hasLaunchControl = ph.factoryLC || lv.gearbox >= 2;
  // Tires
  const radial = lv.tires >= 3 || !!ph.radial;
  const popt = radial ? 17 : 31, k = radial ? 0.08 : 0.035, dev = (tune.tirePsi - popt) / 10;
  const psiF = 1 + k - 2 * k * Math.min(1, dev * dev);
  const lowP = Math.max(0, 35 - tune.tirePsi);
  const rDriven = ph.tireR * (1 - 0.0010 * lowP);
  const crr = 0.011 * (1 + 0.012 * lowP) + (radial ? 0.002 : 0);
  // Mass, inertia, nitrous
  const mass = ph.massKg * (1 - 0.025 * lv.body) + DRIVER_KG;
  const wheelI = 1.9 * (rDriven / 0.33) ** 2;
  const nos = nitrousSpec(car, lv.nitrous);
  return {
    car, lv, tune, env, type, boosted, turboFam: isTurboType(type),
    tss, tna, peakT, idle: e.idle, redline, limiter, spool0, spool1, spoolRate, lcBoost, scFull,
    ratios: tune.gears, final: tune.final, shiftTime, engageAfterShift, launchEngage, clutchCap, transType, hasLaunchControl,
    mu: CAL.muStreet * (ph.grip || 1) * (1 + 0.05 * lv.tires) * psiF * (env.mu ?? 1), tireDrop: radial ? 0.18 : 0.30 - 0.01 * lv.tires,
    r: rDriven, crr, drive: ph.drive, rearShare: ph.rearShare, diffF: 1, wt: 1,
    mass, wdf: ph.wdf, cgH: ph.cgH, wb: ph.WB, cdA: ph.cdA, rho: CAL.rho * (env.density ?? 1),
    Iw: wheelI * (ph.drive === 'AWD' ? 4 : 2), IallWheels: wheelI * 4, Ie: 0.10 + 0.035 * e.dispL + (type === 'supercharged' ? 0.05 : 0),
    driveEff: CAL.driveEff[ph.drive] + (transType === 'DCT' || transType === 'MT' ? 0.01 : 0),
    tcMode: tune.tc, launchRpm: tune.launchRpm,
    nosKW: nos.kW, nosHp: nos.hp || 0, nosSeconds: Math.min(tune.nosSeconds || 0, nos.seconds),
  };
}

export function torqueAt(bc, rpm, boost) {
  const f = rpm / RPM_STEP, i = Math.max(0, Math.min(bc.tss.length - 2, f | 0)), t = Math.min(1, Math.max(0, f - i));
  const ss = bc.tss[i] + (bc.tss[i + 1] - bc.tss[i]) * t, na = bc.tna[i] + (bc.tna[i + 1] - bc.tna[i]) * t;
  return na + (ss - na) * boost;
}

export function dynoCurve(bc, step = 250) {
  const out = [];
  for (let rpm = 1000; rpm <= bc.limiter; rpm += step) {
    const T = torqueAt(bc, rpm, 1), kW = T * rpm * TAU / 60 / 1000;
    out.push({ rpm, Nm: T, kW, hp: kW * HP_PER_KW, whp: kW * HP_PER_KW * bc.driveEff });
  }
  return out;
}
export function peakPower(bc) { let best = { hp: 0, rpm: 0, whp: 0 }; for (const p of dynoCurve(bc, 50)) if (p.hp > best.hp) best = p; return best; }

export function optimalShiftRpms(bc) {
  const out = [], lim = bc.limiter - 120;
  for (let g = 0; g < bc.ratios.length - 1; g++) {
    const ra = bc.ratios[g], rb = bc.ratios[g + 1];
    let best = lim;
    for (let rpm = 2500; rpm <= lim; rpm += 25) if (torqueAt(bc, rpm * rb / ra, 1) * rb >= torqueAt(bc, rpm, 1) * ra) { best = rpm; break; }
    out.push(best);
  }
  return out;
}
export function gearSpeeds(bc) { return bc.ratios.map(r => bc.limiter * TAU / 60 / (r * bc.final) * bc.r); }
