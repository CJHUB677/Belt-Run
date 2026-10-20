import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { CAR_BY_ID } from '../www/js/data/cars.js';
import { buildCar, defaultTune, stockLevels } from '../www/js/sim/build.js';
import { createRace, stepRace, setThrottle, shift } from '../www/js/sim/race.js';
import { rpmOf } from '../www/js/sim/physics.js';
import { createTracker, controls, buildProfile } from '../www/js/audio/controls.js';
createRequire(import.meta.url)('../www/js/audio/profiles.js');
const { profileFor } = globalThis.EngineProfiles;

function run(id, lv = {}, tc = 'sport') {
  const car = CAR_BY_ID[id], bc = buildCar(car, lv, { ...defaultTune(car, { ...stockLevels(), ...lv }), tc });
  const race = createRace({ player: bc }), p = race.cars[0], tr = createTracker(bc);
  const log = { launch: 0, maxBoost: 0, events: [], cutSeen: false, loadSeen: false, slip: 0 };
  while (!race.finished) {
    const rpm = rpmOf(p.st);
    if (race.phase !== 'run') setThrottle(race, bc.hasLaunchControl || rpm < bc.launchRpm);
    else { setThrottle(race, true); if (p.st.gear > 0 && p.st.gear < bc.ratios.length && p.st.shiftT === 0 && p.st.clutch === 'lock' && rpm > bc.limiter * 0.95) shift(race, 1); }
    stepRace(race);
    const { c, events } = controls(tr, p, race.phase === 'run' ? 'race' : 'stage');
    log.launch = Math.max(log.launch, c.launch); log.maxBoost = Math.max(log.maxBoost, c.boost); log.events.push(...events);
    log.cutSeen ||= c.cut === 1; log.loadSeen ||= c.load === 1; log.slip = Math.max(log.slip, c.slip);
    assert.ok(Number.isFinite(c.rpm) && c.rpm >= bc.idle - 1 && c.rpm <= bc.limiter + 500);
  }
  return log;
}

test('turbo DCT car: launch control, boost from the physics, shift clunks, blow-off on the shift cut', () => {
  const L = run('f82');
  assert.equal(L.launch, 1); assert.ok(L.maxBoost > 0.9); assert.ok(L.loadSeen && L.cutSeen);
  assert.ok(L.events.filter(e => e === 'shift').length >= 3, JSON.stringify(L.events)); assert.ok(L.events.includes('bov'));
});
test('NA manual car: no boost, no blow-off', () => {
  const L = run('s2000');
  assert.equal(L.maxBoost, 0); assert.ok(!L.events.includes('bov')); assert.equal(L.launch, 0);
});
test('wheelspin in the physics reaches the tire-squeal control', () => {
  assert.ok(run('hellcat', {}, 'off').slip > 0.2);
});
test('menu mode silences the engine', () => {
  const bc = buildCar(CAR_BY_ID.r35), race = createRace({ player: bc });
  assert.equal(controls(createTracker(bc), race.cars[0], 'menu').c.on, 0);
});
test('turbo-kit upgrade on an NA engine switches its sound to turbo, with the physics spool window', () => {
  const car = CAR_BY_ID.civicsi;
  assert.equal(buildProfile(profileFor, buildCar(car)).ind.type, 'na');
  const bc = buildCar(car, { power: 2 }), p = buildProfile(profileFor, bc);
  assert.equal(p.ind.type, 'turbo'); assert.deepEqual(p.ind.spool, [bc.spool0, bc.spool1]);
});
