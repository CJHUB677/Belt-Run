// Save game + economy. One localStorage key; every write is guarded (private mode, quota).
import { CARS, CAR_BY_ID, STARTING_CASH, STARTER_CARS, upgradePrice, carLocked, reward, quickReward, classOf, ALL_EVENTS } from '../data/career.js';
import { PAINTS, WHEELS, STANCES, GLOWS, FLAMES, defaultLook } from '../render/sprites.js';
import { UPGRADE_KEYS, MAX_LEVEL, stockLevels, defaultTune, sanitizeTune, buildCar } from '../sim/build.js';

export const SAVE_KEY = 'beltrun-mobile-v1';
const OLD_KEYS = ['beltrun-67-v1', 'beltrun-save-v2', 'beltrun-save-v1'];

export function freshSave() {
  const owned = {};
  for (const id of STARTER_CARS) owned[id] = { lv: stockLevels(), tune: defaultTune(CAR_BY_ID[id]) };
  return {
    v: 1, cash: STARTING_CASH, wins: 0, losses: 0, current: 'userx4', owned, done: {},
    best: {}, history: [],
    settings: { muted: false, engineVol: 0.8, fxVol: 0.7, units: 'mph', haptics: true, autoShift: false, gauge: 'classic', gaugeColor: 'red' },
    created: Date.now(),
  };
}

function storage() { try { return globalThis.localStorage || null; } catch { return null; } }

export function load() {
  const ls = storage();
  let s = null;
  try { const raw = ls?.getItem(SAVE_KEY); if (raw) s = JSON.parse(raw); } catch { s = null; }
  if (!s) {
    s = freshSave();
    // Carry over cash/wins from the previous BELT RUN editions as a welcome bonus (cars differ, so not the garage).
    for (const k of OLD_KEYS) {
      try { const o = JSON.parse(ls?.getItem(k) || 'null'); if (o && typeof o.cash === 'number') { s.cash += Math.min(50000, Math.max(0, Math.round(o.cash * 0.25))); s.legacy = k; break; } } catch {}
    }
  }
  return migrate(s);
}

export function migrate(s) {
  const f = freshSave();
  const out = { ...f, ...s, settings: { ...f.settings, ...(s.settings || {}) } };
  out.owned = {};
  for (const [id, o] of Object.entries(s.owned || {})) {
    const car = CAR_BY_ID[id]; if (!car) continue;
    const lv = { ...stockLevels() }; for (const k of UPGRADE_KEYS) lv[k] = Math.max(0, Math.min(MAX_LEVEL, (o.lv?.[k] | 0)));
    out.owned[id] = { lv, tune: sanitizeTune(car, lv, o.tune || {}), look: cleanLook(o.look) };
  }
  if (!out.owned.userx4) out.owned.userx4 = { lv: stockLevels(), tune: defaultTune(CAR_BY_ID.userx4) };   // the gift is always yours
  if (!out.owned[out.current]) out.current = 'userx4';
  out.cash = Math.max(0, Math.round(+out.cash || 0));
  out.history = (out.history || []).slice(-30);
  return out;
}

// Paint & style (see render/sprites.js for the options). Unknown values fall back to factory.
export const LOOK_OPTIONS = { paint: Object.keys(PAINTS), wheels: Object.keys(WHEELS), stance: Object.keys(STANCES), glow: Object.keys(GLOWS), flame: Object.keys(FLAMES) };
export const LOOK_PRICES = { paint: 600, wheels: 450, stance: 300, glow: 250, flame: 150 };
export function cleanLook(l) { const d = defaultLook(), o = {}; for (const k of Object.keys(d)) o[k] = LOOK_OPTIONS[k].includes(l?.[k]) ? l[k] : d[k]; return o; }
export function buyLook(s, key, value, id = s.current) {
  const o = s.owned[id]; if (!o || !LOOK_OPTIONS[key]?.includes(value)) return { ok: false, reason: 'bad' };
  o.look = cleanLook(o.look);
  if (o.look[key] === value) return { ok: true, price: 0 };
  const free = value === defaultLook()[key], price = free ? 0 : LOOK_PRICES[key];
  if (s.cash < price) return { ok: false, reason: 'cash' };
  s.cash -= price; o.look[key] = value;
  return { ok: true, price };
}

