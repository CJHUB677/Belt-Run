// BELT RUN engine-sound profiles.
// Every car maps to a profile describing HOW its engine sounds: firing angles per cylinder
// (crank degrees over a 720° four-stroke cycle), exhaust bank layout, pulse shape, exhaust
// resonance, intake character, VTEC crossover and induction (turbo / supercharger).
// These drive the procedural synthesizer in engine-dsp.js. No recordings are involved.
(function (root) {
  'use strict';
  const even = (n, banks = 1) => Array.from({ length: n }, (_, i) => ({ a: i * 720 / n, bank: banks === 2 ? i % 2 : 0 }));
  // Cross-plane V8 (GM/Hemi-style order 1-8-7-2-6-5-4-3, odd cylinders on bank 0):
  // each bank fires at uneven intervals, which is what gives the classic V8 burble.
  const crossV8 = () => [0, 1, 0, 1, 1, 0, 1, 0].map((bank, i) => ({ a: i * 90, bank }));
  // Flat-plane V8: banks alternate, so each bank is evenly spaced (higher, smoother "scream").
  const flatV8 = () => even(8, 2);
  // Subaru EJ boxer with unequal-length headers: order 1-3-2-4 → banks R,R,L,L.
  const boxer4 = () => [0, 0, 1, 1].map((bank, i) => ({ a: i * 180, bank }));
  // Twin-rotor Wankel: two exhaust events per eccentric-shaft revolution → 4 per 720°.
  const rotary = () => even(4, 2);

  const BASE = {
    i4: { cyl: even(4), bankMs: [0, 0], tau: 1.6, noise: 0.22, exF: 150, exQ: 0.45, bright: 0.55, intakeF: 1900, rough: 0.10, idle: 850 },
    i4vtec: { cyl: even(4), bankMs: [0, 0], tau: 1.3, noise: 0.20, exF: 170, exQ: 0.40, bright: 0.62, intakeF: 2300, rough: 0.08, idle: 900 },
    boxer4: { cyl: boxer4(), bankMs: [0, 1.9], tau: 2.0, noise: 0.25, exF: 115, exQ: 0.55, bright: 0.45, intakeF: 1600, rough: 0.22, idle: 800 },
    i5: { cyl: even(5), bankMs: [0, 0], tau: 1.7, noise: 0.22, exF: 135, exQ: 0.50, bright: 0.58, intakeF: 1750, rough: 0.12, idle: 800, warble: 0.18 },
    i6: { cyl: even(6), bankMs: [0, 0], tau: 1.5, noise: 0.18, exF: 160, exQ: 0.42, bright: 0.60, intakeF: 2100, rough: 0.05, idle: 750 },
    v6: { cyl: even(6, 2), bankMs: [0, 0.9], tau: 1.7, noise: 0.22, exF: 140, exQ: 0.48, bright: 0.50, intakeF: 1800, rough: 0.10, idle: 750 },
    flat6: { cyl: even(6, 2), bankMs: [0, 0.25], tau: 1.2, noise: 0.20, exF: 175, exQ: 0.40, bright: 0.68, intakeF: 2600, rough: 0.06, idle: 850 },
    crossV8: { cyl: crossV8(), bankMs: [0, 1.4], tau: 2.2, noise: 0.26, exF: 105, exQ: 0.58, bright: 0.40, intakeF: 1500, rough: 0.18, idle: 700 },
    flatV8: { cyl: flatV8(), bankMs: [0, 0.2], tau: 1.3, noise: 0.20, exF: 165, exQ: 0.42, bright: 0.66, intakeF: 2500, rough: 0.07, idle: 900 },
    v10: { cyl: even(10, 2), bankMs: [0, 0.2], tau: 1.1, noise: 0.18, exF: 185, exQ: 0.40, bright: 0.72, intakeF: 2800, rough: 0.06, idle: 1000 },
    rotary: { cyl: rotary(), bankMs: [0, 0.3], tau: 0.8, noise: 0.40, exF: 190, exQ: 0.35, bright: 0.78, intakeF: 2400, rough: 0.30, idle: 950 },
  };

  // Induction presets. whistle = compressor whistle range (Hz) at low→full shaft speed.
  const IND = {
    na: { type: 'na' },
    turbo: { type: 'turbo', twin: false, whistle: [2600, 7200], whistleGain: 0.020, hiss: 0.030, spool: [1500, 2800], rate: 7, bov: 'bov', bovGain: 0.07 },
    twin: { type: 'turbo', twin: true, whistle: [3000, 8200], whistleGain: 0.016, hiss: 0.028, spool: [1600, 3000], rate: 7, bov: 'bov', bovGain: 0.06 },
    sc: { type: 'sc', whineRatio: 2.4, whineGain: 0.030 },
  };

  function inductionFor(c) {
    const e = (c.engine || '').toLowerCase();
    if (c.na || /naturally aspirated|\bna\b/.test(e)) return { ...IND.na };
    if (/supercharged/.test(e)) return { ...IND.sc };
    if (/twin-turbo/.test(e)) return { ...IND.twin };
    return { ...IND.turbo };
  }

  function layoutFor(c) {
    const e = (c.engine || '').toLowerCase();
    if (/rotary/.test(e)) return 'rotary';
    if (/v10/.test(e)) return 'v10';
    if (/flat-six/.test(e)) return 'flat6';
    if (/flat-four/.test(e)) return 'boxer4';
    if (/inline-five/.test(e)) return 'i5';
    if (/v8/.test(e)) {
      // Flat-plane crank V8s in the roster: Ferrari 488 Pista F154, McLaren 720S M840T, Corvette C8 Z06 LT6.
      if (['pista', 'mclaren', 'z06c8'].includes(c.id)) return 'flatV8';
      return 'crossV8';
    }
    if (/v6/.test(e)) return 'v6';
    if (/\bi6\b|flat-?six|straight-six|2jz|1jz|rb26|s5[458]|b58/.test(e)) return 'i6';
    if (/vtec/.test(e)) return 'i4vtec';
    if (/\bi4\b|sr20|4g63|ea888|k20/.test(e)) return 'i4';
    return 'i6';
  }

  // Per-car character overrides on top of the layout preset.
  const OVERRIDES = {
    // Buj's single-turbo S55: a big single compressor spins slower (lower, louder whistle),
    // boost arrives late (matches physics bigTurbo 3,300–5,000 rpm), compressor-surge flutter on lift.
    buj: { tag: 'single-turbo S55', exF: 128, exQ: 0.55, bright: 0.66, crackle: 0.35, gain: 1.08,
      ind: { type: 'turbo', twin: false, single: true, whistle: [1700, 5200], whistleGain: 0.042, hiss: 0.055, spool: [3300, 5000], rate: 3.2, bov: 'flutter', bovGain: 0.11 } },
    // The owner's 1,200 HP X4 M target: twin big turbos (two detuned compressors), deeper valved
    // exhaust, louder vented blow-off. Spool window follows the physics bigTurbo curve.
    userx4: { tag: '1,200 HP twin big-turbo S58', exF: 98, exQ: 0.62, bright: 0.52, crackle: 0.22, gain: 1.12,
      ind: { type: 'turbo', twin: true, whistle: [2100, 6400], whistleGain: 0.034, hiss: 0.060, spool: [3300, 5000], rate: 4.0, bov: 'bov', bovGain: 0.12, twinDetune: 1.11 } },
    // 1Stock tribute: built B58, fictional big turbo, aggressive 2-step.
    onestock: { tag: 'big-turbo B58 (fictional)', exF: 120, bright: 0.62, crackle: 0.35, launchPops: 0.5,
      ind: { type: 'turbo', twin: false, single: true, whistle: [1900, 6000], whistleGain: 0.032, hiss: 0.05, spool: [2600, 4200], rate: 4.5, bov: 'flutter', bovGain: 0.09 } },
    // Rear bumper delete: more exposed exhaust → slightly louder and rawer, a bit more overrun.
    huracan: { exQ: 0.46, bright: 0.78, gain: 1.10, crackle: 0.30 },
    r8: { crackle: 0.18 },
    gt3rs: { bright: 0.78, exF: 190 },
    amggtr: { crackle: 0.30, exF: 100 }, c63s: { crackle: 0.32, exF: 98 }, e63s: { crackle: 0.25 }, glc63s: { crackle: 0.28 },
    m3e92: { exF: 150, bright: 0.62, tau: 1.5, rough: 0.08 }, // high-revving NA S65
    m3e46: { bright: 0.70 }, // S54 intake howl
    rs3: { crackle: 0.22 }, ttrs: { crackle: 0.22 },
    demon170: { gain: 1.10, ind: { type: 'sc', whineRatio: 2.6, whineGain: 0.045 } },
    trx: { exF: 95 }, durango: { exF: 98 }, trackhawk: { exF: 100 },
    mustanggt: { exF: 112 }, z06c8: { bright: 0.74, exF: 175 },
    rx7: { crackle: 0.20 },
    stigD: { crackle: 0.15 },
    supraa80: { exF: 150 },
  };

  // VTEC crossover points (rpm) — where the high-lift cam engages. Approximate published values.
  const VTEC = { civicsi: 5600, s2000: 6000, ek9: 5800, dc2: 5700, dc5: 5800, typer: 0 };

  function profileFor(c) {
    const layout = layoutFor(c);
    const base = BASE[layout];
    const ov = OVERRIDES[c.id] || {};
    const ind = ov.ind ? { ...ov.ind } : inductionFor(c);
    // bigTurbo cars use the same spool window as the physics torque curve (3,300–5,000 rpm).
    if (c.bigTurbo && ind.type === 'turbo' && !ov.ind) ind.spool = [3300, 5000];
    const p = {
      id: c.id, layout, tag: ov.tag || layoutLabel(layout, ind),
      cyl: base.cyl.map(x => ({ ...x })), bankMs: [...base.bankMs],
      tau: ov.tau ?? base.tau, noise: base.noise, exF: ov.exF ?? base.exF, exQ: ov.exQ ?? base.exQ,
      bright: ov.bright ?? base.bright, intakeF: base.intakeF, rough: ov.rough ?? base.rough,
      warble: base.warble || 0, idle: base.idle, red: c.red, vtec: VTEC[c.id] || 0,
      crackle: ov.crackle ?? (ind.type === 'na' ? 0.10 : 0.14), launchPops: ov.launchPops ?? (ind.type === 'turbo' ? 0.25 : 0.08),
      gain: ov.gain ?? 1, ind,
    };
    return p;
  }

  function layoutLabel(layout, ind) {
    const L = { i4: 'inline-four', i4vtec: 'VTEC inline-four', boxer4: 'flat-four (unequal headers)', i5: 'inline-five', i6: 'inline-six', v6: 'V6', flat6: 'flat-six', crossV8: 'cross-plane V8', flatV8: 'flat-plane V8', v10: 'V10', rotary: 'twin-rotor' }[layout];
    const I = ind.type === 'sc' ? ' supercharged' : ind.type === 'turbo' ? (ind.twin ? ' twin-turbo' : ' turbo') : ' naturally aspirated';
    return L + I;
  }

  const api = { profileFor, layoutFor, inductionFor, BASE, VTEC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EngineProfiles = api;
})(typeof window !== 'undefined' ? window : globalThis);
