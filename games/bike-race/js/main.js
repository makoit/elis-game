import * as THREE from '../../../vendor/three.module.js';
import {
  BRANDS, CATEGORIES, KINDS, PALETTE, DEFAULT_CONFIG, resolveBike, statBars, randomConfig, brandsOf, catsOf, partsFor, ALL_PART_KEYS,
  SKIN_TONES, HAIR_COLORS, HAIR_STYLES, KITS, HELMETS, MOTO_HELMETS, FINISHES, PATTERNS, TIRE_WALLS,
} from './bikedata.js';
import { LEVELS } from './ai.js';
import { MAPS } from './maps.js';
import { buildTrack, mulberry32 } from './trackdata.js';
import { Showroom } from './showroom.js';
import { Race, formatTime } from './race.js';
import { input, initInput, resetInput, isTouchDevice, SENS } from './input.js';
import { sfx } from './sfx.js';
import { music } from './music.js';
import { preloadModels, loadSky } from './assets.js';
import { createResolution, RES } from '../../shared/resolution.js';

const $ = (id) => document.getElementById(id);
const hexCss = (c) => '#' + c.toString(16).padStart(6, '0');
const qs = new URLSearchParams(location.search);

if (isTouchDevice) document.body.classList.add('is-touch');

// ---- Speicher ----
const store = {
  get(k, d) { try { const v = localStorage.getItem('elis.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('elis.' + k, JSON.stringify(v)); } catch { /* egal */ } },
};

// ---- Zustand ----
const state = {
  mode: store.get('mode', 'solo'),
  level: store.get('level', 'medium'),
  cfg: { ...DEFAULT_CONFIG, ...store.get('cfg', {}) },
  map: Math.min(store.get('map', 0), MAPS.length - 1),
  laps: store.get('laps', {}), // pro Strecke
  quality: store.get('quality', 'auto'), // auto | high | mid | low
  steer: store.get('steer', 'bar'), // bar | swipe | tilt
  sens: store.get('sens', 'normal'),
  brakeAssist: store.get('brakeAssist', 'moto'), // off | moto | all
  speedLimit: store.get('speedLimit', 'off'), // off | 160 | 100 (km/h, Motorräder)
  cam: store.get('cam', 'normal'), // near | normal | far
  tab: 'brand',
};
const LIMITS = { off: 0, 160: 160 / 3.6, 100: 100 / 3.6 };
const CAMS = { near: 0.82, normal: 1, far: 1.28 };
const kindOf = (cfg) => (CATEGORIES[cfg.cat] || CATEGORIES.trail).kind;
input.autoGas = store.get('autogas', isTouchDevice);
input.assist = store.get('assist', true);
input.sens = SENS[state.sens] ?? 1;
document.body.classList.toggle('autogas', input.autoGas);
input.setMode(state.steer);

// ---- Renderer ----
const renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

function effectiveQuality() {
  if (qs.get('q')) return qs.get('q');
  return state.quality === 'auto' ? (isTouchDevice ? 'low' : 'high') : state.quality;
}
let race = null;
const res = createResolution(renderer, () => { if (race) race.resize(); });
function applyQuality() {
  const q = effectiveQuality();
  // Auto auf Handy/Tablet: einfache Effekte, aber scharfe Auflösung (regelt bei Ruckeln selbst herunter)
  const r = RES[state.quality === 'auto' && !qs.get('q') && isTouchDevice ? 'mid' : q] || RES.mid;
  res.set(r.max, r.budget);
  renderer.shadowMap.enabled = q !== 'low';
}
applyQuality();

const showroom = new Showroom(renderer);
// Modelle (Fahrer, Felsen, Baumstämme …) gleich beim Start laden; die Garage zeigt bis dahin den gebauten Fahrer
const modelsReady = preloadModels().then(() => { if (!race && $('screen-garage').classList.contains('active')) showroom.setBike(currentDef()); });
let paused = false;

// ---- Screens ----
const screens = ['screen-mode', 'screen-garage', 'screen-map', 'screen-pause', 'screen-result', 'screen-settings'];
function show(...ids) { screens.forEach((id) => $(id).classList.toggle('active', ids.includes(id))); }
const inRace = (v) => {
  $('hud').classList.toggle('hidden', !v);
  $('touch').classList.toggle('hidden', !(v && isTouchDevice));
};

// ---- Modus ----
function renderMode() {
  document.querySelectorAll('#mode-cards .card').forEach((c) => c.classList.toggle('sel', c.dataset.mode === state.mode));
  $('level-row').classList.toggle('hidden', state.mode !== 'vs');
  $('level-chips').innerHTML = LEVELS.map((l) =>
    `<button class="chip-btn ${l.id === state.level ? 'sel' : ''}" data-level="${l.id}">${l.emoji} ${l.name}</button>`).join('');
}
$('mode-cards').addEventListener('click', (e) => {
  const c = e.target.closest('.card');
  if (!c) return;
  state.mode = c.dataset.mode;
  store.set('mode', state.mode);
  renderMode();
});
$('level-chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-level]');
  if (!b) return;
  state.level = b.dataset.level;
  store.set('level', state.level);
  renderMode();
});

// ---- Garage ----
const currentDef = () => resolveBike(state.cfg);
function saveCfg() { store.set('cfg', state.cfg); }

function renderGarage() {
  const def = currentDef();
  $('kind-switch').innerHTML = Object.values(KINDS).map((k) =>
    `<button class="kind ${def.kind === k.id ? 'sel' : ''}" data-kind="${k.id}"><span>${k.emoji}</span>${k.name}</button>`).join('');
  $('bike-title').textContent = `${def.emoji} ${def.name}`;
  $('bike-sub').textContent = def.brandDef.tagline;
  const labels = { speed: 'Tempo', accel: 'Antritt', steer: 'Lenkung', brake: 'Bremse', offroad: 'Gelände', stability: 'Stabilität' };
  const bars = statBars(def);
  $('bike-stats').innerHTML = Object.entries(labels).map(([k, label]) =>
    `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.round(bars[k] * 100)}%"></i></div></div>`).join('');
  document.querySelectorAll('#garage-tabs .tab').forEach((t) => t.classList.toggle('sel', t.dataset.tab === state.tab));
  const keep = $('tab-content').scrollTop;
  renderTab(def);
  $('tab-content').scrollTop = keep;
  showroom.setBike(def);
}

function swatches(key, { reset = false, colors = PALETTE, index = false } = {}) {
  const cur = state.cfg[key];
  return `<div class="swatches">${reset ? `<button class="dot reset ${cur == null ? 'sel' : ''}" data-color="${key}" data-value="" aria-label="Automatisch"></button>` : ''}${colors.map((c, i) =>
    `<button class="dot ${(index ? cur === i : cur === c) ? 'sel' : ''}" data-color="${key}" data-value="${index ? i : c}" style="background:${hexCss(c)}" aria-label="Farbe"></button>`).join('')}</div>`;
}
function chipsFor(key, options, { def: cur = state.cfg[key] } = {}) {
  return `<div class="chips">${Object.entries(options).map(([id, name]) =>
    `<button class="chip-btn ${String(cur) === String(id) ? 'sel' : ''}" data-set="${key}" data-id="${id}">${name}</button>`).join('')}</div>`;
}
const group = (label, html) => `<div class="group"><div class="lbl">${label}</div>${html}</div>`;

function renderTab(def) {
  const el = $('tab-content');
  const cfg = state.cfg;
  const kind = def.kind;
  if (state.tab === 'brand') {
    el.innerHTML = `<div class="opt-grid">${brandsOf(kind).map((b) =>
      `<button class="opt ${def.brand === b.id ? 'sel' : ''}" data-brand="${b.id}"><div class="t" style="border-left:8px solid ${hexCss(b.frame)};padding-left:8px">${b.name}</div><div class="s">${b.tagline}</div></button>`).join('')}</div>`;
  } else if (state.tab === 'type') {
    el.innerHTML = `<div class="opt-grid">${catsOf(kind).map((c) =>
      `<button class="opt ${cfg.cat === c.id ? 'sel' : ''}" data-cat="${c.id}"><div class="t">${c.emoji} ${c.name}</div><div class="s">${c.long}</div></button>`).join('')}</div>`;
  } else if (state.tab === 'parts') {
    el.innerHTML = Object.entries(partsFor(def.cat)).map(([g, grp]) =>
      group(grp.label, `<div class="chips">${Object.entries(grp.options).map(([id, o]) =>
        `<button class="chip-btn ${def.parts[g] === id ? 'sel' : ''}" data-part="${g}" data-id="${id}">${o.name}<small>${o.desc}</small></button>`).join('')}</div>`)).join('');
  } else if (state.tab === 'look') {
    const num = cfg.number ?? 0;
    el.innerHTML =
      group('Lack', chipsFor('finish', FINISHES)) +
      group('Muster', chipsFor('pattern', PATTERNS)) +
      group('Reifenflanke', chipsFor('tireWall', TIRE_WALLS)) +
      group('Felgenfarbe', swatches('rim', { reset: true })) +
      group('Startnummer', `<div class="stepper"><button class="round-btn" data-num="-1" aria-label="Weniger">−</button><b>${num > 0 ? num : 'Aus'}</b><button class="round-btn" data-num="1" aria-label="Mehr">+</button><button class="chip-btn ${num > 0 ? '' : 'sel'}" data-num="off">Aus</button></div>`);
  } else if (state.tab === 'colors') {
    el.innerHTML =
      group('Rahmen', swatches('frame', { reset: true })) +
      group('Akzent &amp; Schriftzug', swatches('accent', { reset: true })) +
      group('Felgen', swatches('rim', { reset: true }));
  } else {
    el.innerHTML =
      group('Hautton', swatches('skin', { colors: SKIN_TONES, index: true })) +
      group('Frisur', chipsFor('hairStyle', HAIR_STYLES)) +
      group('Haarfarbe', swatches('hair', { colors: HAIR_COLORS, index: true })) +
      group('Helm', kind === 'moto' ? chipsFor('helmetType', MOTO_HELMETS, { def: MOTO_HELMETS[cfg.helmetType] ? cfg.helmetType : 'auto' }) : chipsFor('helmetType', HELMETS, { def: HELMETS[cfg.helmetType] ? cfg.helmetType : 'auto' })) +
      group('Helmfarbe', swatches('helmet')) +
      (kind === 'moto' ? '' : group('Sonnenbrille', chipsFor('glasses', { true: 'Mit', false: 'Ohne' }))) +
      group(kind === 'moto' ? 'Jacken-Muster' : 'Trikot-Muster', chipsFor('kit', KITS)) +
      group(kind === 'moto' ? 'Jacke' : 'Trikot', swatches('jersey')) +
      group('Hose', swatches('shorts')) +
      group(kind === 'moto' ? 'Stiefel' : 'Schuhe', swatches('shoes'));
  }
}

$('garage-tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  state.tab = t.dataset.tab;
  $('tab-content').scrollTop = 0;
  renderGarage();
  t.scrollIntoView({ block: 'nearest', inline: 'center' });
});
// Fahrrad ↔ Motorrad: Marke und Typ der jeweiligen Art merken, Teile und Markenfarben zurücksetzen
function setKind(kind) {
  const cfg = state.cfg;
  const cur = kindOf(cfg);
  if (kind === cur) return;
  cfg.memo = { ...(cfg.memo || {}), [cur]: { brand: cfg.brand, cat: cfg.cat } };
  const m = cfg.memo[kind] || {};
  cfg.cat = CATEGORIES[m.cat]?.kind === kind ? m.cat : catsOf(kind)[0].id;
  cfg.brand = BRANDS[m.brand]?.kind === kind ? m.brand : brandsOf(kind)[0].id;
  cfg.frame = null; cfg.accent = null; cfg.helmetType = 'auto';
  ALL_PART_KEYS.forEach((g) => { cfg[g] = null; });
  if (state.tab === 'parts' || state.tab === 'type') state.tab = 'type';
}
$('kind-switch').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  setKind(b.dataset.kind);
  saveCfg();
  renderGarage();
});
$('tab-content').addEventListener('click', (e) => {
  const cfg = state.cfg;
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.brand) { cfg.brand = b.dataset.brand; cfg.frame = null; cfg.accent = null; }
  else if (b.dataset.cat) {
    cfg.cat = b.dataset.cat;
    ALL_PART_KEYS.forEach((g) => { cfg[g] = null; }); // Teile zurück auf Standard des Typs
  } else if (b.dataset.part) cfg[b.dataset.part] = b.dataset.id;
  else if (b.dataset.set) {
    const v = b.dataset.id;
    cfg[b.dataset.set] = v === 'true' ? true : v === 'false' ? false : v;
  } else if (b.dataset.num) {
    const n = cfg.number ?? 0;
    if (b.dataset.num === 'off') cfg.number = 0;
    else cfg.number = Math.min(99, Math.max(1, (n || 7) + (n ? Number(b.dataset.num) : 0)));
  } else if (b.dataset.color) {
    const v = b.dataset.value;
    cfg[b.dataset.color] = v === '' ? null : Number(v);
  } else return;
  saveCfg();
  renderGarage();
});
$('btn-random').onclick = () => {
  const r = randomConfig(Math.random);
  state.cfg = { ...state.cfg, ...r, brand: state.cfg.brand, cat: state.cfg.cat, rim: null };
  saveCfg();
  renderGarage();
};

