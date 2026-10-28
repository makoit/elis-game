import * as THREE from 'three';
import {
  FISH, FISH_IDS, RODS, BAITS, TECHNIQUES, TIMES, DEPTHS, rodById, baitById, baitFitsRod, fishForBait, biteTable, pickFish, rollWeight,
  fishingDepth, lineOk, gearScore, bestGear, SKIN_TONES, HAIR_COLORS, HAIR_STYLES, HATS, TOPS, PANTS, OUTFIT_COLORS, DEFAULT_LOOK, levelFromXp, xpForLevel, fmtKg, lengthCm,
} from './data.js';
import { WATERS, waterById, spotById, whereIs } from './spots.js';
import { drawWaterMap, hitSpot } from './worldmap.js';
import { FishingScene, Showcase } from './scene.js';
import { createAngler, preloadAngler } from './angler.js';
import { createFish } from './fishmodel.js';
import { Fishing } from './fishing.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);
// Ladefehler (z. B. fehlende Textur) mit Dateinamen melden statt nur „Event“
addEventListener('unhandledrejection', (e) => console.error('Ladefehler:', e.reason?.target?.src || e.reason?.target?.currentSrc || e.reason?.message || e.reason));
const hexCss = (c) => '#' + c.toString(16).padStart(6, '0');
const qs = new URLSearchParams(location.search);
const isTouch = qs.has('touch') || matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('is-touch');

// ---- Speicher ----
const store = {
  get(k, d) { try { const v = localStorage.getItem('elis.angeln.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('elis.angeln.' + k, JSON.stringify(v)); } catch { /* egal */ } },
};

const NEW_CAREER = () => ({ coins: 150, xp: 0, rods: ['pose'], baits: ['wurm', 'brot'], book: {}, catches: 0 });
const state = {
  mode: store.get('mode', 'career'),
  look: { ...DEFAULT_LOOK, ...store.get('look', {}) },
  career: { ...NEW_CAREER(), ...store.get('career', {}) },
  freeBook: store.get('freeBook', {}),
  rod: store.get('rod', 'pose'),
  bait: store.get('bait', 'wurm'),
  depth: store.get('depth', 1),
  drag: store.get('drag', 'mid'),
  water: store.get('water', 'garda'),
  spot: store.get('spot', null),
  time: store.get('time', 0),
  quality: store.get('quality', 'auto'),
  easy: store.get('easy', true),
  tab: 'angler',
};
sfx.setMuted(store.get('muted', false));
const saveCareer = () => store.set('career', state.career);
const career = () => state.mode === 'career';
const level = () => levelFromXp(state.career.xp);
const ownsRod = (id) => !career() || state.career.rods.includes(id);
const ownsBait = (id) => !career() || state.career.baits.includes(id);
const book = () => (career() ? state.career.book : state.freeBook);
const waterOpen = (w) => !career() || level() >= w.level;

// ---- Renderer ----
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);
function quality() { return qs.get('q') || (state.quality === 'auto' ? (isTouch ? 'low' : 'high') : state.quality); }
function applyQuality() {
  const q = quality();
  renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 2 : q === 'mid' ? 1.5 : 1));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = q !== 'low';
}
applyQuality();

const showcase = new Showcase(renderer);
// für Tests in der Konsole
window.angeln = { get world() { return world; }, get fishing() { return fishing; }, state };
const world = new FishingScene(renderer);
let fishing = null;
let view = 'showcase'; // showcase | world
let paused = false;
let tour = null; // Turnier-Zustand

// ---- Screens ----
const SCREENS = ['screen-mode', 'screen-garage', 'screen-map', 'screen-gear', 'screen-catch', 'screen-book', 'screen-settings', 'screen-pause', 'screen-result', 'screen-help'];
function show(...ids) { SCREENS.forEach((id) => $(id).classList.toggle('active', ids.includes(id))); }
function overlay(id, on) { $(id).classList.toggle('active', on); }
function inGame(v) {
  $('hud').classList.toggle('hidden', !v);
  $('controls').classList.toggle('hidden', !v);
  view = v ? 'world' : 'showcase';
}

function toast(text, ms = 2200) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('on'), ms);
}
function banner(text, kind = 'info', ms = 2600) {
  const b = $('banner');
  b.textContent = text;
  b.className = 'on ' + kind;
  clearTimeout(banner.h);
  banner.h = setTimeout(() => { b.className = ''; }, ms);
}

// ---- Startmenü ----
function renderMode() {
  document.querySelectorAll('#mode-cards .card').forEach((c) => c.classList.toggle('sel', c.dataset.mode === state.mode));
  const lvl = level();
  const next = xpForLevel(lvl + 1);
  const caught = Object.keys(state.career.book).length;
  $('player-strip').innerHTML = `
    <span>🏅 Stufe <b>${lvl}</b></span>
    <span class="xpbar"><i style="width:${Math.min(100, ((state.career.xp - xpForLevel(lvl)) / (next - xpForLevel(lvl))) * 100)}%"></i></span>
    <span>🪙 <b>${state.career.coins}</b> Taler</span>
    <span>📖 <b>${caught}</b> / ${FISH_IDS.length} Arten</span>`;
}
document.querySelectorAll('#mode-cards .card').forEach((c) => c.addEventListener('click', () => {
  sfx.unlock(); sfx.click();
  state.mode = c.dataset.mode;
  store.set('mode', state.mode);
  openGarage();
}));
$('btn-home').onclick = () => { location.href = '../../'; };
$('btn-book').onclick = () => { sfx.unlock(); openBook(); };
$('btn-settings').onclick = () => { sfx.unlock(); openSettings(); };

// ---- Garage ----
function openGarage() {
  show('screen-garage');
  view = 'showcase';
  refreshAngler();
  renderGarage();
}
function coinsHtml() { return career() ? `🪙 ${state.career.coins}` : '∞ Frei'; }
function refreshAngler() {
  const a = createAngler(state.look, state.rod);
  a.rotation.y = 0.2;
  showcase.setObject(a, 'angler');
}
function chipRow(items, sel, onPick, fmt = (i) => i.name) {
  const wrap = document.createElement('div');
  wrap.className = 'chips wrap';
  items.forEach((it) => {
    const b = document.createElement('button');
    b.className = 'chip-btn' + (it.id === sel ? ' sel' : '');
    b.innerHTML = fmt(it);
    b.onclick = () => { sfx.click(); onPick(it.id); };
    wrap.appendChild(b);
  });
  return wrap;
}
function swatches(colors, sel, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'swatches';
  colors.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'sw' + (i === sel ? ' sel' : '');
    b.style.background = hexCss(c);
    b.setAttribute('aria-label', 'Farbe ' + (i + 1));
    b.onclick = () => { sfx.click(); onPick(i); };
    wrap.appendChild(b);
  });
  return wrap;
}
function row(label, el) {
  const d = document.createElement('div');
  d.className = 'opt-row';
  d.innerHTML = `<span class="lbl">${label}</span>`;
  d.appendChild(el);
  return d;
}
function setLook(k, v) {
  state.look[k] = v;
  store.set('look', state.look);
  refreshAngler();
  renderGarage();
}

