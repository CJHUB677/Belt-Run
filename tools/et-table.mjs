import { CARS } from '../www/js/data/cars.js';
import { buildCar, defaultTune, peakPower } from '../www/js/sim/build.js';
import { simulateRun } from '../www/js/sim/race.js';
export const BENCH = { f22: [12.7, 111], g42: [12.1, 114], r35: [11.2, 123.4], x3m: [11.6, 119], x4m: [11.6, 119], f82: [12.0, 119], g80: [11.0, 124], m5: [10.9, 130], ttrs: [11.6, 119], r8: [10.9, 129], trackhawk: [12.0, 115], hellcat: [10.9, 127], civicsi: [15.7, 91], typer: [13.5, 106], s2000: [14.2, 98.1], m340stock: [12.2, 112] };
export function bestStock(c) {
  let best = null;
  for (let lr = 1500; lr <= c.phys.engine.redline * 0.9; lr += 250) {
    const bc = buildCar(c, {}, { ...defaultTune(c), launchRpm: lr });
    const s = simulateRun(bc, { nitrous: false }).result.player;
    if (s.et && (!best || s.et < best.et)) best = { ...s, lr };
  }
  return best;
}
if (process.argv[1].endsWith('et-table.mjs')) {
  for (const c of CARS) {
    const b = bestStock(c), bm = BENCH[c.id], pk = peakPower(buildCar(c));
    console.log(c.id.padEnd(14), b.et.toFixed(2).padStart(6), b.trap.toFixed(1).padStart(6), (bm ? `${bm[0]} @${bm[1]}  Δ${((b.et - bm[0]) / bm[0] * 100).toFixed(1)}%` : '').padEnd(26), '60ft', b.ft60.toFixed(2), 'lr', b.lr, b.launch.q, 'hp', Math.round(pk.hp), c.phys.trans.type);
  }
}
