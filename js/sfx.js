// Kleine Sounds per WebAudio (keine Dateien nötig). Muss durch eine Nutzer-Geste "entsperrt" werden.
let ctx = null;
let muted = false;

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
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  unlock() {
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch { /* kein Audio – egal */ }
  },
  get muted() { return muted; },
  setMuted(v) { muted = v; },
  beep() { tone(440, 0.18); },
  go() { tone(880, 0.45); },
  pad() { tone(500, 0.25, 'sine', 0.18, 700); },
  rock() { tone(110, 0.3, 'sawtooth', 0.2, -70); },
  land(impact) { tone(90, 0.18, 'sine', Math.min(0.35, 0.1 + impact * 0.02), -40); },
  jump() { tone(300, 0.15, 'sine', 0.1, 300); },
  finish() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.18), i * 130)); },
};