function renderGarage() {
  $('garage-coins').textContent = coinsHtml();
  document.querySelectorAll('#garage-tabs .tab').forEach((t) => t.classList.toggle('sel', t.dataset.tab === state.tab));
  const c = $('tab-content');
  c.innerHTML = '';
  const L = state.look;
  if (state.tab === 'angler') {
    c.appendChild(row('Hautton', swatches(SKIN_TONES, L.skin, (i) => setLook('skin', i))));
    c.appendChild(row('Frisur', chipRow(HAIR_STYLES, L.hair, (id) => setLook('hair', id))));
    c.appendChild(row('Haarfarbe', swatches(HAIR_COLORS, L.hairColor, (i) => setLook('hairColor', i))));
    c.appendChild(row('Kopf', chipRow(HATS, L.hat, (id) => setLook('hat', id))));
    if (L.hat !== 'none' && L.hat !== 'captain') c.appendChild(row('Hutfarbe', swatches(OUTFIT_COLORS, L.hatColor, (i) => setLook('hatColor', i))));
    c.appendChild(row('Oberteil', chipRow(TOPS, L.top, (id) => setLook('top', id))));
    c.appendChild(row('Farbe', swatches(OUTFIT_COLORS, L.topColor, (i) => setLook('topColor', i))));
    if (L.top === 'vest') c.appendChild(row('Shirt', swatches(OUTFIT_COLORS, L.shirtColor, (i) => setLook('shirtColor', i))));
    c.appendChild(row('Hose', chipRow(PANTS, L.pants, (id) => setLook('pants', id))));
    if (L.pants !== 'wader') c.appendChild(row('Hosenfarbe', swatches(OUTFIT_COLORS, L.pantsColor, (i) => setLook('pantsColor', i))));
    c.appendChild(row('Extras', chipRow(
      [{ id: 'glasses', name: (L.glasses ? '✅ ' : '') + '🕶️ Polbrille' }, { id: 'beard', name: (L.beard ? '✅ ' : '') + '🧔 Bart' }],
      null, (id) => setLook(id, !L[id]),
    )));
  } else if (state.tab === 'rods') {
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    for (const r of RODS) {
      const owned = ownsRod(r.id);
      const lock = career() && !owned;
      const b = document.createElement('button');
      b.className = 'shop-card' + (state.rod === r.id ? ' sel' : '') + (lock ? ' locked' : '');
      b.innerHTML = `
        <div class="sc-head"><span class="rod-swatch" style="background:${hexCss(r.color)}"></span><b>${r.name}</b></div>
        <div class="sc-tech">${TECHNIQUES[r.tech].name}</div>
        <div class="sc-stats"><span>💪 ${r.line} kg</span><span>📏 ${r.range} m</span></div>
        <div class="sc-desc">${r.desc}</div>
        <div class="sc-price">${owned ? (state.rod === r.id ? '✅ Ausgewählt' : 'Auswählen') : `🪙 ${r.price} kaufen`}</div>`;
      b.onclick = () => buyOrPickRod(r);
      grid.appendChild(b);
    }
    c.appendChild(grid);
  } else {
    const rod = rodById(state.rod);
    const p = document.createElement('p');
    p.className = 'muted small';
    p.textContent = `Passend zur ${rod.name} (${TECHNIQUES[rod.tech].name}) sind die hellen Köder.`;
    c.appendChild(p);
    const grid = document.createElement('div');
    grid.className = 'shop-grid baits';
    for (const bt of BAITS) {
      const owned = ownsBait(bt.id);
      const fits = baitFitsRod(bt, rod);
      const b = document.createElement('button');
      b.className = 'shop-card' + (state.bait === bt.id ? ' sel' : '') + (career() && !owned ? ' locked' : '') + (fits ? '' : ' dim');
      const fish = fishForBait(bt.id).map((id) => known(id) ? FISH[id].name : '?').join(', ');
      b.innerHTML = `
        <div class="sc-head"><span class="emo">${bt.emoji}</span><b>${bt.name}</b></div>
        <div class="sc-desc">Mögen: ${fish || '–'}</div>
        <div class="sc-tech">${bt.techs.map((t) => TECHNIQUES[t].name).join(' · ')}</div>
        <div class="sc-price">${owned ? (state.bait === bt.id ? '✅ Am Haken' : fits ? 'Anködern' : 'passt nicht zur Rute') : `🪙 ${bt.price} kaufen`}</div>`;
      b.onclick = () => buyOrPickBait(bt);
      grid.appendChild(b);
    }
    c.appendChild(grid);
  }
}
const known = (id) => !career() || !!state.career.book[id];

function buyOrPickRod(r) {
  if (!ownsRod(r.id)) {
    if (state.career.coins < r.price) { sfx.miss(); toast(`Dafür fehlen dir noch ${r.price - state.career.coins} Taler.`); return; }
    state.career.coins -= r.price;
    state.career.rods.push(r.id);
    saveCareer();
    sfx.buy();
    toast(`🎉 ${r.name} gekauft!`);
  } else sfx.click();
  state.rod = r.id;
  store.set('rod', r.id);
  // passenden Köder automatisch wählen
  if (!baitFitsRod(baitById(state.bait), r)) {
    const b = BAITS.find((x) => baitFitsRod(x, r) && ownsBait(x.id));
    if (b) { state.bait = b.id; store.set('bait', b.id); }
  }
  refreshAngler();
  renderGarage();
}
function buyOrPickBait(bt) {
  if (!ownsBait(bt.id)) {
    if (state.career.coins < bt.price) { sfx.miss(); toast(`Dafür fehlen dir noch ${bt.price - state.career.coins} Taler.`); return; }
    state.career.coins -= bt.price;
    state.career.baits.push(bt.id);
    saveCareer();
    sfx.buy();
    toast(`🎉 ${bt.name} gekauft!`);
  }
  const rod = rodById(state.rod);
  if (!baitFitsRod(bt, rod)) {
    const r = RODS.find((x) => baitFitsRod(bt, x) && ownsRod(x.id));
    if (r) { state.rod = r.id; store.set('rod', r.id); refreshAngler(); toast(`Rute gewechselt: ${r.name}`); } else { toast(`Für diesen Köder brauchst du eine ${bt.techs.map((t) => TECHNIQUES[t].name).join(' oder ')}-Rute.`); renderGarage(); return; }
  }
  state.bait = bt.id;
  store.set('bait', bt.id);
  sfx.click();
  renderGarage();
}
document.querySelectorAll('#garage-tabs .tab').forEach((t) => t.addEventListener('click', () => { sfx.click(); state.tab = t.dataset.tab; renderGarage(); }));
$('btn-back-mode').onclick = () => { sfx.click(); renderMode(); show('screen-mode'); };
$('btn-random').onclick = () => {
  sfx.click();
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  Object.assign(state.look, {
    skin: Math.floor(Math.random() * SKIN_TONES.length), hair: pick(HAIR_STYLES).id, hairColor: Math.floor(Math.random() * HAIR_COLORS.length),
    hat: pick(HATS).id, hatColor: Math.floor(Math.random() * OUTFIT_COLORS.length), top: pick(TOPS).id, topColor: Math.floor(Math.random() * OUTFIT_COLORS.length),
    shirtColor: Math.floor(Math.random() * OUTFIT_COLORS.length), pants: pick(PANTS).id, pantsColor: Math.floor(Math.random() * OUTFIT_COLORS.length),
    glasses: Math.random() < 0.4, beard: Math.random() < 0.25,
  });
  store.set('look', state.look);
  refreshAngler();
  renderGarage();
};
$('btn-to-map').onclick = () => { sfx.click(); openMap(); };

