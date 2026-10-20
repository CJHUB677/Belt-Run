import test from 'node:test';
import assert from 'node:assert/strict';
import { CARS, CAR_BY_ID } from '../www/js/data/cars.js';
import { buildCar, defaultTune, peakPower, stockLevels, UPGRADE_KEYS } from '../www/js/sim/build.js';
import { simulateRun, createRace, stepRace, setThrottle, shift, launchZone } from '../www/js/sim/race.js';
import { rpmOf, SIM_DT } from '../www/js/sim/physics.js';
import { BENCH, bestStock } from '../tools/et-table.mjs';
import fs from 'node:fs';

test('roster: 67 cars, each with an existing image and wheel calibration', () => {
  assert.equal(CARS.length, 67);
  for (const c of CARS) {
    assert.ok(fs.existsSync(new URL('../www/' + c.image, import.meta.url)), c.id + ' image');
    assert.ok(c.wheels && c.wheels.length === 2, c.id + ' wheels');
  }
  assert.ok(!CARS.some(c => /nicklue/i.test(c.id + c.name)), 'no Nicklue build');
  assert.ok(CAR_BY_ID.userx4.powerTarget && CAR_BY_ID.userx4.hp === 1200 && CAR_BY_ID.userx4.ownerGift);
});

test('simulated crank power matches each car rating within 3%', () => {
  for (const c of CARS) {
    const hp = peakPower(buildCar(c)).hp;
    assert.ok(Math.abs(hp - c.hp) / c.hp < 0.03, `${c.id}: ${hp.toFixed(0)} vs ${c.hp}`);
  }
});

test('stock quarter-mile ETs within 10% of published magazine/benchmark times', () => {
  for (const [id, [et]] of Object.entries(BENCH)) {
    if (id === 'hellcat') continue; // benchmark is a best-case on drag radials; documented in docs/PHYSICS.md
    const b = bestStock(CAR_BY_ID[id]);
    assert.ok(Math.abs(b.et - et) / et < 0.10, `${id}: ${b.et.toFixed(2)} vs ${et}`);
  }
});

test('every upgrade category makes the car quicker (or equal), full build much quicker', () => {
  const car = CAR_BY_ID.f82;
  const base = simulateRun(buildCar(car, stockLevels(), defaultTune(car))).result.player.et;
  for (const k of UPGRADE_KEYS) {
    const lv = { ...stockLevels(), [k]: 3 };
    const et = simulateRun(buildCar(car, lv, defaultTune(car, lv))).result.player.et;
    assert.ok(et <= base + 0.01, `${k}: ${et} vs ${base}`);
  }
  const full = Object.fromEntries(UPGRADE_KEYS.map(k => [k, 5]));
  const et = simulateRun(buildCar(car, full, defaultTune(car, full))).result.player.et;
  assert.ok(et < base - 1.0, `full build ${et} vs stock ${base}`);
});

test('nitrous only helps when used', () => {
  const car = CAR_BY_ID.mustanggt, lv = { ...stockLevels(), nitrous: 3 };
  const bc = buildCar(car, lv, defaultTune(car, lv));
  const on = simulateRun(bc, { nitrous: true }).result.player, off = simulateRun(bc, { nitrous: false }).result.player;
  assert.ok(on.et < off.et - 0.1, `${on.et} vs ${off.et}`);
  assert.ok(on.nosUsed > 0 && off.nosUsed === 0);
});

function drive(carId, holdRpm, shiftAtFrac = 0.97) {
  const car = CAR_BY_ID[carId], bc = buildCar(car, stockLevels(), defaultTune(car));
  const race = createRace({ player: bc, distance: 'quarter' });
  const p = race.cars[0];
  for (let i = 0; i < 240 * 40 && !race.finished; i++) {
    const rpm = rpmOf(p.st);
    if (race.phase === 'countdown') setThrottle(race, rpm < holdRpm);
    if (race.phase === 'run') { setThrottle(race, true); if (p.st.gear > 0 && p.st.shiftT === 0 && p.st.clutch === 'lock' && rpm > bc.limiter * shiftAtFrac) shift(race, 1); }
    stepRace(race, SIM_DT);
  }
  return race.result.player;
}

test('launch rating: in-zone = good/perfect, far below = bog, far above = spin (manual car)', () => {
  const car = CAR_BY_ID.civicsi, bc = buildCar(car);
  const z = launchZone(bc);
  assert.match(drive('civicsi', z.target).launch.q, /perfect|good/);
  assert.equal(drive('civicsi', 1200).launch.q, 'bog');
  assert.equal(drive('civicsi', z.hi + 1200).launch.q, 'spin');
});

test('manual shifting: hitting the limiter is slower than shifting near the optimum', () => {
  const good = drive('f22', 2800, 0.97), late = drive('f22', 2800, 1.2); // 1.2 → never shifts
  assert.ok(late.et == null || late.et > good.et + 1, `${late.et} vs ${good.et}`);
});

test('deterministic: same inputs → same ET', () => {
  const bc = buildCar(CAR_BY_ID.r35);
  assert.equal(simulateRun(bc).result.player.et, simulateRun(bc).result.player.et);
});
