import * as THREE from 'three';
import { BRANDS, CATEGORIES, PARTS, PALETTE, DEFAULT_CONFIG, resolveBike, statBars } from './bikedata.js';
import { LEVELS } from './ai.js';
import { MAPS } from './maps.js';
import { Showroom } from './showroom.js';
import { Race, formatTime } from './race.js';
import { input, initInput, resetInput, setTilt, isTouchDevice } from './input.js';
import { sfx } from './sfx.js';

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
  quality: store.get('quality', 'auto'), // auto | high | mid | low
  tab: 'brand',
};
input.autoGas = store.get('autogas', isTouchDevice);
document.body.classList.toggle('autogas', input.autoGas);

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
function applyQuality() {
  const q = effectiveQuality();
  const cap = q === 'high' ? 2 : q === 'mid' ? 1.5 : 1;
  renderer.setPixelRatio(Math.min(devicePixelRatio, cap));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = q !== 'low';
}
applyQuality();

const showroom = new Showroom(renderer);
let race = null;
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
  $('bike-title').textContent = `${def.emoji} ${def.name}`;
  $('bike-sub').textContent = def.brandDef.tagline;
  const labels = { speed: 'Tempo', accel: 'Antritt', steer: 'Lenkung', offroad: 'Gelände', stability: 'Stabilität' };
  const bars = statBars(def);
  $('bike-stats').innerHTML = Object.entries(labels).map(([k, label]) =>
    `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.round(bars[k] * 100)}%"></i></div></div>`).join('');
  document.querySelectorAll('#garage-tabs .tab').forEach((t) => t.classList.toggle('sel', t.dataset.tab === state.tab));
  renderTab(def);
  showroom.setBike(def);
}

function swatches(key, withReset) {
  const cur = state.cfg[key];
  return `<div class="swatches">${withReset ? `<button class="dot reset ${cur == null ? 'sel' : ''}" data-color="${key}" data-value="" aria-label="Markenfarbe"></button>` : ''}${PALETTE.map((c) =>
    `<button class="dot ${cur === c ? 'sel' : ''}" data-color="${key}" data-value="${c}" style="background:${hexCss(c)}" aria-label="Farbe"></button>`).join('')}</div>`;
}

function renderTab(def) {
  const el = $('tab-content');
  const cfg = state.cfg;
  if (state.tab === 'brand') {
    el.innerHTML = `<div class="opt-grid">${Object.values(BRANDS).map((b) =>
      `<button class="opt ${cfg.brand === b.id ? 'sel' : ''}" data-brand="${b.id}"><div class="t" style="border-left:8px solid ${hexCss(b.frame)};padding-left:8px">${b.name}</div><div class="s">${b.tagline}</div></button>`).join('')}</div>`;
  } else if (state.tab === 'type') {
    el.innerHTML = `<div class="opt-grid">${Object.values(CATEGORIES).map((c) =>
      `<button class="opt ${cfg.cat === c.id ? 'sel' : ''}" data-cat="${c.id}"><div class="t">${c.emoji} ${c.name}</div><div class="s">${c.long}</div></button>`).join('')}</div>`;
  } else if (state.tab === 'parts') {
    el.innerHTML = Object.entries(PARTS).map(([g, grp]) =>
      `<div class="group"><div class="lbl">${grp.label}</div><div class="chips">${Object.entries(grp.options).map(([id, o]) =>
        `<button class="chip-btn ${def.parts[g] === id ? 'sel' : ''}" data-part="${g}" data-id="${id}">${o.name}<small>${o.desc}</small></button>`).join('')}</div></div>`).join('');
  } else {
    el.innerHTML =
      `<div class="group"><div class="lbl">Rahmen</div>${swatches('frame', true)}</div>` +
      `<div class="group"><div class="lbl">Akzent &amp; Schriftzug</div>${swatches('accent', true)}</div>` +
      `<div class="group"><div class="lbl">Trikot</div>${swatches('jersey', false)}</div>` +
      `<div class="group"><div class="lbl">Helm</div>${swatches('helmet', false)}</div>`;
  }
}