// ---- Karte ----
let mapHits = [];
function openMap() {
  show('screen-map');
  view = 'showcase';
  if (!waterOpen(waterById(state.water))) state.water = 'garda';
  renderWaters();
  renderMap();
}
function renderWaters() {
  $('map-coins').textContent = coinsHtml();
  const strip = $('water-cards');
  strip.innerHTML = '';
  for (const w of WATERS) {
    const open = waterOpen(w);
    const b = document.createElement('button');
    b.className = 'water-card' + (w.id === state.water ? ' sel' : '') + (open ? '' : ' locked');
    b.innerHTML = `<canvas width="120" height="70"></canvas><div><b>${w.emoji} ${w.name}</b><small>${open ? w.country : `🔒 ab Stufe ${w.level}`}</small></div>`;
    b.onclick = () => {
      if (!open) { sfx.miss(); toast(`🔒 ${w.name} wird ab Stufe ${w.level} freigeschaltet. Fang mehr Fische!`); return; }
      sfx.click();
      state.water = w.id; state.spot = null;
      store.set('water', w.id);
      renderWaters(); renderMap();
    };
    strip.appendChild(b);
    requestAnimationFrame(() => drawWaterMap(b.querySelector('canvas'), w, { mini: true }));
  }
  const tc = $('time-chips');
  tc.innerHTML = '';
  for (const t of TIMES) {
    const b = document.createElement('button');
    b.className = 'chip-btn' + (t.id === state.time ? ' sel' : '');
    b.textContent = `${t.emoji} ${t.name}`;
    b.onclick = () => { sfx.click(); state.time = t.id; store.set('time', t.id); renderWaters(); renderSpotPanel(); };
    tc.appendChild(b);
  }
}
function renderMap() {
  const w = waterById(state.water);
  if (!state.spot || !w.spots.some((s) => s.id === state.spot)) state.spot = w.spots[0].id;
  mapHits = drawWaterMap($('map'), w, { selected: state.spot });
  renderSpotPanel();
}
function renderSpotPanel() {
  const w = waterById(state.water);
  const s = spotById(w, state.spot);
  const fish = Object.entries(s.fish).sort((a, b) => b[1] - a[1]);
  const rod = rodById(state.rod);
  const bait = baitById(state.bait);
  const depth = fishingDepth(rod, bait, state.depth);
  const tab = biteTable(s, rod, bait.id, depth, state.time);
  const total = gearScore(s, rod, bait, depth, state.time);
  const chance = total > 1.2 ? '🟢 Gute Chancen' : total > 0.4 ? '🟡 Es könnte beißen' : total > 0 ? '🟠 Eher wenig los' : '🔴 Mit diesem Köder beißt hier nichts';
  // Schnur zu schwach für die Fische, die hier auf diesen Köder beißen?
  const weak = tab.filter((t) => lineOk(rod, t.id) < 0.6).map((t) => (known(t.id) ? FISH[t.id].name : '???'));
  // Tipp: beste Montage aus der eigenen Ausrüstung – und in der Karriere, ob es in der Garage noch Besseres gibt
  const mine = bestGear(s, state.time, RODS.filter((r) => ownsRod(r.id)), BAITS.filter((b) => ownsBait(b.id)));
  const shop = career() ? bestGear(s, state.time, RODS, BAITS) : null;
  const gearName = (g) => `<b>${g.rod.name}</b> + <b>${g.bait.emoji} ${g.bait.name}</b>${g.rod.tech === 'pose' ? ` (${DEPTHS[g.depth]})` : ''}`;
  let tip = '';
  if (mine && mine.score > total * 1.3 + 0.05) {
    tip += `<div class="sp-tip">💡 Hier besser: ${gearName(mine)} <button class="chip-btn" id="btn-best-gear">Nehmen</button></div>`;
  }
  if (shop && shop.score > Math.max(total, mine?.score || 0) * 1.5 + 0.1) {
    tip += `<div class="sp-tip shop">🛒 Profi-Tipp aus der Garage: ${gearName(shop)}</div>`;
  }
  $('spot-panel').innerHTML = `
    <div class="sp-head"><span class="sp-type">${s.boat ? '🚤 Boot' : '🎣 Ufer'}</span><b>${s.name}</b><small>${s.place} · ${s.depth} m tief</small></div>
    <p>${s.text}</p>
    <div class="sp-fish">${fish.map(([id, n]) => `<span class="fish-tag ${known(id) ? '' : 'unknown'}" title="${known(id) ? FISH[id].name : 'Unbekannt'}">${known(id) ? FISH[id].name : '???'} ${'•'.repeat(n)}</span>`).join('')}</div>
    <div class="sp-gear">Deine Montage: <b>${rod.name}</b> + <b>${bait.emoji} ${bait.name}</b><br><span>${chance}</span>
      ${weak.length ? `<br><span>⚠️ Für ${weak.join(', ')} ist die Schnur zu schwach – nimm eine stärkere Rute.</span>` : ''}${tip}</div>
    <div class="sp-where muted small">${w.desc}</div>`;
  const bg = $('btn-best-gear');
  if (bg) bg.onclick = () => {
    sfx.click();
    Object.assign(state, { rod: mine.rod.id, bait: mine.bait.id, depth: mine.rod.tech === 'pose' ? mine.depth : state.depth });
    store.set('rod', state.rod); store.set('bait', state.bait); store.set('depth', state.depth);
    toast(`🎣 ${mine.rod.name} + ${mine.bait.name}`);
    renderSpotPanel();
  };
}
$('map').addEventListener('pointerdown', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const id = hitSpot(mapHits, e.clientX - r.left, e.clientY - r.top);
  if (id) { sfx.click(); state.spot = id; store.set('spot', id); renderMap(); }
});
$('btn-back-garage').onclick = () => { sfx.click(); openGarage(); };
$('btn-go').onclick = () => { sfx.unlock(); sfx.click(); startFishing(); };

