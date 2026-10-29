// Service Worker für Hub und alle Spiele unter games/: macht alles offline-fähig (Netz zuerst, bei Fehler aus dem Cache).
// 'no-cache' umgeht den HTTP-Cache (GitLab Pages: max-age=600) und fragt immer per ETag beim Server nach,
// sonst liefert ein Reload bis zu 10 Minuten lang alte Dateien.
const CACHE = 'elis-v18';
const CORE = [
  './', './index.html', './manifest.webmanifest', './hub/hub.css', './hub/hub.js', './hub/games.js', './vendor/three.module.js',
  './games/bike-race/', './games/bike-race/index.html', './games/bike-race/css/style.css', './games/bike-race/js/main.js',
  './games/angeln/', './games/angeln/index.html', './games/angeln/css/style.css', './games/angeln/js/main.js', './games/angeln/js/geo.js',
  './games/tie-dye/', './games/tie-dye/index.html', './games/tie-dye/css/style.css', './games/tie-dye/js/main.js', './games/tie-dye/js/workshop.js',
  './games/tie-dye/js/pattern.js', './games/tie-dye/js/data.js', './games/tie-dye/js/sfx.js',
  './games/shared/resolution.js', './games/shared/compat.js',
];
// Große, selten geänderte Dateien (Modelle, Bilder, Gelände, three.js): sofort aus dem Cache, im Hintergrund auffrischen.
// Das spart auf dem Handy bei jedem Start viele Sekunden; eine neue Version ist spätestens beim nächsten Start da.
const ASSET = /\/(assets|vendor)\/|\.(glb|hdr|jpg|png|bin|svg)$/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (ASSET.test(new URL(req.url).pathname)) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    })));
    return;
  }
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))),
  );
});
