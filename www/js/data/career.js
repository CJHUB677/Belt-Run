// Career structure (Drag Racing Classic style): each car belongs to a performance CLASS (1–10,
// from its simulated stock quarter-mile). Every class has its own ladder of events ending in a
// boss race. Jamaica hosts a Honda-only cup. Quick races pay a smaller purse and can be repeated.
import { CARS, CAR_BY_ID } from './cars.js';
import { buildCar, defaultTune } from '../sim/build.js';
import { simulateRun } from '../sim/race.js';
import { STOCK_ET } from './stock-et.js';
import { STORY } from './story.js';

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
  det: { id: 'det', name: 'DETROIT', track: 'Riverfront Industrial Strip', mu: 0.99, density: 1.06, temp: 46, desc: 'Cold, dense air. Big power, cold tires.' },
  la: { id: 'la', name: 'LOS ANGELES', track: 'River Viaduct', mu: 1.00, density: 0.99, temp: 72, desc: 'Sunset run under the arches.' },
  lv: { id: 'lv', name: 'LAS VEGAS', track: 'Desert Strip', mu: 1.03, density: 0.89, temp: 101, desc: 'Hot, thin desert air. Turbos love it, NA cars don\u2019t.' },
  tk: { id: 'tk', name: 'TOKYO', track: 'Harbour Pier Loop', mu: 1.00, density: 1.02, temp: 58, desc: 'Midnight meet under the expressway loop.' },
  dxb: { id: 'dxb', name: 'DUBAI', track: 'Marina Highway', mu: 1.01, density: 0.93, temp: 96, desc: 'Glass-smooth highway, hot evening air.' },
};
// Story chapters: each class is a city on the road back to the Belt.
export const CLASS_VENUE = { 1: 'ny', 2: 'fl', 3: 'ga', 4: 'det', 5: 'tx', 6: 'la', 7: 'lv', 8: 'tk', 9: 'dxb', 10: 'ny' };
const AWAY_VENUE = { 1: 'det', 2: 'ja', 3: 'tx', 4: 'ny', 5: 'lv', 6: 'fl', 7: 'la', 8: 'dxb', 9: 'tk', 10: 'lv' };

export const reward = cls => Math.round(900 * Math.pow(1.38, cls - 1) / 50) * 50;
export const quickReward = cls => Math.round(reward(cls) * 0.3 / 25) * 25;

const lvl = n => ({ engine: n, power: n, intake: n, nitrous: Math.max(0, n - 1), body: n, tires: n, gearbox: n });

function rotate(arr, k) { return arr.length ? arr[k % arr.length] : null; }

