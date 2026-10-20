// Career structure (Drag Racing Classic style): each car belongs to a performance CLASS (1–10,
// from its simulated stock quarter-mile). Every class has its own ladder of events ending in a
// boss race. Jamaica hosts a Honda-only cup. Quick races pay a smaller purse and can be repeated.
import { CARS, CAR_BY_ID } from './cars.js';
import { buildCar, defaultTune } from '../sim/build.js';
import { simulateRun } from '../sim/race.js';
import { STOCK_ET } from './stock-et.js';

export const CLASS_ET = [15.0, 14.0, 13.5, 12.9, 12.4, 12.0, 11.6, 11.2, 10.6]; // lower bound of classes 1..9 (ET ≥)
export const CLASS_NAMES = ['', 'STREET', 'SPORT', 'TUNER', 'HOT', 'FAST', 'MUSCLE', 'SUPER', 'HYPER', 'EXOTIC', 'LEGEND'];

// Stock robot-driver 1/4 ET, best launch rpm. Cached per car (deterministic).
const etCache = new Map();
export function stockET(car) {
  if (STOCK_ET[car.id] && !car._dirty) return STOCK_ET[car.id];
  if (etCache.has(car.id)) return etCache.get(car.id);
  let best = Infinity;
  for (let lr = 1500; lr <= car.phys.engine.redline * 0.9; lr += 500) {
    const s = simulateRun(buildCar(car, {}, { ...defaultTune(car), launchRpm: lr }), { nitrous: false }).result.player;
    if (s.et && s.et < best) best = s.et;
  }
  etCache.set(car.id, best);
  return best;
}
export function classOf(car) { const et = stockET(car); let c = 10; for (let i = 0; i < CLASS_ET.length; i++) if (et >= CLASS_ET[i]) { c = i + 1; break; } return c; }

export const VENUES = {
  ny: { id: 'ny', name: 'NEW YORK', track: 'Belt Parkway Shoreline', mu: 1.00, density: 1.03, temp: 62, desc: 'Bridge lights, cold air.' },
  fl: { id: 'fl', name: 'FLORIDA', track: 'Biscayne Causeway', mu: 0.98, density: 0.97, temp: 84, desc: 'Warm, humid evening air.' },
  ga: { id: 'ga', name: 'GEORGIA', track: 'Eastside Rail Yard', mu: 1.02, density: 1.00, temp: 71, desc: 'Prepped lane at the rail yard.' },
  tx: { id: 'tx', name: 'TEXAS', track: 'Stack Interchange', mu: 1.05, density: 0.98, temp: 78, desc: 'Big-power night, heavy prep.' },
  ja: { id: 'ja', name: 'JAMAICA', track: 'Harbour Road · Kingston', mu: 0.97, density: 0.97, temp: 82, desc: 'Honda Cup. Dusty, humid.' },
};
export const CLASS_VENUE = { 1: 'ny', 2: 'ny', 3: 'fl', 4: 'fl', 5: 'ga', 6: 'ga', 7: 'tx', 8: 'tx', 9: 'fl', 10: 'ny' };

export const reward = cls => Math.round(900 * Math.pow(1.38, cls - 1) / 50) * 50;
export const quickReward = cls => Math.round(reward(cls) * 0.3 / 25) * 25;

const lvl = n => ({ engine: n, power: n, intake: n, nitrous: Math.max(0, n - 1), body: n, tires: n, gearbox: n });

function rotate(arr, k) { return arr.length ? arr[k % arr.length] : null; }

// Build a class ladder: 6 events + boss. Opponents are cars of the same class, getting more
// upgraded and better driven as you climb.
export function ladder(cls) {
  const pool = CARS.filter(c => !c.ownerGift && classOf(c) === cls).sort((a, b) => stockET(b) - stockET(a));
  const fallback = CARS.filter(c => !c.ownerGift && Math.abs(classOf(c) - cls) === 1).sort((a, b) => stockET(b) - stockET(a));
  const opp = pool.length >= 3 ? pool : [...pool, ...fallback];
  const venue = CLASS_VENUE[cls];
  const steps = [
    { n: 'Opening Night', up: 0, ai: 2, d: 'quarter' }, { n: 'Grudge Match', up: 1, ai: 2, d: 'quarter' },
    { n: 'Eighth-Mile Dash', up: 1, ai: 3, d: 'eighth' }, { n: 'Crew Callout', up: 2, ai: 3, d: 'quarter' },
    { n: 'Half-Mile Pull', up: 2, ai: 4, d: 'half' }, { n: 'Final Qualifier', up: 3, ai: 4, d: 'quarter' },
  ];
  const ev = steps.map((s, i) => ({ id: `c${cls}e${i + 1}`, cls, venue, name: s.n, distance: s.d, opp: { car: rotate(opp, i).id, lv: lvl(s.up), ai: s.ai }, reward: reward(cls) }));
  const bossCar = opp[opp.length - 1] || opp[0];
  ev.push({ id: `c${cls}boss`, cls, venue, name: 'BOSS: Class ' + cls + ' King', boss: true, distance: 'quarter', opp: { car: bossCar.id, lv: lvl(4), ai: 5 }, reward: reward(cls) * 3 });
  return ev;
}

export function hondaCup() {
  const H = CARS.filter(c => c.make === 'Honda').sort((a, b) => stockET(b) - stockET(a));
  const n = ['Harbour Opener', 'Spanish Town Sprint', 'Blue Mountain Eighth', 'Port Royal Pull', 'Kingston VTEC Night'];
  const ev = n.map((name, i) => ({ id: `honda${i + 1}`, cls: 0, venue: 'ja', honda: true, name, distance: i === 2 ? 'eighth' : 'quarter', opp: { car: H[Math.min(H.length - 1, i)].id, lv: lvl(Math.min(3, i)), ai: 2 + Math.min(3, i) }, reward: 1800 + i * 900 }));
  ev.push({ id: 'hondaboss', cls: 0, venue: 'ja', honda: true, boss: true, name: 'BOSS: Harbour King', distance: 'quarter', opp: { car: 's2000', lv: lvl(5), ai: 5 }, reward: 12000 });
  return ev;
}

export const ALL_EVENTS = () => [...Array.from({ length: 10 }, (_, i) => ladder(i + 1)).flat(), ...hondaCup()];

// Unlockable special builds (by total career wins), as in the previous edition.
export const STARTING_CASH = 7500;
export const STARTER_CARS = ['f22', 'civicsi', 'userx4'];
export function carLocked(car, save) { return car.wins && save.wins < car.wins ? `Win ${car.wins} races to unlock` : null; }

// Upgrade pricing: per category base × stage curve × car value factor.
const BASE = { engine: 900, power: 1100, intake: 500, nitrous: 700, body: 600, tires: 450, gearbox: 700 };
export function upgradePrice(car, key, stage) {
  const f = Math.max(0.5, Math.min(2.6, 0.45 + (car.price || 60000) / 70000));
  return Math.round(BASE[key] * Math.pow(stage, 1.3) * f / 50) * 50;
}

export { CARS, CAR_BY_ID };
