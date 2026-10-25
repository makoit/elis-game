// Eingabe: Tastatur (Pfeile / WASD / Leertaste), Touch und optional Neigungssensor.
// Touch-Lenkung gibt es in drei Arten (Einstellungen):
//   bar   Lenkleiste unten links: Finger auf die Leiste, Position = Lenkeinschlag (sichtbar, treffsicher – Standard)
//   swipe irgendwo in der linken Hälfte hinsetzen und wischen (wie ein Lenker)
//   tilt  Gerät wie ein Lenkrad kippen
// Der Lenkwert wird geglättet (tick), damit weder Tippen noch Zittern das Rad herumreißen.

const keys = new Set();
const touch = { gas: false, brake: false };
const wheel = { active: false, id: null, x0: 0, steer: 0 }; // Swipe-Lenkung (analog)
const bar = { active: false, id: null, steer: 0 }; // Lenkleiste
const tilt = { on: false, value: 0, zero: null, listening: false };

const any = (...codes) => codes.some((c) => keys.has(c));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const angDiff = (d) => d - Math.PI * 2 * Math.round(d / (Math.PI * 2));

export const SENS = { soft: 0.7, normal: 1, direct: 1.4 };

export const input = {
  autoGas: false,
  assist: true, // Lenkhilfe (wird an die Physik übergeben)
  mode: 'bar', // bar | swipe | tilt
  sens: 1,
  smooth: 0,
  get raw() {
    if (wheel.active) return wheel.steer;
    if (bar.active) return bar.steer;
    if (tilt.on) return tilt.value;
    const r = any('ArrowRight', 'KeyD');
    const l = any('ArrowLeft', 'KeyA');
    return (r ? 1 : 0) - (l ? 1 : 0);
  },
  get steer() { return this.smooth; },
  // pro Bild aufrufen: weicher Übergang zum Zielwert (schneller beim Zurückgehen zur Mitte)
  tick(dt) {
    const target = clamp(this.raw, -1, 1);
    const toCenter = Math.abs(target) < Math.abs(this.smooth) || target * this.smooth < 0;
    const k = (toCenter ? 16 : 9) * dt;
    this.smooth += (target - this.smooth) * Math.min(1, k);
    if (Math.abs(this.smooth) < 0.003 && target === 0) this.smooth = 0;
  },
  get gas() { return this.autoGas || any('ArrowUp', 'KeyW', 'Space') || touch.gas; },
  get brake() { return any('ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight') || touch.brake; },
  setMode(mode) {
    this.mode = mode;
    document.body.classList.remove('steer-bar', 'steer-swipe', 'steer-tilt');
    document.body.classList.add('steer-' + mode);
    setTilt(mode === 'tilt');
  },
};

export const isTouchDevice =
  new URLSearchParams(location.search).has('touch') || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

// Neigung: Winkel des Geräts in der Bildschirmebene aus der Schwerkraftrichtung (funktioniert hoch und quer)
const TILT_RANGE = 0.36; // rad (~20°) für vollen Einschlag
export function setTilt(on) {
  tilt.on = on;
  tilt.zero = null;
  tilt.value = 0;
  if (on && !tilt.listening) {
    const start = () => {
      tilt.listening = true;
      window.addEventListener('deviceorientation', (e) => {
        if (!tilt.on || e.beta == null || e.gamma == null) return;
        const b = (e.beta * Math.PI) / 180, g = (e.gamma * Math.PI) / 180;
        const ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b); // "oben" in der Geräteebene
        const th = Math.atan2(ux, uy);
        if (tilt.zero === null) tilt.zero = th; // erste Lage = geradeaus
        let d = -angDiff(th - tilt.zero) / TILT_RANGE;
        if (Math.abs(d) < 0.06) d = 0;
        tilt.value = clamp(d * input.sens, -1, 1);
      });
    };
    // iOS fragt nach Erlaubnis (muss aus einem Tipp heraus aufgerufen werden)
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') D.requestPermission().then((r) => { if (r === 'granted') start(); }).catch(() => {});
    else start();
  }
}

