import '../../shared/compat.js'; // zuerst: Nachrüstungen für ältere Safari-Versionen
import { GARMENTS, COLORS, CUSTOMERS, RAINBOW, garmentById, drawGarment } from './data.js';
import { TECHNIQUES, techById, previewBands, previewDye, renderFabric } from './pattern.js';
import { createWorkshop, STEPS } from './workshop.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('elis.tiedye.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('elis.tiedye.' + k, JSON.stringify(v)); return true; } catch { return false; } },
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = {
  mode: 'free', garment: null, tech: null, customer: null, result: null,
  stars: store.get('stars', 0),
  muted: store.get('muted', false),
};
const unlocked = (item) => (item.need || 0) <= state.stars;
sfx.setMuted(state.muted);
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// ---------- Hilfen ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function modal(html, buttons) {
  return new Promise((resolve) => {
    $('modal-box').innerHTML = html + `<div class="row">${buttons.map((b, i) => `<button class="btn${b.primary ? ' primary' : ''}" data-i="${i}">${b.label}</button>`).join('')}</div>`;
    $('modal').classList.remove('hidden');
    $('modal-box').onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      sfx.tap();
      $('modal').classList.add('hidden');
      resolve(buttons[+b.dataset.i].value);
    };
  });
}

function confetti() {
  const box = $('confetti');
  box.innerHTML = '';
  for (let i = 0; i < 50; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = pick(RAINBOW);
    c.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
    c.style.animationDelay = Math.random() * 0.6 + 's';
    box.appendChild(c);
  }
  setTimeout(() => { box.innerHTML = ''; }, 4500);
}

// Kleidungsstück mit Beispielmuster als Bild (für Karten und Wünsche), zwischengespeichert
const previews = new Map();
function preview(g, techId, hexes, size = 240) {
  const key = [g.id, techId, ...hexes, size].join('|');
  if (!previews.has(key)) {
    const t = techById(techId);
    const tex = renderFabric(techId, g.center[0], g.center[1], previewBands(t.kind), previewDye(t.kind, hexes), 160, g.box);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    drawGarment(cv.getContext('2d'), g, tex, size * 0.06, size * 0.05, size * 0.88);
    previews.set(key, cv.toDataURL());
  }
  return previews.get(key);
}

// ---------- Bildschirme ----------
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + id));
  if (id !== 'work') ws.stop();
  if (id === 'home') renderHome();
  if (id === 'closet') renderCloset();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) { sfx.tap(); show(b.dataset.go); }
});

function renderStars() {
  for (const id of ['home-stars', 'cust-stars']) $(id).textContent = `⭐ ${state.stars}`;
}

function renderHome() {
  renderStars();
  const closet = store.get('closet', []);
  $('closet-count').textContent = closet.length ? `${closet.length} Teil${closet.length > 1 ? 'e' : ''}` : 'Noch leer';
  $('home-art').src = closet.length ? closet[0].img : preview(GARMENTS[0], 'spirale', RAINBOW, 360);
}

$('btn-hub').onclick = () => { location.href = '../../'; };
$('btn-sound').onclick = () => {
  state.muted = !state.muted;
  sfx.setMuted(state.muted);
  store.set('muted', state.muted);
  $('btn-sound').textContent = state.muted ? '🔇' : '🔊';
};
$('btn-sound').textContent = state.muted ? '🔇' : '🔊';
$('btn-free').onclick = () => { sfx.pick(); state.mode = 'free'; state.customer = null; renderGarments(); show('garment'); };
$('btn-shop').onclick = () => { sfx.pick(); state.mode = 'shop'; newCustomer(); show('customer'); };
$('btn-closet').onclick = () => { sfx.pick(); show('closet'); };

// ---------- Kleidungsstück wählen ----------
function renderGarments() {
  $('garment-cards').innerHTML = GARMENTS.map((g, i) => {
    const lock = !unlocked(g);
    return `<button class="card${lock ? ' locked' : ''}" data-g="${g.id}" style="animation-delay:${i * 0.05}s">
      <img src="${preview(g, TECHNIQUES[i % 3].id, shuffle(RAINBOW).slice(0, 3))}" alt="">
      <span class="name">${esc(g.name)}</span>${lock ? `<span class="tag">🔒 ⭐${g.need}</span>` : ''}</button>`;
  }).join('');
}
$('garment-cards').onclick = (e) => {
  const c = e.target.closest('[data-g]');
  if (!c) return;
  const g = garmentById(c.dataset.g);
  if (!unlocked(g)) { sfx.nope(); toast(`Sammle ${g.need} ⭐ – dann gibt's ${g.acc}!`); return; }
  sfx.pick();
  state.garment = g;
  renderTechs();
  show('tech');
};

