/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'ascender-cache-v1';

// Replaced at build time by inject-manifest-plugin with an array of
// { url: string, revision: string } entries for every webpack asset.
const PRECACHE_MANIFEST = self.INJECT_MANIFEST_PLUGIN;

// Derive the index.html URL from the manifest so it works regardless of
// whether the app is served at the root or a subpath.
const INDEX_URL =
  (PRECACHE_MANIFEST.find(({ url }) => url.endsWith('/index.html')) || {}).url ||
  '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const urlsToCache = PRECACHE_MANIFEST.map(({ url }) => url);
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const expectedUrls = new Set(PRECACHE_MANIFEST.map(({ url }) => url));

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.keys().then((requests) =>
          Promise.all(
            requests
              .filter(
                (request) =>
                  !expectedUrls.has(new URL(request.url, self.location).pathname)
              )
              .map((request) => cache.delete(request))
          )
        )
      )
      // Also remove any caches from older naming schemes.
      .then(() =>
        caches.keys().then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter((name) => name !== CACHE_NAME)
              .map((name) => caches.delete(name))
          )
        )
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Handle navigation requests by returning cached index.html.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches
        .match(INDEX_URL)
        .then((response) => response || fetch(event.request))
        .catch(() => fetch(event.request))
    );
    return;
  }

  // Cache-first strategy for precached assets.
  event.respondWith(
    caches
      .match(event.request)
      .then((response) => response || fetch(event.request))
      .catch(() => fetch(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
