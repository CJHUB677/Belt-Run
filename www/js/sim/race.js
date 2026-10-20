// Race flow (Drag Racing Classic style): staging → 3-2-1 countdown while you rev against the
// pedal → at green the clutch drops at whatever rpm you're holding → manual shifts + nitrous →
// finish. Pure logic, deterministic; player and AI share the same physics.
import { createCarState, stepCar, requestShift, rpmOf, SIM_DT } from './physics.js';
import { optimalShiftRpms } from './build.js';

export const FT = 0.3048;
export const DIST = { quarter: 402.336, half: 804.672, eighth: 201.168 };
export const DIST_LABEL = { quarter: '1/4 MILE', half: '1/2 MILE', eighth: '1/8 MILE' };
export const MS_TO_MPH = 2.236936;
const MARKS = [['ft60', 60 * FT], ['ft330', 330 * FT], ['eighth', DIST.eighth], ['ft1000', 1000 * FT], ['quarter', DIST.quarter], ['half', DIST.half]];

export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const gauss = r => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

// AI skill: launch rpm error, shift-point error and shift-delay (reaction to the shift light).
export const AI = {
  1: { launch: 0.22, shift: 0.07, lag: 0.12 }, 2: { launch: 0.15, shift: 0.05, lag: 0.08 },
  3: { launch: 0.10, shift: 0.035, lag: 0.05 }, 4: { launch: 0.05, shift: 0.02, lag: 0.03 }, 5: { launch: 0.02, shift: 0.01, lag: 0.015 },
};

export const launchZone = bc => {
  const lo = Math.round(bc.launchRpm * 0.88 / 50) * 50, hi = Math.min(bc.limiter - 200, Math.round(bc.launchRpm * 1.12 / 50) * 50);
  return { lo, hi, target: bc.launchRpm };
};
export const shiftZone = (bc, gear) => {
  const opt = optimalShiftRpms(bc)[gear - 1] ?? bc.limiter;
  return { lo: opt - Math.max(250, opt * 0.05), hi: Math.min(bc.limiter, opt + 120), opt };
};

export function createRace({ player, opponent = null, aiSkill = 3, distance = 'quarter', seed = 1 }) {
  const rand = rng(seed);
  const race = { phase: 'staging', t: 0, phaseT: 0, distance, distM: DIST[distance], lights: 0, cars: [], events: [], finished: false, result: null, goAt: null, rand };
  const add = (bc, kind) => {
    const car = { bc, kind, st: createCarState(bc), input: { throttle: false, nitrous: false }, marks: {}, et: null, trap: null, trap8: null, launch: null, shifts: [], finishT: null, samples: [] };
    if (kind === 'ai') {
      const S = AI[aiSkill] || AI[3];
      car.ai = { S, launchRpm: bc.launchRpm * (1 + gauss(rand) * S.launch), shiftAt: optimalShiftRpms(bc).map(r => Math.min(bc.limiter - 40, r * (1 + gauss(rand) * S.shift))), lagLeft: 0 };
    }
    race.cars.push(car);
  };
  add(player, 'player');
  if (opponent) add(opponent, 'ai');
  return race;
}

export function setThrottle(race, on) { race.cars[0].input.throttle = !!on; }
export function setNitrous(race, on) { race.cars[0].input.nitrous = !!on; }

export function shift(race, dir, car = race.cars[0]) {
  if (race.phase !== 'run' || car.st.gear === 0 || car.finishT != null) return { ok: false };
  const before = rpmOf(car.st), gear = car.st.gear;
  const r = requestShift(car.bc, car.st, dir);
  if (r.ok && dir > 0) {
    const z = shiftZone(car.bc, gear);
    const q = before >= z.lo && before <= z.hi ? 'perfect' : before < z.lo - 600 ? 'early' : before < z.lo ? 'good' : 'late';
    car.shifts.push({ gear, rpm: before, q });
    race.events.push({ type: 'shift', car: car.kind, q, gear: gear + 1, t: race.t });
  } else if (!r.ok && r.reason === 'overrev') race.events.push({ type: 'overrev', car: car.kind, t: race.t });
  return r;
}

function aiInput(race, car) {
  const st = car.st, bc = car.bc, a = car.ai, rpm = rpmOf(st);
  if (race.phase === 'countdown' || race.phase === 'staging') {
    if (race.phase === 'staging') return { throttle: false };
    return { throttle: bc.hasLaunchControl ? true : rpm < a.launchRpm };   // feathering the pedal
  }
  const inp = { throttle: true, nitrous: st.gear >= 2 && st.nosLeft > 0 };
  if (st.gear > 0 && st.gear < bc.ratios.length && st.shiftT === 0 && st.clutch === 'lock' && rpm >= a.shiftAt[st.gear - 1]) {
    a.lagLeft = a.lagLeft || a.S.lag * (0.5 + race.rand());
    a.lagLeft -= SIM_DT; if (a.lagLeft <= 0) { a.lagLeft = 0; shift(race, 1, car); }
  }
  return inp;
}

