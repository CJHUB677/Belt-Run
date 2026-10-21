// Generates www/js/data/cars.js from the 67-car roster (tools/source-data.js, the previous
// game's data) plus measured wheel geometry (tools/source-wheels.js). Each car gets a full physics
// spec for the realistic longitudinal model. Fields marked `est` are game estimates, not sourced.
const fs = require('node:fs'), path = require('node:path');
const R = require('./source-data.cjs'), W = require('./source-wheels.cjs'), BUILDS = require('./source-builds.cjs');

const DCT = new Set(['r35', 'ttrs', 'r8', 'f82', 'm3f80', 'm3e92', 'amggtr', 'turbo992', 'gt3rs', 'huracan', 'pista', 'mclaren', 'z06c8', 'gt500', 'rs3', 'golfr', 'buj']);
const AT8M = new Set(['x3m', 'x4m', 'g80', 'm5', 'm4g82', 'm5cs', 'x5m', 'userx4', 'c63s', 'e63s', 'glc63s', 'urus', 'rs6', 'rs7', 'rs5']);
const MID = new Set(['r8', 'huracan', 'pista', 'mclaren', 'z06c8']), REAR = new Set(['turbo992', 'gt3rs']);
const VTEC = { civicsi: 5600, s2000: 6000, ek9: 5800, dc2: 5700, dc5: 5800 };

function spec(c) {
  const e = (c.engine || '').toLowerCase();
  const type = c.na ? 'na' : /supercharged/.test(e) ? 'supercharged' : c.bigTurbo ? 'single-turbo' : /twin-turbo|twin turbo/.test(e) ? 'twin-turbo' : 'turbo';
  const disp = +((/(\d\.\d)\s*l/.exec(e) || [])[1] || (/rotary/.test(e) ? 1.3 : 3.0));
  const kW = c.hp * 0.745699872;
  const red = c.red, peak = Math.min(c.peak, red - 100);
  let NmRpm;
  if (type === 'na') { const t = Math.round(peak * 0.78 / 100) * 100; NmRpm = [t, t]; }
  else if (type === 'supercharged') NmRpm = [Math.round(peak * 0.62 / 100) * 100, Math.round(peak * 0.78 / 100) * 100];
  else if (type === 'single-turbo') NmRpm = [Math.round(Math.max(4800, peak * 0.68) / 100) * 100, Math.round(peak * 0.9 / 100) * 100];
  else NmRpm = [type === 'twin-turbo' ? 2200 : 1900, Math.round(Math.max(4200, peak * 0.78) / 100) * 100];
  // Torque × rpm may never exceed rated power: end the torque plateau where they meet.
  const rpmAtPower = kW * 1000 / c.tq * 60 / (2 * Math.PI);
  NmRpm[1] = Math.min(NmRpm[1], Math.floor(rpmAtPower / 100) * 100);
  NmRpm[0] = Math.min(NmRpm[0], NmRpm[1]);
  const boost = type === 'na' ? null
    : type === 'supercharged' ? { naFrac: 0.55, scFull: Math.round(peak * 0.65) }
    : type === 'single-turbo' ? { naFrac: 0.42, spool: [3300, 5000], rate: 3.4, lcBoost: 0.5 }
    : type === 'twin-turbo' ? { naFrac: 0.50, spool: [1500, 2600], rate: 6, lcBoost: 0.4 }
    : { naFrac: 0.52, spool: [1400, 2400], rate: 6.5, lcBoost: 0.35 };
  if (boost && /rotary/.test(e)) boost.spool = [2200, 3600];
  const n = c.ratios.length;
  const trans = c.trans === 'SEQ' || c.trans === 'DCT' ? 'DCT' : c.trans === 'MT' ? 'MT' : DCT.has(c.id) ? 'DCT' : AT8M.has(c.id) ? 'AT8M' : n <= 6 ? 'MT' : 'AT8';
  const wdf = c.wdf != null ? c.wdf : c.drive === 'FWD' ? 0.62 : MID.has(c.id) ? 0.42 : REAR.has(c.id) ? 0.38 : c.suv ? 0.54 : 0.53;
  const cgH = c.cgH != null ? c.cgH : c.id === 'trx' ? 0.78 : c.suv ? 0.62 : MID.has(c.id) ? 0.44 : 0.49;
  const rearShare = c.rearShare != null ? c.rearShare : c.drive === 'RWD' ? 1 : c.drive === 'FWD' ? 0 : MID.has(c.id) || REAR.has(c.id) ? 0.7 : c.id === 'r35' || c.id === 'r32' || c.id === 'r34' ? 0.7 : 0.6;
  // Wheelbase from the measured image: axle distance in tire diameters × real tire diameter.
  const wh = W[c.base || c.id];
  let WB = 2.75;
  if (wh) { const [rr, ff] = wh; const diaPx = (rr[2] + ff[2]) * 1024; WB = +(((ff[0] - rr[0]) * 1536) / diaPx * (2 * c.radius)).toFixed(3); }
  const factoryLC = trans !== 'MT' || ['r35', 'typer'].includes(c.id);
  return {
    engine: { kW: +kW.toFixed(1), kWrpm: peak, Nm: c.tq, NmRpm, redline: red, idle: type === 'na' && red > 8200 ? 950 : 800, type, dispL: disp, boost, vtec: VTEC[c.id] || 0 },
    trans: { type: trans, ratios: c.ratios.slice(), final: c.fd },
    ...(c.radials ? { radial: true } : {}), ...(c.grip ? { grip: c.grip } : {}), ...(c.trans === 'SEQ' ? { seq: true } : {}),
    massKg: c.mass, wdf, cgH, cdA: c.cda, tireR: c.radius, WB, drive: c.drive, rearShare, factoryLC,
    est: ['NmRpm', 'boost', 'trans.type', 'wdf', 'cgH', 'WB(from art)', ...(c.provisional ? ['hp/tq provisional'] : [])],
  };
}

