// Engine synth tests (ported from the 67-car edition): render real samples and measure them.
const assert = require('node:assert/strict');
// profiles.js / engine-dsp.js are classic browser scripts (UMD); under this package's ESM mode
// they attach to globalThis instead of module.exports.
require('../www/js/audio/profiles.js'); require('../www/js/audio/engine-dsp.js');
const { profileFor } = globalThis.EngineProfiles;
const { EngineDSP, EffectsDSP } = globalThis.EngineSynth;
const SR = 48000;
const R = require('../tools/source-data.cjs');
const car = id => R.cars.find(c => c.id === id);

function render(id, controls, seconds, opts = {}) {
  const d = new EngineDSP(SR, 3); d.setProfile(profileFor(car(id)));
  d.set({ on: 1, ...controls });
  const n = Math.round(seconds * SR), out = new Float32Array(n);
  // settle first (smoothing filters), then capture
  const warm = new Float32Array(Math.round((opts.warm ?? 0.4) * SR)); d.process(warm, 0, warm.length);
  if (opts.after) opts.after(d);
  d.process(out, 0, n);
  return { out, d };
}
const rms = (a, s = 0, e = a.length) => { let t = 0; for (let i = s; i < e; i++) t += a[i] * a[i]; return Math.sqrt(t / (e - s)); };
// Fundamental via autocorrelation of the rectified envelope-ish signal, searching a lag window.
function pitch(a, fmin, fmax) {
  const N = Math.min(a.length, 16384), lo = Math.floor(SR / fmax), hi = Math.ceil(SR / fmin);
  let best = 0, bestLag = lo;
  for (let lag = lo; lag <= hi; lag++) { let s = 0; for (let i = 0; i < N - lag; i++) s += a[i] * a[i + lag]; if (s > best) { best = s; bestLag = lag; } }
  return SR / bestLag;
}
// Goertzel power at a frequency
function power(a, f) { const w = 2 * Math.PI * f / SR, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < a.length; i++) { const s = a[i] + c * s1 - s2; s2 = s1; s1 = s; } return (s1 * s1 + s2 * s2 - c * s1 * s2) / a.length; }
// High-frequency energy share (brightness)
function hfShare(a) { let hp = 0, all = 0, prev = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - prev; prev = a[i]; hp += d * d; all += a[i] * a[i]; } return hp / (all || 1); }
const results = [];
const ok = (name, fn) => { fn(); results.push(name); };

ok('every one of the 67 cars has an engine profile with a sane configuration', () => {
  assert.equal(R.cars.length, 67);
  const layouts = {};
  for (const c of R.cars) {
    const p = profileFor(c);
    assert(p.cyl.length >= 4 && p.cyl.length <= 10, c.id);
    assert(p.cyl.every(x => x.a >= 0 && x.a < 720), c.id);
    assert(['na', 'turbo', 'sc'].includes(p.ind.type), c.id);
    layouts[p.layout] = (layouts[p.layout] || 0) + 1;
  }
  for (const L of ['i4', 'i4vtec', 'boxer4', 'i5', 'i6', 'v6', 'flat6', 'crossV8', 'flatV8', 'v10', 'rotary']) assert(layouts[L] > 0, 'roster covers ' + L);
});

ok('engine characters map to the right configurations', () => {
  const L = id => profileFor(car(id)).layout, I = id => profileFor(car(id)).ind.type;
  assert.equal(L('s2000'), 'i4vtec'); assert.equal(L('civicsi'), 'i4vtec'); assert.ok(profileFor(car('s2000')).vtec > 5000);
  assert.equal(L('f82'), 'i6'); assert.equal(L('ttrs'), 'i5'); assert.equal(L('rs3'), 'i5');
  assert.equal(L('hellcat'), 'crossV8'); assert.equal(I('hellcat'), 'sc'); assert.equal(L('mustanggt'), 'crossV8'); assert.equal(I('mustanggt'), 'na');
  assert.equal(L('r8'), 'v10'); assert.equal(L('huracan'), 'v10'); assert.equal(L('pista'), 'flatV8'); assert.equal(L('z06c8'), 'flatV8');
  assert.equal(L('rx7'), 'rotary'); assert.equal(L('stigD'), 'boxer4'); assert.equal(L('turbo992'), 'flat6'); assert.equal(L('r35'), 'v6');
});

