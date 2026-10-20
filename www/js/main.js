// BELT RUN: DRAG LEGENDS — app shell: garage, race select, upgrades, tuning, dealer, settings.
import { CARS, CAR_BY_ID, VENUES, CLASS_NAMES, classOf, stockET, ladder, hondaCup, quickReward, reward, carLocked, upgradePrice, STORY, MODE_INFO, knockoutRounds, knockoutPrize, dailyChallenge, bracketWinner } from './data/career.js';
import { CREW, HONDA_STORY } from './data/story.js';
import { PAINTS, WHEELS, STANCES, GLOWS, FLAMES } from './render/sprites.js';
import { cleanLook, buyLook, LOOK_PRICES } from './game/state.js';
import { load, save, resetSave, buyCar, sellCar, sellValue, buyUpgrade, nextUpgradePrice, setTune, eventAvailable, applyResult } from './game/state.js';
import { buildCar, defaultTune, tuneLimits, dynoCurve, peakPower, UPGRADE_KEYS, UPGRADE_INFO, MAX_LEVEL, HP_PER_KW, gearSpeeds, nitrousSpec } from './sim/build.js';
import { simulateRun, DIST_LABEL, MS_TO_MPH } from './sim/race.js';
import { drawCar, loadSprite, onSpriteLoad } from './render/sprites.js';
import { startRace, haptic } from './game/raceScreen.js';
import * as Audio from './audio/audio.js';
import { createOnline } from './net/online.js';

const $ = id => document.getElementById(id);
const money = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const fmt3 = t => (t == null || !isFinite(t) ? '—' : t.toFixed(3));
const thumb = c => `assets/thumbs/${c.id}.webp`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

let S = load();
const persist = () => { if (!save(S)) toast('Storage unavailable — progress lasts this session only'); refreshTop(); };
Audio.applySettings(S.settings);

// ───────────────────────── helpers ─────────────────────────
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }
function refreshTop() {
  $('cash').textContent = Math.round(S.cash).toLocaleString('en-US');
  $('wins').textContent = S.wins;
  $('btn-mute').textContent = S.settings.muted ? '🔇' : '🔊';
}
const speedU = v => S.settings.units === 'kmh' ? `${Math.round(v * 3.6)} km/h` : `${(v * MS_TO_MPH).toFixed(1)} mph`;
const trapU = mph => mph == null ? '—' : S.settings.units === 'kmh' ? (mph * 1.609344).toFixed(1) + '<small> km/h</small>' : mph.toFixed(1) + '<small> mph</small>';
const carBuild = (id = S.current, env) => { const o = S.owned[id]; return buildCar(CAR_BY_ID[id], o.lv, o.tune, env); };
const hpOf = bc => Math.round(peakPower(bc).hp);
const nmOf = bc => Math.round(Math.max(...dynoCurve(bc, 100).map(p => p.Nm)));
const avgLevel = lv => UPGRADE_KEYS.reduce((a, k) => a + lv[k], 0) / UPGRADE_KEYS.length;
const robotET = (bc, distance = 'quarter') => simulateRun(bc, { distance, nitrous: true }).result.player;

function modal(html, onMount) {
  $('modal-card').innerHTML = html; $('modal').hidden = false;
  onMount?.($('modal-card'));
}
const closeModal = () => { $('modal').hidden = true; };
$('modal').addEventListener('pointerdown', e => { if (e.target === $('modal') && !$('modal').dataset.sticky) closeModal(); });

// ───────────────────────── navigation ─────────────────────────
const TITLES = { garage: '', races: 'Race', upgrades: 'Upgrades', tune: 'Tuning', dealer: 'Dealer', mycars: 'My Cars', settings: 'Settings', style: 'Paint & Style' };
let screen = 'garage';
function go(name) {
  screen = name;
  for (const k of Object.keys(TITLES)) $('scr-' + k).hidden = k !== name;
  $('nav-back').hidden = name === 'garage';
  $('screen-title').textContent = TITLES[name] && name !== 'garage' ? TITLES[name] + (['upgrades', 'tune', 'style'].includes(name) ? ' · ' + CAR_BY_ID[S.current].name : '') : '';
  ({ garage: renderGarage, races: renderRaces, upgrades: renderUpgrades, tune: renderTune, dealer: renderDealer, mycars: renderMyCars, settings: renderSettings, style: renderStyle })[name]();
  Audio.uiClick();
}
$('nav-back').onclick = () => go('garage');
$('btn-settings').onclick = () => go('settings');
$('btn-mute').onclick = () => { S.settings.muted = !S.settings.muted; Audio.applySettings(S.settings); if (!S.settings.muted) Audio.unlock(); persist(); };
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));

// ───────────────────────── garage ─────────────────────────
function ownedIds() { return Object.keys(S.owned).sort((a, b) => classOf(CAR_BY_ID[a]) - classOf(CAR_BY_ID[b]) || CAR_BY_ID[a].price - CAR_BY_ID[b].price); }
function cycle(d) { const ids = ownedIds(), i = ids.indexOf(S.current); S.current = ids[(i + d + ids.length) % ids.length]; persist(); renderGarage(); haptic('light', S.settings); }
$('car-prev').onclick = () => cycle(-1); $('car-next').onclick = () => cycle(1);
let swipeX = null;
$('garage-canvas').addEventListener('pointerdown', e => { swipeX = e.clientX; });
$('garage-canvas').addEventListener('pointerup', e => { if (swipeX != null && Math.abs(e.clientX - swipeX) > 50) cycle(e.clientX < swipeX ? 1 : -1); swipeX = null; });

function paintGarageCar() {
  const cv = $('garage-canvas'), r = cv.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(devicePixelRatio || 1, 2.5);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height, car = CAR_BY_ID[S.current];
  // floor + spotlight
  const floorY = H * 0.86;
  const sp = g.createRadialGradient(W / 2, floorY, 10, W / 2, floorY, W * 0.5);
  sp.addColorStop(0, 'rgba(255,190,90,.22)'); sp.addColorStop(0.5, 'rgba(255,160,60,.06)'); sp.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sp; g.save(); g.translate(W / 2, floorY); g.scale(1, 0.18); g.beginPath(); g.arc(0, 0, W * 0.5, 0, 7); g.fill(); g.restore();
  const beam = g.createLinearGradient(0, 0, 0, floorY); beam.addColorStop(0, 'rgba(255,220,160,.10)'); beam.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = beam; g.beginPath(); g.moveTo(W * 0.44, 0); g.lineTo(W * 0.56, 0); g.lineTo(W * 0.82, floorY); g.lineTo(W * 0.18, floorY); g.fill();
  const width = Math.min(W * 0.62, (H * 0.78) * 2.9);
  drawCar(g, car, W / 2, floorY, width, { look: S.owned[S.current]?.look });
}
onSpriteLoad(id => { if (screen === 'garage' && id === S.current) paintGarageCar(); });
new ResizeObserver(() => { if (screen === 'garage') paintGarageCar(); }).observe($('garage-canvas'));

function statHTML(v, label, cls = '') { return `<div class="stat ${cls}"><b>${v}</b><span>${label}</span></div>`; }
function renderGarage() {
  const car = CAR_BY_ID[S.current], o = S.owned[S.current], bc = carBuild();
  $('g-make').textContent = `${car.year} ${car.make.toUpperCase()} · CLASS ${classOf(car)} ${CLASS_NAMES[classOf(car)]}`;
  $('g-name').textContent = car.name;
  const stage = avgLevel(o.lv);
  $('g-note').textContent = car.ownerGift ? 'Your car · 1,200 HP custom-build target (game estimate)' : car.fictional ? 'Special build · estimated performance' : stage ? `Upgraded · ${UPGRADE_KEYS.filter(k => o.lv[k]).length} of 7 systems` : car.engine;
  const best = S.best[S.current];
  $('g-stats').innerHTML = statHTML(hpOf(bc), 'HP', 'hi') + statHTML(nmOf(bc), 'NM') + statHTML(Math.round(bc.mass - 80), 'KG') + statHTML(car.drive, 'DRIVE') + statHTML(bc.transType === 'AT8M' ? 'AUTO' : bc.transType === 'AT8' ? 'AUTO' : bc.transType, 'TRANS') + statHTML(best ? best.et.toFixed(2) : '—', 'BEST ¼', best ? 'hi' : '');
  requestAnimationFrame(paintGarageCar);
  loadSprite(car);
}

