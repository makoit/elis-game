// Service Worker: macht das Spiel offline-fähig (Netz zuerst, bei Fehler aus dem Cache).
// 'no-cache' umgeht den HTTP-Cache (GitLab Pages: max-age=600) und fragt immer per ETag beim Server nach,
// sonst liefert ein Reload bis zu 10 Minuten lang alte Dateien.
const CACHE = 'bikerace-v9';
const CORE = ['./', './index.html', './css/style.css', './manifest.webmanifest', './js/main.js', './vendor/three.module.js'];

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
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