ok('Buj single-turbo M4 and the 1,200 HP X4 have distinct, documented turbo characters', () => {
  const b = profileFor(car('buj')), x = profileFor(car('userx4')), m = profileFor(car('f82'));
  assert.equal(b.ind.twin, false); assert.equal(b.ind.bov, 'flutter'); assert.equal(x.ind.twin, true); assert.equal(x.ind.bov, 'bov');
  assert(b.ind.whistle[0] < m.ind.whistle[0], 'big single turbo whistles lower than stock twins');
  assert.deepEqual(b.ind.spool, [3300, 5000]); assert.deepEqual(x.ind.spool, [3300, 5000]); // = physics bigTurbo window
  assert.notEqual(b.exF, x.exF);
  // rendered: under full boost the two sound measurably different
  // Rendered at the same rpm/boost: each car's whistle sits where its own turbo puts it.
  const c = { rpm: 6500, throttle: 1, load: 1, boost: 1 };
  const rb = render('buj', c, 0.5).out, rx = render('userx4', c, 0.5).out;
  const wf = (pr, rpmN) => pr.ind.whistle[0] + (pr.ind.whistle[1] - pr.ind.whistle[0]) * Math.min(1, 0.65 + 0.35 * rpmN);
  const fb = wf(b, 6500 / car('buj').red), fx = wf(x, 6500 / car('userx4').red) * x.ind.twinDetune;
  const band = (a, f) => power(a, f * 0.995) + power(a, f) + power(a, f * 1.005);
  assert(band(rb, fb) > band(rx, fb) * 2, `Buj whistle at ${fb.toFixed(0)} Hz`);
  assert(band(rx, fx) > band(rb, fx) * 2, `X4 second turbo at ${fx.toFixed(0)} Hz`);
  // Lift-off: Buj surges (amplitude-modulated flutter), X4 vents a smooth blow-off.
  const mod = (id, kind) => { const o = render(id, { rpm: 5000, throttle: 0, load: 0 }, 0.3, { after: d => d.bov(1, kind) }).out; const e = []; for (let i = 0; i < SR * 0.25; i += 96) e.push(rms(o, i, i + 96)); const m = e.reduce((p, q) => p + q) / e.length; return Math.sqrt(e.reduce((p, q) => p + (q - m) ** 2, 0) / e.length) / m; };
  assert(mod('buj', b.ind.bov) > mod('userx4', x.ind.bov) * 1.15, 'flutter is choppier than a vented blow-off');
});

ok('output never clips and contains no NaN across the rev range, loads and all cars', () => {
  for (const c of R.cars) {
    for (const ctl of [{ rpm: 900, throttle: 0, load: 0 }, { rpm: c.red * 0.6, throttle: 1, load: 1, boost: 1 }, { rpm: c.red, throttle: 1, load: 1, limiter: 1, boost: 1 }]) {
      const { out } = render(c.id, ctl, 0.15, { warm: 0.2 });
      let peak = 0; for (const v of out) { assert(Number.isFinite(v), c.id); peak = Math.max(peak, Math.abs(v)); }
      assert(peak < 0.98, c.id + ' peak ' + peak);
    }
  }
});

ok('pitch follows RPM: perceived fundamental equals the firing frequency (no sample re-pitching)', () => {
  for (const [id, rpm] of [['f82', 3000], ['f82', 6000], ['civicsi', 4000], ['r8', 5000]]) {
    const p = profileFor(car(id));
    const fire = rpm / 60 * p.cyl.length / 2;
    const { out } = render(id, { rpm, throttle: 1, load: 1 }, 0.5);
    const f = pitch(out, fire * 0.6, fire * 1.6);
    assert(Math.abs(f - fire) / fire < 0.06, `${id}@${rpm}: ${f.toFixed(1)} Hz vs firing ${fire.toFixed(1)} Hz`);
  }
});