// ───────────────────────── races ─────────────────────────
let raceTab = 'career', careerClass = null;
document.querySelectorAll('#race-tabs [data-tab]').forEach(b => b.onclick = () => { raceTab = b.dataset.tab; renderRaces(); Audio.uiClick(); });
function renderRaces() {
  document.querySelectorAll('#race-tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === raceTab));
  const body = $('race-body'), car = CAR_BY_ID[S.current], myCls = classOf(car);
  if (raceTab === 'career' || raceTab === 'honda') {
    let events, head = '';
    if (raceTab === 'honda') {
      events = hondaCup();
      head = `<div class="hint"><button class="btn" id="story-btn" style="display:inline-flex;height:30px;margin-right:6px">📖 STORY</button>Jamaica · Harbour Road. <b>Honda only.</b> ${car.make === 'Honda' ? 'Your ' + esc(car.name) + ' is eligible.' : 'Pick a Honda in My Cars (your Civic Si is a good start).'} </div>`;
    } else {
      if (careerClass == null || careerClass < myCls) careerClass = myCls;
      head = `<div class="chips">${Array.from({ length: 10 }, (_, i) => i + 1).map(c => { const done = ladder(c).filter(e => S.done[e.id]).length; return `<button data-cls="${c}" class="${c === careerClass ? 'on' : ''} ${c < myCls ? 'lock' : ''}">C${c} ${CLASS_NAMES[c]} <small>${done}/13</small></button>`; }).join('')}</div>
      <div class="chapter"><div><small>CHAPTER ${careerClass} · ${esc(STORY[careerClass].city)}</small><b>${esc(STORY[careerClass].title)}</b></div><button class="btn" id="story-btn">📖 STORY</button><span class="hint">${/^your /i.test(car.name) ? esc(car.name) : 'Your ' + esc(car.name)} runs in <b>Class ${myCls}</b> — enter its class or higher. Boss prize ${money(reward(careerClass) * 3)}.</span></div>`;
      events = ladder(careerClass);
    }
    body.innerHTML = head + `<div class="cards">${events.map(ev => {
      const oc = CAR_BY_ID[ev.opp.car], av = eventAvailable(S, ev), done = S.done[ev.id];
      return `<button class="ev ${ev.boss ? 'boss' : ''} ${done ? 'done' : ''} ${av.ok ? '' : 'locked'}" data-ev="${ev.id}">
        ${done ? '<span class="badge go">✓ WON</span>' : ev.boss ? '<span class="badge gold">BOSS</span>' : ''}
        <span class="mk">${VENUES[ev.venue].name} · ${DIST_LABEL[ev.distance]}${ev.roll ? ' · ROLL 40' : ''}</span><span class="nm">${esc(ev.name)}</span>${ev.rival && !ev.boss ? '<span class="badge rival">RIVAL</span>' : ''}
        <img loading="lazy" src="${thumb(oc)}" alt="">
        <span class="vs">VS ${esc(oc.year + ' ' + oc.make + ' ' + oc.name)}<br>${'★'.repeat(ev.opp.ai)}${'☆'.repeat(5 - ev.opp.ai)} driver · stage ${Math.round(avgLevel(ev.opp.lv))}</span>
        <span class="pr">${done ? money(Math.round(ev.reward * 0.25 / 25) * 25) + ' <small>replay</small>' : money(ev.reward)}${av.ok ? '' : `<small>🔒 ${esc(av.reason)}</small>`}</span>
      </button>`; }).join('')}</div>`;
    body.querySelectorAll('[data-cls]').forEach(b => b.onclick = () => { const c = +b.dataset.cls; if (c < myCls) { toast(`Your car is Class ${myCls} — too fast for Class ${c}`); return; } careerClass = c; renderRaces(); });
    body.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => {
      const ev = events.find(e => e.id === b.dataset.ev), av = eventAvailable(S, ev);
      if (!av.ok) { toast(av.reason); return; }
      const cfg = { kind: 'event', ev, venue: ev.venue, distance: ev.distance, opp: ev.opp, title: ev.name, roll: ev.roll || 0 };
      storyBefore(ev, () => preRace(cfg));
    });
    const sb = $('story-btn'); if (sb) sb.onclick = () => raceTab === 'honda' ? storyCard('Harbour Cup · Kingston', HONDA_STORY.intro) : storyCard(`Chapter ${careerClass} · ${STORY[careerClass].title}`, STORY[careerClass].intro, null, STORY[careerClass].city);
    const on = body.querySelector('.ev:not(.done):not(.locked)'); on?.scrollIntoView({ inline: 'center', block: 'nearest' });
  } else if (raceTab === 'quick') renderQuick(body, car, myCls);
  else if (raceTab === 'online') renderOnline(body, car);
  else if (raceTab === 'modes') renderModes(body, car, myCls);
  else renderTest(body, car);
}

const QUICK = { distance: 'quarter', diff: 1, venue: 'ny', bet: 0, opp: null };
const DIFF = [['EASY', 2, -1, 0.6], ['NORMAL', 3, 0, 1], ['HARD', 4, 1, 1.5], ['PRO', 5, 2, 2.2]];
function rollOpponent(myCls) {
  const pool = CARS.filter(c => !c.ownerGift && c.id !== S.current && Math.abs(classOf(c) - myCls) <= (myCls >= 9 ? 1 : 0));
  QUICK.opp = (pool.length ? pool : CARS.filter(c => c.id !== S.current && !c.ownerGift))[(Math.random() * pool.length) | 0]?.id || 'f82';
}
function renderQuick(body, car, myCls) {
  if (!QUICK.opp || !CAR_BY_ID[QUICK.opp] || Math.abs(classOf(CAR_BY_ID[QUICK.opp]) - myCls) > 1) rollOpponent(myCls);
  const oc = CAR_BY_ID[QUICK.opp], d = DIFF[QUICK.diff], purse = Math.round(quickReward(myCls) * d[3] / 25) * 25;
  body.innerHTML = `<div class="quick">
    <div class="q-vs"><div class="versus"><div class="side"><img src="${thumb(car)}" alt=""><b>${esc(car.name)}</b><span>YOU</span></div><div class="x">VS</div><div class="side"><img src="${thumb(oc)}" alt=""><b>${esc(oc.name)}</b><span>${d[0]} RIVAL</span></div></div>
      <button class="btn" id="q-roll">↻ NEW RIVAL</button></div>
    <div class="q-opts">
      <div class="setrow"><label>Distance</label><div class="seg">${['eighth', 'quarter', 'half'].map(k => `<button data-d="${k}" class="${QUICK.distance === k ? 'on' : ''}">${DIST_LABEL[k]}</button>`).join('')}</div></div>
      <div class="setrow"><label>Rival</label><div class="seg">${DIFF.map((x, i) => `<button data-df="${i}" class="${QUICK.diff === i ? 'on' : ''}">${x[0]}</button>`).join('')}</div></div>
      <div class="setrow"><label>Venue</label><div class="seg">${Object.values(VENUES).map(v => `<button data-v="${v.id}" class="${QUICK.venue === v.id ? 'on' : ''}">${v.id.toUpperCase()}</button>`).join('')}</div></div>
    </div>
    <div class="q-go"><div class="hint">Win <b>${money(purse)}</b> · repeat as often as you like</div><button class="primary" id="q-go">RACE ▸</button></div>
  </div>`;
  body.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { QUICK.distance = b.dataset.d; renderRaces(); });
  body.querySelectorAll('[data-df]').forEach(b => b.onclick = () => { QUICK.diff = +b.dataset.df; renderRaces(); });
  body.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { QUICK.venue = b.dataset.v; renderRaces(); });
  $('q-roll').onclick = () => { rollOpponent(myCls); renderRaces(); };
  $('q-go').onclick = () => {
    const myLv = Math.round(avgLevel(S.owned[S.current].lv)), lvN = Math.max(0, Math.min(5, myLv + d[2]));
    const lv = Object.fromEntries(UPGRADE_KEYS.map(k => [k, k === 'nitrous' ? Math.max(0, lvN - 1) : lvN]));
    preRace({ kind: 'quick', venue: QUICK.venue, distance: QUICK.distance, opp: { car: QUICK.opp, lv, ai: d[1] }, title: 'Quick Race', bet: 0, purse, cls: myCls });
  };
}
function renderTest(body, car) {
  body.innerHTML = `<div class="hint">A solo pass against the clock: no rival, no cash, but your best ¼-mile is saved. Use it to check a new tune.</div>
  <div class="cards">${Object.values(VENUES).map(v => `<button class="ev" data-tv="${v.id}"><span class="mk">${v.temp}°F · GRIP ${(v.mu * 100).toFixed(0)}%</span><span class="nm">${v.name}</span><span class="sp">${esc(v.track)}<br>${esc(v.desc)}</span><span class="pr">TEST ¼ ▸</span></button>`).join('')}</div>`;
  body.querySelectorAll('[data-tv]').forEach(b => b.onclick = () => launch({ kind: 'test', venue: b.dataset.tv, distance: 'quarter', opp: null, title: 'Test Pass' }));
}