const keep = ['id', 'make', 'name', 'year', 'engine', 'hp', 'tq', 'mass', 'drive', 'red', 'price', 'group', 'color', 'source', 'suv', 'na', 'wins', 'fictional', 'bigTurbo', 'ownerGift', 'powerTarget', 'installedTire', 'notes', 'buildNote', 'provisional', 'market', 'bumperDelete', 'fuelNote', 'base', 'look'];
const byId = Object.fromEntries(R.cars.map(c => [c.id, c]));
const builds = BUILDS.map(b => { const base = byId[b.base]; if (!base) throw new Error('no base ' + b.base); return { ...base, source: null, notes: undefined, market: undefined, provisional: undefined, fictional: true, ...b }; });
const cars = [...R.cars, ...builds].map(c => {
  const o = {}; for (const k of keep) if (c[k] !== undefined) o[k] = c[k];
  o.image = 'assets/cars/' + (c.base || c.id) + '.webp';
  o.thumb = 'assets/thumbs/' + (c.base || c.id) + '.webp';
  o.wheels = W[c.base || c.id] || null;
  o.phys = spec(c);
  return o;
});
const out = `// GENERATED by tools/gen-cars.cjs — do not edit by hand.\n// Roster: 67 cars from the BELT RUN 67-car edition plus fictional tuner builds (tools/source-builds.cjs). Factory hp/torque per that roster's sources;\n// physics fields listed in phys.est are game estimates.\nexport const CARS = ${JSON.stringify(cars, null, 0).replace(/},{"id"/g, '},\n{"id"')};\nexport const CAR_BY_ID = Object.fromEntries(CARS.map(c => [c.id, c]));\n`;
fs.writeFileSync(path.join(__dirname, '../www/js/data/cars.js'), out);
console.log('cars.js:', cars.length, 'cars');