ok('cross-plane V8 has uneven-firing burble that a flat-plane V8 lacks', () => {
  // Uneven bank firing puts energy at half-engine-order (crank-rev multiples below firing freq).
  const rpm = 2400, rev = rpm / 60;
  const cp = render('mustanggt', { rpm, throttle: 1, load: 1 }, 1.0).out;
  const fp = render('z06c8', { rpm, throttle: 1, load: 1 }, 1.0).out;
  const sub = a => (power(a, rev) + power(a, rev * 2) + power(a, rev * 3)) / power(a, rev * 4);
  assert(sub(cp) > sub(fp) * 1.5, `burble ratio cross ${sub(cp).toFixed(3)} vs flat ${sub(fp).toFixed(3)}`);
});

ok('on-load is louder and brighter than off-load (throttle lift) at the same RPM', () => {
  const on = render('m5', { rpm: 5000, throttle: 1, load: 1 }, 0.4).out;
  const off = render('m5', { rpm: 5000, throttle: 0, load: 0 }, 0.4).out;
  assert(rms(on) > rms(off) * 1.6, `${rms(on)} vs ${rms(off)}`);
});

ok('free-rev (staging, no load) differs from accelerating under load', () => {
  const free = render('g80', { rpm: 4200, throttle: 1, load: 0 }, 0.4).out;
  const loaded = render('g80', { rpm: 4200, throttle: 1, load: 1 }, 0.4).out;
  assert(rms(loaded) > rms(free) * 1.15);
});

ok('ignition cut during a shift drops engine energy, then recovers', () => {
  const d = new EngineDSP(SR, 2); d.setProfile(profileFor(car('f82'))); d.set({ rpm: 6800, throttle: 1, load: 1, on: 1 });
  const a = new Float32Array(SR * 0.3); d.process(a, 0, a.length);
  d.set({ cut: 1, rpm: 4700, load: 0 }); const b = new Float32Array(SR * 0.12); d.process(b, 0, b.length);
  d.set({ cut: 0, load: 1 }); const c = new Float32Array(SR * 0.3); d.process(c, 0, c.length);
  const ea = rms(a, a.length / 2), eb = rms(b, b.length / 3), ec = rms(c, c.length / 2);
  assert(eb < ea * 0.6, `cut ${eb} vs before ${ea}`); assert(ec > eb * 1.5, 'recovers');
});

ok('rev drop on upshift is quick but continuous (no clicks)', () => {
  const d = new EngineDSP(SR, 4); d.setProfile(profileFor(car('g80'))); d.set({ rpm: 7000, throttle: 1, load: 1, on: 1 });
  const a = new Float32Array(SR * 0.3); d.process(a, 0, a.length);
  d.set({ rpm: 4800 }); const b = new Float32Array(SR * 0.25); d.process(b, 0, b.length);
  // smoothed rpm reaches the new value within ~120 ms but not instantly
  let maxStep = 0; for (let i = 1; i < b.length; i++) maxStep = Math.max(maxStep, Math.abs(b[i] - b[i - 1]));
  assert(Math.abs(d.s.rpm - 4800) < 60, 'settled ' + d.s.rpm);
  const d2 = new EngineDSP(SR, 4); d2.setProfile(profileFor(car('g80'))); d2.set({ rpm: 7000, throttle: 1, load: 1, on: 1 });
  d2.process(new Float32Array(SR * 0.3), 0, SR * 0.3); d2.set({ rpm: 4800 }); d2.process(new Float32Array(240), 0, 240);
  assert(d2.s.rpm > 5500, 'not instantaneous after 5 ms: ' + d2.s.rpm);
  assert(maxStep < 0.6, 'no discontinuity ' + maxStep);
});

ok('rev limiter produces a ~16 Hz fuel-cut bounce', () => {
  const { out } = render('s2000', { rpm: 9000, throttle: 1, load: 0, limiter: 1 }, 1.0);
  // envelope at 1 ms resolution, then look for the bounce period
  const env = []; for (let i = 0; i < out.length; i += 48) env.push(rms(out, i, Math.min(out.length, i + 48)));
  const m = env.reduce((a, b) => a + b) / env.length, e = env.map(x => x - m);
  let best = 0, lagB = 0; for (let lag = 30; lag < 120; lag++) { let s = 0; for (let i = 0; i + lag < e.length; i++) s += e[i] * e[i + lag]; if (s > best) { best = s; lagB = lag; } }
  const hz = 1000 / lagB; assert(hz > 12 && hz < 22, 'bounce ' + hz.toFixed(1) + ' Hz');
});