$('garage-tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  state.tab = t.dataset.tab;
  renderGarage();
});
$('tab-content').addEventListener('click', (e) => {
  const cfg = state.cfg;
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.brand) { cfg.brand = b.dataset.brand; cfg.frame = null; cfg.accent = null; }
  else if (b.dataset.cat) {
    cfg.cat = b.dataset.cat;
    Object.keys(PARTS).forEach((g) => { cfg[g] = null; }); // Teile zurück auf Standard des Typs
  } else if (b.dataset.part) cfg[b.dataset.part] = b.dataset.id;
  else if (b.dataset.color) cfg[b.dataset.color] = b.dataset.value === '' ? null : Number(b.dataset.value);
  else return;
  saveCfg();
  renderGarage();
});

// ---- Strecken ----
const bestOf = (mapId) => store.get('best.' + mapId, null);

function renderMapScreen() {
  $('map-cards').innerHTML = MAPS.map((m, i) => {
    const best = bestOf(m.id);
    return `<button class="card ${i === state.map ? 'sel' : ''}" data-i="${i}">
      <div class="preview" style="background:linear-gradient(${hexCss(m.colors.sky)} 0 45%, ${hexCss(m.colors.grass)} 45% 100%)">${m.emoji}</div>
      <div class="body">
        <div class="name">${m.name}</div>
        <div class="desc">${m.desc}</div>
        <div class="meta"><span class="diff">${'★'.repeat(m.difficulty)}${'☆'.repeat(3 - m.difficulty)}</span><span>${(m.length / 1000).toFixed(1)} km</span></div>
        <div class="meta"><span>${best ? '🏆 ' + formatTime(best.time) : 'noch keine Zeit'}</span><span>${best ? '⭐'.repeat(best.stars) : ''}</span></div>
      </div></button>`;
  }).join('');
}
$('map-cards').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  state.map = Number(card.dataset.i);
  store.set('map', state.map);
  renderMapScreen();
});

