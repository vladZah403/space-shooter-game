// Space Shooter 2.0 — сервис-воркер
// Стратегия: сеть в приоритете (всегда свежая версия), кэш — для офлайна и медленной сети.
// При каждом релизе меняйте VERSION (и ?v= в index.html).
const VERSION = 'ss-4.0.1';
const CORE = [
  './', './index.html', './manifest.json', './css/style.css?v=4.0.1',
  './js/config.js?v=4.0.1', './js/atlas.js?v=4.0.1', './js/core.js?v=4.0.1', './js/data.js?v=4.0.1',
  './js/store.js?v=4.0.1', './js/tg.js?v=4.0.1', './js/audio.js?v=4.0.1', './js/gfx.js?v=4.0.1',
  './js/fx.js?v=4.0.1', './js/game.js?v=4.0.1', './js/enemies.js?v=4.0.1', './js/events.js?v=4.0.1', './js/foes.js?v=4.0.1', './js/skills.js?v=4.0.1', './js/sectors.js?v=4.0.1', './js/map.js?v=4.0.1', './js/companion.js?v=4.0.1', './js/intro.js?v=4.0.1', './js/demo.js?v=4.0.1', './js/ui.js?v=4.0.1', './js/relics.js?v=4.0.1', './js/main.js?v=4.0.1',
  './assets/sprites.webp?v=4.0.1', './assets/sprites2.webp?v=4.0.1', './assets/ship_cutaway.webp?v=4.0.1', './icon-192.png', './icon-512.png',
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