// ---- Angeln ----
const input = { action: false, actionPressed: false, left: false, right: false, aimDelta: 0 };
let actionWas = false;

function loading(text) {
  $('loading').classList.toggle('hidden', !text);
  if (text) $('loading-text').textContent = text;
}

let building = false;
async function startFishing() {
  if (building) return;
  building = true;
  const w = waterById(state.water);
  const s = spotById(w, state.spot);
  let rod = rodById(state.rod);
  if (!ownsRod(rod.id)) rod = RODS[0];
  let bait = baitById(state.bait);
  if (!baitFitsRod(bait, rod) || !ownsBait(bait.id)) bait = BAITS.find((b) => baitFitsRod(b, rod) && ownsBait(b.id)) || BAITS[0];
  state.rod = rod.id; state.bait = bait.id;
  show();
  loading(`${w.name}: ${s.name} …`);
  world.quality = quality();
  try {
    await world.build(w, s, state.look, rod.id, state.time, (t) => t && loading(`${s.name}: ${t}`));
  } finally {
    building = false;
    loading('');
  }
  world.resize();
  fishing = new Fishing(world, {
    water: w, spot: s, rod, bait, depth: state.depth, time: state.time, drag: state.drag, easy: state.easy, onEvent: onFishEvent,
  });
  inGame(true);
  paused = false;
  $('hud-water').textContent = w.name.toUpperCase();
  $('hud-spot').textContent = s.name;
  $('sonar').classList.toggle('hidden', !s.boat);
  updateGearChip();
  updateCoins();
  setAction('ready');
  sfx.ambient(true, { night: state.time === 3, sea: w.kind === 'meer', river: w.kind === 'fluss' });
  if (state.mode === 'tournament') startTournament(s);
  else { tour = null; $('hud-timer').classList.add('hidden'); $('hud-rank').classList.add('hidden'); }
  banner(`${s.boat ? '🚤' : '🎣'} ${s.name}`, 'info', 1800);
  if (!store.get('helpSeen', false) && !qs.has('go')) openHelp();
}

function updateGearChip() {
  const o = fishing.o;
  const depth = o.rod.tech === 'pose' ? ` · ${DEPTHS[o.depth]}` : '';
  $('hud-gear-text').textContent = `${o.rod.name} · ${o.bait.emoji} ${o.bait.name}${depth}`;
}
function updateCoins() { $('hud-coins').textContent = career() ? `🪙 ${state.career.coins}` : state.mode === 'tournament' ? '🏆 Turnier' : '🌅 Frei'; }

// Schritt-Leiste: welcher Schritt ist dran, was soll man tun
const STEPS = ['aim', 'cast', 'wait', 'strike', 'fight', 'land'];
const WAIT_TEXT = {
  pose: 'Beobachte die rot-gelbe Pose. Wackelt sie nur ein bisschen: noch warten! Taucht sie ganz ab: tippen.',
  grund: 'Beobachte die Rutenspitze. Ruckt sie kräftig und bimmelt das Glöckchen: tippen.',
  spinn: 'Knopf HALTEN = Köder einholen. Kleine Pausen machen die Fische neugierig. Bei einem Ruck: tippen!',
  fliege: 'Die Fliege treibt auf dem Wasser. Schnappt ein Fisch zu (Spritzer!): sofort tippen.',
};
function coach(step, text, kind = '') {
  const i = STEPS.indexOf(step);
  document.querySelectorAll('#coach-steps li').forEach((li, k) => {
    li.classList.toggle('now', k === i);
    li.classList.toggle('done', k < i);
    li.classList.toggle('hot', k === i && kind === 'hot');
  });
  $('coach-text').textContent = text;
  $('coach-text').className = kind;
}

function setAction(st) {
  const t = fishing?.tech;
  const map = {
    ready: ['🎣', 'HALTEN = AUSHOLEN'],
    flying: ['💨', 'FLIEGT …'],
    waiting: t === 'spinn' ? ['🌀', 'HALTEN = EINHOLEN'] : ['⏳', 'WARTEN …'],
    bite: ['❗', 'JETZT TIPPEN!'],
    fight: ['🌀', 'HALTEN = KURBELN'],
    landing: ['🥅', 'KESCHER!'],
    caught: ['🐟', 'GEFANGEN!'],
  }[st] || ['🎣', ''];
  if (st === 'ready') coach('aim', `Mit ◀ ▶ zielen. Dann den runden Knopf GEDRÜCKT HALTEN – je länger, desto weiter. Loslassen = Wurf.`);
  else if (st === 'flying') coach('cast', 'Der Köder fliegt …');
  else if (st === 'waiting') coach('wait', WAIT_TEXT[t] || '');
  else if (st === 'bite') coach('strike', '❗ BISS! Jetzt sofort den Knopf tippen!', 'hot');
  else if (st === 'fight') coach('fight', 'Knopf HALTEN = kurbeln. Wird er ROT: sofort loslassen!');
  else if (st === 'landing') coach('land', 'Gleich hast du ihn – ab in den Kescher!', 'good');
  else if (st === 'caught') coach('land', '🎉 Gefangen!', 'good');
  $('action-ico').textContent = map[0];
  $('action-text').textContent = map[1];
  $('btn-action').className = 'tbtn action st-' + st;
  $('btn-reelin').classList.toggle('hidden', !(st === 'waiting' && t !== 'spinn'));
  $('power').classList.toggle('hidden', st !== 'ready');
  $('fight').classList.toggle('hidden', st !== 'fight');
  const sideBtns = document.querySelectorAll('.tbtn.side');
  sideBtns.forEach((b) => b.classList.remove('blink'));
  sideBtns.forEach((b) => b.classList.toggle('hidden', !(st === 'ready' || st === 'fight')));
}