export function initInput({ onPause, onRestart }) {
  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Escape' || e.code === 'KeyP') onPause();
    if (e.code === 'KeyR') onRestart();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // Gas / Bremse
  document.querySelectorAll('[data-touch]').forEach((el) => {
    const name = el.dataset.touch;
    const set = (v) => { touch[name] = v; el.classList.toggle('down', v); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); set(true); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => el.addEventListener(ev, () => set(false)));
  });

  // Lenkleiste (fest): Position des Fingers auf der Leiste = Lenkeinschlag
  const barEl = document.getElementById('steer-bar');
  const barKnob = document.getElementById('steer-bar-knob');
  const barSet = (e) => {
    const r = barEl.getBoundingClientRect();
    const half = r.width / 2 - 28;
    let s = clamp((e.clientX - (r.left + r.width / 2)) / half, -1, 1);
    s = Math.abs(s) < 0.05 ? 0 : s; // kleine Mitte = geradeaus
    bar.steer = clamp(Math.sign(s) * Math.pow(Math.abs(s), 1.2) * input.sens * 1.05, -1, 1);
    barKnob.style.transform = `translateX(${s * half}px)`;
  };
  const barEnd = () => { bar.active = false; bar.steer = 0; bar.id = null; barEl.classList.remove('active'); barKnob.style.transform = 'translateX(0px)'; };
  barEl.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (bar.active) return;
    barEl.setPointerCapture(e.pointerId);
    bar.active = true; bar.id = e.pointerId;
    barEl.classList.add('active');
    barSet(e);
  });
  barEl.addEventListener('pointermove', (e) => { if (bar.active && e.pointerId === bar.id) barSet(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => barEl.addEventListener(ev, (e) => { if (e.pointerId === bar.id || ev === 'lostpointercapture') barEnd(); }));

  // Wischen: irgendwo links hinsetzen und nach links/rechts wischen (wie ein Lenker)
  const zone = document.getElementById('steer-zone');
  const base = document.getElementById('stick-base');
  const knob = document.getElementById('stick-knob');
  const range = () => clamp(innerWidth * 0.1, 64, 130); // Wischweg für vollen Einschlag
  const end = () => { wheel.active = false; wheel.steer = 0; wheel.id = null; base.classList.remove('on'); zone.classList.remove('touched'); };
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (wheel.active) return;
    zone.setPointerCapture(e.pointerId);
    wheel.active = true; wheel.id = e.pointerId; wheel.x0 = e.clientX; wheel.steer = 0;
    base.style.left = `${e.clientX}px`; base.style.top = `${e.clientY}px`;
    knob.style.transform = 'translate(0px, 0px)';
    base.classList.add('on'); zone.classList.add('touched');
  });
  zone.addEventListener('pointermove', (e) => {
    if (!wheel.active || e.pointerId !== wheel.id) return;
    const R = range();
    const dx = e.clientX - wheel.x0;
    wheel.x0 += Math.sign(dx) * Math.max(0, Math.abs(dx) - R * 1.1); // Ursprung wandert mit, wenn man weit überzieht
    const s = clamp((e.clientX - wheel.x0) / R, -1, 1);
    const d = Math.abs(s) < 0.06 ? 0 : s;
    wheel.steer = clamp(Math.sign(d) * Math.pow(Math.abs(d), 1.15) * input.sens, -1, 1);
    knob.style.transform = `translate(${s * 46}px, 0px)`;
    base.style.left = `${wheel.x0}px`;
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => zone.addEventListener(ev, (e) => { if (e.pointerId === wheel.id || ev === 'lostpointercapture') end(); }));
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function resetInput() {
  keys.clear();
  touch.gas = touch.brake = false;
  wheel.active = false; wheel.steer = 0; wheel.id = null;
  bar.active = false; bar.steer = 0; bar.id = null;
  input.smooth = 0;
  tilt.zero = null; tilt.value = 0;
  const base = document.getElementById('stick-base');
  if (base) base.classList.remove('on');
  const bk = document.getElementById('steer-bar-knob');
  if (bk) bk.style.transform = 'translateX(0px)';
  const be = document.getElementById('steer-bar');
  if (be) be.classList.remove('active');
  document.querySelectorAll('[data-touch]').forEach((el) => el.classList.remove('down'));
}
