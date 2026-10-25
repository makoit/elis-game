import * as THREE from 'three';
import { BIKES, BIKE_COLORS } from './bikes.js';
import { MAPS } from './maps.js';
import { Showroom } from './showroom.js';
import { Race, formatTime } from './race.js';
import { input, initInput, resetInput, isTouchDevice } from './input.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);

// ---- Speicher (Bestzeiten, Auswahl) ----
const store = {
  get(k, d) { try { const v = localStorage.getItem('elis.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('elis.' + k, JSON.stringify(v)); } catch { /* egal */ } },
};

// ---- Renderer ----
const renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouchDevice ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const showroom = new Showroom();
let race = null;
let paused = false;

const state = {
  bike: Math.min(store.get('bike', 0), BIKES.length - 1),
  color: store.get('color', null), // null = Originalfarbe
  map: Math.min(store.get('map', 0), MAPS.length - 1),
};
input.autoGas = store.get('autogas', false);

// ---- Screens ----
const screens = ['screen-bike', 'screen-map', 'screen-pause', 'screen-result'];
function show(...ids) {
  screens.forEach((id) => $(id).classList.toggle('active', ids.includes(id)));
}
const inRace = (v) => {
  $('hud').classList.toggle('hidden', !v);
  $('touch').classList.toggle('hidden', !(v && isTouchDevice));
};

// ---- Fahrrad-Auswahl ----
function bikeColor() { return state.color ?? BIKES[state.bike].color; }

function renderBikeScreen() {
  const def = BIKES[state.bike];
  const labels = { speed: 'Tempo', accel: 'Antritt', steer: 'Lenkung', offroad: 'Gelände' };
  $('bike-stats').innerHTML =
    `<h2>${def.name}</h2><div class="type">${def.type}</div>` +
    Object.entries(labels).map(([k, label]) =>
      `<div class="stat"><span>${label}</span><span class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= def.ratings[k] ? 'on' : ''}"></i>`).join('')}</span></div>`,
    ).join('');

  $('bike-cards').innerHTML = BIKES.map((b, i) =>
    `<button class="card ${i === state.bike ? 'sel' : ''}" data-i="${i}"><div class="emoji">${b.emoji}</div><div class="name">${b.name}</div><div class="sub">${b.type}</div></button>`,
  ).join('');

  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  $('color-row').innerHTML = '<span style="font-weight:700;margin-right:4px">Farbe:</span>' +
    [def.color, ...BIKE_COLORS.filter((c) => c !== def.color)].map((c, i) =>
      `<button class="dot ${(state.color ?? def.color) === c ? 'sel' : ''}" data-c="${i === 0 ? '' : c}" style="background:${hex(c)}" aria-label="Farbe"></button>`,
    ).join('');
  showroom.setBike(def, bikeColor());
}

$('bike-cards').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  state.bike = Number(card.dataset.i);
  state.color = null;
  store.set('bike', state.bike);
  store.set('color', null);
  renderBikeScreen();
});
$('color-row').addEventListener('click', (e) => {
  const dot = e.target.closest('.dot');
  if (!dot) return;
  state.color = dot.dataset.c === '' ? null : Number(dot.dataset.c);
  store.set('color', state.color);
  renderBikeScreen();
});

// ---- Strecken-Auswahl ----
function bestOf(mapId) { return store.get('best.' + mapId, null); }

function renderMapScreen() {
  $('map-cards').innerHTML = MAPS.map((m, i) => {
    const best = bestOf(m.id);
    const c = (n) => '#' + n.toString(16).padStart(6, '0');
    return `<button class="card ${i === state.map ? 'sel' : ''}" data-i="${i}">
      <div class="preview" style="background:linear-gradient(${c(m.colors.sky)} 0 45%, ${c(m.colors.grass)} 45% 100%)">${m.emoji}</div>
      <div class="body">
        <div class="name">${m.name}</div>
        <div class="desc">${m.desc}</div>
        <div class="meta"><span class="diff">${'★'.repeat(m.difficulty)}${'☆'.repeat(3 - m.difficulty)}</span><span>${m.length} m</span></div>
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

$('chk-autogas').checked = input.autoGas;
$('chk-autogas').addEventListener('change', (e) => { input.autoGas = e.target.checked; store.set('autogas', input.autoGas); });

// ---- Rennen ----
const hud = { time: $('hud-time'), speed: $('hud-speed'), bar: $('hud-bike'), countdown: $('countdown') };

function startRace() {
  sfx.unlock();
  if (race) race.dispose();
  resetInput();
  paused = false;
  $('countdown').classList.remove('show');
  race = new Race({
    bike: BIKES[state.bike], color: bikeColor(), map: MAPS[state.map], input, hud, onFinish: finishRace,
  });
  show();
  inRace(true);
}

function finishRace(time) {
  const map = MAPS[state.map];
  const stars = race.starsFor(time);
  const prev = bestOf(map.id);
  const isBest = !prev || time < prev.time;
  if (isBest) store.set('best.' + map.id, { time, stars: Math.max(stars, prev ? prev.stars : 0) });
  else if (stars > prev.stars) store.set('best.' + map.id, { time: prev.time, stars });
  $('result-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">⭐</span>`).join('');
  $('result-time').textContent = formatTime(time);
  $('result-best').textContent = isBest ? (prev ? '🎉 Neue Bestzeit!' : '🎉 Erste Zeit gespeichert!') : `Bestzeit: ${formatTime(prev.time)}`;
  inRace(false);
  show('screen-result');
}

function leaveRace(toScreen) {
  if (race) { race.dispose(); race = null; }
  paused = false;
  inRace(false);
  resetInput();
  if (toScreen === 'bike') { renderBikeScreen(); show('screen-bike'); } else { renderMapScreen(); show('screen-map'); }
}

function setPaused(v) {
  if (!race || race.phase === 'finished') return;
  paused = v;
  resetInput();
  show(v ? 'screen-pause' : undefined);
}

// ---- Buttons ----
$('btn-to-maps').onclick = () => { sfx.unlock(); renderMapScreen(); show('screen-map'); };
$('btn-back-bike').onclick = () => { renderBikeScreen(); show('screen-bike'); };
$('btn-start').onclick = startRace;
$('btn-pause').onclick = () => setPaused(true);
$('btn-resume').onclick = () => setPaused(false);
$('btn-restart').onclick = startRace;
$('btn-quit').onclick = () => leaveRace('map');
$('btn-again').onclick = startRace;
$('btn-other-map').onclick = () => leaveRace('map');
$('btn-other-bike').onclick = () => leaveRace('bike');
$('btn-mute').onclick = () => {
  sfx.setMuted(!sfx.muted);
  $('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';
  store.set('muted', sfx.muted);
};
sfx.setMuted(store.get('muted', false));
$('btn-mute').textContent = sfx.muted ? '🔇' : '🔊';

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

renderBikeScreen();
show('screen-bike');

// Schnellstart zum Testen: ?bike=2&map=1&start
const qs = new URLSearchParams(location.search);
if (qs.has('bike')) state.bike = Math.min(Number(qs.get('bike')), BIKES.length - 1);
if (qs.has('map')) state.map = Math.min(Number(qs.get('map')), MAPS.length - 1);
if (qs.get('screen') === 'map') { renderMapScreen(); show('screen-map'); }
if (qs.has('autogas')) input.autoGas = true;
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

// Zum Debuggen in der Konsole
window.game = { state, get race() { return race; } };