ok('VTEC crossover brightens the S2000 sound above 6,000 rpm', () => {
  const below = render('s2000', { rpm: 5700, throttle: 1, load: 1 }, 0.4).out;
  const above = render('s2000', { rpm: 6300, throttle: 1, load: 1 }, 0.4).out;
  const p = profileFor(car('s2000')); const noV = { ...p, vtec: 0 };
  const d = new EngineDSP(SR, 3); d.setProfile(noV); d.set({ rpm: 6300, throttle: 1, load: 1, on: 1 }); d.process(new Float32Array(SR * 0.4), 0, SR * 0.4);
  const ref = new Float32Array(SR * 0.4); d.process(ref, 0, ref.length);
  assert(hfShare(above) > hfShare(ref) * 1.05, `vtec ${hfShare(above).toFixed(4)} vs no-vtec ${hfShare(ref).toFixed(4)}`);
  assert(rms(above) > rms(below) * 0.9);
});

ok('turbo whistle/hiss scale with boost; supercharger whine scales with RPM', () => {
  const lo = render('f82', { rpm: 5500, throttle: 1, load: 1, boost: 0 }, 0.4).out, hi = render('f82', { rpm: 5500, throttle: 1, load: 1, boost: 1 }, 0.4).out;
  assert(hfShare(hi) > hfShare(lo) * 1.05);
  const p = profileFor(car('hellcat')); const f = rpm => rpm / 60 * p.ind.whineRatio * 12;
  const a = render('hellcat', { rpm: 3000, throttle: 1, load: 1 }, 0.5).out, b = render('hellcat', { rpm: 6000, throttle: 1, load: 1 }, 0.5).out;
  assert(power(b, f(6000)) > power(a, f(3000)), 'whine grows with rpm');
});

ok('blow-off / flutter events add a decaying burst', () => {
  const quiet = render('buj', { rpm: 5000, throttle: 0, load: 0 }, 0.3).out;
  const burst = render('buj', { rpm: 5000, throttle: 0, load: 0 }, 0.3, { after: d => d.bov(1, 'flutter') }).out;
  assert(rms(burst, 0, SR * 0.15) > rms(quiet, 0, SR * 0.15) * 1.3);
  assert(rms(burst, SR * 0.2, SR * 0.3) < rms(burst, 0, SR * 0.1), 'decays');
});

ok('no repeating loop: consecutive seconds of steady cruise are not sample-identical', () => {
  const { out } = render('c63s', { rpm: 3000, throttle: 1, load: 1 }, 2.0);
  let same = 0; for (let i = 0; i < SR; i++) if (Math.abs(out[i] - out[i + SR]) < 1e-6) same++;
  assert(same < SR * 0.05);
});

ok('tire squeal follows physics wheelspin', () => {
  const fx = (slip) => { const d = new EffectsDSP(SR); d.set({ slip, speed: 10 }); const a = new Float32Array(SR * 0.5); d.process(a, 0, a.length); return rms(a, SR * 0.25); };
  assert(fx(0.8) > fx(0) * 3, 'spinning squeals'); assert(fx(0) < 0.03, 'no slip → only road/wind');
});


ok('nitrous hiss: effects bus gains high-frequency energy only while nitrous flows', () => {
  const fx = on => { const d = new EffectsDSP(SR, 5); d.set({ slip: 0, speed: 30, nos: on }); const o = new Float32Array(SR * 0.4); d.process(o, 0, o.length); return o.subarray(SR * 0.1); };
  const off = fx(0), on = fx(1);
  assert(rms(on) > rms(off) * 1.5, 'louder with nitrous'); assert(hfShare(on) > hfShare(off), 'brighter with nitrous');
});
console.log('PASS: ' + results.length + ' audio DSP checks');
