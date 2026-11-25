const CACHE = 'glasswave-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// Supported upstream API origins (network-only for live audio/search/metadata)
const API_ORIGINS = [
  'https://qobuz-dll.foreyou.workers.dev',
  'https://lastbabe.velixir.run',
  'https://tracks.monochrome.st',
  'https://dzr.tabs-vs-spaces.wtf',
  'https://eljohnzc-addon.de.deplexo.com',
  'https://instable.arcod.xyz',
  'https://lrclib.net'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(url => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App shell: Network first with offline cache fallback; external APIs bypass SW cache
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin || API_ORIGINS.includes(url.origin)) {
    return;
  }

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});
