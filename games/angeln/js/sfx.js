// Geräusche per WebAudio (keine Dateien). Muss durch eine Nutzer-Geste entsperrt werden.
// Dazu eine leise Naturkulisse (Wind/Wellen, Vögel am Tag, Grillen nachts).
let ctx = null;
let master = null;
let muted = false;
let ambient = null;
let reelAcc = 0;

function ensure() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
  return ctx;
}

let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function tone(freq, dur = 0.12, type = 'sine', vol = 0.1, slide = 0, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function burst(dur, freq, q, vol, type = 'bandpass', delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

export const sfx = {
  unlock() { try { ensure(); if (ctx.state === 'suspended') ctx.resume(); } catch { /* kein Audio */ } },
  setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.9; },
  get muted() { return muted; },

  click() { tone(880, 0.05, 'triangle', 0.06); },
  buy() { tone(660, 0.08, 'triangle', 0.08); tone(990, 0.12, 'triangle', 0.08, 0, 0.08); },
  cast() { burst(0.35, 2400, 1.2, 0.12, 'bandpass'); tone(500, 0.3, 'sine', 0.03, 600); },
  plop() { tone(320, 0.12, 'sine', 0.18, -200); burst(0.15, 900, 2, 0.08); },
  nibble(bell) { if (bell) tone(2100, 0.15, 'sine', 0.05); else tone(500, 0.06, 'sine', 0.06, -150); },
  bite(bell) {
    if (bell) { for (let i = 0; i < 4; i++) tone(2100, 0.18, 'sine', 0.08, 0, i * 0.09); }
    tone(260, 0.2, 'sine', 0.16, -120); burst(0.2, 700, 2, 0.1);
  },
  hook() { tone(180, 0.25, 'sawtooth', 0.08, 200); burst(0.3, 1500, 1, 0.12); },
  reelTick(dt) {
    if (!ctx || muted) return;
    reelAcc += dt;
    if (reelAcc > 0.06) { reelAcc = 0; tone(1400 + Math.random() * 200, 0.02, 'square', 0.015); }
  },
  drag() { for (let i = 0; i < 10; i++) tone(2600, 0.03, 'square', 0.02, 0, i * 0.035); },
  splash() { burst(0.5, 800, 0.7, 0.2, 'lowpass'); burst(0.3, 2500, 1, 0.08); },
  snap() { tone(1800, 0.1, 'square', 0.08, -1500); burst(0.12, 4000, 1, 0.1); },
  miss() { tone(330, 0.15, 'triangle', 0.07, -80); tone(247, 0.25, 'triangle', 0.07, -60, 0.14); },
  catchJingle() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, 0, i * 0.11)); },
  levelUp() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'square', 0.05, 0, i * 0.09)); },

  // Naturkulisse: night = Grillen statt Vögel, sea = mehr Wellen
  ambient(on, opts = {}) {
    if (!ctx) return;
    if (ambient) { ambient.stop(); ambient = null; }
    if (!on || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noise(); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.sea ? 600 : opts.river ? 1200 : 400;
    const g = ctx.createGain(); g.gain.value = opts.sea ? 0.07 : opts.river ? 0.05 : 0.03;
    const lfo = ctx.createOscillator(); lfo.frequency.value = opts.sea ? 0.12 : 0.2;
    const lg = ctx.createGain(); lg.gain.value = opts.sea ? 0.05 : 0.015;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(master);
    src.start(); lfo.start();
    const timer = setInterval(() => {
      if (muted || document.hidden) return;
      if (opts.night) { for (let i = 0; i < 3; i++) tone(4200, 0.04, 'sine', 0.012, 0, i * 0.07); }
      else if (Math.random() < (opts.sea ? 0.25 : 0.5)) {
        if (opts.sea) tone(1300, 0.35, 'sine', 0.025, -500); // Möwe
        else { const b = 2400 + Math.random() * 1500; for (let i = 0; i < 3; i++) tone(b + i * 200, 0.07, 'sine', 0.02, 300, i * 0.09); }
      }
    }, opts.night ? 900 : 2600);
    ambient = { stop() { try { src.stop(); lfo.stop(); } catch { /* schon gestoppt */ } clearInterval(timer); } };
  },
};