// ---- Strecken ----
// Bestzeiten getrennt nach Fahrzeugart (Motorräder würden sonst jede Fahrrad-Zeit schlagen)
const bestKey = (mapId, laps) => `best.${mapId}.${laps}${kindOf(state.cfg) === 'moto' ? '.moto' : ''}`;
const bestOf = (mapId, laps) => store.get(bestKey(mapId, laps), null);
const lapsOf = (m) => (m.loop ? Math.min(m.laps.max, Math.max(1, state.laps[m.id] ?? m.laps.def)) : 1);
const previews = new Map();

// kleine Streckenskizze für die Karten
function trackPreview(m) {
  if (previews.has(m.id)) return previews.get(m.id);
  const track = buildTrack(m, 1);
  const c = document.createElement('canvas');
  c.width = 180; c.height = 140;
  const g = c.getContext('2d');
  const pts = [];
  for (let s = 0; s <= m.length; s += Math.max(6, m.length / 160)) { const p = track.pointAt(s); pts.push([p.x, p.z]); }
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const span = Math.max(maxX - minX, maxZ - minZ) || 1;
  const k = 120 / span;
  const ox = (180 - (maxX - minX) * k) / 2, oz = (140 - (maxZ - minZ) * k) / 2;
  g.lineCap = g.lineJoin = 'round';
  const draw = () => { g.beginPath(); pts.forEach((p, i) => { const x = ox + (p[0] - minX) * k, y = oz + (p[1] - minZ) * k; i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (m.loop) g.closePath(); };
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 9; draw(); g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 4; draw(); g.stroke();
  g.fillStyle = '#ffb000'; g.beginPath(); g.arc(ox + (pts[0][0] - minX) * k, oz + (pts[0][1] - minZ) * k, 6, 0, 7); g.fill();
  const url = c.toDataURL();
  previews.set(m.id, url);
  return url;
}

function renderMapScreen() {
  $('map-cards').innerHTML = MAPS.map((m, i) => {
    const best = bestOf(m.id, lapsOf(m));
    return `<button class="card ${i === state.map ? 'sel' : ''}" data-i="${i}">
      <div class="preview" style="background:linear-gradient(${hexCss(m.colors.sky)} 0 45%, ${hexCss(m.colors.grass)} 45% 100%)">${m.emoji}<img src="${trackPreview(m)}" alt="" style="position:absolute;right:4px;top:2px;height:calc(100% - 4px);width:auto"></div>
      <div class="body">
        <div class="name">${m.name}</div>
        <div class="desc">${m.desc}</div>
        <div class="meta"><span class="diff">${'★'.repeat(m.difficulty)}${'☆'.repeat(3 - m.difficulty)}</span><span>${m.loop ? `${m.length} m / Runde` : `${(m.length / 1000).toFixed(1)} km`}</span></div>
        <div class="meta"><span>${best ? '🏆 ' + formatTime(best.time) : 'noch keine Zeit'}</span><span>${best ? '⭐'.repeat(best.stars) : ''}</span></div>
      </div></button>`;
  }).join('');
  renderLaps();
}
function renderLaps() {
  const m = MAPS[state.map];
  const n = lapsOf(m);
  $('laps-val').textContent = m.loop ? n : '1';
  $('laps-minus').disabled = !m.loop || n <= 1;
  $('laps-plus').disabled = !m.loop || n >= m.laps.max;
  $('laps-info').textContent = m.loop ? `≈ ${((m.length * n) / 1000).toFixed(1)} km` : 'Abfahrt – keine Runden';
}
$('map-cards').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  state.map = Number(card.dataset.i);
  store.set('map', state.map);
  renderMapScreen();
});
const changeLaps = (d) => {
  const m = MAPS[state.map];
  if (!m.loop) return;
  state.laps[m.id] = Math.min(m.laps.max, Math.max(1, lapsOf(m) + d));
  store.set('laps', state.laps);
  renderMapScreen();
};
$('laps-minus').onclick = () => changeLaps(-1);
$('laps-plus').onclick = () => changeLaps(1);