export function stepRace(race, dt = SIM_DT) {
  race.t += dt; race.phaseT += dt;
  if (race.phase === 'staging' && race.phaseT > 1.0) { race.phase = 'countdown'; race.phaseT = 0; race.lights = 3; race.events.push({ type: 'light', n: 3, t: race.t }); }
  else if (race.phase === 'countdown') {
    const n = 3 - Math.floor(race.phaseT / 0.9);
    if (n !== race.lights && n > 0) { race.lights = n; race.events.push({ type: 'light', n, t: race.t }); }
    if (race.phaseT >= 2.7) go(race);
  }
  for (const car of race.cars) {
    const inp = car.kind === 'ai' ? aiInput(race, car) : car.input;
    const live = car.finishT == null;
    stepCar(car.bc, car.st, live ? inp : { throttle: false }, dt);
    if (race.phase === 'run') track(race, car);
  }
  const p = race.cars[0];
  if (race.phase === 'run' && p.finishT == null) {
    const tt = race.t - race.goAt;
    if (!p.samples.length || tt - p.samples[p.samples.length - 1][0] >= 1 / 30) p.samples.push([+tt.toFixed(3), +p.st.x.toFixed(2)]);
  }
  if (race.phase === 'run' && race.cars.every(c => c.finishT != null || race.t - race.goAt > 45)) finish(race);
}

function go(race) {
  race.phase = 'run'; race.phaseT = 0; race.goAt = race.t; race.lights = 0;
  race.events.push({ type: 'go', t: race.t });
  for (const car of race.cars) {
    const rpm = rpmOf(car.st), z = launchZone(car.bc);
    const q = rpm >= z.lo && rpm <= z.hi ? (Math.abs(rpm - z.target) < z.target * 0.05 ? 'perfect' : 'good') : rpm < z.lo ? 'bog' : 'spin';
    car.launch = { rpm, q };
    car.st.x = 0;
    requestShift(car.bc, car.st, 1);           // clutch drops into first at green
    race.events.push({ type: 'launch', car: car.kind, q, rpm, t: race.t });
  }
}

function track(race, car) {
  if (car.finishT != null) return;
  const st = car.st, et = race.t - race.goAt, v = Math.max(0.01, st.v), x = st.x;
  const cross = d => et - (x - d) / v;
  for (const [k, d] of MARKS) if (d <= race.distM + 1 && car.marks[k] == null && x >= d) car.marks[k] = cross(d);
  const t8 = DIST.eighth - 66 * FT, tf = race.distM - 66 * FT;
  if (car._t8 == null && x >= t8) car._t8 = cross(t8);
  if (car._t8 != null && car.trap8 == null && x >= DIST.eighth) car.trap8 = 66 * FT / Math.max(1e-3, cross(DIST.eighth) - car._t8) * MS_TO_MPH;
  if (car._tf == null && x >= tf) car._tf = cross(tf);
  if (x >= race.distM) {
    car.et = cross(race.distM); car.finishT = race.goAt + car.et;
    car.trap = 66 * FT / Math.max(1e-3, car.et - car._tf) * MS_TO_MPH;
    race.events.push({ type: 'finish', car: car.kind, t: race.t });
  }
}

function finish(race) {
  race.phase = 'finished'; race.finished = true;
  const [p, o] = race.cars;
  const T = c => c.et ?? Infinity;
  const winner = !o ? 'player' : T(p) <= T(o) ? 'player' : 'ai';
  const margin = o && isFinite(T(p)) && isFinite(T(o)) ? Math.abs(T(p) - T(o)) : null;
  race.result = { winner, margin, player: slip(p), opponent: o ? slip(o) : null };
  race.events.push({ type: 'result', winner, t: race.t });
}

export function slip(c) {
  const perfect = c.shifts.filter(s => s.q === 'perfect').length;
  return { et: c.et, trap: c.trap, trap8: c.trap8, ...c.marks, launch: c.launch, shifts: c.shifts.length, perfectShifts: perfect, nosUsed: +c.st.nosUsed.toFixed(2) };
}

// Robot driver: perfect launch at the tune's launch rpm, optimal shifts, nitrous from 2nd gear.
export function simulateRun(bc, { distance = 'quarter', nitrous = true } = {}) {
  const race = createRace({ player: bc, distance, seed: 7 });
  const car = race.cars[0], shifts = optimalShiftRpms(bc);
  let guard = 0;
  while (!race.finished && guard++ < 240 * 60) {
    const st = car.st, rpm = rpmOf(st);
    if (race.phase === 'countdown') setThrottle(race, bc.hasLaunchControl || rpm < bc.launchRpm);
    else if (race.phase === 'run') {
      setThrottle(race, true); setNitrous(race, nitrous && st.gear >= 2);
      if (st.gear > 0 && st.gear < bc.ratios.length && st.shiftT === 0 && st.clutch === 'lock' && rpm >= shifts[st.gear - 1]) shift(race, 1);
    }
    stepRace(race);
  }
  return race;
}