// Build a class ladder: 12 events + boss. Opponents are cars of the same class, getting more
// upgraded and better driven as you climb. Events 6 and 12 are named rival races from the story.
export function ladder(cls) {
  const pool = CARS.filter(c => !c.ownerGift && classOf(c) === cls).sort((a, b) => stockET(b) - stockET(a));
  const fallback = CARS.filter(c => !c.ownerGift && Math.abs(classOf(c) - cls) === 1).sort((a, b) => stockET(b) - stockET(a));
  const opp = pool.length >= 3 ? pool : [...pool, ...fallback];
  const venue = CLASS_VENUE[cls];
  const away = AWAY_VENUE[cls];
  const steps = [
    { n: 'Opening Night', up: 0, ai: 1, d: 'quarter' }, { n: 'Grudge Match', up: 0, ai: 2, d: 'quarter' },
    { n: 'Eighth-Mile Dash', up: 1, ai: 2, d: 'eighth' }, { n: 'Crew Callout', up: 1, ai: 2, d: 'quarter' },
    { n: 'Road Trip', up: 1, ai: 3, d: 'quarter', v: away }, { n: 'RIVAL', up: 2, ai: 3, d: 'quarter', rival: 1 },
    { n: 'Half-Mile Pull', up: 2, ai: 3, d: 'half' }, { n: 'Highway Roll', up: 2, ai: 3, d: 'half', roll: 1 },
    { n: 'Away Game', up: 3, ai: 4, d: 'eighth', v: away }, { n: 'Midnight Money Run', up: 3, ai: 4, d: 'quarter' },
    { n: 'Final Qualifier', up: 3, ai: 4, d: 'quarter' }, { n: 'RIVAL', up: 4, ai: 5, d: 'quarter', rival: 2 },
  ];
  const ch = STORY[cls];
  const ev = steps.map((s, i) => ({ id: `c${cls}e${i + 1}`, cls, venue: s.v || venue, name: s.rival ? ch.rivals[s.rival - 1].event : s.n, rival: s.rival ? ch.rivals[s.rival - 1].name : null,
    distance: s.d, roll: s.roll ? 17.88 : 0, opp: { car: rotate(opp, i).id, lv: lvl(s.up), ai: s.ai }, reward: Math.round(reward(cls) * (s.rival ? 1.5 : 1) / 50) * 50 }));
  const bossCar = opp[opp.length - 1] || opp[0];
  ev.push({ id: `c${cls}boss`, cls, venue, name: 'BOSS: ' + ch.boss.name, rival: ch.boss.name, boss: true, distance: 'quarter', roll: 0, opp: { car: bossCar.id, lv: lvl(cls === 10 ? 5 : 4), ai: 5 }, reward: reward(cls) * 3 });
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

export { STORY };

// ───────────────────────── extra modes ─────────────────────────
const daySeed = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const seeded = n => { let s = n >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
export const MODE_INFO = {
  knockout: { name: 'Knockout Cup', short: 'Three rounds against your class. Lose once and you’re out.' },
  bracket: { name: 'Bracket Racing', short: 'Set a dial-in time. Closest to it without going quicker wins.' },
  roll: { name: 'Highway Roll', short: 'Side by side at 40 mph, then flat out for a half mile. No launch.' },
  daily: { name: 'Daily Challenge', short: 'A different car, venue and target time every day.' },
};

// Knockout Cup: quarter-final, semi-final, final against cars of your class.
export function knockoutRounds(cls, seed) {
  const r = seeded(seed), pool = CARS.filter(c => !c.ownerGift && Math.abs(classOf(c) - cls) <= (cls >= 9 ? 1 : 0));
  const pick = () => pool[(r() * pool.length) | 0] || CARS[0];
  const venues = Object.keys(VENUES).filter(v => v !== 'ja');
  return [
    { name: 'Quarter-final', opp: { car: pick().id, lv: lvl(1), ai: 3 }, venue: venues[(r() * venues.length) | 0], distance: 'quarter' },
    { name: 'Semi-final', opp: { car: pick().id, lv: lvl(2), ai: 4 }, venue: venues[(r() * venues.length) | 0], distance: 'eighth' },
    { name: 'Final', opp: { car: pick().id, lv: lvl(4), ai: 5 }, venue: venues[(r() * venues.length) | 0], distance: 'quarter' },
  ];
}
export const knockoutPrize = cls => Math.round(reward(cls) * 2.5 / 50) * 50;

// Daily Challenge: a stock car from the roster, a venue and distance, and a target time.
export function dailyChallenge(d = new Date()) {
  const seed = daySeed(d), r = seeded(seed);
  const pool = CARS.filter(c => !c.ownerGift);
  const car = pool[(r() * pool.length) | 0];
  const venue = Object.keys(VENUES)[(r() * Object.keys(VENUES).length) | 0];
  const distance = ['eighth', 'quarter', 'quarter', 'half'][(r() * 4) | 0];
  const bc = buildCar(car, {}, defaultTune(car), VENUES[venue]);
  const robot = simulateRun(bc, { distance, nitrous: false }).result.player.et;
  return { id: 'd' + seed, car: car.id, venue, distance, target: +(robot * 1.03).toFixed(3), robot, reward: Math.round(reward(classOf(car)) * 1.2 / 50) * 50 };
}

// Bracket racing: each car runs to its own dial-in; quickest reaction to the dial wins, breaking out loses.
export function bracketWinner(pEt, pDial, oEt, oDial) {
  const pm = pEt == null ? Infinity : pEt - pDial, om = oEt == null ? Infinity : oEt - oDial;
  const pBO = pm < 0, oBO = om < 0;
  if (pBO && !oBO) return 'ai'; if (oBO && !pBO) return 'player';
  if (pBO && oBO) return Math.abs(pm) <= Math.abs(om) ? 'player' : 'ai';   // both broke out: smaller breakout wins
  return pm <= om ? 'player' : 'ai';
}