function onFishEvent(type, d) {
  if (type === 'power') return; // Kraftanzeige liest der Loop direkt
  if (qs.has('bot') && type !== 'fight') console.log('EV', type, JSON.stringify(d));
  if (type === 'state') setAction(d.state);
  else if (type === 'msg') banner(d.text, d.kind, d.long ? 4500 : 2800);
  else if (type === 'nibble') { coach('wait', 'Zupf … zupf … das ist nur Knabbern – NOCH NICHT drücken!'); clearTimeout(onFishEvent.nib); onFishEvent.nib = setTimeout(() => fishing?.state === 'waiting' && setAction('waiting'), 1300); }
  else if (type === 'bite') { banner('❗ BISS! JETZT ANSCHLAGEN!', 'hot', 1100); navigator.vibrate?.(80); }
  else if (type === 'hooked') { banner(d.heavy ? '💪 Ein schwerer Brocken! Vorsicht!' : '🎣 Fisch hängt!', 'hot', 1500); navigator.vibrate?.(150); }
  else if (type === 'run') { $('fight-tip').textContent = '🏃 Flucht! Loslassen!'; }
  else if (type === 'jump') { banner('🐟 Er springt! Nicht zu fest ziehen!', 'hot', 1200); }
  else if (type === 'fight') {
    $('fight-tension').style.width = Math.min(100, d.tension * 100) + '%';
    $('fight-tension').className = d.red ? 'red' : d.tension > 0.65 ? 'warn' : '';
    $('fight-stamina').style.width = d.stamina * 100 + '%';
    $('fight-dist').textContent = `${Math.round(d.dist)} m`;
    $('fight-tip').textContent = d.side ? (d.countering ? '👍 Gut gegengehalten!' : `Fisch zieht nach ${d.side > 0 ? 'links' : 'rechts'} → halte ${d.side > 0 ? '▶' : '◀'}`) : '';
    // Großer Knopf: grün = kurbeln, rot = loslassen; Pfeil blinkt, wenn man gegenhalten soll
    const letGo = d.run || d.tension > 0.85;
    const btn = $('btn-action');
    btn.classList.toggle('let', letGo);
    btn.classList.toggle('reel', !letGo);
    $('action-ico').textContent = letGo ? '✋' : '🌀';
    $('action-text').textContent = letGo ? 'LOSLASSEN!' : 'HALTEN = KURBELN';
    document.querySelector('[data-key="right"]').classList.toggle('blink', d.side > 0 && !d.countering);
    document.querySelector('[data-key="left"]').classList.toggle('blink', d.side < 0 && !d.countering);
    if (letGo) coach('fight', d.run ? '🏃 Der Fisch flüchtet – LOSLASSEN und warten!' : '🔥 Zu viel Spannung – LOSLASSEN!', 'hot');
    else if (d.slack) coach('fight', '⚠️ Schnur zu locker – Knopf halten und kurbeln!');
    else coach('fight', `Halten = kurbeln. Noch ${Math.round(d.dist)} m – der Fisch wird müde.`);
  } else if (type === 'lost') { banner(d.text, 'warn', 3800); setAction('ready'); }
  else if (type === 'caught') onCaught(d);
}

// ---- Fang ----
let currentCatch = null;
function onCaught(c) {
  currentCatch = c;
  const f = FISH[c.id];
  const bk = book();
  const prev = bk[c.id];
  const isNew = !prev;
  const isRecord = prev && c.kg > prev.best;
  $('catch-name').textContent = f.name;
  $('catch-latin').textContent = f.latin;
  $('catch-kg').textContent = fmtKg(c.kg);
  $('catch-cm').textContent = `${c.cm} cm`;
  $('catch-new').classList.toggle('hidden', !isNew);
  $('catch-record').textContent = isNew ? 'Erster Fang dieser Art! 🎉' : isRecord ? `🏆 Neuer Rekord! (vorher ${fmtKg(prev.best)})` : `Dein Rekord: ${fmtKg(prev.best)}`;
  $('catch-info').textContent = f.info;
  const undersize = f.min && c.cm < f.min;
  const mustRelease = f.protected || undersize;
  const rule = $('catch-rule');
  rule.classList.toggle('hidden', !mustRelease);
  rule.textContent = f.protected ? `🛡️ Der ${f.name} ist geschützt – er muss immer zurück ins Wasser.` : undersize ? `📏 Schonmaß ${f.min} cm – dieser Fisch ist noch zu klein und darf weiterwachsen.` : '';
  const price = Math.max(3, Math.round(c.kg * f.price + 4));
  c.price = price;
  $('btn-keep').classList.toggle('hidden', mustRelease || state.mode !== 'career');
  $('btn-keep').textContent = `Verkaufen 🪙 ${price}`;
  $('btn-release').textContent = state.mode === 'career' ? `Zurücksetzen 💧 +${xpFor(c, true)} XP` : 'Zurücksetzen 💧';
  // Buch eintragen
  bk[c.id] = { n: (prev?.n || 0) + 1, best: Math.max(prev?.best || 0, c.kg), where: prev?.where || c.water };
  if (career()) saveCareer(); else store.set('freeBook', state.freeBook);
  if (tour) {
    tour.me.kg += c.kg; tour.me.n++;
    tour.me.best = Math.max(tour.me.best, c.kg);
  }
  overlay('screen-catch', true);
  setAction('caught');
}
function xpFor(c, release) { return Math.round((10 + Math.min(60, c.kg * 4)) * (release ? 1.5 : 1)); }
function finishCatch(release) {
  const c = currentCatch;
  overlay('screen-catch', false);
  if (career() && c) {
    const lvlBefore = level();
    let xp = xpFor(c, release);
    if (state.career.book[c.id]?.n === 1) xp += 50; // neue Art
    state.career.xp += xp;
    state.career.catches++;
    if (!release) state.career.coins += c.price;
    saveCareer();
    updateCoins();
    toast(release ? `💧 Tschüss, ${FISH[c.id].name}! +${xp} XP` : `🪙 +${c.price} Taler · +${xp} XP`);
    const lvl = level();
    if (lvl > lvlBefore) {
      sfx.levelUp();
      const opened = WATERS.filter((w) => w.level > lvlBefore && w.level <= lvl);
      banner(`⭐ Stufe ${lvl}!${opened.length ? ` Neu: ${opened.map((w) => w.name).join(', ')}` : ''}`, 'hot', 4000);
    }
  }
  currentCatch = null;
  fishing.finishCatch(release);
}
$('btn-keep').onclick = () => { sfx.click(); finishCatch(false); };
$('btn-release').onclick = () => { finishCatch(true); };

