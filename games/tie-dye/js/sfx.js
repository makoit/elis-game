// Geräusche per WebAudio (keine Dateien). Muss durch eine Nutzer-Geste entsperrt werden.
let ctx = null;
let master = null;
let muted = false;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  return ctx;
}

function noise() {
  if (noiseBuf) return noiseBuf;
  const len = ctx.sampleRate;
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

function hiss(dur, freq, q = 1, vol = 0.1, delay = 0, type = 'bandpass') {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noise();
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

export const sfx = {
  unlock() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
  },
  get muted() { return muted; },
  setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.8;
  },
  tap() { tone(660, 0.08, 'sine', 0.08, 220); },
  pick() { tone(520, 0.1, 'triangle', 0.1, 380); },
  nope() { tone(220, 0.16, 'square', 0.04, -60); },
  // Falten: leises Rascheln, Tonhöhe steigt mit dem Fortschritt
  twist(p) { hiss(0.12, 900 + p * 1600, 2, 0.06); tone(300 + p * 500, 0.06, 'sine', 0.025); },
  pop() { tone(380, 0.14, 'sine', 0.16, 500); hiss(0.06, 2500, 1, 0.05); },
  band() { tone(180, 0.22, 'triangle', 0.14, 260); tone(720, 0.05, 'sine', 0.05, -200, 0.01); },
  squirt() { hiss(0.14, 1300 + Math.random() * 500, 3, 0.07); },
  snip() { hiss(0.04, 5000, 2, 0.16); hiss(0.05, 3800, 2, 0.13, 0.07); },
  whoosh() { hiss(0.6, 600, 0.7, 0.12); tone(260, 0.6, 'sine', 0.05, 500); },
  star(i = 0) { tone(880 + i * 220, 0.25, 'triangle', 0.1, 0, i * 0.18); tone(1320 + i * 330, 0.2, 'sine', 0.05, 0, i * 0.18 + 0.04); },
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.1, 0, i * 0.11));
    tone(1319, 0.5, 'sine', 0.07, 0, 0.46);
  },
};
