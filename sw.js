// Версия кэша: бампайте вместе с ?v= у скриптов в index.html при каждом деплое
const CACHE = 'space-shooter-v4';
const FILES = [
  './',
  './index.html',
  './game-code.js?v=4',
  './improvements-patch.js?v=4',
  './visual-music-patch.js?v=4',
  './ship-player.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Network-first: свежая версия приоритетнее кэша, кэш - только офлайн-подстраховка.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(r => r || caches.match('./index.html'))
      )
  );
});
