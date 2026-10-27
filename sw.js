// Space Shooter 2.0 — сервис-воркер
// Стратегия: сеть в приоритете (всегда свежая версия), кэш — для офлайна и медленной сети.
// При каждом релизе меняйте VERSION (и ?v= в index.html).
const VERSION = 'ss-2.6.2';
const CORE = [
  './', './index.html', './manifest.json', './css/style.css?v=2.6.2',
  './js/config.js?v=2.6.2', './js/atlas.js?v=2.6.2', './js/core.js?v=2.6.2', './js/data.js?v=2.6.2',
  './js/store.js?v=2.6.2', './js/tg.js?v=2.6.2', './js/audio.js?v=2.6.2', './js/gfx.js?v=2.6.2',
  './js/fx.js?v=2.6.2', './js/game.js?v=2.6.2', './js/enemies.js?v=2.6.2', './js/events.js?v=2.6.2', './js/intro.js?v=2.6.2', './js/ui.js?v=2.6.2', './js/main.js?v=2.6.2',
  './assets/sprites.webp?v=2.6.2', './assets/sprites2.webp?v=2.6.2', './icon-192.png', './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // запросы к API бота не кэшируем
  if (url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