// ---- Einstellungen ----
function renderSettings() {
  const chips = (arr, cur, attr) => arr.map(([id, n]) => `<button class="chip-btn ${cur === id ? 'sel' : ''}" data-${attr}="${id}">${n}</button>`).join('');
  $('set-quality').innerHTML = chips([['auto', 'Auto'], ['high', 'Hoch'], ['mid', 'Mittel'], ['low', 'Niedrig']], state.quality, 'q');
  $('set-steer').innerHTML = chips([['bar', 'Lenkleiste'], ['swipe', 'Wischen'], ['tilt', 'Neigen']], state.steer, 'steer');
  $('set-sens').innerHTML = chips([['soft', 'Sanft'], ['normal', 'Normal'], ['direct', 'Direkt']], state.sens, 'sens');
  $('set-brake').innerHTML = chips([['off', 'Aus'], ['moto', 'Motorrad'], ['all', 'Immer']], state.brakeAssist, 'brake');
  $('set-limit').innerHTML = chips([['off', 'Ohne'], ['160', '160 km/h'], ['100', '100 km/h']], String(state.speedLimit), 'limit');
  $('set-cam').innerHTML = chips([['near', 'Nah'], ['normal', 'Normal'], ['far', 'Weit']], state.cam, 'cam');
  $('chk-engine').checked = sfx.engineOn;
  $('chk-assist').checked = input.assist;
  $('chk-autogas').checked = input.autoGas;
  $('chk-sound').checked = !sfx.muted;
  $('chk-music').checked = music.enabled;
}
$('set-quality').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  state.quality = b.dataset.q;
  store.set('quality', state.quality);
  applyQuality();
  renderSettings();
});
$('set-steer').addEventListener('click', (e) => {
  const b = e.target.closest('[data-steer]');
  if (!b) return;
  state.steer = b.dataset.steer;
  store.set('steer', state.steer);
  input.setMode(state.steer);
  renderSettings();
});
$('set-sens').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sens]');
  if (!b) return;
  state.sens = b.dataset.sens;
  store.set('sens', state.sens);
  input.sens = SENS[state.sens];
  renderSettings();
});
const chipSetting = (id, attr, key, after) => $(id).addEventListener('click', (e) => {
  const b = e.target.closest(`[data-${attr}]`);
  if (!b) return;
  state[key] = b.dataset[attr];
  store.set(key, state[key]);
  if (after) after();
  renderSettings();
});
chipSetting('set-brake', 'brake', 'brakeAssist');
chipSetting('set-limit', 'limit', 'speedLimit');
chipSetting('set-cam', 'cam', 'cam');
$('chk-engine').onchange = (e) => { sfx.engineOn = e.target.checked; store.set('engine', sfx.engineOn); if (!sfx.engineOn) sfx.engineOff(); };
sfx.engineOn = store.get('engine', true);
$('chk-assist').onchange = (e) => { input.assist = e.target.checked; store.set('assist', input.assist); };
$('chk-autogas').onchange = (e) => { input.autoGas = e.target.checked; store.set('autogas', input.autoGas); document.body.classList.toggle('autogas', input.autoGas); };
$('chk-sound').onchange = (e) => setMuted(!e.target.checked);
$('chk-music').onchange = (e) => { music.setEnabled(e.target.checked); store.set('music', e.target.checked); };
function setMuted(m) {
  sfx.setMuted(m);
  store.set('muted', m);
  $('btn-mute').textContent = m ? '🔇' : '🔊';
}
sfx.setMuted(store.get('muted', false));
music.setEnabled(store.get('music', true));
$('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';

// ---- Rennen ----
const hud = {
  time: $('hud-time'), speed: $('hud-speed'), speedbar: $('hud-speedbar'), bar: $('hud-bike'), countdown: $('countdown'),
  place: $('hud-place'), placeText: $('hud-place-text'), minimap: $('minimap'),
  lap: $('hud-lap'), lapText: $('hud-lap-text'), banner: $('banner'),
};

let starting = false;
async function startRace() {
  if (starting) return;
  starting = true;
  sfx.unlock();
  input.setMode(state.steer); // Neigung neu eichen (und ggf. iOS-Erlaubnis aus dem Tipp heraus erfragen) – noch im Tipp, vor dem Laden
  const map = MAPS[state.map];
  // Himmelsfoto der Strecke und Modelle laden (beim ersten Mal ein paar Sekunden, danach aus dem Speicher)
  $('loading').classList.add('show');
  const [sky] = await Promise.all([qs.get('sky') === '0' ? null : loadSky(map.id), modelsReady]); // ?sky=0: Farbverlauf-Himmel (Vergleich)
  $('loading').classList.remove('show');
  starting = false;
  if (race) race.dispose();
  resetInput();
  paused = false;
  $('countdown').classList.remove('show');
  applyQuality();
  const level = LEVELS.find((l) => l.id === state.level) || LEVELS[1];
  const bikeDef = currentDef();
  race = new Race({
    renderer, bikeDef, map, laps: lapsOf(map), input, hud, quality: effectiveQuality(), sky,
    mode: state.mode, level, onFinish: finishRace, bot: qs.has('bot'),
    brakeAssist: state.brakeAssist === 'all' || (state.brakeAssist === 'moto' && bikeDef.moto),
    speedLimit: LIMITS[state.speedLimit] || 0, camDist: CAMS[state.cam] || 1,
  });
  show();
  inRace(true);
}

function finishRace(res) {
  const map = MAPS[state.map];
  const vs = state.mode === 'vs';
  let stars; let title; let best = '';
  if (vs) {
    stars = res.place === 1 ? 3 : res.place === 2 ? 2 : 1;
    title = ['🥇 Erster Platz!', '🥈 Zweiter Platz!', '🥉 Dritter Platz!'][res.place - 1] || `🏁 Platz ${res.place}`;
  } else {
    stars = race.starsFor(res.time);
    title = '🏁 Im Ziel!';
    const key = bestKey(map.id, res.laps);
    const prev = store.get(key, null);
    const isBest = !prev || res.time < prev.time;
    if (isBest) store.set(key, { time: res.time, stars: Math.max(stars, prev ? prev.stars : 0) });
    else if (stars > prev.stars) store.set(key, { time: prev.time, stars });
    best = isBest ? (prev ? '🎉 Neue Bestzeit!' : '🎉 Erste Zeit gespeichert!') : `Bestzeit: ${formatTime(prev.time)}`;
  }
  $('result-title').textContent = title;
  $('result-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">⭐</span>`).join('');
  $('result-time').textContent = formatTime(res.time);
  $('result-best').textContent = best;
  const fastest = Math.min(...res.lapTimes);
  $('result-laps').innerHTML = res.laps > 1 ? res.lapTimes.map((t, i) => `<span class="${t === fastest ? 'best' : ''}">R${i + 1} ${formatTime(t)}</span>`).join('') : '';
  $('result-ranking').innerHTML = vs ? res.ranking.map((r, i) =>
    `<li class="${r.isPlayer ? 'me' : ''}"><span class="pos">${i + 1}.</span><span class="sw" style="background:${hexCss(r.def.colors.frame)}"></span><span class="who">${r.isPlayer ? 'Du' : r.name} <small>${r.def.name}</small></span><span>${r.time != null ? formatTime(r.time) : '–'}</span></li>`).join('') : '';
  sfx.windOff();
  sfx.engineOff();
  sfx.crowd(0);
  inRace(false);
  show('screen-result');
}

function leaveRace(to) {
  if (race) { race.dispose(); race = null; }
  paused = false;
  inRace(false);
  resetInput();
  sfx.windOff();
  sfx.engineOff();
  sfx.crowd(0);
  music.play('menu');
  if (to === 'garage') { renderGarage(); show('screen-garage'); } else { renderMapScreen(); show('screen-map'); }
}

function setPaused(v) {
  if (!race || race.phase === 'finished') return;
  paused = v;
  resetInput();
  if (v) { sfx.windOff(); sfx.engineOff(); sfx.crowd(0); }
  show(v ? 'screen-pause' : undefined);
}

// ---- Buttons ----
const toMenuMusic = () => { sfx.unlock(); music.play('menu'); };
$('btn-to-garage').onclick = () => { toMenuMusic(); renderGarage(); show('screen-garage'); };
$('btn-back-mode').onclick = () => { renderMode(); show('screen-mode'); };
$('btn-to-maps').onclick = () => { renderMapScreen(); show('screen-map'); };
$('btn-back-garage').onclick = () => { renderGarage(); show('screen-garage'); };
$('btn-settings').onclick = () => { toMenuMusic(); renderSettings(); show('screen-settings'); };
$('btn-settings-close').onclick = () => { renderMode(); show('screen-mode'); };
$('btn-start').onclick = startRace;
$('btn-pause').onclick = () => setPaused(true);
$('btn-resume').onclick = () => setPaused(false);
$('btn-restart').onclick = startRace;
$('btn-quit').onclick = () => leaveRace('map');
$('btn-again').onclick = startRace;
$('btn-other-map').onclick = () => leaveRace('map');
$('btn-other-bike').onclick = () => leaveRace('garage');
$('btn-mute').onclick = () => setMuted(!sfx.muted);
// Zurück in den Spiele-Hub (Startseite mit allen Spielen)
const toHub = () => { location.href = '../../'; };
$('btn-home').onclick = toHub;
$('btn-quit-home').onclick = toHub;
$('btn-result-home').onclick = toHub;

initInput({
  onPause: () => { if (race) setPaused(!paused); },
  onRestart: () => { if (race && !paused) startRace(); },
});
// Audio darf erst nach der ersten Berührung starten
window.addEventListener('pointerdown', () => { sfx.unlock(); if (!race) music.play('menu'); }, { once: true });
window.addEventListener('keydown', () => { sfx.unlock(); if (!race) music.play('menu'); }, { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

// ---- Größe & Loop ----
function onResize() {
  applyQuality();
  showroom.resize();
  if (race) race.resize();
}
addEventListener('resize', onResize);
addEventListener('orientationchange', () => setTimeout(onResize, 200));

// Schnellstart zum Testen: ?start&mode=vs&cat=road&brand=velocita&map=1&laps=2&level=hard&autogas&warp=20&screen=garage|map&tab=parts
// (Motorräder: cat=dirt|enduro|naked|superbike)
if (qs.has('mode')) state.mode = qs.get('mode');
if (qs.has('level')) state.level = qs.get('level');
if (qs.has('cat') && CATEGORIES[qs.get('cat')]) { setKind(CATEGORIES[qs.get('cat')].kind); state.cfg.cat = qs.get('cat'); ALL_PART_KEYS.forEach((g) => { state.cfg[g] = null; }); }
if (qs.has('brand')) { state.cfg.brand = qs.get('brand'); state.cfg.frame = null; state.cfg.accent = null; }
if (qs.has('map')) state.map = Math.min(Number(qs.get('map')), MAPS.length - 1);
if (qs.has('laps')) state.laps[MAPS[state.map].id] = Number(qs.get('laps'));
if (qs.has('tab')) state.tab = qs.get('tab');
if (qs.has('autogas')) input.autoGas = true;
if (qs.has('steer')) input.setMode(qs.get('steer'));

renderMode();
show('screen-mode');
if (qs.get('screen') === 'garage') { renderGarage(); show('screen-garage'); }
if (qs.get('screen') === 'map') { renderMapScreen(); show('screen-map'); }
if (qs.get('screen') === 'settings') { renderSettings(); show('screen-settings'); }
if (qs.has('start')) {
  startRace().then(() => { if (race && qs.has('warp')) for (let i = 0; i < Number(qs.get('warp')) * 60; i++) race.update(1 / 60); }); // Debug: Zeit vorspulen
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const raw = clock.getDelta();
  res.update(raw);
  const dt = Math.min(raw, 0.05);
  if (race) {
    if (!paused) race.update(dt);
    race.render(dt);
  } else {
    showroom.update(dt);
    renderer.render(showroom.scene, showroom.camera);
  }
});

window.game = { state, input, music, get race() { return race; } };