// ---- Montage-Dialog ----
function openGear() {
  if (!fishing || !(fishing.state === 'ready' || fishing.state === 'waiting')) { toast('Erst den Köder einholen!'); return; }
  if (fishing.state === 'waiting') fishing.reelIn();
  paused = true;
  renderGear();
  overlay('screen-gear', true);
}
function renderGear() {
  const o = fishing.o;
  const mk = (el, items, sel, pick, lab) => {
    el.innerHTML = '';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'chip-btn' + (it.id === sel ? ' sel' : '');
      b.innerHTML = lab(it);
      b.onclick = () => { sfx.click(); pick(it); renderGear(); };
      el.appendChild(b);
    });
  };
  mk($('gear-rods'), RODS.filter((r) => ownsRod(r.id)), o.rod.id, (r) => {
    let bait = o.bait;
    if (!baitFitsRod(bait, r)) bait = BAITS.find((b) => baitFitsRod(b, r) && ownsBait(b.id)) || bait;
    if (!baitFitsRod(bait, r)) { toast('Du hast keinen passenden Köder für diese Rute – kauf einen in der Garage!'); return; }
    applyGear(r, bait, o.depth);
  }, (r) => `${r.name} <small>${TECHNIQUES[r.tech].name}</small>`);
  mk($('gear-baits'), BAITS.filter((b) => ownsBait(b.id) && baitFitsRod(b, o.rod)), o.bait.id, (b) => applyGear(o.rod, b, o.depth), (b) => `${b.emoji} ${b.name}`);
  $('gear-depth-row').classList.toggle('hidden', o.rod.tech !== 'pose');
  mk($('gear-depth'), DEPTHS.map((n, i) => ({ id: i, name: n })), o.depth, (d) => applyGear(o.rod, o.bait, d.id), (d) => d.name);
  mk($('gear-drag'), [{ id: 'soft', name: 'Weich' }, { id: 'mid', name: 'Mittel' }, { id: 'hard', name: 'Fest' }], o.drag, (d) => { o.drag = d.id; state.drag = d.id; store.set('drag', d.id); }, (d) => d.name);
  const likes = fishForBait(o.bait.id).filter((id) => o.spot.fish[id]).map((id) => (known(id) ? FISH[id].name : '???'));
  $('gear-tip').textContent = likes.length ? `Hier mögen diesen Köder: ${likes.join(', ')}.` : 'Diesen Köder mag hier kein Fisch …';
}
function applyGear(rod, bait, depth) {
  const rodChanged = rod.id !== fishing.o.rod.id;
  fishing.setGear(rod, bait, depth);
  state.rod = rod.id; state.bait = bait.id; state.depth = depth;
  store.set('rod', rod.id); store.set('bait', bait.id); store.set('depth', depth);
  if (rodChanged) {
    // Neue Rute in die Hand
    const parent = world.angler.parent;
    const pos = world.angler.position.clone();
    const yaw = world.angler.rotation.y;
    parent.remove(world.angler);
    world.angler = createAngler(state.look, rod.id, { lifeJacket: !!fishing.o.spot.boat });
    world.angler.rotation.y = yaw;
    world.angler.position.copy(pos);
    parent.add(world.angler);
  }
  updateGearChip();
}
$('hud-gear').onclick = () => { sfx.click(); openGear(); };
function openHelp() { paused = true; overlay('screen-help', true); }
$('btn-help').onclick = () => { sfx.click(); openHelp(); };
$('btn-help-close').onclick = () => { sfx.click(); overlay('screen-help', false); paused = false; store.set('helpSeen', true); };
$('btn-gear-close').onclick = () => { sfx.click(); overlay('screen-gear', false); paused = false; setAction(fishing.state); };

// ---- Fangbuch ----
function openBook() {
  const bk = book();
  const grid = $('book-grid');
  grid.innerHTML = '';
  $('book-count').textContent = `${Object.keys(bk).length} / ${FISH_IDS.length}`;
  for (const id of FISH_IDS) {
    const f = FISH[id];
    const e = bk[id];
    const where = [...new Set(whereIs(id).map((x) => x.water.name))];
    const d = document.createElement('div');
    d.className = 'book-card' + (e ? '' : ' unknown');
    d.innerHTML = `
      <canvas width="160" height="70"></canvas>
      <b>${e || !career() ? f.name : '???'}</b>
      ${e ? `<small>${e.n}× gefangen · Rekord ${fmtKg(e.best)} (${lengthCm(id, e.best)} cm)</small>` : `<small>Noch nicht gefangen</small>`}
      <small class="where">📍 ${where.join(', ')}</small>
      <small class="likes">🪝 ${Object.entries(f.baits).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b]) => baitById(b).name).join(', ')}</small>`;
    grid.appendChild(d);
    drawFishIcon(d.querySelector('canvas'), id, !!e || !career());
  }
  overlay('screen-book', true);
  if (view === 'world') paused = true;
}
$('btn-book-close').onclick = () => { sfx.click(); overlay('screen-book', false); if (view === 'world' && !$('screen-pause').classList.contains('active')) paused = false; };
$('btn-book2').onclick = () => { sfx.click(); openBook(); };

// Fisch-Icon fürs Fangbuch: 3D-Modell einmal offscreen rendern
let iconRenderer = null;
const iconCache = {};
function drawFishIcon(canvas, id, color) {
  const key = id + color;
  const ctx = canvas.getContext('2d');
  if (!iconCache[key]) {
    if (!iconRenderer) { iconRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); iconRenderer.setSize(320, 140); iconRenderer.outputColorSpace = THREE.SRGBColorSpace; }
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const l = new THREE.DirectionalLight(0xffffff, 2); l.position.set(1, 2, 3); sc.add(l);
    const fish = createFish(id);
    if (id === 'scholle') fish.rotation.x = 0;
    if (!color) fish.traverse((o) => { if (o.material) { o.material = new THREE.MeshBasicMaterial({ color: 0x1a3a4a, side: THREE.DoubleSide }); } });
    sc.add(fish);
    const cam = new THREE.OrthographicCamera(-0.58, 0.58, 0.255, -0.255, 0.1, 10);
    cam.position.set(0, 0, 3);
    iconRenderer.render(sc, cam);
    iconCache[key] = iconRenderer.domElement.toDataURL();
    fish.traverse((o) => { o.geometry?.dispose(); });
  }
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.src = iconCache[key];
}

