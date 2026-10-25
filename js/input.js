// Eingabe: Tastatur (Pfeile / WASD / Leertaste) und Touch-Buttons.

const keys = new Set();
const touch = { left: false, right: false, gas: false, brake: false };

const any = (...codes) => codes.some((c) => keys.has(c));

export const input = {
  autoGas: false,
  get steer() {
    const r = any('ArrowRight', 'KeyD') || touch.right;
    const l = any('ArrowLeft', 'KeyA') || touch.left;
    return (r ? 1 : 0) - (l ? 1 : 0);
  },
  get gas() { return this.autoGas || any('ArrowUp', 'KeyW', 'Space') || touch.gas; },
  get brake() { return any('ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight') || touch.brake; },
};

export const isTouchDevice =
  new URLSearchParams(location.search).has('touch') || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

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

  document.querySelectorAll('[data-touch]').forEach((el) => {
    const name = el.dataset.touch;
    const set = (v) => { touch[name] = v; el.classList.toggle('down', v); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); set(true); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => el.addEventListener(ev, () => set(false)));
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function resetInput() {
  keys.clear();
  Object.keys(touch).forEach((k) => { touch[k] = false; });
  document.querySelectorAll('[data-touch]').forEach((el) => el.classList.remove('down'));
}
