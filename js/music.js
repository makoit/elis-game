// Hintergrundmusik, live erzeugt (WebAudio-Step-Sequencer, keine Audiodateien): treibender Synth-Beat im Rennen,
// ruhigere Variante im Menü. Jede Strecke hat Tempo, Tonart und Akkordfolge.
import { sfx } from './sfx.js';

const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
// Akkordfolgen (Grundton-Abstand, Terz) je Tonart-Art
const PROG = {
  minor: [[0, 3], [8, 4], [3, 4], [10, 4]], // i – VI – III – VII
  major: [[0, 4], [7, 4], [9, 3], [5, 4]], // I – V – vi – IV
};
const STYLES = {
  menu: { bpm: 96, key: 9, mode: 'minor', lead: 'sine' },
  wiese: { bpm: 120, key: 0, mode: 'major', lead: 'triangle' },
  kueste: { bpm: 126, key: 5, mode: 'minor', lead: 'sawtooth' },
  wald: { bpm: 112, key: 2, mode: 'minor', lead: 'triangle' },
  canyon: { bpm: 134, key: 9, mode: 'minor', lead: 'sawtooth' },
  bikepark: { bpm: 124, key: 7, mode: 'minor', lead: 'sawtooth' },
  pumptrack: { bpm: 138, key: 4, mode: 'minor', lead: 'square' },
  weinberg: { bpm: 116, key: 3, mode: 'major', lead: 'sine' }, // warm, gemütlich (Es-Dur)
  gardasee: { bpm: 122, key: 7, mode: 'major', lead: 'triangle' }, // sonnig, Urlaubsgefühl (G-Dur)
};

let timer = null;
let enabled = true;
let cur = null; // { name, style, step, next, rng, intensity, race }
let bus = null; // Ausgang dieser Musik (Fade)
let delay = null;
let noiseBuf = null;

function rngOf(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function setup(ctx) {
  if (bus) return;
  bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(sfx.musicBus);
  delay = ctx.createDelay(1);
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const wet = ctx.createGain(); wet.gain.value = 0.35;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  delay.connect(lp).connect(fb).connect(delay);
  lp.connect(wet).connect(bus);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function osc(ctx, type, f, t, dur, vol, { filter, fType = 'lowpass', q = 1, attack = 0.005, send = 0, detune = 0, slideTo } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur * 0.8);
  if (detune) o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) { const fl = ctx.createBiquadFilter(); fl.type = fType; fl.frequency.value = filter; fl.Q.value = q; o.connect(fl); node = fl; }
  node.connect(g);
  g.connect(bus);
  if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg).connect(delay); }
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(ctx, t, dur, vol, freq, type = 'highpass', q = 0.7) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}