// ---- Turnier ----
const BOTS = [
  { name: 'Opa Heinz', emoji: '👴', skill: 1.0 },
  { name: 'Lena', emoji: '👧', skill: 0.85 },
  { name: 'Kapitän Jo', emoji: '🧔', skill: 1.15 },
];
function startTournament(spot) {
  tour = {
    t: 300, spot,
    me: { name: 'Du', emoji: '🎣', kg: 0, n: 0, best: 0 },
    bots: BOTS.map((b) => ({ ...b, kg: 0, n: 0, best: 0, next: 15 + Math.random() * 30 })),
  };
  $('hud-timer').classList.remove('hidden');
  $('hud-rank').classList.remove('hidden');
  renderRank();
}
function updateTournament(dt) {
  if (!tour) return;
  tour.t -= dt;
  for (const b of tour.bots) {
    b.next -= dt;
    if (b.next <= 0) {
      // Bots angeln mit einem „Lieblingsköder“ für den Platz
      const tab = Object.entries(tour.spot.fish).map(([id, n]) => ({ id, rate: n }));
      const id = pickFish(tab);
      const kg = rollWeight(id) * b.skill;
      b.kg += kg; b.n++; b.best = Math.max(b.best, kg);
      b.next = 25 + Math.random() * 45 / b.skill;
      toast(`${b.emoji} ${b.name} fängt: ${FISH[id].name} (${fmtKg(kg)})`, 2000);
    }
  }
  const m = Math.max(0, Math.ceil(tour.t));
  $('hud-timer').textContent = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  $('hud-timer').classList.toggle('urgent', m <= 30);
  renderRank();
  if (tour.t <= 0 && (fishing.state !== 'fight' && fishing.state !== 'landing' && fishing.state !== 'caught')) endTournament();
}
function ranking() { return [tour.me, ...tour.bots].sort((a, b) => b.kg - a.kg); }
function renderRank() {
  $('hud-rank').innerHTML = ranking().map((p) => `<li class="${p === tour.me ? 'me' : ''}">${p.emoji} ${p.name}<b>${fmtKg(p.kg)}</b></li>`).join('');
}
function endTournament() {
  const r = ranking();
  const place = r.indexOf(tour.me) + 1;
  paused = true;
  $('result-title').textContent = place === 1 ? '🏆 Du hast gewonnen!' : `Platz ${place} von 4`;
  $('result-ranking').innerHTML = r.map((p, i) => `<li class="${p === tour.me ? 'me' : ''}"><span>${['🥇', '🥈', '🥉', '4.'][i]} ${p.emoji} ${p.name}</span><b>${fmtKg(p.kg)}</b><small>${p.n} Fische${p.best ? ` · größter ${fmtKg(p.best)}` : ''}</small></li>`).join('');
  $('result-catches').textContent = tour.me.n ? '' : 'Tipp: Schau ins Fangbuch, welcher Köder hier passt!';
  overlay('screen-result', true);
  tour = null;
  sfx.ambient(false);
}
$('btn-again').onclick = () => { sfx.click(); overlay('screen-result', false); startFishing(); };
$('btn-result-menu').onclick = () => { sfx.click(); overlay('screen-result', false); quitToMenu(); };