function oppBuild(opp, env) { const c = CAR_BY_ID[opp.car]; return buildCar(c, opp.lv, defaultTune(c, opp.lv), env); }
function playerFor(cfg, env) {
  if (cfg.borrow) { const car = CAR_BY_ID[cfg.borrow]; return { car, bc: buildCar(car, {}, defaultTune(car), env), look: null }; }
  return { car: CAR_BY_ID[S.current], bc: carBuild(S.current, env), look: S.owned[S.current].look };
}
function preRace(cfg) {
  const env = VENUES[cfg.venue], pl = playerFor(cfg, env), car = pl.car, me = pl.bc;
  if (!cfg.opp) return soloPreRace(cfg, pl);
  const oc = CAR_BY_ID[cfg.opp.car], them = oppBuild(cfg.opp, env);
  modal(`<h2>${esc(cfg.title)}</h2><p>${env.name} · ${esc(env.track)} · ${DIST_LABEL[cfg.distance]} · ${env.temp}°F</p>
    <div class="versus"><div class="side"><img src="${thumb(car)}" alt=""><b>${esc(car.name)}</b><span>${hpOf(me)} HP · ${Math.round(me.mass - 80)} KG · ${car.drive}</span></div><div class="x">VS</div>
    <div class="side"><img src="${thumb(oc)}" alt=""><b>${esc(oc.name)}</b><span>${hpOf(them)} HP · ${Math.round(them.mass - 80)} KG · ${oc.drive}</span></div></div>
    ${cfg.note ? `<p class="note">${cfg.note}</p>` : ''}
    <p>${cfg.roll ? '<b>Roll race:</b> both cars cruise at 40 mph. Floor it on green and shift on the lights.' : '<b>How to race:</b> hold GAS during the countdown'} and keep the needle in the green launch zone. The clutch drops on green. Tap SHIFT when the needle reaches the green arc / the shift lights fill. ${me.nosSeconds ? 'Tap N₂O to fire it.' : ''}${cfg.roll ? '' : me.hasLaunchControl ? ' Your car has launch control: flat-foot it.' : ' No launch control: feather the pedal.'}</p>
    <div class="row-btns"><button class="ghost" id="pr-cancel">BACK</button><button class="primary" id="pr-go">STAGE ▸</button></div>`, c => {
    c.querySelector('#pr-cancel').onclick = closeModal;
    c.querySelector('#pr-go').onclick = () => { closeModal(); launch(cfg); };
  });
}

async function launch(cfg) {
  Audio.unlock();
  const env = VENUES[cfg.venue];
  const player = playerFor(cfg, env);
  const opponent = cfg.opp ? { car: CAR_BY_ID[cfg.opp.car], bc: oppBuild(cfg.opp, env), ai: cfg.opp.ai } : null;
  await startRace({ player, opponent, distance: cfg.distance, venue: cfg.venue, settings: S.settings, title: cfg.title, roll: cfg.roll || 0, aiDial: cfg.aiDial || 0,
    onFinish: race => results(cfg, race), onQuit: () => { toast('Race abandoned — no result'); go(screen); } });
}

function results(cfg, race) {
  const r = race.result, carId = cfg.borrow || S.current;
  if (cfg.decide) cfg.decide(r);
  const out = applyResult(S, { kind: cfg.kind, ev: cfg.ev || null, cls: cfg.cls || classOf(CAR_BY_ID[carId]), result: r, carId, distance: cfg.distance, bet: cfg.bet || 0, purse: cfg.purse ?? null });
  persist();
  const p = r.player, o = r.opponent, won = out.won;
  const title = cfg.kind === 'test' ? 'TIME SLIP' : cfg.kind === 'online' && r.online ? (won ? 'YOU BEAT ' + esc(String(r.online.rival || 'YOUR RIVAL')).toUpperCase() : esc(String(r.online.rival || 'YOUR RIVAL')).toUpperCase() + ' WINS') : won ? (cfg.ev?.boss ? 'BOSS BEATEN!' : 'YOU WIN') : 'YOU LOSE';
  const launchQ = { perfect: 'PERFECT', good: 'GOOD', bog: 'BOGGED', spin: 'SPUN', roll: 'ROLLING' }[p.launch?.q] || '—';
  const unlocks = CARS.filter(c => c.wins && S.wins === c.wins && won && cfg.kind !== 'test');
  const rivalLbl = cfg.kind === 'online' && r.online ? esc(String(r.online.rival || 'RIVAL')).toUpperCase() + ' ET' : 'RIVAL ET';
  modal(`<h2 class="${cfg.kind === 'test' ? '' : won ? 'win' : 'lose'}">${title}</h2>
    <p>${esc(CAR_BY_ID[carId].name)} · ${VENUES[cfg.venue].name} · ${DIST_LABEL[cfg.distance]}${o ? ` · margin ${r.margin != null ? r.margin.toFixed(3) + ' s' : '—'}` : ''}${out.pb ? ' · <b style="color:var(--accent)">NEW PERSONAL BEST</b>' : ''}</p>
    <div class="slip">
      <div>ET<b>${fmt3(p.et)}</b></div><div>TRAP<b>${trapU(p.trap)}</b></div><div>60 FT<b>${fmt3(p.ft60)}</b></div><div>330 FT<b>${fmt3(p.ft330)}</b></div>
      <div>⅛ MILE<b>${fmt3(p.eighth)}</b></div><div>LAUNCH<b>${launchQ}</b></div><div>SHIFTS<b>${p.perfectShifts}/${p.shifts} <small>perfect</small></b></div>
      ${o ? `<div class="vs">${rivalLbl}<b>${o.et ? fmt3(o.et) : 'DNF'}</b></div>` : `<div>N₂O USED<b>${p.nosUsed ? p.nosUsed.toFixed(1) + '<small> s</small>' : '—'}</b></div>`}
    </div>
    ${cfg.kind !== 'test' ? `<div class="payout ${out.payout < 0 ? 'neg' : ''}">${out.payout >= 0 ? '+' : ''}${money(out.payout)}${out.firstWin ? ' <small style="font-size:14px;color:var(--dim)">EVENT PRIZE</small>' : ''}</div>` : ''}
    ${r.modeNote ? `<p class="note">${r.modeNote}</p>` : ''}
    ${unlocks.map(c => `<p>🔓 <b>${esc(c.name)}</b> is now available at the Dealer.</p>`).join('')}
    <div class="row-btns" style="margin-top:10px"><button class="ghost" id="rs-garage">GARAGE</button><button class="ghost" id="rs-up">UPGRADE</button><button class="primary" id="rs-again">${cfg.kind === 'online' ? 'BACK TO LOBBY ▸' : (won && cfg.kind === 'event') || cfg.mode ? 'NEXT ▸' : 'RACE AGAIN ▸'}</button></div>`, c => {
    c.querySelector('#rs-garage').onclick = () => { closeModal(); go('garage'); };
    c.querySelector('#rs-up').onclick = () => { closeModal(); go('upgrades'); };
    c.querySelector('#rs-again').onclick = () => {
      closeModal();
      if (won && cfg.kind === 'event') {
        const ev = cfg.ev, outro = ev.boss && out.firstWin ? (ev.honda ? HONDA_STORY.outro : STORY[ev.cls]?.outro) : null;
        if (outro) { storyCard(ev.honda ? 'Harbour Cup complete' : `Chapter ${ev.cls} complete`, outro, () => go('races')); return; }
        go('races'); return;
      }
      if (cfg.mode) { cfg.after?.(won); raceTab = 'modes'; go('races'); return; }
      if (cfg.kind === 'online') { raceTab = 'online'; go('races'); return; }
      if (cfg.kind === 'quick' && cfg.bet > S.cash) cfg.bet = 0;
      launch(cfg);
    };
  });
  go(screen === 'garage' ? 'garage' : screen);
}


// ───────────────────────── online (head-to-head with another phone) ─────────────────────────
const net = createOnline();
let onlineCode = new URLSearchParams(location.search).get('room') || '';
const carPayload = () => { const o = S.owned[S.current]; return { id: S.current, lv: o.lv, tune: o.tune, hp: hpOf(carBuild()), look: cleanLook(o.look) }; };
const myName = () => (S.settings.name || '').trim() || 'Racer';
async function ensureOnline() { if (net.status === 'online') { net.send({ t: 'hello', name: myName(), car: carPayload() }); return true; } return net.connect({ name: myName(), car: carPayload() }); }
net.onChange(() => { if (screen === 'races' && raceTab === 'online' && !document.body.classList.contains('racing')) renderRaces(); });
net.on('notice', m => toast(m.msg));
net.on('error', m => toast(m.msg));
net.on('start', m => {
  closeModal();
  const opp = m.players[1 - m.seat], oc = CAR_BY_ID[opp.car?.id] || CAR_BY_ID.f82, env = VENUES[m.venue] || VENUES.ny;
  const oppBc = buildCar(oc, opp.car?.lv || {}, opp.car?.tune || {}, env);
  const cfg = { kind: 'online', venue: m.venue, distance: m.distance, opp: null, title: 'Online · vs ' + opp.name, purse: Math.round(quickReward(classOf(CAR_BY_ID[S.current])) * 1.2 / 25) * 25 };
  Audio.unlock();
  startRace({ player: { car: CAR_BY_ID[S.current], bc: carBuild(S.current, env), look: S.owned[S.current].look }, distance: m.distance, venue: m.venue, settings: S.settings, title: cfg.title,
    online: { net, seat: m.seat, startPerf: net.perfAt(m.at), opp: { car: oc, bc: oppBc, name: opp.name, look: cleanLook(opp.car?.look) } },
    onFinish: race => results(cfg, race), onQuit: () => { toast('You left the race — counted as a loss for this run'); raceTab = 'online'; go('races'); } });
});

