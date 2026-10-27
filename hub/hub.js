// Hub: zeigt alle Spiele als Kacheln, filterbar nach Kategorie.
import { CATEGORIES, GAMES } from './games.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* privat/gesperrt */ } },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const usedCats = CATEGORIES.filter((c) => GAMES.some((g) => g.category === c.id));
let current = store.get('hub.cat');
if (current !== 'all' && !usedCats.some((c) => c.id === current)) current = 'all';
const lastPlayed = store.get('hub.last');

function tile(g) {
  const cat = catById[g.category];
  const art = g.cover
    ? `<img src="${esc(g.cover)}" alt="" loading="lazy">`
    : `<span class="art-emoji">${g.emoji}</span>`;
  const badge = g.id === lastPlayed ? '<span class="badge last">Zuletzt gespielt</span>'
    : g.isNew ? '<span class="badge">Neu</span>' : '';
  return `<a class="tile" href="${esc(g.path)}" data-id="${esc(g.id)}" style="--c1:${g.colors[0]};--c2:${g.colors[1]}">
    <div class="art">${art}${badge}</div>
    <div class="info">
      <div class="name">${esc(g.title)}</div>
      <div class="cat">${cat ? `${cat.emoji} ${esc(cat.name)}` : ''}</div>
      <p class="desc">${esc(g.desc)}</p>
      <span class="play">Spielen ▶</span>
    </div>
  </a>`;
}

// Platzhalter, damit klar ist, dass hier mehr Spiele hinkommen
const soon = '<div class="tile soon" aria-hidden="true"><div class="art"><span class="art-emoji">✨</span></div><div class="info"><div class="name">Bald mehr</div><p class="desc">Neue Spiele kommen hierher.</p></div></div>';

function renderChips() {
  const chips = [{ id: 'all', name: 'Alle', emoji: '⭐' }, ...usedCats];
  $('cats').innerHTML = chips.map((c) =>
    `<button class="chip${c.id === current ? ' sel' : ''}" data-cat="${c.id}" role="tab" aria-selected="${c.id === current}">${c.emoji} ${esc(c.name)}</button>`).join('');
}

function renderGames() {
  if (current === 'all') {
    // „Alle“: ein Regal pro Kategorie, wie im App Store
    $('shelves').innerHTML = usedCats.map((c, i) => `<section class="shelf">
      <h2>${c.emoji} ${esc(c.name)}</h2>
      <div class="grid">${GAMES.filter((g) => g.category === c.id).map(tile).join('')}${i === usedCats.length - 1 ? soon : ''}</div>
    </section>`).join('');
  } else {
    $('shelves').innerHTML = `<section class="shelf"><div class="grid">${GAMES.filter((g) => g.category === current).map(tile).join('')}${soon}</div></section>`;
  }
}

$('cats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  current = b.dataset.cat;
  store.set('hub.cat', current);
  renderChips();
  renderGames();
});
$('shelves').addEventListener('click', (e) => {
  const t = e.target.closest('.tile[data-id]');
  if (t) store.set('hub.last', t.dataset.id);
});

$('count').textContent = GAMES.length === 1 ? '1 Spiel' : `${GAMES.length} Spiele`;
renderChips();
renderGames();
