// Service Worker für Hub und alle Spiele unter games/: macht alles offline-fähig (Netz zuerst, bei Fehler aus dem Cache).
// 'no-cache' umgeht den HTTP-Cache (GitLab Pages: max-age=600) und fragt immer per ETag beim Server nach,
// sonst liefert ein Reload bis zu 10 Minuten lang alte Dateien.
const CACHE = 'elis-v15';
const CORE = [
  './', './index.html', './manifest.webmanifest', './hub/hub.css', './hub/hub.js', './hub/games.js', './vendor/three.module.js',
  './games/bike-race/', './games/bike-race/index.html', './games/bike-race/css/style.css', './games/bike-race/js/main.js',
  './games/angeln/', './games/angeln/index.html', './games/angeln/css/style.css', './games/angeln/js/main.js', './games/angeln/js/geo.js',
];

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
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))),
  );
});