function renderOnline(body, car) {
  const room = net.room, R = net.status;
  if (R !== 'online') {
    body.innerHTML = `<div class="online">
      <div class="on-intro"><b>Race a real person.</b> Both phones start the countdown together; each of you drives your own car with your own upgrades and tune. Lowest time wins ${money(Math.round(quickReward(classOf(car)) * 1.2 / 25) * 25)}.</div>
      <div class="setrow"><label for="on-name">Your racer name</label><input id="on-name" maxlength="16" autocomplete="nickname" value="${esc(S.settings.name || '')}" placeholder="Racer"></div>
      <div class="row-btns"><button class="primary" id="on-connect">${R === 'connecting' ? 'CONNECTING…' : 'GO ONLINE ▸'}</button></div>
      ${net.error ? `<p class="hint" style="color:var(--bad)">${esc(net.error)}</p>` : ''}</div>`;
    const nameIn = $('on-name');
    nameIn.onchange = () => { S.settings.name = nameIn.value.trim().slice(0, 16); persist(); };
    $('on-connect').onclick = async () => { S.settings.name = nameIn.value.trim().slice(0, 16); persist(); if (await ensureOnline() && onlineCode) net.send({ t: 'join', code: onlineCode }); };
    return;
  }
  if (!room) {
    body.innerHTML = `<div class="online">
      <div class="on-intro">Racing as <b>${esc(myName())}</b> in your <b>${esc(car.name)}</b> (${hpOf(carBuild())} HP). Change car in My Cars before you join.</div>
      <div class="on-grid">
        <button class="primary" id="on-find">${net.queued ? 'SEARCHING… TAP TO STOP' : 'FIND A RACER ▸'}</button>
        <button class="btn" id="on-create">CREATE A ROOM</button>
        <div class="on-join"><input id="on-code" maxlength="4" placeholder="CODE" value="${esc(onlineCode)}" autocapitalize="characters" autocomplete="off"><button class="btn" id="on-join">JOIN</button></div>
      </div>
      <p class="hint">Make a room and send the 4-letter code (or link) to a friend, or tap Find a racer to be paired with anyone who is searching.</p></div>`;
    $('on-find').onclick = async () => { await ensureOnline(); net.send({ t: net.queued ? 'unqueue' : 'queue' }); };
    $('on-create').onclick = async () => { await ensureOnline(); net.send({ t: 'create' }); };
    $('on-join').onclick = async () => { const c = $('on-code').value.trim().toUpperCase(); if (c.length !== 4) { toast('Enter the 4-letter room code'); return; } onlineCode = c; await ensureOnline(); net.send({ t: 'join', code: c }); };
    return;
  }
  const me = room.players[room.you], them = room.players[1 - room.you], host = room.you === 0;
  const pcard = (p, label) => {
    if (!p) return `<div class="on-p empty"><span class="mk">${label}</span><b>Waiting for a rival…</b><span class="hint">Share the code ${esc(room.code)}</span></div>`;
    const c = CAR_BY_ID[p.car?.id];
    return `<div class="on-p ${p.ready ? 'ready' : ''}"><span class="mk">${label}${p.wins ? ' · ' + p.wins + ' WIN' + (p.wins > 1 ? 'S' : '') : ''}</span><img src="${c ? thumb(c) : ''}" alt=""><b>${esc(p.name)}</b><span>${c ? esc(c.name) : '—'} · ${Math.round(p.car?.hp || 0)} HP</span><span class="badge ${p.ready ? 'go' : ''}">${p.ready ? 'READY' : p.connected === false ? 'OFFLINE' : 'NOT READY'}</span></div>`;
  };
  const link = location.origin + location.pathname + '?room=' + room.code;
  body.innerHTML = `<div class="online room">
    <div class="on-code"><span>ROOM</span><b>${esc(room.code)}</b><button class="btn" id="on-share">SHARE LINK</button><button class="ghost" id="on-leave">LEAVE</button></div>
    <div class="on-players">${pcard(me, 'YOU')}<div class="x">VS</div>${pcard(them, 'RIVAL')}</div>
    <div class="on-set">
      <div class="seg">${['eighth', 'quarter', 'half'].map(k => `<button data-od="${k}" class="${room.distance === k ? 'on' : ''}" ${host ? '' : 'disabled'}>${DIST_LABEL[k]}</button>`).join('')}</div>
      <div class="seg">${Object.values(VENUES).map(v => `<button data-ov="${v.id}" class="${room.venue === v.id ? 'on' : ''}" ${host ? '' : 'disabled'}>${v.id.toUpperCase()}</button>`).join('')}</div>
      <button class="primary" id="on-ready" ${them ? '' : 'disabled'}>${me.ready ? 'CANCEL READY' : 'READY ▸'}</button>
    </div>
    <p class="hint">${host ? 'You pick the distance and venue.' : 'The room host picks the distance and venue.'} The race starts when both of you tap Ready.</p></div>`;
  body.querySelectorAll('[data-od]').forEach(b => b.onclick = () => net.send({ t: 'settings', distance: b.dataset.od, venue: room.venue }));
  body.querySelectorAll('[data-ov]').forEach(b => b.onclick = () => net.send({ t: 'settings', distance: room.distance, venue: b.dataset.ov }));
  $('on-ready').onclick = () => { Audio.unlock(); net.send({ t: 'ready', ready: !me.ready, car: carPayload() }); };
  $('on-leave').onclick = () => { onlineCode = ''; net.send({ t: 'leave' }); };
  $('on-share').onclick = async () => {
    const text = `Race me in Belt Run! Room ${room.code}: ${link}`;
    try { if (navigator.share) { await navigator.share({ title: 'Belt Run race', text, url: link }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(link); toast('Link copied — send it to your rival'); } catch { toast('Room code: ' + room.code); }
  };
}
if (onlineCode) { raceTab = 'online'; }

// ───────────────────────── upgrades ─────────────────────────
let upSel = 'engine';
function renderUpgrades() {
  const id = S.current, car = CAR_BY_ID[id], o = S.owned[id], bc = carBuild();
  $('up-img').src = car.image;
  const et = robotET(bc);
  const nextLv = o.lv[upSel] < MAX_LEVEL ? { ...o.lv, [upSel]: o.lv[upSel] + 1 } : null;
  const bcN = nextLv ? buildCar(car, nextLv, { ...o.tune, nosSeconds: upSel === 'nitrous' ? 99 : o.tune.nosSeconds }) : null;
  const etN = bcN ? robotET(bcN) : null;
  const d = (a, b, inv = false, dig = 0) => b == null || Math.abs(b - a) < Math.pow(10, -dig) / 2 ? '' : `<span class="delta" style="color:${(inv ? b < a : b > a) ? 'var(--go)' : 'var(--bad)'}">${b > a ? '+' : ''}${(b - a).toFixed(dig)}</span>`;
  $('up-stats').innerHTML = statHTML(hpOf(bc) + d(hpOf(bc), bcN && hpOf(bcN)), 'HP', 'hi') + statHTML(Math.round(bc.mass - 80) + d(bc.mass, bcN?.mass, true), 'KG')
    + statHTML(bc.mu.toFixed(2) + d(bc.mu, bcN?.mu, false, 2), 'GRIP μ') + statHTML(Math.round(bc.shiftTime * 1000) + d(bc.shiftTime * 1000, bcN && bcN.shiftTime * 1000, true), 'SHIFT MS')
    + statHTML(bc.nosHp ? '+' + bc.nosHp : '—', 'N₂O HP') + statHTML(fmt3(et.et).slice(0, 5) + (etN ? d(et.et, etN.et, true, 2) : ''), 'ROBOT ¼');
  $('up-grid').innerHTML = UPGRADE_KEYS.map(k => {
    const lv = o.lv[k], p = nextUpgradePrice(S, k);
    return `<button class="up ${k === upSel ? 'sel' : ''}" data-up="${k}"><h3>${UPGRADE_INFO[k].name}</h3><div class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div><span class="sp" style="font:600 12px var(--cond);color:var(--dim)">STAGE ${lv}/${MAX_LEVEL}</span><span class="cost ${p == null ? 'max' : ''}">${p == null ? 'MAXED' : money(p)}</span></button>`;
  }).join('') + `<div class="up" style="justify-content:center"><span class="hint">Robot ¼ = a perfect driver’s pass with this exact build (the same physics you race).</span></div>`;
  const p = nextUpgradePrice(S, upSel);
  let extra = '';
  if (upSel === 'nitrous') { const ns = nitrousSpec(car, Math.min(MAX_LEVEL, o.lv.nitrous + 1)); extra = ` Next: ${ns.hp} hp shot, ${ns.seconds.toFixed(1)} s bottle.`; }
  if (upSel === 'power' && car.phys.engine.type === 'na' && o.lv.power === 0) extra = ' This car is naturally aspirated: stage 1 installs a turbo kit (changes the sound too).';
  $('up-detail').innerHTML = `<p><b>${UPGRADE_INFO[upSel].name}.</b> ${UPGRADE_INFO[upSel].desc}${extra}</p><button class="primary" id="up-buy" ${p == null || p > S.cash ? 'disabled' : ''}>${p == null ? 'MAXED' : p > S.cash ? 'NEED ' + money(p) : 'INSTALL · ' + money(p)}</button>`;
  $('up-grid').querySelectorAll('[data-up]').forEach(b => b.onclick = () => { upSel = b.dataset.up; renderUpgrades(); Audio.uiClick(); });
  const buy = $('up-buy'); if (buy) buy.onclick = () => { const r = buyUpgrade(S, upSel); if (r.ok) { haptic('medium', S.settings); toast(`${UPGRADE_INFO[upSel].name} stage ${S.owned[S.current].lv[upSel]} installed`); persist(); renderUpgrades(); } else toast(r.reason === 'cash' ? 'Not enough cash' : 'Maxed out'); };
}

// ───────────────────────── tuning ─────────────────────────
function drawDyno(bc) {
  const cv = $('dyno'), r = cv.getBoundingClientRect(); if (!r.width) return;
  const dpr = Math.min(devicePixelRatio || 1, 2.5); cv.width = r.width * dpr; cv.height = r.height * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height, pts = dynoCurve(bc, 100), maxHp = Math.max(...pts.map(p => p.hp)), maxT = Math.max(...pts.map(p => p.Nm));
  const top = Math.max(maxHp, maxT) * 1.12, x = rpm => 34 + (rpm - 1000) / (bc.limiter - 1000) * (W - 44), y = v => H - 20 - v / top * (H - 34);
  g.strokeStyle = '#ffffff12'; g.fillStyle = '#7b828d'; g.font = '600 10px "Barlow Condensed",sans-serif';
  for (let v = 0; v <= top; v += top > 1200 ? 400 : 200) { g.beginPath(); g.moveTo(34, y(v)); g.lineTo(W - 8, y(v)); g.stroke(); g.fillText(v, 4, y(v) + 3); }
  for (let rpm = 1000; rpm <= bc.limiter; rpm += 1000) g.fillText(rpm / 1000 + 'k', x(rpm) - 6, H - 6);
  for (const [key, col] of [['Nm', '#4aa8ff'], ['hp', '#ffb000']]) { g.strokeStyle = col; g.lineWidth = 2.2; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(x(p.rpm), y(p[key])) : g.moveTo(x(p.rpm), y(p[key]))); g.stroke(); }
  g.fillStyle = '#ffb000'; g.fillText(`${Math.round(maxHp)} HP`, 40, 14); g.fillStyle = '#4aa8ff'; g.fillText(`${Math.round(maxT)} NM`, 92, 14);
  g.fillStyle = '#7b828d'; g.fillText('DYNO · CRANK', W - 70, 14);
}
function renderTune() {
  const id = S.current, car = CAR_BY_ID[id], o = S.owned[id], t = o.tune, L = tuneLimits(car, o.lv), bc = carBuild();
  const body = $('tune-body');
  const slider = (key, label, min, max, step, val, disp, note = '') => `<div class="slider"><label for="t-${key}">${label}</label><output id="o-${key}">${disp(val)}</output><input id="t-${key}" data-k="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${val}">${note ? `<small>${note}</small>` : ''}</div>`;
  const gs = gearSpeeds(bc);
  body.innerHTML = slider('launchRpm', 'Launch RPM', L.launchRpm[0], L.launchRpm[1], 100, t.launchRpm, v => Math.round(v) + ' rpm', bc.hasLaunchControl ? 'Launch control holds this rpm while you floor it.' : 'Target zone on the tach during the countdown.')
    + slider('tirePsi', 'Tire pressure', L.tirePsi[0], L.tirePsi[1], 1, t.tirePsi, v => v + ' psi', o.lv.tires >= 3 ? 'Drag radials like ~17 psi.' : 'Street tires like ~31 psi. Lower = bigger contact patch but more roll drag.')
    + slider('final', 'Final drive', (car.phys.trans.final * L.final[0]).toFixed(2), (car.phys.trans.final * L.final[1]).toFixed(2), 0.01, t.final, v => (+v).toFixed(2), 'Higher = quicker acceleration, lower top speed in each gear.')
    + (L.nosSeconds ? slider('nosSeconds', 'Nitrous per pass', L.nosSeconds[0], L.nosSeconds[1], 0.1, t.nosSeconds, v => (+v).toFixed(1) + ' s') : '')
    + `<div class="slider"><label>Traction control</label><output>${t.tc.toUpperCase()}</output><div class="seg">${['street', 'sport', 'off'].map(m => `<button data-tc="${m}" class="${t.tc === m ? 'on' : ''}">${m.toUpperCase()}</button>`).join('')}</div><small>Street cuts power early, Off leaves it to you.</small></div>`
    + (L.gears ? `<div class="gears">${t.gears.map((r, i) => slider('g' + i, 'Gear ' + (i + 1), (car.phys.trans.ratios[i] * L.gears[0]).toFixed(2), (car.phys.trans.ratios[i] * L.gears[1]).toFixed(2), 0.01, r, v => (+v).toFixed(2) + ' · ' + speedU(gs[i]))).join('')}</div>` : `<div class="lockline">Gear ratios: install Transmission stage 1 to tune individual gears. Top speed per gear: ${gs.map(v => speedU(v)).join(' · ')}</div>`)
    + `<div class="row-btns"><button class="btn" id="tune-reset">RESET TO DEFAULT</button></div>`;
  const apply = () => { const bcn = carBuild(); drawDyno(bcn); $('tune-pred').innerHTML = statHTML(hpOf(bcn), 'HP', 'hi') + statHTML(bcn.hasLaunchControl ? 'YES' : 'NO', 'LAUNCH CTRL') + statHTML(predicted ?? '—', 'ROBOT ¼'); };
  let predicted = null;
  body.querySelectorAll('input[type=range]').forEach(inp => inp.oninput = () => {
    const k = inp.dataset.k, v = +inp.value;
    const patch = k[0] === 'g' && /^g\d+$/.test(k) ? { gears: Object.assign(S.owned[id].tune.gears.slice(), { [+k.slice(1)]: v }) } : { [k]: v };
    setTune(S, patch); predicted = null;
    const out = $('o-' + k); if (out) out.textContent = k === 'launchRpm' ? Math.round(v) + ' rpm' : k === 'tirePsi' ? v + ' psi' : k === 'nosSeconds' ? v.toFixed(1) + ' s' : k[0] === 'g' && k !== 'g' ? v.toFixed(2) + ' · ' + speedU(gearSpeeds(carBuild())[+k.slice(1)]) : v.toFixed(2);
    apply(); clearTimeout(renderTune.t); renderTune.t = setTimeout(persist, 300);
  });
  body.querySelectorAll('[data-tc]').forEach(b => b.onclick = () => { setTune(S, { tc: b.dataset.tc }); persist(); renderTune(); });
  $('tune-reset').onclick = () => { S.owned[id].tune = defaultTune(car, o.lv); persist(); renderTune(); toast('Tune reset'); };
  $('tune-robot').onclick = () => { const r = robotET(carBuild()); predicted = fmt3(r.et).slice(0, 5); apply(); toast(`Robot pass: ${fmt3(r.et)} s @ ${trapU(r.trap).replace(/<[^>]+>/g, '')} · launch ${r.launch.q}`); };
  $('tune-drive').onclick = () => launch({ kind: 'test', venue: 'ga', distance: 'quarter', opp: null, title: 'Test Pass' });
  requestAnimationFrame(apply);
}

// ───────────────────────── dealer & my cars ─────────────────────────
let dealerCls = 0;
function carCard(c, extra = '', cls = '') {
  return `<button class="card-car ${cls}" data-car="${c.id}"><span class="mk">${c.year} ${esc(c.make.toUpperCase())} · C${classOf(c)}</span><span class="nm">${esc(c.name)}</span><img loading="lazy" src="${thumb(c)}" alt=""><span class="sp">${c.hp.toLocaleString()} HP${c.powerTarget ? ' target' : c.fictional ? ' est.' : ''} · ${c.drive} · ${c.phys.trans.type === 'MT' ? 'MANUAL' : c.phys.trans.type === 'DCT' ? 'DCT' : 'AUTO'}<br>stock ¼: ${stockET(c).toFixed(2)} s</span>${extra}</button>`;
}
function renderDealer() {
  const chips = ['ALL', ...Array.from({ length: 10 }, (_, i) => 'C' + (i + 1))];
  $('dealer-chips').innerHTML = chips.map((c, i) => `<button data-dc="${i}" class="${dealerCls === i ? 'on' : ''}">${c}${i ? ' ' + CLASS_NAMES[i] : ''}</button>`).join('');
  $('dealer-chips').querySelectorAll('[data-dc]').forEach(b => b.onclick = () => { dealerCls = +b.dataset.dc; renderDealer(); });
  const list = CARS.filter(c => !c.ownerGift && (!dealerCls || classOf(c) === dealerCls)).sort((a, b) => a.price - b.price);
  $('dealer-cards').innerHTML = list.map(c => {
    const owned = !!S.owned[c.id], lock = carLocked(c, S);
    return carCard(c, `<span class="pr">${owned ? 'OWNED' : lock ? '🔒 ' + lock : money(c.price)}</span>${c.fictional ? '<span class="badge gold">SPECIAL</span>' : ''}`, (owned ? 'on ' : '') + (lock ? 'locked' : ''));
  }).join('');
  $('dealer-cards').querySelectorAll('[data-car]').forEach(b => b.onclick = () => dealerDetail(CAR_BY_ID[b.dataset.car]));
}
function dealerDetail(c) {
  const owned = !!S.owned[c.id], lock = carLocked(c, S), bc = buildCar(c);
  modal(`<h2>${esc(c.year + ' ' + c.make + ' ' + c.name)}</h2>
    <div class="versus" style="grid-template-columns:1.3fr 1fr"><div class="side"><img src="${c.image}" alt="" style="height:clamp(80px,30vh,170px)"></div>
    <div class="statgrid" style="grid-template-columns:repeat(2,1fr)">${statHTML(c.hp.toLocaleString(), c.powerTarget ? 'HP TARGET' : c.fictional || c.provisional ? 'HP EST.' : 'HP')}${statHTML(c.tq, 'NM')}${statHTML(c.mass, 'KG')}${statHTML(c.drive, 'DRIVE')}${statHTML('C' + classOf(c), 'CLASS', 'hi')}${statHTML(stockET(c).toFixed(2), 'STOCK ¼')}</div></div>
    <p>${esc(c.engine)} · ${c.phys.trans.ratios.length}-speed ${bc.transType === 'MT' ? 'manual' : bc.transType === 'DCT' ? 'dual-clutch' : 'automatic'}${bc.hasLaunchControl ? ' · launch control' : ''}. ${esc(c.buildNote || c.notes || '')}</p>
    <div class="row-btns"><button class="ghost" id="dd-close">CLOSE</button><button class="primary" id="dd-buy" ${owned || lock || S.cash < c.price ? 'disabled' : ''}>${owned ? 'OWNED' : lock ? lock.toUpperCase() : S.cash < c.price ? 'NEED ' + money(c.price) : 'BUY · ' + money(c.price)}</button></div>`, m => {
    m.querySelector('#dd-close').onclick = closeModal;
    m.querySelector('#dd-buy').onclick = () => { const r = buyCar(S, c.id); if (r.ok) { persist(); closeModal(); haptic('heavy', S.settings); toast(`${c.name} is in your garage`); go('garage'); } else toast(r.reason === 'cash' ? 'Not enough cash' : r.reason); };
  });
}
function renderMyCars() {
  $('mycars-cards').innerHTML = ownedIds().map(id => { const c = CAR_BY_ID[id], b = S.best[id]; return carCard(c, `<span class="pr">${id === S.current ? '● DRIVING' : 'SELECT'}${b ? ` · best ${b.et.toFixed(2)}` : ''}</span>`, id === S.current ? 'on' : ''); }).join('');
  $('mycars-cards').querySelectorAll('[data-car]').forEach(b => b.onclick = () => {
    const id = b.dataset.car, c = CAR_BY_ID[id], v = sellValue(S, id);
    modal(`<h2>${esc(c.name)}</h2><p>${c.ownerGift ? 'Your own car — it stays in the garage.' : `Sell value: <b>${money(v)}</b> (60% of price + 40% of upgrades).`}</p>
      <div class="row-btns"><button class="ghost" id="mc-sell" ${c.ownerGift || Object.keys(S.owned).length <= 1 ? 'disabled' : ''}>SELL</button><button class="primary" id="mc-drive">DRIVE THIS CAR</button></div>`, m => {
      m.querySelector('#mc-drive').onclick = () => { S.current = id; persist(); closeModal(); go('garage'); };
      m.querySelector('#mc-sell').onclick = () => { if (!confirmSell.armed) { confirmSell.armed = true; m.querySelector('#mc-sell').textContent = 'TAP AGAIN TO SELL'; setTimeout(() => confirmSell.armed = false, 2500); return; } confirmSell.armed = false; if (sellCar(S, id).ok) { persist(); closeModal(); toast(`Sold for ${money(v)}`); renderMyCars(); } };
    });
  });
}
const confirmSell = { armed: false };

// ───────────────────────── settings ─────────────────────────
function renderSettings() {
  const st = S.settings, tog = (k, label, note = '') => `<div class="setrow"><label>${label}${note ? `<small>${note}</small>` : ''}</label><button class="toggle ${st[k] ? 'on' : ''}" data-tog="${k}" role="switch" aria-checked="${!!st[k]}" aria-label="${label}"></button></div>`;
  const vol = (k, label) => `<div class="setrow"><label for="v-${k}">${label}</label><input id="v-${k}" data-vol="${k}" type="range" min="0" max="1" step="0.05" value="${st[k]}"></div>`;
  $('settings-body').innerHTML = `<div class="setrow"><label>Sound<small>Procedural engine synthesis driven by the physics (no recordings).</small></label><button class="toggle ${!st.muted ? 'on' : ''}" data-mute role="switch" aria-checked="${!st.muted}" aria-label="Sound"></button></div>
    ${vol('engineVol', 'Engine volume')}${vol('fxVol', 'Effects volume')}
    <div class="setrow"><label>Speed units</label><div class="seg" style="flex:1">${['mph', 'kmh'].map(u => `<button data-units="${u}" class="${st.units === u ? 'on' : ''}">${u === 'mph' ? 'MPH' : 'KM/H'}</button>`).join('')}</div></div>
    ${tog('haptics', 'Haptics', 'Vibration on shifts and launches (where supported).')}
    ${tog('autoShift', 'Auto-shift assist', 'Shifts at the optimum for you. You still launch and use nitrous.')}
    <div class="setrow"><label>Offline play<small id="off-status">Download every car and venue so the game runs with no signal.</small></label><button class="btn" id="off-btn">DOWNLOAD</button></div>
    <div class="setrow"><label>Reset career<small>Deletes cash, cars and upgrades on this device.</small></label><button class="btn" id="reset-btn">RESET</button></div>
    <div class="hint" style="padding:6px 2px">BELT RUN: DRAG LEGENDS · 67 cars · physics: 240 Hz longitudinal model (torque curves, boost, clutch, weight transfer, tire grip, aero). Factory power/torque from the roster sources; masses, gearing and upgrade effects are game estimates. The 1,200 HP X4 M figure is your custom-build target, not a dyno result. Fonts: Barlow (OFL).</div>`;
  const b = $('settings-body');
  b.querySelectorAll('[data-tog]').forEach(t => t.onclick = () => { st[t.dataset.tog] = !st[t.dataset.tog]; persist(); renderSettings(); });
  b.querySelector('[data-mute]').onclick = () => { st.muted = !st.muted; Audio.applySettings(st); if (!st.muted) Audio.unlock(); persist(); renderSettings(); };
  b.querySelectorAll('[data-vol]').forEach(i => i.oninput = () => { st[i.dataset.vol] = +i.value; Audio.applySettings(st); clearTimeout(renderSettings.t); renderSettings.t = setTimeout(persist, 250); });
  b.querySelectorAll('[data-units]').forEach(u => u.onclick = () => { st.units = u.dataset.units; persist(); renderSettings(); });
  $('off-btn').onclick = downloadOffline;
  $('reset-btn').onclick = () => { if (!renderSettings.armed) { renderSettings.armed = true; $('reset-btn').textContent = 'TAP AGAIN'; setTimeout(() => renderSettings.armed = false, 2500); return; } renderSettings.armed = false; S = resetSave(); Audio.applySettings(S.settings); refreshTop(); toast('Career reset'); go('garage'); };
}

// ───────────────────────── offline / service worker ─────────────────────────
const offlineAssets = () => [...CARS.flatMap(c => [c.image, thumb(c)])];
async function downloadOffline() {
  const status = $('off-status');
  if (!('caches' in window)) { status.textContent = 'Not supported in this browser.'; return; }
  let n = 0; const list = offlineAssets();
  try {
    const cache = await caches.open('beltrun-mobile-assets-v1');
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(list.slice(i, i + 8).map(async u => { if (!(await cache.match(u))) { const r = await fetch(u); if (r.ok) await cache.put(u, r); } n++; }));
      status.textContent = `Downloading… ${n}/${list.length}`;
    }
    status.textContent = 'Ready for offline play ✓';
  } catch (e) { status.textContent = 'Download interrupted — try again on Wi-Fi.'; }
}
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.Capacitor) navigator.serviceWorker.register('sw.js').catch(() => {});