export function save(s) { try { storage()?.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch { return false; } }
export function resetSave() { const s = freshSave(); save(s); return s; }

export const currentCar = s => CAR_BY_ID[s.current];
export const ownedEntry = (s, id = s.current) => s.owned[id];
export function builtCar(s, id = s.current, env) { const o = s.owned[id]; return buildCar(CAR_BY_ID[id], o.lv, o.tune, env); }

export function buyCar(s, id) {
  const car = CAR_BY_ID[id];
  if (!car || s.owned[id]) return { ok: false, reason: 'owned' };
  const lock = carLocked(car, s); if (lock) return { ok: false, reason: lock };
  if (s.cash < car.price) return { ok: false, reason: 'cash' };
  s.cash -= car.price;
  s.owned[id] = { lv: stockLevels(), tune: defaultTune(car), look: cleanLook(car.look) };
  s.current = id;
  return { ok: true };
}
export const sellValue = (s, id) => { const car = CAR_BY_ID[id], o = s.owned[id]; if (!o || car.ownerGift || STARTER_CARS.includes(id) && !car.price) return 0; let spent = 0; for (const k of UPGRADE_KEYS) for (let st = 1; st <= o.lv[k]; st++) spent += upgradePrice(car, k, st); return Math.round((car.price * 0.6 + spent * 0.4) / 50) * 50; };
export function sellCar(s, id) {
  if (!s.owned[id] || CAR_BY_ID[id].ownerGift || Object.keys(s.owned).length <= 1) return { ok: false };
  s.cash += sellValue(s, id); delete s.owned[id];
  if (s.current === id) s.current = 'userx4';
  return { ok: true };
}

export function nextUpgradePrice(s, key, id = s.current) {
  const lv = s.owned[id].lv[key]; if (lv >= MAX_LEVEL) return null;
  return upgradePrice(CAR_BY_ID[id], key, lv + 1);
}
export function buyUpgrade(s, key, id = s.current) {
  const p = nextUpgradePrice(s, key, id);
  if (p == null) return { ok: false, reason: 'max' };
  if (s.cash < p) return { ok: false, reason: 'cash' };
  const o = s.owned[id];
  s.cash -= p; o.lv[key]++;
  // keep tune valid and give the new nitrous bottle its full duration
  const car = CAR_BY_ID[id];
  o.tune = sanitizeTune(car, o.lv, key === 'nitrous' ? { ...o.tune, nosSeconds: 99 } : key === 'tires' && o.lv.tires === 3 ? { ...o.tune, tirePsi: 18 } : o.tune);
  return { ok: true, price: p };
}
export function setTune(s, tune, id = s.current) { const o = s.owned[id]; o.tune = sanitizeTune(CAR_BY_ID[id], o.lv, { ...o.tune, ...tune }); return o.tune; }

// Which class does the player's current build run in? Stock class, bumped by upgrade investment,
// so upgraded cars can step into higher ladders (they can always race their own class or above).
export const carClass = id => classOf(CAR_BY_ID[id]);

export function eventAvailable(s, ev) {
  const car = CAR_BY_ID[s.current];
  if (ev.honda) { if (car.make !== 'Honda') return { ok: false, reason: 'Honda only' }; }
  else if (classOf(car) > ev.cls) return { ok: false, reason: `Class ${ev.cls} or lower` };
  const list = ev.honda ? ALL_EVENTS().filter(e => e.honda) : ALL_EVENTS().filter(e => e.cls === ev.cls && !e.honda);
  const i = list.findIndex(e => e.id === ev.id);
  if (i > 0 && !s.done[list[i - 1].id]) return { ok: false, reason: 'Win the previous event' };
  return { ok: true };
}

// Apply a finished race. kind: 'event' | 'quick' | 'test'.
export function applyResult(s, { kind, ev = null, cls = 1, result, carId = s.current, distance = 'quarter', bet = 0, purse = null }) {
  const won = result.winner === 'player';
  let payout = 0, firstWin = false;
  if (kind === 'event') {
    if (won) { firstWin = !s.done[ev.id]; payout = firstWin ? ev.reward : Math.round(ev.reward * 0.25 / 25) * 25; s.done[ev.id] = true; }
  } else if (kind === 'quick' || kind === 'online') {
    payout = won ? (purse ?? quickReward(cls)) + bet : -Math.min(bet, s.cash);
  } else if (kind === 'mode') {
    payout = won ? (purse ?? 0) : 0;
  }
  if (kind !== 'test') { if (won) s.wins++; else s.losses++; }
  s.cash = Math.max(0, s.cash + payout);
  const et = result.player.et;
  let pb = false;
  if (et && distance === 'quarter') { const b = s.best[carId]; if (!b || et < b.et) { s.best[carId] = { et: +et.toFixed(3), trap: +(result.player.trap || 0).toFixed(1) }; pb = true; } }
  s.history.push({ t: Date.now(), car: carId, kind, ev: ev?.id || null, won, et: et ? +et.toFixed(3) : null, payout });
  s.history = s.history.slice(-30);
  return { won, payout, firstWin, pb };
}

export { CARS, CAR_BY_ID, reward };
