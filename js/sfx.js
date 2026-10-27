// Sounds per WebAudio (keine Dateien nötig). Muss durch eine Nutzer-Geste "entsperrt" werden.
// Zwei Lautstärke-Regler: Effekte (sfx) und Musik (music.js hängt sich an `sfx.musicBus`).
let ctx = null;
let muted = false;
let master = null; // Effekte
let musicBus = null; // Musik

function ensure() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.005; comp.release.value = 0.2;
  comp.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(comp);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(comp);
  return ctx;
}

function noiseBuffer(sec = 2) {
  const len = ctx.sampleRate * sec;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(freq, dur = 0.12, type = 'square', vol = 0.12, slide = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function burst(dur, freq, q, vol, type = 'bandpass') {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(1);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

export const sfx = {
  unlock() {
    try {
      ensure();
      if (ctx.state === 'suspended') ctx.resume();
    } catch { /* kein Audio – egal */ }
  },
  get ctx() { return ctx; },
  get musicBus() { return musicBus; },
  get muted() { return muted; },
  setMuted(v) { muted = v; if (master) master.gain.value = v ? 0 : 1; if (v) { sfx.windOff(); sfx.crowd(0); sfx.engineOff(); } },
  beep() { tone(440, 0.18); },
  go() { tone(880, 0.45); },
  pad() { tone(500, 0.25, 'sine', 0.18, 700); },
  rock() { tone(110, 0.3, 'sawtooth', 0.2, -70); burst(0.18, 300, 0.8, 0.3); },
  log() { tone(150, 0.2, 'square', 0.18, -80); burst(0.14, 700, 1.2, 0.25); },
  bale() { burst(0.25, 900, 0.5, 0.3); tone(180, 0.15, 'triangle', 0.12, -60); },
  cone() { tone(900, 0.07, 'triangle', 0.12, -400); burst(0.08, 2200, 1, 0.12); },
  splash() { burst(0.35, 1800, 0.6, 0.28, 'highpass'); tone(260, 0.2, 'sine', 0.08, -120); },
  mud() { burst(0.4, 350, 0.7, 0.3); },
  land(impact) { tone(90, 0.18, 'sine', Math.min(0.35, 0.1 + impact * 0.02), -40); },
  jump() { tone(300, 0.15, 'sine', 0.1, 300); },
  lap() { [660, 880].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.16), i * 110)); },
  finish() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.18), i * 130)); },
  bump(k = 2) { tone(140, 0.16, 'square', Math.min(0.25, 0.08 + k * 0.03), -60); burst(0.12, 500, 0.9, Math.min(0.3, 0.1 + k * 0.03)); },
  clap() { burst(0.07, 1800, 0.9, 0.15); },
};

// Windrauschen, das mit dem Tempo lauter wird
let wind = null;
sfx.wind = function (speed) {
  if (!ctx) return;
  if (!wind) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2); src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 500; filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    wind = { gain, filter };
  }
  const v = muted ? 0 : Math.min(1, speed / 40);
  wind.gain.gain.setTargetAtTime(v * v * 0.25, ctx.currentTime, 0.1);
  wind.filter.frequency.setTargetAtTime(300 + v * 1400, ctx.currentTime, 0.1);
};
sfx.windOff = function () { if (wind && ctx) wind.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); };