// ───────────────────────── story cards ─────────────────────────
function storyCard(title, lines, done, sub = '') {
  const who = n => CREW[n] || { name: n, role: 'Rival', color: '#ff5a5f' };
  modal(`<div class="story"><small>${esc(sub || 'STORY')}</small><h2>${esc(title)}</h2>
    ${lines.map(([n, t]) => { const w = who(n); return `<div class="line"><span class="spk" style="color:${w.color}">${esc(w.name)}${w.role ? `<i>${esc(w.role)}</i>` : ''}</span><p>${esc(t)}</p></div>`; }).join('')}
    <div class="row-btns"><button class="primary" id="st-next">CONTINUE ▸</button></div></div>`, c => {
    c.querySelector('#st-next').onclick = () => { closeModal(); done?.(); };
  });
}
// Story before an event: chapter intro on first visit, rival trash talk before named races.
function storyBefore(ev, then) {
  const parts = [];
  const introKey = ev.honda ? 'honda-intro' : `c${ev.cls}-intro`;
  S.seen ||= {};
  if (!S.seen[introKey]) parts.push(ev.honda ? ['Harbour Cup · Kingston', HONDA_STORY.intro, 'JAMAICA'] : [`Chapter ${ev.cls} · ${STORY[ev.cls].title}`, STORY[ev.cls].intro, STORY[ev.cls].city]);
  if (!S.done[ev.id]) {
    if (ev.boss) parts.push([ev.name, ev.honda ? HONDA_STORY.boss : STORY[ev.cls].boss.intro, 'BOSS RACE']);
    else if (ev.rival) { const rv = STORY[ev.cls].rivals.find(r => r.name === ev.rival); if (rv) parts.push([ev.name, rv.lines, 'RIVAL RACE']); }
  }
  S.seen[introKey] = true; persist();
  const step = i => i >= parts.length ? then() : storyCard(parts[i][0], parts[i][1], () => step(i + 1), parts[i][2]);
  step(0);
}

