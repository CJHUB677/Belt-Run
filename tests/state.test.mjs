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
  for (let c = 1; c <= 10; c++) { const l = ladder(c); assert.equal(l.length, 13); assert.ok(l[12].boss); assert.ok(l.filter(e => e.rival && !e.boss).length === 2); }
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

import { STORY } from '../www/js/data/story.js';
import { VENUES, dailyChallenge, knockoutRounds, bracketWinner } from '../www/js/data/career.js';
import { cleanLook, buyLook } from '../www/js/game/state.js';
test('story: 10 chapters, each with intro, two rivals, boss and outro; every venue used', () => {
  for (let c = 1; c <= 10; c++) { const ch = STORY[c]; assert.ok(ch.intro.length && ch.rivals.length === 2 && ch.boss.intro.length && ch.outro.length, 'chapter ' + c); }
  const used = new Set(Array.from({ length: 10 }, (_, i) => ladder(i + 1)).flat().map(e => e.venue));
  for (const v of Object.keys(VENUES)) if (v !== 'ja') assert.ok(used.has(v), v);
});
test('modes: daily challenge is stable for a day, knockout has 3 rounds, bracket breakout rules', () => {
  const d = new Date(2026, 9, 20); assert.deepEqual(dailyChallenge(d), dailyChallenge(d));
  assert.equal(knockoutRounds(5, 7).length, 3);
  assert.equal(bracketWinner(10.40, 10.35, 10.30, 10.20), 'player');   // 0.05 vs 0.10 over dial
  assert.equal(bracketWinner(10.30, 10.35, 10.50, 10.20), 'ai');       // player broke out
});
test('style: cleanLook rejects junk, buying charges once and factory is free', () => {
  assert.deepEqual(cleanLook({ paint: 'nope', wheels: 'gold' }), { paint: 'factory', wheels: 'gold', stance: 'stock', glow: 'off', flame: 'blue' });
  const s = freshSave(); s.cash = 1000;
  assert.ok(buyLook(s, 'paint', 'red').ok); assert.equal(s.cash, 400);
  assert.equal(buyLook(s, 'paint', 'red').price, 0);
  assert.equal(buyLook(s, 'wheels', 'gold').ok, false);                  // can't afford 450
  assert.ok(buyLook(s, 'paint', 'factory').ok); assert.equal(s.cash, 400);
});