// ---- Einstellungen ----
function renderSettings() {
  const opts = [['auto', 'Auto'], ['high', 'Hoch'], ['mid', 'Mittel'], ['low', 'Niedrig']];
  $('set-quality').innerHTML = opts.map(([id, n]) => `<button class="chip-btn ${state.quality === id ? 'sel' : ''}" data-q="${id}">${n}</button>`).join('');
  $('chk-autogas').checked = input.autoGas;
  $('chk-sound').checked = !sfx.muted;
  $('chk-tilt').checked = store.get('tilt', false);
}
$('set-quality').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  state.quality = b.dataset.q;
  store.set('quality', state.quality);
  applyQuality();
  renderSettings();
});
$('chk-autogas').onchange = (e) => { input.autoGas = e.target.checked; store.set('autogas', input.autoGas); document.body.classList.toggle('autogas', input.autoGas); };
$('chk-sound').onchange = (e) => setMuted(!e.target.checked);
$('chk-tilt').onchange = (e) => { store.set('tilt', e.target.checked); setTilt(e.target.checked); };
function setMuted(m) {
  sfx.setMuted(m);
  store.set('muted', m);
  $('btn-mute').textContent = m ? '🔇' : '🔊';
}
sfx.setMuted(store.get('muted', false));
$('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';
if (store.get('tilt', false)) setTilt(true);

// ---- Rennen ----
const hud = {
  time: $('hud-time'), speed: $('hud-speed'), bar: $('hud-bike'), countdown: $('countdown'),
  place: $('hud-place'), placeText: $('hud-place-text'), minimap: $('minimap'),
};

function startRace() {
  sfx.unlock();
  if (race) race.dispose();
  resetInput();
  paused = false;
  $('countdown').classList.remove('show');
  applyQuality();
  const level = LEVELS.find((l) => l.id === state.level) || LEVELS[1];
  race = new Race({
    renderer, bikeDef: currentDef(), map: MAPS[state.map], input, hud, quality: effectiveQuality(),
    mode: state.mode, level, onFinish: finishRace, bot: qs.has('bot'),
  });
  setTilt(store.get('tilt', false)); // Neigung neu eichen
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
    const prev = bestOf(map.id);
    const isBest = !prev || res.time < prev.time;
    if (isBest) store.set('best.' + map.id, { time: res.time, stars: Math.max(stars, prev ? prev.stars : 0) });
    else if (stars > prev.stars) store.set('best.' + map.id, { time: prev.time, stars });
    best = isBest ? (prev ? '🎉 Neue Bestzeit!' : '🎉 Erste Zeit gespeichert!') : `Bestzeit: ${formatTime(prev.time)}`;
  }
  $('result-title').textContent = title;
  $('result-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">⭐</span>`).join('');
  $('result-time').textContent = formatTime(res.time);
  $('result-best').textContent = best;
  $('result-ranking').innerHTML = vs ? res.ranking.map((r, i) =>
    `<li class="${r.isPlayer ? 'me' : ''}"><span class="pos">${i + 1}.</span><span class="sw" style="background:${hexCss(r.def.colors.frame)}"></span><span class="who">${r.isPlayer ? 'Du' : r.name} <small>${r.def.name}</small></span><span>${r.time != null ? formatTime(r.time) : '–'}</span></li>`).join('') : '';
  sfx.windOff();
  inRace(false);
  show('screen-result');
}

function leaveRace(to) {
  if (race) { race.dispose(); race = null; }
  paused = false;
  inRace(false);
  resetInput();
  sfx.windOff();
  if (to === 'garage') { renderGarage(); show('screen-garage'); } else { renderMapScreen(); show('screen-map'); }
}

function setPaused(v) {
  if (!race || race.phase === 'finished') return;
  paused = v;
  resetInput();
  if (v) sfx.windOff();
  show(v ? 'screen-pause' : undefined);
}

// ---- Buttons ----
$('btn-to-garage').onclick = () => { sfx.unlock(); renderGarage(); show('screen-garage'); };
$('btn-back-mode').onclick = () => { renderMode(); show('screen-mode'); };
$('btn-to-maps').onclick = () => { renderMapScreen(); show('screen-map'); };
$('btn-back-garage').onclick = () => { renderGarage(); show('screen-garage'); };
$('btn-settings').onclick = () => { sfx.unlock(); renderSettings(); show('screen-settings'); };
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

initInput({
  onPause: () => { if (race) setPaused(!paused); },
  onRestart: () => { if (race && !paused) startRace(); },
});
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

// ---- Größe & Loop ----
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  showroom.resize();
  if (race) race.resize();
});

// Schnellstart zum Testen: ?start&mode=vs&cat=road&brand=velocita&map=1&level=hard&autogas&warp=20&screen=garage|map&tab=parts
if (qs.has('mode')) state.mode = qs.get('mode');
if (qs.has('level')) state.level = qs.get('level');
if (qs.has('cat')) { state.cfg.cat = qs.get('cat'); Object.keys(PARTS).forEach((g) => { state.cfg[g] = null; }); }
if (qs.has('brand')) { state.cfg.brand = qs.get('brand'); state.cfg.frame = null; state.cfg.accent = null; }
if (qs.has('map')) state.map = Math.min(Number(qs.get('map')), MAPS.length - 1);
if (qs.has('tab')) state.tab = qs.get('tab');
if (qs.has('autogas')) input.autoGas = true;

renderMode();
show('screen-mode');
if (qs.get('screen') === 'garage') { renderGarage(); show('screen-garage'); }
if (qs.get('screen') === 'map') { renderMapScreen(); show('screen-map'); }
if (qs.get('screen') === 'settings') { renderSettings(); show('screen-settings'); }
if (qs.has('start')) startRace();
if (race && qs.has('warp')) for (let i = 0; i < Number(qs.get('warp')) * 60; i++) race.update(1 / 60); // Debug: Zeit vorspulen

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (race) {
    if (!paused) race.update(dt);
    renderer.render(race.scene, race.camera);
  } else {
    showroom.update(dt);
    renderer.render(showroom.scene, showroom.camera);
  }
});

window.game = { state, get race() { return race; } };