// ───────────────────────── modes ─────────────────────────
function soloPreRace(cfg, pl) {
  const env = VENUES[cfg.venue];
  modal(`<h2>${esc(cfg.title)}</h2><p>${env.name} · ${esc(env.track)} · ${DIST_LABEL[cfg.distance]} · ${env.temp}°F</p>
    <div class="versus" style="grid-template-columns:1fr"><div class="side"><img src="${thumb(pl.car)}" alt=""><b>${esc(pl.car.year + ' ' + pl.car.make + ' ' + pl.car.name)}</b><span>${hpOf(pl.bc)} HP · ${Math.round(pl.bc.mass - 80)} KG · ${pl.car.drive}${cfg.borrow ? ' · stock, borrowed' : ''}</span></div></div>
    ${cfg.note ? `<p class="note">${cfg.note}</p>` : ''}
    <div class="row-btns"><button class="ghost" id="pr-cancel">BACK</button><button class="primary" id="pr-go">STAGE ▸</button></div>`, c => {
    c.querySelector('#pr-cancel').onclick = closeModal;
    c.querySelector('#pr-go').onclick = () => { closeModal(); launch(cfg); };
  });
}
const avgLvRound = () => Math.round(avgLevel(S.owned[S.current].lv));
const lvAll = n => Object.fromEntries(UPGRADE_KEYS.map(k => [k, k === 'nitrous' ? Math.max(0, n - 1) : n]));
function classRival(myCls, seed) { const pool = CARS.filter(c => !c.ownerGift && c.id !== S.current && Math.abs(classOf(c) - myCls) <= (myCls >= 9 ? 1 : 0)); const r = (Math.sin(seed) + 1) / 2; return (pool.length ? pool : CARS)[Math.floor(r * pool.length) % Math.max(1, pool.length)]?.id || 'f82'; }
const BRACKET = { dial: null, car: null };