// ---------- Technik wählen ----------
function renderTechs() {
  const wish = state.customer;
  const cols = wish ? wish.colors.map((c) => c.hex) : RAINBOW;
  $('tech-cards').innerHTML = TECHNIQUES.map((t, i) => {
    const lock = !unlocked(t), isWish = wish && wish.tech.id === t.id;
    const tag = lock ? `<span class="tag">🔒 ⭐${t.need}</span>` : isWish ? '<span class="tag">Wunsch!</span>' : '';
    return `<button class="card${lock ? ' locked' : ''}${isWish ? ' wish' : ''}" data-t="${t.id}" style="animation-delay:${i * 0.05}s">
      <img src="${preview(state.garment, t.id, cols)}" alt=""><span class="name">${t.emoji} ${esc(t.name)}</span>${tag}</button>`;
  }).join('');
}
$('tech-cards').onclick = (e) => {
  const c = e.target.closest('[data-t]');
  if (!c) return;
  const t = techById(c.dataset.t);
  if (!unlocked(t)) { sfx.nope(); toast(`Sammle ${t.need} ⭐ für ${t.name}!`); return; }
  sfx.pick();
  state.tech = t;
  startWork();
};
$('btn-tech-back').onclick = () => { sfx.tap(); show(state.mode === 'shop' ? 'customer' : 'garment'); };

// ---------- Laden: Kunden-Wünsche ----------
function newCustomer() {
  const prev = state.customer;
  let c;
  do c = pick(CUSTOMERS); while (prev && c.name === prev.name);
  const basic = COLORS.filter((x) => unlocked(x) && !x.rainbow);
  state.customer = {
    ...c,
    garment: pick(GARMENTS.filter(unlocked)),
    tech: pick(TECHNIQUES.filter(unlocked)),
    colors: shuffle(basic).slice(0, Math.random() < 0.5 ? 2 : 3),
  };
  const w = state.customer;
  const names = w.colors.map((x) => x.name);
  const list = names.length > 2 ? `${names.slice(0, -1).join(', ')} und ${names.at(-1)}` : names.join(' und ');
  $('cust-face').textContent = w.emoji;
  $('cust-text').innerHTML = `<b>${esc(w.name)}:</b> „Ich wünsche mir ${esc(w.garment.acc)} ${esc(w.tech.wish)} in ${esc(list)}!“`;
  $('cust-wish').src = preview(w.garment, w.tech.id, w.colors.map((x) => x.hex));
  renderStars();
}
$('btn-other').onclick = () => { sfx.tap(); newCustomer(); };
$('btn-accept').onclick = () => {
  sfx.pick();
  state.garment = state.customer.garment;
  renderTechs();
  show('tech');
};

// ---------- Werkbank ----------
const ws = createWorkshop($('cv'), {
  onStep(step, info) {
    $('steps').innerHTML = STEPS.map((s, i) =>
      `<span class="step${i === step ? ' now' : i < step ? ' past' : ''}"><span class="e">${i < step ? '✅' : s.emoji}</span><span class="t">${s.name}</span></span>`).join('');
    $('hint').textContent = info.hint;
    $('btn-next').classList.toggle('hidden', !info.next);
    $('btn-next').textContent = info.nextLabel;
    $('btn-undo').classList.toggle('hidden', !info.undo);
    $('palette').classList.toggle('hidden', !info.palette);
  },
  onDone: finish,
  toast,
});

function renderPalette() {
  const cols = COLORS.filter(unlocked);
  $('palette').innerHTML = cols.map((c, i) =>
    `<button class="bottle${c.rainbow ? ' rainbow' : ''}${i === 0 ? ' sel' : ''}" data-c="${c.id}" style="--c:${c.hex || '#fff'}" aria-label="${esc(c.name)}"></button>`).join('');
  ws.setColor(cols[0]);
}
$('palette').onclick = (e) => {
  const b = e.target.closest('[data-c]');
  if (!b) return;
  sfx.pick();
  $('palette').querySelectorAll('.bottle').forEach((x) => x.classList.toggle('sel', x === b));
  ws.setColor(COLORS.find((c) => c.id === b.dataset.c));
};

function startWork() {
  $('wish-mini').src = state.customer ? $('cust-wish').src : '';
  renderPalette();
  show('work');
  ws.start({ garment: state.garment, tech: state.tech.id });
}
$('btn-next').onclick = () => ws.next();
$('btn-undo').onclick = () => ws.undo();
$('btn-quit').onclick = async () => {
  sfx.tap();
  const ok = await modal('<div class="cust-face small">🤔</div><p>Wirklich aufhören?</p>', [{ label: 'Nein, weiter!', value: false, primary: true }, { label: 'Ja', value: true }]);
  if (ok) show(state.mode === 'shop' ? 'customer' : 'home');
};

