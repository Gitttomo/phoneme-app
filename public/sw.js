// v4 – force update to clear any cached assets
const CACHE_VERSION = "phoneme-v4";

self.addEventListener("install", (event) => {
  // Skip waiting immediately so the new SW takes over right away
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Delete all old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Always network-first — never serve stale JS/CSS
  event.respondWith(
    fetch(event.request).catch(() => new Response("", { status: 504 }))
  );
});