function renderModes(body, car, myCls) {
  const ko = S.ko && S.ko.car === S.current ? S.ko : null;
  const d = dailyChallenge(), dc = CAR_BY_ID[d.car], ds = S.daily?.id === d.id ? S.daily : { id: d.id, best: null, claimed: false };
  const myBc = carBuild();
  if (BRACKET.car !== S.current || BRACKET.dial == null) { BRACKET.car = S.current; BRACKET.dial = Math.ceil((simulateRun(myBc, { distance: 'quarter', nitrous: true }).result.player.et + 0.02) * 20) / 20; }
  const koRounds = ko ? knockoutRounds(ko.cls, ko.seed) : null;
  body.innerHTML = `<div class="cards modes">
    <div class="ev mode"><span class="mk">${ko ? 'ROUND ' + (ko.round + 1) + ' OF 3' : 'CLASS ' + myCls + ' · 3 ROUNDS'}</span><span class="nm">${MODE_INFO.knockout.name}</span><span class="sp">${MODE_INFO.knockout.short}</span>
      ${ko ? `<span class="sp">Next: <b>${esc(koRounds[ko.round].name)}</b> vs ${esc(CAR_BY_ID[koRounds[ko.round].opp.car].name)} · ${VENUES[koRounds[ko.round].venue].name}</span>` : ''}
      <span class="pr">${money(knockoutPrize(myCls))}<small>win all 3</small></span><button class="primary" id="m-ko">${ko ? 'NEXT ROUND ▸' : 'ENTER CUP ▸'}</button></div>
    <div class="ev mode"><span class="mk">1/4 MILE · INDEX</span><span class="nm">${MODE_INFO.bracket.name}</span><span class="sp">${MODE_INFO.bracket.short}</span>
      <div class="dial"><button class="btn" id="m-dial-dn">−</button><b>${BRACKET.dial.toFixed(2)}<small>DIAL-IN</small></b><button class="btn" id="m-dial-up">+</button></div>
      <span class="pr">${money(Math.round(quickReward(myCls) * 1.3 / 25) * 25)}</span><button class="primary" id="m-br">RACE ▸</button></div>
    <div class="ev mode"><span class="mk">40 MPH ROLL · 1/2 MILE</span><span class="nm">${MODE_INFO.roll.name}</span><span class="sp">${MODE_INFO.roll.short}</span>
      <span class="pr">${money(Math.round(quickReward(myCls) * 1.2 / 25) * 25)}</span><button class="primary" id="m-roll">RACE ▸</button></div>
    <div class="ev mode daily"><span class="mk">TODAY · ${VENUES[d.venue].name} · ${DIST_LABEL[d.distance]}</span><span class="nm">${MODE_INFO.daily.name}</span>
      <img loading="lazy" src="${thumb(dc)}" alt=""><span class="sp">Drive a stock <b>${esc(dc.year + ' ' + dc.make + ' ' + dc.name)}</b>. Beat <b>${d.target.toFixed(3)} s</b>.${ds.best ? ` Your best today: <b>${ds.best.toFixed(3)}</b>` : ''}</span>
      <span class="pr">${ds.claimed ? '✓ CLAIMED' : money(d.reward)}</span><button class="primary" id="m-daily">TRY IT ▸</button></div>
  </div>`;
  $('m-ko').onclick = () => {
    if (!S.ko || S.ko.car !== S.current) { S.ko = { car: S.current, cls: myCls, seed: (Math.random() * 1e9) | 0, round: 0 }; persist(); }
    const k = S.ko, rd = knockoutRounds(k.cls, k.seed)[k.round], last = k.round === 2;
    preRace({ kind: 'mode', mode: 'knockout', venue: rd.venue, distance: rd.distance, opp: rd.opp, title: `${MODE_INFO.knockout.name} · ${rd.name}`, purse: last ? knockoutPrize(k.cls) : 0, cls: k.cls,
      note: last ? `Final! Win for ${money(knockoutPrize(k.cls))}.` : 'Win to go through. Lose and the cup is over.',
      after: won => { if (!S.ko) return; if (won && S.ko.round < 2) { S.ko.round++; toast(`Through to the ${knockoutRounds(S.ko.cls, S.ko.seed)[S.ko.round].name}!`); } else { if (won) toast('Knockout Cup champion!'); else toast('Knocked out — enter again any time'); S.ko = null; } persist(); } });
  };
  $('m-dial-dn').onclick = () => { BRACKET.dial = Math.max(4, +(BRACKET.dial - 0.05).toFixed(2)); renderRaces(); };
  $('m-dial-up').onclick = () => { BRACKET.dial = +(BRACKET.dial + 0.05).toFixed(2); renderRaces(); };
  $('m-br').onclick = () => {
    const oppId = classRival(myCls, Date.now() / 1000), lv = lvAll(avgLvRound()), oc = CAR_BY_ID[oppId];
    const oDial = Math.ceil((simulateRun(buildCar(oc, lv, defaultTune(oc, lv)), { distance: 'quarter', nitrous: true }).result.player.et + 0.08) * 20) / 20;
    const myDial = BRACKET.dial;
    preRace({ kind: 'mode', mode: 'bracket', venue: 'ga', distance: 'quarter', opp: { car: oppId, lv, ai: 3 }, title: 'Bracket Racing', purse: Math.round(quickReward(myCls) * 1.3 / 25) * 25, cls: myCls, aiDial: oDial,
      note: `Your dial-in <b>${myDial.toFixed(2)}</b> · rival dial-in <b>${oDial.toFixed(2)}</b>. Run as close to your dial as you can — quicker than it is a breakout and loses. Ease off the gas near the finish if you're running too quick.`,
      decide: r => { const p = r.player.et, o = r.opponent?.et; r.winner = bracketWinner(p, myDial, o, oDial); r.modeNote = `Bracket: you ${p ? (p - myDial >= 0 ? '+' : '') + (p - myDial).toFixed(3) : 'DNF'} off your ${myDial.toFixed(2)} dial${p != null && p < myDial ? ' (BREAKOUT)' : ''} · rival ${o ? (o - oDial >= 0 ? '+' : '') + (o - oDial).toFixed(3) : 'DNF'} off ${oDial.toFixed(2)}${o != null && o < oDial ? ' (BREAKOUT)' : ''}.`; } });
  };
  $('m-roll').onclick = () => {
    const oppId = classRival(myCls, Date.now() / 997), venues = ['tx', 'la', 'dxb', 'det', 'tk'];
    preRace({ kind: 'mode', mode: 'roll', venue: venues[(Math.random() * venues.length) | 0], distance: 'half', roll: 17.88, opp: { car: oppId, lv: lvAll(avgLvRound()), ai: 3 }, title: 'Highway Roll', purse: Math.round(quickReward(myCls) * 1.2 / 25) * 25, cls: myCls });
  };
  $('m-daily').onclick = () => {
    preRace({ kind: 'mode', mode: 'daily', borrow: d.car, venue: d.venue, distance: d.distance, opp: null, title: 'Daily Challenge', purse: ds.claimed ? 0 : d.reward, cls: classOf(dc),
      note: `Beat <b>${d.target.toFixed(3)} s</b> in a stock ${esc(dc.name)}. ${ds.claimed ? 'Already claimed today — run it for a better time.' : 'First success today pays ' + money(d.reward) + '.'}`,
      decide: r => { const et = r.player.et; const won = et != null && et <= d.target; r.winner = won ? 'player' : 'ai'; r.modeNote = `Target ${d.target.toFixed(3)} s · you ran ${fmt3(et)}${won ? ' — challenge beaten!' : ''}`;
        const cur = S.daily?.id === d.id ? S.daily : { id: d.id, best: null, claimed: false }; if (et && (!cur.best || et < cur.best)) cur.best = et; if (won) cur.claimed = true; S.daily = cur; } });
  };
}

