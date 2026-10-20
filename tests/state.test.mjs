import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, migrate, buyCar, buyUpgrade, applyResult, eventAvailable, sellCar } from '../www/js/game/state.js';
import { ALL_EVENTS, ladder, classOf, CAR_BY_ID, hondaCup } from '../www/js/data/career.js';

test('fresh save: X4 gift owned, starters owned, cash', () => {
  const s = freshSave();
  assert.ok(s.owned.userx4 && s.owned.f22 && s.owned.civicsi);
  assert.equal(s.current, 'userx4');
});
test('every class has 7 events ending in a boss; Honda Cup is Honda-only', () => {
  for (let c = 1; c <= 10; c++) { const l = ladder(c); assert.equal(l.length, 7); assert.ok(l[6].boss); }
  for (const e of hondaCup()) assert.equal(CAR_BY_ID[e.opp.car].make, 'Honda');
  const ids = ALL_EVENTS().map(e => e.id); assert.equal(new Set(ids).size, ids.length);
});
test('buying: cash, locks, upgrade economy', () => {
  const s = freshSave(); s.cash = 1e6;
  assert.equal(buyCar(s, 'buj').ok, false);        // needs 3 wins
  s.wins = 3; assert.equal(buyCar(s, 'buj').ok, true);
  const before = s.cash; const r = buyUpgrade(s, 'engine'); assert.ok(r.ok && s.cash === before - r.price);
  assert.equal(s.owned.buj.lv.engine, 1);
  assert.equal(sellCar(s, 'userx4').ok, false);    // gift can't be sold
});
test('event flow: ladder order, first-win prize once, class gate', () => {
  const s = freshSave(); s.current = 'civicsi';
  const l = ladder(classOf(CAR_BY_ID.civicsi));
  assert.equal(eventAvailable(s, l[1]).ok, false);
  const win = { winner: 'player', player: { et: 15.9, trap: 88 } };
  const a = applyResult(s, { kind: 'event', ev: l[0], result: win });
  assert.ok(a.firstWin && a.payout === l[0].reward);
  const b = applyResult(s, { kind: 'event', ev: l[0], result: win });
  assert.ok(!b.firstWin && b.payout < l[0].reward);
  assert.equal(eventAvailable(s, l[1]).ok, true);
  s.current = 'pista'; s.owned.pista = s.owned.civicsi;
  assert.equal(eventAvailable(s, ladder(1)[0]).ok, false);
});
test('migrate repairs bad saves', () => {
  const s = migrate({ cash: -5, current: 'nope', owned: { f22: { lv: { engine: 99 } }, bogus: {} } });
  assert.equal(s.cash, 0); assert.equal(s.current, 'userx4'); assert.equal(s.owned.f22.lv.engine, 5); assert.ok(!s.owned.bogus);
});
