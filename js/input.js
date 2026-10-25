// Eingabe: Tastatur (Pfeile / WASD / Leertaste), Touch (Lenk-Zone links, Gas/Bremse rechts) und optional Neigungssensor.

const keys = new Set();
const touch = { gas: false, brake: false };
const wheel = { active: false, id: null, x0: 0, steer: 0 }; // Touch-Lenkung (analog)
const tilt = { on: false, value: 0, zero: null };

const any = (...codes) => codes.some((c) => keys.has(c));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const input = {
  autoGas: false,
  get steer() {
    if (wheel.active) return wheel.steer;
    if (tilt.on) return tilt.value;
    const r = any('ArrowRight', 'KeyD');
    const l = any('ArrowLeft', 'KeyA');
    return (r ? 1 : 0) - (l ? 1 : 0);
  },
  get gas() { return this.autoGas || any('ArrowUp', 'KeyW', 'Space') || touch.gas; },
  get brake() { return any('ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight') || touch.brake; },
};

export const isTouchDevice =
  new URLSearchParams(location.search).has('touch') || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

const WHEEL_RANGE = 70; // Pixel Wischweg für vollen Lenkeinschlag

export function setTilt(on) {
  tilt.on = on;
  tilt.zero = null;
  tilt.value = 0;
  if (on && !tilt.listening) {
    tilt.listening = true;
    window.addEventListener('deviceorientation', (e) => {
      if (!tilt.on) return;
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      const raw = ang === 90 ? e.beta : ang === 270 || ang === -90 ? -e.beta : e.gamma;
      if (raw == null) return;
      if (tilt.zero === null) tilt.zero = raw; // erste Lage = geradeaus
      tilt.value = clamp((raw - tilt.zero) / 22, -1, 1);
      if (Math.abs(tilt.value) < 0.06) tilt.value = 0;
    });
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

  // Lenken: irgendwo links hinsetzen und nach links/rechts wischen (wie ein Lenker)
  const zone = document.getElementById('steer-zone');
  const base = document.getElementById('stick-base');
  const knob = document.getElementById('stick-knob');
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
    const dx = e.clientX - wheel.x0;
    wheel.x0 += Math.sign(dx) * Math.max(0, Math.abs(dx) - WHEEL_RANGE * 1.2); // Ursprung wandert mit, wenn man weit überzieht
    const d = e.clientX - wheel.x0;
    const s = clamp(d / WHEEL_RANGE, -1, 1);
    wheel.steer = Math.sign(s) * Math.pow(Math.abs(s), 1.15); // feinfühlig in der Mitte
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
  const base = document.getElementById('stick-base');
  if (base) base.classList.remove('on');
  document.querySelectorAll('[data-touch]').forEach((el) => el.classList.remove('down'));
}