// ───────────────────────── paint & style shop ─────────────────────────
let styleSel = 'paint';
const STYLE_SETS = { paint: ['Paint', PAINTS], wheels: ['Wheels', WHEELS], stance: ['Stance', STANCES], glow: ['Underglow', GLOWS], flame: ['Nitrous flame', FLAMES] };
const SWATCH = { paint: { factory: 'conic-gradient(#888,#444,#888)', black: '#0b0b0d', white: '#f2f2f0', silver: '#b8bec6' }, wheels: { factory: 'conic-gradient(#999,#555,#999)', black: '#111', chrome: 'linear-gradient(135deg,#fff,#9aa,#fff)' }, flame: { blue: '#4aa8ff', purple: '#b04dff', green: '#3dff7a', red: '#ff4d2d' } };
function swatch(key, id, opt) {
  if (SWATCH[key]?.[id]) return SWATCH[key][id];
  if (key === 'glow') return opt ? opt : 'repeating-linear-gradient(45deg,#222 0 4px,#333 4px 8px)';
  if (opt?.hue != null) return `hsl(${opt.hue} ${Math.round(opt.sat * 100)}% 48%)`;
  return '#333';
}
function paintStylePreview() {
  const cv = $('style-canvas'); if (!cv) return; const r = cv.getBoundingClientRect(); if (!r.width) return;
  const dpr = Math.min(devicePixelRatio || 1, 2.5); cv.width = r.width * dpr; cv.height = r.height * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height, floorY = H * 0.86;
  const sp = g.createRadialGradient(W / 2, floorY, 10, W / 2, floorY, W * 0.5); sp.addColorStop(0, 'rgba(255,190,90,.2)'); sp.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sp; g.save(); g.translate(W / 2, floorY); g.scale(1, 0.18); g.beginPath(); g.arc(0, 0, W * 0.5, 0, 7); g.fill(); g.restore();
  drawCar(g, CAR_BY_ID[S.current], W / 2, floorY, Math.min(W * 0.9, H * 2.6), { look: S.owned[S.current].look, nos: S.owned[S.current].lv.nitrous > 0 && styleSel === 'flame' });
}
function renderStyle() {
  const o = S.owned[S.current]; o.look = cleanLook(o.look);
  const [label, set] = STYLE_SETS[styleSel];
  const scr = $('scr-style');
  scr.innerHTML = `<div class="style-wrap"><div class="style-prev"><canvas id="style-canvas" aria-label="Car preview"></canvas></div>
    <div class="style-side"><div class="tabs">${Object.entries(STYLE_SETS).map(([k, [l]]) => `<button data-ss="${k}" class="${k === styleSel ? 'on' : ''}">${l.toUpperCase()}</button>`).join('')}</div>
    <div class="swatches">${Object.entries(set).map(([id, opt]) => { const cur = o.look[styleSel] === id, free = id === Object.keys(set)[0] || (styleSel === 'flame' && id === 'blue'); return `<button class="sw ${cur ? 'on' : ''}" data-sv="${id}"><i style="background:${swatch(styleSel, id, opt)}"></i><b>${esc(opt?.name || (styleSel === 'glow' ? (id === 'off' ? 'Off' : id[0].toUpperCase() + id.slice(1)) : id[0].toUpperCase() + id.slice(1)))}</b><small>${cur ? 'ON YOUR CAR' : free ? 'FREE' : money(LOOK_PRICES[styleSel])}</small></button>`; }).join('')}</div>
    <p class="hint">${styleSel === 'paint' ? 'Paint changes the body colour. Black, white and grey cars take colours as a tint.' : styleSel === 'stance' ? 'Lowers the body over the wheels. Looks only — handling is unchanged.' : styleSel === 'flame' ? 'Colour of the exhaust flame when nitrous fires.' : styleSel === 'glow' ? 'Neon light under the car.' : 'Wheel finish. Tires stay black.'} Your rival sees your style in online races.</p></div></div>`;
  scr.querySelectorAll('[data-ss]').forEach(b => b.onclick = () => { styleSel = b.dataset.ss; renderStyle(); });
  scr.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => { const r = buyLook(S, styleSel, b.dataset.sv); if (!r.ok) { toast(r.reason === 'cash' ? 'Not enough cash' : 'Not available'); return; } if (r.price) toast(`${label} applied · −${money(r.price)}`); persist(); renderStyle(); haptic('light', S.settings); });
  requestAnimationFrame(paintStylePreview);
}
onSpriteLoad(id => { if (screen === 'style' && id === S.current) paintStylePreview(); });

// ───────────────────────── boot ─────────────────────────
// Inside Yard Games (served at /belt-run/), the brand doubles as a way back to the other games.
if (/\/belt-run\//.test(location.pathname)) {
  const b = document.querySelector('.brand'); const a = document.createElement('a');
  a.href = '../'; a.className = 'yard-back'; a.textContent = '‹ YARD GAMES'; a.setAttribute('aria-label', 'Back to Yard Games');
  b.after(a);
}
refreshTop();
if (onlineCode) go('races'); else go('garage');
if (S.legacy && !S.legacyShown) { S.legacyShown = true; persist(); toast('Welcome back — a cash bonus from your previous Belt Run career was added'); }
window.__belt = { get S() { return S; }, go, launch };