// ---- Pause / Einstellungen ----
function pause(on) {
  if (view !== 'world') return;
  paused = on;
  overlay('screen-pause', on);
}
$('btn-pause').onclick = () => { sfx.click(); pause(true); };
$('btn-resume').onclick = () => { sfx.click(); pause(false); };
$('btn-to-spots').onclick = () => { sfx.click(); leaveGame(); openMap(); };
$('btn-quit').onclick = () => { sfx.click(); quitToMenu(); };
$('btn-quit-home').onclick = () => { location.href = '../../'; };
function leaveGame() {
  overlay('screen-pause', false);
  overlay('screen-catch', false);
  inGame(false);
  paused = false;
  tour = null;
  fishing = null;
  sfx.ambient(false);
}
function quitToMenu() { leaveGame(); renderMode(); show('screen-mode'); refreshAngler(); }
$('btn-mute').onclick = () => {
  sfx.setMuted(!sfx.muted);
  store.set('muted', sfx.muted);
  $('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';
  if (fishing) sfx.ambient(!sfx.muted, { night: state.time === 3, sea: fishing.o.water.kind === 'meer', river: fishing.o.water.kind === 'fluss' });
};
$('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';

function openSettings() {
  const qEl = $('set-quality');
  qEl.innerHTML = '';
  for (const [id, n] of [['auto', 'Auto'], ['low', 'Niedrig'], ['mid', 'Mittel'], ['high', 'Hoch']]) {
    const b = document.createElement('button');
    b.className = 'chip-btn' + (state.quality === id ? ' sel' : '');
    b.textContent = n;
    b.onclick = () => { state.quality = id; store.set('quality', id); applyQuality(); openSettings(); };
    qEl.appendChild(b);
  }
  $('chk-easy').checked = state.easy;
  $('chk-sound').checked = !sfx.muted;
  overlay('screen-settings', true);
}
$('chk-easy').onchange = (e) => { state.easy = e.target.checked; store.set('easy', state.easy); };
$('chk-sound').onchange = (e) => { sfx.setMuted(!e.target.checked); store.set('muted', sfx.muted); $('btn-mute').textContent = sfx.muted ? '🔇' : '🔊'; };
$('btn-settings-close').onclick = () => { sfx.click(); overlay('screen-settings', false); };
$('btn-reset').onclick = () => {
  if (!confirm('Karriere wirklich zurücksetzen? Taler, Ausrüstung und Fangbuch gehen verloren.')) return;
  state.career = NEW_CAREER();
  saveCareer();
  state.rod = 'pose'; state.bait = 'wurm';
  renderMode();
  toast('Karriere zurückgesetzt.');
};

// ---- Eingabe ----
const keys = {};
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if ($('screen-help').classList.contains('active')) $('btn-help-close').click();
    else if ($('screen-gear').classList.contains('active')) $('btn-gear-close').click();
    else if ($('screen-book').classList.contains('active')) $('btn-book-close').click();
    else if (view === 'world' && !$('screen-catch').classList.contains('active')) pause(!paused);
  }
  if (e.code === 'KeyM' && view === 'world' && !paused) openGear();
  if (e.code === 'KeyR' && fishing?.state === 'waiting' && !paused) fishing.reelIn();
  if (e.code === 'Space') e.preventDefault();
  if ($('screen-catch').classList.contains('active')) {
    if (e.code === 'Enter' || e.code === 'KeyK') (!$('btn-keep').classList.contains('hidden') ? $('btn-keep') : $('btn-release')).click();
    if (e.code === 'KeyZ' || e.code === 'Backspace') $('btn-release').click();
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
const touchKeys = { action: false, left: false, right: false };
document.querySelectorAll('[data-key]').forEach((b) => {
  const k = b.dataset.key;
  const down = (e) => { e.preventDefault(); sfx.unlock(); touchKeys[k] = true; b.classList.add('down'); b.setPointerCapture?.(e.pointerId); };
  const up = () => { touchKeys[k] = false; b.classList.remove('down'); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('lostpointercapture', up);
});
$('btn-reelin').onclick = () => { if (fishing?.state === 'waiting') { sfx.click(); fishing.reelIn(); } };
// Zielen durch Wischen auf dem Bild
let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => { if (view === 'world') drag = e.clientX; });
addEventListener('pointermove', (e) => { if (drag != null && fishing?.state === 'ready') { input.aimDelta -= (e.clientX - drag) * 0.004; drag = e.clientX; } });
addEventListener('pointerup', () => { drag = null; });

// Testpilot (?bot): spielt selbst, um den Ablauf und die Balance zu prüfen
const bot = { t: 0, hold: 0 };
function botInput(dt) {
  if (!fishing) return false;
  bot.t += dt;
  const st = fishing.state;
  if ($('screen-catch').classList.contains('active')) { if (bot.t > 1) { bot.t = 0; console.log('BOT catch', currentCatch.id, currentCatch.kg); finishCatch(true); } return false; }
  if (st === 'ready') { bot.hold += dt; if (bot.hold > 0.8) { bot.hold = 0; return false; } return true; }
  if (st === 'waiting') return fishing.tech === 'spinn';
  if (st === 'bite') { bot.t = 0; return bot.hold++ % 2 === 0; }
  if (st === 'fight') return fishing.tension < 0.7 && !(fishing.run > 0);
  return false;
}

function readInput() {
  const act = !!(keys.Space || keys.ArrowUp || keys.KeyW || touchKeys.action || (qs.has('bot') && botInput(lastDt)));
  input.actionPressed = act && !actionWas;
  actionWas = act;
  input.action = act;
  input.left = !!(keys.ArrowLeft || keys.KeyA || touchKeys.left);
  input.right = !!(keys.ArrowRight || keys.KeyD || touchKeys.right);
}

// ---- Kraftanzeige & Echolot ----
function onPower(p) {
  const el = $('power');
  el.classList.toggle('charging', p >= 0);
  $('power-fill').style.width = Math.max(0, p) * 100 + '%';
  if (p >= 0 && fishing) {
    $('power-text').textContent = `WURFWEITE ${Math.round(fishing.castDist || 0)} m`;
    coach('cast', `Weiter halten = weiter werfen … LOSLASSEN zum Auswerfen! (${Math.round(fishing.castDist || 0)} m)`);
  } else $('power-text').textContent = 'WURFWEITE';
}
const sonar = { x: 0, marks: [] };
function drawSonar(dt) {
  const c = $('sonar');
  if (c.classList.contains('hidden') || !fishing) return;
  const x = c.getContext('2d');
  const W = c.width, H = c.height;
  sonar.x += dt * 30;
  const spot = fishing.o.spot;
  if (Math.random() < dt * 1.2) {
    const ids = Object.keys(spot.fish);
    const id = ids[Math.floor(Math.random() * ids.length)];
    const dp = FISH[id].depth[Math.floor(Math.random() * FISH[id].depth.length)];
    sonar.marks.push({ x: W + 10, y: 22 + dp * 34 + Math.random() * 14, s: 3 + Math.min(8, FISH[id].w[1] * 0.8) });
  }
  x.fillStyle = '#04263a'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(120,200,255,0.15)';
  for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, i * 30); x.lineTo(W, i * 30); x.stroke(); }
  // Grund
  x.fillStyle = '#c87a2a';
  x.beginPath(); x.moveTo(0, H);
  for (let i = 0; i <= W; i += 4) x.lineTo(i, H - 14 - Math.sin((i + sonar.x) * 0.03) * 5 - Math.sin((i + sonar.x) * 0.011) * 6);
  x.lineTo(W, H); x.fill();
  // Fischsicheln
  x.strokeStyle = '#ffd23a'; x.lineWidth = 2.5;
  sonar.marks = sonar.marks.filter((m) => (m.x -= dt * 30) > -10);
  for (const m of sonar.marks) { x.beginPath(); x.arc(m.x, m.y + m.s, m.s, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }
  x.fillStyle = '#9fe0ff'; x.font = '700 11px system-ui';
  x.fillText(`ECHOLOT  ${spot.depth} m`, 6, 13);
}

// ---- Loop ----
let last = performance.now();
let dbgN = 0;
let lastDt = 0;
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // rAF-Zeit kann vor performance.now() beim Laden liegen
  last = now;
  lastDt = dt;
  readInput();
  if (view === 'world' && fishing) {
    if (!paused && !$('screen-catch').classList.contains('active')) {
      fishing.update(dt, input);
      updateTournament(dt);
    } else if ($('screen-catch').classList.contains('active')) fishing.update(dt, { action: false, actionPressed: false, left: false, right: false, aimDelta: 0 });
    if (fishing.state === 'ready') onPower(fishing.charging ? fishing.power : -1);
    world.update(dt);
    drawSonar(dt);
    world.render();
    if (qs.has('dbg') && (dbgN++ % 60 === 0)) console.log('DBG', fishing.state, fishing.aimYaw, world.camera.position.toArray().map((v) => v.toFixed(2)).join(','), world.camTarget.toArray().join(','));
  } else {
    showcase.update(dt);
    showcase.render();
  }
  requestAnimationFrame(loop);
}
addEventListener('resize', () => {
  applyQuality();
  world.resize();
  showcase.resize();
  if ($('screen-map').classList.contains('active')) renderMap();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && view === 'world' && !paused && !$('screen-catch').classList.contains('active')) pause(true); });

// ---- Start ----
renderMode();
showcase.resize();
loading('Lade Angler …');
try {
  await Promise.all([preloadAngler(), showcase.ready]);
  loading('');
} catch (e) {
  console.error(e);
  loading('⚠️ ' + e.message + ' – bitte neu laden.');
}
refreshAngler();
// Debug-Einstieg: ?go&water=bodensee&spot=lindau&mode=free&time=2
if (qs.has('go')) {
  if (qs.get('mode')) state.mode = qs.get('mode');
  if (qs.get('water')) state.water = qs.get('water');
  state.spot = qs.get('spot') || null;
  if (!state.spot) state.spot = waterById(state.water).spots[0].id;
  if (qs.get('time')) state.time = +qs.get('time');
  if (qs.get('rod')) state.rod = qs.get('rod');
  if (qs.get('bait')) state.bait = qs.get('bait');
  await startFishing();
  // ?demo=fight:hecht bzw. ?demo=catch:wels springt direkt in den Drill / Fang
  const [demo, demoFish] = (qs.get('demo') || '').split(':');
  if (demo) {
    fishing.pending = demoFish || 'hecht';
    fishing.lurePos.copy(world.base).add(new THREE.Vector3(2, 0, 18));
    fishing.hook();
    if (demo === 'catch') {
      fishing.state = 'landing';
      fishing.landT = 5;
      fishing.landFrom = fishing.lurePos.clone();
      fishing.fishMesh.visible = true;
    }
  }
} else if (qs.get('screen') === 'map') { openMap(); } else if (qs.get('screen') === 'garage') { openGarage(); }
requestAnimationFrame(loop);
