// BELT RUN procedural engine synthesizer (no recordings).
//
// Technique: each cylinder's combustion event is generated at its real crank angle, so pitch
// comes from the firing rate itself rather than from re-pitching a sample. There are no loops and
// no resampling, so nothing can sound "looped" or chipmunk-shifted. Pulses run through per-bank
// header delays (uneven-firing V8 / boxer burble), an exhaust pipe resonator, four RPM-band
// tone layers (idle / low / mid / high) cross-faded by RPM, and an on-load vs off-load voicing.
// Intake roar, VTEC cam crossover, valvetrain tick, turbo whistle/hiss, blow-off and compressor
// surge, supercharger whine, ignition-cut and rev-limiter patterns, and restrained overrun pops
// are layered on top. Output is DC-blocked and soft-limited.
//
// Runs in three places: an AudioWorkletProcessor (preferred), a ScriptProcessor fallback on the
// main thread, and Node (unit tests render real samples and measure them).
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  // Small RBJ biquad (Direct Form I) with cheap coefficient updates.
  class Biquad {
    constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
    set(type, f, q, sr, gainDb = 0) {
      f = Math.max(10, Math.min(sr * 0.45, f));
      const w = TAU * f / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, gainDb / 40);
      let b0, b1, b2, a0, a1, a2;
      if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
      else { // peaking
        b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
      }
      this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    }
    run(x) {
      const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
      return y;
    }
  }

  // Deterministic PRNG (tests are repeatable; per-voice seed keeps two cars from sounding identical).
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  class EngineDSP {
    constructor(sampleRate, seed = 1) {
      this.sr = sampleRate;
      this.rand = rng(seed);
      this.t = { rpm: 800, throttle: 0, load: 0, cut: 0, limiter: 0, boost: 0, slip: 0, launch: 0, speed: 0, on: 1 };
      this.s = { rpm: 800, throttle: 0, load: 0, boost: 0, on: 0, bright: 0.5 };
      this.theta = 0; this.lastTheta = 0;
      this.bankDelay = [new Float32Array(512), new Float32Array(512)]; this.bdIdx = 0;
      this.bankEnv = [0, 0]; this.bankNoise = [0, 0];
      this.comb = new Float32Array(4096); this.combIdx = 0;
      this.f = { idle: new Biquad(), low: new Biquad(), lowPk: new Biquad(), mid: new Biquad(), high: new Biquad(), offNotch: new Biquad(), intake: new Biquad(), tick: new Biquad(), hiss: new Biquad(), bov: new Biquad(), sq1: new Biquad(), sq2: new Biquad(), body: new Biquad() };
      this.dc = { x1: 0, y1: 0 };
      this.whPh = [0, 0]; this.scPh = [0, 0]; this.limPh = 0; this.cutSkip = 0;
      this.bovEnv = 0; this.bovKind = 'bov'; this.flutPh = 0;
      this.popEnv = 0; this.coefCount = 0; this.peak = 0;
      this.agc = 1; this.agcEnv = 0.0025; this.kEnv = 1 - Math.exp(-1 / (0.12 * sampleRate)); this.kAgc = 1 - Math.exp(-1 / (0.25 * sampleRate));
      this.sqPh = 0; this.sqF = 1000;
      this.setProfile(null);
    }

    setProfile(p) {
      this.p = p || { cyl: [0, 180, 360, 540].map(a => ({ a, bank: 0 })), bankMs: [0, 0], tau: 1.6, noise: 0.2, exF: 150, exQ: 0.45, bright: 0.55, intakeF: 1900, rough: 0.1, warble: 0, idle: 850, red: 7000, vtec: 0, crackle: 0.1, launchPops: 0.1, gain: 1, ind: { type: 'na' } };
      this.angles = this.p.cyl.map(c => c.a).sort((a, b) => a - b);
      this.banks = this.p.cyl.slice().sort((a, b) => a.a - b.a).map(c => c.bank);
      this.bankLag = this.p.bankMs.map(ms => Math.round(ms / 1000 * this.sr));
      this.tauK = Math.exp(-1 / (this.p.tau / 1000 * this.sr));
      this.noiseK = Math.exp(-1 / (0.0026 * this.sr));
      this.combLen = Math.max(8, Math.min(4000, Math.round(this.sr / this.p.exF)));
      this.cylAmp = this.p.cyl.map(() => 0.9 + this.rand() * 0.2); // fixed per-cylinder imbalance
      this.updateCoefs(true);
    }

    // Targets from the game (called per animation frame or per message).
    set(c) { Object.assign(this.t, c); }
    bov(level, kind) { this.bovEnv = Math.max(this.bovEnv, Math.min(1, level)); this.bovKind = kind || this.p.ind.bov || 'bov'; this.flutPh = 0; }

    updateCoefs(force) {
      const p = this.p, sr = this.sr, s = this.s;
      const n = Math.min(1.2, s.rpm / p.red);
      const vtecOn = p.vtec && s.rpm > p.vtec ? 1 : 0;
      this.f.idle.set('lp', 260 + 180 * n, 0.7, sr);
      this.f.low.set('lp', 520 + 500 * n, 0.8, sr);
      this.f.lowPk.set('peak', p.exF * 1.0, 1.2, sr, 5);
      this.f.mid.set('lp', 1300 + 1500 * n * (0.6 + p.bright * 0.6), 0.75, sr);
      this.f.high.set('bp', (1400 + 2600 * n) * (0.7 + p.bright * 0.6) * (vtecOn ? 1.25 : 1), 0.9, sr);
      this.f.offNotch.set('peak', 2000, 1.1, sr, -9);
      this.f.intake.set('bp', p.intakeF * (0.75 + 0.5 * n) * (vtecOn ? 1.35 : 1), 1.4, sr);
      this.f.tick.set('hp', 5500, 0.7, sr);
      this.f.hiss.set('bp', 4200 + 3000 * s.boost, 0.9, sr);
      this.f.bov.set(this.bovKind === 'flutter' ? 'bp' : 'hp', this.bovKind === 'flutter' ? 700 : 2400, this.bovKind === 'flutter' ? 1.3 : 0.8, sr);
      this.f.sq1.set('bp', this.sqF, 14, sr); this.f.sq2.set('bp', this.sqF * 1.62, 10, sr);
      this.f.body.set('hp', 28, 0.7, sr);
    }

    // Raised-cosine RPM-band weights for the four tone layers, equal-power normalised.
    layerWeights(n) {
      const band = (c, w) => { const d = Math.abs(n - c) / w; return d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * d); };
      const w = [band(0.12, 0.22), band(0.35, 0.28), band(0.62, 0.30), band(0.92, 0.32) + (n > 0.92 ? 1 : 0)];
      const norm = Math.sqrt(w.reduce((a, b) => a + b * b, 0)) || 1;
      return w.map(x => x / norm);
    }

    process(out, n0, n1) {
      const p = this.p, s = this.s, t = this.t, sr = this.sr, r = this.rand;
      const ind = p.ind || { type: 'na' };
      const kUp = 1 - Math.exp(-1 / (0.018 * sr)), kDn = 1 - Math.exp(-1 / (0.030 * sr));
      const kThr = 1 - Math.exp(-1 / (0.012 * sr)), kLoad = 1 - Math.exp(-1 / (0.040 * sr)), kOn = 1 - Math.exp(-1 / (0.25 * sr));
      const kBoost = 1 - Math.exp(-1 / (0.020 * sr));
      for (let i = n0; i < n1; i++) {
        // ── Smoothed controls (rev drops are fast but never instantaneous: no clicks) ──
        s.rpm += (t.rpm - s.rpm) * (t.rpm > s.rpm ? kUp : kDn);
        s.throttle += (t.throttle - s.throttle) * kThr;
        s.load += (t.load - s.load) * kLoad;
        s.boost += (t.boost - s.boost) * kBoost;
        s.on += ((t.on ? 1 : 0) - s.on) * kOn;
        if ((++this.coefCount & 63) === 0) this.updateCoefs();
        const rpmN = s.rpm / p.red;
        // ── Ignition: shift cut, rev-limiter bounce, launch-control (2-step) ──
        this.limPh = (this.limPh + 1 / sr) % 0.062;
        let fireOK = !t.cut;
        if (t.limiter) fireOK = fireOK && this.limPh > 0.034;          // ~16 Hz fuel-cut bounce
        if (t.launch) fireOK = fireOK && (this.limPh % 0.031) > 0.013; // faster 2-step stutter
        // ── Crank angle & combustion events ──
        const dTheta = s.rpm / 60 * 720 / 2 / sr; // degrees of the 720° cycle per sample
        const prev = this.theta; this.theta += dTheta;
        const wrap = this.theta >= 720; if (wrap) this.theta -= 720;
        for (let c = 0; c < this.angles.length; c++) {
          const a = this.angles[c];
          const crossed = wrap ? (a >= prev || a < this.theta) : (a >= prev && a < this.theta);
          if (!crossed) continue;
          const bank = this.banks[c];
          const idleish = 1 - smoothstep(0.08, 0.30, rpmN);
          const jitter = 1 + p.rough * (r() - 0.5) * (0.6 + 1.4 * idleish);
          const burn = 0.18 + 0.82 * s.throttle;                          // throttle sets combustion strength
          let amp = burn * jitter * this.cylAmp[c] * (0.55 + 0.45 * Math.min(1, rpmN * 1.4));
          if (!fireOK) {
            amp *= 0.10;                                                  // pumping only, no combustion
            const popChance = (t.launch ? p.launchPops * 0.35 : p.crackle * 0.05) * Math.min(1, rpmN * 1.2);
            if (r() < popChance) { this.popEnv = Math.min(1, this.popEnv + 0.55 + 0.4 * r()); }
          } else if (s.throttle < 0.15 && rpmN > 0.45 && t.load < 0.5) {
            // Overrun: closed throttle at speed → occasional, restrained afterfire
            if (r() < p.crackle * 0.012) this.popEnv = Math.min(1, this.popEnv + 0.4 + 0.3 * r());
          }
          this.bankEnv[bank] += amp;
          this.bankNoise[bank] += amp * p.noise;
        }
        // ── Exhaust: per-bank header lag → collector → pipe resonance ──
        const wn = r() * 2 - 1;
        let ex = 0;
        for (let b = 0; b < 2; b++) {
          const pulse = this.bankEnv[b] + this.bankNoise[b] * wn;
          this.bankEnv[b] *= this.tauK; this.bankNoise[b] *= this.noiseK;
          const buf = this.bankDelay[b], lag = this.bankLag[b];
          buf[this.bdIdx & 511] = pulse;
          ex += buf[(this.bdIdx - lag) & 511];
        }
        this.bdIdx++;
        // afterfire pop: broadband bang into the exhaust
        if (this.popEnv > 0.001) { ex += this.popEnv * (wn * 0.9 + 0.5); this.popEnv *= Math.exp(-1 / (0.006 * sr)); }
        const fb = 0.16 + 0.14 * p.exQ;
        const combOut = ex + fb * this.comb[(this.combIdx - this.combLen + 4096) & 4095];
        this.comb[this.combIdx & 4095] = combOut; this.combIdx++;
        // ── Four RPM layers ──
        const wts = this.layerWeights(Math.min(1.15, rpmN));
        const lIdle = this.f.idle.run(combOut);
        const lLow = this.f.lowPk.run(this.f.low.run(combOut));
        const lMid = this.f.mid.run(combOut);
        const lHigh = this.f.high.run(combOut) * (0.8 + 0.8 * p.bright);
        let eng = wts[0] * lIdle * 1.3 + wts[1] * lLow + wts[2] * lMid + wts[3] * (lHigh * 1.4 + lMid * 0.5);
        // ── On-load vs off-load voicing (off-load: quieter, 2 kHz scooped, less drive) ──
        const L = s.load;
        const offV = this.f.offNotch.run(eng);
        eng = eng * L * (1.0 + 0.25 * s.throttle) + offV * (1 - L) * 0.55;
        // Level control: a slow follower steers loudness toward a target curve set by RPM, throttle
        // and load (louder with revs and under load; throttle lift clearly quieter). The gain is
        // frozen during ignition cuts / limiter / 2-step so those gaps stay audible.
        this.agcEnv += (eng * eng - this.agcEnv) * this.kEnv;
        const onL = L * s.throttle, free = s.throttle * (1 - L), nn = Math.min(1.1, rpmN);
        const want = 0.030 + 0.045 * nn + onL * (0.050 + 0.090 * nn) + free * (0.025 + 0.040 * nn);
        if (!t.cut && !t.limiter && !t.launch) {
          const g = Math.max(0.05, Math.min(30, want / (Math.sqrt(this.agcEnv) + 1e-5)));
          this.agc += (g - this.agc) * this.kAgc;
        }
        eng *= this.agc;
        const drive = 1.0 + 1.2 * onL;
        eng = Math.tanh(eng * drive) / drive;
        // ── Intake roar (on throttle only) & VTEC crossover ──
        const vtecOn = p.vtec ? smoothstep(p.vtec - 150, p.vtec + 150, s.rpm) : 0;
        const pulsesNow = this.bankEnv[0] + this.bankEnv[1];
        const intake = this.f.intake.run(wn) * s.throttle * (0.10 + 0.12 * rpmN + 0.22 * vtecOn) * (0.4 + Math.min(1.2, pulsesNow));
        // ── Valvetrain tick (cam rate) ──
        const tick = this.f.tick.run(wn) * 0.010 * rpmN * (Math.sin(this.theta / 720 * TAU * 2 * this.angles.length) > 0.95 ? 1 : 0.15);
        // I5 warble: slight amplitude wobble at half firing rate
        const warble = p.warble ? 1 + p.warble * Math.sin(this.theta / 720 * TAU * (this.angles.length / 2)) : 1;
        let y = eng * warble + intake + tick;
        // ── Forced induction ──
        if (ind.type === 'turbo') {
          const b = s.boost, wf = ind.whistle[0] + (ind.whistle[1] - ind.whistle[0]) * Math.min(1, b * (0.65 + 0.35 * rpmN));
          this.whPh[0] = (this.whPh[0] + wf / sr) % 1;
          let wh = Math.sin(TAU * this.whPh[0] + 0.3 * Math.sin(TAU * this.whPh[0] * 0.5));
          if (ind.twin) { this.whPh[1] = (this.whPh[1] + wf * (ind.twinDetune || 1.06) / sr) % 1; wh = 0.6 * wh + 0.6 * Math.sin(TAU * this.whPh[1]); }
          y += wh * ind.whistleGain * Math.pow(b, 1.4) * (0.4 + 0.6 * s.throttle);
          y += this.f.hiss.run(wn) * ind.hiss * b * b;
          // blow-off valve (vented "pssh") or compressor surge flutter ("stu-tu-tu")
          if (this.bovEnv > 0.002) {
            let v = this.f.bov.run(wn) * this.bovEnv * ind.bovGain * 3;
            if (this.bovKind === 'flutter') { this.flutPh += (17 + 9 * this.bovEnv) / sr; v *= 0.35 + 0.65 * Math.max(0, Math.sin(TAU * this.flutPh)); }
            y += v;
            this.bovEnv *= Math.exp(-1 / ((this.bovKind === 'flutter' ? 0.42 : 0.24) * sr));
          }
        } else if (ind.type === 'sc') {
          const wf = s.rpm / 60 * ind.whineRatio * 12; // rotor lobe-pass frequency
          this.scPh[0] = (this.scPh[0] + wf / sr) % 1; this.scPh[1] = (this.scPh[1] + wf * 2 / sr) % 1;
          const wh = Math.sin(TAU * this.scPh[0]) * 0.7 + Math.sin(TAU * this.scPh[1]) * 0.3;
          y += wh * ind.whineGain * Math.min(1, rpmN * 1.1) * (0.35 + 0.65 * s.throttle);
        }
        y *= p.gain * s.on;
        // DC block + soft limit (never clips)
        const hp = y - this.dc.x1 + 0.995 * this.dc.y1; this.dc.x1 = y; this.dc.y1 = hp;
        const o = Math.tanh(hp * 1.3) * 0.7;
        if (Math.abs(o) > this.peak) this.peak = Math.abs(o);
        out[i] = o;
      }
    }
  }

  // Tire & wind effects voice (separate bus so players can balance it against the engine).
  class EffectsDSP {
    constructor(sampleRate, seed = 7) {
      this.sr = sampleRate; this.rand = rng(seed);
      this.t = { slip: 0, speed: 0, nos: 0 }; this.s = { slip: 0, speed: 0, nos: 0 };
      this.hiss1 = new Biquad(); this.hiss2 = new Biquad(); this.hiss1.set('hp', 2400, 0.7, sampleRate); this.hiss2.set('bp', 5200, 0.9, sampleRate);
      this.sq1 = new Biquad(); this.sq2 = new Biquad(); this.scrub = new Biquad(); this.wind = new Biquad();
      this.wob = 0; this.cnt = 0; this.dc = { x1: 0, y1: 0 };
    }
    set(c) { Object.assign(this.t, c); }
    process(out, n0, n1) {
      const sr = this.sr, s = this.s, t = this.t, r = this.rand;
      const kS = 1 - Math.exp(-1 / (0.030 * sr)), kV = 1 - Math.exp(-1 / (0.2 * sr));
      for (let i = n0; i < n1; i++) {
        s.slip += (t.slip - s.slip) * kS; s.speed += (t.speed - s.speed) * kV; s.nos += ((t.nos || 0) - s.nos) * kS;
        if ((++this.cnt & 127) === 0) {
          this.wob += 0.013 + r() * 0.02;
          const f = 950 + 220 * Math.sin(this.wob) + 160 * s.slip;   // squeal pitch wanders, rises with slip
          this.sq1.set('bp', f, 16, sr); this.sq2.set('bp', f * 1.58, 12, sr);
          this.scrub.set('bp', 380 + 4 * s.speed, 0.8, sr); this.wind.set('lp', 300 + 20 * s.speed, 0.6, sr);
        }
        const wn = r() * 2 - 1;
        const sl = Math.max(0, s.slip);
        let y = (this.sq1.run(wn) * 2.2 + this.sq2.run(wn) * 1.2) * Math.min(1, sl * 1.4) * 0.30
          + this.scrub.run(wn) * sl * 0.10
          + this.wind.run(wn) * Math.min(1, s.speed / 70) * 0.10
          + (this.hiss1.run(wn) * 0.5 + this.hiss2.run(wn) * 0.7) * s.nos * 0.22;   // nitrous solenoid/jet hiss
        const hp = y - this.dc.x1 + 0.995 * this.dc.y1; this.dc.x1 = y; this.dc.y1 = hp;
        out[i] = Math.tanh(hp * 1.4) * 0.6;
      }
    }
  }

  const api = { EngineDSP, EffectsDSP, Biquad };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EngineSynth = api;

  // AudioWorklet registration (only inside AudioWorkletGlobalScope).
  if (typeof registerProcessor === 'function' && typeof AudioWorkletProcessor !== 'undefined') {
    class EngineVoiceProcessor extends AudioWorkletProcessor {
      constructor(options) {
        super();
        const o = options.processorOptions || {};
        this.kind = o.kind || 'engine';
        this.dsp = this.kind === 'fx' ? new EffectsDSP(sampleRate, o.seed || 7) : new EngineDSP(sampleRate, o.seed || 1);
        if (o.profile && this.dsp.setProfile) this.dsp.setProfile(o.profile);
        this.alive = true;
        this.port.onmessage = e => {
          const m = e.data || {};
          if (m.type === 'set') this.dsp.set(m.c);
          else if (m.type === 'profile' && this.dsp.setProfile) this.dsp.setProfile(m.profile);
          else if (m.type === 'bov' && this.dsp.bov) this.dsp.bov(m.level, m.kind);
          else if (m.type === 'stop') this.alive = false;
        };
      }
      process(inputs, outputs) {
        const ch = outputs[0];
        if (!ch || !ch[0]) return this.alive;
        this.dsp.process(ch[0], 0, ch[0].length);
        for (let k = 1; k < ch.length; k++) ch[k].set(ch[0]);
        return this.alive;
      }
    }
    registerProcessor('belt-engine-voice', EngineVoiceProcessor);
  }
})(typeof window !== 'undefined' ? window : globalThis);