function playStep(ctx, st, step, t) {
  const { style } = st;
  const race = st.race;
  const beat = 60 / style.bpm;
  const six = beat / 4;
  const bar = Math.floor(step / 16);
  const s16 = step % 16;
  const scale = style.mode === 'major' ? MAJOR : MINOR;
  const [rootOff, third] = PROG[style.mode][bar % 4];
  const root = 36 + style.key + rootOff; // Basslage (MIDI)
  const chord = [0, third, 7];
  const section = Math.floor(bar / 4) % 2; // 0 ruhiger, 1 voller
  const inten = Math.min(1, 0.45 + st.intensity * 0.55);

  // Kick
  if (race ? s16 % 4 === 0 : s16 === 0 || s16 === 8) {
    osc(ctx, 'sine', 150, t, 0.2, race ? 0.9 : 0.55, { slideTo: 42 });
  }
  if (race && section === 1 && s16 === 14) osc(ctx, 'sine', 150, t, 0.15, 0.6, { slideTo: 42 }); // Ghost-Kick
  // Snare / Clap
  if (race && (s16 === 4 || s16 === 12)) { noise(ctx, t, 0.16, 0.35, 1900, 'bandpass', 0.9); osc(ctx, 'triangle', 190, t, 0.1, 0.2, { slideTo: 120 }); }
  // Hi-Hats
  if (s16 % 2 === 1 || (race && inten > 0.7 && s16 % 2 === 0 && section === 1)) noise(ctx, t, s16 === 14 ? 0.18 : 0.05, race ? 0.13 : 0.07, 7500);
  // Bass (Achtel, mit Oktavsprung)
  if (race ? (s16 % 2 === 0) : (s16 % 8 === 0)) {
    const oct = race && (s16 === 6 || s16 === 14) ? 12 : 0;
    osc(ctx, 'sawtooth', hz(root + oct), t, race ? six * 1.8 : beat * 1.8, race ? 0.22 : 0.2, { filter: 380 + inten * 500, q: 3, attack: 0.004 });
  }
  // Arpeggio
  if (race || s16 % 2 === 0) {
    const idx = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 1][s16];
    const note = root + 24 + chord[idx % 3] + (s16 % 8 === 7 ? 12 : 0);
    osc(ctx, style.mode === 'major' ? 'triangle' : 'square', hz(note), t, six * 1.6, race ? 0.07 : 0.05, { filter: 900 + inten * 2400, q: 2, send: 0.5 });
  }
  // Pad (ein Akkord pro Takt)
  if (s16 === 0) {
    const len = beat * 4;
    chord.forEach((c, i) => {
      osc(ctx, 'sawtooth', hz(root + 12 + c), t, len, 0.045, { filter: 700, attack: 0.25, detune: -8 });
      osc(ctx, 'sawtooth', hz(root + 12 + c), t, len, 0.045, { filter: 700, attack: 0.25, detune: 8 });
      if (i === 0) osc(ctx, 'sine', hz(root + 24 + c), t, len, 0.04, { attack: 0.3 });
    });
  }
  // Melodie: in der vollen Hälfte, auf Achteln, aus der Tonleiter (pro Takt neu gewürfelt, aber mit festen Motiven)
  if ((race && section === 1) || (!race && bar % 4 === 2)) {
    if (s16 % 2 === 0 && st.rng() < (race ? 0.7 : 0.4)) {
      if (s16 === 0) st.deg = Math.floor(st.rng() * 7);
      else st.deg = Math.max(0, Math.min(13, st.deg + [-2, -1, -1, 0, 1, 1, 2][Math.floor(st.rng() * 7)]));
      const note = 60 + style.key + scale[st.deg % 7] + 12 * Math.floor(st.deg / 7);
      osc(ctx, style.lead, hz(note), t, six * (race ? 2.2 : 3.5), race ? 0.09 : 0.07, { filter: 3200, attack: 0.01, send: 0.6, detune: Math.sin(step) * 6 });
    }
  }
}

function schedule() {
  const ctx = sfx.ctx;
  if (!ctx || !cur) return;
  const six = 60 / cur.style.bpm / 4;
  if (cur.next < ctx.currentTime - 0.4) cur.next = ctx.currentTime + 0.05; // nach Pause im Hintergrund nicht aufholen
  while (cur.next < ctx.currentTime + 0.15) {
    if (enabled) playStep(ctx, cur, cur.step, Math.max(cur.next, ctx.currentTime));
    cur.step++;
    cur.next += six;
  }
}

export const music = {
  get playing() { return cur ? cur.name : null; },
  get enabled() { return enabled; },
  // name: 'menu' oder Strecken-id; race: Rennen = mit Schlagzeug
  play(name, race = false) {
    sfx.unlock();
    const ctx = sfx.ctx;
    if (!ctx) return;
    setup(ctx);
    const key = `${name}:${race}`;
    if (cur && cur.key === key) return;
    music.stop(true);
    const style = { ...(STYLES[name] || STYLES.menu) };
    if (!race) style.bpm = Math.min(style.bpm, 100);
    cur = { key, name, style, race, step: 0, next: ctx.currentTime + 0.1, rng: rngOf(name.length * 977 + 13), intensity: 0, deg: 0 };
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(enabled ? 1 : 0, ctx.currentTime + 1.2);
    timer = setInterval(schedule, 30);
  },
  stop(quick = false) {
    const ctx = sfx.ctx;
    if (timer) { clearInterval(timer); timer = null; }
    cur = null;
    if (ctx && bus) {
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
      bus.gain.linearRampToValueAtTime(0, ctx.currentTime + (quick ? 0.05 : 0.8));
    }
  },
  setEnabled(v) {
    enabled = v;
    const ctx = sfx.ctx;
    if (ctx && bus) { bus.gain.cancelScheduledValues(ctx.currentTime); bus.gain.setTargetAtTime(v && cur ? 1 : 0, ctx.currentTime, 0.2); }
  },
  setIntensity(v) { if (cur) cur.intensity = v; },
};
