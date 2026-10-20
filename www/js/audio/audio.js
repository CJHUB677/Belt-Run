// Audio manager: Web Audio graph, first-gesture unlock (iOS), mute + separate engine/effects
// volumes, suspend while hidden or idle in menus. Engine voices are procedural (engine-dsp.js,
// loaded as a classic script for the ScriptProcessor fallback and as an AudioWorklet module).
// Every frame the race screen passes the real physics state: rpm, throttle, load, boost, wheel
// slip and nitrous all come straight from the simulation, nothing is faked for the sound.
import { createTracker, controls as mapControls, buildProfile } from './controls.js';
const W = window;
const Prof = () => W.EngineProfiles, Syn = () => W.EngineSynth;

const A = {
  ctx: null, mode: null, ready: false, unlocking: null, hidden: false, idleSince: 0,
  voices: {}, slots: {}, settings: { muted: false, engineVol: 0.8, fxVol: 0.7 }, error: null, listeners: new Set(),
};
const emit = () => { for (const f of A.listeners) try { f(status()); } catch {} };
export const status = () => ({ unlocked: !!A.ctx && A.ready, state: A.ctx ? A.ctx.state : 'none', mode: A.mode, muted: A.settings.muted, error: A.error });
export const onChange = fn => { A.listeners.add(fn); return () => A.listeners.delete(fn); };

export function applySettings(s) { Object.assign(A.settings, { muted: !!s.muted, engineVol: +s.engineVol, fxVol: +s.fxVol }); volumes(); if (A.ctx) { if (A.settings.muted) setTimeout(() => { if (A.settings.muted && A.ctx.state === 'running') A.ctx.suspend().catch(() => {}); }, 250); else if (!A.hidden) A.ctx.resume().catch(() => {}); } emit(); }

export function unlock() {
  if (A.ctx && A.ctx.state === 'running' && A.ready) return Promise.resolve(true);
  if (A.unlocking) return A.unlocking;
  const AC = W.AudioContext || W.webkitAudioContext;
  if (!AC) { A.error = 'Web Audio unavailable'; emit(); return Promise.resolve(false); }
  if (!A.ctx) {
    try { A.ctx = new AC({ latencyHint: 'interactive' }); } catch { A.ctx = new AC(); }
    try { const b = A.ctx.createBuffer(1, 1, 22050), src = A.ctx.createBufferSource(); src.buffer = b; src.connect(A.ctx.destination); src.start(0); } catch {}
    const c = A.ctx;
    A.master = c.createGain(); A.comp = c.createDynamicsCompressor();
    A.comp.threshold.value = -10; A.comp.knee.value = 6; A.comp.ratio.value = 8; A.comp.attack.value = 0.003; A.comp.release.value = 0.15;
    A.engineBus = c.createGain(); A.fxBus = c.createGain();
    A.engineBus.connect(A.master); A.fxBus.connect(A.master); A.master.connect(A.comp); A.comp.connect(c.destination);
    A.ctx.onstatechange = emit;
    volumes(true);
  }
  const resume = A.ctx.state !== 'running' && !A.settings.muted ? A.ctx.resume().catch(() => {}) : Promise.resolve();
  A.unlocking = Promise.all([resume, worklet()]).then(() => { A.ready = true; A.unlocking = null; volumes(); emit(); return true; })
    .catch(e => { A.error = String(e?.message || e); A.unlocking = null; emit(); return false; });
  return A.unlocking;
}

async function worklet() {
  if (A.mode) return;
  if (A.ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    try { await A.ctx.audioWorklet.addModule(new URL('js/audio/engine-dsp.js', document.baseURI).href); A.mode = 'worklet'; return; } catch (e) { A.workletError = String(e?.message || e); }
  }
  A.mode = 'script';
}

function volumes(immediate) {
  if (!A.ctx) return;
  const t = A.ctx.currentTime, k = immediate ? 0.001 : 0.06, s = A.settings;
  A.master.gain.cancelScheduledValues(t); A.master.gain.setValueAtTime(A.master.gain.value, t);
  A.master.gain.linearRampToValueAtTime(s.muted ? 0 : 1, t + (immediate ? 0.005 : 0.08));
  A.engineBus.gain.setTargetAtTime(Math.max(0, Math.min(1, s.engineVol)), t, k);
  A.fxBus.gain.setTargetAtTime(Math.max(0, Math.min(1, s.fxVol)), t, k);
}

function voice(kind, bus, seed, profile) {
  const c = A.ctx;
  let node, post;
  if (A.mode === 'worklet') {
    node = new AudioWorkletNode(c, 'belt-engine-voice', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { kind, seed, profile } });
    post = m => node.port.postMessage(m);
  } else {
    const S = Syn(), dsp = kind === 'fx' ? new S.EffectsDSP(c.sampleRate, seed) : new S.EngineDSP(c.sampleRate, seed);
    if (profile && dsp.setProfile) dsp.setProfile(profile);
    node = c.createScriptProcessor(1024, 0, 1);
    node.onaudioprocess = e => { const o = e.outputBuffer.getChannelData(0); dsp.process(o, 0, o.length); };
    post = m => { if (m.type === 'set') dsp.set(m.c); else if (m.type === 'profile' && dsp.setProfile) dsp.setProfile(m.profile); else if (m.type === 'bov' && dsp.bov) dsp.bov(m.level, m.kind); };
  }
  const gain = c.createGain(), pan = c.createStereoPanner ? c.createStereoPanner() : null;
  node.connect(gain); if (pan) { gain.connect(pan); pan.connect(bus); } else gain.connect(bus);
  return { node, gain, pan, post, profileId: null };
}