// ---------- Fertig ----------
function score(result) {
  const w = state.customer;
  if (!w) return { stars: 1, msg: pick(['Wunderschön! 😍', 'Toll gemacht! 🌈', 'Super-Batik! ✨', 'So bunt! 🎉']) };
  let stars = 1;
  if (result.tech.id === w.tech.id) stars++;
  const total = Object.values(result.usage).reduce((a, b) => a + b, 0) || 1;
  const wished = w.colors.reduce((a, c) => a + (result.usage[c.id] || 0), 0);
  const allUsed = w.colors.every((c) => (result.usage[c.id] || 0) / total > 0.04);
  if (allUsed && wished / total > 0.75) stars++;
  const msg = stars === 3 ? 'Wow, genau so wollte ich es! 😍' : stars === 2 ? 'Schön, danke! 😊' : 'Anders als gedacht – aber hübsch! 🙂';
  return { stars, msg: `${w.name}: „${msg}“` };
}

function finish(result) {
  state.result = result;
  const { stars, msg } = score(result);
  const before = state.stars;
  state.stars += stars;
  store.set('stars', state.stars);

  // großes Bild (erst sichtbar machen, dann ist die Größe bekannt)
  show('done');
  const cv = $('done-cv');
  cv.width = cv.height = Math.round(Math.min(1100, (cv.getBoundingClientRect().width || 450) * Math.min(2, devicePixelRatio || 1)));
  drawGarment(cv.getContext('2d'), result.garment, result.tex, cv.width * 0.05, cv.width * 0.04, cv.width * 0.9);

  $('done-face').textContent = state.customer ? state.customer.emoji : '';
  $('done-msg').textContent = msg;
  const max = state.customer ? 3 : 1;
  $('done-stars').innerHTML = Array.from({ length: max }, (_, i) => `<span class="${i < stars ? '' : 'off'}" style="animation-delay:${0.3 + i * 0.25}s">⭐</span>`).join('');
  for (let i = 0; i < stars; i++) sfx.star(i);
  confetti();
  saveToCloset(result);
  setTimeout(() => announceUnlocks(before), 1200);
}

function announceUnlocks(before) {
  const fresh = [...GARMENTS, ...TECHNIQUES, ...COLORS].filter((x) => x.need > before && x.need <= state.stars);
  if (!fresh.length) return;
  const label = (x) => (x.hex || x.rainbow ? `🎨 Farbe ${x.name}` : `${x.emoji} ${x.name}`);
  sfx.fanfare();
  modal(`<div class="cust-face small">🎁</div><p>Neu freigeschaltet!</p><p style="font-size:20px">${fresh.map(label).map(esc).join('<br>')}</p>`, [{ label: 'Juhu! 🎉', value: true, primary: true }]);
}

$('btn-again').onclick = () => {
  sfx.pick();
  if (state.mode === 'shop') { newCustomer(); show('customer'); } else { renderGarments(); show('garment'); }
};
$('btn-save').onclick = () => {
  sfx.tap();
  const a = document.createElement('a');
  a.download = `tie-dye-${state.result.garment.id}.png`;
  a.href = $('done-cv').toDataURL('image/png');
  a.click();
};

// ---------- Schrank ----------
function saveToCloset(result) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 220;
  drawGarment(cv.getContext('2d'), result.garment, result.tex, 12, 10, 196);
  const closet = store.get('closet', []);
  closet.unshift({ img: cv.toDataURL('image/png'), g: result.garment.id, t: result.tech.id, d: Date.now() });
  closet.length = Math.min(closet.length, 30);
  while (closet.length && !store.set('closet', closet)) closet.pop(); // Speicher voll: Älteste weglassen
}

function renderCloset() {
  const closet = store.get('closet', []);
  $('closet-grid').innerHTML = closet.length
    ? closet.map((c, i) => `<button data-i="${i}" style="animation-delay:${Math.min(i, 12) * 0.04}s"><img src="${c.img}" alt=""></button>`).join('')
    : '<div class="empty">Noch leer – mach dein erstes Tie-Dye! 🎨</div>';
}
$('closet-grid').onclick = async (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  sfx.tap();
  const closet = store.get('closet', []);
  const item = closet[+b.dataset.i];
  if (!item) return;
  const name = garmentById(item.g)?.name || '';
  const what = await modal(`<img src="${item.img}" alt=""><p>${esc(name)} ${techById(item.t)?.emoji || ''}</p>`,
    [{ label: '🗑️ Weg damit', value: 'del' }, { label: 'Schön! 👍', value: 'ok', primary: true }]);
  if (what === 'del') {
    closet.splice(+b.dataset.i, 1);
    store.set('closet', closet);
    renderCloset();
  }
};

renderHome();
