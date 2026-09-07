/* ModelVerse service worker: offline-first static shell, network-first API.
 *
 * Static assets (HTML/CSS/JS/vendor) are cached on install so the UI shell
 * loads offline; API calls always hit the network because inference, model
 * lists, and eval results must be fresh. This is intentionally not a full
 * offline app: chat requires a running backend.
 */

const CACHE = 'modelverse-v1';
const SHELL = ['index.html', 'manifest.json', 'icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // API + eval data: network first, no caching.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      // Navigations prefer cache to survive offline; assets race network.
      if (request.mode === 'navigate') return cached || network;
      return network.then((res) => res || cached);
    }),
  );
});