export const profileForBuild = bc => buildProfile(Prof().profileFor, bc);

function setSlot(slot, bc, seed) {
  if (!A.ready) return;
  const prof = profileForBuild(bc);
  let v = A.voices[slot];
  if (!v) v = A.voices[slot] = voice('engine', A.engineBus, seed, prof);
  else if (v.profileId !== prof.id) v.post({ type: 'profile', profile: prof });
  v.profileId = prof.id;
  A.slots[slot] = createTracker(bc);
  if (!A.voices.fx) A.voices.fx = voice('fx', A.fxBus, 5, null);
}

function clunk(level = 1) {
  const c = A.ctx, t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = 'triangle'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.07);
  f.type = 'lowpass'; f.frequency.value = 600;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * level, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(f).connect(g).connect(A.fxBus); o.start(t); o.stop(t + 0.14);
}
export function uiClick() { if (!A.ready || A.settings.muted || A.hidden) return; try { const c = A.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 1800; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); o.connect(g).connect(A.fxBus); o.start(t); o.stop(t + 0.05); } catch {} }
export function beep(hi = false) { if (!A.ready || A.hidden) return; try { const c = A.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = hi ? 1320 : 880; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + (hi ? 0.35 : 0.14)); o.connect(g).connect(A.fxBus); o.start(t); o.stop(t + 0.4); } catch {} }

/** Called every animation frame. f = { mode:'menu'|'stage'|'race'|'done', player, rival, dt } (race car objects). */
export function frame(f) {
  if (!A.ready || !A.ctx || A.hidden) return;
  if (f.mode === 'menu') {
    A.idleSince ||= performance.now();
    for (const v of Object.values(A.voices)) v.post({ type: 'set', c: { on: 0, throttle: 0, load: 0, slip: 0, speed: 0, nos: 0 } });
    if (performance.now() - A.idleSince > 2500 && A.ctx.state === 'running') A.ctx.suspend().catch(() => {});
    return;
  }
  A.idleSince = 0;
  if (A.ctx.state === 'suspended' && !A.settings.muted) A.ctx.resume().catch(() => {});
  if (f.player && A.slots.player?.bc !== f.player.bc) setSlot('player', f.player.bc, 11);
  if (f.rival && A.slots.rival?.bc !== f.rival.bc) setSlot('rival', f.rival.bc, 29);
  if (!f.rival && A.voices.rival) { A.voices.rival.post({ type: 'set', c: { on: 0 } }); A.slots.rival = null; }
  const p = mapControls(A.slots.player, f.player, f.mode);
  A.voices.player.post({ type: 'set', c: p.c });
  for (const e of p.events) e === 'bov' ? A.voices.player.post({ type: 'bov', level: Math.min(1, p.c.boost * 1.1) }) : clunk(1);
  let rslip = 0;
  if (f.rival && A.voices.rival) {
    const r = mapControls(A.slots.rival, f.rival, f.mode);
    A.voices.rival.post({ type: 'set', c: r.c }); rslip = r.c.slip;
    for (const e of r.events) e === 'bov' ? A.voices.rival.post({ type: 'bov', level: Math.min(1, r.c.boost * 0.5) }) : clunk(0.35);
    const rel = (f.rival.st.x || 0) - (f.player.st.x || 0), t = A.ctx.currentTime;
    A.voices.rival.gain.gain.setTargetAtTime(0.5 / (1 + Math.abs(rel) / 30), t, 0.08);
    if (A.voices.rival.pan) A.voices.rival.pan.pan.setTargetAtTime(Math.max(-0.6, Math.min(0.6, rel / 50)), t, 0.1);
  }
  A.voices.fx.post({ type: 'set', c: { slip: Math.max(p.c.slip, rslip * 0.35), speed: f.mode === 'race' ? f.player.st.v : 0, nos: f.player.st.nosOn ? 1 : 0 } });
  A.last = p.c;
}

function onHidden() { A.hidden = true; if (A.ctx && A.ctx.state === 'running') A.ctx.suspend().catch(() => {}); emit(); }
function onVisible() { A.hidden = false; if (A.ctx && !A.settings.muted) A.ctx.resume().catch(() => {}); emit(); }
document.addEventListener('visibilitychange', () => (document.hidden ? onHidden() : onVisible()));
W.addEventListener('pagehide', onHidden);
W.addEventListener('pageshow', e => { if (e.persisted) onVisible(); });
function gesture() { if (A.settings.muted && A.ctx) return; if (!A.ctx || A.ctx.state !== 'running' || !A.ready) unlock(); }
for (const ev of ['pointerdown', 'touchend', 'keydown']) W.addEventListener(ev, gesture, { capture: true, passive: true });

export const _debug = A;
W.BeltAudio = { status, _A: A };