// Publikum: rauschendes Jubeln (Rauschen + schnelle Pegelschwankung = klatschende, johlende Menge); level 0..1
let crowd = null;
sfx.crowd = function (level) {
  if (!ctx) return;
  if (!crowd) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3); src.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1100; band.Q.value = 0.7;
    const hi = ctx.createBiquadFilter(); hi.type = 'highpass'; hi.frequency.value = 300;
    const gain = ctx.createGain(); gain.gain.value = 0;
    // Pegel-Flattern wie Klatschen/Rufen
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.35;
    const amp = ctx.createGain(); amp.gain.value = 0.65;
    lfo.connect(lfoGain).connect(amp.gain);
    // zweite Schicht: "Ooh"-Ton, der mit dem Jubel mitwandert
    const voice = ctx.createOscillator(); voice.type = 'sawtooth'; voice.frequency.value = 330;
    const vf = ctx.createBiquadFilter(); vf.type = 'bandpass'; vf.frequency.value = 900; vf.Q.value = 2;
    const vg = ctx.createGain(); vg.gain.value = 0.05;
    voice.connect(vf).connect(vg).connect(gain);
    src.connect(band).connect(hi).connect(amp).connect(gain).connect(master);
    src.start(); lfo.start(); voice.start();
    crowd = { gain, band, voice, t: 0 };
  }
  const v = muted ? 0 : Math.min(1, level);
  const t = ctx.currentTime;
  crowd.gain.gain.setTargetAtTime(v * 0.32, t, 0.15);
  crowd.band.frequency.setTargetAtTime(900 + v * 700, t, 0.2);
  crowd.voice.frequency.setTargetAtTime(300 + v * 160 + Math.sin(t * 1.3) * 30, t, 0.3);
};

// Motorklang (Motorrad): zwei verstimmte Oszillatoren durch einen Tiefpass, Zündtakt per Amplitudenmodulation.
// rpm 0..1 (Drehzahl im Gang), load 0..1 (Gas), kind = Zylinderzahl-Charakter, loud = Racing-Auspuff
const ENGINES = {
  single: { lo: 34, hi: 135, pulse: 0.5, cut: 700, wave: 'sawtooth', vol: 1.0 },
  twin: { lo: 40, hi: 150, pulse: 1, cut: 800, wave: 'sawtooth', vol: 0.95 },
  triple: { lo: 52, hi: 215, pulse: 1.5, cut: 1100, wave: 'sawtooth', vol: 0.9 },
  four: { lo: 62, hi: 290, pulse: 2, cut: 1500, wave: 'square', vol: 0.75 },
};
let engine = null;
sfx.engineOn = true;
sfx.engine = function (rpm, load, kind = 'four', loud = false) {
  if (!ctx) return;
  const P = ENGINES[kind] || ENGINES.four;
  if (!engine || engine.kind !== kind) {
    if (engine) { const old = engine; old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => old.nodes.forEach((n) => { try { n.stop(); } catch { /* schon gestoppt */ } }), 300); }
    const o1 = ctx.createOscillator(); o1.type = P.wave;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.detune.value = -12;
    const sub = ctx.createOscillator(); sub.type = 'sine';
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 3;
    const amp = ctx.createGain(); amp.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.type = 'square';
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain).connect(amp.gain);
    const gain = ctx.createGain(); gain.gain.value = 0;
    const subGain = ctx.createGain(); subGain.gain.value = 0.5;
    o1.connect(filter); o2.connect(filter); sub.connect(subGain).connect(filter);
    filter.connect(amp).connect(gain).connect(master);
    [o1, o2, sub, lfo].forEach((n) => n.start());
    engine = { kind, o1, o2, sub, lfo, filter, gain, nodes: [o1, o2, sub, lfo] };
  }
  const t = ctx.currentTime;
  const f = P.lo + (P.hi - P.lo) * rpm;
  engine.o1.frequency.setTargetAtTime(f, t, 0.03);
  engine.o2.frequency.setTargetAtTime(f * 1.005, t, 0.03);
  engine.sub.frequency.setTargetAtTime(f * 0.5, t, 0.03);
  engine.lfo.frequency.setTargetAtTime(f * P.pulse * 0.5, t, 0.03);
  engine.filter.frequency.setTargetAtTime(P.cut * (0.5 + 0.7 * load + 0.6 * rpm) * (loud ? 1.4 : 1), t, 0.05);
  const v = muted || !sfx.engineOn ? 0 : (0.05 + 0.07 * load + 0.04 * rpm) * P.vol * (loud ? 1.45 : 1);
  engine.gain.gain.setTargetAtTime(v, t, 0.06);
};
sfx.engineOff = function () { if (engine && ctx) engine.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08); };
